import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import { reviewUserKyc } from "@/app/kyc-actions";
import AdminDenied from "@/components/AdminDenied";
import SubmitButton from "@/components/SubmitButton";
import {
  dateLabel,
  displayNameFor,
  loadDisplayNames,
} from "@/lib/admin-view";
import { isMissingRpcError } from "@/lib/rekber-stages";

const notices: Record<string, string> = {
  kyc_reviewed: "Pengajuan KYC sudah ditinjau.",
  kyc_not_pending: "Pengajuan KYC itu sudah tidak menunggu tinjauan.",
  kyc_unavailable:
    "Fitur KYC belum aktif — migrasi database belum dijalankan.",
  kyc_invalid_note: "Penolakan KYC wajib disertai alasan (min. 10 karakter).",
  kyc_review_error: "Tinjauan KYC gagal diproses. Coba lagi.",
  forbidden: "Aksi ini hanya untuk staf.",
};

/**
 * Antrean tinjauan KYC pengguna (dipindah dari halaman panel admin
 * lama). KYC buyer/seller dikirim KE ADMIN untuk ditinjau; berkas
 * hanya dibuka lewat penampil bertanda air dengan log audit, dan
 * tidak pernah terlihat oleh lawan transaksi.
 */
export default async function AdminUserKyc({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isStaff) return <AdminDenied />;

  let userKycQueue: {
    id: string;
    user_id: string;
    legal_name: string;
    phone_e164: string;
    identity_document_type: string;
    identity_document_object_path: string;
    selfie_object_path: string | null;
    status: string;
    submitted_at: string;
  }[] = [];
  let userKycUnavailable = false;
  try {
    const { data, error } = await db
      .from("user_kyc_submissions")
      .select(
        "id,user_id,legal_name,phone_e164,identity_document_type,identity_document_object_path,selfie_object_path,status,submitted_at"
      )
      .eq("status", "pending_review")
      .order("submitted_at", { ascending: true })
      .limit(20);
    if (error) throw error;
    userKycQueue = data ?? [];
  } catch (error) {
    userKycUnavailable = isMissingRpcError(
      error as { code?: string; message?: string }
    );
    userKycQueue = [];
  }

  if (userKycQueue.length > 0) {
    try {
      await db.rpc("log_rekber_access", {
        p_transaction_id: null,
        p_action: "review_queue_view",
        p_details: {
          user_kyc_ids: userKycQueue.map((k) => k.id),
        },
      });
    } catch {
      // Pencatatan gagal — antrean tetap tampil.
    }
  }

  const nameMap = await loadDisplayNames(
    db,
    userKycQueue.map((s) => s.user_id)
  );
  const displayName = (uid: string | null | undefined) =>
    displayNameFor(nameMap, user.id, uid);

  const noticeKey = params.notice ?? params.error ?? "";
  const noticeText = notices[noticeKey];
  const isError = !!params.error && !!noticeText;

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">PANEL ADMIN</small>
          <h1>Tinjauan KYC pengguna ({userKycQueue.length})</h1>
          <p>
            KYC buyer dan seller dikirim ke admin untuk ditinjau di
            sini. Berkas hanya dibuka lewat penampil bertanda air
            dengan log audit, dan tidak pernah terlihat oleh lawan
            transaksi.
          </p>
        </div>
        <Link className="btn secondary" href="/admin">
          Kembali ke panel admin
        </Link>
      </header>

      {noticeText && (
        <div className={isError ? "alert rekber-message" : "success rekber-message"}>
          {noticeText}
        </div>
      )}

      {userKycUnavailable && (
        <div className="notice">
          <div>
            <b>Antrean KYC belum aktif</b>
            <p>Migrasi KYC pengguna belum dijalankan.</p>
          </div>
        </div>
      )}
      {!userKycUnavailable && userKycQueue.length === 0 && (
        <div className="empty">
          <h3>Tidak ada antrean KYC pengguna</h3>
        </div>
      )}
      {userKycQueue.map((submission) => (
        <article key={submission.id} className="admin-item">
          <div>
            <b>{submission.legal_name}</b>
            <small>
              {`${submission.identity_document_type} · ${submission.phone_e164} · ${displayName(submission.user_id)} · ${dateLabel(submission.submitted_at) ?? ""}`}
            </small>
            <p>
              <Link
                href={`/admin/dokumen?path=${encodeURIComponent(submission.identity_document_object_path)}&ctx=kyc_review`}
              >
                Buka dokumen identitas (penampil bertanda air)
              </Link>{" "}
              {submission.selfie_object_path && (
                <Link
                  href={`/admin/dokumen?path=${encodeURIComponent(submission.selfie_object_path)}&ctx=kyc_review`}
                >
                  Buka swafoto (penampil bertanda air)
                </Link>
              )}
            </p>
          </div>
          <form action={reviewUserKyc} className="dispute-form">
            <input type="hidden" name="submission_id" value={submission.id} />
            <label>
              Catatan tinjauan (wajib bila menolak, min. 10 karakter)
              <input type="text" name="note" maxLength={500} placeholder="Opsional bila menyetujui" />
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
