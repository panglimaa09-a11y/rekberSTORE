import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import {
  appointRekberAdmin,
  revokeRekberAdmin,
} from "@/app/admin-actions";
import AdminDenied from "@/components/AdminDenied";
import SubmitButton from "@/components/SubmitButton";
import SocialLinks from "@/components/SocialLinks";
import { loadAdminSocialUrls } from "@/lib/admin-review";

const notices: Record<string, string> = {
  appointed: "Admin terpilih berhasil didaftarkan.",
  appoint_invalid: "Email tidak valid.",
  appoint_not_found: "Tidak ada akun terdaftar dengan email itu.",
  appoint_error: "Penunjukan admin gagal. Coba lagi.",
  revoked: "Peran admin dicabut.",
  revoke_error: "Pencabutan peran admin gagal. Coba lagi.",
  stage_unavailable:
    "Fitur admin belum aktif — migrasi database belum dijalankan.",
  invalid: "Permintaan tidak valid.",
};

/**
 * Daftarkan admin terpilih + daftar staf (SUPER-ADMIN SAJA; dipindah
 * dari halaman panel admin lama). Hanya Tuan (super admin) yang
 * dapat mendaftarkan rekber terpilih. Tidak ada pendaftaran admin
 * publik.
 */
export default async function AdminAppointments({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isSuperAdmin) return <AdminDenied />;

  let staffList: {
    user_id: string;
    display_name: string;
    email: string;
    roles: string[];
    qr_status: string | null;
  }[] = [];
  try {
    const { data, error } = await db.rpc("list_rekber_admins");
    if (!error) staffList = data ?? [];
  } catch {
    staffList = [];
  }

  const socialMap = await loadAdminSocialUrls(
    db,
    staffList.map((s) => s.user_id)
  );

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">PANEL ADMIN · SUPER ADMIN</small>
          <h1>Daftarkan admin terpilih</h1>
          <p>
            Hanya Tuan (super admin) yang dapat mendaftarkan rekber
            terpilih. Masukkan email akun yang sudah terdaftar di
            platform. Tidak ada pendaftaran admin publik.
          </p>
        </div>
        <Link className="btn secondary" href="/admin">
          Kembali ke panel admin
        </Link>
      </header>

      {params.notice && notices[params.notice] && (
        <div className="success rekber-message">{notices[params.notice]}</div>
      )}

      <section className="panel">
        <h2>Form penunjukan</h2>
        <form action={appointRekberAdmin} className="admin-inline-form">
          <label>
            Email akun
            <input
              type="email"
              name="email"
              required
              maxLength={254}
              placeholder="email akun yang sudah terdaftar"
            />
          </label>
          <SubmitButton className="btn" pendingLabel="Mendaftarkan…">
            Daftarkan sebagai admin
          </SubmitButton>
        </form>

        <h2 className="admin-subhead">Admin terdaftar ({staffList.length})</h2>
        {staffList.length === 0 && (
          <p className="token-muted">
            Belum ada admin terdaftar. Jalankan langkah super admin
            bila akun Tuan sendiri belum menjadi super admin.
          </p>
        )}
        {staffList.length > 0 && (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Admin</th>
                  <th>Peran</th>
                  <th>Status QR bisnis</th>
                  <th>URL sosmed</th>
                  <th>Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((staff) => (
                  <tr key={staff.user_id}>
                    <td>
                      <b>{staff.display_name || "—"}</b>
                      <small>{staff.email}</small>
                    </td>
                    <td>{staff.roles.join(", ")}</td>
                    <td>{staff.qr_status ?? "Belum mengajukan"}</td>
                    <td>
                      <SocialLinks urls={socialMap?.get(staff.user_id)} />
                    </td>
                    <td>
                      {staff.roles.includes("admin") &&
                        staff.user_id !== user.id && (
                          <form action={revokeRekberAdmin}>
                            <input
                              type="hidden"
                              name="user_id"
                              value={staff.user_id}
                            />
                            <SubmitButton className="rekber-reject" pendingLabel="Mencabut…">
                              Cabut peran admin
                            </SubmitButton>
                          </form>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
