import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { logout } from "@/app/actions";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import AdminDenied from "@/components/AdminDenied";
import AdminNav from "@/components/AdminNav";

/**
 * Shell SENDIRI area admin (/admin/*), terpisah dari shell dashboard
 * user. Navigasi dan guard-nya milik area ini: tanpa sesi, middleware
 * mengarahkan ke /login; bukan staf, halaman penolakan ditampilkan
 * tanpa menu admin.
 *
 * Penegakan 2FA sama seperti shell dashboard: bila sesi masih aal1
 * padahal user punya faktor terverifikasi (nextLevel aal2), alihkan
 * ke /mfa-challenge. Pemeriksaan yang gagal TIDAK PERNAH mengunci
 * user keluar — gagal berarti lanjut seperti biasa.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let needsChallenge = false;
  let isStaff = false;
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
      isStaff = roles.isStaff;
      isSuperAdmin = roles.isSuperAdmin;
    }
  } catch {
    needsChallenge = false;
  }
  if (needsChallenge) redirect("/mfa-challenge");

  if (!isStaff) {
    return (
      <main className="dashmain app-bg">
        <p>
          <Link href="/dashboard">Kembali ke dashboard</Link>
        </p>
        <AdminDenied />
      </main>
    );
  }

  return (
    <main className="dash app-bg admin-shell">
      <aside className="side">
        <Suspense fallback={null}>
          <AdminNav
            isSuperAdmin={isSuperAdmin}
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
