// =========================================================
// GENERATE REKAP (FILE DRIVE) & REKAP UNDUHAN GURU
// =========================================================

function generateFullRecap() {
  const ssMaster = getMasterSs();
  const ssAbsen = getAbsenSs();
  const folderMaster = DriveApp.getFolderById(DRIVE_FOLDER_REKAP_ID);
  const folderBackup = DriveApp.getFolderById(DRIVE_FOLDER_BACKUP_ID);
  const timestamp = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd_HH-mm");
  const absenSheets = ssAbsen.getSheets();
  let processedCount = 0;

  absenSheets.forEach(sheet => {
    let sheetName = sheet.getName();
    let absenData = sheet.getDataRange().getValues();
    if (absenData.length <= 1) return;

    let mapel = absenData[1][2];
    let kelas = absenData[1][3];

    let masterSheetRef = ssMaster.getSheetByName(kelas);
    if (!masterSheetRef) return;

    let masterData = masterSheetRef.getDataRange().getValues();
    let students = {};
    for (let i = 1; i < masterData.length; i++) {
      if (masterData[i][1] !== "" && masterData[i][2] !== "") {
        let nis = String(masterData[i][1]);
        students[nis] = {
          nama: masterData[i][2].toString().trim(),
          jk: masterData[i][3],
          attendance: {},
          totals: { hadir: 0, izin: 0, sakit: 0, alpa: 0 }
        };
      }
    }

    let dateMap = {};
    for (let i = 1; i < absenData.length; i++) {
      let rawDate = absenData[i][4];
      if (rawDate) {
        let formattedDate = Utilities.formatDate(new Date(rawDate), "GMT+7", "dd/MM/yyyy");
        dateMap[formattedDate] = new Date(rawDate).getTime();
      }
    }
    let uniqueDates = Object.keys(dateMap).sort((a, b) => dateMap[a] - dateMap[b]);

    for (let i = 1; i < absenData.length; i++) {
      let rawDate = absenData[i][4];
      if (!rawDate) continue;

      let dStr = Utilities.formatDate(new Date(rawDate), "GMT+7", "dd/MM/yyyy");
      let strHadir = splitList(absenData[i][5]);
      let strIzin = splitList(absenData[i][6]);
      let strSakit = splitList(absenData[i][7]);
      let strAlpa = splitList(absenData[i][8]);

      strHadir.forEach(nis => { if (students[nis]) { students[nis].attendance[dStr] = 'H'; students[nis].totals.hadir++; }});
      strIzin.forEach(nis => { if (students[nis]) { students[nis].attendance[dStr] = 'I'; students[nis].totals.izin++; }});
      strSakit.forEach(nis => { if (students[nis]) { students[nis].attendance[dStr] = 'S'; students[nis].totals.sakit++; }});
      strAlpa.forEach(nis => { if (students[nis]) { students[nis].attendance[dStr] = 'A'; students[nis].totals.alpa++; }});
    }

    let rowData = [];
    let colorData = [];
    let headerRow = ["NIS", "NAMA SISWA", "L/P"];
    uniqueDates.forEach((date, index) => {
      headerRow.push(`PERTEMUAN ${index + 1}\n(${date})`);
    });
    headerRow.push("JML HADIR", "JML IZIN", "JML SAKIT", "JML ALPA");
    rowData.push(headerRow);
    colorData.push(Array(headerRow.length).fill("#E0E7FF"));

    for (let nis in students) {
      let s = students[nis];
      let row = [nis, s.nama, s.jk];
      let rowColor = ["#FFFFFF", "#FFFFFF", "#FFFFFF"];

      uniqueDates.forEach(date => {
        let status = s.attendance[date] || "-";
        row.push(status);
        if (status === 'H') rowColor.push("#D9EAD3");
        else if (status === 'I') rowColor.push("#C9DAF8");
        else if (status === 'S') rowColor.push("#FFF2CC");
        else if (status === 'A') rowColor.push("#F4CCCC");
        else rowColor.push("#FFFFFF");
      });

      row.push(s.totals.hadir, s.totals.izin, s.totals.sakit, s.totals.alpa);
      rowColor.push("#D9EAD3", "#C9DAF8", "#FFF2CC", "#F4CCCC");
      rowData.push(row);
      colorData.push(rowColor);
    }

    let backupFileName = `Rekap_Backup_${sheetName}_${timestamp}`;
    let backupSs = SpreadsheetApp.create(backupFileName);
    let backupTargetSheet = backupSs.getSheets()[0];
    backupTargetSheet.setName(sheetName);
    let rangeBackup = backupTargetSheet.getRange(1, 1, rowData.length, rowData[0].length);
    rangeBackup.setValues(rowData);
    rangeBackup.setBackgrounds(colorData);
    formatRecapSheet(backupTargetSheet, uniqueDates.length);
    DriveApp.getFileById(backupSs.getId()).moveTo(folderBackup);

    let masterFileName = `Rekap_Master_${sheetName}`;
    let masterSs;
    let masterFiles = folderMaster.getFilesByName(masterFileName);
    let isNewMaster = false;
    if (masterFiles.hasNext()) {
      masterSs = SpreadsheetApp.openById(masterFiles.next().getId());
    } else {
      masterSs = SpreadsheetApp.create(masterFileName);
      isNewMaster = true;
    }
    let masterTargetSheet = masterSs.getSheetByName(sheetName);
    if (!masterTargetSheet) {
      masterTargetSheet = masterSs.getSheets()[0];
      masterTargetSheet.setName(sheetName);
    }
    masterTargetSheet.clear();
    let rangeMaster = masterTargetSheet.getRange(1, 1, rowData.length, rowData[0].length);
    rangeMaster.setValues(rowData);
    rangeMaster.setBackgrounds(colorData);
    formatRecapSheet(masterTargetSheet, uniqueDates.length);
    if (isNewMaster) {
      DriveApp.getFileById(masterSs.getId()).moveTo(folderMaster);
    }
    processedCount++;
  });

  if (processedCount === 0) {
    cleanupOldBackups();
    return "Tidak ada data absensi untuk direkap.";
  }

  const jumlahDihapus = cleanupOldBackups();
  return "Berhasil membuat Master Rekap dan Backup! (" + jumlahDihapus + " file backup lama ikut dibersihkan.)";
}

function cleanupOldBackups() {
  const folderBackup = DriveApp.getFolderById(DRIVE_FOLDER_BACKUP_ID);
  const files = folderBackup.getFiles();
  const batasWaktu = new Date();
  batasWaktu.setDate(batasWaktu.getDate() - BACKUP_RETENTION_DAYS);

  let dihapus = 0;
  while (files.hasNext()) {
    const file = files.next();
    if (file.getDateCreated() < batasWaktu) {
      file.setTrashed(true);
      dihapus++;
    }
  }
  return dihapus;
}

function formatRecapSheet(sheet, totalMeetings) {
  let totalColumns = 3 + totalMeetings + 4;
  let headerRange = sheet.getRange(1, 1, 1, totalColumns);
  headerRange.setFontWeight("bold").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  if (totalColumns > 3 && sheet.getLastRow() > 1) {
    let dataRange = sheet.getRange(2, 4, sheet.getLastRow() - 1, totalColumns - 3);
    dataRange.setHorizontalAlignment("center").setVerticalAlignment("middle");
  }
  sheet.autoResizeColumns(1, totalColumns);
}

// --- REKAP KELAS SAYA (untuk diunduh langsung oleh guru sbg .xlsx) ---
function getRekapKelasSaya(mapelListStr, kelasListStr) {
  let mapelList = mapelListStr.split(',').map(s => s.trim()).filter(s => s !== "");
  let kelasList = kelasListStr.split(',').map(s => s.trim()).filter(s => s !== "");

  const ssMaster = getMasterSs();
  const ssAbsen = getAbsenSs();

  let sheetsRekap = [];

  kelasList.forEach(kelas => {
    mapelList.forEach(mapel => {
      let sheetName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_");
      let absenSheet = ssAbsen.getSheetByName(sheetName);
      if (!absenSheet) return;

      let absenData = absenSheet.getDataRange().getValues();
      if (absenData.length <= 1) return;

      let masterSheetRef = ssMaster.getSheetByName(kelas);
      if (!masterSheetRef) return;

      let masterData = masterSheetRef.getDataRange().getValues();
      let students = {};

      for (let i = 1; i < masterData.length; i++) {
        if (masterData[i][1] !== "" && masterData[i][2] !== "") {
          let nis = String(masterData[i][1]);
          students[nis] = {
            nama: masterData[i][2].toString().trim(), jk: masterData[i][3],
            attendance: {}, totals: { hadir: 0, izin: 0, sakit: 0, alpa: 0 }
          };
        }
      }

      let dateMap = {};
      for (let i = 1; i < absenData.length; i++) {
        let rawDate = absenData[i][4];
        if (rawDate) {
          let formattedDate = Utilities.formatDate(new Date(rawDate), "GMT+7", "dd/MM/yyyy");
          dateMap[formattedDate] = new Date(rawDate).getTime();
        }
      }
      let uniqueDates = Object.keys(dateMap).sort((a, b) => dateMap[a] - dateMap[b]);

      for (let i = 1; i < absenData.length; i++) {
        let rawDate = absenData[i][4];
        if (!rawDate) continue;
        let dStr = Utilities.formatDate(new Date(rawDate), "GMT+7", "dd/MM/yyyy");

        splitList(absenData[i][5]).forEach(nis => { if (students[nis]) { students[nis].attendance[dStr] = 'H'; students[nis].totals.hadir++; } });
        splitList(absenData[i][6]).forEach(nis => { if (students[nis]) { students[nis].attendance[dStr] = 'I'; students[nis].totals.izin++; } });
        splitList(absenData[i][7]).forEach(nis => { if (students[nis]) { students[nis].attendance[dStr] = 'S'; students[nis].totals.sakit++; } });
        splitList(absenData[i][8]).forEach(nis => { if (students[nis]) { students[nis].attendance[dStr] = 'A'; students[nis].totals.alpa++; } });
      }

      let headerRow = ["NIS", "NAMA SISWA", "L/P"];
      uniqueDates.forEach((date, index) => headerRow.push(`Pertemuan ${index + 1} (${date})`));
      headerRow.push("JML HADIR", "JML IZIN", "JML SAKIT", "JML ALPA");

      let rows = [];
      for (let nis in students) {
        let s = students[nis];
        let row = [nis, s.nama, s.jk];
        uniqueDates.forEach(date => row.push(s.attendance[date] || "-"));
        row.push(s.totals.hadir, s.totals.izin, s.totals.sakit, s.totals.alpa);
        rows.push(row);
      }

      let tabName = (kelas + "_" + mapel).replace(/[^a-zA-Z0-9]/g, "_").substring(0, 31);
      sheetsRekap.push({ tabName, headerRow, rows });
    });
  });

  if (sheetsRekap.length === 0) {
    return { success: false, message: "Belum ada data absensi untuk direkap." };
  }

  return { success: true, data: sheetsRekap };
}
