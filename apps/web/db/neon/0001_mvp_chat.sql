create extension if not exists pgcrypto;

create table if not exists public.web_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null default 'New Chat',
  model text,
  pinned boolean not null default false,
  project_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.web_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.web_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  model text,
  provider text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_cents numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_web_conversations_user_updated
  on public.web_conversations(user_id, updated_at desc)
  where deleted_at is null;

create index if not exists idx_web_conversations_project_id
  on public.web_conversations(project_id);

create index if not exists idx_web_messages_conversation_created
  on public.web_messages(conversation_id, created_at asc);

create index if not exists idx_web_messages_metadata
  on public.web_messages using gin (metadata);

create or replace function public.update_web_conversation_timestamp()
returns trigger
language plpgsql
as $$
begin
  update public.web_conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists update_conversation_on_message on public.web_messages;
create trigger update_conversation_on_message
  after insert on public.web_messages
  for each row
  execute function public.update_web_conversation_timestamp();

