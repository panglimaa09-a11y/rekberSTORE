import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import AdminDenied from "@/components/AdminDenied";
import {
  CASE_CATEGORY_LABELS,
  CASE_STATUS_LABELS,
} from "@/lib/case-labels";
import {
  dateLabel,
  displayNameFor,
  loadDisplayNames,
} from "@/lib/admin-view";
import { isMissingRpcError } from "@/lib/rekber-stages";

/**
 * Antrean kasus eskalasi (dipindah dari halaman panel admin lama).
 * Bundel bukti (chat, lokasi, referensi KYC, timeline tahap) hanya
 * dibuka super-admin atau admin penangan transaksi — dan setiap
 * pembukaan tercatat di log audit.
 */
export default async function AdminCases() {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isStaff) return <AdminDenied />;

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

  const nameMap = await loadDisplayNames(db, [
    ...cases.map((c) => c.reported_by),
    ...cases.map((c) => c.handler_id),
  ]);
  const displayName = (uid: string | null | undefined) =>
    displayNameFor(nameMap, user.id, uid);

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">PANEL ADMIN</small>
          <h1>Kasus eskalasi ({cases.length})</h1>
          <p>
            Antrean laporan ke tim penindakan. Bundel bukti (chat,
            lokasi, referensi KYC, timeline tahap) hanya dibuka
            super-admin atau admin penangan transaksi — dan setiap
            pembukaan tercatat di log audit.
          </p>
        </div>
        <Link className="btn secondary" href="/admin">
          Kembali ke panel admin
        </Link>
      </header>

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
          <Link className="btn secondary" href={`/admin/kasus/${c.id}`}>
            Buka bundel bukti
          </Link>
        </article>
      ))}
    </section>
  );
}
