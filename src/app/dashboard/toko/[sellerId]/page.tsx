import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { loadDisplayNames, money } from "@/lib/admin-view";
import { listingImagePublicUrl } from "@/lib/listing-image";
import { requestTransaction } from "@/app/marketplace-actions";

/**
 * Halaman toko seller (v1, read-only). Header + statistik hanya dari data
 * nyata: nama lewat RPC display names yang sama dengan kartu browse
 * (fallback netral bila tidak terbaca), lencana staf lewat
 * list_rekber_staff_ids, statistik lewat get_rekber_store_stats
 * (migrasi 80005; bila belum dijalankan, statistik disembunyikan dan
 * grid tetap tampil). Tanpa "Bergabung sejak" (created_at profil tidak
 * terbaca lewat jalur yang sah) dan tanpa foto avatar (tidak ada jalur
 * URL avatar yang sah di kode) — avatar diganti blok inisial netral.
 */
export default async function Toko({ params }: { params: Promise<{ sellerId: string }> }) {
  const { sellerId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(sellerId)) notFound();

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const isOwn = sellerId === user.id;

  const { data: listings, error } = await db
    .from("marketplace_listings")
    .select("id,title,category,description,price,seller_id,created_at,image_path")
    .eq("seller_id", sellerId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(60);

  let isStaff = false;
  try {
    const { data: staff } = await db.rpc("list_rekber_staff_ids");
    if (Array.isArray(staff)) isStaff = staff.map(String).includes(sellerId);
  } catch {
    isStaff = false;
  }

  const nameMap = await loadDisplayNames(db, [sellerId]);
  const displayName = nameMap.get(sellerId) || "";
  const storeName = displayName || `Penjual ${sellerId.slice(0, 8)}`;
  const initial = (displayName || "P").trim().charAt(0).toUpperCase() || "P";

  type StoreStats = {
    active_listings: number;
    completed_sales: number;
    avg_stars: number | null;
    ratings_count: number;
  };
  let stats: StoreStats | null = null;
  try {
    const { data, error: statsError } = await db.rpc("get_rekber_store_stats", {
      p_seller_id: sellerId,
    });
    if (!statsError && data && data.length > 0) stats = data[0] as StoreStats;
  } catch {
    stats = null;
  }
  const hasRating =
    stats !== null &&
    stats.ratings_count > 0 &&
    stats.avg_stars !== null;

  const { url: supabaseUrl } = getSupabaseEnv();
  const items = listings ?? [];

  return (
    <section className="dashmain">
      <header className="store-head">
        <span className="store-avatar" aria-hidden="true">{initial}</span>
        <div>
          <h1>{storeName}</h1>
          <p className="shop-seller">
            {isOwn ? "Ini toko Anda." : "Toko penjual di marketplace RekberSTORE."}
            {isStaff ? " Rekber Terpilih." : ""}
          </p>
        </div>
      </header>

      {stats !== null && (
        <div className="store-stats" aria-label="Statistik toko">
          <div className="store-stat">
            <strong>{stats.active_listings}</strong>
            <span>Listing aktif</span>
          </div>
          <div className="store-stat">
            <strong>{stats.completed_sales}</strong>
            <span>Penjualan selesai</span>
          </div>
          {hasRating && (
            <div className="store-stat">
              <strong>★ {Number(stats.avg_stars).toFixed(2)}</strong>
              <span>{stats.ratings_count} penilaian</span>
            </div>
          )}
        </div>
      )}

      {error ? (
        <p>Database belum siap. Periksa migration Supabase.</p>
      ) : items.length === 0 ? (
        <p className="market-empty">Toko ini belum punya listing aktif.</p>
      ) : (
        <div className="shop-grid">
          {items.map((x) => {
            const imageUrl = listingImagePublicUrl(supabaseUrl, x.image_path);
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
                  <strong className="shop-price">{money(x.price)}</strong>
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
        </div>
      )}

      <p style={{ marginTop: 16 }}>
        <Link href="/dashboard/browse">← Kembali ke marketplace</Link>
      </p>
    </section>
  );
}
