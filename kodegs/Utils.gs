// =========================================================
// FUNGSI BANTU UMUM (dipakai lintas fitur)
// =========================================================

// ===== KONVERSI TANGGAL CEPAT (GMT+7) =====
function isDateMatch(rawDate, targetDateStr) {
  if (!rawDate) return false;
  const d = new Date(rawDate);
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const dGMT7 = new Date(utc + (3600000 * 7));
  const formatted = dGMT7.getFullYear() + '-' +
                    String(dGMT7.getMonth() + 1).padStart(2, '0') + '-' +
                    String(dGMT7.getDate()).padStart(2, '0');
  return formatted === targetDateStr;
}

function splitList(str) {
  return (str || "").toString().split(',').map(s => s.trim()).filter(s => s !== "");
}

function getNisKeNamaMap(kelas) {
  const ss = getMasterSs();
  const sheet = ss.getSheetByName(kelas);
  const map = {};
  if (!sheet) return map;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] !== "" && data[i][2] !== "") {
      map[String(data[i][1])] = data[i][2].toString().trim();
    }
  }
  return map;
}

function getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(["Timestamp", "Nama Guru", "Mata Pelajaran", "Kelas", "Tanggal", "Hadir", "Izin", "Sakit", "Alpa"]);
  }
  return sheet;
}

// ===== VALIDASI & SANITASI INPUT =====

/**
 * Validasi dan sanitasi input
 * @param {string|number} str - Input yang akan divalidasi
 * @param {string} type - Tipe validasi ('nip', 'nisn', 'nama', 'status_absen', 'tanggal')
 * @return {boolean|string} - true jika valid, atau pesan error jika tidak
 */
function validateInput(str, type) {
  if (str === null || str === undefined) {
    return 'Input tidak boleh kosong';
  }
  
  const strVal = str.toString().trim();
  
  if (strVal.length === 0) {
    return 'Input tidak boleh hanya spasi';
  }

  switch (type) {
    case 'nip':
    case 'nisn':
      if (!/^\d+$/.test(strVal)) {
        return `${type.toUpperCase()} harus berupa angka`;
      }
      if (strVal.length < 5) {
        return `${type.toUpperCase()} terlalu pendek`;
      }
      break;
      
    case 'nama':
      if (strVal.length < 3) {
        return 'Nama terlalu pendek (min 3 karakter)';
      }
      if (/[^a-zA-Z\s.'-]/.test(strVal)) {
        return 'Nama mengandung karakter tidak valid';
      }
      break;
      
    case 'status_absen':
      const validStatus = ['Hadir', 'Izin', 'Sakit', 'Alpha'];
      if (!validStatus.includes(strVal)) {
        return 'Status absensi tidak valid';
      }
      break;
      
    case 'tanggal':
      const d = new Date(strVal);
      if (isNaN(d.getTime())) {
        return 'Format tanggal tidak valid';
      }
      break;
      
    default:
      if (strVal.length > 500) {
        return 'Input terlalu panjang';
      }
  }
  
  return true;
}

/**
 * Sanitasi string sederhana
 * @param {string|number} str 
 * @return {string}
 */
function sanitizeString(str) {
  if (!str) return '';
  return str.toString().trim().replace(/\s+/g, ' ');
}
