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
