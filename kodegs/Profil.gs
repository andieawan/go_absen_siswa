// =========================================================
// PANEL PROFIL AKUN (nama, ganti password, foto profil)
// ---------------------------------------------------------
// Kolom di sheet Akun_Guru yang relevan (0-based, sesuai Auth.gs):
//   0=username, 1=password_plaintext(legacy), 2=nama, 3=mapelList,
//   4=kelasList, 5=kelasWali, 6=salt, 7=password_hash,
//   8=FotoProfilFileId (BARU, kolom I -- ditambahkan untuk fitur ini)
//
// Sheet Akun_Guru yang SUDAH ADA sebelum fitur ini tidak perlu diubah
// manual -- kolom 8 (I) memang belum ada isinya untuk akun lama, dan
// kode di bawah menanganinya sebagai "belum ada foto" (bukan error).
// =========================================================

const KOLOM_FOTO_PROFIL_1INDEXED = 9; // kolom I di spreadsheet (1-indexed, utk getRange)

// Format URL yang bisa langsung dipakai di <img src="..."> untuk file
// Drive yang sharing-nya "siapa saja yang punya link boleh lihat".
function buatUrlFotoProfil_(fileId) {
  // PATCH: format URL sebelumnya (uc?export=view) diketahui tidak selalu
  // andal dipakai langsung sebagai <img src> -- kadang Google
  // mengembalikan halaman peringatan/redirect, bukan gambar mentahnya.
  // Format "thumbnail" ini lebih dikenal stabil untuk kebutuhan ini.
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000';
}

/**
 * Ambil data profil (nama + URL foto kalau ada) untuk ditampilkan saat
 * Panel Profil dibuka.
 */
function getProfilSaya(username) {
  const ss = getMasterGuruSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      const fotoFileId = data[i][8] || '';
      return {
        success: true,
        data: {
          username: data[i][0],
          nama: data[i][2],
          fotoUrl: fotoFileId ? buatUrlFotoProfil_(fotoFileId) : null
        }
      };
    }
  }
  return { success: false, message: 'Akun tidak ditemukan.' };
}

/**
 * Update nama & (opsional) password.
 *
 * `dataBaru` bentuknya:
 *   { nama: "Nama Baru" }                              -- ganti nama saja
 *   { passwordLama: "...", passwordBaru: "..." }        -- ganti password saja
 *   { nama: "...", passwordLama: "...", passwordBaru: "..." } -- keduanya
 *
 * PATCH KEAMANAN: ganti password WAJIB menyertakan `passwordLama` yang
 * benar (diverifikasi dulu terhadap hash/plaintext yang tersimpan) --
 * supaya orang yang kebetulan masih punya sesi aktif (mis. lupa logout
 * di komputer bersama) tidak bisa asal ganti password tanpa tahu
 * password lamanya.
 */
function updateProfilSaya(username, dataBaru) {
  if (!dataBaru || typeof dataBaru !== 'object') {
    return { success: false, message: 'Data yang dikirim tidak valid.' };
  }

  const ss = getMasterGuruSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== username) continue;
    const baris = i + 1;

    // PATCH: dipecah jadi 2 FASE -- VALIDASI dulu semuanya (tidak
    // menyentuh sheet sama sekali di fase ini), baru TULIS semuanya di
    // fase kedua kalau seluruh validasi lolos. Sebelumnya nama & password
    // divalidasi-lalu-langsung-ditulis satu-satu secara berurutan --
    // kalau nama berhasil ditulis tapi password baru gagal validasi
    // (mis. password lama salah), yang terjadi "gagal" tapi nama-nya
    // sudah kadung tersimpan (update sebagian). Sekarang dijamin
    // semua-berhasil ATAU semua-gagal, tidak ada kondisi di tengah.
    let namaBaru = null;
    let saltBaru = null;
    let hashBaru = null;
    const perubahan = [];

    // --- FASE 1a: validasi nama (opsional) ---
    if (dataBaru.nama && String(dataBaru.nama).trim() !== '') {
      namaBaru = String(dataBaru.nama).trim();
      const validasiNama = validateInput(namaBaru, 'nama');
      if (validasiNama !== true) {
        return { success: false, message: 'Nama tidak valid: ' + validasiNama };
      }
      perubahan.push('nama');
    }

    // --- FASE 1b: validasi password (opsional) ---
    if (dataBaru.passwordBaru) {
      if (!dataBaru.passwordLama) {
        return { success: false, message: 'Isi password lama untuk mengganti password.' };
      }

      const storedHash = data[i][7];
      const storedSalt = data[i][6];
      let passwordLamaValid;
      if (storedHash && storedHash !== '') {
        passwordLamaValid = (hashPassword(dataBaru.passwordLama, storedSalt) === storedHash);
      } else {
        // Akun lama yang belum pernah login sejak sistem hash aktif.
        passwordLamaValid = (data[i][1] === dataBaru.passwordLama);
      }
      if (!passwordLamaValid) {
        return { success: false, message: 'Password lama tidak sesuai.' };
      }

      const passwordBaruStr = String(dataBaru.passwordBaru);
      if (passwordBaruStr.length < 6) {
        return { success: false, message: 'Password baru minimal 6 karakter.' };
      }

      saltBaru = generateSalt();
      hashBaru = hashPassword(passwordBaruStr, saltBaru);
      perubahan.push('password');
    }

    if (perubahan.length === 0) {
      return { success: false, message: 'Tidak ada perubahan yang dikirim.' };
    }

    // --- FASE 2: semua validasi lolos -- baru sekarang tulis ke sheet ---
    if (namaBaru !== null) {
      sheet.getRange(baris, 3).setValue(namaBaru); // kolom C = nama
    }
    if (hashBaru !== null) {
      sheet.getRange(baris, 7).setValue(saltBaru);  // kolom G: salt
      sheet.getRange(baris, 8).setValue(hashBaru);  // kolom H: password_hash
      sheet.getRange(baris, 2).clearContent();      // kolom B: pastikan plaintext lama (kalau masih ada) ikut terhapus
    }

    return { success: true, message: 'Berhasil memperbarui ' + perubahan.join(' & ') + '.' };
  }

  return { success: false, message: 'Akun tidak ditemukan.' };
}

/**
 * Upload foto profil dari data base64 (dikirim dari <input type="file">
 * di frontend, sudah dikonversi & DIKOMPRES/DIRESIZE di sisi klien
 * sebelum dikirim -- lihat js/profil.js -- supaya payload tetap kecil
 * dan tidak membebani kuota Apps Script/Drive).
 *
 * Foto lama (kalau ada) otomatis dipindah ke Sampah supaya tidak
 * menumpuk file yatim piatu di folder Drive tiap kali ganti foto.
 */
function uploadFotoProfilSaya(username, base64Data, mimeType) {
  if (!DRIVE_FOLDER_FOTO_PROFIL_ID || DRIVE_FOLDER_FOTO_PROFIL_ID.indexOf('GANTI_DENGAN_ID') === 0) {
    return { success: false, message: 'DRIVE_FOLDER_FOTO_PROFIL_ID belum diisi -- hubungi admin aplikasi untuk mengaktifkan fitur ini.' };
  }
  if (!base64Data) {
    return { success: false, message: 'Data foto tidak boleh kosong.' };
  }

  const ss = getMasterGuruSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== username) continue;
    const baris = i + 1;

    // Hapus foto lama (kalau ada) supaya tidak menumpuk file yatim piatu.
    const fotoLamaId = data[i][8];
    if (fotoLamaId) {
      try { DriveApp.getFileById(fotoLamaId).setTrashed(true); } catch (e) { /* sudah tidak ada / sudah terhapus, abaikan */ }
    }

    try {
      const bytes = Utilities.base64Decode(base64Data);
      const blob = Utilities.newBlob(bytes, mimeType || 'image/jpeg', 'foto_profil_' + username);
      const folder = DriveApp.getFolderById(DRIVE_FOLDER_FOTO_PROFIL_ID);
      const file = folder.createFile(blob);
      // WAJIB "anyone with link can view" -- supaya bisa ditampilkan
      // langsung lewat <img src="..."> di frontend tanpa perlu login
      // Google terpisah untuk memuat gambarnya.
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      sheet.getRange(baris, KOLOM_FOTO_PROFIL_1INDEXED).setValue(file.getId());

      return {
        success: true,
        message: 'Foto profil berhasil diperbarui.',
        data: { fotoUrl: buatUrlFotoProfil_(file.getId()) }
      };
    } catch (e) {
      return { success: false, message: 'Gagal mengunggah foto: ' + e.message };
    }
  }

  return { success: false, message: 'Akun tidak ditemukan.' };
}
