// =========================================================
// KONFIGURASI
// =========================================================
// Semua konstanta global & akses spreadsheet ada di sini.
// Catatan: di Apps Script, semua file .gs berbagi satu global
// scope yang sama — jadi variabel/fungsi di file ini otomatis
// bisa dipakai langsung dari file .gs lain tanpa import apa pun.
// =========================================================

// ===== KONFIGURASI FLEXIBEL DENGAN PROPERTIES SERVICE & CACHE =====
// Gunakan ScriptProperties untuk menyimpan ID Spreadsheet & Folder
// Cara set: jalankan fungsi setupConfig() sekali di editor Apps Script
// Atau buka Extensions > Apps Script > Project Settings > Script Properties
// Ditambahkan mekanisme Cache untuk performa lebih baik (mengurangi call ke PropertiesService)

const CACHE_DURATION = 300; // 5 menit dalam detik

function getConfigValue(key, defaultValue) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'config_' + key;
  
  // 1. Coba ambil dari cache dulu
  let cachedValue = cache.get(cacheKey);
  if (cachedValue != null) {
    try {
      return JSON.parse(cachedValue);
    } catch(e) {
      // Jika parse gagal, lanjut ke properties
    }
  }
  
  // 2. Ambil dari Properties jika tidak ada di cache
  const props = PropertiesService.getScriptProperties();
  const value = props.getProperty(key);
  const finalValue = (value !== null) ? value : defaultValue;
  
  // 3. Simpan ke cache untuk request berikutnya
  try {
    const valueToCache = (typeof finalValue === 'object' || Array.isArray(finalValue)) 
      ? JSON.stringify(finalValue) 
      : String(finalValue);
    cache.put(cacheKey, valueToCache, CACHE_DURATION);
  } catch(e) {
    Logger.log('Warning: Gagal cache config key ' + key + ': ' + e.toString());
  }
  
  return finalValue;
}

/**
 * Invalidate cache untuk kunci tertentu (dipanggil saat update config)
 */
function invalidateConfigCache(key) {
  const cache = CacheService.getScriptCache();
  cache.remove('config_' + key);
}

// ID Spreadsheet & Folder Drive di bawah ini BISA DIGANTI sesuai kebutuhan
// Anda -- tinggal timpa nilai string-nya dengan ID Spreadsheet/Folder Drive
// milik Anda sendiri (ambil dari URL Spreadsheet/Folder yang bersangkutan),
// atau override lewat Script Properties dengan key yang sama (lihat
// getConfigValue() di atas) tanpa perlu mengubah kode ini sama sekali.
//
// PATCH INTEGRASI ANTAR-APLIKASI: data master sekarang dipisah jadi 2
// spreadsheet berbeda, supaya bisa dipakai bersama oleh aplikasi lain
// (nilai, dsb) di luar aplikasi absensi ini:
//   - SPREADSHEET_MASTER_SISWA_ID: data siswa per kelas (1 sheet per
//     kelas, sama seperti sebelumnya). Aplikasi ini HANYA BACA dari sini
//     -- yang boleh menulis/mengubah data siswa adalah Aplikasi Manajemen
//     Siswa. Kalau ada siswa pindah/berhenti, jangan hapus barisnya,
//     cukup diberi status lewat kolom "Status" (lihat getStudents() di
//     kodegs/Absensi.gs) supaya data historis (absensi lama siswa itu)
//     tidak jadi rusak/yatim piatu.
//   - SPREADSHEET_MASTER_GURU_ID: identitas guru + akun login (sheet
//     Akun_Guru), dipakai bersama oleh semua aplikasi dalam ekosistem ini
//     supaya guru cukup 1 akun untuk semua aplikasi.
// ID-nya BEDA spreadsheet (bukan cuma beda sheet dalam 1 spreadsheet) --
// Anda perlu BUAT spreadsheet baru untuk Master Guru, pindahkan sheet
// Akun_Guru ke sana, lalu isi ID spreadsheet barunya di bawah ini.
const SPREADSHEET_MASTER_SISWA_ID = getConfigValue('SPREADSHEET_MASTER_SISWA_ID', '1YYWe9qgwP5v4FvO9xR2vWOtu9NA89EHwa7xaTOqeVuI');
const SPREADSHEET_MASTER_GURU_ID = getConfigValue('SPREADSHEET_MASTER_GURU_ID', '1jW4dNNN1MxLBkRIHsSOcg_zZwzueDS19BwyZprCHa_c');
const SPREADSHEET_ABSEN_ID = getConfigValue('SPREADSHEET_ABSEN_ID', '1_ZIp2nAEp__atYI_b6D37nmpAdAOE510l6vLTtFdXHI');
const DRIVE_FOLDER_REKAP_ID = getConfigValue('DRIVE_FOLDER_REKAP_ID', '1rZSN7CD93XIUAozSc0zmJuqq5on3u1RN');
const DRIVE_FOLDER_BACKUP_ID = getConfigValue('DRIVE_FOLDER_BACKUP_ID', '1wxDqJ3YcMR0ubK6Ni-uIByFmtdmnU6sa');

const MAPEL_ABSEN_WALI = "Absen Harian";
const BACKUP_RETENTION_DAYS = 90;
const ZONA_WAKTU_DIHARAPKAN = 'Asia/Jakarta';
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

// PATCH SSO: supaya token login bisa dipakai LINTAS APLIKASI (login sekali
// di 1 aplikasi, dianggap sah juga di aplikasi lain dalam ekosistem yang
// sama), SEMUA aplikasi (absensi, nilai, dst) HARUS diset dengan nilai
// Script Property 'SESSION_SECRET_KEY' yang SAMA PERSIS. getSessionSecret()
// di kodegs/Auth.gs akan MEMBUAT SENDIRI nilai acak kalau belum diisi --
// itu hanya aman untuk aplikasi yang berdiri sendiri. Begitu Anda mau SSO
// lintas aplikasi, WAJIB isi manual 'SESSION_SECRET_KEY' (nilai string
// acak yang sama) di Script Properties SETIAP project Apps Script yang
// ikut dalam ekosistem SSO ini -- kalau tidak, token dari 1 aplikasi tidak
// akan valid saat diverifikasi aplikasi lain (karena rahasia HMAC-nya beda).

// ===== FUNGSI SETUP INITIAL CONFIG (JALANKAN SEKALI SAJA) =====
function setupConfig() {
  const props = PropertiesService.getScriptProperties();
  
  // Set default values jika belum ada
  if (!props.getProperty('SPREADSHEET_MASTER_SISWA_ID')) {
    props.setProperty('SPREADSHEET_MASTER_SISWA_ID', '1YYWe9qgwP5v4FvO9xR2vWOtu9NA89EHwa7xaTOqeVuI');
  }
  if (!props.getProperty('SPREADSHEET_MASTER_GURU_ID')) {
    props.setProperty('SPREADSHEET_MASTER_GURU_ID', '1jW4dNNN1MxLBkRIHsSOcg_zZwzueDS19BwyZprCHa_c');
  }
  if (!props.getProperty('SPREADSHEET_ABSEN_ID')) {
    props.setProperty('SPREADSHEET_ABSEN_ID', '1_ZIp2nAEp__atYI_b6D37nmpAdAOE510l6vLTtFdXHI');
  }
  if (!props.getProperty('DRIVE_FOLDER_REKAP_ID')) {
    props.setProperty('DRIVE_FOLDER_REKAP_ID', '1rZSN7CD93XIUAozSc0zmJuqq5on3u1RN');
  }
  if (!props.getProperty('DRIVE_FOLDER_BACKUP_ID')) {
    props.setProperty('DRIVE_FOLDER_BACKUP_ID', '1wxDqJ3YcMR0ubK6Ni-uIByFmtdmnU6sa');
  }
  
  // Invalidate cache agar config terbaru langsung terbaca
  invalidateConfigCache('SPREADSHEET_MASTER_SISWA_ID');
  invalidateConfigCache('SPREADSHEET_MASTER_GURU_ID');
  invalidateConfigCache('SPREADSHEET_ABSEN_ID');
  invalidateConfigCache('DRIVE_FOLDER_REKAP_ID');
  invalidateConfigCache('DRIVE_FOLDER_BACKUP_ID');
  
  Logger.log('Konfigurasi berhasil disetup!');
  Logger.log('SPREADSHEET_MASTER_SISWA_ID: ' + props.getProperty('SPREADSHEET_MASTER_SISWA_ID'));
  Logger.log('SPREADSHEET_MASTER_GURU_ID: ' + props.getProperty('SPREADSHEET_MASTER_GURU_ID'));
  Logger.log('SPREADSHEET_ABSEN_ID: ' + props.getProperty('SPREADSHEET_ABSEN_ID'));
  Logger.log('DRIVE_FOLDER_REKAP_ID: ' + props.getProperty('DRIVE_FOLDER_REKAP_ID'));
  Logger.log('DRIVE_FOLDER_BACKUP_ID: ' + props.getProperty('DRIVE_FOLDER_BACKUP_ID'));
}

// ===== CACHE INSTANCE SPREADSHEET (SINGLETON) =====
const DB_CACHE = {
  _masterSiswa: null,
  _masterGuru: null,
  _absen: null,

  getMasterSiswa: function() {
    if (!this._masterSiswa) {
      this._masterSiswa = SpreadsheetApp.openById(SPREADSHEET_MASTER_SISWA_ID);
    }
    return this._masterSiswa;
  },

  getMasterGuru: function() {
    if (!this._masterGuru) {
      this._masterGuru = SpreadsheetApp.openById(SPREADSHEET_MASTER_GURU_ID);
    }
    return this._masterGuru;
  },

  getAbsen: function() {
    if (!this._absen) {
      this._absen = SpreadsheetApp.openById(SPREADSHEET_ABSEN_ID);
    }
    return this._absen;
  },

  getSheet: function(spreadsheetType, sheetName) {
    let ss;
    if (spreadsheetType === 'siswa') ss = this.getMasterSiswa();
    else if (spreadsheetType === 'guru') ss = this.getMasterGuru();
    else ss = this.getAbsen();
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" tidak ditemukan di spreadsheet ${spreadsheetType}.`);
    }
    return sheet;
  },

  reset: function() {
    this._masterSiswa = null;
    this._masterGuru = null;
    this._absen = null;
  }
};

// PATCH INTEGRASI ANTAR-APLIKASI: getMasterSs() lama dipisah jadi 2 --
// getMasterSiswaSs() (data siswa per kelas, read-only untuk app ini) dan
// getMasterGuruSs() (identitas guru + akun login, dipakai bersama lintas
// aplikasi). Semua pemanggil lama sudah disesuaikan ke salah satu dari
// dua ini di seluruh file kodegs/*.gs.
function getMasterSiswaSs() { return DB_CACHE.getMasterSiswa(); }
function getMasterGuruSs() { return DB_CACHE.getMasterGuru(); }
function getAbsenSs() { return DB_CACHE.getAbsen(); }
