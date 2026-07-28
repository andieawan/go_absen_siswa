// =========================================================
// TAHAP 3: PANEL ADMIN -- KELOLA AKUN GURU (UI)
// =========================================================

import {
    getDaftarAkunUntukAdmin,
    tambahAkunGuru,
    updateAkunGuru,
    resetPasswordAkunOlehAdmin,
    nonaktifkanAkunGuru,
    aktifkanKembaliAkunGuru,
    updateRoleAkun
} from './api.js?v=20260727';
import { showNotification, escapeHtml } from './utils.js?v=20260727';
import { showConfirm } from './modal.js?v=20260727';

let usernameSedangDiedit = null; // null = mode tambah, string = mode edit
let adalahSuperAdminSaatIni = false; // di-set di initAdmin(), dipakai ulang di beberapa fungsi lain di file ini

export function initAdmin(user) {
    const roleList = (user && user.roleList) || [];
    const bolehAksesAdmin = roleList.indexOf('admin') !== -1 || roleList.indexOf('superadmin') !== -1;
    const adalahSuperAdmin = roleList.indexOf('superadmin') !== -1;

    // Tab "Admin" di nav bawah -- sembunyikan kalau akun ini bukan
    // admin/superadmin (backend tetap menolak semua action-nya juga,
    // ini murni supaya UI tidak menampilkan tab yang percuma).
    const tabBtn = document.getElementById('tabBtnAdmin');
    if (tabBtn) tabBtn.classList.toggle('hidden', !bolehAksesAdmin);
    if (!bolehAksesAdmin) return;

    adalahSuperAdminSaatIni = adalahSuperAdmin;

    const form = document.getElementById('formAkunGuru');
    const btnBatalEdit = document.getElementById('btnBatalEditAkun');

    if (form) {
        form.addEventListener('submit', (e) => handleSubmitFormAkun(e));
    }
    if (btnBatalEdit) {
        btnBatalEdit.addEventListener('click', () => resetFormKeModeTambah());
    }

    muatDaftarAkun(adalahSuperAdmin);

    const adminTabBtn = document.querySelector('[data-tab="panelAdmin"]');
    if (adminTabBtn) {
        adminTabBtn.addEventListener('click', () => {
            setTimeout(() => muatDaftarAkun(adalahSuperAdmin), 100);
        });
    }
}

function resetFormKeModeTambah() {
    usernameSedangDiedit = null;
    const form = document.getElementById('formAkunGuru');
    if (form) form.reset();
    const usernameInput = document.getElementById('akunUsername');
    if (usernameInput) usernameInput.disabled = false;
    const passwordGroup = document.getElementById('akunPasswordGroup');
    if (passwordGroup) passwordGroup.classList.remove('hidden');
    const judul = document.getElementById('formAkunJudul');
    if (judul) judul.textContent = '➕ Tambah Akun Guru';
    const btnBatal = document.getElementById('btnBatalEditAkun');
    if (btnBatal) btnBatal.classList.add('hidden');
    const msg = document.getElementById('formAkunMsg');
    if (msg) msg.textContent = '';
}

function isiFormUntukEdit(akun) {
    usernameSedangDiedit = akun.username;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('akunUsername', akun.username);
    set('akunNama', akun.nama);
    set('akunMapelList', akun.mapelList.join(','));
    set('akunKelasList', akun.kelasList.join(','));
    set('akunKelasWali', akun.kelasWali);

    const usernameInput = document.getElementById('akunUsername');
    if (usernameInput) usernameInput.disabled = true; // username tidak boleh diubah setelah dibuat
    const passwordGroup = document.getElementById('akunPasswordGroup');
    if (passwordGroup) passwordGroup.classList.add('hidden'); // ganti password lewat tombol terpisah, bukan form ini
    const judul = document.getElementById('formAkunJudul');
    if (judul) judul.textContent = '✏️ Edit Akun: ' + akun.nama;
    const btnBatal = document.getElementById('btnBatalEditAkun');
    if (btnBatal) btnBatal.classList.remove('hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function handleSubmitFormAkun(e) {
    e.preventDefault();
    const msg = document.getElementById('formAkunMsg');
    const btn = e.target.querySelector('button[type="submit"]');
    const btnText = btn?.querySelector('.btn-text');
    const btnLoader = btn?.querySelector('.btn-loader');

    const username = document.getElementById('akunUsername')?.value.trim();
    const nama = document.getElementById('akunNama')?.value.trim();
    const password = document.getElementById('akunPassword')?.value || '';
    const mapelList = (document.getElementById('akunMapelList')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    const kelasList = (document.getElementById('akunKelasList')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    const kelasWali = document.getElementById('akunKelasWali')?.value.trim() || '';

    if (btn) btn.disabled = true;
    if (btnText) btnText.classList.add('hidden');
    if (btnLoader) btnLoader.classList.remove('hidden');
    if (msg) msg.textContent = '';

    try {
        let res;
        if (usernameSedangDiedit) {
            res = await updateAkunGuru(usernameSedangDiedit, { nama, mapelList, kelasList, kelasWali });
        } else {
            res = await tambahAkunGuru({ username, nama, password, mapelList, kelasList, kelasWali });
        }

        if (msg) {
            msg.textContent = res.message || (res.success ? 'Berhasil.' : 'Gagal.');
            msg.className = 'login-msg ' + (res.success ? 'success' : 'error');
        }

        if (res.success) {
            showNotification(res.message, 'success');
            resetFormKeModeTambah();
            muatDaftarAkun(adalahSuperAdminSaatIni);
        }
    } catch (error) {
        if (msg) { msg.textContent = 'Gagal: ' + error.message; msg.className = 'login-msg error'; }
    } finally {
        if (btn) btn.disabled = false;
        if (btnText) btnText.classList.remove('hidden');
        if (btnLoader) btnLoader.classList.add('hidden');
    }
}

async function muatDaftarAkun(adalahSuperAdmin) {
    const container = document.getElementById('daftarAkunList');
    const subtitle = document.getElementById('daftarAkunSubtitle');
    if (!container) return;

    try {
        const res = await getDaftarAkunUntukAdmin();
        if (!res.success) {
            if (subtitle) subtitle.textContent = res.message || 'Gagal memuat daftar akun.';
            container.innerHTML = '';
            return;
        }

        if (subtitle) subtitle.textContent = res.data.length + ' akun terdaftar.';
        renderTabelAkun(res.data, adalahSuperAdmin, container);
    } catch (error) {
        if (subtitle) subtitle.textContent = 'Gagal memuat: ' + error.message;
    }
}

function renderTabelAkun(daftar, adalahSuperAdmin, container) {
    if (daftar.length === 0) {
        container.innerHTML = '<p class="empty-state">Belum ada akun guru.</p>';
        return;
    }

    let html = '<div class="table-wrapper"><table class="simple-table"><thead><tr>' +
        '<th>Nama</th><th>Username</th><th>Mapel</th><th>Kelas</th><th>Wali</th><th>Role</th><th>Status</th><th>Aksi</th>' +
        '</tr></thead><tbody>';

    daftar.forEach(akun => {
        const nonaktif = akun.roleList.indexOf('nonaktif') !== -1;
        const roleTampil = akun.roleList.filter(r => r !== 'nonaktif').join(', ') || 'guru';
        const statusBadge = nonaktif
            ? '<span class="badge badge-danger">Nonaktif</span>'
            : '<span class="badge badge-success">Aktif</span>';

        html += `<tr>
            <td>${escapeHtml(akun.nama)}</td>
            <td>${escapeHtml(akun.username)}</td>
            <td>${escapeHtml(akun.mapelList.join(', ') || '-')}</td>
            <td>${escapeHtml(akun.kelasList.join(', ') || '-')}</td>
            <td>${escapeHtml(akun.kelasWali || '-')}</td>
            <td>${escapeHtml(roleTampil)}</td>
            <td>${statusBadge}</td>
            <td class="admin-aksi-cell">
                <button type="button" class="btn-admin-aksi" data-aksi="edit" data-username="${escapeHtml(akun.username)}">✏️ Edit</button>
                <button type="button" class="btn-admin-aksi" data-aksi="resetpw" data-username="${escapeHtml(akun.username)}">🔑 Reset Password</button>
                ${nonaktif
                    ? `<button type="button" class="btn-admin-aksi" data-aksi="aktifkan" data-username="${escapeHtml(akun.username)}">✅ Aktifkan</button>`
                    : `<button type="button" class="btn-admin-aksi btn-admin-aksi-bahaya" data-aksi="nonaktifkan" data-username="${escapeHtml(akun.username)}">🚫 Nonaktifkan</button>`}
                ${adalahSuperAdmin ? `<button type="button" class="btn-admin-aksi" data-aksi="role" data-username="${escapeHtml(akun.username)}" data-role-sekarang="${escapeHtml(akun.roleList.join(','))}">🎭 Ubah Role</button>` : ''}
            </td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    container.querySelectorAll('.btn-admin-aksi').forEach(btn => {
        btn.addEventListener('click', () => handleAksiTabelAkun(btn, daftar, adalahSuperAdmin));
    });
}

async function handleAksiTabelAkun(btn, daftar, adalahSuperAdmin) {
    const aksi = btn.dataset.aksi;
    const targetUsername = btn.dataset.username;

    if (aksi === 'edit') {
        const akun = daftar.find(a => a.username === targetUsername);
        if (akun) isiFormUntukEdit(akun);
        return;
    }

    if (aksi === 'resetpw') {
        const passwordBaru = window.prompt('Password baru untuk "' + targetUsername + '" (minimal 6 karakter):');
        if (passwordBaru === null) return; // dibatalkan
        if (passwordBaru.length < 6) {
            showNotification('Password baru minimal 6 karakter, tidak disimpan.', 'error');
            return;
        }
        const res = await resetPasswordAkunOlehAdmin(targetUsername, passwordBaru);
        showNotification(res.message, res.success ? 'success' : 'error');
        return;
    }

    if (aksi === 'nonaktifkan') {
        const konfirmasi = await showConfirm('Nonaktifkan akun "' + targetUsername + '"? Guru ini tidak akan bisa login sampai diaktifkan kembali.', 'Konfirmasi Nonaktifkan Akun');
        if (!konfirmasi) return;
        const res = await nonaktifkanAkunGuru(targetUsername);
        showNotification(res.message, res.success ? 'success' : 'error');
        if (res.success) muatDaftarAkun(adalahSuperAdmin);
        return;
    }

    if (aksi === 'aktifkan') {
        const res = await aktifkanKembaliAkunGuru(targetUsername);
        showNotification(res.message, res.success ? 'success' : 'error');
        if (res.success) muatDaftarAkun(adalahSuperAdmin);
        return;
    }

    if (aksi === 'role') {
        const roleSekarang = btn.dataset.roleSekarang || 'guru';
        const roleBaru = window.prompt(
            'Role untuk "' + targetUsername + '" (pisahkan koma, mis. "guru,admin"):\n\nRole yang tersedia: guru, admin, superadmin, kepsek, nonaktif',
            roleSekarang
        );
        if (roleBaru === null) return; // dibatalkan
        const res = await updateRoleAkun(targetUsername, roleBaru.trim());
        showNotification(res.message, res.success ? 'success' : 'error');
        if (res.success) muatDaftarAkun(adalahSuperAdmin);
        return;
    }
}
