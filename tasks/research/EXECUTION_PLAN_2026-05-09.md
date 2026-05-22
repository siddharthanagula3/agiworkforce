# AGI Workforce — Execution Plan

> Companion to `MASTER_PLAN_2026-05-09.md`. The master plan covers strategy + 5 locked decisions. This doc is the **task-level execution plan** with edge cases, acceptance criteria, file paths, and dependency chains. No time estimates — execute at AI velocity.

> Use as a checklist. Don't move on to a phase until the previous phase's exit checklist is fully green.

---

## How to use this plan

1. **Phases run sequentially**; tasks within a phase run in parallel where dependencies allow.
2. Each task lists: **What → Files → References → Edge cases → Acceptance criteria → Dependencies.**
3. **Do not skip edge cases.** They are the difference between "code that compiles" and "code that ships."
4. Tag a release at the end of every phase: `v0.7.0-foundation`, `v0.8.0-tools-mcp-skills`, etc.
5. CI must be green before promoting any tag.
6. Exit checklists are non-negotiable. If a checklist item is not green, the phase is not done.

---

## Phase 0 — Preflight (must complete before Phase 1 starts)

### Task 0.1 — Verify environment

**What**: Confirm the dev/prod environment matches CLAUDE.md pinned toolchain and that all required external accounts are provisioned.

**Files**: `.nvmrc`, `apps/desktop/src-tauri/rust-toolchain.toml`, `package.json#engines`.

**References**: `CLAUDE.md` "Toolchain (pinned)" section.

**Edge cases**:

- Node version drift: `node -v` must match `.nvmrc` exactly (Node 22).
- pnpm version: must be `9.15.3` via `corepack enable`.
- Rust toolchain: `rustc --version` must show `1.94.0` per `rust-toolchain.toml`.
- TypeScript drift: if `node_modules/.pnpm/` shows TS 6.x, run `pnpm install --force` (per CLAUDE.md).
- Mid-port crates excluded from `Cargo.toml` (`agiworkforce-tui`, `agiworkforce-tui_app_server`, `agiworkforce-cloud-tasks`) — do not depend on them.

**Acceptance criteria**:

- `pnpm install` completes with no errors.
- `cargo check --workspace` passes.
- `pnpm typecheck:all` passes.
- `pnpm lint` passes with `--max-warnings=0`.
- `cargo clippy --workspace --lib -- -D warnings -D unsafe-code` passes.
- All required external accounts confirmed: Stripe (live + test mode), Supabase (prod + staging), Vercel (prod), Apple Developer (with `D2PR62RLT4` identity), Microsoft Partner Center, Chrome Web Store, VS Code Marketplace.

**Dependencies**: none.

---

### Task 0.2 — Verify branch hygiene

**What**: Ensure no stale in-flight branches conflict with Foundation work.

**Files**: `.git/refs/heads/`, `.worktrees/`.

**Edge cases**:

- Existing `.worktrees/` directory may contain abandoned agent worktrees from prior sessions — clean if confirmed unused.
- Long-lived branches > 30 days: review and rebase or close.
- Any branches with `wave-` or `gap-` prefix from prior research sessions: archive and delete.

**Acceptance criteria**:

- `git status` clean on `main`.
- All stale worktrees removed.
- `main` is at the commit you intend as the Foundation start point.

**Dependencies**: 0.1 complete.

---

### Task 0.3 — Tag the starting point

**What**: Tag `v0.6.0-pre-foundation` immutably so you can roll back if Foundation goes sideways.

**Edge cases**:

- Tag must be GPG-signed if your git config has `commit.gpgsign=true`.
- Push the tag to remote: `git push origin v0.6.0-pre-foundation`.
- Update `CHANGELOG.md` if not already.

**Acceptance criteria**:

- Tag exists locally and on origin.
- Release notes drafted for the tag.

**Dependencies**: 0.2 complete.

---

## Phase 1 — Foundation Sprint

### Task 1.1 — Apply canonical Supabase migrations to production

**What**: Per `MEMORY.md`, the canonical `supabase/migrations/` is code-complete with the Stripe RPC reconciliation, but it has never been `supabase db push`'d to prod.

**Files**: `supabase/migrations/20260505000007_stripe_webhook_idempotency.sql`, `20260505000006_stripe_integration.sql`, `20260506060000_lockdown_definer_functions.sql`.

**References**: `tasks/research/gap-matrix/supabase-data-model.md` "Stripe RPC reconciliation status: CODE-COMPLETE".

**Edge cases**:

- Production may have legacy migrations from `apps/web/supabase/migrations/` already applied — diff prod schema vs canonical before pushing.
- Migration version conflicts: if prod has migrations dated > the canonical RPC migrations, the apply order must be carefully sequenced.
- RLS policies must be regenerated after schema changes; verify with `pg_dump --schema-only` diff.
- Functions tagged `SECURITY DEFINER` must be locked to `service_role` per `20260506060000_lockdown_definer_functions.sql:9-15`.
- Stripe webhook secret: ensure prod env var matches the secret tied to the prod webhook endpoint.

**Acceptance criteria**:

- `supabase db push --linked` completes with no errors.
- Stripe webhook test in test-mode replays an event and `process_stripe_event_idempotent` correctly idempotent-skips on second replay.
- Production smoke test: trigger one real Stripe webhook (test mode), verify it appears in `stripe_events` table with `processing_status = 'succeeded'`.
- Schema-diff between canonical migrations and prod returns empty.

**Dependencies**: 0.3 complete.

---

### Task 1.2 — Build the desktop Dispatch listener (2026-06-05 P0)

**What**: The transitional unsigned-Dispatch path expires 2026-06-05. Without a desktop listener fix, mobile→desktop dispatch breaks for everyone after that date. Build the desktop side: HMAC verification, salt rotation, replay defense.

**Files**: `apps/desktop/src-tauri/src/dispatch/`, `apps/desktop/src/services/dispatch.ts`, `apps/mobile/src/services/dispatch/` (mobile already has the HMAC sender; desktop is the gap).

**References**: `tasks/research/gap-matrix/d8-desktop-stores-hooks-services-api.md` finding #7, `tasks/research/gap-matrix/mobile-full.md` "Dispatch mobile end at ~70%".

**Edge cases**:

- **Clock drift**: HMAC verification must allow ±5 minute timestamp window. Reject older or newer messages.
- **Replay attacks**: maintain a sliding-window cache of recent message IDs (last 1000 or last 24 hours, whichever is shorter). Reject duplicates.
- **Key rotation**: support 2 active keys (current + previous) during rotation windows. New keys come from Supabase RPC `rotate_dispatch_keys`.
- **Salt collisions**: salt is 32-byte random; collision probability is negligible but log-and-reject if it ever happens.
- **In-flight unsigned messages during cutover**: 7-day grace window where both signed AND unsigned messages are accepted; after 2026-06-05 unsigned is hard-rejected.
- **Network failures during dispatch**: mobile must retry with exponential backoff; desktop must dedupe via message ID.
- **Mobile app version mismatch**: if mobile is on old unsigned version, desktop logs warning + rejects. Force-update prompt on mobile.

**Acceptance criteria**:

- Desktop receives HMAC-signed Dispatch messages from mobile and verifies successfully.
- Replay test: same message ID sent twice → second is rejected.
- Clock-drift test: message timestamped +6 minutes from now → rejected.
- Unsigned-message test (after 2026-06-05): rejected.
- End-to-end test: mobile triggers a Cowork task, desktop picks it up, executes, returns result; mobile shows result.
- Mobile + desktop cross-version test: latest both versions work.

**Dependencies**: 1.1 complete (because dispatch state may persist via Supabase RLS-protected tables).

---

### Task 1.3 — Build `createStore` + `onChangeAppState` central state architecture

**What**: Replace 102 zustand stores with one canonical `createStore<T>` (~34 LOC) + a single `onChangeAppState` choke-point that diffs prev/next state and fans out side effects.

**Files**: `packages/runtime/src/state/createStore.ts` (new), `packages/runtime/src/state/onChangeAppState.ts` (new), `packages/runtime/src/state/AppStateStore.ts` (new), then migrate consumers in `apps/desktop/src/stores/*` (102 files).

**References**: `tasks/research/deep/src-08-services-state.md` "Hand-rolled 34-LOC `createStore`", `tasks/research/deep/misc1-skills-tasks-state-memdir.md` finding #10 on `onChangeAppState`.

**Edge cases**:

- **Circular dependencies**: store A's onChange fans out to store B, whose onChange fans out to store A. Detection: sequence number per fan-out call; reject re-entrant calls beyond depth 2.
- **Race in concurrent setState calls**: use `Object.is` short-circuit at top of `setState` to skip no-op renders.
- **React 19 concurrent mode**: subscribers must be registered via `useSyncExternalStore` for correct concurrent-render semantics; do NOT use `useState` for subscription.
- **Fan-out failures**: a side-effect throws — must not break other side-effects. Wrap each in try/catch with structured error logging.
- **Store consolidation**: 102 → ~30. Prefer merging into domain-coherent stores (`auth`, `chat`, `settings`, `subscriptions`, etc.) rather than per-feature granularity.
- **Migration path**: each migration of a zustand store to the canonical store must include test coverage that the consuming components still render correctly.
- **Persistence**: stores that previously persisted via `zustand/persist` need a migration path to the new persistence layer (probably MMKV on mobile, localStorage on web, file on desktop, file in `~/.agiworkforce/` on CLI).

**Acceptance criteria**:

- `packages/runtime/src/state/createStore.ts` ≤50 LOC with `Object.is` short-circuit.
- `onChangeAppState` choke-point at `packages/runtime/src/state/onChangeAppState.ts` fans out to: API client cache invalidation, telemetry, settings persistence, model-switch broadcasts.
- 102 zustand stores reduced to ≤30.
- All existing test suites pass on the new architecture.
- Storybook (if any) renders all consumer components without errors.
- Render-storm test: change one boolean field; verify <5 re-renders per render cycle.

**Dependencies**: none (can start immediately after 0.3).

---

### Task 1.4 — Build `messageQueueManager` priority queue

**What**: Single send pipeline shared by all 6 surfaces. Three priority lanes (`now > next > later`), FIFO within priority, frozen-snapshot stability.

**Files**: `packages/runtime/src/queue/messageQueueManager.ts` (new), `packages/runtime/src/queue/types.ts`, then migrate consumers.

**References**: `tasks/research/deep/u2-utils-direct-h-n.md` "useSyncExternalStore-compatible priority queue", master plan §2.

**Edge cases**:

- **`popAllEditable` reconstruction**: pulls editable queued commands back into the prompt buffer with original PastedContent IDs preserved. Ordering must match insertion order.
- **Queue overflow**: cap each lane at 100 messages. Reject new sends with structured error.
- **Cross-surface state**: do NOT share queue state across surfaces. Each surface has its own queue instance.
- **Persistence**: `now` lane is volatile; `next` and `later` lanes persist to local storage so they survive app restart.
- **Race condition on dequeue**: use atomic compare-and-swap pattern; prevent two consumers dequeuing the same message.
- **Cancellation**: each queued message has an AbortSignal; canceling removes from queue.
- **Backpressure**: if downstream consumer (LLM) is rate-limited, queue absorbs up to lane cap then rejects.

**Acceptance criteria**:

- Unit tests cover all 3 priority lanes + popAllEditable + cancellation + overflow.
- All 6 surfaces use `messageQueueManager` for send pipeline (replace existing per-surface impls).
- Property test: push 1000 random messages with random priorities, dequeue all, verify FIFO-within-priority + total ordering by priority class.

**Dependencies**: 1.3 (uses createStore for queue state).

---

### Task 1.5 — Add `AsyncLocalStorage<AgentContext>` for Tauri commands

**What**: Eliminate state contamination across 1,483 Tauri commands by introducing per-command async context.

**Files**: `packages/runtime/src/context/agentContext.ts` (new), `apps/desktop/src-tauri/src/commands/`.

**References**: `tasks/research/deep/u1-utils-direct-a-g.md` "AsyncLocalStorage<AgentContext>", master plan §2.

**Edge cases**:

- **Tauri IPC boundary**: AsyncLocalStorage does not cross Rust↔TS process boundary. Use it on the TS frontend; Rust side uses `tokio::task_local!` for analogous behavior.
- **Context propagation through Promise chains**: ensure context survives `await` and `.then()` chains. Test specifically.
- **Worker threads**: AsyncLocalStorage does NOT propagate to worker threads automatically. Must be re-established per worker.
- **React server components**: in Next.js (apps/web), context must be re-established per request via middleware.
- **Memory leak**: ensure context is released after async chain completes; reference cycles can leak.

**Acceptance criteria**:

- `getAgentContext()` returns the current context inside any awaited Promise from the originating Tauri command.
- Stress test: 1000 concurrent Tauri commands, each with unique context, verify no contamination.
- Memory test: 10K commands fired and resolved, verify no growing reference set.

**Dependencies**: 1.3 (some context fields will be derived from app state).

---

### Task 1.6 — Create `packages/llm-runtime/`

**What**: Move the retry generator, stream watchdog, latched session-stable header flags, error classifier, gateway fingerprinter, message-history repair toolkit, fallback state machine into one canonical shared package.

**Files**: `packages/llm-runtime/src/{retry,watchdog,headers,errors,gateway,fallback,history,index}.ts` (new package), then migrate consumers in `services/api-gateway/`, `apps/web/app/api/llm/`, `apps/desktop/src-tauri/src/llm/`, all of `packages/providers/`.

**References**: `tasks/research/gap-matrix/pkg-api-providers-normalize.md` "A fourth shared package... doesn't exist".

**Edge cases**:

- **Retry generator with sticky `RetryContext`**: `model`, `maxTokensOverride`, `thinkingConfig`, `fastMode` persist across attempts; `CannotRetryError` vs `FallbackTriggeredError` cleanly separate retry-exhausted from model-switch.
- **90s stream watchdog**: SDK timeouts only cover initial fetch, NOT streaming body. Reset 90s timer on each chunk.
- **Latched session-stable headers**: once set, headers keep being sent to preserve ~50–70K-token prompt cache key.
- **Error classifier 30+ branches**: need full taxonomy (401/429/503/413, plus per-provider quirks like Anthropic's `pause_turn`, OpenAI's `length`, Google's safety reasons).
- **detectGateway** fingerprinting: LiteLLM, Helicone, Portkey, Cloudflare AI Gateway, Kong, Braintrust, Databricks via header prefixes OR baseURL host suffixes.
- **Fallback chain**: `claude-opus-4.6 → claude-sonnet-4.6 → claude-haiku-4.5` etc. Read from `models.json` per locked rule. NEVER hardcode.
- **Provider-cloud constructors**: Bedrock/Vertex/Foundry/direct — five constructors need clean abstraction.
- **`pause_turn` semantics**: continue-on-pause-turn vs treat-as-error must be configurable per use case.

**Acceptance criteria**:

- `packages/llm-runtime/` builds clean, has 80%+ test coverage on retry/watchdog/error classifier.
- All consumers migrated; no consumer re-implements retry or watchdog inline.
- Property test: 100 simulated provider failures, verify retry-then-fallback-then-error path is correct in every case.

**Dependencies**: 1.3, 1.4 (context propagation through retries).

---

### Task 1.7 — Direction inversion in `services/api-gateway/`

**What**: Add outbound-worker protocol alongside the existing inbound bridge. Workers (CLI/desktop/mobile) register; cloud assigns work via JSON-RPC over WebSocket. Keep inbound for backward compat through migration window.

**Files**: `services/api-gateway/src/worker/{registration,assignment,heartbeat,index}.ts` (new), `docs/architecture/worker-protocol.md` (new design doc).

**References**: `tasks/research/gap-matrix/services-gateway-signaling.md` "Direction inversion is structural", `tasks/research/deep/net-bridge-remote-server.md` for Anthropic's bridge model.

**Edge cases**:

- **WorkSecret envelope** with version-pinned base64url-JSON. Workers can verify version compatibility before accepting work.
- **`validateBridgeId` regex** `^[a-zA-Z0-9_-]+$` for path-traversal defense.
- **Worker epoch bumping**: every CCR `/bridge` call bumps `worker_epoch`; a JWT-only refresh 409s within 20s. Both refresh paths fully rebuild the transport.
- **4-tier auth ladder**: OAuth Bearer + environment_secret + session_ingress JWT + X-Trusted-Device-Token. Each tier has its own lifecycle and refresh strategy.
- **Trusted-Device enrollment** must happen at /login (server gates `account_session.created_at < 10 min`), memoized to avoid macOS `security` subprocess on every poll.
- **Backward-compat window**: keep inbound bridge live for 30 days post-deploy. Old clients work; new clients prefer outbound; migrate per-client.
- **Heartbeat protocol**: workers heartbeat every 30s; missed heartbeats > 90s mark worker offline; reassign in-flight work to other workers (idempotency required).
- **Step-up auth**: 403 + `insufficient_scope` watcher in fetch wrapper marks pending and forces SDK to PKCE redirect path (refresh can't elevate scope per RFC 6749 §6).

**Acceptance criteria**:

- Worker registration end-to-end test: CLI registers, cloud assigns work, worker completes, cloud receives result.
- Backward-compat test: old inbound-only client still works.
- Failover test: kill a worker mid-task, work reassigns to another worker, completes correctly.
- Auth test: each of the 4 auth tiers verified independently.
- Trusted-Device enrollment test: device enrolls within 10-min window post-login, subsequent polls use cached token.

**Dependencies**: 1.6 (uses llm-runtime for retry on assignment failures).

---

### Task 1.8 — Wire orphan packages into surfaces

**What**: 4 packages (`mcp`, `skills`, `apply-patch`, `browser-tool`) are imported by zero surfaces today. Wire them in.

**Files**:

- `packages/mcp/` → consumed by `apps/desktop/src/services/mcp.ts`, `apps/web/app/api/mcp/route.ts`, `apps/mobile/src/services/mcp.ts`.
- `packages/skills/` → consumed by `apps/desktop/src/lib/skillLoader.ts` (replace bundled-only loader), `apps/web/features/chat/components/SkillsMenu.tsx` (new), CLI: `apps/cli/src/skills.rs` (note: CLI keeps its Rust skill stack; only TS surfaces consume the package).
- `packages/apply-patch/` → consumed by `apps/desktop/src-tauri/src/tools/file_edit.rs` via `tauri::command` wrapper, `services/api-gateway/src/tools/file_edit.ts`.
- `packages/browser-tool/` → consumed by `apps/extension/src/background.ts` (Chrome extension actions layer).

**Edge cases**:

- **Backward-compat shims**: existing API consumers may rely on the old bundled-only behavior. Add deprecation warnings; do not break.
- **Bundle size impact on mobile**: each new package adds to the JS bundle. Use dynamic imports for skills/apply-patch on mobile.
- **Cross-platform path semantics**: `apply-patch` must handle Windows `\` vs Unix `/` separators.
- **`browser-tool` action set**: 16 canonical Computer Use actions. Verify all 16 work in Chrome content script context (some require special Chrome permissions).
- **MCP transport variants**: when wiring `packages/mcp`, ensure all 8 transports (stdio, sse, sse-ide, ws, ws-ide, http, sdk, claudeai-proxy) are exposed even if not all are tested.
- **Skill `paths` activation**: gitignore-glob conditional activation requires `minimatch` or equivalent; Windows paths need normalization.
- **Skill metadata vs body progressive disclosure**: only metadata loads at session start; body loads on-demand. Consumer UIs must show "loading skill body…" feedback.

**Acceptance criteria**:

- `grep -rln '@agiworkforce/{mcp,skills,apply-patch,browser-tool}' apps/ services/` returns 4+ matches per package.
- Existing test suites for each package now have integration tests against consumer surfaces.
- Bundle size impact measured + acceptable (<5% increase per surface).

**Dependencies**: 1.3, 1.4, 1.6 (all foundation pieces in place).

---

### Phase 1 Exit Checklist

Do not promote `v0.7.0-foundation` until ALL of these are green:

- [ ] `pnpm typecheck:all` clean.
- [ ] `pnpm lint --max-warnings=0` clean.
- [ ] `cargo check --workspace` + `cargo clippy --workspace --lib -- -D warnings -D unsafe-code` clean.
- [ ] `pnpm test` clean across all workspaces.
- [ ] `cargo test --workspace --lib` clean.
- [ ] `grep -rln '@agiworkforce/{mcp,skills,apply-patch,browser-tool}' apps/ services/` returns 4+ matches per package.
- [ ] `apps/desktop/src/stores/` count ≤ 30 (was 102).
- [ ] `onChangeAppState`, `messageQueueManager`, `AsyncLocalStorage<AgentContext>` all in production.
- [ ] Stripe RPC verified in production via test-mode replay.
- [ ] Desktop Dispatch listener live and verified end-to-end with mobile.
- [ ] CI green on main for 7+ consecutive days (no rollback events).
- [ ] `docs/architecture/foundation-2026.md` written with the new architecture diagram.
- [ ] All ADRs filed under `docs/decisions/`.
- [ ] `v0.7.0-foundation` tagged + signed + pushed.

---

## Phase 2 — Parity Push (3 sub-agent teams in parallel)

### Sub-agent Team A — Tools / MCP / Skills

#### Task 2.A.1 — MCP OAuth complete

**What**: Implement RFC 7591 Dynamic Client Registration + RFC 9728/8414 metadata discovery + paste-callback fallback + step-up auth + cross-process refresh lockfile.

**Files**: `packages/mcp/src/oauth/{discovery,dcr,pkce,refresh,step-up,xaa,index}.ts`, `apps/desktop/src-tauri/src/mcp/oauth.rs` (Rust mirror for desktop direct integration).

**References**: `tasks/research/deep/m9-services-mcp.md` "Production OAuth 2.0 stack".

**Edge cases**:

- **Token refresh race**: cross-process refresh lockfile (file lock semantics differ on Windows vs Mac vs Linux). Use `proper-lockfile` npm pkg.
- **5-attempt retry**: 1s/2s/4s/8s/16s exponential backoff on refresh.
- **Invalid_grant cross-process race**: if two processes refresh at the same time, one wins, other gets `invalid_grant`. Detect + retry once with new token.
- **OAuth state CSRF**: state parameter must be a 32-byte random; verify on callback.
- **PKCE verifier storage**: must persist across browser redirect; use OS keychain or sessionStorage with TTL.
- **SEP-990 XAA / RFC 8693 / RFC 7523 / ID-JAG**: enterprise IdP SSO flow. Complex; implement after core OAuth works.
- **Step-up auth (403 + `insufficient_scope`)**: refresh can't elevate scope per RFC 6749 §6; force PKCE redirect.
- **Slack-quirk normalizer**: Slack pre-registers redirect URIs differently than RFC says.

**Acceptance criteria**:

- Connect to a live remote MCP server requiring OAuth (e.g., Notion, Linear) end-to-end.
- Token refresh test: token expires, refresh succeeds, request continues.
- Step-up auth test: request needing higher scope triggers PKCE redirect.
- Race test: 10 concurrent processes share one lockfile; only one refresh; others wait + use new token.

**Dependencies**: Phase 1 complete.

---

#### Task 2.A.2 — Add 6 missing MCP transports

**What**: Currently only stdio + http shipped (per gap matrix). Add: sse, sse-ide, ws, ws-ide, sdk control-channel, claudeai-proxy, in-process linked-pair (for browser-tool & computer-use).

**Files**: `packages/mcp/src/transport/{sse,sseIde,ws,wsIde,sdk,claudeAiProxy,linkedPair,index}.ts`.

**Edge cases**:

- **Streamable-HTTP**: chunked response handling; deal with connection drops mid-stream.
- **WebSocket reconnection**: exponential backoff; preserve session state across reconnect.
- **In-process linked-pair**: saves ~325 MB on browser-tool & computer-use by avoiding subprocess overhead.
- **SDK control-channel transport**: routes JSON-RPC over stdout; stderr is for log only. Don't mix.
- **claudeai-proxy**: only relevant for sandboxed environments where direct OAuth isn't available; routes through claude.ai's proxy.
- **Discriminated union in `types.ts`**: each transport variant gets its own type; runtime dispatch on `transport` field.

**Acceptance criteria**:

- Each transport has at least one working integration test against a real or mock MCP server.
- Reconnection test for WS: kill connection mid-call, transport reconnects, call retries.
- In-process linked-pair memory test: < 50 MB overhead per server (vs subprocess ~325 MB).

**Dependencies**: 2.A.1.

---

#### Task 2.A.3 — Skills 16-field frontmatter + `paths` conditional + 17 bundled skills

**What**: Implement the full Anthropic Skills schema (16 frontmatter fields per gap matrix correction from initial 14), gitignore-glob `paths` conditional activation, and ship 17 bundled skills.

**Files**:

- `packages/skills/src/schema.ts` (Zod schema with 16 fields).
- `packages/skills/src/loader.ts` (filesystem discovery + realpath dedup + 5-source priority).
- `packages/skills/src/conditional.ts` (paths gitignore-glob activation).
- `packages/skills/bundled/{loop,simplify,debug,batch,security-review,stuck,skillify,verify,remember,lorem-ipsum,update-config,keybindings,claude-api,claude-in-chrome,run-skill-generator,dream,hunter}/SKILL.md` (17 skill dirs with bodies).

**References**: `tasks/research/deep/misc1-skills-tasks-state-memdir.md` "16 frontmatter fields", `tasks/research/gap-matrix/cli-full.md` finding #1.

**Edge cases**:

- **Gitignore-glob semantics**: `*` doesn't match `/` but `**` does; `!` negates. Use the same `ignore` lib that gitignore uses.
- **Cross-platform path separators**: normalize to `/` before matching; Windows paths come in with `\`.
- **Skill activation race**: multiple skills' paths match the same file; load all, let the model pick.
- **Symlink resolution**: dedup by realpath, not by path string (per `loadSkillsDir.ts:118-124` defense against ExFAT/NFS inode-zero bugs).
- **Skill body lazy-load**: metadata at session start; body on-demand. Consumer UI shows loading state.
- **`disable-model-invocation` field**: model cannot self-invoke this skill; must be user-invoked explicitly.
- **Sandbox-aware shell injection** (`!\`...\``): only run when `loadedFrom !== 'mcp'`. Remote MCP skills never get inline shell exec.

**Acceptance criteria**:

- All 17 skills load + their `description` shows in the system reminder.
- Path-conditional activation test: edit a file in `src/`, skill with `paths: ['src/**']` activates; skill with `paths: ['tests/**']` does not.
- Each bundled skill has at least one eval query that triggers it correctly.

**Dependencies**: 2.A.1, 2.A.2 (some skills depend on MCP).

---

#### Task 2.A.4 — Plugin marketplace UI + plugin tag CLI

**What**: 16 component files for plugin marketplace browse/install/manage + `plugin tag` Git tag creation.

**Files**: `apps/desktop/src/components/Marketplace/`, `apps/cli/src/plugin/`.

**References**: `tasks/research/deep/m10-utils-plugins.md` "marketplace ecosystem is mature".

**Edge cases**:

- **Reserved-name security**: 8 names in `ALLOWED_OFFICIAL_MARKETPLACE_NAMES` + impersonation regex + ASCII-only + must come from `github.com/anthropics/*`. Mirror this for our own org.
- **Non-transitive cross-marketplace allowlist**: only ROOT marketplace's `allowCrossMarketplaceDependenciesOn` is consulted. No inheritance.
- **GCS mirror**: replace GitHub for our official marketplace; SHA sentinel + GrowthBook kill-switch.
- **Plugin ID format**: `^[a-z0-9][-a-z0-9._]*@[a-z0-9][-a-z0-9._]*$/i` regex.
- **Tagged release flow**: `plugin tag` validates semver, creates Git tag, publishes to registry.
- **Dependency resolution**: avoid circular deps via topological sort.

**Acceptance criteria**:

- Browse marketplace UI shows plugins from the official + at least 1 third-party marketplace.
- Install + uninstall + enable/disable round-trip works.
- `plugin tag 1.0.0` creates a signed Git tag and publishes to the registry.

**Dependencies**: 2.A.3 (skills are a plugin component type).

---

#### Task 2.A.5 — ToolSearch + LSPTool + AskUserQuestion + NotebookEdit

**What**: Add 4 high-leverage tools.

**Files**: `apps/cli/src/tools/{tool_search,lsp,ask_user_question,notebook_edit}.rs` + `packages/types/src/tool.ts` for cross-surface tool defs.

**References**: `tasks/research/deep/t4-mcp-lsp-skill-tools.md` for the gold-standard patterns.

**Edge cases per tool**:

**ToolSearch**:

- Two query modes: `select:A,B,C` exact + keyword scoring.
- Schema budget cap: 1% of context window per `SkillTool` system reminder.
- Tool name validation against shell-injection (`mcp__server__tool` could in theory have unsafe chars).

**LSPTool**:

- 9 ops: `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `workspaceSymbol`, `goToImplementation`, `prepareCallHierarchy`, `incomingCalls`, `outgoingCalls`.
- Two-step prepare→calls flow for call-hierarchy ops.
- `.gitignore` filtering via batched `git check-ignore`.
- 10MB file cap; 64KB symbol-context lookup.
- LSP server lifecycle: start/restart/kill.

**AskUserQuestion**:

- 1–4 multi-choice with previews + annotations.
- "Other" auto-injected.
- Uniqueness refinement on questions and labels.
- Output is `Record<question, answer>` with optional preview/notes.

**NotebookEdit**:

- Cell ops: replace/insert/delete.
- Schema for `.ipynb`: respect Jupyter metadata fields.
- After write, `readFileState.set(offset:undefined)` to break the dedup-stub trap.

**Acceptance criteria**:

- Each tool has working integration tests against real targets (real LSP server, real notebook, real questions/answers).
- ToolSearch budget cap verified: with 1000 deferred tools, system prompt overhead < 1%.

**Dependencies**: 2.A.1, 2.A.2.

---

### Sub-agent Team B — Permissions / Hooks / Subagents

#### Task 2.B.1 — Central permission engine

**What**: Replace the binary `ApprovalModal` with the full `useCanUseTool` 10-step pipeline + 12 per-tool dialogs + 5-tab `/permissions` rules engine.

**Files**:

- `apps/desktop/src/hooks/useCanUseTool.ts` (new, 10-step decision pipeline).
- `apps/desktop/src/components/permissions/{Dialog,Prompt,RuleExplanation,Explanation}.tsx` (4-piece composable kit).
- `apps/desktop/src/components/permissions/dialogs/{Bash,FileEdit,FileWrite,NotebookEdit,WebFetch,Skill,ComputerUse,AskUserQuestion,Filesystem,Sandbox,Fallback,SedEdit}.tsx` (12 per-tool).
- `apps/desktop/src/components/permissions/RulesEngine.tsx` (5-tab UI: recent / allow / ask / deny / workspace).

**References**: `tasks/research/deep/c3-components-chunk-3.md` permissions-tree analysis, `tasks/research/deep/u4-permissions-swarm-settings-model.md` "10-step pipeline + 5 bypass-immune guards".

**Edge cases**:

- **Precedence**: 7 ordered steps with 5 bypass-immune guards. `deny → ask → tool-check → deny-2 → requiresUserInteraction → content-ask → safetyCheck → bypass → allow`. ANY reordering breaks security. Lock the order in a single state-machine module.
- **Settings hierarchy**: Managed → Project → Local → User. Auto-mode/bypass opt-in flags exclude `projectSettings` to prevent malicious-repo RCE.
- **`additionalDirectories` setting**: must validate paths are absolute + exist + within scope.
- **"Always allow X for project"**: persisted to `~/.agiworkforce/permissions.json` per project; verify path is the canonical git root (not subdir).
- **Lazy LLM Explanation**: defers Sonnet call until user clicks Ctrl+E; uses `use(promise)` + Suspense.
- **classifierApprovable flag**: some decisions cannot be auto-approved by the classifier (e.g., bypass mode); UI must show this clearly.
- **Race**: tool A and tool B both prompt simultaneously; queue them so user sees one at a time.

**Acceptance criteria**:

- Each of the 12 per-tool dialogs renders correctly with realistic input.
- Precedence test: 100 synthetic permission scenarios, verify decision matches expected.
- Bypass test: bypass mode is correctly blocked when `disableBypassPermissionsMode = true`.
- "Always allow" persistence test: round-trip across app restart.

**Dependencies**: Phase 1 complete.

---

#### Task 2.B.2 — Plan mode

**What**: Implement EnterPlanMode + ExitPlanMode + 8-value plan-exit response enum + Ctrl+G plan-file editor handoff + plan-slug version-numbered persistence.

**Files**: `apps/desktop/src/components/PlanMode/`, `apps/cli/src/plan_mode.rs`, `apps/cli/src/tools/{enter_plan_mode,exit_plan_mode}.rs`.

**References**: `tasks/research/deep/t5-rest-tools.md` Plan mode finding.

**Edge cases**:

- **8-value plan-exit response enum**: `yes-bypass-permissions | yes-accept-edits | yes-accept-edits-keep-context | yes-default-keep-context | yes-resume-auto-mode | yes-auto-clear-context | ultraplan | no`.
- **CCR-edited plans**: re-snapshot disk after Ctrl+G edit; user may modify the plan in their `$EDITOR`.
- **Auto-mode gate-off fallback**: prevent bypassing the circuit breaker on plan exit.
- **Plan-file persistence**: `~/.agiworkforce/plans/<session-id>/plan-v<N>.md`; version-numbered.
- **Plan exceeds context window**: chunk + summarize before approval display.
- **Concurrent plan in subagent**: parent can be in plan mode while subagent is in execute mode.
- **Plan resume**: `--resume <session>` finds plan file and resumes from approved-plan state.

**Acceptance criteria**:

- Enter plan mode → plan generated → user approves → execution proceeds.
- Ctrl+G handoff: open plan in `$EDITOR`, save changes, plan re-loads with edits.
- Resume test: kill session mid-plan-execution, resume, plan continues correctly.
- 8-value response test: each of the 8 exit responses leads to the correct subsequent state.

**Dependencies**: 2.B.1 (permissions for plan-execution tools).

---

#### Task 2.B.3 — Hooks engine modernization

**What**: Implement 27 hook events × 5 handler types (command, HTTP, prompt, agent, callback, function) + AsyncHookRegistry + SSRF guard + permission-decision schema + precedence rules.

**Files**:

- `apps/cli/src/hooks/{events,handlers,registry,permission,index}.rs`.
- `apps/desktop/src/components/hooks/HooksEditor.tsx` (interactive UI).
- `packages/runtime/src/hooks/{schema,types,index}.ts` (cross-surface schema).

**References**: `tasks/research/deep/m4-hooks-system.md` "27 events × 5 handler types" + the env-var correction (`CLAUDE_FILE_PATH` etc. are stdin JSON, not env).

**Edge cases**:

- **27 events**: SessionStart/End/Setup/InstructionsLoaded/UserPromptSubmit/UserPromptExpansion/PreToolUse/PermissionRequest/PermissionDenied/PostToolUse/PostToolUseFailure/Notification/Stop/SubagentStart/Stop/StopFailure/PreCompact + 11 more.
- **5 handler types**: command (shell), HTTP (POST), prompt (LLM eval with `$ARGUMENTS`), agent (subagent spawn with Read/Grep/Glob), callback (SDK-injected JS), function (in-memory JS). Note: documented count 4, but reference source ships 5 — confirmed in deep-dive.
- **AsyncHookRegistry**: slow `SessionStart` hooks must NOT block REPL render. Promote to async via config-time `async: true` OR runtime first-line `{"async":true,"asyncTimeout":15000}`.
- **SSRF guard**: HTTP hooks require explicit `allowedHttpHookUrls` allowlist; reject any URL not in allowlist + reject any URL resolving to non-public IP (RFC 1918 ranges).
- **`hookSpecificOutput.permissionDecision`**: `allow|deny|ask`. Precedence: deny > ask > allow.
- **`updatedInput`** only honored for `allow` and `ask` decisions, NOT for `deny`.
- **Settings.json key spelling**: `allowedHttpHookUrls` (not `allowedHookHttpUrls` as inventory misspells). Confirmed in deep-dive.
- **Trust gate**: `shouldSkipHookDueToTrust()` must NOT silently drop hooks; log a warning.
- **Env vars passed to hooks**: `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PLUGIN_OPTION_*`, `CLAUDE_ENV_FILE`, `CLAUDECODE`. NOT the per-tool fields (those are stdin JSON).
- **Async hook timeout**: default 15s; configurable per hook.

**Acceptance criteria**:

- All 27 events fire correctly under test.
- All 5 handler types execute correctly with stdin JSON + appropriate env.
- SSRF test: hook with `http://169.254.169.254/...` (AWS metadata service) is rejected.
- Async hook test: SessionStart with `async: true` does not block REPL render.
- Permission precedence test: deny > ask > allow verified.

**Dependencies**: 2.B.1.

---

#### Task 2.B.4 — Subagent system

**What**: Implement 6 built-in subagents + custom-agent loader + worktree isolation + SendMessage 5-layer routing.

**Files**:

- `apps/cli/src/agents/{agent_tool,run_agent,local_agent_task,remote_agent_task,in_process_teammate,builtin,registry}.rs`.
- `apps/desktop/src/components/Agents/Library.tsx` (Library UI with Personal/Project scope + "Generate with Claude" wizard).
- `~/.agiworkforce/agents/` (user-level), `<project>/.agiworkforce/agents/` (project-level).

**References**: `tasks/research/deep/src-04-coordinator-subagents.md`, `tasks/research/deep/t1-agenttool-insights-plugins-ui.md`.

**Edge cases**:

- **6 built-in subagents**: general-purpose, Explore, Plan, Verification, claude-code-guide-equivalent, statusline-setup.
- **Custom agent loader**: markdown + YAML frontmatter at `~/.agiworkforce/agents/<name>.md`.
- **Worktree slug regex**: `[a-zA-Z0-9._-]+` capped at 64 chars. Reject path-traversal.
- **30-day stale-worktree GC**: skip worktrees with uncommitted/unpushed work.
- **Async-launch default in coordinator/fork/proactive modes**; sync auto-flips to async at 2 min via `getAutoBackgroundMs()`.
- **Per-agent MCP servers**: by-name reuses memoized client; inline `{name: McpServerConfig}` creates dedicated client cleaned up at agent exit.
- **Plugin-only-policy gate**: blocks user agents from adding MCP unless allowed.
- **`agentNameRegistry: Map<name, AgentId>`**: 5-layer SendMessage fallback (live task → stopped task auto-resume → disk-transcript resume → team mailbox → UDS/bridge).
- **Subagent context**: `omitClaudeMd` saves ~5–15 Gtok/wk; one-shot trailer suppression saves 1–2 Gtok/wk; agent-list-as-attachment saves 10.2% of fleet `cache_creation` tokens.
- **Fork subagent prompt-cache identity**: byte-identical user-message prefix with placeholder `tool_result`s; only per-child directive differs.
- **In-process teammate UI cap**: `TEAMMATE_MESSAGES_UI_CAP = 50` (empirically derived from 36.8 GB RSS spike). Cap is for zoomed-transcript UI; full convo on disk.

**Acceptance criteria**:

- All 6 built-in subagents work end-to-end (spawn, run, return result).
- Custom agent test: load agent from `~/.agiworkforce/agents/test-agent.md`, spawn, verify it runs with correct system prompt + tools.
- Worktree isolation test: agent makes file changes, exits → worktree GC'd if no diff.
- SendMessage 5-layer test: each layer activates correctly.
- Stress test: 100 concurrent subagents, no contamination, all complete.

**Dependencies**: 2.B.1 (permissions), 2.B.3 (hooks fire on subagent lifecycle).

---

### Sub-agent Team C — VM Hosts (Mac + Windows + Linux in parallel)

#### Task 2.C.1 — Apple Virtualization Framework (macOS)

**What**: Build VM-isolated execution on macOS using Apple's `Virtualization.framework`.

**Files**:

- `apps/desktop/src-tauri/src/vm/macos/` (Rust wrapping Swift bridge).
- `apps/desktop/native/macos/AGIWorkforceVM.swift` (Swift VM driver).
- `apps/desktop/src/components/Cowork/VMStatusPill.tsx` (status indicator).

**Edge cases**:

- **Swift `@MainActor` deadlocks under libuv**: must dispatch via custom CFRunLoop pump (per `computerUse/` deep-dive).
- **macOS version compatibility**: Apple VF available from macOS 11.3+; verify at startup; show clear error message on older.
- **VM bundle path**: `~/Library/Application Support/AGIWorkforce/vm_bundles/agiworkforcevm.bundle`.
- **VM image build**: macOS guest images from Apple's IPSW; Linux guest images from cloud images.
- **Network egress allowlist**: applied at vmnet-helper layer.
- **File mounts**: VirtIOFS for shared folders; permissions must be explicitly granted.
- **Resource caps**: 2 vCPU, 4 GB RAM by default; configurable.
- **Recovery from VM crash**: detect crash via heartbeat; auto-restart VM with state restore.
- **Audit log integration**: every VM tool call logged to `~/.agiworkforce/audit.log`.
- **Stale VM cleanup**: VMs not used in 7 days auto-terminate; bundle preserved for restore.

**Acceptance criteria**:

- VM boots in < 10 seconds.
- Inside VM: shell command executes, result returns to host.
- File mount round-trip: write file in VM, read from host.
- Network egress: only allowed domains succeed; others fail with clear error.
- VM crash recovery: kill VM mid-task, host detects, auto-restarts, in-flight task either completes or returns error.

**Dependencies**: Phase 1 complete (audit log infrastructure).

---

#### Task 2.C.2 — Hyper-V (Windows)

**What**: Build VM-isolated execution on Windows using Hyper-V via WMI/PowerShell.

**Files**:

- `apps/desktop/src-tauri/src/vm/windows/`.
- `apps/desktop/native/windows/AGIWorkforceVMService.cs` (C# Hyper-V service).
- MSIX installer adds the VM service component.

**Edge cases**:

- **Windows Home does NOT have Hyper-V**. Detect at install time + show clear error / fallback to OS sandbox.
- **Hyper-V + WSL2 conflict**: WSL2 uses Hyper-V; ensure compatible.
- **Virtualization-based Security (VBS)**: must be enabled; check at install.
- **MSIX installer**: declares `windows.hostRuntime` and the VM service component.
- **VM image cold-download**: ~1.5 GB; show progress; resumable.
- **Vmmem RAM**: minimize idle footprint; users complain about ~1.8 GB resting RAM.
- **Network egress**: managed via Hyper-V virtual switches.
- **File mount**: SMB or 9P shared folders.

**Acceptance criteria**: same as 2.C.1.

**Dependencies**: Phase 1 complete.

---

#### Task 2.C.3 — KVM/Firecracker (Linux)

**What**: Build VM-isolated execution on Linux using KVM via Firecracker VMM.

**Files**:

- `apps/desktop/src-tauri/src/vm/linux/`.
- Possibly a separate `agiworkforce-vmm` Rust binary that runs as systemd user service.

**Edge cases**:

- **KVM kernel module**: detect at startup; clear error if not loaded.
- **Container-in-container**: if running inside Docker, KVM may not be available; fall back to OS sandbox.
- **Firecracker requires root or `cap_net_admin`**: handle privilege drop carefully.
- **VM image format**: rootfs.img + kernel for Firecracker; build via `dietpi` or similar minimal-image builder.
- **Network egress**: via TUN/TAP; allowlist via iptables.
- **File mount**: VirtIOFS or 9P.
- **Resource caps**: cgroups v2 limits.
- **Differentiator**: this is the OS Anthropic explicitly skips; ship it confidently.

**Acceptance criteria**: same as 2.C.1.

**Dependencies**: Phase 1 complete.

---

### Phase 2 Exit Checklist

- [ ] All 3 sub-agent team task lists complete.
- [ ] MCP OAuth verified end-to-end against at least 3 different remote MCP servers (different OAuth quirks).
- [ ] All 6 built-in subagents pass integration tests.
- [ ] All 12 per-tool permission dialogs work correctly.
- [ ] Plan mode round-trip works including Ctrl+G handoff.
- [ ] All 27 hook events fire under integration test.
- [ ] VM boots + executes + reports back on all 3 OSs (Mac, Windows, Linux).
- [ ] Audit log captures every tool call, every VM action, every permission decision.
- [ ] All 17 bundled skills load + activate correctly under their `paths` rules.
- [ ] CI green on main for 7+ consecutive days.
- [ ] `v0.8.0-parity` tagged.

---

## Phase 3 — Hobby + Pro Launch

### Task 3.1 — Hobby tier launch

**What**: Public Hobby tier ($10/mo) with self-serve PLG flow.

**Files**: `apps/web/app/upgrade/`, `apps/web/app/api/billing/`, marketing pages.

**Edge cases**:

- **Stripe live mode keys**: separate from test mode; ensure correct keys per env.
- **Webhook idempotency**: verified Phase 1, but smoke test in live mode again.
- **Subscription lifecycle**: subscribe → active → past-due → cancel → resubscribe. Each transition tested.
- **Provider fallback under quota**: if user's Hobby usage exceeds limits, fall back to free models (Sonnet/Haiku) gracefully.
- **App store submissions** (parallel, longer lead times): Mac App Store, Microsoft Store, Chrome Web Store, VS Code Marketplace. Each has a review queue.
- **Apple notarization**: requires `APPLE_*` secrets to be issued. Block on this externally.
- **Marketing launch coordination**: `agiworkforce.com` + Show HN + Product Hunt + press release.

**Acceptance criteria**:

- Real user can sign up, pay $10, use Hobby tier features.
- Webhook idempotency live-mode test passes.
- App store submissions in flight (status visible).
- `agiworkforce.com` shows updated pricing + Hobby CTA.

**Dependencies**: Phase 2 complete (need parity-pushed features for compelling Hobby tier).

---

### Task 3.2 — Pro tier launch with Cowork VM

**What**: Pro tier ($30/mo) with VM-isolated autonomous tasks across all 3 OSs.

**Files**: `apps/web/app/upgrade/`, `apps/desktop/src/components/Cowork/`.

**Edge cases**:

- **Pro feature gating**: 1M context, advanced models (Opus 4.x), priority support.
- **Cowork VM resource caps per tier**: Pro gets 2 vCPU/4 GB; Pro+ gets 4 vCPU/8 GB; Max gets 8 vCPU/16 GB.
- **VM cold-start**: first VM boot in Hobby/Pro should pre-warm at app start to avoid 10-second wait on first task.
- **Multi-machine sync**: Pro users may use multiple machines; conversation state syncs via Supabase Realtime.
- **Voice mode**: enable for Pro tier with TTS + STT pipeline.
- **Image generation in chat**: enable for Pro tier; route to provider's image gen API.

**Acceptance criteria**:

- Pro user can run an autonomous Cowork task on each of Mac/Windows/Linux.
- Cross-machine sync test: start on Mac, continue on Linux.
- Voice mode + image gen verified.

**Dependencies**: 3.1, 2.C.1, 2.C.2, 2.C.3.

---

### Phase 3 Exit Checklist

- [ ] Hobby tier live, real users paying.
- [ ] Pro tier live, VM working on all 3 OSs.
- [ ] App store reviews submitted; status tracked.
- [ ] At least 1 marketing channel launched (Show HN, Product Hunt, or press).
- [ ] CI green for 7+ consecutive days.
- [ ] `v1.0.0-launch` tagged + signed.

---

## Phase 4 — Enterprise Readiness

### Task 4.1 — SAML/SSO + admin console

**What**: Enterprise auth via SAML 2.0 (or OIDC); admin console for org management.

**Files**: `apps/web/app/admin/`, `services/api-gateway/src/auth/saml.ts`.

**Edge cases**:

- **WorkOS or Auth0 integration**: outsource SAML complexity unless we have specific reasons to build.
- **SAML metadata refresh**: enterprise IdPs rotate certs; refresh on a schedule.
- **JIT (Just-In-Time) provisioning**: user logs in via SAML, account auto-created with default role.
- **SCIM provisioning**: deprovisioning a user must immediately revoke all sessions + invalidate tokens.
- **Group claims**: map IdP groups to AGI Workforce roles.
- **Org-level model restrictions**: admin can disable specific providers for the org.
- **Org-level connector allowlist**: admin can disable specific MCP servers for the org.

**Acceptance criteria**:

- SAML login round-trip works against Okta + Microsoft Entra ID.
- Deprovisioning test: SCIM API receives deprovision call, user can no longer log in within 60 seconds.
- Org-level restrictions: admin disables a provider, all users in org cannot use it.

**Dependencies**: Phase 3 complete.

---

### Task 4.2 — SOC 2 Type II preparation

**What**: Continuous compliance monitoring + evidence collection.

**Files**: Vanta or Drata integration; `docs/security/`.

**Edge cases**:

- **Observation window**: SOC 2 Type II requires ~6 months of evidence. Start the clock NOW.
- **Auditor selection**: typically a Big 4 or specialized audit firm.
- **Penetration test**: external auditor; 1-2 weeks lead time.
- **Internal security policy**: even as solo, the policy must exist (acceptable use, incident response, change management, etc.).
- **Disaster recovery plan**: documented + tested.
- **Background checks**: for the founder, evidence of identity verification.

**Acceptance criteria**:

- Vanta/Drata integration green on all in-scope controls.
- Pentest scheduled and passed.
- All required policies documented at `docs/security/policies/`.
- Audit window started (6-month clock running).

**Dependencies**: 4.1 (SOC 2 covers auth controls).

---

### Phase 4 Exit Checklist

- [ ] SAML/SSO live with at least 2 enterprise pilot customers.
- [ ] Admin console fully functional.
- [ ] SOC 2 Type II audit window open (clock running).
- [ ] HIPAA-ready BAA template available.
- [ ] All security/privacy/trust docs published at repo root + `agiworkforce.com/security`.
- [ ] First 5 enterprise marquee logos in pipeline (term sheets or signed contracts).
- [ ] CI green for 14+ consecutive days.
- [ ] `v1.5.0-enterprise` tagged.

---

## Phase 5 — Acquisition Readiness

### Task 5.1 — Acquirer-specific demo decks + outreach

**What**: 3 acquirer-tailored 5-minute demo videos + corp-dev outreach.

**Files**: `marketing/acquisition/`.

**Edge cases**:

- **Anthropic angle**: "the multi-provider competitor you can't build without rewriting `services/api/claude.ts`."
- **Microsoft angle**: "Linux-first AI agent that complements Copilot; doesn't lock to OpenAI."
- **Google angle**: "cross-Gemini-OpenAI-Claude framework you can't ship for competitive reasons."
- **Wild-card acquirers**: prep lighter decks for Stripe, Notion, Salesforce, Atlassian, Adobe, Apple.
- **Warm introductions**: identify 2-3 advisors who can warm-intro to corp dev at each.
- **NDA hygiene**: nothing in the deck reveals trade secrets; technical IP discussed only post-NDA.

**Acceptance criteria**:

- 3 demo videos recorded (each ≤5 minutes).
- 3 acquirer-specific decks written.
- 5+ warm-intro paths identified for each acquirer.

**Dependencies**: Phase 4 complete.

---

### Task 5.2 — Due-diligence-ready cleanup

**What**: Pre-empt acquirer technical due diligence.

**Files**: across the entire repo.

**Edge cases**:

- **Open-source license audit**: every third-party dependency checked against `THIRD_PARTY_LICENSES.md`. No GPL leakage.
- **Cap table cleanliness**: founder vesting, no encumbered shares.
- **Customer contracts**: assignability clauses present.
- **Patent search**: defensive patent applications filed if obvious targets exist.
- **Code quality metrics**: Sonar or similar; aim for "Maintainability Rating A".
- **Test coverage**: aim for 85%+ across critical paths.
- **Documentation**: every public API documented.
- **Architecture diagram**: 1-page ASCII or mermaid in `docs/architecture/system-overview.md`.

**Acceptance criteria**:

- License audit clean.
- Cap table review clean.
- Code quality + test coverage targets met.
- All due-diligence questions answerable from `docs/`.

**Dependencies**: 5.1.

---

### Phase 5 Exit Checklist (Acquisition-ready)

- [ ] All 6 surfaces ≥ 80% Anthropic parity.
- [ ] $1M+ ARR run-rate.
- [ ] 5–10 enterprise marquee logos signed.
- [ ] SOC 2 Type II in audit window or certified.
- [ ] HIPAA BAA template + at least 1 signed BAA.
- [ ] All due-diligence material assembled at `docs/due-diligence/` (or private).
- [ ] 3 acquirer-specific demos + decks ready.
- [ ] First corp-dev conversations underway.
- [ ] CI green for 30+ consecutive days.
- [ ] `v2.0.0-acquisition-ready` tagged.

---

## Cross-cutting concerns (active throughout all phases)

### Testing strategy

- **Unit tests**: cover every pure function; aim for 90%+ branch coverage on `packages/runtime/`, `packages/llm-runtime/`, `packages/skills/`, `packages/mcp/`.
- **Integration tests**: cover every cross-package boundary; e.g., `packages/skills/` consumed from `apps/desktop/`.
- **E2E tests**: Playwright on web/desktop; Detox on mobile; Puppeteer on Chrome ext.
- **Property tests**: for state machines (permission engine, plan-mode FSM, vim mode, message queue).
- **Snapshot tests**: TUI rendering (CLI), critical UI components (web/desktop).
- **Load tests**: simulate 1000 concurrent users on Hobby tier; verify backend scales.
- **Chaos tests**: kill VMs mid-task; kill workers; lose network mid-stream. Verify recovery.

### Documentation discipline

- Every PR that adds a public API also updates the relevant doc.
- Architecture decisions logged at `docs/decisions/YYYY-MM-DD-{title}.md`.
- Per-surface CHANGELOG.md auto-generated by release pipeline.
- Reference docs maintained at `docs/{skills-authoring,plugin-authoring,mcp-authoring,hooks-reference,subagent-guide,computer-use-guide,dispatch-guide,settings-json-reference}.md`.

### Security baseline

- `SECURITY.md` at repo root with PGP key + 30-day triage SLA.
- `PRIVACY_POLICY.md` at repo root + `apps/web/app/privacy/page.tsx`.
- `TRUST.md` at repo root summarizing compliance.
- `cargo audit` + `pnpm audit` on every PR; ignore lists at `.cargo/audit.toml` + `.npmrc` with per-entry justifications.
- Husky `pre-commit` scans for AWS/Anthropic/OpenAI/Stripe/GitHub key prefixes; CI rejects commits that introduce them.
- OS sandbox primitives (Seatbelt/bwrap/Landlock/Job-Object) wrap every shell command before VM hosts ship.
- Key-rotation playbook documented for: Stripe webhook, Anthropic API, OAuth signing keys, Dispatch HMAC.

### Operational standards

- `status.agiworkforce.com` from Phase 3 onward.
- OpenTelemetry exporters from Phase 1 onward.
- Sentry error tracking from Phase 1 onward.
- Plain or Linear support from Pro launch onward.
- Customer Slack channel for Pro+/Max customers from enterprise launch.

### Sub-agent orchestration discipline

- **Maximum 3 concurrent sub-agent teams** per phase. More creates coordination tax that exceeds throughput gain.
- **Each sub-agent task ≤ 8 hours of focused work scope**. Bigger tasks split.
- **Foundation merges land before dependent feature work.**
- **Daily integration cadence.** End of day: integrate all sub-agent outputs into main. Long-lived branches → merge conflicts.
- **Verify-before-action**: when a sub-agent reports findings, verify with file:line quotes before acting on them. This habit caught 4 of 12 P0 reclassifications in prior audits.
- **Test coverage gate**: every sub-agent task includes tests added or updated.

---

## Risk mitigation playbook

### If Foundation sprint stalls (Phase 1)

- Symptom: integration tests failing on architecture changes.
- Action: bisect to find the breaking change; revert just that piece; ship the rest.
- Fallback: run Foundation sprint sequentially (Tasks 1.1 → 1.8 in order) instead of parallel.

### If a VM stack fails (Phase 2.C)

- Symptom: VM doesn't boot or crashes on real hardware.
- Action: disable that OS's VM, fall back to OS sandbox + audit log for that OS only.
- Communication: clear marketing message — "Cowork VM beta on macOS+Windows; Linux ships with OS-sandbox isolation + audit log."

### If MCP OAuth has issues with a specific provider (Phase 2.A.1)

- Symptom: OAuth flow breaks on Slack/Notion/etc.
- Action: provider-specific quirks file at `packages/mcp/src/oauth/quirks/<provider>.ts`. Add the workaround there.
- Document the pattern at `docs/mcp-authoring.md`.

### If Hobby launch revenue is below expectations (Phase 3.1)

- Symptom: <100 paid users in first month.
- Action: diagnose via funnel analytics (signup → trial → paid → retained). Fix the worst-converting step.
- Pivot if needed: free-forever-with-key + paid managed-cloud might convert better than upfront $10/mo.

### If enterprise sales cycle is longer than expected (Phase 4)

- Symptom: 0 marquee logos by month 9.
- Action: reduce scope of "enterprise-ready" to admin console + audit log + SAML; don't wait for SOC 2 to land first deal.
- Tactic: offer beta enterprise pricing in exchange for case study rights.

### If acquirer market cools (Phase 5)

- Symptom: no corp-dev interest after 3 months of outreach.
- Action: pivot to Series A raise on revenue traction; continue building.
- Don't panic: real revenue + clean architecture + 4 differentiator moats remain valuable regardless of acquirer interest.

---

## Final checklist before claiming "done"

- [ ] All 5 phase exit checklists green.
- [ ] All 6 surfaces shipping at v2.0.0+.
- [ ] CI green on main for 30+ consecutive days at v2.0.0+.
- [ ] All `MEMORY.md` "Open P0/P1" entries closed.
- [ ] All public docs published.
- [ ] Customer book composition healthy: ~70% consumer, ~30% enterprise.
- [ ] First corp-dev conversations active OR Series A term sheet in hand.
- [ ] Founder personal sustainability check: still energized, not burned out.

---

_This execution plan is the operational companion to `MASTER_PLAN_2026-05-09.md`. Update via formal ADR if any phase scope changes. Both docs are source-of-truth from 2026-05-09 forward._
