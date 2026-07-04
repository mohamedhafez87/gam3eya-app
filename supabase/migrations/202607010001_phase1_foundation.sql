create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  preferred_language text not null default 'ar' check (preferred_language in ('ar', 'en')),
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id),
  default_currency text not null default 'EGP',
  created_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  role text not null check (role in ('owner', 'admin', 'collector')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id),
  check (user_id is not null or invited_email is not null)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.gam3eyas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  monthly_amount numeric(12,2) not null check (monthly_amount > 0),
  currency text not null default 'EGP',
  start_month date not null,
  due_day int not null default 1 check (due_day between 1 and 28),
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.gam3eya_slots (
  id uuid primary key default gen_random_uuid(),
  gam3eya_id uuid not null references public.gam3eyas(id) on delete cascade,
  person_id uuid not null references public.people(id),
  slot_number int not null,
  payout_month date not null,
  status text not null default 'active' check (status in ('active', 'left')),
  unique (gam3eya_id, slot_number)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  gam3eya_id uuid not null references public.gam3eyas(id) on delete cascade,
  slot_id uuid not null references public.gam3eya_slots(id) on delete cascade,
  person_id uuid not null references public.people(id),
  month date not null,
  amount numeric(12,2) not null,
  method text check (method in ('cash','bank_transfer','instapay','vodafone_cash','other_wallet','other')),
  status text not null default 'unpaid' check (status in ('unpaid','paid')),
  paid_at timestamptz,
  recorded_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slot_id, month)
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  changed_fields text[],
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index organizations_owner_id_idx on public.organizations(owner_id);
create index organization_members_org_user_idx on public.organization_members(organization_id, user_id);
create index organization_members_user_idx on public.organization_members(user_id);
create index people_organization_id_idx on public.people(organization_id);
create index gam3eyas_organization_id_idx on public.gam3eyas(organization_id);
create index gam3eya_slots_gam3eya_id_idx on public.gam3eya_slots(gam3eya_id);
create index gam3eya_slots_person_id_idx on public.gam3eya_slots(person_id);
create index payments_gam3eya_id_idx on public.payments(gam3eya_id);
create index payments_slot_id_month_idx on public.payments(slot_id, month);
create index payments_person_id_idx on public.payments(person_id);
create index audit_log_organization_id_idx on public.audit_log(organization_id);

create or replace function public.current_user_org_role(target_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select om.role
  from public.organization_members om
  where om.organization_id = target_organization_id
    and om.user_id = (select auth.uid())
  limit 1
$$;

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_org_role(target_organization_id) is not null
$$;

create or replace function public.has_org_role(target_organization_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_org_role(target_organization_id) = any(allowed_roles), false)
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger payments_touch_updated_at
before update on public.payments
for each row execute function public.touch_updated_at();

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  source_gam3eya_id uuid;
  changed text[];
begin
  if tg_table_name in ('people', 'gam3eyas') then
    if tg_op = 'DELETE' then
      org_id := old.organization_id;
    else
      org_id := new.organization_id;
    end if;
  elsif tg_table_name = 'gam3eya_slots' then
    if tg_op = 'DELETE' then
      source_gam3eya_id := old.gam3eya_id;
    else
      source_gam3eya_id := new.gam3eya_id;
    end if;
    select g.organization_id into org_id
    from public.gam3eyas g
    where g.id = source_gam3eya_id;
  elsif tg_table_name = 'payments' then
    if tg_op = 'DELETE' then
      source_gam3eya_id := old.gam3eya_id;
    else
      source_gam3eya_id := new.gam3eya_id;
    end if;
    select g.organization_id into org_id
    from public.gam3eyas g
    where g.id = source_gam3eya_id;
  end if;
  if org_id is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(key order by key)
    into changed
    from jsonb_each(to_jsonb(new)) next
    where to_jsonb(old)->next.key is distinct from next.value;
  end if;

  insert into public.audit_log (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    before,
    after
  )
  values (
    org_id,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    changed,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

create trigger people_audit
after insert or update or delete on public.people
for each row execute function public.audit_row_change();

create trigger gam3eyas_audit
after insert or update or delete on public.gam3eyas
for each row execute function public.audit_row_change();

create trigger gam3eya_slots_audit
after insert or update or delete on public.gam3eya_slots
for each row execute function public.audit_row_change();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.people enable row level security;
alter table public.gam3eyas enable row level security;
alter table public.gam3eya_slots enable row level security;
alter table public.payments enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_select_own on public.profiles
for select using (id = (select auth.uid()));

create policy profiles_insert_own on public.profiles
for insert with check (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy organizations_select_member on public.organizations
for select using ((select public.is_org_member(id)));

create policy organizations_update_owner_admin on public.organizations
for update using ((select public.has_org_role(id, array['owner','admin'])))
with check ((select public.has_org_role(id, array['owner','admin'])));

create policy organization_members_select_org_member on public.organization_members
for select using ((select public.is_org_member(organization_id)));

create policy organization_members_insert_owner on public.organization_members
for insert with check ((select public.has_org_role(organization_id, array['owner'])));

create policy organization_members_update_owner on public.organization_members
for update using ((select public.has_org_role(organization_id, array['owner'])))
with check ((select public.has_org_role(organization_id, array['owner'])));

create policy organization_members_delete_owner on public.organization_members
for delete using ((select public.has_org_role(organization_id, array['owner'])));

create policy people_select_member on public.people
for select using ((select public.is_org_member(organization_id)));

create policy people_insert_owner_admin on public.people
for insert with check ((select public.has_org_role(organization_id, array['owner','admin'])));

create policy people_update_owner_admin on public.people
for update using ((select public.has_org_role(organization_id, array['owner','admin'])))
with check ((select public.has_org_role(organization_id, array['owner','admin'])));

create policy people_delete_owner_admin on public.people
for delete using ((select public.has_org_role(organization_id, array['owner','admin'])));

create policy gam3eyas_select_member on public.gam3eyas
for select using ((select public.is_org_member(organization_id)));

create policy gam3eyas_insert_owner_admin on public.gam3eyas
for insert with check (
  (select public.has_org_role(organization_id, array['owner','admin']))
  and created_by = (select auth.uid())
);

create policy gam3eyas_update_owner_admin on public.gam3eyas
for update using (
  status = 'draft'
  and (select public.has_org_role(organization_id, array['owner','admin']))
) with check (
  status = 'draft'
  and (select public.has_org_role(organization_id, array['owner','admin']))
);

create policy gam3eyas_delete_draft_owner_admin on public.gam3eyas
for delete using (
  status = 'draft'
  and (select public.has_org_role(organization_id, array['owner','admin']))
);

create policy gam3eya_slots_select_member on public.gam3eya_slots
for select using (
  exists (
    select 1 from public.gam3eyas g
    where g.id = gam3eya_id
      and (select public.is_org_member(g.organization_id))
  )
);

create policy gam3eya_slots_insert_draft_owner_admin on public.gam3eya_slots
for insert with check (
  exists (
    select 1 from public.gam3eyas g
    join public.people p on p.id = person_id and p.organization_id = g.organization_id
    where g.id = gam3eya_id
      and g.status = 'draft'
      and (select public.has_org_role(g.organization_id, array['owner','admin']))
  )
);

create policy gam3eya_slots_update_draft_owner_admin on public.gam3eya_slots
for update using (
  exists (
    select 1 from public.gam3eyas g
    join public.people p on p.id = person_id and p.organization_id = g.organization_id
    where g.id = gam3eya_id
      and g.status = 'draft'
      and (select public.has_org_role(g.organization_id, array['owner','admin']))
  )
) with check (
  exists (
    select 1 from public.gam3eyas g
    join public.people p on p.id = person_id and p.organization_id = g.organization_id
    where g.id = gam3eya_id
      and g.status = 'draft'
      and (select public.has_org_role(g.organization_id, array['owner','admin']))
  )
);

create policy gam3eya_slots_delete_draft_owner_admin on public.gam3eya_slots
for delete using (
  exists (
    select 1 from public.gam3eyas g
    where g.id = gam3eya_id
      and g.status = 'draft'
      and (select public.has_org_role(g.organization_id, array['owner','admin']))
  )
);

create policy payments_select_member on public.payments
for select using (
  exists (
    select 1 from public.gam3eyas g
    where g.id = gam3eya_id
      and (select public.is_org_member(g.organization_id))
  )
);

create policy audit_log_select_member on public.audit_log
for select using ((select public.is_org_member(organization_id)));

create or replace function public.create_initial_organization(org_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  user_email text;
  created_org public.organizations;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if nullif(trim(org_name), '') is null then
    raise exception 'Organization name is required';
  end if;

  select email into user_email from auth.users where id = current_user_id;

  insert into public.profiles (id, email)
  values (current_user_id, user_email)
  on conflict (id) do update set email = coalesce(public.profiles.email, excluded.email);

  insert into public.organizations (name, owner_id)
  values (trim(org_name), current_user_id)
  returning * into created_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (created_org.id, current_user_id, 'owner')
  on conflict (organization_id, user_id) do update set role = 'owner';

  return created_org;
end;
$$;

create or replace function public.activate_gam3eya(gam3eya_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_gam3eya public.gam3eyas;
  active_slot_count int;
  expected_sum int;
  inserted_count int;
begin
  select * into target_gam3eya
  from public.gam3eyas
  where id = gam3eya_id
  for update;

  if not found then
    raise exception 'Gam3eya not found';
  end if;
  if not public.has_org_role(target_gam3eya.organization_id, array['owner','admin']) then
    raise exception 'Not allowed';
  end if;
  if target_gam3eya.status <> 'draft' then
    raise exception 'Only draft gam3eyas can be activated';
  end if;

  select count(*), coalesce(sum(slot_number), 0)
  into active_slot_count, expected_sum
  from public.gam3eya_slots
  where gam3eya_slots.gam3eya_id = activate_gam3eya.gam3eya_id
    and status = 'active';

  if active_slot_count = 0 then
    raise exception 'At least one active slot is required';
  end if;
  if expected_sum <> (active_slot_count * (active_slot_count + 1) / 2) then
    raise exception 'Slot order must be complete from 1 to total slots';
  end if;

  insert into public.payments (gam3eya_id, slot_id, person_id, month, amount)
  select
    target_gam3eya.id,
    s.id,
    s.person_id,
    (target_gam3eya.start_month + (cycle_index || ' months')::interval)::date,
    target_gam3eya.monthly_amount
  from public.gam3eya_slots s
  cross join generate_series(0, active_slot_count - 1) as cycle_index
  where s.gam3eya_id = target_gam3eya.id
    and s.status = 'active'
  on conflict (slot_id, month) do nothing;

  get diagnostics inserted_count = row_count;

  update public.gam3eyas
  set status = 'active'
  where id = target_gam3eya.id;

  insert into public.audit_log (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    before,
    after
  )
  values (
    target_gam3eya.organization_id,
    (select auth.uid()),
    'activate',
    'gam3eyas',
    target_gam3eya.id,
    array['status'],
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'active', 'payments_created', inserted_count)
  );

  return jsonb_build_object(
    'gam3eya_id', target_gam3eya.id,
    'slot_count', active_slot_count,
    'cycle_count', active_slot_count,
    'payments_created', inserted_count
  );
end;
$$;

create or replace function public.record_payment(
  payment_id uuid,
  method text,
  paid_at timestamptz default now(),
  notes text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_payment public.payments;
  updated_payment public.payments;
  org_id uuid;
begin
  if method not in ('cash','bank_transfer','instapay','vodafone_cash','other_wallet','other') then
    raise exception 'Invalid payment method';
  end if;

  select p, g.organization_id into existing_payment, org_id
  from public.payments p
  join public.gam3eyas g on g.id = p.gam3eya_id
  where p.id = payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;
  if not public.has_org_role(org_id, array['owner','admin','collector']) then
    raise exception 'Not allowed';
  end if;

  update public.payments
  set status = 'paid',
      method = record_payment.method,
      paid_at = coalesce(record_payment.paid_at, now()),
      notes = record_payment.notes,
      recorded_by = (select auth.uid())
  where id = payment_id
  returning * into updated_payment;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, changed_fields, before, after)
  values (
    org_id,
    (select auth.uid()),
    'record_payment',
    'payments',
    payment_id,
    array['status','method','paid_at','notes','recorded_by'],
    to_jsonb(existing_payment),
    to_jsonb(updated_payment)
  );

  return updated_payment;
end;
$$;

create or replace function public.mark_payment_unpaid(payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_payment public.payments;
  updated_payment public.payments;
  org_id uuid;
begin
  select p, g.organization_id into existing_payment, org_id
  from public.payments p
  join public.gam3eyas g on g.id = p.gam3eya_id
  where p.id = payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;
  if not public.has_org_role(org_id, array['owner','admin','collector']) then
    raise exception 'Not allowed';
  end if;

  update public.payments
  set status = 'unpaid',
      method = null,
      paid_at = null,
      recorded_by = null
  where id = payment_id
  returning * into updated_payment;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, changed_fields, before, after)
  values (
    org_id,
    (select auth.uid()),
    'mark_payment_unpaid',
    'payments',
    payment_id,
    array['status','method','paid_at','recorded_by'],
    to_jsonb(existing_payment),
    to_jsonb(updated_payment)
  );

  return updated_payment;
end;
$$;

grant execute on function public.create_initial_organization(text) to authenticated;
grant execute on function public.activate_gam3eya(uuid) to authenticated;
grant execute on function public.record_payment(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.mark_payment_unpaid(uuid) to authenticated;
