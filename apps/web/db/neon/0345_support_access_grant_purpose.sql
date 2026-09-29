-- =============================================================================
-- Migration 0345: every break-glass grant names its purpose
--
-- Why    : Google API Limited Use lets a person read Google user data only with
--          the user's consent, for security or abuse investigation (a bug
--          included), or to comply with law. A grant said why in free text but
--          not which of those it was, so nothing could withhold Gmail and
--          Calendar content from a grant opened for ordinary support.
--
-- Shape  : support_access_grants gains purpose. Rows written before this
--          migration become 'support', the one purpose that reads no Google
--          user data, so an existing grant loses that access rather than
--          keeping it on a purpose nobody stated.
--
-- Depends: 0229 (support_access_grants)
-- =============================================================================

begin;

alter table public.support_access_grants
  add column if not exists purpose text not null default 'support';

alter table public.support_access_grants
  drop constraint if exists support_access_grants_purpose_is_known;

alter table public.support_access_grants
  add constraint support_access_grants_purpose_is_known
  check (purpose in ('support', 'security', 'abuse', 'legal', 'customer_consent'));

comment on column public.support_access_grants.purpose is
  'Why the grant exists. Only security, abuse, legal and customer_consent grants are shown Google user data.';

commit;
