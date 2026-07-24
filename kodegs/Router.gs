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

    } else if (data.action === 'getRekapKelasSaya' && data.mapel && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (akun.mapelList.indexOf(data.mapel) === -1 || akun.kelasList.indexOf(data.kelas) === -1) {
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
