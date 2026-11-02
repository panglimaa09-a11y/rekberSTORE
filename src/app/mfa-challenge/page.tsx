import Link from "next/link";
import { redirect } from "next/navigation";
import { logout, verifyMfaChallenge } from "@/app/actions";
import { supabaseServer } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";

export default async function MfaChallenge({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const p = await searchParams;
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  // Bila sesi sudah aal2 (mis. halaman dibuka ulang setelah verifikasi),
  // tidak ada lagi yang perlu ditantang.
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/dashboard");

  const { data: factors } = await db.auth.mfa.listFactors();
  const hasVerified = (factors?.all ?? []).some(
    (f) => f.factor_type === "totp" && f.status === "verified"
  );
  if (!hasVerified) redirect("/dashboard");

  return (
    <main className="auth">
      <section className="authbox">
        <Link className="brand" href="/">
          ◈ Rekber<span>STORE</span>
        </Link>
        <small className="eyebrow">VERIFIKASI DUA LANGKAH</small>
        <h1>Masukkan kode 2FA</h1>
        <p>
          Akun ini memakai verifikasi dua langkah. Masukkan kode 6 digit
          dari aplikasi authenticator Anda.
        </p>
        {p.error === "invalid" && (
          <div className="alert">
            Kode salah atau sudah kedaluwarsa. Periksa aplikasi
            authenticator dan coba lagi.
          </div>
        )}
        {p.error === "failed" && (
          <div className="alert">
            Verifikasi gagal dari sisi server. Coba lagi sebentar lagi.
          </div>
        )}
        <form action={verifyMfaChallenge}>
          <label>
            Kode 6 digit
            <input
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
            />
          </label>
          <SubmitButton className="btn full" pendingLabel="Memverifikasi…">
            Verifikasi
          </SubmitButton>
        </form>
        <p>
          Aplikasi authenticator hilang? Hubungi admin untuk menonaktifkan
          2FA, atau keluar dulu dari akun ini.
        </p>
        <form action={logout}>
          <SubmitButton className="btn full secondary" pendingLabel="Keluar…">
            Keluar dari akun
          </SubmitButton>
        </form>
        <small>
          <Link href="/">Kembali ke beranda</Link>
        </small>
      </section>
    </main>
  );
}
