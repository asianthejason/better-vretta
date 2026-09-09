begin;

-- Entitlements can only be written by the server. Existing teachers retain access.
create table public.teacher_entitlements (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  source text not null check (source in ('legacy', 'stripe', 'coupon')),
  stripe_checkout_session_id text unique,
  created_at timestamptz not null default now(),
  check ((source = 'stripe' and stripe_checkout_session_id is not null)
      or (source <> 'stripe' and stripe_checkout_session_id is null))
);
alter table public.teacher_entitlements enable row level security;
revoke all on public.teacher_entitlements from public, anon, authenticated;
grant all on public.teacher_entitlements to service_role;
insert into public.teacher_entitlements (user_id, source)
select id, 'legacy' from public.profiles where role = 'teacher';

-- Persist Checkout attempts so retries and multiple tabs reuse one session.
create table public.teacher_checkout_attempts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  attempt_id uuid not null default gen_random_uuid(),
  stripe_session_id text unique,
  created_at timestamptz not null default now()
);
alter table public.teacher_checkout_attempts enable row level security;
revoke all on public.teacher_checkout_attempts from public, anon, authenticated;
grant all on public.teacher_checkout_attempts to service_role;

create function public.guard_teacher_checkout() returns trigger
language plpgsql security definer set search_path = '' as $$
declare account_role public.user_role;
begin
  select role into account_role from public.profiles where id = new.user_id for update;
  if account_role = 'teacher' then raise exception 'Teacher account is already active'; end if;
  return new;
end;
$$;
create trigger guard_teacher_checkout before insert on public.teacher_checkout_attempts
for each row execute function public.guard_teacher_checkout();
revoke all on function public.guard_teacher_checkout() from public, anon, authenticated;

-- Auth metadata is client-controlled: it must never assign a teacher role.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    'student'::public.user_role);
  return new;
end;
$$;

revoke update on public.profiles from anon, authenticated;
revoke update (role) on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Defense in depth, including inserts and any existing SECURITY DEFINER RPCs.
create function public.enforce_teacher_entitlement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'teacher' and not exists (
    select 1 from public.teacher_entitlements where user_id = new.id
  ) then
    raise exception 'Teacher access requires a verified payment or coupon';
  end if;
  return new;
end;
$$;
create trigger require_teacher_entitlement before insert or update of role on public.profiles
for each row execute function public.enforce_teacher_entitlement();

-- Atomic and idempotent: webhook deliveries and the return page may race.
create function public.activate_teacher_account(
  target_user_id uuid, entitlement_source text, checkout_session_id text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if entitlement_source not in ('stripe', 'coupon') then
    raise exception 'Invalid entitlement source';
  end if;
  perform 1 from public.profiles where id = target_user_id for update;
  if not found then raise exception 'Account profile not found'; end if;
  -- Serialize free activation with Checkout creation, including other tabs.
  if entitlement_source = 'coupon' and exists (
    select 1 from public.teacher_checkout_attempts where user_id = target_user_id
  ) then
    raise exception 'Cancel the existing checkout before redeeming a coupon';
  end if;
  insert into public.teacher_entitlements (user_id, source, stripe_checkout_session_id)
  values (target_user_id, entitlement_source, checkout_session_id)
  on conflict (user_id) do nothing;
  update public.profiles set role = 'teacher' where id = target_user_id;
end;
$$;
revoke all on function public.activate_teacher_account(uuid, text, text) from public, anon, authenticated;
grant execute on function public.activate_teacher_account(uuid, text, text) to service_role;
revoke all on function public.enforce_teacher_entitlement() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
