import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  respondToTransaction,
  cancelPendingTransaction,
} from "@/app/marketplace-actions";
import {
  advanceRekberStage,
  openRekberDispute,
  resolveRekberDispute,
} from "@/app/rekber-actions";
import { supabaseServer } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";
import {
  REKBER_STAGES,
  REKBER_STATUS_LABELS,
  isMissingRpcError,
  stageFromStatus,
} from "@/lib/rekber-stages";

const notices: Record<string, string> = {
  stage_claimed:
    "Klaim pengiriman dana tercatat. Menunggu verifikasi admin penangan.",
  stage_confirmed: "Dana dikonfirmasi diterima dan ditahan oleh admin.",
  stage_delivered:
    "Penyerahan data/item tercatat. Buyer dapat memulai pemeriksaan.",
  stage_inspecting: "Pemeriksaan dimulai.",
  stage_inspected: "Pengecekan dinyatakan selesai.",
  stage_receipt: "Penerimaan dikonfirmasi buyer. Menunggu verifikasi admin.",
  stage_verified: "Admin memverifikasi penyelesaian.",
  stage_released:
    "Admin mengonfirmasi dana dikirim ke seller. Transaksi selesai.",
  stage_done: "Tahap ini sudah tercatat sebelumnya.",
  stage_unavailable:
    "Fitur tahap lanjutan belum aktif — migrasi database belum dijalankan.",
  delivery_message_required:
    "Kirim data/item lewat chat transaksi terlebih dahulu, lalu tandai sudah dikirim.",
  disputed: "Transaksi sedang dalam sengketa. Tahap ditunda sampai ada putusan.",
  action_error: "Tindakan gagal. Periksa status transaksi dan coba lagi.",
  dispute_opened:
    "Sengketa dibuka. Tahap ditunda sampai admin penangan memberi putusan.",
  dispute_open: "Sengketa sudah terbuka untuk transaksi ini.",
  dispute_invalid: "Alasan atau putusan sengketa tidak valid.",
  dispute_error: "Sengketa gagal diproses. Coba lagi.",
  dispute_resumed:
    "Sengketa diputus: transaksi dilanjutkan dari tahap berjalan.",
  dispute_refunded:
    "Sengketa diputus: pengembalian dana ditandai. Pengembalian uang ditangani manual oleh admin.",
  dispute_rejected:
    "Sengketa ditolak. Transaksi dilanjutkan dari tahap berjalan.",
  invalid: "Permintaan tidak valid.",
};

const money = (value: number, currency?: string | null) => {
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: currency || "IDR",
      maximumFractionDigits: 0,
    }).format(value || 0);
  } catch {
    return String(value || 0);
  }
};

const dateLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleString("id-ID") : null;

const shortId = (value: string) => value.slice(0, 8) + "…";

type StageState = "done" | "current" | "blocked" | "pending";

export default async function TransactionDetail({
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

  // Kedaluwarsa diproses saat halaman dibuka oleh salah satu pihak.
  await db.rpc("expire_my_rekber_holds");

  const { data: item } = await db
    .from("transactions")
    .select(
      "id,title,description,amount,currency,status,created_at,buyer_id,seller_id,buyer_accepted_at,seller_accepted_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (!item) notFound();

  const isBuyer = item.buyer_id === user.id;
  const isSeller = item.seller_id === user.id;

  const { data: roleRows } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const myRoles = (roleRows ?? []).map((r) => r.role as string);
  const isSuperAdmin = myRoles.includes("super_admin");

  // Admin penangan lewat RPC (tabel assignments tanpa policy SELECT).
  // Bila RPC belum ada (migrasi belum dijalankan), akses dibatasi ke
  // para pihak + super_admin dan panel admin menampilkan keadaan jujur.
  let assignment: {
    admin_id: string;
    admin_display_name: string;
    assigned_at: string;
  } | null = null;
  let assignmentMissing = false;
  try {
    const { data, error } = await db.rpc("get_rekber_assignment", {
      p_transaction_id: id,
    });
    if (error) {
      if (isMissingRpcError(error)) assignmentMissing = true;
    } else if (Array.isArray(data) && data.length > 0) {
      assignment = data[0];
    }
  } catch {
    assignment = null;
  }
  const isHandlingAdmin = assignment?.admin_id === user.id;
  if (!isBuyer && !isSeller && !isHandlingAdmin && !isSuperAdmin) notFound();

  // Kolom tahap dibaca terpisah agar halaman tetap hidup bila migrasi
  // belum dijalankan (kolom belum ada) — tahap diturunkan dari status.
  let stageValue: number | null = null;
  let claimedAt: string | null = null;
  let stageColumnMissing = false;
  try {
    const { data, error } = await db
      .from("transactions")
      .select("rekber_stage,buyer_payment_claimed_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    stageValue = typeof data?.rekber_stage === "number" ? data.rekber_stage : null;
    claimedAt = data?.buyer_payment_claimed_at ?? null;
  } catch {
    stageColumnMissing = true;
  }
  const stage = stageValue ?? stageFromStatus(item.status);

  // Riwayat aksi tahap (log append-only); kosong bila tabel belum ada.
  let events: {
    id: string;
    stage: number;
    action: string;
    actor_id: string | null;
    note: string | null;
    created_at: string;
  }[] = [];
  try {
    const { data, error } = await db
      .from("transaction_stage_events")
      .select("id,stage,action,actor_id,note,created_at")
      .eq("transaction_id", id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    events = data ?? [];
  } catch {
    events = [];
  }

  // Nama tampilan para aktor, satu panggilan batch.
  const nameMap = new Map<string, string>();
  try {
    const ids = Array.from(
      new Set(
        [
          item.buyer_id,
          item.seller_id,
          assignment?.admin_id,
          ...events.map((e) => e.actor_id),
        ].filter((v): v is string => !!v)
      )
    );
    if (ids.length > 0) {
      const { data, error } = await db.rpc("get_rekber_display_names", {
        p_user_ids: ids,
      });
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          nameMap.set(row.user_id, row.display_name || "");
        }
      }
    }
  } catch {
    // Nama tampil apa adanya; fallback ID pendek di bawah.
  }
  const displayName = (uid: string | null | undefined) => {
    if (!uid) return "—";
    if (uid === user.id) return "Anda";
    const name = nameMap.get(uid);
    return name ? name : `ID ${shortId(uid)}`;
  };

  // Sengketa terbuka (bila ada) — RLS mengizinkan pihak + staf membaca.
  let dispute: {
    id: string;
    opened_by: string;
    reason: string;
    status: string;
    resolution: string | null;
    resolved_by: string | null;
    created_at: string;
    resolved_at: string | null;
  } | null = null;
  try {
    const { data, error } = await db
      .from("disputes")
      .select(
        "id,opened_by,reason,status,resolution,resolved_by,created_at,resolved_at"
      )
      .eq("transaction_id", id)
      .maybeSingle();
    if (!error) dispute = data;
  } catch {
    dispute = null;
  }

  // QR bisnis admin penangan — hanya pada tahap 1 (pembayaran manual).
  // Signed URL privat; status tampil hanya bila QR sudah disetujui.
  let qrState: "ok" | "pending" | "none" | "unavailable" = "none";
  let qrSignedUrl: string | null = null;
  let qrMerchant = "";
  let qrProvider = "";
  if (stage === 1 && !stageColumnMissing) {
    try {
      const { data, error } = await db.rpc("get_rekber_admin_qr", {
        p_transaction_id: id,
      });
      if (error) throw error;
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      if (!row) {
        qrState = "none";
      } else if (row.qr_status !== "approved") {
        qrState = "pending";
        qrMerchant = row.merchant_display_name || "";
        qrProvider = row.merchant_provider || "";
      } else {
        qrMerchant = row.merchant_display_name || "";
        qrProvider = row.merchant_provider || "";
        const { data: signed, error: signError } = await db.storage
          .from("admin-private-documents")
          .createSignedUrl(row.qr_image_object_path, 3600);
        if (signError || !signed?.signedUrl) {
          qrState = "unavailable";
        } else {
          qrState = "ok";
          qrSignedUrl = signed.signedUrl;
        }
      }
    } catch {
      qrState = "unavailable";
    }
  }

  const closed = item.status === "cancelled" || item.status === "completed";
  const frozen = item.status === "disputed" || item.status === "refund_pending";
  const role = isBuyer
    ? "Buyer"
    : isSeller
      ? "Seller"
      : isHandlingAdmin
        ? "Admin penangan"
        : "Super admin";

  const stageState = (stageNo: number): StageState => {
    if (closed && item.status === "cancelled") {
      return stageNo <= stage ? "done" : "blocked";
    }
    if (stageNo < stage || item.status === "completed") return "done";
    if (stageNo === stage) return frozen ? "blocked" : "current";
    return "pending";
  };

  const canAct = (actor: string, stageNo: number) => {
    if (closed || frozen || stageColumnMissing) return false;
    if (stage !== stageNo) return false;
    if (actor === "buyer") return isBuyer;
    if (actor === "seller") return isSeller;
    if (actor === "admin") return isHandlingAdmin || isSuperAdmin;
    return false;
  };

  return (
    <section className="dashmain">
      <Link href="/dashboard/transactions">Kembali ke daftar transaksi</Link>

      <div className="tx-head">
        <div>
          <small className="eyebrow">DETAIL TRANSAKSI</small>
          <h1>{item.title}</h1>
          <p>
            Anda bertindak sebagai {role.toLowerCase()} dalam transaksi ini.
            {assignment && ` Admin penangan: ${displayName(assignment.admin_id)}.`}
            {!assignment && !assignmentMissing && " Belum ada admin penangan yang ditunjuk."}
          </p>
        </div>
        <span className="rekber-status">{REKBER_STATUS_LABELS[item.status] ?? item.status}</span>
      </div>

      {query.notice && notices[query.notice] && (
        <div className="success rekber-message">{notices[query.notice]}</div>
      )}

      {stageColumnMissing && (
        <div className="notice">
          <div>
            <b>Fitur tahap lanjutan belum aktif</b>
            <p>Migrasi database alur lengkap belum dijalankan. Persetujuan, penolakan, dan pembatalan tahap awal tetap berjalan; tombol tahap 1–8, chat, dan penilaian tampil setelah migrasi dijalankan.</p>
          </div>
        </div>
      )}

      <section className="panel">
        <h2>Rincian</h2>
        <div className="tx-meta">
          <div>
            <small>NILAI TRANSAKSI</small>
            <b>{money(item.amount, item.currency)}</b>
          </div>
          <div>
            <small>TANGGAL DIBUAT</small>
            <b>{dateLabel(item.created_at)}</b>
          </div>
          <div>
            <small>PEMBELI</small>
            <b>{isBuyer ? "Anda" : displayName(item.buyer_id)}</b>
          </div>
          <div>
            <small>PENJUAL</small>
            <b>{isSeller ? "Anda" : displayName(item.seller_id)}</b>
          </div>
          <div>
            <small>TAHAP SAAT INI</small>
            <b>{stage === 0 ? "Pengajuan" : `Tahap ${stage} dari 8`}</b>
          </div>
          <div>
            <small>ADMIN PENANGAN</small>
            <b>
              {assignment
                ? displayName(assignment.admin_id)
                : assignmentMissing
                  ? "Belum dapat dibaca"
                  : "Belum ditunjuk"}
            </b>
          </div>
        </div>
        {item.description && <p>{item.description}</p>}
      </section>

      <section className="panel">
        <h2>Tahapan transaksi</h2>
        <ol className="tx-timeline">
          <li>
            <span
              className={"tx-dot " + (item.status === "cancelled" ? "blocked" : "done")}
              aria-hidden="true"
            />
            <div>
              <b>Pengajuan dibuat</b>
              <small>
                {`Dibuat pada ${dateLabel(item.created_at) ?? ""}. Dua token buyer ditahan sebagai biaya layanan website.`}
              </small>
            </div>
          </li>
          {REKBER_STAGES.map((step) => {
            const state = stageState(step.stage);
            const actionable = canAct(step.actor, step.stage);
            return (
              <li key={step.stage}>
                <span className={"tx-dot " + state} aria-hidden="true" />
                <div>
                  <b>{`Tahap ${step.stage} — ${step.title}`}</b>
                  <small>{step.note}</small>
                  {step.stage === 1 && claimedAt && (
                    <small>
                      {`Klaim pengiriman dana tercatat pada ${dateLabel(claimedAt)}. Menunggu verifikasi admin penangan.`}
                    </small>
                  )}
                  {actionable && step.action && (
                    <form action={advanceRekberStage} className="tx-stage-action">
                      <input type="hidden" name="transaction_id" value={item.id} />
                      <input type="hidden" name="stage_action" value={step.action} />
                      <SubmitButton
                        className="btn"
                        pendingLabel="Memproses…"
                        disabled={step.action === "claim_payment" && !!claimedAt}
                      >
                        {step.actionLabel}
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {frozen && (
          <p className="tx-frozen-note">
            Tahap ditunda selama sengketa atau penyelesaian refund berjalan.
          </p>
        )}
      </section>

      {stage === 1 && !stageColumnMissing && (
        <section className="panel">
          <h2>Pembayaran manual — QR bisnis admin penangan</h2>
          {qrState === "none" && (
            <p>
              Belum ada admin penangan yang ditunjuk untuk transaksi ini, jadi
              QR bisnis belum dapat ditampilkan. Penunjukan dilakukan oleh
              super admin.
            </p>
          )}
          {qrState === "pending" && (
            <div className="notice">
              <div>
                <b>QR bisnis menunggu verifikasi</b>
                <p>
                  Profil QR bisnis {qrMerchant || "admin penangan"}
                  {qrProvider ? ` (${qrProvider})` : ""} belum disetujui.
                  Jangan mengirim dana sampai QR yang sudah disetujui tampil
                  di sini.
                </p>
              </div>
            </div>
          )}
          {qrState === "unavailable" && (
            <p>
              QR bisnis belum dapat ditampilkan. Coba muat ulang halaman;
              bila berlanjut, hubungi admin penangan.
            </p>
          )}
          {qrState === "ok" && qrSignedUrl && (
            <div className="qr-pay">
              {/* QR bisnis: signed URL privat kedaluwarsa — sengaja <img> agar tidak lewat optimizer gambar. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSignedUrl} alt="QR bisnis admin penangan" />
              <div>
                <p>
                  Pindai QR bisnis milik <b>{qrMerchant || "admin penangan"}</b>
                  {qrProvider ? ` (${qrProvider})` : ""} dan bayar{" "}
                  <b>{money(item.amount, item.currency)}</b>.
                </p>
                <p>
                  QR ini milik admin penangan transaksi ini. Gambar QR bukan
                  bukti pembayaran dan tidak mengesahkan penampungan dana.
                  Status berubah hanya setelah admin penangan memverifikasi
                  penerimaan di aplikasi QRIS/banknya sendiri.
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {item.status === "awaiting_acceptance" && isSeller && (
        <section className="panel">
          <h2>Keputusan seller</h2>
          <p>
            Menyetujui berarti 2 token buyer dikonfirmasi sebagai biaya
            layanan website. Menolak berarti token dikembalikan ke saldo buyer.
          </p>
          <div className="rekber-actions">
            <form action={respondToTransaction}>
              <input type="hidden" name="transaction_id" value={item.id} />
              <SubmitButton className="btn" name="decision" value="accept" pendingLabel="Menyetujui…">
                Setujui
              </SubmitButton>
            </form>
            <form action={respondToTransaction}>
              <input type="hidden" name="transaction_id" value={item.id} />
              <SubmitButton className="rekber-reject" name="decision" value="reject" pendingLabel="Menolak…">
                Tolak
              </SubmitButton>
            </form>
          </div>
        </section>
      )}

      {item.status === "awaiting_acceptance" && isBuyer && (
        <section className="panel">
          <h2>Pembatalan buyer</h2>
          <p>
            Membatalkan sebelum seller menyetujui berarti 2 token yang
            ditahan dikembalikan ke saldo Anda.
          </p>
          <form action={cancelPendingTransaction}>
            <input type="hidden" name="transaction_id" value={item.id} />
            <SubmitButton className="rekber-reject" pendingLabel="Membatalkan…">
              Batalkan transaksi
            </SubmitButton>
          </form>
        </section>
      )}

      {item.status === "disputed" && dispute && (
        <section className="panel">
          <h2>Sengketa</h2>
          <p>
            Dibuka oleh {displayName(dispute.opened_by)} pada{" "}
            {dateLabel(dispute.created_at)}.
          </p>
          <p>{dispute.reason}</p>
          {(isHandlingAdmin || isSuperAdmin) && (
            <form action={resolveRekberDispute} className="dispute-form">
              <input type="hidden" name="dispute_id" value={dispute.id} />
              <input type="hidden" name="transaction_id" value={item.id} />
              <label>
                Putusan admin
                <textarea
                  name="resolution"
                  required
                  minLength={5}
                  maxLength={2000}
                  rows={3}
                  placeholder="Tuliskan alasan putusan. Untuk refund: pengembalian uang ditangani manual di luar platform."
                />
              </label>
              <div className="rekber-actions">
                <SubmitButton className="btn" name="decision" value="resume" pendingLabel="Memutus…">
                  Lanjutkan transaksi
                </SubmitButton>
                <SubmitButton className="btn" name="decision" value="refund" pendingLabel="Memutus…">
                  Putuskan refund
                </SubmitButton>
                <SubmitButton className="rekber-reject" name="decision" value="reject" pendingLabel="Memutus…">
                  Tolak sengketa
                </SubmitButton>
              </div>
            </form>
          )}
        </section>
      )}

      {!closed && !frozen && stage >= 1 && stage <= 7 && (isBuyer || isSeller) && (
        <section className="panel">
          <h2>Ajukan sengketa</h2>
          <p>
            Sengketa menunda tahap sampai admin penangan memberi putusan.
            Jelaskan masalahnya dengan jelas.
          </p>
          <form action={openRekberDispute} className="dispute-form">
            <input type="hidden" name="transaction_id" value={item.id} />
            <label>
              Alasan sengketa
              <textarea
                name="reason"
                required
                minLength={10}
                maxLength={2000}
                rows={3}
                placeholder="Contoh: data yang dikirim tidak sesuai kategori yang dipilih."
              />
            </label>
            <SubmitButton className="rekber-reject" pendingLabel="Mengajukan…">
              Ajukan sengketa
            </SubmitButton>
          </form>
        </section>
      )}

      {item.status === "refund_pending" && (
        <div className="notice">
          <div>
            <b>Menunggu penyelesaian refund</b>
            <p>Pengembalian dana ditangani manual oleh admin penangan di luar platform. Biaya layanan website yang sudah dikonfirmasi tidak dikembalikan otomatis.</p>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <section className="panel">
          <h2>Riwayat tahap</h2>
          <ol className="tx-timeline">
            {events.map((event) => (
              <li key={event.id}>
                <span className="tx-dot done" aria-hidden="true" />
                <div>
                  <b>{`Tahap ${event.stage} — ${event.action}`}</b>
                  <small>
                    {`${displayName(event.actor_id)} · ${dateLabel(event.created_at) ?? ""}`}
                  </small>
                  {event.note && <small>{event.note}</small>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
