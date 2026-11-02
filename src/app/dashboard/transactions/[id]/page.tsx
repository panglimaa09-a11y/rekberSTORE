import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  respondToTransaction,
  cancelPendingTransaction,
} from "@/app/marketplace-actions";
import { supabaseServer } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";

const labels: Record<string, string> = {
  awaiting_acceptance: "Menunggu persetujuan seller",
  awaiting_payment_provider: "Disetujui — menunggu proses berikutnya",
  provider_payment_confirmed: "Pembayaran terkonfirmasi",
  item_delivery: "Proses penyerahan",
  buyer_inspection: "Pemeriksaan buyer",
  completed: "Selesai",
  disputed: "Dalam sengketa",
  refund_pending: "Menunggu penyelesaian refund",
  cancelled: "Dibatalkan",
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

type StageState = "done" | "current" | "blocked" | "pending";
type Stage = { title: string; note: string; state: StageState };

function buildStages(
  status: string,
  createdAt: string,
  sellerAcceptedAt?: string | null
): Stage[] {
  const created = dateLabel(createdAt) ?? "";
  const accepted = dateLabel(sellerAcceptedAt);
  const finished = status === "completed";
  const stopped = status === "cancelled";
  const inAdminFlow = [
    "awaiting_payment_provider",
    "provider_payment_confirmed",
    "item_delivery",
    "buyer_inspection",
    "completed",
    "disputed",
    "refund_pending",
  ].includes(status);

  const approval: Stage = stopped
    ? {
        title: "Tidak disetujui",
        note: "Transaksi tidak berlanjut ke tahap berikutnya. Token yang ditahan dikembalikan ke saldo buyer.",
        state: "blocked",
      }
    : status === "awaiting_acceptance"
      ? {
          title: "Menunggu persetujuan seller",
          note: "Seller memeriksa pengajuan. Token tetap ditahan sampai ada keputusan.",
          state: "current",
        }
      : {
          title: "Disetujui seller",
          note: accepted
            ? `Disetujui pada ${accepted}.`
            : "Seller menyetujui pengajuan ini.",
          state: "done",
        };

  const admin: Stage = stopped
    ? {
        title: "Tidak dilanjutkan",
        note: "Tahap penanganan admin tidak berjalan untuk transaksi ini.",
        state: "blocked",
      }
    : finished
      ? {
          title: "Selesai",
          note: "Transaksi diselesaikan melalui penanganan admin.",
          state: "done",
        }
      : inAdminFlow
        ? {
            title: "Ditangani admin",
            note: "Tahap penyerahan, pemeriksaan, dan penyelesaian ditangani admin. Belum ada tombol untuk tahap tersebut di workspace ini.",
            state: "current",
          }
        : {
            title: "Penanganan admin",
            note: "Tahap ini berjalan setelah seller menyetujui.",
            state: "pending",
          };

  return [
    {
      title: "Pengajuan dibuat",
      note: `Dibuat pada ${created}.`,
      state: "done",
    },
    {
      title: stopped ? "Token dikembalikan" : "Token ditahan",
      note: stopped
        ? "Dua token buyer yang ditahan dikembalikan ke saldo buyer."
        : "Dua token buyer ditahan untuk biaya jasa Rekber sejak pengajuan dibuat.",
      state: "done",
    },
    approval,
    admin,
  ];
}

export default async function TransactionDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
  if (!isBuyer && !isSeller) notFound();

  const role = isBuyer ? "Buyer" : "Seller";
  const stages = buildStages(item.status, item.created_at, item.seller_accepted_at);
  const shortId = (value: string) => value.slice(0, 8) + "…";

  return (
    <section className="dashmain">
      <Link href="/dashboard/transactions">Kembali ke daftar transaksi</Link>

      <div className="tx-head">
        <div>
          <small className="eyebrow">DETAIL TRANSAKSI</small>
          <h1>{item.title}</h1>
          <p>Anda bertindak sebagai {role.toLowerCase()} dalam transaksi ini.</p>
        </div>
        <span className="rekber-status">{labels[item.status] ?? item.status}</span>
      </div>

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
            <b>{isBuyer ? "Anda" : `ID ${shortId(item.buyer_id)}`}</b>
          </div>
          <div>
            <small>PENJUAL</small>
            <b>{isSeller ? "Anda" : `ID ${shortId(item.seller_id)}`}</b>
          </div>
        </div>
        {item.description && <p>{item.description}</p>}
      </section>

      <section className="panel">
        <h2>Tahapan transaksi</h2>
        <ol className="tx-timeline">
          {stages.map((stage) => (
            <li key={stage.title}>
              <span className={"tx-dot " + stage.state} aria-hidden="true" />
              <div>
                <b>{stage.title}</b>
                <small>{stage.note}</small>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {item.status === "awaiting_acceptance" && isSeller && (
        <section className="panel">
          <h2>Keputusan seller</h2>
          <p>
            Menyetujui berarti 2 token buyer dikonfirmasi sebagai biaya jasa
            Rekber. Menolak berarti token dikembalikan ke saldo buyer.
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

      <div className="notice">
        <div>
          <b>Tahap lanjutan ditangani admin</b>
          <p>
            Penyerahan barang, pemeriksaan buyer, penyelesaian, sengketa, dan
            refund belum memiliki tombol di workspace ini karena belum ada
            fungsi database yang mendukungnya. Tahap tersebut ditangani
            admin sesuai prosedur Rekber.
          </p>
        </div>
      </div>
    </section>
  );
}
