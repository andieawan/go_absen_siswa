# CSS Modular - Dokumentasi

Struktur folder CSS ini mengikuti pendekatan modular untuk memudahkan maintenance dan scalability.

## 📁 Struktur File

```
css/
├── main.css          # Entry point (mengimpor semua file)
├── variables.css     # CSS custom properties (warna, spacing, dll)
├── reset.css         # Normalisasi browser
├── layout.css        # Struktur halaman (header, footer, grid)
├── components.css    # Komponen UI reusable (button, card, form, dll)
├── utilities.css     # Utility classes untuk styling cepat
└── README.md         # Dokumentasi ini
```

## 🎯 Fungsi Tiap File

### 1. `variables.css`
Menyimpan semua CSS custom properties yang digunakan di seluruh aplikasi:
- Warna (primary, secondary, success, warning, danger, dll)
- Typography (font size, weight, line height)
- Spacing system (0-16)
- Border radius
- Shadows
- Transitions
- Z-index layers

**Contoh penggunaan:**
```css
.btn {
  background: var(--primary-color);
  padding: var(--spacing-3) var(--spacing-6);
  border-radius: var(--radius-lg);
}
```

### 2. `reset.css`
Normalisasi default browser untuk konsistensi lintas browser:
- Reset margin/padding
- Box-sizing
- Typography defaults
- Scrollbar custom
- Focus styles untuk aksesibilitas

### 3. `layout.css`
Struktur utama halaman:
- `.app-container` - Wrapper utama
- `.header` - Header dengan brand dan actions
- `.main-content` - Area konten utama
- `.section` - Section cards
- `.grid` - Grid layouts (2, 3, 4 columns)
- `.footer` - Footer
- Responsive breakpoints (768px, 1024px)

### 4. `components.css`
Komponen UI reusable:

#### Cards
- `.card`, `.card__header`, `.card__title`, `.card__body`

#### Buttons
- `.btn`, `.btn--primary`, `.btn--secondary`, `.btn--success`, `.btn--danger`, `.btn--outline`
- Modifiers: `.btn--sm`, `.btn--lg`

#### Forms
- `.form-group`, `.form-label`, `.form-input`, `.form-select`, `.form-textarea`
- Error states: `.form-group.error`

#### Tables
- `.table-container`, `.table`
- Status badges: `.badge--success`, `.badge--warning`, `.badge--danger`, `.badge--info`

#### Loading
- `.spinner`, `.loading-overlay`

#### Alerts & Toasts
- `.alert`, `.alert--success`, `.alert--error`, `.alert--warning`, `.alert--info`
- `.toast-container`, `.toast`

#### Tabs
- `.tabs`, `.tab`, `.tab--active`

#### Modal
- `.modal-backdrop`, `.modal`, `.modal__header`, `.modal__body`, `.modal__footer`

### 5. `utilities.css`
Utility classes untuk styling cepat tanpa perlu menulis CSS custom:

#### Display
- `.d-none`, `.d-block`, `.d-flex`, `.d-grid`

#### Flexbox
- `.flex-row`, `.flex-column`
- `.justify-center`, `.justify-between`
- `.align-center`, `.align-start`
- `.gap-1` sampai `.gap-6`

#### Typography
- `.text-center`, `.text-left`, `.text-right`
- `.fw-bold`, `.fw-medium`, `.fw-normal`
- `.fs-sm`, `.fs-base`, `.fs-lg`, `.fs-xl`
- `.text-primary`, `.text-success`, `.text-danger`

#### Spacing (Margin & Padding)
- `.m-0` sampai `.m-6`, `.mt-4`, `.mb-4`, `.mx-auto`
- `.p-0` sampai `.p-6`, `.pt-4`, `.pb-4`, `.px-6`, `.py-6`

#### Sizing
- `.w-full`, `.h-full`, `.min-h-screen`

#### Borders & Shadows
- `.rounded-lg`, `.rounded-xl`, `.rounded-full`
- `.shadow-md`, `.shadow-lg`, `.shadow-xl`

#### Visibility & Opacity
- `.visible`, `.invisible`
- `.opacity-0`, `.opacity-50`, `.opacity-100`

#### Position
- `.relative`, `.absolute`, `.fixed`, `.sticky`
- `.top-0`, `.right-0`, `.bottom-0`, `.left-0`

#### Utilities Lainnya
- `.cursor-pointer`, `.select-none`, `.transition`, `.overflow-auto`

## 🚀 Cara Menggunakan

### Di HTML (index.html)
Ganti link CSS lama:
```html
<!-- ❌ Lama (single file) -->
<link rel="stylesheet" href="style.css">

<!-- ✅ Baru (modular) -->
<link rel="stylesheet" href="css/main.css">
```

### Development Workflow
1. **Tambah komponen baru**: Edit `components.css`
2. **Ubah tema/warna**: Edit `variables.css`
3. **Styling cepat**: Gunakan utility classes dari `utilities.css`
4. **Layout custom**: Edit `layout.css`

### Contoh Penggunaan Utility Classes
```html
<!-- Card dengan styling cepat -->
<div class="card p-6 shadow-lg rounded-xl">
  <div class="flex justify-between align-center mb-4">
    <h3 class="card__title fs-xl fw-semibold">Judul</h3>
    <button class="btn btn--primary btn--sm">Action</button>
  </div>
  <p class="text-gray-600">Konten card...</p>
</div>

<!-- Form dengan error state -->
<div class="form-group error">
  <label class="form-label">NIS</label>
  <input type="text" class="form-input" placeholder="Masukkan NIS">
  <span class="form-error">NIS wajib diisi</span>
</div>

<!-- Responsive grid -->
<div class="grid grid--3-cols gap-6">
  <div class="card">Card 1</div>
  <div class="card">Card 2</div>
  <div class="card">Card 3</div>
</div>
```

## 🎨 Best Practices

1. **Prioritaskan Utility Classes**: Gunakan utilities.css untuk styling cepat sebelum membuat class baru
2. **Gunakan Variables**: Selalu gunakan CSS variables untuk warna, spacing, dll
3. **Komponen Reusable**: Tambahkan komponen yang sering digunakan ke components.css
4. **Mobile First**: Layout.css sudah responsive, gunakan utility classes `.md-d-none`, `.lg-d-none` untuk override responsive
5. **Konsistensi Naming**: Gunakan BEM-like naming (`.block__element--modifier`)

## 📦 Production Optimization

Untuk production, pertimbangkan untuk:
1. Menggabungkan semua file CSS menjadi satu file minified
2. Menggunakan tool seperti PurgeCSS untuk menghapus unused utilities
3. Menambahkan versioning pada filename untuk cache busting

```bash
# Contoh build command (jika menggunakan build tool)
npm run build:css
```

## 🔧 Maintenance Tips

- **Menambah warna baru**: Tambahkan di `variables.css`, lalu buat utility class di `utilities.css` jika diperlukan
- **Menambah spacing**: Tambahkan di `variables.css`, lalu generate utility classes di `utilities.css`
- **Debugging**: Gunakan Chrome DevTools untuk melihat file sumber CSS (terpisah berkat source maps alami)

---

**Total Lines of Code**: ~1,200 baris (terorganisir dalam 5 file)
**Last Updated**: 2024
