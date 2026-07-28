// =========================================================
// --- HANDLE REQUEST (ENTRY POINT) ---
// =========================================================
//
// PATCH NOTES:
// 1. Ditambahkan doOptions() -- meski Apps Script Web App biasanya tidak
//    butuh ini untuk request text/plain (lihat patch di js/api.js), fungsi
//    ini tetap disediakan sebagai jaring pengaman kalau nanti ada request
//    yang memicu preflight (misal ada yang lupa balikin Content-Type ke
//    application/json).
// 2. Semua action yang butuh token (getStudents, getExistingAttendance,
//    getRiwayatAbsensi, getDashboardData, getDashboardDataWali,
//    getAbsenWaliExisting, getRiwayatAbsenWali, getRekapKelasSaya,
//    getRekapAbsenWali) DIPINDAH dari doGet() ke doPost(), supaya token
//    tidak lagi terkirim lewat query string (yang bisa kebaca di history
//    browser & access log server).
// 3. doGet() sengaja DIBIARKAN KOSONG-FUNGSIONAL (hanya pesan info) untuk
//    backward-compat, supaya kalau ada request GET nyasar tidak error 500,
//    tapi tidak lagi memproses action apa pun yang butuh otentikasi.
// 4. FIX (BARU): Validasi otorisasi getRekapKelasSaya SEBELUMNYA memakai
//    akun.mapelList.indexOf(data.mapel) -- padahal data.mapel/data.kelas
//    di sini adalah STRING GABUNGAN KOMA (mis. "Matematika,IPA"), bukan
//    satu nama mapel tunggal. getRekapKelasSaya() sendiri (Rekap.gs) sudah
//    benar men-split string ini dengan koma. Karena indexOf() mencari
//    kecocokan PERSIS satu elemen array dengan keseluruhan string gabungan
//    itu, guru yang mengajar LEBIH DARI 1 mapel atau kelas akan SELALU
//    ditolak ("Anda tidak berhak mengunduh rekap ini") walau itu data
//    miliknya sendiri -- hanya guru dengan tepat 1 mapel & 1 kelas yang
//    kebetulan lolos.
//    Perbaikan: split dulu string gabungan itu (pakai splitList() yang
//    sudah ada di Utils.gs), lalu pastikan SETIAP mapel & kelas yang
//    diminta memang ada di daftar mapel/kelas guru tsb (akun.mapelList /
//    akun.kelasList), baru izinkan.
// 5. FIX (BARU): doPost() sebelumnya membiarkan `response` tetap generik
//    {success:false, message:"Terjadi kesalahan sistem."} kalau action
//    tidak cocok kondisi manapun (typo action, atau parameter wajib
//    seperti data.mapel/data.kelas kosong) -- membuat masalah semacam ini
//    sangat sulit dilacak dari sisi frontend/Network tab. Ditambahkan
//    fallback else di akhir rantai if/else yang menyebutkan nama action
//    yang diterima, supaya kesalahan ketik/parameter kurang lengkap
//    langsung terlihat jelas di response.
// =========================================================

function doOptions(e) {
  return ContentService.createTextOutput('');
}

function doPost(e) {
  let response = { success: false, message: "Terjadi kesalahan sistem." };
  try {
    let data = JSON.parse(e.postData.contents);

    if (data.action === 'login') {
      response = handleLogin(data.username, data.password);

    } else if (data.action === 'submit') {
      response = handleSubmitDenganValidasi(data.username, data.token, data.payload);

    } else if (data.action === 'submitAbsenWali') {
      response = simpanAbsenWaliDenganValidasi(data.username, data.token, data.kelas, data.tanggal, data.dataKehadiran);

    // ===== PATCH: action berikut dipindah dari doGet ke doPost =====
    } else if (data.action === 'getStudents' && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        // PATCH BUG: sebelumnya cuma cek akun.kelasList -- wali kelas yang
        // KEBETULAN tidak mengajar mapel apa pun di kelas walinya sendiri
        // (murni jadi wali, kelasnya tidak masuk kelasList) akan salah
        // ditolak di sini, padahal dia berhak lihat siswa kelas walinya
        // sendiri. Sekarang diterima juga kalau kelas yang diminta = kelasWali.
        if (akun.kelasList.indexOf(data.kelas) === -1 && akun.kelasWali !== data.kelas) {
          return { success: false, message: "Anda tidak berhak mengakses data kelas " + data.kelas + "." };
        }
        return getStudents(data.kelas);
      });

    } else if (data.action === 'getExistingAttendance') {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        const guru = data.guru || akun.nama;
        const mapel = data.mapel;
        const kelas = data.kelas;
        if (akun.mapelList.indexOf(mapel) === -1 || akun.kelasList.indexOf(kelas) === -1) {
          return { success: false, message: "Anda tidak berhak mengakses data absensi ini." };
        }
        return getExistingAttendance(guru, mapel, kelas, data.tanggal);
      });

    } else if (data.action === 'getRiwayatAbsensi' && data.mapel && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (akun.mapelList.indexOf(data.mapel) === -1 || akun.kelasList.indexOf(data.kelas) === -1) {
          return { success: false, message: "Anda tidak berhak mengakses riwayat absensi ini." };
        }
        return getRiwayatAbsensi(data.mapel, data.kelas);
      });

    } else if (data.action === 'hapusAbsen' && data.mapel && data.kelas && data.tanggal) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (akun.mapelList.indexOf(data.mapel) === -1 || akun.kelasList.indexOf(data.kelas) === -1) {
          return { success: false, message: "Anda tidak berhak menghapus absensi ini." };
        }
        return hapusAbsensi(data.mapel, data.kelas, data.tanggal);
      });

    } else if (data.action === 'getDashboardData' && data.mapel && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        // PATCH: validasi PER-ITEM (bukan cek string gabungan utuh) --
        // sejak dashboard frontend mengirim SEMUA mapel & kelas guru
        // sekaligus (dipisah koma, bukan cuma 1 seperti sebelumnya),
        // indexOf(data.mapel) tidak akan pernah cocok karena akun.mapelList
        // isinya item satuan ("DKV","KIK"), bukan string gabungan
        // ("DKV,KIK"). Pola sama seperti getRekapKelasSaya di bawah.
        const mapelDiminta = splitList(data.mapel);
        const kelasDiminta = splitList(data.kelas);

        if (mapelDiminta.length === 0 || kelasDiminta.length === 0) {
          return { success: false, message: "Mata pelajaran atau kelas tidak valid." };
        }

        const semuaMapelValid = mapelDiminta.every(m => akun.mapelList.indexOf(m) !== -1);
        const semuaKelasValid = kelasDiminta.every(k => akun.kelasList.indexOf(k) !== -1);

        if (!semuaMapelValid || !semuaKelasValid) {
          return { success: false, message: "Anda tidak berhak mengakses dashboard ini." };
        }
        return getDashboardData(data.mapel, data.kelas);
      });

    // ===== FIX: validasi per-item (bukan cek string gabungan utuh) =====
    } else if (data.action === 'getRekapKelasSaya' && data.mapel && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        const mapelDiminta = splitList(data.mapel);
        const kelasDiminta = splitList(data.kelas);

        if (mapelDiminta.length === 0 || kelasDiminta.length === 0) {
          return { success: false, message: "Mata pelajaran atau kelas tidak valid." };
        }

        const semuaMapelValid = mapelDiminta.every(m => akun.mapelList.indexOf(m) !== -1);
        const semuaKelasValid = kelasDiminta.every(k => akun.kelasList.indexOf(k) !== -1);

        if (!semuaMapelValid || !semuaKelasValid) {
          return { success: false, message: "Anda tidak berhak mengunduh rekap ini." };
        }
        return getRekapKelasSaya(data.mapel, data.kelas);
      });

    } else if (data.action === 'getAbsenWaliExisting' && data.kelas && data.tanggal) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== data.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + data.kelas + "." };
        }
        return getAbsenWaliExisting(data.kelas, data.tanggal);
      });

    } else if (data.action === 'getRiwayatAbsenWali' && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== data.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + data.kelas + "." };
        }
        return getRiwayatAbsenWali(data.kelas);
      });

    } else if (data.action === 'hapusAbsenWali' && data.kelas && data.tanggal) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== data.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + data.kelas + "." };
        }
        return hapusAbsenWali(data.kelas, data.tanggal);
      });

    } else if (data.action === 'getRekapAbsenWali' && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== data.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + data.kelas + "." };
        }
        return getRekapAbsenWali(data.kelas);
      });

    } else if (data.action === 'getDashboardDataWali' && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== data.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + data.kelas + "." };
        }
        return getDashboardDataWali(data.kelas);
      });

    // ===== FITUR: Delegasi Input Absen ke Ketua Kelas (sementara) =====
    // 3 action pertama BUTUH login wali kelas (sama seperti action wali
    // kelas lain -- pakai username+token session, divalidasi harus wali
    // kelas dari `data.kelas` yang bersangkutan). 2 action terakhir
    // SENGAJA PUBLIK (tanpa username/token session sama sekali) karena itu
    // yang dipakai dari link yang dibagikan ke ketua kelas -- keamanannya
    // divalidasi lewat token acak itu sendiri (lihat kodegs/KetuaKelas.gs).
    } else if (data.action === 'generateKetuaKelasLink' && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== data.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + data.kelas + "." };
        }
        return generateKetuaKelasToken(data.kelas, akun.nama);
      });

    } else if (data.action === 'getStatusKetuaKelasLink' && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== data.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + data.kelas + "." };
        }
        return getStatusKetuaKelasToken(data.kelas);
      });

    } else if (data.action === 'nonaktifkanKetuaKelasLink' && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== data.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + data.kelas + "." };
        }
        return nonaktifkanKetuaKelasToken(data.kelas);
      });

    // ===== PUBLIK -- tanpa login, hanya divalidasi lewat data.ketuaToken =====
    } else if (data.action === 'getInfoKetuaKelas' && data.ketuaToken) {
      // PATCH: data.tanggal opsional -- hanya berpengaruh kalau mode per
      // tanggal aktif untuk kelas tsb (lihat kodegs/ketuakelas.gs).
      response = getInfoUntukKetuaKelas(data.ketuaToken, data.tanggal);

    } else if (data.action === 'submitAbsenKetuaKelas' && data.ketuaToken && data.dataKehadiran) {
      response = submitAbsenViaKetuaKelas(data.ketuaToken, data.tanggal, data.dataKehadiran);

    // ===== FITUR: Panel Profil (nama, ganti password, foto profil) =====
    } else if (data.action === 'getProfilSaya') {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        return getProfilSaya(data.username);
      });

    } else if (data.action === 'updateProfil' && data.dataBaru) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        return updateProfilSaya(data.username, data.dataBaru);
      });

    } else if (data.action === 'uploadFotoProfil' && data.base64Data) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        return uploadFotoProfilSaya(data.username, data.base64Data, data.mimeType);
      });

    // ===== FITUR: Detail siswa (klik nama di kotak "Perlu Perhatian") =====
    } else if (data.action === 'getDetailSiswaPerhatian' && data.nis && data.kelas && data.mapel) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        const mapelDiminta = splitList(data.mapel);
        if (akun.kelasList.indexOf(data.kelas) === -1 || mapelDiminta.length === 0 || !mapelDiminta.every(m => akun.mapelList.indexOf(m) !== -1)) {
          return { success: false, message: "Anda tidak berhak mengakses data ini." };
        }
        return getDetailSiswaPerhatian(data.nis, data.kelas, data.mapel);
      });

    } else if (data.action === 'getDetailSiswaPerhatianWali' && data.nis && data.kelas) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!akun.kelasWali || akun.kelasWali !== data.kelas) {
          return { success: false, message: "Anda bukan wali kelas " + data.kelas + "." };
        }
        return getDetailSiswaPerhatian(data.nis, data.kelas, MAPEL_ABSEN_WALI);
      });

    // ===== TAHAP 2: Dashboard Sekolah (khusus kepsek/admin/superadmin) =====
    } else if (data.action === 'getDashboardSekolah') {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!punyaRole(akun, 'kepsek') && !punyaRole(akun, 'admin') && !punyaRole(akun, 'superadmin')) {
          return { success: false, message: "Anda tidak berhak mengakses dashboard sekolah." };
        }
        return getDashboardSekolah();
      });

    // ===== TAHAP 3: Panel Admin -- kelola akun guru =====
    // Semua action di bawah ini WAJIB admin/superadmin, KECUALI
    // updateRoleAkun yang WAJIB superadmin SAJA (admin biasa tidak boleh
    // atur role siapa pun, termasuk dirinya sendiri -- lihat rancangan
    // yang disepakati soal pemisahan wewenang admin vs superadmin).
    } else if (data.action === 'getDaftarAkunUntukAdmin') {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!punyaRole(akun, 'admin') && !punyaRole(akun, 'superadmin')) {
          return { success: false, message: "Anda tidak berhak mengakses Panel Admin." };
        }
        return getDaftarAkunUntukAdmin();
      });

    } else if (data.action === 'tambahAkunGuru' && data.dataBaru) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!punyaRole(akun, 'admin') && !punyaRole(akun, 'superadmin')) {
          return { success: false, message: "Anda tidak berhak menambah akun guru." };
        }
        return tambahAkunGuru(data.dataBaru);
      });

    } else if (data.action === 'updateAkunGuru' && data.targetUsername && data.dataBaru) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!punyaRole(akun, 'admin') && !punyaRole(akun, 'superadmin')) {
          return { success: false, message: "Anda tidak berhak mengubah akun guru." };
        }
        return updateAkunGuru(data.targetUsername, data.dataBaru);
      });

    } else if (data.action === 'resetPasswordAkunOlehAdmin' && data.targetUsername && data.passwordBaru) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!punyaRole(akun, 'admin') && !punyaRole(akun, 'superadmin')) {
          return { success: false, message: "Anda tidak berhak mereset password akun guru." };
        }
        return resetPasswordAkunOlehAdmin(data.targetUsername, data.passwordBaru);
      });

    } else if (data.action === 'nonaktifkanAkunGuru' && data.targetUsername) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!punyaRole(akun, 'admin') && !punyaRole(akun, 'superadmin')) {
          return { success: false, message: "Anda tidak berhak menonaktifkan akun guru." };
        }
        if (data.targetUsername === data.username) {
          return { success: false, message: "Anda tidak bisa menonaktifkan akun sendiri." };
        }
        return nonaktifkanAkunGuru(data.targetUsername);
      });

    } else if (data.action === 'aktifkanKembaliAkunGuru' && data.targetUsername) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!punyaRole(akun, 'admin') && !punyaRole(akun, 'superadmin')) {
          return { success: false, message: "Anda tidak berhak mengaktifkan akun guru." };
        }
        return aktifkanKembaliAkunGuru(data.targetUsername);
      });

    } else if (data.action === 'updateRoleAkun' && data.targetUsername && data.roleCsvBaru !== undefined) {
      response = handleGetDenganValidasi(data.username, data.token, function(akun) {
        if (!punyaRole(akun, 'superadmin')) {
          return { success: false, message: "Hanya Super Admin yang boleh mengubah peran akun." };
        }
        return updateRoleAkunOlehSuperAdmin(data.targetUsername, data.roleCsvBaru);
      });

    // ===== FIX: fallback eksplisit untuk action tak dikenal / parameter kurang =====
    } else {
      response.message = "Aksi tidak dikenali atau parameter tidak lengkap: " + (data.action || '(kosong)');
    }
    // ===== SELESAI PATCH =====

  } catch (error) {
    Logger.log('Error doPost: ' + error.toString());
    response.message = "Terjadi kesalahan pada server.";
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

// Wrapper untuk validasi request dengan token (dipakai baik dari doGet lama maupun doPost)
function handleGetDenganValidasi(username, token, callback) {
  const cek = verifikasiToken(token, username);
  if (!cek.valid) return { success: false, message: cek.message, sessionExpired: true };

  const akun = getAkunGuru(username);
  if (!akun) return { success: false, message: "Akun tidak ditemukan." };

  return callback(akun);
}

// =========================================================
// PATCH: doGet() tidak lagi memproses action yang butuh token.
// Dibiarkan aktif hanya untuk cek "web app hidup" (health check) dan
// backward-compat supaya tidak error 500 kalau ada request GET lama
// yang masih nyangkut di cache browser client lama.
// =========================================================
function doGet(e) {
  const response = {
    success: false,
    message: "Endpoint ini hanya menerima POST. Silakan update aplikasi frontend Anda ke versi terbaru."
  };
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}
