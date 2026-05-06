# Performance + Scalability Review

Static-only review of AGI Workforce monorepo (apps/web Next.js 14, apps/desktop Tauri v2,
apps/cli Rust+Ratatui, apps/mobile Expo, services/api-gateway Express, services/signaling-server,
supabase migrations). No profilers run. Findings ranked by impact at 1k → 10k user scale.

## Summary

- **2 CRITICAL** — Multi-instance WebSocket fan-out; web service-Supabase fanout per request
- **8 HIGH** — Missing composite DB indexes; per-token re-render cost in chat store; Stripe
  serial subscription poll; serial inter-table delete loop; CLI streaming render starvation;
  desktop chat list non-virtualized; reconciliation deduct only on diff (post-stream); SSE
  buffer accumulation in TransformStream
- **11 MEDIUM** — Per-call Supabase client creation in services; single mutex around in-memory
  rate-limit + cleanup window; subscriptions realtime on hot tables; chat store full-array map
  every token; in-memory pending-commands queue lost on restart; single-instance signaling
  `activeSessions` map; in-memory rate-limit fallback in production; verbose security log
  collection; full SELECT \* on monitoring service; range/offset pagination on
  user-scoped tables; large-message overhead in 1414-LOC LLM route handler
- **7 LOW** — Sync `std::fs` calls in non-hot paths; in-loop regex recompile in classifier;
  framer-motion on every message; Monaco statically imported on Vibe page; redundant
  `await Promise.race` for DB timeout; unbounded `chat_messages.push` in TUI; no `mmap_size`
  PRAGMA on SQLite

---

## Findings

### [PERF-01] WebSocket clients map is in-memory + per-instance — CRITICAL

**Location**:

- `services/api-gateway/src/websocket.ts:28` — `const clients = new Map<string, Set<AuthenticatedWebSocket>>();`
- `services/api-gateway/src/websocket.ts:34` — `const pendingCommands = new Map<string, ...>;`
- `services/signaling-server/src/index.ts:307` — `const activeSessions = new Map<string, Session>();`
- `services/signaling-server/src/index.ts:315` — `const pendingApprovals = new Map<string, PendingApproval[]>();`

**Symptom**: When deployed to multiple instances on Fly.io/Vercel, a user's desktop and mobile
clients can land on different instances. Broadcasts (`broadcastToUser` at
`websocket.ts:511`, `notifyPeer` at `signaling-server/src/index.ts:1399`) iterate only
the local instance's `clients`/`activeSessions` map, so the peer never sees the message.
`sendCommandToDesktop` at `websocket.ts:45-101` queues a command to in-memory
`pendingCommands` if the desktop is not on the local instance, even if it is connected on
another instance.

**Root cause**: No Redis pub/sub or sticky-session backbone. The in-memory data structures
assume single instance. There is no instance discovery for the websocket fan-out and no
external coordination for dispatch sessions.

**Impact at scale**: Today (single instance) it works. With horizontal scaling beyond 1
instance, an unbounded fraction of cross-device messages drop silently. With sticky
sessions, only commands routed to the same instance as the connected device deliver — the
first cross-instance reconnect after a deploy or autoscale event breaks delivery.
`pendingCommands` is also wiped on every redeploy, dropping queued offline commands.

**Fix**:

1. Replace in-memory `clients`/`activeSessions` with Redis (Upstash) pub/sub: each instance
   subscribes to `user:{userId}` and `pairing:{code}` channels, broadcast = publish.
2. Move `pendingCommands` and `pendingApprovals` queues to Redis with `TTL` = existing
   constants (5 min, 24h).
3. Or: enforce sticky sessions in fly.toml (`session_affinity = true`) and document the
   single-AZ/single-instance requirement for now.

**Effort**: M (sticky sessions) → L (Redis pub/sub).

---

### [PERF-02] Per-request Supabase client creation across 64 web routes — CRITICAL

**Location**:

- `apps/web/lib/services/credit-service.ts:10`, `subscription-service.ts:24`,
  `audit-service.ts:12`, `security-monitoring-service.ts:12`, `notification-service.ts:12`,
  `organization-service.ts:12`, `api-key-service.ts:43` — `function getSupabaseClient()` is
  called fresh on every method call.
- 64 route handlers under `apps/web/app/api/**` use `createClient(supabaseUrl, supabaseServiceKey, ...)`
  inline (verified: `chat/conversations/route.ts:27`, `memory/route.ts:26`, etc.).

**Symptom**: Each method that touches Supabase reconstructs a client (per call), and many
routes do this multiple times per request (e.g.,
`apps/web/app/api/llm/v1/chat/completions/route.ts:234` plus the services it then calls
each instantiate their own). One LLM completion request constructs 5-8 Supabase clients.

**Root cause**: No singleton. `createClient` is cheap but not free — each instance
allocates a new HTTP client (fetch dispatcher), GoTrue auth instance, Realtime channel
manager. In Vercel serverless cold start, this multiplies cold-start cost; in warm
invocations, repeated allocation pressures GC.

**Impact at scale**: Each `/api/llm/v1/chat/completions` call constructs ~6 service-role
clients. At 100 req/s sustained that is 600 client constructions per second, all using
the same URL+key. Under sustained load, observable in tail-latency (P99) spikes during
GC. Not catastrophic but compounds with cold-start latency on Vercel.

**Fix**: Module-level singleton matching `app/api/stripe-webhook/route.ts:55-60` pattern:

```ts
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
```

Export from a shared `lib/supabase-admin.ts`. Then services import the singleton instead
of constructing per-call. Note: keep per-request user-scoped clients separate.

**Effort**: S — drop-in replacement for the `getSupabaseClient()` helpers.

---

### [PERF-03] Missing composite indexes on hot conversation/messages queries — HIGH

**Location**:

- `supabase/migrations/20260308120002_create_messages.sql:28-31` — `messages` has
  `(conversation_id)`, `(user_id)`, `(created_at)`, `(role)` as separate indexes.
- `supabase/migrations/20260308120001_create_conversations.sql:28-30` — `conversations`
  has `(user_id)`, `(updated_at DESC)`, `(last_message_at DESC NULLS LAST)` as separate
  indexes.
- Hot queries seen at `apps/web/app/api/chat/conversations/route.ts:29-35` (filter
  `user_id` + order by `updated_at DESC` + limit 50) and
  `apps/web/app/api/chat/conversations/[id]/messages/route.ts:130-135` (filter
  `conversation_id` + order `created_at ASC` + limit 20). Same pattern on api-gateway
  cloudChat at `services/api-gateway/src/routes/cloudChat.ts:340-343`.

**Symptom**: PG must do `Index Scan on idx_conversations_user_id` then `Sort` (since
`updated_at` isn't in the chosen index). For a user with 10k conversations, the sort
materializes the whole user's conversation list before applying `LIMIT 50`.

**Root cause**: Single-column indexes don't satisfy `WHERE` + `ORDER BY` together. Postgres
will pick one and re-sort. Composite `(user_id, updated_at DESC)` would let the planner
do an `Index Scan` that already returns sorted output, then stop after 50 rows.

**Impact at scale**:

- 1k conversations/user: ~5ms today, fine.
- 10k conversations/user: ~50-100ms with sort.
- 100k conversations/user (power user, agent autoscheduling): ~500ms+ with sort.
- For `messages`, the issue is worse: `messages.conversation_id + created_at` paged loads
  return in O(log N + page) only if the composite exists. Today's index forces reading
  matching rows + sort.

**Fix**: Add composite indexes. Migration:

```sql
CREATE INDEX IF NOT EXISTS idx_conversations_user_id_updated_at
  ON public.conversations(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at
  ON public.messages(conversation_id, created_at);
```

The existing `idx_dispatch_messages_thread_id_created_at` at
`20260324000001_create_dispatch_tables.sql:165-166` already follows this pattern — apply
the same to conversation tables.

**Effort**: S (one migration).

---

### [PERF-04] `appendToMessage` runs `messages.map()` on every streamed token — HIGH

**Location**:

- `apps/web/stores/chatStore.ts:269-278` — Zustand action that updates one message by id
  via `state.messages.map((m) => (m.id === id ? {...m, content: m.content + content} : m))`.
- Called from `apps/web/lib/hooks/useChatStream.ts:295` on every token.
- Same pattern at `appendToThinking` (`chatStore.ts:280-297`), `updateMessage`
  (`chatStore.ts:260-267`).

**Symptom**: For each streamed token (typical 200–1500 per response), the entire `messages`
array is reallocated and every message object that matches is `{...m, content: m.content + chunk}`
spread. Shallow copies of every other message object are also built (Object.assign in
`Array.map`). React re-renders the whole list because reference identity changes for
adjacent items.

**Root cause**: `Array.prototype.map` instead of indexed update. Stores messages flat
instead of by id keyed map.

**Impact at scale**:

- Conversation with 100 messages, response streams 1000 tokens: 100 × 1000 = 100k
  message-object allocations per response.
- 1000 messages: 1M iterations + allocations. The TransformStream coalesces in chunks
  in apps/web LLM route, but the client decoder splits SSE by line, calling
  `appendToMessage` on each delta (typically once per token).
- `MessageList` (packages/chat) does `messages.map(...)` itself with no `React.memo` on
  `MessageBubble`, so every message re-renders for every token.

**Fix** (concrete):

1. Store as a `byId: Record<string, Message>` map plus an `order: string[]` array. Update
   becomes `state.byId[id].content += content` (Immer-friendly, single-message change).
2. Wrap `MessageBubble` with `React.memo` keyed on `message.id` and `message.content`
   length, so untouched messages don't re-render.
3. Coalesce token appends with `requestAnimationFrame` or 16-32ms debounce in the stream
   reader at `useChatStream.ts:295` — most users don't see >60 tokens/s anyway.

**Effort**: M (touch chat store + MessageBubble + stream reader).

---

### [PERF-05] CLI TUI streaming output never re-renders during await — HIGH

**Location**:

- `apps/cli/src/tui/tui_app.rs:1893-1916` — `send_message()` awaits the full
  `session.send(...)` future before returning to the event loop. The streaming callback
  writes to `Arc<Mutex<String>>` but `app.stream_buffer` is only assigned after `await`
  completes (`tui_app.rs:1914-1916`).
- `tui_app.rs:1746-1872` — `run_event_loop` only renders inside the loop. While
  `send_message().await` is in flight, the loop is parked and no `render()` runs.

**Symptom**: User types a question, hits enter, sees a frozen TUI for 5-30s, then the
entire response paints at once. The `is_loading` spinner doesn't tick either because
`spinner_tick` advances inside the same loop body.

**Root cause**: Architecture keeps the streaming task on the same async stack as the event
loop. There is no `select!` between event input and stream chunks. The `Arc<Mutex<String>>`
is filled in real time but no producer/consumer signal exists.

**Impact at scale**: Affects every user of the TUI on every send. Subjective:
"the CLI feels broken/dead". Objectively, time to first byte (TTFT) UX is ~5s vs
provider's actual ~500ms TTFT.

**Fix**: Either

1. Spawn `session.send` on `tokio::spawn` and use `tokio::select!` in the event loop to
   poll an `mpsc::UnboundedReceiver<String>` of chunks alongside crossterm events. Render
   on every chunk OR on a `tokio::time::interval(50ms)` tick.
2. Or: pass `event::poll`-like polling inside the streaming future and call
   `terminal.draw(...)` from the callback. Crossterm + ratatui supports re-entrancy on
   stdout.

**Effort**: M.

---

### [PERF-06] Stripe `subscriptions.list` polled per status (serial) on legacy lookup — HIGH

**Location**:

- `apps/web/lib/services/subscription-service.ts:373-385` — loops `for (const status of validStatuses)`
  and calls `stripe.subscriptions.list(...)` once per status until one returns rows.
- Same file `:388-398` then calls `stripe.subscriptions.list({customer, limit: 5})` again
  if the prior loop didn't find rows.

**Symptom**: Worst case, 3 sequential Stripe API calls (each ~150–400 ms) just to identify
the right subscription before any work begins.

**Root cause**: Serial fallback chain. Stripe `list` accepts `status` but returns a single
status filter; can't combine. However `status: 'all'` exists and would return everything in
one call — caller can filter client-side.

**Impact at scale**: User waits ~600 ms longer at portal/checkout on legacy customers (those
with email-only linkage). Not a 10k-user scaling cliff but a per-request constant added
latency.

**Fix**: Replace the loop with one call: `stripe.subscriptions.list({ customer, limit: 5,
status: 'all', expand: ['data.items.data.price'] })`, then filter
`status in ['active','trialing']` client-side.

**Effort**: S.

---

### [PERF-07] Sequential delete across 10+ tables on user-data cleanup — HIGH

**Location**: `apps/web/app/api/user/data/route.ts:182-198`.

**Symptom**: `for (const { table, column } of tablesToDelete) { await adminSupabase.from(table).delete().eq(...) }`
serializes 10 deletes (`token_credits`, `beta_redemptions`, `email_preferences`,
`device_authorizations`, `desktop_devices`, `mobile_devices`, `sync_data`,
`organization_members`, `subscriptions`, `profiles`). At 30 ms/delete that is ~300 ms.

**Root cause**: No `Promise.all` parallelization for independent deletes.

**Impact at scale**: Account-deletion is rare (1/user/lifetime), but the same pattern shows
up in `apps/web/app/api/cron/reset-credits/route.ts:87-128` (loops over **all active
subscriptions** awaiting `SubscriptionService.resetCreditsForNewPeriod` per row). At
10k subscribers, that loop runs 10k serial DB hits = ~5 minutes single-threaded inside
a Vercel cron handler that has a 60s execution window. **This will time out at scale.**

**Fix**:

1. user/data: `await Promise.all(tablesToDelete.map(({table, column}) => adminSupabase.from(table).delete().eq(column, user.id)))`.
2. cron/reset-credits: batch in groups of 50–100 with `Promise.all`, or move to a
   worker queue (Inngest, Trigger.dev) keyed by `user_id`. Pre-filter subscriptions
   in SQL by `current_period_start within last 1 hour` instead of selecting ALL
   active subs and checking in JS (line :92-96). Add migration:
   `CREATE INDEX IF NOT EXISTS idx_subscriptions_period_start ON subscriptions(current_period_start) WHERE status IN ('active','trialing');`

**Effort**: S (account-deletion) → M (cron rewrite + index).

---

### [PERF-08] Desktop `MessageList` (packages/chat) is not virtualized — HIGH

**Location**: `packages/chat/src/components/MessageList.tsx:11-36`.

**Symptom**: Renders all messages with `messages.map((msg, idx) => <MessageBubble ... />)`.
No `react-window`/`react-virtuoso`. With 1000+ messages, every state update re-creates
1000 React elements.

**Root cause**: Direct array map. Auto-scroll is implemented via `bottomRef.current?.scrollIntoView`
in a `useEffect` keyed on `messages.length` — fires every token append (since chatStore
mutates the array). Each effect fires `scrollIntoView({ behavior: 'smooth' })` which
invokes layout + paint.

**Impact at scale**:

- 100 messages: fine, ~5–10 ms render.
- 500 messages: render >80 ms, dropped frames during streaming.
- 1000+ messages: input lag becomes user-visible (>200 ms render).

The web side already has `apps/web/features/chat/components/messages/AdvancedMessageList.tsx`
using `react-window`, but it imports `react-window` via a `require` cast (line :17) and
uses fixed `ITEM_SIZE = 120` (line :79) — variable-height messages will misalign causing
incorrect scroll position. Note: this component is the multi-agent chat path, not the
primary `MessageBubble.tsx` mounted into the regular chat.

**Fix**: Adopt `react-window` (already a web dep) or `react-virtuoso` (handles dynamic
heights better) in `packages/chat/src/components/MessageList.tsx`. Wrap MessageBubble in
`React.memo`. Throttle the scroll-to-bottom effect. The desktop+web both use
`packages/chat`, so the fix is reused.

**Effort**: M.

---

### [PERF-09] LLM completions route: token reconciliation only on diff in flush — HIGH

**Location**: `apps/web/app/api/llm/v1/chat/completions/route.ts:1060-1138` (TransformStream
flush handler).

**Symptom**: Within `flush()`, the route attempts a credit reconciliation with
`CreditService.deductCredits` if `costDifference !== 0`. The reservation deducted at
`:586` is a worst-case estimate (over-reserves). On the typical case (`actualCost <
estimatedCost`), this triggers a reconciliation deduct of negative cents — a refund.
Each request makes one reservation deduct + one reconciliation deduct = 2 RPCs minimum,
3 on failure refund. Each is a network hop to Supabase (40–80 ms).

**Root cause**: Reservation-style billing is intentional but the streaming path doesn't
batch reconciliations — each request is its own pair. With 10k req/min sustained, that
is 20k Supabase RPC calls/min just for credit accounting.

**Impact at scale**: Two RPC calls per stream is 80–160 ms of post-stream latency before
the connection closes (kept-open by SSE). Combined with the
`apps/web/lib/services/credit-service.ts:60` getBalance call earlier in the same request
(`route.ts:482, :514`), and `checkAvailable` (`:538`), and the fallback `:568`, a single
LLM stream does 4–6 Supabase RPCs for credits in addition to user/sub lookup.

**Fix**:

1. Cache user balance on the request locally and predict costs to skip the post-stream
   reconciliation when difference is < 5%.
2. Aggregate small reconciliations in a `pino`-style buffer flushed every 100 ms or 50
   events to reduce RPC fan-out.
3. Move credit accounting to a Postgres trigger on a `credit_ledger` insert table — one
   write per request, RPC count drops from 4–6 to 1.

**Effort**: M.

---

### [PERF-10] SSE TransformStream buffers split lines without size cap — HIGH

**Location**: `apps/web/app/api/llm/v1/chat/completions/route.ts:687-1058`.

**Symptom**: `let buffer = '';` accumulates SSE bytes. When a chunk doesn't end with `\n`,
`buffer = lines.pop() || ''` re-buffers the partial. There is no upper bound on
`buffer.length`. A misbehaving upstream (or an attacker-controlled custom base URL via the
egress allowlist) sending an infinitely long `data:` line would grow `buffer` until OOM.

**Root cause**: Backpressure not asserted. The route trusts upstream framing.

**Impact at scale**: Single-request DoS. Vercel function memory cap is 1024 MB by default.
A multi-MB `data:` line stalls the function, holds the connection, and blocks an executor
slot until timeout.

**Fix**: Add a guard:

```ts
if (buffer.length > 1_048_576) {
  // 1MB
  controller.error(new Error('SSE line buffer overflow'));
  return;
}
```

After the `lines.pop()` line.

**Effort**: S.

---

### [PERF-11] In-memory rate-limit store with global mutex on every request — MEDIUM

**Location**: `apps/web/lib/rate-limit.ts:227-299`.

**Symptom**: When Redis is not configured, falls back to `inMemoryStore: Map<string, ...>`.
Cleanup happens lazily inside `inMemoryRateLimit` if `now - lastCleanupTime > 60000` (line
:314). The cleanup iterates the entire map, sorts (line :282-284), and deletes excess
entries — all inside the request handler.

**Root cause**: Cleanup amortized but synchronous. Not a real concern at low traffic; at
high traffic, the cleanup happens once per minute on whichever request happened to cross
the threshold first. That request pays a `O(n log n)` price (n up to 10000) inside the
serverless handler.

**Impact at scale**:

- Single-request P99 spike of 5–20 ms once per minute.
- Bigger problem: in serverless multi-instance, `inMemoryStore` is per-warm-container.
  Rate limits don't apply across containers — a determined attacker can multiply
  throughput by N (number of warm containers).
- The startup warning at `:235` already flags this.

**Fix**: Mandate Redis in production via env validation in
`apps/web/utils/env.ts` (don't allow boot without `UPSTASH_REDIS_REST_URL`). For
fallback, use a sliding-window log-structured store keyed by minute bucket so cleanup is
O(1) per request.

**Effort**: S (env validation) → M (sliding window).

---

### [PERF-12] Realtime publication on every conversation/message INSERT — MEDIUM

**Location**:

- `supabase/migrations/20260308120002_create_messages.sql:54` —
  `ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;`
- `supabase/migrations/20260324000001_create_dispatch_tables.sql:218-220` — same for
  `dispatch_threads`, `dispatch_messages`, `dispatch_agent_state`.
- 11 tables total enabled for realtime (per `grep "ALTER PUBLICATION supabase_realtime"`).

**Symptom**: Every INSERT/UPDATE on these tables fans out to all connected Realtime clients
via WAL streaming. `messages` has `update_conversation_on_message_insert` trigger
(`20260308120002:34-51`) that issues an UPDATE on `conversations` for every message INSERT
— that UPDATE also fans out via realtime.

**Root cause**: All tables broadcast everything. RLS-aware filtering at the Realtime
gateway helps but doesn't eliminate WAL fan-out cost.

**Impact at scale**:

- 1k DAU × 50 messages/day = 50k message inserts/day. Each fires WAL → trigger UPDATE →
  another WAL. Doubled write amplification on the realtime publication.
- `dispatch_messages` is also realtime-published. With high task throughput from agents,
  10k tasks/min would saturate the realtime channel and slow PG WAL replay.

**Fix**:

1. Drop Realtime on `dispatch_agent_state` (clients already use websocket signaling) —
   replace with an explicit notify message over the websocket channel.
2. Move conversation `last_message_at`/`message_count` updates out of the row-trigger and
   into a `LISTEN/NOTIFY` consumer — saves the second WAL entry.
3. Configure Supabase Realtime to use `replica identity full` only on tables that need
   it; `dispatch_messages` typically only needs INSERT events.

**Effort**: M.

---

### [PERF-13] `select('*')` on monitoring service for metrics queries — MEDIUM

**Location**:

- `apps/web/lib/services/notification-service.ts:57` — `.select('*')`
- `apps/web/lib/services/security-monitoring-service.ts:120, :353` — `.select('*')`

**Symptom**: Returns every column even when the consumer only uses 5–7 fields. For
audit-log tables, this transfers `request_payload`, `response_body`, `headers` jsonb
columns even when the metric only needs `(severity, event_type, ip_address, user_id,
created_at)`.

**Root cause**: Convenience over projection.

**Impact at scale**:

- Each row in `security_audit_logs` can be 4–10 KB (jsonb headers). Pulling 1000 rows
  for the 24h dashboard returns 4–10 MB. Multiplied by Vercel function instances
  refreshing the dashboard concurrently, this hits Supabase egress quotas and increases
  cold-start memory.
- `notification-service.ts:57` is called inside `getNotifications` — paginated user
  notifications. Star projection breaks when the table grows new sensitive columns.

**Fix**: Replace with explicit projection — already correctly done at
`security-monitoring-service.ts:158` (`select('event_type, severity, ip_address, user_id, created_at')`).

**Effort**: S.

---

### [PERF-14] Non-streaming `appendToThinking` updates message-by-message — MEDIUM

**Location**: `apps/web/stores/chatStore.ts:280-297`.

**Symptom**: Same `messages.map(...)` pattern as PERF-04, but for the thinking-block
content. Streaming a thinking block (Anthropic's `thinking_delta` event) often emits 200
sub-tokens. With nested `metadata.thinkingContent`, every append spreads
`m.metadata` + the parent message + the entire array.

**Root cause**: Same as PERF-04. Listed separately because thinking-blocks can fire
in addition to text-blocks, doubling the per-token store-write cost.

**Impact at scale**: Compounds with PERF-04. A response with extended thinking creates
2× as many array re-allocations.

**Fix**: Bundled with PERF-04.

**Effort**: S (after PERF-04).

---

### [PERF-15] Cron `reset-credits` selects ALL active subscriptions for date check — MEDIUM

**Location**: `apps/web/app/api/cron/reset-credits/route.ts:66-128`.

**Symptom**: Selects every row where `status IN ('active', 'trialing')`. Then in JS,
filters by `timeSincePeriodStart < 1 hour`. At 10k subscribers all 10k rows transit
Vercel cron → JS heap → filter → loop → 10k RPCs.

**Root cause**: Filter pushed to client side instead of SQL.

**Impact at scale**: Same as PERF-07. Highlighted separately because the SQL push-down is
trivially achievable. Add `gte('current_period_start', oneHourAgo)` and
`lt('current_period_start', now)` to reduce result set to only subscriptions actually due.

**Fix**:

```ts
const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
const { data: subscriptions } = await supabase
  .from('subscriptions')
  .select('id, user_id, plan_tier, stripe_price_id, current_period_start, current_period_end')
  .in('status', ['active', 'trialing'])
  .gte('current_period_start', oneHourAgo)
  .lt('current_period_start', new Date().toISOString())
  .limit(500);
```

Plus `Promise.all` over the result with concurrency limit (e.g., `p-limit(20)`).

**Effort**: S.

---

### [PERF-16] `range(offset, offset + limit - 1)` pagination on user-scoped tables — MEDIUM

**Location**:

- `apps/web/app/api/memory/route.ts:41` — `.range(offset, offset + limit - 1)`
- `apps/web/app/api/projects/route.ts:41` — same
- `services/api-gateway/src/routes/usage.ts:290` — same

**Symptom**: Postgres `OFFSET` does a sequential scan past `offset` rows. At
`offset=10000` (the clamp at `apps/web/app/api/memory/route.ts:33`), Postgres reads and
discards 10000 rows before returning the 50 you want — even with the right index.

**Root cause**: Offset pagination doesn't scale. The codebase already clamps offset at
10k (good safety) but query cost grows with offset.

**Impact at scale**:

- offset=10000 + index hit: ~150 ms.
- offset=100000 (without clamp): ~1500 ms.
- Memory growth in user_memories at 10k rows for active users will hit the offset clamp
  and silently truncate results — users won't see older memories.

**Fix**: Cursor-based pagination using `(updated_at, id) > (cursor_updated_at, cursor_id)`.
Migration: ensure the existing `idx_user_memories_updated_at` (or equivalent) is composite
with `id` for tie-breaker.

**Effort**: M.

---

### [PERF-17] Two-call DB pattern for first-message title generation — MEDIUM

**Location**: `apps/web/app/api/chat/conversations/[id]/messages/route.ts:90-99,
:208-217`.

**Symptom**: After saving the message:

```ts
const { count } = await supabase
  .from('web_messages')
  .select('*', { count: 'exact', head: true })
  .eq('conversation_id', conversationId);
if (count && count <= 2) {
  await supabase.from('web_conversations').update({ title }).eq('id', conversationId);
}
```

That is 1 DB roundtrip for COUNT(\*) plus 1 conditional UPDATE. Every message insert pays
the COUNT cost just to detect "is this the first message".

**Root cause**: Logic that should be on the row itself (e.g., `conversations.title is null`
check) was moved to a count.

**Impact at scale**: Adds ~30 ms per message. With 50 messages/conversation, that is 1.5s
of unnecessary COUNT scans per conversation. COUNT(\*) without LIMIT pre-merges all
matching rows for accuracy, even with an index.

**Fix**: Replace with:

```ts
await supabase
  .from('web_conversations')
  .update({ title })
  .eq('id', conversationId)
  .is('title', null); // RLS-checked, no extra count needed
```

The `is('title', null)` makes the UPDATE a no-op for already-titled conversations.
Single roundtrip.

**Effort**: S.

---

### [PERF-18] Stripe `subscriptions.list` again after credit reservation — MEDIUM

**Location**: `apps/web/app/api/llm/v1/chat/completions/route.ts:482-535`.

**Symptom**: On every LLM completion, the route calls `CreditService.getBalance`. If no
balance, it calls `SubscriptionService.allocateCreditsForPeriod` which (per
`subscription-service.ts`) may issue a Stripe API call. Then re-fetches balance
(`:514`).

**Root cause**: Lazy allocation triggered inside a hot request path. Belongs in the
checkout/subscription-update webhook, not in every completion request.

**Impact at scale**: First-message-of-period users (1 per billing cycle per user) wait
~600 ms longer. Not a recurring issue, but degrades P99 perceived latency.

**Fix**: Allocate credits eagerly in the Stripe webhook on
`customer.subscription.created` / `customer.subscription.updated`. Remove the lazy path
from the LLM route.

**Effort**: S.

---

### [PERF-19] In-memory pending commands lost on restart — MEDIUM

**Location**: `services/api-gateway/src/websocket.ts:34-39, :77-101`.

**Symptom**: When desktop is offline, `sendCommandToDesktop` queues commands in
`pendingCommands` map. On any redeploy or container restart, the queue is wiped. Mobile
user issues a command, desktop is offline, deploy happens 2 minutes later, command is
lost silently.

**Root cause**: By-design ephemeral. Constants `MAX_PENDING_COMMANDS = 100` and
`PENDING_COMMAND_TTL = 5 * 60 * 1000` at `:38-39` show the author was aware of bounds.

**Impact at scale**: User reports of "I sent it but my desktop didn't do anything" even
when reconnect happens within 5 min, if a deploy occurred. Frequency increases with
deploy cadence.

**Fix**: Move to Redis with same 5-min TTL. Same fix as PERF-01.

**Effort**: S after PERF-01.

---

### [PERF-20] WebSocket heartbeat 30s + no idle-detection — MEDIUM

**Location**: `services/api-gateway/src/websocket.ts:328-338`.

**Symptom**: 30s ping interval. With Fly.io's default LB idle timeout of 60s, this is
correct for keepalive. But there's no logic to terminate connections that **received**
no payload for >X minutes — a connected-but-idle desktop holds resources indefinitely.

**Root cause**: Heartbeat only verifies liveness (server→client ping pong), not
client engagement.

**Impact at scale**: Memory grows linearly with sustained connections. At 10k connected
desktops with idle keepalive, ~100 MB of WS state + Set per user. Acceptable but
unbounded.

**Fix**: Add `lastMessageAt` to `AuthenticatedWebSocket`. In the 30s interval, terminate
connections with `lastMessageAt > 30 min`. Clients must reconnect if they want service.

**Effort**: S.

---

### [PERF-21] AdvancedMessageList fixed `ITEM_SIZE = 120` with variable content — MEDIUM

**Location**: `apps/web/features/chat/components/messages/AdvancedMessageList.tsx:79, :282`.

**Symptom**: `react-window` `<List>` is given `itemSize={ITEM_SIZE}` (constant 120). But
`MessageBubbleComponent` renders markdown of arbitrary length. Long messages exceed the
allotted 120 px and visually overflow the row, causing scroll-position miscalculation —
auto-scroll lands at the wrong message.

**Root cause**: Uses `react-window`'s fixed-size `<List>` instead of `<VariableSizeList>`
or `react-virtuoso`. The estimation is fundamentally wrong.

**Impact at scale**: Already broken for messages >120 px tall. With long markdown answers,
the user experience is "scroll jumps to wrong message after each token" — perceived
flicker.

**Fix**: Switch to `react-virtuoso` (auto-measures heights) or use react-window's
`VariableSizeList` with a height-cache and a `ResizeObserver` per row.

**Effort**: M.

---

### [PERF-22] `'use client'` on mostly-static marketing pages — LOW

**Location**: All 16 page.tsx files at root of app dir mark `'use client'`:
`pricing/page.tsx`, `faq/page.tsx`, `contact/page.tsx`, `download/page.tsx`,
`signup/page.tsx`, `login/page.tsx`, `forgot-password/page.tsx`, `get-started/page.tsx`,
`payment-failure/page.tsx`, etc.

**Symptom**: Forces SSR + client hydration of pages that could be static. Pricing/FAQ
content is essentially static — only the auth-aware CTA needs hydration. The full page
ships JS for hydration.

**Root cause**: Likely defaulted to `'use client'` because they have a few interactive
elements (e.g., signup forms). Not split into static frame + interactive island.

**Impact at scale**: Cold start of these pages (Vercel edge → SSR) is slower than necessary.
Bundle ships React + page-tree to the client. ~40-80 KB gzipped extra per page on first
view. Multi-page navigation re-hydrates each.

**Fix**: Refactor each page into:

- Server component frame (default, no `'use client'`).
- Inner `<SignupForm />` or `<PriceCalculator />` marked `'use client'`.

**Effort**: M (16 pages).

---

### [PERF-23] Monaco Editor statically imported on Vibe page — LOW

**Location**: `apps/web/features/vibe/components/redesign/CodeEditorPanel.tsx:52` —
`import Editor from '@monaco-editor/react';`

**Symptom**: Monaco is ~3.5 MB minified + ~1 MB gzipped. Static import means the entire
Monaco worker bundle ships in the initial chunk that includes `CodeEditorPanel`. It's
loaded even when the user never opens the code editor.

**Root cause**: No `next/dynamic` wrap. Mermaid is correctly dynamic-imported
(`MermaidRenderer.tsx:85`), but Monaco is not.

**Impact at scale**: Vibe page initial JS bundle bloats by ~1 MB gzipped. TTI on slow
mobile networks degrades by ~3-5 s.

**Fix**:

```ts
const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });
```

**Effort**: S.

---

### [PERF-24] `recharts` statically imported via shared chart wrapper — LOW

**Location**: `apps/web/shared/ui/chart.tsx:2` — `import * as RechartsPrimitive from 'recharts';`

**Symptom**: Recharts (~120 KB gzipped) is in the shared UI module. Any component that
imports a UI primitive from `@shared/ui` may transitively pull recharts depending on
bundler configuration. With `optimizePackageImports` set in `next.config.ts:34-50`,
recharts is NOT in the list — Next won't apply tree-shaking heuristics.

**Root cause**: Star import + missing optimizePackageImports entry.

**Impact at scale**: Chart-using pages probably already pay the price; non-chart pages
might too if module-graph leaks. Add to `optimizePackageImports`.

**Fix**:

```ts
optimizePackageImports: [..., 'recharts'],
```

**Effort**: S.

---

### [PERF-25] Per-token regex compile in autotag classifier — LOW

**Location**: `apps/web/app/api/autotag/classify/route.ts:159-166`.

**Symptom**:

```ts
for (const rule of KEYWORD_RULES) {
  for (const pattern of rule.patterns) {
    const matches = text.match(new RegExp(pattern, 'gi'));
    ...
  }
}
```

`new RegExp(pattern, 'gi')` is built fresh for every classify call. The `pattern` is
already a `RegExp` literal in the rules; `new RegExp(regex, 'gi')` rebuilds it.

**Root cause**: Conversion from `RegExp` to `RegExp` with new flags. JS pre-compiles the
literals; rebuilding loses that.

**Impact at scale**: Negligible per call (~50 patterns × 8 rules = 400 regex builds per
call). At 100 classify calls/s, 40k regex compiles/s. Adds maybe 5% CPU. Worth fixing
for code clarity.

**Fix**: Pre-flag the patterns once at module load:

```ts
const COMPILED_RULES = KEYWORD_RULES.map((r) => ({
  tag: r.tag,
  patterns: r.patterns.map((p) => new RegExp(p, 'gi')),
}));
```

**Effort**: S.

---

### [PERF-26] `std::fs` in 316 sites including hot paths — LOW

**Location**: `apps/desktop/src-tauri/src/**/*.rs` — 316 occurrences of `std::fs::`. Sample:
`core/agi/memory_manager.rs:1659, :1733, :1896` (memory persistence write/read),
`core/agi/knowledge.rs:39-269` (knowledge backup write), `lib.rs:124, :880, :893`
(per-message log file open).

**Symptom**: Synchronous IO blocks the tokio runtime when called from `async fn`. Tauri
commands run on a dedicated worker pool but operations like memory_manager save/load
happen inside long-running agent tasks.

**Root cause**: Mix of sync and async fs throughout. `tokio::fs` not consistently used.

**Impact at scale**: Single-user impact per fs op is small (1-5 ms). Cumulative effect on
agent workflows that save state frequently can total 100s of ms. More concerning is
mid-stream backup at `knowledge.rs:269` that writes during agent execution.

**Fix**: Migrate hot paths (anything inside an `async fn` or `#[tauri::command] async fn`)
to `tokio::fs`. Lower priority for startup-only paths (e.g., `lib.rs:124`).

**Effort**: M (gradual migration).

---

### [PERF-27] No `mmap_size` PRAGMA on SQLite pool — LOW

**Location**: `apps/desktop/src-tauri/src/data/database/sqlite_pool.rs:498-510`.

**Symptom**: PRAGMAs set: `busy_timeout`, `journal_mode=WAL`, `synchronous=NORMAL`,
`foreign_keys=ON`, `cache_size=-64000` (64MB), `temp_store=MEMORY`. Missing
`PRAGMA mmap_size = <bytes>` — the OS-level memory mapping for the database file.

**Root cause**: Defaults to 0 (no mmap). On Linux/macOS, using mmap can dramatically
reduce read latency by avoiding `pread` syscalls for warm pages.

**Impact at scale**: Read-heavy workloads (chat history scrolls, memory recall) take
2-5× longer than they could on a >100 MB DB.

**Fix**:

```rust
"PRAGMA mmap_size = 268435456;" // 256MB
```

Add to the pragma block at line `:499-507`.

**Effort**: S.

---

### [PERF-28] Each message append calls `scrollIntoView({behavior: 'smooth'})` — LOW

**Location**: `packages/chat/src/components/MessageList.tsx:15-17`.

**Symptom**: Effect fires every time `messages.length` changes (i.e., after every
streamed token if a new message was added at start, or after every send/receive).
`scrollIntoView` with `behavior: 'smooth'` triggers a scroll animation that takes
~200 ms; firing it again before completion cancels the previous animation — visible
jitter.

**Root cause**: No deduplication of effect, no `behavior: 'auto'` for streaming.

**Impact at scale**: Visual jank during streaming, not a server-side cost. Affects every
TUI/chat interaction.

**Fix**: Use `behavior: 'auto'` during streaming, `'smooth'` only on user-driven inserts.
Throttle the effect to once per 100 ms via `requestAnimationFrame`.

**Effort**: S.

---

## Top 5 Action Items

1. **Add composite DB indexes** [PERF-03] — One migration adds
   `(user_id, updated_at DESC)` on conversations and `(conversation_id, created_at)`
   on messages. Cuts list-conversation P95 from ~50 ms to <5 ms at 10k conversations
   per user. Effort: S.

2. **Singleton Supabase admin client** [PERF-02] — Replace `getSupabaseClient()` helpers
   with module-level singleton imported from `lib/supabase-admin.ts`. Eliminates 5–8
   client constructions per LLM completion request. Effort: S.

3. **Replace `messages.map()` with byId map in chat store** [PERF-04 / PERF-14] —
   Restructure store as `byId + order[]`, memoize `MessageBubble`, throttle token append
   in `useChatStream`. Cuts streaming render cost from O(N×T) to O(T) where N = message
   count and T = tokens. Required to scale past 200 messages per conversation. Effort: M.

4. **Move WebSocket fan-out to Redis pub/sub** [PERF-01 / PERF-19 / PERF-20] —
   Replace in-memory `clients`, `pendingCommands`, `activeSessions`, `pendingApprovals`
   with Upstash Redis. Unblocks horizontal scaling beyond 1 instance for both api-gateway
   and signaling-server. Effort: L (one engineer, one week including tests).

5. **Fix CLI streaming render starvation** [PERF-05] — Spawn streaming on
   `tokio::spawn`, use `tokio::select!` between `event::poll` and chunk channel, render
   on each chunk. The CLI's TTFT UX goes from ~5s freeze to native streaming.
   Effort: M.

## Build Performance Notes

- pnpm workspace: 7 packages + 6 apps + 2 services. With `optimizePackageImports`
  configured for 14 packages but missing `recharts` (PERF-24), Next.js build is
  slower than necessary.
- Cargo: workspace at root with `lto = true, codegen-units = 1, opt-level = "z"` —
  good for binary size; release build will be slow (~5+ minutes for clean rebuild).
  No `sccache` configuration found in repo. Recommend adding `sccache` to dev-scripts/
  for incremental rebuild speedup, especially for the 12 active crates + 195 CLI files +
  desktop's 700+ Rust files.
- No `rust-analyzer` cache exclusion in `.gitignore` checked. Skip — out of scope.
- Vercel `vercel.json` builds web only — no `installCommand` cache hint, but pnpm has
  built-in lockfile caching. Acceptable.

## Observability / Logging Cost (sampled)

- `logger.debug({...}, '...')` is invoked on every credit-balance check and every TTFT
  observation in `apps/web/app/api/llm/v1/chat/completions/route.ts:484-548`. With pino
  configured to ship to Vercel Log Drains (assumed), each log line is ~500 bytes JSON.
  At 10k req/min and ~10 log lines per request, that is 50 MB/min log volume = ~3 GB/hour.
  Most providers charge for log ingestion. Recommend switching `debug` lines to
  conditional sampling (e.g., 1% of requests) in production.
- `apps/web/lib/services/security-monitoring-service.ts:120, :353` selects 7 days of
  events with `select('*')` for the dashboard and metrics endpoints — a single dashboard
  refresh is multiple MB. Recommend caching the metrics result for 60s and projecting
  columns (already noted in PERF-13).

## Known Already-Mitigated Items

- WAL mode + busy_timeout + cache_size in SQLite pool: configured at
  `sqlite_pool.rs:498-510`. Good baseline.
- `react-window` for multi-agent message list: present at
  `AdvancedMessageList.tsx:17` (though with PERF-21 caveat).
- `next/dynamic` on the `/chat` route page: configured at `apps/web/app/chat/page.tsx:5`.
  Good split for the chat SPA.
- Mermaid dynamic imported: `MermaidRenderer.tsx:85`.
- Stripe webhook pinned to Node runtime + force-dynamic at
  `stripe-webhook/route.ts:12-13`. Good — wouldn't work on edge.
- Connection pool uses `Condvar` not sleep-polling (DAT-003 fix at
  `sqlite_pool.rs:228-230`).
- Pending-command queue cleanup interval at `websocket.ts:341-351` prevents
  unbounded growth (60s sweep).
- TLS config / panic abort / strip / LTO already optimal in
  workspace `Cargo.toml [profile.release]`.

End of report.
