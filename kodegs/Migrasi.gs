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
