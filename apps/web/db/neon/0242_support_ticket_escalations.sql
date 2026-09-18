-- =============================================================================
-- Migration 0242: the engineering escalation a support ticket becomes
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : 0024 gave a ticket a status and a priority, and 0222 gave it a
--          contracted support tier. Nothing carried a ticket out of support:
--          a bug reported by a paying customer lived and died in the queue,
--          and the only record that engineering had been told was whatever a
--          human remembered to write in a reply. This table is that record.
--
-- Gate   : `paged_at` is not decoration. escalateTicket pages on-call for a p0
--          or a p1, and the check constraint below refuses a p0/p1 row that
--          claims no page was attempted, so a severity cannot be inflated to
--          jump the queue without the page that severity promises. The
--          converse is allowed: a page attempted for a p2 is over-caution,
--          not a lie.
--
-- RLS    : no privilege is granted to app_rls, matching 0089's rule for the
--          sibling handoff tables. Escalations are written and read by the
--          audited service behind requirePlatformAdmin; the person who raised
--          the ticket sees its status, not the engineering record, because the
--          summary quotes internal triage.
--
-- Depends: 0024 (support_tickets)
-- =============================================================================

begin;

create table if not exists public.support_ticket_escalations (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  reference_id text not null unique check (reference_id ~ '^AGI-[0-9]{8}-[0-9A-HJKMNP-TV-Z]{8}$'),
  severity text not null check (severity in ('p0', 'p1', 'p2', 'p3')),
  summary text not null check (char_length(summary) between 1 and 4000),
  escalated_by_user_id text not null,
  tracker text not null check (tracker in ('on-call', 'support-engineering')),
  paged_at timestamptz,
  page_outcome text check (page_outcome in ('paged', 'unconfigured', 'failed')),
  responders jsonb not null default '[]'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint support_ticket_escalations_urgent_is_paged
    check (severity not in ('p0', 'p1') or paged_at is not null),
  constraint support_ticket_escalations_page_outcome_is_dated
    check ((paged_at is null) = (page_outcome is null))
);

comment on table public.support_ticket_escalations is
  'One engineering escalation raised from a support ticket. The reference_id is the id a customer can quote and an engineer can search, in the same AGI-YYYYMMDD-XXXXXXXX shape a live handoff uses.';
comment on column public.support_ticket_escalations.paged_at is
  'When on-call was paged. A p0 or p1 row cannot exist without it, so severity and the page it promises cannot drift apart.';
comment on column public.support_ticket_escalations.responders is
  'The on-call handles the dispatch reported at the time of the page, kept because the rotation changes and a later lookup would answer for today rather than for the incident.';

create index if not exists support_ticket_escalations_ticket_idx
  on public.support_ticket_escalations (ticket_id, created_at desc);

create index if not exists support_ticket_escalations_open_idx
  on public.support_ticket_escalations (severity, created_at desc)
  where resolved_at is null;

alter table public.support_ticket_escalations enable row level security;
alter table public.support_ticket_escalations force row level security;

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. A p0 that never paged anyone is not an escalation:
-- --    INSERT INTO public.support_ticket_escalations
-- --      (ticket_id, reference_id, severity, summary, escalated_by_user_id, tracker)
-- --      VALUES ('<ticket>', 'AGI-20260918-ABCDEFGH', 'p0', 's', 'u', 'on-call');
-- --    EXPECT: check violation (support_ticket_escalations_urgent_is_paged).
--
-- -- 2. A page with no outcome, or an outcome with no page, is not a record:
-- --    Same INSERT with severity 'p2', paged_at = now(), page_outcome = null.
-- --    EXPECT: check violation (support_ticket_escalations_page_outcome_is_dated).
--
-- -- 3. A reference id that is not quotable is rejected:
-- --    Same INSERT with reference_id = 'AGI-20260918-ILOU0000'.
-- --    EXPECT: check violation (the reference_id pattern excludes I, L, O and U).
--
-- -- 4. The application role cannot read escalations:
-- --    SET ROLE app_rls; SELECT * FROM public.support_ticket_escalations;
-- --    EXPECT: permission denied.
