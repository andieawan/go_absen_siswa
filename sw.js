// =========================================================
// SERVICE WORKER -- Sistem Absensi Sekolah
// ---------------------------------------------------------
// Cuma didaftarkan kalau CONFIG.PWA_AKTIF = true (lihat js/config.js &
// setupPwaJikaAktif() di js/main.js). Strategi: NETWORK-FIRST, bukan
// cache-first -- konsisten dengan filosofi cache-busting `?v=` yang
// sudah dipakai di seluruh aplikasi ini (selalu utamakan versi TERBARU
// saat online, karena aplikasi ini masih aktif dikembangkan; cache cuma
// jadi cadangan untuk kondisi benar-benar offline, bukan strategi utama
// untuk kecepatan).
//
// PENTING: request ke backend Google Apps Script (data absen, login,
// dst) SENGAJA TIDAK PERNAH disentuh Service Worker ini -- data absen
// harus selalu yang terbaru, tidak boleh disajikan dari cache basi.
// Begitu juga request ke domain lain (Google Fonts, cdnjs, dst).
// =========================================================

const CACHE_NAME = 'absensi-shell-v1';

self.addEventListener('install', (event) => {
  // Langsung aktif tanpa menunggu tab lama ditutup semua -- wajar untuk
  // aplikasi yang masih sering di-update.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Bersihkan cache versi lama kalau CACHE_NAME di atas pernah diganti
  // (mis. saat ada perubahan besar pada strategi caching-nya sendiri).
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Cuma tangani GET ke origin aplikasi ini sendiri -- biarkan semua
  // request lain (POST ke backend Apps Script, GET ke domain lain
  // seperti Google Fonts/cdnjs) berjalan seperti biasa tanpa campur
  // tangan Service Worker sama sekali.
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseUntukCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseUntukCache));
        }
        return response;
      })
      .catch(() => {
        // Offline / gagal jaringan -- coba sajikan dari cache kalau ada
        // (dari kunjungan sebelumnya saat online), supaya app shell tetap
        // bisa dibuka walau internet terputus sesaat.
        return caches.match(request);
      })
  );
});
