begin;

create table if not exists public.token_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.token_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (
    entry_type in ('topup', 'spend', 'refund', 'adjustment')
  ),
  amount integer not null check (amount > 0),
  balance_after integer not null check (balance_after >= 0),
  reference_type text,
  reference_id uuid,
  description text,
  created_at timestamptz not null default now()
);

create unique index if not exists token_ledger_unique_reference
on public.token_ledger(user_id, entry_type, reference_type, reference_id)
where reference_id is not null;

create index if not exists token_ledger_user_created
on public.token_ledger(user_id, created_at desc);

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

alter table public.token_wallets enable row level security;
alter table public.token_ledger enable row level security;
alter table public.token_topup_orders enable row level security;

drop policy if exists "token_wallet_select_own" on public.token_wallets;
create policy "token_wallet_select_own"
on public.token_wallets for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "token_ledger_select_own" on public.token_ledger;
create policy "token_ledger_select_own"
on public.token_ledger for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "token_topup_select_own" on public.token_topup_orders;
create policy "token_topup_select_own"
on public.token_topup_orders for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "token_topup_create_own" on public.token_topup_orders;
create policy "token_topup_create_own"
on public.token_topup_orders for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and provider is null
  and provider_reference is null
  and paid_at is null
);

-- Wallet otomatis dibuat untuk akun baru.
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
for each row execute function public.create_token_wallet_for_new_user();

-- Wallet untuk akun yang sudah terdaftar.
insert into public.token_wallets(user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- Potong 2 token dari buyer secara atomik dan idempotent.
create or replace function public.spend_rekber_fee(p_transaction_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_buyer_id uuid;
  v_balance integer;
  v_existing_balance integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select buyer_id
    into v_buyer_id
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found or v_buyer_id <> v_user_id then
    raise exception 'Only the transaction buyer can pay the Rekber fee';
  end if;

  select balance_after
    into v_existing_balance
  from public.token_ledger
  where user_id = v_user_id
    and entry_type = 'spend'
    and reference_type = 'transaction'
    and reference_id = p_transaction_id;

  if found then
    return v_existing_balance;
  end if;

  select balance
    into v_balance
  from public.token_wallets
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'Token wallet not found';
  end if;

  if v_balance < 2 then
    raise exception 'Insufficient token balance. Two tokens are required.';
  end if;

  update public.token_wallets
  set balance = balance - 2,
      updated_at = now()
  where user_id = v_user_id
  returning balance into v_balance;

  insert into public.token_ledger (
    user_id, entry_type, amount, balance_after,
    reference_type, reference_id, description
  ) values (
    v_user_id, 'spend', 2, v_balance,
    'transaction', p_transaction_id, 'Biaya jasa Rekber'
  );

  return v_balance;
end;
$$;

revoke all on function public.spend_rekber_fee(uuid) from public;
grant execute on function public.spend_rekber_fee(uuid) to authenticated;

revoke all on public.token_wallets from anon, authenticated;
grant select on public.token_wallets to authenticated;

revoke all on public.token_ledger from anon, authenticated;
grant select on public.token_ledger to authenticated;

revoke all on public.token_topup_orders from anon, authenticated;
grant select, insert on public.token_topup_orders to authenticated;

commit;