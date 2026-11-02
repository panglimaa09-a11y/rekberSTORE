import { redirect } from "next/navigation";
import { createListing } from "@/app/marketplace-actions";
import { supabaseServer } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";

const categories = [
  "Gaming",
  "Kreator",
  "Komunitas",
  "Bisnis digital",
  "Aset digital lainnya",
];

const errorCopy: Record<string, string> = {
  invalid:
    "Data listing belum valid. Judul 5–100 karakter, deskripsi 20–3000 karakter, harga minimal Rp1.000, kategori harus dipilih, dan pernyataan kepemilikan harus dicentang.",
  database:
    "Listing gagal disimpan. Periksa koneksi dan coba lagi.",
};

export default async function Sell({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const p = await searchParams;
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  return (
    <section className="dashmain">
      <h1>Jual Akun / Aset Digital</h1>
      <p>Buat listing dengan informasi yang benar dan jelas.</p>

      {p.error && errorCopy[p.error] && (
        <div className="alert rekber-message">{errorCopy[p.error]}</div>
      )}

      <form action={createListing} className="market-form">
        <label>Nama listing<input name="title" required minLength={5} maxLength={100}/></label>
        <label>Kategori<select name="category" required defaultValue="">
          <option value="" disabled>Pilih kategori</option>
          {categories.map(c=><option key={c}>{c}</option>)}
        </select></label>
        <label>Harga (Rupiah)<input name="price" type="number" min="1000" step="1000" required/></label>
        <label>Deskripsi<textarea name="description" minLength={20} maxLength={3000} required rows={6}/></label>
        <label className="market-check"><input type="checkbox" name="ownership" value="yes" required/> Saya memiliki hak untuk menjual dan mengalihkan aset ini.</label>
        <SubmitButton className="market-primary" pendingLabel="Menerbitkan…">Terbitkan Listing</SubmitButton>
      </form>
      <p className="market-disclaimer">Jangan masukkan password, OTP, recovery code, atau data identitas ke listing.</p>
    </section>
  );
}
