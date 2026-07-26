// =========================================================
// DASHBOARD ANALITIK
// =========================================================

// Hitung distribusi persen H/I/S/A dari objek jumlah mentah {hadir,
// izin, sakit, alpa}. Dipakai bersama oleh dashboard Wali Kelas (rataRata
// keseluruhan kelas) dan dashboard Per Mapel (rataRata gabungan & per
// kombinasi kelas+mapel) -- format hasilnya SAMA supaya bisa dirender
// pakai fungsi frontend yang sama (renderDistribusiStatus() di
// js/dashboard.js).
function hitungDistribusiPersen(jumlah) {
  const total = (jumlah.hadir || 0) + (jumlah.izin || 0) + (jumlah.sakit || 0) + (jumlah.alpa || 0);
  if (total === 0) return { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
  return {
    hadir: Math.round((jumlah.hadir / total) * 1000) / 10,
    izin: Math.round((jumlah.izin / total) * 1000) / 10,
    sakit: Math.round((jumlah.sakit / total) * 1000) / 10,
    alpa: Math.round((jumlah.alpa / total) * 1000) / 10
  };
}

// --- DASHBOARD (per mapel) ---
function getDashboardData(mapelListStr, kelasListStr) {
  let mapelList = mapelListStr.split(',').map(s => s.trim()).filter(s => s !== "");
  let kelasList = kelasListStr.split(',').map(s => s.trim()).filter(s => s !== "");
  // PATCH SKALABILITAS: dulu 1 `ss` dipakai untuk semua kelas. Sekarang
  // tiap kelas bisa ada di grup (angkatan+semester) spreadsheet yang
  // berbeda, jadi ss diambil PER KELAS di dalam loop, pakai grup
  // semester HARI INI (dashboard menampilkan data terkini).
  const tglHariIni = todayISO();

  let rekapKelasMapel = [];
  let siswaAlpaCount = {};
  let trendMap = {};
  let perKombinasi = {}; // BARU: breakdown tren & top-alpa PER kelas+mapel,
                          // dipakai frontend saat 1 kartu "Persentase
                          // Kehadiran (Per Mapel)" diklik.
  let adaData = false;
  let nisKeNamaCache = {};

  kelasList.forEach(kelas => {
    let ss;
    try {
      ss = getAbsenSs(kelas, tglHariIni);
    } catch (e) {
      // Grup untuk kelas ini belum dikonfigurasi (lihat Config.gs) --
      // lewati saja supaya kelas lain yang sudah siap tetap tampil,
      // daripada seluruh dashboard gagal karena 1 kelas belum di-setup.
      return;
    }
    if (!nisKeNamaCache[kelas]) nisKeNamaCache[kelas] = getNisKeNamaMap(kelas);
    const namaMapKelasIni = nisKeNamaCache[kelas];

    mapelList.forEach(mapel => {
      let sheetName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_");
      let sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;

      let data = sheet.getDataRange().getValues();
      if (data.length <= 1) return;

      let agg = { hadir: 0, izin: 0, sakit: 0, alpa: 0, pertemuan: 0 };
      const trendMapKombinasi = {};
      const siswaAlpaCountKombinasi = {};

      for (let i = 1; i < data.length; i++) {
        let rawDate = data[i][4];
        if (!rawDate) continue;
        adaData = true;

        let tanggalStr = Utilities.formatDate(new Date(rawDate), "GMT+7", "yyyy-MM-dd");

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

        if (strAlpa) {
          strAlpa.split(',').forEach(nis => {
            const nisTrim = nis.trim();
            if (!nisTrim) return;
            let key = kelas + "|" + nisTrim;
            siswaAlpaCount[key] = (siswaAlpaCount[key] || 0) + 1;
            siswaAlpaCountKombinasi[nisTrim] = (siswaAlpaCountKombinasi[nisTrim] || 0) + 1;
          });
        }

        if (!trendMap[tanggalStr]) trendMap[tanggalStr] = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
        trendMap[tanggalStr].hadir += hadirCount;
        trendMap[tanggalStr].izin += izinCount;
        trendMap[tanggalStr].sakit += sakitCount;
        trendMap[tanggalStr].alpa += alpaCount;

        if (!trendMapKombinasi[tanggalStr]) trendMapKombinasi[tanggalStr] = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
        trendMapKombinasi[tanggalStr].hadir += hadirCount;
        trendMapKombinasi[tanggalStr].izin += izinCount;
        trendMapKombinasi[tanggalStr].sakit += sakitCount;
        trendMapKombinasi[tanggalStr].alpa += alpaCount;
      }

      let total = agg.hadir + agg.izin + agg.sakit + agg.alpa;
      let persenHadir = total > 0 ? Math.round((agg.hadir / total) * 1000) / 10 : 0;

      rekapKelasMapel.push({
        label: kelas + " - " + mapel,
        kelas: kelas,
        mapel: mapel,
        hadir: agg.hadir, izin: agg.izin, sakit: agg.sakit, alpa: agg.alpa,
        pertemuan: agg.pertemuan, persenHadir: persenHadir
      });

      const topAlpaKombinasi = Object.keys(siswaAlpaCountKombinasi)
        .map(nis => ({
          nama: (namaMapKelasIni[nis] || ("NIS " + nis)) + " (" + kelas + ")",
          jumlahAlpa: siswaAlpaCountKombinasi[nis]
        }))
        .sort((a, b) => b.jumlahAlpa - a.jumlahAlpa)
        .slice(0, 10);

      const trendKombinasi = Object.keys(trendMapKombinasi)
        .sort((a, b) => new Date(a) - new Date(b))
        .map(tgl => {
          const d = trendMapKombinasi[tgl];
          const t = d.hadir + d.izin + d.sakit + d.alpa;
          const p = t > 0 ? Math.round((d.hadir / t) * 1000) / 10 : 0;
          return { tanggal: tgl, persenHadir: p };
        });

      // Kunci "kelas|mapel" -- dipakai frontend saat kartu diklik. Pemisah
      // "|" dipilih karena tidak mungkin muncul di nama kelas/mapel biasa
      // (beda dengan "_" yang justru sering muncul di nama kelas/mapel).
      perKombinasi[kelas + "|" + mapel] = {
        trend: trendKombinasi,
        topAlpa: topAlpaKombinasi,
        // BARU: distribusi H/I/S/A (persen) khusus kombinasi ini -- format
        // sama seperti `rataRata` di getDashboardDataWali(), supaya bisa
        // dirender pakai fungsi renderDistribusiStatus() yang sama.
        rataRata: hitungDistribusiPersen(agg)
      };
    });
  });

  if (!adaData) {
    return { success: false, message: "Belum ada data absensi untuk ditampilkan." };
  }

  let topAlpa = Object.keys(siswaAlpaCount)
    .map(k => {
      let [kelasKey, nis] = k.split("|");
      if (!nisKeNamaCache[kelasKey]) nisKeNamaCache[kelasKey] = getNisKeNamaMap(kelasKey);
      let nama = nisKeNamaCache[kelasKey][nis] || ("NIS " + nis);
      return { nama: nama + " (" + kelasKey + ")", jumlahAlpa: siswaAlpaCount[k] };
    })
    .sort((a, b) => b.jumlahAlpa - a.jumlahAlpa)
    .slice(0, 10);

  let trend = Object.keys(trendMap)
    .sort((a, b) => new Date(a) - new Date(b))
    .map(tgl => {
      let d = trendMap[tgl];
      let total = d.hadir + d.izin + d.sakit + d.alpa;
      let persenHadir = total > 0 ? Math.round((d.hadir / total) * 1000) / 10 : 0;
      return { tanggal: tgl, persenHadir: persenHadir };
    });

  // Distribusi H/I/S/A gabungan -- jumlahkan hadir/izin/sakit/alpa dari
  // SEMUA kombinasi kelas+mapel (sudah tersimpan per item di
  // rekapKelasMapel), lalu hitung persentasenya lewat fungsi yang sama
  // dipakai per kombinasi -- supaya format & pembulatannya konsisten.
  const totalGabungan = rekapKelasMapel.reduce((acc, item) => {
    acc.hadir += item.hadir; acc.izin += item.izin; acc.sakit += item.sakit; acc.alpa += item.alpa;
    return acc;
  }, { hadir: 0, izin: 0, sakit: 0, alpa: 0 });
  const rataRata = hitungDistribusiPersen(totalGabungan);

  return { success: true, data: { rekapKelasMapel, topAlpa, trend, perKombinasi, rataRata } };
}

// =========================================================
// DASHBOARD ANALITIK WALI KELAS
// ---------------------------------------------------------
// Menghitung statistik kehadiran harian untuk 1 kelas wali:
// - statistikHarian: array per tanggal (hadir/izin/sakit/alpa/persen)
// - topAlpa: 10 siswa dengan alpa terbanyak di kelas ini
// - rataRata: distribusi persentase H/I/S/A keseluruhan
// - totalPertemuan: jumlah hari sudah diabsen
// - totalSiswa: jumlah siswa di kelas (dari Data Master)
// =========================================================
function getDashboardDataWali(kelas) {
  let ss;
  try {
    ss = getAbsenSs(kelas, todayISO());
  } catch (e) {
    // PATCH: sebelumnya panggilan ini TIDAK dibungkus try/catch (beda
    // dengan getDashboardData() yang sudah lebih dulu dibungkus) -- kalau
    // gagal (mis. DRIVE_FOLDER_ABSEN_ROOT_ID belum diisi, atau gagal
    // provisioning), exception lolos mentah sampai ke Router.gs dan
    // muncul sebagai pesan generik "Terjadi kesalahan pada server."
    // tanpa detail. Sekarang pesan errornya jelas & actionable.
    return { success: false, message: "Gagal membuka data absen wali kelas " + kelas + ": " + e.message };
  }
  const sheetName = (kelas + "_" + MAPEL_ABSEN_WALI).replace(/[^a-zA-Z0-9]/g, "_");
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return { success: false, message: "Belum ada data absensi wali kelas " + kelas + "." };
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: false, message: "Belum ada data absensi wali kelas " + kelas + "." };
  }

  const nisKeNama = getNisKeNamaMap(kelas);

  let statistikHarian = [];
  let siswaAlpaCount = {};
  let totalHadir = 0, totalIzin = 0, totalSakit = 0, totalAlpa = 0;

  for (let i = 1; i < data.length; i++) {
    const rawDate = data[i][4];
    if (!rawDate) continue;

    const tanggal = Utilities.formatDate(new Date(rawDate), "GMT+7", "yyyy-MM-dd");
    const hadirArr = splitList(data[i][5]);
    const izinArr = splitList(data[i][6]);
    const sakitArr = splitList(data[i][7]);
    const alpaArr = splitList(data[i][8]);

    const total = hadirArr.length + izinArr.length + sakitArr.length + alpaArr.length;
    const persenHadir = total > 0 ? Math.round((hadirArr.length / total) * 1000) / 10 : 0;

    statistikHarian.push({
      tanggal,
      hadir: hadirArr.length,
      izin: izinArr.length,
      sakit: sakitArr.length,
      alpa: alpaArr.length,
      total,
      persenHadir
    });

    totalHadir += hadirArr.length;
    totalIzin += izinArr.length;
    totalSakit += sakitArr.length;
    totalAlpa += alpaArr.length;

    alpaArr.forEach(nis => {
      siswaAlpaCount[nis] = (siswaAlpaCount[nis] || 0) + 1;
    });
  }

  // Sort by date ascending
  statistikHarian.sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));

  // Top alpa
  const topAlpa = Object.keys(siswaAlpaCount)
    .map(nis => ({
      nama: (nisKeNama[nis] || ("NIS " + nis)),
      jumlahAlpa: siswaAlpaCount[nis]
    }))
    .sort((a, b) => b.jumlahAlpa - a.jumlahAlpa)
    .slice(0, 10);

  // Rata-rata distribusi status
  const grandTotal = totalHadir + totalIzin + totalSakit + totalAlpa;
  const rataRata = {
    hadir: grandTotal > 0 ? Math.round((totalHadir / grandTotal) * 1000) / 10 : 0,
    izin: grandTotal > 0 ? Math.round((totalIzin / grandTotal) * 1000) / 10 : 0,
    sakit: grandTotal > 0 ? Math.round((totalSakit / grandTotal) * 1000) / 10 : 0,
    alpa: grandTotal > 0 ? Math.round((totalAlpa / grandTotal) * 1000) / 10 : 0
  };

  return {
    success: true,
    data: {
      kelas,
      totalPertemuan: statistikHarian.length,
      totalSiswa: Object.keys(nisKeNama).length,
      statistikHarian,
      topAlpa,
      rataRata
    }
  };
}
// ===== SELESAI: DASHBOARD WALI KELAS =====
