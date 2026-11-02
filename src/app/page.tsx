import Link from "next/link";

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
    text: "Pisahkan jasa Rekber dan biaya layanan website agar pembagian biaya jelas."
  },
  {
    icon: "▤",
    title: "Riwayat aktivitas",
    text: "Catatan saldo token, penahanan, penggunaan, dan pengembalian dapat ditelusuri."
  }
];

const steps = [
  {
    number: "01",
    title: "Buat kesepakatan",
    text: "Buyer dan seller menentukan barang atau layanan, nominal, serta ketentuan transaksi."
  },
  {
    number: "02",
    title: "Buyer menyediakan token",
    text: "Buyer menyediakan 2 token untuk biaya jasa Rekber. Token ditahan saat pengajuan."
  },
  {
    number: "03",
    title: "Seller memberikan persetujuan",
    text: "Seller memeriksa pengajuan. Jika menolak atau buyer membatalkan sebelum persetujuan, token dikembalikan."
  },
  {
    number: "04",
    title: "Admin menangani proses",
    text: "Transaksi mengikuti prosedur Rekber dan pencatatan status sesuai tahapan layanan."
  }
];

const packages = [
  { tokens: 1, price: "Rp5.000", note: "Paket Starter" },
  { tokens: 2, price: "Rp10.000", note: "Paket Reguler" },
  { tokens: 4, price: "Rp15.000", note: "Paket Hemat", featured: true }
];

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
          <a href="#biaya">Biaya</a>
          <a href="#faq">FAQ</a>
        </div>

        <div className="lp-nav-actions">
          <Link href="/login" className="lp-login">Masuk</Link>
          <Link href="/register" className="lp-nav-cta">Buat Akun <span>↗</span></Link>
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
            lebih <em>terstruktur.</em>
          </h1>

          <p>
            RekberSTORE membantu buyer, seller, dan admin mengelola
            kesepakatan transaksi dalam satu workspace dengan pencatatan
            biaya dan status yang lebih transparan.
          </p>

          <div className="lp-hero-actions">
            <Link href="/register" className="lp-button-primary">
              Mulai menggunakan Rekber <span>→</span>
            </Link>
            <Link href="/login" className="lp-button-secondary">
              Masuk akun
            </Link>
          </div>

          <div className="lp-hero-note">
            <span>✓</span> Biaya jasa dan biaya website dicatat terpisah
          </div>
        </div>

        <div className="lp-visual">
          <div className="lp-visual-top">
            <div>
              <span className="lp-window-dots">● ● ●</span>
              <b>REKBER WORKSPACE</b>
            </div>
            <span className="lp-demo-label">PRODUCT FLOW</span>
          </div>

          <div className="lp-visual-heading">
            <small>ILUSTRASI ALUR TRANSAKSI</small>
            <h2>Ruang transaksi bersama</h2>
            <p>Alur konseptual, bukan data transaksi aktual.</p>
          </div>

          <div className="lp-flow-list">
            <div className="lp-flow-item">
              <div className="lp-flow-number active">01</div>
              <div>
                <b>Kesepakatan dibuat</b>
                <small>Buyer dan seller menyusun detail transaksi</small>
              </div>
              <span className="lp-flow-check">✓</span>
            </div>

            <div className="lp-flow-item">
              <div className="lp-flow-number active">02</div>
              <div>
                <b>Token buyer ditahan</b>
                <small>2 token untuk jasa Rekber</small>
              </div>
              <span className="lp-flow-check">✓</span>
            </div>

            <div className="lp-flow-item">
              <div className="lp-flow-number">03</div>
              <div>
                <b>Persetujuan seller</b>
                <small>Pengajuan diperiksa oleh seller</small>
              </div>
              <span className="lp-flow-pending">PENDING</span>
            </div>

            <div className="lp-flow-item">
              <div className="lp-flow-number">04</div>
              <div>
                <b>Penanganan Rekber</b>
                <small>Proses sesuai tahapan layanan</small>
              </div>
              <span className="lp-flow-lock">◈</span>
            </div>
          </div>

          <div className="lp-visual-footer">
            <span>◈ TRANSACTION MANAGEMENT</span>
            <span>REKBERSTORE</span>
          </div>
        </div>
      </section>

      <section className="lp-strip">
        <div><b>01</b><span>Buyer & Seller</span></div>
        <div><b>02</b><span>Token Wallet</span></div>
        <div><b>03</b><span>Admin Rekber</span></div>
        <div><b>04</b><span>Transaction History</span></div>
      </section>

      <section className="lp-section" id="fitur">
        <div className="lp-section-heading">
          <div>
            <span className="lp-eyebrow">PLATFORM CAPABILITIES</span>
            <h2>Satu workspace untuk<br /><em>mengelola transaksi.</em></h2>
          </div>
          <p>
            RekberSTORE berfokus pada pengelolaan kesepakatan,
            pencatatan biaya, dan alur transaksi buyer serta seller.
          </p>
        </div>

        <div className="lp-feature-grid">
          {features.map((feature, index) => (
            <article className="lp-feature-card" key={feature.title}>
              <div className="lp-feature-icon">{feature.icon}</div>
              <small>0{index + 1} / PLATFORM</small>
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
            <h2>Alur transaksi<br /><em>yang lebih jelas.</em></h2>
          </div>
          <p>
            Setiap transaksi mempunyai tahapan dan pencatatan.
            Buyer dan seller mengetahui biaya yang menjadi tanggung jawab masing-masing.
          </p>
        </div>

        <div className="lp-steps">
          {steps.map(step => (
            <article className="lp-step" key={step.number}>
              <span>{step.number}</span>
              <div className="lp-step-line" />
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-fees" id="biaya">
        <div className="lp-fees-copy">
          <span className="lp-eyebrow">TOKEN WALLET</span>
          <h2>Biaya jelas.<br /><em>Transaksi terencana.</em></h2>
          <p>
            Jasa Rekber dikenakan 2 token dari buyer untuk setiap transaksi.
            Biaya layanan website merupakan komponen terpisah dan disepakati
            oleh buyer serta seller.
          </p>

          <div className="lp-fee-rule">
            <span>JASA REKBER</span>
            <strong>2 Token <small>/ transaksi</small></strong>
            <p>Ditanggung oleh buyer.</p>
          </div>

          <div className="lp-fee-rule">
            <span>BIAYA WEBSITE</span>
            <strong>Sesuai kesepakatan</strong>
            <p>Buyer, seller, atau dibagi dua.</p>
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
              Top up dan pembayaran gateway belum aktif. Harga di atas
              merupakan daftar paket yang direncanakan.
            </p>
          </div>

          <Link href="/register" className="lp-package-cta">
            Buat akun RekberSTORE <span>→</span>
          </Link>
        </div>
      </section>

      <section className="lp-faq" id="faq">
        <div className="lp-section-heading">
          <div>
            <span className="lp-eyebrow">HELP CENTER</span>
            <h2>Pertanyaan<br /><em>yang sering diajukan.</em></h2>
          </div>
          <p>
            Informasi dasar mengenai sistem token, biaya layanan,
            dan mekanisme transaksi RekberSTORE.
          </p>
        </div>

        <div className="lp-faq-list">
          <details>
            <summary>Berapa biaya jasa Rekber?</summary>
            <p>Buyer menyediakan 2 token untuk jasa Rekber pada setiap transaksi.</p>
          </details>
          <details>
            <summary>Siapa yang membayar biaya layanan website?</summary>
            <p>Buyer dan seller dapat menyepakati bahwa biaya website ditanggung buyer, seller, atau dibagi dua. Biaya ini terpisah dari jasa Rekber.</p>
          </details>
          <details>
            <summary>Bagaimana jika seller menolak transaksi?</summary>
            <p>Dalam rancangan Reserve, dua token buyer dikembalikan jika seller menolak sebelum transaksi disetujui.</p>
          </details>
          <details>
            <summary>Bagaimana cara top up token?</summary>
            <p>Paket token direncanakan menggunakan Midtrans atau Pakasir. Integrasi pembayaran masih belum aktif.</p>
          </details>
          <details>
            <summary>Apakah RekberSTORE sudah memproses pembayaran transaksi?</summary>
            <p>Belum. Fitur pembayaran dan penampungan dana transaksi belum aktif. Jangan mengirim dana dengan menganggap platform sudah memprosesnya.</p>
          </details>
        </div>
      </section>

      <section className="lp-final-cta">
        <span className="lp-eyebrow">REKBERSTORE PLATFORM</span>
        <h2>Mulai dengan kesepakatan<br /><em>yang lebih terstruktur.</em></h2>
        <p>Buat akun dan kenali workspace RekberSTORE.</p>
        <Link href="/register" className="lp-button-primary">
          Daftar RekberSTORE <span>→</span>
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