-- ============================================================================
-- RekberSTORE: agregat ringkasan pemilik (hanya angka, tanpa data privat).
-- Dijalankan Tuan di SQL Editor. Idempotent. HANYA definisi di repo;
-- tidak menyentuh data yang sudah ada.
--
-- Satu fungsi security definer minimal untuk halaman /pemilik/ringkasan:
-- RLS profiles hanya mengizinkan baca-diri dan RLS token hanya milik
-- sendiri, sehingga jumlah pengguna dan total saldo token TIDAK bisa
-- dihitung lewat select langsung oleh super_admin tanpa menghitung
-- kurang. Fungsi ini hanya mengembalikan agregat: jumlah pengguna,
-- jumlah admin, jumlah transaksi (total + selesai), sengketa terbuka,
-- listing (total + aktif), antrean tinjauan, pesanan top up lunas
-- (jumlah + total rupiah), dan token beredar/ditahan. Tanpa nama,
-- email, tanggal, atau isi transaksi. Guard super_admin di dalam
-- badan fungsi; grant hanya ke authenticated (pola sama seperti
-- list_rekber_admins dan appoint_rekber_admin).
--
-- Dependensi (terverifikasi terhadap supabase/schema.sql dan migrasi
-- 20261102070000/80000/80002): has_role(uid, role), auth.users,
-- user_roles, transactions(status enum transaction_status),
-- disputes(status enum dispute_status), marketplace_listings(status),
-- admin_qr_profiles + admin_kyc_submissions(status enum
-- review_status), token_topup_orders(status/amount_idr),
-- token_wallets(balance/reserved_balance), token_holds(status).
-- Sampai migrasi ini dijalankan, halaman ringkasan menampilkan
-- status "tidak tersedia" untuk setiap angka — bukan angka karangan.
-- ============================================================================
begin;

create or replace function public.get_rekber_owner_stats()
returns table(
  total_users bigint,
  total_admins bigint,
  total_transactions bigint,
  completed_transactions bigint,
  disputed_open bigint,
  total_listings bigint,
  active_listings bigint,
  pending_qr bigint,
  pending_kyc bigint,
  topup_paid_count bigint,
  topup_paid_total_idr bigint,
  topup_pending_count bigint,
  tokens_in_circulation bigint,
  tokens_reserved bigint
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not public.has_role(v_user_id, 'super_admin') then
    raise exception 'NOT_SUPER_ADMIN';
  end if;

  return query
  select
    (select count(*) from auth.users),
    (
      select count(distinct user_id)
      from public.user_roles
      where role in ('admin', 'super_admin')
    ),
    (select count(*) from public.transactions),
    (
      select count(*)
      from public.transactions t
      where t.status = 'completed'
    ),
    (
      select count(*)
      from public.disputes d
      where d.status = 'open'
    ),
    (select count(*) from public.marketplace_listings),
    (
      select count(*)
      from public.marketplace_listings l
      where l.status = 'active'
    ),
    (
      select count(*)
      from public.admin_qr_profiles q
      where q.status = 'pending_review'
    ),
    (
      select count(*)
      from public.admin_kyc_submissions k
      where k.status = 'pending_review'
    ),
    (
      select count(*)
      from public.token_topup_orders o
      where o.status = 'paid'
    ),
    (
      select coalesce(sum(o.amount_idr), 0)
      from public.token_topup_orders o
      where o.status = 'paid'
    ),
    (
      select count(*)
      from public.token_topup_orders o
      where o.status = 'pending'
    ),
    (
      select coalesce(sum(w.balance + w.reserved_balance), 0)
      from public.token_wallets w
    ),
    (
      select coalesce(sum(h.tokens), 0)
      from public.token_holds h
      where h.status = 'reserved'
    );
end;
$$;

revoke all on function public.get_rekber_owner_stats() from public, anon;
grant execute on function public.get_rekber_owner_stats() to authenticated;

commit;
