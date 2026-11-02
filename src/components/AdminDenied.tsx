/**
 * Halaman penolakan untuk route staf. Jelas, bukan redirect diam-diam:
 * panel admin hanya untuk rekber terpilih yang didaftarkan Tuan
 * (super admin). Tidak ada pendaftaran admin publik dan tidak ada
 * promosi diri.
 */
export default function AdminDenied() {
  return (
    <section className="dashmain">
      <small className="eyebrow">AKSES DIBATASI</small>
      <h1>Panel admin hanya untuk rekber terpilih</h1>
      <p>
        RekberSTORE adalah layanan website untuk rekber terpilih. Admin
        di sini adalah para rekber yang sudah dikenal dan didaftarkan
        oleh Tuan ke platform — bukan pendaftar terbuka dan bukan staf
        platform. Tidak ada tombol daftar jadi admin.
      </p>

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
        <p>
          Setelah itu, Tuan menunjuk admin terpilih lewat panel ini
          dengan memasukkan email akun yang sudah terdaftar, lalu admin
          yang ditunjuk melengkapi profil dan QR bisnisnya.
        </p>
      </section>
    </section>
  );
}
