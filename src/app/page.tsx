import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

const features = [
  {
    icon: "◈",
    title: "Kesepakatan terstruktur",
    text: "Detail transaksi, nominal, dan pihak yang terlibat dicatat dalam satu alur."
  },
  {
    icon: "⌁",
    title: "Pengelolaan transaksi",
    text: "Pantau status pengajuan, persetujuan, dan riwayat transaksi dalam workspace."
  },
  {
    icon: "◎",
    title: "Biaya transparan",
    text: "Biaya layanan website transparan: 2 token per transaksi, ditanggung buyer. Dana transaksi dibayar manual lewat QR bisnis rekber penangan dan terpisah dari token."
  },
  {
    icon: "▤",
    title: "Riwayat aktivitas",
    text: "Catatan saldo token, penahanan, penggunaan, dan pengembalian dapat ditelusuri."
  }
];

const steps = [
  {
    stage: "SEPAKAT",
    title: "Buat kesepakatan",
    text: "Buyer dan seller menentukan barang atau layanan, nominal, serta ketentuan transaksi."
  },
  {
    stage: "TAHAN",
    title: "Buyer menyediakan token",
    text: "Buyer menyediakan 2 token untuk biaya layanan website. Token ditahan saat pengajuan."
  },
  {
    stage: "PERIKSA",
    title: "Seller memberikan persetujuan",
    text: "Seller memeriksa pengajuan. Jika menolak atau buyer membatalkan sebelum persetujuan, token dikembalikan."
  },
  {
    stage: "PROSES",
    title: "Rekber terpilih menangani proses",
    text: "Rekber terpilih memakai layanan website ini agar kerjanya lebih praktis dan realtime: chat live, status 8 tahap yang diperbarui langsung, dan QR bisnis masing-masing untuk pembayaran manual."
  }
];

const packages = [
  { tokens: 1, price: "Rp5.000", note: "Paket Starter" },
  { tokens: 2, price: "Rp10.000", note: "Paket Reguler" },
  { tokens: 4, price: "Rp15.000", note: "Paket Hemat", featured: true }
];

/** Pratinjau leaderboard di beranda: 3 teratas dari penilaian nyata. */
async function LeaderboardPreview() {
  let rows: {
    admin_id: string;
    display_name: string;
    avg_stars: number;
    rating_count: number;
    completed_count: number;
  }[] = [];
  try {
    const db = await supabaseServer();
    const { data, error } = await db.rpc("get_rekber_leaderboard");
    if (!error && Array.isArray(data)) rows = data.slice(0, 3);
  } catch {
    rows = [];
  }

  return (
    <section className="lp-leaderboard" id="leaderboard">
      <div className="lp-section-heading">
        <div>
          <span className="lp-eyebrow">LEADERBOARD</span>
          <h2>Rekber terpilih,<br />dinilai dari transaksi nyata.</h2>
        </div>
        <p>
          Rekber terpilih adalah pengguna layanan website ini yang
          didaftarkan oleh pemilik platform. Peringkat dari bintang
          yang diberikan buyer dan seller setelah transaksi selesai.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="lp-leaderboard-empty">
          Belum ada penilaian. Leaderboard terisi setelah transaksi
          selesai dinilai — tanpa bintang placeholder.
        </p>
      ) : (
        <ol className="lp-leaderboard-list">
          {rows.map((row, index) => (
            <li key={row.admin_id}>
              <b>#{index + 1}</b>
              <span>{row.display_name.trim() || "Rekber terpilih"}</span>
              <strong>★ {Number(row.avg_stars).toFixed(2)}</strong>
              <small>
                {row.rating_count} penilaian · {row.completed_count}{" "}
                transaksi selesai
              </small>
            </li>
          ))}
        </ol>
      )}

      <Link href="/leaderboard" className="lp-leaderboard-link">
        Lihat leaderboard lengkap
      </Link>
    </section>
  );
}

export default function Home() {
  return (
    <main className="lp">
      <nav className="lp-nav">
        <Link href="/" className="lp-brand">
          <span className="lp-brand-mark">◈</span>
          REKBER<span>STORE</span>
        </Link>

        <div className="lp-nav-links">
          <a href="#fitur">Fitur</a>
          <a href="#cara-kerja">Cara Kerja</a>
          <a href="#leaderboard">Leaderboard</a>
          <a href="#biaya">Biaya</a>
          <a href="#faq">FAQ</a>
        </div>

        <div className="lp-nav-actions">
          <Link href="/login" className="lp-login">Masuk</Link>
          <Link href="/register" className="lp-nav-cta">Buat Akun</Link>
        </div>
      </nav>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <div className="lp-eyebrow">
            <i /> SECURE TRANSACTION WORKSPACE
          </div>

          <h1>
            Transaksi digital,
            <br />
            lebih terstruktur.
          </h1>

          <p>
            RekberSTORE membantu buyer, seller, dan admin mengelola
            kesepakatan transaksi dalam satu workspace dengan pencatatan
            biaya dan status yang lebih transparan.
          </p>

          <div className="lp-hero-actions">
            <Link href="/register" className="lp-button-primary">
              Mulai menggunakan Rekber
            </Link>
            <Link href="/login" className="lp-button-secondary">
              Masuk akun
            </Link>
          </div>

          <div className="lp-hero-note">
            <span>✓</span> Dana transaksi dan biaya layanan website dicatat terpisah
          </div>
        </div>

        <div className="lp-visual">
          <div className="lp-visual-top">
            <div>
              <span className="lp-window-dots">● ● ●</span>
              <b>REKBER WORKSPACE</b>
            </div>
            <span className="lp-demo-label">ATURAN TRANSAKSI</span>
          </div>

          <div className="lp-visual-heading">
            <small>ATURAN YANG BERLAKU UNTUK SETIAP TRANSAKSI</small>
            <h2>Buku aturan transaksi</h2>
            <p>Ketentuan yang dicatat di platform. Bukan janji hasil, bukan data transaksi.</p>
          </div>

          <div className="lp-ledger">
            <div className="lp-ledger-row">
              <small>BIAYA LAYANAN WEBSITE</small>
              <strong>2 token / transaksi</strong>
              <p>Ditanggung oleh buyer untuk setiap transaksi.</p>
            </div>

            <div className="lp-ledger-row">
              <small>PENAHANAN TOKEN</small>
              <strong>Sampai seller menyetujui</strong>
              <p>Ditolak, dibatalkan, atau kedaluwarsa: token kembali ke saldo buyer.</p>
            </div>

            <div className="lp-ledger-row attention">
              <small>DANA TRANSAKSI</small>
              <strong>Manual via QR bisnis</strong>
              <p>Dibayar buyer ke QR bisnis rekber penangan. QR bukan bukti pembayaran; status berubah hanya oleh konfirmasi rekber penangan.</p>
            </div>
          </div>

          <div className="lp-visual-footer">
            <span>◈ TRANSACTION MANAGEMENT</span>
            <span>REKBERSTORE</span>
          </div>
        </div>
      </section>

      <section className="lp-strip">
        <div><i>◈</i><span>Buyer &amp; Seller</span></div>
        <div><i>◈</i><span>Token Wallet</span></div>
        <div><i>◈</i><span>Admin Rekber</span></div>
        <div><i>◈</i><span>Transaction History</span></div>
      </section>

      <section className="lp-section" id="fitur">
        <div className="lp-section-heading">
          <div>
            <span className="lp-eyebrow">PLATFORM CAPABILITIES</span>
            <h2>Satu workspace untuk<br />mengelola transaksi.</h2>
          </div>
          <p>
            RekberSTORE berfokus pada pengelolaan kesepakatan,
            pencatatan biaya, dan alur transaksi buyer serta seller.
          </p>
        </div>

        <div className="lp-feature-grid">
          {features.map((feature) => (
            <article className="lp-feature-card" key={feature.title}>
              <div className="lp-feature-icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-workflow" id="cara-kerja">
        <div className="lp-section-heading">
          <div>
            <span className="lp-eyebrow">HOW IT WORKS</span>
            <h2>Alur transaksi<br />yang lebih jelas.</h2>
          </div>
          <p>
            Setiap transaksi mempunyai tahapan dan pencatatan.
            Buyer dan seller mengetahui biaya yang menjadi tanggung jawab masing-masing.
          </p>
        </div>

        <div className="lp-steps">
          {steps.map(step => (
            <article className="lp-step" key={step.stage}>
              <span>{step.stage}</span>
              <div className="lp-step-line" />
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <LeaderboardPreview />

      <section className="lp-fees" id="biaya">
        <div className="lp-fees-copy">
          <span className="lp-eyebrow">TOKEN WALLET</span>
          <h2>Biaya jelas.<br />Transaksi terencana.</h2>
          <p>
            Token adalah biaya layanan website: 2 token dari buyer untuk
            setiap transaksi. Dana transaksi terpisah dari token dan
            dibayar manual lewat QR bisnis rekber penangan — platform
            tidak memproses atau menampung dana.
          </p>

          <div className="lp-fee-rule">
            <span>BIAYA LAYANAN WEBSITE</span>
            <strong>2 Token <small>/ transaksi</small></strong>
            <p>Ditanggung oleh buyer.</p>
          </div>
        </div>

        <div className="lp-package-panel">
          <div className="lp-package-heading">
            <small>PAKET TOP UP</small>
            <span>REKBERSTORE TOKEN</span>
          </div>

          {packages.map(item => (
            <div className={"lp-package-row " + (item.featured ? "featured" : "")} key={item.tokens}>
              <div>
                <b>{item.tokens} Token</b>
                <small>{item.note}</small>
              </div>
              <strong>{item.price}</strong>
            </div>
          ))}

          <div className="lp-package-note">
            <span>!</span>
            <p>
              Pembelian token lewat payment link Pakasir saat gateway
              dikonfigurasi. Dana transaksi selalu manual lewat QR bisnis
              rekber penangan.
            </p>
          </div>

          <Link href="/register" className="lp-package-cta">
            Buat akun RekberSTORE
          </Link>
        </div>
      </section>

      <section className="lp-faq" id="faq">
        <div className="lp-section-heading">
          <div>
            <span className="lp-eyebrow">HELP CENTER</span>
            <h2>Pertanyaan<br />yang sering diajukan.</h2>
          </div>
          <p>
            Informasi dasar mengenai sistem token, biaya layanan,
            dan mekanisme transaksi RekberSTORE.
          </p>
        </div>

        <div className="lp-faq-list">
          <details>
            <summary>Berapa biaya layanan website?</summary>
            <p>Buyer menyediakan 2 token untuk biaya layanan website pada setiap transaksi. Token adalah biaya jasa website, bukan biaya jasa rekber; dana transaksi terpisah dan dibayar manual lewat QR bisnis rekber penangan.</p>
          </details>
          <details>
            <summary>Bagaimana dana transaksi dibayar?</summary>
            <p>Manual. Buyer memindai QR bisnis milik rekber yang menangani transaksi itu, lalu rekber memverifikasi penerimaan di aplikasi QRIS/banknya sendiri sebelum mengonfirmasi tahap penahanan. Gambar QR bukan bukti pembayaran.</p>
          </details>
          <details>
            <summary>Bagaimana jika seller menolak transaksi?</summary>
            <p>Dua token buyer dikembalikan jika seller menolak sebelum transaksi disetujui.</p>
          </details>
          <details>
            <summary>Bagaimana cara top up token?</summary>
            <p>Pembelian token diproses lewat payment link Pakasir. Bila gateway belum dikonfigurasi, pesanan tercatat menunggu pembayaran dan saldo tidak bertambah.</p>
          </details>
          <details>
            <summary>Apakah RekberSTORE memproses pembayaran transaksi?</summary>
            <p>Tidak. RekberSTORE adalah layanan website untuk rekber terpilih — chat live, status live, dan pencatatan — agar kerja rekber lebih praktis dan realtime. Dana transaksi dibayar manual lewat QR bisnis rekber penangan; platform tidak memproses atau menampung dana, dan tidak mempekerjakan para rekber.</p>
          </details>
        </div>
      </section>

      <section className="lp-final-cta">
        <span className="lp-eyebrow">REKBERSTORE PLATFORM</span>
        <h2>Mulai dengan kesepakatan<br />yang lebih terstruktur.</h2>
        <p>Buat akun dan kenali workspace RekberSTORE.</p>
        <Link href="/register" className="lp-button-primary">
          Daftar RekberSTORE
        </Link>
      </section>

      <footer className="lp-footer">
        <Link href="/" className="lp-brand">
          <span className="lp-brand-mark">◈</span>
          REKBER<span>STORE</span>
        </Link>
        <p>Secure Transaction Workspace</p>
        <div>
          <Link href="/login">Masuk</Link>
          <Link href="/register">Daftar</Link>
        </div>
        <small>© 2026 RekberSTORE. Informasi fitur mengikuti status implementasi platform.</small>
      </footer>
    </main>
  );
}