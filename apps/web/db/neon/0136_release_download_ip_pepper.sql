-- =============================================================================
-- Migration: 0131_release_download_ip_pepper.sql
-- Purpose  : Stop the database from hashing visitor IP addresses with a salt
--            that is checked into this repository, and destroy the addresses
--            already recoverable from the rows it wrote.
--
-- The defect
-- -----------------------------------------------------------------------------
-- 0020_functions.sql defined record_release_download to take the raw client IP
-- and store
--
--   encode(digest(p_ip_address || 'agiworkforce-salt', 'sha256'), 'hex')
--
-- The salt is a literal in this source tree and identical for every row ever
-- written, so it is not a secret. IPv4 is a ~4.3 billion value space: anyone
-- who reads release_downloads.ip_hash (a dump, a backup, a replica, a leaked
-- connection string) can precompute the whole space offline and recover every
-- visitor's address. The column documented a privacy property it never had.
--
-- The change
-- -----------------------------------------------------------------------------
-- Hashing moves to the application, where the key can live in the secret store
-- instead of in Git: apps/web/lib/server/ip-hash.ts computes
-- HMAC-SHA256(key, domain || NUL || ip). The database now receives the digest
-- and never sees an address, so a database compromise alone no longer yields
-- one -- reversing a digest additionally requires the key, which only the
-- application runtime holds.
--
-- The parameter is renamed p_ip_address -> p_ip_hash, which CREATE OR REPLACE
-- cannot do (Postgres refuses to rename an input parameter), hence the drop and
-- recreate. The argument types are unchanged, so no other object depends on the
-- old signature.
--
-- The guard is the point, not decoration: a caller that has not been updated
-- would otherwise write a raw IP straight into the ip_hash column, which is
-- strictly worse than the weak hash being removed. A 64-character hex digest is
-- the only accepted shape, so a raw address raises instead of being stored. The
-- single caller (apps/web/app/api/releases/latest/[platform]/route.ts) records
-- downloads on a best-effort path that logs and swallows failures, so during a
-- rollout where old code meets this function the effect is a lost analytics row,
-- never a failed update check and never a stored address.
--
-- The rows already written
-- -----------------------------------------------------------------------------
-- Changing the function protects future writes only. Every row already in
-- release_downloads holds a digest under the public salt and is reversible
-- today, which is exactly the exposure this migration exists to remove, so this
-- clears them: ip_hash is set to NULL for every pre-existing row.
--
-- They are not left to expire. cleanup_old_download_records (0020_functions.sql)
-- would delete rows older than 90 days, but nothing calls it -- no route, no
-- script, no cron in vercel.json -- so retention on this table is currently
-- unbounded and "it ages out" would be false.
--
-- What clearing cannot reach: snapshots taken before this runs -- Neon
-- point-in-time restore windows, branches cut from an earlier head, and any
-- exported dump. Those still hold the salted digests until they expire, so the
-- exposure closes only once they are gone, not the moment this applies.
--
-- What clearing costs: get_release_download_stats reports unique_downloads as
-- count(distinct ip_hash), which ignores NULL, so unique-visitor counts for
-- releases downloaded before this migration drop to zero and rebuild from here.
-- total_downloads and every time-window count are unaffected, because the rows
-- themselves are kept. An unrecoverable analytics number is the correct trade
-- against a recoverable list of visitor addresses.
--
-- The ACCESS EXCLUSIVE lock closes the window in which a session still running
-- the old function commits one more salted row after the clear and before the
-- new definition becomes visible. It is held for the rest of this transaction;
-- the table's only writer is the best-effort analytics path above, which
-- tolerates a brief block.
--
-- If it fails to apply: the runner sets lock_timeout 10s and statement_timeout
-- 120s per migration, and the whole file is one transaction, so a timeout rolls
-- back with nothing half-done and re-applying is safe. A lock_timeout means a
-- writer held the table -- retry. A statement_timeout means the UPDATE is
-- rewriting more rows than 120s allows (nothing prunes this table, so it only
-- grows); raise statement_timeout for that run, or replace the UPDATE with the
-- catalog-only equivalent, which erases the same values without a rewrite:
--   alter table public.release_downloads drop column ip_hash;
--   alter table public.release_downloads add column ip_hash text;
-- Nothing indexes or constrains ip_hash, so the two are equivalent apart from
-- column order.
-- =============================================================================

lock table public.release_downloads in access exclusive mode;

drop function if exists public.record_release_download(uuid, text, text, text, text, text);

create function public.record_release_download(
  p_release_id uuid,
  p_ip_hash text,
  p_user_agent text default null,
  p_country_code text default null,
  p_region text default null,
  p_referrer text default null
)
returns uuid
language plpgsql
as $$
declare
  v_download_id uuid;
begin
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'record_release_download expects a hex sha-256 digest, not an IP address'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.release_downloads (
    release_id,
    ip_hash,
    user_agent,
    country_code,
    region,
    referrer
  ) values (
    p_release_id,
    p_ip_hash,
    p_user_agent,
    p_country_code,
    p_region,
    p_referrer
  )
  returning id into v_download_id;

  return v_download_id;
end;
$$;

update public.release_downloads
set ip_hash = null
where ip_hash is not null;

-- =============================================================================
-- VERIFICATION -- run MANUALLY on a throwaway Neon BRANCH before applying to
-- production. (Commented so it never runs during apply.)
-- =============================================================================
--
-- -- (a) The function no longer names an address parameter.
-- select pg_get_function_arguments(p.oid)
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'record_release_download';
-- --   EXPECT: p_release_id uuid, p_ip_hash text, ...
--
-- -- (b) A raw address is rejected rather than stored.
-- select public.record_release_download(
--   (select id from public.releases limit 1), '203.0.113.7');
-- --   EXPECT: ERROR invalid_parameter_value.
--
-- -- (c) A digest is accepted.
-- select public.record_release_download(
--   (select id from public.releases limit 1), repeat('a', 64));
-- --   EXPECT: a uuid.
--
-- -- (d) No digest written under the public salt survives. Run BEFORE the
-- --     application deploy that starts sending peppered digests, so every
-- --     non-null value would still be an old one.
-- select count(*) from public.release_downloads where ip_hash is not null;
-- --   EXPECT: 0.
--
-- -- (e) The rows themselves are kept, so download totals are intact.
-- select count(*) from public.release_downloads;
-- --   EXPECT: unchanged from before the migration.
