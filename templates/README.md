# Struktur Folder Frontend

Frontend aplikasi absensi sekolah telah dipecah menjadi modul-modul terpisah untuk memudahkan maintenance dan pengembangan.

## 📁 Struktur Folder

```
/workspace/
├── index.html              # Shell utama (58 baris) - Hanya container & modal
├── css/                    # Semua file CSS
│   ├── main.css           # File utama yang mengimpor semua CSS
│   ├── variables.css      # Variabel CSS (warna, font, dll)
│   ├── reset.css          # Reset browser default
│   ├── layout.css         # Layout global
│   ├── components.css     # Komponen UI (button, card, form, dll)
│   └── utilities.css      # Utility classes
├── js/                     # Modul JavaScript
│   ├── main.js            # Entry point & router (126 baris)
│   ├── config.js          # Konfigurasi aplikasi
│   ├── api.js             # Komunikasi dengan Google Apps Script
│   ├── auth.js            # Autentikasi & session
│   ├── login.js           # Form login (99 baris)
│   ├── dashboard.js       # Dashboard & tabs
│   ├── absensi.js         # Form input absensi
│   └── utils.js           # Fungsi helper
└── templates/              # Template HTML (BARU!)
    ├── login.html         # Template halaman login (24 baris)
    └── dashboard.html     # Template dashboard lengkap (287 baris)
```

## 🔄 Cara Kerja

### 1. **Index.html sebagai Shell**
- Hanya berisi struktur dasar: header, container `#app`, modal, dan script module
- Tidak ada konten spesifik halaman
- Ukuran sangat ringan (58 baris vs 370 baris sebelumnya)

### 2. **Dynamic Template Loading**
- `main.js` akan mendeteksi status login user
- Jika belum login → fetch `templates/login.html`
- Jika sudah login → fetch `templates/dashboard.html`
- Template di-inject ke `<main id="app">`

### 3. **Modular JavaScript**
- Setiap fitur punya file sendiri
- Import/export ES6 modules
- Mudah dilacak dan di-debug

## 🎯 Keuntungan Pemecahan Kode

| Aspek | Sebelum | Sesudah |
|-------|---------|---------|
| **index.html** | 370 baris | 58 baris (-84%) |
| **script.js** | ~900 baris | 8 file modular |
| **style.css** | ~600 baris | 6 file terpecah |
| **Maintenance** | Sulit cari kode | Mudah, per fitur |
| **Kolaborasi** | Konflik merge | Minimal konflik |
| **Loading Awal** | Berat | Ringan, lazy load |

## 🚀 Cara Deploy ke GitHub Pages

1. **Push semua file ke repository GitHub**
   ```bash
   git add .
   git commit -m "Refactor: pecah frontend jadi modular"
   git push origin main
   ```

2. **Aktifkan GitHub Pages**
   - Settings > Pages
   - Source: Deploy from branch `main` / `master`
   - Folder: `/ (root)`

3. **Update URL Web App di `js/config.js`**
   ```javascript
   export const APP_CONFIG = {
       GAS_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
       // ...
   };
   ```

## 📝 Catatan Penting

### Untuk Developer
- **Tambah fitur baru?** Buat file modul baru di folder sesuai jenisnya
- **Edit UI?** Edit file di `templates/` atau `css/components.css`
- **Bug di login?** Cek `templates/login.html` dan `js/login.js`

### Template Loading
Karena menggunakan `fetch()` untuk template:
- ✅ Otomatis jalan di GitHub Pages
- ✅ Jalan di localhost dengan Live Server
- ⚠️ Tidak bisa langsung buka file (`file://` protocol)

### Kompatibilitas Browser
- Menggunakan ES6 Modules (`import`/`export`)
- Mendukung browser modern (Chrome, Firefox, Edge, Safari versi terbaru)
- Untuk browser lama, perlu transpiler (Babel)

## 🔧 File yang Dihapus
- ❌ `script.js` (sudah dipecah jadi 8 modul)
- ❌ `style.css` (sudah dipecah jadi 6 modul)

## 📊 Statistik Kode

| Kategori | File | Total Baris |
|----------|------|-------------|
| **HTML** | index.html + templates | 369 baris |
| **CSS** | 6 file | ~600 baris |
| **JS** | 8 modul | ~966 baris |
| **Total** | 17 file | ~1,935 baris |

---

**Last Updated:** Juli 2024  
**Version:** 2.0 (Modular Architecture)
