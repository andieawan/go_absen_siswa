/**
 * Halaman Ketua Kelas (fitur sementara: delegasi input absen)
 * ---------------------------------------------------------
 * Modul ini SENGAJA berdiri sendiri, terpisah dari js/absensi.js dan
 * js/api.js punya sesi login -- halaman ini diakses lewat link token
 * publik (?ketua=TOKEN), TANPA login guru sama sekali. Semua komunikasi
 * ke server hanya lewat getInfoKetuaKelas()/submitAbsenKetuaKelas() di
 * js/api.js, yang tidak pernah mengirim username/token session apa pun.
 */

import { getInfoKetuaKelas, submitAbsenKetuaKelas } from './api.js';
import { escapeHtml, showGlobalLoading, hideGlobalLoading, showNotification } from './utils.js';

const STATUS_LABEL = { H: 'Hadir', I: 'Izin', S: 'Sakit', A: 'Alpa' };

export async function initKetuaKelasPage(token) {
    const loadingEl = document.getElementById('ketuaKelasLoading');
    const errorEl = document.getElementById('ketuaKelasError');
    const errorMsgEl = document.getElementById('ketuaKelasErrorMessage');
    const formEl = document.getElementById('ketuaKelasForm');

    if (!token) {
        showError('Link tidak valid -- tidak ada kode akses ditemukan.');
        return;
    }

    showGlobalLoading('Memeriksa link...');
    let res;
    try {
        res = await getInfoKetuaKelas(token);
    } catch (err) {
        showError('Gagal menghubungi server: ' + err.message);
        hideGlobalLoading();
        return;
    }
    hideGlobalLoading();

    if (!res.success) {
        showError(res.message || 'Link tidak valid atau sudah tidak berlaku.');
        return;
    }

    const { kelas, tanggal, students, existing } = res.data;

    if (loadingEl) loadingEl.classList.add('hidden');
    if (formEl) formEl.classList.remove('hidden');

    const namaKelasEl = document.getElementById('ketuaKelasNamaKelas');
    const tanggalEl = document.getElementById('ketuaKelasTanggal');
    if (namaKelasEl) namaKelasEl.textContent = kelas;
    if (tanggalEl) tanggalEl.textContent = formatTanggalIndo(tanggal);

    renderStudentRows(students, existing);
    setupQuickStatusButtons();
    setupSubmitForm(token);

    function showError(message) {
        if (loadingEl) loadingEl.classList.add('hidden');
        if (errorEl) errorEl.classList.remove('hidden');
        if (errorMsgEl) errorMsgEl.textContent = message;
    }
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
        tbody.innerHTML = `<tr class="empty-row"><td colspan="3"><p class="empty-state">Tidak ada data siswa di kelas ini</p></td></tr>`;
        return;
    }

    tbody.innerHTML = students.map(s => {
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

function setupSubmitForm(token) {
    const form = document.getElementById('ketuaKelasForm');
    const btnSubmit = document.getElementById('ketuaKelasBtnSubmit');
    if (!form) return;

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
            const res = await submitAbsenKetuaKelas(token, dataKehadiran);
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
