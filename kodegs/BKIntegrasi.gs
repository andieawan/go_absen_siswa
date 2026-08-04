/**
 * BKIntegrasi.gs
 * File BARU -- tambahkan ke project go_absen_siswa (paste sebagai file
 * terpisah di Apps Script Editor). Menyediakan 1 action read-only untuk
 * Aplikasi Manajemen BK: rekap Alpa/Izin/Sakit/Hadir per siswa di 1 kelas,
 * dipakai fitur "Presensi & Keterlambatan" BK (KHUSUS Alpa -- "Telat"
 * belum tercatat di sistem ini, sesuai keputusan: dicek manual terpisah
 * oleh BK, tidak lewat integrasi ini).
 *
 * Reuse getRekapKelasSaya() (Rekap.gs) yang sudah ada, mapel diarahkan ke
 * MAPEL_ABSEN_WALI ("Absen Harian") -- data yang sama dengan yang dipakai
 * fitur Rekap Absen Wali Kelas, bukan duplikasi logika baru.
 */
function getAbsenUntukBK(kelas) {
  const hasil = getRekapKelasSaya(MAPEL_ABSEN_WALI, kelas);
  if (!hasil.success) return []; // belum ada data absensi wali kelas ini -- bukan error, cukup kosong

  const sheetRekap = hasil.data[0]; // hanya 1 kelas + 1 mapel diminta, jadi maksimal 1 entri
  if (!sheetRekap) return [];

  // rows: [nis, nama, jk, ...tanggal-tanggal, jmlHadir, jmlIzin, jmlSakit, jmlAlpa]
  // 4 kolom terakhir SELALU hadir/izin/sakit/alpa sesuai formatRecapSheet()
  // di Rekap.gs -- lihat headerRow yang dibangun di getRekapKelasSaya().
  return sheetRekap.rows.map(function (row) {
    const n = row.length;
    return {
      nis: row[0],
      nama: row[1],
      jumlahHadir: row[n - 4],
      jumlahIzin: row[n - 3],
      jumlahSakit: row[n - 2],
      jumlahAlpa: row[n - 1]
    };
  });
}
