// =========================================================
// KONFIGURASI
// =========================================================
// Semua konstanta global & akses spreadsheet ada di sini.
// Catatan: di Apps Script, semua file .gs berbagi satu global
// scope yang sama — jadi variabel/fungsi di file ini otomatis
// bisa dipakai langsung dari file .gs lain tanpa import apa pun.
// =========================================================

const SPREADSHEET_MASTER_ID = '1YYWe9qgwP5v4FvO9xR2vWOtu9NA89EHwa7xaTOqeVuI';
const SPREADSHEET_ABSEN_ID = '1_ZIp2nAEp__atYI_b6D37nmpAdAOE510l6vLTtFdXHI';
const DRIVE_FOLDER_REKAP_ID = '1rZSN7CD93XIUAozSc0zmJuqq5on3u1RN';
const DRIVE_FOLDER_BACKUP_ID = '1wxDqJ3YcMR0ubK6Ni-uIByFmtdmnU6sa';

const MAPEL_ABSEN_WALI = "Absen Harian";
const BACKUP_RETENTION_DAYS = 90;
const ZONA_WAKTU_DIHARAPKAN = 'Asia/Jakarta';
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

// ===== CACHE INSTANCE SPREADSHEET =====
let _ssMaster = null;
let _ssAbsen = null;

function getMasterSs() {
  if (!_ssMaster) _ssMaster = SpreadsheetApp.openById(SPREADSHEET_MASTER_ID);
  return _ssMaster;
}

function getAbsenSs() {
  if (!_ssAbsen) _ssAbsen = SpreadsheetApp.openById(SPREADSHEET_ABSEN_ID);
  return _ssAbsen;
}
