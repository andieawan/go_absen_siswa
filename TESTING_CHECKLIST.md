# Checklist Testing Manual - Aplikasi Absensi Sekolah

Setelah perbaikan keamanan dan bug fungsional, lakukan testing manual berikut:

## 1. LOGIN & AUTENTIKASI

### 1.1 Login Berhasil
- [ ] Buka aplikasi di browser
- [ ] Masukkan username dan password yang valid
- [ ] Klik tombol Login
- [ ] **Expected**: Berhasil login, diarahkan ke dashboard, token disimpan di sessionStorage

### 1.2 Login Gagal (Password Salah)
- [ ] Masukkan username valid, password salah
- [ ] **Expected**: Pesan error "Username atau password salah"

### 1.3 Rate Limiting Login (Anti Brute Force)
- [ ] Coba login gagal 5 kali berturut-turut dengan username yang sama
- [ ] Pada percobaan ke-6, **Expected**: Pesan error "Terlalu banyak percobaan login gagal. Coba lagi dalam 15 menit."

### 1.4 Session Management
- [ ] Setelah login, tutup tab browser dan buka kembali
- [ ] **Expected**: Masih login (sessionStorage persist selama tab aktif)
- [ ] Buka tab baru/incognito, **Expected**: Harus login ulang

## 2. KEAMANAN ENDPOINT GET

### 2.1 Akses getStudents Tanpa Token
- [ ] Buka DevTools > Network tab
- [ ] Coba akses URL backend dengan action=getStudents&kelas=X-A (tanpa username & token)
- [ ] **Expected**: Response `{success: false, message: "Token tidak valid..."}`

### 2.2 Akses getStudents Dengan Token Valid
- [ ] Login dulu untuk dapat token
- [ ] Akses URL: `...?action=getStudents&kelas=X-A&username=<user>&token=<token>`
- [ ] **Expected**: Jika kelas X-A adalah kelas guru tersebut, response `{success: true, data: [...]}`

### 2.3 Akses Kelas Orang Lain (Authorization Test)
- [ ] Login sebagai guru A yang hanya mengajar kelas X-A
- [ ] Coba akses getStudents untuk kelas XI-B (bukan kelas guru A)
- [ ] **Expected**: Response `{success: false, message: "Anda tidak berhak mengakses data kelas..."}`

### 2.4 Akses Dashboard Data Wali Kelas
- [ ] Login sebagai wali kelas
- [ ] Akses getDashboardDataWali untuk kelas yang bukan walinya
- [ ] **Expected**: Response `{success: false, message: "Anda bukan wali kelas..."}`

## 3. SUBMIT ABSENSI

### 3.1 Submit Absensi Normal
- [ ] Login sebagai guru
- [ ] Pilih mata pelajaran, kelas, tanggal
- [ ] Load siswa, set status kehadiran
- [ ] Klik "Simpan Absensi"
- [ ] **Expected**: Response `{success: true, message: "Data absensi berhasil disimpan!"}`

### 3.2 Submit Absensi Tanpa Token
- [ ] Logout atau hapus sessionStorage
- [ ] Coba submit absensi via console/API langsung
- [ ] **Expected**: Response `{success: false, message: "Sesi tidak valid..."}`

### 3.3 Update Absensi (Tanggal Sama)
- [ ] Submit absensi untuk kelas/mapel/tanggal tertentu
- [ ] Submit lagi dengan data berbeda untuk tanggal yang sama
- [ ] **Expected**: Data diperbarui (bukan duplikat), message "Data absensi diperbarui!"

## 4. DOWNLOAD REKAP

### 4.1 Download Rekap Mata Pelajaran
- [ ] Login sebagai guru
- [ ] Buka panel Rekap
- [ ] Klik "Unduh Rekap Mata Pelajaran"
- [ ] **Expected**: File CSV terdownload, token TIDAK terlihat di URL (dikirim via POST body)

### 4.2 Download Rekap Wali Kelas
- [ ] Login sebagai wali kelas
- [ ] Buka panel Rekap
- [ ] Klik "Unduh Rekap Wali Kelas"
- [ ] **Expected**: File CSV terdownload dengan data absensi harian kelas wali

### 4.3 Download Rekap Tanpa Token
- [ ] Logout
- [ ] Coba akses endpoint download rekap langsung
- [ ] **Expected**: Response error, tidak ada file terdownload

## 5. XSS PROTECTION

### 5.1 Input Data dengan Karakter Khusus
- [ ] Jika ada form input nama/data lain, coba masukkan: `<script>alert('XSS')</script>`
- [ ] Submit dan lihat di tabel/list
- [ ] **Expected**: Teks ditampilkan apa adanya (tidak execute script), karena escapeHtml() dipakai

### 5.2 Notification Message
- [ ] Trigger notifikasi dengan pesan yang mengandung HTML
- [ ] **Expected**: HTML di-escape, tidak render sebagai tag

## 6. ERROR HANDLING

### 6.1 Error Log di Backend
- [ ] Trigger error di backend (misal: akses sheet yang tidak ada)
- [ ] Cek Logs di Apps Script (View > Executions atau Stackdriver Logging)
- [ ] **Expected**: Error detail tercatat di Logger.log(), tapi response ke client hanya "Terjadi kesalahan pada server."

### 6.2 Network Error di Frontend
- [ ] Putuskan koneksi internet saat submit absensi
- [ ] **Expected**: Notifikasi error user-friendly, bukan stack trace

## 7. MIGRASI PASSWORD HASH

### 7.1 Jalankan Migrasi
- [ ] Di Apps Script Editor, jalankan fungsi `migrasiHashPassword()` dari file MigrasiHash.gs
- [ ] **Expected**: Log menunjukkan jumlah user yang di-hash

### 7.2 Verifikasi Hash
- [ ] Buka sheet Akun_Guru di Google Sheets
- [ ] Cek kolom G (salt) dan H (password_hash)
- [ ] **Expected**: Kolom G berisi UUID, kolom H berisi string hex 64 karakter (SHA-256)

### 7.3 Login Setelah Migrasi
- [ ] Login dengan password lama (sebelum migrasi)
- [ ] **Expected**: Masih bisa login (fallback mode masih aktif untuk transisi)

### 7.4 Reset Password User
- [ ] Jalankan `resetPasswordUser('username', 'passwordBaru')` di Apps Script
- [ ] Login dengan password baru
- [ ] **Expected**: Berhasil login dengan password baru

## 8. KONSTANTA STATUS ABSENSI

### 8.1 Validasi Status di Utils.gs
- [ ] Cek fungsi validateInput dengan type='status_absen'
- [ ] Test dengan input 'H', 'I', 'S', 'A' → **Expected**: return true
- [ ] Test dengan input 'Hadir', 'Alpha' → **Expected**: return error message

---

## Ringkasan Perubahan Keamanan

| No | Celah Sebelumnya | Perbaikan | File |
|----|------------------|-----------|------|
| 1 | Endpoint GET tanpa autentikasi | Wrapper `handleGetDenganValidasi()` wajibkan username+token | Router.gs |
| 2 | Password plaintext | Hash SHA-256 + salt per user | Auth.gs, MigrasiHash.gs |
| 3 | Token dikirim via query string di download | POST dengan body, generate CSV di client | api.js |
| 4 | Action name tidak sinkron frontend-backend | Samakan: submit, submitAbsenWali, getStudents, dll | api.js |
| 5 | Rate limiting bisa DoS per username | Cache key berdasarkan username (sudah ada) | Auth.gs |
| 6 | Error detail bocor ke client | Logger.log() di backend, generic message ke client | Router.gs |
| 7 | XSS via innerHTML | Helper escapeHtml() di utils.js | utils.js |
| 8 | Konstanta status tidak konsisten | Fix validateInput: ['H','I','S','A'] | Utils.gs |
| 9 | File duplikat tidak terpakai | Hapus auth.js, absensi.js, dashboard.js lama | js/ |
| 10 | Session storage tidak konsisten | sessionStorage untuk token+username, localStorage untuk user_data | api.js |

**Status**: ✅ Selesai - Semua prioritas 1, 2, 3 telah diimplementasikan.
