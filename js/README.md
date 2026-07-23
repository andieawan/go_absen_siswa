# Sistem Absensi Sekolah - Frontend Modular

## 📁 Struktur Folder

```
/workspace/
├── index.html              # File HTML utama (Single Page Application)
├── style.css               # Styling aplikasi
├── js/                     # Folder modul JavaScript
│   ├── main.js            # Entry point aplikasi
│   ├── config.js          # Konfigurasi global (URL backend, dll)
│   ├── api.js             # Service komunikasi dengan Google Apps Script
│   ├── auth.js            # Modul autentikasi & autorisasi
│   ├── login.js           # Modul form login
│   ├── dashboard.js       # Modul dashboard & statistik
│   ├── absensi.js         # Modul form absensi per mapel
│   └── utils.js           # Fungsi-fungsi utility helper
└── kodegs/                 # Backend Google Apps Script
    ├── Config.gs
    ├── Auth.gs
    ├── Router.gs
    ├── Absensi.gs
    ├── AbsenWali.gs
    ├── Dashboard.gs
    ├── Rekap.gs
    ├── Utils.gs
    ├── Migrasi.gs
    └── Trigger.gs
```

## 🚀 Cara Menggunakan

### 1. Setup Backend (Google Apps Script)

1. Buka [script.google.com](https://script.google.com)
2. Buat project baru
3. Salin semua file `.gs` dari folder `kodegs/` ke editor Apps Script
4. Jalankan fungsi `setupConfig()` untuk inisialisasi
5. Jalankan `setupWeeklyTrigger()` untuk setup trigger mingguan
6. Deploy sebagai Web App:
   - **Execute as**: Me
   - **Who has access**: Anyone
7. Salin URL Web App yang dihasilkan

### 2. Setup Frontend (GitHub Pages)

1. Buka file `js/config.js`
2. Ganti nilai `BACKEND_URL` dengan URL Web App dari langkah sebelumnya:
   ```javascript
   BACKEND_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
   ```
3. Push kode ke repository GitHub
4. Aktifkan GitHub Pages di repository settings
5. Akses aplikasi melalui `https://yourusername.github.io/your-repo/`

## 📦 Modul JavaScript

### `config.js`
Konfigurasi global aplikasi:
- URL Backend Google Apps Script
- Nama aplikasi
- Session key
- Timeout default
- Status absensi constants

### `api.js`
Service untuk komunikasi dengan backend:
- `login(username, password)` - Autentikasi user
- `logout()` - Logout user
- `isLoggedIn()` - Cek status login
- `getCurrentUser()` - Dapatkan data user aktif
- `submitAbsensi(data)` - Submit absensi per mapel
- `submitAbsenWali(data)` - Submit absensi wali kelas
- `getSiswaByKelas(kelas)` - Ambil data siswa per kelas
- `getDashboardData()` - Ambil data dashboard
- `getRekapAbsensi(filters)` - Ambil rekap absensi
- `downloadRekapExcel(filters)` - Download rekap Excel

### `auth.js`
Manajemen autentikasi:
- `initAuth()` - Inisialisasi sistem auth
- `requireRole(roles)` - Proteksi halaman berdasarkan role

### `login.js`
Form login handling:
- `initLoginForm()` - Setup form login
- Validasi input
- Error handling

### `dashboard.js`
Dashboard & statistik:
- `initDashboard()` - Load dan render dashboard
- Update kartu statistik
- Render tabel rekap

### `absensi.js`
Form absensi per mapel:
- `initAbsensiForm()` - Setup form absensi
- Load daftar siswa per kelas
- Submit absensi

### `utils.js`
Fungsi utility:
- `formatDate(date)` - Format tanggal YYYY-MM-DD
- `formatDateIndo(date)` - Format tanggal DD/MM/YYYY
- `formatTime(date)` - Format waktu HH:MM
- `debounce(func, wait)` - Debounce function
- `validateNis(nis)` - Validasi NIS
- `getStatusBadge(status)` - Mapping status badge
- `showLoading(elementId)` - Show loading state
- `hideLoading(elementId)` - Hide loading state
- `showNotification(message, type)` - Show toast notification

### `main.js`
Entry point aplikasi:
- Deteksi halaman aktif
- Inisialisasi modul sesuai halaman
- Global error handler
- Unhandled promise rejection handler

## 🔧 Development

### Menambah Halaman Baru

1. Buat file HTML baru (misal: `rekap.html`)
2. Tambahkan route di `main.js`:
   ```javascript
   case currentPage.includes('rekap.html'):
       initRekapModule();
       break;
   ```
3. Buat modul baru di `js/rekap.js`
4. Export fungsi `initRekapModule()`

### Menambah API Endpoint

1. Tambahkan fungsi di `js/api.js`:
   ```javascript
   export async function newEndpoint(data) {
       const token = sessionStorage.getItem(CONFIG.SESSION_KEY);
       const response = await fetchWithTimeout(CONFIG.BACKEND_URL, {
           method: 'POST',
           headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${token}`
           },
           body: JSON.stringify({
               action: 'new_action',
               ...data
           })
       });
       return response;
   }
   ```
2. Tambahkan handler di backend (`kodegs/Router.gs`)

## 🎨 Styling

File `style.css` menggunakan:
- CSS Variables untuk theming
- Flexbox & Grid untuk layout
- Responsive design untuk mobile
- Utility classes untuk komponen umum

## 🔐 Keamanan

- Token-based authentication (sessionStorage)
- Role-based access control (RBAC)
- Input validation di frontend & backend
- CORS handled by Google Apps Script
- HTTPS enforced oleh GitHub Pages & Google

## 📝 Best Practices

1. **Modularitas**: Setiap fitur dalam modul terpisah
2. **Error Handling**: Try-catch di semua async operations
3. **Loading States**: Feedback visual saat proses
4. **Notifications**: Toast notifications untuk user feedback
5. **Code Reusability**: Fungsi utility di `utils.js`
6. **Documentation**: Komentar untuk setiap modul & fungsi penting

## 🐛 Troubleshooting

### Frontend tidak connect ke backend
- Pastikan `BACKEND_URL` di `config.js` sudah benar
- Cek CORS policy di Google Apps Script
- Verifikasi Web App deployment status

### Login gagal
- Cek credentials di database
- Verifikasi fungsi `login()` di backend
- Periksa console browser untuk error detail

### Data tidak muncul
- Cek network tab di browser DevTools
- Verifikasi response dari backend
- Pastikan user memiliki akses/role yang sesuai

## 📄 License

[License informasi jika ada]

## 👥 Contributors

[Nama kontributor]
