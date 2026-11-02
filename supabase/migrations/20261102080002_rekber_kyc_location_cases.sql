-- ============================================================================
-- RekberSTORE — KYC pengguna, pesan lokasi, perlindungan data, eskalasi.
-- Nomor lanjutan setelah 20261102080000 (loop penuh) dan
-- 20261102080001 (lookup penunjukan). Dijalankan Tuan di SQL Editor.
--
-- ISI:
--  1. Perbaikan policy Storage: baca pihak transaksi dibatasi ke folder
--     qr/ saja (sebelumnya tanpa filter folder — pihak transaksi dapat
--     membaca berkas kyc/ milik admin penangan bila mengetahui path-nya).
--     Baca staf untuk berkas KYC dibatasi ke path yang persis tercatat
--     pada pengajuan user_kyc_submissions.
--  2. Tabel user_kyc_submissions (TERPISAH dari admin_kyc_submissions
--     yang khusus admin) + RLS + RPC kirim/tinjau. KYC pengguna dikirim
--     KE ADMIN: lawan transaksi tidak pernah melihatnya.
--  3. Kolom pesan lokasi di transaction_messages (satu titik, tanpa
--     pelacakan live). RLS pesan yang sudah ada berlaku apa adanya:
--     pihak transaksi + admin penangan + super_admin.
--  4. RPC log_rekber_access: tulis log audit (audit_logs) lewat fungsi
--     definer — klien tidak punya policy tulis langsung.
--  5. Tabel escalation_cases (jalur eskalasi ke tim penindakan) + RLS
--     + RPC buka/ubah status. Satu kasus per transaksi; kasus yang
--     sudah selesai dapat dibuka ulang. Pesan/bukti TIDAK dapat dihapus
--     lewat UI (tidak ada policy DELETE di tabel mana pun di sini).
--  6. Realtime: escalation_cases masuk publikasi supabase_realtime.
--
-- PRASYARAT: schema.sql + 20261102080000 + 20261102080001 sudah
-- dijalankan. File ini TIDAK menulis data pengguna; hanya struktur,
-- policy, dan fungsi. Idempotent: aman dijalankan ulang.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'transactions'
  ) then
    raise exception 'PREREQUISITE_MISSING: jalankan schema.sql dan migrasi 20261102080000 terlebih dahulu.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Perbaikan policy Storage (bucket admin-private-documents).
-- ---------------------------------------------------------------------------

drop policy if exists admin_docs_party_read on storage.objects;
create policy admin_docs_party_read on storage.objects
for select to authenticated
using (
  bucket_id = 'admin-private-documents'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or public.has_role(auth.uid(), 'super_admin')
    or (
      split_part(name, '/', 2) = 'qr'
      and exists (
        select 1
        from public.transaction_assignments a
        join public.transactions t on t.id = a.transaction_id
        where a.admin_id::text = split_part(storage.objects.name, '/', 1)
          and a.revoked_at is null
          and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
      )
    )
  )
);

-- Staf (admin/super_admin) membaca berkas KYC pengguna HANYA bila path
-- berkas persis tercatat pada pengajuan user_kyc_submissions — policy
-- ini dibuat SETELAH tabelnya (bagian 2), karena Postgres memvalidasi
-- ekspresi policy terhadap tabel yang sudah ada.

-- ---------------------------------------------------------------------------
-- 2. KYC pengguna (buyer/seller) — terpisah dari KYC admin.
--    Jenis dokumen (KTP/SIM/PASPOR + swafoto) adalah USULAN yang butuh
--    ACC Tuan sebelum dianggap final; tidak ada klaim hukum di sini.
-- ---------------------------------------------------------------------------

create table if not exists public.user_kyc_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  legal_name text not null,
  phone_e164 text not null,
  identity_document_type text not null,
  identity_document_object_path text not null,
  selfie_object_path text,
  status public.review_status not null default 'pending_review',
  reviewer_id uuid references auth.users(id),
  reviewer_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.user_kyc_submissions enable row level security;

drop policy if exists user_kyc_own_read on public.user_kyc_submissions;
create policy user_kyc_own_read on public.user_kyc_submissions
for select to authenticated
using (
  user_id = auth.uid()
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_admin')
);

drop policy if exists user_kyc_own_insert on public.user_kyc_submissions;
create policy user_kyc_own_insert on public.user_kyc_submissions
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists user_kyc_own_update on public.user_kyc_submissions;
create policy user_kyc_own_update on public.user_kyc_submissions
for update to authenticated
using (user_id = auth.uid() and status = 'pending_review')
with check (user_id = auth.uid() and status = 'pending_review');

create index if not exists user_kyc_submissions_user_idx
  on public.user_kyc_submissions (user_id, submitted_at desc);

-- Kirim / kirim ulang KYC ke admin. Pengajuan yang sudah disetujui
-- tidak dapat ditimpa; penolakan dapat dikirim ulang.
create or replace function public.submit_user_kyc(
  p_legal_name text,
  p_phone_e164 text,
  p_document_type text,
  p_document_path text,
  p_selfie_path text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if char_length(trim(coalesce(p_legal_name, ''))) < 3
    or char_length(p_legal_name) > 120 then
    raise exception 'INVALID_NAME';
  end if;
  if p_phone_e164 !~ '^\+?[0-9]{8,15}$' then
    raise exception 'INVALID_PHONE';
  end if;
  if p_document_type not in ('KTP', 'SIM', 'PASPOR') then
    raise exception 'INVALID_DOCUMENT_TYPE';
  end if;
  if split_part(p_document_path, '/', 1) <> v_uid::text
    or split_part(p_document_path, '/', 2) <> 'kyc'
    or char_length(p_document_path) < 5 then
    raise exception 'INVALID_DOCUMENT_PATH';
  end if;
  if p_selfie_path is not null and (
    split_part(p_selfie_path, '/', 1) <> v_uid::text
    or split_part(p_selfie_path, '/', 2) <> 'kyc'
  ) then
    raise exception 'INVALID_SELFIE_PATH';
  end if;
  if exists (
    select 1 from public.user_kyc_submissions
    where user_id = v_uid and status = 'approved'
  ) then
    raise exception 'KYC_ALREADY_APPROVED';
  end if;

  select id into v_existing_id
  from public.user_kyc_submissions
  where user_id = v_uid and status in ('pending_review', 'rejected')
  order by submitted_at desc
  limit 1;

  if v_existing_id is not null then
    update public.user_kyc_submissions
    set legal_name = p_legal_name,
        phone_e164 = p_phone_e164,
        identity_document_type = p_document_type,
        identity_document_object_path = p_document_path,
        selfie_object_path = p_selfie_path,
        status = 'pending_review',
        reviewer_id = null,
        reviewer_note = null,
        submitted_at = now(),
        reviewed_at = null
    where id = v_existing_id;
  else
    insert into public.user_kyc_submissions (
      user_id, legal_name, phone_e164, identity_document_type,
      identity_document_object_path, selfie_object_path, status
    ) values (
      v_uid, p_legal_name, p_phone_e164, p_document_type,
      p_document_path, p_selfie_path, 'pending_review'
    );
  end if;
  return 'submitted';
end;
$$;

-- Tinjau pengajuan KYC pengguna: admin dan super_admin (penerima KYC).
create or replace function public.review_user_kyc(
  p_submission_id uuid,
  p_decision text,
  p_note text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not (
    public.has_role(v_uid, 'admin') or public.has_role(v_uid, 'super_admin')
  ) then
    raise exception 'NOT_STAFF';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_DECISION';
  end if;
  if p_decision = 'rejected'
    and char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'INVALID_NOTE';
  end if;
  update public.user_kyc_submissions
  set status = p_decision::public.review_status,
      reviewer_id = v_uid,
      reviewer_note = nullif(trim(coalesce(p_note, '')), ''),
      reviewed_at = now()
  where id = p_submission_id and status = 'pending_review';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'NOT_PENDING';
  end if;
  return 'reviewed';
end;
$$;

revoke all on function public.submit_user_kyc(text, text, text, text, text) from public;
grant execute on function public.submit_user_kyc(text, text, text, text, text) to authenticated;
revoke all on function public.review_user_kyc(uuid, text, text) from public;
grant execute on function public.review_user_kyc(uuid, text, text) to authenticated;

-- Policy Storage untuk berkas KYC pengguna (setelah tabel ada).
-- Staf membaca berkas KYC pengguna HANYA bila path berkas persis
-- tercatat pada pengajuan user_kyc_submissions. Berkas KYC admin
-- (admin_kyc_submissions) tetap hanya pemilik + super_admin.
drop policy if exists user_kyc_staff_read on storage.objects;
create policy user_kyc_staff_read on storage.objects
for select to authenticated
using (
  bucket_id = 'admin-private-documents'
  and split_part(name, '/', 2) = 'kyc'
  and (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  )
  and exists (
    select 1
    from public.user_kyc_submissions s
    where s.user_id::text = split_part(storage.objects.name, '/', 1)
      and (
        s.identity_document_object_path = storage.objects.name
        or s.selfie_object_path = storage.objects.name
      )
  )
);

-- ---------------------------------------------------------------------------
-- 3. Pesan lokasi di chat transaksi (satu titik; tanpa pelacakan live).
-- ---------------------------------------------------------------------------

alter table public.transaction_messages
  add column if not exists message_type text not null default 'text';
alter table public.transaction_messages
  add column if not exists location_lat numeric(10, 7);
alter table public.transaction_messages
  add column if not exists location_lng numeric(10, 7);
alter table public.transaction_messages
  add column if not exists location_accuracy_m numeric(8, 2);
alter table public.transaction_messages
  add column if not exists location_shared_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transaction_messages_location_check'
  ) then
    alter table public.transaction_messages
      add constraint transaction_messages_location_check check (
        message_type in ('text', 'location')
        and (
          (message_type = 'text' and location_lat is null and location_lng is null)
          or (
            message_type = 'location'
            and location_lat between -90 and 90
            and location_lng between -180 and 180
          )
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Log audit akses (dipanggil dari penampil berkas + bundel bukti).
-- ---------------------------------------------------------------------------

create or replace function public.log_rekber_access(
  p_transaction_id uuid,
  p_action text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if char_length(p_action) < 3 or char_length(p_action) > 80 then
    raise exception 'INVALID_ACTION';
  end if;
  insert into public.audit_logs (actor_id, transaction_id, action, details)
  values (auth.uid(), p_transaction_id, p_action, coalesce(p_details, '{}'::jsonb));
end;
$$;

revoke all on function public.log_rekber_access(uuid, text, jsonb) from public;
grant execute on function public.log_rekber_access(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Kasus eskalasi (jalur ke tim penindakan).
--    Bundel bukti bersifat read-only: tidak ada policy tulis/hapus untuk
--    klien pada tabel ini maupun pada pesan chat.
-- ---------------------------------------------------------------------------

create table if not exists public.escalation_cases (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id),
  reported_by uuid not null references auth.users(id),
  category text not null check (category in ('kriminal', 'hack_akun', 'barang_tidak_sesuai', 'lainnya')),
  reason text not null check (char_length(reason) between 10 and 2000),
  status text not null default 'open'
    check (status in ('open', 'under_review', 'escalated', 'resolved', 'rejected')),
  handler_id uuid references auth.users(id),
  resolution text check (resolution is null or char_length(resolution) between 3 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.escalation_cases enable row level security;

-- Antrean kasus dapat dibaca pihak transaksi + staf. Isi bundel (chat,
-- lokasi, referensi KYC) diatur RLS masing-masing tabel + pemeriksaan
-- penangan di lapisan aplikasi: hanya admin penangan + super_admin.
drop policy if exists escalation_cases_read on public.escalation_cases;
create policy escalation_cases_read on public.escalation_cases
for select to authenticated
using (
  reported_by = auth.uid()
  or exists (
    select 1 from public.transactions t
    where t.id = transaction_id
      and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
  )
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_admin')
);

create index if not exists escalation_cases_status_idx
  on public.escalation_cases (status, created_at desc);

-- Buka kasus (atau buka ulang kasus yang sudah selesai/ditolak).
create or replace function public.open_rekber_case(
  p_transaction_id uuid,
  p_category text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tx record;
  v_existing record;
  v_case_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select buyer_id, seller_id into v_tx
  from public.transactions where id = p_transaction_id;
  if not found then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;
  if not (
    v_tx.buyer_id = v_uid
    or v_tx.seller_id = v_uid
    or public.has_role(v_uid, 'admin')
    or public.has_role(v_uid, 'super_admin')
  ) then
    raise exception 'NOT_TRANSACTION_PARTY';
  end if;
  if p_category not in ('kriminal', 'hack_akun', 'barang_tidak_sesuai', 'lainnya') then
    raise exception 'INVALID_CATEGORY';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10
    or char_length(p_reason) > 2000 then
    raise exception 'INVALID_REASON';
  end if;

  select id, status into v_existing
  from public.escalation_cases
  where transaction_id = p_transaction_id;

  if found and v_existing.status in ('open', 'under_review', 'escalated') then
    raise exception 'CASE_ALREADY_OPEN';
  end if;

  if found then
    update public.escalation_cases
    set reported_by = v_uid,
        category = p_category,
        reason = p_reason,
        status = 'open',
        handler_id = null,
        resolution = null,
        updated_at = now(),
        resolved_at = null
    where id = v_existing.id
    returning id into v_case_id;
  else
    insert into public.escalation_cases (
      transaction_id, reported_by, category, reason, status
    ) values (p_transaction_id, v_uid, p_category, p_reason, 'open')
    returning id into v_case_id;
  end if;
  return v_case_id;
end;
$$;

-- Ubah status kasus: hanya super_admin atau admin penangan transaksi.
create or replace function public.update_rekber_case_status(
  p_case_id uuid,
  p_status text,
  p_resolution text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_case record;
  v_tx record;
  v_is_handler boolean := false;
  v_updated int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select transaction_id, status into v_case
  from public.escalation_cases where id = p_case_id;
  if not found then
    raise exception 'CASE_NOT_FOUND';
  end if;
  select buyer_id, seller_id into v_tx
  from public.transactions where id = v_case.transaction_id;
  v_is_handler :=
    public.has_role(v_uid, 'super_admin')
    or exists (
      select 1 from public.transaction_assignments a
      where a.transaction_id = v_case.transaction_id
        and a.admin_id = v_uid
        and a.revoked_at is null
    );
  if not v_is_handler then
    raise exception 'NOT_CASE_HANDLER';
  end if;
  if v_case.status in ('resolved', 'rejected') then
    raise exception 'CASE_CLOSED';
  end if;
  if p_status not in ('under_review', 'escalated', 'resolved', 'rejected') then
    raise exception 'INVALID_STATUS';
  end if;
  if not (
    (v_case.status = 'open' and p_status in ('under_review', 'rejected'))
    or (v_case.status = 'under_review' and p_status in ('escalated', 'resolved', 'rejected'))
    or (v_case.status = 'escalated' and p_status in ('resolved', 'rejected'))
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_status in ('resolved', 'rejected')
    and char_length(trim(coalesce(p_resolution, ''))) < 3 then
    raise exception 'INVALID_RESOLUTION';
  end if;
  update public.escalation_cases
  set status = p_status,
      handler_id = v_uid,
      resolution = nullif(trim(coalesce(p_resolution, '')), ''),
      updated_at = now(),
      resolved_at = case when p_status in ('resolved', 'rejected') then now() else null end
  where id = p_case_id;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'CASE_NOT_FOUND';
  end if;
  return 'updated';
end;
$$;

revoke all on function public.open_rekber_case(uuid, text, text) from public;
grant execute on function public.open_rekber_case(uuid, text, text) to authenticated;
revoke all on function public.update_rekber_case_status(uuid, text, text) from public;
grant execute on function public.update_rekber_case_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Realtime: kasus eskalasi.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'escalation_cases'
    ) then
      execute 'alter publication supabase_realtime add table public.escalation_cases';
    end if;
  end if;
end $$;

-- Langkah untuk Tuan (super_admin) bila belum: jalankan di SQL Editor
-- setelah migrasi ini (ganti EMAIL_TUAN dengan email akun Tuan):
--   insert into public.user_roles (user_id, role)
--   select id, 'super_admin' from auth.users where email = 'EMAIL_TUAN'
--   on conflict (user_id, role) do nothing;
