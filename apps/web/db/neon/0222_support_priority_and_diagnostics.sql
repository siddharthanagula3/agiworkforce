-- =============================================================================
-- Migration: 0222_support_priority_and_diagnostics.sql
-- Purpose  : queue order that honours a contracted support tier, and the
--            machine context a support reply otherwise has to ask for.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- MIGRATION NUMBER: 0222 is the next contiguous number after 0221, which is what
-- scripts/check-neon-migrations.mjs requires. A concurrent lane has an untracked
-- 0235 would have left 0223 through 0234 empty and failed that contiguity check on its
-- own; renumbering it is that lane's change, not this one. Nothing in application
-- code references the number; only the sibling
-- `support-priority-diagnostics-migration.test.ts` path constant does.
--
-- -----------------------------------------------------------------------------
-- WHY PRIORITY IS A STORED COLUMN AND NOT A JOIN
-- -----------------------------------------------------------------------------
-- `organization_billing_contracts.support_tier` has been negotiated per
-- enterprise contract since 0163 and nothing ever read it, so a customer who
-- bought a support tier waited behind an anonymous marketing visitor.
--
-- The queue could join to the contract at read time, but the tier that matters
-- is the one in force WHEN THE PERSON ASKED. A contract that ends while someone
-- is waiting must not silently demote them mid-queue, and a tier upgraded after
-- the fact must not retroactively rewrite the order they were answered in.
-- Resolving once at insert and storing the answer is therefore the correct
-- shape, and it also keeps the queue reader a single-table scan.
--
-- An unrecognised tier resolves to 'normal' in application code
-- (lib/support/handoff/priority.ts): a value nobody recognises in a Stripe
-- metadata field is a typo far more often than it is a promise.
--
-- -----------------------------------------------------------------------------
-- WHY DIAGNOSTICS IS ITS OWN COLUMN
-- -----------------------------------------------------------------------------
-- `account_context` answers "who is this and what do they pay for".
-- `diagnostics` answers "which build, which environment, what failed just
-- before". Folding the second into the first would make the retention rule
-- below unstatable, because the two have different lifetimes and different
-- sensitivity: diagnostics is machine context with no conversation content in
-- it, and is safe to attach to a ticket a human reads.
--
-- The payload is validated, clamped and secret-redacted before write by
-- lib/support/diagnostics/schema.ts. The column is nullable: a surface that
-- collects nothing stores nothing, which is different from storing an empty
-- object that reads as "we looked and there was nothing to report".
--
-- -----------------------------------------------------------------------------
-- ACCESS MODEL
-- -----------------------------------------------------------------------------
-- Unchanged from 0089. These tables stay SERVICE-CONTEXT ONLY: no privilege is
-- granted to `app_rls`, every reader and writer goes through
-- lib/support/handoff/store.ts and lib/support/tickets/store.ts with an
-- explicit owner predicate, and RLS stays off for the reasons 0089 states at
-- length. Adding a column does not change who can reach the row.
--
-- -----------------------------------------------------------------------------
-- RETENTION
-- -----------------------------------------------------------------------------
-- Both columns live on rows the existing sweeps already delete:
-- support_handoff_sessions by AGI_SUPPORT_HANDOFF_RETENTION_DAYS, and
-- support_tickets by account erasure (lib/server/account-erasure.ts) and the
-- account export (app/api/user/export/route.ts), both of which already cover
-- these tables row-wise and therefore cover the new columns.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Escalation queue order
-- -----------------------------------------------------------------------------

alter table public.support_handoff_sessions
  add column if not exists priority text not null default 'normal',
  add column if not exists support_tier text,
  add column if not exists diagnostics jsonb;

alter table public.support_handoff_sessions
  drop constraint if exists support_handoff_sessions_priority_check;

alter table public.support_handoff_sessions
  add constraint support_handoff_sessions_priority_check
    check (priority in ('urgent', 'high', 'normal', 'low'));

comment on column public.support_handoff_sessions.priority is
  'Queue order, resolved once from the contracted support tier in force when the escalation was raised. Never recomputed, so a contract that ends mid-wait cannot demote someone already in the queue.';
comment on column public.support_handoff_sessions.support_tier is
  'The raw organization_billing_contracts.support_tier the priority was derived from, kept so an operator can tell a deliberate normal from an unrecognised tier that fell back to normal.';
comment on column public.support_handoff_sessions.diagnostics is
  'Machine context collected on the client and redacted before write: surface, build, environment, platform, locale, viewport and the last few failures. Never conversation content.';

-- Partial, because the queue reader only ever scans waiting rows. The column
-- order matches the `order by`, so the index answers it without a sort.
create index if not exists idx_support_handoff_sessions_queue
  on public.support_handoff_sessions (priority, created_at)
  where status = 'waiting';

-- -----------------------------------------------------------------------------
-- 2. Tickets
-- -----------------------------------------------------------------------------
-- support_tickets and support_ticket_replies were created by 0024 and have been
-- carried by the account export and the erasure path ever since, with no service
-- writing to them. The three columns below are what a ticket needs to be the
-- durable record an escalation becomes, rather than a second inbox.

alter table public.support_tickets
  add column if not exists diagnostics jsonb,
  add column if not exists support_tier text,
  add column if not exists handoff_session_id uuid
    references public.support_handoff_sessions(id) on delete set null;

comment on column public.support_tickets.handoff_session_id is
  'The live escalation this ticket was opened from, when there was one. Null for a ticket raised directly. Set null on delete, because the handoff retention sweep is shorter than the ticket lifetime and losing the transcript must not lose the ticket.';

create index if not exists idx_support_tickets_status_priority
  on public.support_tickets (status, priority, created_at desc);

create index if not exists idx_support_tickets_handoff
  on public.support_tickets (handoff_session_id)
  where handoff_session_id is not null;

commit;
