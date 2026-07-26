// =========================================================
// MIGRASI (FUNGSI ONE-OFF / JARANG DIPAKAI)
// ---------------------------------------------------------
// Dipisah ke file sendiri karena hanya dijalankan manual saat
// migrasi data lama dari format "nama" ke format "NIS". Tidak
// dipanggil oleh alur aplikasi sehari-hari (doGet/doPost).
// =========================================================

function migrateAbsenNamaKeNis() {
  // PATCH INTEGRASI: data siswa di spreadsheet Master Siswa terpisah.
  const ssMaster = getMasterSiswaSs();
  // PATCH SKALABILITAS: dulu 1 spreadsheet absen tunggal, sekarang
  // dipecah per grup angkatan+semester (lihat Config.gs) -- migrasi
  // one-off ini perlu jalan ke SEMUA grup yang sudah dikonfigurasi.
  const sheets = [];
  getAllAbsenSpreadsheets().forEach(function(grup) {
    grup.ss.getSheets().forEach(function(sheet) { sheets.push(sheet); });
  });
  const laporan = [];
  const masterMapCache = {};

  function getPetaKelas(kelas) {
    if (masterMapCache[kelas]) return masterMapCache[kelas];
    const sheet = ssMaster.getSheetByName(kelas);
    const namaKeNis = {};
    const duplikat = {};
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][1] !== "" && data[i][2] !== "") {
          const nama = data[i][2].toString().trim();
          const nis = String(data[i][1]);
          if (namaKeNis.hasOwnProperty(nama)) {
            duplikat[nama] = true;
          } else {
            namaKeNis[nama] = nis;
          }
        }
      }
    }
    masterMapCache[kelas] = { namaKeNis, duplikat };
    return masterMapCache[kelas];
  }

  let totalBarisDiubah = 0;

  sheets.forEach(sheet => {
    const sheetName = sheet.getName();
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    const kelas = data[1][3] ? String(data[1][3]).trim() : '';
    if (!kelas) return;
    const peta = getPetaKelas(kelas);

    const kolomStatus = [5, 6, 7, 8];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[4]) continue;

      kolomStatus.forEach(colIdx => {
        const isiAsli = (row[colIdx] || "").toString();
        const daftar = isiAsli.split(',').map(s => s.trim()).filter(s => s !== "");
        if (daftar.length === 0) return;

        const sudahNis = daftar.every(s => /^\d+$/.test(s));
        if (sudahNis) return;

        const hasil = daftar.map(nama => {
          if (peta.duplikat[nama]) {
            laporan.push('AMBIGU: sheet "' + sheetName + '" baris ' + (i + 1) + ' -- nama "' + nama + '" dobel di kelas ' + kelas);
            return "AMBIGU:" + nama;
          }
          const nis = peta.namaKeNis[nama];
          if (!nis) {
            laporan.push('TIDAK DITEMUKAN: sheet "' + sheetName + '" baris ' + (i + 1) + ' -- nama "' + nama + '" tidak ada di kelas ' + kelas);
            return "TIDAKDITEMUKAN:" + nama;
          }
          return nis;
        });

        sheet.getRange(i + 1, colIdx + 1).setValue(hasil.join(', '));
        totalBarisDiubah++;
      });
    }
  });

  const ringkasan = laporan.length > 0
    ? "Migrasi selesai. " + totalBarisDiubah + " sel diubah. Ada " + laporan.length + " catatan:\n" + laporan.join("\n")
    : "Migrasi selesai. " + totalBarisDiubah + " sel dikonversi.";

  Logger.log(ringkasan);
  return ringkasan;
}

// =========================================================
// PEMULIHAN DARURAT: absen mentah terhapus tidak sengaja,
// tapi rekap-nya (Rekap_Master_... atau Rekap_Backup_..._<tanggal>)
// masih ada di Drive.
// ---------------------------------------------------------
// Fungsi ini membaca 1 TAB dari file rekap tsb (isinya sudah dalam
// bentuk NIS, Nama, L/P, status H/I/S/A per tanggal pertemuan, total --
// lihat generateFullRecap() di Rekap.gs), lalu menulis ULANG baris-baris
// absen mentahnya lewat getAbsenSs()/getOrCreateSheet() -- JALUR YANG
// SAMA seperti submit absen biasa -- sehingga otomatis ter-provisioning
// ke spreadsheet grup yang benar (dibuatkan baru kalau memang belum ada).
//
// KETERBATASAN (bukan restore 100% identik ke kondisi semula):
//  - Kolom "Nama Guru" asli TIDAK tersimpan di rekap -> diisi placeholder
//    "Dipulihkan dari Rekap (otomatis)".
//  - Kolom "Timestamp" asli TIDAK tersimpan di rekap -> diisi waktu saat
//    pemulihan dijalankan, BUKAN waktu submit aslinya.
//  - Absen yang disubmit SETELAH rekap TERAKHIR kali jalan (trigger
//    mingguan, Sabtu 20:00 -- lihat Trigger.gs) tapi SEBELUM file
//    mentahnya terhapus TIDAK IKUT terpulihkan, karena datanya memang
//    belum sempat masuk ke rekap manapun. Kalau ada beberapa
//    Rekap_Backup dengan tanggal berbeda untuk sheet yang sama, pakai
//    yang PALING BARU supaya kehilangan datanya paling minim.
//
// CARA PAKAI -- jalankan manual 1x dari editor Apps Script. Kelas & mapel
// WAJIB diisi eksplisit (TIDAK ditebak otomatis dari nama tab), karena
// nama tab "XI_DKV_1_DKV" ambigu untuk dipisah balik jadi kelas "XI DKV 1"
// + mapel "DKV" secara otomatis dengan aman:
//
//   pulihkanAbsenDariRekap({
//     spreadsheetIdRekap: 'ID_SPREADSHEET_REKAP_MASTER_ATAU_BACKUP',
//     namaSheetDiRekap: 'XI_DKV_1_DKV',   // nama tab PERSIS di file rekap
//     kelas: 'XI DKV 1',
//     mapel: 'DKV'
//   });
// =========================================================
function pulihkanAbsenDariRekap(opsi) {
  const ssRekap = SpreadsheetApp.openById(opsi.spreadsheetIdRekap);
  const sheet = ssRekap.getSheetByName(opsi.namaSheetDiRekap);
  if (!sheet) {
    throw new Error('Sheet "' + opsi.namaSheetDiRekap + '" tidak ditemukan di spreadsheet rekap tersebut -- cek lagi nama tab-nya persis seperti apa di file rekap.');
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return 'Sheet rekap kosong, tidak ada yang dipulihkan.';

  const header = data[0];
  const KOLOM_TANGGAL_MULAI = 3; // 0=NIS, 1=NAMA SISWA, 2=L/P
  const kolomTanggalAkhir = header.length - 4; // 4 kolom terakhir = JML HADIR/IZIN/SAKIT/ALPA

  // Header kolom tanggal formatnya "dd/MM/yyyy" polos (absen harian wali
  // kelas) ATAU "PERTEMUAN N\n(dd/MM/yyyy)" (absen per mapel) -- keduanya
  // mengandung pola dd/MM/yyyy, jadi cukup 1 regex untuk keduanya.
  const tanggalPerKolom = [];
  for (let c = KOLOM_TANGGAL_MULAI; c < kolomTanggalAkhir; c++) {
    const h = String(header[c] || '');
    const m = h.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    tanggalPerKolom.push(m ? (m[3] + '-' + m[2] + '-' + m[1]) : null); // -> yyyy-MM-dd
  }

  // Kumpulkan NIS per status per tanggal (invers dari tabel rekap: rekap
  // 1 baris = 1 siswa lintas semua tanggal; absen mentah 1 baris = 1
  // tanggal lintas semua siswa).
  const perTanggal = {}; // { "yyyy-MM-dd": {H:[], I:[], S:[], A:[]} }
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const nis = String(row[0] || '').trim();
    if (!nis) continue;
    for (let c = 0; c < tanggalPerKolom.length; c++) {
      const tgl = tanggalPerKolom[c];
      if (!tgl) continue;
      const status = String(row[KOLOM_TANGGAL_MULAI + c] || '').trim().toUpperCase();
      if (!['H', 'I', 'S', 'A'].includes(status)) continue; // "-" (belum diabsen) dilewati
      if (!perTanggal[tgl]) perTanggal[tgl] = { H: [], I: [], S: [], A: [] };
      perTanggal[tgl][status].push(nis);
    }
  }

  const waktuPemulihan = new Date();
  let jumlahDipulihkan = 0;

  Object.keys(perTanggal).sort().forEach(function(tgl) {
    const s = perTanggal[tgl];
    const ssTujuan = getAbsenSs(opsi.kelas, tgl); // auto-provision kalau grupnya belum ada
    const sheetNameTujuan = (opsi.kelas + "_" + opsi.mapel).replace(/[^a-zA-Z0-9]/g, "_");
    const sheetTujuan = getOrCreateSheet(ssTujuan, sheetNameTujuan);

    const rowData = [
      waktuPemulihan,
      'Dipulihkan dari Rekap (otomatis)',
      opsi.mapel,
      opsi.kelas,
      tgl,
      s.H.join(', '),
      s.I.join(', '),
      s.S.join(', '),
      s.A.join(', ')
    ];
    sheetTujuan.appendRow(rowData);
    jumlahDipulihkan++;
  });

  const ringkasan = 'Berhasil memulihkan ' + jumlahDipulihkan + ' baris absen (per tanggal pertemuan) untuk kelas "' + opsi.kelas + '" mapel "' + opsi.mapel + '", dari sheet "' + opsi.namaSheetDiRekap + '" di file rekap tsb.';
  Logger.log(ringkasan);
  return ringkasan;
}

// =========================================================
// IMPOR MASSAL: absen 2 minggu pertama masih berbentuk kertas, mau
// dipindahkan cepat lewat template Excel/Sheets (1 baris = 1 siswa,
// kolom = tanggal pertemuan, isi H/I/S/A) -- BUKAN diketik satu-satu
// lewat aplikasi.
// ---------------------------------------------------------
// ASUMSI STRUKTUR TEMPLATE (sesuai contoh yang sudah dibuat):
//   Baris 1, kolom A: "Mata Pelajaran"   | kolom D: isi mata pelajaran
//   Baris 2, kolom A: "Kelas"            | kolom D: isi kelas (mis. "XI DKV 1")
//   Ada baris berlabel "TGL" di kolom E, tanggal-tanggal mulai kolom F
//     dst, format "dd/MM/yy" (mis. "13/07/26")
//   Baris-baris siswa (di bawah baris TGL): kolom B = NIS, kolom F dst =
//     status H/I/S/A per tanggal (searah kolom tanggal di baris TGL)
//
// Kalau kolom Mata Pelajaran di template masih kosong (sering terjadi
// kalau 1 template dipakai generik untuk banyak mapel), WAJIB diisi
// lewat parameter `mapelOverride`.
//
// AMAN DIJALANKAN BERULANG (idempotent): sama seperti submit absen
// normal, untuk tanggal yang SUDAH ada baitknya di spreadsheet tujuan,
// baris itu di-UPDATE, bukan ditambah baris duplikat -- jadi kalau
// import ini kepencet 2x tidak sengaja, atau perlu re-run setelah
// membetulkan template, hasilnya tetap benar.
//
// CARA PAKAI:
//   1) Upload file Excel-nya ke Drive, klik kanan > Buka dengan >
//      Google Sheets (supaya bisa dibaca SpreadsheetApp -- fungsi ini
//      TIDAK bisa baca file .xlsx mentah langsung dari Drive).
//   2) Jalankan manual dari editor Apps Script:
//        importAbsenDariTemplateManual({
//          spreadsheetId: 'ID_FILE_SETELAH_DIKONVERSI_KE_GOOGLE_SHEETS',
//          namaSheet: 'Sheet3',
//          mapelOverride: 'DKV'   // isi kalau kolom Mata Pelajaran kosong
//        });
//
// UNTUK GURU YANG MENGAJAR BEBERAPA MAPEL DI BEBERAPA KELAS (mis. mapel
// DKV & KIK, di kelas XI DKV 1/4 dan XII DKV 3/4): siapkan 1 FILE Google
// Sheets berisi BEBERAPA TAB, 1 tab per kombinasi kelas+mapel (isi kolom
// Mata Pelajaran & Kelas di tiap tab sesuai kombinasinya masing-masing),
// lalu proses semuanya SEKALIGUS lewat importAbsenDariTemplateManualBatch()
// di bawah -- lihat contoh pemakaiannya di komentar fungsi itu.
// =========================================================
function importAbsenDariTemplateManual(opsi) {
  const ss = SpreadsheetApp.openById(opsi.spreadsheetId);
  return _importAbsenDariTemplateManualSatuSheet(ss, opsi.namaSheet, opsi.mapelOverride);
}

/**
 * Proses BEBERAPA tab kelas+mapel sekaligus dalam 1 file yang sama --
 * cocok untuk 1 guru yang mengajar banyak kombinasi kelas+mapel, supaya
 * tidak perlu panggil importAbsenDariTemplateManual() satu-satu.
 *
 * Kalau `daftarSheet` tidak diisi, SEMUA tab di file itu diproses (kolom
 * Mata Pelajaran WAJIB terisi sendiri di tiap tab, karena tidak ada
 * override global untuk banyak tab sekaligus). Kalau `daftarSheet` diisi,
 * hanya tab yang disebutkan yang diproses, dan boleh kasih
 * `mapelOverride` per tab kalau kolom Mata Pelajaran-nya masih kosong.
 *
 * Contoh untuk skenario 1 guru, mapel DKV & KIK, 4 kelas:
 *   importAbsenDariTemplateManualBatch({
 *     spreadsheetId: 'ID_FILE_GABUNGAN',
 *     daftarSheet: [
 *       { namaSheet: 'XI_DKV_1_DKV' },              // Mata Pelajaran sudah terisi "DKV" di tab ini
 *       { namaSheet: 'XI_DKV_4_DKV' },
 *       { namaSheet: 'XII_DKV_3_KIK', mapelOverride: 'KIK' }, // kolom Mata Pelajaran kosong -> override
 *       { namaSheet: 'XII_DKV_4_KIK', mapelOverride: 'KIK' }
 *     ]
 *   });
 *
 * Hasilnya 1 laporan gabungan per tab (berhasil / gagal & alasannya),
 * jadi 1x jalan langsung kelihatan semua kombinasi kelas+mapel yang
 * berhasil diimpor tanpa perlu cek log satu-satu.
 */
function importAbsenDariTemplateManualBatch(opsi) {
  const ss = SpreadsheetApp.openById(opsi.spreadsheetId);
  const daftarSheet = (opsi.daftarSheet && opsi.daftarSheet.length > 0)
    ? opsi.daftarSheet
    : ss.getSheets().map(function(s) { return { namaSheet: s.getName() }; });

  const hasil = [];
  daftarSheet.forEach(function(item) {
    try {
      const ringkasan = _importAbsenDariTemplateManualSatuSheet(ss, item.namaSheet, item.mapelOverride);
      hasil.push('[OK] ' + item.namaSheet + ' -- ' + ringkasan);
    } catch (e) {
      hasil.push('[GAGAL] ' + item.namaSheet + ' -- ' + e.message);
    }
  });

  const laporan = hasil.join('\n');
  Logger.log(laporan);
  return laporan;
}

// Logika inti 1 tab, dipakai bersama oleh importAbsenDariTemplateManual()
// (1 tab) maupun importAbsenDariTemplateManualBatch() (banyak tab).
function _importAbsenDariTemplateManualSatuSheet(ss, namaSheet, mapelOverride) {
  const sheet = ss.getSheetByName(namaSheet);
  if (!sheet) throw new Error('Sheet "' + namaSheet + '" tidak ditemukan di spreadsheet tsb.');

  const data = sheet.getDataRange().getValues();

  // Baris 1 (index 0) kolom D (index 3) = Mata Pelajaran;
  // Baris 2 (index 1) kolom D (index 3) = Kelas -- sesuai template.
  const mapel = (mapelOverride || String(data[0][3] || '')).trim();
  const kelas = String(data[1][3] || '').trim();
  if (!mapel) throw new Error('Mata Pelajaran kosong di template (baris 1 kolom D) dan mapelOverride juga tidak diisi.');
  if (!kelas) throw new Error('Kelas kosong di template (baris 2 kolom D) -- cek lagi templatenya.');

  // Cari baris berlabel "TGL" di kolom E (index 4) -- baris tanggal
  // sekaligus penanda baris data siswa dimulai SETELAHNYA.
  let barisTanggal = -1;
  for (let r = 0; r < data.length; r++) {
    if (String(data[r][4] || '').trim().toUpperCase() === 'TGL') { barisTanggal = r; break; }
  }
  if (barisTanggal === -1) {
    throw new Error('Baris berlabel "TGL" tidak ditemukan di kolom E -- cek lagi struktur templatenya.');
  }

  const KOLOM_TANGGAL_MULAI = 5; // kolom F (index 5), sesuai template
  const tanggalPerKolom = [];
  for (let c = KOLOM_TANGGAL_MULAI; c < data[barisTanggal].length; c++) {
    const raw = data[barisTanggal][c];
    if (!raw) { tanggalPerKolom.push(null); continue; }
    // Format tanggal di template "dd/MM/yy" (2 digit tahun, mis. "13/07/26").
    // Asumsi semua tahun 20xx -- cukup untuk konteks tahun ajaran sekarang.
    const m = String(raw).trim().match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    tanggalPerKolom.push(m ? ((2000 + parseInt(m[3], 10)) + '-' + m[2] + '-' + m[1]) : null);
  }

  // Kumpulkan NIS per status per tanggal (invers dari tabel: template
  // 1 baris = 1 siswa lintas semua tanggal; absen mentah 1 baris = 1
  // tanggal lintas semua siswa).
  const perTanggal = {}; // { "yyyy-MM-dd": {H:[], I:[], S:[], A:[]} }
  for (let r = barisTanggal + 1; r < data.length; r++) {
    const row = data[r];
    const nis = String(row[1] || '').trim(); // kolom B
    if (!nis) continue;
    for (let c = 0; c < tanggalPerKolom.length; c++) {
      const tgl = tanggalPerKolom[c];
      if (!tgl) continue;
      const status = String(row[KOLOM_TANGGAL_MULAI + c] || '').trim().toUpperCase();
      if (!['H', 'I', 'S', 'A'].includes(status)) continue; // sel kosong/lainnya dilewati
      if (!perTanggal[tgl]) perTanggal[tgl] = { H: [], I: [], S: [], A: [] };
      perTanggal[tgl][status].push(nis);
    }
  }

  const waktuImpor = new Date();
  let jumlahDiimpor = 0;

  Object.keys(perTanggal).sort().forEach(function(tgl) {
    const s = perTanggal[tgl];
    const ssTujuan = getAbsenSs(kelas, tgl); // auto-provision kalau grupnya belum ada
    const sheetNameTujuan = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_");
    const sheetTujuan = getOrCreateSheet(ssTujuan, sheetNameTujuan);


    // Sama seperti handleSubmit() di Absensi.gs: cari dulu baris tanggal
    // yang sudah ada, UPDATE kalau ketemu, APPEND kalau belum -- supaya
    // aman dijalankan berulang tanpa bikin baris duplikat.
    const existing = sheetTujuan.getDataRange().getValues();
    let targetRow = -1;
    for (let i = 1; i < existing.length; i++) {
      if (existing[i][4] && isDateMatch(existing[i][4], tgl)) { targetRow = i + 1; break; }
    }

    const nilaiBaru = [s.H.join(', '), s.I.join(', '), s.S.join(', '), s.A.join(', ')];
    if (targetRow !== -1) {
      sheetTujuan.getRange(targetRow, 1).setValue(waktuImpor);
      sheetTujuan.getRange(targetRow, 6, 1, 4).setValues([nilaiBaru]);
    } else {
      sheetTujuan.appendRow([waktuImpor, 'Impor Manual (Hard Copy)', mapel, kelas, tgl].concat(nilaiBaru));
    }
    jumlahDiimpor++;
  });

  const ringkasan = 'Berhasil impor ' + jumlahDiimpor + ' baris absen (tanggal pertemuan) untuk kelas "' + kelas + '" mapel "' + mapel + '".';
  Logger.log(ringkasan);
  return ringkasan;
}
