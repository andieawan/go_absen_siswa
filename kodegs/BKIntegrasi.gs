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

/**
 * Simpan absensi manual 1 kelas untuk 1 tanggal, dipanggil dari
 * Aplikasi Manajemen BK (fitur "Presensi & Keterlambatan" -- BK mengisi
 * absen manual, mis. hasil kunjungan langsung ke kelas).
 *
 * TIDAK menduplikasi logika penyimpanan -- murni pembungkus tipis di
 * atas simpanAbsenWali() (AbsenWali.gs) yang SUDAH ADA & SUDAH TERUJI
 * (validasi NIS terdaftar & status H/I/S/A, penguncian LockService
 * cegah race condition, pola cari-baris-tanggal-lalu-update-atau-
 * append). Data BK masuk KE SHEET YANG SAMA dengan absen harian wali
 * kelas biasa (MAPEL_ABSEN_WALI = "Absen Harian") -- supaya tetap 1
 * SUMBER KEBENARAN, bukan disimpan terpisah di data BK sendiri (sesuai
 * prinsip arsitektur yang sudah disepakati).
 *
 * Parameter `pengirim` diisi "BK (Manual)" -- beda dari default "Wali
 * Kelas" -- supaya baris yang diisi BK punya JEJAK AUDIT jelas di
 * kolom "Nama Guru" pada sheet mentah, bisa dibedakan dari input wali
 * kelas biasa (atau delegasi Ketua Kelas) kalau nanti perlu ditelusuri.
 *
 * `dataKehadiran`: [{ nis, status }], status salah satu dari H/I/S/A --
 * format ini SAMA PERSIS dengan yang sudah diterima simpanAbsenWali(),
 * TIDAK perlu konversi apa pun.
 */
function simpanAbsenUntukBK(kelas, tanggal, dataKehadiran) {
  return simpanAbsenWali(kelas, tanggal, dataKehadiran, "BK (Manual)");
}
