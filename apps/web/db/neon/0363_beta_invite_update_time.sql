-- Depends: 0011, 0279
begin;

alter table public.beta_invites
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists beta_invites_touch_updated_at on public.beta_invites;
create trigger beta_invites_touch_updated_at
  before update on public.beta_invites
  for each row execute function public.touch_row_updated_at();

commit;
