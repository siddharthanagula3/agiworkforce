begin;

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_capability_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_capability_check check (capability = any (array[
    'chat', 'image', 'video', 'transcription', 'embedding', 'computer_use', 'sandbox', 'tool',
    'storage', 'database', 'vector', 'notification', 'email', 'egress', 'browser',
    'work_compute', 'code_compute', 'connector', 'artifact', 'visual', 'decision',
    'hosting', 'auth', 'cache', 'observability'
  ]));

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_unit_basis_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_unit_basis_check check (unit_basis = any (array[
    'token', 'image', 'second', 'minute', 'request', 'gibibyte', 'gibibyte_month',
    'active_user_month'
  ]));

create table if not exists public.infrastructure_vendor_bills (
  id uuid primary key default gen_random_uuid(),
  vendor text not null check (vendor = any (array[
    'vercel', 'neon', 'cloudflare_r2', 'upstash', 'clerk', 'resend', 'sentry'
  ])),
  billing_month date not null check (billing_month = date_trunc('month', billing_month)::date),
  amount_microusd bigint not null check (amount_microusd >= 0),
  source text not null check (source = any (array['invoice', 'rate_card'])),
  attributed_microusd bigint check (attributed_microusd is null or attributed_microusd >= 0),
  allocated_microusd bigint check (allocated_microusd is null or allocated_microusd >= 0),
  active_users integer check (active_users is null or active_users >= 0),
  allocated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint infrastructure_vendor_bills_vendor_month_unique unique (vendor, billing_month)
);

create index if not exists idx_infrastructure_vendor_bills_unallocated
  on public.infrastructure_vendor_bills (billing_month)
  where allocated_at is null;

revoke all on public.infrastructure_vendor_bills from app_rls;

alter table public.infrastructure_vendor_bills enable row level security;
alter table public.infrastructure_vendor_bills force row level security;

commit;
