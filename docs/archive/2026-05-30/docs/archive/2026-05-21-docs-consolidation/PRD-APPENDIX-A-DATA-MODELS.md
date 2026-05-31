# PRD V3 — Appendix A: Data models

**Parent:** [`docs/PRD.md`](PRD.md) | **Status:** locked | **Date:** 2026-05-17

This appendix specifies every persistent data store the AGI Workforce product depends on: Supabase tables (Cloud mode), SQLite tables (Local mode), the SLOT_REGISTRY and TIER_POLICIES that drive provider routing, the Dispatch / Stripe / Waitlist schemas, and the legacy-migrations deletion runbook.

Sources of truth in code:

- `supabase/migrations/*.sql` — 43 canonical migrations
- `packages/types/src/billing-catalog.ts` — pricing SSOT
- `packages/types/src/model-catalog.ts` — `SLOT_REGISTRY` + `TIER_POLICIES`
- `apps/desktop/src-tauri/data/db/` — SQLite SQLCipher-bundled storage layer

---

## §A.1 — Supabase canonical schema (Cloud mode)

Region: `us-east-2`. No EU residency (Enterprise post-W7 ROADMAP). RLS is **mandatory on every user-data table** ([§A.10 RLS policy contract](#a10--rls-policy-contract)).

### Identity & profile

| Table                   | Purpose                              | Key columns                                                                                                                    | RLS                                          |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `auth.users`            | Supabase-managed identity (built-in) | `id uuid pk`, `email`, `phone`, `created_at`                                                                                   | platform-managed                             |
| `public.profiles`       | Per-user product profile             | `user_id uuid pk fk→auth.users`, `display_name`, `tier billing_plan_tier`, `created_at`, `updated_at`                          | user can SELECT/UPDATE own; admin SELECT all |
| `public.account_status` | Account state machine                | `user_id uuid pk`, `status text` (`active`/`paused`/`suspended`/`deleted`), `reason text nullable`, `effective_at timestamptz` | user SELECT own; admin SELECT/UPDATE all     |
| `public.jwt_revocation` | Revoke-list for compromised JWTs     | `jti text pk`, `revoked_at timestamptz`, `reason text`                                                                         | service-role only                            |

### Billing & subscription

| Table                              | Purpose                            | Key columns                                                                                                                                                                                                                                                                                               | RLS                                               |
| ---------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `public.subscriptions`             | Stripe-mirrored subscription state | `user_id uuid pk fk`, `stripe_customer_id text`, `stripe_subscription_id text`, `tier billing_plan_tier`, `status text` (`active`/`trialing`/`past_due`/`canceled`/`paused`), `current_period_start timestamptz`, `current_period_end timestamptz`, `cancel_at_period_end bool`, `updated_at timestamptz` | user SELECT own; service-role full                |
| `public.token_credits`             | Per-user usage accumulator         | `user_id uuid fk`, `period_start timestamptz`, `tokens_used bigint`, `tokens_budget bigint`, `voice_minutes_used int`, `image_count_used int`, `video_seconds_used int`, `last_reset_at timestamptz`. Primary key `(user_id, period_start)`                                                               | user SELECT own; service-role full                |
| `public.processed_stripe_events`   | Idempotency ledger                 | `event_id text pk` (Stripe event ID), `event_type text`, `status text` (`processing`/`succeeded`/`failed`), `locked_at timestamptz`, `processed_at timestamptz nullable`, `error_message text nullable`, `attempts int default 0`                                                                         | service-role only                                 |
| `public.stripe_events`             | Raw Stripe event archive           | `id bigserial pk`, `event_id text unique`, `event_type text`, `payload jsonb`, `received_at timestamptz`                                                                                                                                                                                                  | service-role only                                 |
| `public.waitlist_signups` (W6 NEW) | Pre-Aug-1 waitlist                 | `id bigserial pk`, `email text unique`, `intended_tier billing_plan_tier`, `referrer text nullable`, `utm_source text nullable`, `utm_medium text nullable`, `utm_campaign text nullable`, `created_at timestamptz`, `converted_at timestamptz nullable`, `converted_to_user_id uuid nullable fk`         | public INSERT (rate-limited); service-role SELECT |

**RPC: `process_stripe_event_idempotent(p_event_id text) RETURNS boolean`** — single canonical entry point for webhook event handling. Returns `true` if event should be processed; `false` if already in-flight or completed. Atomically transitions row from `null` → `processing` (with `locked_at = now()`) or returns `false` if a row exists. Caller marks the row `succeeded` or `failed` on completion. Lives in `supabase/migrations/20260505000007_stripe_webhook_idempotency.sql`. Called from `apps/web/app/api/stripe-webhook/lib/idempotency.ts:12-15` (V2 PRD's claim of `route.ts:1251` was wrong — that file is 112 lines).

### Conversations & messages

| Table                         | Purpose                   | Key columns                                                                                                                                                                                                                                                                                                                             | RLS                                     |
| ----------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `public.conversations`        | Top-level chat            | `id uuid pk`, `user_id uuid fk`, `title text`, `provider text`, `model text`, `created_at timestamptz`, `updated_at timestamptz`, `archived_at timestamptz nullable`, `project_id uuid nullable fk → user_projects`                                                                                                                     | user owns own                           |
| `public.messages`             | Message rows              | `id uuid pk`, `conversation_id uuid fk`, `role text` (`user`/`assistant`/`tool`/`system`), `content jsonb` (multi-part), `provider text nullable`, `model text nullable`, `tokens_in int nullable`, `tokens_out int nullable`, `cost_cents int nullable`, `created_at timestamptz`, `parent_message_id uuid nullable fk` (for branches) | inherits conversation owner             |
| `public.message_branches`     | Branch metadata           | `id uuid pk`, `conversation_id uuid fk`, `name text`, `head_message_id uuid fk`, `created_at`                                                                                                                                                                                                                                           | inherits conversation owner             |
| `public.shared_conversations` | Read-only share           | `id uuid pk`, `conversation_id uuid fk`, `share_token text unique`, `expires_at timestamptz nullable`, `created_at`                                                                                                                                                                                                                     | reader: public via token; writer: owner |
| `public.shared_sessions`      | Multi-user collab session | `id uuid pk`, `conversation_id uuid fk`, `participants uuid[]`, `created_at`                                                                                                                                                                                                                                                            | participant SELECT; owner UPDATE        |

### Agents & workforce

| Table                         | Purpose                   | Key columns                                                                                                                                                                                                                                  | RLS                 |
| ----------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `public.workforce_tasks`      | Long-running agent jobs   | `id uuid pk`, `user_id uuid fk`, `conversation_id uuid fk nullable`, `status text` (`queued`/`running`/`completed`/`failed`/`canceled`), `intent text`, `plan jsonb`, `started_at timestamptz nullable`, `completed_at timestamptz nullable` | user owns own       |
| `public.workforce_executions` | Per-step execution log    | `id bigserial pk`, `task_id uuid fk`, `step int`, `tool_name text`, `input jsonb`, `output jsonb`, `duration_ms int`, `created_at`                                                                                                           | inherits task owner |
| `public.agent_actions`        | Pre-action approval state | `id uuid pk`, `task_id uuid fk`, `tool_name text`, `args jsonb`, `status text` (`pending`/`approved`/`denied`/`executed`), `created_at`, `decided_at timestamptz nullable`                                                                   | inherits task owner |
| `public.agent_messages`       | Inter-agent DM channel    | `id uuid pk`, `from_agent text`, `to_agent text`, `payload jsonb`, `signature text` (HMAC), `created_at`                                                                                                                                     | service-role        |

### Dispatch (mobile ↔ desktop)

| Table                         | Purpose                        | Key columns                                                                                                                                                                                                                        | RLS                       |
| ----------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `public.dispatch_keys`        | Pairing-derived session keys   | `pairing_id uuid pk`, `user_id uuid fk`, `salt text` (16 random bytes b64), `derived_key_hash text` (HKDF output hashed), `created_at`, `rotated_at timestamptz`, `revoked_at timestamptz nullable`                                | user owns own             |
| `public.dispatch_messages`    | Realtime control channel       | `id bigserial pk`, `from_surface text` (`mobile`/`desktop`), `to_surface text`, `pairing_id uuid fk`, `type text`, `payload jsonb`, `hmac text`, `nonce text`, `ts bigint` (unix ms), `delivered bool default false`, `created_at` | user owns own via pairing |
| `public.dispatch_agent_state` | Shared agent execution state   | `task_id uuid pk fk → workforce_tasks`, `state jsonb`, `version int`, `updated_at`                                                                                                                                                 | user owns via task        |
| `public.surface_heartbeats`   | Presence sync                  | `user_id uuid`, `surface text` (`desktop`/`mobile`), `last_seen_at timestamptz`. Primary key `(user_id, surface)`                                                                                                                  | user owns own             |
| `public.cross_device_threads` | Cross-surface conversation pin | `id uuid pk`, `user_id uuid fk`, `conversation_id uuid fk`, `surfaces text[]`, `created_at`                                                                                                                                        | user owns own             |

**RPC: `rotate_dispatch_keys(p_user_id uuid)`** — atomic rotation. Generates new salt, recomputes HKDF output, transitions rows. Used by mobile re-pair flow.

### Projects, teams, schedules

| Table                    | Purpose                     | Key columns                                                                                                                                                                       | RLS              |
| ------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `public.user_projects`   | User workspace              | `id uuid pk`, `user_id uuid fk`, `name text`, `description text`, `system_prompt text nullable`, `model_preference text nullable`, `created_at`                                   | user owns own    |
| `public.teams`           | Team workspace (Enterprise) | `id uuid pk`, `owner_user_id uuid fk`, `name text`, `slug text unique`, `created_at`                                                                                              | owner + members  |
| `public.team_members`    | Team membership             | `team_id uuid fk`, `user_id uuid fk`, `role text` (`owner`/`admin`/`member`), `joined_at`. Primary key `(team_id, user_id)`                                                       | own team members |
| `public.scheduled_tasks` | Cron-style recurring jobs   | `id uuid pk`, `user_id uuid fk`, `name text`, `cron_expression text`, `payload jsonb`, `next_run_at timestamptz`, `last_run_at timestamptz nullable`, `active bool`, `created_at` | user owns own    |

### Connectors & MCP

| Table                               | Purpose                        | Key columns                                                                                                                                                                                                    | RLS           |
| ----------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `public.user_connectors`            | Per-user OAuth connections     | `id uuid pk`, `user_id uuid fk`, `connector_id text` (one of 31 validated IDs), `credentials jsonb` (encrypted), `scopes text[]`, `created_at`, `expires_at timestamptz nullable`                              | user owns own |
| `public.connector_tool_permissions` | Per-tool consent grants        | `id uuid pk`, `user_id uuid fk`, `connector_id text`, `tool_name text`, `granted_at`, `revoked_at nullable`                                                                                                    | user owns own |
| `public.installed_mcp_servers`      | MCP marketplace install record | `id uuid pk`, `user_id uuid fk`, `manifest_url text`, `name text`, `version text`, `transport text` (`stdio`/`sse`/`http`), `installed_at`                                                                     | user owns own |
| `public.api_keys`                   | BYOK key registry (encrypted)  | `id uuid pk`, `user_id uuid fk`, `provider text`, `prefix text` (visible 8-char prefix for UI), `encrypted_secret bytea`, `created_at`, `last_used_at timestamptz nullable`, `revoked_at timestamptz nullable` | user owns own |

### Analytics & audit

| Table                              | Purpose                          | Key columns                                                                                                                                                  | RLS                               |
| ---------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `public.workspace_analytics`       | Per-user usage metrics rollup    | `user_id uuid`, `day date`, `tokens int`, `cost_cents int`, `surface text`, `provider text`. Primary key `(user_id, day, surface, provider)`                 | user owns own; admin all          |
| `public.audit_logs`                | Admin event log                  | `id bigserial pk`, `actor_user_id uuid nullable`, `action text`, `resource_type text`, `resource_id text`, `metadata jsonb`, `ip_address inet`, `created_at` | admin SELECT; service-role INSERT |
| `public.github_installations`      | GitHub App install state         | `installation_id bigint pk`, `user_id uuid fk`, `account_login text`, `repos text[]`, `installed_at`, `updated_at`                                           | user owns own                     |
| `public.github_pr_review_attempts` | Cross-surface PR review tracking | `id uuid pk`, `installation_id bigint fk`, `pr_number int`, `repo text`, `status text`, `created_at`                                                         | user owns own via installation    |

### Worker queue (W5 foundation)

| Table                         | Purpose                      | Key columns                                                                                                                                                               | RLS                      |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `public.worker_registrations` | Long-running worker presence | `worker_id uuid pk`, `user_id uuid fk`, `surface text`, `capabilities text[]`, `registered_at`, `last_heartbeat_at timestamptz`                                           | user owns own            |
| `public.work_units`           | Outbound work-unit ledger    | `id uuid pk`, `worker_id uuid fk`, `unit_type text`, `payload jsonb`, `status text`, `created_at`, `claimed_at timestamptz nullable`, `completed_at timestamptz nullable` | user owns own via worker |

### Legacy / archived

`vibe_sessions`, `vibe_messages`, `messaging_*`, `user_memories` — pre-2026-05 schema. Migrations live in `supabase/migrations/2026030500*.sql` etc. Retain in production; deprecate new writes.

---

## §A.2 — SQLite Local-mode schema (Desktop only)

Storage: `apps/desktop/src-tauri/data/db/`. SQLCipher-bundled with `bundled-sqlcipher-vendored-openssl`. PRAGMA tuning: `journal_mode=WAL`, `busy_timeout=5000`, `synchronous=NORMAL`, `foreign_keys=ON`, `cache_size=-64000`, `temp_store=MEMORY`.

Table parity is intentional with the Supabase Cloud schema for migration symmetry. Tables that don't apply in Local mode (`subscriptions`, `processed_stripe_events`, etc.) are absent.

```sql
-- conversations: same shape as Supabase; user_id replaced by 'local' literal
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,                  -- uuid v7
  title TEXT NOT NULL DEFAULT 'New chat',
  provider TEXT,
  model TEXT,
  created_at INTEGER NOT NULL,          -- unix ms
  updated_at INTEGER NOT NULL,
  archived_at INTEGER,
  project_id TEXT REFERENCES projects(id)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content TEXT NOT NULL,                -- JSON serialized
  provider TEXT,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_cents INTEGER,
  created_at INTEGER NOT NULL,
  parent_message_id TEXT REFERENCES messages(id)
);

CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);

CREATE TABLE message_branches (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  head_message_id TEXT NOT NULL REFERENCES messages(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT,
  model_preference TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL                   -- JSON serialized
);

CREATE TABLE embeddings (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,            -- 'conversation' | 'project' | 'file'
  source_id TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  vector BLOB NOT NULL,                 -- f32 buffer
  dim INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_embeddings_source ON embeddings(source_type, source_id);

CREATE TABLE automation_history (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  action_type TEXT NOT NULL,
  args TEXT NOT NULL,                   -- JSON
  result TEXT,                          -- JSON
  approved_by TEXT,                     -- 'user' | 'auto'
  created_at INTEGER NOT NULL
);

CREATE TABLE overlay_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,                -- JSON
  created_at INTEGER NOT NULL
);

CREATE TABLE local_voice_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,                 -- 'push_to_talk' | 'mic'
  transcript_excerpt TEXT,              -- truncated, do not persist full audio
  language TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);
```

Migrations: `apps/desktop/src-tauri/data/db/migrations/*.sql` numbered `001_*` through `0NN_*`. Run on startup via `migrations::run_migrations()`. No rollback path — Local mode is single-user / single-device.

---

## §A.3 — Locked color and design tokens

Source: `packages/design-tokens/`. Values are read by Desktop / Web / Mobile / Chrome ext / VS Code ext at build time.

```ts
// packages/design-tokens/src/colors.ts
export const COLORS = {
  primary: '#21808d', // teal — LOCKED
  secondary: '#da7756', // terracotta — LOCKED
  light: {
    canvas: '#faf9f7', // warm off-white
    text: '#1a1915',
    border: '#e8e3dc',
  },
  dark: {
    canvas: '#1a1915',
    text: '#faf9f7',
    border: '#3a342f',
  },
  state: {
    danger: '#c92a2a',
    success: '#2f9e44',
    warning: '#f08c00',
    info: '#1971c2',
  },
} as const;
```

Radii: `sm(6px)`, `md(12px)`, `lg(16px)`, `xl(20px)`, `2xl(24px)`.

Type:

- Sans: Inter (UI body, 14 px default)
- Serif: IBM Plex Serif (long-form rendering)
- Mono: JetBrains Mono (code, tool results, status bars)
- Hero: Inter @ 28 px

---

## §A.4 — `SLOT_REGISTRY` extraction

The slot registry is `packages/types/src/model-catalog.ts`. 29 named slots. Each slot has a default provider + model + cost. Tier policies select which slots a tier may use.

```ts
// Full SLOT_REGISTRY (29 entries) — see packages/types/src/model-catalog.ts
// Cost format: input $/MTok / output $/MTok

general_fast            → gemini-3.1-flash-lite       (google)     0.25 / 1.50
general_balanced        → gpt-5.4-mini                (openai)     0.40 / 1.60
general_premium         → gemini-3.1-pro-preview      (google)     2.00 / 12.00
coding_fast             → deepseek-chat               (deepseek)   0.27 / 0.42
coding_premium          → gpt-5.4                     (openai)     2.50 / 15.00
reasoning_premium       → deepseek-v4-flash           (deepseek)   0.14 / 0.28
creative_writing        → claude-sonnet-4.6           (anthropic)  3.00 / 15.00
creative_writing_premium → claude-opus-4.7            (anthropic)  5.00 / 25.00
search_fast             → sonar                       (perplexity) 1.00 / 1.00 + fee
search_premium          → sonar-deep-research         (perplexity) 2.00 / 8.00 + citation/reasoning/search fees
vision_fast             → gemini-3.1-flash-lite       (google)     0.25 / 1.50
vision_premium          → gemini-3.1-pro-preview      (google)     2.00 / 12.00
browser_dom             → claude-sonnet-4.6           (anthropic)  3.00 / 15.00
computer_use            → claude-sonnet-4.6           (anthropic)  3.00 / 15.00
computer_use_premium    → claude-opus-4.7             (anthropic)  5.00 / 25.00
image_generation        → imagen-4-fast               (google)     $0.02/img
video_generation_pro_plus → veo-3.1-lite              (google)     $0.05/sec
video_generation_max    → veo-3.1-fast                (google)     $0.15/sec
voice_transcription     → whisper-1                   (openai)     —
voice_rewrite           → gemini-3.1-flash-lite       (google)     0.25 / 1.50
workhorse_general       → gemini-3.1-flash-lite       (google)     0.25 / 1.50  (Pool B)
escalation_coding       → glm-4.7                     (zhipu)      0.30 / 1.20  (Pool B)
general_balanced_pro    → gpt-5.4-mini                (openai)     0.40 / 1.60
coding_premium_pro      → claude-sonnet-4.6           (anthropic)  3.00 / 15.00
reasoning_premium_pro   → kimi-k2.6                   (moonshot)   0.60 / 2.50  (V2 PRD said 0.95/4.00; stale)
multimodal_pro          → gemini-3.1-pro-preview      (google)     2.00 / 12.00
long_context_pro        → gemini-3.1-pro-preview      (google)     2.00 / 12.00
flagship_coding_pro_plus → claude-opus-4.7            (anthropic)  5.00 / 25.00
flagship_general_pro_plus → gpt-5.5                   (openai)     5.00 / 30.00
```

**W6 additions for Pro Max:**

- `flagship_coding_pro_max` → claude-opus-4.7 with higher daily cap
- `flagship_general_pro_max` → gpt-5.5 with higher daily cap
- `multimodal_pro_max` → gemini-3.1-pro-preview (large context)

---

## §A.5 — `TIER_POLICIES` extraction

```ts
// Free
{
  tier: 'free',
  allowedSlots: ['workhorse_general'],
  manualSelection: false,
  monthlyTokenCap: 100_000,
  voiceMinutesPerMonth: 0,
  videoSecondsPerMonth: 0,
  dailyMessageCap: 5,
  managedCloudOnly: true,
  capabilities: { web_search: false, mcp: false, computer_use: false }
}

// Hobby ($10)
{
  tier: 'hobby',
  allowedSlots: ['workhorse_general','escalation_coding','reasoning_premium',
                 'image_generation','voice_transcription','voice_rewrite'],
  manualSelection: false,
  monthlyTokenCap: 2_000_000,
  voiceMinutesPerMonth: 60,
  videoSecondsPerMonth: 0,
  imageCountPerMonth: 10,
  dailyMessageCap: null,
  capabilities: { web_search: true, mcp: true, computer_use: false },
  capBehavior: { warn: 0.80, downgrade: 1.00, hardCap: 1.50 }
}

// Pro ($29.99)
{
  tier: 'pro',
  allowedSlots: [/* Pool B */
                 'workhorse_general','escalation_coding','reasoning_premium',
                 /* *_pro slots */
                 'general_balanced_pro','coding_premium_pro','reasoning_premium_pro',
                 'multimodal_pro','long_context_pro',
                 /* browser/search */
                 'browser_dom','search_fast','search_premium',
                 /* media */
                 'image_generation','voice_transcription','voice_rewrite'],
  manualSelection: true,
  monthlyTokenCap: 10_000_000,
  voiceMinutesPerMonth: 300,
  videoSecondsPerMonth: 0,
  imageCountPerMonth: 100,
  capabilities: { web_search: true, mcp: true, computer_use: true /* light */ }
}

// Pro+ ($49.99) — V3 LOCK: Veo 3.1 Lite 60 sec/mo
{
  tier: 'pro_plus',
  allowedSlots: [...pro.allowedSlots,
                 'flagship_coding_pro_plus','flagship_general_pro_plus',
                 'video_generation_pro_plus' /* veo-3.1-lite */],
  manualSelection: true,
  monthlyTokenCap: 10_000_000,
  voiceMinutesPerMonth: 1500,
  videoSecondsPerMonth: 60,
  imageCountPerMonth: null,  // unlimited
  capabilities: { web_search: true, mcp: true, computer_use: true /* advanced */ },
  flagshipDailyCaps: {
    'flagship_coding_pro_plus': 15_000,
    'flagship_general_pro_plus': 15_000,
  },
  multiModelSideBySide: { columns: 2 }
}

// Pro Max ($99) — W6 BUILD TARGET — V3 NEW
{
  tier: 'pro_max',
  allowedSlots: [...pro_plus.allowedSlots,
                 'flagship_coding_pro_max','flagship_general_pro_max',
                 'multimodal_pro_max'],
  manualSelection: true,
  monthlyTokenCap: 25_000_000,
  voiceMinutesPerMonth: 3000,
  videoSecondsPerMonth: 120,            // 60 sec Veo Fast + 60 sec Veo Lite
  imageCountPerMonth: null,
  capabilities: { web_search: true, mcp: true, computer_use: true, priority_routing: true },
  flagshipDailyCaps: {
    'flagship_coding_pro_max': 50_000,
    'flagship_general_pro_max': 50_000,
  },
  multiModelSideBySide: { columns: 4 }
}

// Max ($299.99) — V3 LOCK: Veo Fast 60s + Veo Lite 5 min
{
  tier: 'max',
  allowedSlots: [/* everything: pro_max + computer_use_premium + creative_writing_premium */],
  manualSelection: true,
  monthlyTokenCap: 50_000_000,
  voiceMinutesPerMonth: null,           // unlimited
  videoSecondsPerMonth: 360,            // 60s Fast + 300s Lite
  computerUseActionsPerMonth: { soft: 1000, hard: 2500 },
  capabilities: { web_search: true, mcp: true, computer_use: true, deep_research: true }
}

// Enterprise — null caps everywhere
```

`STANDARD_CAP_BEHAVIOR = { warn: 0.80, downgrade: 1.00, hardCap: 1.50 }` is a shared frozen object referenced by Hobby + Pro+ + Pro Max.

---

## §A.6 — `waitlist_signups` Supabase migration (W6 NEW)

```sql
-- supabase/migrations/2026060XXXXX_waitlist_signups.sql
CREATE TABLE public.waitlist_signups (
  id bigserial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  intended_tier billing_plan_tier NOT NULL,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz,
  converted_to_user_id uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_waitlist_signups_email ON public.waitlist_signups(email);
CREATE INDEX idx_waitlist_signups_tier ON public.waitlist_signups(intended_tier);

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY waitlist_public_insert
  ON public.waitlist_signups
  FOR INSERT
  WITH CHECK (true);   -- rate-limited at route layer

CREATE POLICY waitlist_admin_select
  ON public.waitlist_signups
  FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE role = 'admin'));
```

---

## §A.7 — Dispatch HMAC v2 envelope (canonical wire format)

Every outbound control message between mobile and desktop is wrapped:

```json
{
  "hmac": "<64-char hex HMAC-SHA-256>",
  "nonce": "<16-byte base64>",
  "payload": {
    /* original message body */
  },
  "ts": 1715898000000,
  "type": "approval_response"
}
```

**Signing input:** UTF-8 JSON of `{ nonce, payload, ts, type }` (keys alphabetical).

**Key derivation (HKDF-SHA-256, RFC 5869):**

- IKM = `pairingCode` (8-char alphanumeric)
- salt = `sessionSalt` (16 random bytes, non-secret, exchanged via `peer_ready` metadata at pairing time)
- info = `"dispatch-hmac-v2"`
- output = 32-byte derived key (kept hex-encoded in `dispatch_keys.derived_key_hash` after one-way hash)

**Replay protection:**

- Timestamp window: ±30 s of receiver wall clock.
- Nonce cache: 60 s sliding window, max 1,000 entries, constant-time compare.
- Sequence numbers (W7): monotonic per-pairing counter to detect out-of-order or replayed bursts.

**Transition path:** until 2026-06-05, mobile accepts unsigned messages with a warning log. After that date, unsigned messages are rejected. Desktop outbound signer must ship before deadline.

---

## §A.8 — Indices and performance

Every `*_id uuid` foreign key has an index. Beyond defaults:

| Table                        | Index                                  | Rationale                 |
| ---------------------------- | -------------------------------------- | ------------------------- |
| `public.messages`            | `(conversation_id, created_at)`        | Conversation render       |
| `public.conversations`       | `(user_id, updated_at DESC)`           | Sidebar list              |
| `public.dispatch_messages`   | `(pairing_id, ts)`                     | Realtime fan-out ordering |
| `public.token_credits`       | `(user_id, period_start DESC)`         | Current-period lookup     |
| `public.workspace_analytics` | `(user_id, day DESC)`                  | Dashboards                |
| `public.waitlist_signups`    | `(intended_tier)`                      | Marketing segmentation    |
| `public.audit_logs`          | `(created_at DESC)`, `(actor_user_id)` | Forensic query            |

---

## §A.9 — Legacy `apps/web/supabase/migrations/` deletion runbook

**Premise:** `apps/web/supabase/migrations/` (50 files) and `supabase/migrations/` (43 files) are two SoTs. Zero filename overlap. Stripe RPC was successfully copy-migrated from legacy to canonical. The other 30 legacy-only migrations may or may not be in production.

**Procedure (executed by ops, not autonomously):**

1. **Snapshot.** Dump current production Supabase schema: `supabase db dump --schema public --schema auth > /tmp/prod-schema-2026-XX-XX.sql`.
2. **Diff against canonical.** Run all 43 canonical migrations against a fresh database (Supabase branch), then `pg_dump` and compare against the production snapshot. Identify any objects in production NOT covered by canonical.
3. **Cross-reference with legacy.** For each missing object, check whether a legacy migration creates it. Categorize:
   - **In canonical AND in production:** no action.
   - **In legacy AND in production, not in canonical:** port to canonical with new timestamp, mark file as `<timestamp>_ported_from_legacy_<orig_name>.sql`.
   - **In legacy, NOT in production:** the migration never ran; safe to discard.
   - **NOT in legacy, in production:** out-of-band schema change. Investigate and document.
4. **Apply ported canonical migrations** to a Supabase branch, verify clean.
5. **`supabase db push` to production** (canonical now matches prod).
6. **Delete `apps/web/supabase/migrations/`** via `git rm -rf apps/web/supabase/migrations/`.
7. **Update `apps/web/supabase/README.md`** to remove the dual-dir reference; point at `supabase/` only.

**Rollback:** if step 5 fails on production, `supabase db revert` to the snapshot, restore `apps/web/supabase/migrations/` from git history.

**Owner:** web-engineer. **Deadline:** 2026-07-15 (W6 critical-path item 21).

---

## §A.10 — RLS policy contract

Every table containing user-scoped data must:

1. Enable RLS: `ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY`.
2. Define a `<table>_owner_select` policy: `FOR SELECT USING (user_id = auth.uid())` (or via joined-owner check).
3. Define a `<table>_owner_modify` policy: `FOR INSERT/UPDATE/DELETE WITH CHECK (user_id = auth.uid())`.
4. (If admin reads) Define a separate `<table>_admin_select` policy: `USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE role = 'admin'))`.
5. (If service-role-only) Document why and add `<table>_service_role_only` policy that effectively bans authenticated reads.

**Migration linter (W6 deliverable):** a CI check on `supabase/migrations/*.sql` that fails if a `CREATE TABLE public.<name>` lacks a subsequent `ENABLE ROW LEVEL SECURITY` within the same migration file.

**Functions:** any `SECURITY DEFINER` function must have `search_path` set to a fixed list (`pg_catalog, public`). Verified by `supabase/migrations/20260506060000_lockdown_definer_functions.sql`. Any new DEFINER function lacking this is a P0.

---

_End of Appendix A. See [Appendix B](PRD-APPENDIX-B-API-CONTRACTS.md) for the API contracts that read / write these tables._
