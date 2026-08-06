-- 0092_sso_domain_uniqueness_on_verified_only.sql
--
-- Closes a denial-of-service and tenant-enumeration hole in the SSO domain
-- reservation introduced by 0076 and left in place by 0083.
--
-- 0076:60-61 creates
--     create unique index idx_sso_connections_domain
--       on public.sso_connections (lower(domain));
-- which is GLOBAL and applies to EVERY row, including unverified drafts.
--
-- 0083 then added `domain_verified_at` plus a constraint that an ACTIVE
-- connection must be verified and provisioned, which correctly prevents an
-- unverified claim from ever routing a sign-in. But it did not change who may
-- RESERVE a domain. The result:
--
--   * DENIAL OF SERVICE. Any enterprise subscriber can create an unverified
--     draft claiming a domain it does not own — a competitor's, or a customer's
--     — and that draft takes a permanent global lock. The rightful owner can
--     then never create an SSO connection for their own domain, and there is no
--     expiry and no self-service path out.
--
--   * ENUMERATION. The resulting unique-violation is itself a disclosure: it
--     tells the caller that some other tenant has already claimed that domain.
--
-- Domain ownership is established by verification, not by arriving first. So
-- uniqueness belongs on VERIFIED rows only: any number of tenants may hold an
-- unverified draft for a domain, and the first to actually PROVE ownership wins
-- it exclusively. A squatter's draft can never be verified — it cannot satisfy
-- the DNS/token challenge — so it never blocks the rightful owner.
--
-- Verification-time races are still handled: two tenants attempting to verify
-- the same domain concurrently, only one of which can genuinely pass the
-- challenge, still collide on this partial index and the loser gets a unique
-- violation at the moment of verification rather than at draft creation.

begin;

-- The global reservation is the defect; drop it.
drop index if exists public.idx_sso_connections_domain;

-- Exclusivity attaches to proven ownership.
create unique index if not exists idx_sso_connections_domain_verified
  on public.sso_connections (lower(domain))
  where domain_verified_at is not null;

-- Drafts are still worth indexing for lookup; just not uniquely.
create index if not exists idx_sso_connections_domain_lookup
  on public.sso_connections (lower(domain));

comment on index public.idx_sso_connections_domain_verified is
  'A domain may be held exclusively only once ownership is VERIFIED. Unverified drafts deliberately do not reserve a domain: a global reservation let any tenant permanently squat a domain it did not own (see 0092).';

commit;
