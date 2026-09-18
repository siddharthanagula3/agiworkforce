-- Reversal of 0225, drop the identity provenance columns and the account status
-- vocabulary.
--
-- The two identities columns are dropped, so where a mapping came from and when
-- it last authenticated are lost. The mappings themselves are untouched.
-- Dropping the account status constraint leaves the column as 0020 had it, a
-- bare text with no vocabulary, so any row already carrying 'locked',
-- 'deletion_scheduled' or 'deleted' keeps that value and the application stops
-- distinguishing it from a suspension.

begin;

alter table public.identities
  drop constraint if exists identities_creation_source_known;

alter table public.identities
  drop column if exists creation_source;

alter table public.identities
  drop column if exists last_authenticated_at;

alter table public.profiles
  drop constraint if exists profiles_account_status_known;

delete from public.schema_migrations
 where filename = '0225_identity_account_lifecycle.sql';

commit;
