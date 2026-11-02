import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { submitUserKyc } from "@/app/kyc-actions";
import { KYC_STATUS_LABELS, type KycStatus } from "@/lib/kyc";
import SubmitButton from "@/components/SubmitButton";
import DocumentUpload from "@/components/DocumentUpload";

const DOC_TYPES = ["KTP", "SIM", "PASPOR"] as const;

export default async function KycPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  let submission: {
    id: string;
    legal_name: string;
    phone_e164: string;
    identity_document_type: string;
    identity_document_object_path: string;
    selfie_object_path: string | null;
    status: string;
    reviewer_note: string | null;
    submitted_at: string;
    reviewed_at: string | null;
  } | null = null;
  let unavailable = false;
  try {
    const { data, error } = await db
      .from("user_kyc_submissions")
      .select(
        "id,legal_name,phone_e164,identity_document_type,identity_document_object_path,selfie_object_path,status,reviewer_note,submitted_at,reviewed_at"
      )
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    submission = data;
  } catch {
    unavailable = true;
  }

  const status = (submission?.status ?? "not_submitted") as KycStatus;
  const approved = status === "approved";

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">KYC PENGGUNA</small>
          <h1>Verifikasi identitas Anda</h1>
          <p>
            KYC wajib untuk buyer dan seller sebelum bertransaksi. KYC
            dikirim ke admin — bukan ke lawan transaksi — dan ditinjau
            oleh admin/super-admin.
          </p>
        </div>
        <Link className="btn secondary" href="/dashboard/profile">
          Kembali ke profil
        </Link>
      </header>

      {params.notice === "submitted" && (
        <div className="success rekber-message">
          KYC terkirim ke admin dan menunggu tinjauan. Status tampil di
          profil Anda.
        </div>
      )}
      {params.notice === "kyc_approved" && (
        <div className="success rekber-message">
          KYC Anda sudah terverifikasi. Tidak perlu mengirim ulang.
        </div>
      )}
      {params.error && (
        <div className="alert rekber-message">
          {params.error === "kyc_invalid"
            ? "Data KYC belum lengkap. Nama 3–120 karakter, nomor HP valid, jenis dokumen dipilih, dan kedua berkas (dokumen + swafoto) sudah diunggah."
            : params.error === "kyc_unavailable"
              ? "Fitur KYC belum aktif — migrasi database belum dijalankan."
              : "Pengiriman KYC gagal. Coba lagi."}
        </div>
      )}

      {unavailable && (
        <div className="notice">
          <div>
            <b>Fitur KYC belum aktif</b>
            <p>
              Status KYC belum dapat diperiksa — migrasi database belum
              dijalankan. Transaksi dan penawaran diblokir sampai migrasi
              dijalankan dan KYC disetujui.
            </p>
          </div>
        </div>
      )}

      {!unavailable && (
        <section className="panel">
          <h2>Status KYC Anda</h2>
          <div className="tx-meta">
            <div>
              <small>STATUS</small>
              <b>{KYC_STATUS_LABELS[status] ?? status}</b>
            </div>
            {submission && (
              <>
                <div>
                  <small>JENIS DOKUMEN</small>
                  <b>{submission.identity_document_type}</b>
                </div>
                <div>
                  <small>DIKIRIM</small>
                  <b>
                    {new Date(submission.submitted_at).toLocaleString("id-ID")}
                  </b>
                </div>
                {submission.reviewed_at && (
                  <div>
                    <small>DITINJAU</small>
                    <b>
                      {new Date(submission.reviewed_at).toLocaleString("id-ID")}
                    </b>
                  </div>
                )}
              </>
            )}
          </div>
          {status === "rejected" && submission?.reviewer_note && (
            <p className="token-muted">
              Alasan penolakan: {submission.reviewer_note}
            </p>
          )}
          {approved && (
            <p>
              KYC Anda terverifikasi. Berkas tersimpan privat dan hanya
              dapat diakses admin/super-admin.
            </p>
          )}
        </section>
      )}

      {!unavailable && !approved && (
        <section className="panel">
          <h2>
            {status === "rejected"
              ? "Kirim ulang KYC"
              : status === "pending_review"
                ? "KYC sedang ditinjau — kirim ulang bila perlu"
                : "Kirim KYC ke admin"}
          </h2>
          <p>
            Unggah dokumen identitas dan swafoto. Berkas tersimpan di
            bucket privat; lawan transaksi tidak pernah melihat KYC Anda.
            Jenis dokumen yang diterima saat ini: KTP, SIM, paspor,
            beserta swafoto — daftar ini masih menunggu persetujuan
            akhir pemilik platform.
          </p>
          <form action={submitUserKyc} className="rekber-form">
            <label>
              Nama lengkap sesuai dokumen
              <input
                name="legal_name"
                required
                minLength={3}
                maxLength={120}
                defaultValue={submission?.legal_name ?? ""}
                placeholder="Nama lengkap"
              />
            </label>
            <label>
              Nomor HP (format internasional, contoh +62812xxxxxxx)
              <input
                name="phone"
                required
                pattern="\+?[0-9]{8,15}"
                defaultValue={submission?.phone_e164 ?? ""}
                placeholder="+62812xxxxxxx"
              />
            </label>
            <label>
              Jenis dokumen
              <select
                name="document_type"
                required
                defaultValue={submission?.identity_document_type ?? "KTP"}
              >
                {DOC_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <DocumentUpload
              userId={user.id}
              kind="kyc"
              label="Dokumen identitas (JPG/PNG/PDF, maks. 5 MB)"
              inputName="document_path"
              existingPath={submission?.identity_document_object_path}
            />
            {submission?.identity_document_object_path && (
              <input
                type="hidden"
                name="document_path"
                value={submission.identity_document_object_path}
              />
            )}
            <DocumentUpload
              userId={user.id}
              kind="kyc"
              label="Swafoto (JPG/PNG, maks. 5 MB)"
              inputName="selfie_path"
              existingPath={submission?.selfie_object_path}
            />
            {submission?.selfie_object_path && (
              <input
                type="hidden"
                name="selfie_path"
                value={submission.selfie_object_path}
              />
            )}
            <SubmitButton pendingLabel="Mengirim…">
              Kirim KYC ke admin
            </SubmitButton>
          </form>
          <div className="notice">
            <div>
              <b>Perlindungan data</b>
              <p>
                Berkas KYC hanya dapat diakses admin dan super-admin
                lewat penampil bertanda air dengan log audit. Tangkapan
                layar tidak dapat dicegah sepenuhnya oleh aplikasi web
                mana pun.
              </p>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
