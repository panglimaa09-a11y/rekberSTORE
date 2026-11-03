/**
 * Halaman penolakan untuk route staf/pemilik. Jelas, bukan redirect
 * diam-diam. Wording berparameter: varian "admin" untuk panel admin
 * (rekber terpilih), varian "pemilik" untuk panel pemilik (hanya
 * super admin/Tuan). Copy varian admin dipertahankan persis; logika
 * guard tidak ada di sini — pemanggil yang memutuskan.
 */
export default function AdminDenied({
  variant = "admin",
}: {
  variant?: "admin" | "pemilik";
}) {
  const isOwner = variant === "pemilik";
  const heading = isOwner
    ? "Panel pemilik hanya untuk Tuan"
    : "Panel admin hanya untuk rekber terpilih";
  const intro = isOwner
    ? "Panel pemilik hanya untuk super admin (Tuan). Rekber terpilih tetap bekerja lewat panel admin; ringkasan platform, keuangan, dan pengaturan hanya untuk pemilik platform."
    : "RekberSTORE adalah layanan website untuk rekber terpilih. Admin di sini adalah para rekber yang sudah dikenal dan didaftarkan oleh Tuan ke platform — bukan pendaftar terbuka dan bukan staf platform. Tidak ada tombol daftar jadi admin.";
  const closing = isOwner
    ? "Setelah itu, Tuan menunjuk admin terpilih lewat panel pemilik dengan memasukkan email akun yang sudah terdaftar, lalu admin yang ditunjuk melengkapi profil dan QR bisnisnya."
    : "Setelah itu, Tuan menunjuk admin terpilih lewat panel ini dengan memasukkan email akun yang sudah terdaftar, lalu admin yang ditunjuk melengkapi profil dan QR bisnisnya.";

  return (
    <section className="dashmain">
      <small className="eyebrow">AKSES DIBATASI</small>
      <h1>{heading}</h1>
      <p>{intro}</p>

      <section className="panel">
        <h2>Untuk Tuan (super admin)</h2>
        <p>
          Jadikan akun Tuan super admin dengan menjalankan SQL ini di
          Supabase SQL Editor (ganti email dengan email akun Tuan):
        </p>
        <pre className="sql-snippet">
{`insert into public.user_roles (user_id, role)
select id, 'super_admin' from auth.users
where lower(email) = lower('email-tuan@contoh.com')
on conflict (user_id, role) do nothing;`}
        </pre>
        <p>{closing}</p>
      </section>
    </section>
  );
}
