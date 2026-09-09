begin;

alter table public.teacher_checkout_attempts
  add column plan text not null default 'basic' check (plan in ('basic', 'unlimited')),
  add column ui_mode text not null default 'embedded_page' check (ui_mode in ('elements', 'embedded_page'));

-- Existing paid and free teachers retain unlimited access.
alter table public.teacher_entitlements
  add column plan text not null default 'unlimited' check (plan in ('basic', 'unlimited')),
  add column stripe_subscription_id text unique,
  add column subscription_status text,
  add column access_until timestamptz,
  add column cancel_at_period_end boolean not null default false;

create function public.teacher_has_access(target_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teacher_entitlements e where e.user_id = target_user_id
    and (e.stripe_subscription_id is null or
      (e.access_until > now() and e.subscription_status in ('active', 'past_due'))));
$$;
revoke all on function public.teacher_has_access(uuid) from public, anon;
grant execute on function public.teacher_has_access(uuid) to authenticated, service_role;

create function public.teacher_plan_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('plan', e.plan, 'active', public.teacher_has_access(e.user_id),
    'source', e.source, 'accessUntil', e.access_until, 'status', e.subscription_status,
    'cancelAtPeriodEnd', e.cancel_at_period_end, 'hasSubscription', e.stripe_subscription_id is not null)
  from public.teacher_entitlements e where e.user_id = auth.uid();
$$;
revoke all on function public.teacher_plan_status() from public, anon;
grant execute on function public.teacher_plan_status() to authenticated;

create function public.activate_teacher_plan(
  target_user_id uuid, entitlement_source text, selected_plan text,
  checkout_session_id text default null, subscription_id text default null,
  paid_until timestamptz default null, current_status text default null,
  cancel_renewal boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if selected_plan not in ('basic', 'unlimited') or entitlement_source not in ('coupon', 'stripe') then
    raise exception 'Invalid plan';
  end if;
  if entitlement_source = 'coupon' and (selected_plan <> 'unlimited' or subscription_id is not null) then
    raise exception 'Coupon requires free unlimited access';
  end if;
  if entitlement_source = 'stripe' and (subscription_id is null or paid_until is null or paid_until <= now() or current_status <> 'active') then
    raise exception 'An active paid subscription is required';
  end if;
  perform 1 from public.profiles where id = target_user_id for update;
  if not found then raise exception 'Profile not found'; end if;
  -- Retries cannot replace an existing active/free entitlement with a new plan.
  if public.teacher_has_access(target_user_id) then return; end if;
  if entitlement_source = 'coupon' and exists (select 1 from public.teacher_checkout_attempts where user_id = target_user_id) then
    raise exception 'Cancel the existing checkout before redeeming a coupon';
  end if;
  insert into public.teacher_entitlements
    (user_id, source, plan, stripe_checkout_session_id, stripe_subscription_id, access_until, subscription_status, cancel_at_period_end)
  values (target_user_id, entitlement_source, selected_plan, checkout_session_id, subscription_id, paid_until, current_status, cancel_renewal)
  on conflict (user_id) do update set source = excluded.source, plan = excluded.plan,
    stripe_checkout_session_id = excluded.stripe_checkout_session_id,
    stripe_subscription_id = excluded.stripe_subscription_id, access_until = excluded.access_until,
    subscription_status = excluded.subscription_status, cancel_at_period_end = excluded.cancel_at_period_end;
  update public.profiles set role = 'teacher' where id = target_user_id;
end;
$$;
revoke all on function public.activate_teacher_plan(uuid,text,text,text,text,timestamptz,text,boolean) from public,anon,authenticated;
grant execute on function public.activate_teacher_plan(uuid,text,text,text,text,timestamptz,text,boolean) to service_role;

create function public.sync_teacher_subscription(
  subscription_id text, selected_plan text, current_status text,
  paid_until timestamptz, cancel_renewal boolean
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if selected_plan not in ('basic', 'unlimited') then raise exception 'Invalid plan'; end if;
  update public.teacher_entitlements set plan = selected_plan, subscription_status = current_status,
    access_until = case when paid_until is not null then greatest(access_until, paid_until) else access_until end,
    cancel_at_period_end = cancel_renewal
  where stripe_subscription_id = subscription_id and source = 'stripe';
end;
$$;
revoke all on function public.sync_teacher_subscription(text,text,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.sync_teacher_subscription(text,text,text,timestamptz,boolean) to service_role;

-- Serialize classroom creation/ownership changes with a per-account row lock.
-- Co-taught classrooms also count as classrooms on an account.
create function public.enforce_teacher_classroom_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_teacher uuid; target_classroom uuid; selected_plan text; class_count integer;
begin
  target_teacher := new.teacher_id;
  if tg_table_name = 'classrooms' then target_classroom := new.id;
  else target_classroom := new.classroom_id; end if;
  if tg_op = 'UPDATE' and new.teacher_id = old.teacher_id then return new; end if;
  perform 1 from public.profiles where id = target_teacher for update;
  if not public.teacher_has_access(target_teacher) then raise exception 'An active teacher plan is required'; end if;
  select plan into selected_plan from public.teacher_entitlements where user_id = target_teacher;
  if selected_plan = 'basic' then
    select count(*) into class_count from (
      select id from public.classrooms where teacher_id = target_teacher and id <> target_classroom
      union
      select classroom_id from public.classroom_teachers where teacher_id = target_teacher and classroom_id <> target_classroom
    ) owned_or_shared;
    if class_count >= 2 then raise exception 'Your Essentials plan includes 2 classrooms. Remove a classroom before adding another.'; end if;
  end if;
  return new;
end;
$$;
create trigger teacher_classroom_limit before insert or update of teacher_id on public.classrooms
for each row execute function public.enforce_teacher_classroom_limit();
create trigger teacher_membership_limit before insert or update of teacher_id on public.classroom_teachers
for each row execute function public.enforce_teacher_classroom_limit();
revoke all on function public.enforce_teacher_classroom_limit() from public,anon,authenticated;

-- Expired accounts can begin a new subscription; active accounts cannot.
create or replace function public.guard_teacher_checkout() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.profiles where id = new.user_id for update;
  if public.teacher_has_access(new.user_id) then raise exception 'Teacher account is already active'; end if;
  return new;
end;
$$;

-- Browser guards are only navigation helpers. Enforce expired-plan write access
-- in the database too, including writes through existing RPC functions.
create function public.enforce_active_teacher_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and exists (select 1 from public.profiles where id=auth.uid() and role='teacher')
    and not public.teacher_has_access(auth.uid()) then
    raise exception 'Your teacher plan is inactive. Manage your subscription to continue.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.enforce_active_teacher_write() from public,anon,authenticated;
do $$
declare target_table text;
begin
  foreach target_table in array array['classrooms', 'classroom_teachers', 'classroom_students', 'classroom_assessments', 'assessment_student_access', 'assessments'] loop
    if to_regclass('public.' || target_table) is not null then
      execute format('create trigger require_active_teacher_plan before insert or update or delete on public.%I for each row execute function public.enforce_active_teacher_write()', target_table);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
