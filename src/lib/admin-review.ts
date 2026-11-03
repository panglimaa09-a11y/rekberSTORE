import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pemuat antrean tinjauan QR bisnis + KYC admin (super-admin saja).
 * Dipakai bersama oleh halaman /admin/tinjauan-* dan halaman
 * /pemilik/kelola-admin agar query, signed URL, dan pencatatan akses
 * tidak diduplikasi di dua tempat. Modul murni server: boleh diimpor
 * Server Component saja (memakai klien Supabase server).
 *
 * Perilaku dipertahankan persis seperti pemuat lama di halaman
 * /admin: gagal baca = antrean kosong (bukan error halaman),
 * pencatatan akses best-effort, signed URL privat 3600 detik untuk
 * pratinjau QR.
 */

export type QrReviewItem = {
  id: string;
  admin_user_id: string;
  merchant_display_name: string;
  merchant_provider: string;
  qr_image_object_path: string;
  ownership_evidence_object_path: string | null;
  status: string;
  submitted_at: string;
  signedUrl: string | null;
};

export type KycReviewItem = {
  id: string;
  admin_user_id: string;
  legal_name: string;
  phone_e164: string;
  identity_document_type: string;
  identity_document_object_path: string;
  selfie_object_path: string;
  status: string;
  submitted_at: string;
};

export async function loadQrReviewQueue(
  db: SupabaseClient
): Promise<QrReviewItem[]> {
  let qrQueue: QrReviewItem[] = [];
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

  return qrQueue;
}

export async function loadKycReviewQueue(
  db: SupabaseClient
): Promise<KycReviewItem[]> {
  let kycQueue: KycReviewItem[] = [];
  try {
    const { data, error } = await db
      .from("admin_kyc_submissions")
      .select(
        "id,admin_user_id,legal_name,phone_e164,identity_document_type,identity_document_object_path,selfie_object_path,status,submitted_at"
      )
      .eq("status", "pending_review")
      .order("submitted_at", { ascending: true })
      .limit(20);
    if (!error) kycQueue = data ?? [];
  } catch {
    kycQueue = [];
  }

  if (kycQueue.length > 0) {
    try {
      await db.rpc("log_rekber_access", {
        p_transaction_id: null,
        p_action: "review_queue_view",
        p_details: {
          admin_kyc_ids: kycQueue.map((k) => k.id),
        },
      });
    } catch {
      // Pencatatan gagal — antrean tetap tampil.
    }
  }

  return kycQueue;
}
