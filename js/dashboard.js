/**
 * Dashboard Module
 * Menangani rendering dan logika untuk panel Dashboard (Analitik)
 * Termasuk dashboard per mapel dan dashboard untuk wali kelas
 *
 * =========================================================
 * PATCH NOTES
 * =========================================================
 * Backend (kodegs/Dashboard.gs) mengirim struktur data dengan nama
 * field tertentu, tapi kode render di file ini sebelumnya memakai
 * nama field yang BERBEDA (typo/asumsi lama), sehingga:
 *  - Panel "Persentase Kehadiran (Per Mapel)" selalu tampil
 *    "Belum ada data absensi" walau data ada di backend.
 *  - Kolom Kelas & jumlah Alpa di "Perlu Perhatian" selalu undefined.
 *  - Trend chart selalu flat (fallback minimum) karena field persen
 *    tidak pernah ketemu.
 *  - SELURUH Dashboard Wali Kelas (rata-rata, distribusi, trend)
 *    tidak pernah terisi karena backend mengirim `rataRata` &
 *    `statistikHarian`, bukan `rataHadir`/`rataAlpa`/`distribusi`/`trend`.
 *
 * Perbaikan: samakan semua akses field dengan struktur asli yang
 * dikembalikan getDashboardData() & getDashboardDataWali() di
 * kodegs/Dashboard.gs. Tidak ada perubahan pada backend yang diperlukan.
 *
 * Tambahan: loadDashboardMapel() tidak lagi men-throw error untuk akun
 * yang murni wali kelas (tidak mengajar mapel apa pun) -- itu kondisi
 * valid, bukan sesi rusak.
 * =========================================================
 */

import { getDashboardData, getDashboardDataWali, getCurrentUser } from './api.js';
// PATCH PERFORMA: escapeHtml dipakai dari utils.js (regex string-replace),
// bukan implementasi lokal yang sebelumnya ada di file ini. Implementasi
// lama membuat elemen <div> DOM baru pada SETIAP pemanggilan (lihat riwayat
// versi file ini) -- jauh lebih lambat daripada regex sederhana, dan
// terpanggil berulang kali di dalam .map()/.forEach() saat merender daftar
// topAlpa & rekap kelas/mapel. Juga menghapus duplikasi kode yang sama
// persis fungsinya dengan utils.js.
import { showNotification, escapeHtml, showGlobalLoading, hideGlobalLoading } from './utils.js';

// Cache untuk data dashboard
let dashboardCache = {
    mapel: null,
    wali: null
};

/**
 * Render chart kehadiran per mapel/kelas
 * PATCH: backend mengirim array item berbentuk
 *   { label: "Kelas - Mapel", hadir, izin, sakit, alpa, pertemuan, persenHadir }
 * (bukan { kelas, mapel, persenHadir } seperti asumsi sebelumnya).
 */
function renderRekapKelasMapelList(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !data || data.length === 0) {
        if (container) container.innerHTML = '<p class="empty-state">Tidak ada data</p>';
        return;
    }

    let html = '<div class="stats-grid">';
    data.forEach(item => {
        const persenHadir = item.persenHadir || 0;
        const className = persenHadir >= 80 ? 'stat-hadir' : persenHadir >= 60 ? 'stat-izin' : 'stat-alpa';
        // PATCH: pakai item.label (sudah berisi "Kelas - Mapel" dari backend),
        // bukan item.kelas / item.mapel yang tidak pernah dikirim.
        html += `
            <div class="stat-card ${className}">
                <div class="stat-icon">📊</div>
                <div class="stat-info">
                    <div class="stat-value">${persenHadir.toFixed(1)}%</div>
                    <div class="stat-label">${escapeHtml(item.label || '-')}</div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

/**
 * Render list siswa dengan alpa terbanyak
 * PATCH: backend mengirim { nama: "Nama (Kelas)", jumlahAlpa } untuk dashboard
 * per mapel, dan { nama: "Nama", jumlahAlpa } untuk dashboard wali.
 * Field `kelas` terpisah dan `alpha` (dengan h) TIDAK PERNAH dikirim backend.
 */
function renderTopAlpaList(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !data || data.length === 0) {
        if (container) container.innerHTML = '<p class="empty-state">Tidak ada siswa perlu perhatian</p>';
        return;
    }

    let html = '<div class="table-wrapper"><table class="simple-table"><thead><tr><th>Nama</th><th>Jumlah Alpa</th></tr></thead><tbody>';
    data.slice(0, 10).forEach(siswa => {
        html += `<tr>
            <td>${escapeHtml(siswa.nama)}</td>
            <td><span class="badge badge-danger">${siswa.jumlahAlpa || 0}</span></td>
        </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

/**
 * Render trend chart (simplified - tanpa library chart eksternal)
 * PATCH: backend mengirim field `persenHadir`, bukan `persen`.
 */
function renderTrendChart(data, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data || data.length === 0) {
        return;
    }

    // Simplified visual representation menggunakan bar CSS
    const container = canvas.parentElement;
    if (!container) return;

    let html = '<div class="trend-bars">';
    data.forEach((item, idx) => {
        const persen = item.persenHadir || 0;
        const height = Math.max(10, persen * 1.5);
        const tanggalLabel = item.tanggal || '';
        html += `
            <div class="trend-bar-item">
                <div class="trend-bar" style="height: ${height}px;" title="${escapeHtml(tanggalLabel)}: ${persen.toFixed(1)}%"></div>
                <div class="trend-bar-label">${idx + 1}</div>
            </div>
        `;
    });
    html += '</div>';

    // Replace canvas dengan visual bars
    canvas.style.display = 'none';
    const existingBars = container.querySelector('.trend-bars');
    if (existingBars) existingBars.remove();
    container.insertAdjacentHTML('beforeend', html);
}

/**
 * Render distribusi status kehadiran (H/I/S/A)
 * PATCH: menerima objek `rataRata` dari backend, berupa PERSENTASE
 * yang sudah dihitung ({ hadir, izin, sakit, alpa } dalam %), bukan
 * jumlah absolut. Sebelumnya fungsi ini mengasumsikan data.hadir dkk
 * adalah jumlah mentah dan menghitung ulang persentase dari total,
 * serta membaca data.alpha (dengan h) yang tidak pernah ada.
 */
function renderDistribusiStatus(rataRata, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !rataRata) {
        if (container) container.innerHTML = '<p class="empty-state">Tidak ada data</p>';
        return;
    }

    const pctH = (rataRata.hadir || 0).toFixed(1);
    const pctI = (rataRata.izin || 0).toFixed(1);
    const pctS = (rataRata.sakit || 0).toFixed(1);
    const pctA = (rataRata.alpa || 0).toFixed(1);

    const totalPersen = (rataRata.hadir || 0) + (rataRata.izin || 0) + (rataRata.sakit || 0) + (rataRata.alpa || 0);
    if (totalPersen === 0) {
        container.innerHTML = '<p class="empty-state">Belum ada data kehadiran</p>';
        return;
    }

    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card stat-hadir">
                <div class="stat-info">
                    <div class="stat-value">${pctH}%</div>
                    <div class="stat-label">Hadir</div>
                </div>
            </div>
            <div class="stat-card stat-izin">
                <div class="stat-info">
                    <div class="stat-value">${pctI}%</div>
                    <div class="stat-label">Izin</div>
                </div>
            </div>
            <div class="stat-card stat-sakit">
                <div class="stat-info">
                    <div class="stat-value">${pctS}%</div>
                    <div class="stat-label">Sakit</div>
                </div>
            </div>
            <div class="stat-card stat-alpa">
                <div class="stat-info">
                    <div class="stat-value">${pctA}%</div>
                    <div class="stat-label">Alpha</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Load dan render dashboard per mapel
 * PATCH: dashboardCache.mapel di-cache dari `response.data` yang formatnya
 * { rekapKelasMapel, topAlpa, trend } -- akses key disamakan.
 * PATCH: jika mapelList/kelasList kosong (akun murni wali kelas tanpa
 * tugas mengajar), ini kondisi VALID, bukan error. Panel cukup
 * menampilkan pesan "tidak mengajar mapel apa pun", bukan showNotification
 * error yang mengganggu setiap kali tab dibuka.
 */
async function loadDashboardMapel() {
    const loadingEl = document.getElementById('dashboardLoading');
    const contentEl = document.getElementById('dashboardMapelContent');
    const rekapContainer = document.getElementById('rekapKelasMapelList');
    const topAlpaContainer = document.getElementById('topAlpaList');

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (contentEl) contentEl.classList.add('hidden');
    showGlobalLoading('Memuat dashboard...');

    try {
        const userData = getCurrentUser() || {};
        const mapelList = userData.mapelList || [];
        const kelasList = userData.kelasList || [];

        // PATCH: bukan error -- akun wali kelas murni memang bisa tidak
        // punya mapel/kelas yang diajar sama sekali.
        if (mapelList.length === 0 || kelasList.length === 0) {
            if (rekapContainer) rekapContainer.innerHTML = '<p class="empty-state">Anda tidak mengajar mata pelajaran apa pun</p>';
            if (topAlpaContainer) topAlpaContainer.innerHTML = '<p class="empty-state">-</p>';
            if (contentEl) contentEl.classList.remove('hidden');
            return;
        }

        // Load data untuk mapel dan kelas pertama sebagai contoh
        const mapel = mapelList[0];
        const kelas = kelasList[0];

        const response = await getDashboardData(mapel, kelas);

        if (!response.success) {
            throw new Error(response.message || 'Gagal memuat data dashboard');
        }

        const data = response.data || {};

        // PATCH: nama key sesuai backend -> rekapKelasMapel (bukan rekapPerKelas)
        if (data.rekapKelasMapel && data.rekapKelasMapel.length > 0) {
            renderRekapKelasMapelList(data.rekapKelasMapel, 'rekapKelasMapelList');
        } else if (rekapContainer) {
            rekapContainer.innerHTML = '<p class="empty-state">Belum ada data absensi</p>';
        }

        if (data.topAlpa && data.topAlpa.length > 0) {
            renderTopAlpaList(data.topAlpa, 'topAlpaList');
        } else if (topAlpaContainer) {
            topAlpaContainer.innerHTML = '<p class="empty-state">Tidak ada siswa perlu perhatian</p>';
        }

        if (data.trend && data.trend.length > 0) {
            renderTrendChart(data.trend, 'trendChart');
        }

        dashboardCache.mapel = data;

        if (contentEl) contentEl.classList.remove('hidden');
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showNotification('Gagal memuat dashboard: ' + error.message, 'error');
        if (rekapContainer) rekapContainer.innerHTML = '<p class="empty-state">Gagal memuat data</p>';
        if (topAlpaContainer) topAlpaContainer.innerHTML = '<p class="empty-state">Gagal memuat data</p>';
        if (contentEl) contentEl.classList.remove('hidden');
    } finally {
        if (loadingEl) loadingEl.classList.add('hidden');
        hideGlobalLoading();
    }
}

/**
 * Load dan render dashboard wali kelas
 * PATCH: seluruh akses field disamakan dengan struktur asli dari
 * getDashboardDataWali() di kodegs/Dashboard.gs:
 *   { kelas, totalPertemuan, totalSiswa, statistikHarian, topAlpa, rataRata }
 * Field data.rataHadir / data.rataAlpa / data.distribusi / data.trend
 * SEBELUMNYA TIDAK PERNAH ADA di response backend -- itulah sebabnya
 * dashboard wali selalu tampil 0% / kosong.
 */
async function loadDashboardWali() {
    const userData = getCurrentUser() || {};
    const kelasWali = userData.kelasWali;

    const waliContent = document.getElementById('dashboardWaliContent');
    const waliEmpty = document.getElementById('dashboardWaliEmpty');

    if (!kelasWali) {
        if (waliContent) waliContent.classList.add('hidden');
        if (waliEmpty) waliEmpty.classList.remove('hidden');
        return;
    }

    if (waliEmpty) waliEmpty.classList.add('hidden');

    showGlobalLoading('Memuat dashboard wali kelas...');
    try {
        const response = await getDashboardDataWali(kelasWali);

        if (!response.success) {
            throw new Error(response.message || 'Gagal memuat data dashboard wali');
        }

        const data = response.data || {};

        // Stats cards
        const elPertemuan = document.getElementById('waliStatPertemuan');
        const elSiswa = document.getElementById('waliStatSiswa');
        const elRataHadir = document.getElementById('waliStatRataHadir');
        const elRataAlpa = document.getElementById('waliStatRataAlpa');

        if (elPertemuan) elPertemuan.textContent = data.totalPertemuan || 0;
        if (elSiswa) elSiswa.textContent = data.totalSiswa || 0;
        // PATCH: rataRata.hadir / rataRata.alpa (bukan data.rataHadir / data.rataAlpa)
        if (elRataHadir) elRataHadir.textContent = (data.rataRata?.hadir || 0).toFixed(1) + '%';
        if (elRataAlpa) elRataAlpa.textContent = (data.rataRata?.alpa || 0).toFixed(1) + '%';

        // PATCH: distribusi = data.rataRata (bukan data.distribusi yang tidak ada)
        if (data.rataRata) {
            renderDistribusiStatus(data.rataRata, 'waliDistribusiList');
        }

        // PATCH: trend = data.statistikHarian, dan tiap item field-nya
        // { tanggal, hadir, izin, sakit, alpa, total, persenHadir } --
        // renderTrendChart sudah dibetulkan untuk memakai persenHadir.
        if (data.statistikHarian && data.statistikHarian.length > 0) {
            renderTrendChart(data.statistikHarian, 'trendChartWali');
        }

        if (data.topAlpa && data.topAlpa.length > 0) {
            renderTopAlpaList(data.topAlpa, 'waliTopAlpaList');
        } else {
            const container = document.getElementById('waliTopAlpaList');
            if (container) container.innerHTML = '<p class="empty-state">Tidak ada siswa perlu perhatian</p>';
        }

        dashboardCache.wali = data;
        if (waliContent) waliContent.classList.remove('hidden');
    } catch (error) {
        console.error('Error loading dashboard wali:', error);
        showNotification('Gagal memuat dashboard wali: ' + error.message, 'error');
        if (waliContent) waliContent.classList.remove('hidden');
    } finally {
        hideGlobalLoading();
    }
}

/**
 * PATCH (BARU): atur sub-tab default & visibilitas tombol "Wali Kelas".
 * Default tampilan Dashboard adalah Wali Kelas -- tapi hanya kalau akun
 * ini memang wali kelas. Kalau bukan wali kelas (guru mapel murni),
 * tombol sub-tab Wali disembunyikan dan default otomatis jatuh ke
 * sub-tab Per Mapel, supaya tidak ada tab kosong yang jadi default.
 */
function setupDashboardSubTabs() {
    const userData = getCurrentUser() || {};
    const btnWali = document.getElementById('subtabBtnDashboardWali');
    const btnMapel = document.getElementById('subtabBtnDashboardMapel');
    const panelWali = document.getElementById('subtabDashboardWali');
    const panelMapel = document.getElementById('subtabDashboardMapel');

    const adalahWaliKelas = !!userData.kelasWali;

    if (btnWali) btnWali.classList.toggle('hidden', !adalahWaliKelas);

    // Tentukan tab aktif default: Wali Kelas kalau berlaku, kalau tidak Per Mapel.
    const aktifkanWali = adalahWaliKelas;
    if (btnWali) btnWali.classList.toggle('active', aktifkanWali);
    if (btnMapel) btnMapel.classList.toggle('active', !aktifkanWali);
    if (panelWali) panelWali.classList.toggle('hidden', !aktifkanWali);
    if (panelMapel) panelMapel.classList.toggle('hidden', aktifkanWali);
}

/**
 * Inisialisasi dashboard
 * Dipanggil saat panel Dashboard ditampilkan
 */
export async function initDashboard() {
    console.log('Initializing dashboard...');

    setupDashboardSubTabs();
    // PATCH PERFORMA: kedua fungsi ini independen (beda seksi DOM, beda
    // endpoint API) -- sebelumnya di-await berurutan sehingga dashboard wali
    // baru mulai dimuat SETELAH dashboard mapel selesai total. Dijalankan
    // paralel dengan Promise.all supaya total waktu tunggu awal = waktu
    // yang paling lambat di antara keduanya, bukan jumlah keduanya.
    await Promise.all([loadDashboardMapel(), loadDashboardWali()]);

    const dashboardTabBtn = document.querySelector('[data-tab="panelDashboard"]');
    if (dashboardTabBtn) {
        dashboardTabBtn.addEventListener('click', () => {
            setTimeout(() => {
                loadDashboardMapel();
                loadDashboardWali();
            }, 100);
        });
    }
}

export default {
    initDashboard
};
