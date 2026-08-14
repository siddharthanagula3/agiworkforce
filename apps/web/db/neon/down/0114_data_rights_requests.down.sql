-- Reversal of 0114 — drop the data-principal rights request queue.
--
-- WHAT THIS COSTS: dropping `data_rights_requests` destroys every access,
-- correction, erasure, withdrawal, nomination and grievance request on record,
-- including the ones still unanswered. A requester who was given a reference
-- will quote it at a queue that no longer exists, and the product loses its
-- only evidence that a request was ever received — which is exactly what a data
-- principal must be able to show before approaching the Data Protection Board.
--
-- If the forward migration has been live, dump the table before running this,
-- and answer anything still open first:
--
--   \copy (select * from public.data_rights_requests) to 'data_rights_requests.csv' csv header
--   select * from public.data_rights_requests where status in ('received','in_progress');
--
-- Note the rows carry PLAINTEXT reply addresses (see the forward migration for
-- why), so treat any dump as personal data: store it where the rest of the
-- production data lives, not in a ticket or a laptop download folder.
--
-- The RLS policy, both indexes and both check constraints go with the table;
-- each is named below so the coverage check can account for it.

BEGIN;

drop policy if exists data_rights_requests_user_isolation on public.data_rights_requests;

alter table public.data_rights_requests
  drop constraint if exists data_rights_requests_request_type_check;
alter table public.data_rights_requests
  drop constraint if exists data_rights_requests_status_check;
alter table public.data_rights_requests
  drop constraint if exists data_rights_requests_reference_key;

drop index if exists public.idx_data_rights_requests_user;
drop index if exists public.idx_data_rights_requests_open;

alter table public.data_rights_requests disable row level security;

drop table if exists public.data_rights_requests;

delete from public.schema_migrations where filename = '0114_data_rights_requests.sql';

COMMIT;
