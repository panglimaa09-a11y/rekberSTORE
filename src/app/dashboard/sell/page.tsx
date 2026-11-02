import Link from "next/link";
import { redirect } from "next/navigation";
import { createListing } from "@/app/marketplace-actions";
import { supabaseServer } from "@/lib/supabase/server";

export default async function Sell() {
  const db = await supabaseServer();
  const {data:{user}} = await db.auth.getUser();
  if (!user) redirect("/login");

  return <main className="market">
    <Link href="/dashboard">← Marketplace</Link>
    <h1>Jual Akun / Aset Digital</h1>
    <p>Buat listing dengan informasi yang benar dan jelas.</p>
    <form action={createListing} className="market-form">
      <label>Nama listing<input name="title" required minLength={5} maxLength={100}/></label>
      <label>Kategori<select name="category" required defaultValue="">
        <option value="" disabled>Pilih kategori</option>
        {["Gaming","Kreator","Komunitas","Bisnis digital","Aset digital lainnya"].map(c=><option key={c}>{c}</option>)}
      </select></label>
      <label>Harga (Rupiah)<input name="price" type="number" min="1000" step="1000" required/></label>
      <label>Deskripsi<textarea name="description" minLength={20} maxLength={3000} required rows={6}/></label>
      <label className="market-check"><input type="checkbox" name="ownership" value="yes" required/> Saya memiliki hak untuk menjual dan mengalihkan aset ini.</label>
      <button className="market-primary">Terbitkan Listing</button>
    </form>
    <p className="market-disclaimer">Jangan masukkan password, OTP, recovery code, atau data identitas ke listing.</p>
  </main>;
}
