// =========================================================
// MIGRASI (FUNGSI ONE-OFF / JARANG DIPAKAI)
// ---------------------------------------------------------
// Dipisah ke file sendiri karena hanya dijalankan manual saat
// migrasi data lama dari format "nama" ke format "NIS". Tidak
// dipanggil oleh alur aplikasi sehari-hari (doGet/doPost).
// =========================================================

function migrateAbsenNamaKeNis() {
  const ssAbsen = getAbsenSs();
  const ssMaster = getMasterSs();
  const sheets = ssAbsen.getSheets();
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
