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
    updateRoleAkun,
    getLogoSekolah,
    uploadLogoSekolah,
    buatLinkUploadAbsensi,
    getDaftarLinkUploadAbsensi,
    previewImportAbsenDariLink,
    jalankanImportAbsenDariLink,
    nonaktifkanLinkUploadAbsensi,
    getDaftarKelasMaster,
    getDaftarSiswaUntukAdmin,
    tambahSiswaBaru,
    updateSiswa,
    nonaktifkanSiswa,
    aktifkanKembaliSiswa,
    uploadSiswaBatch
} from './api.js?v=20260731k';
import { showNotification, escapeHtml } from './utils.js?v=20260731k';
import { showConfirm, showRichModal } from './modal.js?v=20260731k';
import { kompresGambarSebelumUpload } from './profil.js?v=20260731k';

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

    // PATCH: Logo Sekolah -- terpisah dari kelola akun guru, tapi sama-
    // sama cuma boleh admin/superadmin (sudah dijamin `if (!bolehAksesAdmin) return;` di atas).
    setupLogoSekolah();

    // PATCH: Upload Absensi Hardcopy -> Softcopy -- sama-sama admin/superadmin.
    setupUploadAbsenLink();

    // PATCH: Kelola Data Siswa -- sama-sama admin/superadmin.
    setupKelolaSiswa();

    const adminTabBtn = document.querySelector('[data-tab="panelAdmin"]');
    if (adminTabBtn) {
        adminTabBtn.addEventListener('click', () => {
            setTimeout(() => muatDaftarAkun(adalahSuperAdmin), 100);
        });
    }
}

/**
 * PATCH: Logo Sekolah -- muat logo yang sedang aktif untuk preview, dan
 * pasang handler upload (dengan kompresi gambar di browser dulu, pola
 * yang sama dengan upload foto profil di js/profil.js).
 */
async function setupLogoSekolah() {
    const preview = document.getElementById('logoSekolahPreview');
    const kosong = document.getElementById('logoSekolahKosong');
    const inputFile = document.getElementById('inputLogoSekolah');
    const btnPilih = document.getElementById('btnPilihLogoSekolah');
    const msg = document.getElementById('logoSekolahMsg');
    if (!preview || !kosong || !inputFile || !btnPilih) return;

    function tampilkanLogo(url) {
        if (url) {
            preview.src = url;
            preview.classList.remove('hidden');
            kosong.classList.add('hidden');
        } else {
            preview.classList.add('hidden');
            kosong.classList.remove('hidden');
        }
    }

    try {
        const res = await getLogoSekolah();
        if (res.success && res.data) tampilkanLogo(res.data.logoUrl);
    } catch (error) {
        console.error('Gagal memuat logo sekolah saat ini:', error);
    }

    btnPilih.addEventListener('click', () => inputFile.click());

    inputFile.addEventListener('change', async () => {
        const file = inputFile.files && inputFile.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showNotification('File yang dipilih bukan gambar.', 'error');
            return;
        }

        if (msg) { msg.textContent = 'Mengompres & mengunggah logo...'; msg.className = 'login-msg'; }
        btnPilih.disabled = true;

        try {
            // PATCH: format 'png' -- logo sekolah biasanya punya latar
            // transparan (lingkaran, bentuk bebas, dst), dipertahankan
            // supaya menyatu dengan gradasi warna halaman login, bukan
            // jadi kotak solid berwarna putih/hitam.
            const { base64Data, mimeType, dataUrl } = await kompresGambarSebelumUpload(file, 'png');
            tampilkanLogo(dataUrl); // preview instan sebelum menunggu respons server

            const res = await uploadLogoSekolah(base64Data, mimeType);
            if (!res.success) {
                showNotification(res.message || 'Gagal mengunggah logo.', 'error');
                if (msg) { msg.textContent = res.message || 'Gagal mengunggah logo.'; msg.className = 'login-msg error'; }
                return;
            }
            tampilkanLogo(res.data.logoUrl); // ganti ke URL asli dari Drive
            showNotification('Logo sekolah berhasil diperbarui.', 'success');
            if (msg) { msg.textContent = ''; msg.className = 'login-msg'; }
        } catch (error) {
            showNotification('Gagal mengunggah logo: ' + error.message, 'error');
            if (msg) { msg.textContent = 'Gagal: ' + error.message; msg.className = 'login-msg error'; }
        } finally {
            btnPilih.disabled = false;
            inputFile.value = ''; // supaya bisa pilih file yang sama lagi kalau mau coba ulang
        }
    });
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
    set('akunPasanganMapelKelas', akun.pasanganMapelKelas || '');

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
    const pasanganMapelKelas = document.getElementById('akunPasanganMapelKelas')?.value.trim() || '';

    if (btn) btn.disabled = true;
    if (btnText) btnText.classList.add('hidden');
    if (btnLoader) btnLoader.classList.remove('hidden');
    if (msg) msg.textContent = '';

    try {
        let res;
        if (usernameSedangDiedit) {
            res = await updateAkunGuru(usernameSedangDiedit, { nama, mapelList, kelasList, kelasWali, pasanganMapelKelas });
        } else {
            res = await tambahAkunGuru({ username, nama, password, mapelList, kelasList, kelasWali, pasanganMapelKelas });
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
        '<th class="th-nomor">No</th><th>Nama</th><th>Username</th><th>Mapel</th><th>Kelas</th><th>Wali</th><th>Role</th><th>Status</th><th>Aksi</th>' +
        '</tr></thead><tbody>';

    daftar.forEach((akun, i) => {
        const nonaktif = akun.roleList.indexOf('nonaktif') !== -1;
        const roleTampil = akun.roleList.filter(r => r !== 'nonaktif').join(', ') || 'guru';
        const statusBadge = nonaktif
            ? '<span class="badge badge-danger">Nonaktif</span>'
            : '<span class="badge badge-success">Aktif</span>';
        // PATCH (pasangan mapel-kelas): indikator kecil kalau akun ini
        // punya pengecualian pasangan mapel-kelas -- supaya kelihatan dari
        // tabel tanpa perlu buka form Edit satu-satu.
        const indikatorPasangan = akun.pasanganMapelKelas
            ? ' <span class="badge badge-info" title="Dibatasi ke pasangan mapel-kelas tertentu">dibatasi</span>'
            : '';

        html += `<tr>
            <td class="td-nomor">${i + 1}</td>
            <td>${escapeHtml(akun.nama)}</td>
            <td>${escapeHtml(akun.username)}</td>
            <td>${escapeHtml(akun.mapelList.join(', ') || '-')}</td>
            <td>${escapeHtml(akun.kelasList.join(', ') || '-')}${indikatorPasangan}</td>
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

// =========================================================
// PATCH: Upload Absensi Hardcopy -> Softcopy (link Google Sheets)
// =========================================================

function setupUploadAbsenLink() {
    const form = document.getElementById('formBuatLinkUpload');
    const selectJenis = document.getElementById('linkUploadJenis');
    const mapelGroup = document.getElementById('linkUploadMapelGroup');
    const bulanTahunGroup = document.getElementById('linkUploadBulanTahunGroup');
    if (!form || !selectJenis) return;

    // Tampilkan kolom Mapel ATAU Bulan+Tahun tergantung jenis template
    // yang dipilih -- keduanya tidak pernah tampil bersamaan.
    selectJenis.addEventListener('change', () => {
        const isWali = selectJenis.value === 'wali';
        mapelGroup?.classList.toggle('hidden', isWali);
        bulanTahunGroup?.classList.toggle('hidden', !isWali);
    });

    form.addEventListener('submit', handleSubmitBuatLinkUpload);

    muatDaftarLinkUpload();
}

async function handleSubmitBuatLinkUpload(e) {
    e.preventDefault();
    const msg = document.getElementById('linkUploadMsg');
    const btn = e.target.querySelector('button[type="submit"]');
    const btnText = btn?.querySelector('.btn-text');
    const btnLoader = btn?.querySelector('.btn-loader');

    const jenis = document.getElementById('linkUploadJenis')?.value;
    const kelas = document.getElementById('linkUploadKelas')?.value.trim();
    if (!kelas) {
        showNotification('Kelas wajib diisi.', 'error');
        return;
    }

    const opsi = { jenis, kelas };
    if (jenis === 'mapel') {
        const mapel = document.getElementById('linkUploadMapel')?.value.trim();
        if (!mapel) { showNotification('Mata pelajaran wajib diisi.', 'error'); return; }
        opsi.mapel = mapel;
    } else {
        opsi.bulan = document.getElementById('linkUploadBulan')?.value;
        opsi.tahun = document.getElementById('linkUploadTahun')?.value.trim();
        if (!opsi.tahun) { showNotification('Tahun wajib diisi.', 'error'); return; }
    }

    if (btn) btn.disabled = true;
    btnText?.classList.add('hidden');
    btnLoader?.classList.remove('hidden');
    if (msg) msg.textContent = '';

    try {
        const res = await buatLinkUploadAbsensi(opsi);
        if (!res.success) {
            showNotification(res.message || 'Gagal membuat link.', 'error');
            if (msg) { msg.textContent = res.message || 'Gagal membuat link.'; msg.className = 'login-msg error'; }
            return;
        }
        showNotification('Link berhasil dibuat.', 'success');
        if (msg) {
            msg.innerHTML = `✅ Link siap dibagikan ke guru/wali kelas: <br><a href="${escapeHtml(res.data.spreadsheetUrl)}" target="_blank" rel="noopener">${escapeHtml(res.data.spreadsheetUrl)}</a>`;
            msg.className = 'login-msg success';
        }
        e.target.reset();
        mapelGroupResetHelper();
        muatDaftarLinkUpload();
    } catch (error) {
        showNotification('Gagal membuat link: ' + error.message, 'error');
        if (msg) { msg.textContent = 'Gagal: ' + error.message; msg.className = 'login-msg error'; }
    } finally {
        if (btn) btn.disabled = false;
        btnText?.classList.remove('hidden');
        btnLoader?.classList.add('hidden');
    }
}

// Kembalikan tampilan kolom Mapel/Bulan+Tahun ke default (Per Mapel)
// setelah form di-reset -- form.reset() sendiri tidak memicu event
// 'change' pada <select>, jadi perlu dipanggil manual di sini.
function mapelGroupResetHelper() {
    document.getElementById('linkUploadMapelGroup')?.classList.remove('hidden');
    document.getElementById('linkUploadBulanTahunGroup')?.classList.add('hidden');
}

async function muatDaftarLinkUpload() {
    const container = document.getElementById('daftarLinkUploadList');
    if (!container) return;

    try {
        const res = await getDaftarLinkUploadAbsensi();
        if (!res.success) {
            container.innerHTML = `<p class="empty-state">${escapeHtml(res.message || 'Gagal memuat daftar link.')}</p>`;
            return;
        }
        renderDaftarLinkUpload(res.data, container);
    } catch (error) {
        container.innerHTML = `<p class="empty-state">Gagal memuat: ${escapeHtml(error.message)}</p>`;
    }
}

function renderDaftarLinkUpload(daftar, container) {
    if (daftar.length === 0) {
        container.innerHTML = '<p class="empty-state">Belum ada link yang dibuat.</p>';
        return;
    }

    let html = '<div class="table-wrapper"><table class="simple-table"><thead><tr>' +
        '<th class="th-nomor">No</th><th>Jenis</th><th>Kelas</th><th>Mapel/Bulan</th><th>Status</th><th>Dibuat</th><th>Aksi</th>' +
        '</tr></thead><tbody>';

    daftar.forEach((link, i) => {
        const statusBadge = link.status === 'sudah_diimpor'
            ? '<span class="badge badge-success">Sudah Diimpor</span>'
            : link.status === 'nonaktif'
                ? '<span class="badge badge-danger">Nonaktif</span>'
                : '<span class="badge badge-warning">Aktif</span>';

        html += `<tr>
            <td class="td-nomor">${i + 1}</td>
            <td>${link.jenis === 'wali' ? 'Wali Kelas' : 'Per Mapel'}</td>
            <td>${escapeHtml(link.kelas)}</td>
            <td>${escapeHtml(link.mapel)}</td>
            <td>${statusBadge}</td>
            <td>${escapeHtml(link.tanggalDibuat)}</td>
            <td class="admin-aksi-cell">
                <button type="button" class="btn-admin-aksi" data-aksi="salin" data-url="${escapeHtml(link.spreadsheetUrl)}">📋 Salin Link</button>
                ${link.status === 'aktif' ? `
                    <button type="button" class="btn-admin-aksi" data-aksi="pratinjau" data-token="${escapeHtml(link.token)}">👁️ Pratinjau</button>
                    <button type="button" class="btn-admin-aksi btn-admin-aksi-bahaya" data-aksi="nonaktifkanlink" data-token="${escapeHtml(link.token)}">🚫 Nonaktifkan</button>
                ` : ''}
            </td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    container.querySelectorAll('.btn-admin-aksi').forEach(btn => {
        btn.addEventListener('click', () => handleAksiLinkUpload(btn));
    });
}

async function handleAksiLinkUpload(btn) {
    const aksi = btn.dataset.aksi;

    if (aksi === 'salin') {
        navigator.clipboard.writeText(btn.dataset.url)
            .then(() => showNotification('Link disalin ke clipboard.', 'success'))
            .catch(() => showNotification('Gagal menyalin -- salin manual dari daftar di atas.', 'error'));
        return;
    }

    if (aksi === 'nonaktifkanlink') {
        const konfirmasi = await showConfirm('Nonaktifkan link ini? Guru tidak akan bisa mengedit spreadsheet-nya lagi setelah ini.', 'Konfirmasi Nonaktifkan Link');
        if (!konfirmasi) return;
        const res = await nonaktifkanLinkUploadAbsensi(btn.dataset.token);
        showNotification(res.message, res.success ? 'success' : 'error');
        if (res.success) muatDaftarLinkUpload();
        return;
    }

    if (aksi === 'pratinjau') {
        await tampilkanPratinjauImport(btn.dataset.token);
        return;
    }
}

/**
 * Tampilkan hasil PRATINJAU (baca saja) dalam modal, lengkap dengan
 * tombol "Import Sekarang" DI DALAM modal itu sendiri -- supaya admin
 * bisa langsung lanjut ke import tanpa perlu tutup modal & cari tombol
 * lain di tabel.
 */
async function tampilkanPratinjauImport(token) {
    showNotification('Memuat pratinjau...', 'success');
    let res;
    try {
        res = await previewImportAbsenDariLink(token);
    } catch (error) {
        showNotification('Gagal memuat pratinjau: ' + error.message, 'error');
        return;
    }

    if (!res.success) {
        showNotification(res.message || 'Gagal memuat pratinjau.', 'error');
        return;
    }

    const d = res.data;
    const daftarTanggalHtml = d.daftarTanggal.map(t => `<li>${escapeHtml(t)}</li>`).join('');
    // PATCH: peringatan (mis. NIS tak dikenali) ditampilkan tapi TIDAK
    // menahan tombol Import -- sesuai kesepakatan, admin yang putuskan
    // sendiri lanjut atau tidak berdasarkan peringatan itu.
    const peringatanHtml = d.peringatan.length > 0
        ? `<div class="saran-tindak-lanjut-disclaimer" style="margin-top: var(--spacing-3);">
             ⚠️ ${d.peringatan.length} peringatan ditemukan (tidak menghalangi impor, tapi sebaiknya dicek):
             <ul style="margin: var(--spacing-2) 0 0 var(--spacing-4);">${d.peringatan.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
           </div>`
        : '';

    const isiModal = `
        <div class="detail-siswa">
            <p class="detail-siswa-header"><strong>${escapeHtml(d.kelas)}</strong> — ${escapeHtml(d.mapel)}</p>
            <div class="stats-grid" style="margin: 8px 0 16px 0;">
                <span class="badge badge-success">${d.jumlahTanggal} Tanggal</span>
                <span class="badge badge-info">${d.jumlahSiswaTerlibat} Siswa Terlibat</span>
            </div>
            <div class="detail-siswa-kategori">
                <h5>📅 Tanggal Terdeteksi</h5>
                <ul class="detail-siswa-tanggal-list" style="list-style: disc; padding-left: var(--spacing-5);">${daftarTanggalHtml}</ul>
            </div>
            ${peringatanHtml}
            <button type="button" id="btnImportSekarangDariModal" class="btn-primary btn-full" style="margin-top: var(--spacing-4);">✅ Import Sekarang</button>
        </div>`;

    await showRichModal('Pratinjau Import Absensi', isiModal);

    document.getElementById('btnImportSekarangDariModal')?.addEventListener('click', async () => {
        window.closeCustomAlert && window.closeCustomAlert();
        const konfirmasi = await showConfirm('Yakin lanjut import? Data ini akan langsung masuk ke data absen resmi dan tidak bisa dibatalkan.', 'Konfirmasi Import Absensi');
        if (!konfirmasi) return;

        try {
            const resImport = await jalankanImportAbsenDariLink(token);
            showNotification(resImport.message, resImport.success ? 'success' : 'error');
            if (resImport.success) muatDaftarLinkUpload();
        } catch (error) {
            showNotification('Gagal import: ' + error.message, 'error');
        }
    });
}

// =========================================================
// PATCH: Kelola Data Siswa (Panel Admin)
// ---------------------------------------------------------
// Hapus permanen SENGAJA TIDAK disediakan (permintaan eksplisit) --
// cuma Tambah, Edit (nama/JK -- NIS tidak bisa diubah), Nonaktifkan/
// Aktifkan Kembali, dan Upload banyak sekaligus. Lihat penjelasan
// lengkap alasannya di kodegs/Siswa.gs.
// =========================================================

// Kelas yang sedang dikelola -- diisi saat baris kelas diklik dari
// tabel, dipakai form Tambah/Upload di bawahnya (menggantikan
// selectKelas.value dari desain sebelumnya yang pakai dropdown).
let kelasSedangDikelola = null;

function setupKelolaSiswa() {
    const daftarKelasWrapper = document.getElementById('daftarKelasSiswaWrapper');
    const daftarKelasLoading = document.getElementById('daftarKelasSiswaLoading');
    const daftarKelasList = document.getElementById('daftarKelasSiswaList');
    const wrapper = document.getElementById('siswaKelolaWrapper');
    const judulKelas = document.getElementById('siswaKelolaJudulKelas');
    const btnKembali = document.getElementById('btnKembaliDaftarKelas');
    const loadingEl = document.getElementById('daftarSiswaLoading');
    const formTambah = document.getElementById('formTambahSiswa');
    const inputUpload = document.getElementById('inputUploadSiswa');
    const btnPilihUpload = document.getElementById('btnPilihUploadSiswa');
    const uploadMsg = document.getElementById('uploadSiswaMsg');

    if (!daftarKelasList) return;

    // PATCH v2: tabel semua kelas LANGSUNG tampil begitu Panel Admin
    // dibuka -- tidak perlu buka dropdown dulu seperti sebelumnya.
    (async () => {
        try {
            const res = await getDaftarKelasMaster();
            daftarKelasLoading?.classList.add('hidden');
            if (!res.success || res.data.length === 0) {
                daftarKelasList.innerHTML = '<p class="empty-state">Belum ada data kelas di Master Siswa.</p>';
                return;
            }
            daftarKelasList.innerHTML = '<div class="table-wrapper"><table class="simple-table"><thead><tr>' +
                '<th class="th-nomor">No</th><th>Kelas</th><th>Aksi</th>' +
                '</tr></thead><tbody>' +
                res.data.map((k, i) => `<tr>
                    <td class="td-nomor">${i + 1}</td>
                    <td>${escapeHtml(k)}</td>
                    <td class="admin-aksi-cell"><button type="button" class="btn-admin-aksi" data-kelas="${escapeHtml(k)}">👨‍🎓 Kelola Siswa</button></td>
                </tr>`).join('') +
                '</tbody></table></div>';

            daftarKelasList.querySelectorAll('button[data-kelas]').forEach(btn => {
                btn.addEventListener('click', () => bukaKelolaSiswaUntukKelas(btn.dataset.kelas));
            });
        } catch (err) {
            daftarKelasLoading?.classList.add('hidden');
            showNotification('Gagal memuat daftar kelas: ' + err.message, 'error');
        }
    })();

    async function bukaKelolaSiswaUntukKelas(kelas) {
        kelasSedangDikelola = kelas;
        if (judulKelas) judulKelas.textContent = '👨‍🎓 Kelola Siswa -- ' + kelas;
        daftarKelasWrapper?.classList.add('hidden');
        wrapper?.classList.remove('hidden');
        if (loadingEl) loadingEl.classList.remove('hidden');
        try {
            await refreshDaftarSiswa(kelas);
        } finally {
            if (loadingEl) loadingEl.classList.add('hidden');
        }
    }

    btnKembali?.addEventListener('click', () => {
        kelasSedangDikelola = null;
        wrapper?.classList.add('hidden');
        daftarKelasWrapper?.classList.remove('hidden');
    });

    formTambah?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const kelas = kelasSedangDikelola;
        const nis = document.getElementById('siswaBaruNis')?.value.trim();
        const nama = document.getElementById('siswaBaruNama')?.value.trim();
        const jk = document.getElementById('siswaBaruJk')?.value;
        const msg = document.getElementById('formTambahSiswaMsg');
        const btn = formTambah.querySelector('button[type="submit"]');
        const btnText = btn?.querySelector('.btn-text');
        const btnLoader = btn?.querySelector('.btn-loader');

        if (!kelas || !nis || !nama) {
            showNotification('Kelas, NIS, dan Nama wajib diisi.', 'error');
            return;
        }

        if (btn) btn.disabled = true;
        btnText?.classList.add('hidden');
        btnLoader?.classList.remove('hidden');
        if (msg) { msg.textContent = ''; msg.className = 'login-msg'; }

        try {
            const res = await tambahSiswaBaru(kelas, nis, nama, jk);
            showNotification(res.message, res.success ? 'success' : 'error');
            if (res.success) {
                formTambah.reset();
                await refreshDaftarSiswa(kelas);
            } else if (msg) {
                msg.textContent = res.message;
                msg.className = 'login-msg error';
            }
        } catch (err) {
            showNotification('Gagal menambah siswa: ' + err.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
            btnText?.classList.remove('hidden');
            btnLoader?.classList.add('hidden');
        }
    });

    btnPilihUpload?.addEventListener('click', () => inputUpload?.click());

    // PATCH: upload SENGAJA tetap dibatasi ke 1 kelas per file (sesuai
    // arahan -- "upload masal PER KELAS", bukan lintas kelas sekaligus)
    // -- kelasnya diambil dari `kelasSedangDikelola` (kelas yang sedang
    // dibuka lewat tabel), BUKAN dari dropdown terpisah seperti
    // sebelumnya. File yang diupload TETAP cuma 3 kolom (NIS, Nama, JK),
    // TIDAK perlu kolom Kelas di dalam filenya sendiri -- karena
    // konteks kelasnya sudah jelas dari halaman yang sedang dibuka.
    inputUpload?.addEventListener('change', async () => {
        const file = inputUpload.files && inputUpload.files[0];
        const kelas = kelasSedangDikelola;
        if (!file) return;
        if (!kelas) {
            showNotification('Buka halaman kelola 1 kelas dulu sebelum upload.', 'warning');
            inputUpload.value = '';
            return;
        }

        if (uploadMsg) { uploadMsg.textContent = 'Membaca & mengupload file...'; uploadMsg.className = 'login-msg'; }
        if (btnPilihUpload) btnPilihUpload.disabled = true;

        try {
            const daftarSiswa = await bacaFileSiswaSebagaiArray(file);
            if (daftarSiswa.length === 0) {
                showNotification('Tidak ada data siswa yang terbaca dari file ini.', 'warning');
                return;
            }
            const res = await uploadSiswaBatch(kelas, daftarSiswa);
            showNotification(res.message, res.success ? 'success' : 'error');
            if (res.success) {
                if (uploadMsg && res.data?.dilewati?.length > 0) {
                    uploadMsg.innerHTML = 'Baris dilewati:<br>' + res.data.dilewati.map(d => escapeHtml(d)).join('<br>');
                } else if (uploadMsg) {
                    uploadMsg.textContent = '';
                }
                await refreshDaftarSiswa(kelas);
            }
        } catch (err) {
            showNotification('Gagal upload: ' + err.message, 'error');
            if (uploadMsg) { uploadMsg.textContent = 'Gagal: ' + err.message; uploadMsg.className = 'login-msg error'; }
        } finally {
            if (btnPilihUpload) btnPilihUpload.disabled = false;
            inputUpload.value = ''; // supaya bisa pilih file yang sama lagi kalau mau coba ulang
        }
    });
}

// Baca file Excel/CSV yang diupload jadi array [{nis, nama, jk}, ...] --
// dijalankan di BROWSER memakai library XLSX (SheetJS) yang sudah
// dimuat global untuk kebutuhan unduh Rekap (lihat index.html), dipakai
// ULANG di sini untuk kebutuhan BACA file, bukan cuma tulis.
function bacaFileSiswaSebagaiArray(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Gagal membaca file.'));
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // array-of-array, bukan objek
                // Baris pertama dianggap header, dilewati -- kolom
                // berurutan: NIS, Nama, Jenis Kelamin.
                const daftarSiswa = rows.slice(1)
                    .filter(row => row && row.length > 0 && row[0])
                    .map(row => ({
                        nis: String(row[0] || '').trim(),
                        nama: String(row[1] || '').trim(),
                        jk: String(row[2] || '').trim()
                    }));
                resolve(daftarSiswa);
            } catch (err) {
                reject(new Error('Format file tidak bisa dibaca: ' + err.message));
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

async function refreshDaftarSiswa(kelas) {
    try {
        const res = await getDaftarSiswaUntukAdmin(kelas);
        renderDaftarSiswa(res, kelas);
    } catch (err) {
        showNotification('Gagal memuat data siswa: ' + err.message, 'error');
    }
}

function renderDaftarSiswa(res, kelas) {
    const container = document.getElementById('daftarSiswaList');
    if (!container) return;

    if (!res.success) {
        container.innerHTML = `<p class="empty-state">${escapeHtml(res.message || 'Gagal memuat data siswa.')}</p>`;
        return;
    }
    if (res.data.length === 0) {
        container.innerHTML = '<p class="empty-state">Belum ada siswa di kelas ini.</p>';
        return;
    }

    let html = '<div class="table-wrapper"><table class="simple-table"><thead><tr>' +
        '<th class="th-nomor">No</th><th>NIS</th><th>Nama</th><th>JK</th><th>Status</th><th>Aksi</th>' +
        '</tr></thead><tbody>';

    res.data.forEach((s, i) => {
        const nonaktif = s.status && s.status.toLowerCase() !== 'aktif';
        const statusBadge = nonaktif
            ? `<span class="badge badge-danger">${escapeHtml(s.status)}</span>`
            : '<span class="badge badge-success">Aktif</span>';

        html += `<tr>
            <td class="td-nomor">${i + 1}</td>
            <td>${escapeHtml(s.nis)}</td>
            <td>${escapeHtml(s.nama)}</td>
            <td>${escapeHtml(s.jk || '-')}</td>
            <td>${statusBadge}</td>
            <td class="admin-aksi-cell">
                <button type="button" class="btn-admin-aksi" data-aksi="editsiswa" data-nis="${escapeHtml(s.nis)}" data-nama="${escapeHtml(s.nama)}" data-jk="${escapeHtml(s.jk || '')}">✏️ Edit</button>
                ${nonaktif
                    ? `<button type="button" class="btn-admin-aksi" data-aksi="aktifkansiswa" data-nis="${escapeHtml(s.nis)}">✅ Aktifkan</button>`
                    : `<button type="button" class="btn-admin-aksi btn-admin-aksi-bahaya" data-aksi="nonaktifkansiswa" data-nis="${escapeHtml(s.nis)}">🚫 Nonaktifkan</button>`}
            </td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    container.querySelectorAll('.btn-admin-aksi').forEach(btn => {
        btn.addEventListener('click', () => handleAksiSiswa(btn, kelas));
    });
}

async function handleAksiSiswa(btn, kelas) {
    const aksi = btn.dataset.aksi;
    const nis = btn.dataset.nis;

    if (aksi === 'nonaktifkansiswa') {
        const konfirmasi = await showConfirm('Nonaktifkan siswa ini? Data absen/nilai lama tetap tersimpan, tapi siswa tidak akan muncul lagi di daftar presensi/penilaian aktif.', 'Konfirmasi Nonaktifkan Siswa');
        if (!konfirmasi) return;
        const res = await nonaktifkanSiswa(kelas, nis);
        showNotification(res.message, res.success ? 'success' : 'error');
        if (res.success) refreshDaftarSiswa(kelas);
        return;
    }

    if (aksi === 'aktifkansiswa') {
        const res = await aktifkanKembaliSiswa(kelas, nis);
        showNotification(res.message, res.success ? 'success' : 'error');
        if (res.success) refreshDaftarSiswa(kelas);
        return;
    }

    if (aksi === 'editsiswa') {
        tampilkanModalEditSiswa(kelas, nis, btn.dataset.nama, btn.dataset.jk);
        return;
    }
}

/**
 * Modal edit nama/JK siswa -- NIS SENGAJA tidak ditampilkan sebagai
 * field yang bisa diubah (lihat penjelasan lengkap di updateSiswa(),
 * kodegs/Siswa.gs). Pola modal-dengan-tombol-aksi-di-dalamnya ini sama
 * dengan tampilkanPratinjauImport() di atas.
 */
async function tampilkanModalEditSiswa(kelas, nis, namaLama, jkLama) {
    const isiModal = `
        <div class="form-group">
            <label for="editSiswaNama">Nama</label>
            <input type="text" id="editSiswaNama" value="${escapeHtml(namaLama)}">
        </div>
        <div class="form-group">
            <label for="editSiswaJk">Jenis Kelamin</label>
            <select id="editSiswaJk">
                <option value="" ${!jkLama ? 'selected' : ''}>-</option>
                <option value="L" ${jkLama === 'L' ? 'selected' : ''}>L</option>
                <option value="P" ${jkLama === 'P' ? 'selected' : ''}>P</option>
            </select>
        </div>
        <p style="color: var(--gray-500); font-size: var(--font-size-xs);">NIS "${escapeHtml(nis)}" tidak bisa diubah di sini -- data absen/nilai historis merujuk ke NIS ini.</p>
        <button type="button" id="btnSimpanEditSiswa" class="btn-primary btn-full" style="margin-top: var(--spacing-4);">💾 Simpan Perubahan</button>
    `;

    await showRichModal('Edit Data Siswa', isiModal);

    document.getElementById('btnSimpanEditSiswa')?.addEventListener('click', async () => {
        const namaBaru = document.getElementById('editSiswaNama')?.value.trim();
        const jkBaru = document.getElementById('editSiswaJk')?.value;
        if (!namaBaru) {
            showNotification('Nama tidak boleh kosong.', 'error');
            return;
        }
        window.closeCustomAlert && window.closeCustomAlert();
        try {
            const res = await updateSiswa(kelas, nis, { nama: namaBaru, jk: jkBaru });
            showNotification(res.message, res.success ? 'success' : 'error');
            if (res.success) refreshDaftarSiswa(kelas);
        } catch (err) {
            showNotification('Gagal menyimpan perubahan: ' + err.message, 'error');
        }
    });
}
