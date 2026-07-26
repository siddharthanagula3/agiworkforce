# Mobile Cloud Mode vs ChatGPT Mobile — Parity Audit

## Addendum — status refreshed 2026-07-26

Two code-grounded re-audits (UX taxonomy + runtime/tools; dead code counted as MISSING). Supersedes the 2026-06-23 findings where marked.

**Fixed since 2026-06-23 (verified in code):** project-detail mislabel
(`cloudProjectStore`), live pinned drawer section, sign-out
settings/entitlement/connector cache isolation, first-render Clerk identity,
canonical effective tier + server capability handshake
(`GET /api/me?surface=mobile`), personalization headers/lists + emoji +
base-style sync, dedicated voice-mode button, empty-chat task chips,
invite/`ALPHATESTER` removal (public alpha), E2B generated-file
render/download, durable authenticated image generation + transcript/library/
artifact projection, canonical Cloud artifact overlay/tombstones, Pro+ image
gating, concise response default, ambient Web Search, Cloud-only scheduled-task
models, truthful daily-or-slower scheduling UI, and a durable active-Task list
with foreground polling. Native IAP client/server verification exists, but
purchase UI remains disabled until real App Store Connect and Play Console
products are provisioned.

**Strongest areas:** transport/runtime (send→SSE→persist→4-surface delta-sync with LWW+tombstones, real token streaming, per-conversation cancellation), tool-call UX (`toolCallAccumulator` + `ToolCallTimeline`: web-search cards, code-exec output, MCP steps), security/storage (fail-closed egress gate, SQLCipher, encrypted MMKV, Keychain), conversation rendering (citations, tables, thinking + search blocks), settings breadth (~20 real sub-screens), turn-based voice (STT→LLM→TTS with interrupt/PTT/waveform).

**Top gaps for ChatGPT/Claude-class cloud behavior (evidence in the two 2026-07-09 audit transcripts):**

1. Push notification DELIVERY — tokens registered, no server sender exists (`apps/web/lib/services/notification-service.ts:23-46` writes a DB row only).
2. Context-window management — untruncated history sent (`chatExecutionStore.ts:432`); `ContextWarningChip` dead-wired (0 importers).
3. Non-image attachments not model-readable — PDF/DOCX/CSV/TXT reach the model as a text stub (`chatExecutionStore.ts:836-841`); no video/xlsx/pptx/zip.
4. Rich artifact rendering — generated images and Cloud overlays are durable,
   but there are still no PDF/video/audio viewers and chart/document rendering
   remains format-dependent.
5. Realtime/duplex voice — absent (only WebRTC is the off-flag companion channel, `connectionStore.ts:6,570`).
6. Memory enable/disable toggle — state does not exist repo-wide.
7. Chat-header parity — context indicator, memory badge, cloud project badge remain incomplete.
8. Team/Enterprise administration — Mobile shows the real Clerk identity and
   effective subscription, then hands workspace admins to the authenticated Web
   control plane; native organization/member/device administration is not
   implemented.
9. Scheduled-work capacity — Mobile now exposes only daily-or-slower cadence
   and labels times as preferences, but `/api/cron/run-schedules` still runs
   once daily and claims at most 10 runs platform-wide.
10. Infra — no version-check/force-update or server remote config;
    observability remains incomplete. The connector directory consumes
    server-owned connection/availability state, supports deployment-mapped
    providers, GitHub App installation, and custom remote MCP; unavailable rows
    remain disabled.

**Load-bearing risks:** native purchase UI is intentionally off until real App Store Connect/Play Console products are provisioned and verified; TLS pinning still needs operator-provisioned hashes before release (known F06); local-mode zero-egress holds except an asset-only KaTeX CDN fetch (review).

> Generated 2026-06-23. Depth-first, code-grounded audit of `apps/mobile` **cloud mode** vs ChatGPT mobile.
> Reference = 10 founder-provided ChatGPT mobile screenshots (S1–S10) only; anything not screenshot-backed is marked uncertain, not a gap.
> Method: 6 shared-state surfaces deeply analyzed, each adversarially re-verified (every cited `file:line` re-opened), divergences triaged, then synthesized. 14 agents.
> Scope: Mobile trust model = Local + Cloud (no BYOK); managed Cloud is public
> alpha for signed-in users, while heavy-compute capabilities remain
> plan/model/deployment gated.

## Bottom line

Cloud mode works end-to-end for signed-in public-alpha users. A message sent with `appMode=cloud` creates a server-side conversation, streams a real SSE reply from the managed gateway with bridged Clerk auth, and persists via the shared-state delta-sync engine. Mobile caches the server capability handshake only for responsiveness; send-time authorization remains server-owned, and sign-out clears account-scoped tier/capability/connector state. The remaining adoption gap is native organization administration: Team/Enterprise users receive an explicit Web control-plane handoff rather than non-functional Mobile controls.

## Cloud-mode functional status

| Shared-state surface       | Status  | Evidence                                                                                                                                                                                     |
| -------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud send                 | wired   | `chatExecutionStore.ts:467-499` resolves cloud branch; `streaming.ts:177-186` POSTs `/api/llm/v1/chat/completions` with Clerk bearer + SSE                                                   |
| Sync engine                | wired   | `cloudSyncEngine.ts:177-281` (chat), `:321-400` (memory), `:447-535` (projects), `:578-643` (settings); started `_layout.tsx:182`, fires after each turn `chatExecutionStore.ts:1004`        |
| Chat UX (composer/actions) | wired   | Send/stop isolation, scoped Cloud model picker, copy/edit/retry, task chips, ambient search, concise default, and plan/model gates are wired.                                                |
| Memory                     | partial | Cloud CRUD wired (`src/features/memory/store.ts:103-227`); no enable toggle, no summary, import/pin write to local SQLite in cloud mode                                                      |
| Personalization            | wired   | Profile/custom instructions, base style, warmth, enthusiasm, headers/lists, and emoji project through Cloud settings sync.                                                                   |
| Projects                   | wired   | Sync + list + create + composer attach + Cloud-owned detail/tombstones are wired.                                                                                                            |
| Images/artifacts           | partial | Durable owner-scoped images survive reload, sync into Library/Artifacts, authenticate every fetch/share, and merge Cloud tombstones; rich non-image viewers remain incomplete.               |
| Tasks/schedules            | partial | Durable active runs poll in foreground and deep-link to their conversation; schedules are plan-gated and daily-or-slower, but deployment remains once-daily/10-run capacity.                 |
| Settings/account           | partial | Clerk identity and canonical plan/capability handshake are wired; billing/usage are read-only unless native store products are provisioned; Team/Enterprise administration hands off to Web. |
| Cloud-bridge handoff       | stubbed | WebRTC/HMAC engine real but `connectionStore.ts:191-193` no-ops (dispatch+companion off); `desktopStatusStore`/`crossDeviceStore` zero importers                                             |

## Prioritized parity gaps

### P0 — cloud mode broken / blocker

None. The core send→stream→persist→sync loop is real and functional when entitled. No verified P0 remains.

### P1 — core screenshot-backed capability missing/broken

No open screenshot-backed P1 remains from the original sample. Runtime,
capacity, native billing provisioning, attachment parsing, and organization
administration risks remain below.

### P2 — partial / polish

**Memory enable toggle missing (S8).** `memory.tsx` has only search/filter/list/FAB; grep for `memoryEnabled`/`enableMemory` returns zero. Matrix line 131 lists "disable" as in-scope. _Fix:_ add a cloud-safe `memoryEnabled` flag in `settingsStore` + `cloudSettingsMapping`, gate retrieval/consolidation on it. (matrix_drift)

**Long answers remain an explicit response-style choice, not a toggle.**
Concise is the default and detailed output remains selectable. This replaces the
old “fast answers absent” finding; it is a product choice, not missing wiring.

**More-about-you field missing (S8) / memory summary missing (S8).** No `moreAboutYou` field anywhere (custom instructions partially overlaps); no memory-summary row. Both low — the raw memories list and custom-instructions cover the core need.

**Native subscription activation is not demoable yet.** Billing/account screens,
model locks, proactive settings entry, and paywall routing are wired, but native
purchase/restore stays hidden until real store products exist.

**Title-only chat search (S9).** `DrawerContent` `SearchBox` filters titles only, not message content. Adequate for S9's basic search; extend to bodies/global for full parity.

**Streaming granularity unverified (engineering caveat, not a screenshot gap).** Genuine internal contradiction: `streaming.ts:217-224` falls back to `response.text()` (whole-reply) assuming RN exposes no `response.body`, while `providerStreamClient.ts:1-11` asserts `getReader()` is available on current Expo; `USE_PROVIDER_STREAM` defaults OFF. Only one is true on RN 0.83.6. _Fix:_ verify at runtime; if no streaming body, wire `expo/fetch` for the completions path or default the provider-stream flag on for cloud. (ChatGPT streaming granularity not in any screenshot — low parity severity.)

## Matrix drift

`docs/current/parity-implementation-matrix.md` is stale vs code on:

- **Create project (cloud):** matrix says Partial; cloud create + delta-sync is fully wired (`store.ts:59-84`, `cloudSyncEngine.ts:481-535`). Only color/icon/privacy sub-fields missing.
- **Cloud sync of projects:** matrix's blanket Partial understates a genuine delta-sync with independent cursor, LWW, and tombstones. Record that mobile project create/edit/delete/tombstone sync is wired.
- **Project sources:** project detail is fixed, but source files remain
  metadata-only and are not parsed/chunked/embedded.
- **Enable-memory toggle:** matrix line 131 lists "disable" as in-scope but there is no implementation.
- **Import memory:** matrix says Missing, but a local implementation exists and the cloud path is silently broken (writes to wrong store), not absent.
- **Branch/fork:** still absent from Mobile. Pinned is now live in the drawer.
- **Account/entitlement:** resolved 2026-07-26; Mobile reads canonical plan/status
  plus the server capability handshake and clears account-scoped caches at sign-out.
- **Cloud-bridge handoff:** matrix Partial; flag-dark and orphaned (no reachable pairing UI, `desktopStatusStore`/`crossDeviceStore` have zero importers).

## Intentional divergences (NOT gaps)

- **BYOK on mobile** — mobile trust mode is Local + Cloud only by design.
- **Heavy local generation (image/video/PDF/PPTX)** — Mobile Local remains a
  lightweight boundary; Cloud image generation is independently available to
  eligible plans.
- **Server entitlement / deployment fail-closed gating** — by design; the
  capability handshake never grants a feature by client flag alone.
- **ChatGPT Go/Plus tier names, prices, "may include ads" note** — AGI uses Pro/Max/India-Cheapest; only paywall _structure_ is in-scope.
- **Ads / Parental / Trusted-contact controls (S1)** — outside the Local+Cloud trust model and product scope.
- **Codex device-host strings and ChatGPT-branded IA verbatim (S4)** — AGI owns its design system; the handoff _capability_ stays in-scope.
- **Cross-device thread store / companion channel** — `dispatch`/`companion` intentionally off in v1; `crossDeviceStore` is a transport-less skeleton awaiting the companion channel.
- **Artifacts pull-only on mobile** — by design; mobile is a puller, not an author.

## Resolved since this snapshot

1. Cloud project detail now reads `cloudProjectStore` and no longer exposes a
   Local label/raw UUID for a synced Cloud project.
2. Empty-chat task chips are rendered and prefill the composer.
3. Cloud personalization projection and sign-out isolation now clear the
   settings cursor/store along with tier, capability, artifact, memory, project,
   and connector state.
4. Generated images now persist only through owner-scoped `/api/files/{uuid}`
   paths, reload with auth, project into Library/Artifacts, and share through a
   temporary local file; ephemeral provider/base64 images are session-only.
5. The Cloud artifact overlay now uses the canonical merge/tombstone rules.
6. Tasks are an explicitly Active collection with cursor pagination and
   foreground polling; approval/cancel resumes deep-link to the owning chat.
7. Scheduled-task creation is plan-aware, Cloud-model-only, and limited to
   daily-or-slower recurrence with timezone/DST-safe one-time instants.

---

## Appendix — sign-out cross-account isolation (resolved 2026-07-26)

Sign-out now resets the settings sync cursor and Cloud personalization store,
alongside chat, memory, projects, artifacts, subscription/capability state,
connector state, and the registered push token. Local settings remain
device-scoped by design.
