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
  // PATCH INTEGRASI: data siswa di spreadsheet Master Siswa terpisah.
  const ss = getMasterSiswaSs();
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

// Ambang peringatan sebelum batas KERAS Google Sheets (200 tab/file)
// benar-benar tersentuh -- diberi jarak (195) supaya admin sekolah
// dapat pesan error yang jelas & actionable DULUAN, sebelum Google
// sendiri menolak insertSheet() dengan error yang jauh lebih membingungkan.
const BATAS_PERINGATAN_JUMLAH_TAB = 195;

function getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    // PATCH SKALABILITAS: cek dulu jumlah tab SEBELUM insertSheet().
    // Kalaupun spreadsheet absen sudah dipecah per grup (lihat
    // getAbsenGroupKey() di Config.gs), tetap disiapkan pengaman ini --
    // jaga-jaga kalau distribusi kelas riil sekolah ternyata lebih padat
    // dari perkiraan saat pengelompokan dirancang.
    const jumlahTabSaatIni = ss.getSheets().length;
    if (jumlahTabSaatIni >= BATAS_PERINGATAN_JUMLAH_TAB) {
      throw new Error(
        'Spreadsheet "' + ss.getName() + '" sudah punya ' + jumlahTabSaatIni +
        ' tab (mendekati batas keras Google Sheets, 200 tab/file). ' +
        'Tab baru "' + sheetName + '" TIDAK dibuat supaya data tidak tiba-tiba ' +
        'gagal tersimpan. Perhalus pembagian grup di getAbsenGroupKey() ' +
        '(Config.gs) -- misal tambahkan jurusan selain angkatan+semester -- ' +
        'lalu buat spreadsheet grup baru dan daftarkan lewat setupAbsenGroupMapping().'
      );
    }
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(["Timestamp", "Nama Guru", "Mata Pelajaran", "Kelas", "Tanggal", "Hadir", "Izin", "Sakit", "Alpa"]);
  }
  return sheet;
}

// Tanggal hari ini dalam format "yyyy-MM-dd", zona waktu sekolah.
// Dipakai fungsi baca "data terkini" (dashboard, riwayat) yang tidak
// punya tanggal spesifik untuk menentukan grup semester mana yang dibuka
// -- lihat getAbsenSs() di Config.gs.
function todayISO() {
  return Utilities.formatDate(new Date(), ZONA_WAKTU_DIHARAPKAN, 'yyyy-MM-dd');
}

// ===== VALIDASI & SANITASI INPUT =====

/**
 * Validasi dan sanitasi input
 * @param {string|number} str - Input yang akan divalidasi
 * @param {string} type - Tipe validasi ('nis', 'nip', 'nisn', 'nama', 'status_absen', 'tanggal')
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
    // PATCH (BARU): 'nis' -- NIS yang diberikan SEKOLAH SENDIRI, bukan NISN
    // resmi Kemendikbud. Formatnya bisa mengandung "/" dan "." (contoh nyata:
    // "10408/771.111"), jadi TIDAK BOLEH dipaksa murni angka seperti NISN.
    // Sebelumnya kode ini memakai validasi 'nisn' (regex /^\d+$/) untuk NIS
    // sekolah, sehingga SEMUA submit absensi ditolak "NIS tidak valid" karena
    // NIS asli sekolah memang bukan angka murni.
    case 'nis':
      if (strVal.length < 3) {
        return 'NIS terlalu pendek';
      }
      if (strVal.length > 30) {
        return 'NIS terlalu panjang';
      }
      if (!/^[A-Za-z0-9./-]+$/.test(strVal)) {
        return 'NIS mengandung karakter tidak valid';
      }
      break;

    // 'nip'/'nisn' TETAP ketat murni angka -- dipakai untuk NISN resmi
    // (Kemendikbud) atau NIP guru kalau suatu saat dibutuhkan, BUKAN untuk
    // NIS buatan sekolah sendiri seperti di atas.
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
      // PERBAIKAN: Status absensi yang valid adalah H/I/S/A (bukan Hadir/Izin/Sakit/Alpha)
      const validStatus = ['H', 'I', 'S', 'A'];
      if (!validStatus.includes(strVal)) {
        return 'Status absensi tidak valid. Gunakan H (Hadir), I (Izin), S (Sakit), atau A (Alpha).';
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

// PATCH BERSIH-BERSIH: sanitizeString() sebelumnya ada di sini tapi TIDAK
// PERNAH dipanggil dari fungsi manapun di seluruh kodebase (bukan cuma di
// file ini). Semua input yang sebenarnya perlu di-trim sudah ditangani
// masing-masing lewat validateInput() atau .trim() langsung di tempat
// yang membutuhkan (mis. Auth.gs, Absensi.gs). Dihapus supaya tidak ada
// kode mati yang membingungkan.
