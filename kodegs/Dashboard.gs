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

// Bangun 4 daftar "Perlu Perhatian" (Sering Alpa / Sering Izin / Sering
// Sakit / Jarang Masuk gabungan) dari peta hitungan status per siswa
// ({ key: {alpa, izin, sakit} }). `resolveInfo(key)` menentukan cara
// mengubah key jadi info siswa { nama, nis, kelas } -- beda antara level
// gabungan (key "kelas|nis") dan level per kombinasi (key NIS saja).
// Field hasil tetap dinamai `jumlahAlpa` (bukan diganti `jumlah` generik)
// supaya kompatibel dengan renderTopAlpaList() di frontend yang juga
// dipakai Dashboard Wali Kelas -- di sini artinya "jumlah kejadian status
// yang bersangkutan", bukan selalu benar-benar Alpa.
// PATCH KLIK-DETAIL: sebelumnya resolveNama() cuma mengembalikan STRING
// nama sudah jadi (mis. "Budi (XI DKV 1)"), jadi frontend tidak punya
// NIS/kelas mentah untuk dipakai lagi kalau mau ambil detail siswa itu.
// Sekarang resolveInfo() mengembalikan OBJEK { nama, nis, kelas }, dan
// nis+kelas ikut disertakan di tiap item hasil -- dipakai
// getDetailSiswaPerhatian() saat nama diklik di frontend.
function bangunDaftarPerhatian(counterMap, resolveInfo) {
  function daftarUntuk(ambilJumlah) {
    return Object.keys(counterMap)
      .map(key => {
        const info = resolveInfo(key); // { nama, nis, kelas }
        return { nama: info.nama, nis: info.nis, kelas: info.kelas, jumlahAlpa: ambilJumlah(counterMap[key]) };
      })
      .filter(item => item.jumlahAlpa > 0)
      .sort((a, b) => b.jumlahAlpa - a.jumlahAlpa)
      .slice(0, 10);
  }
  return {
    alpa: daftarUntuk(c => c.alpa),
    izin: daftarUntuk(c => c.izin),
    sakit: daftarUntuk(c => c.sakit),
    jarangMasuk: daftarUntuk(c => c.alpa + c.izin + c.sakit)
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
  // PATCH: dulu cuma melacak Alpa (siswaAlpaCount). Sekarang melacak
  // ketiga status non-hadir per siswa (alpa, izin, sakit) sekaligus,
  // supaya "Perlu Perhatian" bisa dipecah jadi beberapa kategori
  // terpisah (Sering Alpa / Sering Izin / Sering Sakit / Jarang Masuk),
  // bukan cuma Alpa saja. Key sama seperti sebelumnya: "kelas|nis".
  let siswaStatusCount = {}; // { "kelas|nis": {alpa, izin, sakit} }
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
      // PATCH: sama seperti siswaStatusCount di atas, tapi dibatasi ke
      // 1 kombinasi kelas+mapel ini saja (key cukup NIS, tidak perlu
      // "kelas|nis" karena sudah pasti 1 kelas).
      const siswaStatusCountKombinasi = {}; // { nis: {alpa, izin, sakit} }

      // Fungsi kecil supaya 3 blok pencatatan (alpa/izin/sakit) di bawah
      // tidak mengulang logika yang sama 3x secara terpisah.
      function catatStatus(strDaftar, jenisStatus) {
        if (!strDaftar) return;
        strDaftar.split(',').forEach(nis => {
          const nisTrim = nis.trim();
          if (!nisTrim) return;
          const keyGlobal = kelas + "|" + nisTrim;
          if (!siswaStatusCount[keyGlobal]) siswaStatusCount[keyGlobal] = { alpa: 0, izin: 0, sakit: 0 };
          siswaStatusCount[keyGlobal][jenisStatus]++;
          if (!siswaStatusCountKombinasi[nisTrim]) siswaStatusCountKombinasi[nisTrim] = { alpa: 0, izin: 0, sakit: 0 };
          siswaStatusCountKombinasi[nisTrim][jenisStatus]++;
        });
      }

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

        catatStatus(strAlpa, 'alpa');
        catatStatus(strIzin, 'izin');
        catatStatus(strSakit, 'sakit');

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

      const perhatianKombinasi = bangunDaftarPerhatian(
        siswaStatusCountKombinasi,
        nis => ({
          nama: (namaMapKelasIni[nis] || ("NIS " + nis)) + " (" + kelas + ")",
          nis: nis,
          kelas: kelas
        })
      );

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
        // GANTI: dulu cuma topAlpa (1 daftar). Sekarang perhatian (4
        // daftar terpisah: alpa/izin/sakit/jarangMasuk) -- lihat
        // bangunDaftarPerhatian() di atas.
        perhatian: perhatianKombinasi,
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

  const perhatian = bangunDaftarPerhatian(siswaStatusCount, key => {
    const [kelasKey, nis] = key.split("|");
    if (!nisKeNamaCache[kelasKey]) nisKeNamaCache[kelasKey] = getNisKeNamaMap(kelasKey);
    const nama = nisKeNamaCache[kelasKey][nis] || ("NIS " + nis);
    return { nama: nama + " (" + kelasKey + ")", nis: nis, kelas: kelasKey };
  });

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

  return { success: true, data: { rekapKelasMapel, perhatian, trend, perKombinasi, rataRata } };
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
  // PATCH: dulu cuma melacak Alpa (siswaAlpaCount). Sekarang melacak
  // ketiga status non-hadir per siswa sekaligus (sama seperti perubahan
  // di getDashboardData() untuk Per Mapel), supaya "Perlu Perhatian" di
  // sini juga bisa dipecah jadi 4 kategori terpisah.
  let siswaStatusCount = {}; // { nis: {alpa, izin, sakit} }
  let totalHadir = 0, totalIzin = 0, totalSakit = 0, totalAlpa = 0;

  function catatStatusWali(daftarNis, jenisStatus) {
    daftarNis.forEach(nis => {
      if (!siswaStatusCount[nis]) siswaStatusCount[nis] = { alpa: 0, izin: 0, sakit: 0 };
      siswaStatusCount[nis][jenisStatus]++;
    });
  }

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

    catatStatusWali(alpaArr, 'alpa');
    catatStatusWali(izinArr, 'izin');
    catatStatusWali(sakitArr, 'sakit');
  }

  // Sort by date ascending
  statistikHarian.sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));

  // GANTI: dulu cuma topAlpa (1 daftar). Sekarang perhatian (4 daftar
  // terpisah: alpa/izin/sakit/jarangMasuk) -- pakai fungsi bersama yang
  // sama seperti dashboard Per Mapel (lihat bangunDaftarPerhatian() di
  // atas getDashboardData()).
  const perhatian = bangunDaftarPerhatian(siswaStatusCount, nis => ({
    nama: (nisKeNama[nis] || ("NIS " + nis)),
    nis: nis,
    kelas: kelas
  }));

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
      perhatian,
      rataRata
    }
  };
}
// ===== SELESAI: DASHBOARD WALI KELAS =====

// =========================================================
// DETAIL SISWA (klik nama di kotak "Perlu Perhatian")
// ---------------------------------------------------------
// Dipanggil BELAKANGAN, saat 1 nama diklik -- BUKAN disertakan sejak awal
// dashboard dimuat (supaya payload awal dashboard tetap ringan). Menyisir
// SEMUA mapel di `mapelListStr` (bisa 1 mapel kalau lagi difilter ke 1
// kombinasi, banyak mapel kalau lagi tampilan gabungan, atau cuma
// MAPEL_ABSEN_WALI untuk konteks dashboard Wali Kelas) untuk cari SEMUA
// kejadian Izin/Sakit/Alpa siswa itu, plus hitung total Hadir untuk
// persentase ringkasan.
// =========================================================
function getDetailSiswaPerhatian(nis, kelas, mapelListStr) {
  const mapelList = mapelListStr.split(',').map(s => s.trim()).filter(s => s !== "");
  if (mapelList.length === 0) {
    return { success: false, message: "Mata pelajaran tidak valid." };
  }

  let ss;
  try {
    ss = getAbsenSs(kelas, todayISO());
  } catch (e) {
    return { success: false, message: "Gagal membuka data absen kelas " + kelas + ": " + e.message };
  }

  const namaMap = getNisKeNamaMap(kelas);
  const namaSiswa = namaMap[nis] || ("NIS " + nis);

  const kejadian = []; // { tanggal, status: 'I'|'S'|'A', mapel }
  // PATCH (deteksi naik/turun): peta per-tanggal, dipakai membangun
  // `trend` di bawah -- supaya frontend bisa membandingkan separuh awal
  // vs separuh akhir periode untuk siswa INI SAJA, persis logika yang
  // sama dipakai Dashboard Sekolah (analisisTrenSekolah() di
  // js/dashboard.js), cuma cakupannya 1 siswa bukan seluruh sekolah.
  const trendMap = {}; // { "yyyy-MM-dd": {hadir: 0/1, izin, sakit, alpa} }
  let totalHadir = 0, totalIzin = 0, totalSakit = 0, totalAlpa = 0;

  mapelList.forEach(mapel => {
    const sheetName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_");
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return; // guru ini mungkin tidak mengajar mapel itu di kelas ini -- lewati, bukan error

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const rawDate = data[i][4];
      if (!rawDate) continue;
      const tanggalStr = Utilities.formatDate(new Date(rawDate), "GMT+7", "yyyy-MM-dd");
      if (!trendMap[tanggalStr]) trendMap[tanggalStr] = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };

      if (splitList(data[i][5]).indexOf(nis) !== -1) { totalHadir++; trendMap[tanggalStr].hadir++; }

      const catatNonHadir = (kolomStr, kode) => {
        if (splitList(kolomStr).indexOf(nis) === -1) return;
        kejadian.push({ tanggal: tanggalStr, status: kode, mapel: mapel });
        if (kode === 'I') { totalIzin++; trendMap[tanggalStr].izin++; }
        else if (kode === 'S') { totalSakit++; trendMap[tanggalStr].sakit++; }
        else if (kode === 'A') { totalAlpa++; trendMap[tanggalStr].alpa++; }
      };
      catatNonHadir(data[i][6], 'I');
      catatNonHadir(data[i][7], 'S');
      catatNonHadir(data[i][8], 'A');
    }
  });

  kejadian.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal)); // terbaru dulu

  const trend = Object.keys(trendMap)
    .sort((a, b) => new Date(a) - new Date(b)) // kronologis (lama -> baru), beda dari kejadian yang terbaru dulu
    .map(tgl => {
      const d = trendMap[tgl];
      const totalTgl = d.hadir + d.izin + d.sakit + d.alpa;
      const persenHadirTgl = totalTgl > 0 ? Math.round((d.hadir / totalTgl) * 1000) / 10 : 0;
      return { tanggal: tgl, persenHadir: persenHadirTgl };
    });

  const totalPertemuan = totalHadir + totalIzin + totalSakit + totalAlpa;
  const persenHadir = totalPertemuan > 0 ? Math.round((totalHadir / totalPertemuan) * 1000) / 10 : 0;

  return {
    success: true,
    data: {
      nama: namaSiswa,
      nis: nis,
      kelas: kelas,
      persenHadir: persenHadir,
      totalHadir: totalHadir,
      totalIzin: totalIzin,
      totalSakit: totalSakit,
      totalAlpa: totalAlpa,
      trend: trend,
      kejadian: kejadian
    }
  };
}
