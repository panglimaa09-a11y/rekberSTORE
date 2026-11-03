import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { logout } from "@/app/actions";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import AdminDenied from "@/components/AdminDenied";
import OwnerNav from "@/components/OwnerNav";

/**
 * Shell SENDIRI panel pemilik (/pemilik/*), terpisah dari shell
 * dashboard user dan shell panel admin. Navigasi dan guard-nya
 * milik area ini: tanpa sesi, middleware mengarahkan ke /login;
 * bukan super_admin, halaman penolakan ditampilkan tanpa menu
 * pemilik. Penegakan akhir tetap di RPC security definer (guard
 * super_admin di dalam fungsi), bukan hanya di UI.
 *
 * Penegakan 2FA sama seperti shell dashboard/admin: bila sesi masih
 * aal1 padahal user punya faktor terverifikasi (nextLevel aal2),
 * alihkan ke /mfa-challenge. Pemeriksaan yang gagal TIDAK PERNAH
 * mengunci user keluar — gagal berarti lanjut seperti biasa.
 * Halaman /mfa-challenge sendiri berada di luar layout ini, jadi
 * tidak ada loop redirect.
 */
export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let needsChallenge = false;
  let isSuperAdmin = false;
  try {
    const db = await supabaseServer();
    const { data: aal, error } =
      await db.auth.mfa.getAuthenticatorAssuranceLevel();
    needsChallenge =
      !error &&
      !!aal &&
      aal.nextLevel === "aal2" &&
      aal.currentLevel !== "aal2";
    const {
      data: { user },
    } = await db.auth.getUser();
    if (user) {
      const roles = await getMyRoles(db, user.id);
      isSuperAdmin = roles.isSuperAdmin;
    }
  } catch {
    needsChallenge = false;
  }
  if (needsChallenge) redirect("/mfa-challenge");

  if (!isSuperAdmin) {
    return (
      <main className="dashmain app-bg">
        <p>
          <Link href="/dashboard">Kembali ke dashboard</Link>
        </p>
        <AdminDenied variant="pemilik" />
      </main>
    );
  }

  return (
    <main className="dash app-bg admin-shell">
      <aside className="side">
        <Suspense fallback={null}>
          <OwnerNav
            logoutForm={
              <form action={logout}>
                <button className="logout" type="submit">
                  Keluar dari akun
                </button>
              </form>
            }
          />
        </Suspense>
      </aside>
      {children}
    </main>
  );
}
