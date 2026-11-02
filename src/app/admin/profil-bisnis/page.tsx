import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import {
  upsertKycSubmission,
  upsertQrProfile,
} from "@/app/admin-actions";
import AdminDenied from "@/components/AdminDenied";
import DocumentUpload from "@/components/DocumentUpload";
import SubmitButton from "@/components/SubmitButton";
import { dateLabel } from "@/lib/admin-view";

export default async function BusinessProfile({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isStaff) return <AdminDenied />;

  // Profil QR + KYC milik sendiri (RLS: baca baris sendiri / super admin).
  let qrProfile: {
    merchant_display_name: string;
    merchant_provider: string;
    qr_image_object_path: string;
    ownership_evidence_object_path: string | null;
    status: string;
    reviewer_note: string | null;
    submitted_at: string;
    reviewed_at: string | null;
  } | null = null;
  let kyc: {
    legal_name: string;
    phone_e164: string;
    identity_document_type: string;
    identity_document_object_path: string;
    selfie_object_path: string;
    status: string;
    reviewer_note: string | null;
    submitted_at: string;
    reviewed_at: string | null;
  } | null = null;
  try {
    const { data } = await db
      .from("admin_qr_profiles")
      .select(
        "merchant_display_name,merchant_provider,qr_image_object_path,ownership_evidence_object_path,status,reviewer_note,submitted_at,reviewed_at"
      )
      .eq("admin_user_id", user.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    qrProfile = data;
  } catch {
    qrProfile = null;
  }
  try {
    const { data } = await db
      .from("admin_kyc_submissions")
      .select(
        "legal_name,phone_e164,identity_document_type,identity_document_object_path,selfie_object_path,status,reviewer_note,submitted_at,reviewed_at"
      )
      .eq("admin_user_id", user.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    kyc = data;
  } catch {
    kyc = null;
  }

  return (
    <section className="dashmain">
      <small className="eyebrow">PROFIL BISNIS ADMIN</small>
      <h1>Profil bisnis saya</h1>
      <p>
        QR bisnis dan dokumen identitas untuk keperluan verifikasi oleh
        super admin. Berkas tersimpan privat dan hanya dibaca pihak yang
        berhak.
      </p>

      {params.notice === "qr_submitted" && (
        <div className="success rekber-message">
          Profil QR bisnis diajukan dan menunggu tinjauan super admin.
        </div>
      )}
      {params.notice === "kyc_submitted" && (
        <div className="success rekber-message">
          Pengajuan KYC diajukan dan menunggu tinjauan super admin.
        </div>
      )}
      {params.error === "invalid" && (
        <div className="alert rekber-message">
          Data belum lengkap atau tidak valid. Periksa isian dan berkas
          yang diunggah.
        </div>
      )}
      {params.error === "unavailable" && (
        <div className="alert rekber-message">
          Fitur ini belum aktif — migrasi database belum dijalankan.
        </div>
      )}
      {params.error === "save" && (
        <div className="alert rekber-message">
          Penyimpanan gagal. Coba lagi.
        </div>
      )}

      <section className="panel">
        <h2>QR bisnis</h2>
        <p>
          QR bisnis milik Anda ditampilkan di tahap pembayaran transaksi
          yang Anda tangani — setelah disetujui super admin. QR bukan
          bukti pembayaran: status berubah hanya oleh konfirmasi Anda
          setelah memeriksa aplikasi QRIS/bank sendiri.
        </p>
        {qrProfile && (
          <div className="tx-meta">
            <div>
              <small>STATUS</small>
              <b>{qrProfile.status}</b>
            </div>
            <div>
              <small>DIAJUKAN</small>
              <b>{dateLabel(qrProfile.submitted_at)}</b>
            </div>
            <div>
              <small>NAMA MERCHANT</small>
              <b>{qrProfile.merchant_display_name}</b>
            </div>
            <div>
              <small>PENYEDIA</small>
              <b>{qrProfile.merchant_provider}</b>
            </div>
          </div>
        )}
        {qrProfile?.reviewer_note && (
          <p>Catatan peninjau: {qrProfile.reviewer_note}</p>
        )}
        <form action={upsertQrProfile} className="admin-profile-form">
          <label>
            Nama merchant / bisnis
            <input
              type="text"
              name="merchant_display_name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={qrProfile?.merchant_display_name ?? ""}
              placeholder="Nama bisnis pada QR"
            />
          </label>
          <label>
            Penyedia QR bisnis
            <input
              type="text"
              name="merchant_provider"
              required
              maxLength={60}
              defaultValue={qrProfile?.merchant_provider ?? "DANA_BISNIS"}
              placeholder="mis. DANA_BISNIS"
            />
          </label>
          <DocumentUpload
            userId={user.id}
            kind="qr"
            label="Gambar QR bisnis (JPG/PNG/PDF, maks. 5 MB)"
            inputName="qr_image_object_path"
            existingPath={qrProfile?.qr_image_object_path}
          />
          <DocumentUpload
            userId={user.id}
            kind="qr"
            label="Bukti kepemilikan QR (opsional)"
            inputName="ownership_evidence_object_path"
            existingPath={qrProfile?.ownership_evidence_object_path}
          />
          <SubmitButton className="btn" pendingLabel="Mengajukan…">
            Ajukan profil QR bisnis
          </SubmitButton>
        </form>
      </section>

      <section className="panel">
        <h2>Dokumen identitas (KYC)</h2>
        <p>
          Identitas Anda diverifikasi super admin sebagai bagian dari
          kurasi rekber terpilih. Dokumen tidak dibagikan ke buyer atau
          seller.
        </p>
        {kyc && (
          <div className="tx-meta">
            <div>
              <small>STATUS</small>
              <b>{kyc.status}</b>
            </div>
            <div>
              <small>DIAJUKAN</small>
              <b>{dateLabel(kyc.submitted_at)}</b>
            </div>
            <div>
              <small>NAMA LEGAL</small>
              <b>{kyc.legal_name}</b>
            </div>
            <div>
              <small>JENIS DOKUMEN</small>
              <b>{kyc.identity_document_type}</b>
            </div>
          </div>
        )}
        {kyc?.reviewer_note && <p>Catatan peninjau: {kyc.reviewer_note}</p>}
        <form action={upsertKycSubmission} className="admin-profile-form">
          <label>
            Nama legal
            <input
              type="text"
              name="legal_name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={kyc?.legal_name ?? ""}
              placeholder="Nama sesuai dokumen identitas"
            />
          </label>
          <label>
            Nomor telepon (format E.164)
            <input
              type="tel"
              name="phone_e164"
              required
              maxLength={20}
              defaultValue={kyc?.phone_e164 ?? ""}
              placeholder="mis. +6281234567890"
            />
          </label>
          <label>
            Jenis dokumen identitas
            <select
              name="identity_document_type"
              required
              defaultValue={kyc?.identity_document_type ?? "KTP"}
            >
              <option value="KTP">KTP</option>
              <option value="SIM">SIM</option>
              <option value="Paspor">Paspor</option>
            </select>
          </label>
          <DocumentUpload
            userId={user.id}
            kind="kyc"
            label="Dokumen identitas (JPG/PNG/PDF, maks. 5 MB)"
            inputName="identity_document_object_path"
            existingPath={kyc?.identity_document_object_path}
          />
          <DocumentUpload
            userId={user.id}
            kind="kyc"
            label="Swafoto memegang dokumen (JPG/PNG, maks. 5 MB)"
            inputName="selfie_object_path"
            existingPath={kyc?.selfie_object_path}
          />
          <SubmitButton className="btn" pendingLabel="Mengajukan…">
            Ajukan KYC
          </SubmitButton>
        </form>
      </section>
    </section>
  );
}
