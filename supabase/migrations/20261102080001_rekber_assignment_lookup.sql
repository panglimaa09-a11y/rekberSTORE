-- ============================================================================
-- RekberSTORE: lookup penugasan admin (tambahan untuk migrasi alur).
-- Dijalankan Tuan di SQL Editor setelah 20261102080000. Idempotent.
-- Alasan: transaction_assignments tidak memiliki policy SELECT untuk
-- pihak transaksi, sehingga UI memerlukan fungsi security definer ini
-- untuk menampilkan admin penangan + memberi akses halaman detail.
-- ============================================================================
begin;

create or replace function public.get_rekber_assignment(p_transaction_id uuid)
returns table(admin_id uuid, admin_display_name text, assigned_at timestamptz)
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
    a.admin_id,
    coalesce(p.display_name, ''),
    a.assigned_at
  from public.transaction_assignments a
  left join public.profiles p on p.id = a.admin_id
  where a.transaction_id = p_transaction_id
    and a.revoked_at is null
  order by a.assigned_at desc
  limit 1;
end;
$$;

revoke all on function public.get_rekber_assignment(uuid) from public, anon;
grant execute on function public.get_rekber_assignment(uuid) to authenticated;

commit;
