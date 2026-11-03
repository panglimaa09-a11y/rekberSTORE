import { Suspense } from "react";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import { getActionNotificationCount } from "@/lib/notifications";
import DashboardNav from "./nav";

/**
 * Shell bersama seluruh halaman /dashboard/*.
 * Sidebar dan tautan navigasi didefinisikan di satu tempat agar
 * konsisten di semua halaman; halaman hanya mengisi konten.
 * Guard sesi tetap di middleware (tidak diubah di sini).
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
  let isStaff = false;
  let notificationCount = 0;
  try {
    const db = await supabaseServer();
    const { data: aal, error } =
      await db.auth.mfa.getAuthenticatorAssuranceLevel();
    needsChallenge =
      !error &&
      !!aal &&
      aal.nextLevel === "aal2" &&
      aal.currentLevel !== "aal2";
    const { data: { user } } = await db.auth.getUser();
    if (user) {
      const roles = await getMyRoles(db, user.id);
      isStaff = roles.isStaff;
      try {
        notificationCount = await getActionNotificationCount(db, user.id, roles);
      } catch {
        notificationCount = 0;
      }
    }
  } catch {
    needsChallenge = false;
  }
  if (needsChallenge) redirect("/mfa-challenge");

  return (
    <main className="dash app-bg">
      <aside className="side">
        <Suspense fallback={null}>
          <DashboardNav
            isStaff={isStaff}
            notificationCount={notificationCount}
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
