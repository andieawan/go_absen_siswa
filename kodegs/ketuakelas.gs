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
// 1. SECARA DEFAULT, link HANYA bisa dipakai untuk mengisi absensi
//    TANGGAL HARI INI -- tanggal SELALU diambil dari waktu server (bukan
//    dari input/URL), supaya ketua kelas tidak bisa mengubah data
//    hari-hari sebelumnya atau menandai hari yang belum terjadi.
// 2. PATCH (mode per tanggal, opsional & per-kelas): kalau wali kelas
//    butuh bantuan ketua kelas untuk MEREKAP absensi hari-hari
//    sebelumnya (mis. setelah 2 minggu absensi manual belum sempat
//    diinput), pengelola aplikasi (developer/IT sekolah) bisa
//    mengaktifkan "mode per tanggal" khusus untuk kelas tertentu lewat
//    fungsi aktifkanModePerTanggalKetuaKelas(kelas) yang dijalankan
//    MANUAL dari editor Apps Script (sama seperti resetPasswordUser()/
//    setupConfig()) -- BUKAN lewat tombol di aplikasi web, supaya
//    kemampuan mengedit tanggal bebas ini tetap di bawah kendali orang
//    yang punya akses ke project Apps Script, bukan wali kelas atau
//    ketua kelas sendiri. Begitu mode ini aktif untuk kelas X, halaman
//    ketua kelas kelas X akan menampilkan date-picker (bebas pilih
//    tanggal apa saja); kalau tidak aktif, perilaku tetap seperti
//    semula (hari ini saja, tidak bisa diubah).
// 3. Link HANYA bisa submit absensi -- tidak ada akses ke dashboard,
//    rekap, riwayat, atau kelas/mapel lain sama sekali.
// 4. Token bersifat rahasia (UUID acak) dan hanya berlaku selama status
//    "Aktif" masih TRUE di sheet Token_KetuaKelas -- begitu wali kelas
//    menonaktifkan, link lama otomatis langsung tidak berlaku lagi.
// 5. Hanya wali kelas kelas yang bersangkutan yang bisa membuat/
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
    // PATCH: kolom ke-6 "ModePerTanggalAktif" -- lihat catatan poin 2 di
    // atas. Default FALSE untuk kelas baru.
    sheet.appendRow(['Kelas', 'Token', 'Aktif', 'DibuatOleh', 'TanggalDibuat', 'ModePerTanggalAktif']);
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
    // PATCH: hanya timpa kolom Token/Aktif/DibuatOleh/TanggalDibuat (B-E).
    // Kolom F (ModePerTanggalAktif) SENGAJA TIDAK disentuh di sini supaya
    // pengaturan mode per tanggal yang sudah diset manual lewat Apps
    // Script tidak ikut ke-reset setiap kali wali kelas generate ulang
    // link-nya.
    sheet.getRange(baris, 2, 1, 4).setValues([[token, true, dibuatOleh, sekarang]]);
  } else {
    sheet.appendRow([kelas, token, true, dibuatOleh, sekarang, false]);
  }

  return { success: true, data: { token: token, aktif: true } };
}

/**
 * Cek status token aktif untuk 1 kelas (dipanggil wali kelas saat buka
 * panel Input > sub-menu Wali Kelas, supaya UI tahu apakah link sedang
 * aktif atau tidak tanpa perlu generate token baru). Ikut mengembalikan
 * status mode-per-tanggal supaya wali kelas juga tahu (read-only,
 * informasional -- wali kelas TIDAK bisa mengubahnya sendiri dari sini).
 */
function getStatusKetuaKelasToken(kelas) {
  const sheet = getSheetTokenKetuaKelas();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === kelas) {
      const aktif = data[i][2] === true;
      const modePerTanggal = data[i][5] === true;
      return { success: true, data: { aktif: aktif, token: aktif ? data[i][1] : null, modePerTanggal: modePerTanggal } };
    }
  }
  return { success: true, data: { aktif: false, token: null, modePerTanggal: false } };
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

// =========================================================
// PATCH: MODE PER TANGGAL -- KONTROL MANUAL LEWAT APPS SCRIPT
// ---------------------------------------------------------
// Fungsi-fungsi di bawah ini TIDAK dipanggil dari aplikasi web sama
// sekali -- dijalankan MANUAL dari editor Apps Script oleh siapa pun
// yang mengelola project ini (developer/IT sekolah), sama seperti
// setupConfig()/resetPasswordUser(). Ini sengaja dibuat begini (bukan
// tombol di UI wali kelas ataupun akun admin terpisah) supaya kemampuan
// mengedit absensi tanggal bebas -- yang punya risiko lebih tinggi
// dibanding mode "hari ini saja" -- tetap di bawah kendali orang yang
// punya akses langsung ke backend, bukan bisa diaktifkan sendiri oleh
// wali kelas atau ketua kelas.
// =========================================================

/**
 * Jalankan manual dari editor Apps Script untuk MENGAKTIFKAN mode per
 * tanggal untuk 1 kelas -- setelah ini, ketua kelas kelas tsb bisa pilih
 * tanggal APA SAJA (masa lalu maupun masa depan) saat mengisi absensi
 * lewat link delegasinya, bukan cuma hari ini.
 *
 * Contoh pemakaian (ketik di editor Apps Script lalu klik Run):
 *   aktifkanModePerTanggalKetuaKelas('XI DKV 1');
 */
function aktifkanModePerTanggalKetuaKelas(kelas) {
  return setModePerTanggalKetuaKelas_(kelas, true);
}

/**
 * Jalankan manual dari editor Apps Script untuk MENGEMBALIKAN kelas ke
 * mode default (hari ini saja) setelah proses rekap selesai.
 *
 * Contoh pemakaian:
 *   nonaktifkanModePerTanggalKetuaKelas('XI DKV 1');
 */
function nonaktifkanModePerTanggalKetuaKelas(kelas) {
  return setModePerTanggalKetuaKelas_(kelas, false);
}

function setModePerTanggalKetuaKelas_(kelas, aktif) {
  if (!kelas) throw new Error('Isi nama kelas, contoh: aktifkanModePerTanggalKetuaKelas("XI DKV 1")');

  const sheet = getSheetTokenKetuaKelas();
  const baris = cariBarisTokenKelas(sheet, kelas);

  if (baris !== -1) {
    sheet.getRange(baris, 6).setValue(aktif);
  } else {
    // Kelas ini belum pernah generate link sama sekali -- tetap buat
    // barisnya supaya pengaturan mode per tanggal tersimpan duluan,
    // link-nya (Token/Aktif) menyusul dibuat wali kelas dari aplikasi.
    sheet.appendRow([kelas, '', false, '', '', aktif]);
  }

  const pesan = 'Mode per tanggal untuk kelas "' + kelas + '" sekarang: ' + (aktif ? 'AKTIF' : 'NONAKTIF');
  Logger.log(pesan);
  return { success: true, message: pesan };
}

/**
 * Jalankan manual dari editor Apps Script untuk melihat status mode per
 * tanggal SEMUA kelas yang tercatat di sheet Token_KetuaKelas sekaligus
 * (cek hasilnya di tab "Executions" atau lewat Logger.log setelah Run).
 */
function lihatStatusModePerTanggalSemuaKelas() {
  const sheet = getSheetTokenKetuaKelas();
  const data = sheet.getDataRange().getValues();
  const laporan = [];
  for (let i = 1; i < data.length; i++) {
    laporan.push({
      kelas: data[i][0],
      linkAktif: data[i][2] === true,
      modePerTanggalAktif: data[i][5] === true
    });
  }
  Logger.log(JSON.stringify(laporan, null, 2));
  return laporan;
}

function getModePerTanggalKelas_(kelas) {
  const sheet = getSheetTokenKetuaKelas();
  const baris = cariBarisTokenKelas(sheet, kelas);
  if (baris === -1) return false;
  return sheet.getRange(baris, 6).getValue() === true;
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
 * Validasi format tanggal "yyyy-MM-dd" sederhana (tanpa membatasi
 * rentang -- sesuai keputusan: mode per tanggal boleh pilih tanggal
 * apa saja, masa lalu maupun masa depan, begitu diaktifkan untuk kelas
 * tsb). Ini hanya memastikan formatnya benar, bukan membatasi rentang.
 */
function formatTanggalValid_(tanggal) {
  return typeof tanggal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(tanggal) && !isNaN(new Date(tanggal + 'T00:00:00').getTime());
}

/**
 * Endpoint PUBLIK (tanpa login) yang dipanggil dari halaman ketua kelas:
 * validasi token, lalu kembalikan nama kelas + daftar siswa + absensi
 * yang sudah terisi untuk tanggal yang relevan, supaya form bisa langsung
 * ke-prefill.
 *
 * @param {string} token - Token dari link ketua kelas
 * @param {string} [tanggalDiminta] - Opsional, format "yyyy-MM-dd".
 *   HANYA dipakai kalau mode-per-tanggal AKTIF untuk kelas ini; kalau
 *   tidak aktif atau tidak diisi/format salah, selalu pakai tanggal
 *   server hari ini (perilaku default/aman).
 */
function getInfoUntukKetuaKelas(token, tanggalDiminta) {
  const cek = verifikasiTokenKetuaKelas(token);
  if (!cek.valid) return { success: false, message: cek.message };

  const kelas = cek.kelas;
  const modePerTanggal = getModePerTanggalKelas_(kelas);
  const tanggalHariIni = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');

  const tanggalDipakai = (modePerTanggal && formatTanggalValid_(tanggalDiminta))
    ? tanggalDiminta
    : tanggalHariIni;

  const students = getStudents(kelas);
  const existing = getAbsenWaliExisting(kelas, tanggalDipakai);

  return {
    success: true,
    data: {
      kelas: kelas,
      tanggal: tanggalDipakai,
      modePerTanggal: modePerTanggal,
      students: students.data || [],
      existing: (existing.success && existing.data) ? existing.data : {}
    }
  };
}

/**
 * Endpoint PUBLIK (tanpa login) untuk submit absensi lewat link ketua
 * kelas.
 *
 * PERILAKU TANGGAL:
 * - Kalau mode-per-tanggal TIDAK aktif untuk kelas ini (default): tanggal
 *   SELALU dipaksa ke tanggal server hari ini -- parameter tanggal dari
 *   klien diabaikan sepenuhnya, sama seperti sebelumnya.
 * - Kalau mode-per-tanggal AKTIF (lewat aktifkanModePerTanggalKetuaKelas()
 *   di atas): tanggal dari klien dipakai (bebas, tanpa batas rentang),
 *   selama formatnya valid.
 */
function submitAbsenViaKetuaKelas(token, tanggalDiminta, dataKehadiran) {
  const cek = verifikasiTokenKetuaKelas(token);
  if (!cek.valid) return { success: false, message: cek.message };

  const kelas = cek.kelas;
  const modePerTanggal = getModePerTanggalKelas_(kelas);
  const tanggalHariIni = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');

  let tanggalDipakai = tanggalHariIni;
  if (modePerTanggal) {
    if (!formatTanggalValid_(tanggalDiminta)) {
      return { success: false, message: 'Format tanggal tidak valid.' };
    }
    tanggalDipakai = tanggalDiminta;
  }

  return simpanAbsenWali(kelas, tanggalDipakai, dataKehadiran, 'Ketua Kelas (Delegasi)');
}
