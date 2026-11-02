import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateListing } from "@/app/marketplace-actions";
import { supabaseServer } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";

const categories = [
  "Gaming",
  "Kreator",
  "Komunitas",
  "Bisnis digital",
  "Aset digital lainnya",
];

const statusLabels: Record<string, string> = {
  active: "Aktif",
  paused: "Dijeda",
  sold: "Terjual",
  removed: "Dihapus",
};

const errorCopy: Record<string, string> = {
  invalid:
    "Data listing belum valid. Judul 5–100 karakter, deskripsi 20–3000 karakter, harga minimal Rp1.000, dan kategori harus dipilih.",
  database: "Perubahan gagal disimpan. Periksa koneksi dan coba lagi.",
};

export default async function EditListing({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const p = await searchParams;
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { data: item } = await db
    .from("marketplace_listings")
    .select("id,title,category,description,price,status")
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle();

  if (!item) notFound();

  const editable = item.status === "active" || item.status === "paused";

  return (
    <section className="dashmain">
      <Link href="/dashboard/my-listings">Kembali ke Listing Saya</Link>
      <h1>Ubah Listing</h1>
      <p>
        {item.title} · Status: {statusLabels[item.status] ?? item.status}
      </p>

      {!editable && (
        <div className="alert rekber-message">
          Listing dengan status {statusLabels[item.status] ?? item.status}{" "}
          tidak dapat diubah.
        </div>
      )}

      {editable && (
        <>
          {p.error && errorCopy[p.error] && (
            <div className="alert rekber-message">{errorCopy[p.error]}</div>
          )}
          <form action={updateListing} className="market-form">
            <input type="hidden" name="listing_id" value={item.id} />
            <label>
              Nama listing
              <input
                name="title"
                required
                minLength={5}
                maxLength={100}
                defaultValue={item.title}
              />
            </label>
            <label>
              Kategori
              <select name="category" required defaultValue={item.category}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Harga (Rupiah)
              <input
                name="price"
                type="number"
                min="1000"
                step="1000"
                required
                defaultValue={item.price}
              />
            </label>
            <label>
              Deskripsi
              <textarea
                name="description"
                minLength={20}
                maxLength={3000}
                required
                rows={6}
                defaultValue={item.description}
              />
            </label>
            <SubmitButton className="market-primary" pendingLabel="Menyimpan…">
              Simpan perubahan
            </SubmitButton>
          </form>
        </>
      )}
    </section>
  );
}
