-- Reversal of 0137 — remove row-level security from the ten user-owned tables.
--
-- WHAT THIS COSTS: app_rls is a NON-BYPASSRLS role that 0037 granted
-- SELECT/INSERT/UPDATE/DELETE on every table in public. With these policies
-- gone that grant is unconditional again, so any RLS-scoped query reaching one
-- of these tables without a user predicate reads and writes EVERY user's rows.
-- That includes two-factor secrets in user_two_factor, session records in
-- account_sessions, and free-text search terms in search_history.
--
-- No row is deleted or changed. Only run this if a policy is breaking a
-- legitimate reader, and fix that reader rather than leaving this off.

begin;

drop policy if exists user_two_factor_user_isolation on public.user_two_factor;
alter table public.user_two_factor no force row level security;
alter table public.user_two_factor disable row level security;

drop policy if exists account_sessions_user_isolation on public.account_sessions;
alter table public.account_sessions no force row level security;
alter table public.account_sessions disable row level security;

drop policy if exists notifications_user_isolation on public.notifications;
alter table public.notifications no force row level security;
alter table public.notifications disable row level security;

drop policy if exists chat_folders_user_isolation on public.chat_folders;
alter table public.chat_folders no force row level security;
alter table public.chat_folders disable row level security;

drop policy if exists conversation_tags_user_isolation on public.conversation_tags;
alter table public.conversation_tags no force row level security;
alter table public.conversation_tags disable row level security;

drop policy if exists message_bookmarks_user_isolation on public.message_bookmarks;
alter table public.message_bookmarks no force row level security;
alter table public.message_bookmarks disable row level security;

drop policy if exists message_reactions_user_isolation on public.message_reactions;
alter table public.message_reactions no force row level security;
alter table public.message_reactions disable row level security;

drop policy if exists user_shortcuts_user_isolation on public.user_shortcuts;
alter table public.user_shortcuts no force row level security;
alter table public.user_shortcuts disable row level security;

drop policy if exists email_preferences_user_isolation on public.email_preferences;
alter table public.email_preferences no force row level security;
alter table public.email_preferences disable row level security;

drop policy if exists search_history_tenant_isolation on public.search_history;
alter table public.search_history no force row level security;
alter table public.search_history disable row level security;

delete from public.schema_migrations
 where filename = '0137_user_content_rls_coverage.sql';

commit;
