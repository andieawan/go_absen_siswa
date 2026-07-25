# Integrasi Antar-Aplikasi: Master Siswa, Master Guru, & SSO

Dokumen ini menjelaskan langkah manual yang perlu Anda lakukan setelah kode
di-update, supaya arsitektur data master terpisah (Siswa & Guru) dan SSO
lintas aplikasi berjalan dengan benar.

## 1. Pisahkan Spreadsheet Master

Sebelumnya, sheet `Akun_Guru` dan sheet-sheet per-kelas siswa ada dalam
**satu** spreadsheet yang sama. Sekarang dipisah jadi 2:

| Spreadsheet | Isi | Sifat untuk app absensi ini |
|---|---|---|
| **Master Siswa** (yang lama, tetap dipakai) | Sheet per kelas (mis. "XI DKV 1", dst) | **Read-only** — yang menulis/mengubah adalah Aplikasi Manajemen Siswa |
| **Master Guru** (baru, perlu dibuat) | Sheet `Akun_Guru` | Dipakai bersama lintas aplikasi (SSO) |

### Langkah migrasi:
1. Buat **spreadsheet Google Sheets baru** — ini akan jadi Master Guru.
2. Buka spreadsheet Master yang lama, klik kanan sheet **`Akun_Guru`** →
   **Move to** (atau copy manual isinya) → pindahkan ke spreadsheet baru.
3. Salin ID spreadsheet baru dari URL-nya (`.../d/`**`ID_DI_SINI`**`/edit`).
4. Buka project Apps Script → **Project Settings** → **Script Properties**
   → tambahkan property baru: `SPREADSHEET_MASTER_GURU_ID` = ID yang tadi
   disalin. (Atau timpa langsung nilai default di `kodegs/Config.gs`.)
5. Spreadsheet Master yang lama TETAP dipakai sebagai Master Siswa — tidak
   perlu buat spreadsheet baru untuk siswa, ID-nya tetap sama seperti
   sebelumnya (`SPREADSHEET_MASTER_SISWA_ID`).

## 2. Kolom "Status" di sheet siswa per kelas

Supaya siswa yang pindah/berhenti tidak menghilangkan data absensi lama
mereka, Aplikasi Manajemen Siswa (bukan app absensi ini) perlu menambahkan
**kolom E ("Status")** di tiap sheet kelas, dengan nilai:

- Kosong, atau `Aktif` → siswa tetap tampil di daftar absensi
- `Pindah`, `Berhenti`, `Nonaktif`, atau `Keluar` (tidak case-sensitive) →
  siswa **disembunyikan** dari daftar absensi di app ini, TAPI barisnya
  tetap ada di sheet (tidak dihapus), supaya data absensi historis yang
  mereferensikan NIS tersebut tetap utuh.

App absensi ini sudah otomatis membaca kolom ini (`kodegs/Absensi.gs`,
fungsi `getStudents()`) — kalau kolom Status belum ada sama sekali di
suatu sheet kelas, semua siswa tetap dianggap aktif seperti biasa (tidak
ada perubahan perilaku untuk kelas yang belum disentuh).

## 3. Aktifkan SSO (login sekali, dipakai semua aplikasi)

**REVISI:** setiap aplikasi (absensi, nilai, dst) ternyata akan pakai
**subdomain sendiri-sendiri** di bawah 1 domain induk yang sama (mis.
`absensi-siswa.smkibupakusari.sch.id` vs
`nilai-siswa.smkibupakusari.sch.id`), BUKAN 1 origin yang sama persis.
Subdomain berbeda dianggap ORIGIN BERBEDA oleh browser, jadi
`localStorage` **tidak bisa** dipakai untuk SSO di sini (localStorage
di-scope per origin, tidak per domain induk).

Sesi sekarang disimpan lewat **cookie** dengan atribut `Domain` yang
di-set ke domain induk (`.smkibupakusari.sch.id`) — cookie memang
satu-satunya storage browser yang didesain untuk bisa dibagi ke semua
subdomain dari 1 domain induk. Lihat `js/ssoCookie.js` untuk
implementasinya.

**Yang perlu dilakukan di SETIAP aplikasi (absensi, nilai, dst):**

1. Pastikan `js/config.js` di semua aplikasi pakai nilai yang **SAMA
   PERSIS**:
   - `SESSION_KEY: 'sso_session'`
   - `SSO_COOKIE_DOMAIN: '.smkibupakusari.sch.id'` (titik di depan penting
     — artinya berlaku untuk SEMUA subdomain, bukan cuma domain persis itu)
2. Di **Script Properties** SETIAP project Apps Script (bukan cuma yang
   ini), tambahkan property `SESSION_SECRET_KEY` dengan **nilai string
   acak yang SAMA PERSIS** di semua aplikasi. Contoh cara generate nilai
   acak: jalankan `Utilities.getUuid() + Utilities.getUuid()` sekali di
   editor Apps Script mana saja, salin hasilnya, lalu paste sebagai value
   `SESSION_SECRET_KEY` di Script Properties SEMUA aplikasi.
   - **PENTING:** kalau langkah ini dilewati, tiap aplikasi otomatis
     generate secret ACAK SENDIRI-SENDIRI saat pertama kali dipakai —
     token dari 1 aplikasi tidak akan valid diverifikasi aplikasi lain.
3. Semua aplikasi sebaiknya membaca dari **spreadsheet Master Guru yang
   sama** (`SPREADSHEET_MASTER_GURU_ID` yang sama) untuk validasi akun.
4. Pastikan semua subdomain aplikasi diakses lewat **HTTPS** (bukan
   HTTP) — cookie sesi diberi atribut `Secure`, jadi hanya akan
   ter-set/terbaca lewat koneksi HTTPS. GitHub Pages dengan custom domain
   biasanya otomatis dapat HTTPS via Let's Encrypt, tapi pastikan opsi
   "Enforce HTTPS" di pengaturan repo GitHub Pages sudah dicentang.

Setelah keempat hal di atas disamakan di semua aplikasi, pengguna yang
login di salah satu aplikasi otomatis dianggap sudah login juga di
aplikasi lain (selama cookie-nya belum kedaluwarsa / belum logout),
walau tiap aplikasi ada di subdomain yang berbeda-beda.

## 4. Kalau nanti pindah dari Spreadsheet ke database sungguhan

Anda sempat menyebut kemungkinan pindah ke hosting sendiri + database
asli (bukan Spreadsheet) kalau datanya sudah banyak. Kode sudah disusun
supaya perpindahan ini tidak terlalu menyakitkan:
- Semua akses siswa lewat `getMasterSiswaSs()`, akses guru lewat
  `getMasterGuruSs()` — kalau nanti diganti ke database asli, cukup ubah
  isi 2 fungsi ini (dan fungsi-fungsi lain yang langsung baca sheet di
  dalamnya) tanpa perlu menyentuh logika bisnis di file lain.
- Di frontend, semua akses sesi lewat satu titik (`js/api.js`:
  `login()`/`logout()`/`isLoggedIn()`/`getCurrentUser()`) -- kalau nanti
  SSO diganti jadi berbasis cookie/JWT dari backend asli, cukup ubah isi
  fungsi-fungsi ini saja.
