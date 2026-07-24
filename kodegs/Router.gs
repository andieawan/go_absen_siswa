// =========================================================
// --- HANDLE REQUEST (ENTRY POINT) ---
// =========================================================
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
    }
  } catch (error) {
    Logger.log('Error doPost: ' + error.toString());
    response.message = "Terjadi kesalahan pada server.";
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

// Wrapper untuk validasi GET request dengan token
function handleGetDenganValidasi(username, token, callback) {
  const cek = verifikasiToken(token, username);
  if (!cek.valid) return { success: false, message: cek.message, sessionExpired: true };

  const akun = getAkunGuru(username);
  if (!akun) return { success: false, message: "Akun tidak ditemukan." };

  return callback(akun);
}

function doGet(e) {
  let response = { success: false, message: "Terjadi kesalahan sistem." };
  try {
    if (e.parameter.action === 'getStudents' && e.parameter.kelas) {
      response = handleGetDenganValidasi(e.parameter.username, e.parameter.token, function(akun) {
        // Validasi: guru hanya bisa akses kelas yang menjadi tanggung jawabnya
        if (akun.kelasList.indexOf(e.parameter.kelas) === -1) {
          return { success: false, message: "Anda tidak berhak mengakses data kelas " + e.parameter.kelas + "." };
        }
        return getStudents(e.parameter.kelas);
      });
    } else if (e.parameter.action === 'getExistingAttendance') {
      response = handleGetDenganValidasi(e.parameter.username, e.parameter.token, function(akun) {
        const guru = e.parameter.guru || akun.nama;
        const mapel = e.parameter.mapel;
        const kelas = e.parameter.kelas;
        // Validasi hak akses
        if (akun.mapelList.indexOf(mapel) === -1 || akun.kelasList.indexOf(kelas) === -1) {
          return { success: false, message: "Anda tidak berhak mengakses data absensi ini." };
        }
        return getExistingAttendance(guru, mapel, kelas, e.parameter.tanggal);
      });
    } else if (e.parameter.action === 'getRiwayatAbsensi' && e.parameter.mapel && e.parameter.kelas) {
      response = handleGetDenganValidasi(e.parameter.username, e.parameter.token, function(akun) {
        if (akun.mapelList.indexOf(e.parameter.mapel) === -1 || akun.kelasList.indexOf(e.parameter.kelas) === -1) {
          return { success: false, message: "Anda tidak berhak mengakses riwayat absensi ini." };
        }
        return getRiwayatAbsensi(e.parameter.mapel, e.parameter.kelas);
      });
    } else if (e.parameter.action === 'getDashboardData' && e.parameter.mapel && e.parameter.kelas) {
      response = handleGetDenganValidasi(e.parameter.username, e.parameter.token, function(akun) {
        if (akun.mapelList.indexOf(e.parameter.mapel) === -1 || akun.kelasList.indexOf(e.parameter.kelas) === -1) {
          return { success: false, message: "Anda tidak berhak mengakses dashboard ini." };
        }
        return getDashboardData(e.parameter.mapel, e.parameter.kelas);
      });
    } else if (e.parameter.action === 'getRekapKelasSaya' && e.parameter.mapel && e.parameter.kelas) {
      response = handleGetDenganValidasi(e.parameter.username, e.parameter.token, function(akun) {
        if (akun.mapelList.indexOf(e.parameter.mapel) === -1 || akun.kelasList.indexOf(e.parameter.kelas) === -1) {
          return { success: false, message: "Anda tidak berhak mengunduh rekap ini." };
        }
        return getRekapKelasSaya(e.parameter.mapel, e.parameter.kelas);
      });
    } else if (e.parameter.action === 'getAbsenWaliExisting' && e.parameter.kelas && e.parameter.tanggal) {
      response = handleGetDenganValidasi(e.parameter.username, e.parameter.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== e.parameter.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + e.parameter.kelas + "." };
        }
        return getAbsenWaliExisting(e.parameter.kelas, e.parameter.tanggal);
      });
    } else if (e.parameter.action === 'getRiwayatAbsenWali' && e.parameter.kelas) {
      response = handleGetDenganValidasi(e.parameter.username, e.parameter.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== e.parameter.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + e.parameter.kelas + "." };
        }
        return getRiwayatAbsenWali(e.parameter.kelas);
      });
    } else if (e.parameter.action === 'getRekapAbsenWali' && e.parameter.kelas) {
      response = handleGetDenganValidasi(e.parameter.username, e.parameter.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== e.parameter.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + e.parameter.kelas + "." };
        }
        return getRekapAbsenWali(e.parameter.kelas);
      });
    }
    // =========================================================
    // ENDPOINT: Dashboard Analitik untuk Wali Kelas
    // ---------------------------------------------------------
    // Mengembalikan data statistik kehadiran harian untuk 1 kelas
    // wali: tren per tanggal, top alpa, rata-rata distribusi
    // status (H/I/S/A), dan total pertemuan.
    // =========================================================
    else if (e.parameter.action === 'getDashboardDataWali' && e.parameter.kelas) {
      response = handleGetDenganValidasi(e.parameter.username, e.parameter.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== e.parameter.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + e.parameter.kelas + "." };
        }
        return getDashboardDataWali(e.parameter.kelas);
      });
    }
  } catch (error) {
    Logger.log('Error doGet: ' + error.toString());
    response.message = "Terjadi kesalahan pada server.";
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}
