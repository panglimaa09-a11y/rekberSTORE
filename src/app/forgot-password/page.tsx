import Image from "next/image";
import Link from "next/link";
import { requestPasswordReset } from "@/app/actions";
import SubmitButton from "@/components/SubmitButton";
import TurnstileWidget from "@/components/TurnstileWidget";

export default async function ForgotPassword({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
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
        <small className="eyebrow">RESET PASSWORD</small>
        <h1>Lupa password?</h1>
        <p>
          Masukkan email akun Anda. Link reset password akan dikirim ke
          email tersebut.
        </p>
        {p.sent === "1" && (
          <div className="success">
            Jika email terdaftar, link reset password sudah dikirim.
            Periksa inbox dan folder spam.
          </div>
        )}
        {p.error === "invalid" && (
          <div className="alert">Masukkan alamat email yang valid.</div>
        )}
        {p.error === "failed" && (
          <div className="alert">
            Link reset gagal dikirim. Coba lagi sebentar lagi.
          </div>
        )}
        <form action={requestPasswordReset}>
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          {turnstileSiteKey && <TurnstileWidget siteKey={turnstileSiteKey} />}
          <SubmitButton className="btn full" pendingLabel="Mengirim…">
            Kirim link reset
          </SubmitButton>
        </form>
        <p>
          Link reset memiliki masa berlaku. Jika sudah kedaluwarsa, minta
          link baru lewat halaman ini.
        </p>
        <small>
          Ingat password Anda? <Link href="/login">Masuk</Link>
        </small>
      </section>
    </main>
  );
}
