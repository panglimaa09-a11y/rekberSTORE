-- ============================================================================
-- RekberSTORE: penugasan otomatis admin penjual + daftar id staf + daftar chat.
-- Dijalankan Tuan di SQL Editor SETELAH 20261102080000/20261102080001.
-- Idempotent. HANYA definisi di repo; tidak menyentuh data yang sudah ada.
--
-- 1. list_rekber_staff_ids(): id pengguna berperan admin/super_admin,
--    untuk lencana "Rekber Terpilih" di marketplace. RLS user_roles hanya
--    membaca baris sendiri, jadi UI tidak bisa membaca peran penjual lain
--    tanpa fungsi security definer ini. Yang dikembalikan hanya id
--    (id penjual memang sudah terlihat di listing); tanpa nama/email.
-- 2. create_rekber_transaction_with_reserve(): definisi ulang VERBATIM
--    dari 20261102070000 ditambah SATU blok: bila seller adalah
--    admin/super_admin kurasi, seller itu langsung menjadi penangan
--    transaksi (baris transaction_assignments, atomik bersama transaksi).
--    Jalur penunjukan manual (assign_rekber_admin) tidak berubah dan
--    tetap bisa mengganti penangan; pembelian dari seller biasa tidak
--    membuat penugasan apa pun. Tidak ada event tahap kustom yang
--    ditulis: timeline hanya mengenal kunci aksi yang sudah ada, dan
--    jalur pembuatan yang sekarang pun tidak mencatat event; penugasan
--    terlihat lewat get_rekber_assignment yang sudah ada.
-- 3. list_rekber_my_chats(): daftar chat transaksi pemanggil sebagai
--    buyer, seller, ATAU admin penangan (plus super_admin), beserta
--    pesan terakhir tiap transaksi. Tanpa RPC ini, penangan tidak
--    punya jalur daftar: RLS transactions hanya mengizinkan baca
--    buyer/seller/penangan lewat subquery, dan UI tidak bisa
--    memfilter penugasan dari sisi klien.
-- ============================================================================
begin;

create or replace function public.list_rekber_staff_ids()
returns uuid[]
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(user_id), '{}'::uuid[])
  from public.user_roles
  where role = 'admin'::public.app_role
     or role = 'super_admin'::public.app_role;
$$;

revoke all on function public.list_rekber_staff_ids() from public, anon;
grant execute on function public.list_rekber_staff_ids() to authenticated;

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
  if public.has_role(v_listing.seller_id, 'admin')
    or public.has_role(v_listing.seller_id, 'super_admin') then
    insert into public.transaction_assignments(transaction_id, admin_id, assigned_by)
    values (v_transaction_id, v_listing.seller_id, v_listing.seller_id)
    on conflict (transaction_id) where revoked_at is null do nothing;
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

create or replace function public.list_rekber_my_chats()
returns table(
  transaction_id uuid,
  title text,
  amount bigint,
  status text,
  rekber_stage smallint,
  buyer_id uuid,
  seller_id uuid,
  admin_id uuid,
  buyer_name text,
  seller_name text,
  admin_name text,
  last_body text,
  last_sender_id uuid,
  last_created_at timestamptz,
  created_at timestamptz
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

  return query
  select
    t.id,
    t.title,
    t.amount,
    t.status::text,
    t.rekber_stage,
    t.buyer_id,
    t.seller_id,
    a.admin_id,
    coalesce(bp.display_name, ''),
    coalesce(sp.display_name, ''),
    coalesce(ap.display_name, ''),
    m.body,
    m.sender_id,
    m.created_at,
    t.created_at
  from public.transactions t
  left join lateral (
    select a2.admin_id
    from public.transaction_assignments a2
    where a2.transaction_id = t.id and a2.revoked_at is null
    order by a2.assigned_at desc
    limit 1
  ) a on true
  left join public.profiles bp on bp.id = t.buyer_id
  left join public.profiles sp on sp.id = t.seller_id
  left join public.profiles ap on ap.id = a.admin_id
  left join lateral (
    select m2.body, m2.sender_id, m2.created_at
    from public.transaction_messages m2
    where m2.transaction_id = t.id
    order by m2.created_at desc, m2.id desc
    limit 1
  ) m on true
  where t.buyer_id = v_user_id
     or t.seller_id = v_user_id
     or a.admin_id = v_user_id
     or public.has_role(v_user_id, 'super_admin')
  order by coalesce(m.created_at, t.created_at) desc, t.created_at desc;
end;
$$;

revoke all on function public.list_rekber_my_chats() from public, anon;
grant execute on function public.list_rekber_my_chats() to authenticated;

commit;
