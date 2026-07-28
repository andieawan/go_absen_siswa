// =========================================================
// TAHAP 1: FONDASI SISTEM PERAN (Role)
// ---------------------------------------------------------
// Kolom baru di sheet Akun_Guru: "Role" -- kolom J (index 9, 0-based;
// getRange kolom 10, 1-based). Format SAMA seperti mapelList/kelasList
// yang sudah ada: dipisah koma, contoh isi "guru", "guru,admin",
// "superadmin", "kepsek". Kosong = otomatis dianggap "guru" (akun lama
// yang sudah ada sebelum fitur ini TIDAK perlu diubah apa pun).
//
// Katalog peran yang didukung (bebas nambah role baru di masa depan,
// tidak perlu daftar tertutup -- kode ini cuma cek string, tidak
// membatasi nilai yang boleh dipakai):
//   guru       - peran dasar/default, akses kelas+mapel yang diampu
//   admin      - kelola akun guru & siswa, reset semester, dashboard sekolah
//   superadmin - semua yang admin bisa, PLUS atur role akun lain & config inti
//   kepsek     - lihat-lihat saja: dashboard & tren seluruh sekolah, read-only
//
// 1 akun BOLEH punya lebih dari 1 role sekaligus (mis. wakasek yang juga
// mengajar: "guru,admin").
// =========================================================

const KOLOM_ROLE_0INDEXED = 9;  // kolom J, dipakai baca array data[i][...]
const KOLOM_ROLE_1INDEXED = 10; // kolom J, dipakai sheet.getRange(baris, ...)

// Ubah nilai mentah kolom Role ("guru,admin" atau kosong) jadi array
// role huruf kecil semua (supaya perbandingan tidak case-sensitive),
// default ['guru'] kalau kolomnya kosong -- SATU-SATUNYA tempat logika
// default ini didefinisikan, dipanggil dari getAkunGuru() & handleLogin()
// di Auth.gs supaya keduanya SELALU konsisten (lihat catatan "FIX KRITIS"
// di Auth.gs soal riwayat bug akibat 2 tempat itu tidak sinkron -- jangan
// sampai kejadian lagi untuk field roleList ini).
function parseRoleList(rawValue) {
  const roles = String(rawValue || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s !== '');
  return roles.length > 0 ? roles : ['guru'];
}

// Cek apakah objek akun (hasil getAkunGuru() atau data login) punya 1
// role tertentu. Dipakai di Router.gs sebagai pengganti/tambahan dari
// pengecekan akun.mapelList/kelasList yang sudah ada, untuk action yang
// butuh peran khusus (admin/superadmin/kepsek).
function punyaRole(akun, role) {
  return !!(akun && Array.isArray(akun.roleList) && akun.roleList.indexOf(String(role).toLowerCase()) !== -1);
}

/**
 * Tambahkan 1 role ke akun (TIDAK menghapus role yang sudah ada -- mis.
 * kalau akun sudah "guru", dipanggil tambahRoleAkun(user, 'admin') hasil
 * akhirnya "guru,admin", bukan menimpa jadi "admin" saja). Ini yang
 * dipakai jadikanSuperAdmin() di bawah, dan nanti juga dipakai fitur
 * "beri peran" di Panel Admin (Tahap 3).
 */
function tambahRoleAkun(username, roleBaru) {
  const ss = getMasterGuruSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== username) continue;
    const rolesSekarang = parseRoleList(data[i][KOLOM_ROLE_0INDEXED]);
    const roleBaruLower = String(roleBaru).trim().toLowerCase();
    if (rolesSekarang.indexOf(roleBaruLower) === -1) rolesSekarang.push(roleBaruLower);

    const gabungan = rolesSekarang.join(',');
    sheet.getRange(i + 1, KOLOM_ROLE_1INDEXED).setValue(gabungan);
    const pesan = 'Berhasil. Role akun "' + username + '" sekarang: "' + gabungan + '".';
    Logger.log(pesan);
    return pesan;
  }

  const pesan = 'Akun "' + username + '" tidak ditemukan.';
  Logger.log(pesan);
  return pesan;
}

/**
 * Timpa SELURUH daftar role akun (bukan ditambah seperti
 * tambahRoleAkun() -- ini mengganti total). Dipakai kalau perlu
 * mengoreksi/menghapus role tertentu, mis. mencabut status admin
 * seseorang: aturRoleAkun('budi123', 'guru') mengembalikan akun itu
 * jadi guru biasa lagi, menghapus "admin" yang sebelumnya ada.
 *
 *   aturRoleAkun('budi123', 'guru,admin');
 */
function aturRoleAkun(username, roleCsvBaru) {
  const ss = getMasterGuruSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== username) continue;
    sheet.getRange(i + 1, KOLOM_ROLE_1INDEXED).setValue(roleCsvBaru);
    const pesan = 'Berhasil. Role akun "' + username + '" sekarang: "' + roleCsvBaru + '".';
    Logger.log(pesan);
    return pesan;
  }

  const pesan = 'Akun "' + username + '" tidak ditemukan.';
  Logger.log(pesan);
  return pesan;
}

/**
 * BOOTSTRAP -- jalankan MANUAL 1x dari editor Apps Script untuk
 * menetapkan Super Admin PERTAMA (belum ada UI untuk ini, karena UI
 * kelola-role itu sendiri baru bisa dipakai SETELAH ada Super Admin
 * pertama -- ayam-telur). Setelah ini, Super Admin itu yang bisa kasih
 * peran ke akun lain lewat aplikasi (Tahap 3).
 *
 *   jadikanSuperAdmin('username_kamu');
 */
function jadikanSuperAdmin(username) {
  return tambahRoleAkun(username, 'superadmin');
}
