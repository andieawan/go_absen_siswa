// =========================================================
// KONFIGURASI
// Ganti URL Web App Google Apps Script di sini kalau berubah
// =========================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyMGAl2rTMzOEVkosA-QKNrVvo69x3WZPrYgRBRcVF9JL-K1guOv-zJAWnisfCZ1t8n/exec';
// ===== SELESAI: KONFIGURASI =====


// =========================================================
// STATE & REFERENSI ELEMEN GLOBAL
// =========================================================
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
let sessionData = JSON.parse(sessionStorage.getItem('guruSession'));

if (sessionData) showDashboard();
// ===== SELESAI: STATE & REFERENSI ELEMEN GLOBAL =====


// =========================================================
// FUNGSI CUSTOM ALERT (popup notifikasi)
// Panggil showAlert("pesan", true/false) dari bagian manapun
// =========================================================
function showAlert(message, isSuccess = true) {
    const modal = document.getElementById('customAlert');
    const icon = document.getElementById('alertIcon');
    const title = document.getElementById('alertTitle');
    const msg = document.getElementById('alertMessage');
    const btn = document.querySelector('.modal-box .modal-btn');

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
// HANDLE LOGIN
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
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'login', username: user, password: pass })
        });
        const resData = await response.json();

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
// =========================================================
function showDashboard() {
    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');

    document.getElementById('greeting').innerText = `Selamat Mengajar, ${sessionData.nama}`;
    document.getElementById('tanggalAbsen').valueAsDate = new Date();

    const mapelArr = sessionData.mapel.split(',').map(s => s.trim());
    const selectMapel = document.getElementById('selectMapel');
    selectMapel.innerHTML = '';
    mapelArr.forEach(m => selectMapel.innerHTML += `<option value="${m}">${m}</option>`);

    const kelasArr = sessionData.kelas.split(',').map(s => s.trim());
    const selectKelas = document.getElementById('selectKelas');
    selectKelas.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>';
    kelasArr.forEach(k => selectKelas.innerHTML += `<option value="${k}">${k}</option>`);

    selectKelas.addEventListener('change', (e) => fetchStudents(e.target.value));
    document.getElementById('tanggalAbsen').addEventListener('change', checkExistingAttendance);
    document.getElementById('selectMapel').addEventListener('change', checkExistingAttendance);
}
// ===== SELESAI: TAMPILKAN DASHBOARD =====


// =========================================================
// FETCH DATA SISWA (dipanggil saat kelas dipilih)
// =========================================================
async function fetchStudents(kelas) {
    const tbody = document.getElementById('studentsBody');
    const loading = document.getElementById('loading');
    const btnSubmit = document.getElementById('btnSubmit');

    tbody.innerHTML = '';
    btnSubmit.style.display = 'none';
    loading.classList.remove('hidden');

    try {
        const response = await fetch(`${GAS_URL}?action=getStudents&kelas=${kelas}`);
        const resData = await response.json();

        loading.classList.add('hidden');

        if (resData.success && resData.data.length > 0) {
            resData.data.forEach((siswa, index) => {
                const tr = document.createElement('tr');
                tr.className = 'student-row'; // dipakai CSS untuk tampilan kartu di HP
                tr.innerHTML = `
                    <td>${siswa.nis || '-'}</td>
                    <td class="nama-siswa">${siswa.nama}</td>
                    <td>
                        <div class="radio-group">
                            <label><input type="radio" name="status_${index}" value="H" checked required> H</label>
                            <label><input type="radio" name="status_${index}" value="I"> I</label>
                            <label><input type="radio" name="status_${index}" value="S"> S</label>
                            <label><input type="radio" name="status_${index}" value="A"> A</label>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            btnSubmit.style.display = 'block';
            await checkExistingAttendance();
        } else {
            tbody.innerHTML = `<tr><td colspan="3">${resData.message || 'Tidak ada data siswa.'}</td></tr>`;
        }
    } catch (error) {
        loading.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="3">Gagal mengambil data siswa.</td></tr>`;
    }
}
// ===== SELESAI: FETCH DATA SISWA =====


// =========================================================
// CEK ABSENSI YANG SUDAH ADA (supaya tidak dobel input)
// =========================================================
async function checkExistingAttendance() {
    const mapel = document.getElementById('selectMapel').value;
    const kelas = document.getElementById('selectKelas').value;
    const tanggal = document.getElementById('tanggalAbsen').value;
    const guru = sessionData.nama;
    const btnSubmit = document.getElementById('btnSubmit');

    if (!mapel || !kelas || !tanggal) return;
    btnSubmit.innerText = "Mengecek status...";

    try {
        const response = await fetch(`${GAS_URL}?action=getExistingAttendance&guru=${guru}&mapel=${mapel}&kelas=${kelas}&tanggal=${tanggal}`);
        const resData = await response.json();

        if (resData.success && resData.data) {
            const savedIzin = resData.data.izin.split(',').map(s => s.trim());
            const savedSakit = resData.data.sakit.split(',').map(s => s.trim());
            const savedAlpa = resData.data.alpa.split(',').map(s => s.trim());

            const rows = document.querySelectorAll('#studentsBody tr');
            rows.forEach((row, index) => {
                const nama = row.querySelector('.nama-siswa').innerText;
                let status = 'H';

                if (savedIzin.includes(nama)) status = 'I';
                else if (savedSakit.includes(nama)) status = 'S';
                else if (savedAlpa.includes(nama)) status = 'A';

                const targetRadio = document.querySelector(`input[name="status_${index}"][value="${status}"]`);
                if (targetRadio) targetRadio.checked = true;
            });
            btnSubmit.innerText = "Perbarui Absensi";
        } else {
            const rows = document.querySelectorAll('#studentsBody tr');
            rows.forEach((row, index) => {
                document.querySelector(`input[name="status_${index}"][value="H"]`).checked = true;
            });
            btnSubmit.innerText = "Simpan Absensi";
        }
    } catch (error) {
        btnSubmit.innerText = "Simpan Absensi";
    }
}
// ===== SELESAI: CEK ABSENSI YANG SUDAH ADA =====


// =========================================================
// SUBMIT ABSENSI (simpan ke server)
// =========================================================
document.getElementById('absenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmit');
    const rows = document.querySelectorAll('#studentsBody tr');
    let attendanceData = [];

    rows.forEach((row, index) => {
        const nama = row.querySelector('.nama-siswa').innerText;
        const status = document.querySelector(`input[name="status_${index}"]:checked`).value;
        attendanceData.push({ nama, status });
    });

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
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'submit', payload: payload })
        });
        const resData = await response.json();

        if (resData.success) {
            showAlert(resData.message, true);
            btn.innerText = "Perbarui Absensi";
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
// ===== SELESAI: SUBMIT ABSENSI =====


// =========================================================
// GENERATE REKAP (tombol "Buat Rekap")
// =========================================================
async function generateRecap() {
    const btn = document.getElementById('btnRecap');
    const originalText = btn.innerText;

    btn.innerText = "Memproses... (Tunggu)";
    btn.disabled = true;

    try {
        const response = await fetch(`${GAS_URL}?action=generateRecap`);
        const resData = await response.json();

        if (resData.success) {
            showAlert(resData.message, true);
        } else {
            showAlert(resData.message, false);
        }
    } catch (error) {
        showAlert("Terjadi kesalahan jaringan saat mencoba membuat rekap.", false);
    }

    btn.innerText = originalText;
    btn.disabled = false;
}
// ===== SELESAI: GENERATE REKAP =====


// =========================================================
// LOGOUT
// =========================================================
function logout() {
    sessionStorage.removeItem('guruSession');
    window.location.reload();
}
// ===== SELESAI: LOGOUT =====
