-- ============================================================================
-- RekberSTORE: URL sosmed admin (pengganti KYC dokumen) + penjaga
-- penugasan otomatis.
-- Dijalankan Tuan di SQL Editor SETELAH 20261102080007.
-- Idempotent. HANYA definisi di repo; tidak menyentuh data yang sudah ada.
--
-- 1. Empat kolom teks nullable di admin_qr_profiles (instagram_url,
--    facebook_url, tiktok_url, youtube_url). Admin mengisi URL sosmed
--    ASLI di Profil Bisnis; tidak ada lagi pengajuan KYC dokumen admin.
--    Tabel admin_kyc_submissions TIDAK di-drop (riwayat tetap ada).
-- 2. update_rekber_social_urls(...): staf memperbarui 4 URL pada baris
--    profil bisnis terkininya (pending_review/approved); memvalidasi
--    format https + host platform; tanpa mengubah status/tinjauan.
-- 3. create_rekber_transaction_with_reserve(): definisi ulang VERBATIM
--    dari 20261102080003 ditambah SATU penjaga: penugasan otomatis
--    hanya bila profil bisnis seller (admin/super_admin) punya minimal
--    SATU URL sosmed valid. Bila belum lengkap, transaksi tetap
--    terbentuk dan menunggu penunjukan manual super_admin; token dan
--    reserve tidak berubah.
-- ============================================================================
begin;

alter table public.admin_qr_profiles
  add column if not exists instagram_url text,
  add column if not exists facebook_url text,
  add column if not exists tiktok_url text,
  add column if not exists youtube_url text;

create or replace function public.update_rekber_social_urls(
  p_instagram_url text,
  p_facebook_url text,
  p_tiktok_url text,
  p_youtube_url text
)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_instagram text := nullif(btrim(coalesce(p_instagram_url, '')), '');
  v_facebook text := nullif(btrim(coalesce(p_facebook_url, '')), '');
  v_tiktok text := nullif(btrim(coalesce(p_tiktok_url, '')), '');
  v_youtube text := nullif(btrim(coalesce(p_youtube_url, '')), '');
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not (public.has_role(v_user_id, 'admin') or public.has_role(v_user_id, 'super_admin')) then
    raise exception 'NOT_STAFF';
  end if;
  if v_instagram is not null and v_instagram !~* '^https://(www\.)?instagram\.com/.+' then
    raise exception 'INVALID_SOCIAL_URL';
  end if;
  if v_facebook is not null and v_facebook !~* '^https://(www\.)?(facebook\.com|fb\.com)/.+' then
    raise exception 'INVALID_SOCIAL_URL';
  end if;
  if v_tiktok is not null and v_tiktok !~* '^https://(www\.)?tiktok\.com/.+' then
    raise exception 'INVALID_SOCIAL_URL';
  end if;
  if v_youtube is not null and v_youtube !~* '^https://(www\.)?(youtube\.com|youtu\.be)/.+' then
    raise exception 'INVALID_SOCIAL_URL';
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
  set instagram_url = v_instagram,
      facebook_url = v_facebook,
      tiktok_url = v_tiktok,
      youtube_url = v_youtube
  where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.update_rekber_social_urls(text, text, text, text) from public, anon;
grant execute on function public.update_rekber_social_urls(text, text, text, text) to authenticated;

create or replace function public.create_rekber_transaction_with_reserve(
  p_listing_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_listing record;
  v_balance integer;
  v_transaction_id uuid;
  v_social record;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select seller_id, title, price
  into v_listing
  from public.marketplace_listings
  where id = p_listing_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'LISTING_UNAVAILABLE';
  end if;

  if v_listing.seller_id = v_user_id then
    raise exception 'CANNOT_BUY_OWN_LISTING';
  end if;

  insert into public.token_wallets(user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select balance
  into v_balance
  from public.token_wallets
  where user_id = v_user_id
  for update;

  if v_balance < 2 then
    raise exception 'INSUFFICIENT_TOKENS';
  end if;

  insert into public.transactions(
    title,
    description,
    buyer_id,
    seller_id,
    amount,
    currency,
    status,
    buyer_accepted_at
  ) values (
    v_listing.title,
    'Pengajuan transaksi RekberSTORE.',
    v_user_id,
    v_listing.seller_id,
    v_listing.price,
    'IDR',
    'awaiting_acceptance',
    now()
  )
  returning id into v_transaction_id;

  -- Penugasan otomatis: seller yang juga admin/super_admin kurasi
  -- langsung menjadi penangan transaksi ini, tanpa menunggu penunjukan
  -- manual super_admin. Satu penangan aktif dijamin unique index
  -- one_active_assignment; konflik tidak mungkin untuk transaksi baru,
  -- do nothing hanya jaga idempotensi.
  -- Penjaga URL sosmed: penugasan otomatis hanya bila profil bisnis
  -- seller punya minimal satu URL sosmed valid. Bila belum lengkap,
  -- penugasan dilewati; transaksi tetap terbentuk dan menunggu
  -- penunjukan manual super_admin.
  if public.has_role(v_listing.seller_id, 'admin')
    or public.has_role(v_listing.seller_id, 'super_admin') then
    select instagram_url, facebook_url, tiktok_url, youtube_url
    into v_social
    from public.admin_qr_profiles
    where admin_user_id = v_listing.seller_id
      and status in ('pending_review', 'approved')
    order by submitted_at desc
    limit 1;

    if found and (
      v_social.instagram_url ~* '^https://(www\.)?instagram\.com/.+' or
      v_social.facebook_url ~* '^https://(www\.)?(facebook\.com|fb\.com)/.+' or
      v_social.tiktok_url ~* '^https://(www\.)?tiktok\.com/.+' or
      v_social.youtube_url ~* '^https://(www\.)?(youtube\.com|youtu\.be)/.+'
    ) then
      insert into public.transaction_assignments(transaction_id, admin_id, assigned_by)
      values (v_transaction_id, v_listing.seller_id, v_listing.seller_id)
      on conflict (transaction_id) where revoked_at is null do nothing;
    end if;
  end if;

  update public.token_wallets
  set balance = balance - 2,
      reserved_balance = reserved_balance + 2,
      updated_at = now()
  where user_id = v_user_id
  returning balance into v_balance;

  insert into public.token_holds(
    transaction_id, buyer_id, tokens, status, expires_at
  ) values (
    v_transaction_id, v_user_id, 2, 'reserved', now() + interval '24 hours'
  );

  insert into public.token_ledger(
    user_id, entry_type, amount, balance_after,
    reference_type, reference_id, description
  ) values (
    v_user_id, 'reserve', 2, v_balance,
    'transaction', v_transaction_id, 'Penahanan biaya jasa Rekber'
  );

  return v_transaction_id;
end;
$$;

revoke all on function public.create_rekber_transaction_with_reserve(uuid) from public, anon;
grant execute on function public.create_rekber_transaction_with_reserve(uuid) to authenticated;

commit;
