// =========================================================
// TAHAP 2: DASHBOARD SEKOLAH (khusus role kepsek/admin/superadmin)
// ---------------------------------------------------------
// Read-only, cakupannya SELURUH sekolah -- bukan "kelas & mapel yang
// saya ajar" seperti dashboard guru biasa. Menyisir SEMUA grup absen
// (getAllAbsenSpreadsheets(), pola yang sama dipakai generateFullRecap()
// di Rekap.gs), TAPI HANYA tab absen harian Wali Kelas (mapel ===
// MAPEL_ABSEN_WALI, "Absen Harian") -- SENGAJA TIDAK digabung dengan
// absen per mata pelajaran, supaya gambarannya konsisten (kehadiran
// harian per kelas, 1 angka per siswa per hari), bukan tercampur data
// per-mapel yang lebih mikro & bisa bikin siswa yang sama terhitung
// berkali-kali di hari yang sama (1x per mapel + 1x absen harian).
//
// SENGAJA TIDAK ada tabel "Persentase Kehadiran per Kelas+Mapel" (beda
// dari dashboard Per Mapel guru) -- untuk seluruh sekolah itu bisa
// ratusan kombinasi sekaligus, tidak praktis ditampilkan 1 kartu per
// kombinasi. Juga TIDAK ada filter klik-kartu seperti dashboard Per
// Mapel. Cakupan Tahap 2 disepakati murni "dashboard & tren" dulu --
// rekap lebih detail untuk Kepsek disimpan untuk pembaruan berikutnya.
// =========================================================

function getDashboardSekolah() {
  // PATCH: sebelumnya rekapKelasMapel cuma dipakai INTERNAL untuk hitung
  // total gabungan, TIDAK PERNAH dikirim ke frontend (disengaja waktu
  // itu, lihat catatan lama). Sekarang diganti struktur agregasi PER
  // KELAS (aggPerKelas dkk di bawah) supaya rincian per kelas BISA
  // dikirim ke frontend -- dipakai untuk tabel daftar kelas + filter
  // klik-per-kelas di Ringkasan & Saran (mirip pola yang sudah ada di
  // Dashboard Per Mapel guru, cuma di sini kuncinya cuma "kelas" saja,
  // tidak perlu "kelas|mapel" karena Dashboard Sekolah memang cuma
  // pakai 1 jenis data -- Absen Harian Wali Kelas).
  let siswaStatusCount = {};              // gabungan SELURUH sekolah -- { "kelas|nis": {...} }
  let siswaStatusCountPerKelas = {};      // { kelas: { "kelas|nis": {...} } }
  let trendMap = {};                      // gabungan SELURUH sekolah -- { tanggal: {...} }
  let trendMapPerKelas = {};              // { kelas: { tanggal: {...} } }
  let aggPerKelas = {};                   // { kelas: {hadir, izin, sakit, alpa, pertemuan} }
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

      // Dashboard Sekolah SENGAJA cuma pakai data Wali Kelas (absen
      // harian), TIDAK digabung dengan absen per mata pelajaran -- lihat
      // penjelasan lengkap di komentar atas file ini.
      if (mapel !== MAPEL_ABSEN_WALI) return;

      if (!nisKeNamaCache[kelas]) nisKeNamaCache[kelas] = getNisKeNamaMap(kelas);
      if (!aggPerKelas[kelas]) aggPerKelas[kelas] = { hadir: 0, izin: 0, sakit: 0, alpa: 0, pertemuan: 0 };
      if (!trendMapPerKelas[kelas]) trendMapPerKelas[kelas] = {};
      if (!siswaStatusCountPerKelas[kelas]) siswaStatusCountPerKelas[kelas] = {};

      function catatStatus(strDaftar, jenisStatus) {
        if (!strDaftar) return;
        strDaftar.split(',').forEach(nis => {
          const nisTrim = nis.trim();
          if (!nisTrim) return;
          const keyGlobal = kelas + "|" + nisTrim;

          if (!siswaStatusCount[keyGlobal]) siswaStatusCount[keyGlobal] = { alpa: 0, izin: 0, sakit: 0 };
          siswaStatusCount[keyGlobal][jenisStatus]++;

          if (!siswaStatusCountPerKelas[kelas][keyGlobal]) siswaStatusCountPerKelas[kelas][keyGlobal] = { alpa: 0, izin: 0, sakit: 0 };
          siswaStatusCountPerKelas[kelas][keyGlobal][jenisStatus]++;
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

        aggPerKelas[kelas].hadir += hadirCount;
        aggPerKelas[kelas].izin += izinCount;
        aggPerKelas[kelas].sakit += sakitCount;
        aggPerKelas[kelas].alpa += alpaCount;
        aggPerKelas[kelas].pertemuan++;

        catatStatus(strAlpa, 'alpa');
        catatStatus(strIzin, 'izin');
        catatStatus(strSakit, 'sakit');

        if (!trendMap[tanggalStr]) trendMap[tanggalStr] = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
        trendMap[tanggalStr].hadir += hadirCount;
        trendMap[tanggalStr].izin += izinCount;
        trendMap[tanggalStr].sakit += sakitCount;
        trendMap[tanggalStr].alpa += alpaCount;

        if (!trendMapPerKelas[kelas][tanggalStr]) trendMapPerKelas[kelas][tanggalStr] = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
        trendMapPerKelas[kelas][tanggalStr].hadir += hadirCount;
        trendMapPerKelas[kelas][tanggalStr].izin += izinCount;
        trendMapPerKelas[kelas][tanggalStr].sakit += sakitCount;
        trendMapPerKelas[kelas][tanggalStr].alpa += alpaCount;
      }
    });
  });

  if (!adaData) {
    return { success: false, message: "Belum ada data absensi untuk ditampilkan." };
  }

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

  // PATCH: bangun rekapKelas (untuk tabel daftar kelas di frontend) &
  // perKelas (dipakai saat 1 baris kelas diklik, untuk filter Ringkasan
  // & Saran khusus kelas itu) -- keduanya BARU, sebelumnya sama sekali
  // tidak dikirim ke frontend.
  const rekapKelas = [];
  const perKelas = {};
  Object.keys(aggPerKelas).sort().forEach(function(kelas) {
    const agg = aggPerKelas[kelas];
    const total = agg.hadir + agg.izin + agg.sakit + agg.alpa;
    const persenHadir = total > 0 ? Math.round((agg.hadir / total) * 1000) / 10 : 0;
    rekapKelas.push({ kelas: kelas, persenHadir: persenHadir, pertemuan: agg.pertemuan });

    const perhatianKelas = bangunDaftarPerhatian(siswaStatusCountPerKelas[kelas], key => {
      const [, nis] = key.split("|");
      const nama = nisKeNamaCache[kelas][nis] || ("NIS " + nis);
      return { nama: nama, nis: nis, kelas: kelas };
    });

    const trendKelas = Object.keys(trendMapPerKelas[kelas])
      .sort((a, b) => new Date(a) - new Date(b))
      .map(tgl => {
        const d = trendMapPerKelas[kelas][tgl];
        const t = d.hadir + d.izin + d.sakit + d.alpa;
        const p = t > 0 ? Math.round((d.hadir / t) * 1000) / 10 : 0;
        return { tanggal: tgl, persenHadir: p };
      });

    perKelas[kelas] = {
      trend: trendKelas,
      perhatian: perhatianKelas,
      rataRata: hitungDistribusiPersen(agg),
      persenHadirKeseluruhan: persenHadir
    };
  });

  // Reuse fungsi bersama yang sama dengan dashboard guru (Dashboard.gs) --
  // bangunDaftarPerhatian() & hitungDistribusiPersen() sudah generik,
  // tidak perlu duplikasi logika di sini.
  const totalGabungan = Object.values(aggPerKelas).reduce((acc, item) => {
    acc.hadir += item.hadir; acc.izin += item.izin; acc.sakit += item.sakit; acc.alpa += item.alpa;
    return acc;
  }, { hadir: 0, izin: 0, sakit: 0, alpa: 0 });
  const rataRata = hitungDistribusiPersen(totalGabungan);
  const totalPertemuan = totalGabungan.hadir + totalGabungan.izin + totalGabungan.sakit + totalGabungan.alpa;
  const persenHadirKeseluruhan = totalPertemuan > 0 ? Math.round((totalGabungan.hadir / totalPertemuan) * 1000) / 10 : 0;

  return {
    success: true,
    data: {
      jumlahKombinasi: rekapKelas.length,
      persenHadirKeseluruhan,
      perhatian,
      trend,
      rataRata,
      rekapKelas,
      perKelas
    }
  };
}
