import { redirect } from "next/navigation";
import { logout } from "@/app/actions";
import { supabaseServer } from "@/lib/supabase/server";
import ShellHeader from "@/components/ShellHeader";

/**
 * Shell bersama seluruh halaman /dashboard/*.
 * Navigasi antar-fitur hanya lewat hub menu (/dashboard); header
 * ramping di atas membawa brand, tautan kembali ke menu, dan form
 * keluar. Guard sesi tetap di middleware (tidak diubah di sini).
 *
 * Penegakan 2FA (lapis kedua; lapis pertama ada di action login):
 * bila sesi masih aal1 padahal user punya faktor terverifikasi
 * (nextLevel aal2), alihkan ke /mfa-challenge. Pemeriksaan yang
 * gagal TIDAK PERNAH mengunci user keluar — gagal berarti lanjut
 * seperti biasa. Halaman /mfa-challenge sendiri berada di luar
 * layout ini, jadi tidak ada loop redirect.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let needsChallenge = false;
  try {
    const db = await supabaseServer();
    const { data: aal, error } =
      await db.auth.mfa.getAuthenticatorAssuranceLevel();
    needsChallenge =
      !error &&
      !!aal &&
      aal.nextLevel === "aal2" &&
      aal.currentLevel !== "aal2";
  } catch {
    needsChallenge = false;
  }
  if (needsChallenge) redirect("/mfa-challenge");

  return (
    <main className="dash app-bg">
      <ShellHeader
        brandHref="/"
        brandLabel="RekberStore — Beranda"
        menuHref="/dashboard"
        logoutForm={
          <form action={logout}>
            <button className="logout" type="submit">
              Keluar dari akun
            </button>
          </form>
        }
      />
      {children}
    </main>
  );
}
