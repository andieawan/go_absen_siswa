// =========================================================
// MIGRASI: HASH PASSWORD PLAINTEXT KE SHA-256
// ---------------------------------------------------------
// Jalankan fungsi ini SEKALI SAJA untuk meng-hash semua password
// yang masih tersimpan dalam bentuk plaintext di sheet Akun_Guru.
// Setelah migrasi, kolom H (index 7) akan berisi password hash,
// dan kolom G (index 6) akan berisi salt unik per user.
// =========================================================

function migrasiHashPassword() {
  const ss = getMasterSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();
  
  let totalDiubah = 0;
  let laporan = [];
  
  // Header kolom (asumsi struktur sheet):
  // A=username(0), B=password_plaintext(1), C=nama(2), D=mapel(3), E=kelas(4), F=kelasWali(5)
  // Kolom baru: G=salt(6), H=password_hash(7)
  
  for (let i = 1; i < data.length; i++) {
    const username = data[i][0];
    const passwordPlaintext = data[i][1];
    const existingSalt = data[i][6];
    const existingHash = data[i][7];
    
    // Skip jika sudah ada hash (sudah dimigrasi)
    if (existingHash && existingHash !== '') {
      continue;
    }
    
    // Skip jika tidak ada password
    if (!passwordPlaintext || passwordPlaintext === '') {
      laporan.push('SKIP: User "' + username + '" tidak punya password.');
      continue;
    }
    
    // Generate salt jika belum ada
    let salt = existingSalt;
    if (!salt || salt === '') {
      salt = generateSalt();
      sheet.getRange(i + 1, 7).setValue(salt); // Kolom G
    }
    
    // Hash password dengan salt
    const passwordHash = hashPassword(passwordPlaintext, salt);
    sheet.getRange(i + 1, 8).setValue(passwordHash); // Kolom H
    
    // Opsional: kosongkan kolom password plaintext setelah migrasi
    // Uncomment baris berikut jika ingin menghapus password plaintext:
    // sheet.getRange(i + 1, 2).clearContent(); // Kolom B
    
    totalDiubah++;
    laporan.push('OK: User "' + username + '" berhasil di-hash.');
  }
  
  const ringkasan = 'Migrasi hash password selesai.\n' +
                    'Total user di-hash: ' + totalDiubah + '\n' +
                    (laporan.length > 0 ? '\nDetail:\n' + laporan.join('\n') : '');
  
  Logger.log(ringkasan);
  return ringkasan;
}

// =========================================================
// FUNGSI BANTUAN: Reset password untuk user tertentu
// ---------------------------------------------------------
// Gunakan jika ada user yang lupa password. Admin bisa set
// password baru yang langsung tersimpan dalam bentuk hash.
// =========================================================

function resetPasswordUser(username, newPassword) {
  const salt = generateSalt();
  const passwordHash = hashPassword(newPassword, salt);
  
  const ss = getMasterSs();
  const sheet = ss.getSheetByName('Akun_Guru');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      // Set salt di kolom G
      sheet.getRange(i + 1, 7).setValue(salt);
      // Set password hash di kolom H
      sheet.getRange(i + 1, 8).setValue(passwordHash);
      // Opsional: kosongkan password plaintext di kolom B
      // sheet.getRange(i + 1, 2).clearContent();
      
      return 'Password untuk user "' + username + '" berhasil direset.';
    }
  }
  
  return 'Error: User "' + username + '" tidak ditemukan.';
}
