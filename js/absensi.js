/**
 * Modul Absensi
 * Menghubungkan panel "Input", "Riwayat", "Rekap", dan "Wali" di dashboard
 * ke fungsi-fungsi API (js/api.js) dan sekaligus menangani navigasi tab.
 *
 * =========================================================
 * CATATAN PEMULIHAN (FIX BUG KRITIS)
 * =========================================================
 * File ini SEBELUMNYA TIDAK ADA di repo (terhapus keliru saat "cleanup"
 * -- lihat catatan di TESTING_CHECKLIST.md poin 9: "Hapus auth.js,
 * absensi.js, dashboard.js lama"). Padahal js/README.md dan
 * templates/dashboard.html jelas-jelas mengasumsikan modul ini ADA dan
 * menjadi satu-satunya yang menghubungkan:
 *   - Navigasi tab (data-tab) & sub-tab (data-subtab) -- SEBELUMNYA
 *     tidak ada satupun listener yang toggle panel mana yang tampil,
 *     jadi klik tab "Riwayat"/"Rekap"/"Wali" tidak melakukan apa-apa.
 *   - Panel "Input" (panelAbsensi): pilih mapel/kelas/tanggal -> muat
 *     daftar siswa -> isi status kehadiran -> submit ke backend.
 *   - Panel "Riwayat" (panelRiwayat): riwayat per mapel & per kelas wali.
 *   - Panel "Rekap" (panelRekap): tombol unduh .xlsx.
 *   - Panel "Wali" (panelAbsenWali): input & riwayat absen harian wali kelas.
 * Tanpa file ini, aplikasi hanya bisa login dan melihat tab Dashboard --
 * fitur inti (mengisi absensi) sama sekali tidak bisa diakses dari UI.
 * =========================================================
 */

import {
    getSiswaByKelas,
    getExistingAttendance,
    submitAbsensi,
    submitAbsenWali,
    getAbsenWaliExisting,
    getRiwayatAbsensi,
    getRiwayatAbsenWali,
    downloadRekapExcel,
    getCurrentUser
} from './api.js';
import { showNotification, escapeHtml } from './utils.js';

// Cache daftar siswa per kelas supaya tidak fetch berulang kali
// dalam satu sesi dashboard yang sama.
const siswaKelasCache = {};

/**
 * Entry point modul ini. Dipanggil dari main.js setelah template
 * dashboard.html selesai di-render ke DOM.
 */
export function initAbsensi() {
    const user = getCurrentUser();
    if (!user) return;

    setupTabNavigation();
    setupQuickStatusButtons();
    setupInputAbsensiForm(user);
    setupRiwayatPanel(user);
    setupRekapPanel(user);
    setupAbsenWaliPanel(user);
    setupHeaderRekapShortcut();
}

// =========================================================
// NAVIGASI TAB & SUB-TAB
// =========================================================
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('hidden', panel.id !== tabId);
    });
}

function setupTabNavigation() {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.querySelectorAll('.sub-tab-btn[data-subtab]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sub-tab-btn[data-subtab]').forEach(b => {
                b.classList.toggle('active', b === btn);
            });
            document.querySelectorAll('.sub-tab-panel').forEach(panel => {
                panel.classList.toggle('hidden', panel.id !== btn.dataset.subtab);
            });
        });
    });
}

function setupHeaderRekapShortcut() {
    document.querySelectorAll('[data-action="quickBukaRekap"]').forEach(btn => {
        btn.addEventListener('click', () => switchTab('panelRekap'));
    });
}

// =========================================================
// TOMBOL "SEMUA HADIR" / "RESET"
// =========================================================
function setupQuickStatusButtons() {
    document.querySelectorAll('.btn-quick[data-quick-status]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tbodyId = btn.dataset.target === 'wali' ? 'waliStudentsBody' : 'studentsBody';
            const tbody = document.getElementById(tbodyId);
            if (!tbody) return;
            const status = btn.dataset.quickStatus === 'reset' ? 'H' : btn.dataset.quickStatus;
            tbody.querySelectorAll('select.status-select').forEach(sel => {
                sel.value = status;
            });
        });
    });
}

// =========================================================
// HELPER BERSAMA
// =========================================================
function setSubmitLoading(btn, loading) {
    if (!btn) return;
    const text = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');
    btn.disabled = loading;
    btn.classList.remove('hidden');
    if (text) text.classList.toggle('hidden', loading);
    if (loader) loader.classList.toggle('hidden', !loading);
}

/**
 * Render baris tabel daftar siswa dengan dropdown status kehadiran.
 * existingMap: { [nis]: 'H'|'I'|'S'|'A' } -- status yang sudah tersimpan
 * sebelumnya (kalau ada), dipakai untuk pre-fill saat data absensi
 * tanggal tsb sudah pernah diisi (mode edit/update).
 */
function renderStudentRows(tbodyId, students, existingMap) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!students || students.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="3"><p class="empty-state">Tidak ada data siswa di kelas ini</p></td></tr>`;
        return;
    }

    tbody.innerHTML = students.map(s => {
        const nis = String(s.nis);
        const current = (existingMap && existingMap[nis]) || 'H';
        return `
            <tr data-nis="${escapeHtml(nis)}">
                <td>${escapeHtml(nis)}</td>
                <td>${escapeHtml(s.nama)}</td>
                <td>
                    <select class="status-select" data-nis="${escapeHtml(nis)}">
                        <option value="H" ${current === 'H' ? 'selected' : ''}>Hadir</option>
                        <option value="I" ${current === 'I' ? 'selected' : ''}>Izin</option>
                        <option value="S" ${current === 'S' ? 'selected' : ''}>Sakit</option>
                        <option value="A" ${current === 'A' ? 'selected' : ''}>Alpha</option>
                    </select>
                </td>
            </tr>`;
    }).join('');
}

async function ambilDaftarSiswa(kelas) {
    if (siswaKelasCache[kelas]) return siswaKelasCache[kelas];
    const res = await getSiswaByKelas(kelas);
    if (!res.success) throw new Error(res.message || 'Gagal memuat data siswa');
    siswaKelasCache[kelas] = res.data;
    return res.data;
}

function renderRiwayatList(res, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!res.success) {
        container.innerHTML = `<p class="empty-state">${escapeHtml(res.message || 'Gagal memuat riwayat')}</p>`;
        return;
    }

    const data = res.data || [];
    if (data.length === 0) {
        container.innerHTML = '<p class="empty-state">Belum ada riwayat absensi</p>';
        return;
    }

    container.innerHTML = data.map(item => {
        const detailList = [];
        if (item.namaIzin && item.namaIzin.length) detailList.push(`<p><strong>Izin:</strong> ${item.namaIzin.map(escapeHtml).join(', ')}</p>`);
        if (item.namaSakit && item.namaSakit.length) detailList.push(`<p><strong>Sakit:</strong> ${item.namaSakit.map(escapeHtml).join(', ')}</p>`);
        if (item.namaAlpa && item.namaAlpa.length) detailList.push(`<p><strong>Alpa:</strong> ${item.namaAlpa.map(escapeHtml).join(', ')}</p>`);

        return `
            <div class="card riwayat-card" style="margin-bottom: 12px;">
                <div class="riwayat-card-header">
                    <strong>${escapeHtml(item.tanggal)}</strong>
                </div>
                <div class="stats-grid" style="margin: 8px 0;">
                    <span class="badge badge-success">Hadir: ${item.jumlahHadir}</span>
                    <span class="badge badge-warning">Izin: ${item.jumlahIzin}</span>
                    <span class="badge badge-info">Sakit: ${item.jumlahSakit}</span>
                    <span class="badge badge-danger">Alpa: ${item.jumlahAlpa}</span>
                </div>
                ${detailList.length ? `<div class="riwayat-detail">${detailList.join('')}</div>` : ''}
            </div>`;
    }).join('');
}

// =========================================================
// PANEL 1: INPUT ABSENSI (per mata pelajaran)
// =========================================================
function setupInputAbsensiForm(user) {
    const selectMapel = document.getElementById('selectMapel');
    const selectKelas = document.getElementById('selectKelas');
    const tanggalInput = document.getElementById('tanggalAbsen');
    const loadingEl = document.getElementById('loading');
    const btnSubmit = document.getElementById('btnSubmit');
    const form = document.getElementById('absenForm');

    if (!form) return;

    if (selectMapel) {
        selectMapel.innerHTML = user.mapelList.length
            ? user.mapelList.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')
            : '<option value="" disabled selected>Tidak ada mapel yang diampu</option>';
    }
    if (selectKelas) {
        selectKelas.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>' +
            user.kelasList.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
    }
    if (tanggalInput && !tanggalInput.value) {
        tanggalInput.valueAsDate = new Date();
    }

    if (user.mapelList.length === 0 || user.kelasList.length === 0) {
        // Akun murni wali kelas (tidak mengajar mapel apa pun) -- valid, bukan error.
        document.getElementById('studentsBody').innerHTML =
            '<tr class="empty-row"><td colspan="3"><p class="empty-state">Anda tidak mengajar mata pelajaran apa pun</p></td></tr>';
        return;
    }

    async function reloadStudents() {
        const mapel = selectMapel?.value;
        const kelas = selectKelas?.value;
        const tanggal = tanggalInput?.value;
        if (!mapel || !kelas || !tanggal) return;

        if (loadingEl) loadingEl.classList.remove('hidden');
        if (btnSubmit) btnSubmit.classList.add('hidden');

        try {
            const students = await ambilDaftarSiswa(kelas);

            const existingRes = await getExistingAttendance(user.nama, mapel, kelas, tanggal);
            const existingMap = {};
            if (existingRes.success && existingRes.data) {
                const kodeStatus = { hadir: 'H', izin: 'I', sakit: 'S', alpa: 'A' };
                Object.keys(kodeStatus).forEach(key => {
                    const raw = existingRes.data[key] || '';
                    raw.split(',').map(s => s.trim()).filter(Boolean).forEach(nis => {
                        existingMap[nis] = kodeStatus[key];
                    });
                });
            }

            renderStudentRows('studentsBody', students, existingMap);
            if (btnSubmit) btnSubmit.classList.remove('hidden');
        } catch (err) {
            console.error('Gagal memuat siswa:', err);
            showNotification('Gagal memuat data siswa: ' + err.message, 'error');
            document.getElementById('studentsBody').innerHTML =
                '<tr class="empty-row"><td colspan="3"><p class="empty-state">Gagal memuat data</p></td></tr>';
        } finally {
            if (loadingEl) loadingEl.classList.add('hidden');
        }
    }

    if (selectMapel) selectMapel.addEventListener('change', reloadStudents);
    if (selectKelas) selectKelas.addEventListener('change', reloadStudents);
    if (tanggalInput) tanggalInput.addEventListener('change', reloadStudents);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const mapel = selectMapel?.value;
        const kelas = selectKelas?.value;
        const tanggal = tanggalInput?.value;
        if (!mapel || !kelas || !tanggal) {
            showNotification('Lengkapi mata pelajaran, kelas, dan tanggal terlebih dahulu.', 'warning');
            return;
        }

        const rows = document.querySelectorAll('#studentsBody select.status-select');
        if (rows.length === 0) {
            showNotification('Tidak ada data siswa untuk disimpan.', 'warning');
            return;
        }

        const attendance = Array.from(rows).map(sel => ({ nis: sel.dataset.nis, status: sel.value }));

        setSubmitLoading(btnSubmit, true);
        try {
            const res = await submitAbsensi({ mapel, kelas, tanggal, attendance });
            showNotification(res.message || (res.success ? 'Absensi tersimpan' : 'Gagal menyimpan absensi'), res.success ? 'success' : 'error');
        } catch (err) {
            showNotification('Gagal menyimpan absensi: ' + err.message, 'error');
        } finally {
            setSubmitLoading(btnSubmit, false);
        }
    });

    // Muat otomatis kalau mapel/kelas/tanggal default sudah terisi
    if (selectMapel?.value && selectKelas?.value && tanggalInput?.value) {
        reloadStudents();
    }
}

// =========================================================
// PANEL 2: RIWAYAT (per mapel & per kelas wali)
// =========================================================
function setupRiwayatPanel(user) {
    const riwayatMapel = document.getElementById('riwayatMapel');
    const riwayatKelas = document.getElementById('riwayatKelas');
    const riwayatLoading = document.getElementById('riwayatLoading');
    const subtabBtnWali = document.getElementById('subtabBtnWali');
    const riwayatWaliKelasLabel = document.getElementById('riwayatWaliKelasLabel');
    const riwayatWaliLoading = document.getElementById('riwayatWaliLoading');

    if (riwayatMapel) {
        riwayatMapel.innerHTML = user.mapelList.length
            ? user.mapelList.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')
            : '<option value="" disabled selected>Tidak ada mapel</option>';
    }
    if (riwayatKelas) {
        riwayatKelas.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>' +
            user.kelasList.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
    }

    async function loadRiwayatMapel() {
        const mapel = riwayatMapel?.value;
        const kelas = riwayatKelas?.value;
        if (!mapel || !kelas) return;

        if (riwayatLoading) riwayatLoading.classList.remove('hidden');
        try {
            const res = await getRiwayatAbsensi(mapel, kelas);
            renderRiwayatList(res, 'riwayatList');
        } catch (err) {
            showNotification('Gagal memuat riwayat: ' + err.message, 'error');
        } finally {
            if (riwayatLoading) riwayatLoading.classList.add('hidden');
        }
    }

    if (riwayatMapel) riwayatMapel.addEventListener('change', loadRiwayatMapel);
    if (riwayatKelas) riwayatKelas.addEventListener('change', loadRiwayatMapel);
    if (riwayatMapel?.value && riwayatKelas?.value) loadRiwayatMapel();

    if (user.kelasWali) {
        if (subtabBtnWali) subtabBtnWali.classList.remove('hidden');
        if (riwayatWaliKelasLabel) riwayatWaliKelasLabel.textContent = user.kelasWali;

        let sudahDimuat = false;
        subtabBtnWali?.addEventListener('click', async () => {
            if (sudahDimuat) return; // cukup sekali per sesi buka dashboard
            sudahDimuat = true;
            if (riwayatWaliLoading) riwayatWaliLoading.classList.remove('hidden');
            try {
                const res = await getRiwayatAbsenWali(user.kelasWali);
                renderRiwayatList(res, 'riwayatWaliList');
            } catch (err) {
                showNotification('Gagal memuat riwayat: ' + err.message, 'error');
            } finally {
                if (riwayatWaliLoading) riwayatWaliLoading.classList.add('hidden');
            }
        });
    }
}

// =========================================================
// PANEL 3: REKAP (unduh .xlsx)
// =========================================================
function setupRekapPanel(user) {
    const jumlahMapelEl = document.getElementById('rekapMapelJumlahMapel');
    const jumlahKelasEl = document.getElementById('rekapMapelJumlahKelas');
    const rekapWaliCard = document.getElementById('rekapWaliCard');
    const rekapWaliKelasLabel = document.getElementById('rekapWaliKelasLabel');

    if (jumlahMapelEl) jumlahMapelEl.textContent = `${user.mapelList.length} Mapel`;
    if (jumlahKelasEl) jumlahKelasEl.textContent = `${user.kelasList.length} Kelas`;

    if (user.kelasWali) {
        if (rekapWaliCard) rekapWaliCard.classList.remove('hidden');
        if (rekapWaliKelasLabel) rekapWaliKelasLabel.textContent = user.kelasWali;
    }

    document.querySelectorAll('[data-action="downloadRekapKelasSaya"]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (user.mapelList.length === 0 || user.kelasList.length === 0) {
                showNotification('Anda tidak mengajar mata pelajaran apa pun.', 'warning');
                return;
            }
            btn.disabled = true;
            try {
                const res = await downloadRekapExcel('mapel', user.mapelList.join(','), user.kelasList.join(','));
                showNotification(res.message || 'Rekap berhasil diunduh', res.success ? 'success' : 'error');
            } catch (err) {
                showNotification('Gagal mengunduh rekap: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
            }
        });
    });

    document.querySelectorAll('[data-action="downloadRekapAbsenWali"]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!user.kelasWali) return;
            btn.disabled = true;
            try {
                const res = await downloadRekapExcel('wali', '', user.kelasWali);
                showNotification(res.message || 'Rekap berhasil diunduh', res.success ? 'success' : 'error');
            } catch (err) {
                showNotification('Gagal mengunduh rekap: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
            }
        });
    });
}

// =========================================================
// PANEL 5: ABSEN HARIAN WALI KELAS
// =========================================================
function setupAbsenWaliPanel(user) {
    if (!user.kelasWali) return; // bukan wali kelas -> panel tetap hidden (default)

    const tabBtnWali = document.getElementById('tabBtnAbsenWali');
    const waliKelasLabel = document.getElementById('waliKelasLabel');
    const waliTanggal = document.getElementById('waliTanggal');
    const waliLoading = document.getElementById('waliLoading');
    const waliBtnSubmit = document.getElementById('waliBtnSubmit');
    const form = document.getElementById('waliAbsenForm');
    const riwayatLoading = document.getElementById('waliRiwayatLoading');

    if (tabBtnWali) tabBtnWali.classList.remove('hidden');
    if (waliKelasLabel) waliKelasLabel.textContent = user.kelasWali;
    if (waliTanggal && !waliTanggal.value) waliTanggal.valueAsDate = new Date();

    async function reloadWaliStudents() {
        const tanggal = waliTanggal?.value;
        if (!tanggal) return;

        if (waliLoading) waliLoading.classList.remove('hidden');
        if (waliBtnSubmit) waliBtnSubmit.classList.add('hidden');

        try {
            const students = await ambilDaftarSiswa(user.kelasWali);
            const existingRes = await getAbsenWaliExisting(user.kelasWali, tanggal);
            const existingMap = (existingRes.success && existingRes.data) ? existingRes.data : {};
            renderStudentRows('waliStudentsBody', students, existingMap);
            if (waliBtnSubmit) waliBtnSubmit.classList.remove('hidden');
        } catch (err) {
            showNotification('Gagal memuat data siswa: ' + err.message, 'error');
        } finally {
            if (waliLoading) waliLoading.classList.add('hidden');
        }
    }

    async function loadWaliRiwayat() {
        if (riwayatLoading) riwayatLoading.classList.remove('hidden');
        try {
            const res = await getRiwayatAbsenWali(user.kelasWali);
            renderRiwayatList(res, 'waliRiwayatList');
        } catch (err) {
            showNotification('Gagal memuat riwayat: ' + err.message, 'error');
        } finally {
            if (riwayatLoading) riwayatLoading.classList.add('hidden');
        }
    }

    if (waliTanggal) waliTanggal.addEventListener('change', reloadWaliStudents);

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tanggal = waliTanggal?.value;
            if (!tanggal) return;

            const rows = document.querySelectorAll('#waliStudentsBody select.status-select');
            if (rows.length === 0) {
                showNotification('Tidak ada data siswa untuk disimpan.', 'warning');
                return;
            }
            const dataKehadiran = Array.from(rows).map(sel => ({ nis: sel.dataset.nis, status: sel.value }));

            setSubmitLoading(waliBtnSubmit, true);
            try {
                const res = await submitAbsenWali({ kelas: user.kelasWali, tanggal, dataKehadiran });
                showNotification(res.message || (res.success ? 'Absensi tersimpan' : 'Gagal menyimpan absensi'), res.success ? 'success' : 'error');
                if (res.success) loadWaliRiwayat();
            } catch (err) {
                showNotification('Gagal menyimpan absensi: ' + err.message, 'error');
            } finally {
                setSubmitLoading(waliBtnSubmit, false);
            }
        });
    }

    reloadWaliStudents();
    loadWaliRiwayat();
}

export default { initAbsensi };
