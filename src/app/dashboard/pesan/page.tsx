import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { REKBER_STATUS_LABELS, isMissingRpcError } from "@/lib/rekber-stages";
import { dateLabel } from "@/lib/admin-view";

type ChatRow = {
  transaction_id: string;
  title: string;
  amount: number;
  status: string;
  rekber_stage: number | null;
  buyer_id: string;
  seller_id: string;
  admin_id: string | null;
  buyer_name: string;
  seller_name: string;
  admin_name: string;
  last_body: string | null;
  last_sender_id: string | null;
  last_created_at: string | null;
  created_at: string;
};

const shortId = (value: string | null | undefined) =>
  value ? `ID ${value.slice(0, 8)}…` : "—";

const displayName = (name: string, uid: string, selfId: string) => {
  if (uid === selfId) return "Anda";
  return name ? name : shortId(uid);
};

export default async function Pesan({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  let rows: ChatRow[] = [];
  let rpcMissing = false;
  let loadError = false;
  try {
    const { data, error } = await db.rpc("list_rekber_my_chats");
    if (error) {
      if (isMissingRpcError(error)) rpcMissing = true;
      else loadError = true;
    } else {
      rows = (data ?? []) as ChatRow[];
    }
  } catch {
    loadError = true;
  }

  const modeQuery = params.mode ? `?mode=${params.mode}` : "";

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">CHAT TRANSAKSI</small>
          <h1>Pesan</h1>
          <p>
            Chat transaksi Anda sebagai buyer, seller, atau admin penangan.
            Pesan terbaru tampil paling atas.
          </p>
        </div>
        <Link className="btn secondary" href={"/dashboard" + modeQuery}>
          Kembali ke dashboard
        </Link>
      </header>

      {rpcMissing && (
        <div className="notice">
          <div>
            <b>Fitur chat belum aktif</b>
            <p>
              Migrasi database untuk daftar chat belum dijalankan. Chat tetap
              tersedia di dalam halaman detail tiap transaksi.
            </p>
          </div>
        </div>
      )}

      {loadError && !rpcMissing && (
        <div className="notice">
          <div>
            <b>Gagal membaca chat</b>
            <p>Periksa koneksi Supabase dan coba lagi.</p>
          </div>
        </div>
      )}

      {!rpcMissing && !loadError && rows.length === 0 && (
        <div className="empty">
          <h3>Belum ada chat transaksi</h3>
          <p>
            Chat muncul di sini setelah ada transaksi yang melibatkan akun
            Anda.
          </p>
          <Link className="btn" href="/dashboard/browse">
            Lihat penawaran
          </Link>
        </div>
      )}

      {rows.length > 0 && (
        <div className="pesan-list">
          {rows.map((row) => {
            const isBuyer = row.buyer_id === user.id;
            const isSeller = row.seller_id === user.id;
            const isHandler = row.admin_id === user.id;
            const role = isHandler
              ? "Penangan"
              : isSeller
                ? "Sebagai Seller"
                : isBuyer
                  ? "Sebagai Buyer"
                  : "Pengawasan";
            const counterpart = isHandler
              ? `Buyer: ${displayName(row.buyer_name, row.buyer_id, user.id)}, Seller: ${displayName(row.seller_name, row.seller_id, user.id)}`
              : isSeller
                ? `Buyer: ${displayName(row.buyer_name, row.buyer_id, user.id)}`
                : `Seller: ${displayName(row.seller_name, row.seller_id, user.id)}`;
            const handlerLine =
              row.admin_id && !isHandler
                ? `, Penangan: ${displayName(row.admin_name, row.admin_id, user.id)}`
                : "";
            const senderLabel =
              row.last_sender_id === user.id
                ? "Anda"
                : row.last_sender_id === row.admin_id && row.admin_id
                  ? `Penangan (${displayName(row.admin_name, row.admin_id, user.id)})`
                  : row.last_sender_id
                    ? displayName(
                        row.last_sender_id === row.buyer_id
                          ? row.buyer_name
                          : row.seller_name,
                        row.last_sender_id,
                        user.id
                      )
                    : null;
            const snippet = (row.last_body ?? "").slice(0, 90);
            return (
              <Link
                key={row.transaction_id}
                className="pesan-row"
                href={`/dashboard/transactions/${row.transaction_id}`}
              >
                <h3>{row.title}</h3>
                <div className="pesan-meta">
                  <b>{role}</b>
                  <span>{REKBER_STATUS_LABELS[row.status] ?? row.status}</span>
                  <span>
                    {new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: "IDR",
                      maximumFractionDigits: 0,
                    }).format(row.amount || 0)}
                  </span>
                </div>
                <p>
                  {counterpart}
                  {handlerLine}
                </p>
                {row.last_body ? (
                  <p>
                    {senderLabel ? `${senderLabel}: ` : ""}
                    {snippet}
                    {row.last_body.length > 90 ? "…" : ""}
                    {row.last_created_at
                      ? ` , ${dateLabel(row.last_created_at)}`
                      : ""}
                  </p>
                ) : (
                  <p>Belum ada pesan — buka chat untuk memulai.</p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
