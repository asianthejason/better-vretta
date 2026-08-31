-- Backfill profiles for Auth users created before the profile trigger existed,
-- including Google users that already appear in Authentication > Users.
insert into public.profiles (id, email, full_name, role)
select
  id,
  coalesce(email, ''),
  coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', ''),
  case when raw_user_meta_data->>'role' = 'teacher' then 'teacher'::public.user_role else 'student'::public.user_role end
from auth.users
on conflict (id) do nothing;

-- Allows an OAuth signup returning from Google to apply the account type chosen
-- on Jretta's signup screen. Dropping first makes this migration safe to rerun.
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());
