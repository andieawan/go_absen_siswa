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
 *   - Panel "Input" (panelAbsensi): 2 sub-menu -- "Guru Mapel" (pilih
 *     mapel/kelas/tanggal -> muat daftar siswa -> isi status kehadiran ->
 *     submit) dan "Wali Kelas" (absen harian kelas binaan, sub-menu ini
 *     disembunyikan otomatis kalau guru bukan wali kelas).
 *   - Panel "Riwayat" (panelRiwayat): riwayat per mapel & per kelas wali.
 *   - Panel "Rekap" (panelRekap): tombol unduh .xlsx.
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
    hapusAbsen,
    hapusAbsenWali,
    downloadRekapExcel,
    getCurrentUser,
    generateKetuaKelasLink,
    getStatusKetuaKelasLink,
    nonaktifkanKetuaKelasLink
} from './api.js?v=20260731b';
import { showNotification, escapeHtml, showGlobalLoading, hideGlobalLoading } from './utils.js?v=20260731b';
import { showConfirm } from './modal.js?v=20260731b';

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
    // PATCH: input Wali Kelas sekarang jadi sub-menu di dalam tab Input
    // (bukan tab tersendiri lagi) -- fungsi ini yang mengatur tampil/
    // sembunyi sub-menunya berdasarkan apakah guru ini wali kelas atau bukan.
    setupInputSubTabs(user);
    setupQuickStatusButtons();
    setupInputAbsensiForm(user);
    setupRiwayatPanel(user);
    setupRekapPanel(user);
    setupAbsenWaliPanel(user);
}

// =========================================================
// PATCH: SUB-MENU PANEL INPUT (Guru Mapel / Wali Kelas)
// ---------------------------------------------------------
// Kalau guru ini BUKAN wali kelas, sub-menu "Wali Kelas" disembunyikan.
// Karena tersisa cuma 1 pilihan ("Guru Mapel"), sub-tab-nav-nya sendiri
// juga ikut disembunyikan -- tidak ada gunanya menampilkan bar menu kalau
// isinya cuma 1 opsi yang memang sudah aktif oleh default.
// =========================================================
function setupInputSubTabs(user) {
    const nav = document.getElementById('inputSubTabNav');
    const btnWali = document.getElementById('subtabBtnInputWali');

    if (btnWali) btnWali.classList.toggle('hidden', !user.kelasWali);
    if (nav) nav.classList.toggle('hidden', !user.kelasWali);
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

    // =====================================================================
    // FIX BUG: Sebelumnya query & toggle di bawah ini dilakukan secara
    // GLOBAL ke SEMUA elemen `.sub-tab-btn[data-subtab]` dan `.sub-tab-panel`
    // di seluruh dokumen. Padahal ada DUA grup sub-tab yang independen di
    // halaman yang sama:
    //   - Panel Riwayat  : subtabMapel / subtabWali
    //   - Panel Dashboard: subtabDashboardWali / subtabDashboardMapel
    // Karena ke-2 grup itu berbagi class CSS yang sama, mengklik salah satu
    // sub-tab di panel Riwayat ikut menambahkan class "hidden" ke SEMUA
    // sub-tab-panel milik Dashboard (dan berlaku juga sebaliknya) -- akibatnya
    // panel Dashboard bisa tampil KOSONG TOTAL (kedua sub-panelnya
    // ter-hidden sekaligus) begitu pengguna sempat membuka tab Riwayat lalu
    // kembali ke tab Dashboard, walau data & tombol sub-tab-nya terlihat aktif.
    // Perbaikan: batasi query hanya pada elemen di dalam `.tab-panel` (leluhur
    // bersama tiap grup) yang sama dengan tombol yang diklik, supaya kedua
    // grup sub-tab benar-benar independen satu sama lain.
    // =====================================================================
    document.querySelectorAll('.sub-tab-btn[data-subtab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const scope = btn.closest('.tab-panel') || document;
            scope.querySelectorAll('.sub-tab-btn[data-subtab]').forEach(b => {
                b.classList.toggle('active', b === btn);
            });
            scope.querySelectorAll('.sub-tab-panel').forEach(panel => {
                panel.classList.toggle('hidden', panel.id !== btn.dataset.subtab);
            });
        });
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
            const isReset = btn.dataset.quickStatus === 'reset';

            tbody.querySelectorAll('.status-toggle-group').forEach(group => {
                // PATCH: "Reset" mengembalikan ke status SAAT DATA DIMUAT
                // (data-default -- bisa jadi H, atau I/S/A kalau tanggal ini
                // sudah pernah diisi sebelumnya), BUKAN dipaksa ke Hadir.
                // Kalau dipaksa ke H, data izin/sakit/alpa yang sudah tersimpan
                // sebelumnya bisa keliru ke-reset jadi Hadir semua.
                // "Semua Hadir" tetap memaksa semua baris ke H apa pun kondisinya.
                const status = isReset ? (group.dataset.default || 'H') : btn.dataset.quickStatus;
                const radio = group.querySelector(`input[type="radio"][value="${status}"]`);
                if (radio) radio.checked = true;
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

const STATUS_LABEL = { H: 'Hadir', I: 'Izin', S: 'Sakit', A: 'Alpha' };

/**
 * Render baris tabel daftar siswa dengan segmented button (H/I/S/A) per baris.
 * existingMap: { [nis]: 'H'|'I'|'S'|'A' } -- status yang sudah tersimpan
 * sebelumnya (kalau ada), dipakai untuk pre-fill saat data absensi
 * tanggal tsb sudah pernah diisi (mode edit/update). Nilai ini juga disimpan
 * di atribut data-default supaya tombol "Reset" tahu harus kembali ke mana
 * (lihat setupQuickStatusButtons).
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
        const groupName = `${tbodyId}-status-${nis}`;

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

async function ambilDaftarSiswa(kelas) {
    if (siswaKelasCache[kelas]) return siswaKelasCache[kelas];
    const res = await getSiswaByKelas(kelas);
    if (!res.success) throw new Error(res.message || 'Gagal memuat data siswa');
    siswaKelasCache[kelas] = res.data;
    return res.data;
}

/**
 * Baca status kehadiran tercentang dari semua .status-toggle-group
 * di dalam tbody tertentu (dipakai saat submit form).
 */
function bacaAttendanceDariTabel(tbodyId) {
    const groups = document.querySelectorAll(`#${tbodyId} .status-toggle-group`);
    return Array.from(groups).map(group => {
        const checked = group.querySelector('input[type="radio"]:checked');
        return { nis: group.dataset.nis, status: checked ? checked.value : 'H' };
    });
}

/**
 * PATCH KLIK-UNTUK-EDIT: kartu riwayat sekarang bisa diklik -- akan
 * pindah ke tab "Input" dan langsung memuat data absensi tanggal itu
 * untuk diedit (isi ulang mapel/kelas/tanggal, lalu trigger reload
 * seperti biasa saat field itu berubah).
 *
 * Parameter `konteks` menentukan kartu ini kartu riwayat "per mapel"
 * atau "per kelas (wali)", supaya tahu field mana yang perlu diisi saat
 * diklik nanti (lihat navigasiKeEditAbsensi() di bawah):
 *   { mode: 'mapel', mapel, kelas }  -- dari panel Riwayat > Per Mapel
 *   { mode: 'wali', kelas }          -- dari panel Riwayat > Per Kelas (Wali)
 */
function renderRiwayatList(res, containerId, konteks) {
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

    // PATCH: pakai tanggal "hari ini" dari SERVER (res.hariIniServer,
    // zona waktu Asia/Jakarta -- lihat getRiwayatAbsensi() di Absensi.gs)
    // sebagai acuan cek 7 hari terakhir, bukan jam/zona waktu perangkat
    // guru sendiri -- supaya tombol Hapus muncul/tidak-muncul konsisten
    // dengan aturan yang SEBENARNYA ditegakkan backend.
    const hariIniServer = res.hariIniServer;

    container.innerHTML = data.map(item => {
        const detailList = [];
        if (item.namaIzin && item.namaIzin.length) detailList.push(`<p><strong>Izin:</strong> ${item.namaIzin.map(escapeHtml).join(', ')}</p>`);
        if (item.namaSakit && item.namaSakit.length) detailList.push(`<p><strong>Sakit:</strong> ${item.namaSakit.map(escapeHtml).join(', ')}</p>`);
        if (item.namaAlpa && item.namaAlpa.length) detailList.push(`<p><strong>Alpa:</strong> ${item.namaAlpa.map(escapeHtml).join(', ')}</p>`);

        // PATCH HAPUS ABSEN: tombol hapus cuma ditampilkan untuk tanggal
        // dalam 7 hari terakhir -- cek di sisi frontend ini cuma untuk
        // UX (supaya tombol tidak ditampilkan kalau memang pasti akan
        // ditolak); aturan SEBENARNYA tetap dijaga di backend
        // (apakahDalam7HariTerakhir() di Utils.gs), bukan bergantung ke
        // cek di sini.
        const bolehHapus = dalam7HariTerakhir(item.tanggal, hariIniServer);
        const tombolHapus = bolehHapus
            ? `<button type="button" class="btn-hapus-riwayat" data-tanggal="${escapeHtml(item.tanggal)}" title="Hapus absensi tanggal ini">🗑️ Hapus</button>`
            : '';

        return `
            <div class="card riwayat-card riwayat-card-clickable" style="margin-bottom: 12px;" data-tanggal="${escapeHtml(item.tanggal)}" tabindex="0" role="button" title="Klik untuk edit absensi tanggal ini">
                <div class="riwayat-card-header">
                    <strong>${escapeHtml(item.tanggal)}</strong>
                    ${tombolHapus}
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

    if (konteks) {
        container.querySelectorAll('.riwayat-card-clickable').forEach(card => {
            const buka = () => navigasiKeEditAbsensi(konteks, card.dataset.tanggal);
            card.addEventListener('click', buka);
            card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); buka(); } });
        });

        container.querySelectorAll('.btn-hapus-riwayat').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // jangan sampai memicu navigasiKeEditAbsensi() dari klik kartu
                hapusKartuRiwayat(konteks, btn.dataset.tanggal, containerId);
            });
        });
    }
}

// Cek apakah `tanggalStr` ("yyyy-MM-dd") ada dalam 7 hari terakhir
// (termasuk hari ini) -- versi frontend dari apakahDalam7HariTerakhir()
// di Utils.gs, cuma dipakai untuk UX (tampil/sembunyikan tombol Hapus).
// PATCH: `hariIniStr` (opsional, "yyyy-MM-dd") -- kalau diisi (dari
// res.hariIniServer), dipakai sebagai acuan "hari ini" alih-alih jam
// lokal browser, supaya konsisten dengan zona waktu yang ditegakkan
// backend. Kalau tidak diisi (mis. dipanggil dari tempat lain tanpa
// akses ke response server), fallback ke jam lokal browser seperti
// sebelumnya -- lebih baik ada fallback yang sedikit meleset daripada
// error kalau parameter ini tidak tersedia.
function dalam7HariTerakhir(tanggalStr, hariIniStr) {
    const hariIni = hariIniStr ? new Date(hariIniStr + 'T00:00:00') : new Date();
    hariIni.setHours(0, 0, 0, 0);
    const batasAwal = new Date(hariIni);
    batasAwal.setDate(batasAwal.getDate() - 6);
    const tgl = new Date(tanggalStr + 'T00:00:00');
    if (isNaN(tgl.getTime()) || isNaN(hariIni.getTime())) return false;
    return tgl >= batasAwal && tgl <= hariIni;
}

/**
 * Hapus 1 baris absen (tombol 🗑️ Hapus di kartu riwayat) -- minta
 * konfirmasi dulu, lalu panggil endpoint hapus yang sesuai (mapel/wali),
 * lalu muat ulang daftar riwayat supaya kartu yang dihapus langsung
 * hilang dari tampilan tanpa perlu refresh manual.
 */
async function hapusKartuRiwayat(konteks, tanggal, containerId) {
    const confirmed = await showConfirm(
        `Yakin hapus absensi tanggal ${tanggal}? Data yang dihapus tidak bisa dikembalikan.`,
        'Konfirmasi Hapus Absensi'
    );
    if (!confirmed) return;

    try {
        showGlobalLoading('Menghapus data...');
        const res = konteks.mode === 'wali'
            ? await hapusAbsenWali(konteks.kelas, tanggal)
            : await hapusAbsen(konteks.mapel, konteks.kelas, tanggal);
        hideGlobalLoading();

        if (!res.success) {
            showNotification(res.message || 'Gagal menghapus absensi.', 'error');
            return;
        }
        showNotification(res.message || 'Absensi berhasil dihapus.', 'success');

        // Muat ulang daftar riwayat (bukan cuma hapus kartunya dari DOM)
        // supaya data yang ditampilkan selalu sinkron dengan spreadsheet.
        const resRiwayat = konteks.mode === 'wali'
            ? await getRiwayatAbsenWali(konteks.kelas)
            : await getRiwayatAbsensi(konteks.mapel, konteks.kelas);
        renderRiwayatList(resRiwayat, containerId, konteks);
    } catch (error) {
        hideGlobalLoading();
        showNotification('Gagal menghapus: ' + error.message, 'error');
    }
}

/**
 * Pindah ke tab "Input" (panelAbsensi) dan muat data absensi tanggal
 * tertentu untuk diedit -- dipicu dari klik kartu riwayat.
 * `dispatchEvent(new Event('change'))` dipakai supaya listener yang
 * SUDAH ADA di setupInputAbsensiForm()/setupAbsenWaliPanel() (yang
 * mengambil daftar siswa + data existing) otomatis ikut jalan, tanpa
 * perlu mengekspos ulang fungsi reload-nya secara terpisah.
 */
export function navigasiKeEditAbsensi(konteks, tanggal) {
    if (!tanggal) return;
    switchTab('panelAbsensi');

    if (konteks.mode === 'wali') {
        const btnSubtabWali = document.getElementById('subtabBtnInputWali');
        if (btnSubtabWali && !btnSubtabWali.classList.contains('hidden')) btnSubtabWali.click();

        const waliTanggal = document.getElementById('waliTanggal');
        if (waliTanggal) {
            waliTanggal.value = tanggal;
            waliTanggal.dispatchEvent(new Event('change'));
        }
    } else {
        const btnSubtabMapel = document.getElementById('subtabBtnInputMapel');
        if (btnSubtabMapel) btnSubtabMapel.click();

        const selectMapel = document.getElementById('selectMapel');
        const selectKelas = document.getElementById('selectKelas');
        const tanggalInput = document.getElementById('tanggalAbsen');
        if (selectMapel) selectMapel.value = konteks.mapel;
        if (selectKelas) selectKelas.value = konteks.kelas;
        if (tanggalInput) {
            tanggalInput.value = tanggal;
            tanggalInput.dispatchEvent(new Event('change'));
        }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    showNotification('Menampilkan absensi tanggal ' + tanggal + ' untuk diedit.', 'info');
}

// PATCH (pasangan mapel-kelas): versi frontend dari getKelasUntukMapel()
// di kodegs/PasanganMapelKelas.gs -- LOGIKA FALLBACK-NYA HARUS SAMA
// PERSIS dengan backend (kosong/mapel tidak terdaftar di pasangan ->
// semua kelasList), supaya dropdown di sini tidak pernah menampilkan
// kombinasi yang nanti ditolak backend, ATAU menyembunyikan kombinasi
// yang sebenarnya backend izinkan.
function getKelasUntukMapelClient(user, mapel) {
    if (!user.pasanganMapelKelas || !user.pasanganMapelKelas[mapel]) {
        return user.kelasList;
    }
    return user.pasanganMapelKelas[mapel];
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

    // PATCH (pasangan mapel-kelas): dropdown kelas sekarang mengikuti
    // mapel yang sedang dipilih -- kalau admin sudah atur pengecualian
    // untuk mapel itu, cuma kelas yang dipasangkan yang muncul; kalau
    // tidak ada pengecualian, tetap semua kelasList seperti sebelumnya
    // (perilaku lama, tidak berubah untuk guru yang belum diatur).
    function perbaruiOpsiKelas() {
        if (!selectKelas) return;
        const mapelTerpilih = selectMapel?.value;
        const kelasBoleh = mapelTerpilih ? getKelasUntukMapelClient(user, mapelTerpilih) : user.kelasList;
        const kelasSekarang = selectKelas.value; // coba pertahankan pilihan kalau masih valid utk mapel baru
        selectKelas.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>' +
            kelasBoleh.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
        if (kelasBoleh.indexOf(kelasSekarang) !== -1) {
            selectKelas.value = kelasSekarang;
        }
    }
    perbaruiOpsiKelas();

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
        showGlobalLoading('Mengambil data siswa...');

        try {
            // PATCH PERFORMA: kedua request ini independen satu sama lain
            // (daftar siswa tidak butuh hasil existing attendance, begitu
            // juga sebaliknya) -- sebelumnya dijalankan berurutan (await
            // satu-satu), sehingga total waktu tunggu = waktu keduanya
            // dijumlahkan. Dijalankan paralel dengan Promise.all supaya
            // total waktu tunggu = waktu request yang PALING LAMBAT saja.
            const [students, existingRes] = await Promise.all([
                ambilDaftarSiswa(kelas),
                getExistingAttendance(user.nama, mapel, kelas, tanggal)
            ]);

            const existingMap = {};
            // PATCH: tandai apakah tanggal ini SUDAH ada datanya (mode
            // update) atau belum (mode simpan baru) -- dipakai untuk
            // mengganti label tombol submit di bawah.
            const adaDataLama = !!(existingRes.success && existingRes.data);
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
            if (btnSubmit) {
                btnSubmit.classList.remove('hidden');
                const btnTextEl = btnSubmit.querySelector('.btn-text');
                if (btnTextEl) btnTextEl.textContent = adaDataLama ? '🔄 Update Absensi' : '💾 Simpan Absensi';
            }
        } catch (err) {
            console.error('Gagal memuat siswa:', err);
            showNotification('Gagal memuat data siswa: ' + err.message, 'error');
            document.getElementById('studentsBody').innerHTML =
                '<tr class="empty-row"><td colspan="3"><p class="empty-state">Gagal memuat data</p></td></tr>';
        } finally {
            if (loadingEl) loadingEl.classList.add('hidden');
            hideGlobalLoading();
        }
    }

    if (selectMapel) selectMapel.addEventListener('change', () => { perbaruiOpsiKelas(); reloadStudents(); });
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

        const attendance = bacaAttendanceDariTabel('studentsBody');
        if (attendance.length === 0) {
            showNotification('Tidak ada data siswa untuk disimpan.', 'warning');
            return;
        }

        setSubmitLoading(btnSubmit, true);
        showGlobalLoading('Menyimpan absensi...');
        try {
            const res = await submitAbsensi({ mapel, kelas, tanggal, attendance });
            showNotification(res.message || (res.success ? 'Absensi tersimpan' : 'Gagal menyimpan absensi'), res.success ? 'success' : 'error');
        } catch (err) {
            showNotification('Gagal menyimpan absensi: ' + err.message, 'error');
        } finally {
            setSubmitLoading(btnSubmit, false);
            hideGlobalLoading();
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
        showGlobalLoading('Mengambil riwayat absensi...');
        try {
            const res = await getRiwayatAbsensi(mapel, kelas);
            renderRiwayatList(res, 'riwayatList', { mode: 'mapel', mapel, kelas });
        } catch (err) {
            showNotification('Gagal memuat riwayat: ' + err.message, 'error');
        } finally {
            if (riwayatLoading) riwayatLoading.classList.add('hidden');
            hideGlobalLoading();
        }
    }

    if (riwayatMapel) riwayatMapel.addEventListener('change', loadRiwayatMapel);
    if (riwayatKelas) riwayatKelas.addEventListener('change', loadRiwayatMapel);
    if (riwayatMapel?.value && riwayatKelas?.value) loadRiwayatMapel();

    if (user.kelasWali) {
        if (subtabBtnWali) subtabBtnWali.classList.remove('hidden');
        if (riwayatWaliKelasLabel) riwayatWaliKelasLabel.textContent = user.kelasWali;

        async function loadRiwayatWali() {
            if (riwayatWaliLoading) riwayatWaliLoading.classList.remove('hidden');
            showGlobalLoading('Mengambil riwayat absensi...');
            try {
                const res = await getRiwayatAbsenWali(user.kelasWali);
                renderRiwayatList(res, 'riwayatWaliList', { mode: 'wali', kelas: user.kelasWali });
            } catch (err) {
                showNotification('Gagal memuat riwayat: ' + err.message, 'error');
            } finally {
                if (riwayatWaliLoading) riwayatWaliLoading.classList.add('hidden');
                hideGlobalLoading();
            }
        }

        // PATCH: dimuat ulang setiap kali sub-tab dibuka (bukan cuma sekali per
        // sesi) supaya data terbaru langsung tampil setelah guru submit absensi
        // di panel "Wali" -- kartu riwayat di panel itu sudah dipindah ke sini.
        subtabBtnWali?.addEventListener('click', loadRiwayatWali);
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
            showGlobalLoading('Menyiapkan file rekap...');
            try {
                const res = await downloadRekapExcel('mapel', user.mapelList.join(','), user.kelasList.join(','), user.nama);
                showNotification(res.message || 'Rekap berhasil diunduh', res.success ? 'success' : 'error');
            } catch (err) {
                showNotification('Gagal mengunduh rekap: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                hideGlobalLoading();
            }
        });
    });

    document.querySelectorAll('[data-action="downloadRekapAbsenWali"]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!user.kelasWali) return;
            btn.disabled = true;
            showGlobalLoading('Menyiapkan file rekap...');
            try {
                const res = await downloadRekapExcel('wali', '', user.kelasWali, user.kelasWali);
                showNotification(res.message || 'Rekap berhasil diunduh', res.success ? 'success' : 'error');
            } catch (err) {
                showNotification('Gagal mengunduh rekap: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                hideGlobalLoading();
            }
        });
    });
}

// =========================================================
// FITUR: Delegasi Input Absen ke Ketua Kelas (sementara)
// ---------------------------------------------------------
// Kartu di sub-menu Wali Kelas yang memungkinkan wali kelas
// mengaktifkan/menonaktifkan link sekali-pakai untuk kelasnya sendiri.
// Link ini TIDAK memakai token session biasa -- lihat kodegs/KetuaKelas.gs
// dan js/ketuaKelas.js untuk sisi penerima link (ketua kelas).
// =========================================================
function setupDelegasiKetuaKelas(kelasWali) {
    const statusEl = document.getElementById('delegasiStatus');
    const linkBox = document.getElementById('delegasiLinkBox');
    const linkInput = document.getElementById('delegasiLinkInput');
    const btnAktifkan = document.getElementById('btnAktifkanDelegasi');
    const btnNonaktifkan = document.getElementById('btnNonaktifkanDelegasi');
    const btnSalin = document.getElementById('btnSalinLinkDelegasi');

    if (!statusEl || !btnAktifkan || !btnNonaktifkan) return;

    // PATCH: link dibangun dari lokasi halaman saat ini (bukan hardcode
    // domain) supaya tetap benar baik di URL produksi (GitHub Pages)
    // maupun kalau di-deploy ulang ke domain/subpath lain.
    function buatUrlLink(token) {
        const base = window.location.origin + window.location.pathname;
        return `${base}?ketua=${token}`;
    }

    function tampilkanAktif(token, modePerTanggal) {
        // PATCH: kalau pengelola aplikasi sudah mengaktifkan mode per
        // tanggal SECARA GLOBAL (semua kelas sekaligus) lewat Apps Script
        // (lihat kodegs/ketuakelas.gs), tampilkan info tambahan supaya
        // wali kelas tahu ketua kelas sekarang bisa pilih tanggal apa
        // saja -- ini murni informasional, wali kelas tidak bisa
        // mengubah pengaturan ini sendiri dari sini.
        const infoModeTanggal = modePerTanggal
            ? ' Mode rekap sedang AKTIF untuk semua kelas -- ketua kelas bisa mengisi absensi tanggal apa saja (dikelola pengurus aplikasi).'
            : '';
        statusEl.textContent = '✅ Link sedang AKTIF -- bisa dipakai ketua kelas untuk mengisi absensi hari ini.' + infoModeTanggal;
        statusEl.classList.add('delegasi-status-aktif');
        linkInput.value = buatUrlLink(token);
        linkBox.classList.remove('hidden');
        btnAktifkan.classList.add('hidden');
        btnNonaktifkan.classList.remove('hidden');
    }

    function tampilkanNonaktif() {
        statusEl.textContent = 'Nonaktif -- ketua kelas belum bisa mengisi absensi lewat link.';
        statusEl.classList.remove('delegasi-status-aktif');
        linkBox.classList.add('hidden');
        linkInput.value = '';
        btnAktifkan.classList.remove('hidden');
        btnNonaktifkan.classList.add('hidden');
    }

    // Cek status saat panel pertama kali dibuka
    (async () => {
        try {
            const res = await getStatusKetuaKelasLink(kelasWali);
            if (res.success && res.data && res.data.aktif) {
                tampilkanAktif(res.data.token, res.data.modePerTanggal);
            } else {
                tampilkanNonaktif();
            }
        } catch (err) {
            statusEl.textContent = 'Gagal memeriksa status link: ' + err.message;
        }
    })();

    btnAktifkan.addEventListener('click', async () => {
        btnAktifkan.disabled = true;
        showGlobalLoading('Membuat link...');
        try {
            const res = await generateKetuaKelasLink(kelasWali);
            if (res.success) {
                tampilkanAktif(res.data.token);
                showNotification('Link ketua kelas berhasil diaktifkan.', 'success');
            } else {
                showNotification(res.message || 'Gagal membuat link.', 'error');
            }
        } catch (err) {
            showNotification('Gagal membuat link: ' + err.message, 'error');
        } finally {
            btnAktifkan.disabled = false;
            hideGlobalLoading();
        }
    });

    btnNonaktifkan.addEventListener('click', async () => {
        const konfirmasi = await showConfirm(
            'Link yang sudah dibagikan ke ketua kelas akan langsung tidak berlaku. Lanjutkan?',
            'Nonaktifkan Link Ketua Kelas'
        );
        if (!konfirmasi) return;

        btnNonaktifkan.disabled = true;
        showGlobalLoading('Menonaktifkan link...');
        try {
            const res = await nonaktifkanKetuaKelasLink(kelasWali);
            if (res.success) {
                tampilkanNonaktif();
                showNotification('Link ketua kelas berhasil dinonaktifkan.', 'success');
            } else {
                showNotification(res.message || 'Gagal menonaktifkan link.', 'error');
            }
        } catch (err) {
            showNotification('Gagal menonaktifkan link: ' + err.message, 'error');
        } finally {
            btnNonaktifkan.disabled = false;
            hideGlobalLoading();
        }
    });

    if (btnSalin) {
        btnSalin.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(linkInput.value);
                showNotification('Link berhasil disalin.', 'success');
            } catch (err) {
                // Fallback untuk browser yang tidak mendukung Clipboard API
                linkInput.select();
                document.execCommand('copy');
                showNotification('Link berhasil disalin.', 'success');
            }
        });
    }
}

// =========================================================
// PANEL: INPUT ABSENSI -- SUB-TAB WALI KELAS (Absen Harian)
// =========================================================
function setupAbsenWaliPanel(user) {
    if (!user.kelasWali) return; // bukan wali kelas -> sub-menu tetap hidden (lihat setupInputSubTabs)

    const waliKelasLabel = document.getElementById('waliKelasLabel');
    const waliTanggal = document.getElementById('waliTanggal');
    const waliLoading = document.getElementById('waliLoading');
    const waliBtnSubmit = document.getElementById('waliBtnSubmit');
    const form = document.getElementById('waliAbsenForm');

    if (waliKelasLabel) waliKelasLabel.textContent = user.kelasWali;
    if (waliTanggal && !waliTanggal.value) waliTanggal.valueAsDate = new Date();

    setupDelegasiKetuaKelas(user.kelasWali);

    async function reloadWaliStudents() {
        const tanggal = waliTanggal?.value;
        if (!tanggal) return;

        if (waliLoading) waliLoading.classList.remove('hidden');
        if (waliBtnSubmit) waliBtnSubmit.classList.add('hidden');
        showGlobalLoading('Mengambil data siswa...');

        try {
            // PATCH PERFORMA: sama seperti reloadStudents() di Panel Input --
            // daftar siswa & data absensi existing independen, jalankan paralel.
            const [students, existingRes] = await Promise.all([
                ambilDaftarSiswa(user.kelasWali),
                getAbsenWaliExisting(user.kelasWali, tanggal)
            ]);
            const existingMap = (existingRes.success && existingRes.data) ? existingRes.data : {};
            // PATCH: sama seperti reloadStudents() -- ganti label tombol
            // submit jadi "Update Absensi" kalau tanggal ini sudah ada
            // datanya, "Simpan Absensi" kalau belum.
            const adaDataLama = !!(existingRes.success && existingRes.data);
            renderStudentRows('waliStudentsBody', students, existingMap);
            if (waliBtnSubmit) {
                waliBtnSubmit.classList.remove('hidden');
                const btnTextEl = waliBtnSubmit.querySelector('.btn-text');
                if (btnTextEl) btnTextEl.textContent = adaDataLama ? '🔄 Update Absensi' : '💾 Simpan Absensi';
            }
        } catch (err) {
            showNotification('Gagal memuat data siswa: ' + err.message, 'error');
        } finally {
            if (waliLoading) waliLoading.classList.add('hidden');
            hideGlobalLoading();
        }
    }

    if (waliTanggal) waliTanggal.addEventListener('change', reloadWaliStudents);

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tanggal = waliTanggal?.value;
            if (!tanggal) return;

            const dataKehadiran = bacaAttendanceDariTabel('waliStudentsBody');
            if (dataKehadiran.length === 0) {
                showNotification('Tidak ada data siswa untuk disimpan.', 'warning');
                return;
            }

            setSubmitLoading(waliBtnSubmit, true);
            showGlobalLoading('Menyimpan absensi...');
            try {
                const res = await submitAbsenWali({ kelas: user.kelasWali, tanggal, dataKehadiran });
                showNotification(res.message || (res.success ? 'Absensi tersimpan' : 'Gagal menyimpan absensi'), res.success ? 'success' : 'error');
            } catch (err) {
                showNotification('Gagal menyimpan absensi: ' + err.message, 'error');
            } finally {
                setSubmitLoading(waliBtnSubmit, false);
                hideGlobalLoading();
            }
        });
    }

    reloadWaliStudents();
}

export default { initAbsensi };
