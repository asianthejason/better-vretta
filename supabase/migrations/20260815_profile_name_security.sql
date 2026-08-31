-- Users may edit their display name, but profile email is immutable through the API.
-- Role remains writable because the OAuth callback applies the role selected at signup.
revoke update on table public.profiles from authenticated;
grant update (full_name, role) on table public.profiles to authenticated;

notify pgrst, 'reload schema';
