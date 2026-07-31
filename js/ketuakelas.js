/**
 * Halaman Ketua Kelas (fitur sementara: delegasi input absen)
 * ---------------------------------------------------------
 * Modul ini SENGAJA berdiri sendiri, terpisah dari js/absensi.js dan
 * js/api.js punya sesi login -- halaman ini diakses lewat link token
 * publik (?ketua=TOKEN), TANPA login guru sama sekali. Semua komunikasi
 * ke server hanya lewat getInfoKetuaKelas()/submitAbsenKetuaKelas() di
 * js/api.js, yang tidak pernah mengirim username/token session apa pun.
 *
 * PATCH (mode per tanggal): kalau pengelola aplikasi sudah mengaktifkan
 * mode per tanggal untuk kelas ini lewat Apps Script (lihat
 * kodegs/ketuakelas.gs), halaman ini menampilkan date-picker supaya
 * ketua kelas bisa merekap absensi hari-hari sebelumnya, bukan cuma
 * hari ini. Kalau mode itu tidak aktif, perilaku tetap seperti semula
 * (tanggal tetap = hari ini, tidak bisa diubah).
 */

import { getInfoKetuaKelas, submitAbsenKetuaKelas } from './api.js?v=20260731e';
import { escapeHtml, showGlobalLoading, hideGlobalLoading, showNotification } from './utils.js?v=20260731e';

const STATUS_LABEL = { H: 'Hadir', I: 'Izin', S: 'Sakit', A: 'Alpa' };

// State modul: token & tanggal yang sedang aktif ditampilkan/diisi.
let tokenAktif = null;
let tanggalAktif = null;
let modePerTanggalAktif = false;

export async function initKetuaKelasPage(token) {
    tokenAktif = token;

    if (!token) {
        showError('Link tidak valid -- tidak ada kode akses ditemukan.');
        return;
    }

    await muatDanRenderHalaman(token, null);
}

/**
 * Ambil data dari server (untuk tanggal tertentu kalau mode-per-tanggal
 * aktif, atau selalu hari ini kalau tidak) dan render seluruh halaman.
 * Dipanggil saat load pertama DAN setiap kali date-picker diganti.
 */
async function muatDanRenderHalaman(token, tanggalDiminta) {
    const loadingEl = document.getElementById('ketuaKelasLoading');
    const errorEl = document.getElementById('ketuaKelasError');
    const errorMsgEl = document.getElementById('ketuaKelasErrorMessage');
    const formEl = document.getElementById('ketuaKelasForm');

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (errorEl) errorEl.classList.add('hidden');
    if (formEl) formEl.classList.add('hidden');

    showGlobalLoading('Memuat data absensi...');
    let res;
    try {
        res = await getInfoKetuaKelas(token, tanggalDiminta);
    } catch (err) {
        hideGlobalLoading();
        showError('Gagal menghubungi server: ' + err.message);
        return;
    }
    hideGlobalLoading();

    if (!res.success) {
        showError(res.message || 'Link tidak valid atau sudah tidak berlaku.');
        return;
    }

    const { kelas, tanggal, modePerTanggal, students, existing } = res.data;
    tanggalAktif = tanggal;
    modePerTanggalAktif = !!modePerTanggal;

    if (loadingEl) loadingEl.classList.add('hidden');
    if (formEl) formEl.classList.remove('hidden');

    const namaKelasEl = document.getElementById('ketuaKelasNamaKelas');
    if (namaKelasEl) namaKelasEl.textContent = kelas;

    renderTampilanTanggal();
    renderStudentRows(students, existing);
    setupQuickStatusButtons();
    setupSubmitForm();
    setupDatePicker();

    function showError(message) {
        if (loadingEl) loadingEl.classList.add('hidden');
        if (errorEl) errorEl.classList.remove('hidden');
        if (errorMsgEl) errorMsgEl.textContent = message;
    }
}

/**
 * Tampilkan bagian tanggal sesuai mode: label tetap (hari ini, tidak
 * bisa diubah) kalau mode-per-tanggal nonaktif, atau date-picker aktif
 * kalau mode-per-tanggal menyala untuk kelas ini.
 */
function renderTampilanTanggal() {
    const labelTetapWrapper = document.getElementById('ketuaKelasTanggalTetapWrapper');
    const tanggalEl = document.getElementById('ketuaKelasTanggal');
    const datePickerWrapper = document.getElementById('ketuaKelasDatePickerWrapper');
    const dateInput = document.getElementById('ketuaKelasDateInput');

    if (modePerTanggalAktif) {
        if (labelTetapWrapper) labelTetapWrapper.classList.add('hidden');
        if (datePickerWrapper) datePickerWrapper.classList.remove('hidden');
        if (dateInput) dateInput.value = tanggalAktif;
    } else {
        if (labelTetapWrapper) labelTetapWrapper.classList.remove('hidden');
        if (datePickerWrapper) datePickerWrapper.classList.add('hidden');
        if (tanggalEl) tanggalEl.textContent = formatTanggalIndo(tanggalAktif);
    }
}

function setupDatePicker() {
    const dateInput = document.getElementById('ketuaKelasDateInput');
    if (!dateInput || dateInput.dataset.wired) return; // jangan pasang listener dobel
    dateInput.dataset.wired = '1';

    dateInput.addEventListener('change', () => {
        if (!dateInput.value) return;
        muatDanRenderHalaman(tokenAktif, dateInput.value);
    });
}

function formatTanggalIndo(tanggalIso) {
    if (!tanggalIso) return '-';
    const d = new Date(tanggalIso + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function renderStudentRows(students, existingMap) {
    const tbody = document.getElementById('ketuaKelasStudentsBody');
    if (!tbody) return;

    if (!students || students.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="4"><p class="empty-state">Tidak ada data siswa di kelas ini</p></td></tr>`;
        return;
    }

    tbody.innerHTML = students.map((s, i) => {
        const nis = String(s.nis);
        const current = (existingMap && existingMap[nis]) || 'H';
        const groupName = `ketuaKelas-status-${nis}`;

        const tombolStatus = ['H', 'I', 'S', 'A'].map(kode => {
            const id = `${groupName}-${kode}`;
            return `
                <input type="radio" class="status-toggle-input" name="${groupName}" id="${id}" value="${kode}" ${current === kode ? 'checked' : ''}>
                <label for="${id}" class="status-toggle status-toggle--${kode}" title="${STATUS_LABEL[kode]}">${kode}</label>`;
        }).join('');

        return `
            <tr data-nis="${escapeHtml(nis)}">
                <td class="td-nomor">${i + 1}</td>
                <td>${escapeHtml(nis)}</td>
                <td>${escapeHtml(s.nama)}</td>
                <td>
                    <div class="status-toggle-group" data-nis="${escapeHtml(nis)}" data-default="${current}">
                        ${tombolStatus}
                    </div>
                </td>
            </tr>`;
    }).join('');
}

function setupQuickStatusButtons() {
    document.querySelectorAll('#ketuaKelasForm .btn-quick[data-quick-status]').forEach(btn => {
        if (btn.dataset.wired) return; // jangan pasang listener dobel tiap render ulang
        btn.dataset.wired = '1';
        btn.addEventListener('click', () => {
            const tbody = document.getElementById('ketuaKelasStudentsBody');
            if (!tbody) return;
            const isReset = btn.dataset.quickStatus === 'reset';

            tbody.querySelectorAll('.status-toggle-group').forEach(group => {
                const status = isReset ? (group.dataset.default || 'H') : btn.dataset.quickStatus;
                const radio = group.querySelector(`input[type="radio"][value="${status}"]`);
                if (radio) radio.checked = true;
            });
        });
    });
}

function bacaAttendanceDariTabel() {
    const groups = document.querySelectorAll('#ketuaKelasStudentsBody .status-toggle-group');
    return Array.from(groups).map(group => {
        const checked = group.querySelector('input[type="radio"]:checked');
        return { nis: group.dataset.nis, status: checked ? checked.value : 'H' };
    });
}

function setupSubmitForm() {
    const form = document.getElementById('ketuaKelasForm');
    const btnSubmit = document.getElementById('ketuaKelasBtnSubmit');
    if (!form || form.dataset.wired) return; // jangan pasang listener dobel
    form.dataset.wired = '1';

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dataKehadiran = bacaAttendanceDariTabel();

        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.querySelector('.btn-text')?.classList.add('hidden');
            btnSubmit.querySelector('.btn-loader')?.classList.remove('hidden');
        }
        showGlobalLoading('Menyimpan absensi...');

        try {
            // PATCH: kirim tanggalAktif (state modul, hasil resolusi backend
            // -- hari ini kalau mode nonaktif, atau tanggal terpilih kalau
            // mode per tanggal aktif) supaya submit selalu konsisten dengan
            // tanggal yang sedang ditampilkan di form.
            const res = await submitAbsenKetuaKelas(tokenAktif, dataKehadiran, tanggalAktif);
            showNotification(res.message || (res.success ? 'Absensi tersimpan' : 'Gagal menyimpan absensi'), res.success ? 'success' : 'error');
        } catch (err) {
            showNotification('Gagal menyimpan absensi: ' + err.message, 'error');
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.querySelector('.btn-text')?.classList.remove('hidden');
                btnSubmit.querySelector('.btn-loader')?.classList.add('hidden');
            }
            hideGlobalLoading();
        }
    });
}
