-- Chat feature tables missing from original Neon migration
-- Ported from Supabase schema to support reactions, bookmarks, branches, folders, shortcuts

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.web_messages(id) on delete cascade,
  user_id text not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint message_reactions_unique unique (message_id, user_id, emoji)
);
create index if not exists idx_message_reactions_message on public.message_reactions(message_id);

create table if not exists public.message_bookmarks (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.web_messages(id) on delete cascade,
  user_id text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint message_bookmarks_unique unique (message_id, user_id)
);
create index if not exists idx_message_bookmarks_user on public.message_bookmarks(user_id);

create or replace view public.bookmarked_messages as
  select mb.id as bookmark_id, mb.user_id, mb.note, mb.created_at as bookmarked_at,
         wm.id as message_id, wm.conversation_id, wm.role, wm.content, wm.model, wm.created_at as message_created_at
  from public.message_bookmarks mb
  join public.web_messages wm on wm.id = mb.message_id;

create table if not exists public.conversation_branches (
  id uuid primary key default gen_random_uuid(),
  source_conversation_id uuid not null references public.web_conversations(id) on delete cascade,
  target_conversation_id uuid not null references public.web_conversations(id) on delete cascade,
  branch_point_message_id uuid references public.web_messages(id) on delete set null,
  user_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_conversation_branches_source on public.conversation_branches(source_conversation_id);

create table if not exists public.chat_folders (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_chat_folders_user on public.chat_folders(user_id);

alter table public.web_conversations add column if not exists folder_id uuid references public.chat_folders(id) on delete set null;

create or replace function public.move_session_to_folder(p_session_id uuid, p_folder_id uuid, p_user_id text)
returns void language plpgsql as $$
begin
  update public.web_conversations
  set folder_id = p_folder_id, updated_at = now()
  where id = p_session_id and user_id = p_user_id;
end;
$$;

create table if not exists public.user_shortcuts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  content text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_user_shortcuts_user on public.user_shortcuts(user_id);
