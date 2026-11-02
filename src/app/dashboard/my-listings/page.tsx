import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export default async function MyListings() {
  const db = await supabaseServer();
  const {data:{user}} = await db.auth.getUser();
  if (!user) redirect("/login");

  const {data,error} = await db.from("marketplace_listings")
    .select("id,title,category,price,status")
    .eq("seller_id",user.id).order("created_at",{ascending:false});

  return <main className="market">
    <Link href="/dashboard">← Marketplace</Link>
    <h1>Listing Saya</h1>
    {error && <p>Jalankan migration marketplace di Supabase terlebih dahulu.</p>}
    <div className="market-listings">
      {data?.map(x=><Link className="market-card" key={x.id} href={"/dashboard/items/"+x.id}>
        <small>{x.category} · {x.status}</small><h3>{x.title}</h3>
        <strong>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(x.price)}</strong>
      </Link>)}
    </div>
    {!data?.length && !error && <p className="market-empty">Kamu belum memiliki listing.</p>}
  </main>;
}
