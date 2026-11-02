import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requestTransaction } from "@/app/marketplace-actions";
import { supabaseServer } from "@/lib/supabase/server";

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

  return (
    <main className="market">
      <Link href="/dashboard/browse">← Kembali ke marketplace</Link>
      <section className="market-detail">
        <small>{item.category}</small>
        <h1>{item.title}</h1>
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
        ) : (
          <form action={requestTransaction}>
            <input type="hidden" name="listing_id" value={item.id} />
            <button className="market-primary">Ajukan Transaksi</button>
          </form>
        )}

        <p className="market-disclaimer">
          Pengajuan ini belum memproses pembayaran atau penampungan dana.
        </p>
      </section>
    </main>
  );
}