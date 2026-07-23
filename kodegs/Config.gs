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

const SPREADSHEET_MASTER_ID = getConfigValue('SPREADSHEET_MASTER_ID', '1YYWe9qgwP5v4FvO9xR2vWOtu9NA89EHwa7xaTOqeVuI');
const SPREADSHEET_ABSEN_ID = getConfigValue('SPREADSHEET_ABSEN_ID', '1_ZIp2nAEp__atYI_b6D37nmpAdAOE510l6vLTtFdXHI');
const DRIVE_FOLDER_REKAP_ID = getConfigValue('DRIVE_FOLDER_REKAP_ID', '1rZSN7CD93XIUAozSc0zmJuqq5on3u1RN');
const DRIVE_FOLDER_BACKUP_ID = getConfigValue('DRIVE_FOLDER_BACKUP_ID', '1wxDqJ3YcMR0ubK6Ni-uIByFmtdmnU6sa');

const MAPEL_ABSEN_WALI = "Absen Harian";
const BACKUP_RETENTION_DAYS = 90;
const ZONA_WAKTU_DIHARAPKAN = 'Asia/Jakarta';
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

// ===== FUNGSI SETUP INITIAL CONFIG (JALANKAN SEKALI SAJA) =====
function setupConfig() {
  const props = PropertiesService.getScriptProperties();
  
  // Set default values jika belum ada
  if (!props.getProperty('SPREADSHEET_MASTER_ID')) {
    props.setProperty('SPREADSHEET_MASTER_ID', '1YYWe9qgwP5v4FvO9xR2vWOtu9NA89EHwa7xaTOqeVuI');
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
  invalidateConfigCache('SPREADSHEET_MASTER_ID');
  invalidateConfigCache('SPREADSHEET_ABSEN_ID');
  invalidateConfigCache('DRIVE_FOLDER_REKAP_ID');
  invalidateConfigCache('DRIVE_FOLDER_BACKUP_ID');
  
  Logger.log('Konfigurasi berhasil disetup!');
  Logger.log('SPREADSHEET_MASTER_ID: ' + props.getProperty('SPREADSHEET_MASTER_ID'));
  Logger.log('SPREADSHEET_ABSEN_ID: ' + props.getProperty('SPREADSHEET_ABSEN_ID'));
  Logger.log('DRIVE_FOLDER_REKAP_ID: ' + props.getProperty('DRIVE_FOLDER_REKAP_ID'));
  Logger.log('DRIVE_FOLDER_BACKUP_ID: ' + props.getProperty('DRIVE_FOLDER_BACKUP_ID'));
}

// ===== CACHE INSTANCE SPREADSHEET (SINGLETON) =====
const DB_CACHE = {
  _master: null,
  _absen: null,
  
  getMaster: function() {
    if (!this._master) {
      this._master = SpreadsheetApp.openById(SPREADSHEET_MASTER_ID);
    }
    return this._master;
  },
  
  getAbsen: function() {
    if (!this._absen) {
      this._absen = SpreadsheetApp.openById(SPREADSHEET_ABSEN_ID);
    }
    return this._absen;
  },
  
  getSheet: function(spreadsheetType, sheetName) {
    const ss = spreadsheetType === 'master' ? this.getMaster() : this.getAbsen();
    let sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" tidak ditemukan di spreadsheet ${spreadsheetType}.`);
    }
    return sheet;
  },
  
  reset: function() {
    this._master = null;
    this._absen = null;
  }
};

function getMasterSs() { return DB_CACHE.getMaster(); }
function getAbsenSs() { return DB_CACHE.getAbsen(); }
