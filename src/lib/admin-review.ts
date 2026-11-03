import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialUrls } from "@/lib/social-urls";
import type { AdminLocation } from "@/lib/admin-location";

/**
 * Pemuat antrean tinjauan QR bisnis (super-admin saja) + URL sosmed
 * admin untuk tampilan tinjauan.
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

/**
 * URL sosmed terbaru tiap admin dari baris profil bisnis terkininya
 * (pending_review/approved — aturan yang sama dengan penegakan di
 * database). Hanya untuk tampilan tinjauan super-admin dan pengingat
 * staf; bukan berkas privat sehingga tidak ada pencatatan akses.
 * Gagal baca apa pun (termasuk kolom belum ada karena migrasi belum
 * dijalankan) = null; pemanggil menampilkan halaman tanpa URL.
 */
export async function loadAdminSocialUrls(
  db: SupabaseClient,
  userIds: string[]
): Promise<Map<string, SocialUrls> | null> {
  if (userIds.length === 0) return new Map();
  try {
    const { data, error } = await db
      .from("admin_qr_profiles")
      .select(
        "admin_user_id,instagram_url,facebook_url,tiktok_url,youtube_url,submitted_at"
      )
      .in("admin_user_id", userIds)
      .in("status", ["pending_review", "approved"])
      .order("submitted_at", { ascending: false });
    if (error) return null;
    const map = new Map<string, SocialUrls>();
    for (const row of data ?? []) {
      if (!map.has(row.admin_user_id)) {
        map.set(row.admin_user_id, {
          instagram_url: row.instagram_url,
          facebook_url: row.facebook_url,
          tiktok_url: row.tiktok_url,
          youtube_url: row.youtube_url,
        });
      }
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * Lokasi terbaru tiap admin dari baris profil bisnis terkininya
 * (pending_review/approved — aturan yang sama dengan penegakan di
 * database). Hanya untuk pengingat staf di hub admin; lokasi publik
 * untuk pencari dibaca lewat RPC list_rekber_admin_locations.
 * Gagal baca apa pun (termasuk kolom belum ada karena migrasi belum
 * dijalankan) = null; pemanggil menampilkan halaman tanpa pengingat
 * lokasi.
 */
export async function loadAdminLocations(
  db: SupabaseClient,
  userIds: string[]
): Promise<Map<string, AdminLocation> | null> {
  if (userIds.length === 0) return new Map();
  try {
    const { data, error } = await db
      .from("admin_qr_profiles")
      .select("admin_user_id,provinsi,kel_kecamatan,submitted_at")
      .in("admin_user_id", userIds)
      .in("status", ["pending_review", "approved"])
      .order("submitted_at", { ascending: false });
    if (error) return null;
    const map = new Map<string, AdminLocation>();
    for (const row of data ?? []) {
      if (!map.has(row.admin_user_id)) {
        map.set(row.admin_user_id, {
          provinsi: row.provinsi,
          kel_kecamatan: row.kel_kecamatan,
        });
      }
    }
    return map;
  } catch {
    return null;
  }
}
