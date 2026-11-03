-- ============================================================================
-- RekberSTORE: angka antrean hub panel admin (hanya angka, tanpa data
-- privat). Dijalankan Tuan di SQL Editor. Idempotent. HANYA definisi
-- di repo; tidak menyentuh data yang sudah ada.
--
-- Satu fungsi security definer minimal untuk badge antrean pada kartu
-- hub /admin: RLS admin_qr_profiles/admin_kyc_submissions hanya
-- mengizinkan baca-diri + super_admin, sehingga staf biasa tidak bisa
-- menghitung antrean tinjauan lewat select langsung. Fungsi ini hanya
-- mengembalikan agregat, tanpa nama, email, atau isi antrean.
-- Guard staf (admin/super_admin) di dalam badan fungsi; grant hanya
-- ke authenticated (pola sama seperti get_rekber_owner_stats,
-- migrasi 20261102080006). Antrean tinjauan QR/KYC dihitung hanya
-- untuk super_admin (0 untuk staf biasa — kartu itu memang tidak
-- tampil untuk staf biasa); antrean lain dihitung untuk semua staf.
--
-- Definisi antrean (sama dengan filter halaman masing-masing):
-- disputes_waiting = disputes berstatus open/under_review (halaman
--   /admin/sengketa); cases_open = escalation_cases yang belum
--   selesai/ditolak (open, under_review, escalated); user_kyc_pending
--   = user_kyc_submissions berstatus pending_review; topup_pending =
--   token_topup_orders berstatus pending; pending_qr/pending_kyc =
--   admin_qr_profiles/admin_kyc_submissions berstatus pending_review.
--
-- Dependensi (terverifikasi terhadap supabase/schema.sql dan migrasi
-- 20261102060000/80000/80002): has_role(uid, role), disputes(status
-- enum dispute_status), escalation_cases(status text),
-- user_kyc_submissions + admin_kyc_submissions + admin_qr_profiles
-- (status enum review_status), token_topup_orders(status text).
-- Sampai migrasi ini dijalankan, badge antrean hub menampilkan "—"
-- untuk setiap angka — bukan angka karangan.
-- ============================================================================
begin;

create or replace function public.get_rekber_admin_queue_counts()
returns table(
  disputes_waiting bigint,
  cases_open bigint,
  user_kyc_pending bigint,
  topup_pending bigint,
  pending_qr bigint,
  pending_kyc bigint
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_super boolean;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not (
    public.has_role(v_user_id, 'admin')
    or public.has_role(v_user_id, 'super_admin')
  ) then
    raise exception 'NOT_STAFF';
  end if;
  v_is_super := public.has_role(v_user_id, 'super_admin');

  return query
  select
    (
      select count(*)
      from public.disputes d
      where d.status in ('open', 'under_review')
    ),
    (
      select count(*)
      from public.escalation_cases c
      where c.status not in ('resolved', 'rejected')
    ),
    (
      select count(*)
      from public.user_kyc_submissions u
      where u.status = 'pending_review'
    ),
    (
      select count(*)
      from public.token_topup_orders o
      where o.status = 'pending'
    ),
    (
      case when v_is_super then
        (
          select count(*)
          from public.admin_qr_profiles q
          where q.status = 'pending_review'
        )
      else 0 end
    ),
    (
      case when v_is_super then
        (
          select count(*)
          from public.admin_kyc_submissions k
          where k.status = 'pending_review'
        )
      else 0 end
    );
end;
$$;

revoke all on function public.get_rekber_admin_queue_counts() from public, anon;
grant execute on function public.get_rekber_admin_queue_counts() to authenticated;

commit;
