import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import { resolveRekberDispute } from "@/app/rekber-actions";
import AdminDenied from "@/components/AdminDenied";
import SubmitButton from "@/components/SubmitButton";
import {
  dateLabel,
  displayNameFor,
  loadDisplayNames,
} from "@/lib/admin-view";

/**
 * Sengketa menunggu putusan (dipindah dari halaman panel admin lama
 * yang menumpuk semua section). Baca langsung; RLS mengizinkan staf.
 */
export default async function AdminDisputes() {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isStaff) return <AdminDenied />;

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

  const nameMap = await loadDisplayNames(
    db,
    disputes.map((d) => d.opened_by)
  );
  const displayName = (uid: string | null | undefined) =>
    displayNameFor(nameMap, user.id, uid);

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">PANEL ADMIN</small>
          <h1>Sengketa menunggu putusan ({disputes.length})</h1>
          <p>
            Sengketa yang diajukan buyer/seller, diputus admin penangan
            atau super-admin lewat RPC.
          </p>
        </div>
      </header>

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
  );
}
