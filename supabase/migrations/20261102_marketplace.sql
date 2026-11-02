create table if not exists public.marketplace_listings (
 id uuid primary key default gen_random_uuid(),
 seller_id uuid not null references auth.users(id) on delete cascade,
 category text not null check(category in
 ('Gaming','Kreator','Komunitas','Bisnis digital','Aset digital lainnya')),
 title text not null check(char_length(title) between 5 and 100),
 description text not null check(char_length(description) between 20 and 3000),
 price bigint not null check(price >= 1000),
 ownership_confirmed boolean not null default false,
 status text not null default 'active'
   check(status in ('active','paused','sold','removed')),
 created_at timestamptz not null default now()
);

create index if not exists marketplace_active_created
on public.marketplace_listings(status,created_at desc);

alter table public.marketplace_listings enable row level security;

drop policy if exists marketplace_read on public.marketplace_listings;
create policy marketplace_read on public.marketplace_listings
for select to authenticated
using(status='active' or seller_id=auth.uid());

drop policy if exists marketplace_insert on public.marketplace_listings;
create policy marketplace_insert on public.marketplace_listings
for insert to authenticated
with check(seller_id=auth.uid() and ownership_confirmed=true and status='active');

drop policy if exists marketplace_update on public.marketplace_listings;
create policy marketplace_update on public.marketplace_listings
for update to authenticated
using(seller_id=auth.uid())
with check(seller_id=auth.uid());