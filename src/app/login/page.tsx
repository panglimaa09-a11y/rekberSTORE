import Link from "next/link";
import { login, loginWithGoogle } from "@/app/actions";
import SubmitButton from "@/components/SubmitButton";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const p = await searchParams;
  return (
    <main className="auth">
      <section className="authbox">
        <Link className="brand" href="/">
          ◈ Rekber<span>STORE</span>
        </Link>
        <small className="eyebrow">WELCOME BACK</small>
        <h1>Masuk ke akun</h1>
        <p>Lanjutkan aktivitas transaksi RekberSTORE.</p>
        {p.notice === "reset" && (
          <div className="success">
            Password berhasil diubah. Masuk dengan password baru.
          </div>
        )}
        {p.error === "unconfirmed" && (
          <div className="alert">
            Email belum terkonfirmasi. Cek inbox dan klik link verifikasi,
            lalu coba lagi.
          </div>
        )}
        {p.error === "failed" && (
          <div className="alert">
            Login gagal dari sisi server. Coba lagi sebentar lagi.
          </div>
        )}
        {p.error === "invalid" && (
          <div className="alert">Email atau password tidak valid.</div>
        )}
        {p.error === "oauth_unavailable" && (
          <div className="alert">
            Login Google belum diaktifkan. Masuk dengan email dan password,
            atau hubungi admin.
          </div>
        )}
        {p.error === "oauth_failed" && (
          <div className="alert">
            Login Google gagal. Coba lagi sebentar lagi.
          </div>
        )}
        <form action={login}>
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete="current-password"
            />
          </label>
          <SubmitButton className="btn full" pendingLabel="Memproses…">
            Masuk
          </SubmitButton>
        </form>
        <div className="auth-or">
          <span>atau</span>
        </div>
        <form action={loginWithGoogle}>
          <input type="hidden" name="source" value="login" />
          <SubmitButton
            className="btn full secondary"
            pendingLabel="Membuka Google…"
          >
            Lanjutkan dengan Google
          </SubmitButton>
        </form>
        <small>
          Belum punya akun? <Link href="/register">Daftar sekarang</Link>
        </small>
        <small>
          <Link href="/forgot-password">Lupa password?</Link>
        </small>
      </section>
    </main>
  );
}
