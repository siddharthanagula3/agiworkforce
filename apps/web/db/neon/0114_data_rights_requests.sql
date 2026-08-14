-- 0114 — durable queue for data-principal rights requests (DPDP ss.11–14).
--
-- WHY A TABLE AND NOT A MAILTO
-- /contact is deliberately a mailto composer: it stores nothing, and that is the
-- honest design for general correspondence in a product with no transactional
-- email system. A rights request is different in one respect that matters. The
-- Act gives the Data Principal a right to a response and makes exhausting the
-- fiduciary's grievance route a precondition for approaching the Board, so both
-- sides need to be able to show that a request was made, when, and what happened
-- to it. A mailto leaves that entirely in the requester's sent folder. This
-- table is the receipt.
--
-- WHAT IT DELIBERATELY DOES NOT DO
-- Nothing here notifies anyone. There is no transactional email provider in this
-- repository, so a row landing in this table does not page a human, and the page
-- that writes it says so in those words rather than implying a ticket was
-- raised. The reader is `GET /api/admin/privacy/requests`, an admin-gated route
-- — see DPDP_PROGRESS.md for the operational gap that a monitored queue is a
-- human process, not a schema.
--
-- WHY contact_email IS PLAINTEXT
-- Every other email in this schema that can be hashed, is. This one cannot: the
-- entire purpose of the row is to be able to reply to the person, and a SHA-256
-- digest cannot receive a reply. The mitigation is retention, not hashing —
-- see the erasure classification note below.
--
-- ERASURE CLASSIFICATION
-- `data_rights_requests` is registered in USER_SCOPED_TABLES
-- (lib/server/account-erasure.ts), so account-bound rows are deleted with the
-- account. That is the right outcome for the common case: an erasure request is
-- discharged by the erasure itself, and keeping the request after fulfilling it
-- would mean the erasure did not erase. Rows with a NULL user_id — requests from
-- people who have no account — are NOT reachable by that path and no job ages
-- them out. That is a real, disclosed retention gap, not an oversight.

create table if not exists public.data_rights_requests (
  id uuid primary key default gen_random_uuid(),

  -- Human-quotable handle. Given to the requester on submit so a follow-up can
  -- name the request without them having to describe it again.
  reference text not null unique,

  -- Set when the request was made from a signed-in session. Null for a request
  -- made by someone with no account, which the Act plainly allows.
  user_id text references public.profiles(id) on delete cascade,

  -- Where the response goes. See the plaintext note above.
  contact_email text not null,

  -- Which right is being exercised. Constrained rather than free text so the
  -- queue can be counted by right, which is what an audit asks for.
  request_type text not null check (
    request_type in ('access', 'correction', 'erasure', 'withdrawal', 'nomination', 'grievance')
  ),

  -- What the person actually said. Free text, length-capped by the route.
  details text,

  status text not null default 'received' check (
    status in ('received', 'in_progress', 'resolved', 'rejected')
  ),

  -- What was done. Written by whoever works the queue; never shown to the
  -- requester automatically, because an unreviewed internal note is not a
  -- response.
  resolution_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- The two reads that exist: the requester's own history, and the open queue.
create index if not exists idx_data_rights_requests_user
  on public.data_rights_requests (user_id, created_at desc);

create index if not exists idx_data_rights_requests_open
  on public.data_rights_requests (status, created_at)
  where status in ('received', 'in_progress');

grant select, insert on public.data_rights_requests to app_rls;

alter table public.data_rights_requests enable row level security;
alter table public.data_rights_requests force row level security;

-- A signed-in user may see and create their own requests. Anonymous rows
-- (user_id null) are invisible on the scoped handle: they are written by the
-- public route over the owner connection, and nobody should be able to read a
-- stranger's grievance by guessing. The admin queue reads over the owner
-- connection behind `requireAdmin`.
drop policy if exists data_rights_requests_user_isolation on public.data_rights_requests;
create policy data_rights_requests_user_isolation
  on public.data_rights_requests for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

comment on table public.data_rights_requests is
  'Data-principal rights requests under DPDP ss.11-14. Writing a row notifies nobody; the queue is read by GET /api/admin/privacy/requests.';
comment on column public.data_rights_requests.contact_email is
  'Plaintext by necessity — the row exists to be replied to. Retention is the mitigation: account-bound rows are erased with the account.';
comment on column public.data_rights_requests.reference is
  'Handle given to the requester at submit time so a follow-up can name the request.';
