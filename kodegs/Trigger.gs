// =========================================================
// TRIGGER OTOMATIS
// =========================================================

function setupWeeklyTrigger() {
  cekZonaWaktuProject();
  ScriptApp.getProjectTriggers().forEach(trigger => {
    let fn = trigger.getHandlerFunction();
    if (fn === 'generateFullRecap' || fn === 'generateAbsenWaliRecap' || fn === 'generateAllRecaps') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('generateFullRecap')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY)
    .atHour(20)
    .create();
}

function cekZonaWaktuProject() {
  const tzSaatIni = Session.getScriptTimeZone();
  let pesan;
  if (tzSaatIni === ZONA_WAKTU_DIHARAPKAN) {
    pesan = 'OK -- zona waktu sudah benar: ' + tzSaatIni;
  } else {
    pesan = 'PERINGATAN -- zona waktu project "' + tzSaatIni + '", BUKAN "' + ZONA_WAKTU_DIHARAPKAN + '"';
  }
  Logger.log(pesan);
  return pesan;
}
