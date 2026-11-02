import Link from "next/link";
import { redirect } from "next/navigation";
import { setListingStatus } from "@/app/marketplace-actions";
import { supabaseServer } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";

const statusLabels: Record<string, string> = {
  active: "Aktif",
  paused: "Dijeda",
  sold: "Terjual",
  removed: "Dihapus",
};

const noticeCopy: Record<string, string> = {
  updated: "Listing berhasil diubah.",
  paused: "Listing dijeda. Listing tidak tampil di marketplace sampai diaktifkan lagi.",
  resumed: "Listing diaktifkan lagi.",
};

const errorCopy: Record<string, string> = {
  invalid: "Permintaan tidak valid.",
  database: "Perubahan gagal disimpan. Periksa koneksi dan coba lagi.",
};

export default async function MyListings({searchParams}: {
  searchParams: Promise<{success?:string;notice?:string;error?:string}>
}) {
  const p = await searchParams;
  const db = await supabaseServer();
  const {data:{user}} = await db.auth.getUser();
  if (!user) redirect("/login");

  const {data,error} = await db.from("marketplace_listings")
    .select("id,title,category,price,status")
    .eq("seller_id",user.id).order("created_at",{ascending:false});

  return <section className="dashmain">
    <h1>Listing Saya</h1>
    {p.success === "1" && <div className="success rekber-message">Listing berhasil diterbitkan.</div>}
    {p.notice && noticeCopy[p.notice] && <div className="success rekber-message">{noticeCopy[p.notice]}</div>}
    {p.error && errorCopy[p.error] && <div className="alert rekber-message">{errorCopy[p.error]}</div>}
    {error && <p>Jalankan migration marketplace di Supabase terlebih dahulu.</p>}
    <div className="market-listings">
      {data?.map(x=>{
        const manageable = x.status === "active" || x.status === "paused";
        return <article className="market-card" key={x.id}>
          <small>{x.category} · {statusLabels[x.status] ?? x.status}</small>
          <h3><Link href={"/dashboard/items/"+x.id}>{x.title}</Link></h3>
          <strong>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(x.price)}</strong>
          {manageable && <div className="rekber-actions">
            <Link className="btn" href={"/dashboard/my-listings/"+x.id+"/edit"}>Ubah</Link>
            <form action={setListingStatus}>
              <input type="hidden" name="listing_id" value={x.id}/>
              <input type="hidden" name="status" value={x.status === "active" ? "paused" : "active"}/>
              <SubmitButton className="rekber-reject" pendingLabel="Memproses…">
                {x.status === "active" ? "Jeda" : "Aktifkan"}
              </SubmitButton>
            </form>
          </div>}
        </article>;
      })}
    </div>
    {!data?.length && !error && <p className="market-empty">Kamu belum memiliki listing.</p>}
  </section>;
}
