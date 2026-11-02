import Link from "next/link";
import { requestPasswordReset } from "@/app/actions";
import SubmitButton from "@/components/SubmitButton";

export default async function ForgotPassword({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const p = await searchParams;
  return (
    <main className="auth">
      <section className="authbox">
        <Link className="brand" href="/">
          ◈ Rekber<span>STORE</span>
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
