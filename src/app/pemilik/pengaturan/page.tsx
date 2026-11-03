import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import AdminDenied from "@/components/AdminDenied";
import { money } from "@/lib/admin-view";
import { TOKEN_PACKAGES } from "@/lib/token-packages";
import { isPakasirConfigured } from "@/lib/pakasir";

/**
 * Pengaturan pemilik (SUPER-ADMIN SAJA, READ-ONLY). Halaman ini
 * hanya menampilkan STATUS konfigurasi apa adanya: harga paket
 * token dari satu sumber yang sama dengan halaman top up, status
 * daftar game, dan status background. TIDAK ada kontrol edit harga
 * atau daftar game sampai Tuan memberi nilainya — mengubah di sini
 * tanpa persetujuan Tuan dilarang.
 */
export default async function OwnerSettings() {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isSuperAdmin) return <AdminDenied variant="pemilik" />;

  const pakasirConfigured = isPakasirConfigured();

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow eyebrow-owner">PANEL PEMILIK · READ-ONLY</small>
          <h1>Pengaturan</h1>
          <p>
            Status konfigurasi platform. Halaman ini tidak mengubah
            apa pun.
          </p>
        </div>
      </header>

      <section className="panel">
        <h2>Paket token</h2>
        <p>
          Harga paket apa adanya seperti yang dipakai halaman top up.
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Paket</th>
                <th>Token</th>
                <th>Harga</th>
              </tr>
            </thead>
            <tbody>
              {TOKEN_PACKAGES.map((item) => (
                <tr key={item.tokens}>
                  <td>{item.name}</td>
                  <td>{item.tokens} Token</td>
                  <td>{money(item.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="notice">
          <div>
            <b>Belum dikonfirmasi Tuan — belum bisa diubah</b>
            <p>
              Harga paket di atas belum dikonfirmasi Tuan. Perubahan
              harga hanya dilakukan setelah Tuan memberi nilai
              pastinya.
            </p>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Daftar game toko</h2>
        <p>
          Status: menunggu daftar nama game dari Tuan. Tidak ada nama
          game yang ditulis di platform sampai daftar tetapnya
          diberikan Tuan.
        </p>
        <div className="notice">
          <div>
            <b>Menunggu daftar nama game dari Tuan</b>
            <p>
              Toko game mencakup semua game, dengan daftar game tetap
              yang isinya ditentukan Tuan. Sampai daftar itu
              diberikan, filter per game belum dibangun.
            </p>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Background</h2>
        <p>Status aset background yang dipakai platform:</p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Aset</th>
                <th>Pemakaian</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <small>public/brand/landing-login-bg.png</small>
                </td>
                <td>Hero landing + halaman auth</td>
                <td>Menunggu unggahan; verifikasi visual belum dilakukan</td>
              </tr>
              <tr>
                <td>
                  <small>public/brand/dashboard-bg.png</small>
                </td>
                <td>Shell dashboard, admin, dan pemilik</td>
                <td>Menunggu unggahan; verifikasi visual belum dilakukan</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Gateway top up</h2>
        <p>
          Top up token hanya lewat Pakasir. Status konfigurasi server:{" "}
          <b>
            {pakasirConfigured ? "terkonfigurasi" : "belum dikonfigurasi"}
          </b>
          . Tanpa kunci Pakasir, pesanan top up tercatat menunggu dan
          saldo tidak bertambah.
        </p>
      </section>
    </section>
  );
}
