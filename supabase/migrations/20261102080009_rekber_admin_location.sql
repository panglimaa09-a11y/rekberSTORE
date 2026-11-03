-- ============================================================================
-- RekberSTORE: lokasi admin (provinsi + kel/kecamatan) + pencari admin.
-- Dijalankan Tuan di SQL Editor SETELAH 20261102080008.
-- Idempotent. HANYA definisi di repo; tidak menyentuh data yang sudah ada.
--
-- 1. Dua kolom teks nullable di admin_qr_profiles (provinsi,
--    kel_kecamatan). Admin wajib mengisi keduanya di Profil Bisnis;
--    tanpa kabupaten/kota, tanpa GPS/koordinat, tanpa alamat persis.
--    Tabel admin_kyc_submissions TIDAK di-drop (riwayat tetap ada).
-- 2. update_rekber_admin_location(...): staf memperbarui lokasi pada
--    baris profil bisnis terkininya (pending_review/approved);
--    memvalidasi provinsi terhadap daftar tetap 38 provinsi dan
--    kel/kecamatan non-kosong; tanpa mengubah status/tinjauan.
--    TIDAK ada penjaga penugasan transaksi untuk lokasi: pemblokiran
--    sebelum menangani transaksi tidak pernah diputuskan untuk lokasi
--    (berbeda dengan URL sosmed) — lokasi hanya wajib di form +
--    pengingat, tanpa mengubah logika reserve/penugasan apa pun.
-- 3. list_rekber_admin_locations(): lokasi publik admin staf untuk
--    modul CARI ADMIN TERDEKAT. RLS admin_qr_profiles hanya membaca
--    baris sendiri/super_admin, jadi pembeli biasa tidak bisa melihat
--    lokasi admin lain tanpa fungsi security definer ini. Yang
--    dikembalikan hanya id + dua kolom lokasi dari baris profil
--    terkini tiap staf; tanpa path QR, URL sosmed, atau berkas bukti
--    apa pun.
-- ============================================================================
begin;

alter table public.admin_qr_profiles
  add column if not exists provinsi text,
  add column if not exists kel_kecamatan text;

create or replace function public.update_rekber_admin_location(
  p_provinsi text,
  p_kel_kecamatan text
)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_provinsi text := nullif(btrim(coalesce(p_provinsi, '')), '');
  v_kel text := nullif(btrim(coalesce(p_kel_kecamatan, '')), '');
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not (public.has_role(v_user_id, 'admin') or public.has_role(v_user_id, 'super_admin')) then
    raise exception 'NOT_STAFF';
  end if;
  if v_provinsi is null
    or v_provinsi not in (
      'Aceh', 'Bali', 'Banten', 'Bengkulu', 'DI Yogyakarta',
      'DKI Jakarta', 'Gorontalo', 'Jambi', 'Jawa Barat',
      'Jawa Tengah', 'Jawa Timur', 'Kalimantan Barat',
      'Kalimantan Selatan', 'Kalimantan Tengah', 'Kalimantan Timur',
      'Kalimantan Utara', 'Kepulauan Bangka Belitung',
      'Kepulauan Riau', 'Lampung', 'Maluku', 'Maluku Utara',
      'Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Papua',
      'Papua Barat', 'Papua Barat Daya', 'Papua Pegunungan',
      'Papua Selatan', 'Papua Tengah', 'Riau', 'Sulawesi Barat',
      'Sulawesi Selatan', 'Sulawesi Tengah', 'Sulawesi Tenggara',
      'Sulawesi Utara', 'Sumatera Barat', 'Sumatera Selatan',
      'Sumatera Utara'
    )
    or v_kel is null
    or length(v_kel) > 120 then
    raise exception 'INVALID_LOCATION';
  end if;

  select id into v_id
  from public.admin_qr_profiles
  where admin_user_id = v_user_id
    and status in ('pending_review', 'approved')
  order by submitted_at desc
  limit 1
  for update;

  if not found then
    raise exception 'NO_BUSINESS_PROFILE';
  end if;

  update public.admin_qr_profiles
  set provinsi = v_provinsi,
      kel_kecamatan = v_kel
  where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.update_rekber_admin_location(text, text) from public, anon;
grant execute on function public.update_rekber_admin_location(text, text) to authenticated;

create or replace function public.list_rekber_admin_locations()
returns table(admin_user_id uuid, provinsi text, kel_kecamatan text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select distinct on (q.admin_user_id)
    q.admin_user_id, q.provinsi, q.kel_kecamatan
  from public.admin_qr_profiles q
  where q.status in ('pending_review', 'approved')
    and (public.has_role(q.admin_user_id, 'admin')
      or public.has_role(q.admin_user_id, 'super_admin'))
  order by q.admin_user_id, q.submitted_at desc;
$$;

revoke all on function public.list_rekber_admin_locations() from public, anon;
grant execute on function public.list_rekber_admin_locations() to authenticated;

commit;
