-- ============================================================================
-- RekberSTORE: alur lengkap — tahap transaksi 8 langkah, chat, sengketa,
-- admin kurasi, rating admin, QR bisnis admin, kredit top-up Pakasir.
--
-- Dijalankan oleh Tuan di Supabase SQL Editor, SETELAH supabase/schema.sql
-- dan migrasi token (20261102060000 + 20261102070000) diterapkan.
-- Idempotent: aman dijalankan ulang (IF NOT EXISTS / OR REPLACE).
-- File ini TIDAK menulis data pengguna; hanya struktur, policy, dan fungsi.
-- Kode aplikasi tahan terhadap migrasi yang belum dijalankan: bila fungsi
-- atau kolom belum ada, UI menampilkan keadaan jujur, bukan crash.
-- ============================================================================
begin;

-- Prasyarat: schema.sql harus sudah diterapkan (enum + tabel inti ada).
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.transaction_status'::regtype
      and enumlabel = 'item_delivery'
  ) then
    raise exception 'Prasyarat belum terpenuhi: enum transaction_status dari supabase/schema.sql belum ada. Terapkan schema.sql terlebih dahulu.';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'transaction_messages'
  ) then
    raise exception 'Prasyarat belum terpenuhi: tabel transaction_messages dari supabase/schema.sql belum ada. Terapkan schema.sql terlebih dahulu.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Kolom tahap pada transactions.
--    Enum status lama TIDAK diubah artinya. Kolom rekber_stage (0-8)
--    adalah sumber kebenaran tampilan 8 tahap di chat; status tetap
--    menjadi keadaan kasar yang sudah dikenal UI lama.
--    0 pengajuan, 1 buyer kirim dana, 2 admin menahan dana,
--    3 seller kirim data, 4 buyer mengecek, 5 pengecekan selesai,
--    6 buyer konfirmasi, 7 admin verifikasi, 8 admin kirim dana (selesai).
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists rekber_stage smallint not null default 0;
alter table public.transactions
  add column if not exists buyer_payment_claimed_at timestamptz;

-- Backfill tahap dari status untuk baris yang sudah ada (diperkirakan kosong).
update public.transactions set rekber_stage = case status
  when 'awaiting_acceptance' then 0
  when 'awaiting_payment_provider' then 1
  when 'provider_payment_confirmed' then 2
  when 'item_delivery' then 3
  when 'buyer_inspection' then 4
  when 'completed' then 8
  when 'disputed' then 4
  when 'refund_pending' then 7
  when 'cancelled' then 0
  else 0 end
where rekber_stage = 0;

-- ---------------------------------------------------------------------------
-- 2. Log tahap (append-only): riwayat perpindahan tahap tiap transaksi.
-- ---------------------------------------------------------------------------
create table if not exists public.transaction_stage_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  stage smallint not null check (stage between 0 and 8),
  action text not null,
  actor_id uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists transaction_stage_events_tx_created
  on public.transaction_stage_events(transaction_id, created_at);

alter table public.transaction_stage_events enable row level security;

drop policy if exists stage_events_participant_read on public.transaction_stage_events;
create policy stage_events_participant_read on public.transaction_stage_events
for select to authenticated
using (
  exists (
    select 1 from public.transactions t
    where t.id = transaction_stage_events.transaction_id
      and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
  )
  or exists (
    select 1 from public.transaction_assignments a
    where a.transaction_id = transaction_stage_events.transaction_id
      and a.admin_id = auth.uid() and a.revoked_at is null
  )
  or public.has_role(auth.uid(), 'super_admin')
);

revoke all on public.transaction_stage_events from anon, authenticated;
grant select on public.transaction_stage_events to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Penilaian bintang admin (satu per transaksi per penilai).
-- ---------------------------------------------------------------------------
create table if not exists public.admin_ratings (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  admin_id uuid not null references auth.users(id) on delete cascade,
  rater_id uuid not null references auth.users(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  constraint admin_ratings_one_per_rater unique (transaction_id, rater_id)
);

create index if not exists admin_ratings_admin_created
  on public.admin_ratings(admin_id, created_at desc);

alter table public.admin_ratings enable row level security;

drop policy if exists admin_ratings_self_read on public.admin_ratings;
create policy admin_ratings_self_read on public.admin_ratings
for select to authenticated
using (rater_id = auth.uid() or admin_id = auth.uid());

revoke all on public.admin_ratings from anon, authenticated;
grant select on public.admin_ratings to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Kolom link bayar untuk pesanan top-up (agar link dapat dibuka lagi
--    setelah pembeli meninggalkan halaman; txn id tetap di kolom
--    provider_reference yang sudah ada).
-- ---------------------------------------------------------------------------
alter table public.token_topup_orders
  add column if not exists payment_link text;

-- ---------------------------------------------------------------------------
-- 5. Indeks pendukung chat dan sengketa.
-- ---------------------------------------------------------------------------
create index if not exists transaction_messages_tx_created
  on public.transaction_messages(transaction_id, created_at);
create index if not exists disputes_status_created
  on public.disputes(status, created_at desc);
create index if not exists transaction_assignments_admin
  on public.transaction_assignments(admin_id, revoked_at);

-- ---------------------------------------------------------------------------
-- 6. Bucket privat dokumen admin + policy Storage.
--    Skema awal membuat bucket tanpa policy; tanpa policy di bawah ini
--    unggah/baca tidak dapat berjalan lewat sesi pengguna.
--    Konvensi path: "<uid>/qr/<berkas>" dan "<uid>/kyc/<berkas>".
--    Policy hanya memakai fungsi string inti Postgres (split_part) atas
--    kolom name — tanpa helper storage.foldername dan tanpa kolom owner,
--    agar migrasi tidak bergantung pada helper yang belum terverifikasi.
--    QR hanya boleh dibaca pemiliknya, super_admin, dan para pihak
--    transaksi yang ditangani admin pemilik berkas.
-- ---------------------------------------------------------------------------
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('admin-private-documents', 'admin-private-documents', false, 5242880,
  array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists admin_docs_owner_insert on storage.objects;
create policy admin_docs_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'admin-private-documents'
  and split_part(name, '/', 1) = auth.uid()::text
  and split_part(name, '/', 2) in ('qr', 'kyc')
);

drop policy if exists admin_docs_owner_update on storage.objects;
create policy admin_docs_owner_update on storage.objects
for update to authenticated
using (
  bucket_id = 'admin-private-documents'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'admin-private-documents'
  and split_part(name, '/', 1) = auth.uid()::text
  and split_part(name, '/', 2) in ('qr', 'kyc')
);

drop policy if exists admin_docs_owner_delete on storage.objects;
create policy admin_docs_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'admin-private-documents'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists admin_docs_party_read on storage.objects;
create policy admin_docs_party_read on storage.objects
for select to authenticated
using (
  bucket_id = 'admin-private-documents'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or public.has_role(auth.uid(), 'super_admin')
    or exists (
      select 1
      from public.transaction_assignments a
      join public.transactions t on t.id = a.transaction_id
      where a.admin_id::text = split_part(storage.objects.name, '/', 1)
        and a.revoked_at is null
        and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
    )
  )
);

-- ---------------------------------------------------------------------------
-- 7. Realtime: tabel yang wajib masuk publikasi supabase_realtime agar
--    chat dan timeline tahap diperbarui langsung. Idempotent.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transaction_messages') then
      execute 'alter publication supabase_realtime add table public.transaction_messages';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transaction_stage_events') then
      execute 'alter publication supabase_realtime add table public.transaction_stage_events';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_ratings') then
      execute 'alter publication supabase_realtime add table public.admin_ratings';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions') then
      execute 'alter publication supabase_realtime add table public.transactions';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Fungsi-fungsi (semua security definer; RLS client tidak memberi
--    jalur tulis untuk perubahan status/peran — hanya lewat RPC ini).
-- ---------------------------------------------------------------------------

-- Admin penangan aktif untuk satu transaksi (null bila belum ditunjuk).
create or replace function public.rekber_assigned_admin_id(p_transaction_id uuid)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select admin_id
  from public.transaction_assignments
  where transaction_id = p_transaction_id and revoked_at is null
  order by assigned_at desc
  limit 1;
$$;
revoke all on function public.rekber_assigned_admin_id(uuid) from public, anon, authenticated;

-- Status kasar (enum lama) untuk satu nomor tahap.
create or replace function public.rekber_status_for_stage(p_stage smallint)
returns public.transaction_status
language sql immutable
set search_path = public, pg_temp
as $$
  select case p_stage
    when 0 then 'awaiting_acceptance'::public.transaction_status
    when 1 then 'awaiting_payment_provider'::public.transaction_status
    when 2 then 'provider_payment_confirmed'::public.transaction_status
    when 3 then 'item_delivery'::public.transaction_status
    when 4 then 'buyer_inspection'::public.transaction_status
    when 5 then 'buyer_inspection'::public.transaction_status
    when 6 then 'buyer_inspection'::public.transaction_status
    when 7 then 'buyer_inspection'::public.transaction_status
    when 8 then 'completed'::public.transaction_status
    else 'awaiting_acceptance'::public.transaction_status end;
$$;
revoke all on function public.rekber_status_for_stage(smallint) from public, anon, authenticated;

-- Trigger sinkronisasi tahap: RPC lama (respond_rekber_transaction dkk.)
-- mengubah status TANPA mengenal kolom rekber_stage. Trigger ini
-- menaikkan rekber_stage ke minimum yang sesuai status baru, dan tidak
-- pernah menurunkannya (tahap 5-7 berbagi status buyer_inspection).
-- disputed/refund_pending/cancelled mempertahankan tahap berjalan.
create or replace function public.rekber_sync_stage()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_min smallint;
begin
  v_min := case NEW.status
    when 'awaiting_acceptance' then 0
    when 'awaiting_payment_provider' then 1
    when 'provider_payment_confirmed' then 2
    when 'item_delivery' then 3
    when 'buyer_inspection' then 4
    when 'completed' then 8
    else null end;
  if v_min is not null then
    NEW.rekber_stage := greatest(coalesce(NEW.rekber_stage, 0), v_min);
  end if;
  return NEW;
end;
$$;

drop trigger if exists transactions_sync_rekber_stage on public.transactions;
create trigger transactions_sync_rekber_stage
  before insert or update of status, rekber_stage on public.transactions
  for each row execute function public.rekber_sync_stage();

-- Pindah tahap 8 langkah. Uang TIDAK PERNAH bergerak otomatis di sini:
-- tahap 1-2 dan 7-8 adalah konfirmasi manual (klaim buyer, verifikasi
-- admin atas aplikasi QRIS/banknya sendiri). Idempotent: memanggil
-- aksi yang sudah tercapai mengembalikan 'already' tanpa perubahan.
create or replace function public.advance_rekber_stage(p_transaction_id uuid, p_action text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tx public.transactions%rowtype;
  v_admin_id uuid;
  v_stage2_at timestamptz;
  v_has_seller_message boolean;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select * into v_tx
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;
  if v_tx.status = 'cancelled' or v_tx.status = 'completed' then
    raise exception 'TRANSACTION_CLOSED';
  end if;
  if v_tx.status = 'disputed' then
    raise exception 'TRANSACTION_DISPUTED';
  end if;

  v_admin_id := public.rekber_assigned_admin_id(p_transaction_id);

  if p_action = 'claim_payment' then
    if v_tx.buyer_id <> v_user_id then
      raise exception 'NOT_TRANSACTION_BUYER';
    end if;
    if v_tx.rekber_stage <> 1 then
      raise exception 'INVALID_STAGE';
    end if;
    if v_tx.buyer_payment_claimed_at is not null then
      return 'already_claimed';
    end if;
    update public.transactions
    set buyer_payment_claimed_at = now()
    where id = p_transaction_id;
    insert into public.transaction_stage_events(transaction_id, stage, action, actor_id, note)
    values (p_transaction_id, 1, 'claim_payment', v_user_id,
      'Buyer mengklaim dana sudah dikirim lewat QR bisnis admin. Status berubah hanya oleh konfirmasi admin penangan.');
    return 'claimed';

  elsif p_action = 'confirm_payment' then
    if not (v_admin_id = v_user_id or public.has_role(v_user_id, 'super_admin')) then
      raise exception 'NOT_HANDLING_ADMIN';
    end if;
    if v_tx.rekber_stage = 2 then
      return 'already';
    end if;
    if v_tx.rekber_stage <> 1 then
      raise exception 'INVALID_STAGE';
    end if;
    update public.transactions
    set status = 'provider_payment_confirmed', rekber_stage = 2
    where id = p_transaction_id;
    insert into public.transaction_stage_events(transaction_id, stage, action, actor_id, note)
    values (p_transaction_id, 2, 'confirm_payment', v_user_id,
      'Admin mengonfirmasi dana diterima dan ditahan (verifikasi manual atas aplikasi QRIS/bank admin).');
    return 'confirmed';

  elsif p_action = 'mark_delivered' then
    if v_tx.seller_id <> v_user_id then
      raise exception 'NOT_TRANSACTION_SELLER';
    end if;
    if v_tx.rekber_stage = 3 then
      return 'already';
    end if;
    if v_tx.rekber_stage <> 2 then
      raise exception 'INVALID_STAGE';
    end if;
    -- Data/item wajib sudah disampaikan lewat pesan chat transaksi ini,
    -- setelah tahap 2 tercatat. Tanpa itu, tombol tidak dapat dipakai.
    select created_at into v_stage2_at
    from public.transaction_stage_events
    where transaction_id = p_transaction_id and stage = 2
    order by created_at desc
    limit 1;
    select exists(
      select 1 from public.transaction_messages m
      where m.transaction_id = p_transaction_id
        and m.sender_id = v_user_id
        and (v_stage2_at is null or m.created_at >= v_stage2_at)
    ) into v_has_seller_message;
    if not v_has_seller_message then
      raise exception 'DELIVERY_MESSAGE_REQUIRED';
    end if;
    update public.transactions
    set status = 'item_delivery', rekber_stage = 3
    where id = p_transaction_id;
    insert into public.transaction_stage_events(transaction_id, stage, action, actor_id, note)
    values (p_transaction_id, 3, 'mark_delivered', v_user_id,
      'Seller menandai data/item sudah disampaikan lewat chat.');
    return 'delivered';

  elsif p_action = 'begin_inspection' then
    if v_tx.buyer_id <> v_user_id then
      raise exception 'NOT_TRANSACTION_BUYER';
    end if;
    if v_tx.rekber_stage = 4 then
      return 'already';
    end if;
    if v_tx.rekber_stage <> 3 then
      raise exception 'INVALID_STAGE';
    end if;
    update public.transactions
    set status = 'buyer_inspection', rekber_stage = 4
    where id = p_transaction_id;
    insert into public.transaction_stage_events(transaction_id, stage, action, actor_id, note)
    values (p_transaction_id, 4, 'begin_inspection', v_user_id,
      'Buyer memulai pemeriksaan data/item.');
    return 'inspecting';

  elsif p_action = 'finish_inspection' then
    if v_tx.buyer_id <> v_user_id then
      raise exception 'NOT_TRANSACTION_BUYER';
    end if;
    if v_tx.rekber_stage = 5 then
      return 'already';
    end if;
    if v_tx.rekber_stage <> 4 then
      raise exception 'INVALID_STAGE';
    end if;
    update public.transactions
    set rekber_stage = 5
    where id = p_transaction_id;
    insert into public.transaction_stage_events(transaction_id, stage, action, actor_id, note)
    values (p_transaction_id, 5, 'finish_inspection', v_user_id,
      'Buyer menyatakan pengecekan selesai.');
    return 'inspected';

  elsif p_action = 'confirm_receipt' then
    if v_tx.buyer_id <> v_user_id then
      raise exception 'NOT_TRANSACTION_BUYER';
    end if;
    if v_tx.rekber_stage = 6 then
      return 'already';
    end if;
    if v_tx.rekber_stage <> 5 then
      raise exception 'INVALID_STAGE';
    end if;
    update public.transactions
    set rekber_stage = 6
    where id = p_transaction_id;
    insert into public.transaction_stage_events(transaction_id, stage, action, actor_id, note)
    values (p_transaction_id, 6, 'confirm_receipt', v_user_id,
      'Buyer mengonfirmasi data/item diterima. Menunggu verifikasi admin.');
    return 'confirmed_receipt';

  elsif p_action = 'admin_verify' then
    if not (v_admin_id = v_user_id or public.has_role(v_user_id, 'super_admin')) then
      raise exception 'NOT_HANDLING_ADMIN';
    end if;
    if v_tx.rekber_stage = 7 then
      return 'already';
    end if;
    if v_tx.rekber_stage <> 6 then
      raise exception 'INVALID_STAGE';
    end if;
    update public.transactions
    set rekber_stage = 7
    where id = p_transaction_id;
    insert into public.transaction_stage_events(transaction_id, stage, action, actor_id, note)
    values (p_transaction_id, 7, 'admin_verify', v_user_id,
      'Admin memverifikasi penyelesaian transaksi.');
    return 'verified';

  elsif p_action = 'admin_release' then
    if not (v_admin_id = v_user_id or public.has_role(v_user_id, 'super_admin')) then
      raise exception 'NOT_HANDLING_ADMIN';
    end if;
    if v_tx.rekber_stage = 8 then
      return 'already';
    end if;
    if v_tx.rekber_stage <> 7 then
      raise exception 'INVALID_STAGE';
    end if;
    update public.transactions
    set status = 'completed', rekber_stage = 8
    where id = p_transaction_id;
    insert into public.transaction_stage_events(transaction_id, stage, action, actor_id, note)
    values (p_transaction_id, 8, 'admin_release', v_user_id,
      'Admin mengonfirmasi dana telah dikirim ke seller (transfer manual). Platform tidak memproses transfer otomatis.');
    return 'released';

  else
    raise exception 'INVALID_ACTION';
  end if;
end;
$$;

revoke all on function public.advance_rekber_stage(uuid, text) from public, anon;
grant execute on function public.advance_rekber_stage(uuid, text) to authenticated;

-- Buka sengketa: pihak transaksi, tahap 1-7, satu sengketa terbuka.
-- disputes.transaction_id bersifat UNIQUE (satu baris per transaksi):
-- bila baris lama sudah resolved/rejected, baris itu DIBUKA KEMBALI
-- (bukan insert baru yang akan melanggar constraint unique).
create or replace function public.open_rekber_dispute(p_transaction_id uuid, p_reason text)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tx public.transactions%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_existing public.disputes%rowtype;
  v_dispute_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 2000 then
    raise exception 'INVALID_REASON';
  end if;

  select * into v_tx
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;
  if v_tx.buyer_id <> v_user_id and v_tx.seller_id <> v_user_id then
    raise exception 'NOT_TRANSACTION_PARTY';
  end if;
  if v_tx.status in ('cancelled', 'completed', 'refund_pending') then
    raise exception 'TRANSACTION_CLOSED';
  end if;
  if v_tx.status = 'disputed' then
    raise exception 'DISPUTE_ALREADY_OPEN';
  end if;
  if v_tx.rekber_stage < 1 or v_tx.rekber_stage > 7 then
    raise exception 'INVALID_STAGE';
  end if;

  select * into v_existing
  from public.disputes
  where transaction_id = p_transaction_id
  for update;

  if found then
    if v_existing.status in ('open', 'under_review') then
      raise exception 'DISPUTE_ALREADY_OPEN';
    end if;
    update public.disputes
    set opened_by = v_user_id,
        reason = v_reason,
        status = 'open',
        resolution = null,
        resolved_by = null,
        resolved_at = null
    where id = v_existing.id;
    v_dispute_id := v_existing.id;
  else
    insert into public.disputes(transaction_id, opened_by, reason, status)
    values (p_transaction_id, v_user_id, v_reason, 'open')
    returning id into v_dispute_id;
  end if;

  update public.transactions
  set status = 'disputed'
  where id = p_transaction_id;

  return v_dispute_id;
end;
$$;

revoke all on function public.open_rekber_dispute(uuid, text) from public, anon;
grant execute on function public.open_rekber_dispute(uuid, text) to authenticated;

-- Putusan sengketa oleh admin penangan atau super_admin.
-- 'resume'/'reject' mengembalikan status sesuai tahap; 'refund' menandai
-- refund_pending — pengembalian uangnya ditangani manual oleh admin di
-- luar platform (tidak ada transfer otomatis). Biaya layanan website
-- (2 token) yang sudah dikonfirmasi saat persetujuan tidak dikembalikan
-- otomatis oleh fungsi ini.
create or replace function public.resolve_rekber_dispute(p_dispute_id uuid, p_decision text, p_resolution text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_dispute public.disputes%rowtype;
  v_tx public.transactions%rowtype;
  v_admin_id uuid;
  v_resolution text := btrim(coalesce(p_resolution, ''));
  v_restored_status public.transaction_status;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if p_decision not in ('resume', 'refund', 'reject') then
    raise exception 'INVALID_DECISION';
  end if;
  if char_length(v_resolution) < 5 or char_length(v_resolution) > 2000 then
    raise exception 'INVALID_RESOLUTION';
  end if;

  select * into v_dispute
  from public.disputes
  where id = p_dispute_id
  for update;

  if not found then
    raise exception 'DISPUTE_NOT_FOUND';
  end if;
  if v_dispute.status not in ('open', 'under_review') then
    raise exception 'DISPUTE_ALREADY_RESOLVED';
  end if;

  v_admin_id := public.rekber_assigned_admin_id(v_dispute.transaction_id);
  if not (v_admin_id = v_user_id or public.has_role(v_user_id, 'super_admin')) then
    raise exception 'NOT_HANDLING_ADMIN';
  end if;

  select * into v_tx
  from public.transactions
  where id = v_dispute.transaction_id
  for update;

  if not found then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;

  if p_decision = 'refund' then
    update public.transactions
    set status = 'refund_pending'
    where id = v_tx.id;
    update public.disputes
    set status = 'resolved', resolution = v_resolution,
        resolved_by = v_user_id, resolved_at = now()
    where id = p_dispute_id;
    return 'refunded';
  end if;

  v_restored_status := public.rekber_status_for_stage(v_tx.rekber_stage);
  update public.transactions
  set status = v_restored_status
  where id = v_tx.id;

  update public.disputes
  set status = case when p_decision = 'reject' then 'rejected'::public.dispute_status else 'resolved'::public.dispute_status end,
      resolution = v_resolution,
      resolved_by = v_user_id, resolved_at = now()
  where id = p_dispute_id;

  return p_decision;
end;
$$;

revoke all on function public.resolve_rekber_dispute(uuid, text, text) from public, anon;
grant execute on function public.resolve_rekber_dispute(uuid, text, text) to authenticated;

-- Penunjukan admin penangan transaksi. HANYA super_admin (Tuan) yang
-- dapat menunjuk. Tidak ada penunjukan diri sendiri oleh admin.
create or replace function public.assign_rekber_admin(p_transaction_id uuid, p_admin_id uuid)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_current uuid;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not public.has_role(v_user_id, 'super_admin') then
    raise exception 'NOT_SUPER_ADMIN';
  end if;
  if not exists (select 1 from public.transactions where id = p_transaction_id) then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;
  if not (public.has_role(p_admin_id, 'admin') or public.has_role(p_admin_id, 'super_admin')) then
    raise exception 'TARGET_NOT_ADMIN';
  end if;

  v_current := public.rekber_assigned_admin_id(p_transaction_id);
  if v_current = p_admin_id then
    return 'already_assigned';
  end if;

  update public.transaction_assignments
  set revoked_at = now()
  where transaction_id = p_transaction_id and revoked_at is null;

  insert into public.transaction_assignments(transaction_id, admin_id, assigned_by)
  values (p_transaction_id, p_admin_id, v_user_id);

  return 'assigned';
end;
$$;

revoke all on function public.assign_rekber_admin(uuid, uuid) from public, anon;
grant execute on function public.assign_rekber_admin(uuid, uuid) to authenticated;

-- Pendaftaran admin kurasi oleh super_admin (Tuan): akun yang sudah ada
-- ditunjuk menjadi admin berdasarkan emailnya. Tidak ada jalur publik.
create or replace function public.appoint_rekber_admin(p_email text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_target uuid;
  v_email text := btrim(lower(coalesce(p_email, '')));
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not public.has_role(v_user_id, 'super_admin') then
    raise exception 'NOT_SUPER_ADMIN';
  end if;
  if v_email = '' or v_email not like '%@%.%' then
    raise exception 'INVALID_EMAIL';
  end if;

  select id into v_target
  from auth.users
  where lower(email) = v_email;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;
  if public.has_role(v_target, 'admin') or public.has_role(v_target, 'super_admin') then
    return 'already_admin';
  end if;

  insert into public.user_roles(user_id, role)
  values (v_target, 'admin')
  on conflict (user_id, role) do nothing;

  return 'appointed';
end;
$$;

revoke all on function public.appoint_rekber_admin(text) from public, anon;
grant execute on function public.appoint_rekber_admin(text) to authenticated;

-- Cabut peran admin (bukan super_admin) oleh super_admin.
create or replace function public.revoke_rekber_admin(p_user_id uuid)
returns text
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
  if v_user_id = p_user_id then
    raise exception 'CANNOT_REVOKE_SELF';
  end if;

  delete from public.user_roles
  where user_id = p_user_id and role = 'admin';

  if not found then
    return 'not_admin';
  end if;
  return 'revoked';
end;
$$;

revoke all on function public.revoke_rekber_admin(uuid) from public, anon;
grant execute on function public.revoke_rekber_admin(uuid) to authenticated;

-- Daftar admin terpilih (untuk panel super_admin dan penunjukan).
create or replace function public.list_rekber_admins()
returns table(user_id uuid, display_name text, email text, roles text[], qr_status text)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not (public.has_role(v_user_id, 'admin') or public.has_role(v_user_id, 'super_admin')) then
    raise exception 'NOT_STAFF';
  end if;

  return query
  select
    u.id,
    coalesce(p.display_name, ''),
    u.email,
    array_agg(r.role::text order by r.role::text),
    (
      select q.status::text
      from public.admin_qr_profiles q
      where q.admin_user_id = u.id
      order by q.submitted_at desc
      limit 1
    )
  from auth.users u
  join public.user_roles r on r.user_id = u.id
  left join public.profiles p on p.id = u.id
  where r.role in ('admin', 'super_admin')
  group by u.id, p.display_name, u.email
  order by u.email;
end;
$$;

revoke all on function public.list_rekber_admins() from public, anon;
grant execute on function public.list_rekber_admins() to authenticated;

-- Profil QR bisnis milik admin penangan untuk satu transaksi.
-- Mengembalikan baris terbaru apa pun statusnya; UI hanya menampilkan
-- gambar QR bila statusnya 'approved'. Tanpa admin penangan, kosong.
create or replace function public.get_rekber_admin_qr(p_transaction_id uuid)
returns table(merchant_display_name text, merchant_provider text, qr_image_object_path text, qr_status text, admin_display_name text)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tx public.transactions%rowtype;
  v_admin_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select * into v_tx
  from public.transactions
  where id = p_transaction_id;

  if not found then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;

  v_admin_id := public.rekber_assigned_admin_id(p_transaction_id);

  if v_tx.buyer_id <> v_user_id
    and v_tx.seller_id <> v_user_id
    and v_admin_id <> v_user_id
    and not public.has_role(v_user_id, 'super_admin') then
    raise exception 'NOT_TRANSACTION_PARTY';
  end if;

  if v_admin_id is null then
    return;
  end if;

  return query
  select
    q.merchant_display_name,
    q.merchant_provider,
    q.qr_image_object_path,
    q.status::text,
    coalesce(p.display_name, '')
  from public.admin_qr_profiles q
  left join public.profiles p on p.id = q.admin_user_id
  where q.admin_user_id = v_admin_id
  order by q.submitted_at desc
  limit 1;
end;
$$;

revoke all on function public.get_rekber_admin_qr(uuid) from public, anon;
grant execute on function public.get_rekber_admin_qr(uuid) to authenticated;

-- Simpan/ajukan profil QR bisnis oleh admin itu sendiri.
-- Status kembali ke 'pending_review' sampai super_admin menyetujui.
create or replace function public.upsert_rekber_qr_profile(
  p_merchant_display_name text,
  p_merchant_provider text,
  p_qr_image_object_path text,
  p_ownership_evidence_object_path text
)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_merchant_display_name, ''));
  v_provider text := btrim(coalesce(p_merchant_provider, ''));
  v_qr text := btrim(coalesce(p_qr_image_object_path, ''));
  v_evidence text := btrim(coalesce(p_ownership_evidence_object_path, ''));
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not (public.has_role(v_user_id, 'admin') or public.has_role(v_user_id, 'super_admin')) then
    raise exception 'NOT_STAFF';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'INVALID_NAME';
  end if;
  if v_provider = '' or char_length(v_provider) > 60 then
    raise exception 'INVALID_PROVIDER';
  end if;
  if v_qr = '' or v_qr like '%..%' then
    raise exception 'INVALID_QR_PATH';
  end if;

  select id into v_id
  from public.admin_qr_profiles
  where admin_user_id = v_user_id
    and status in ('pending_review', 'approved')
  order by submitted_at desc
  limit 1
  for update;

  if found then
    update public.admin_qr_profiles
    set merchant_display_name = v_name,
        merchant_provider = v_provider,
        qr_image_object_path = v_qr,
        ownership_evidence_object_path = nullif(v_evidence, ''),
        status = 'pending_review',
        reviewer_id = null,
        reviewer_note = null,
        submitted_at = now(),
        reviewed_at = null
    where id = v_id;
    return v_id;
  end if;

  insert into public.admin_qr_profiles(
    admin_user_id, merchant_display_name, merchant_provider,
    qr_image_object_path, ownership_evidence_object_path, status
  )
  values (v_user_id, v_name, v_provider, v_qr, nullif(v_evidence, ''), 'pending_review')
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_rekber_qr_profile(text, text, text, text) from public, anon;
grant execute on function public.upsert_rekber_qr_profile(text, text, text, text) to authenticated;

-- Tinjau profil QR oleh super_admin.
create or replace function public.review_rekber_qr_profile(p_profile_id uuid, p_decision text, p_note text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not public.has_role(v_user_id, 'super_admin') then
    raise exception 'NOT_SUPER_ADMIN';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_DECISION';
  end if;

  update public.admin_qr_profiles
  set status = p_decision::public.review_status,
      reviewer_id = v_user_id,
      reviewer_note = nullif(v_note, ''),
      reviewed_at = now()
  where id = p_profile_id
    and status = 'pending_review';

  if not found then
    raise exception 'PROFILE_NOT_PENDING';
  end if;
  return p_decision;
end;
$$;

revoke all on function public.review_rekber_qr_profile(uuid, text, text) from public, anon;
grant execute on function public.review_rekber_qr_profile(uuid, text, text) to authenticated;

-- Simpan/ajukan dokumen KYC oleh admin itu sendiri.
create or replace function public.upsert_rekber_kyc_submission(
  p_legal_name text,
  p_phone_e164 text,
  p_identity_document_type text,
  p_identity_document_object_path text,
  p_selfie_object_path text
)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_legal_name, ''));
  v_phone text := btrim(coalesce(p_phone_e164, ''));
  v_doc_type text := btrim(coalesce(p_identity_document_type, ''));
  v_doc text := btrim(coalesce(p_identity_document_object_path, ''));
  v_selfie text := btrim(coalesce(p_selfie_object_path, ''));
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not (public.has_role(v_user_id, 'admin') or public.has_role(v_user_id, 'super_admin')) then
    raise exception 'NOT_STAFF';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'INVALID_NAME';
  end if;
  if v_phone = '' or char_length(v_phone) > 20 then
    raise exception 'INVALID_PHONE';
  end if;
  if v_doc_type = '' or char_length(v_doc_type) > 40 then
    raise exception 'INVALID_DOC_TYPE';
  end if;
  if v_doc = '' or v_doc like '%..%' or v_selfie = '' or v_selfie like '%..%' then
    raise exception 'INVALID_DOC_PATH';
  end if;

  select id into v_id
  from public.admin_kyc_submissions
  where admin_user_id = v_user_id
    and status in ('pending_review', 'approved')
  order by submitted_at desc
  limit 1
  for update;

  if found then
    update public.admin_kyc_submissions
    set legal_name = v_name,
        phone_e164 = v_phone,
        identity_document_type = v_doc_type,
        identity_document_object_path = v_doc,
        selfie_object_path = v_selfie,
        status = 'pending_review',
        reviewer_id = null,
        reviewer_note = null,
        submitted_at = now(),
        reviewed_at = null
    where id = v_id;
    return v_id;
  end if;

  insert into public.admin_kyc_submissions(
    admin_user_id, legal_name, phone_e164, identity_document_type,
    identity_document_object_path, selfie_object_path, status
  )
  values (v_user_id, v_name, v_phone, v_doc_type, v_doc, v_selfie, 'pending_review')
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_rekber_kyc_submission(text, text, text, text, text) from public, anon;
grant execute on function public.upsert_rekber_kyc_submission(text, text, text, text, text) to authenticated;

-- Tinjau KYC oleh super_admin.
create or replace function public.review_rekber_kyc_submission(p_submission_id uuid, p_decision text, p_note text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not public.has_role(v_user_id, 'super_admin') then
    raise exception 'NOT_SUPER_ADMIN';
  end if;
  if p_decision not in ('approved', 'rejected', 'suspended') then
    raise exception 'INVALID_DECISION';
  end if;

  update public.admin_kyc_submissions
  set status = p_decision::public.review_status,
      reviewer_id = v_user_id,
      reviewer_note = nullif(v_note, ''),
      reviewed_at = now()
  where id = p_submission_id
    and status = 'pending_review';

  if not found then
    raise exception 'SUBMISSION_NOT_PENDING';
  end if;
  return p_decision;
end;
$$;

revoke all on function public.review_rekber_kyc_submission(uuid, text, text) from public, anon;
grant execute on function public.review_rekber_kyc_submission(uuid, text, text) to authenticated;

-- Nama tampilan untuk sekumpulan user id. Dibatasi: hanya id sendiri,
-- id yang berbagi transaksi dengan pemanggil, atau id staf.
create or replace function public.get_rekber_display_names(p_user_ids uuid[])
returns table(user_id uuid, display_name text)
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
  select p.id, coalesce(p.display_name, '')
  from public.profiles p
  where p.id = any (p_user_ids)
    and (
      p.id = v_user_id
      or public.has_role(p.id, 'admin')
      or public.has_role(p.id, 'super_admin')
      or exists (
        select 1 from public.transactions t
        where (t.buyer_id = v_user_id or t.seller_id = v_user_id)
          and (t.buyer_id = p.id or t.seller_id = p.id)
      )
    );
end;
$$;

revoke all on function public.get_rekber_display_names(uuid[]) from public, anon;
grant execute on function public.get_rekber_display_names(uuid[]) to authenticated;

-- Penilaian bintang atas kinerja admin penangan. Hanya pihak transaksi
-- yang sudah selesai; satu penilaian per transaksi per penilai.
create or replace function public.submit_rekber_rating(p_transaction_id uuid, p_stars smallint, p_comment text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tx public.transactions%rowtype;
  v_admin_id uuid;
  v_comment text := btrim(coalesce(p_comment, ''));
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'INVALID_STARS';
  end if;
  if char_length(v_comment) > 500 then
    raise exception 'INVALID_COMMENT';
  end if;

  select * into v_tx
  from public.transactions
  where id = p_transaction_id;

  if not found then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;
  if v_tx.buyer_id <> v_user_id and v_tx.seller_id <> v_user_id then
    raise exception 'NOT_TRANSACTION_PARTY';
  end if;
  if v_tx.status <> 'completed' or v_tx.rekber_stage <> 8 then
    raise exception 'TRANSACTION_NOT_COMPLETED';
  end if;

  v_admin_id := null;
  -- Penilaian memakai penugasan TERAKHIR (termasuk yang sudah dicabut):
  -- transaksi sudah selesai, admin penangan historisnya tetap dinilai.
  -- Akses chat/tahap tetap memakai penugasan AKTIF saja (fungsi lain).
  select a.admin_id into v_admin_id
  from public.transaction_assignments a
  where a.transaction_id = p_transaction_id
  order by a.assigned_at desc
  limit 1;
  if v_admin_id is null then
    raise exception 'NO_HANDLING_ADMIN';
  end if;

  insert into public.admin_ratings(transaction_id, admin_id, rater_id, stars, comment)
  values (p_transaction_id, v_admin_id, v_user_id, p_stars, nullif(v_comment, ''))
  on conflict (transaction_id, rater_id) do nothing;

  if not found then
    return 'already_rated';
  end if;
  return 'rated';
end;
$$;

revoke all on function public.submit_rekber_rating(uuid, smallint, text) from public, anon;
grant execute on function public.submit_rekber_rating(uuid, smallint, text) to authenticated;

-- Leaderboard admin terpilih: hanya admin dengan minimal 1 penilaian.
-- Rata-rata tertinggi dulu, jumlah penilaian sebagai penyeimbang.
-- Nama diambil dari profil asli; admin tanpa penilaian tidak tampil
-- (keadaan kosong ditangani UI, bukan baris karangan).
create or replace function public.get_rekber_leaderboard()
returns table(admin_id uuid, display_name text, avg_stars numeric, ratings_count bigint, completed_count bigint)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    r.admin_id,
    coalesce(p.display_name, ''),
    round(avg(r.stars)::numeric, 2),
    count(*),
    (
      select count(distinct a.transaction_id)
      from public.transaction_assignments a
      join public.transactions t on t.id = a.transaction_id
      where a.admin_id = r.admin_id and t.status = 'completed'
    )
  from public.admin_ratings r
  left join public.profiles p on p.id = r.admin_id
  group by r.admin_id, p.display_name
  order by round(avg(r.stars)::numeric, 2) desc, count(*) desc, p.display_name;
$$;

revoke all on function public.get_rekber_leaderboard() from public;
grant execute on function public.get_rekber_leaderboard() to anon, authenticated;

-- Pengawasan transaksi untuk staf (admin/super_admin): kolom terbatas.
create or replace function public.list_rekber_transactions_admin()
returns table(id uuid, title text, amount bigint, status text, rekber_stage smallint, buyer_id uuid, seller_id uuid, admin_id uuid, created_at timestamptz)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not (public.has_role(v_user_id, 'admin') or public.has_role(v_user_id, 'super_admin')) then
    raise exception 'NOT_STAFF';
  end if;

  return query
  select
    t.id, t.title, t.amount, t.status::text, t.rekber_stage,
    t.buyer_id, t.seller_id,
    public.rekber_assigned_admin_id(t.id),
    t.created_at
  from public.transactions t
  order by t.created_at desc
  limit 100;
end;
$$;

revoke all on function public.list_rekber_transactions_admin() from public, anon;
grant execute on function public.list_rekber_transactions_admin() to authenticated;

-- Daftar pesanan top-up untuk staf (read-only).
create or replace function public.list_rekber_topup_orders_admin()
returns table(id uuid, user_id uuid, user_email text, package_tokens integer, amount_idr integer, status text, provider text, provider_reference text, created_at timestamptz, paid_at timestamptz)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not (public.has_role(v_user_id, 'admin') or public.has_role(v_user_id, 'super_admin')) then
    raise exception 'NOT_STAFF';
  end if;

  return query
  select
    o.id, o.user_id, u.email, o.package_tokens, o.amount_idr,
    o.status, o.provider, o.provider_reference, o.created_at, o.paid_at
  from public.token_topup_orders o
  left join auth.users u on u.id = o.user_id
  order by o.created_at desc
  limit 100;
end;
$$;

revoke all on function public.list_rekber_topup_orders_admin() from public, anon;
grant execute on function public.list_rekber_topup_orders_admin() to authenticated;

-- Moderasi listing oleh staf: jeda/aktifkan saja (tanpa hapus —
-- tidak ada policy DELETE di skema; penghapusan tidak dibangun).
create or replace function public.set_rekber_listing_status_admin(p_listing_id uuid, p_status text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not (public.has_role(v_user_id, 'admin') or public.has_role(v_user_id, 'super_admin')) then
    raise exception 'NOT_STAFF';
  end if;
  if p_status not in ('active', 'paused') then
    raise exception 'INVALID_STATUS';
  end if;

  update public.marketplace_listings
  set status = p_status
  where id = p_listing_id;

  if not found then
    raise exception 'LISTING_NOT_FOUND';
  end if;
  return 'updated';
end;
$$;

revoke all on function public.set_rekber_listing_status_admin(uuid, text) from public, anon;
grant execute on function public.set_rekber_listing_status_admin(uuid, text) to authenticated;

-- Daftar seluruh listing untuk moderasi staf. Diperlukan karena policy
-- marketplace_read hanya memperlihatkan listing aktif ke non-pemilik,
-- sehingga staf tidak dapat melihat listing yang sedang dijeda.
create or replace function public.list_rekber_listings_admin()
returns table(id uuid, seller_id uuid, category text, title text, price bigint, status text, created_at timestamptz)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not (public.has_role(v_user_id, 'admin') or public.has_role(v_user_id, 'super_admin')) then
    raise exception 'NOT_STAFF';
  end if;

  return query
  select
    l.id, l.seller_id, l.category, l.title, l.price, l.status, l.created_at
  from public.marketplace_listings l
  order by l.created_at desc
  limit 100;
end;
$$;

revoke all on function public.list_rekber_listings_admin() from public, anon;
grant execute on function public.list_rekber_listings_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Kredit top-up Pakasir (HANYA pembelian token; dana transaksi TIDAK
--    lewat provider). Idempotent: pemanggilan ulang untuk pesanan yang
--    sudah lunas mengembalikan saldo tanpa menggandakan ledger.
--    Verifikasi status Pakasir dilakukan kode server SEBELUM memanggil
--    fungsi ini; fungsi ini hanya mencatat hasil yang sudah diverifikasi.
-- ---------------------------------------------------------------------------
create or replace function public.credit_rekber_topup(p_order_id uuid)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.token_topup_orders%rowtype;
  v_balance integer;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select * into v_order
  from public.token_topup_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.user_id <> v_user_id then
    raise exception 'NOT_ORDER_OWNER';
  end if;
  if v_order.status = 'paid' then
    select balance into v_balance
    from public.token_wallets
    where user_id = v_user_id;
    return coalesce(v_balance, 0);
  end if;
  if v_order.status <> 'pending' then
    raise exception 'ORDER_NOT_PENDING';
  end if;
  if v_order.provider <> 'pakasir' or v_order.provider_reference is null then
    raise exception 'ORDER_NOT_PAKASIR';
  end if;

  insert into public.token_wallets(user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  update public.token_wallets
  set balance = balance + v_order.package_tokens,
      updated_at = now()
  where user_id = v_user_id
  returning balance into v_balance;

  insert into public.token_ledger(
    user_id, entry_type, amount, balance_after,
    reference_type, reference_id, description
  ) values (
    v_user_id, 'topup', v_order.package_tokens, v_balance,
    'topup_order', v_order.id, 'Top up token via Pakasir'
  )
  on conflict do nothing;

  update public.token_topup_orders
  set status = 'paid', paid_at = now()
  where id = p_order_id;

  return v_balance;
end;
$$;

revoke all on function public.credit_rekber_topup(uuid) from public, anon;
grant execute on function public.credit_rekber_topup(uuid) to authenticated;

-- Tandai pesanan top-up gagal/kedaluwarsa menurut status Pakasir.
create or replace function public.fail_rekber_topup_order(p_order_id uuid)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.token_topup_orders%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select * into v_order
  from public.token_topup_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.user_id <> v_user_id then
    raise exception 'NOT_ORDER_OWNER';
  end if;
  if v_order.status = 'paid' then
    return 'already_paid';
  end if;
  if v_order.status <> 'pending' then
    return 'already_settled';
  end if;

  update public.token_topup_orders
  set status = 'expired'
  where id = p_order_id;

  return 'expired';
end;
$$;

revoke all on function public.fail_rekber_topup_order(uuid) from public, anon;
grant execute on function public.fail_rekber_topup_order(uuid) to authenticated;

-- Simpan referensi Pakasir (txn id + link) ke pesanan milik sendiri.
create or replace function public.set_rekber_topup_reference(p_order_id uuid, p_reference text, p_link text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.token_topup_orders%rowtype;
  v_reference text := btrim(coalesce(p_reference, ''));
  v_link text := btrim(coalesce(p_link, ''));
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if v_reference = '' or v_link = '' or v_link not like 'https://%' then
    raise exception 'INVALID_REFERENCE';
  end if;

  select * into v_order
  from public.token_topup_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.user_id <> v_user_id then
    raise exception 'NOT_ORDER_OWNER';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'ORDER_NOT_PENDING';
  end if;
  if v_order.provider_reference is not null then
    if v_order.provider_reference = v_reference then
      return 'already_set';
    end if;
    raise exception 'REFERENCE_ALREADY_SET';
  end if;

  update public.token_topup_orders
  set provider = 'pakasir',
      provider_reference = v_reference,
      payment_link = v_link
  where id = p_order_id;

  return 'set';
end;
$$;

revoke all on function public.set_rekber_topup_reference(uuid, text, text) from public, anon;
grant execute on function public.set_rekber_topup_reference(uuid, text, text) to authenticated;

commit;

-- ============================================================================
-- LANGKAH UNTUK TUAN (di SQL Editor Supabase, setelah file ini dijalankan):
-- 1. Jadikan akun Tuan super_admin (ganti email dengan email akun Tuan):
--      insert into public.user_roles (user_id, role)
--      select id, 'super_admin' from auth.users
--      where lower(email) = lower('email-tuan@contoh.com')
--      on conflict (user_id, role) do nothing;
-- 2. Tuan menunjuk admin terpilih lewat panel /dashboard/admin
--    (masukkan email akun yang sudah terdaftar) — tidak ada jalur publik.
-- 3. Admin yang ditunjuk mengunggah QR bisnisnya di
--    /dashboard/admin/profil-bisnis; super_admin menyetujuinya di panel.
-- 4. Tanpa migrasi ini, fitur tahap/chat/rating/admin menampilkan keadaan
--    jujur "belum aktif" dan tidak crash.
-- ============================================================================
