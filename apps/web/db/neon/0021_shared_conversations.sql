create table if not exists public.shared_conversations (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique,
  messages_json text not null,
  title text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_shared_conversations_token
  on public.shared_conversations(token);
