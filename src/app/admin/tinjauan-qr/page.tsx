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

  let qrQueue: {
    id: string;
    admin_user_id: string;
    merchant_display_name: string;
    merchant_provider: string;
    qr_image_object_path: string;
    ownership_evidence_object_path: string | null;
    status: string;
    submitted_at: string;
    signedUrl: string | null;
  }[] = [];
  try {
    const { data, error } = await db
      .from("admin_qr_profiles")
      .select(
        "id,admin_user_id,merchant_display_name,merchant_provider,qr_image_object_path,ownership_evidence_object_path,status,submitted_at"
      )
      .eq("status", "pending_review")
      .order("submitted_at", { ascending: true })
      .limit(20);
    if (!error && data) {
      qrQueue = await Promise.all(
        data.map(async (row) => {
          let signedUrl: string | null = null;
          try {
            const { data: signed } = await db.storage
              .from("admin-private-documents")
              .createSignedUrl(row.qr_image_object_path, 3600);
            signedUrl = signed?.signedUrl ?? null;
          } catch {
            signedUrl = null;
          }
          return { ...row, signedUrl };
        })
      );
    }
  } catch {
    qrQueue = [];
  }

  if (qrQueue.length > 0) {
    try {
      await db.rpc("log_rekber_access", {
        p_transaction_id: null,
        p_action: "review_queue_view",
        p_details: {
          qr_ids: qrQueue.map((q) => q.id),
        },
      });
    } catch {
      // Pencatatan gagal — antrean tetap tampil.
    }
  }

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
