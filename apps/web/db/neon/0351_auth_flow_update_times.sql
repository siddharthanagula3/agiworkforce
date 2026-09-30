begin;

alter table public.github_install_authorizations
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists github_install_authorizations_touch_updated_at
  on public.github_install_authorizations;
create trigger github_install_authorizations_touch_updated_at
  before update on public.github_install_authorizations
  for each row execute function public.touch_row_updated_at();

alter table public.mobile_intent_tokens
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists mobile_intent_tokens_touch_updated_at on public.mobile_intent_tokens;
create trigger mobile_intent_tokens_touch_updated_at
  before update on public.mobile_intent_tokens
  for each row execute function public.touch_row_updated_at();

commit;
