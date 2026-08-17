-- 0122 — durable queue for rights-holder takedown notices.
--
-- WHY A TABLE AND NOT THE AUDIT LOG
-- Notices previously landed in public.security_audit_logs as a
-- 'content_notice' event. That is durable and admin-readable, but an audit log
-- records that something happened; it has no status column, so there was no
-- place to record what was DONE about a notice. A rights-holder who is told
-- their notice was received is owed a disposition, and a counter-notice has to
-- attach to the original claim. Both need a row that can change state.
--
-- WHAT IT DELIBERATELY DOES NOT DO
-- A row here removes nothing. POST /api/copyright-notice is an unauthenticated
-- public intake, and an allegation from an anonymous caller must never be able
-- to unpublish a stranger's content. Removal is POST /api/admin/takedown, which
-- is admin-gated and separately audited. The form says so in those words.
--
-- WHY reporter_email IS PLAINTEXT
-- Same reason as data_rights_requests.contact_email: the row exists so the
-- notice can be answered, and a digest cannot receive a reply.
--
-- ERASURE CLASSIFICATION
-- These rows are NOT user-scoped and are deliberately absent from
-- USER_SCOPED_TABLES. A notice is a claim made by a third party ABOUT content,
-- not the content owner's own data, and deleting the accused account must not
-- erase the record of a claim made against it. target_owner_id is therefore a
-- plain text column and not a cascading reference: the claim outlives the row
-- it was made about, which is the point of keeping it.

create table if not exists public.copyright_notices (
  id uuid primary key default gen_random_uuid(),

  -- Human-quotable handle given to the reporter on submit, so a follow-up or a
  -- counter-notice can name the claim without restating it.
  reference text not null unique,

  reporter_name text not null,
  reporter_email text not null,
  reporter_organization text,

  -- What was reported. kind mirrors the two publicly reachable surfaces that
  -- POST /api/admin/takedown can revoke.
  target_kind text not null check (target_kind in ('conversation-share', 'published-artifact')),
  target_token text not null,

  -- Resolved at intake when the token matches live public content, so a notice
  -- about content that has since been deleted still records who owned it.
  -- Plain text, not a reference: see the erasure note above.
  target_owner_id text,

  -- The claim itself, length-capped by the route.
  work_description text not null,
  statement text not null,

  -- The three affirmations the published policy requires. Stored so the record
  -- shows they were made, rather than the form merely having displayed them.
  affirms_good_faith boolean not null,
  affirms_accuracy boolean not null,
  affirms_authority boolean not null,

  status text not null default 'received' check (
    status in ('received', 'actioned', 'rejected', 'counter_notified')
  ),

  -- What was done and why. Written by whoever works the queue; never shown to
  -- the reporter automatically.
  disposition_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- The two reads that exist: the open queue, and every notice about one token
-- (a token can be reported more than once, and a counter-notice must find the
-- claim it answers).
create index if not exists idx_copyright_notices_open
  on public.copyright_notices (status, created_at)
  where status in ('received', 'counter_notified');

create index if not exists idx_copyright_notices_target
  on public.copyright_notices (target_kind, target_token, created_at desc);

-- No grant to app_rls. There is no user-scoped read of this table: intake runs
-- on the owner connection from an unauthenticated route, and the queue is read
-- behind requireAdmin on the same connection. Granting the scoped role would
-- create a path for a signed-in user to enumerate claims.
alter table public.copyright_notices enable row level security;
alter table public.copyright_notices force row level security;

comment on table public.copyright_notices is
  'Rights-holder takedown notices. A row removes nothing; removal is POST /api/admin/takedown, which is admin-gated and separately audited.';
comment on column public.copyright_notices.target_owner_id is
  'Plain text, not a reference: deleting the accused account must not erase the record of a claim made against it.';
comment on column public.copyright_notices.reporter_email is
  'Plaintext by necessity — the row exists to be replied to.';
comment on column public.copyright_notices.status is
  'received on intake; actioned once the content is revoked; rejected when the claim is refused; counter_notified when the owner has disputed it.';
