"use client";

import Link from "next/link";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="auth">
      <section className="authbox">
        <small className="eyebrow">TERJADI KESALAHAN</small>
        <h1>Halaman gagal dimuat</h1>
        <p>
          Periksa koneksi Supabase dan konfigurasi environment, lalu coba
          lagi. Bila masih gagal, kembali ke beranda.
        </p>
        <div className="alert">
          Jika halaman dashboard yang gagal, kemungkinan besar environment
          Supabase belum diisi atau migrasi database belum dijalankan.
        </div>
        <button className="btn full" type="button" onClick={() => reset()}>
          Coba lagi
        </button>
        <p>
          <Link href="/">Kembali ke beranda</Link>
        </p>
      </section>
    </main>
  );
}
