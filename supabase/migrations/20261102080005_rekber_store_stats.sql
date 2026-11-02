-- ============================================================================
-- RekberSTORE: agregat statistik toko seller (hanya angka, tanpa data privat).
-- Dijalankan Tuan di SQL Editor. Idempotent. HANYA definisi di repo;
-- tidak menyentuh data yang sudah ada.
--
-- Satu fungsi security definer minimal: RLS transactions hanya mengizinkan
-- baca oleh pihak transaksi, sehingga jumlah penjualan selesai seorang
-- seller TIDAK bisa dihitung lewat select langsung tanpa menghitung
-- kurang (hanya transaksi yang melibatkan pemanggil yang terlihat).
-- Fungsi ini hanya mengembalikan agregat: jumlah listing aktif, jumlah
-- penjualan selesai (seller + status completed), rata-rata bintang dan
-- jumlah penilai dari admin_ratings. Tanpa nama, email, tanggal, atau
-- isi transaksi. Rata-rata NULL bila belum ada penilaian.
-- ============================================================================
begin;

create or replace function public.get_rekber_store_stats(p_seller_id uuid)
returns table(
  active_listings bigint,
  completed_sales bigint,
  avg_stars numeric,
  ratings_count bigint
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    (
      select count(*)
      from public.marketplace_listings l
      where l.seller_id = p_seller_id
        and l.status = 'active'
    ),
    (
      select count(*)
      from public.transactions t
      where t.seller_id = p_seller_id
        and t.status = 'completed'
    ),
    (
      select round(avg(r.stars)::numeric, 2)
      from public.admin_ratings r
      where r.admin_id = p_seller_id
    ),
    (
      select count(*)
      from public.admin_ratings r
      where r.admin_id = p_seller_id
    );
$$;

revoke all on function public.get_rekber_store_stats(uuid) from public, anon;
grant execute on function public.get_rekber_store_stats(uuid) to authenticated;

commit;
