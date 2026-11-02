import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import {
  appointRekberAdmin,
  reviewKycSubmission,
  reviewQrProfile,
  revokeRekberAdmin,
  setListingStatusAdmin,
} from "@/app/admin-actions";
import { resolveRekberDispute } from "@/app/rekber-actions";
import { reviewUserKyc } from "@/app/kyc-actions";
import {
  CASE_CATEGORY_LABELS,
  CASE_STATUS_LABELS,
} from "@/lib/case-labels";
import AdminDenied from "@/components/AdminDenied";
import SubmitButton from "@/components/SubmitButton";
import { isMissingRpcError } from "@/lib/rekber-stages";

const notices: Record<string, string> = {
  appointed: "Admin terpilih berhasil didaftarkan.",
  appoint_invalid: "Email tidak valid.",
  appoint_not_found: "Tidak ada akun terdaftar dengan email itu.",
  appoint_error: "Penunjukan admin gagal. Coba lagi.",
  revoked: "Peran admin dicabut.",
  revoke_error: "Pencabutan peran admin gagal. Coba lagi.",
  qr_reviewed: "Profil QR bisnis sudah ditinjau.",
  kyc_reviewed: "Pengajuan KYC sudah ditinjau.",
  kyc_not_pending: "Pengajuan KYC itu sudah tidak menunggu tinjauan.",
  kyc_unavailable:
    "Fitur KYC belum aktif — migrasi database belum dijalankan.",
  kyc_invalid_note: "Penolakan KYC wajib disertai alasan (min. 10 karakter).",
  kyc_review_error: "Tinjauan KYC gagal diproses. Coba lagi.",
  forbidden: "Aksi ini hanya untuk staf.",
  review_invalid: "Putusan atau catatan tinjauan tidak valid.",
  review_error: "Tinjauan gagal diproses. Coba lagi.",
  listing_updated: "Status listing diperbarui.",
  listing_error: "Perubahan status listing gagal. Coba lagi.",
  stage_unavailable:
    "Fitur admin belum aktif — migrasi database belum dijalankan.",
  invalid: "Permintaan tidak valid.",
};

const statusLabels: Record<string, string> = {
  awaiting_acceptance: "Menunggu persetujuan",
  awaiting_payment_provider: "Menunggu pembayaran manual",
  provider_payment_confirmed: "Dana ditahan admin",
  item_delivery: "Proses penyerahan",
  buyer_inspection: "Pemeriksaan buyer",
  completed: "Selesai",
  disputed: "Dalam sengketa",
  refund_pending: "Menunggu refund",
  cancelled: "Dibatalkan",
};

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);

const dateLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleString("id-ID") : null;

export default async function AdminPanel({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; status?: string }>;
}) {
  const params = await searchParams;
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isStaff) return <AdminDenied />;

  // -- Sengketa menunggu putusan (baca langsung; RLS mengizinkan staf).
  let disputes: {
    id: string;
    transaction_id: string;
    opened_by: string;
    reason: string;
    status: string;
    created_at: string;
  }[] = [];
  let disputesUnavailable = false;
  try {
    const { data, error } = await db
      .from("disputes")
      .select("id,transaction_id,opened_by,reason,status,created_at")
      .in("status", ["open", "under_review"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    disputes = data ?? [];
  } catch {
    disputesUnavailable = true;
  }
  const disputeTitles = new Map<string, string>();
  if (disputes.length > 0) {
    try {
      const { data } = await db
        .from("transactions")
        .select("id,title")
        .in(
          "id",
          disputes.map((d) => d.transaction_id)
        );
      for (const row of data ?? []) disputeTitles.set(row.id, row.title);
    } catch {
      // Judul opsional; baris sengketa tetap tampil dengan ID.
    }
  }

  // -- Pengawasan transaksi (RPC staf).
  let oversight: {
    id: string;
    title: string;
    amount: number;
    status: string;
    rekber_stage: number;
    buyer_id: string;
    seller_id: string;
    admin_id: string | null;
    created_at: string;
  }[] = [];
  let oversightUnavailable = false;
  try {
    const { data, error } = await db.rpc("list_rekber_transactions_admin");
    if (error) throw error;
    oversight = data ?? [];
  } catch (error) {
    oversightUnavailable = isMissingRpcError(
      error as { code?: string; message?: string }
    );
  }
  const statusFilter = params.status ?? "all";
  const filteredOversight =
    statusFilter === "all"
      ? oversight
      : oversight.filter((t) => t.status === statusFilter);

  // -- Moderasi listing (RPC staf; RLS menyembunyikan listing jeda).
  let listings: {
    id: string;
    seller_id: string;
    category: string;
    title: string;
    price: number;
    status: string;
    created_at: string;
  }[] = [];
  let listingsUnavailable = false;
  try {
    const { data, error } = await db.rpc("list_rekber_listings_admin");
    if (error) throw error;
    listings = data ?? [];
  } catch (error) {
    listingsUnavailable = isMissingRpcError(
      error as { code?: string; message?: string }
    );
  }

  // -- Pesanan top-up (RPC staf, read-only).
  let topupOrders: {
    id: string;
    user_id: string;
    user_email: string | null;
    package_tokens: number;
    amount_idr: number;
    status: string;
    provider: string | null;
    provider_reference: string | null;
    created_at: string;
    paid_at: string | null;
  }[] = [];
  let topupUnavailable = false;
  try {
    const { data, error } = await db.rpc("list_rekber_topup_orders_admin");
    if (error) throw error;
    topupOrders = data ?? [];
  } catch (error) {
    topupUnavailable = isMissingRpcError(
      error as { code?: string; message?: string }
    );
  }

  // -- Antrean KYC pengguna (semua staf: KYC dikirim KE ADMIN untuk
  //    ditinjau). Gagal baca (tabel belum ada) = antrean kosong + catatan.
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

  // -- Antrean kasus eskalasi (semua staf; bundel dibatasi penangan).
  let cases: {
    id: string;
    transaction_id: string;
    reported_by: string;
    category: string;
    reason: string;
    status: string;
    handler_id: string | null;
    created_at: string;
  }[] = [];
  let casesUnavailable = false;
  try {
    const { data, error } = await db
      .from("escalation_cases")
      .select(
        "id,transaction_id,reported_by,category,reason,status,handler_id,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    cases = data ?? [];
  } catch (error) {
    casesUnavailable = isMissingRpcError(
      error as { code?: string; message?: string }
    );
    cases = [];
  }
  const caseTxTitles = new Map<string, string>();
  try {
    const txIds = Array.from(new Set(cases.map((c) => c.transaction_id)));
    if (txIds.length > 0) {
      const { data } = await db
        .from("transactions")
        .select("id,title")
        .in("id", txIds);
      for (const row of data ?? []) caseTxTitles.set(row.id, row.title);
    }
  } catch {
    // Judul tampil apa adanya (ID pendek) di bawah.
  }

  // -- Log audit akses (semua staf; policy staff_audit_read).
  let auditRows: {
    id: number;
    actor_id: string | null;
    transaction_id: string | null;
    action: string;
    details: unknown;
    created_at: string;
  }[] = [];
  try {
    const { data, error } = await db
      .from("audit_logs")
      .select("id,actor_id,transaction_id,action,details,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (!error) auditRows = (data ?? []) as typeof auditRows;
  } catch {
    auditRows = [];
  }

  // -- Nama tampilan, satu panggilan batch untuk semua id yang tampil.
  const nameMap = new Map<string, string>();
  try {
    const ids = Array.from(
      new Set(
        [
          ...disputes.map((d) => d.opened_by),
          ...oversight.map((t) => t.buyer_id),
          ...oversight.map((t) => t.seller_id),
          ...oversight.map((t) => t.admin_id),
          ...listings.map((l) => l.seller_id),
          ...userKycQueue.map((s) => s.user_id),
          ...cases.map((c) => c.reported_by),
          ...cases.map((c) => c.handler_id),
          ...auditRows.map((a) => a.actor_id),
        ].filter((v): v is string => !!v)
      )
    );
    if (ids.length > 0) {
      const { data, error } = await db.rpc("get_rekber_display_names", {
        p_user_ids: ids,
      });
      if (!error && Array.isArray(data)) {
        for (const row of data) nameMap.set(row.user_id, row.display_name || "");
      }
    }
  } catch {
    // Fallback ID pendek di bawah.
  }
  const displayName = (uid: string | null | undefined) => {
    if (!uid) return "—";
    if (uid === user.id) return "Anda";
    const name = nameMap.get(uid);
    return name ? name : `ID ${uid.slice(0, 8)}…`;
  };

  // -- Daftar admin + antrean tinjauan (super admin saja).
  let staffList: {
    user_id: string;
    display_name: string;
    email: string;
    roles: string[];
    qr_status: string | null;
  }[] = [];
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
  let kycQueue: {
    id: string;
    admin_user_id: string;
    legal_name: string;
    phone_e164: string;
    identity_document_type: string;
    identity_document_object_path: string;
    selfie_object_path: string;
    status: string;
    submitted_at: string;
  }[] = [];
  if (roles.isSuperAdmin) {
    try {
      const { data, error } = await db.rpc("list_rekber_admins");
      if (!error) staffList = data ?? [];
    } catch {
      staffList = [];
    }
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
  }

  // Catat tampilan antrean tinjauan ke log audit (sekali per render bila
  // ada antrean; gagal catat bukan penghalang tampil).
  if (qrQueue.length > 0 || kycQueue.length > 0 || userKycQueue.length > 0) {
    try {
      await db.rpc("log_rekber_access", {
        p_transaction_id: null,
        p_action: "review_queue_view",
        p_details: {
          qr_ids: qrQueue.map((q) => q.id),
          admin_kyc_ids: kycQueue.map((k) => k.id),
          user_kyc_ids: userKycQueue.map((k) => k.id),
        },
      });
    } catch {
      // Pencatatan gagal — antrean tetap tampil.
    }
  }

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">PANEL ADMIN</small>
          <h1>Panel Admin</h1>
          <p>
            Pengawasan transaksi, sengketa, moderasi listing, dan pesanan
            top up. Admin di sini adalah rekber terpilih yang memakai
            layanan website — bukan staf platform.
          </p>
        </div>
        <Link className="btn secondary" href="/dashboard/admin/profil-bisnis">
          Profil bisnis saya
        </Link>
      </header>

      {params.notice && notices[params.notice] && (
        <div className="success rekber-message">{notices[params.notice]}</div>
      )}

      <section className="panel">
        <h2>Sengketa menunggu putusan ({disputes.length})</h2>
        {disputesUnavailable && (
          <p className="token-muted">
            Daftar sengketa belum dapat dibaca. Periksa migrasi dan RLS
            tabel disputes.
          </p>
        )}
        {!disputesUnavailable && disputes.length === 0 && (
          <div className="empty">
            <h3>Tidak ada sengketa terbuka</h3>
            <p>Sengketa yang diajukan buyer/seller akan muncul di sini.</p>
          </div>
        )}
        {disputes.map((dispute) => (
          <article key={dispute.id} className="admin-item">
            <div>
              <b>
                <Link href={`/dashboard/transactions/${dispute.transaction_id}`}>
                  {disputeTitles.get(dispute.transaction_id) ?? "Transaksi"}
                </Link>
              </b>
              <small>
                {`Dibuka ${displayName(dispute.opened_by)} · ${dateLabel(dispute.created_at) ?? ""} · Status: ${dispute.status}`}
              </small>
              <p>{dispute.reason}</p>
            </div>
            <form action={resolveRekberDispute} className="dispute-form">
              <input type="hidden" name="dispute_id" value={dispute.id} />
              <input
                type="hidden"
                name="transaction_id"
                value={dispute.transaction_id}
              />
              <label>
                Putusan admin
                <textarea
                  name="resolution"
                  required
                  minLength={5}
                  maxLength={2000}
                  rows={2}
                  placeholder="Alasan putusan. Refund ditangani manual di luar platform."
                />
              </label>
              <div className="rekber-actions">
                <SubmitButton className="btn" name="decision" value="resume" pendingLabel="Memutus…">
                  Lanjutkan
                </SubmitButton>
                <SubmitButton className="btn" name="decision" value="refund" pendingLabel="Memutus…">
                  Refund
                </SubmitButton>
                <SubmitButton className="rekber-reject" name="decision" value="reject" pendingLabel="Memutus…">
                  Tolak
                </SubmitButton>
              </div>
            </form>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="rekber-panel-heading">
          <div>
            <h2>Pengawasan transaksi</h2>
            <p>Seluruh transaksi yang tercatat di platform.</p>
          </div>
        </div>
        {oversightUnavailable && (
          <p className="token-muted">
            Pengawasan belum aktif — migrasi database belum dijalankan.
          </p>
        )}
        <nav className="filter-row" aria-label="Filter status transaksi">
          {["all", ...Object.keys(statusLabels)].map((value) => (
            <Link
              key={value}
              href={
                value === "all"
                  ? "/dashboard/admin"
                  : `/dashboard/admin?status=${value}`
              }
              className={statusFilter === value ? "filter-active" : undefined}
            >
              {value === "all" ? "Semua" : statusLabels[value]}
            </Link>
          ))}
        </nav>
        {filteredOversight.length > 0 && (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Transaksi</th>
                  <th>Nilai</th>
                  <th>Status</th>
                  <th>Tahap</th>
                  <th>Admin penangan</th>
                  <th>Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {filteredOversight.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <b>
                        <Link href={`/dashboard/transactions/${tx.id}`}>
                          {tx.title}
                        </Link>
                      </b>
                      <small>
                        {`Buyer: ${displayName(tx.buyer_id)} · Seller: ${displayName(tx.seller_id)}`}
                      </small>
                    </td>
                    <td>{money(tx.amount)}</td>
                    <td>
                      <span className="rekber-status">
                        {statusLabels[tx.status] ?? tx.status}
                      </span>
                    </td>
                    <td>
                      {tx.rekber_stage === 0
                        ? "Pengajuan"
                        : `Tahap ${tx.rekber_stage} dari 8`}
                    </td>
                    <td>{displayName(tx.admin_id)}</td>
                    <td>{new Date(tx.created_at).toLocaleDateString("id-ID")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!oversightUnavailable && filteredOversight.length === 0 && (
          <div className="empty">
            <h3>Tidak ada transaksi pada filter ini</h3>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Moderasi listing</h2>
        <p>
          Jeda atau aktifkan listing. Penghapusan tidak dibangun — tidak
          ada policy DELETE di database.
        </p>
        {listingsUnavailable && (
          <p className="token-muted">
            Moderasi belum aktif — migrasi database belum dijalankan.
          </p>
        )}
        {!listingsUnavailable && listings.length === 0 && (
          <div className="empty">
            <h3>Belum ada listing</h3>
          </div>
        )}
        {listings.length > 0 && (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Kategori</th>
                  <th>Harga</th>
                  <th>Status</th>
                  <th>Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing.id}>
                    <td>
                      <b>{listing.title}</b>
                      <small>{`Seller: ${displayName(listing.seller_id)}`}</small>
                    </td>
                    <td>{listing.category}</td>
                    <td>{money(listing.price)}</td>
                    <td>
                      <span className="rekber-status">{listing.status}</span>
                    </td>
                    <td>
                      {listing.status === "active" ? (
                        <form action={setListingStatusAdmin}>
                          <input type="hidden" name="listing_id" value={listing.id} />
                          <input type="hidden" name="status" value="paused" />
                          <SubmitButton className="rekber-reject" pendingLabel="Menjeda…">
                            Jeda
                          </SubmitButton>
                        </form>
                      ) : listing.status === "paused" ? (
                        <form action={setListingStatusAdmin}>
                          <input type="hidden" name="listing_id" value={listing.id} />
                          <input type="hidden" name="status" value="active" />
                          <SubmitButton className="btn" pendingLabel="Mengaktifkan…">
                            Aktifkan
                          </SubmitButton>
                        </form>
                      ) : (
                        <span className="role">Tidak ada tindakan</span>
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
        <h2>Pesanan top up (read-only)</h2>
        {topupUnavailable && (
          <p className="token-muted">
            Daftar pesanan belum aktif — migrasi database belum dijalankan.
          </p>
        )}
        {!topupUnavailable && topupOrders.length === 0 && (
          <div className="empty">
            <h3>Belum ada pesanan top up</h3>
          </div>
        )}
        {topupOrders.length > 0 && (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Pengguna</th>
                  <th>Paket</th>
                  <th>Harga</th>
                  <th>Status</th>
                  <th>Provider</th>
                  <th>Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {topupOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <b>{order.user_email ?? "—"}</b>
                      <small>{order.id}</small>
                    </td>
                    <td>{order.package_tokens} Token</td>
                    <td>{money(order.amount_idr)}</td>
                    <td>
                      <span className="rekber-status">{order.status}</span>
                    </td>
                    <td>{order.provider ?? "—"}</td>
                    <td>{new Date(order.created_at).toLocaleDateString("id-ID")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Tinjauan KYC pengguna ({userKycQueue.length})</h2>
        <p>
          KYC buyer dan seller dikirim ke admin untuk ditinjau di sini.
          Berkas hanya dibuka lewat penampil bertanda air dengan log
          audit, dan tidak pernah terlihat oleh lawan transaksi.
        </p>
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
                  href={`/dashboard/admin/dokumen?path=${encodeURIComponent(submission.identity_document_object_path)}&ctx=kyc_review`}
                >
                  Buka dokumen identitas (penampil bertanda air)
                </Link>{" "}
                {submission.selfie_object_path && (
                  <Link
                    href={`/dashboard/admin/dokumen?path=${encodeURIComponent(submission.selfie_object_path)}&ctx=kyc_review`}
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

      <section className="panel">
        <h2>Kasus eskalasi ({cases.length})</h2>
        <p>
          Antrean laporan ke tim penindakan. Bundel bukti (chat, lokasi,
          referensi KYC, timeline tahap) hanya dibuka super-admin atau
          admin penangan transaksi — dan setiap pembukaan tercatat di
          log audit.
        </p>
        {casesUnavailable && (
          <div className="notice">
            <div>
              <b>Antrean kasus belum aktif</b>
              <p>Migrasi kasus eskalasi belum dijalankan.</p>
            </div>
          </div>
        )}
        {!casesUnavailable && cases.length === 0 && (
          <div className="empty">
            <h3>Tidak ada kasus eskalasi</h3>
          </div>
        )}
        {cases.map((c) => (
          <article key={c.id} className="admin-item">
            <div>
              <b>
                {CASE_CATEGORY_LABELS[c.category] ?? c.category} —{" "}
                {caseTxTitles.get(c.transaction_id) ??
                  `Transaksi ${c.transaction_id.slice(0, 8)}…`}
              </b>
              <small>
                {`${CASE_STATUS_LABELS[c.status] ?? c.status} · dilaporkan ${displayName(c.reported_by)} · ${dateLabel(c.created_at) ?? ""}`}
                {c.handler_id ? ` · ditangani ${displayName(c.handler_id)}` : ""}
              </small>
              <p>{c.reason}</p>
            </div>
            <Link
              className="btn secondary"
              href={`/dashboard/admin/kasus/${c.id}`}
            >
              Buka bundel bukti
            </Link>
          </article>
        ))}
      </section>

      <section className="panel">
        <h2>Log audit akses</h2>
        <p>
          30 akses terakhir ke berkas, bundel bukti, dan antrean
          tinjauan. Tangkapan layar tidak dapat dicegah sepenuhnya —
          perlindungan adalah kontrol akses + watermark + audit ini +
          jalur hukum.
        </p>
        {auditRows.length === 0 && (
          <div className="empty">
            <h3>Belum ada entri audit</h3>
          </div>
        )}
        {auditRows.length > 0 && (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Aksi</th>
                  <th>Oleh</th>
                  <th>Transaksi</th>
                  <th>Detail</th>
                  <th>Waktu</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.action}</td>
                    <td>{displayName(row.actor_id)}</td>
                    <td>
                      <small>
                        {row.transaction_id
                          ? row.transaction_id.slice(0, 8) + "…"
                          : "—"}
                      </small>
                    </td>
                    <td>
                      <small>
                        {JSON.stringify(row.details ?? {}).slice(0, 120)}
                      </small>
                    </td>
                    <td>
                      {new Date(row.created_at).toLocaleString("id-ID")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {roles.isSuperAdmin && (
        <>
          <section className="panel">
            <h2>Daftarkan admin terpilih</h2>
            <p>
              Hanya Tuan (super admin) yang dapat mendaftarkan rekber
              terpilih. Masukkan email akun yang sudah terdaftar di
              platform. Tidak ada pendaftaran admin publik.
            </p>
            <form action={appointRekberAdmin} className="admin-inline-form">
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
                          {staff.roles.includes("admin") &&
                            staff.user_id !== user.id && (
                              <form action={revokeRekberAdmin}>
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

          <section className="panel">
            <h2>Tinjauan KYC ({kycQueue.length})</h2>
            <p>
              Dokumen identitas hanya dibuka untuk keperluan tinjauan dan
              tidak dibagikan ke pihak lain.
            </p>
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
                      href={`/dashboard/admin/dokumen?path=${encodeURIComponent(submission.identity_document_object_path)}&ctx=kyc_review`}
                    >
                      Buka dokumen identitas (penampil bertanda air)
                    </Link>{" "}
                    <Link
                      href={`/dashboard/admin/dokumen?path=${encodeURIComponent(submission.selfie_object_path)}&ctx=kyc_review`}
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
        </>
      )}

      {!roles.isSuperAdmin && (
        <div className="notice">
          <div>
            <b>Penunjukan admin oleh super admin</b>
            <p>
              Hanya Tuan (super admin) yang dapat mendaftarkan rekber
              terpilih dan meninjau profil QR/KYC admin. Tinjauan KYC
              pengguna di atas dapat dilakukan semua staf. Bagian
              penunjukan tidak tampil untuk peran admin biasa.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
