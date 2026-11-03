import Image from "next/image";
import Link from "next/link";
import { register, loginWithGoogle } from "@/app/actions";
import SubmitButton from "@/components/SubmitButton";
import TurnstileWidget from "@/components/TurnstileWidget";

export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const p = await searchParams;
  // Dibaca di server saat render (bukan inline saat build): bila env
  // belum diisi, widget tidak tampil dan form tetap berfungsi normal.
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  return (
    <main className="auth">
      <section className="authbox">
        <Link className="brand" href="/" aria-label="RekberStore — Beranda">
          <Image
            className="brand-logo-horizontal"
            src="/brand/rekberstore-logo-horizontal.png"
            alt="RekberStore"
            width="2048"
            height="682"
          />
        </Link>
        <small className="eyebrow">CREATE ACCOUNT</small>
        <h1>Buat akun</h1>
        <p>Satu akun dapat berperan sebagai buyer maupun seller.</p>
        {p.error === "oauth_unavailable" && (
          <div className="alert">
            Login Google belum diaktifkan. Daftar dengan email dan password,
            atau hubungi admin.
          </div>
        )}
        {p.error === "oauth_failed" && (
          <div className="alert">
            Login Google gagal. Coba lagi sebentar lagi.
          </div>
        )}
        {p.error &&
          p.error !== "oauth_unavailable" &&
          p.error !== "oauth_failed" && (
            <div className="alert">
              Pendaftaran gagal. Periksa data dan coba lagi.
            </div>
          )}
        {p.success && (
          <div className="success">
            Pendaftaran diterima. Periksa email untuk verifikasi.
          </div>
        )}
        <form action={register}>
          <label>
            Nama tampilan
            <input name="name" required minLength={2} />
          </label>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" minLength={8} required />
          </label>
          {turnstileSiteKey && <TurnstileWidget siteKey={turnstileSiteKey} />}
          <SubmitButton className="btn full" pendingLabel="Memproses…">
            Buat akun
          </SubmitButton>
        </form>
        <div className="auth-or">
          <span>atau</span>
        </div>
        <form action={loginWithGoogle}>
          <input type="hidden" name="source" value="register" />
          <SubmitButton
            className="btn full secondary"
            pendingLabel="Membuka Google…"
          >
            Lanjutkan dengan Google
          </SubmitButton>
        </form>
        <small>
          Sudah punya akun? <Link href="/login">Masuk</Link>
        </small>
      </section>
    </main>
  );
}
