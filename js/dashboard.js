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

// =========================================================
// GRAFIK TREN KEHADIRAN -- LINE CHART (SVG, tanpa library eksternal)
// ---------------------------------------------------------
// PATCH: sebelumnya grafik tren pakai bar chart CSS. Diganti ke line chart
// karena lebih pas untuk data berbasis waktu ("tren" = arah naik/turun,
// lebih jelas sebagai satu alur garis daripada perbandingan tinggi antar
// bar berdampingan) dan lebih ringan ditampilkan kalau titik datanya banyak.
//
// Ditambahkan juga toggle periode Minggu/Bulan/Semester:
//  - Minggu  : 7 data mentah terakhir (paling detail, harian/per pertemuan)
//  - Bulan   : dikelompokkan per minggu (rata-rata persenHadir), 8 minggu terakhir
//  - Semester: dikelompokkan per bulan (rata-rata persenHadir), seluruh data yang ada
// Data mentah (dari getDashboardData()/getDashboardDataWali(), TIDAK
// dibatasi jumlahnya oleh backend) disimpan di trendDataStore per
// canvasId, supaya ganti periode tidak perlu fetch ulang ke server --
// cukup diagregasi ulang di sisi frontend dari data yang sudah ada.
// =========================================================
const trendDataStore = {};
const trendPeriodStore = {};

function renderTrendChart(rawData, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !rawData || rawData.length === 0) {
        return;
    }
    const container = canvas.parentElement;
    if (!container) return;

    trendDataStore[canvasId] = rawData;
    if (!trendPeriodStore[canvasId]) trendPeriodStore[canvasId] = 'minggu';

    ensureTrendPeriodToggle(container, canvasId);
    drawTrendChart(canvasId);
}

function ensureTrendPeriodToggle(container, canvasId) {
    if (container.querySelector('.trend-period-toggle')) return; // sudah ada, jangan duplikasi

    const toggle = document.createElement('div');
    toggle.className = 'trend-period-toggle';
    toggle.innerHTML = `
        <button type="button" class="trend-period-btn active" data-period="minggu">Minggu</button>
        <button type="button" class="trend-period-btn" data-period="bulan">Bulan</button>
        <button type="button" class="trend-period-btn" data-period="semester">Semester</button>
    `;
    container.insertBefore(toggle, container.firstChild);

    toggle.querySelectorAll('.trend-period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            toggle.querySelectorAll('.trend-period-btn').forEach(b => b.classList.toggle('active', b === btn));
            trendPeriodStore[canvasId] = btn.dataset.period;
            drawTrendChart(canvasId);
        });
    });
}

function drawTrendChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    const container = canvas.parentElement;
    const rawData = trendDataStore[canvasId] || [];
    const period = trendPeriodStore[canvasId] || 'minggu';

    let points;
    if (period === 'minggu') {
        points = rawData.slice(-7).map(item => ({
            label: formatTanggalSingkat(item.tanggal),
            value: item.persenHadir || 0
        }));
    } else if (period === 'bulan') {
        points = aggregateTrendByWeek(rawData).slice(-8);
    } else {
        points = aggregateTrendByMonth(rawData);
    }

    renderSvgLineChart(points, canvas, container);
}

/** Kelompokkan data harian jadi rata-rata per minggu (Senin sebagai awal minggu). */
function aggregateTrendByWeek(rawData) {
    const buckets = {};
    rawData.forEach(item => {
        const d = new Date(item.tanggal + 'T00:00:00');
        const day = d.getDay(); // 0=Minggu..6=Sabtu
        const diffKeSenin = (day === 0 ? -6 : 1) - day;
        const senin = new Date(d);
        senin.setDate(d.getDate() + diffKeSenin);
        const key = toDateKey(senin);
        if (!buckets[key]) buckets[key] = { sum: 0, count: 0 };
        buckets[key].sum += (item.persenHadir || 0);
        buckets[key].count += 1;
    });
    return Object.keys(buckets).sort().map(key => ({
        label: formatTanggalSingkat(key),
        value: Math.round((buckets[key].sum / buckets[key].count) * 10) / 10
    }));
}

/** Kelompokkan data harian jadi rata-rata per bulan (untuk tampilan 1 semester). */
function aggregateTrendByMonth(rawData) {
    const namaBulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    const buckets = {};
    rawData.forEach(item => {
        const d = new Date(item.tanggal + 'T00:00:00');
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (!buckets[key]) buckets[key] = { sum: 0, count: 0, bulanIdx: d.getMonth(), tahun: d.getFullYear() };
        buckets[key].sum += (item.persenHadir || 0);
        buckets[key].count += 1;
    });
    return Object.keys(buckets).sort().map(key => {
        const b = buckets[key];
        return {
            label: namaBulan[b.bulanIdx] + " '" + String(b.tahun).slice(2),
            value: Math.round((b.sum / b.count) * 10) / 10
        };
    });
}

function toDateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Gambar line chart SVG dari titik-titik { label, value(0-100) }.
 * viewBox tetap (600x200), diregangkan mengisi lebar kontainer lewat CSS
 * (width:100%) -- jadi otomatis responsif tanpa perlu hitung ulang lebar.
 */
function renderSvgLineChart(points, canvas, container) {
    canvas.style.display = 'none';
    const existing = container.querySelector('.trend-line-svg, .trend-empty');
    if (existing) existing.remove();

    if (!points || points.length === 0) {
        container.insertAdjacentHTML('beforeend', '<p class="trend-empty empty-state">Belum ada data untuk periode ini</p>');
        return;
    }

    const W = 600, H = 200;
    const padTop = 24, padBottom = 28, padX = 28;
    const plotW = W - padX * 2;
    const plotH = H - padTop - padBottom;
    const n = points.length;
    const stepX = n > 1 ? plotW / (n - 1) : 0;

    const coords = points.map((p, i) => {
        const x = padX + (n > 1 ? i * stepX : plotW / 2);
        const v = Math.max(0, Math.min(100, p.value));
        const y = padTop + plotH - (v / 100) * plotH;
        return { x, y, label: p.label, value: p.value };
    });

    const linePath = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ');
    const areaPath = n > 1
        ? linePath + ` L${coords[n - 1].x.toFixed(1)},${(padTop + plotH).toFixed(1)} L${coords[0].x.toFixed(1)},${(padTop + plotH).toFixed(1)} Z`
        : '';

    const gridLines = [0, 50, 100].map(pct => {
        const y = padTop + plotH - (pct / 100) * plotH;
        return `<line x1="${padX}" y1="${y.toFixed(1)}" x2="${W - padX}" y2="${y.toFixed(1)}" class="trend-gridline" />` +
               `<text x="2" y="${(y + 4).toFixed(1)}" class="trend-gridlabel">${pct}%</text>`;
    }).join('');

    const dots = coords.map(c =>
        `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" class="trend-dot"><title>${escapeHtml(c.label)}: ${c.value.toFixed(1)}%</title></circle>`
    ).join('');

    const valueLabels = coords.map(c =>
        `<text x="${c.x.toFixed(1)}" y="${(c.y - 8).toFixed(1)}" text-anchor="middle" class="trend-value-label">${c.value.toFixed(0)}%</text>`
    ).join('');

    const xLabels = coords.map(c =>
        `<text x="${c.x.toFixed(1)}" y="${H - 8}" text-anchor="middle" class="trend-x-label">${escapeHtml(c.label)}</text>`
    ).join('');

    const svg = `
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="trend-line-svg">
            ${gridLines}
            ${areaPath ? `<path d="${areaPath}" class="trend-area"></path>` : ''}
            <path d="${linePath}" class="trend-line" fill="none"></path>
            ${dots}
            ${valueLabels}
            ${xLabels}
        </svg>
    `;
    container.insertAdjacentHTML('beforeend', svg);
}

/**
 * Format tanggal ISO ("yyyy-MM-dd") jadi format singkat "dd/MM" untuk
 * label sumbu-x -- ringkas tapi tetap menunjukkan tanggal sesungguhnya.
 */
function formatTanggalSingkat(tanggalIso) {
    if (!tanggalIso) return '-';
    const bagian = tanggalIso.split('-'); // [yyyy, MM, dd]
    if (bagian.length !== 3) return tanggalIso;
    return `${bagian[2]}/${bagian[1]}`;
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

        // PATCH: kirim SEMUA mapel & kelas yang diajar guru (bukan cuma
        // yang pertama) -- backend getDashboardData() di Dashboard.gs
        // sudah mendukung banyak mapel/kelas sekaligus lewat string
        // dipisah koma, dan akan me-loop semua kombinasi kelas x mapel
        // (kombinasi yang memang tidak diajar guru itu otomatis
        // dilewati karena sheet-nya tidak ada, jadi aman dikirim semua).
        const mapel = mapelList.join(',');
        const kelas = kelasList.join(',');

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

    // PATCH: isi label "Kelas binaan: X" supaya pengguna tahu dashboard ini
    // menampilkan data untuk kelas wali yang mana.
    const kelasLabel = document.getElementById('dashboardWaliKelasLabel');
    if (kelasLabel) kelasLabel.textContent = kelasWali;

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
