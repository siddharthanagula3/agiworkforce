-- Reversal of 0338 : Advanced Account Security is removed.
--
-- WHAT THIS COSTS: every enrollment, registered passkey and security key,
-- recovery key hash, pending recovery hold, session verification and open
-- challenge is deleted. Enrolled accounts return to standard sign-in, and a
-- recovery that was waiting out its hold is forgotten. profiles loses the time
-- its address was last set or changed.

begin;

drop trigger if exists stamp_profile_email_change on public.profiles;
drop function if exists public.stamp_profile_email_change();
alter table public.profiles drop column if exists email_changed_at;

drop policy if exists account_security_challenges_owner on public.account_security_challenges;
drop trigger if exists set_account_security_challenges_updated_at on public.account_security_challenges;
drop index if exists public.idx_account_security_challenges_expiry;
drop index if exists public.idx_account_security_challenges_session;
drop table if exists public.account_security_challenges;

drop policy if exists account_security_sessions_owner on public.account_security_sessions;
drop index if exists public.idx_account_security_sessions_user;
drop table if exists public.account_security_sessions;

drop policy if exists account_security_credentials_owner on public.account_security_credentials;
drop trigger if exists set_account_security_credentials_updated_at on public.account_security_credentials;
drop index if exists public.idx_account_security_credentials_user;
drop table if exists public.account_security_credentials;

drop policy if exists account_security_enrollments_owner on public.account_security_enrollments;
drop trigger if exists set_account_security_enrollments_updated_at on public.account_security_enrollments;
drop table if exists public.account_security_enrollments;

delete from public.schema_migrations
 where filename = '0338_account_security.sql';

commit;
