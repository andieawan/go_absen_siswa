// =========================================================
// ABSEN HARIAN WALI KELAS
// =========================================================

function simpanAbsenWali(kelas, tanggal, dataKehadiran) {
  const nisKeNama = getNisKeNamaMap(kelas);
  if (Object.keys(nisKeNama).length === 0) {
    return { success: false, message: "Gagal: Data siswa kelas " + kelas + " tidak ditemukan!" };
  }

  let hadir = [], izin = [], sakit = [], alpa = [];
  dataKehadiran.forEach(item => {
    const nis = String(item.nis);
    if (!nisKeNama[nis]) return;
    switch (item.status) {
      case 'H': hadir.push(nis); break;
      case 'I': izin.push(nis); break;
      case 'S': sakit.push(nis); break;
      case 'A': alpa.push(nis); break;
    }
  });

  const strHadir = hadir.join(', ');
  const strIzin = izin.join(', ');
  const strSakit = sakit.join(', ');
  const strAlpa = alpa.join(', ');

  const ssAbsen = getAbsenSs();
  const sheetName = (kelas + "_" + MAPEL_ABSEN_WALI).replace(/[^a-zA-Z0-9]/g, "_");
  const sheet = getOrCreateSheet(ssAbsen, sheetName);

  const data = sheet.getDataRange().getValues();
  const timestamp = new Date();

  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    let rawDate = data[i][4];
    if (rawDate && isDateMatch(rawDate, tanggal)) { targetRow = i + 1; break; }
  }

  if (targetRow !== -1) {
    sheet.getRange(targetRow, 1).setValue(timestamp);
    sheet.getRange(targetRow, 6).setValue(strHadir);
    sheet.getRange(targetRow, 7).setValue(strIzin);
    sheet.getRange(targetRow, 8).setValue(strSakit);
    sheet.getRange(targetRow, 9).setValue(strAlpa);
    return { success: true, message: "Data absensi kelas " + kelas + " tanggal " + tanggal + " diperbarui!" };
  } else {
    sheet.appendRow([timestamp, "Wali Kelas", MAPEL_ABSEN_WALI, kelas, tanggal, strHadir, strIzin, strSakit, strAlpa]);
    return { success: true, message: "Data absensi kelas " + kelas + " tanggal " + tanggal + " disimpan!" };
  }
}

function getAbsenWaliExisting(kelas, tanggal) {
  const existing = getExistingAttendance("Wali Kelas", MAPEL_ABSEN_WALI, kelas, tanggal);
  if (!existing.success || !existing.data) return { success: true, data: null };

  const hasil = {};
  splitList(existing.data.hadir).forEach(nis => { hasil[nis] = 'H'; });
  splitList(existing.data.izin).forEach(nis => { hasil[nis] = 'I'; });
  splitList(existing.data.sakit).forEach(nis => { hasil[nis] = 'S'; });
  splitList(existing.data.alpa).forEach(nis => { hasil[nis] = 'A'; });

  return { success: true, data: hasil };
}

function getRiwayatAbsenWali(kelas) {
  return getRiwayatAbsensi(MAPEL_ABSEN_WALI, kelas);
}

function getRekapAbsenWali(kelas) {
  const hasil = getRekapKelasSaya(MAPEL_ABSEN_WALI, kelas);
  if (hasil.success) {
    const tabName = ("AbsenWali_" + kelas).replace(/[^a-zA-Z0-9]/g, "_").substring(0, 31);
    hasil.data.forEach(s => { s.tabName = tabName; });
  } else {
    hasil.message = "Belum ada data absensi wali kelas " + kelas + " untuk direkap.";
  }
  return hasil;
}
