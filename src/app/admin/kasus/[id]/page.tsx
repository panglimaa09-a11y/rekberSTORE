import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import AdminDenied from "@/components/AdminDenied";
import SubmitButton from "@/components/SubmitButton";
import { updateRekberCaseStatus } from "@/app/case-actions";
import {
  CASE_CATEGORY_LABELS,
  CASE_STATUS_LABELS,
} from "@/lib/case-labels";
import { KYC_STATUS_LABELS, type KycStatus } from "@/lib/kyc";
import {
  REKBER_STAGES,
  REKBER_STATUS_LABELS,
} from "@/lib/rekber-stages";
import {
  displayNameFor,
  loadDisplayNames,
  money,
} from "@/lib/admin-view";

const NEXT_STATUSES: Record<string, string[]> = {
  open: ["under_review", "rejected"],
  under_review: ["escalated", "resolved", "rejected"],
  escalated: ["resolved", "rejected"],
  resolved: [],
  rejected: [],
};

const notices: Record<string, string> = {
  case_updated: "Status kasus diperbarui.",
  case_forbidden:
    "Kasus ini hanya dapat ditangani super-admin atau admin penangan transaksi.",
  case_closed: "Kasus sudah selesai/ditolak dan tidak dapat diubah lagi.",
  case_invalid: "Transisi status atau putusan tidak valid.",
  case_error: "Perubahan status kasus gagal. Coba lagi.",
  case_unavailable:
    "Fitur kasus belum aktif — migrasi database belum dijalankan.",
};

/**
 * Bundel bukti read-only untuk kasus eskalasi. Hanya super-admin atau
 * admin penangan transaksi. Tidak ada aksi ubah/hapus untuk pesan,
 * lokasi, KYC, atau sengketa di halaman ini — semuanya bukti.
 * Pembukaan bundel dicatat ke log audit.
 */
export default async function CaseBundle({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isStaff) return <AdminDenied />;

  let caseRow: {
    id: string;
    transaction_id: string;
    reported_by: string;
    category: string;
    reason: string;
    status: string;
    handler_id: string | null;
    resolution: string | null;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
  } | null = null;
  try {
    const { data, error } = await db
      .from("escalation_cases")
      .select(
        "id,transaction_id,reported_by,category,reason,status,handler_id,resolution,created_at,updated_at,resolved_at"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    caseRow = data;
  } catch {
    caseRow = null;
  }
  if (!caseRow) {
    return (
      <section className="dashmain">
        <h1>Kasus tidak ditemukan</h1>
        <p>
          Kasus belum ada atau fitur eskalasi belum aktif (migrasi belum
          dijalankan).
        </p>
        <Link className="btn secondary" href="/admin">
          Kembali ke panel admin
        </Link>
      </section>
    );
  }

  // Penangan: super-admin, atau admin penangan transaksi itu.
  let isHandler = roles.isSuperAdmin;
  if (!isHandler) {
    try {
      const { data } = await db.rpc("get_rekber_assignment", {
        p_transaction_id: caseRow.transaction_id,
      });
      isHandler =
        !!data && (data as { admin_id?: string }).admin_id === user.id;
    } catch {
      isHandler = false;
    }
  }
  if (!isHandler) {
    return (
      <section className="dashmain">
        <h1>Bundel bukti terbatas</h1>
        <p>
          Kasus ini hanya dapat dibuka super-admin atau admin penangan
          transaksi terkait. Status kasus dapat dilihat di panel admin.
        </p>
        <Link className="btn secondary" href="/admin">
          Kembali ke panel admin
        </Link>
      </section>
    );
  }

  let viewerName = "Staf";
  try {
    const { data } = await db
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (data?.display_name) viewerName = data.display_name;
  } catch {
    // Nama tampil apa adanya.
  }

  try {
    await db.rpc("log_rekber_access", {
      p_transaction_id: caseRow.transaction_id,
      p_action: "case_bundle_view",
      p_details: { case_id: caseRow.id },
    });
  } catch {
    // Pencatatan gagal bukan penghalang tampil.
  }

  const txId = caseRow.transaction_id;

  let tx: {
    id: string;
    title: string;
    amount: number;
    status: string;
    buyer_id: string;
    seller_id: string;
    created_at: string;
  } | null = null;
  try {
    const { data } = await db
      .from("transactions")
      .select("id,title,amount,status,buyer_id,seller_id,created_at")
      .eq("id", txId)
      .maybeSingle();
    tx = data;
  } catch {
    tx = null;
  }

  let messages: {
    id: string;
    sender_id: string;
    body: string;
    message_type: string | null;
    location_lat: number | null;
    location_lng: number | null;
    location_accuracy_m: number | null;
    location_shared_at: string | null;
    created_at: string;
  }[] = [];
  try {
    const { data, error } = await db
      .from("transaction_messages")
      .select(
        "id,sender_id,body,message_type,location_lat,location_lng,location_accuracy_m,location_shared_at,created_at"
      )
      .eq("transaction_id", txId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    messages = (data ?? []) as typeof messages;
  } catch {
    messages = [];
  }

  let events: {
    id: string;
    stage: number;
    action: string;
    actor_id: string | null;
    created_at: string;
  }[] = [];
  try {
    const { data, error } = await db
      .from("transaction_stage_events")
      .select("id,stage,action,actor_id,created_at")
      .eq("transaction_id", txId)
      .order("created_at", { ascending: true });
    if (!error) events = data ?? [];
  } catch {
    events = [];
  }

  let dispute: {
    reason: string;
    status: string;
    resolution: string | null;
  } | null = null;
  try {
    const { data } = await db
      .from("disputes")
      .select("reason,status,resolution")
      .eq("transaction_id", txId)
      .maybeSingle();
    dispute = data;
  } catch {
    dispute = null;
  }

  // Referensi KYC para pihak (status + tanggal saja di bundel; berkas
  // asli hanya lewat penampil bertanda air dengan log audit).
  type KycRef = {
    user_id: string;
    identity_document_type: string;
    identity_document_object_path: string;
    selfie_object_path: string | null;
    status: string;
    submitted_at: string;
    reviewed_at: string | null;
  };
  let kycRefs: KycRef[] = [];
  if (tx) {
    try {
      const { data, error } = await db
        .from("user_kyc_submissions")
        .select(
          "user_id,identity_document_type,identity_document_object_path,selfie_object_path,status,submitted_at,reviewed_at"
        )
        .in("user_id", [tx.buyer_id, tx.seller_id])
        .order("submitted_at", { ascending: false });
      if (!error && data) {
        const latest = new Map<string, KycRef>();
        for (const row of data as KycRef[]) {
          if (!latest.has(row.user_id)) latest.set(row.user_id, row);
        }
        kycRefs = [...latest.values()];
      }
    } catch {
      kycRefs = [];
    }
  }

  const nameMap = await loadDisplayNames(db, [
    tx?.buyer_id,
    tx?.seller_id,
    caseRow.reported_by,
    caseRow.handler_id,
    ...messages.map((m) => m.sender_id),
    ...events.map((e) => e.actor_id),
  ]);
  const displayName = (uid: string | null | undefined) =>
    displayNameFor(nameMap, user.id, uid);
  const viewedAt = new Date().toLocaleString("id-ID");
  const nextStatuses = NEXT_STATUSES[caseRow.status] ?? [];

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">BUNDEL BUKTI KASUS</small>
          <h1>
            Kasus eskalasi —{" "}
            {CASE_CATEGORY_LABELS[caseRow.category] ?? caseRow.category}
          </h1>
          <p>
            Dibuka oleh {displayName(caseRow.reported_by)} ·{" "}
            {new Date(caseRow.created_at).toLocaleString("id-ID")} · Status:{" "}
            {CASE_STATUS_LABELS[caseRow.status] ?? caseRow.status}
          </p>
        </div>
        <Link className="btn secondary" href="/admin">
          Kembali ke panel admin
        </Link>
      </header>

      <div className="notice">
        <div>
          <b>
            Akses tercatat — {viewerName} · {viewedAt}
          </b>
          <p>
            Pembukaan bundel ini dicatat di log audit. Bukti di bawah
            bersifat read-only dan tidak dapat diubah atau dihapus oleh
            pengguna. Laporan ditindaklanjuti sesuai hukum yang berlaku.
          </p>
        </div>
      </div>

      {query.notice && notices[query.notice] && (
        <div className="success rekber-message">{notices[query.notice]}</div>
      )}

      <section className="panel">
        <h2>Alasan laporan</h2>
        <p>{caseRow.reason}</p>
        {caseRow.resolution && (
          <p className="token-muted">Putusan: {caseRow.resolution}</p>
        )}
        {caseRow.handler_id && (
          <p className="token-muted">
            Ditangani oleh {displayName(caseRow.handler_id)}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Transaksi terkait</h2>
        {tx ? (
          <div className="tx-meta">
            <div>
              <small>JUDUL</small>
              <b>{tx.title}</b>
            </div>
            <div>
              <small>NOMINAL</small>
              <b>{money(tx.amount)}</b>
            </div>
            <div>
              <small>STATUS</small>
              <b>{REKBER_STATUS_LABELS[tx.status] ?? tx.status}</b>
            </div>
            <div>
              <small>BUYER</small>
              <b>{displayName(tx.buyer_id)}</b>
            </div>
            <div>
              <small>SELLER</small>
              <b>{displayName(tx.seller_id)}</b>
            </div>
          </div>
        ) : (
          <p className="token-muted">
            Transaksi tidak dapat dibaca (mungkin migrasi belum dijalankan).
          </p>
        )}
        {events.length > 0 && (
          <ol className="tx-timeline">
            {events.map((event) => (
              <li key={event.id}>
                <span className="tx-dot done" aria-hidden="true" />
                <div>
                  <b>
                    Tahap {event.stage} — {event.action}
                    {REKBER_STAGES[event.stage - 1]
                      ? ` (${REKBER_STAGES[event.stage - 1].title})`
                      : ""}
                  </b>
                  <small>
                    {`${displayName(event.actor_id)} · ${new Date(event.created_at).toLocaleString("id-ID")}`}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        )}
        {dispute && (
          <p className="token-muted">
            Sengketa: {dispute.status} — {dispute.reason}
            {dispute.resolution ? ` Putusan: ${dispute.resolution}` : ""}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Riwayat chat ({messages.length})</h2>
        {messages.length === 0 && (
          <p className="token-muted">
            Belum ada pesan, atau riwayat belum dapat dibaca.
          </p>
        )}
        <ol className="chat-list">
          {messages.map((message) => {
            const isLocation =
              message.message_type === "location" &&
              message.location_lat != null &&
              message.location_lng != null;
            const lat = message.location_lat ?? 0;
            const lng = message.location_lng ?? 0;
            return (
              <li key={message.id}>
                <small>
                  {displayName(message.sender_id)} ·{" "}
                  {new Date(message.created_at).toLocaleString("id-ID")}
                </small>
                {isLocation ? (
                  <div className="chat-location">
                    <iframe
                      title="Pratinjau lokasi yang dibagikan"
                      loading="lazy"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${(lng - 0.005).toFixed(6)}%2C${(lat - 0.005).toFixed(6)}%2C${(lng + 0.005).toFixed(6)}%2C${(lat + 0.005).toFixed(6)}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`}
                    />
                    <small>
                      Lokasi dibagikan{" "}
                      {message.location_shared_at
                        ? new Date(message.location_shared_at).toLocaleString("id-ID")
                        : ""}
                      {message.location_accuracy_m != null &&
                        `, akurasi ±${Math.round(message.location_accuracy_m)} m`}
                      {`, koordinat ${lat.toFixed(6)}, ${lng.toFixed(6)}`}
                    </small>
                  </div>
                ) : (
                  <p>{message.body}</p>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="panel">
        <h2>Referensi KYC para pihak</h2>
        <p>
          Hanya status dan tanggal — bukan berkas. Berkas asli hanya
          dibuka lewat penampil bertanda air dengan log audit, oleh staf
          yang berwenang.
        </p>
        {kycRefs.length === 0 && (
          <p className="token-muted">
            Belum ada referensi KYC, atau tabel KYC belum aktif.
          </p>
        )}
        {kycRefs.map((ref) => (
          <article key={ref.user_id} className="admin-item">
            <div>
              <b>{displayName(ref.user_id)}</b>
              <small>
                {`${ref.identity_document_type}, ${KYC_STATUS_LABELS[ref.status as KycStatus] ?? ref.status}, dikirim ${new Date(ref.submitted_at).toLocaleString("id-ID")}`}
                {ref.reviewed_at
                  ? `, ditinjau ${new Date(ref.reviewed_at).toLocaleString("id-ID")}`
                  : ""}
              </small>
              <p>
                <Link
                  href={`/admin/dokumen?path=${encodeURIComponent(ref.identity_document_object_path)}&ctx=case&tx=${txId}&caseId=${caseRow.id}`}
                >
                  Buka dokumen (penampil bertanda air)
                </Link>{" "}
                {ref.selfie_object_path && (
                  <Link
                    href={`/admin/dokumen?path=${encodeURIComponent(ref.selfie_object_path)}&ctx=case&tx=${txId}&caseId=${caseRow.id}`}
                  >
                    Buka swafoto (penampil bertanda air)
                  </Link>
                )}
              </p>
            </div>
          </article>
        ))}
      </section>

      {nextStatuses.length > 0 ? (
        <section className="panel">
          <h2>Ubah status penanganan</h2>
          <form action={updateRekberCaseStatus} className="rekber-form">
            <input type="hidden" name="case_id" value={caseRow.id} />
            <label>
              Status berikutnya
              <select name="status" required defaultValue="">
                <option value="" disabled>
                  Pilih status
                </option>
                {nextStatuses.map((status) => (
                  <option key={status} value={status}>
                    {CASE_STATUS_LABELS[status] ?? status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Putusan / catatan (wajib bila selesai atau ditolak)
              <textarea
                name="resolution"
                maxLength={2000}
                rows={3}
                placeholder="Contoh: diteruskan ke tim penindakan untuk proses hukum."
              />
            </label>
            <SubmitButton pendingLabel="Memperbarui…">
              Perbarui status kasus
            </SubmitButton>
          </form>
        </section>
      ) : (
        <div className="notice">
          <div>
            <b>Kasus sudah terminal</b>
            <p>
              Status {CASE_STATUS_LABELS[caseRow.status] ?? caseRow.status}{" "}
              tidak dapat diubah lagi. Kasus yang sudah selesai dapat
              dibuka ulang oleh pihak transaksi dari halaman detail.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
