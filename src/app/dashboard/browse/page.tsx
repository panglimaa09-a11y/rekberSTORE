import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { KYC_ERROR_COPY } from "@/lib/kyc";
import { loadDisplayNames, displayNameFor } from "@/lib/admin-view";
import { listingImagePublicUrl } from "@/lib/listing-image";
import VerifiedBadge from "@/components/VerifiedBadge";
import { requestTransaction } from "@/app/marketplace-actions";

const categories = ["Gaming","Kreator","Komunitas","Bisnis digital","Aset digital lainnya"];

function pillHref(q: string, category: string | null) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  const query = params.toString();
  return query ? `/dashboard/browse?${query}` : "/dashboard/browse";
}

export default async function Browse({searchParams}: {
  searchParams: Promise<{q?:string;category?:string;error?:string}>
}) {
  const p = await searchParams;
  const db = await supabaseServer();
  const {data:{user}} = await db.auth.getUser();
  if (!user) redirect("/login");

  let query = db.from("marketplace_listings")
    .select("id,title,category,description,price,seller_id,created_at,image_path")
    .eq("status","active")
    .order("created_at",{ascending:false}).limit(60);

  if (categories.includes(p.category || "")) query = query.eq("category",p.category!);
  if (p.q) query = query.ilike("title",`%${p.q.replace(/[%_,]/g," ")}%`);

  const {data,error} = await query;

  // Penjual staf (lencana "Rekber Terpilih") + nama penjual. RPC belum
  // ada bila migrasi 80003 belum dijalankan: lencana absen, listing tetap tampil.
  let staffIds = new Set<string>();
  try {
    const { data: staff } = await db.rpc("list_rekber_staff_ids");
    if (Array.isArray(staff)) staffIds = new Set(staff.map(String));
  } catch {
    staffIds = new Set<string>();
  }
  const nameMap = await loadDisplayNames(db, (data ?? []).map((x) => x.seller_id));

  const items = [...(data ?? [])].sort((a, b) => {
    const aStaff = staffIds.has(a.seller_id) ? 0 : 1;
    const bStaff = staffIds.has(b.seller_id) ? 0 : 1;
    if (aStaff !== bStaff) return aStaff - bStaff;
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  const { url: supabaseUrl } = getSupabaseEnv();

  return <section className="dashmain">
    <h1>Marketplace</h1>
    <form className="market-search" action="/dashboard/browse">
      <input name="q" defaultValue={p.q} placeholder="Cari nama listing..."/>
      <button className="market-primary">Cari</button>
    </form>
    <div className="shop-pills" aria-label="Filter kategori">
      <Link href={pillHref(p.q || "", null)} className={!p.category ? "active" : undefined}>Semua</Link>
      {categories.map((c) => (
        <Link key={c} href={pillHref(p.q || "", c)} className={p.category === c ? "active" : undefined}>{c}</Link>
      ))}
    </div>
    {p.error === "unavailable" && <div className="alert rekber-message">Listing tidak tersedia atau sudah tidak aktif.</div>}
    {p.error === "own_listing" && <div className="alert rekber-message">Listing ini milik Anda, jadi tidak dapat diajukan sebagai transaksi.</div>}
    {p.error === "transaction" && <div className="alert rekber-message">Pengajuan transaksi gagal dibuat. Periksa saldo token, lalu coba lagi.</div>}
    {p.error && p.error.startsWith("kyc_") && <div className="alert rekber-message">{KYC_ERROR_COPY[p.error] ?? "KYC wajib sebelum bertransaksi."} <Link href="/dashboard/kyc">Buka halaman KYC</Link></div>}
    {error ? <p>Database belum siap. Periksa migration Supabase.</p> :
      <div className="shop-grid">
        {items.map((x) => {
          const isStaff = staffIds.has(x.seller_id);
          const imageUrl = listingImagePublicUrl(supabaseUrl, x.image_path);
          const isOwn = x.seller_id === user.id;
          return (
            <article className="shop-card" key={x.id}>
              <Link className="shop-hero" href={"/dashboard/items/" + x.id} aria-label={x.title}>
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt={x.title} loading="lazy" />
                ) : (
                  <span className="shop-hero-empty">{x.category}<br />Tanpa gambar</span>
                )}
                {isStaff && <span className="shop-badge">Rekber Terpilih</span>}
              </Link>
              <div className="shop-body">
                <small>{x.category}</small>
                <h3><Link href={"/dashboard/items/" + x.id}>{x.title}</Link></h3>
                <span className="shop-seller-line">
                  <Link className="shop-seller shop-seller-link" href={"/dashboard/toko/" + x.seller_id}>Penjual: {displayNameFor(nameMap, user.id, x.seller_id)}</Link>
                  <VerifiedBadge isStaff={isStaff} size="small" />
                </span>
                <strong className="shop-price">{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(x.price)}</strong>
                {isOwn ? (
                  <span className="shop-buy-note">Listing milik Anda</span>
                ) : (
                  <form action={requestTransaction}>
                    <input type="hidden" name="listing_id" value={x.id} />
                    <button className="shop-buy" type="submit">Beli</button>
                  </form>
                )}
              </div>
            </article>
          );
        })}
      </div>}
    {!data?.length && !error && <p className="market-empty">Belum ada listing yang cocok.</p>}
  </section>;
}
