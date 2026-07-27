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
  // PATCH BUG SERIUS: sebelumnya baris ini (`value !== null ? value : ...`)
  // mengembalikan STRING MENTAH dari Properties tanpa JSON.parse -- padahal
  // jalur cache-hit di atas SELALU mengembalikan hasil JSON.parse. Untuk
  // config berupa string polos (ID spreadsheet dll) ini cuma bikin cache
  // tidak efektif, tapi untuk config berupa OBJEK (mis. ABSEN_GROUP_MAP di
  // getAbsenGroupMap()) ini bikin tipe data BERBEDA tergantung cache lagi
  // hangat atau tidak -- akibatnya kode pemanggil (groupMap[groupKey])
  // gagal cocok setiap kali cache basi, dikira grup "belum ada", lalu
  // ditulis ulang berulang-ulang dengan nilai yang makin lama makin rusak
  // (dibungkus JSON berlapis-lapis) sampai MENABRAK BATAS KUOTA
  // PENYIMPANAN Script Properties ("You have exceeded the property
  // storage quota"). Diperbaiki supaya SELALU coba JSON.parse dulu (biar
  // konsisten dengan jalur cache-hit), dengan fallback aman ke string
  // mentah kalau memang bukan JSON valid (kompatibel mundur untuk
  // property lama yang disimpan sebagai string polos, bukan hasil
  // JSON.stringify).
  const props = PropertiesService.getScriptProperties();
  const rawValue = props.getProperty(key);
  let finalValue;
  if (rawValue === null) {
    finalValue = defaultValue;
  } else {
    try {
      finalValue = JSON.parse(rawValue);
    } catch (e) {
      finalValue = rawValue; // string polos lama, pakai apa adanya
    }
  }

  // 3. Simpan ke cache untuk request berikutnya -- SELALU lewat
  // JSON.stringify sekarang (konsisten dengan JSON.parse di kedua jalur
  // baca di atas), supaya round-trip cache<->properties selalu
  // menghasilkan TIPE DATA YANG SAMA, apa pun kondisi cache-nya.
  try {
    cache.put(cacheKey, JSON.stringify(finalValue), CACHE_DURATION);
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
const DRIVE_FOLDER_REKAP_ID = getConfigValue('DRIVE_FOLDER_REKAP_ID', '1rZSN7CD93XIUAozSc0zmJuqq5on3u1RN');
const DRIVE_FOLDER_BACKUP_ID = getConfigValue('DRIVE_FOLDER_BACKUP_ID', '1wxDqJ3YcMR0ubK6Ni-uIByFmtdmnU6sa');

// =========================================================
// PEMBAGIAN & AUTO-PROVISIONING SPREADSHEET ABSEN
// (jurusan + angkatan + semester)
// ---------------------------------------------------------
// KENAPA INI ADA: skema penyimpanan absen di app ini = 1 tab per
// KELAS_MAPEL (lihat getOrCreateSheet() di Utils.gs). Kalau semua kelas
// & mapel ditulis ke 1 file spreadsheet yang sama, dengan skala ~60
// kelas x ~15 mapel itu bisa butuh sampai 900 tab -- jauh melebihi batas
// KERAS Google Sheets: 200 tab per spreadsheet.
//
// SOLUSI: absen dipecah ke beberapa file, dikelompokkan per JURUSAN
// (diambil dari nama kelas, mis. "DKV") + ANGKATAN (X/XI/XII) +
// SEMESTER (S1 = Juli-Desember, S2 = Januari-Juni). Dengan 3 jurusan x 3
// angkatan x 2 semester = 18 grup, tiap file cuma menampung sebagian
// kecil dari 60 kelas -- jauh di bawah 200 tab, dengan ruang sisa besar.
//
// TIDAK PERLU BUAT FILE MANUAL: spreadsheet untuk tiap grup dibuat
// OTOMATIS saat pertama kali dibutuhkan (guru pertama kali submit absen
// untuk kombinasi jurusan+angkatan+semester itu), lewat
// getOrProvisionAbsenSpreadsheetId() di bawah. Supaya admin gampang
// menelusuri file-nya lewat Drive (bukan cuma lewat ID di Properties),
// file itu otomatis ditaruh di dalam SUBFOLDER PER JURUSAN, yang juga
// dibuat otomatis kalau belum ada, di bawah 1 folder ROOT yang cukup
// admin siapkan SEKALI (lihat DRIVE_FOLDER_ABSEN_ROOT_ID).
//
// YANG PERLU ADMIN LAKUKAN (sekali saja):
//   1) Buat 1 folder kosong di Google Drive, mis. "Data Absen".
//   2) Salin ID folder itu dari URL, isi lewat:
//        setupConfig(); // lalu edit DRIVE_FOLDER_ABSEN_ROOT_ID di bawah
//      atau langsung: PropertiesService.getScriptProperties()
//        .setProperty('DRIVE_FOLDER_ABSEN_ROOT_ID', 'ID_FOLDER_ANDA');
//   Selesai -- subfolder jurusan (DKV/AK/BD/dst) dan file spreadsheet per
//   grup akan muncul sendiri di dalam folder itu seiring pemakaian.
//
// KALAU DISTRIBUSI KELAS SEKOLAH ANDA MASIH TERLALU PADAT PER GRUP
// (jarang terjadi dengan skema 3 sumbu ini, tapi jaga-jaga): perhalus
// lagi kunci pengelompokan di getAbsenGroupKey() di bawah, misal
// tambahkan nomor rombel ke dalam kunci.
// =========================================================

const DRIVE_FOLDER_ABSEN_ROOT_ID = getConfigValue('DRIVE_FOLDER_ABSEN_ROOT_ID', 'GANTI_DENGAN_ID_FOLDER_ROOT_ABSEN');

// Tidak ada seed manual -- SEMUA grup (termasuk kelas yang sebelumnya
// memakai spreadsheet dummy lama) akan ter-provision otomatis sendiri
// saat dipakai pertama kali. Spreadsheet dummy lama sengaja TIDAK
// direferensikan lagi di sini karena akan dihapus dari Drive (data uji
// coba aplikasi versi sebelumnya, bukan data produksi) -- kalau ID-nya
// masih ditaruh di sini, begitu file itu dihapus, submit absen untuk
// grup itu akan gagal dengan error "file tidak ditemukan" dari Google,
// bukan otomatis membuatkan file baru (karena kode hanya mengecek APAKAH
// grup sudah tercatat, bukan APAKAH file yang tercatat masih ada).
const DEFAULT_ABSEN_GROUP_MAP = {};

function getAbsenGroupMap() {
  return getConfigValue('ABSEN_GROUP_MAP', DEFAULT_ABSEN_GROUP_MAP);
}

/**
 * Escape hatch manual (jarang dibutuhkan sekarang karena provisioning
 * sudah otomatis) -- tetap disediakan untuk kasus admin mau menimpa /
 * menunjuk manual 1 grup ke spreadsheet tertentu yang sudah ada, contoh:
 *   setupAbsenGroupMapping({ "DKV_XI_2026-2027_S1": "1AbC...xyz" });
 * Merge, bukan menimpa semua.
 */
function setupAbsenGroupMapping(mapObjBaru) {
  const props = PropertiesService.getScriptProperties();
  const existing = getAbsenGroupMap();
  const merged = Object.assign({}, existing, mapObjBaru);
  props.setProperty('ABSEN_GROUP_MAP', JSON.stringify(merged));
  invalidateConfigCache('ABSEN_GROUP_MAP');
  Logger.log('Pemetaan grup absen tersimpan: ' + JSON.stringify(merged));
  return merged;
}

// Ambil ANGKATAN dari string kelas, misal "XI DKV 1" -> "XI".
function getAngkatanFromKelas(kelas) {
  const match = String(kelas).trim().match(/^(XII|XI|X|IX|VIII|VII)\b/i);
  return match ? match[1].toUpperCase() : String(kelas).trim().split(' ')[0];
}

// Ambil JURUSAN dari string kelas, misal "XI DKV 1" -> "DKV", "XII AK 2"
// -> "AK". Diasumsikan formatnya "ANGKATAN JURUSAN NOMOR_ROMBEL" (sesuai
// data nyata: "XI DKV 1", "XII DKV 3"). Kalau tidak ketemu pola jurusan,
// dikembalikan "UMUM" supaya tetap ada 1 folder tujuan yang jelas
// (bukan error) -- sekaligus jadi sinyal untuk dicek manual formatnya.
function getJurusanFromKelas(kelas) {
  const trimmed = String(kelas).trim();
  const angkatan = getAngkatanFromKelas(kelas);
  const sisa = trimmed.replace(new RegExp('^' + angkatan + '\\b', 'i'), '').trim();
  const token = sisa.split(/\s+/)[0];
  return token ? token.toUpperCase() : 'UMUM';
}

// Tentukan semester dari STRING TANGGAL absensi ("yyyy-MM-dd"), BUKAN
// dari tanggal hari ini -- supaya entri yang disimpan/diedit belakangan
// tetap masuk ke file semester yang sesuai TANGGAL KEJADIAN absennya.
// S1 = Juli-Desember, S2 = Januari-Juni (kalender pendidikan umum di
// Indonesia). Sesuaikan kalau kalender akademik sekolah Anda beda.
function getSemesterFromTanggal(tanggalStr) {
  const d = new Date(tanggalStr);
  const bulan = isNaN(d.getTime()) ? (new Date()).getMonth() + 1 : d.getMonth() + 1;
  return (bulan >= 7 && bulan <= 12) ? 'S1' : 'S2';
}

// Tentukan TAHUN AJARAN dari string tanggal, format "2026-2027".
// PENTING: ini yang membuat pergantian tahun ajaran (kenaikan kelas)
// otomatis memicu spreadsheet BARU, TANPA bergantung pada admin harus
// ingat mengganti DRIVE_FOLDER_ABSEN_ROOT_ID tepat waktu. Kalau tahun
// ajaran TIDAK dimasukkan ke groupKey (lihat getAbsenGroupKey() di
// bawah), kunci grup "DKV_XI_S1" akan SAMA PERSIS tahun depan -- kode
// akan menemukan grup itu "sudah tercatat" (dari tahun lalu) di Script
// Properties dan diam-diam terus menulis ke spreadsheet TAHUN LALU,
// meskipun folder root sudah diganti ke folder tahun baru.
// Juli-Desember tahun X = tahun ajaran mulai X; Januari-Juni tahun X =
// tahun ajaran mulai (X-1) -- karena semester genap adalah lanjutan
// tahun ajaran yang dimulai tahun sebelumnya.
function getTahunAjaranFromTanggal(tanggalStr) {
  const d = new Date(tanggalStr);
  const valid = !isNaN(d.getTime());
  const now = new Date();
  const bulan = valid ? d.getMonth() + 1 : now.getMonth() + 1;
  const tahun = valid ? d.getFullYear() : now.getFullYear();
  const tahunMulai = (bulan >= 7) ? tahun : (tahun - 1);
  return tahunMulai + '-' + (tahunMulai + 1);
}

// Kunci grup final, misal "DKV_XI_2026-2027_S1". Semua fungsi yang
// perlu tahu "absen kelas ini disimpan di spreadsheet mana" pakai fungsi
// ini sebagai satu-satunya sumber kebenaran.
function getAbsenGroupKey(kelas, tanggalStr) {
  const jurusan = getJurusanFromKelas(kelas);
  const angkatan = getAngkatanFromKelas(kelas);
  const tahunAjaran = getTahunAjaranFromTanggal(tanggalStr);
  const semester = getSemesterFromTanggal(tanggalStr);
  return jurusan + '_' + angkatan + '_' + tahunAjaran + '_' + semester;
}

// Cari subfolder bernama `namaSubfolder` di dalam `parentFolder`; kalau
// belum ada, buat baru. Dipakai supaya subfolder per jurusan (DKV/AK/BD)
// muncul otomatis tanpa admin perlu bikin manual.
function getOrCreateSubfolder(parentFolder, namaSubfolder) {
  const it = parentFolder.getFoldersByName(namaSubfolder);
  if (it.hasNext()) return it.next();
  return parentFolder.createFolder(namaSubfolder);
}

/**
 * Inti auto-provisioning. Alurnya:
 *   1) Kalau grup sudah tercatat di ABSEN_GROUP_MAP -> langsung pakai
 *      ID-nya, TANPA sentuh Drive API sama sekali (cepat, ini jalur yang
 *      dilewati hampir semua request sehari-hari).
 *   2) Kalau belum tercatat -- ini cuma terjadi 1x per grup seumur hidup
 *      aplikasi (submit pertama untuk kombinasi jurusan+angkatan+semester
 *      itu) -- dikunci lewat LockService supaya 2 request pertama yang
 *      nyaris bersamaan tidak sama-sama bikin spreadsheet duplikat untuk
 *      grup yang sama. Setelah dapat lock, DICEK ULANG dulu (double-
 *      checked locking) barangkali sudah dibikinkan oleh request lain
 *      barusan sebelum kita sempat masuk giliran.
 *   3) Baru kalau memang benar-benar belum ada: cari/buat subfolder
 *      jurusan, cari/buat file spreadsheet-nya, simpan ID-nya ke
 *      Properties supaya lookup berikutnya lewat jalur cepat di poin 1.
 *
 * PATCH KRITIS (cegah potensi deadlock): parameter `sudahDikunci` --
 * beberapa pemanggil (handleSubmit() di Absensi.gs, simpanAbsenWali() di
 * AbsenWali.gs, hapusAbsensi() di Absensi.gs) SUDAH memegang
 * LockService.getScriptLock() SENDIRI sebelum sampai ke fungsi ini
 * (lewat getAbsenSs()). Kalau grup belum ter-provision, fungsi ini
 * SEBELUMNYA selalu mencoba lock() lagi -- padahal LockService Apps
 * Script adalah SATU kunci tunggal per script (bukan per-resource), jadi
 * mengunci lagi di eksekusi yang SAMA yang sudah memegangnya berisiko
 * deadlock (menunggu dirinya sendiri) kalau LockService tidak reentrant.
 * Ini justru paling mungkin kejadian di momen PALING PENTING: submit
 * absen pertama kali di semester/tahun ajaran baru (saat grup memang
 * belum pernah ada).
 * Kalau `sudahDikunci` true, fungsi ini TIDAK mengunci lagi -- provisioning
 * tetap AMAN dari race condition antar-2-EKSEKUSI-BERBEDA, karena kedua
 * eksekusi itu sudah pasti terserialisasi lebih dulu lewat lock TUNGGAL
 * yang sama yang dipegang pemanggil (getScriptLock() cuma ada 1 per
 * script, bukan per grup) -- jadi tidak mungkin ada 2 eksekusi yang
 * SAMA-SAMA sedang di titik ini secara bersamaan kalau caller-nya sudah
 * dikunci di titik yang lebih luar.
 */
function getOrProvisionAbsenSpreadsheetId(kelas, tanggalStr, sudahDikunci) {
  const groupKey = getAbsenGroupKey(kelas, tanggalStr);

  let groupMap = getAbsenGroupMap();
  if (groupMap[groupKey]) return groupMap[groupKey];

  if (!DRIVE_FOLDER_ABSEN_ROOT_ID || DRIVE_FOLDER_ABSEN_ROOT_ID.indexOf('GANTI_DENGAN_ID') === 0) {
    throw new Error('DRIVE_FOLDER_ABSEN_ROOT_ID belum diisi. Buat 1 folder Drive untuk menampung semua file absen, lalu isi ID-nya (lihat catatan di atas getAbsenGroupKey(), Config.gs).');
  }

  if (sudahDikunci) {
    // Pemanggil sudah pegang lock sendiri -- langsung provisioning tanpa
    // lock tambahan (lihat penjelasan lengkap di komentar fungsi ini).
    return provisionSpreadsheetAbsenBaru(kelas, groupKey, groupMap);
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sedang menyiapkan spreadsheet baru untuk grup ' + groupKey + ', silakan coba lagi beberapa saat.');
  }

  try {
    // Cek ulang setelah dapat lock -- lihat catatan poin 2 di atas.
    groupMap = getAbsenGroupMap();
    if (groupMap[groupKey]) return groupMap[groupKey];
    return provisionSpreadsheetAbsenBaru(kelas, groupKey, groupMap);
  } finally {
    lock.releaseLock();
  }
}

// Logika sebenarnya yang membuat/menemukan spreadsheet untuk 1 grup --
// dipisah dari getOrProvisionAbsenSpreadsheetId() supaya bisa dipanggil
// BAIK dari jalur yang mengunci sendiri MAUPUN dari jalur yang lock-nya
// sudah dipegang pemanggil (lihat parameter `sudahDikunci` di atas).
function provisionSpreadsheetAbsenBaru(kelas, groupKey, groupMap) {
  const jurusan = getJurusanFromKelas(kelas);
  const rootFolder = DriveApp.getFolderById(DRIVE_FOLDER_ABSEN_ROOT_ID);
  const jurusanFolder = getOrCreateSubfolder(rootFolder, jurusan);

  const namaFile = 'Absen_' + groupKey;
  let spreadsheetId;
  const existingFiles = jurusanFolder.getFilesByName(namaFile);
  if (existingFiles.hasNext()) {
    // Sudah pernah dibuat sebelumnya tapi entah kenapa hilang dari
    // Properties (mis. properties direset admin) -- pakai yang ada,
    // jangan bikin file duplikat.
    spreadsheetId = existingFiles.next().getId();
  } else {
    const ssBaru = SpreadsheetApp.create(namaFile);
    spreadsheetId = ssBaru.getId();
    DriveApp.getFileById(spreadsheetId).moveTo(jurusanFolder);
  }

  const props = PropertiesService.getScriptProperties();
  groupMap[groupKey] = spreadsheetId;
  props.setProperty('ABSEN_GROUP_MAP', JSON.stringify(groupMap));
  invalidateConfigCache('ABSEN_GROUP_MAP');

  return spreadsheetId;
}

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
  if (!props.getProperty('DRIVE_FOLDER_REKAP_ID')) {
    props.setProperty('DRIVE_FOLDER_REKAP_ID', '1rZSN7CD93XIUAozSc0zmJuqq5on3u1RN');
  }
  if (!props.getProperty('DRIVE_FOLDER_ABSEN_ROOT_ID')) {
    // GANTI nilai di bawah dengan ID folder Drive kosong yang Anda
    // siapkan untuk menampung semua file absen (subfolder per jurusan
    // akan dibuat otomatis di dalamnya).
    props.setProperty('DRIVE_FOLDER_ABSEN_ROOT_ID', 'GANTI_DENGAN_ID_FOLDER_ROOT_ABSEN');
  }
  if (!props.getProperty('DRIVE_FOLDER_BACKUP_ID')) {
    props.setProperty('DRIVE_FOLDER_BACKUP_ID', '1wxDqJ3YcMR0ubK6Ni-uIByFmtdmnU6sa');
  }
  
  // Invalidate cache agar config terbaru langsung terbaca
  invalidateConfigCache('SPREADSHEET_MASTER_SISWA_ID');
  invalidateConfigCache('SPREADSHEET_MASTER_GURU_ID');
  invalidateConfigCache('DRIVE_FOLDER_REKAP_ID');
  invalidateConfigCache('DRIVE_FOLDER_ABSEN_ROOT_ID');
  invalidateConfigCache('DRIVE_FOLDER_BACKUP_ID');
  
  Logger.log('Konfigurasi berhasil disetup!');
  Logger.log('SPREADSHEET_MASTER_SISWA_ID: ' + props.getProperty('SPREADSHEET_MASTER_SISWA_ID'));
  Logger.log('SPREADSHEET_MASTER_GURU_ID: ' + props.getProperty('SPREADSHEET_MASTER_GURU_ID'));
  Logger.log('DRIVE_FOLDER_REKAP_ID: ' + props.getProperty('DRIVE_FOLDER_REKAP_ID'));
  Logger.log('DRIVE_FOLDER_ABSEN_ROOT_ID: ' + props.getProperty('DRIVE_FOLDER_ABSEN_ROOT_ID') + ' (GANTI kalau masih placeholder!)');
  Logger.log('DRIVE_FOLDER_BACKUP_ID: ' + props.getProperty('DRIVE_FOLDER_BACKUP_ID'));
  Logger.log('CATATAN: spreadsheet absen sekarang dipecah per grup jurusan+angkatan+semester, dan dibuat OTOMATIS saat pertama kali dipakai -- tidak perlu diisi manual satu-satu lagi.');
}

// ===== CACHE INSTANCE SPREADSHEET =====
// PATCH SKALABILITAS: _absen dulu 1 instance tunggal (singleton). Sekarang
// jadi _absenById -- cache per ID spreadsheet -- karena absen sudah
// dipecah jadi beberapa file (per grup angkatan+semester, lihat
// getAbsenGroupKey() di atas). Dalam 1 eksekusi script yang sama, kalau
// beberapa kelas dari grup berbeda diakses, tiap file cukup dibuka sekali
// (tetap di-cache), bukan berulang kali.
const DB_CACHE = {
  _masterSiswa: null,
  _masterGuru: null,
  _absenById: {},

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

  getAbsen: function(spreadsheetId) {
    if (!this._absenById[spreadsheetId]) {
      this._absenById[spreadsheetId] = SpreadsheetApp.openById(spreadsheetId);
    }
    return this._absenById[spreadsheetId];
  },

  reset: function() {
    this._masterSiswa = null;
    this._masterGuru = null;
    this._absenById = {};
  }
};

// PATCH INTEGRASI ANTAR-APLIKASI: getMasterSs() lama dipisah jadi 2 --
// getMasterSiswaSs() (data siswa per kelas, read-only untuk app ini) dan
// getMasterGuruSs() (identitas guru + akun login, dipakai bersama lintas
// aplikasi). Semua pemanggil lama sudah disesuaikan ke salah satu dari
// dua ini di seluruh file kodegs/*.gs.
function getMasterSiswaSs() { return DB_CACHE.getMasterSiswa(); }
function getMasterGuruSs() { return DB_CACHE.getMasterGuru(); }

/**
 * Jalankan MANUAL 1x setiap kenaikan kelas (pergantian tahun ajaran),
 * SETELAH data siswa tahun ajaran baru selesai disiapkan di Aplikasi
 * Manajemen Siswa (mis. spreadsheet baru "DATA SISWA 2027-2028"
 * dengan kelas-kelas yang sudah dimutakhirkan). Contoh pemakaian di
 * editor Apps Script:
 *   gantiMasterSiswaSpreadsheet('ID_SPREADSHEET_DATA_SISWA_2027_2028');
 * Setelah ini, SEMUA request berikutnya (mulai request selanjutnya --
 * bukan di eksekusi yang sama tempat fungsi ini dipanggil) akan memakai
 * spreadsheet baru untuk data siswa/NIS.
 */
function gantiMasterSiswaSpreadsheet(spreadsheetIdBaru) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_MASTER_SISWA_ID', spreadsheetIdBaru);
  invalidateConfigCache('SPREADSHEET_MASTER_SISWA_ID');
  Logger.log('SPREADSHEET_MASTER_SISWA_ID sekarang diarahkan ke: ' + spreadsheetIdBaru);
}

/**
 * PATCH SKALABILITAS (pecah spreadsheet absen per grup angkatan+semester)
 * getAbsenSs() SEKARANG WAJIB diberi parameter `kelas` (dan sebaiknya
 * `tanggalStr` -- string "yyyy-MM-dd" tanggal absennya) supaya tahu file
 * grup mana yang harus dibuka. Ini mengganti perilaku lama yang selalu
 * membuka SATU spreadsheet absen untuk semua kelas & mapel.
 *
 * Kalau tanggalStr tidak diisi, dipakai tanggal HARI INI (cocok untuk
 * kasus baca "data terkini", misal dashboard) -- tapi untuk MENYIMPAN
 * absen selalu kirim tanggal absen yang sebenarnya, bukan default ini,
 * supaya entri yang telat disimpan tetap masuk ke file semester yang
 * benar sesuai tanggal kejadiannya.
 *
 * PATCH KRITIS: parameter `sudahDikunci` (opsional, default false) --
 * isi `true` HANYA kalau pemanggil SUDAH memegang
 * LockService.getScriptLock() sendiri (mis. handleSubmit(),
 * simpanAbsenWali(), hapusAbsensi()), supaya provisioning grup baru
 * tidak mencoba mengunci lagi di eksekusi yang sama (lihat penjelasan
 * lengkap risikonya di getOrProvisionAbsenSpreadsheetId(), Config.gs).
 * Pemanggil yang TIDAK memegang lock sendiri (getDashboardData(),
 * getRiwayatAbsensi(), dst) cukup panggil seperti biasa tanpa parameter
 * ini (default false -- tetap dikunci sendiri seperti sebelumnya).
 */
function getAbsenSs(kelas, tanggalStr, sudahDikunci) {
  if (!kelas) {
    throw new Error('getAbsenSs() sekarang wajib diberi parameter kelas -- data absen dipecah per grup jurusan+angkatan+semester supaya tidak melebihi batas 200 tab/spreadsheet Google Sheets. Lihat Config.gs.');
  }
  const tgl = tanggalStr || Utilities.formatDate(new Date(), ZONA_WAKTU_DIHARAPKAN, 'yyyy-MM-dd');
  const spreadsheetId = getOrProvisionAbsenSpreadsheetId(kelas, tgl, !!sudahDikunci);
  return DB_CACHE.getAbsen(spreadsheetId);
}

/**
 * Dipakai oleh fungsi yang perlu melihat SEMUA grup sekaligus (rekap
 * mingguan, migrasi one-off, dsb) -- lihat kodegs/Rekap.gs &
 * kodegs/Migrasi.gs. Grup yang ID-nya belum diisi otomatis dilewati
 * (tidak bikin error), supaya sekolah bisa mengaktifkan grup bertahap.
 */
function getAllAbsenSpreadsheets() {
  const groupMap = getAbsenGroupMap();
  const result = [];
  for (const groupKey in groupMap) {
    const spreadsheetId = groupMap[groupKey];
    if (!spreadsheetId || spreadsheetId.indexOf('GANTI_DENGAN_ID') === 0) continue;
    result.push({ groupKey: groupKey, ss: DB_CACHE.getAbsen(spreadsheetId) });
  }
  return result;
}
