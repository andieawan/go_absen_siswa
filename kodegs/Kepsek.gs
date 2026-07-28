// =========================================================
// TAHAP 2: DASHBOARD SEKOLAH (khusus role kepsek/admin/superadmin)
// ---------------------------------------------------------
// Read-only, cakupannya SELURUH sekolah -- bukan "kelas & mapel yang
// saya ajar" seperti dashboard guru biasa. Menyisir SEMUA grup absen
// (getAllAbsenSpreadsheets(), pola yang sama dipakai generateFullRecap()
// di Rekap.gs) dan SEMUA tab di dalamnya, lalu mengagregasi hasilnya.
//
// SENGAJA TIDAK ada tabel "Persentase Kehadiran per Kelas+Mapel" (beda
// dari dashboard Per Mapel guru) -- untuk seluruh sekolah itu bisa
// ratusan kombinasi sekaligus, tidak praktis ditampilkan 1 kartu per
// kombinasi. Juga TIDAK ada filter klik-kartu seperti dashboard Per
// Mapel. Cakupan Tahap 2 disepakati murni "dashboard & tren" dulu --
// rekap lebih detail untuk Kepsek disimpan untuk pembaruan berikutnya.
// =========================================================

function getDashboardSekolah() {
  let rekapKelasMapel = []; // dipakai internal untuk hitung total gabungan & perhatian, TIDAK dikirim ke frontend
  let siswaStatusCount = {}; // { "kelas|nis": {alpa, izin, sakit} }
  let trendMap = {};
  const nisKeNamaCache = {};
  let adaData = false;

  getAllAbsenSpreadsheets().forEach(function(grup) {
    grup.ss.getSheets().forEach(function(sheet) {
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) return;

      // Ambil kelas & mapel dari ISI baris data (kolom C & D), BUKAN dari
      // nama tab -- sama seperti generateFullRecap() di Rekap.gs, karena
      // nama tab "XI_DKV_1_DKV" ambigu untuk dipisah balik jadi kelas+mapel
      // dengan aman (lihat catatan yang sama di fungsi itu).
      const mapel = data[1][2];
      const kelas = data[1][3];
      if (!kelas || !mapel) return;

      if (!nisKeNamaCache[kelas]) nisKeNamaCache[kelas] = getNisKeNamaMap(kelas);

      let agg = { hadir: 0, izin: 0, sakit: 0, alpa: 0, pertemuan: 0 };

      function catatStatus(strDaftar, jenisStatus) {
        if (!strDaftar) return;
        strDaftar.split(',').forEach(nis => {
          const nisTrim = nis.trim();
          if (!nisTrim) return;
          const keyGlobal = kelas + "|" + nisTrim;
          if (!siswaStatusCount[keyGlobal]) siswaStatusCount[keyGlobal] = { alpa: 0, izin: 0, sakit: 0 };
          siswaStatusCount[keyGlobal][jenisStatus]++;
        });
      }

      for (let i = 1; i < data.length; i++) {
        const rawDate = data[i][4];
        if (!rawDate) continue;
        adaData = true;

        const tanggalStr = Utilities.formatDate(new Date(rawDate), "GMT+7", "yyyy-MM-dd");
        const strHadir = String(data[i][5] || "");
        const strIzin = String(data[i][6] || "");
        const strSakit = String(data[i][7] || "");
        const strAlpa = String(data[i][8] || "");

        const hadirCount = strHadir ? strHadir.split(',').length : 0;
        const izinCount = strIzin ? strIzin.split(',').length : 0;
        const sakitCount = strSakit ? strSakit.split(',').length : 0;
        const alpaCount = strAlpa ? strAlpa.split(',').length : 0;

        agg.hadir += hadirCount;
        agg.izin += izinCount;
        agg.sakit += sakitCount;
        agg.alpa += alpaCount;
        agg.pertemuan++;

        catatStatus(strAlpa, 'alpa');
        catatStatus(strIzin, 'izin');
        catatStatus(strSakit, 'sakit');

        if (!trendMap[tanggalStr]) trendMap[tanggalStr] = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
        trendMap[tanggalStr].hadir += hadirCount;
        trendMap[tanggalStr].izin += izinCount;
        trendMap[tanggalStr].sakit += sakitCount;
        trendMap[tanggalStr].alpa += alpaCount;
      }

      const total = agg.hadir + agg.izin + agg.sakit + agg.alpa;
      const persenHadir = total > 0 ? Math.round((agg.hadir / total) * 1000) / 10 : 0;
      rekapKelasMapel.push({ kelas, mapel, hadir: agg.hadir, izin: agg.izin, sakit: agg.sakit, alpa: agg.alpa, persenHadir });
    });
  });

  if (!adaData) {
    return { success: false, message: "Belum ada data absensi untuk ditampilkan." };
  }

  // Reuse fungsi bersama yang sama dengan dashboard guru (Dashboard.gs) --
  // bangunDaftarPerhatian() & hitungDistribusiPersen() sudah generik,
  // tidak perlu duplikasi logika di sini.
  const perhatian = bangunDaftarPerhatian(siswaStatusCount, key => {
    const [kelasKey, nis] = key.split("|");
    if (!nisKeNamaCache[kelasKey]) nisKeNamaCache[kelasKey] = getNisKeNamaMap(kelasKey);
    const nama = nisKeNamaCache[kelasKey][nis] || ("NIS " + nis);
    return { nama: nama + " (" + kelasKey + ")", nis: nis, kelas: kelasKey };
  });

  const trend = Object.keys(trendMap)
    .sort((a, b) => new Date(a) - new Date(b))
    .map(tgl => {
      const d = trendMap[tgl];
      const total = d.hadir + d.izin + d.sakit + d.alpa;
      const persenHadir = total > 0 ? Math.round((d.hadir / total) * 1000) / 10 : 0;
      return { tanggal: tgl, persenHadir: persenHadir };
    });

  const totalGabungan = rekapKelasMapel.reduce((acc, item) => {
    acc.hadir += item.hadir; acc.izin += item.izin; acc.sakit += item.sakit; acc.alpa += item.alpa;
    return acc;
  }, { hadir: 0, izin: 0, sakit: 0, alpa: 0 });
  const rataRata = hitungDistribusiPersen(totalGabungan);
  const totalPertemuan = totalGabungan.hadir + totalGabungan.izin + totalGabungan.sakit + totalGabungan.alpa;
  const persenHadirKeseluruhan = totalPertemuan > 0 ? Math.round((totalGabungan.hadir / totalPertemuan) * 1000) / 10 : 0;

  return {
    success: true,
    data: {
      jumlahKombinasi: rekapKelasMapel.length,
      persenHadirKeseluruhan,
      perhatian,
      trend,
      rataRata
    }
  };
}
