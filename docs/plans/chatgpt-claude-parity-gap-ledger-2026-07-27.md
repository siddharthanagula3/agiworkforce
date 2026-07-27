# ChatGPT / Claude / OSS-Agent Parity Gap Ledger — 2026-07-27

Status: Current
Owner: Platform lead
Last updated: 2026-07-27

**Supersedes and replaces** `chatgpt-claude-parity-gap-audit-2026-07-21.md` and
`not-built-inventory-2026-07-21.md` (both deleted — see
`docs/agent-context/doc-sweep-2026-07-27.md`; recover with
`git show <commit>^:<path>`).

## Why this replaces them

Both predecessors state repo status as of commit `08f96db` (2026-07-17), as does
the founder's benchmark corpus (`~/Downloads/0{1..7}-benchmark-spec.md`, 395
feature blocks). **HEAD is 386 commits past that base.**

Re-verifying the 2026-07-21 audit's 14 ranked blockers against HEAD **closes or
substantially downgrades nine of them, and one was never real.** A gap document
whose headline findings are two-thirds wrong costs more attention than it saves.

Every row below is a first-hand code read at HEAD (`5aa420254`).

---

## 1. Blocker-grade — CONFIRMED OPEN

### B1 · Enterprise SSO/SCIM is unrunnable, and `/enterprise` sells it

`/api/admin/sso` issues `select … from sso_connections` (route.ts:112,132,221),
but **no migration anywhere creates that table** — zero DDL for
`sso_connections` or `directory_sync_connections` in `apps/web/db/neon/*.sql`.
Every call 500s on "relation does not exist".

The route is additionally self-inconsistent and cannot work against _any_ single
schema: POST inserts `provider_type/display_name/attribute_mapping/created_by`
(:221), DELETE selects `provider` (:305), and `neon-types.ts:354` declares only
`provider`.

The WorkOS directory-sync webhook verifies HMAC and then returns **501**
(`webhooks/directory-sync/route.ts:123-131`). Meanwhile `/enterprise` sells
"SAML 2.0 and OIDC. Okta, Azure AD, Google Workspace"
(`enterprise/page.tsx:39-45`).

**Either build it or stop selling it.** Today the page sells a 500.

### B2 · Checkpoints/worktrees — plumbing, not building

`developer_host.rs:185-186` hardcodes `checkpoints: false, worktrees: false`.
But the CLI **already has** local checkpoints/rewind (`tui_app.rs:2773 /rewind`,
`agent/history.rs`) and worktree tooling (`platform/runtime/worktree.rs`).
VS Code parses both booleans (`localRuntimeClient.ts:52-53`), so it can never
enable them.

**One host declaration gates three surfaces over capability already written.**
Highest leverage-to-effort item in the repo.

### B3 · 77% of the desktop feature tree is dead

Import-graph BFS from `main.tsx`: **444 of 576 feature files orphaned**, ~50
fully-orphaned directories. The live shell is
`App.tsx:1698 → features/v3/DesktopShellV3.tsx`, which mounts chat +
projects/artifacts/scheduled/record-skill only.

Consequently the live desktop shell has **no terminal, git, MCP-tools,
notifications, computer-use observability, or workflows UI** — all of it hangs
off `AppLayout`/`DynamicSidecar`, which have **zero importers**.

A 175-file legacy `features/chat/` tree _shadows_ live v3 components (two
Sidebars, two settings shells) — the biggest wrong-edit risk in the repo, and
the reason grepping before a demo concludes features ship when they don't.

### B4 · No vector/semantic retrieval **on web** (desktop has it)

Web search is `ILIKE` (`search/route.ts:179-266`), memory search is `ILIKE`
(`api/memory/search/route.ts:43`), project knowledge is full-text injected as
system content rather than retrieved.

**Refinement over prior audits:** this is not "nowhere". Desktop ships a
complete local stack — `EmbeddingService` with `EmbeddingGenerator`,
`SimilaritySearch`, `EmbeddingCache`, `IncrementalIndexer`
(`core/embeddings/mod.rs:22-27`). The web gap is a port, not a green field.

---

## 2. Already closed — do NOT re-work

| Prior claim                                          | Now                                        | Evidence                                                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop cannot reach Managed Cloud (**Blocker #2**)  | CLOSED `4b0d4ceaf`                         | Live un-gated toggle `LocalCloudToggle.tsx:144`, `appModeStore.ts:81-96`                                                                                                             |
| Web memory not wired into send path (**Blocker #3**) | CLOSED `fdf492633`,`c7abd0454`             | `request-processor.ts:1323-1348`; path `WebChatPage → useChatStream.ts:2003 → completions`                                                                                           |
| Tool approvals not reload-durable (**Blocker #4**)   | CLOSED `680f1fdce`,`beb810930`,`eeaa2d3eb` | DB-backed `0062`; saved `route.ts:478-491`; claimed with TTL/410 `approve/route.ts:147`. Survives restart                                                                            |
| `/connect/vscode` 404s (**Blocker #6**)              | **NEVER REAL** `2054595d0`                 | Dynamic route with explicit `case 'vscode'` (`connect-client.tsx:11`). The audit checked for a literal file instead of resolving the route, and carried it as a Blocker for six days |
| Connector per-tool permissions client-only           | CLOSED `d376dd342`                         | `connector-tool-permissions.ts`, enforced pre-side-effect and on `/approve` resume; RLS `0069`                                                                                       |
| No WebSocket remote developer-session transport      | CLOSED `b20b3ff38`                         | `run_developer_session_websocket` + `WebSocketSecurity` (`app-server/src/lib.rs:257`)                                                                                                |
| CLI sandbox may execute unsandboxed                  | CLOSED `ad5ebe1b9`                         | `sandbox.rs:108-119,300-316` — refuses loudly                                                                                                                                        |
| MCP elicitation not wired into TUI                   | CLOSED `eae62447b`                         | `tui_app.rs:263-264,740-776`                                                                                                                                                         |
| Chrome computer-use allow-all P0 leak                | CLOSED (+`8801412ff`)                      | Default-deny, CSPRNG ids, sender validation, 30s→DENY, site allowlist (`background.ts:1974-2033`)                                                                                    |
| Desktop settings sync nonexistent                    | CLOSED `c39eba06c`                         | `managedCloudSettingsSync.ts:517-560`, wired `App.tsx:612`                                                                                                                           |
| Desktop sync drops `model`/`pinned`                  | CLOSED `4b0d4ceaf`                         | `cloudChat.ts:106-109,332,349`; `chatStore.ts:889-890`                                                                                                                               |
| Desktop memory sync synthesizes topics               | CLOSED `4b0d4ceaf`                         | `api/cloudMemory.ts` rewritten to content-only facts                                                                                                                                 |
| Desktop injects skill bodies unfenced                | CLOSED `1171788f7`                         | Jaccard >0.15, top-2, `<<<BEGIN UNTRUSTED SKILL CONTENT>>>`, incognito-skipped (`send_message_setup.rs:947-1045`)                                                                    |
| Web composer images-only                             | CLOSED `a7044ecc9`                         | PDF/TXT/MD/CSV/HTML/JSON/XML/code (`chat-attachments.ts:9-24`). **DOCX still unsupported**                                                                                           |
| Knowledge files "not yet available"                  | CLOSED `69f729aaa`,`df1781fc4`             | Routes + panel live, no gate; extraction `0064`                                                                                                                                      |
| Deep research only partial                           | CLOSED `309e480ac`                         | `research-loop.ts` plan → bounded rounds → cited synthesis. _Anthropic still single-turn_                                                                                            |
| Mobile connectors 501 / no custom MCP                | CLOSED `1171788f7`                         | Real directory, OAuth, encrypted custom MCP. Remaining 501s are deliberate trust-boundary rejections                                                                                 |
| Mobile cloud tool discovery unwired                  | CLOSED `1171788f7`                         | Capability-driven gating `AddToChatSheet.tsx:73-105`                                                                                                                                 |
| Global search single-entity                          | CLOSED partially `0a222cb6b`               | Sessions + messages + projects + library files. **Still excludes artifacts, memory, connectors**                                                                                     |
| `TODO.md` `EXT-10`, `DCL-01`                         | CLOSED `8801412ff`,`3cf7761f7`             | Queue written 16:05; EXT-10 fixed 16:07, DCL-01 19:55 — the latter added `scripts/check-css-tokens.mjs`                                                                              |

## 3. Overstated — real but smaller than written

| Claim                                                 | Reality at HEAD                                                                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No durable run journal                                | Built under other names: `cloud_agent_runs`+`cloud_agent_events` (`0061`), checkpoints (`0062`), `cloud_agent_execution_operations` with operation keys, leases, completed-op replay = exactly-once (`0063:20-40`) |
| Audit logs mutable                                    | `0043:32` revokes UPDATE/DELETE from `app_rls`, but writes use the **owner connection** (`security-audit.ts:50`) which the REVOKE does not bind; trigger re-grant-proofing deferred as `AUDIT-IMMUT-01`            |
| Desktop hasn't adopted shared Rust crates             | **False** — 7 crates consumed (`Cargo.toml:32-38`). Prior audits likely grepped `../../crates/` when the path is `../../../crates/`                                                                                |
| Desktop voice unshippable                             | Runtime-probes and falls back to Web Speech/cloud (`useVoiceTranscription.ts:198-205`). Degraded, not broken — but persisted default provider is still `local_whisper`                                             |
| Desktop cloud publish returns `WaitlistPublishResult` | Symbol gone; honest toast. Local publish real                                                                                                                                                                      |
| Desktop settings a bespoke fork                       | Cloud uses the **shared** `SettingsModal`; local bespoke deliberately. **Sidebar still an 855-LOC fork**                                                                                                           |
| Mobile has no IAP path                                | Full StoreKit2/Play Billing flow (`useIapPurchaseFlow.ts:117-211`). **SKUs are placeholders** — founder store-console action                                                                                       |
| Mobile artifact viewer partial                        | Full-screen viewer with hardened JS-disabled sandbox (`ArtifactFullScreen.tsx`). **No inline PDF/spreadsheet rendering**                                                                                           |
| Mobile projects partial                               | Substantially built — detail screen, chats tab, sources tab with upload/delete, schedules, library, artifacts                                                                                                      |
| Web `/chat` forks 6,858 LOC                           | **2,944 LOC**, already consuming shared `@agiworkforce/ui` + `unified-chat`. `UnifiedChatPage` still routed to nothing                                                                                             |
| CLI has zero bundled skills                           | Literally true, but the channel is real (frontmatter parse, consent, read-only `skill` tool, `$`/`@` mentions, TUI toggle). Auto-activation scoring exists but unwired                                             |
| Chrome bridge insecure                                | Substantially hardened: per-session secret, HMAC-SHA256, STRICT downgrade guard, timing-safe compare, fail-closed URL policy. Residual: no envelope freshness window                                               |
| Chrome no prompt-injection defense                    | Defenses exist and are unit-tested. **Missing is the e2e demonstration** — `e2e/smoke.mjs:7-8` scopes it out                                                                                                       |
| Chrome MV3 durability absent                          | Keep-alive alarm, alarm restore, managed-run re-attach exist. **Residual: computer-use loop is an in-memory detached promise with no persisted resume**                                                            |
| Mobile skills browsable-but-not-injected              | **Worse** — not browsable either. Zero UI importers; `/(app)/skills` is a placeholder nothing navigates to                                                                                                         |
| VS Code no connector/MCP UI                           | Thin but real; cloud connectors link out to web, MCP delegated to CLI host. **No in-editor MCP add/remove/OAuth UI**                                                                                               |
| VS Code BYOK/Local unwired                            | Local runtime **fully wired** (`extension.ts:73` → stdio JSON-RPC). BYOK deliberately delegated to CLI provider store                                                                                              |
| Status/health/SLA planned everywhere                  | `/status` real, server-rendered via shared `runHealthChecks`; `/api/health` 503s honestly. **Missing: incident history, postmortems, subscribe**                                                                   |

## 4. Net-new gaps (in no prior document)

| ID  | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Sev                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| N1  | **No desktop MDM / managed-policy keys** — zero matches in `apps/desktop`. Benchmark F-INST-04/05; both competitors ship them. Blocks enterprise desktop rollout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | High                     |
| N2  | **No accessibility-API context reading.** Benchmark F-CTXR-01/02/03 (ChatGPT Desktop "Work with Apps" reads the macOS AX tree). We use OCR/vision (`core/agent/vision.rs`) — lossy and slow where the benchmark is lossless. Architectural                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | High                     |
| N3  | **Stale waitlist/invite ceremony survives public alpha on mobile** — `EnvironmentOptionsSheet.tsx:130` (**user-reachable via `/code`**), `InviteCodeModal.tsx:444`, `/(app)/skills`. Contradicts the 2026-06-27 decision. Demo-visible                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | High                     |
| N4  | **Messaging channels are config theater.** `messaging_configs` (`0016_misc.sql`) + config/stats/test routes for whatsapp/telegram/slack exist, but there is **no outbound sender anywhere** (zero `api.telegram.org`/`graph.facebook.com`/`slack.com/api` calls) and **zero UI importers**. The "test connection" route only shape-validates ("WhatsApp requires a phone number") — it never contacts the platform, so it reports success for credentials it never verified                                                                                                                                                                                                                                                                                                                                                                                                                            | High                     |
| N5  | **CLI effort picker dead for non-Anthropic models** — maps only to `thinking_budget_tokens` (`agent/mod.rs:183-185`); `models/streaming.rs:291` hardcodes `reasoning_effort: None` while `crates/agiworkforce-llm/src/stream.rs:930` already supports it. **One field**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Med (cheap)              |
| N6  | **TUI `/voice` is a dead-end redirect** — prints "run `agi --no-tui`" (`tui_app.rs:2929-2931`) while a complete 1,186-line dual-backend implementation works in the REPL. UI wiring                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Med (cheap)              |
| N7  | **Web has no per-provider connector authorization** — `POST /api/connectors` 501s by design; nothing but the GitHub App can be newly connected from web                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Med                      |
| N8  | **`OrganizationService` is dead code** while `/enterprise` and `/teams` sell org features. No org create/switch path; no workspace switcher anywhere in `apps/web`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Med                      |
| N9  | **Web voice settings hardcodes `hasVoice = false`** (`settings/voice/page.tsx:15`) → permanent "coming soon" banner and half-opacity controls **next to a composer that ships working voice input**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Med                      |
| N10 | **iOS OS-integration trio absent** — no widgets, Live Activities, or Quick Actions; no iOS Share Extension (Android has `ACTION_SEND`/`ACTION_PROCESS_TEXT`). Siri App Shortcuts _do_ ship                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Med                      |
| N11 | **Desktop record mode / meeting transcription (F-VOIC-03) absent**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Med                      |
| N12 | **Mobile `settings/integrations.tsx` is a dead duplicate** of cloud-connectors with a fake "Coming Soon… next update. OAuth flow will open in your browser" alert describing a flow that doesn't exist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Low                      |
| N13 | **Duplicate migration ordinal `0067`** (two files). `check-neon-migrations.mjs` validates naming but has no duplicate-ordinal guard (only `.sort()`, line 21)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Low                      |
| N14 | **VS Code `environmentAvailability()` Phase A stub** returns `configured:false` for every environment (`modelConstants.ts:44-52`) — silent lockout the day any model sets `requiresEnvironment`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Low                      |
| N15 | Dead desktop modules with user-facing strings: `api/googleBatch.ts` (zero importers, has an error toast); `ShareArtifactDialog.tsx:44` promises publishing "after release controls are enabled" — a gate concept that no longer exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Low                      |
| N16 | **`/connect/[deviceType]` has no allowlist** — `/connect/<anything>` renders a pairing page for a device that doesn't exist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Low                      |
| N17 | **ChatGPT Health is an entire sub-application we have no answer to** — four-tab shell, HealthKit category permissions, provider-account linking, medical records, conditions/medications/family-history entry, metric dashboards. Strategy decision, not backlog: implies HIPAA-adjacent handling. **Founder call required.** See §7.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Strategic                |
| N18 | **Our skill recorder captures no screen and no voice, and does not synthesize** — the user must type the skill's name and description or save is blocked (`ActionRecorder.tsx:204-207`). Claude records screen+clicks+typing+voice and lets the model author the skill. No playback timeline, no capture-failure handling. See §7.2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | High                     |
| N19 | **No passkeys / WebAuthn on any surface** — web ships TOTP 2FA with backup codes (`api/settings/2fa/{setup,verify,validate,backup-codes}`) and mobile ships biometric unlock (`expo-local-authentication`), but zero `passkey`/`webauthn` matches anywhere in the repo. Both ChatGPT and Claude support passkeys (benchmark F-IDEN-02, F-ONBD-02). Biometric unlock is a local gate, not an authentication factor — these are not the same thing                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Med                      |
| N20 | **Chrome has no toolbar popup at all** — `manifest.json:45` declares `action` with icons and `default_title` but **no `default_popup`**, and only `side_panel.html`/`options.html` exist. Benchmark F-SHEL-03 (popup quick-actions menu) has nothing to map to                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Med                      |
| N21 | **Chrome slash commands expand but have no menu** — `expandSlashCommand` is real and runs at submit time (`side_panel.ts:3269,3490`), so `TODO`'s EXT-04 ("typing `/` does nothing") is imprecise: the command _engine_ works, the _autocomplete menu_ is what's missing. Fix the menu, not the engine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Low                      |
| N22 | **Object storage is Cloudflare R2, but two sources of truth say Vercel Blob.** `lib/server/object-storage.ts:9,56` uses the AWS S3 SDK against `https://<account>.r2.cloudflarestorage.com` with `R2_ACCOUNT_ID/R2_BUCKET_NAME/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_PUBLIC_BASE_URL`; there is **zero** `@vercel/blob` dependency or code path in the repo. Yet the founder parity matrix (doc 07 V.2 row F) says "✅ Vercel Blob" and migration `0036`'s header comment says "The bytes live in object storage (Vercel Blob)". Misleads anyone reasoning about data residency, egress cost, or vendor lock-in                                                                                                                                                                                                                                                                                     | Med (doc accuracy)       |
| N23 | **Chrome requires Pro or higher — a free demo account sees an upgrade wall, not chat.** `side_panel.ts:5973`: _"AGI in Chrome requires Pro or higher."_ / _"Free chat remains available on Web, Mobile, and Desktop."_ Honest copy, but it means the Chrome segment of a live demo **cannot be recorded on a free account**. Verify the demo account tier before filming                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **Demo-blocking**        |
| N24 | **Five mobile features are built but shipped behind `false` flags** — `lib/v1FeatureFlags.ts`: `iap:false` (:83), `agents:false` (:97), `dispatch:false` (:100), `companion:false` (:108), `messaging:false` (:111). Dispatch and companion-QR-pairing are complete UIs that render `FeatureUnavailable`. `cloudTasks/schedules/connectors/webSearch/research` are `true`. The gap is a flag decision, not missing code — but note `agents:false` sits beside a working cloud-task list, so the two need reconciling                                                                                                                                                                                                                                                                                                                                                                                   | High                     |
| N25 | **Chrome has no enterprise/admin surface at all** — `F-ADMIN-01..04` all MISSING: no `chrome.storage.managed`, no org enablement, no managed allow/blocklist, no admin policy precedence or audit events, no workflow-sharing policy (shortcuts are device-local). Claude in Chrome ships managed deployment. Same class as `N1` on desktop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | High                     |
| N26 | **Chrome cannot download files** — no `downloads` permission and no `chrome.downloads` usage anywhere (`F-ACT-06`). A browser agent that can read, click, type, and screenshot but cannot save a file has a conspicuous hole in the action set                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Med                      |
| N27 | **Chrome has no plan view or plan-approval flow** (`F-PROG-01`, MISSING). The computer-use action log is real, but the agent never shows a plan before acting — the approval model is per-action, not per-plan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Med                      |
| N28 | **MCP client advertises protocol `2024-11-05` — four revisions behind, and a breaking revision lands tomorrow.** `crates/agiworkforce-mcp/src/client.rs:325` hardcodes `"protocolVersion": "2024-11-05"` in the initialize handshake, while `config.rs:46` documents the transport as Streamable HTTP _per the 2025-06-18 spec_ — so we implement a newer transport than we declare, and servers negotiate us down to 2024 features. **Verified live against the spec (not training data):** current stable is **2025-11-25**, and the **2026-07-28** revision finalises **tomorrow** with deliberately non-backward-compatible changes — a stateless protocol carrying `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` as HTTP headers. Our own tests already round-trip `2025-11-25` (`tests/stdio.rs:69`), so the handshake tolerates newer servers; the advertised constant is the stale part | **High, time-sensitive** |

## 4b. Found and fixed in this pass

**Three** live rendering bugs of the **exact DCL-01 class**, plus the coverage
holes that let them ship.

**Bug 3 — shared, so it broke two surfaces at once.**
`packages/ui/unified-chat/src/components/MessageGeneratedFiles.tsx:425` set the
generated-file preview well to `bg-[var(--chat-surface)]`. There is no
`--chat-surface`; the family is `--chat-surface-base/-elevated/-overlay/-hover`.
The same file uses `-elevated` and `-hover` correctly — only this one dropped
its suffix, so the preview body rendered with no background **on both web and
desktop**. Fixed to `--chat-surface-overlay`, matching `ArtifactPanel.tsx:278,
905, 914`, which uses that token in all three of its equivalent
`overflow-auto` preview wells.

**The bugs.** `apps/web/app/byok/WaitlistForm.tsx:134` and
`apps/web/app/docs/byok-env/page.tsx:88` both wrote
`border: '1px solid var(--border)'`. `--border` is declared as a bare HSL
channel triplet (`--border: 214.3 31.8% 91.4%`), valid **only** inside
`hsl(var(--border))`. Used bare it resolves to `1px solid 214.3 31.8% 91.4%` —
an invalid value, so the browser drops the whole declaration and **no border
renders**. Every other site in the repo already used `hsl(var(--border))`
correctly; these two were the only exceptions. Both fixed.

**Why they shipped.** `scripts/check-css-tokens.mjs` — added at `3cf7761f7`
precisely to catch this class — scanned only `apps/desktop/src` and
`apps/web/features`. `apps/web/app`, `apps/web/shared`, and the entire Chrome
extension were unguarded: **115 files using `var(--…)` outside the gate.**

**The guard now covers three surfaces, up from two**, and its reference count
rose from **1,085 to 2,322 (+114%)**:

- `apps/web/features` → **all of `apps/web`**.
- **Chrome added.** Chrome needed three fixes to the guard itself, because
  almost none of its CSS is a stylesheet — the side panel builds its token block
  at runtime from `agiExtensionCssVars` and adopts it via Constructable
  Stylesheets (CSP forbids `<style>`). So the guard learned to (a) read a TS
  token map as a stylesheet, (b) allow the closing quote in `'--x':` keys, and
  (c) bound the value capture to a line — an unbounded `[^;}]+` was greedy
  across newlines in a TS map (entries end in `,`, not `;`), so one match
  swallowed the next several tokens and they read as undeclared.
- It also learned that a React inline style object (`style={{ '--x': v }}`)
  _defines_ a token — how shadcn's sidebar sizes itself and how
  `global-error.tsx` themes the crash page, which replaces the root layout and
  therefore loads no stylesheet at all.

**Verified, not assumed.** Regression-tested per surface by reintroducing a
defect and confirming the gate fails: web bare-HSL ✓, desktop undefined token ✓,
Chrome undefined token ✓; tree restored and all 27 `check:llm-operability`
checks green.

> **Near-miss worth recording.** The first Chrome run reported **863 errors**
> across 24 tokens. All were false — the tokens are generated at runtime by
> `getExtensionTokensCss()`. Reporting them would have been the single largest
> phantom-gap event in this repo's audit history. The tell was the stylesheet's
> own header comment. **A guard extended without reading how the surface loads
> its CSS manufactures gaps faster than it finds them.**

- **`packages/ui` added under BOTH desktop and web.** A shared component must
  resolve against every surface that renders it, and the two load different
  stylesheets — so it is deliberately scanned twice. Reintroducing the
  `--chat-surface` typo now fails **twice**, once per surface, which is the
  correct signal for shared code.

Final coverage: **4,434 references across 3 surfaces, up from 1,085 across 2 —
4×.** `pnpm check:llm-operability` exits 0.

**Still unguarded:** VS Code. Its webview consumes `--vscode-*` (already treated
as externally provided), but its own tokens are unchecked. Next extension of the
gate — and per the Chrome near-miss above, read how that surface loads its CSS
_before_ adding it.

## 4c. Corrections to the founder's own parity matrix (doc 07 Part V)

The matrix states AGI status as of `08f96db`. Cells I verified directly at HEAD
that are **wrong in our favour** — i.e. we already ship what the matrix says we
don't. These matter as much as gaps: they redirect effort away from work that is
already done.

| Matrix cell                              | Says                             | Actually                                                                                                                                                         | Evidence                                                                                     |
| ---------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| V.1 _Personalization & memory_ → Chrome  | `—` (N/A)                        | **BUILT** — full memory CRUD reachable from the side-panel drawer                                                                                                | `side_panel.ts:5417,5539,5566` (`LIST/ADD/UPDATE/DELETE_MEMORY`)                             |
| V.1 _Workspace objects_ → Chrome         | `—`                              | **BUILT** — scheduled-task CRUD reachable from the panel                                                                                                         | `side_panel.ts:6704,7583`; `CREATE/LIST/UPDATE/DELETE_SCHEDULED_TASK`                        |
| V.1 _Agentic execution & tools_ → Chrome | `◐ native-messaging bridge only` | **Understated** — 62 background message types including WebMCP tool discovery/call, tab-group control, cookie access, console logs, and `GET_ACCESSIBILITY_TREE` | `background.ts`; `content.ts:337`                                                            |
| V.2 _F. Files & storage_ → Web           | `✅ Vercel Blob`                 | **Wrong vendor** — Cloudflare R2 via the AWS S3 SDK; no `@vercel/blob` anywhere (see N22)                                                                        | `lib/server/object-storage.ts:9,56`                                                          |
| V.2 _D. Memory platform_ → Web           | `◐ mounted-path unproven`        | **Proven mounted**                                                                                                                                               | `request-processor.ts:1323-1348`, traced `WebChatPage → useChatStream.ts:2003 → completions` |
| V.2 _J. Transport_ → Web                 | `◐ SSE real, no durable resume`  | **Durable resume exists** for agent runs                                                                                                                         | `0062` approval checkpoints + `0063` operation journal                                       |
| V.1 _OS/platform integration_ → Desktop  | `◐ menu bar/hotkey`              | **BUILT** — `tauri-plugin-global-shortcut` registered, `QuickQuery` mounted from `App.tsx`                                                                       | `Cargo.toml:61`, `lib.rs:186,1198`, `App.tsx:118-120`                                        |
| V.1 _Local/on-device_ → Mobile           | `✅ llama.rn/ExecutorTorch`      | **Understated** — also ships on-device Translate **and** OCR as native modules on **both** iOS and Android                                                       | `native/ios/AGITranslate.swift`, `native/android/AGIVisionOCR.kt`                            |

**Net effect:** Chrome is the most _under_-credited surface in the matrix, and
the storage row names a vendor we have never depended on.

## 5. Desktop Local vs. Hermes Agent and OpenClaw

Founder directive: Desktop Local must be **no less than** Hermes Agent
(Nous Research) and OpenClaw. References: `~/Desktop/oss-references/{hermes-agent,openclaw}`.

### Where we already match or lead

| Capability                                          | Us                        | Note                                                                                                 |
| --------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Local vector retrieval                              | ✅ **Lead over OpenClaw** | Full `EmbeddingService` stack: generator, similarity search, cache, incremental indexer              |
| Subagent spawning                                   | ✅                        | `core/swarm/agent_spawner.rs`                                                                        |
| Skill auto-injection with untrusted-content fencing | ✅ **Lead over both**     | Jaccard-ranked, top-2, fenced, incognito-skipped. Neither reference fences skill bodies as untrusted |
| MCP client + `.mcpb` bundles                        | ✅                        | `McpbState`                                                                                          |
| Hardened sandbox                                    | ✅ **Lead**               | macOS Seatbelt with SBPL-injection defenses, fail-closed                                             |
| Computer use                                        | ✅                        | Vision/OCR based                                                                                     |
| Global hotkey + Quick Entry                         | ✅                        | `tauri-plugin-global-shortcut`, `QuickQuery` mounted                                                 |

### Gaps vs. Hermes (learning-first architecture)

| #   | Hermes has                                                                                                                                                                               | We have                                                                                                                                 | Gap                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H1  | **Autonomous skill creation** — after a task, checks triggers (≥5 tool calls, error recovery, user correction, non-obvious workflow) and writes a new skill unprompted                   | Manual `record-skill` panel + `ActionRecorder`, local mode only                                                                         | **The closed learning loop.** Ours requires the user to decide a skill exists; Hermes decides for itself. This is the single biggest architectural gap |
| H2  | **Skill self-improvement** — `skill_manage` tool with `create/patch/edit/delete/write_file/remove_file`, defaulting to `patch` for token efficiency and to avoid breaking working skills | Skills are read-only at runtime                                                                                                         | No skill mutation path at all                                                                                                                          |
| H3  | **agentskills.io open standard** — skills portable across compatible agents                                                                                                              | `SKILL.md` used, but no standard declared or validated                                                                                  | Portability + ecosystem interop                                                                                                                        |
| H4  | **Cross-session recall** — FTS5 session search with LLM summarization                                                                                                                    | Desktop has embeddings but no session-level search-and-summarize loop                                                                   | Recall exists as parts, not as a loop                                                                                                                  |
| H5  | **Agent-curated memory with periodic nudges** — the agent prompts _itself_ to persist knowledge                                                                                          | Memory is user/manual-curated                                                                                                           | Passive vs. active memory                                                                                                                              |
| H6  | **Six execution backends** — local, Docker, SSH, Singularity, Modal, Daytona; the last two hibernate when idle                                                                           | Local only (`core/agi/sandbox.rs:307` mentions Docker in a comment, unimplemented)                                                      | No remote/serverless execution                                                                                                                         |
| H7  | **Cron scheduler with delivery to any platform**                                                                                                                                         | Schedules exist but desktop says "Local mode only" (`DCL-04`) — and cloud schedules are the ones that should run with the laptop closed | Inverted from the value proposition                                                                                                                    |

### Gaps vs. OpenClaw (channel-first architecture)

| #   | OpenClaw has                                                                                                                   | We have                                                                                             | Gap                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------- |
| O1  | **~26 messaging channels** (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, SMS, IRC, Teams, Matrix, …) from one gateway | `messaging_configs` table + config/stats/test routes for 3 platforms, **no sender, no UI** (see N4) | Config theater vs. a real gateway      |
| O2  | **Speak and listen on macOS/iOS/Android**                                                                                      | Turn-based STT/TTS; full-duplex deliberately deferred pending a realtime provider                   | Known and correctly triaged            |
| O3  | **Live Canvas the user controls**                                                                                              | Artifact panel (render + publish), not a live co-controlled canvas                                  | Interaction model gap                  |
| O4  | **Plugin SDK + package contract + ClawHub distribution** (`packages/plugin-sdk`, `plugin-package-contract`, `skills/clawhub`)  | MCP + skills, no plugin package contract or distribution hub                                        | No third-party ecosystem               |
| O5  | **Gateway as separable control plane** — assistant reachable when the laptop is closed                                         | Desktop app _is_ the runtime                                                                        | Availability model gap; overlaps H6/H7 |

### Recommended order for Desktop Local

1. **H1 + H2** — autonomous skill creation and `patch`-based self-improvement.
   This is the differentiator both references are judged on, and we already have
   the skill channel, the fencing, and the recorder to build it from.
2. **H4 + H5** — close the loop: session search over the embeddings we already
   ship, plus self-nudged memory persistence.
3. **H7** — make cloud schedules real; "Local mode only" inverts the pitch.
4. **O1 or N4** — either build one real channel end to end, or delete the
   messaging config surface. Shipping a validator that validates nothing is
   worse than shipping nothing.
5. **H6** — remote/serverless execution backends. Largest, least urgent.

## 6. Contamination register — do NOT build these

The founder's reference corpus presents names from a Claude Code _agent session
harness_ as shipping product surface. Re-confirmed this pass.

| Rejected                                                                                                                            | Verdict                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Hooks `ConfigChange`, `CwdChanged`, `InstructionsLoaded`, `MessageDisplay`, `PostToolUseFailure`, `TaskCompleted`, `TaskCreated`    | **PHANTOM.** Not real Claude Code hooks. Our CLI already has **32 canonical hook events** (`features/hooks/hooks.rs:202-260`). No gap |
| Commands `/goal`, `/scroll-speed`, `/radio`, `/cd`                                                                                  | **PHANTOM.** Real Claude Code uses `/add-dir`, not `/cd`                                                                              |
| Tools `PushNotification`, `RemoteTrigger`, `ScheduleWakeup`, `Monitor`, `Workflow`, `Artifact`, `SendUserFile`, `WaitForMcpServers` | **PHANTOM.** Session-harness tools, not a public registry                                                                             |
| Skills `/deep-research`, `/simplify`, `/dataviz`, `/loop`, `/run`, `/verify`, `/run-skill-generator`                                | **PHANTOM.** Harness skills                                                                                                           |

> **The contamination already changed a build decision.** `/advisor` — a
> corpus-only name — **was actually built** into the TUI (`tui_app.rs:3156`,
> `platform/runtime/advisor.rs`). It works, so it is not a defect, but it proves
> corpus names have crossed from "reference" into shipped code once.
>
> **Benchmark doc 04 (CLI) advertises a "full slash-command parity table and
> full built-in-tool registry parity table" — the exact contaminated content
> class. Do not treat those two tables as a build list.**

## 7. New benchmark captures — analyzed

`~/Desktop/untitled folder 2` (53 captures) covers surfaces that postdate the
2026-07-21 corpus and appear in **no** spec document. All five sets reviewed.

### 7.1 ChatGPT Health (24 captures) — an entire vertical we have no answer to

Not a feature; a **sub-application** with its own four-tab shell —
**Home · Chats · Records · Accounts** — living inside ChatGPT iOS:

- Apple Health permission flow granular by category (blood/body/cardio,
  exercise/heart/vitals, reproductive/sleep/activity, mobility/weight/workouts).
- Provider-account linking via web sign-in; medical **Records** import.
- Structured entry for conditions, medications (with search + autocomplete), and
  family history, each with its own multi-step list UI.
- Dashboards rendering per-metric sparklines (walking speed, exercise time,
  stand time, stair ascent/descent speed, sleep duration) with value + unit +
  date, grouped Activity / Heart / Blood / Body.
- A persistent medical disclaimer above the composer.

**Our status: MISSING entirely.** No health surface, no HealthKit integration
(`GAP-MOB-01` already records zero `HealthKit`-adjacent iOS frameworks). This is
a strategy decision, not a backlog item — it implies HIPAA-adjacent data
handling, a records pipeline, and provider OAuth. **Flag to founder before any
work is scoped.**

### 7.2 Claude Desktop "Record a skill" (9 captures) — closest analogue to our own feature

Claude's flow: composer add-menu → **privacy consent** → active capture →
processing → task progress with outputs/context → **recording playback with an
event timeline**. Consent copy: _"Your screen, clicks, typing, and voice are
recorded, then sent to Claude and turned into a repeatable skill."_

Measured against `apps/desktop/src/features/automation/ActionRecorder.tsx`:

| Capability                          | Claude                                 | Us                                                                                       | Verdict                                                                  |
| ----------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Consent gate before capture         | Warns not to type secrets              | Consent gate **plus** claimed automatic redaction of common secret patterns (`:280-281`) | **We lead**                                                              |
| Produces a real reusable skill      | Yes                                    | Yes — `skillCreateFromRecording` (`:202-216`)                                            | Parity                                                                   |
| Captures clicks + typing            | Yes                                    | Yes (`:177`, `:272`)                                                                     | Parity                                                                   |
| Captures **screen**                 | Yes                                    | **No** — no `getDisplayMedia`/screenshot path                                            | Gap                                                                      |
| Captures **voice narration**        | Yes                                    | **No**                                                                                   | Gap                                                                      |
| Name + description                  | Model-synthesized                      | **User must type both**, and save is blocked until they do (`:204-207`)                  | Gap — ours is a macro recorder with a form; Claude's is a synthesis step |
| Recording playback / event timeline | Yes (captures 07, 08)                  | **No**                                                                                   | Gap                                                                      |
| Capture-failure handling            | Explicit failure response (capture 09) | Error string only (`:177`)                                                               | Gap                                                                      |

This sharpens **H1**: we are not missing skill _recording_, we are missing the
**model-synthesis step** that turns a recording into an authored skill, and the
richer capture channels that make synthesis possible.

### 7.3 Claude Cowork cross-device continuity (iOS + Desktop onboarding)

Verbatim promise: _"Keep Cowork going when you're on the go — start and steer
tasks directly from your phone; check in from your phone, browser, or Claude
desktop app; **your work continues in the background, even when you close the
app**"_, with push delivery of results (_"Your daily brief task"_).

**This is the exact inverse of `DCL-04`**, where our desktop scheduled tasks
read "Local mode only". The competitor's headline continuity claim is precisely
the capability our own UI disclaims. Same root as **H7/O5** — and this capture
is the strongest available evidence that the fix is strategic, not cosmetic.

### 7.4 ChatGPT Work — expanded agent activity · 7.5 ChatGPT iOS voice onboarding

Single captures each; consistent with the already-recorded inline-activity and
voice gaps. No new gap class.

## 8. What this covers, and what it does not

**Covered — every axis named in the request:**

| Axis                                 | Where                                                  |
| ------------------------------------ | ------------------------------------------------------ |
| Frontend UI/UX, components, elements | §3, §4 (N9, N20, N21), §4b (3 fixed rendering bugs)    |
| Screens & views                      | §7 (all 53 new captures), §4 (N12, N17)                |
| Tools & inline tool calling          | §1 B2, §2 (connector permissions, MCP elicitation), §3 |
| Capabilities & features              | §2, §3, §4                                             |
| Teams & enterprise                   | §1 B1, §4 (N8), §3 (audit immutability), §7.1          |
| Sandbox                              | §1 B2, §2 (CLI fail-closed), §5 H6                     |
| Runtime                              | §1 B2/B3, §2 (WebSocket transport), §5                 |
| Shared ecosystem & architecture      | §4c, §5, `GAP-ARC-02/03`                               |
| Design & structure                   | §4b, §4c                                               |
| Backend                              | §1 B1/B4, §3 (run journal), §4 (N4, N22)               |
| OSS-agent parity (Hermes, OpenClaw)  | §5 — 12 gaps                                           |

**Counts:** 4 blocker-grade open · 22 net-new gaps · 12 OSS-agent gaps · 8
corrections to the founder's own matrix · ~20 previously-reported gaps confirmed
CLOSED · ~20 confirmed OVERSTATED · 1 confirmed never real · 4 contamination
classes rejected · **3 live bugs found and fixed**, plus the guard hole that let
them ship.

**Per-block enumeration: 395/395 complete** —
`benchmark-block-inventory-2026-07-27.md`, every row with a file:line.

| Status      | Blocks |
| ----------- | ------ |
| BUILT       | 203    |
| PARTIAL     | 125    |
| MISSING     | 55     |
| UNREACHABLE | 7      |
| N/A         | 3      |
| PHANTOM     | 2      |

**187 blocks are gaps.**

| Spec       | Built % | Character of the gap                                                              |
| ---------- | ------- | --------------------------------------------------------------------------------- |
| 07 Shared  | **36%** | Weakest. Enterprise/identity/metering/notifications — all four blockers live here |
| 04 CLI     | **38%** | Only 9 MISSING but **33 PARTIAL** — broadly capable, narrowly unfinished          |
| 05 Chrome  | 48%     | 8 MISSING cluster in admin/enterprise; no popup, no downloads                     |
| 06 VS Code | 50%     | Cloud offload and checkpoints absent; the rest is thin-client delegation          |
| 02 Web     | 57%     | Mature; gaps are depth (branching, charts, publishing) not absence                |
| 03 Desktop | 58%     | 5 UNREACHABLE — built and unmounted, not missing                                  |
| 01 Mobile  | **68%** | **Strongest surface** — the opposite of how every prior document framed it        |

The 7 UNREACHABLE rows are the cheapest wins: the code is already written.

### Corrections the full enumeration forced on this ledger

Verified directly before accepting:

- **`TODO` DCL-02 ("usage/quota invisible in Cloud") is WRONG.**
  `DesktopCloudSettingsModal.tsx:23-24,61-62` ships `DesktopBillingSection` and
  `DesktopUsageSection` (wrapping `UsageDashboard`), with `getCloudUsage`,
  `openBillingPortal`, `PlansModal`, and a `CapModal` top-up. Remove the item.
- **"CLI ships zero bundled skills" is WRONG** — a claim this ledger inherited
  and repeated. `apps/cli/src/init.rs:258-268` writes five built-in `SKILL.md`
  files with YAML frontmatter (`code-review`, `refactor`, `test-writer`,
  `explain`, +1) to `~/.agiworkforce/skills/.system` on first run. The real gap
  is narrower: they are flat prompt files, not folder/resource skill packages.
- **Desktop search is not missing** — `SearchModal` is live at `App.tsx:108`
  with `search_past_conversations`. `useGlobalSearch` is an _orphaned duplicate_,
  which is a dead-code problem, not a missing-feature one. My earlier
  `GAP-DSK-06` framing overstated it.
- **Desktop is materially better than the orphan count implied.** Notifications,
  Billing/Usage, Developer settings, Quick-Entry screenshot capture, MCP
  keychain, and `.mcpb` install are all BUILT and mounted. Inferring status from
  the 444-orphan figure rather than checking each panel produced too pessimistic
  a picture — the orphans are concentrated in Code/terminal/governance/team.
- **CLI `/upgrade` and `/release-notes` render static text** (`render_upgrade()`,
  `claude_parity.rs:596`) — there is no updater at all. F-INST-02 MISSING.
- **Web artifact publishing is a waitlist stub for every input**
  (`lib/artifact-publisher.ts:83`, no DB write) — worse than the PARTIAL this
  ledger previously carried.

**What remains genuinely unresolvable from source:** live signed-in round-trips
(Desktop Cloud persist, Chrome Web Store behaviour, VS Code production sign-in);
cross-surface run replay, asserted by `0061-0063` but not exercised end to end;
and ChatGPT Health (N17), which is a strategy question rather than an estimate.

## 9. Verification

Baseline before acting on any row: `pnpm typecheck:all`, `pnpm lint`,
`pnpm check:llm-operability`, `cargo test --workspace --lib`, 10,272 tests.

Per `CLAUDE.md` this is a **triage queue, not remediation** — open the cited file
and confirm before fixing. That rule earned its keep: nine of fourteen ranked
blockers were already closed and one was never real.
