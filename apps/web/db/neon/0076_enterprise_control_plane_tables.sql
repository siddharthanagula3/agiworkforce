-- Canonical enterprise control-plane schema.
--
-- These relations were already used by reachable Web and API-gateway routes,
-- but had no owned migration. Organization authorization is enforced both by
-- the route and by RLS so a missed application predicate fails closed.

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.app_has_org_role(
  target_organization_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.organization_members as membership
     where membership.organization_id = target_organization_id
       and membership.user_id = public.current_app_user_id()
       and membership.role = any (allowed_roles)
  );
$$;

revoke all on function public.app_has_org_role(uuid, text[]) from public;
grant execute on function public.app_has_org_role(uuid, text[]) to app_rls;

create table if not exists public.sso_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_type text not null check (provider_type in ('saml', 'oidc')),
  domain text not null check (
    domain = lower(domain)
    and char_length(domain) between 3 and 253
  ),
  display_name text check (display_name is null or char_length(display_name) <= 200),
  metadata_url text,
  metadata_xml text check (
    metadata_xml is null or octet_length(metadata_xml) <= 500000
  ),
  attribute_mapping jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attribute_mapping) = 'object'),
  created_by text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_sso_connections_domain
  on public.sso_connections (lower(domain));
create index if not exists idx_sso_connections_org_created
  on public.sso_connections (organization_id, created_at desc);

drop trigger if exists set_sso_connections_updated_at on public.sso_connections;
create trigger set_sso_connections_updated_at
  before update on public.sso_connections
  for each row execute function public.set_row_updated_at();

create table if not exists public.directory_sync_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null
    check (provider in ('okta', 'azure_ad', 'google', 'onelogin', 'generic_scim')),
  directory_id text not null check (char_length(directory_id) between 1 and 255),
  display_name text check (display_name is null or char_length(display_name) <= 255),
  is_active boolean not null default true,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, directory_id)
);

create index if not exists idx_directory_sync_connections_org_created
  on public.directory_sync_connections (organization_id, created_at desc);

drop trigger if exists set_directory_sync_connections_updated_at
  on public.directory_sync_connections;
create trigger set_directory_sync_connections_updated_at
  before update on public.directory_sync_connections
  for each row execute function public.set_row_updated_at();

create table if not exists public.organization_admin_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  default_privacy_mode text not null default 'byok'
    check (default_privacy_mode in ('local', 'byok', 'managed')),
  allowed_privacy_modes text[] not null default array['local', 'byok']::text[]
    check (
      cardinality(allowed_privacy_modes) > 0
      and allowed_privacy_modes <@ array['local', 'byok', 'managed']::text[]
    ),
  allow_managed_compute boolean not null default false,
  require_local_to_byok_preview boolean not null default true,
  chat_sync_surfaces text[] not null default array['web', 'desktop', 'mobile']::text[]
    check (
      cardinality(chat_sync_surfaces) > 0
      and chat_sync_surfaces <@ array['web', 'desktop', 'mobile']::text[]
    ),
  allow_cli_cloud_sync boolean not null default false,
  allow_vscode_cloud_sync boolean not null default false,
  allow_chrome_cloud_sync boolean not null default false,
  audit_export_enabled boolean not null default true,
  retention_days integer not null default 365
    check (retention_days between 1 and 3650),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (default_privacy_mode = any (allowed_privacy_modes))
);

drop trigger if exists set_organization_admin_policies_updated_at
  on public.organization_admin_policies;
create trigger set_organization_admin_policies_updated_at
  before update on public.organization_admin_policies
  for each row execute function public.set_row_updated_at();

create table if not exists public.enterprise_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id text,
  surface text not null,
  action text not null,
  resource_type text not null,
  resource_id text,
  outcome text not null check (outcome in ('success', 'failure', 'denied')),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists idx_enterprise_audit_events_org_created
  on public.enterprise_audit_events (organization_id, created_at desc);
create index if not exists idx_enterprise_audit_events_actor_created
  on public.enterprise_audit_events (actor_user_id, created_at desc)
  where actor_user_id is not null;

create table if not exists public.organization_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id text,
  privacy_mode text not null check (privacy_mode in ('local', 'byok', 'managed')),
  provider text not null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  provider_cost_usd numeric(18, 8) not null default 0 check (provider_cost_usd >= 0),
  charged_amount_usd numeric(18, 8) not null default 0 check (charged_amount_usd >= 0),
  gross_margin_usd numeric(18, 8) not null,
  gross_margin_pct numeric(12, 8),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  check (organization_id is not null or user_id is not null)
);

create index if not exists idx_organization_usage_ledger_org_created
  on public.organization_usage_ledger (organization_id, created_at desc)
  where organization_id is not null;
create index if not exists idx_organization_usage_ledger_user_created
  on public.organization_usage_ledger (user_id, created_at desc)
  where user_id is not null;

create table if not exists public.support_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  requester_user_id text not null,
  subject text not null check (char_length(subject) between 1 and 160),
  description text not null check (char_length(description) between 1 and 5000),
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open'
    check (
      status in (
        'open', 'triaged', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'
      )
    ),
  privacy_label text not null default 'security_sensitive'
    check (privacy_label in ('local_only', 'byok', 'managed', 'security_sensitive')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_support_cases_org_created
  on public.support_cases (organization_id, created_at desc)
  where organization_id is not null;
create index if not exists idx_support_cases_requester_created
  on public.support_cases (requester_user_id, created_at desc);

drop trigger if exists set_support_cases_updated_at on public.support_cases;
create trigger set_support_cases_updated_at
  before update on public.support_cases
  for each row execute function public.set_row_updated_at();

grant select, insert, update, delete on
  public.sso_connections,
  public.directory_sync_connections,
  public.organization_admin_policies,
  public.enterprise_audit_events,
  public.organization_usage_ledger,
  public.support_cases
to app_rls;

alter table public.sso_connections enable row level security;
alter table public.sso_connections force row level security;
create policy sso_connections_admin_read
  on public.sso_connections for select to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));
create policy sso_connections_owner_insert
  on public.sso_connections for insert to app_rls
  with check (public.app_has_org_role(organization_id, array['owner']::text[]));
create policy sso_connections_owner_update
  on public.sso_connections for update to app_rls
  using (public.app_has_org_role(organization_id, array['owner']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner']::text[]));
create policy sso_connections_owner_delete
  on public.sso_connections for delete to app_rls
  using (public.app_has_org_role(organization_id, array['owner']::text[]));

alter table public.directory_sync_connections enable row level security;
alter table public.directory_sync_connections force row level security;
create policy directory_sync_connections_admin_access
  on public.directory_sync_connections for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

alter table public.organization_admin_policies enable row level security;
alter table public.organization_admin_policies force row level security;
create policy organization_admin_policies_member_read
  on public.organization_admin_policies for select to app_rls
  using (
    public.app_has_org_role(
      organization_id,
      array['owner', 'admin', 'member', 'viewer']::text[]
    )
  );
create policy organization_admin_policies_admin_write
  on public.organization_admin_policies for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

alter table public.enterprise_audit_events enable row level security;
alter table public.enterprise_audit_events force row level security;
create policy enterprise_audit_events_admin_read
  on public.enterprise_audit_events for select to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

alter table public.organization_usage_ledger enable row level security;
alter table public.organization_usage_ledger force row level security;
create policy organization_usage_ledger_admin_read
  on public.organization_usage_ledger for select to app_rls
  using (
    organization_id is not null
    and public.app_has_org_role(organization_id, array['owner', 'admin']::text[])
  );

alter table public.support_cases enable row level security;
alter table public.support_cases force row level security;
create policy support_cases_requester_or_admin_read
  on public.support_cases for select to app_rls
  using (
    requester_user_id = public.current_app_user_id()
    or (
      organization_id is not null
      and public.app_has_org_role(organization_id, array['owner', 'admin']::text[])
    )
  );
create policy support_cases_member_insert
  on public.support_cases for insert to app_rls
  with check (
    requester_user_id = public.current_app_user_id()
    and (
      organization_id is null
      or public.app_has_org_role(
        organization_id,
        array['owner', 'admin', 'member', 'viewer']::text[]
      )
    )
  );
