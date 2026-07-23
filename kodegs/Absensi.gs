// =========================================================
// ABSENSI PER MATA PELAJARAN
// =========================================================

function getStudents(kelas) {
  let ss = getMasterSs();
  let sheet = ss.getSheetByName(kelas);
  if (!sheet) return { success: false, message: "Data kelas " + kelas + " tidak ditemukan." };

  let data = sheet.getDataRange().getValues();
  let students = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] !== "" && data[i][2] !== "") {
      students.push({ nis: data[i][1], nama: data[i][2], jk: data[i][3] });
    }
  }
  return { success: true, data: students };
}

function getExistingAttendance(guru, mapel, kelas, tanggal) {
  let ss = getAbsenSs();
  let sheetName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_");
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: true, data: null };

  let data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    let rawDate = data[i][4];
    if (rawDate && isDateMatch(rawDate, tanggal)) {
      // FIX: paksa jadi string. Jika sebuah sel status hanya berisi satu
      // NIS (tanpa koma), Google Sheets otomatis menyimpannya sebagai
      // Number, bukan Text. Tanpa String(...) di sini, frontend akan
      // error saat memanggil .split(',') pada nilai Number tersebut.
      return {
        success: true,
        data: {
          hadir: String(data[i][5] || ''),
          izin: String(data[i][6] || ''),
          sakit: String(data[i][7] || ''),
          alpa: String(data[i][8] || '')
        }
      };
    }
  }
  return { success: true, data: null };
}

function handleSubmit(payload) {
  let ss = getAbsenSs();
  let sheetName = (payload.kelas + "_" + payload.mapel).replace(/[^a-zA-Z0-9]/g, "_");
  let sheet = getOrCreateSheet(ss, sheetName);
  let data = sheet.getDataRange().getValues();
  let timestamp = new Date();

  let hadir = [], izin = [], sakit = [], alpa = [];
  payload.attendance.forEach(student => {
    const nis = String(student.nis);
    switch (student.status) {
      case 'H': hadir.push(nis); break;
      case 'I': izin.push(nis); break;
      case 'S': sakit.push(nis); break;
      case 'A': alpa.push(nis); break;
    }
  });

  let strHadir = hadir.join(', ');
  let strIzin = izin.join(', ');
  let strSakit = sakit.join(', ');
  let strAlpa = alpa.join(', ');

  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    let rawDate = data[i][4];
    if (rawDate && isDateMatch(rawDate, payload.tanggal)) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow !== -1) {
    sheet.getRange(targetRow, 1).setValue(timestamp);
    sheet.getRange(targetRow, 6).setValue(strHadir);
    sheet.getRange(targetRow, 7).setValue(strIzin);
    sheet.getRange(targetRow, 8).setValue(strSakit);
    sheet.getRange(targetRow, 9).setValue(strAlpa);
    return { success: true, message: "Data absensi diperbarui!" };
  } else {
    let rowData = [timestamp, payload.guru, payload.mapel, payload.kelas, payload.tanggal, strHadir, strIzin, strSakit, strAlpa];
    sheet.appendRow(rowData);
    return { success: true, message: "Data absensi berhasil disimpan!" };
  }
}

// --- RIWAYAT ---
function getRiwayatAbsensi(mapel, kelas) {
  let ss = getAbsenSs();
  let sheetName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_");
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: true, data: [] };

  const nisKeNama = getNisKeNamaMap(kelas);
  let data = sheet.getDataRange().getValues();
  let riwayat = [];

  for (let i = 1; i < data.length; i++) {
    let rawDate = data[i][4];
    if (!rawDate) continue;

    let hadirArr = splitList(data[i][5]);
    let izinArr = splitList(data[i][6]);
    let sakitArr = splitList(data[i][7]);
    let alpaArr = splitList(data[i][8]);

    riwayat.push({
      tanggal: Utilities.formatDate(new Date(rawDate), "GMT+7", "yyyy-MM-dd"),
      jumlahHadir: hadirArr.length,
      jumlahIzin: izinArr.length,
      jumlahSakit: sakitArr.length,
      jumlahAlpa: alpaArr.length,
      namaIzin: izinArr.map(nis => nisKeNama[nis] || nis),
      namaSakit: sakitArr.map(nis => nisKeNama[nis] || nis),
      namaAlpa: alpaArr.map(nis => nisKeNama[nis] || nis)
    });
  }

  riwayat.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  return { success: true, data: riwayat };
}
