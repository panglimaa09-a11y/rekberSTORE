import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import {
  checkTopupStatus,
  createTokenTopupOrder,
  createTopupPaymentLink,
} from "@/app/token-actions";
import { isPakasirConfigured } from "@/lib/pakasir";
import { TOKEN_PACKAGES } from "@/lib/token-packages";
import SubmitButton from "@/components/SubmitButton";

const packages = TOKEN_PACKAGES;

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

/**
 * Baris ledger lama menyimpan deskripsi "Biaya jasa Rekber" dari
 * migrasi token. Istilah yang benar adalah biaya layanan website;
 * tampilkan dengan penamaan yang sudah dikoreksi tanpa mengubah
 * baris database yang sudah tercatat.
 */
const correctedDescription = (description: string | null) =>
  (description ?? "")
    .replaceAll("Penahanan biaya jasa Rekber", "Penahanan biaya layanan website")
    .replaceAll("Biaya jasa Rekber", "Biaya layanan website");

const ledgerLabels: Record<string, string> = {
  topup: "Top Up Token",
  reserve: "Token ditahan untuk transaksi",
  capture: "Biaya layanan website",
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
    notice?: string;
  }>
}) {
  const params = await searchParams;

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  if (!user) redirect("/login");

  const pakasirConfigured = isPakasirConfigured();

  // Proses kedaluwarsa jika ada hold yang melewati batas waktu.
  await db.rpc("expire_my_rekber_holds");

  const [
    { data: wallet, error: walletError },
    { data: ledger, error: ledgerError }
  ] = await Promise.all([
    db.from("token_wallets")
      .select("balance,reserved_balance")
      .eq("user_id", user.id)
      .maybeSingle(),

    db.from("token_ledger")
      .select("id,entry_type,amount,balance_after,description,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(15)
  ]);

  // Pesanan: kolom payment_link/provider_reference berasal dari migrasi
  // lanjutan; bila belum ada, ulangi tanpa kolom itu agar daftar tetap
  // tampil (tanpa tombol bayar) — bukan error halaman.
  type TopupOrderRow = {
    id: string;
    package_tokens: number;
    amount_idr: number;
    status: string;
    provider: string | null;
    provider_reference?: string | null;
    payment_link?: string | null;
    created_at: string;
    paid_at: string | null;
  };
  let orders: TopupOrderRow[] | null = null;
  let ordersError: { message: string } | null = null;
  const ordersFirst = await db
    .from("token_topup_orders")
    .select(
      "id,package_tokens,amount_idr,status,provider,provider_reference,payment_link,created_at,paid_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (ordersFirst.error) {
    const ordersRetry = await db
      .from("token_topup_orders")
      .select("id,package_tokens,amount_idr,status,provider,created_at,paid_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    orders = (ordersRetry.data ?? null) as TopupOrderRow[] | null;
    ordersError = ordersRetry.error;
  } else {
    orders = (ordersFirst.data ?? null) as TopupOrderRow[] | null;
  }

  return (
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
            Saldo bertambah setelah pembayaran terverifikasi; pesanan yang
            masih menunggu tidak menambah saldo.
          </div>
        )}

        {params.notice && (
          <div className="success rekber-message">
            {params.notice === "topup_paid"
              ? "Pembayaran terverifikasi. Token sudah dikreditkan ke wallet Anda."
              : params.notice === "already_paid"
              ? "Pesanan ini sudah lunas sebelumnya. Token tidak dikreditkan dua kali."
              : params.notice === "topup_failed"
              ? "Pembayaran dinyatakan gagal/kedaluwarsa oleh Pakasir. Buat pesanan baru bila masih ingin top up."
              : params.notice === "topup_pending"
              ? "Pembayaran belum terverifikasi. Coba periksa lagi setelah membayar."
              : params.notice === "topup_pending_sandbox"
              ? "Pembayaran belum terverifikasi (transaksi mode sandbox). Coba periksa lagi setelah membayar."
              : params.notice === "no_link"
              ? "Pesanan ini belum memiliki link bayar. Buat link bayar dari tombol di riwayat pesanan."
              : params.notice === "link_created"
              ? "Link bayar berhasil dibuat. Buka link bayar dari riwayat pesanan."
              : params.notice === "link_exists"
              ? "Pesanan ini sudah memiliki link bayar."
              : "Status pesanan diperbarui."}
          </div>
        )}

        {params.error && (
          <div className="alert rekber-message">
            {params.error === "insufficient"
              ? "Saldo tidak mencukupi. Silakan lakukan top up."
              : params.error === "invalid_package"
              ? "Paket token tidak valid."
              : params.error === "gateway_unconfigured"
              ? "Gateway pembayaran belum dikonfigurasi. Pesanan tetap tercatat menunggu; pembayaran aktif setelah kunci Pakasir dipasang."
              : params.error === "payment_link_failed"
              ? "Link bayar gagal dibuat. Pesanan tetap tercatat; coba buat link bayar lagi dari riwayat pesanan."
              : params.error === "status_check_failed"
              ? "Pemeriksaan status ke Pakasir gagal. Coba lagi beberapa saat."
              : params.error === "credit_failed"
              ? "Pembayaran lunas tetapi pengkreditan token gagal. Hubungi admin dengan ID pesanan Anda."
              : params.error === "order_not_found"
              ? "Pesanan tidak ditemukan atau bukan milik Anda."
              : params.error === "topup_unavailable"
              ? "Fitur top up otomatis belum aktif — migrasi database belum dijalankan."
              : "Pesanan gagal dibuat. Periksa database dan coba kembali."}
          </div>
        )}

        {!pakasirConfigured && (
          <div className="notice">
            <div>
              <b>Gateway pembayaran belum dikonfigurasi</b>
              <p>
                Pesanan top up tercatat menunggu dan saldo tidak bertambah
                sampai kunci Pakasir dipasang di konfigurasi server.
                Pembayaran top up hanya lewat Pakasir; dana transaksi
                tidak lewat provider.
              </p>
            </div>
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
                  <SubmitButton
                    type="submit"
                    className="token-order-button"
                    disabled={!!walletError || !wallet}
                    pendingLabel="Membuat pesanan…"
                  >
                    Buat Pesanan
                  </SubmitButton>
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
                    <th>Aksi</th>
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
                      <td>
                        {item.status === "pending" && item.payment_link && (
                          <span className="topup-actions">
                            <a
                              className="btn secondary"
                              href={item.payment_link}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Buka link bayar
                            </a>
                            <form action={checkTopupStatus}>
                              <input type="hidden" name="order_id" value={item.id} />
                              <SubmitButton pendingLabel="Memeriksa…">
                                Periksa status
                              </SubmitButton>
                            </form>
                          </span>
                        )}
                        {item.status === "pending" &&
                          !item.payment_link &&
                          pakasirConfigured && (
                            <form action={createTopupPaymentLink}>
                              <input type="hidden" name="order_id" value={item.id} />
                              <SubmitButton pendingLabel="Membuat…">
                                Buat link bayar
                              </SubmitButton>
                            </form>
                          )}
                        {item.status === "pending" &&
                          !item.payment_link &&
                          !pakasirConfigured && (
                            <small>Menunggu konfigurasi gateway</small>
                          )}
                        {item.status === "paid" && <small>Lunas</small>}
                      </td>
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
                        {item.description && <small>{correctedDescription(item.description)}</small>}
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
            <b>Pembayaran top up</b>
            <p>Pembelian token diproses lewat payment link Pakasir bila gateway sudah dikonfigurasi; bila belum, pesanan tercatat menunggu pembayaran dan saldo tidak bertambah. Dana transaksi tidak lewat provider — dibayar manual lewat QR bisnis rekber penangan. Token adalah biaya layanan website, terpisah dari dana transaksi.</p>
          </div>
        </div>
      </section>
  );
}