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
    response.message = error.toString();
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  let response = { success: false, message: "Terjadi kesalahan sistem." };
  try {
    if (e.parameter.action === 'getStudents' && e.parameter.kelas) {
      response = getStudents(e.parameter.kelas);
    } else if (e.parameter.action === 'getExistingAttendance') {
      response = getExistingAttendance(e.parameter.guru, e.parameter.mapel, e.parameter.kelas, e.parameter.tanggal);
    } else if (e.parameter.action === 'getRiwayatAbsensi' && e.parameter.mapel && e.parameter.kelas) {
      response = getRiwayatAbsensi(e.parameter.mapel, e.parameter.kelas);
    } else if (e.parameter.action === 'getDashboardData' && e.parameter.mapel && e.parameter.kelas) {
      response = getDashboardData(e.parameter.mapel, e.parameter.kelas);
    } else if (e.parameter.action === 'getRekapKelasSaya' && e.parameter.mapel && e.parameter.kelas) {
      response = getRekapKelasSaya(e.parameter.mapel, e.parameter.kelas);
    } else if (e.parameter.action === 'getAbsenWaliExisting' && e.parameter.kelas && e.parameter.tanggal) {
      response = getAbsenWaliExisting(e.parameter.kelas, e.parameter.tanggal);
    } else if (e.parameter.action === 'getRiwayatAbsenWali' && e.parameter.kelas) {
      response = getRiwayatAbsenWali(e.parameter.kelas);
    } else if (e.parameter.action === 'getRekapAbsenWali' && e.parameter.kelas) {
      response = getRekapAbsenWali(e.parameter.kelas);
    }
    // =========================================================
    // ENDPOINT: Dashboard Analitik untuk Wali Kelas
    // ---------------------------------------------------------
    // Mengembalikan data statistik kehadiran harian untuk 1 kelas
    // wali: tren per tanggal, top alpa, rata-rata distribusi
    // status (H/I/S/A), dan total pertemuan.
    // =========================================================
    else if (e.parameter.action === 'getDashboardDataWali' && e.parameter.kelas) {
      response = getDashboardDataWali(e.parameter.kelas);
    }
  } catch (error) {
    response.message = error.toString();
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}
