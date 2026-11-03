import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import { buildNotifications } from "@/lib/notifications";

const kindLabels: Record<string, string> = {
  approval: "Persetujuan",
  dispute: "Sengketa",
  payment_claim: "Verifikasi pembayaran",
  topup: "Top up",
  kyc: "KYC",
  case: "Eskalasi",
  chat: "Chat",
};

export default async function Notifications() {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  const items = await buildNotifications(db, user.id, roles);

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">NOTIFIKASI</small>
          <h1>Notifikasi</h1>
          <p>
            Hal yang butuh tindakan Anda, diturunkan dari data transaksi,
            sengketa, pesanan, dan KYC. Tidak ada notifikasi email.
          </p>
        </div>
      </header>

      {items.length === 0 && (
        <div className="empty">
          <h3>Tidak ada notifikasi</h3>
          <p>
            Persetujuan, sengketa, klaim pembayaran, dan pesanan yang
            butuh tindakan akan muncul di sini.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <ol className="notif-list">
          {items.map((item) => (
            <li key={item.id} className={item.urgent ? "notif-urgent" : undefined}>
              <small>{kindLabels[item.kind] ?? item.kind}</small>
              <b>
                <Link href={item.href}>{item.title}</Link>
              </b>
              <p>{item.body}</p>
              <small>{new Date(item.createdAt).toLocaleString("id-ID")}</small>
            </li>
          ))}
        </ol>
      )}

      <div className="notice">
        <div>
          <b>Bukan status belum dibaca</b>
          <p>
            Daftar ini dihitung ulang dari data terbaru setiap dibuka;
            tidak ada penanda dibaca dan tidak ada pengiriman email.
          </p>
        </div>
      </div>
    </section>
  );
}
