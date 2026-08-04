// =========================================================
// FITUR NILAI -- TAHAP 1: FONDASI DATA (belum ada tampilan/UI)
// ---------------------------------------------------------
// Model data: "bebas per kegiatan" -- guru bikin sendiri kegiatan
// penilaian (mis. "Tugas 1", "UH Bab 2"), tiap kegiatan punya TIPE
// SKALA sendiri (angka 0-100 ATAU huruf A/B/C/D/E, dipilih guru saat
// bikin kegiatan itu -- BUKAN dua-duanya untuk 1 kegiatan yang sama,
// supaya tidak ada 2 data yang bisa tidak sinkron).
//
// STRUKTUR SPREADSHEET (per kelas+mapel, 1 tab): 1 BARIS = 1 KEGIATAN
// (bukan 1 baris = 1 siswa) -- pola yang sama dengan Absen (1 baris =
// 1 tanggal), supaya konsisten & gampang dikelola:
//   A=Timestamp, B=Guru, C=Mapel, D=Kelas, E=KegiatanId (unik),
//   F=NamaKegiatan, G=TanggalKegiatan, H=TipeSkala ('angka'/'huruf'),
//   I=DataNilai (JSON: {"NIS": "nilai", ...})
//
// TERPISAH TOTAL dari Absen -- folder Drive sendiri
// (DRIVE_FOLDER_NILAI_ROOT_ID, lihat Config.gs) dan pelacakan grup
// sendiri (NILAI_GROUP_MAP), TAPI memakai ULANG logika pengelompokan
// grup yang sama (getAbsenGroupKey() -- jurusan+angkatan+tahunAjaran+
// semester, konsepnya generik, tidak spesifik ke absen).
// =========================================================

function getNilaiGroupMap() {
  return getConfigValue('NILAI_GROUP_MAP', {});
}

/**
 * Auto-provisioning spreadsheet Nilai per grup -- pola & alasan SAMA
 * PERSIS dengan getOrProvisionAbsenSpreadsheetId() di Config.gs
 * (termasuk parameter `sudahDikunci` untuk cegah potensi deadlock kalau
 * dipanggil dari konteks yang sudah pegang LockService sendiri -- lihat
 * penjelasan lengkap di fungsi itu). SENGAJA dibuat sebagai fungsi
 * TERPISAH (bukan reuse langsung fungsi absen yang sama), supaya kode
 * Absen yang sudah teruji tidak ikut tersentuh sama sekali oleh
 * perubahan di fitur Nilai ini.
 */
function getOrProvisionNilaiSpreadsheetId(kelas, tanggalStr, sudahDikunci) {
  const groupKey = getAbsenGroupKey(kelas, tanggalStr); // reuse -- logika pengelompokan generik, bukan spesifik absen

  let groupMap = getNilaiGroupMap();
  if (groupMap[groupKey]) return groupMap[groupKey];

  if (!DRIVE_FOLDER_NILAI_ROOT_ID || DRIVE_FOLDER_NILAI_ROOT_ID.indexOf('GANTI_DENGAN_ID') === 0) {
    throw new Error('DRIVE_FOLDER_NILAI_ROOT_ID belum diisi. Buat 1 folder Drive kosong khusus Nilai, lalu isi ID-nya (lihat Config.gs).');
  }

  if (sudahDikunci) {
    return provisionSpreadsheetNilaiBaru_(kelas, groupKey, groupMap);
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sedang menyiapkan spreadsheet nilai baru untuk grup ' + groupKey + ', silakan coba lagi beberapa saat.');
  }

  try {
    groupMap = getNilaiGroupMap(); // cek ulang setelah dapat lock (double-checked locking)
    if (groupMap[groupKey]) return groupMap[groupKey];
    return provisionSpreadsheetNilaiBaru_(kelas, groupKey, groupMap);
  } finally {
    lock.releaseLock();
  }
}

function provisionSpreadsheetNilaiBaru_(kelas, groupKey, groupMap) {
  const jurusan = getJurusanFromKelas(kelas);
  const rootFolder = DriveApp.getFolderById(DRIVE_FOLDER_NILAI_ROOT_ID);
  const jurusanFolder = getOrCreateSubfolder(rootFolder, jurusan);

  const namaFile = 'Nilai_' + groupKey;
  let spreadsheetId;
  const existingFiles = jurusanFolder.getFilesByName(namaFile);
  if (existingFiles.hasNext()) {
    spreadsheetId = existingFiles.next().getId();
  } else {
    const ssBaru = SpreadsheetApp.create(namaFile);
    spreadsheetId = ssBaru.getId();
    DriveApp.getFileById(spreadsheetId).moveTo(jurusanFolder);
  }

  const props = PropertiesService.getScriptProperties();
  groupMap[groupKey] = spreadsheetId;
  props.setProperty('NILAI_GROUP_MAP', JSON.stringify(groupMap));
  invalidateConfigCache('NILAI_GROUP_MAP');

  return spreadsheetId;
}

/**
 * Buka spreadsheet Nilai untuk 1 kelas -- pola & parameter SAMA PERSIS
 * dengan getAbsenSs() di Config.gs.
 */
function getNilaiSs(kelas, tanggalStr, sudahDikunci) {
  if (!kelas) {
    throw new Error('getNilaiSs() wajib diberi parameter kelas.');
  }
  const tgl = tanggalStr || todayISO();
  const spreadsheetId = getOrProvisionNilaiSpreadsheetId(kelas, tgl, !!sudahDikunci);
  return DB_CACHE.getNilai(spreadsheetId);
}

// Dipakai nanti untuk Rekap Nilai / reset semester (Tahap 3+) -- pola
// sama dengan getAllAbsenSpreadsheets().
function getAllNilaiSpreadsheets() {
  const groupMap = getNilaiGroupMap();
  const result = [];
  for (const groupKey in groupMap) {
    const spreadsheetId = groupMap[groupKey];
    if (!spreadsheetId || spreadsheetId.indexOf('GANTI_DENGAN_ID') === 0) continue;
    result.push({ groupKey: groupKey, ss: DB_CACHE.getNilai(spreadsheetId) });
  }
  return result;
}

// =========================================================
// CRUD KEGIATAN PENILAIAN
// =========================================================

/**
 * Wrapper luar dengan LockService -- pola SAMA PERSIS dengan
 * handleSubmit()/simpanSubmitAbsensi() di Absensi.gs (cegah race
 * condition kalau 2 guru menyimpan nilai ke kelas+mapel yang sama
 * nyaris bersamaan). Router.gs (Tahap 2) akan memanggil fungsi INI,
 * bukan simpanKegiatanNilai_() langsung.
 */
function handleSimpanKegiatanNilai(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: "Server sedang memproses nilai lain, silakan coba lagi beberapa saat." };
  }
  try {
    return simpanKegiatanNilai_(payload);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Logika penyimpanan sebenarnya -- HANYA dipanggil dari
 * handleSimpanKegiatanNilai() di atas (sudah pegang lock), makanya
 * getNilaiSs() di sini dipanggil dengan sudahDikunci=true (cegah
 * potensi deadlock -- lihat penjelasan lengkap di
 * getOrProvisionAbsenSpreadsheetId(), Config.gs).
 *
 * `payload`: { guru, mapel, kelas, kegiatanId (opsional -- kosong =
 * buat kegiatan baru, diisi = update kegiatan yang sudah ada),
 * namaKegiatan, tanggalKegiatan ("yyyy-MM-dd"), tipeSkala
 * ('angka'/'huruf'), nilaiPerSiswa: { "NIS": "nilai", ... } }
 */
function simpanKegiatanNilai_(payload) {
  if (!payload.namaKegiatan || !payload.mapel || !payload.kelas || !payload.tanggalKegiatan || !payload.tipeSkala) {
    return { success: false, message: 'Data kegiatan tidak lengkap (nama, mapel, kelas, tanggal, dan tipe skala wajib diisi).' };
  }
  if (payload.tipeSkala !== 'angka' && payload.tipeSkala !== 'huruf') {
    return { success: false, message: 'Tipe skala harus "angka" atau "huruf".' };
  }

  let ss;
  try {
    ss = getNilaiSs(payload.kelas, payload.tanggalKegiatan, true);
  } catch (e) {
    return { success: false, message: 'Gagal membuka/menyiapkan data nilai: ' + e.message };
  }

  const sheetName = (payload.kelas + "_" + payload.mapel).replace(/[^a-zA-Z0-9]/g, "_");
  const sheet = getOrCreateSheet(ss, sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Timestamp', 'Guru', 'Mapel', 'Kelas', 'KegiatanId', 'NamaKegiatan', 'TanggalKegiatan', 'TipeSkala', 'DataNilai']);
  }

  const kegiatanId = payload.kegiatanId || Utilities.getUuid();
  const data = sheet.getDataRange().getValues();
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][4] === kegiatanId) { targetRow = i + 1; break; }
  }

  const dataNilaiJson = JSON.stringify(payload.nilaiPerSiswa || {});
  const rowValues = [new Date(), payload.guru || '', payload.mapel, payload.kelas, kegiatanId, payload.namaKegiatan, payload.tanggalKegiatan, payload.tipeSkala, dataNilaiJson];

  if (targetRow !== -1) {
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return { success: true, message: 'Kegiatan penilaian berhasil disimpan.', data: { kegiatanId: kegiatanId } };
}

/**
 * Daftar semua kegiatan untuk 1 kelas+mapel (metadata saja, TANPA
 * DataNilai penuh -- biar ringan) -- dipakai nanti untuk dropdown
 * pilihan kegiatan di form Input Nilai, dan daftar Riwayat (Tahap 2).
 */
function getKegiatanNilai(mapel, kelas) {
  let ss;
  try {
    ss = getNilaiSs(kelas, todayISO());
  } catch (e) {
    return { success: false, message: 'Gagal membuka data nilai: ' + e.message };
  }

  const sheetName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_");
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: true, data: [] }; // belum ada kegiatan sama sekali, BUKAN error

  const data = sheet.getDataRange().getValues();
  const daftar = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][4]) continue;
    daftar.push({
      kegiatanId: data[i][4],
      namaKegiatan: data[i][5],
      // PATCH BUG: sebelumnya data[i][6] dikirim APA ADANYA (objek Date
      // mentah dari Apps Script) -- begitu di-JSON.stringify jadi string
      // ISO lengkap dengan jam & zona waktu UTC (mis.
      // "2026-07-26T17:00:00.000Z"), bukan cuma tanggalnya. Diformat
      // dulu jadi "yyyy-MM-dd" saja, sama seperti yang sudah benar di
      // getNilaiUntukKegiatan() di bawah.
      tanggalKegiatan: Utilities.formatDate(new Date(data[i][6]), ZONA_WAKTU_DIHARAPKAN, 'yyyy-MM-dd'),
      tipeSkala: data[i][7]
    });
  }

  daftar.sort((a, b) => new Date(b.tanggalKegiatan) - new Date(a.tanggalKegiatan)); // terbaru dulu
  return { success: true, data: daftar };
}

/**
 * Ambil 1 kegiatan LENGKAP dengan nilai per siswa -- dipakai untuk mode
 * edit (form Input Nilai dimuat ulang dengan data yang sudah ada, sama
 * seperti pola edit di Riwayat Absensi).
 */
function getNilaiUntukKegiatan(mapel, kelas, kegiatanId) {
  let ss;
  try {
    ss = getNilaiSs(kelas, todayISO());
  } catch (e) {
    return { success: false, message: 'Gagal membuka data nilai: ' + e.message };
  }

  const sheetName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_");
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, message: 'Data nilai untuk kelas/mapel ini belum ada.' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][4] !== kegiatanId) continue;
    let nilaiPerSiswa = {};
    try { nilaiPerSiswa = JSON.parse(data[i][8] || '{}'); } catch (e) { /* rusak/kosong -- biarkan objek kosong, bukan error fatal */ }
    return {
      success: true,
      data: {
        kegiatanId: data[i][4],
        namaKegiatan: data[i][5],
        tanggalKegiatan: Utilities.formatDate(new Date(data[i][6]), ZONA_WAKTU_DIHARAPKAN, 'yyyy-MM-dd'),
        tipeSkala: data[i][7],
        nilaiPerSiswa: nilaiPerSiswa
      }
    };
  }
  return { success: false, message: 'Kegiatan penilaian tidak ditemukan.' };
}

/**
 * Hapus 1 kegiatan penilaian -- disediakan sejak Tahap 1 (konsisten
 * dengan fitur Hapus Absen yang sudah ada), meski UI-nya baru menyusul
 * di Tahap 2. Pakai lock yang sama seperti hapusAbsensi() di
 * Absensi.gs.
 */
function handleHapusKegiatanNilai(mapel, kelas, kegiatanId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: "Server sedang memproses nilai lain, silakan coba lagi beberapa saat." };
  }
  try {
    return hapusKegiatanNilai_(mapel, kelas, kegiatanId);
  } finally {
    lock.releaseLock();
  }
}

function hapusKegiatanNilai_(mapel, kelas, kegiatanId) {
  let ss;
  try {
    ss = getNilaiSs(kelas, todayISO(), true); // sudahDikunci=true, lihat handleSimpanKegiatanNilai() untuk penjelasan lengkap
  } catch (e) {
    return { success: false, message: 'Gagal membuka data nilai: ' + e.message };
  }

  const sheetName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_");
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, message: 'Data nilai untuk kelas/mapel ini tidak ditemukan.' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][4] === kegiatanId) {
      sheet.deleteRow(i + 1);
      return { success: true, message: 'Kegiatan penilaian berhasil dihapus.' };
    }
  }
  return { success: false, message: 'Kegiatan penilaian tidak ditemukan (mungkin sudah terhapus sebelumnya).' };
}

// =========================================================
// TAHAP 3: REKAP NILAI (unduh .xlsx)
// ---------------------------------------------------------
// Bentuk data KELUARAN sengaja dibuat SAMA PERSIS dengan
// getRekapKelasSaya() (Rekap.gs) -- { tabName, headerRow, rows } --
// supaya generateExcelFromData() di js/api.js bisa dipakai ULANG
// APA ADANYA (tidak perlu fungsi generator Excel baru sama sekali).
// =========================================================

/**
 * Rekap nilai semua mapel+kelas yang diampu guru -- 1 tab Excel per
 * kombinasi kelas+mapel, kolom = kegiatan (urut tanggal), baris = siswa.
 * Siswa yang belum sempat dinilai di kegiatan tertentu tetap muncul
 * barisnya (kolom itu kosong "-"), bukan cuma siswa yang kebetulan
 * sudah dapat nilai -- diambil dari daftar siswa Master (getNisKeNamaMap),
 * bukan cuma dari yang ada di DataNilai.
 */
function getRekapNilaiKelasSaya(mapelListStr, kelasListStr) {
  const mapelList = mapelListStr.split(',').map(s => s.trim()).filter(s => s !== "");
  const kelasList = kelasListStr.split(',').map(s => s.trim()).filter(s => s !== "");

  const sheetsRekap = [];

  kelasList.forEach(kelas => {
    let ss;
    try {
      ss = getNilaiSs(kelas, todayISO());
    } catch (e) {
      return; // grup kelas ini belum punya spreadsheet nilai sama sekali -- lewati
    }

    const namaMap = getNisKeNamaMap(kelas);

    mapelList.forEach(mapel => {
      const sheetName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_");
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;

      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) return; // cuma header, belum ada kegiatan sama sekali

      // Kumpulkan daftar kegiatan (bakal jadi KOLOM di rekap), urut
      // berdasarkan tanggal kegiatan (bukan urutan input).
      const kegiatanList = [];
      for (let i = 1; i < data.length; i++) {
        if (!data[i][4]) continue; // baris rusak/kosong -- lewati
        let nilaiPerSiswa = {};
        try { nilaiPerSiswa = JSON.parse(data[i][8] || '{}'); } catch (e) { /* rusak -- anggap kosong */ }
        kegiatanList.push({
          nama: data[i][5],
          // PATCH BUG: sama seperti getKegiatanNilai() -- diformat dulu
          // jadi "yyyy-MM-dd", bukan objek Date mentah (kalau tidak,
          // header kolom Excel jadi tampil format Date.toString() yang
          // panjang & tidak rapi, mis. "Sun Jul 26 2026 00:00:00 GMT+0700...").
          tanggal: Utilities.formatDate(new Date(data[i][6]), ZONA_WAKTU_DIHARAPKAN, 'yyyy-MM-dd'),
          nilaiPerSiswa: nilaiPerSiswa
        });
      }
      if (kegiatanList.length === 0) return;
      // Format "yyyy-MM-dd" tetap bisa diurutkan sebagai string biasa
      // (urutan leksikografis = urutan kronologis untuk format ini),
      // jadi new Date(...) di sini masih valid & tidak perlu diubah.
      kegiatanList.sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));

      const headerRow = ["NIS", "NAMA SISWA"];
      kegiatanList.forEach(k => headerRow.push(k.nama + " (" + k.tanggal + ")"));

      const rows = [];
      Object.keys(namaMap).sort().forEach(nis => {
        const row = [nis, namaMap[nis]];
        kegiatanList.forEach(k => row.push(k.nilaiPerSiswa[nis] || "-"));
        rows.push(row);
      });

      const tabName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_").substring(0, 31);
      sheetsRekap.push({ tabName: tabName, headerRow: headerRow, rows: rows });
    });
  });

  if (sheetsRekap.length === 0) {
    return { success: false, message: "Belum ada data nilai untuk direkap." };
  }

  return { success: true, data: sheetsRekap };
}

// =========================================================
// TAHAP 4: RINGKASAN NILAI untuk Dashboard Per Mapel (digabung dengan
// tren absensi di js/dashboard.js -- lihat analisisTrenMapel() &
// buatSaranGabunganAbsenNilai() di sana)
// ---------------------------------------------------------
// HANYA kegiatan bertipe 'angka' yang dipakai untuk rata-rata & tren --
// kegiatan 'huruf' (A/B/C/D/E) TIDAK ikut dihitung di sini, karena
// skalanya beda dan tidak bisa dirata-rata bersama angka begitu saja
// tanpa konversi yang bisa menyesatkan. Ini keterbatasan yang disengaja,
// bukan bug -- kegiatan huruf tetap tersimpan & tetap muncul di Riwayat/
// Rekap seperti biasa, cuma tidak ikut ke ringkasan tren numerik ini.
//
// PATCH PEMULIHAN: fungsi ini sempat HILANG dari deploy (kemungkinan
// besar salah 1 revisi Nilai.gs yang diupload user tidak menyertakan
// perubahan Tahap 4 ini) -- ditemukan lewat audit menyeluruh, dipulihkan
// persis seperti rancangan aslinya.
// =========================================================

/**
 * Ringkasan nilai untuk semua kombinasi mapel+kelas yang diajar guru --
 * dipakai Dashboard Per Mapel untuk digabung dengan tren absensi.
 * Mengembalikan { rataRataKeseluruhan, jumlahKegiatanAngka,
 * turunNilai: [{ nis, kelas, nilaiAwal, nilaiAkhir }] }.
 *
 * "turunNilai" -- siswa yang rata-rata nilai PERTEMUAN AWALnya (separuh
 * pertama kegiatan angka, urut tanggal) dibanding PERTEMUAN AKHIRnya
 * (separuh kedua) turun >=5 poin. Ambang 5 poin (skala 0-100) dipilih
 * lebih besar dari ambang 3 poin di tren absensi (skala persen) --
 * variasi nilai tugas per tugas wajar lebih "berisik" daripada
 * persentase kehadiran, jadi ambang lebih besar mengurangi
 * kemungkinan menandai fluktuasi wajar sebagai "penurunan".
 */
function getRingkasanNilaiUntukDashboard(mapelListStr, kelasListStr) {
  const mapelList = mapelListStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  const kelasList = kelasListStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean);

  let totalNilai = 0;
  let totalTerhitung = 0;
  let jumlahKegiatanAngka = 0;
  const turunNilai = [];

  kelasList.forEach(function(kelas) {
    let ss;
    try {
      ss = getNilaiSs(kelas, todayISO());
    } catch (e) {
      return;
    }

    mapelList.forEach(function(mapel) {
      const sheetName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_");
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;

      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) return;

      // Kumpulkan HANYA kegiatan bertipe 'angka', urut tanggal.
      const kegiatanAngka = [];
      for (let i = 1; i < data.length; i++) {
        if (!data[i][4] || data[i][7] !== 'angka') continue;
        let nilaiPerSiswa = {};
        try { nilaiPerSiswa = JSON.parse(data[i][8] || '{}'); } catch (e) { /* rusak -- anggap kosong */ }
        kegiatanAngka.push({ tanggal: data[i][6], nilaiPerSiswa: nilaiPerSiswa });
      }
      if (kegiatanAngka.length === 0) return;
      kegiatanAngka.sort(function(a, b) { return new Date(a.tanggal) - new Date(b.tanggal); });
      jumlahKegiatanAngka += kegiatanAngka.length;

      // Rata-rata keseluruhan (semua nilai, semua siswa, semua kegiatan angka)
      kegiatanAngka.forEach(function(k) {
        Object.keys(k.nilaiPerSiswa).forEach(function(nis) {
          const n = parseFloat(k.nilaiPerSiswa[nis]);
          if (!isNaN(n)) { totalNilai += n; totalTerhitung++; }
        });
      });

      // Tren per siswa -- cuma dihitung kalau ada minimal 2 kegiatan
      // angka, supaya "sebelum vs sesudah" punya arti (1 kegiatan saja
      // tidak punya tren untuk dibandingkan).
      if (kegiatanAngka.length < 2) return;
      const tengah = Math.ceil(kegiatanAngka.length / 2);
      const paruhAwal = kegiatanAngka.slice(0, tengah);
      const paruhAkhir = kegiatanAngka.slice(tengah);

      const semuaNis = {};
      kegiatanAngka.forEach(function(k) { Object.keys(k.nilaiPerSiswa).forEach(function(nis) { semuaNis[nis] = true; }); });

      Object.keys(semuaNis).forEach(function(nis) {
        const nilaiAwal = rataRataNilaiSiswa_(paruhAwal, nis);
        const nilaiAkhir = rataRataNilaiSiswa_(paruhAkhir, nis);
        if (nilaiAwal === null || nilaiAkhir === null) return; // siswa ini tidak lengkap di salah satu paruh -- lewati, bukan salah paksa jadi 0
        if (nilaiAwal - nilaiAkhir >= 5) {
          turunNilai.push({ nis: nis, kelas: kelas, nilaiAwal: Math.round(nilaiAwal * 10) / 10, nilaiAkhir: Math.round(nilaiAkhir * 10) / 10 });
        }
      });
    });
  });

  return {
    success: true,
    data: {
      rataRataKeseluruhan: totalTerhitung > 0 ? Math.round((totalNilai / totalTerhitung) * 10) / 10 : null,
      jumlahKegiatanAngka: jumlahKegiatanAngka,
      turunNilai: turunNilai
    }
  };
}

// Rata-rata nilai 1 siswa dari sekumpulan kegiatan -- `null` kalau
// siswa itu TIDAK MUNCUL SAMA SEKALI di kumpulan itu (bukan 0, supaya
// tidak salah dianggap "nilai 0" padahal cuma belum dinilai/absen di
// kegiatan-kegiatan itu).
function rataRataNilaiSiswa_(kegiatanList, nis) {
  let total = 0;
  let jumlah = 0;
  kegiatanList.forEach(function(k) {
    const n = parseFloat(k.nilaiPerSiswa[nis]);
    if (!isNaN(n)) { total += n; jumlah++; }
  });
  return jumlah > 0 ? (total / jumlah) : null;
}
