-- Temporary Chat (Cloud mode) retention: mark conversations created in
-- Temporary Chat mode so a cron job can purge them after ~30 days instead
-- of persisting them indefinitely like normal conversations.
-- See docs/products/agi-mobile/volume-23-settings.md ("Temporary Chat").

alter table public.web_conversations
  add column if not exists is_temporary boolean not null default false;

create index if not exists idx_web_conversations_temporary_created
  on public.web_conversations(created_at)
  where is_temporary = true;
