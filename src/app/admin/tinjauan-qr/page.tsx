import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import { reviewQrProfile } from "@/app/admin-actions";
import AdminDenied from "@/components/AdminDenied";
import SubmitButton from "@/components/SubmitButton";
import {
  dateLabel,
  displayNameFor,
  loadDisplayNames,
} from "@/lib/admin-view";
import { loadQrReviewQueue } from "@/lib/admin-review";

const notices: Record<string, string> = {
  qr_reviewed: "Profil QR bisnis sudah ditinjau.",
  review_invalid: "Putusan atau catatan tinjauan tidak valid.",
  review_error: "Tinjauan gagal diproses. Coba lagi.",
  stage_unavailable:
    "Fitur admin belum aktif — migrasi database belum dijalankan.",
};

/**
 * Tinjauan QR bisnis (SUPER-ADMIN SAJA; dipindah dari halaman panel
 * admin lama). Setujui hanya QR bisnis yang benar milik admin yang
 * bersangkutan. QR yang disetujui tampil di tahap pembayaran
 * transaksi yang ditanganinya.
 */
export default async function AdminQrReview({
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

  const qrQueue = await loadQrReviewQueue(db);

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
          <small className="eyebrow">PANEL ADMIN · SUPER ADMIN</small>
          <h1>Tinjauan QR bisnis ({qrQueue.length})</h1>
          <p>
            Setujui hanya QR bisnis yang benar milik admin yang
            bersangkutan. QR yang disetujui tampil di tahap pembayaran
            transaksi yang ditanganinya.
          </p>
        </div>
        <Link className="btn secondary" href="/admin">
          Kembali ke panel admin
        </Link>
      </header>

      {params.notice && notices[params.notice] && (
        <div className="success rekber-message">{notices[params.notice]}</div>
      )}

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
  );
}
