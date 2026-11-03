import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import {
  appointRekberAdmin,
  reviewQrProfile,
  revokeRekberAdmin,
} from "@/app/admin-actions";
import AdminDenied from "@/components/AdminDenied";
import SubmitButton from "@/components/SubmitButton";
import SocialLinks from "@/components/SocialLinks";
import {
  dateLabel,
  displayNameFor,
  loadDisplayNames,
} from "@/lib/admin-view";
import {
  loadAdminSocialUrls,
  loadQrReviewQueue,
} from "@/lib/admin-review";

const notices: Record<string, string> = {
  appointed: "Admin terpilih berhasil didaftarkan.",
  appoint_invalid: "Email tidak valid.",
  appoint_not_found: "Tidak ada akun terdaftar dengan email itu.",
  appoint_error: "Penunjukan admin gagal. Coba lagi.",
  revoked: "Peran admin dicabut.",
  revoke_error: "Pencabutan peran admin gagal. Coba lagi.",
  qr_reviewed: "Profil QR bisnis sudah ditinjau.",
  review_invalid: "Putusan atau catatan tinjauan tidak valid.",
  review_error: "Tinjauan gagal diproses. Coba lagi.",
  stage_unavailable:
    "Fitur admin belum aktif — migrasi database belum dijalankan.",
  invalid: "Permintaan tidak valid.",
};

/**
 * Kelola admin (SUPER-ADMIN SAJA): penunjukan/pencabutan admin
 * terpilih + antrean tinjauan QR bisnis + URL sosmed admin. Memakai
 * ulang server action dan pemuat antrean yang sama dengan halaman
 * /admin — tidak ada logika duplikat di sini. Formulir mengirim
 * return_to agar aksi kembali ke halaman ini, bukan ke /admin.
 *
 * Admin tidak memakai KYC dokumen; URL sosmed asli ditampilkan
 * read-only di tabel staf agar Tuan dapat memeriksanya.
 */
export default async function OwnerManageAdmins({
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
  if (!roles.isSuperAdmin) return <AdminDenied variant="pemilik" />;

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

  const qrQueue = await loadQrReviewQueue(db);
  const socialMap = await loadAdminSocialUrls(
    db,
    staffList.map((s) => s.user_id)
  );

  const nameMap = await loadDisplayNames(
    db,
    qrQueue.map((q) => q.admin_user_id)
  );
  const displayName = (uid: string | null | undefined) =>
    displayNameFor(nameMap, user.id, uid);

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">PANEL PEMILIK · SUPER ADMIN</small>
          <h1>Kelola admin</h1>
          <p>
            Hanya Tuan (super admin) yang dapat mendaftarkan rekber
            terpilih. Tidak ada pendaftaran admin publik.
          </p>
        </div>
        <Link className="btn secondary" href="/pemilik">
          Kembali ke panel pemilik
        </Link>
      </header>

      {params.notice && notices[params.notice] && (
        <div className="success rekber-message">{notices[params.notice]}</div>
      )}

      <section className="panel">
        <h2>Form penunjukan</h2>
        <form action={appointRekberAdmin} className="admin-inline-form">
          <input type="hidden" name="return_to" value="/pemilik/kelola-admin" />
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
                              name="return_to"
                              value="/pemilik/kelola-admin"
                            />
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

      <section className="panel">
        <h2>Tinjauan QR bisnis ({qrQueue.length})</h2>
        <p>
          Setujui hanya QR bisnis yang benar milik admin yang
          bersangkutan. QR yang disetujui tampil di tahap pembayaran
          transaksi yang ditanganinya.
        </p>
        {qrQueue.length === 0 && (
          <div className="empty">
            <h3>Tidak ada antrean QR</h3>
          </div>
        )}
        {qrQueue.map((profile) => (
          <article key={profile.id} className="admin-item">
            <div>
              <b>{profile.merchant_display_name}</b>
              <small>
                {`${profile.merchant_provider} · ${displayName(profile.admin_user_id)} · ${dateLabel(profile.submitted_at) ?? ""}`}
              </small>
            </div>
            {profile.signedUrl && (
              <>
                {/* QR: signed URL privat — sengaja <img> agar tidak lewat optimizer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="qr-preview"
                  src={profile.signedUrl}
                  alt="Pratinjau QR bisnis"
                />
              </>
            )}
            <form action={reviewQrProfile} className="dispute-form">
              <input type="hidden" name="return_to" value="/pemilik/kelola-admin" />
              <input type="hidden" name="profile_id" value={profile.id} />
              <label>
                Catatan tinjauan
                <input type="text" name="note" maxLength={500} placeholder="Opsional" />
              </label>
              <div className="rekber-actions">
                <SubmitButton className="btn" name="decision" value="approved" pendingLabel="Meninjau…">
                  Setujui
                </SubmitButton>
                <SubmitButton className="rekber-reject" name="decision" value="rejected" pendingLabel="Meninjau…">
                  Tolak
                </SubmitButton>
              </div>
            </form>
          </article>
        ))}
      </section>

    </section>
  );
}
