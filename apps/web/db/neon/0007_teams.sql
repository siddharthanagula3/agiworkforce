create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_teams_owner_id on public.teams(owner_id);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id text not null,
  email text,
  name text,
  role text not null default 'viewer'
    check (role = any (array['admin', 'editor', 'viewer'])),
  joined_at timestamptz not null default now(),
  constraint team_members_unique unique (team_id, user_id)
);

create index if not exists idx_team_members_team_id on public.team_members(team_id);
create index if not exists idx_team_members_user_id on public.team_members(user_id);
