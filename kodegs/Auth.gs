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
  const ss = getMasterSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      return {
        username: data[i][0],
        nama: data[i][2],
        mapelList: String(data[i][3] || '').split(',').map(s => s.trim()).filter(s => s !== ''),
        kelasList: String(data[i][4] || '').split(',').map(s => s.trim()).filter(s => s !== ''),
        kelasWali: data[i][5] ? String(data[i][5]).trim() : ''
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

  if (akun.mapelList.indexOf(payload.mapel) === -1) {
    return { success: false, message: "Anda tidak berhak mengisi absensi untuk mata pelajaran " + payload.mapel + "." };
  }
  if (akun.kelasList.indexOf(payload.kelas) === -1) {
    return { success: false, message: "Anda tidak berhak mengisi absensi untuk kelas " + payload.kelas + "." };
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

// Dapatkan salt untuk user (simpan di kolom terpisah di sheet Akun_Guru)
function getSaltForUser(username) {
  const ss = getMasterSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      // Kolom ke-7 (index 6) adalah kolom 'salt' - harus ditambahkan saat migrasi
      let salt = data[i][6];
      if (!salt || salt === '') {
        // Generate salt baru jika belum ada
        salt = generateSalt();
        sheet.getRange(i + 1, 7).setValue(salt);
      }
      return salt;
    }
  }
  return null;
}

// Simpan password yang sudah di-hash (untuk migrasi atau update password)
function setPasswordHash(username, passwordHash) {
  const ss = getMasterSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      // Kolom ke-8 (index 7) adalah kolom 'password_hash'
      sheet.getRange(i + 1, 8).setValue(passwordHash);
      return true;
    }
  }
  return false;
}

// Dapatkan password hash untuk user (kolom baru di sheet Akun_Guru)
function getPasswordHashForUser(username) {
  const ss = getMasterSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      // Kolom ke-8 (index 7) adalah kolom 'password_hash'
      return data[i][7];
    }
  }
  return null;
}

function handleLogin(username, password) {
  const cache = CacheService.getScriptCache();
  // Rate limiting berdasarkan username untuk mencegah DoS lockout akun tertentu
  const cacheKey = 'loginFail_' + username;
  const percobaanStr = cache.get(cacheKey);
  const percobaan = percobaanStr ? Number(percobaanStr) : 0;

  if (percobaan >= MAX_PERCOBAAN_LOGIN) {
    return { success: false, message: "Terlalu banyak percobaan login gagal. Coba lagi dalam 15 menit." };
  }

  let ss = getMasterSs();
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
        const salt = data[i][6] || getSaltForUser(username);
        const inputHash = hashPassword(password, salt);
        passwordValid = (inputHash === storedHash);
      } else {
        // Mode lama (plaintext) - masih dipakai untuk akun yang belum pernah
        // login sejak sistem hash diaktifkan.
        passwordValid = (data[i][1] === password);
        if (passwordValid) {
          // PATCH: tandai akun ini untuk di-upgrade ke hash SEKARANG JUGA,
          // sesuai desain "salt dibuat saat login pertama kali".
          // Sebelumnya upgrade HANYA terjadi lewat migrasiHashPassword()
          // yang harus dijalankan manual -- akun baru yang belum pernah
          // ikut migrasi manual akan tetap plaintext selamanya.
          perluUpgradeHash = true;
        }
      }
      
      if (passwordValid) {
        cache.remove(cacheKey);

        // ===== PATCH: AUTO-HASH SAAT LOGIN PERTAMA =====
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
            Logger.log('Auto-upgrade hash sukses untuk user: ' + username);
          } catch (upgradeError) {
            // Jangan sampai kegagalan upgrade menggagalkan login yang sudah valid.
            Logger.log('Auto-upgrade hash GAGAL untuk user ' + username + ': ' + upgradeError.toString());
          }
        }
        // ===== SELESAI PATCH =====
        let kelasWali = data[i][5] ? String(data[i][5]).trim() : '';
        return {
          success: true,
          data: {
            username: username,
            token: buatToken(username),
            nama: data[i][2], mapel: data[i][3], kelas: data[i][4], kelasWali: kelasWali
          }
        };
      }
    }
  }

  // Increment counter kegagalan
  cache.put(cacheKey, String(percobaan + 1), DURASI_KUNCI_DETIK);
  return { success: false, message: "Username atau password salah." };
}
