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
      
      if (storedHash && storedHash !== '') {
        // Mode aman: gunakan password hashing
        const salt = data[i][6] || getSaltForUser(username);
        const inputHash = hashPassword(password, salt);
        passwordValid = (inputHash === storedHash);
      } else {
        // Fallback ke mode lama (plaintext) - hanya untuk masa transisi
        // Setelah migrasi, branch ini bisa dihapus
        passwordValid = (data[i][1] === password);
      }
      
      if (passwordValid) {
        cache.remove(cacheKey);
        let kelasWali = data[i][5] ? String(data[i][5]).trim() : '';

        // ===== PATCH =====
        // SEBELUM: mengembalikan field "mapel" dan "kelas" sebagai string
        // mentah dari spreadsheet (mis. "Matematika, IPA"), padahal frontend
        // (js/dashboard.js, js/absensi.js) membaca userData.mapelList dan
        // userData.kelasList sebagai ARRAY. Akibatnya array selalu kosong
        // -> dropdown Kelas/Mapel kosong -> error "Tidak ada mata pelajaran
        // atau kelas yang diajar".
        // SESUDAH: parsing jadi array di sini (sama seperti getAkunGuru())
        // supaya field yang dikirim ke frontend konsisten: mapelList & kelasList.
        let mapelList = String(data[i][3] || '').split(',').map(s => s.trim()).filter(s => s !== '');
        let kelasList = String(data[i][4] || '').split(',').map(s => s.trim()).filter(s => s !== '');

        return {
          success: true,
          data: {
            username: username,
            token: buatToken(username),
            nama: data[i][2],
            mapelList: mapelList,
            kelasList: kelasList,
            kelasWali: kelasWali
          }
        };
        // ===== SELESAI PATCH =====
      }
    }
  }

  // Increment counter kegagalan
  cache.put(cacheKey, String(percobaan + 1), DURASI_KUNCI_DETIK);
  return { success: false, message: "Username atau password salah." };
}
