import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — RekberSTORE",
  description:
    "Kebijakan privasi RekberSTORE: data yang dikumpulkan, tujuan penggunaan, pembagian data, keamanan, dan hak pengguna.",
};

export default function PrivacyPolicy() {
  return (
    <main className="lp">
      <nav className="lp-nav">
        <Link href="/" className="lp-brand" aria-label="RekberStore — Beranda">
          <Image
            className="brand-logo-horizontal"
            src="/brand/rekberstore-logo-horizontal.png"
            alt="RekberStore"
            width="2048"
            height="682"
          />
        </Link>

        <div className="lp-nav-links">
          <Link href="/" className="lp-nav-home">Beranda</Link>
        </div>

        <div className="lp-nav-actions">
          <Link href="/login" className="lp-login">Masuk</Link>
          <Link href="/register" className="lp-nav-cta">Daftar Gratis</Link>
        </div>
      </nav>

      <section className="lp-legal">
        <span className="lp-eyebrow">KEBIJAKAN PRIVASI</span>
        <h1>Kebijakan Privasi</h1>
        <p className="lp-legal-updated">
          Terakhir diperbarui: 4 November 2026
        </p>

        <p>
          RekberSTORE adalah layanan website rekening bersama untuk
          transaksi online. Platform ini membantu buyer, seller, dan
          rekber terpilih mengelola kesepakatan, komunikasi, dan
          pencatatan transaksi dalam satu workspace. Kebijakan ini
          menjelaskan data apa yang kami kumpulkan, untuk apa data itu
          dipakai, kepada siapa data dibagikan, bagaimana data
          dilindungi, dan hak apa yang Anda miliki atas data Anda.
        </p>

        <h2>Data yang kami kumpulkan</h2>
        <ul>
          <li>
            <strong>Data akun:</strong> alamat email, nama tampilan,
            nomor telepon bila Anda isi, dan foto profil bila Anda
            unggah.
          </li>
          <li>
            <strong>Masuk dengan Google:</strong> bila Anda memilih
            masuk dengan Google, kami menerima alamat email, nama, dan
            foto profil dari akun Google Anda. Kami tidak menerima kata
            sandi akun Google Anda.
          </li>
          <li>
            <strong>Data transaksi:</strong> judul dan deskripsi
            transaksi, nominal, status dan tahapan, pesan di chat
            transaksi, serta penilaian bintang yang Anda berikan.
          </li>
          <li>
            <strong>Data verifikasi identitas (KYC):</strong> dokumen
            identitas (KTP, SIM, atau paspor) dan swafoto yang Anda
            unggah untuk verifikasi.
          </li>
          <li>
            <strong>Data lokasi:</strong> bila Anda membagikan lokasi di
            chat transaksi, kami menyimpan satu titik lokasi yang Anda
            kirim saat itu. Kami tidak melacak lokasi Anda secara
            terus-menerus.
          </li>
          <li>
            <strong>Data admin:</strong> untuk admin, gambar QR bisnis,
            bukti kepemilikan QR, URL media sosial asli, serta provinsi
            dan kel/kecamatan.
          </li>
          <li>
            <strong>Data listing:</strong> judul, deskripsi, kategori,
            dan gambar yang Anda unggah pada penawaran Anda.
          </li>
          <li>
            <strong>Data token dan top up:</strong> jumlah token, riwayat
            token, dan status pesanan top up. Pembayaran top up diproses
            oleh penyedia pembayaran Pakasir melalui tautan pembayaran,
            sedangkan dana transaksi dibayar manual lewat QR bisnis
            rekber penangan. RekberSTORE tidak menerima atau menyimpan
            nomor kartu, nomor rekening, atau kredensial pembayaran
            Anda.
          </li>
        </ul>

        <h2>Tujuan penggunaan data</h2>
        <ul>
          <li>Menjalankan akun dan layanan Anda.</li>
          <li>Memfasilitasi, mencatat, dan mengamankan transaksi.</li>
          <li>Memverifikasi identitas pengguna dan admin.</li>
          <li>Menampilkan nama dan penilaian admin di leaderboard.</li>
          <li>Mencegah penipuan dan menyelesaikan sengketa.</li>
          <li>
            Menampilkan pemberitahuan tentang transaksi dan akun Anda di
            dalam platform.
          </li>
        </ul>

        <h2>Pembagian data</h2>
        <ul>
          <li>
            Dokumen verifikasi identitas dan lokasi yang dibagikan di
            chat hanya dapat dilihat oleh admin penangan transaksi dan
            super admin. Lawan transaksi tidak pernah melihat dokumen
            asli Anda.
          </li>
          <li>
            Detail transaksi dan pesan chat terlihat oleh buyer, seller,
            admin penangan, dan super admin.
          </li>
          <li>
            Nama tampilan dan penilaian admin tampil secara publik di
            leaderboard.
          </li>
          <li>
            Pengumuman status transaksi di saluran WhatsApp hanya berisi
            status tersamar, tanpa nama, dokumen verifikasi, atau
            lokasi.
          </li>
          <li>Kami tidak menjual data pribadi Anda.</li>
          <li>
            Pemroses yang kami gunakan: Supabase (basis data dan
            autentikasi), Vercel (hosting aplikasi), Google (hanya bila
            Anda masuk dengan Google), dan Pakasir (hanya untuk
            pembayaran top up token).
          </li>
          <li>
            Sesi masuk memakai cookie di perangkat Anda. Kami tidak
            memakai pelacak iklan.
          </li>
        </ul>

        <h2>Keamanan</h2>
        <p>
          Koneksi ke platform memakai enkripsi HTTPS, dan akses basis
          data dibatasi aturan akses per peran. Dokumen privat hanya
          dibuka lewat tautan bertanda tangan berumur pendek dan
          penampil ber-watermark, dan setiap akses dicatat di log
          audit. Namun tidak ada sistem yang dapat mencegah tangkapan
          layar sepenuhnya: perlindungan dokumen mengandalkan
          pembatasan akses, watermark, dan pencatatan audit.
        </p>

        <h2>Penyimpanan dan hak Anda</h2>
        <p>
          Data disimpan selama akun Anda aktif dan selama diperlukan
          untuk menyelesaikan transaksi atau sengketa yang masih
          berjalan. Anda dapat meminta perbaikan atau penghapusan data
          Anda melalui kontak di bawah. Catatan transaksi yang sudah
          selesai dapat dipertahankan untuk keperluan pencatatan.
        </p>

        <h2>Batas usia</h2>
        <p>
          Layanan ini ditujukan untuk pengguna dewasa yang dapat
          melakukan transaksi sendiri.
        </p>

        <h2>Perubahan kebijakan</h2>
        <p>
          Kebijakan ini dapat diperbarui sewaktu-waktu. Tanggal di atas
          menunjukkan versi terakhir. Penggunaan platform secara
          berkelanjutan setelah perubahan berarti Anda menyetujui versi
          terbaru.
        </p>

        <h2>Kontak</h2>
        <p>
          Untuk pertanyaan, permintaan perbaikan, atau permintaan
          penghapusan data, hubungi pengelola RekberSTORE melalui
          WhatsApp:{" "}
          <a
            href="https://wa.me/6282231110994"
            target="_blank"
            rel="noopener"
          >
            082231110994
          </a>
          .
        </p>
      </section>

      <footer className="lp-footer">
        <Link href="/" className="lp-brand" aria-label="RekberStore — Beranda">
          <Image
            className="brand-logo-horizontal"
            src="/brand/rekberstore-logo-horizontal.png"
            alt="RekberStore"
            width="2048"
            height="682"
          />
        </Link>
        <p>Secure Transaction Workspace</p>
        <div>
          <Link href="/login">Masuk</Link>
          <Link href="/register">Daftar</Link>
          <Link href="/kebijakan-privasi">Kebijakan Privasi</Link>
        </div>
        <small>© 2026 RekberSTORE. Informasi fitur mengikuti status implementasi platform.</small>
      </footer>
    </main>
  );
}
