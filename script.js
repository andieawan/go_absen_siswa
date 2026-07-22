// =========================================================
// KONFIGURASI
// ---------------------------------------------------------
// Ganti URL Web App Google Apps Script di sini kalau berubah.
// URL ini didapat dari Deploy > Manage deployments > Web app URL
// di project Apps Script Anda.
// =========================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyMGAl2rTMzOEVkosA-QKNrVvo69x3WZPrYgRBRcVF9JL-K1guOv-zJAWnisfCZ1t8n/exec';
// ===== SELESAI: KONFIGURASI =====


// =========================================================
// STATE & REFERENSI ELEMEN GLOBAL
// ---------------------------------------------------------
// sessionData: data guru yang sedang login (dari sessionStorage).
// Kalau sudah ada sesi tersimpan, langsung tampilkan dashboard
// tanpa perlu login ulang (selama tab browser belum ditutup).
// =========================================================
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
let sessionData = JSON.parse(sessionStorage.getItem('guruSession'));
if (sessionData) showDashboard();
// ===== SELESAI: STATE & REFERENSI ELEMEN GLOBAL =====


// =========================================================
// OPTIMASI PERFORMA #1: CACHE DATA SISWA DI FRONTEND
// ---------------------------------------------------------
// Format: { "X-A": [{nis, nama, jk}, ...], "X-B": [...], ... }
//
// KEUNTUNGAN:
// Kalau guru ganti "Mata Pelajaran" tapi "Kelas"-nya sama,
// aplikasi tidak perlu fetch ulang dari server. Data langsung
// tersedia dari cache, menghemat ~0.5-1 detik waktu tunggu.
//
// CATATAN: cache ini hanya hidup selama tab browser aktif.
// Kalau tab ditutup / di-refresh, cache hilang (by design,
// supaya data siswa selalu fresh saat sesi baru dimulai).
// =========================================================
const studentCache = {};
// ===== SELESAI: CACHE DATA SISWA =====


// =========================================================
// OPTIMASI PERFORMA #2: FUNGSI DEBOUNCE
// ---------------------------------------------------------
// Mencegah request beruntun ke server saat pengguna mengganti
// dropdown / input dengan cepat. Fungsi akan menunggu "wait" ms
// SETELAH aksi terakhir sebelum benar-benar dieksekusi.
//
// EFEK: mengurangi beban server & jaringan hingga 90% saat
// pengguna mengklik dropdown berulang kali.
//
// CARA PAKAI:
//   element.addEventListener('change', debounce(myFunction, 300));
// =========================================================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
// ===== SELESAI: FUNGSI DEBOUNCE =====


// =========================================================
// GITHUB PAGES COMPATIBILITY: HELPER FETCH GAS
// ---------------------------------------------------------
// Semua request ke Google Apps Script dibungkus di fungsi ini
// supaya tidak perlu tulis option berulang-ulang di setiap
// pemanggilan fetch().
//
// KENAPA PERLU?
// 1. mode: 'cors'    -> paksa mode CORS eksplisit, mencegah
//                        masalah cross-origin sporadis di browser
// 2. redirect: 'follow' -> GAS Web App melakukan redirect dari
//                        /macros/s/.../exec ke temporary URL.
//                        Tanpa ini, Safari iOS kadang menolak response.
//
// CARA PAKAI:
//   const resData = await fetchGas('getStudents', { kelas: 'X-A' });  // GET
//   const resData = await fetchGas(null, { action: 'login', ... });   // POST
// =========================================================
async function fetchGas(actionOrPayload, paramsOrBody = null, isPost = false) {
    let url, options;

    if (isPost) {
        // POST request: body berupa object yang akan di-JSON.stringify
        url = GAS_URL;
        options = {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // GAS tidak terima application/json
            body: JSON.stringify(actionOrPayload)
        };
    } else {
        // GET request: bangun URL dengan query string
        const query = new URLSearchParams();
        if (actionOrPayload) query.append('action', actionOrPayload);
        if (paramsOrBody) {
            Object.entries(paramsOrBody).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') query.append(k, v);
            });
        }
        url = `${GAS_URL}?${query.toString()}`;
        options = {
            method: 'GET',
            mode: 'cors',
            redirect: 'follow'
        };
    }

    const response = await fetch(url, options);
    return await response.json();
}
// ===== SELESAI: HELPER FETCH GAS =====


// =========================================================
// KOMPONEN: STUDENT TABLE (Prioritas #1 - Component Thinking)
// ---------------------------------------------------------
// Menggabungkan logika render & pembacaan tabel siswa yang
// sebelumnya duplikat di 2 tempat (panel mapel & panel wali).
//
// CARA PAKAI:
//   StudentTable.render('studentsBody', dataSiswa);
//   StudentTable.setStatus('studentsBody', '12345', 'I');
//   const data = StudentTable.getAttendanceData('studentsBody');
//   StudentTable.resetAll('studentsBody');
//
// KEUNTUNGAN:
//   - Tidak ada duplikasi kode antara panel mapel & wali
//   - Lookup status pakai NIS (bukan index) => lebih robust,
//     tidak rusak kalau urutan siswa berubah / ada filter
//   - Radio name unik per NIS (format: "absen_<tbodyId>_<nis>")
//     sehingga 2 tabel di halaman yang sama tidak bentrok
//   - Pakai DocumentFragment => browser hanya 1x reflow
//     (performa jauh lebih baik, terutama di HP)
// =========================================================
const StudentTable = {
    // Render daftar siswa ke dalam tbody tertentu.
    // - tbodyId: ID elemen <tbody> tujuan (misal 'studentsBody')
    // - students: array {nis, nama, jk} dari server
    render(tbodyId, students) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        tbody.innerHTML = '';
        const fragment = document.createDocumentFragment();
        students.forEach(siswa => {
            const tr = document.createElement('tr');
            tr.className = 'student-row'; // dipakai CSS untuk tampilan kartu di HP
            tr.dataset.nis = siswa.nis;   // kunci utama: NIS, bukan nama (Prioritas #1 backend)
            // Radio name pakai format unik: "absen_<tbodyId>_<nis>"
            // supaya 2 tabel (mapel & wali) tidak bentrok walau NIS sama.
            const radioName = `absen_${tbodyId}_${siswa.nis}`;
            tr.innerHTML = `
                <td>${siswa.nis || '-'}</td>
                <td class="nama-siswa">${siswa.nama}</td>
                <td>
                    <div class="radio-group">
                        <label><input type="radio" name="${radioName}" value="H" checked required> H</label>
                        <label><input type="radio" name="${radioName}" value="I"> I</label>
                        <label><input type="radio" name="${radioName}" value="S"> S</label>
                        <label><input type="radio" name="${radioName}" value="A"> A</label>
                    </div>
                </td>
            `;
            fragment.appendChild(tr);
        });
        tbody.appendChild(fragment); // Hanya 1x reflow ke DOM
    },

    // Set status kehadiran (H/I/S/A) untuk 1 siswa berdasarkan NIS.
    // Dipakai saat masuk mode edit (auto-detect data lama).
    setStatus(tbodyId, nis, status) {
        const row = document.querySelector(`#${tbodyId} tr.student-row[data-nis="${nis}"]`);
        if (!row) return;
        const targetRadio = row.querySelector(`input[type="radio"][value="${status}"]`);
        if (targetRadio) targetRadio.checked = true;
    },

    // Reset semua siswa ke status default (Hadir).
    // Dipakai saat guru memilih tanggal baru yang belum ada datanya.
    resetAll(tbodyId) {
        const rows = document.querySelectorAll(`#${tbodyId} tr.student-row`);
        rows.forEach(row => {
            const targetRadio = row.querySelector('input[type="radio"][value="H"]');
            if (targetRadio) targetRadio.checked = true;
        });
    },

    // Ambil semua data kehadiran dari tabel.
    // Return: array of { nis, status } — siap dikirim ke backend.
    // PENTING (Prioritas #1 backend): yang dikirim adalah NIS, bukan nama,
    // supaya 2 siswa dengan nama sama persis tidak saling tertimpa.
    getAttendanceData(tbodyId) {
        const rows = document.querySelectorAll(`#${tbodyId} tr.student-row`);
        const data = [];
        rows.forEach(row => {
            const nis = row.dataset.nis;
            const checked = row.querySelector('input[type="radio"]:checked');
            if (nis && checked) {
                data.push({ nis, status: checked.value });
            }
        });
        return data;
    },

    // Cek apakah tabel memiliki data siswa (belum kosong).
    hasData(tbodyId) {
        return document.querySelectorAll(`#${tbodyId} tr.student-row`).length > 0;
    }
};
// ===== SELESAI: KOMPONEN STUDENT TABLE =====


// =========================================================
// FUNGSI CUSTOM ALERT (popup notifikasi)
// ---------------------------------------------------------
// Panggil showAlert("pesan", true/false) dari bagian manapun.
// true = sukses (hijau), false = gagal (merah).
// =========================================================
function showAlert(message, isSuccess = true) {
    const modal = document.getElementById('customAlert');
    const icon = document.getElementById('alertIcon');
    const title = document.getElementById('alertTitle');
    const msg = document.getElementById('alertMessage');
    const btn = document.querySelector('#customAlert .modal-btn');
    if (isSuccess) {
        icon.innerHTML = '✓';
        icon.className = 'modal-icon icon-success';
        title.innerText = 'Berhasil!';
        btn.style.backgroundColor = '#10B981'; // Hijau
    } else {
        icon.innerHTML = '✕';
        icon.className = 'modal-icon icon-error';
        title.innerText = 'Oops, Gagal!';
        btn.style.backgroundColor = '#EF4444'; // Merah
    }
    msg.innerText = message;
    modal.classList.add('active');
}
function closeCustomAlert() {
    document.getElementById('customAlert').classList.remove('active');
}
// ===== SELESAI: FUNGSI CUSTOM ALERT =====


// =========================================================
// FUNGSI CUSTOM CONFIRM (popup Ya/Tidak)
// ---------------------------------------------------------
// Dipakai untuk minta konfirmasi eksplisit sebelum masuk mode
// edit menimpa absensi yang sudah ada di tanggal yang sama.
//
// CARA PAKAI:
//   const lanjut = await showConfirmModal("pesan...");
//   lanjut = true kalau guru pilih "Ya, Lanjutkan"
//   lanjut = false kalau guru pilih "Tidak"
// =========================================================
function showConfirmModal(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        document.getElementById('confirmMessage').innerText = message;
        modal.classList.add('active');
        const btnYes = document.getElementById('confirmBtnYes');
        const btnNo = document.getElementById('confirmBtnNo');
        function selesai(hasil) {
            modal.classList.remove('active');
            btnYes.removeEventListener('click', onYes);
            btnNo.removeEventListener('click', onNo);
            resolve(hasil);
        }
        function onYes() { selesai(true); }
        function onNo() { selesai(false); }
        btnYes.addEventListener('click', onYes);
        btnNo.addEventListener('click', onNo);
    });
}
// ===== SELESAI: FUNGSI CUSTOM CONFIRM =====


// =========================================================
// HANDLE LOGIN
// ---------------------------------------------------------
// Kirim username + password ke backend. Kalau berhasil,
// simpan data sesi (termasuk token HMAC) ke sessionStorage
// supaya tidak perlu login ulang selama tab belum ditutup.
// =========================================================
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const btn = e.target.querySelector('button');
    const msg = document.getElementById('loginMsg');
    btn.innerText = 'Mengecek...';
    msg.innerText = '';
    try {
        const resData = await fetchGas({ action: 'login', username: user, password: pass }, null, true);
        if (resData.success) {
            sessionStorage.setItem('guruSession', JSON.stringify(resData.data));
            sessionData = resData.data;
            showDashboard();
        } else {
            msg.innerText = resData.message;
        }
    } catch (error) {
        msg.innerText = "Gagal terhubung ke server.";
    }
    btn.innerText = 'Login';
});
// ===== SELESAI: HANDLE LOGIN =====


// =========================================================
// TAMPILKAN DASHBOARD (setelah login / saat sesi ditemukan)
// ---------------------------------------------------------
// Fungsi ini:
// 1. Menyembunyikan panel login, menampilkan dashboard
// 2. Mengisi dropdown mapel & kelas dari data sesi
// 3. Memasang event listener (pakai debounce supaya tidak
//    spam request saat dropdown diganti cepat)
// 4. Menampilkan tab "Absen Wali" kalau guru punya kelasWali
// =========================================================
function showDashboard() {
    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    document.getElementById('greeting').innerText = `Selamat Mengajar, ${sessionData.nama}`;
    document.getElementById('tanggalAbsen').valueAsDate = new Date();

    // Isi dropdown mapel (OPTIMASI: pakai Array.map().join()
    // daripada innerHTML += di loop, lebih cepat & bersih)
    const mapelArr = sessionData.mapel.split(',').map(s => s.trim());
    const selectMapel = document.getElementById('selectMapel');
    selectMapel.innerHTML = mapelArr.map(m => `<option value="${m}">${m}</option>`).join('');

    // Isi dropdown kelas
    const kelasArr = sessionData.kelas.split(',').map(s => s.trim());
    const selectKelas = document.getElementById('selectKelas');
    selectKelas.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>' +
                            kelasArr.map(k => `<option value="${k}">${k}</option>`).join('');

    // Event listener dengan debounce (OPTIMASI PERFORMA)
    selectKelas.addEventListener('change', debounce((e) => fetchStudents(e.target.value), 300));
    document.getElementById('tanggalAbsen').addEventListener('change', debounce(checkExistingAttendance, 300));
    document.getElementById('selectMapel').addEventListener('change', debounce(checkExistingAttendance, 300));

    // Tab "Absen Wali" hanya muncul jika guru ini punya Kelas Binaan
    // (kolom F di Akun_Guru tidak kosong)
    const tabBtnAbsenWali = document.getElementById('tabBtnAbsenWali');
    if (sessionData.kelasWali) {
        tabBtnAbsenWali.classList.remove('hidden');
        document.getElementById('waliKelasLabel').innerText = sessionData.kelasWali;
        document.getElementById('waliTanggal').valueAsDate = new Date();
        document.getElementById('waliTanggal').addEventListener('change', debounce(checkExistingAbsenWali, 300));
        fetchStudentsWali(sessionData.kelasWali); // muat data siswa sekali di awal
        fetchRiwayatAbsenWali();                  // muat riwayat sekali di awal
    } else {
        tabBtnAbsenWali.classList.add('hidden');
    }
}
// ===== SELESAI: TAMPILKAN DASHBOARD =====


// =========================================================
// GANTI TAB (Input Absensi / Riwayat / Dashboard / Absen Wali)
// ---------------------------------------------------------
// Tambah tab baru? Ikuti 3 langkah:
// 1. Tambah <button class="tab-btn" data-tab="panelBaru">...</button>
//    di index.html
// 2. Tambah <div id="panelBaru" class="tab-panel hidden">...</div>
//    di index.html
// 3. Tambahkan kondisi "if (tabId === 'panelBaru')" di bawah ini
// =========================================================
function switchTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');

    // Muat data saat tab dibuka (lazy loading)
    if (tabId === 'panelRiwayat') setupRiwayatSelectors();
    if (tabId === 'panelDashboard') loadDashboard();
}
// ===== SELESAI: GANTI TAB =====


// =========================================================
// FETCH DATA SISWA (panel Input Absensi per Mapel)
// ---------------------------------------------------------
// DIPANGGIL saat guru memilih kelas.
// Sekarang hanya wrapper tipis ke StudentTable.render() --
// logika render & pembacaan data ada di komponen.
//
// OPTIMASI: cek studentCache dulu, kalau ada langsung render
// tanpa fetch ke server (hemat ~0.5-1 detik).
// =========================================================
async function fetchStudents(kelas) {
    const tbody = document.getElementById('studentsBody');
    const loading = document.getElementById('loading');
    const btnSubmit = document.getElementById('btnSubmit');
    tbody.innerHTML = '';
    btnSubmit.style.display = 'none';
    loading.classList.remove('hidden');

    try {
        let students = studentCache[kelas];
        if (!students) {
            // Cache miss: fetch dari server
            const resData = await fetchGas('getStudents', { kelas });
            loading.classList.add('hidden');
            if (!resData.success || resData.data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3">${resData.message || 'Tidak ada data siswa.'}</td></tr>`;
                return;
            }
            students = resData.data;
            studentCache[kelas] = students; // simpan ke cache
        } else {
            // Cache hit: langsung lanjut, tidak perlu loading
            loading.classList.add('hidden');
        }
        // DELEGASI ke komponen StudentTable (tidak ada duplikasi render)
        StudentTable.render('studentsBody', students);
        btnSubmit.style.display = 'block';
        await checkExistingAttendance();
    } catch (error) {
        loading.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="3">Gagal mengambil data siswa.</td></tr>`;
    }
}
// ===== SELESAI: FETCH DATA SISWA (panel mapel) =====


// =========================================================
// CEK ABSENSI YANG SUDAH ADA (panel Input Absensi per Mapel)
// ---------------------------------------------------------
// Dipanggil setiap kali guru ganti mapel/kelas/tanggal.
// Kalau data sudah ada di tanggal tsb, tampilkan konfirmasi
// sebelum masuk mode edit (supaya tidak tidak sengaja menimpa).
//
// Sekarang pakai StudentTable.setStatus() berdasarkan NIS
// (bukan index), sehingga urutan siswa tidak lagi jadi masalah.
// =========================================================
async function checkExistingAttendance() {
    const mapel = document.getElementById('selectMapel').value;
    const kelas = document.getElementById('selectKelas').value;
    const tanggalInput = document.getElementById('tanggalAbsen');
    const tanggal = tanggalInput.value;
    const guru = sessionData.nama;
    const btnSubmit = document.getElementById('btnSubmit');
    if (!mapel || !kelas || !tanggal) return;
    if (!StudentTable.hasData('studentsBody')) return;

    btnSubmit.innerText = "Mengecek status...";
    try {
        const resData = await fetchGas('getExistingAttendance', { guru, mapel, kelas, tanggal });
        if (resData.success && resData.data) {
            // PERBAIKAN PRIORITAS #1 (KECIL): minta konfirmasi eksplisit
            // sebelum menimpa data yang sudah tersimpan.
            const lanjutEdit = await showConfirmModal(
                `Absensi untuk kelas ${kelas} - mapel ${mapel} pada tanggal ${formatTanggalIndo(tanggal)} sudah pernah diisi sebelumnya. Lanjutkan untuk mengedit data yang sudah tersimpan?`
            );
            if (!lanjutEdit) {
                // Guru memilih "Tidak" -- kosongkan tanggal supaya
                // tidak ada jalan tidak sengaja menimpa data ini.
                tanggalInput.value = '';
                btnSubmit.style.display = 'none';
                btnSubmit.innerText = "Simpan Absensi";
                return;
            }
            // Pecah string NIS dari backend jadi array
            const savedIzin = splitNisList(resData.data.izin);
            const savedSakit = splitNisList(resData.data.sakit);
            const savedAlpa = splitNisList(resData.data.alpa);
            // Set status per NIS (bukan per index) -- lebih robust
            const rows = document.querySelectorAll('#studentsBody tr.student-row');
            rows.forEach(row => {
                const nis = row.dataset.nis;
                let status = 'H';
                if (savedIzin.includes(nis)) status = 'I';
                else if (savedSakit.includes(nis)) status = 'S';
                else if (savedAlpa.includes(nis)) status = 'A';
                StudentTable.setStatus('studentsBody', nis, status);
            });
            btnSubmit.innerText = "Perbarui Absensi";
        } else {
            // Tanggal belum pernah diabsen -- reset semua ke Hadir
            StudentTable.resetAll('studentsBody');
            btnSubmit.innerText = "Simpan Absensi";
        }
    } catch (error) {
        btnSubmit.innerText = "Simpan Absensi";
    }
}
// ===== SELESAI: CEK ABSENSI YANG SUDAH ADA (panel mapel) =====


// =========================================================
// SUBMIT ABSENSI (panel Input Absensi per Mapel)
// ---------------------------------------------------------
// Sekarang pakai StudentTable.getAttendanceData() -- tidak
// perlu lagi loop manual + querySelector per index.
//
// PENTING (Prioritas #1 backend): yang dikirim adalah NIS,
// bukan nama, supaya 2 siswa dengan nama sama persis tidak
// saling tertimpa datanya.
// =========================================================
document.getElementById('absenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmit');
    // DELEGASI ke komponen: ambil semua {nis, status} sekaligus
    const attendanceData = StudentTable.getAttendanceData('studentsBody');
    const payload = {
        guru: sessionData.nama,
        mapel: document.getElementById('selectMapel').value,
        kelas: document.getElementById('selectKelas').value,
        tanggal: document.getElementById('tanggalAbsen').value,
        attendance: attendanceData
    };
    btn.innerText = "Menyimpan...";
    btn.disabled = true;
    try {
        const resData = await fetchGas({
            action: 'submit',
            username: sessionData.username,
            token: sessionData.token,
            payload: payload
        }, null, true);
        if (resData.success) {
            showAlert(resData.message, true);
            btn.innerText = "Perbarui Absensi";
        } else if (resData.sessionExpired) {
            // Token sesi tidak valid/kedaluwarsa -- paksa login ulang
            showAlert(resData.message, false);
            setTimeout(logout, 1500);
        } else {
            showAlert(resData.message, false);
            btn.innerText = "Simpan Absensi";
        }
    } catch (error) {
        showAlert("Terjadi kesalahan jaringan saat menyimpan data.", false);
        btn.innerText = "Simpan Absensi";
    }
    btn.disabled = false;
});
// ===== SELESAI: SUBMIT ABSENSI (panel mapel) =====


// =========================================================
// REKAP KELAS SAYA (download .xlsx)
// ---------------------------------------------------------
// File .xlsx dirakit langsung di browser pakai library SheetJS
// (XLSX), jadi tidak perlu bikin file sementara di Google Drive.
// Lebih cepat & tidak meninggalkan sampah di Drive.
// =========================================================
async function downloadRekapKelasSaya() {
    const btn = document.getElementById('btnRecap');
    const originalText = btn.innerHTML;
    btn.innerText = "Menyiapkan file...";
    btn.disabled = true;
    try {
        const resData = await fetchGas('getRekapKelasSaya', {
            mapel: sessionData.mapel,
            kelas: sessionData.kelas
        });
        if (resData.success) {
            const wb = XLSX.utils.book_new();
            resData.data.forEach(sheetInfo => {
                const ws = XLSX.utils.aoa_to_sheet([sheetInfo.headerRow, ...sheetInfo.rows]);
                XLSX.utils.book_append_sheet(wb, ws, sheetInfo.tabName);
            });
            const namaFile = `Rekap_${sessionData.nama}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, namaFile);
            showAlert("Rekap berhasil dibuat dan diunduh!", true);
        } else {
            showAlert(resData.message, false);
        }
    } catch (error) {
        showAlert("Terjadi kesalahan saat menyiapkan file rekap.", false);
    }
    btn.innerHTML = originalText;
    btn.disabled = false;
}
// ===== SELESAI: REKAP KELAS SAYA =====


// =========================================================
// LOGOUT
// ---------------------------------------------------------
// Hapus sesi dari sessionStorage, lalu reload halaman supaya
// kembali ke panel login.
// =========================================================
function logout() {
    sessionStorage.removeItem('guruSession');
    window.location.reload();
}
// ===== SELESAI: LOGOUT =====


// =========================================================
// FUNGSI BANTUAN: FORMAT TANGGAL & PEMECAH STRING NIS
// =========================================================
// Format "yyyy-MM-dd" -> "dd/MM/yyyy" (untuk pesan konfirmasi)
function formatTanggalIndoShort(tanggalIso) {
    const [y, m, d] = tanggalIso.split('-');
    return `${d}/${m}/${y}`;
}

// Format "yyyy-MM-dd" -> "22 Jul 2026" (untuk tampilan riwayat & chart)
function formatTanggalIndo(tanggalStr) {
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const [y, m, d] = tanggalStr.split('-');
    return `${parseInt(d, 10)} ${bulan[parseInt(m, 10) - 1]} ${y}`;
}

// Pecah string "NIS1, NIS2, NIS3" jadi array NIS (tanpa entri kosong)
// Dipakai saat membaca data absensi dari backend.
function splitNisList(str) {
    return (str || "").toString().split(',').map(s => s.trim()).filter(s => s !== "");
}
// ===== SELESAI: FUNGSI BANTUAN =====


// =========================================================
// PANEL RIWAYAT ABSENSI (per mapel)
// ---------------------------------------------------------
// Dropdown mapel & kelas diisi sekali saja saat tab dibuka
// pertama kali (ditandai dengan dataset.filled).
// =========================================================
function setupRiwayatSelectors() {
    const selMapel = document.getElementById('riwayatMapel');
    const selKelas = document.getElementById('riwayatKelas');
    if (selMapel.dataset.filled) return; // sudah pernah diisi

    const mapelArr = sessionData.mapel.split(',').map(s => s.trim());
    selMapel.innerHTML = mapelArr.map(m => `<option value="${m}">${m}</option>`).join('');
    const kelasArr = sessionData.kelas.split(',').map(s => s.trim());
    selKelas.innerHTML = kelasArr.map(k => `<option value="${k}">${k}</option>`).join('');
    selMapel.dataset.filled = "1";
    selMapel.addEventListener('change', fetchRiwayat);
    selKelas.addEventListener('change', fetchRiwayat);
}

// Ambil & tampilkan riwayat absensi untuk kombinasi mapel+kelas
async function fetchRiwayat() {
    const mapel = document.getElementById('riwayatMapel').value;
    const kelas = document.getElementById('riwayatKelas').value;
    const listEl = document.getElementById('riwayatList');
    const loading = document.getElementById('riwayatLoading');
    if (!mapel || !kelas) return;

    listEl.innerHTML = '';
    loading.classList.remove('hidden');
    try {
        const resData = await fetchGas('getRiwayatAbsensi', { mapel, kelas });
        loading.classList.add('hidden');
        if (resData.success && resData.data.length > 0) {
            listEl.innerHTML = resData.data.map(rec => {
                const rincian = [
                    rec.namaIzin.length ? `Izin: ${rec.namaIzin.join(', ')}` : '',
                    rec.namaSakit.length ? `Sakit: ${rec.namaSakit.join(', ')}` : '',
                    rec.namaAlpa.length ? `Alpa: ${rec.namaAlpa.join(', ')}` : ''
                ].filter(Boolean).join(' &middot; ');
                return `
                    <div class="riwayat-card">
                        <div class="riwayat-header">
                            <span class="riwayat-tanggal">${formatTanggalIndo(rec.tanggal)}</span>
                            <span class="riwayat-badge">${rec.jumlahHadir} Hadir</span>
                        </div>
                        <div class="riwayat-stats">
                            <span>Izin: ${rec.jumlahIzin}</span>
                            <span>Sakit: ${rec.jumlahSakit}</span>
                            <span>Alpa: ${rec.jumlahAlpa}</span>
                        </div>
                        ${rincian ? `<div class="riwayat-detail">${rincian}</div>` : ''}
                    </div>
                `;
            }).join('');
        } else {
            listEl.innerHTML = `<p class="empty-state">Belum ada riwayat absensi untuk kelas &amp; mapel ini.</p>`;
        }
    } catch (error) {
        loading.classList.add('hidden');
        listEl.innerHTML = `<p class="empty-state">Gagal mengambil riwayat absensi.</p>`;
    }
}
// ===== SELESAI: PANEL RIWAYAT ABSENSI =====


// =========================================================
// PANEL DASHBOARD ANALITIK
// ---------------------------------------------------------
// Menampilkan 3 visualisasi:
// 1. Progress bar persentase kehadiran per kelas & mapel
// 2. Grafik garis tren % kehadiran dari waktu ke waktu
// 3. Daftar 10 siswa dengan jumlah Alpa terbanyak
// =========================================================
let trendChartInstance = null; // simpan referensi chart supaya bisa dihancurkan sebelum digambar ulang

// Muat semua data dashboard (dipanggil setiap kali tab Dashboard dibuka)
async function loadDashboard() {
    const loading = document.getElementById('dashboardLoading');
    const content = document.getElementById('dashboardContent');
    loading.classList.remove('hidden');
    content.classList.add('hidden');
    try {
        const resData = await fetchGas('getDashboardData', {
            mapel: sessionData.mapel,
            kelas: sessionData.kelas
        });
        loading.classList.add('hidden');
        content.classList.remove('hidden');
        if (resData.success) {
            renderRekapKelasMapel(resData.data.rekapKelasMapel);
            renderTrendChart(resData.data.trend);
            renderTopAlpa(resData.data.topAlpa);
        } else {
            content.innerHTML = `<p class="empty-state">${resData.message || 'Belum ada data absensi untuk ditampilkan.'}</p>`;
        }
    } catch (error) {
        loading.classList.add('hidden');
        content.classList.remove('hidden');
        content.innerHTML = `<p class="empty-state">Gagal memuat data dashboard.</p>`;
    }
}

// Tampilkan progress bar persentase kehadiran per kelas & mapel
function renderRekapKelasMapel(list) {
    const el = document.getElementById('rekapKelasMapelList');
    if (!list || list.length === 0) {
        el.innerHTML = `<p class="empty-state">Belum ada data.</p>`;
        return;
    }
    el.innerHTML = list.map(item => `
        <div class="rekap-bar-item">
            <div class="rekap-bar-label">
                <span>${item.label}</span>
                <span>${item.persenHadir}%</span>
            </div>
            <div class="rekap-bar-track">
                <div class="rekap-bar-fill" style="width: ${item.persenHadir}%;"></div>
            </div>
        </div>
    `).join('');
}

// Tampilkan daftar siswa dengan jumlah Alpa terbanyak
function renderTopAlpa(list) {
    const el = document.getElementById('topAlpaList');
    if (!list || list.length === 0) {
        el.innerHTML = `<p class="empty-state">Tidak ada siswa dengan catatan Alpa. Bagus!</p>`;
        return;
    }
    el.innerHTML = list.map((s, i) => `
        <div class="alpa-item">
            <span class="alpa-rank">${i + 1}</span>
            <span class="alpa-nama">${s.nama}</span>
            <span class="alpa-jumlah">${s.jumlahAlpa}x Alpa</span>
        </div>
    `).join('');
}

// Gambar grafik garis tren % kehadiran dari waktu ke waktu (pakai Chart.js)
function renderTrendChart(trend) {
    const canvas = document.getElementById('trendChart');
    if (trendChartInstance) {
        trendChartInstance.destroy();
        trendChartInstance = null;
    }
    if (!trend || trend.length === 0) return;
    trendChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: trend.map(t => formatTanggalIndo(t.tanggal)),
            datasets: [{
                label: '% Kehadiran',
                data: trend.map(t => t.persenHadir),
                borderColor: '#4F46E5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { min: 0, max: 100, ticks: { callback: v => v + '%' } }
            },
            plugins: { legend: { display: false } }
        }
    });
}
// ===== SELESAI: PANEL DASHBOARD ANALITIK =====


// =========================================================
// PANEL ABSEN WALI KELAS (harian, bukan per mapel)
// ---------------------------------------------------------
// DIPANGGIL saat tab "Absen Wali" dibuka.
// Sekarang hanya wrapper tipis ke StudentTable.render() --
// logika render & pembacaan data ada di komponen.
// =========================================================
async function fetchStudentsWali(kelas) {
    const tbody = document.getElementById('waliStudentsBody');
    const loading = document.getElementById('waliLoading');
    const btnSubmit = document.getElementById('waliBtnSubmit');
    tbody.innerHTML = '';
    btnSubmit.style.display = 'none';
    loading.classList.remove('hidden');

    try {
        let students = studentCache[kelas];
        if (!students) {
            const resData = await fetchGas('getStudents', { kelas });
            loading.classList.add('hidden');
            if (!resData.success || resData.data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3">${resData.message || 'Tidak ada data siswa.'}</td></tr>`;
                return;
            }
            students = resData.data;
            studentCache[kelas] = students; // simpan ke cache
        } else {
            loading.classList.add('hidden');
        }
        // DELEGASI ke komponen StudentTable
        StudentTable.render('waliStudentsBody', students);
        btnSubmit.style.display = 'block';
        await checkExistingAbsenWali();
    } catch (error) {
        loading.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="3">Gagal mengambil data siswa.</td></tr>`;
    }
}
// ===== SELESAI: FETCH DATA SISWA (panel wali) =====


// =========================================================
// CEK ABSENSI WALI YANG SUDAH ADA (mode edit, auto-detect)
// ---------------------------------------------------------
// Logika HAMPIR IDENTIK dengan checkExistingAttendance() --
// perbedaannya hanya: sumber data (action backend) & target tbody.
// Backend mengembalikan object { "<NIS>": "H"/"I"/"S"/"A", ... }
// =========================================================
async function checkExistingAbsenWali() {
    const kelas = sessionData.kelasWali;
    const tanggalInput = document.getElementById('waliTanggal');
    const tanggal = tanggalInput.value;
    const btnSubmit = document.getElementById('waliBtnSubmit');
    if (!kelas || !tanggal) return;
    if (!StudentTable.hasData('waliStudentsBody')) return;

    btnSubmit.innerText = "Mengecek status...";
    try {
        const resData = await fetchGas('getAbsenWaliExisting', { kelas, tanggal });
        if (resData.success && resData.data) {
            // PERBAIKAN PRIORITAS #1 (KECIL): minta konfirmasi eksplisit
            const lanjutEdit = await showConfirmModal(
                `Absensi harian kelas ${kelas} untuk tanggal ${formatTanggalIndo(tanggal)} sudah pernah diisi sebelumnya. Lanjutkan untuk mengedit data yang sudah tersimpan?`
            );
            if (!lanjutEdit) {
                tanggalInput.value = '';
                btnSubmit.style.display = 'none';
                btnSubmit.innerText = "Simpan Absensi";
                return;
            }
            // Set status per NIS (bukan per index) -- lebih robust
            Object.entries(resData.data).forEach(([nis, status]) => {
                StudentTable.setStatus('waliStudentsBody', nis, status || 'H');
            });
            btnSubmit.innerText = "Perbarui Absensi";
        } else {
            StudentTable.resetAll('waliStudentsBody');
            btnSubmit.innerText = "Simpan Absensi";
        }
    } catch (error) {
        btnSubmit.innerText = "Simpan Absensi";
    }
}
// ===== SELESAI: CEK ABSENSI WALI YANG SUDAH ADA =====


// =========================================================
// SUBMIT ABSENSI WALI KELAS
// ---------------------------------------------------------
// Sekarang pakai StudentTable.getAttendanceData() -- tidak
// perlu lagi loop manual + querySelector per NIS.
// =========================================================
document.getElementById('waliAbsenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('waliBtnSubmit');
    // DELEGASI ke komponen: ambil semua {nis, status} sekaligus
    const dataKehadiran = StudentTable.getAttendanceData('waliStudentsBody');
    const kelas = sessionData.kelasWali;
    const tanggal = document.getElementById('waliTanggal').value;
    btn.innerText = "Menyimpan...";
    btn.disabled = true;
    try {
        const resData = await fetchGas({
            action: 'submitAbsenWali',
            username: sessionData.username,
            token: sessionData.token,
            kelas,
            tanggal,
            dataKehadiran
        }, null, true);
        if (resData.success) {
            showAlert(resData.message, true);
            btn.innerText = "Perbarui Absensi";
            fetchRiwayatAbsenWali(); // refresh riwayat supaya data terbaru langsung terlihat
        } else if (resData.sessionExpired) {
            showAlert(resData.message, false);
            setTimeout(logout, 1500);
        } else {
            showAlert(resData.message, false);
            btn.innerText = "Simpan Absensi";
        }
    } catch (error) {
        showAlert("Terjadi kesalahan jaringan saat menyimpan data.", false);
        btn.innerText = "Simpan Absensi";
    }
    btn.disabled = false;
});
// ===== SELESAI: SUBMIT ABSENSI WALI KELAS =====


// =========================================================
// RIWAYAT & REKAP ABSEN WALI KELAS
// =========================================================
// Ambil & tampilkan riwayat absensi harian kelas wali
// (satu kelas saja, tidak perlu filter dropdown)
async function fetchRiwayatAbsenWali() {
    if (!sessionData.kelasWali) return;
    const listEl = document.getElementById('waliRiwayatList');
    const loading = document.getElementById('waliRiwayatLoading');
    listEl.innerHTML = '';
    loading.classList.remove('hidden');
    try {
        const resData = await fetchGas('getRiwayatAbsenWali', { kelas: sessionData.kelasWali });
        loading.classList.add('hidden');
        if (resData.success && resData.data.length > 0) {
            listEl.innerHTML = resData.data.map(rec => {
                const rincian = [
                    rec.namaIzin.length ? `Izin: ${rec.namaIzin.join(', ')}` : '',
                    rec.namaSakit.length ? `Sakit: ${rec.namaSakit.join(', ')}` : '',
                    rec.namaAlpa.length ? `Alpa: ${rec.namaAlpa.join(', ')}` : ''
                ].filter(Boolean).join(' &middot; ');
                return `
                    <div class="riwayat-card">
                        <div class="riwayat-header">
                            <span class="riwayat-tanggal">${formatTanggalIndo(rec.tanggal)}</span>
                            <span class="riwayat-badge">${rec.jumlahHadir} Hadir</span>
                        </div>
                        <div class="riwayat-stats">
                            <span>Izin: ${rec.jumlahIzin}</span>
                            <span>Sakit: ${rec.jumlahSakit}</span>
                            <span>Alpa: ${rec.jumlahAlpa}</span>
                        </div>
                        ${rincian ? `<div class="riwayat-detail">${rincian}</div>` : ''}
                    </div>
                `;
            }).join('');
        } else {
            listEl.innerHTML = `<p class="empty-state">Belum ada riwayat absensi wali kelas.</p>`;
        }
    } catch (error) {
        loading.classList.add('hidden');
        listEl.innerHTML = `<p class="empty-state">Gagal mengambil riwayat absensi wali kelas.</p>`;
    }
}

// Download rekap absen wali kelas sebagai .xlsx (dirakit di browser pakai SheetJS)
async function downloadRekapAbsenWali() {
    if (!sessionData.kelasWali) return;
    const btn = document.getElementById('btnRekapWali');
    const originalText = btn.innerHTML;
    btn.innerText = "Menyiapkan file...";
    btn.disabled = true;
    try {
        const resData = await fetchGas('getRekapAbsenWali', { kelas: sessionData.kelasWali });
        if (resData.success) {
            const wb = XLSX.utils.book_new();
            resData.data.forEach(sheetInfo => {
                const ws = XLSX.utils.aoa_to_sheet([sheetInfo.headerRow, ...sheetInfo.rows]);
                XLSX.utils.book_append_sheet(wb, ws, sheetInfo.tabName);
            });
            const namaFile = `Rekap_Wali_${sessionData.kelasWali}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, namaFile);
            showAlert("Rekap wali kelas berhasil dibuat dan diunduh!", true);
        } else {
            showAlert(resData.message, false);
        }
    } catch (error) {
        showAlert("Terjadi kesalahan saat menyiapkan file rekap wali kelas.", false);
    }
    btn.innerHTML = originalText;
    btn.disabled = false;
}
// ===== SELESAI: RIWAYAT & REKAP ABSEN WALI KELAS =====
