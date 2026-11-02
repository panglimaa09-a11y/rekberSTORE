import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const categories = ["Gaming","Kreator","Komunitas","Bisnis digital","Aset digital lainnya"];

export default async function Browse({searchParams}: {
  searchParams: Promise<{q?:string;category?:string;error?:string}>
}) {
  const p = await searchParams;
  const db = await supabaseServer();
  const {data:{user}} = await db.auth.getUser();
  if (!user) redirect("/login");

  let query = db.from("marketplace_listings")
    .select("id,title,category,description,price")
    .eq("status","active")
    .order("created_at",{ascending:false}).limit(60);

  if (categories.includes(p.category || "")) query = query.eq("category",p.category!);
  if (p.q) query = query.ilike("title",`%${p.q.replace(/[%_,]/g," ")}%`);

  const {data,error} = await query;

  return <section className="dashmain">
    <h1>Marketplace</h1>
    <form className="market-search" action="/dashboard/browse">
      <input name="q" defaultValue={p.q} placeholder="Cari nama listing..."/>
      <select name="category" defaultValue={p.category || ""}>
        <option value="">Semua kategori</option>
        {categories.map(c=><option key={c}>{c}</option>)}
      </select>
      <button className="market-primary">Cari</button>
    </form>
    {p.error === "unavailable" && <div className="alert rekber-message">Listing tidak tersedia atau sudah tidak aktif.</div>}
    {p.error === "own_listing" && <div className="alert rekber-message">Listing ini milik Anda, jadi tidak dapat diajukan sebagai transaksi.</div>}
    {p.error === "transaction" && <div className="alert rekber-message">Pengajuan transaksi gagal dibuat. Periksa saldo token, lalu coba lagi.</div>}
    {error ? <p>Database belum siap. Periksa migration Supabase.</p> :
      <div className="market-listings">
        {data?.map(x=><Link className="market-card" key={x.id}
          href={"/dashboard/items/"+x.id}>
          <small>{x.category}</small><h3>{x.title}</h3>
          <p>{x.description.slice(0,110)}</p>
          <strong>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(x.price)}</strong>
        </Link>)}
      </div>}
    {!data?.length && !error && <p className="market-empty">Belum ada listing yang cocok.</p>}
  </section>;
}
