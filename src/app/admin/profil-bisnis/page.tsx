import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import {
  updateSocialUrls,
  upsertQrProfile,
} from "@/app/admin-actions";
import AdminDenied from "@/components/AdminDenied";
import DocumentUpload from "@/components/DocumentUpload";
import SubmitButton from "@/components/SubmitButton";
import { dateLabel } from "@/lib/admin-view";
import {
  SOCIAL_PLATFORMS,
  isSocialProfileComplete,
} from "@/lib/social-urls";

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

  // Profil QR milik sendiri (RLS: baca baris sendiri / super admin).
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
  // URL sosmed dari baris profil bisnis terkini (pending/approved).
  // Query TERPISAH dari profil QR: bila kolom belum ada karena migrasi
  // belum dijalankan, hanya bagian sosmed yang kosong — tampilan QR
  // tetap utuh.
  let social: {
    instagram_url: string | null;
    facebook_url: string | null;
    tiktok_url: string | null;
    youtube_url: string | null;
  } | null = null;
  try {
    const { data } = await db
      .from("admin_qr_profiles")
      .select("instagram_url,facebook_url,tiktok_url,youtube_url")
      .eq("admin_user_id", user.id)
      .in("status", ["pending_review", "approved"])
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    social = data;
  } catch {
    social = null;
  }
  const socialComplete = isSocialProfileComplete(social);

  return (
    <section className="dashmain">
      <small className="eyebrow">PROFIL BISNIS ADMIN</small>
      <h1>Profil bisnis saya</h1>
      <p>
        QR bisnis dan URL sosmed asli untuk keperluan verifikasi oleh
        super admin. Berkas QR tersimpan privat dan hanya dibaca pihak
        yang berhak; admin tidak memakai KYC dokumen.
      </p>

      {params.notice === "qr_submitted" && (
        <div className="success rekber-message">
          Profil QR bisnis diajukan dan menunggu tinjauan super admin.
        </div>
      )}
      {params.notice === "social_saved" && (
        <div className="success rekber-message">
          URL sosmed disimpan.
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
      {params.error === "noprofile" && (
        <div className="alert rekber-message">
          Profil bisnis aktif belum ada. Ajukan profil QR bisnis
          terlebih dahulu.
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
        <h2>URL sosmed asli</h2>
        <p>
          Isi URL sosmed asli Anda. Admin tidak memakai KYC dokumen —
          identitas Anda dibuktikan tautan sosmed asli ini, yang hanya
          dibaca super admin untuk keperluan verifikasi.
        </p>
        <div className="tx-meta">
          <div>
            <small>STATUS URL SOSMED</small>
            <b>{socialComplete ? "Lengkap" : "Belum lengkap"}</b>
          </div>
        </div>
        {!social ? (
          <p>
            Profil bisnis aktif belum ada — ajukan profil QR bisnis
            terlebih dahulu, lalu lengkapi URL sosmed di sini.
          </p>
        ) : (
          <>
            {!socialComplete && (
              <p>
                Minimal satu URL valid wajib diisi sebelum Anda dapat
                menangani transaksi: penugasan otomatis ditahan sampai
                URL sosmed terisi.
              </p>
            )}
            <form action={updateSocialUrls} className="admin-profile-form">
              {SOCIAL_PLATFORMS.map((platform) => (
                <label key={platform.key}>
                  {platform.label}
                  <input
                    type="url"
                    name={platform.column}
                    maxLength={200}
                    defaultValue={social[platform.column] ?? ""}
                    placeholder={platform.placeholder}
                  />
                </label>
              ))}
              <SubmitButton className="btn" pendingLabel="Menyimpan…">
                Simpan URL sosmed
              </SubmitButton>
            </form>
          </>
        )}
      </section>
    </section>
  );
}
