const CACHE_NAME = "absen-pwa-v1";
const ASSETS = [
  "index.html",
  "style.css",
  "script.js",
  "manifest.json"
];

// Pasang Service Worker dan Simpan Aset Statis ke Cache
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Bersihkan Cache Lama jika ada Pembaruan
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// Strategi Cache: Network First, Fallback to Cache
// Sangat cocok untuk aplikasi absensi yang datanya harus selalu up-to-date
self.addEventListener("fetch", (e) => {
  // Lewatkan request API/POST agar tidak di-cache secara statis
  if (e.request.url.includes("script.google.com")) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Salin respon ke cache jika berhasil mendapatkan data terbaru dari jaringan
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, resClone);
        });
        return res;
      })
      .catch(() => caches.match(e.request)) // Jika offline, gunakan cache yang ada
  );
});
