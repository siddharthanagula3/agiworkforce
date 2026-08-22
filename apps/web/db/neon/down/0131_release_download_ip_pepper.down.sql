-- =============================================================================
-- Reversal: 0131_release_download_ip_pepper.sql
--
-- Restores the 0020_functions.sql definition of record_release_download: it
-- takes the raw client IP again and hashes it with the fixed literal salt
-- 'agiworkforce-salt'.
--
-- What running this costs, plainly: that salt is public in this repository and
-- constant for every row, so IPv4 addresses hashed under it are recoverable by
-- offline precomputation. Rolling back re-enables that, and it also puts raw IP
-- addresses back on the wire from the web app to the database. Roll back only
-- to unblock a deployment pinned to application code that predates
-- apps/web/lib/server/ip-hash.ts, and treat it as temporary.
--
-- This does NOT restore release_downloads.ip_hash. The forward migration set
-- those values to NULL precisely because they were reversible, and the
-- addresses they were derived from were never stored, so nothing here could
-- recompute them. Reversing the schema does not reverse that erasure:
-- unique_downloads for releases downloaded before the cutover stays zero.
--
-- The parameter rename (p_ip_hash -> p_ip_address) is why this drops rather
-- than replaces: Postgres refuses to rename an input parameter in CREATE OR
-- REPLACE. pgcrypto is left installed -- it is cluster-wide and shared.
-- =============================================================================

begin;

drop function if exists public.record_release_download(uuid, text, text, text, text, text);

create function public.record_release_download(
  p_release_id uuid,
  p_ip_address text,
  p_user_agent text default null,
  p_country_code text default null,
  p_region text default null,
  p_referrer text default null
)
returns uuid
language plpgsql
as $$
declare
  v_ip_hash text;
  v_download_id uuid;
begin
  v_ip_hash := encode(digest(p_ip_address || 'agiworkforce-salt', 'sha256'), 'hex');

  insert into public.release_downloads (
    release_id,
    ip_hash,
    user_agent,
    country_code,
    region,
    referrer
  ) values (
    p_release_id,
    v_ip_hash,
    p_user_agent,
    p_country_code,
    p_region,
    p_referrer
  )
  returning id into v_download_id;

  return v_download_id;
end;
$$;

delete from public.schema_migrations
where filename = '0131_release_download_ip_pepper.sql';

commit;
