// =========================================================
// --- TOKEN SESI & VALIDASI HAK AKSES ---
// =========================================================
function getSessionSecret() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('SESSION_SECRET_KEY');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SESSION_SECRET_KEY', secret);
  }
  return secret;
}

function hmacHex(payload) {
  const bytes = Utilities.computeHmacSha256Signature(payload, getSessionSecret());
  return bytes.map(b => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0')).join('');
}

function buatToken(username) {
  const expiry = Date.now() + SESSION_DURATION_MS;
  const payload = username + '|' + expiry;
  return payload + '|' + hmacHex(payload);
}

function verifikasiToken(token, usernameDiharapkan) {
  if (!token || typeof token !== 'string') {
    return { valid: false, message: "Sesi tidak valid, silakan login ulang." };
  }
  const parts = token.split('|');
  if (parts.length !== 3) {
    return { valid: false, message: "Sesi tidak valid, silakan login ulang." };
  }
  const username = parts[0], expiryStr = parts[1], signature = parts[2];
  const expiry = Number(expiryStr);
  if (!expiry || Date.now() > expiry) {
    return { valid: false, message: "Sesi sudah habis, silakan login ulang." };
  }
  if (username !== usernameDiharapkan) {
    return { valid: false, message: "Sesi tidak cocok dengan akun ini, silakan login ulang." };
  }
  if (hmacHex(username + '|' + expiryStr) !== signature) {
    return { valid: false, message: "Sesi tidak valid, silakan login ulang." };
  }
  return { valid: true, username: username };
}

function getAkunGuru(username) {
  // PATCH INTEGRASI: identitas & akun guru sekarang di spreadsheet Master
  // Guru terpisah, dipakai bersama lintas aplikasi (lihat kodegs/Config.gs).
  const ss = getMasterGuruSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      return {
        username: data[i][0],
        nama: data[i][2],
        mapelList: String(data[i][3] || '').split(',').map(s => s.trim()).filter(s => s !== ''),
        kelasList: String(data[i][4] || '').split(',').map(s => s.trim()).filter(s => s !== ''),
        kelasWali: data[i][5] ? String(data[i][5]).trim() : '',
        // PATCH TAHAP 1 (sistem peran): lihat Roles.gs. WAJIB pakai
        // parseRoleList() yang SAMA dengan yang dipanggil handleLogin() di
        // bawah -- supaya kedua sumber data akun ini SELALU konsisten
        // bentuknya (lihat catatan "FIX KRITIS" di handleLogin() soal
        // riwayat bug akibat 2 tempat ini pernah tidak sinkron untuk
        // mapelList/kelasList; jangan sampai terulang untuk roleList).
        roleList: parseRoleList(data[i][KOLOM_ROLE_0INDEXED]),
        // PATCH: Pasangan Mapel-Kelas -- lihat PasanganMapelKelas.gs. WAJIB
        // pakai parsePasanganMapelKelas() yang SAMA dengan handleLogin() di
        // bawah, sama seperti alasan roleList di atas.
        pasanganMapelKelas: parsePasanganMapelKelas(data[i][KOLOM_PASANGAN_MAPEL_KELAS_0INDEXED])
      };
    }
  }
  return null;
}

function handleSubmitDenganValidasi(username, token, payload) {
  const cek = verifikasiToken(token, username);
  if (!cek.valid) return { success: false, message: cek.message, sessionExpired: true };

  const akun = getAkunGuru(username);
  if (!akun) return { success: false, message: "Akun tidak ditemukan." };

  // PATCH (pasangan mapel-kelas): sebelumnya mapel & kelas dicek
  // TERPISAH (akun.mapelList.indexOf(mapel) dan akun.kelasList.indexOf(kelas)
  // sendiri-sendiri) -- artinya guru yang mengajar DKV di "Kelas A" dan KIK
  // di "Kelas B" tetap lolos otorisasi kalau submit KIK untuk "Kelas A",
  // padahal pasangan itu tidak pernah benar. kelasBolehUntukMapel()
  // (PasanganMapelKelas.gs) memverifikasi PASANGANNYA, bukan cuma
  // keanggotaan masing-masing daftar secara independen -- dengan fallback
  // otomatis ke kelasList penuh kalau memang tidak ada pengecualian yang
  // didefinisikan admin untuk mapel itu (perilaku lama tetap jalan apa
  // adanya untuk semua akun yang belum diatur pengecualiannya).
  if (!kelasBolehUntukMapel(akun, payload.mapel, payload.kelas)) {
    return { success: false, message: "Anda tidak berhak mengisi absensi untuk mata pelajaran " + payload.mapel + " di kelas " + payload.kelas + "." };
  }

  payload.guru = akun.nama;
  return handleSubmit(payload);
}

function simpanAbsenWaliDenganValidasi(username, token, kelas, tanggal, dataKehadiran) {
  const cek = verifikasiToken(token, username);
  if (!cek.valid) return { success: false, message: cek.message, sessionExpired: true };

  const akun = getAkunGuru(username);
  if (!akun) return { success: false, message: "Akun tidak ditemukan." };

  if (!akun.kelasWali || akun.kelasWali !== kelas) {
    return { success: false, message: "Anda bukan wali kelas " + kelas + "." };
  }

  return simpanAbsenWali(kelas, tanggal, dataKehadiran);
}
// ===== SELESAI: TOKEN SESI & VALIDASI HAK AKSES =====

// --- LOGIN DENGAN PASSWORD HASHING ---
const MAX_PERCOBAAN_LOGIN = 5;
const DURASI_KUNCI_DETIK = 15 * 60;

// Hash password dengan SHA-256 + salt per user
function hashPassword(password, salt) {
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt);
  return rawHash.map(b => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0')).join('');
}

// Generate salt unik untuk setiap user
function generateSalt() {
  return Utilities.getUuid().replace(/-/g, '');
}

// PATCH BERSIH-BERSIH: getSaltForUser(), setPasswordHash(), dan
// getPasswordHashForUser() sebelumnya ada di sini tapi TIDAK PERNAH
// dipanggil dari mana pun di seluruh kodebase (beda dengan
// resetPasswordUser()/migrasiHashPassword() di kodegs/MigrasiHash.gs yang
// memang didokumentasikan di TESTING_CHECKLIST.md sebagai tool admin yang
// dijalankan manual dari editor Apps Script). getSaltForUser() jadi yatim
// piatu sejak patch performa handleLogin() (salt sekarang digenerate
// langsung dari baris yang sudah dimuat, tanpa scan ulang sheet).
// setPasswordHash()/getPasswordHashForUser() tidak pernah dipakai sama
// sekali sejak awal -- resetPasswordUser() menulis salt+hash langsung ke
// sheet tanpa lewat helper ini. Dihapus supaya tidak ada kode mati yang
// membingungkan kalau ada yang mengira fungsi ini masih dipakai.

function handleLogin(username, password) {
  const cache = CacheService.getScriptCache();
  // Rate limiting berdasarkan username untuk mencegah DoS lockout akun tertentu
  const cacheKey = 'loginFail_' + username;
  const percobaanStr = cache.get(cacheKey);
  const percobaan = percobaanStr ? Number(percobaanStr) : 0;

  if (percobaan >= MAX_PERCOBAAN_LOGIN) {
    return { success: false, message: "Terlalu banyak percobaan login gagal. Coba lagi dalam 15 menit." };
  }

  let ss = getMasterGuruSs();
  let sheet = ss.getSheetByName('Akun_Guru');
  let data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      // Cek apakah sudah menggunakan password hash (kolom index 7)
      const storedHash = data[i][7];
      let passwordValid = false;

      let perluUpgradeHash = false;

      if (storedHash && storedHash !== '') {
        // Mode aman: gunakan password hashing
        // PATCH PERFORMA: sebelumnya fallback memanggil getSaltForUser(username)
        // yang MEMBACA ULANG SELURUH SHEET Akun_Guru dari awal kalau kolom
        // salt kosong -- padahal baris ini (data[i]) sudah ada di memori dari
        // pembacaan `data` di atas. Sekarang salt di-generate & ditulis
        // langsung pakai baris yang sudah dimuat, tanpa scan ulang.
        let salt = data[i][6];
        if (!salt || salt === '') {
          salt = generateSalt();
          sheet.getRange(i + 1, 7).setValue(salt);
        }
        const inputHash = hashPassword(password, salt);
        passwordValid = (inputHash === storedHash);
      } else {
        // Mode lama (plaintext) - masih dipakai untuk akun yang belum pernah
        // login sejak sistem hash diaktifkan.
        passwordValid = (data[i][1] === password);
        if (passwordValid) {
          // Tandai akun ini untuk di-upgrade ke hash SEKARANG JUGA,
          // sesuai desain "salt dibuat saat login pertama kali".
          perluUpgradeHash = true;
        }
      }

      if (passwordValid) {
        // PATCH TAHAP 3 (Panel Admin): akun yang dinonaktifkan admin
        // (lihat nonaktifkanAkunGuru() di Admin.gs) ditandai lewat role
        // "nonaktif" -- password-nya sendiri TETAP benar (memang tidak
        // diubah saat dinonaktifkan), tapi login WAJIB ditolak di sini,
        // dengan pesan yang jelas bedanya dari "password salah" biasa.
        const roleListUser = parseRoleList(data[i][KOLOM_ROLE_0INDEXED]);
        if (roleListUser.indexOf('nonaktif') !== -1) {
          return { success: false, message: "Akun ini telah dinonaktifkan. Hubungi admin sekolah." };
        }

        cache.remove(cacheKey);

        // ===== AUTO-HASH SAAT LOGIN PERTAMA =====
        // Begitu password plaintext terverifikasi benar, langsung generate
        // salt baru (jika belum ada) + hash, lalu simpan permanen ke sheet.
        // Login-login berikutnya untuk akun ini otomatis akan lewat jalur
        // "Mode aman" di atas.
        if (perluUpgradeHash) {
          try {
            const saltBaru = data[i][6] && data[i][6] !== '' ? data[i][6] : generateSalt();
            const hashBaru = hashPassword(password, saltBaru);
            sheet.getRange(i + 1, 7).setValue(saltBaru);  // kolom G: salt
            sheet.getRange(i + 1, 8).setValue(hashBaru);  // kolom H: password_hash
            // PATCH KEAMANAN: kosongkan password plaintext (kolom B) begitu
            // hash berhasil disimpan -- sebelumnya kolom ini dibiarkan berisi
            // password asli guru selamanya walau login sudah beralih ke hash.
            sheet.getRange(i + 1, 2).clearContent();  // kolom B: password plaintext
            Logger.log('Auto-upgrade hash sukses untuk user: ' + username);
          } catch (upgradeError) {
            // Jangan sampai kegagalan upgrade menggagalkan login yang sudah valid.
            Logger.log('Auto-upgrade hash GAGAL untuk user ' + username + ': ' + upgradeError.toString());
          }
        }
        // ===== SELESAI PATCH =====

        let kelasWali = data[i][5] ? String(data[i][5]).trim() : '';

        // =====================================================================
        // === FIX KRITIS (penyebab bug "login sukses tapi langsung logout") ===
        // ---------------------------------------------------------------------
        // SEBELUMNYA field yang dikirim adalah `mapel` dan `kelas` (STRING
        // MENTAH dari sheet, misal "Matematika, IPA"). Padahal frontend
        // (js/main.js -> isStaleSessionData(), js/dashboard.js) mengharapkan
        // field `mapelList` dan `kelasList` berupa ARRAY hasil split koma --
        // persis seperti yang sudah dikembalikan getAkunGuru() di atas.
        //
        // Akibatnya: setiap kali user login lalu halaman di-reload,
        // main.js -> route() -> isStaleSessionData(user) SELALU bernilai true
        // (karena field mapelList/kelasList memang tak pernah ada di data
        // login), sehingga sesi yang BARU SAJA valid langsung dianggap basi
        // dan dipaksa logout kembali ke halaman login.
        //
        // Perbaikan: samakan struktur data yang dikembalikan di sini dengan
        // apa yang diharapkan frontend DAN dengan getAkunGuru().
        // =====================================================================
        return {
          success: true,
          data: {
            username: username,
            token: buatToken(username),
            nama: data[i][2],
            mapelList: String(data[i][3] || '').split(',').map(s => s.trim()).filter(s => s !== ''),
            kelasList: String(data[i][4] || '').split(',').map(s => s.trim()).filter(s => s !== ''),
            kelasWali: kelasWali,
            // PATCH TAHAP 1 (sistem peran): lihat Roles.gs. Dijaga SAMA
            // PERSIS dengan getAkunGuru() di atas -- lihat catatan "FIX
            // KRITIS" tepat di atas ini soal kenapa 2 tempat ini wajib
            // sinkron (riwayat bug sebelumnya untuk mapelList/kelasList).
            roleList: parseRoleList(data[i][KOLOM_ROLE_0INDEXED]),
            // PATCH: Pasangan Mapel-Kelas -- dijaga SAMA PERSIS dengan
            // getAkunGuru() di atas, sama seperti roleList.
            pasanganMapelKelas: parsePasanganMapelKelas(data[i][KOLOM_PASANGAN_MAPEL_KELAS_0INDEXED])
          }
        };
      }
    }
  }

  // Increment counter kegagalan
  cache.put(cacheKey, String(percobaan + 1), DURASI_KUNCI_DETIK);
  return { success: false, message: "Username atau password salah." };
}
