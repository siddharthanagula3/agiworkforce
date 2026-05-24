create table if not exists public.user_projects (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  description text,
  instructions text,
  color text,
  is_archived boolean not null default false,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_projects_user_id on public.user_projects(user_id);

create table if not exists public.project_knowledge_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.user_projects(id) on delete cascade,
  file_name text not null,
  mime_type text,
  byte_count integer not null default 0,
  checksum_sha256 text,
  summary text,
  source_surface text,
  added_by_user_id text,
  storage_uri text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_knowledge_files_project_id
  on public.project_knowledge_files(project_id);
