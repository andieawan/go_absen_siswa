// =========================================================
// PEMANASAN BACKEND OTOMATIS (cegah cold-start Google Apps Script)
// ---------------------------------------------------------
// LATAR BELAKANG: Google Apps Script bukan server yang selalu "menyala"
// -- kalau backend sempat idle beberapa saat (tidak ada permintaan sama
// sekali), permintaan BERIKUTNYA butuh waktu ekstra untuk "bangun"
// (cold-start), gejalanya berupa timeout sesekali yang sudah kita
// bahas & tangani sebagian lewat retry otomatis di frontend
// (js/api.js). File ini menangani dari SISI LAIN -- MENCEGAH backend
// sempat "tidur" sama sekali selama jam sekolah, lewat trigger
// berbasis waktu yang memanggil backend sendiri secara berkala.
//
// KENAPA PERIODIK (bukan cuma 1x jam 6 pagi): Apps Script tidak
// otomatis tetap "hangat" sepanjang hari cuma karena dipanaskan 1x di
// awal -- kalau ada jeda panjang tanpa aktivitas di tengah hari
// (mis. jam istirahat), backend bisa "dingin" lagi. Dipanggil tiap 10
// menit SEPANJANG jam sekolah jauh lebih efektif untuk tujuan "selalu
// siap dipakai" dibanding sekali saja di pagi hari.
// =========================================================

// Jam mulai & selesai "jam sekolah" yang perlu dijaga tetap hangat --
// GANTI angka ini kalau jam operasional sekolahmu beda (format 24 jam).
const JAM_MULAI_PEMANASAN = 6;   // 06:00
const JAM_SELESAI_PEMANASAN = 16; // 16:00 (setelah ini dianggap sudah tidak jam sekolah)

/**
 * Fungsi "pemanasan" backend -- dipanggil OTOMATIS oleh trigger
 * berbasis waktu (lihat setupTriggerPemanasan() di bawah, dijalankan
 * SEKALI dari editor Apps Script untuk memasang triggernya, BUKAN
 * fungsi ini yang dijalankan manual berulang-ulang).
 *
 * SENGAJA CUMA benar-benar "memanaskan" selama jam sekolah -- di luar
 * jam itu (malam, dini hari, sore setelah pulang sekolah), keluar
 * cepat tanpa melakukan apa pun, supaya tidak buang-buang kuota
 * eksekusi harian untuk memanaskan server yang memang tidak akan
 * dipakai siapa pun di jam segitu.
 */
function pemanasanBackend() {
  const jamSekarang = new Date().getHours();
  if (jamSekarang < JAM_MULAI_PEMANASAN || jamSekarang >= JAM_SELESAI_PEMANASAN) {
    return; // di luar jam sekolah -- tidak perlu dipanaskan
  }

  try {
    // Sentuhan RINGAN -- cukup buka Master Guru (spreadsheet yang
    // paling sering diakses, dipakai HAMPIR SEMUA action lewat
    // handleGetDenganValidasi()), TIDAK perlu baca isinya sama sekali.
    // Tujuannya cuma supaya Google menganggap script ini "aktif",
    // mengurangi kemungkinan cold-start saat pengguna sungguhan
    // mengaksesnya beberapa saat kemudian.
    getMasterGuruSs();
  } catch (e) {
    // Diamkan kalau gagal -- ini cuma pemanasan, bukan operasi
    // penting. Kalaupun gagal, TIDAK ADA dampak ke pengguna
    // sungguhan (mereka tetap bisa pakai aplikasi seperti biasa,
    // cuma kehilangan manfaat pemanasannya kali ini saja).
    Logger.log('Pemanasan backend gagal (diabaikan, tidak berdampak ke pengguna): ' + e.message);
  }
}

/**
 * JALANKAN FUNGSI INI SEKALI SAJA dari editor Apps Script (pilih
 * "setupTriggerPemanasan" di dropdown fungsi, klik tombol ▷ Run) untuk
 * memasang trigger otomatis. TIDAK PERLU dijalankan berulang -- Google
 * akan otomatis memanggil pemanasanBackend() setiap 10 menit
 * SELAMANYA setelah ini, sampai kamu hapus triggernya manual lewat
 * hapusTriggerPemanasan().
 */
function setupTriggerPemanasan() {
  // Hapus dulu trigger pemanasan LAMA (kalau ada) -- cegah triggernya
  // menumpuk dobel kalau fungsi ini keliru dijalankan lebih dari 1x.
  hapusTriggerPemanasan();

  ScriptApp.newTrigger('pemanasanBackend')
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log(
    'Trigger pemanasan berhasil dipasang -- akan berjalan tiap ~10 menit ' +
    '(otomatis tidak melakukan apa pun di luar jam ' +
    JAM_MULAI_PEMANASAN + ':00-' + JAM_SELESAI_PEMANASAN + ':00). ' +
    'Waktu trigger dari Google TIDAK presisi ke detik -- wajar kalau meleset beberapa menit dari jadwal.'
  );
}

/**
 * Hapus trigger pemanasan yang sudah dipasang -- jalankan manual dari
 * editor kalau suatu saat ingin mematikan fitur ini sepenuhnya (mis.
 * kalau ternyata tidak lagi dibutuhkan, atau mau ganti jadwalnya).
 */
function hapusTriggerPemanasan() {
  const triggers = ScriptApp.getProjectTriggers();
  let jumlahDihapus = 0;
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'pemanasanBackend') {
      ScriptApp.deleteTrigger(trigger);
      jumlahDihapus++;
    }
  });
  if (jumlahDihapus > 0) {
    Logger.log('Trigger pemanasan lama (' + jumlahDihapus + ' buah) berhasil dihapus.');
  }
}
