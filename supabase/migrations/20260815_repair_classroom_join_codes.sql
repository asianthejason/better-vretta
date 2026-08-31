-- Repairs classrooms whose join code is null or blank.
update public.classrooms
set join_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where join_code is null or trim(join_code) = '';

alter table public.classrooms
alter column join_code set not null;

notify pgrst, 'reload schema';
