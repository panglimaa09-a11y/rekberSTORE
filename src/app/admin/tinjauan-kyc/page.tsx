import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import { reviewKycSubmission } from "@/app/admin-actions";
import AdminDenied from "@/components/AdminDenied";
import SubmitButton from "@/components/SubmitButton";
import {
  dateLabel,
  displayNameFor,
  loadDisplayNames,
} from "@/lib/admin-view";
import { loadKycReviewQueue } from "@/lib/admin-review";

const notices: Record<string, string> = {
  kyc_reviewed: "Pengajuan KYC sudah ditinjau.",
  review_invalid: "Putusan atau catatan tinjauan tidak valid.",
  review_error: "Tinjauan gagal diproses. Coba lagi.",
  stage_unavailable:
    "Fitur admin belum aktif — migrasi database belum dijalankan.",
};

/**
 * Tinjauan KYC admin (SUPER-ADMIN SAJA; dipindah dari halaman panel
 * admin lama). Dokumen identitas hanya dibuka untuk keperluan
 * tinjauan dan tidak dibagikan ke pihak lain.
 */
export default async function AdminKycReview({
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

  const kycQueue = await loadKycReviewQueue(db);

  const nameMap = await loadDisplayNames(
    db,
    kycQueue.map((k) => k.admin_user_id)
  );
  const displayName = (uid: string | null | undefined) =>
    displayNameFor(nameMap, user.id, uid);

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">PANEL ADMIN · SUPER ADMIN</small>
          <h1>Tinjauan KYC ({kycQueue.length})</h1>
          <p>
            Dokumen identitas hanya dibuka untuk keperluan tinjauan dan
            tidak dibagikan ke pihak lain.
          </p>
        </div>
        <Link className="btn secondary" href="/admin">
          Kembali ke panel admin
        </Link>
      </header>

      {params.notice && notices[params.notice] && (
        <div className="success rekber-message">{notices[params.notice]}</div>
      )}

      {kycQueue.length === 0 && (
        <div className="empty">
          <h3>Tidak ada antrean KYC</h3>
        </div>
      )}
      {kycQueue.map((submission) => (
        <article key={submission.id} className="admin-item">
          <div>
            <b>{submission.legal_name}</b>
            <small>
              {`${submission.identity_document_type} · ${submission.phone_e164} · ${displayName(submission.admin_user_id)} · ${dateLabel(submission.submitted_at) ?? ""}`}
            </small>
            <p>
              <Link
                href={`/admin/dokumen?path=${encodeURIComponent(submission.identity_document_object_path)}&ctx=kyc_review`}
              >
                Buka dokumen identitas (penampil bertanda air)
              </Link>{" "}
              <Link
                href={`/admin/dokumen?path=${encodeURIComponent(submission.selfie_object_path)}&ctx=kyc_review`}
              >
                Buka swafoto (penampil bertanda air)
              </Link>
            </p>
          </div>
          <form action={reviewKycSubmission} className="dispute-form">
            <input type="hidden" name="submission_id" value={submission.id} />
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
              <SubmitButton className="rekber-reject" name="decision" value="suspended" pendingLabel="Meninjau…">
                Tangguhkan
              </SubmitButton>
            </div>
          </form>
        </article>
      ))}
    </section>
  );
}
