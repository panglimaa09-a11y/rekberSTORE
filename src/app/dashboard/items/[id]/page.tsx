import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requestTransaction } from "@/app/marketplace-actions";
import { supabaseServer } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { loadDisplayNames, displayNameFor } from "@/lib/admin-view";
import { listingImagePublicUrl } from "@/lib/listing-image";
import VerifiedBadge from "@/components/VerifiedBadge";
import SubmitButton from "@/components/SubmitButton";

export default async function Item({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  if (!user) redirect("/login");

  const { data: item } = await db
    .from("marketplace_listings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!item) notFound();

  let isStaffSeller = false;
  try {
    const { data: staff } = await db.rpc("list_rekber_staff_ids");
    if (Array.isArray(staff)) isStaffSeller = staff.map(String).includes(item.seller_id);
  } catch {
    isStaffSeller = false;
  }
  const nameMap = await loadDisplayNames(db, [item.seller_id]);
  const { url: supabaseUrl } = getSupabaseEnv();
  const imageUrl = listingImagePublicUrl(supabaseUrl, item.image_path);

  return (
    <section className="dashmain">
      <section className="market-detail">
        {imageUrl ? (
          <div className="shop-hero-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={item.title} />
            {isStaffSeller && <span className="shop-badge">Rekber Terpilih</span>}
          </div>
        ) : (
          <div className="shop-hero-lg">
            <span className="shop-hero-empty">{item.category}<br />Tanpa gambar</span>
            {isStaffSeller && <span className="shop-badge">Rekber Terpilih</span>}
          </div>
        )}
        <small>{item.category}</small>
        <h1>{item.title}</h1>
        <p className="shop-seller">
          Dijual oleh <Link className="shop-seller-link" href={"/dashboard/toko/" + item.seller_id}>{displayNameFor(nameMap, user.id, item.seller_id)}</Link>
          {isStaffSeller ? " · Rekber Terpilih" : ""}
          <VerifiedBadge isStaff={isStaffSeller} size="small" />
        </p>
        <h2>
          {new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            maximumFractionDigits: 0
          }).format(item.price)}
        </h2>
        <p>{item.description}</p>

        {item.seller_id === user.id ? (
          <p>Ini listing milikmu.</p>
        ) : item.status !== "active" ? (
          <p>Listing ini sedang tidak aktif dan tidak dapat diajukan.</p>
        ) : (
          <form action={requestTransaction}>
            <input type="hidden" name="listing_id" value={item.id} />
            <SubmitButton className="market-primary" pendingLabel="Mengajukan…">Ajukan Transaksi</SubmitButton>
          </form>
        )}

        <p className="market-disclaimer">
          Pengajuan ini belum memproses pembayaran atau penampungan dana.
        </p>
      </section>
    </section>
  );
}