import { notFound, redirect } from "next/navigation";
import { requestTransaction } from "@/app/marketplace-actions";
import { supabaseServer } from "@/lib/supabase/server";
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

  return (
    <section className="dashmain">
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