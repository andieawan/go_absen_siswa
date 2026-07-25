// =========================================================
// DELEGASI INPUT ABSEN HARIAN KE KETUA KELAS (FITUR SEMENTARA)
// ---------------------------------------------------------
// Fitur ini memungkinkan wali kelas membuat SATU link sekali-pakai per
// kelas yang bisa dibagikan ke ketua kelas, supaya ketua kelas bisa ikut
// mengisi absensi harian TANPA perlu akun guru sendiri -- mempercepat
// proses kalau wali kelas berhalangan/sibuk. Ini bersifat SEMENTARA dan
// opsional: hanya aktif kalau wali kelas sengaja mengaktifkannya, dan
// wali kelas juga yang bisa menonaktifkannya kapan saja.
//
// BATASAN KEAMANAN PENTING (disengaja):
// 1. Link HANYA bisa dipakai untuk mengisi absensi TANGGAL HARI INI --
//    tanggal SELALU diambil dari waktu server (bukan dari input/URL),
//    supaya ketua kelas tidak bisa mengubah data hari-hari sebelumnya
//    atau menandai hari yang belum terjadi.
// 2. Link HANYA bisa submit absensi -- tidak ada akses ke dashboard,
//    rekap, riwayat, atau kelas/mapel lain sama sekali.
// 3. Token bersifat rahasia (UUID acak) dan hanya berlaku selama status
//    "Aktif" masih TRUE di sheet Token_KetuaKelas -- begitu wali kelas
//    menonaktifkan, link lama otomatis langsung tidak berlaku lagi.
// 4. Hanya wali kelas kelas yang bersangkutan yang bisa membuat/
//    menonaktifkan token (divalidasi lewat verifikasiToken() + kelasWali
//    seperti action wali kelas lainnya di Router.gs).
// =========================================================

const SHEET_TOKEN_KETUA_KELAS = 'Token_KetuaKelas';

function getSheetTokenKetuaKelas() {
  // PATCH INTEGRASI: sheet token ini terkait otorisasi wali kelas (guru),
  // jadi disimpan di spreadsheet Master Guru, bukan Master Siswa.
  const ss = getMasterGuruSs();
  let sheet = ss.getSheetByName(SHEET_TOKEN_KETUA_KELAS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TOKEN_KETUA_KELAS);
    sheet.appendRow(['Kelas', 'Token', 'Aktif', 'DibuatOleh', 'TanggalDibuat']);
  }
  return sheet;
}

function cariBarisTokenKelas(sheet, kelas) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === kelas) return i + 1; // nomor baris (1-indexed utk Range)
  }
  return -1;
}

/**
 * Buat/perbarui token untuk 1 kelas dan aktifkan. Dipanggil oleh wali
 * kelas dari dalam aplikasi (lewat handleGetDenganValidasi + cek kelasWali
 * di Router.gs, sama seperti action wali kelas lainnya).
 */
function generateKetuaKelasToken(kelas, dibuatOleh) {
  const sheet = getSheetTokenKetuaKelas();
  const token = Utilities.getUuid().replace(/-/g, '');
  const sekarang = new Date();
  const baris = cariBarisTokenKelas(sheet, kelas);

  if (baris !== -1) {
    sheet.getRange(baris, 2, 1, 4).setValues([[token, true, dibuatOleh, sekarang]]);
  } else {
    sheet.appendRow([kelas, token, true, dibuatOleh, sekarang]);
  }

  return { success: true, data: { token: token, aktif: true } };
}

/**
 * Cek status token aktif untuk 1 kelas (dipanggil wali kelas saat buka
 * panel Input > sub-menu Wali Kelas, supaya UI tahu apakah link sedang
 * aktif atau tidak tanpa perlu generate token baru).
 */
function getStatusKetuaKelasToken(kelas) {
  const sheet = getSheetTokenKetuaKelas();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === kelas) {
      const aktif = data[i][2] === true;
      return { success: true, data: { aktif: aktif, token: aktif ? data[i][1] : null } };
    }
  }
  return { success: true, data: { aktif: false, token: null } };
}

/**
 * Nonaktifkan token untuk 1 kelas. Setelah ini, link lama yang sudah
 * dibagikan ke ketua kelas TIDAK BISA dipakai lagi sama sekali.
 */
function nonaktifkanKetuaKelasToken(kelas) {
  const sheet = getSheetTokenKetuaKelas();
  const baris = cariBarisTokenKelas(sheet, kelas);
  if (baris === -1) {
    return { success: true, message: 'Tidak ada link aktif untuk kelas ini.' };
  }
  sheet.getRange(baris, 3).setValue(false);
  return { success: true, message: 'Link ketua kelas berhasil dinonaktifkan.' };
}

/**
 * Validasi token dari link ketua kelas. Mengembalikan nama kelas kalau
 * valid & aktif, atau invalid kalau token salah/sudah dinonaktifkan.
 */
function verifikasiTokenKetuaKelas(token) {
  if (!token) return { valid: false, message: 'Link tidak valid.' };

  const sheet = getSheetTokenKetuaKelas();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === token) {
      if (data[i][2] !== true) {
        return { valid: false, message: 'Link ini sudah dinonaktifkan oleh wali kelas. Hubungi wali kelas Anda untuk link terbaru.' };
      }
      return { valid: true, kelas: data[i][0] };
    }
  }
  return { valid: false, message: 'Link tidak ditemukan atau sudah tidak berlaku.' };
}

/**
 * Endpoint PUBLIK (tanpa login) yang dipanggil dari halaman ketua kelas:
 * validasi token, lalu kembalikan nama kelas + daftar siswa + absensi
 * yang sudah terisi HARI INI (kalau ada) supaya form bisa langsung
 * ke-prefill sama seperti panel Wali Kelas biasa.
 */
function getInfoUntukKetuaKelas(token) {
  const cek = verifikasiTokenKetuaKelas(token);
  if (!cek.valid) return { success: false, message: cek.message };

  const kelas = cek.kelas;
  const tanggalHariIni = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');

  const students = getStudents(kelas);
  const existing = getAbsenWaliExisting(kelas, tanggalHariIni);

  return {
    success: true,
    data: {
      kelas: kelas,
      tanggal: tanggalHariIni,
      students: students.data || [],
      existing: (existing.success && existing.data) ? existing.data : {}
    }
  };
}

/**
 * Endpoint PUBLIK (tanpa login) untuk submit absensi lewat link ketua
 * kelas. Tanggal SELALU dipaksa ke tanggal server hari ini -- parameter
 * tanggal dari klien (kalau ada) diabaikan sepenuhnya, supaya ketua kelas
 * tidak bisa mengisi/mengubah data di luar hari ini.
 */
function submitAbsenViaKetuaKelas(token, dataKehadiran) {
  const cek = verifikasiTokenKetuaKelas(token);
  if (!cek.valid) return { success: false, message: cek.message };

  const tanggalHariIni = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
  return simpanAbsenWali(cek.kelas, tanggalHariIni, dataKehadiran, 'Ketua Kelas (Delegasi)');
}
