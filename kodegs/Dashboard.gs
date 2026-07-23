// =========================================================
// DASHBOARD ANALITIK
// =========================================================

// --- DASHBOARD (per mapel) ---
function getDashboardData(mapelListStr, kelasListStr) {
  let mapelList = mapelListStr.split(',').map(s => s.trim()).filter(s => s !== "");
  let kelasList = kelasListStr.split(',').map(s => s.trim()).filter(s => s !== "");
  let ss = getAbsenSs();

  let rekapKelasMapel = [];
  let siswaAlpaCount = {};
  let trendMap = {};
  let adaData = false;
  let nisKeNamaCache = {};

  kelasList.forEach(kelas => {
    mapelList.forEach(mapel => {
      let sheetName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_");
      let sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;

      let data = sheet.getDataRange().getValues();
      if (data.length <= 1) return;

      let agg = { hadir: 0, izin: 0, sakit: 0, alpa: 0, pertemuan: 0 };

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
          });
        }

        if (!trendMap[tanggalStr]) trendMap[tanggalStr] = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
        trendMap[tanggalStr].hadir += hadirCount;
        trendMap[tanggalStr].izin += izinCount;
        trendMap[tanggalStr].sakit += sakitCount;
        trendMap[tanggalStr].alpa += alpaCount;
      }

      let total = agg.hadir + agg.izin + agg.sakit + agg.alpa;
      let persenHadir = total > 0 ? Math.round((agg.hadir / total) * 1000) / 10 : 0;

      rekapKelasMapel.push({
        label: kelas + " - " + mapel,
        hadir: agg.hadir, izin: agg.izin, sakit: agg.sakit, alpa: agg.alpa,
        pertemuan: agg.pertemuan, persenHadir: persenHadir
      });
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

  return { success: true, data: { rekapKelasMapel, topAlpa, trend } };
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
  const ss = getAbsenSs();
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
