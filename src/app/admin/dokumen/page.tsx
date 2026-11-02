import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import AdminDenied from "@/components/AdminDenied";

const PATH_PATTERN = /^[0-9a-f-]{36}\/(qr|kyc)\/[^/]+$/i;

/**
 * Penampil berkas privat bertanda air untuk staf.
 *
 * - Hanya staf (admin/super_admin). Konteks kasus additionally mensyaratkan
 *   super_admin atau admin penangan transaksi itu.
 * - URL bertanda tangan berumur 5 menit, dibuat per tampilan; tidak ada
 *   tombol unduh dan tidak ada tautan berkas mentah di halaman ini
 *   selain sumber penampil itu sendiri.
 * - Setiap pembukaan dicatat ke log audit (log_rekber_access). Bila
 *   pencatatan gagal, peringatan jujur ditampilkan bersama berkas.
 * - Batas jujur: tangkapan layar tidak dapat dicegah sepenuhnya oleh
 *   aplikasi web mana pun. Perlindungan di sini adalah kontrol akses
 *   + URL berumur pendek + watermark + audit, bukan ketidakmungkinan
 *   mutlak.
 */
export default async function DocumentViewer({
  searchParams,
}: {
  searchParams: Promise<{
    path?: string;
    ctx?: string;
    tx?: string;
    caseId?: string;
  }>;
}) {
  const params = await searchParams;
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isStaff) {
    return <AdminDenied />;
  }

  const path = String(params.path ?? "");
  const ctx = String(params.ctx ?? "");
  const txId = String(params.tx ?? "");
  if (!PATH_PATTERN.test(path) || !["kyc_review", "qr_review", "case"].includes(ctx)) {
    return (
      <section className="dashmain">
        <h1>Berkas tidak valid</h1>
        <p>Path berkas atau konteks penampil tidak dikenali.</p>
      </section>
    );
  }

  if (ctx === "case") {
    let allowed = roles.isSuperAdmin;
    if (!allowed && txId) {
      const { data } = await db.rpc("get_rekber_assignment", {
        p_transaction_id: txId,
      });
      allowed = !!data && (data as { admin_id?: string }).admin_id === user.id;
    }
    if (!allowed) {
      return (
        <section className="dashmain">
          <h1>Akses bundel bukti terbatas</h1>
          <p>
            Berkas ini hanya dapat dibuka super-admin atau admin penangan
            transaksi terkait.
          </p>
        </section>
      );
    }
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

  let auditLogged = false;
  try {
    const { error } = await db.rpc("log_rekber_access", {
      p_transaction_id: txId || null,
      p_action: "document_view",
      p_details: { path, ctx, case_id: params.caseId ?? null },
    });
    auditLogged = !error;
  } catch {
    auditLogged = false;
  }

  const { data: signed, error: signedError } = await db.storage
    .from("admin-private-documents")
    .createSignedUrl(path, 300);
  if (signedError || !signed?.signedUrl) {
    return (
      <section className="dashmain">
        <h1>Berkas belum dapat dibuka</h1>
        <p>
          Fitur penampil berkas belum aktif — migrasi database belum
          dijalankan — atau berkas sudah tidak tersedia.
        </p>
      </section>
    );
  }

  const isPdf = path.toLowerCase().endsWith(".pdf");
  const viewedAt = new Date().toLocaleString("id-ID");
  const watermark = `Dilihat oleh ${viewerName} · ${viewedAt} · Akses tercatat di log audit`;

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">PENAMPIL BERKAS PRIVAT</small>
          <h1>Berkas {ctx === "kyc_review" ? "KYC" : ctx === "qr_review" ? "QR bisnis" : "bukti kasus"}</h1>
          <p>
            Berkas ini hanya untuk peninjauan staf. Tidak ada tombol
            unduh. URL penampil berumur 5 menit.
            {!auditLogged &&
              " Peringatan: pembukaan ini tidak tercatat di log audit (pencatatan gagal)."}
          </p>
        </div>
      </header>

      <div className="doc-viewer">
        <div className="doc-watermark" aria-hidden="true">
          <span>{watermark}</span>
          <span>{watermark}</span>
          <span>{watermark}</span>
        </div>
        {isPdf ? (
          <iframe
            title="Berkas PDF"
            src={signed.signedUrl}
            className="doc-viewer-frame"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- URL bertanda tangan privat berumur pendek; optimizer tidak boleh mem-proxynya.
          <img src={signed.signedUrl} alt="Berkas yang ditinjau" />
        )}
      </div>

      <div className="notice">
        <div>
          <b>Batas perlindungan</b>
          <p>
            Tangkapan layar tidak dapat dicegah sepenuhnya oleh aplikasi
            web mana pun. Perlindungan berkas ini adalah kontrol akses,
            URL berumur pendek, watermark identitas penampil, dan log
            audit — ditambah jalur hukum bila terjadi penyalahgunaan.
          </p>
        </div>
      </div>
    </section>
  );
}
