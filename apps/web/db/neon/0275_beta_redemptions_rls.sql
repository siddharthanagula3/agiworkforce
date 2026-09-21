alter table public.beta_redemptions enable row level security;
alter table public.beta_redemptions force row level security;

drop policy if exists beta_redemptions_user_isolation on public.beta_redemptions;
create policy beta_redemptions_user_isolation
  on public.beta_redemptions
  for all
  to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());
