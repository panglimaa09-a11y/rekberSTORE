import Link from "next/link";
import { updatePassword } from "@/app/actions";
import { supabaseServer } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";

const errorCopy: Record<string, string> = {
  invalid: "Password minimal 8 karakter.",
  mismatch: "Konfirmasi password tidak cocok.",
  session:
    "Sesi pemulihan tidak ditemukan. Link mungkin sudah kedaluwarsa atau sudah dipakai. Minta link reset baru.",
  update: "Password gagal diubah. Coba lagi.",
};

export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const p = await searchParams;
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  return (
    <main className="auth">
      <section className="authbox">
        <Link className="brand" href="/">
          ◈ Rekber<span>STORE</span>
        </Link>
        <small className="eyebrow">RESET PASSWORD</small>
        <h1>Buat password baru</h1>

        {!user && (
          <>
            <div className="alert">
              Sesi pemulihan tidak ditemukan. Buka link reset dari email
              Anda, atau minta link baru bila link sudah kedaluwarsa.
            </div>
            <p>
              <Link href="/forgot-password">Minta link reset baru</Link>
            </p>
          </>
        )}

        {user && (
          <>
            <p>Password baru untuk akun {user.email ?? "Anda"}.</p>
            {p.error && errorCopy[p.error] && (
              <div className="alert">{errorCopy[p.error]}</div>
            )}
            <form action={updatePassword}>
              <label>
                Password baru
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </label>
              <label>
                Konfirmasi password baru
                <input
                  name="confirm"
                  type="password"
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </label>
              <SubmitButton className="btn full" pendingLabel="Menyimpan…">
                Ubah password
              </SubmitButton>
            </form>
          </>
        )}

        <small>
          <Link href="/login">Kembali masuk</Link>
        </small>
      </section>
    </main>
  );
}
