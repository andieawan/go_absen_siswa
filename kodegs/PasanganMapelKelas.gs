// =========================================================
// PASANGAN MAPEL-KELAS (pengecualian opsional per akun guru)
// ---------------------------------------------------------
// Kolom baru di sheet Akun_Guru: "Pasangan Mapel-Kelas" -- kolom K
// (index 10, 0-based; getRange kolom 11, 1-based).
//
// TUJUAN: sekarang mapelList & kelasList itu 2 daftar INDEPENDEN --
// sistem tidak tahu pasangan sebenarnya (guru yang ajar DKV cuma di
// "XI DKV 1" dan KIK cuma di "XI DKV 2" tetap kelihatan boleh ajar
// KIK di "XI DKV 1" juga, padahal salah). Kolom ini jadi PENGECUALIAN
// OPSIONAL di atas mapelList/kelasList yang sudah ada -- BUKAN
// pengganti keduanya.
//
// FORMAT (kosong secara default -- semua akun yang sudah ada TIDAK
// perlu diubah apa pun): mapel dipisah "|", kelas per-mapel dipisah ",":
//   DKV:XI DKV 1,XI DKV 2|KIK:XI DKV 3
//
// ATURAN FALLBACK (penting): kalau kolom ini KOSONG SELURUHNYA, ATAU
// mapel yang sedang dicek TIDAK ADA di dalam pasangan yang didefinisikan
// -- kembali ke perilaku lama (semua kelas di kelasList diizinkan untuk
// mapel itu). Jadi admin BOLEH mendefinisikan pengecualian untuk cuma 1
// mapel saja, tanpa perlu mendaftar ulang semua mapel lain yang diampu
// guru itu.
// =========================================================

const KOLOM_PASANGAN_MAPEL_KELAS_0INDEXED = 10; // kolom K, dipakai baca array data[i][...]
const KOLOM_PASANGAN_MAPEL_KELAS_1INDEXED = 11; // kolom K, dipakai sheet.getRange(baris, ...)

/**
 * Ubah nilai mentah kolom "Pasangan Mapel-Kelas" jadi objek
 * { "DKV": ["XI DKV 1", "XI DKV 2"], "KIK": ["XI DKV 3"] }, atau `null`
 * kalau kolomnya kosong/tidak terisi valid apa pun (artinya: tidak ada
 * pengecualian, dipakai fallback ke kelasList penuh -- lihat
 * getKelasUntukMapel() di bawah).
 */
function parsePasanganMapelKelas(rawValue) {
  const str = String(rawValue || '').trim();
  if (!str) return null;

  const hasil = {};
  str.split('|').forEach(bagian => {
    const pisahDuaTitik = bagian.indexOf(':');
    if (pisahDuaTitik === -1) return; // format tidak valid, lewati diam-diam
    const mapel = bagian.substring(0, pisahDuaTitik).trim();
    const kelasStr = bagian.substring(pisahDuaTitik + 1).trim();
    if (!mapel || !kelasStr) return;
    const daftarKelas = kelasStr.split(',').map(k => k.trim()).filter(k => k !== '');
    if (daftarKelas.length > 0) hasil[mapel] = daftarKelas;
  });

  return Object.keys(hasil).length > 0 ? hasil : null;
}

/**
 * Daftar kelas yang diizinkan UNTUK 1 MAPEL TERTENTU, mempertimbangkan
 * pengecualian (kalau ada). Ini fungsi utama yang dipakai baik backend
 * (Router.gs, untuk otorisasi) maupun sebagai acuan logika yang ditiru
 * di frontend (js/absensi.js, untuk mengisi dropdown kelas).
 *
 * `akun` harus punya field `kelasList` (array) dan `pasanganMapelKelas`
 * (objek hasil parsePasanganMapelKelas(), atau null).
 */
function getKelasUntukMapel(akun, mapel) {
  if (!akun.pasanganMapelKelas || !akun.pasanganMapelKelas[mapel]) {
    return akun.kelasList; // tidak ada pengecualian utk mapel ini -> semua kelas seperti biasa
  }
  return akun.pasanganMapelKelas[mapel];
}

/**
 * Cek gabungan: apakah akun ini boleh mengakses kombinasi mapel+kelas
 * ini SAMA SEKALI -- mapel-nya sendiri harus ada di mapelList, DAN
 * kelas yang diminta harus termasuk yang diizinkan untuk mapel itu
 * (lihat getKelasUntukMapel() di atas). Ini pengganti pola lama
 * "akun.mapelList.indexOf(mapel) === -1 || akun.kelasList.indexOf(kelas) === -1"
 * yang TIDAK memverifikasi pasangannya, cuma keanggotaan masing-masing
 * daftar secara independen.
 */
function kelasBolehUntukMapel(akun, mapel, kelas) {
  if (!akun.mapelList || akun.mapelList.indexOf(mapel) === -1) return false;
  const kelasBoleh = getKelasUntukMapel(akun, mapel);
  return kelasBoleh.indexOf(kelas) !== -1;
}
