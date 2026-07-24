// =========================================================
// --- HANDLE REQUEST (ENTRY POINT) ---
// =========================================================
//
// PATCH NOTES:
// 1. Ditambahkan doOptions() -- meski Apps Script Web App biasanya tidak
//    butuh ini untuk request text/plain (lihat patch di js/api.js), fungsi
//    ini tetap disediakan sebagai jaring pengaman kalau nanti ada request
//    yang memicu preflight (misal ada yang lupa balikin Content-Type ke
//    application/json).
// 2. Semua action yang butuh token (getStudents, getExistingAttendance,
//    getRiwayatAbsensi, getDashboardData, getDashboardDataWali,
//    getAbsenWaliExisting, getRiwayatAbsenWali, getRekapKelasSaya,
//    getRekapAbsenWali) DIPINDAH dari doGet() ke doPost(), supaya token
//    tidak lagi terkirim lewat query string (yang bisa kebaca di history
//    browser & access log server).
// 3. doGet() sengaja DIBIARKAN KOSONG-FUNGSIONAL (hanya pesan info) untuk
//    backward-compat, supaya kalau ada request GET nyasar tidak error 500,
//    tapi tidak lagi memproses action apa pun yang butuh otentikasi.
// 4. FIX (BARU): Validasi otorisasi getRekapKelasSaya SEBELUMNYA memakai
//    akun.mapelList.indexOf(data.mapel) -- padahal data.mapel/data.kelas
//    di sini adalah STRING GABUNGAN KOMA (mis. "Matematika,IPA"), bukan
//    satu nama mapel tunggal. getRekapKelasSaya() sendiri (Rekap.gs) sudah
//    benar men-split string ini dengan koma. Karena indexOf() mencari
//    kecocokan PERSIS satu elemen array dengan keseluruhan string gabungan
//    itu, guru yang mengajar LEBIH DARI 1 mapel atau kelas akan SELALU
//    ditolak ("Anda tidak berhak mengunduh rekap ini") walau itu data
//    miliknya sendiri -- hanya guru dengan tepat 1 mapel & 1 kelas yang
//    kebetulan lolos.
//    Perbaikan: split dulu string gabungan itu (pakai splitList() yang
//    sudah ada di Utils.gs), lalu pastikan SETIAP mapel & kelas yang
//    diminta memang ada di daftar mapel/kelas guru tsb (akun.mapelList /
//    akun.kelasList), baru izinkan.
// 5. FIX (BARU): doPost() sebelumnya membiarkan `response` tetap generik
//    {success:false, message:"Terjadi kesalahan sistem."} kalau action
//    tidak cocok kondisi manapun (typo action, atau parameter wajib
//    seperti data.mapel/data.kelas kosong) -- membuat masalah semacam ini
//    sangat sulit dilacak dari sisi frontend/Network tab. Ditambahkan
//    fallback else di akhir rantai if/else yang menyebutkan nama action
//    yang diterima, supaya kesalahan ketik/parameter kurang lengkap
//    langsung terlihat jelas di response.
// =========================================================

function doOptions(e) {
  return ContentService.createTextOutput('');
}

function doPost(e) {
  let response = { success: false, message: "Terjadi kesalahan sistem." };
  try {
    let data = JSON.parse(e.postData.contents);

    if (data.action === 'login') {
      response = handleLogin(data.username, data.password);

    } else if (data.action === 'submit') {
      response = handleSubmitDenganValidasi(data.username, data.token, data.payload);

    } else if (data.action === 'submitAbsenWali') {
      response = simpanAbsenWaliDenganValidasi(data.username, data.token, data.kelas, data.tanggal, data.dataKehadiran);

    // ===== PATCH: action berikut dipindah dari doGet ke doPost =====
    } else if (data.action === 'getStudents' && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (akun.kelasList.indexOf(data.kelas) === -1) {
          return { success: false, message: "Anda tidak berhak mengakses data kelas " + data.kelas + "." };
        }
        return getStudents(data.kelas);
      });

    } else if (data.action === 'getExistingAttendance') {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        const guru = data.guru || akun.nama;
        const mapel = data.mapel;
        const kelas = data.kelas;
        if (akun.mapelList.indexOf(mapel) === -1 || akun.kelasList.indexOf(kelas) === -1) {
          return { success: false, message: "Anda tidak berhak mengakses data absensi ini." };
        }
        return getExistingAttendance(guru, mapel, kelas, data.tanggal);
      });

    } else if (data.action === 'getRiwayatAbsensi' && data.mapel && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (akun.mapelList.indexOf(data.mapel) === -1 || akun.kelasList.indexOf(data.kelas) === -1) {
          return { success: false, message: "Anda tidak berhak mengakses riwayat absensi ini." };
        }
        return getRiwayatAbsensi(data.mapel, data.kelas);
      });

    } else if (data.action === 'getDashboardData' && data.mapel && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (akun.mapelList.indexOf(data.mapel) === -1 || akun.kelasList.indexOf(data.kelas) === -1) {
          return { success: false, message: "Anda tidak berhak mengakses dashboard ini." };
        }
        return getDashboardData(data.mapel, data.kelas);
      });

    // ===== FIX: validasi per-item (bukan cek string gabungan utuh) =====
    } else if (data.action === 'getRekapKelasSaya' && data.mapel && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        const mapelDiminta = splitList(data.mapel);
        const kelasDiminta = splitList(data.kelas);

        if (mapelDiminta.length === 0 || kelasDiminta.length === 0) {
          return { success: false, message: "Mata pelajaran atau kelas tidak valid." };
        }

        const semuaMapelValid = mapelDiminta.every(m => akun.mapelList.indexOf(m) !== -1);
        const semuaKelasValid = kelasDiminta.every(k => akun.kelasList.indexOf(k) !== -1);

        if (!semuaMapelValid || !semuaKelasValid) {
          return { success: false, message: "Anda tidak berhak mengunduh rekap ini." };
        }
        return getRekapKelasSaya(data.mapel, data.kelas);
      });

    } else if (data.action === 'getAbsenWaliExisting' && data.kelas && data.tanggal) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== data.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + data.kelas + "." };
        }
        return getAbsenWaliExisting(data.kelas, data.tanggal);
      });

    } else if (data.action === 'getRiwayatAbsenWali' && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== data.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + data.kelas + "." };
        }
        return getRiwayatAbsenWali(data.kelas);
      });

    } else if (data.action === 'getRekapAbsenWali' && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== data.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + data.kelas + "." };
        }
        return getRekapAbsenWali(data.kelas);
      });

    } else if (data.action === 'getDashboardDataWali' && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== data.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + data.kelas + "." };
        }
        return getDashboardDataWali(data.kelas);
      });

    // ===== FIX: fallback eksplisit untuk action tak dikenal / parameter kurang =====
    } else {
      response.message = "Aksi tidak dikenali atau parameter tidak lengkap: " + (data.action || '(kosong)');
    }
    // ===== SELESAI PATCH =====

  } catch (error) {
    Logger.log('Error doPost: ' + error.toString());
    response.message = "Terjadi kesalahan pada server.";
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

// Wrapper untuk validasi request dengan token (dipakai baik dari doGet lama maupun doPost)
function handleGetDenganValidasi(username, token, callback) {
  const cek = verifikasiToken(token, username);
  if (!cek.valid) return { success: false, message: cek.message, sessionExpired: true };

  const akun = getAkunGuru(username);
  if (!akun) return { success: false, message: "Akun tidak ditemukan." };

  return callback(akun);
}

// =========================================================
// PATCH: doGet() tidak lagi memproses action yang butuh token.
// Dibiarkan aktif hanya untuk cek "web app hidup" (health check) dan
// backward-compat supaya tidak error 500 kalau ada request GET lama
// yang masih nyangkut di cache browser client lama.
// =========================================================
function doGet(e) {
  const response = {
    success: false,
    message: "Endpoint ini hanya menerima POST. Silakan update aplikasi frontend Anda ke versi terbaru."
  };
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}
