// =========================================================
// ABSENSI PER MATA PELAJARAN
// =========================================================

function getStudents(kelas) {
  // PATCH INTEGRASI: data siswa sekarang di spreadsheet Master Siswa
  // terpisah (read-only untuk aplikasi ini -- lihat kodegs/Config.gs).
  let ss = getMasterSiswaSs();
  let sheet = ss.getSheetByName(kelas);
  if (!sheet) return { success: false, message: "Data kelas " + kelas + " tidak ditemukan." };

  let data = sheet.getDataRange().getValues();
  let students = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] !== "" && data[i][2] !== "") {
      // PATCH: kolom ke-5 (index 4) "Status" -- diisi oleh Aplikasi
      // Manajemen Siswa kalau siswa pindah/berhenti ("Pindah"/"Berhenti"/
      // "Nonaktif"), supaya baris siswa TIDAK dihapus (data absensi lama
      // yang mereferensikan NIS ini tetap utuh), cukup disembunyikan dari
      // daftar siswa aktif di aplikasi ini. Kalau kolom Status kosong/
      // belum ada (data lama/kelas yang belum disentuh Aplikasi
      // Manajemen Siswa), dianggap Aktif -- supaya tidak ada perubahan
      // perilaku untuk kelas yang belum pakai kolom Status.
      const status = (data[i][4] || '').toString().trim().toLowerCase();
      const statusTidakAktif = ['pindah', 'berhenti', 'nonaktif', 'keluar'];
      if (status && statusTidakAktif.includes(status)) {
        continue;
      }
      students.push({ nis: data[i][1], nama: data[i][2], jk: data[i][3] });
    }
  }
  return { success: true, data: students };
}

function getExistingAttendance(guru, mapel, kelas, tanggal) {
  let ss = getAbsenSs(kelas, tanggal);
  let sheetName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_");
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: true, data: null };

  let data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    let rawDate = data[i][4];
    if (rawDate && isDateMatch(rawDate, tanggal)) {
      return {
        success: true,
        data: {
          hadir: String(data[i][5] || ''),
          izin: String(data[i][6] || ''),
          sakit: String(data[i][7] || ''),
          alpa: String(data[i][8] || '')
        }
      };
    }
  }
  return { success: true, data: null };
}

function handleSubmit(payload) {
  // Validasi payload dasar
  const requiredFields = ['guru', 'mapel', 'kelas', 'tanggal', 'attendance'];
  for (let field of requiredFields) {
    if (!payload[field]) {
      return { success: false, message: "Data " + field + " tidak boleh kosong." };
    }
  }
  
  if (!Array.isArray(payload.attendance) || payload.attendance.length === 0) {
    return { success: false, message: "Data absensi siswa tidak valid." };
  }

  // PATCH KONKURENSI: sebelumnya tidak ada penguncian sama sekali di
  // sini, padahal alurnya baca dulu (cari baris tanggal yang cocok) baru
  // tulis (appendRow / setValues) -- kalau 2 permintaan nyaris bersamaan
  // masuk untuk kelas+mapel+tanggal yang SAMA (mis. submit dobel karena
  // koneksi lambat & user klik ulang), keduanya bisa sama-sama menyimpulkan
  // "belum ada baris" lalu sama-sama appendRow -> baris duplikat, atau
  // saling menimpa. LockService.getScriptLock() menyerialkan seluruh
  // proses baca-putuskan-tulis di bawah ini lintas semua permintaan yang
  // sedang berjalan di script ini (skala absen sekolah masih jauh dari
  // volume yang bikin ini jadi bottleneck berarti).
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // tunggu maksimal 10 detik
  } catch (e) {
    return { success: false, message: "Server sedang memproses absen lain, silakan coba lagi beberapa saat." };
  }

  try {
    return simpanSubmitAbsensi(payload);
  } finally {
    lock.releaseLock();
  }
}

// Logika penyimpanan sebenarnya, dipisah dari handleSubmit() supaya
// bagian ini bisa dibungkus rapi oleh try/finally LockService di atas.
function simpanSubmitAbsensi(payload) {
  let ss = getAbsenSs(payload.kelas, payload.tanggal);
  let sheetName = (payload.kelas + "_" + payload.mapel).replace(/[^a-zA-Z0-9]/g, "_");
  let sheet = getOrCreateSheet(ss, sheetName);
  let data = sheet.getDataRange().getValues();
  let timestamp = new Date();

  let hadir = [], izin = [], sakit = [], alpa = [];
  
  // Validasi dan proses setiap siswa
  for (let student of payload.attendance) {
    if (!student.nis || !student.status) continue;
    
    const nis = String(student.nis).trim();
    const status = String(student.status).trim().toUpperCase();
    
    // Validasi NIS
    // PATCH: 'nis' (bukan 'nisn') -- lihat catatan di Utils.gs, format NIS
    // sekolah ini boleh mengandung "/" dan "." (mis. "10408/771.111").
    const nisValidation = validateInput(nis, 'nis');
    if (nisValidation !== true) {
      return { success: false, message: "NIS tidak valid: " + nisValidation };
    }
    
    // Validasi status
    if (!['H', 'I', 'S', 'A'].includes(status)) {
      return { success: false, message: "Status absensi '" + status + "' tidak valid untuk NIS " + nis };
    }
    
    switch (status) {
      case 'H': hadir.push(nis); break;
      case 'I': izin.push(nis); break;
      case 'S': sakit.push(nis); break;
      case 'A': alpa.push(nis); break;
    }
  }

  if (hadir.length + izin.length + sakit.length + alpa.length === 0) {
    return { success: false, message: "Tidak ada data absensi yang valid untuk disimpan." };
  }

  let strHadir = hadir.join(', ');
  let strIzin = izin.join(', ');
  let strSakit = sakit.join(', ');
  let strAlpa = alpa.join(', ');

  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    let rawDate = data[i][4];
    if (rawDate && isDateMatch(rawDate, payload.tanggal)) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow !== -1) {
    // PATCH PERFORMA: sebelumnya 5 panggilan setValue() terpisah (1 per sel).
    // Kolom 6-9 (Hadir/Izin/Sakit/Alpa) berdampingan, jadi digabung jadi
    // SATU panggilan setValues() -- kolom timestamp (kolom 1) tidak
    // berdampingan dengan kolom 6-9 sehingga tetap panggilan terpisah.
    // Total jadi 2 panggilan Range API, bukan 5.
    sheet.getRange(targetRow, 1).setValue(timestamp);
    sheet.getRange(targetRow, 6, 1, 4).setValues([[strHadir, strIzin, strSakit, strAlpa]]);
    return { success: true, message: "Data absensi diperbarui!" };
  } else {
    let rowData = [timestamp, payload.guru, payload.mapel, payload.kelas, payload.tanggal, strHadir, strIzin, strSakit, strAlpa];
    sheet.appendRow(rowData);
    return { success: true, message: "Data absensi berhasil disimpan!" };
  }
}

// --- RIWAYAT ---
function getRiwayatAbsensi(mapel, kelas) {
  // CATATAN: fungsi ini tidak dipanggil dengan tanggal spesifik (dipakai
  // untuk lihat riwayat kelas+mapel yang SEDANG berjalan), jadi dipakai
  // grup semester HARI INI (todayISO(), lihat Utils.gs). Kalau butuh
  // riwayat dari semester yang sudah diarsipkan (grup lama), fungsi ini
  // TIDAK menjangkau ke sana secara otomatis -- itu memang tujuan
  // pengarsipan per semester (lihat catatan getAbsenGroupKey() di
  // Config.gs). Untuk rekap lintas-semester, unduh rekap resmi lewat
  // generateFullRecap()/getRekapKelasSaya() sebelum semester ditutup.
  let ss = getAbsenSs(kelas, todayISO());
  let sheetName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_");
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: true, data: [] };

  const nisKeNama = getNisKeNamaMap(kelas);
  let data = sheet.getDataRange().getValues();
  let riwayat = [];

  for (let i = 1; i < data.length; i++) {
    let rawDate = data[i][4];
    if (!rawDate) continue;

    let hadirArr = splitList(data[i][5]);
    let izinArr = splitList(data[i][6]);
    let sakitArr = splitList(data[i][7]);
    let alpaArr = splitList(data[i][8]);

    riwayat.push({
      tanggal: Utilities.formatDate(new Date(rawDate), "GMT+7", "yyyy-MM-dd"),
      jumlahHadir: hadirArr.length,
      jumlahIzin: izinArr.length,
      jumlahSakit: sakitArr.length,
      jumlahAlpa: alpaArr.length,
      namaIzin: izinArr.map(nis => nisKeNama[nis] || nis),
      namaSakit: sakitArr.map(nis => nisKeNama[nis] || nis),
      namaAlpa: alpaArr.map(nis => nisKeNama[nis] || nis)
    });
  }

  riwayat.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  return { success: true, data: riwayat };
}

// --- HAPUS ABSEN (salah tanggal, dsb) ---
// Guru cuma boleh hapus entri absen dalam 7 hari terakhir -- supaya
// tidak sembarangan menghapus data lama (mis. yang sudah masuk rekap
// resmi semester). Otorisasi kelas+mapel guru dicek di Router.gs
// (sama seperti handleSubmit/getRiwayatAbsensi), fungsi ini fokus ke
// logika hapusnya saja.
function hapusAbsensi(mapel, kelas, tanggal) {
  if (!apakahDalam7HariTerakhir(tanggal)) {
    return { success: false, message: "Absen tanggal " + tanggal + " sudah lebih dari 7 hari yang lalu -- tidak bisa dihapus lewat aplikasi. Hubungi admin kalau memang perlu dikoreksi." };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: "Server sedang memproses absen lain, silakan coba lagi beberapa saat." };
  }

  try {
    let ss = getAbsenSs(kelas, tanggal);
    let sheetName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_");
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, message: "Data absen untuk kelas/mapel ini tidak ditemukan." };

    let data = sheet.getDataRange().getValues();
    let targetRow = -1;
    for (let i = 1; i < data.length; i++) {
      let rawDate = data[i][4];
      if (rawDate && isDateMatch(rawDate, tanggal)) { targetRow = i + 1; break; }
    }

    if (targetRow === -1) {
      return { success: false, message: "Data absen tanggal " + tanggal + " tidak ditemukan (mungkin sudah terhapus sebelumnya)." };
    }

    sheet.deleteRow(targetRow);
    return { success: true, message: "Data absen tanggal " + tanggal + " berhasil dihapus." };
  } finally {
    lock.releaseLock();
  }
}
