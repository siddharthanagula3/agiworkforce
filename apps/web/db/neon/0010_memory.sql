create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  content text not null,
  category text,
  source text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_memories_user_id
  on public.user_memories(user_id)
  where is_deleted = false;
