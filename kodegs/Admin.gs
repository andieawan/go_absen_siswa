// =========================================================
// TAHAP 3: PANEL ADMIN -- KELOLA AKUN GURU
// ---------------------------------------------------------
// Menggantikan kebiasaan lama "edit sheet Akun_Guru manual" untuk
// tugas sehari-hari (tambah guru baru, ganti mapel/kelas yang diampu,
// reset password yang lupa, nonaktifkan akun yang sudah tidak dipakai).
// Otorisasi (siapa boleh panggil fungsi mana) DIJAGA DI Router.gs, file
// ini fokus ke logikanya saja -- lihat komentar per fungsi untuk syarat
// role yang seharusnya menjaganya di Router.gs.
//
// PENTING soal "hapus akun": SENGAJA TIDAK ADA fungsi hapus baris akun
// permanen -- sama seperti filosofi data siswa (lihat catatan di
// Absensi.gs), riwayat absen yang sudah tersimpan (kolom "Nama Guru")
// mereferensikan nama guru itu sebagai teks, jadi menghapus akunnya
// tidak akan merusak data lama, TAPI menghapus BARIS-nya bisa
// menggeser baris guru lain di bawahnya kalau ada kode lain yang
// pernah mengandalkan nomor baris tertentu. Nonaktifkan (lewat role
// "nonaktif") jauh lebih aman: guru itu tidak bisa login lagi, tapi
// jejaknya di sheet & histori tetap utuh.
// =========================================================

// Kolom di sheet Akun_Guru (0-based, dipakai baca array data[i][...]):
// 0=username, 1=password_plaintext(legacy), 2=nama, 3=mapelList,
// 4=kelasList, 5=kelasWali, 6=salt, 7=password_hash,
// 8=FotoProfilFileId, 9=Role

/**
 * Daftar semua akun guru untuk ditampilkan di tabel Panel Admin.
 * SENGAJA TIDAK menyertakan password/hash/salt/fotoProfilFileId --
 * data itu sensitif dan tidak perlu dikirim ke frontend sama sekali
 * untuk keperluan menampilkan daftar akun.
 *
 * Syarat Router.gs: punyaRole(akun, 'admin') atau punyaRole(akun, 'superadmin').
 */
function getDaftarAkunUntukAdmin() {
  const ss = getMasterGuruSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();

  const daftar = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue; // lewati baris kosong
    daftar.push({
      username: data[i][0],
      nama: data[i][2],
      mapelList: String(data[i][3] || '').split(',').map(s => s.trim()).filter(s => s !== ''),
      kelasList: String(data[i][4] || '').split(',').map(s => s.trim()).filter(s => s !== ''),
      kelasWali: data[i][5] ? String(data[i][5]).trim() : '',
      roleList: parseRoleList(data[i][KOLOM_ROLE_0INDEXED])
    });
  }

  daftar.sort((a, b) => a.nama.localeCompare(b.nama));
  return { success: true, data: daftar };
}

// Validasi format username: huruf kecil, angka, underscore, 3-30
// karakter, tanpa spasi -- aturan sederhana, bukan lewat validateInput()
// di Utils.gs supaya tidak mengubah validator yang sudah dipakai
// fitur lain (absensi, dst).
function validasiFormatUsername(username) {
  const u = String(username || '').trim();
  if (u.length < 3 || u.length > 30) return 'Username harus 3-30 karakter.';
  if (!/^[a-z0-9_]+$/.test(u)) return 'Username hanya boleh huruf kecil, angka, dan underscore (tanpa spasi).';
  return true;
}

/**
 * Tambah akun guru baru. `dataBaru`:
 *   { username, nama, password, mapelList (csv/array), kelasList (csv/array),
 *     kelasWali, roleList (csv, opsional -- default "guru") }
 * Password langsung di-hash saat disimpan (TIDAK PERNAH disimpan
 * plaintext, walau cuma sesaat) -- beda dengan alur login lama yang
 * masih punya jalur legacy plaintext untuk akun yang sudah ada sebelum
 * sistem hash aktif.
 *
 * Syarat Router.gs: punyaRole(akun, 'admin') atau punyaRole(akun, 'superadmin').
 */
function tambahAkunGuru(dataBaru) {
  if (!dataBaru || typeof dataBaru !== 'object') {
    return { success: false, message: 'Data yang dikirim tidak valid.' };
  }

  const username = String(dataBaru.username || '').trim().toLowerCase();
  const validasiUsername = validasiFormatUsername(username);
  if (validasiUsername !== true) return { success: false, message: validasiUsername };

  const nama = String(dataBaru.nama || '').trim();
  const validasiNama = validateInput(nama, 'nama');
  if (validasiNama !== true) return { success: false, message: 'Nama tidak valid: ' + validasiNama };

  const password = String(dataBaru.password || '');
  if (password.length < 6) return { success: false, message: 'Password minimal 6 karakter.' };

  const ss = getMasterGuruSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').toLowerCase() === username) {
      return { success: false, message: 'Username "' + username + '" sudah dipakai.' };
    }
  }

  const mapelListCsv = Array.isArray(dataBaru.mapelList) ? dataBaru.mapelList.join(',') : String(dataBaru.mapelList || '');
  const kelasListCsv = Array.isArray(dataBaru.kelasList) ? dataBaru.kelasList.join(',') : String(dataBaru.kelasList || '');
  const kelasWali = String(dataBaru.kelasWali || '').trim();
  const roleListCsv = String(dataBaru.roleList || 'guru').trim() || 'guru';

  const salt = generateSalt();
  const hash = hashPassword(password, salt);

  // Urutan kolom HARUS persis sama dengan struktur sheet yang sudah ada:
  // A..J = username, password_plaintext(kosong), nama, mapelList, kelasList,
  // kelasWali, salt, password_hash, fotoProfilFileId(kosong), role.
  sheet.appendRow([username, '', nama, mapelListCsv, kelasListCsv, kelasWali, salt, hash, '', roleListCsv]);

  const pesan = 'Akun "' + username + '" (' + nama + ') berhasil dibuat.';
  Logger.log(pesan);
  return { success: true, message: pesan };
}

/**
 * Update data akun guru yang SUDAH ADA -- nama, mapelList, kelasList,
 * kelasWali. SENGAJA TIDAK termasuk password (guru ganti sendiri lewat
 * Panel Profil, atau admin pakai resetPasswordAkunOlehAdmin() di bawah)
 * dan TIDAK termasuk role (perlu wewenang lebih tinggi -- lihat
 * updateRoleAkunOlehSuperAdmin()).
 *
 * Syarat Router.gs: punyaRole(akun, 'admin') atau punyaRole(akun, 'superadmin').
 */
function updateAkunGuru(username, dataBaru) {
  if (!dataBaru || typeof dataBaru !== 'object') {
    return { success: false, message: 'Data yang dikirim tidak valid.' };
  }

  const ss = getMasterGuruSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== username) continue;
    const baris = i + 1;

    if (dataBaru.nama && String(dataBaru.nama).trim() !== '') {
      const namaBaru = String(dataBaru.nama).trim();
      const validasiNama = validateInput(namaBaru, 'nama');
      if (validasiNama !== true) return { success: false, message: 'Nama tidak valid: ' + validasiNama };
      sheet.getRange(baris, 3).setValue(namaBaru);
    }
    if (dataBaru.mapelList !== undefined) {
      const mapelListCsv = Array.isArray(dataBaru.mapelList) ? dataBaru.mapelList.join(',') : String(dataBaru.mapelList || '');
      sheet.getRange(baris, 4).setValue(mapelListCsv);
    }
    if (dataBaru.kelasList !== undefined) {
      const kelasListCsv = Array.isArray(dataBaru.kelasList) ? dataBaru.kelasList.join(',') : String(dataBaru.kelasList || '');
      sheet.getRange(baris, 5).setValue(kelasListCsv);
    }
    if (dataBaru.kelasWali !== undefined) {
      sheet.getRange(baris, 6).setValue(String(dataBaru.kelasWali || '').trim());
    }

    const pesan = 'Akun "' + username + '" berhasil diperbarui.';
    Logger.log(pesan);
    return { success: true, message: pesan };
  }

  return { success: false, message: 'Akun "' + username + '" tidak ditemukan.' };
}

/**
 * Reset password akun guru (dipicu ADMIN, beda dari ganti password
 * mandiri di Panel Profil yang butuh password lama). Reuse
 * resetPasswordUser() yang sudah ada di MigrasiHash.gs -- tidak
 * duplikasi logika hash+salt.
 *
 * Syarat Router.gs: punyaRole(akun, 'admin') atau punyaRole(akun, 'superadmin').
 */
function resetPasswordAkunOlehAdmin(username, passwordBaru) {
  const pw = String(passwordBaru || '');
  if (pw.length < 6) return { success: false, message: 'Password baru minimal 6 karakter.' };

  const hasil = resetPasswordUser(username, pw); // dari MigrasiHash.gs
  const berhasil = hasil.indexOf('berhasil') !== -1;
  return { success: berhasil, message: hasil };
}

/**
 * Nonaktifkan / aktifkan kembali akun guru -- lewat penanda role
 * "nonaktif" (dicek di handleLogin(), Auth.gs), BUKAN menghapus baris
 * sama sekali (lihat penjelasan di komentar atas file ini). Role lain
 * yang sudah ada (guru/admin/dst) TETAP tersimpan apa adanya -- kalau
 * nanti diaktifkan lagi, semua haknya otomatis kembali seperti semula.
 *
 * Syarat Router.gs: punyaRole(akun, 'admin') atau punyaRole(akun, 'superadmin').
 */
function nonaktifkanAkunGuru(username) {
  return tambahRoleAkun(username, 'nonaktif');
}

function aktifkanKembaliAkunGuru(username) {
  const ss = getMasterGuruSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== username) continue;
    const rolesSekarang = parseRoleList(data[i][KOLOM_ROLE_0INDEXED]).filter(r => r !== 'nonaktif');
    const gabungan = rolesSekarang.join(',') || 'guru';
    sheet.getRange(i + 1, KOLOM_ROLE_1INDEXED).setValue(gabungan);
    const pesan = 'Akun "' + username + '" berhasil diaktifkan kembali.';
    Logger.log(pesan);
    return { success: true, message: pesan };
  }

  return { success: false, message: 'Akun "' + username + '" tidak ditemukan.' };
}

/**
 * Ubah SELURUH daftar role akun -- WEWENANG PALING SENSITIF di Panel
 * Admin, karena ini bisa menaikkan/menurunkan siapa saja jadi
 * admin/superadmin. Fungsi ini murni membungkus aturRoleAkun() yang
 * sudah ada di Roles.gs, TIDAK menambah logika baru -- pemisahannya
 * yang penting ada di Router.gs (action ini WAJIB dicek
 * punyaRole(akun, 'superadmin') SAJA, admin biasa TIDAK boleh).
 */
function updateRoleAkunOlehSuperAdmin(username, roleCsvBaru) {
  const hasil = aturRoleAkun(username, roleCsvBaru); // dari Roles.gs
  const berhasil = hasil.indexOf('Berhasil') !== -1;
  return { success: berhasil, message: hasil };
}
