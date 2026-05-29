create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id text not null,
  role text not null default 'member'
    check (role = any (array['owner', 'admin', 'member', 'viewer'])),
  provisioning_source text,
  provisioned_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists idx_org_members_user_id
  on public.organization_members(user_id);
