function handleLogin(username, password) {
  const cache = CacheService.getScriptCache();
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
      const storedHash = data[i][7];
      let passwordValid = false;
      let perluUpgradeHash = false;

      if (storedHash && storedHash !== '') {
        const salt = data[i][6] || getSaltForUser(username);
        const inputHash = hashPassword(password, salt);
        passwordValid = (inputHash === storedHash);
      } else {
        passwordValid = (data[i][1] === password);
        if (passwordValid) {
          perluUpgradeHash = true;
        }
      }

      if (passwordValid) {
        cache.remove(cacheKey);

        if (perluUpgradeHash) {
          try {
            const saltBaru = data[i][6] && data[i][6] !== '' ? data[i][6] : generateSalt();
            const hashBaru = hashPassword(password, saltBaru);
            sheet.getRange(i + 1, 7).setValue(saltBaru);
            sheet.getRange(i + 1, 8).setValue(hashBaru);
            Logger.log('Auto-upgrade hash sukses untuk user: ' + username);
          } catch (upgradeError) {
            Logger.log('Auto-upgrade hash GAGAL untuk user ' + username + ': ' + upgradeError.toString());
          }
        }

        let kelasWali = data[i][5] ? String(data[i][5]).trim() : '';

        // === PERBAIKAN UTAMA: kirim mapelList & kelasList (array), bukan mapel/kelas (string mentah) ===
        return {
          success: true,
          data: {
            username: username,
            token: buatToken(username),
            nama: data[i][2],
            mapelList: String(data[i][3] || '').split(',').map(s => s.trim()).filter(s => s !== ''),
            kelasList: String(data[i][4] || '').split(',').map(s => s.trim()).filter(s => s !== ''),
            kelasWali: kelasWali
          }
        };
      }
    }
  }

  cache.put(cacheKey, String(percobaan + 1), DURASI_KUNCI_DETIK);
  return { success: false, message: "Username atau password salah." };
}
