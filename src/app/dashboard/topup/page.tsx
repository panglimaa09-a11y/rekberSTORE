import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { logout } from "@/app/actions";
import { createTokenTopupOrder } from "@/app/token-actions";

const packages = [
  { tokens: 1, price: 5000, name: "Starter", detail: "Paket awal" },
  { tokens: 2, price: 10000, name: "Reguler", detail: "Satu biaya jasa Rekber" },
  { tokens: 4, price: 15000, name: "Hemat", detail: "Dua biaya jasa Rekber" }
];

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value || 0);

const orderLabels: Record<string, string> = {
  pending: "Menunggu pembayaran",
  paid: "Lunas",
  expired: "Kedaluwarsa",
  cancelled: "Dibatalkan"
};

const ledgerLabels: Record<string, string> = {
  topup: "Top Up Token",
  reserve: "Token ditahan untuk transaksi",
  capture: "Biaya jasa Rekber",
  release: "Pengembalian token",
  spend: "Penggunaan token",
  refund: "Pengembalian dana token",
  adjustment: "Penyesuaian saldo"
};

export default async function TokenTopup({
  searchParams
}: {
  searchParams: Promise<{
    created?: string;
    error?: string;
  }>
}) {
  const params = await searchParams;

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  if (!user) redirect("/login");

  // Proses kedaluwarsa jika ada hold yang melewati batas waktu.
  await db.rpc("expire_my_rekber_holds");

  const [
    { data: wallet, error: walletError },
    { data: orders, error: ordersError },
    { data: ledger, error: ledgerError }
  ] = await Promise.all([
    db.from("token_wallets")
      .select("balance,reserved_balance")
      .eq("user_id", user.id)
      .maybeSingle(),

    db.from("token_topup_orders")
      .select("id,package_tokens,amount_idr,status,provider,created_at,paid_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),

    db.from("token_ledger")
      .select("id,entry_type,amount,balance_after,description,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(15)
  ]);

  return (
    <main className="dash">
      <aside className="side">
        <Link className="brand" href="/">◈ Rekber<span>STORE</span></Link>

        <small>WORKSPACE</small>
        <Link href="/dashboard">▦ Dashboard</Link>
        <Link href="/dashboard/transactions">⇄ Transaksi Saya</Link>
        <Link className="selected" href="/dashboard/topup">◈ Top Up Token</Link>

        <small>LAYANAN</small>
        <Link href="/dashboard/browse">⌕ Marketplace</Link>
        <Link href="/dashboard/sell">＋ Pasang Penawaran</Link>
        <Link href="/dashboard/my-listings">▤ Penawaran Saya</Link>

        <small>AKUN</small>
        <Link href="/">Pusat Informasi</Link>

        <form action={logout}>
          <button className="logout" type="submit">Keluar dari akun</button>
        </form>
      </aside>

      <section className="dashmain">
        <header>
          <div>
            <small className="eyebrow">REKBERSTORE TOKEN WALLET</small>
            <h1>Top Up Token</h1>
            <p>Kelola saldo dan riwayat penggunaan token RekberSTORE.</p>
          </div>
          <Link className="btn secondary" href="/dashboard">Kembali</Link>
        </header>

        {params.created && (
          <div className="success rekber-message">
            Pesanan top up berhasil dibuat. ID pesanan: {params.created}.
            Pembayaran belum tersedia.
          </div>
        )}

        {params.error && (
          <div className="alert rekber-message">
            {params.error === "insufficient"
              ? "Saldo tidak mencukupi. Silakan lakukan top up."
              : params.error === "invalid_package"
              ? "Paket token tidak valid."
              : "Pesanan gagal dibuat. Periksa database dan coba kembali."}
          </div>
        )}

        <section className="token-balance">
          <div>
            <small>SALDO TERSEDIA</small>
            <strong>
              {walletError ? "—" : wallet?.balance ?? 0}
              <span> Token</span>
            </strong>
            <p>
              Token ditahan: {walletError ? "—" : wallet?.reserved_balance ?? 0}
            </p>
          </div>
          <div className="token-symbol">◈</div>
        </section>

        {(walletError || !wallet) && (
          <div className="notice">
            <div>
              <b>Wallet belum tersedia</b>
              <p>Pastikan migration token sudah berhasil dijalankan dan wallet pengguna sudah terbentuk.</p>
            </div>
          </div>
        )}

        <section className="panel">
          <small className="eyebrow">PILIH PAKET</small>
          <h2>Paket Top Up Token</h2>
          <p>Pilih paket yang ingin Anda pesan.</p>

          <div className="token-packages">
            {packages.map(item => (
              <article
                className={"token-package " + (item.tokens === 4 ? "token-featured" : "")}
                key={item.tokens}
              >
                <small>{item.name}</small>
                <strong>{item.tokens} <span>Token</span></strong>
                <h3>{money(item.price)}</h3>
                <p>{item.detail}</p>

                <form action={createTokenTopupOrder}>
                  <input
                    type="hidden"
                    name="package_tokens"
                    value={item.tokens}
                  />
                  <button
                    type="submit"
                    className="token-order-button"
                    disabled={!!walletError || !wallet}
                  >
                    Buat Pesanan
                  </button>
                </form>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Riwayat Pesanan Top Up</h2>

          {ordersError && (
            <p className="token-muted">Tidak dapat membaca pesanan top up.</p>
          )}

          {!ordersError && (!orders || orders.length === 0) && (
            <div className="empty">
              <h3>Belum ada pesanan top up</h3>
              <p>Pesanan yang dibuat akan muncul di sini.</p>
            </div>
          )}

          {orders && orders.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Paket</th>
                    <th>Harga</th>
                    <th>Status</th>
                    <th>Tanggal</th>
                    <th>ID Pesanan</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(item => (
                    <tr key={item.id}>
                      <td>{item.package_tokens} Token</td>
                      <td>{money(item.amount_idr)}</td>
                      <td>
                        <span className="rekber-status">
                          {orderLabels[item.status] ?? item.status}
                        </span>
                      </td>
                      <td>{new Date(item.created_at).toLocaleDateString("id-ID")}</td>
                      <td><small>{item.id}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Riwayat Aktivitas Token</h2>

          {ledgerError && (
            <p className="token-muted">Tidak dapat membaca riwayat token.</p>
          )}

          {!ledgerError && (!ledger || ledger.length === 0) && (
            <div className="empty">
              <h3>Belum ada aktivitas token</h3>
              <p>Top up dan penggunaan token akan tercatat di sini.</p>
            </div>
          )}

          {ledger && ledger.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Aktivitas</th>
                    <th>Jumlah</th>
                    <th>Saldo tersedia setelah aktivitas</th>
                    <th>Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map(item => (
                    <tr key={item.id}>
                      <td>
                        {ledgerLabels[item.entry_type] ?? item.entry_type}
                        {item.description && <small>{item.description}</small>}
                      </td>
                      <td>{item.amount} Token</td>
                      <td>{item.balance_after} Token</td>
                      <td>{new Date(item.created_at).toLocaleString("id-ID")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="notice">
          <div>
            <b>Pembayaran belum diaktifkan</b>
            <p>Pembuatan pesanan saat ini hanya mencatat permintaan ke database. Saldo tidak bertambah dari pesanan pending. Midtrans dan Pakasir belum dihubungkan.</p>
          </div>
        </div>
      </section>
    </main>
  );
}