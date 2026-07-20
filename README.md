# 📱 Aplikasi Absensi Siswa PWA Murni & Google Sheets

Aplikasi pencatatan absensi siswa berbasis **Progressive Web App (PWA) Murni** yang menggunakan **GitHub Pages** sebagai frontend dan **Google Apps Script (GAS)** sebagai backend REST API, dengan **Google Sheets** sebagai basis datanya. Didesain dengan pendekatan *mobile-first* dan arsitektur *serverless* yang ringan, responsif, dan mudah di-instal di Android/iOS layaknya aplikasi native.

---

## 🎯 Overview Arsitektur
1. **Frontend**: Di-hosting di GitHub Pages (HTML5, CSS3, Vanilla JavaScript, `manifest.json`, & `sw.js`).
2. **Backend**: Google Apps Script (GAS) bertindak sebagai REST Web API (`doGet` dan `doPost`).
3. **Database**:
   * **Spreadsheet 1 (Daftar Siswa)**: Berisi tab/sheet nama kelas. Struktur kolom: `NO (Col A)`, `NIS (Col B)`, `NAMA (Col C)`, `L/P (Col D)`.
   * **Spreadsheet 2 (Log Absen & Rekap)**: Menyimpan riwayat baris log harian (`Absen_Kelas`) dan matriks ringkasan kehadiran ke samping secara otomatis (`Rekap_Kelas`).

---

## 📋 Fitur Utama
* **PWA Standalone**: Dapat di-instal di *homescreen* perangkat bergerak tanpa melalui Play Store/App Store.
* **Auto-Detect / Edit Mode**: Ketika kelas dan tanggal dipilih, jika hari tersebut sudah pernah absen, aplikasi otomatis memuat data lama (Mode Edit) dan akan menimpa data tersebut saat disimpan kembali.
* **Skema Pilihan Status**: Hadir, Sakit, Izin, dan Alfa.
* **Sinkronisasi Siswa Baru**: Otomatis mendaftarkan siswa baru ke matriks rekapitulasi jika ada penambahan nama di spreadsheet utama.
* **Mekanisme Caching (Offline-first)**: Aset statis aplikasi tetap bisa dimuat instan meskipun koneksi internet sekolah sedang tidak stabil.

---

## 📁 Struktur File Proyek
```text
├── index.html       # Struktur UI Aplikasi
├── style.css        # Desain Mobile-First & Variabel Warna
├── script.js        # Logika API & Auto-Detect Mode
├── manifest.json    # Konfigurasi Instalasi PWA
├── sw.js            # Service Worker untuk Caching & Offline
└── README.md        # Dokumentasi Proyek
