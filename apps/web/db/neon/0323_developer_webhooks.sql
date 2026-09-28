-- =============================================================================
-- Migration 0323: developer webhooks with signed deliveries and a delivery log
--
-- Why    : a developer could stream only a workspace's audit log to an
--          endpoint, so nothing told an integration that a key was created or
--          revoked or that a task run finished without polling. OpenAI and
--          Claude Console webhooks send chosen events to a registered HTTPS
--          endpoint, signed with a secret shown once, retry a failed delivery
--          and let the developer resend one.
--
-- Shape  : developer_webhook_endpoints holds a person's endpoints, each with
--          the event types it receives and its signing secret sealed at rest;
--          only the prefix is readable. developer_webhook_deliveries is one
--          row per event per endpoint: the payload as sent, its status, the
--          attempt count, the last response status and the last error. The
--          answer's body is never read. A resend is a new row pointing at the
--          delivery it repeats and keeps the event id, so a receiver can drop a
--          duplicate.
--
-- Depends: 0037 (profiles, current_app_user_id), 0076 (set_row_updated_at)
-- =============================================================================

begin;

create table if not exists public.developer_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  url text not null check (url ~ '^https://' and char_length(url) <= 2048),
  description text check (description is null or char_length(description) <= 200),
  event_types text[] not null check (cardinality(event_types) between 1 and 32),
  secret_enc text not null,
  secret_prefix text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_developer_webhook_endpoints_updated_at on public.developer_webhook_endpoints;
create trigger set_developer_webhook_endpoints_updated_at
  before update on public.developer_webhook_endpoints
  for each row execute function public.set_row_updated_at();

create index if not exists idx_developer_webhook_endpoints_user
  on public.developer_webhook_endpoints (user_id, created_at desc);

revoke all on public.developer_webhook_endpoints from app_rls;
grant select, insert, update, delete on public.developer_webhook_endpoints to app_rls;

alter table public.developer_webhook_endpoints enable row level security;
alter table public.developer_webhook_endpoints force row level security;

drop policy if exists developer_webhook_endpoints_owner on public.developer_webhook_endpoints;
create policy developer_webhook_endpoints_owner
  on public.developer_webhook_endpoints for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

create table if not exists public.developer_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.developer_webhook_endpoints(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  event_id uuid not null,
  event_type text not null check (char_length(event_type) <= 64),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  response_status integer,
  error text check (error is null or char_length(error) <= 500),
  redelivery_of uuid references public.developer_webhook_deliveries(id) on delete set null,
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_developer_webhook_deliveries_updated_at on public.developer_webhook_deliveries;
create trigger set_developer_webhook_deliveries_updated_at
  before update on public.developer_webhook_deliveries
  for each row execute function public.set_row_updated_at();

create index if not exists idx_developer_webhook_deliveries_endpoint
  on public.developer_webhook_deliveries (endpoint_id, created_at desc);

create index if not exists idx_developer_webhook_deliveries_user
  on public.developer_webhook_deliveries (user_id, created_at desc);

revoke all on public.developer_webhook_deliveries from app_rls;
grant select, insert, update, delete on public.developer_webhook_deliveries to app_rls;

alter table public.developer_webhook_deliveries enable row level security;
alter table public.developer_webhook_deliveries force row level security;

drop policy if exists developer_webhook_deliveries_owner on public.developer_webhook_deliveries;
create policy developer_webhook_deliveries_owner
  on public.developer_webhook_deliveries for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

commit;
