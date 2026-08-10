-- =============================================================================
-- 0106 — GitHub webhook delivery replay protection (AGI Guardian Phase 1)
--
-- GitHub retries webhook deliveries and operators can redeliver them manually;
-- both arrive with the same X-GitHub-Delivery id and a valid HMAC signature.
-- Before this table, the webhook route had no memory of processed deliveries,
-- so a redelivery re-ran the whole pipeline (and could double-post PR
-- comments — the review debounce narrows but does not close that window).
--
-- The unique constraint on delivery_id IS the dedup mechanism: the route does
-- `insert … on conflict do nothing returning id` and treats "no row returned"
-- as "already processed, acknowledge and stop". Rows are an idempotency
-- ledger, not an audit log — they carry no payload, and receive-time is kept
-- only so a retention job can prune anything older than GitHub's own
-- redelivery horizon (30 days) without touching live protection.
-- =============================================================================

create table if not exists public.github_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_id text not null unique check (length(delivery_id) between 1 and 128),
  event text not null check (length(event) between 1 and 64),
  action text check (action is null or length(action) between 1 and 64),
  installation_id bigint,
  received_at timestamptz not null default now()
);

-- Retention pruning scans by age only; delivery_id lookups ride the unique
-- constraint's own index.
create index if not exists idx_github_webhook_deliveries_received_at
  on public.github_webhook_deliveries(received_at);
