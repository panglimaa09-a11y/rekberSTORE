begin;

-- Wallet: saldo tersedia dan saldo yang sedang ditahan.
create table if not exists public.token_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  reserved_balance integer not null default 0 check (reserved_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.token_wallets
add column if not exists reserved_balance integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.token_wallets'::regclass
      and conname = 'token_wallets_reserved_balance_check'
  ) then
    alter table public.token_wallets
    add constraint token_wallets_reserved_balance_check
    check (reserved_balance >= 0);
  end if;
end;
$$;

-- Ledger mencatat semua perubahan saldo.
create table if not exists public.token_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null,
  amount integer not null check (amount > 0),
  balance_after integer not null check (balance_after >= 0),
  reference_type text,
  reference_id uuid,
  description text,
  created_at timestamptz not null default now()
);

alter table public.token_ledger
drop constraint if exists token_ledger_entry_type_check;

alter table public.token_ledger
add constraint token_ledger_entry_type_check
check (entry_type in (
  'topup',
  'reserve',
  'capture',
  'release',
  'spend',
  'refund',
  'adjustment'
));

create unique index if not exists token_ledger_unique_reference
on public.token_ledger(user_id, entry_type, reference_type, reference_id)
where reference_id is not null;

create index if not exists token_ledger_user_created
on public.token_ledger(user_id, created_at desc);

-- Pesanan top-up.
create table if not exists public.token_topup_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_tokens integer not null check (package_tokens in (1, 2, 4)),
  amount_idr integer not null check (
    (package_tokens = 1 and amount_idr = 5000) or
    (package_tokens = 2 and amount_idr = 10000) or
    (package_tokens = 4 and amount_idr = 15000)
  ),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'expired', 'cancelled')),
  provider text check (provider in ('midtrans', 'pakasir')),
  provider_reference text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- Satu hold untuk satu transaksi.
create table if not exists public.token_holds (
  transaction_id uuid primary key
    references public.transactions(id) on delete cascade,
  buyer_id uuid not null references auth.users(id),
  tokens integer not null default 2 check (tokens = 2),
  status text not null default 'reserved'
    check (status in ('reserved', 'captured', 'released')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  captured_at timestamptz,
  released_at timestamptz
);

create index if not exists token_holds_expiry
on public.token_holds(status, expires_at);

-- RLS.
alter table public.token_wallets enable row level security;
alter table public.token_ledger enable row level security;
alter table public.token_topup_orders enable row level security;
alter table public.token_holds enable row level security;

drop policy if exists token_wallet_select_own on public.token_wallets;
create policy token_wallet_select_own
on public.token_wallets for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists token_ledger_select_own on public.token_ledger;
create policy token_ledger_select_own
on public.token_ledger for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists token_topup_select_own on public.token_topup_orders;
create policy token_topup_select_own
on public.token_topup_orders for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists token_topup_create_own on public.token_topup_orders;
create policy token_topup_create_own
on public.token_topup_orders for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and provider is null
  and provider_reference is null
  and paid_at is null
);

drop policy if exists token_holds_select_own on public.token_holds;
create policy token_holds_select_own
on public.token_holds for select
to authenticated
using (buyer_id = (select auth.uid()));

revoke all on public.token_wallets from anon, authenticated;
grant select on public.token_wallets to authenticated;

revoke all on public.token_ledger from anon, authenticated;
grant select on public.token_ledger to authenticated;

revoke all on public.token_holds from anon, authenticated;
grant select on public.token_holds to authenticated;

revoke all on public.token_topup_orders from anon, authenticated;
grant select, insert on public.token_topup_orders to authenticated;

-- Wallet otomatis untuk akun baru.
create or replace function public.create_token_wallet_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.token_wallets(user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_token_wallet on auth.users;

create trigger on_auth_user_created_token_wallet
after insert on auth.users
for each row
execute function public.create_token_wallet_for_new_user();

insert into public.token_wallets(user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- Helper internal: lepaskan token yang masih ditahan.
create or replace function public.release_rekber_hold_internal(
  p_transaction_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hold public.token_holds%rowtype;
  v_balance integer;
  v_reserved integer;
begin
  select * into v_hold
  from public.token_holds
  where transaction_id = p_transaction_id
  for update;

  if not found then
    raise exception 'TOKEN_HOLD_NOT_FOUND';
  end if;

  select balance, reserved_balance
  into v_balance, v_reserved
  from public.token_wallets
  where user_id = v_hold.buyer_id
  for update;

  if not found then
    raise exception 'TOKEN_WALLET_NOT_FOUND';
  end if;

  if v_hold.status = 'released' then
    return v_balance;
  end if;

  if v_hold.status <> 'reserved' then
    raise exception 'TOKEN_HOLD_ALREADY_CAPTURED';
  end if;

  if v_reserved < v_hold.tokens then
    raise exception 'TOKEN_RESERVE_INVARIANT_FAILED';
  end if;

  update public.token_wallets
  set balance = balance + v_hold.tokens,
      reserved_balance = reserved_balance - v_hold.tokens,
      updated_at = now()
  where user_id = v_hold.buyer_id
  returning balance into v_balance;

  update public.token_holds
  set status = 'released',
      released_at = now()
  where transaction_id = p_transaction_id;

  insert into public.token_ledger(
    user_id, entry_type, amount, balance_after,
    reference_type, reference_id, description
  ) values (
    v_hold.buyer_id, 'release', v_hold.tokens, v_balance,
    'transaction', p_transaction_id, p_reason
  )
  on conflict do nothing;

  return v_balance;
end;
$$;

-- Helper internal: konversi token reserve menjadi biaya jasa Rekber.
create or replace function public.capture_rekber_hold_internal(
  p_transaction_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hold public.token_holds%rowtype;
  v_balance integer;
  v_reserved integer;
begin
  select * into v_hold
  from public.token_holds
  where transaction_id = p_transaction_id
  for update;

  if not found then
    raise exception 'TOKEN_HOLD_NOT_FOUND';
  end if;

  select balance, reserved_balance
  into v_balance, v_reserved
  from public.token_wallets
  where user_id = v_hold.buyer_id
  for update;

  if v_hold.status = 'captured' then
    return v_balance;
  end if;

  if v_hold.status <> 'reserved' then
    raise exception 'TOKEN_HOLD_NOT_RESERVED';
  end if;

  if v_reserved < v_hold.tokens then
    raise exception 'TOKEN_RESERVE_INVARIANT_FAILED';
  end if;

  update public.token_wallets
  set reserved_balance = reserved_balance - v_hold.tokens,
      updated_at = now()
  where user_id = v_hold.buyer_id;

  update public.token_holds
  set status = 'captured',
      captured_at = now()
  where transaction_id = p_transaction_id;

  insert into public.token_ledger(
    user_id, entry_type, amount, balance_after,
    reference_type, reference_id, description
  ) values (
    v_hold.buyer_id, 'capture', v_hold.tokens, v_balance,
    'transaction', p_transaction_id, 'Biaya jasa Rekber'
  )
  on conflict do nothing;

  return v_balance;
end;
$$;

-- Buat transaksi sekaligus menahan 2 token buyer.
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

-- Seller menerima atau menolak pengajuan.
create or replace function public.respond_rekber_transaction(
  p_transaction_id uuid,
  p_decision text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tx public.transactions%rowtype;
  v_hold public.token_holds%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if p_decision not in ('accept', 'reject') then
    raise exception 'INVALID_DECISION';
  end if;

  select * into v_tx
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found or v_tx.seller_id <> v_user_id then
    raise exception 'NOT_TRANSACTION_SELLER';
  end if;

  select * into v_hold
  from public.token_holds
  where transaction_id = p_transaction_id
  for update;

  if not found then
    raise exception 'TOKEN_HOLD_NOT_FOUND';
  end if;

  if v_tx.status <> 'awaiting_acceptance' then
    if p_decision = 'accept' and v_hold.status = 'captured' then
      return 'already_accepted';
    end if;

    if p_decision = 'reject' and v_hold.status = 'released' then
      return 'already_rejected';
    end if;

    raise exception 'TRANSACTION_NOT_PENDING';
  end if;

  if v_hold.status <> 'reserved' then
    raise exception 'TOKEN_HOLD_NOT_RESERVED';
  end if;

  if v_hold.expires_at <= now() then
    perform public.release_rekber_hold_internal(
      p_transaction_id,
      'Pengembalian token karena waktu persetujuan berakhir'
    );

    update public.transactions
    set status = 'cancelled'
    where id = p_transaction_id;

    return 'expired';
  end if;

  if p_decision = 'accept' then
    perform public.capture_rekber_hold_internal(p_transaction_id);

    update public.transactions
    set status = 'awaiting_payment_provider',
        seller_accepted_at = now()
    where id = p_transaction_id;

    return 'accepted';
  end if;

  perform public.release_rekber_hold_internal(
    p_transaction_id,
    'Seller menolak pengajuan transaksi'
  );

  update public.transactions
  set status = 'cancelled'
  where id = p_transaction_id;

  return 'rejected';
end;
$$;

-- Buyer dapat membatalkan pengajuan sebelum seller menyetujui.
create or replace function public.cancel_rekber_transaction(
  p_transaction_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tx public.transactions%rowtype;
  v_hold public.token_holds%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select * into v_tx
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found or v_tx.buyer_id <> v_user_id then
    raise exception 'NOT_TRANSACTION_BUYER';
  end if;

  if v_tx.status = 'cancelled' then
    return 'already_cancelled';
  end if;

  if v_tx.status <> 'awaiting_acceptance' then
    raise exception 'TRANSACTION_NOT_CANCELLABLE';
  end if;

  select * into v_hold
  from public.token_holds
  where transaction_id = p_transaction_id
  for update;

  if not found then
    raise exception 'TOKEN_HOLD_NOT_FOUND';
  end if;

  perform public.release_rekber_hold_internal(
    p_transaction_id,
    'Buyer membatalkan pengajuan transaksi'
  );

  update public.transactions
  set status = 'cancelled'
  where id = p_transaction_id;

  return 'cancelled';
end;
$$;

-- Kedaluwarsa diproses saat buyer atau seller membuka halaman transaksi.
create or replace function public.expire_my_rekber_holds()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tx record;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  for v_tx in
    select t.id
    from public.transactions t
    where t.status = 'awaiting_acceptance'
      and (t.buyer_id = v_user_id or t.seller_id = v_user_id)
      and exists (
        select 1
        from public.token_holds h
        where h.transaction_id = t.id
          and h.status = 'reserved'
          and h.expires_at <= now()
      )
    order by t.created_at
    for update
  loop
    perform public.release_rekber_hold_internal(
      v_tx.id,
      'Pengembalian token karena pengajuan kedaluwarsa'
    );

    update public.transactions
    set status = 'cancelled'
    where id = v_tx.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Nonaktifkan fungsi lama agar tidak ada jalur potong token kedua.
drop function if exists public.spend_rekber_fee(uuid);

-- Batasi akses fungsi internal.
revoke all on function public.release_rekber_hold_internal(uuid, text) from public, anon, authenticated;
revoke all on function public.capture_rekber_hold_internal(uuid) from public, anon, authenticated;

revoke all on function public.create_rekber_transaction_with_reserve(uuid) from public, anon;
revoke all on function public.respond_rekber_transaction(uuid, text) from public, anon;
revoke all on function public.cancel_rekber_transaction(uuid) from public, anon;
revoke all on function public.expire_my_rekber_holds() from public, anon;

grant execute on function public.create_rekber_transaction_with_reserve(uuid) to authenticated;
grant execute on function public.respond_rekber_transaction(uuid, text) to authenticated;
grant execute on function public.cancel_rekber_transaction(uuid) to authenticated;
grant execute on function public.expire_my_rekber_holds() to authenticated;

commit;