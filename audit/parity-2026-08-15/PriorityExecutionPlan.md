# Priority Execution Plan

**Audit date:** 2026-08-15 · **Commit:** `e15df56e3` (`compliance/dpdp`), working tree clean
**Depends on:** `GapMatrix.md` (168 gaps: 3 P0 / 45 P1 / 85 P2 / 35 P3), all 16 `gaps/domain-*.md`
narratives, `gaps/done-claim-verification.md`, `prior-art-reconciliation.md`, the 9 inventory
docs, `docs/current/source-of-truth.md`, and `audit/ui-gaps.csv`.

This is the last document in the audit. It does not add new findings — it sequences the 168
already-filed gaps (plus a small number of prior-art corrections that never got a new gap ID)
into phases a team can actually execute, in an order that respects dependencies, the founder's
standing sequencing rule, and the founder's one dated exception to it. **No code changes were
made while producing this plan.**

---

## 1. How to read this plan

- **Ordering is by dependency first, severity second.** A P2 that unblocks five P1s is scheduled
  before an unrelated P1. Every phase states what it depends on and what it unblocks.
- **Effort (S/M/L) is a rough shape, not a story-point estimate:** S = under a day for one
  engineer (a config line, a test-mock fix, a copy change); M = a few days (a new UI panel wired
  to an existing backend, a scoped extraction); L = a real build (new backend contract, a
  multi-file port, a security-sensitive subsystem).
- **Every phase ends in a verification step that observes real behavior** — a request in flight,
  a rendered screen, a re-run test suite — never "typecheck passes." Per `docs/current/
source-of-truth.md`'s Verification Rule, build success is not evidence.
- **Gap IDs are cited exactly as filed in `GapMatrix.md`.** Where two domain analysts
  independently filed the same underlying finding under two IDs (a real pattern this synthesis
  pass found — see §2.3), both IDs are listed and the duplication is called out once, not
  re-explained every time it recurs.
- Counts: 168 filed gaps compress to **~158 distinct engineering work items** once 10 confirmed
  duplicate filings are merged (§2.3). All 168 IDs are placed exactly once below; none are
  dropped.

---

## 2. Reconciling with the repo's own sequencing rules

### 2.1 The standing rule

`docs/current/source-of-truth.md` (founder decision, 2026-08-05) locks development as **serial by
surface, shortest-remaining-work-first, one surface active at a time.** A later surface does not
start until the founder advances the sequence. The routing substrate (registry pricing/billing,
ExecutionPlan/CPST, the rules-based router) completes before surface closure begins at all.

### 2.2 The one dated exception, and how Phases 1–3 map onto it exactly

The founder authorized a cross-surface exception on **2026-08-09**: first image/video generation
end-to-end on **Web, Mobile, and both Desktop shells**; then the tool loop, artifact rendering,
and web search on **Web/Mobile/Desktop**; then skills, plugins, and connectors on **Web, Mobile,
Desktop, CLI, and VS Code**. Phases 1–3 below are that exception, gap-mapped, in that order, with
one visible gap in the source list: **Chrome is not named in any of the three legs.** This plan
therefore does not fold any Chrome-extension gap into Phases 1–3, even where a Chrome gap (e.g.
`EXTENSIBILITY-007`, `SEARCH-RESEARCH-005`) is topically identical to work happening on another
surface in that phase — Chrome's turn comes in its own surface-closure phase (Phase 9).

### 2.3 A finding this synthesis pass made: 10 gaps are filed twice

Cross-reading all 16 domain files surfaced ten pairs where two domain analysts, working
independently, filed the same underlying defect under two different IDs. None of these are
wrong — each analyst verified their claim against code independently, which is exactly the
adversarial-redundancy the audit brief wants — but treating both as separate work items would
double-book effort. Both IDs are retained below (so nothing is dropped from `GapMatrix.md`'s
index) but each pair is executed once:

| Pair                                        | Same underlying fix                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `DEAD-CODE-005` / `BACKEND-RUNTIME-005`     | Schedule `expire-organization-invitations` in `vercel.json`                        |
| `SHELL-NAV-IA-001` / `AGENTIC-WORK-002`     | Add `/tasks(.*)` to `apps/web/proxy.ts`'s `isProtectedAppRoute`                    |
| `DEAD-CODE-010` / `BACKEND-RUNTIME-008`     | Delete 3 zero-caller `usage/*` alias routes                                        |
| `DEAD-CODE-006` / `BACKEND-RUNTIME-013`     | One tracked-debt line for 11 dead/erasure-only tables + the gated `0058` migration |
| `CROSS-SURFACE-005` / `DEAD-CODE-020`       | Fix `serialiseClaim`'s flat-key-allowlist bug in `article50-marker.ts:138`         |
| `EXTENSIBILITY-001` / `SHELL-NAV-IA-003`    | Restore Mobile's Skills row in `DrawerContent.tsx`                                 |
| `EXTENSIBILITY-002` / `SHELL-NAV-IA-002`    | Rename Desktop's "Connections" tab, split "Connectors"                             |
| `SHELL-NAV-IA-004` / `CROSS-SURFACE-007`    | Fix `QRPairingCard.tsx`'s copy to say "Remote"                                     |
| `BACKEND-RUNTIME-002` / `CROSS-SURFACE-008` | Founder call: retire or keep `services/api-gateway`'s REST duplication             |
| `BACKEND-RUNTIME-007` / `CROSS-SURFACE-009` | Founder call: confirm-as-intentional or delete the licensing dual-implementation   |

### 2.4 Where this plan recommends a deviation, and why

Two places in this plan pull work forward ahead of strict one-surface-at-a-time, beyond the
founder's own exception. Both are flagged, not silently assumed:

1. **Phase 4 (shared architecture unlock)** touches Web, Desktop, Mobile, and Chrome composer/
   rendering code in the same phase. Justification: none of the four `COMPOSER-001`/
   `RENDERING-001`/`CROSS-SURFACE-001` findings ask for a rewrite — every one of their own
   recommendations says "extract the smallest shared module, do not big-bang." That makes this
   phase closer in kind to the routing-substrate carve-out (infrastructure that precedes surface
   closure) than to a second surface going active. It is scheduled here because `COMPOSER-002`
   (large-paste-to-attachment) and the markdown/response-action gaps in Desktop, Mobile, and
   Chrome's own surface-closure phases (Phase 10, Phase 12, Phase 11 later) are each roughly **half the size**
   if this phase ships first — the dependency, not the severity, is why it moves up.
2. **Phase 1.5 (`AGENTIC-WORK-001`)** is a P0 — the highest severity in the whole matrix — but it
   is Desktop background-agent control-surface wiring, not image/video generation, tool loop,
   artifacts, web search, or skills/plugins/connectors. It is not covered by the 2026-08-09
   exception's literal text. This plan does not unilaterally decide it is in scope; it recommends
   the founder either (a) grant a second, narrow exception for it given its severity, since the
   backend agent runtime, 9 native events, and 11 Tauri commands it needs already exist and the
   only missing piece is a frontend control panel, or (b) accept that it waits for Desktop's own
   surface-closure phase (Phase 11). Section 4 below states this explicitly rather than picking for the
   founder.

### 2.5 Ranking the surface-closure phases (Phase 6–Phase 12): a proxy, not a re-estimate

This audit did not run a formal remaining-Class-1-work estimate per surface — that is the
founder's existing mechanism, not this document's job. What follows is a transparent proxy from
this audit's own gap counts, used only to order Phase 6–Phase 12 and stated as a proxy so it can be
overridden by the founder's own estimate without contradicting this plan:

| Surface            | Gaps in `GapMatrix.md` | P0/P1 |              Post-Phase-0/1/2/3 remainder | Proxy rank |
| ------------------ | ---------------------: | ----: | ----------------------------------------: | :--------: |
| VS Code extension  |                      2 |   2/0 |          **0** (both resolved in Phase 0) |    1st     |
| Desktop (Electron) |                      3 |   0/0 | 3, all P2, mostly DOCUMENT-AS-INTENTIONAL |    2nd     |
| CLI                |                      3 |   0/1 |                                         3 |    3rd     |
| Chrome extension   |                      8 |   0/2 |                                         8 |    4th     |
| Mobile             |                     14 |   1/3 |                9 (1 P0 closes in Phase 1) |    5th     |
| Desktop (Tauri)    |                     31 |  2/10 |            20 (2 P0 close in Phase 1/1.5) |    6th     |
| Web                |                     45 |   0/8 |      29 (several P1s close in Phases 1–4) |    7th     |

Backend (22 gaps) and Cross-surface/Shared-packages (29 + 11 gaps) are **not** one of the six
first-class surfaces under `source-of-truth.md`'s own definition, so the one-surface-at-a-time
rule does not constrain them; they are sequenced by dependency instead (Phase 5, Phase 13) and can run in
parallel with whichever surface is active.

---

## 3. What's already strong (do not regress these while executing this plan)

A prioritization document that only lists deficits misleads resourcing. Four things this audit
verified as genuinely strong, cited so they stay protected rather than accidentally touched during
the consolidation work in Phase 4 and the dead-code deletions throughout:

- **Chrome extension trust boundary.** `conversation-history.ts:1465-1468` is a code-enforced,
  fail-closed Managed-Cloud provenance gate — a conversation only mirrors to the shared account
  store if every turn in it carries Managed Cloud provenance, verified at runtime, not by
  convention. 1,549/1,549 tests pass, zero `TODO`/`FIXME` in `src/`. (`prior-art-reconciliation.md`)
- **Web's chat-completions runtime.** The managed Web chat API routes through
  `@agiworkforce/routing`'s `web/cloud-chat` runtime profile before quota reservation or provider
  dispatch, fails closed on unknown models, and correctly separates media-harness requests from
  the generic text adapter (`docs/current/source-of-truth.md`, Web section).
- **Desktop's Local/BYOK/Managed-Cloud trust boundary at the Rust layer.** Every conversation
  persists an immutable `execution_mode`; provider admission rejects providers outside that
  conversation's boundary; Local-to-BYOK creates a new fork rather than flipping a flag in place.
- **Desktop's `wiring-allowlist.json` self-governance** (`DEAD-CODE-023`) and the Tauri IPC
  command registry's near-zero registration drift — both fail CI on regrowth and are the kind of
  structural discipline the rest of this plan's dead-code phases are trying to extend elsewhere.
- **Mobile's honest feature-flag gating** — every gated capability (`agents`, `computerUse`,
  `crossDeviceSync`) renders a real `<FeatureUnavailable/>`, never a blank screen or a fake success
  state (`DeadAndDisconnectedCode.md` §12).

---

## 4. Phase 0 — Truth-restoring (do this first; cheap; makes everything downstream measurable)

**Goal.** Fix the audit's own measurement instruments and close self-contained correctness/
compliance holes before spending effort on anything the ledger might be lying about.

**Effort.** S per item; ~24 items, executable in parallel by several engineers in under a week.

**Dependencies.** None — this is why it is Phase 0.

### 4.1 Prior-art ledger corrections (not new `GapMatrix.md` IDs — corrections to `audit/ui-gaps.csv`, sourced from `gaps/done-claim-verification.md`)

| Action                                                                                                                           | Why it matters                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fix `DesktopShellV3.test.tsx`'s stale `useChatModelStore` mock (missing `getSelectedModel`) — **GAP-064**                        | 29 of 29 tests in this file currently fail at render (`TypeError: state.getSelectedModel is not a function`). It is cited as evidence by other rows; until fixed, nothing that cites it is trustworthy. Test-only change, production code is fine.                                                                                                                                         |
| Retire **GAP-051** and **GAP-205** (QuickChips) in `ui-gaps.csv` from `Done` to `Superseded`                                     | The feature was deliberately deleted repo-wide by a 2026-08-06 founder decision (commit `2a37d81da`). Leaving them `Done` tells a future reader to look for a component that no longer exists.                                                                                                                                                                                             |
| Re-open **GAP-014** (mobile restore-purchases outcomes) from `Done` to `Open`, and flag it explicitly as **fabricated evidence** | The cited files (`useIapPurchaseFlow.ts`, `use-iap-purchase-flow.test.tsx`) do not exist anywhere in the repo. This is the most serious class of finding in the verification pass — a `Done` row whose evidence prose describes work that was never written. Any other `Open` row in the 197-row backlog inherits this risk and should be spot-checked before being trusted at face value. |

### 4.2 CI/test-instrument fixes

| Gap ID(s)             | Fix                                                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DESIGN-SYSTEM-001`   | Add `color-mix(` to the VS Code theme-token guard's allow-list — the guard currently fails on its own correctly-tokenized code, blocking every future `v-vscode-*` release.                                                                                               |
| `CROSS-SURFACE-006`   | Stub `.inspect()` in `chatParticipant.test.ts` and `usageMeterTrustBoundary.test.ts`'s config mocks — 17 VS Code tests are red because the mock wasn't updated when `Config.model()` moved to `.inspect()` for a real security fix.                                       |
| `DESIGN-SYSTEM-004`   | Wire `check:no-hex-web` into web CI; fix its 4 current violations (`brand-assets.test.ts`, `manifest.ts`).                                                                                                                                                                |
| `DESIGN-SYSTEM-005`   | Wire `check:no-hex-mobile` into mobile CI (currently passes clean; just needs to be gated).                                                                                                                                                                               |
| `BACKEND-RUNTIME-011` | Add `cargo test --workspace` (no `--lib` restriction) to at least the primary Linux CI runner; the "100+ crates" comment excusing the narrower scope is stale — the workspace was pruned to 12 crates on 2026-07-08.                                                      |
| `SETTINGS-010`        | Add a CI check that fails when a `features/settings/{sections,tabs}` component exists but is not referenced by its nav map — this is the mechanical fix that would have caught 6 of the settings-panel-without-nav-entry instances this audit found, before they shipped. |

### 4.3 One-line / self-contained fixes with outsized signal

| Gap ID(s)                                | Fix                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHELL-NAV-IA-001` + `AGENTIC-WORK-002`  | Add `/tasks(.*)` to `apps/web/proxy.ts`'s `isProtectedAppRoute` — an unauthenticated visitor to `/tasks` currently sees the full signed-in chrome stuck on "Loading account…" instead of a login redirect.                                                                                                                                     |
| `SETTINGS-001`                           | Change `WebSidebar.tsx`'s `handleNavClick` so the Settings gear calls the real `openSettings('general')` instead of routing to a dead `voice-settings` view — clicking Settings currently does nothing useful.                                                                                                                                 |
| `DEAD-CODE-005` + `BACKEND-RUNTIME-005`  | Add `expire-organization-invitations` to `vercel.json`'s cron list — without it, a lapsed team invitation holds a paid seat forever.                                                                                                                                                                                                           |
| `DEAD-CODE-010` + `BACKEND-RUNTIME-008`  | Delete `usage/analytics`, `usage/history`, `usage/providers` (confirmed zero callers repo-wide); keep `billing/analytics` (Desktop still calls it).                                                                                                                                                                                            |
| `DEAD-CODE-001`                          | Delete the 8 orphaned `teams/` files and correct the `known-flaws.md` entry that (wrongly, as of 2 days after it was written) still calls them load-bearing.                                                                                                                                                                                   |
| `BACKEND-RUNTIME-003`                    | Delete the dead `integrations::sync::CloudSyncClient`/`SyncManager` in Desktop's Rust tree — it targets a `/api/sync` route that does not exist; the real sync client is `data/cloud_sync.rs`.                                                                                                                                                 |
| `SHELL-NAV-IA-004` + `CROSS-SURFACE-007` | Fix `QRPairingCard.tsx`'s instruction text to say "Remote" (Mobile's real drawer label), not the nonexistent "Desktop Companion."                                                                                                                                                                                                              |
| `COMPOSER-007`                           | Fix the Chrome extension send button's tooltip — it advertises `Cmd+Enter`, which does nothing; the real binding is plain Enter.                                                                                                                                                                                                               |
| `DEAD-CODE-017`                          | Delete Mobile's superseded pre-drawer sidebar (7 files + barrel) — already independently tracked, zero risk.                                                                                                                                                                                                                                   |
| `DEAD-CODE-011`                          | Replace the literal `~/Desktop/reference/...` path string in `inline-toolcall-demo/page.tsx` with a placeholder — the dev-only kill-switch itself (env guard + gitignore + robots disallow) is sound and does **not** need touching.                                                                                                           |
| `SHELL-NAV-IA-007`                       | Add a `metadata` export with a distinct title to `/skills`, `/connectors`, `/apps`, `/device-auth`, `/user` — 5 one-line changes, zero behavioral risk.                                                                                                                                                                                        |
| `MEMORY-010`                             | Add the missing `isTemporary` guard to `WebChatRuntime.ts`'s memory injection (or delete the unreachable `UnifiedChatPage`/`WebChatRuntime` pair entirely) — this is currently dead code, but it is dead code with a live privacy-boundary bug, worth closing given the `compliance/dpdp` branch context even though nothing reaches it today. |
| `DESIGN-SYSTEM-009` (partial)            | Mount the already-built `<SkipLink>` into `apps/web/app/layout.tsx` (WCAG 2.4.1 Bypass Blocks) — leave the rest of this gap (delete-or-wire `AccessibilityAudit.tsx`'s mocked panel) for Phase 12.                                                                                                                                             |
| `CROSS-SURFACE-013` (partial)            | Remove the stale `@agiworkforce/browser-tool` dependency line from `apps/extension/package.json` — confirmed dead by `knip`.                                                                                                                                                                                                                   |

### 4.4 Compliance correctness (elevated given the `compliance/dpdp` branch)

| Gap ID(s)                             | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CROSS-SURFACE-005` + `DEAD-CODE-020` | Fix `serialiseClaim` in `packages/contracts/compliance/src/article50-marker.ts:138` — `JSON.stringify(claim, Object.keys(claim).sort())` applies a flat key allowlist at every nesting depth, so nested `assertions[].label`/`.action` fields are silently stripped. Mobile's real emitted Article 50 provenance sidecar serializes `assertions` as `[{}]`, and Web's own validator would reject Mobile's own output if the two were ever compared, despite both files claiming wire-compatibility. This is a regulatory-correctness bug on the branch whose entire purpose is compliance. |
| `VOICE-MEDIA-006`                     | Fix Mobile's Article 50 legal screen (`article-50.tsx:66-72`) to name only image and video — it currently claims text and audio are also marked, and neither is (there is no audio-generation feature at all, and streamed chat text is explicitly unmarked in the implementing module's own doc comment).                                                                                                                                                                                                                                                                                 |

### 4.5 The deploy-ordering risk (`inventory/prod-vs-source-drift.md`) — needs a human with production access, see §18

`inventory/deployment-state.md` and `prod-vs-source-drift.md` independently converge on the same
fact from two angles: **the promotion of HEAD (`e15df56e3`) to the team-scoped production alias is
currently `ERROR`** (5 of the last 20 deployments are `ERROR`, including 3 of the last 6
production-targeted ones), and production is serving `4bfc99dc1` — roughly four days and ~10
billing/pricing fixes behind HEAD. Five routes that exist and 200 locally (`/privacy/requests`,
`/privacy/india`, `/data-use`, `/invite`, `/login/complete`) 404 on `agiworkforce.com` as a direct
consequence. This is not cosmetic: `TeamSection.tsx:94` constructs invitation URLs at `/invite`
from `window.location.origin` — if the `compliance/dpdp` branch lands partially, every team
invitation issued in that window resolves to a 404 for its recipient, and the links are already in
inboxes before anyone notices. **Action for Phase 0:** add a deploy-verification gate that asserts,
against the deployed origin, that every route referenced by `sitemap.ts` and every `new URL(...)`
link constructor returns 200 — not merely that the build succeeded. This is a script/CI change,
separate from the actual promotion fix, which is a production-access item (§18).

### 4.6 Verification for Phase 0

Run each fixed test suite and observe green output (`pnpm --filter @agiworkforce/desktop test
DesktopShellV3.test.tsx` → 29/29 pass; `npx vitest run` in `apps/extension-vscode` → 0 failures).
Hit `/tasks` unauthenticated in a local build and observe a redirect to `/login?redirectTo=/tasks`,
not the signed-in shell. Click the Settings gear in the collapsed Web sidebar and observe the real
Settings modal, not a blank voice page. Re-run the deploy-verification gate against a staging
promotion and observe all `sitemap.ts`/link-constructed routes return 200.

---

## 5. Phase 1 — Founder-authorized: image and video generation end-to-end (Web, Mobile, both Desktop shells)

**Goal.** Close the founder's named top release-risk item and both P0s that fall under it.

**Surfaces.** Web and Electron are effectively done already (Web's media routes are confirmed
`COMPLETE, not UI-only`; Electron loads the hosted Web app by default, so it inherits Web's fix for
free once Web ships). The real remaining work is **Desktop (Tauri)** and **Mobile**.

**Gap IDs.** `VOICE-MEDIA-001` (P0, Desktop), `VOICE-MEDIA-002` (P0, Mobile), `COMPOSER-004` (P1,
Desktop), `VOICE-MEDIA-003` (P1, Backend), `VOICE-MEDIA-008` (P2, cross-surface), `VOICE-MEDIA-010`
(P2, shared packages).

**Effort.** L.

**Dependencies.** None blocking. Independent of Phases 0/2/3.

| Gap               | What actually has to happen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VOICE-MEDIA-001` | Add an image-generation entry point to `packages/ui/unified-chat`'s composer (the package Desktop actually mounts — `CloudRuntime.supportsImageGeneration=true` and a correct `generateCloudImage` already exist but have **zero consumers** anywhere in that package), mount `ImageGenCard`/`VideoGenCard` in the message renderer, and fix `apps/desktop/src-tauri/src/sys/commands/media.rs` — it never absolutizes the relative `image_url`/`video_url` the web JSON response returns, so even a wired-up result would render broken. |
| `COMPOSER-004`    | Same composer slice as `VOICE-MEDIA-001` — add the mode toggle + aspect-ratio/model controls Desktop's shared composer entirely lacks, using Mobile's `mediaMode.ts` as the smallest existing reference implementation (it is pure TS, not RN-specific).                                                                                                                                                                                                                                                                                  |
| `VOICE-MEDIA-002` | Add `resolveGeneratedVideoUri()` to Mobile's `videogen.ts`, mirroring `imagegen.ts`'s existing `resolveGeneratedImageUri()` exactly — today the server returns a bare relative `/api/files/{uuid}` path on video completion, Mobile passes it unmodified into `new URL()`, which throws, and the failure is swallowed silently: every tap on "Opens in browser" for every completed video is currently a silent no-op in production. Also surface `openExternalUrl`'s discarded boolean return as a visible error toast.                  |
| `VOICE-MEDIA-003` | Add a cron-triggered route calling the already-written `reconcileDueVideoGenerationJobs` (currently has zero production callers — reconciliation only fires when a client actively polls), so a video generation completes even if the user never returns to the triggering conversation.                                                                                                                                                                                                                                                 |
| `VOICE-MEDIA-008` | Build the region-select/mask tool using the wire contract's already-defined `source_image`/`mask_image` fields (server-side edit path already exists); today "editing" only means regenerating from a new prompt.                                                                                                                                                                                                                                                                                                                         |
| `VOICE-MEDIA-010` | Add an optional `source_image` field to the video-generation contract for image-to-video/reference-frame input, mirroring the image contract's existing shape.                                                                                                                                                                                                                                                                                                                                                                            |

**Verification.** From the real Desktop Tauri app (not the mock), send "generate an image of X" from
the composer and observe an inline result card with working download/retry, billed once. On Mobile,
generate a video, background the app until it completes, foreground it, tap "Opens in browser," and
observe the video actually opens (not a silent no-op). Kill a video-generation job's originating
conversation client mid-generation and confirm the cron sweep still lands the result in Library.

---

## 6. Phase 1.5 — Flagged: `AGENTIC-WORK-001` (Desktop background agents, P0, outside the authorized exception)

Per §2.4(2): this is the highest-severity gap in the matrix (a complete Rust `BackgroundAgentManager`
— 11 commands, 9 native events — with **zero** production frontend caller for list/pause/resume/
take-over, and only 2 of 9 events even listened to), but it is not image/video generation, tool
loop/artifacts/search, or skills/plugins/connectors, so it falls outside the founder's 2026-08-09
exception text. **This plan does not decide for the founder.** Two honest options, recorded so the
decision is explicit rather than silently made by omission:

- **(a)** Grant a narrow second exception now, since the backend is already built and the gap is
  purely a frontend control panel (`useBackgroundAgentStore` wiring the 11 commands + 7 currently-
  unconsumed events, a Background Agents list with Pause/Resume/Cancel/Take Over). Effort: M.
- **(b)** Leave it queued inside Desktop's own surface-closure phase (Phase 11), where it is already
  listed, and accept that a P0 waits behind Desktop's P1s and P2s until Desktop becomes the active
  surface under the standing rule.

Whichever the founder chooses, ship it **before** any UI-level "push to background" trigger (a
composer `&` prefix or button) — a control surface that can create unattended work but not manage
it is worse than no control surface at all, per the gap's own recommendation.

**Verification (once scheduled).** Trigger a background agent via the existing approval-gated
`background_agent_start` tool call, observe it appear in a live list with progress updates driven
by the `progress` event, and successfully pause/resume/cancel/take-over it from the UI.

---

## 7. Phase 2 — Founder-authorized: tool loop, artifact rendering, web search (Web, Mobile, Desktop)

**Goal.** Second leg of the 2026-08-09 exception.

**Gap IDs.** `BACKEND-RUNTIME-001` (P1, Web), `RENDERING-006` (P1, Desktop), `RENDERING-007` (P2,
cross-surface), `RENDERING-008` (P2, cross-surface), `ARTIFACTS-001` (P1, cross-surface),
`ARTIFACTS-002` (P2, Desktop), `ARTIFACTS-003` (P2, cross-surface), `ARTIFACTS-004` (P2, Mobile),
`ARTIFACTS-007` (P3, Web), `ARTIFACTS-008` (P3, cross-surface), `SEARCH-RESEARCH-001` (P1,
Backend), `SEARCH-RESEARCH-002` (P1, cross-surface), `SEARCH-RESEARCH-003` (P2, Backend),
`SEARCH-RESEARCH-004` (P2, Backend), `BACKEND-RUNTIME-006` (P2, Backend — prerequisite), `MEMORY-005`
(P2, Backend — rides the same prerequisite).

**Effort.** L.

**Dependencies.** `BACKEND-RUNTIME-006` (the embeddings endpoint has zero internal callers and no
`vector` column exists anywhere in the schema) is the explicit shared prerequisite its own gap text
names for `SEARCH-RESEARCH-004` and `MEMORY-005` — build the pgvector store once, let both consume
it, rather than shipping two retrieval implementations.

**Explicitly correctly deferred, not part of this phase:** `ARTIFACTS-005` (AI-powered/model-
calling artifacts) — see §19, "Do not do this."

| Sub-track             | Gaps                                                             | What actually has to happen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool loop             | `BACKEND-RUNTIME-001`, `RENDERING-006`, `RENDERING-007`          | Add an agent-turn composer to Web's `CloudCodePage` wired to the already-built `agent/route.ts` + `agent/approvals/route.ts` (today the page only renders a raw terminal). Port `CodeExecutionBlock.tsx` (stdout/stderr/exit-code rendering) into `packages/ui/unified-chat` so Desktop gets console output, not just a generic tool-call name. Add a file-diff-aware branch to `ToolCallCard.tsx` instead of a raw `<pre>` JSON dump.                                                                                                                                                                                                                                                                                                                              |
| Artifacts             | `ARTIFACTS-001`–`004`, `007`, `008`                              | Add the missing push half of Web's artifact sync (the pull half and the full bidirectional `/api/chat/sync` backend already exist — Web's `artifacts-store.ts` just never calls the POST). Give Desktop a `CloudPublisher` adapter (it hardcodes `privacyMode: 'local'` today; Web already has a working one to copy). Add a version stepper + publish action to Mobile's `ArtifactFullScreen`. Bind a keyboard shortcut to the Artifacts panel toggle on Web. Relabel or scope the Work-mode "Live artifacts" nav item, which currently points at the same static `/gallery` as ordinary Artifacts.                                                                                                                                                                |
| Web search / research | `SEARCH-RESEARCH-001`–`004`, `BACKEND-RUNTIME-006`, `MEMORY-005` | Re-verify (with a live test) whether Anthropic conversations can now route through `runResearchLoop` — the stated technical reason for excluding them (raw-stream normalization) was already generalized months ago in `tool-loop-anthropic.ts`, which the multi-turn research loop itself already calls. If confirmed safe, drop the `provider !== 'anthropic'` exclusion; if a real blocker remains, gate the Research toggle on provider capability instead of silently degrading. Wire Desktop's already-parsed `x_research_status` state (captured, never rendered) into a compact progress indicator. Extend `GET /api/research/reports` calls to Desktop/Mobile. Build the pgvector store and switch memory/global search off pure ILIKE substring matching. |

**Verification.** From Web, create an artifact, reload in a second browser session for the same
account, and confirm it appears. From Desktop, publish an artifact and observe a real `shareUrl`,
not a local-file toast. Turn on Research with an Anthropic model selected and observe the same
plan/phase/report UI a non-Anthropic model gets (or observe an honest capability-gated toggle if a
real blocker is found). Query memory for a paraphrase of a saved fact (not a literal substring) and
observe it surface.

---

## 8. Phase 3 — Founder-authorized: skills, plugins, connectors (Web, Mobile, Desktop, CLI, VS Code)

**Goal.** Third leg of the 2026-08-09 exception.

**Gap IDs.** `EXTENSIBILITY-001` + `SHELL-NAV-IA-003` (P1, Mobile, merged per §2.3),
`EXTENSIBILITY-002` + `SHELL-NAV-IA-002` (P1, Desktop, merged per §2.3), `EXTENSIBILITY-003` (P1,
Desktop), `EXTENSIBILITY-004` (P1, cross-surface), `EXTENSIBILITY-005` (P2, Desktop),
`EXTENSIBILITY-006` (P2, Web — **partially blocked on human**, see §18), `EXTENSIBILITY-008` (P2,
Backend).

**Effort.** M.

**Note on scope.** No gap was filed against CLI or VS Code in this domain by this audit round — CLI
already has Claude-Code-style slash commands/memory/MCP/plugins/hooks/skills per
`docs/current/source-of-truth.md`, and neither surface's skills/plugins/connectors story was flagged
as broken. That is reported as-is, not assumed to mean "nothing left to do" — the 37-row prior-art
`extension-vscode` backlog in `ui-gaps.csv` may carry items this domain analyst pass did not
re-surface.

| Gap                                      | What actually has to happen                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXTENSIBILITY-001` + `SHELL-NAV-IA-003` | Restore the Skills row in Mobile's `DrawerContent.tsx` `PRIMARY_ITEMS` (a later commit, `1e858a7f1`, removed it and the current test asserts its absence) — the screen itself (655 lines, search/badges/empty-states) is complete and just needs a door.                                                                                                                                     |
| `EXTENSIBILITY-002` + `SHELL-NAV-IA-002` | Rename Desktop's "Connections" tab (device pairing — unrelated content) so it stops reading as a synonym for "Connectors" (MCP/OAuth catalog), and split the 5-subsystem "Connectors" tab into scoped sub-views. Bundle with `DEAD-CODE-003` (delete the superseded ~2,000-line parallel MCP UI sitting in the same directory as the live `MCPWorkspace`) since it is the same file cluster. |
| `EXTENSIBILITY-003`                      | Bundle `mcp-allowlist.json` as a real Tauri resource and resolve its path via the app's resource-dir API instead of a bare CWD-relative `PathBuf` — the slopsquatting defense currently silently resolves to open-mode in every shipped release build.                                                                                                                                       |
| `EXTENSIBILITY-004`                      | Wire Desktop's already-real `skill_match_for_message` matcher (built, exposed to the frontend, called by nothing) into the composer as dismissible suggestion chips — the smallest end-to-end slice of automatic skill invocation.                                                                                                                                                           |
| `EXTENSIBILITY-005`                      | Add a native `skill_import_from_download` command that writes a downloaded Cloud skill into the local Managed skills directory and calls `skill_reload()` — today "download" produces a file in Downloads with no path back into the app.                                                                                                                                                    |
| `EXTENSIBILITY-006`                      | Register first-party OAuth apps for 4–6 highest-value connectors (Slack, Notion, Google Drive, Linear) — **the code path is honest and ready** (real "Coming soon" labels, not fake Connect buttons); this needs provider-side app registration, which is a founder/ops action, see §18.                                                                                                     |
| `EXTENSIBILITY-008`                      | Unify the duplicate plugin-policy labels (`CAP-009`) into one enforced org contract before layering `CAP-010` (skill policies) on top.                                                                                                                                                                                                                                                       |

**Verification.** From Mobile, navigate Drawer → Skills and confirm the catalog renders. From
Desktop, confirm "Connections" and "Connectors" read as unambiguous labels and the superseded MCP UI
no longer compiles into the app. Attempt to install an MCP bundle not on the allowlist from a release
build and confirm it is rejected, not silently permitted. Send a chat message that should trigger an
installed skill without naming it and observe a suggestion chip.

---

## 9. Phase 4 — Recommended deviation: shared architecture unlock

**Goal.** Ship the smallest possible slice of composer/markdown/chat-surface consolidation so every
later surface-closure phase inherits fixes instead of re-deriving them. See §2.4(1) for why this is
scheduled here rather than deferred to each surface's own turn.

**Gap IDs.** `COMPOSER-001` (P1, cross-surface — the architecture finding itself), `COMPOSER-002`
(P1, Web — the concrete, scoped slice), `CROSS-SURFACE-001` (P1, Web), `RENDERING-001` (P1,
cross-surface), `DESIGN-SYSTEM-002` (P1, cross-surface).

**Effort.** M (deliberately scoped small — every one of these gaps' own recommendations explicitly
warns against a big-bang rewrite).

**What unblocks what.**

| This phase ships                                                                                                                                      | Which later-phase gaps get cheaper as a direct result                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A framework-neutral paste/attachment-policy module extracted from `ChatComposerNew.tsx` + `ChatInput.tsx`                                             | `CROSS-SURFACE-002` (Chrome composer drift, Phase 9) — port instead of hand-derive                                                                                                                                                                     |
| One shared markdown AST layer (micromark/mdast) with thin per-platform render targets                                                                 | `RENDERING-002`/`RENDERING-005` (Chrome, Phase 9), `RENDERING-003` (Mobile, Phase 10)                                                                                                                                                                  |
| Web's primary chat route migrated onto `@agiworkforce/unified-chat`'s `MessageList`/`ChatInput`                                                       | `RENDERING-004` (Desktop response actions, Phase 11) and `RENDERING-009` (branch/fork UI, Phase 13) both become "port a prop the shared package now has" instead of "build from scratch on N surfaces"                                                 |
| A documented framework-agnostic "control contract" for `@agiworkforce/ui` primitives, keyed to the same design tokens both extensions already consume | Reduces (does not eliminate — React cannot be forced into the Chrome content-script surface) the a11y-drift risk `DESIGN-SYSTEM-002` names, and gives Chrome/VS Code's own surface-closure phases a shared checklist instead of ad-hoc parity guessing |

**Verification.** Paste 15,000 characters of text into the Web composer and confirm it converts to a
"Pasted text" attachment chip (the concrete, currently-broken behavior `COMPOSER-002` names). Diff
`WebChatPage.tsx`'s message-rendering import list before/after and confirm it now imports the shared
`MessageBubble`/`ChatInput` rather than maintaining a parallel 2,254-line/3,621-line fork. Run the
same markdown fixture (a table with an inline-bold cell, nested list, LaTeX) through Web, Mobile, and
the extension and confirm identical rendered output for the first time.

---

## 10. Phase 5 — Backend / services substrate

**Goal.** Backend-domain gaps not already consumed by Phases 1–4, sequenced by dependency. Not one
of the six surfaces — runs in parallel with whichever surface phase is active.

**Gap IDs.** `AGENTIC-WORK-004` (P1), `AGENTIC-WORK-007` (P1), `MODELS-002` (P1), `PROJECTS-FILES-001`
(P1), `PROJECTS-FILES-002` (P2), `BACKEND-RUNTIME-002` + `CROSS-SURFACE-008` (P2, merged, **founder
call, see §18**), `BACKEND-RUNTIME-004` (P2), `VOICE-MEDIA-009` (P2), `BACKEND-RUNTIME-012` (P3),
`SEARCH-RESEARCH-006` (P3).

**Effort.** M–L.

| Gap                                         | What actually has to happen                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTIC-WORK-004`, `AGENTIC-WORK-007`      | Scheduled tasks currently have no recurrence cadence and no tool access on execution — both are backend contract gaps that block a large share of the "AGI Work" story regardless of which surface is active.                                                                                                                                                                                                         |
| `MODELS-002`                                | Wire the already-defined `ProviderPolicy` type into an admin-console route and enforce it in `request-processor.ts`'s existing tier-gate call site — two contract layers exist and neither is consumed.                                                                                                                                                                                                               |
| `PROJECTS-FILES-001`, `PROJECTS-FILES-002`  | Add xlsx/docx/pptx parsing to `extractProjectKnowledgeFile()` (currently only PDF/notebook/plain-text extract; everything else silently returns `extractedText: null` with no UI signal), and surface the existing silent-truncation bookkeeping (`X of 20 files included`) that `loadProjectContext()` already computes but never returns to the caller.                                                             |
| `BACKEND-RUNTIME-002` + `CROSS-SURFACE-008` | **Founder decision required** — `services/api-gateway` structurally duplicates `apps/web`'s Next.js routes for the same concepts, and Mobile's `GATEWAY_URL` default resolves onto the _same_ Vercel deployment via a Host-header rewrite, not the Fly-hosted gateway. Pick one; the losing side's REST duplication should be deleted, not maintained in parallel with an ambiguous "who serves this in prod" answer. |
| `BACKEND-RUNTIME-004`                       | Not proven broken today — low-risk hardening only (shared regex/constant between the two device-pairing code-format validators).                                                                                                                                                                                                                                                                                      |
| `VOICE-MEDIA-009`                           | Apply the reserve/settle/void pattern the sibling image-generation route already uses to `audio/transcriptions` — today every successful managed transcription is unbilled.                                                                                                                                                                                                                                           |
| `BACKEND-RUNTIME-012`                       | Add `/metrics` to `services/api-gateway` matching `services/signaling-server`'s existing pattern; wire error-tracking into both.                                                                                                                                                                                                                                                                                      |
| `SEARCH-RESEARCH-006`                       | Low priority, weak benchmark evidence — image/current-data search result types.                                                                                                                                                                                                                                                                                                                                       |

**Verification.** Create a scheduled task with a weekly recurrence and confirm it actually re-fires
weekly, not once. Upload a `.xlsx` as project knowledge and confirm the model can answer a question
about a specific cell value. As an org admin, block a model and confirm a member's picker shows it
locked, and a direct API request for it is rejected server-side, not just hidden client-side.

---

## 11. Surface-closure phases — Phase 6 through Phase 13 (§2.5 proxy order)

Each phase below lists the gaps remaining for that surface after Phases 0–4 have already resolved
its P0s and founder-authorized-scope items. Effort and verification are per-phase.

### Phase 6 — VS Code extension

**Remainder after Phase 0:** none. Both of VS Code's filed gaps (`DESIGN-SYSTEM-001`,
`CROSS-SURFACE-006`) are CI/test fixes already closed in Phase 0. **This is not a claim that VS
Code is fully at parity** — only that this audit round filed no further gaps against it; the
37-row prior-art `ui-gaps.csv` backlog (20 `Open`) for `extension-vscode` was intentionally not
re-derived by this pass (`prior-art-reconciliation.md` §"Resulting scope") and should be the next
input if VS Code becomes the active surface.

### Phase 7 — Desktop (Electron)

**Gap IDs.** `CROSS-SURFACE-003` (P2), `CROSS-SURFACE-004` (P2), `DEAD-CODE-015` (P2).
**Effort.** S.

The IPC bridge being inert-by-default is **confirmed intentional** (matches the founder-locked
"thin Chromium wrapper over the hosted web app" architecture) — do not "fix" that. The two real
action items: (1) the Local/Cloud mode toggle silently no-ops instead of disabling itself when
Local mode is genuinely unavailable (`CROSS-SURFACE-004`); (2) the `agiworkforce-cloud://sso-
callback` Clerk redirect URL allowlisting is an un-actioned ops TODO in `CHANGELOG.md` — **blocked
on human**, see §18. Global-shortcut customization (`DEAD-CODE-015`) is fully built and persisted
but has zero callers — wire it or delete it.

**Verification.** Toggle Local mode when no local runtime is configured and confirm the control
disables itself with an explanatory state rather than silently doing nothing.

### Phase 8 — CLI

**Gap IDs.** `BACKEND-RUNTIME-009` (P1), `BACKEND-RUNTIME-010` (P2), `BACKEND-RUNTIME-011` (P0
already closed in Phase 0).
**Effort.** M.

`BACKEND-RUNTIME-009`: the CLI's exec tool fails closed on Windows entirely (`SandboxType::None`
is the only outcome; `windows_sandbox.rs::is_available()` unconditionally returns `false`) unless a
user passes `--no-sandbox`, which disables all sandboxing. Ship a minimum-viable Job Object +
restricted-token sandbox rather than leaving the core agent workflow blocked on an entire supported
platform. `BACKEND-RUNTIME-010`: a working `seccompiler`-based Linux sandbox exists but is not in
the release build's `--features` list — a Linux user without `bwrap` on PATH gets no sandbox at
all despite a working alternative sitting uncompiled in the same crate.

**Verification.** Run a shell-command tool call from the CLI agent loop on a clean Windows machine
with default flags and confirm it succeeds under a real sandbox, not `--no-sandbox`. Run the same
on a `bwrap`-less Linux container and confirm the `linux-seccomp` fallback engages.

### Phase 9 — Chrome extension

**Gap IDs.** `RENDERING-002` (P1), `RENDERING-005` (P1), `CROSS-SURFACE-002` (P2, depends on Phase
4's shared paste/attachment module), `EXTENSIBILITY-007` (P2), `SEARCH-RESEARCH-005` (P2),
`DEAD-CODE-021` (P3, security-relevant — bump within this phase), `SETTINGS-009` (P3, no action
needed per its own text).
**Effort.** M.

The extension's `side_panel.ts` composer explicitly comments that it "Mirrors
`packages/ui/unified-chat/ChatInput.tsx`" — i.e. behavior is manually re-derived by reading the
shared component's source, not imported. With Phase 4's extraction done, this becomes "port the
shared module" rather than "hand-derive again." Markdown rendering (`RENDERING-002`) has no table,
image, or math support at all — a table currently renders as literal pipe characters. Response
actions (`RENDERING-005`) are Copy-only; no regenerate or feedback. `DEAD-CODE-021`'s fail-open
scheduled-task origin check (the only fail-open branch in an otherwise fail-closed provenance-gating
codebase) should be flipped to fail-closed once legacy pre-stamp tasks are migrated.

**Verification.** Send a markdown table and an inline-math expression through the side panel and
confirm both render correctly, not as raw syntax. Add a Skill `@mention` from the side panel
composer and confirm it invokes.

### Phase 10 — Mobile

**Gap IDs (remainder after Phases 0/1/2/4).** `COMPOSER-006` (P2), `RENDERING-003` (P2, closes
faster after Phase 4's markdown consolidation), `DESIGN-SYSTEM-010` (P2), `DESIGN-SYSTEM-011` (P2),
`DEAD-CODE-016` (P2), `PROJECTS-FILES-008` (P3, bundle with `DEAD-CODE-016` — same edge-cases
directory), `DEAD-CODE-018` (P3).
**Effort.** M.

`COMPOSER-006`: sending mid-response currently stops the current generation instead of queuing a
follow-up — the mobile store has no "wait for this turn, then send" semantics at all, unlike Web's
already-real (if single-slot) queue. `DESIGN-SYSTEM-010`: no automated accessibility testing exists
at all on Mobile (unlike Web and Desktop, both of which run `@axe-core/playwright` in CI), and ~51%
of `TouchableOpacity`/`Pressable` instances have no `accessibilityLabel`. `DESIGN-SYSTEM-011`:
reduced-motion is respected in only 2 of 23 animation-driving files, despite a working
`useSystemHighContrast` pattern to copy. `DEAD-CODE-016` + `PROJECTS-FILES-008`: a fully built,
tested edge-case UX library (battery/thermal/storage/model-loading/file-error modals) has zero
import sites — wire the two highest-value ones (storage-full, model-loading-first-run) and delete
the rest.

**Verification.** Type a follow-up while a Mobile response streams, tap send, and confirm it queues
rather than interrupting the response. Run a screen-reader pass over the composer and tab bar and
confirm every icon-only control announces a label. Enable OS-level Reduce Motion and confirm the
agent-activity/thinking indicator respects it.

### Phase 11 — Desktop (Tauri)

**Gap IDs (remainder after Phases 0/1/1.5/2/3/4).** `DEAD-CODE-002` (P1), `MEMORY-001` (P1, bundle
with `MEMORY-009`'s orphaned memory-browser components — same directory), `MODELS-001` (P1),
`RENDERING-004` (P1, cheaper post-Phase-4), `VOICE-MEDIA-005` (P1), `ARTIFACTS-002` (P2, already in
Phase 2), `BACKEND-RUNTIME-003` (P2, already in Phase 0), `DEAD-CODE-004` (P2), `DEAD-CODE-012` (P2,
bundle with `AGENTIC-WORK-001`/Phase 1.5 — same `background_agent_*` command surface),
`DEAD-CODE-013` (P2), `DEAD-CODE-014` (P2), `DEAD-CODE-023` (P2, mostly DOCUMENT-AS-INTENTIONAL,
minor triage), `SETTINGS-002` (P2), `SETTINGS-003` (P2 — the send-shortcut UI row itself), `SETTINGS-004`
(P2), `SETTINGS-011` (P2), `VOICE-MEDIA-007` (P2), `MEMORY-009` (P3), `MODELS-007` (P3),
`VOICE-MEDIA-012` (P3, security-hardening — bump within this phase).
**Effort.** L (the largest single-surface remainder — 2 of the matrix's 3 P0s and 10 of 45 P1s
originate here, and `DEAD-CODE-002` alone is a ~183-file, ~30-directory triage).

**`DEAD-CODE-002` is the largest single item in this plan.** `knip` reports 183 unused files under
`apps/desktop/src/features/` — a second, larger dead-code body beyond the already-known and
correctly-isolated `apps/desktop/archive/`. Several directories (ROI dashboard, in-app notification
center, reminders) map directly to real parity gaps this same audit flags elsewhere as **absent**
in other domains — i.e. some of this "dead" code may be the fastest path to closing a different
gap. Triage per-directory: mount behind a real nav entry, or delete. Do not leave it as ambient dead
weight in the live compiled tree.

`MEMORY-001` is a genuine correctness bug, not a missing feature: a Project's Memory tab reads and
writes the **global** memory store while the real chat runtime injects from a separate,
genuinely project-scoped Rust-backed store the UI never displays — a user can see, edit, or delete
an unrelated project's memories from inside the wrong project's dialog. `MODELS-001`: no reasoning-
effort control exists anywhere on Desktop's composer despite the backend (`TauriRuntime.ts`) already
forwarding `effort`/`thinkingEnabled` parameters with the comment "controls that were previously
dropped." `VOICE-MEDIA-005`: a complete voice-conversation UI (`VoiceMode.tsx`) has zero render
calls, and would fail even if mounted (hardcodes a transcription provider that is not compiled into
any shipped build) — treat as a real escalation, but ship the small, safe increment first (wire the
already-working `SystemTts` "read aloud," which needs no trust-boundary decision at all).

**Verification.** Open a Project's Memory tab and confirm the listed memories match exactly what
`memory_handler.rs` injects into that project's conversations at send time. Set a reasoning-effort
control in the composer and confirm the outgoing request carries it. Trigger the SystemTts read-
aloud on a completed assistant reply and hear it. Re-run `knip` after the `DEAD-CODE-002` triage and
confirm the 183-file count has gone to zero (mounted) or the files are physically moved to
`archive/` (deleted from the live tree).

### Phase 12 — Web

**Gap IDs (remainder after Phases 0/2/4).** `AGENTIC-WORK-003` (P1), `MEMORY-002` (P1), `COMPOSER-003`
(P2, cross-ref `PROJECTS-FILES-007` in Phase 13 — same underlying capability from two entry points),
`COMPOSER-005` (P2), `DEAD-CODE-007` (P2), `DEAD-CODE-008` (P2), `DEAD-CODE-009` (P2), `DESIGN-SYSTEM-006`
(P2), `DESIGN-SYSTEM-007` (P2, bundle with `-006` and `CROSS-SURFACE-012` — same off-token-color
sweep), `DESIGN-SYSTEM-008` (P2), `DESIGN-SYSTEM-009` (P2, remainder after Phase 0's SkipLink mount),
`EXTENSIBILITY-006` (P2, already in Phase 3), `MEMORY-003` (P2), `MEMORY-004` (P2), `MEMORY-006` (P2),
`MEMORY-008` (P2), `MODELS-003` (P2), `MODELS-004` (P2), `MODELS-006` (P2), `PROJECTS-FILES-003` (P2),
`PROJECTS-FILES-004` (P2), `PROJECTS-FILES-005` (P2, **needs a live/staging check**, see below),
`RENDERING-010` (P2), `SETTINGS-006` (P2, depends on `SETTINGS-005` in Phase 13), `SETTINGS-007` (P2,
already tracked as `GAP-275`), `SETTINGS-008` (P2, **partially blocked on human**, see §18), `ARTIFACTS-006`
(P3), `COMPOSER-008` (P3), `DESIGN-SYSTEM-012` (P3), `MEMORY-010` (P3, already in Phase 0),
`PROJECTS-FILES-006` (P3), `RENDERING-011` (P3), `SETTINGS-012` (P3, already tracked as `GAP-119`),
`SHELL-NAV-IA-006` (P3), `SHELL-NAV-IA-007` (P3, already in Phase 0).
**Effort.** L (largest gap count of any surface — 0 P0s, but 8 P1s and the deepest P2/P3 design-
system and dead-code backlog).

**`PROJECTS-FILES-005` needs one live check before it is a code change.** The Library's "Uploaded"
filter copy asserts chat uploads are never cataloged into the Library — but the writer that would
catalog them (`insertMediaAsset` with `metadata.origin: 'upload'`) is real, reachable from the
composer's upload flow, and its git commit predates the copy's own last edit by hundreds of commits.
Manually upload a chat attachment in staging and check whether it appears under Library → Uploaded.
If it does, the fix is deleting stale disclaimer copy (S). If it does not, that is a separate,
higher-severity bug (a writer that looks live but doesn't surface data) requiring further tracing —
do not paper over either outcome with the current copy.

**Everything else in this phase is either a genuine missing capability** (`MEMORY-002`'s search-and-
reference-past-chats has a working Mobile reference implementation to port; `MEMORY-004`'s project-
scoped memory has no schema column at all; `MODELS-003`'s context-window warning chip likewise has
a Mobile reference) **or design-system/dead-code hygiene** (`DEAD-CODE-007`/`008`/`009` — roughly
161 files of legacy `apps/web/shared/`, a duplicate share backend, and a dead export-feature cascade
that includes a materially complete multi-format export dialog worth rescuing before the rest of its
cascade is deleted; `DESIGN-SYSTEM-006`/`007`/`012`/`CROSS-SURFACE-012` — off-token colors across
format cards, the chat top bar, and 60+ raw spinner implementations).

**Verification.** Query a past conversation by paraphrase (not exact substring) from a new
conversation and confirm relevant excerpts surface with the "Search and reference chats" toggle on.
Open a project, scope its memory to project-only, and confirm a fact saved there does not leak into
an unrelated chat. Grep the four format-card components and the chat top bar for raw Tailwind color
classes after the fix and confirm zero matches outside the design-token file.

### Phase 13 — Cross-surface consistency, shared packages & residual design-system polish

**Gap IDs.** `AGENTIC-WORK-005` (P1), `AGENTIC-WORK-006` (P2), `DESIGN-SYSTEM-003` (P1),
`CROSS-SURFACE-010` (P2), `CROSS-SURFACE-011` (P3), `CROSS-SURFACE-014` (P2), `CROSS-SURFACE-015`
(P3), `DEAD-CODE-019` (P2), `MEMORY-007` (P3), `MODELS-005` (P2), `PROJECTS-FILES-007` (P1, cross-ref
`COMPOSER-003` in Phase 12), `RENDERING-009` (P2, ports out of Phase 4's consolidated shared
`MessageBubble`), `RENDERING-012` (P3), `SETTINGS-005` (P2 — **feeds `SETTINGS-006` in Phase 12
directly**: the `toolAccessMode`/`inlineVisualizationsEnabled` state Web's thin Capabilities section
needs already exists here, unused), `SHELL-NAV-IA-005` (P2), `VOICE-MEDIA-004` (P1, correctly
deferred — see below), `VOICE-MEDIA-011` (P3), `BACKEND-RUNTIME-007` + `CROSS-SURFACE-009` (P3,
merged, **founder call**, see §18), `DEAD-CODE-022` (P3, DOCUMENT-AS-INTENTIONAL — no action).
**Effort.** M, executed opportunistically alongside whichever surface phase is active rather than as
a blocking gate.

`SETTINGS-005` → `SETTINGS-006` is the sharpest dependency in this phase: the shared `unified-chat`
settings store already has a real `toolAccessMode`/`setToolAccessMode` and
`inlineVisualizationsEnabled`/`toggleInlineViz` pair with **zero callers anywhere in the repo** —
building Web's thin Capabilities section against this existing state closes both gaps in one slice
instead of inventing new state.

`VOICE-MEDIA-004` (full-duplex conversational voice) is filed P1 but its own recommendation
explicitly defers it: "not immediately actionable as a single slice... treat full-duplex voice as a
separate product program after the core task engine is reliable." This plan agrees and does not
schedule it as an execution phase — it stays visible here so the P1 severity is not silently lost,
but should not be pulled into any near-term sprint on the strength of its severity label alone.

**Verification.** Add a signed-in fixture pass to the existing Web `a11y:audit` and Desktop
`accessibility-audit.spec.ts` harnesses (both currently only test unauthenticated/pre-product
screens) and confirm they catch a deliberately-introduced contrast regression in the Settings modal.
Toggle Tool Access Mode from Web's Capabilities section and confirm the setting actually changes
tool-loading behavior in the next chat turn, not just a UI checkbox.

---

## 18. Blocked on human

Per the repo's own handoff convention: these items cannot be completed by an agent regardless of
phase, because they require founder credential, billing, OAuth, signing, publication, or production
configuration access. Each is cross-referenced to the phase where the surrounding code work lives.

| Item                                                                                                                      | Phase                            | What's needed from a human                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production promotion failure (`e15df56e3` → production alias is `ERROR`; production serves `4bfc99dc1`, ~10 fixes behind) | §4.5 (Phase 0)                   | Someone with Vercel production access on the owning team to investigate the promotion/alias-stage failure and confirm which project/commit actually serves `agiworkforce.com` — this audit deliberately did not disable Deployment Protection or mint a bypass token to investigate further. Already tracked as `GAP-P0-003` in `docs/current/gap-audit-2026-08-08.md`. |
| Connector OAuth app registration (`EXTENSIBILITY-006`)                                                                    | Phase 3                          | First-party OAuth app registration with Slack, Notion, Google Drive, and Linear (client id/secret) — the code path is fully honest and ready to receive credentials.                                                                                                                                                                                                    |
| `agiworkforce-cloud://sso-callback` Clerk redirect allowlisting (`CROSS-SURFACE-003`)                                     | Phase 7                          | Clerk dashboard configuration change — an un-actioned ops TODO already named in `CHANGELOG.md`.                                                                                                                                                                                                                                                                         |
| `0058_drop_legacy_teams.sql` (`DEAD-CODE-006`/`BACKEND-RUNTIME-013`)                                                      | Phase 0 (tracking only)          | The migration is fully written and explicitly founder-gated in its own header comment — a deliberate, correctly-gated step, not a bug. Needs a founder-run apply.                                                                                                                                                                                                       |
| `services/api-gateway` vs `apps/web` route duplication (`BACKEND-RUNTIME-002`/`CROSS-SURFACE-008`)                        | Phase 5                          | Architecture decision: retire the gateway's REST duplication or retire the Next.js routes it duplicates — already framed as a pending decision in `known-flaws.md`'s `SVC-DEPLOY-TOPOLOGY-VERCEL-SINGLE` entry.                                                                                                                                                         |
| Enterprise-Local licensing dual-implementation (`BACKEND-RUNTIME-007`/`CROSS-SURFACE-009`)                                | Phase 13                         | Confirm with the founder decision referenced in `docs/decisions/2026-07-30-enterprise-local-verifier-retention.md` whether this is intentionally pre-built-ahead-of-need; if so, record that explicitly rather than letting it read as accidental dead code.                                                                                                            |
| Passkey/WebAuthn + SMS MFA (`SETTINGS-008`)                                                                               | Phase 12                         | Likely an account-contract/vendor change (SMS carrier, WebAuthn relying-party setup) beyond pure application code — the current TOTP-only state is honestly disclosed in-product, which is the correct interim state; closing the gap means shipping real WebAuthn, not UI that claims it.                                                                              |
| Desktop macOS/Windows code signing and notarization                                                                       | Not gap-ID-tracked in this round | `docs/current/source-of-truth.md` names this as a remaining release-readiness requirement independent of this audit's 168 gaps — certificates/notarization credentials are a founder/ops action. Flagged here because no phase above can close it.                                                                                                                      |

---

## 19. Do not do this

Benchmark behaviors this product should deliberately **not** copy, per
`research/cross-cutting-and-complaints.md` §8 ("Anti-patterns NOT to copy") and this audit's own
correctly-declined prior-art rows. The benchmark is not a specification — where ChatGPT and Claude
have shipped a regression or a widely-criticized choice, the better design is to not repeat it.

1. **Do not ship `ARTIFACTS-005` (AI-powered / model-calling artifacts) in Claude's current
   shape.** `docs/current/gap-audit-2026-08-08.md`'s `GAP-P0-009` red-teamed this exact feature and
   found a real anonymous-wallet DoS against the publisher, an opaque-origin auth contradiction,
   copied capability state enabling repeated billing, and a fail-open concurrency limiter — and
   concluded it "must not ship as currently designed." This audit reaffirms that NO-GO. If built,
   build to `GAP-P0-009`'s required properties (short-lived viewer-scoped capability tokens,
   server-enforced fail-closed budget/concurrency, immutable published snapshots, full audit trail)
   and gate behind a red-team regression suite — not the naive "artifact calls the model with the
   viewer's own plan quota" version either competitor ships today.
2. **Do not let "Pro" (or any tier name) mean two different things at two different price points.**
   OpenAI currently sells $100 and $200 plans both called "Pro," differentiated only by usage
   allowance — a named, called-out source of purchase confusion. This product's plan lock
   (`docs/current/source-of-truth.md`) already uses distinct names (Pro / Max 5x / Max 15x) —
   protect that distinctness as new tiers are added.
3. **Do not rename or relocate a core surface without a visible migration story.** OpenAI's
   Chat→buried-sidebar-item-under-Work, Canvas→inline-blocks, and Atlas→folded-into-desktop all
   shipped as forced, non-optional replacements with no opt-out or communicated deprecation
   timeline, generating sustained "quietly killed X" backlash. Where this product retires a surface
   (e.g. the eventual collapse of `WebChatPage`'s legacy fork into the shared package in Phase 4,
   or `UnifiedChatPage`'s eventual deletion or promotion), do it with a stated timeline, not a
   silent swap.
4. **Do not default a chat product to a non-chat mode.** OpenAI's own president, Greg Brockman,
   publicly called the app's navigation "kind of a mess" after Work/Codex/GPT-5.6 were bolted onto
   the existing tab structure, and a reviewer's sharp critique of the July 2026 unified desktop app
   — "how can a product called ChatGPT not default to chat mode?" — is exactly the failure mode
   `SETTINGS-001`'s fix (make the Settings gear open Settings, not a stray voice sub-page) and
   `SHELL-NAV-IA-001`'s fix (auth-gate `/tasks` like every other authenticated surface) are
   protecting against by keeping the primary chat surface primary and every other destination
   correctly gated.
5. **Do not bury a paying user's already-entitled capability behind an undiscoverable settings
   flag.** Claude's file-creation upgrade lives in Settings > Features > Experimental — a concrete,
   named discoverability failure. `SETTINGS-010`'s CI guard (Phase 0) exists specifically to catch
   this pattern's converse in this codebase (a built panel with no nav entry at all) before it
   compounds into "built but also hidden."
6. **Do not make usage limits a black box.** Both vendors draw sustained, high-engagement complaint
   threads for the same failure: no visible running counter, undocumented rolling-window mechanics.
   This product's existing billing-plan lock already commits to visible percentage/reset-time
   contracts across every surface (`docs/current/source-of-truth.md`, "Managed usage UI" section) —
   any new usage-adjacent UI (context-window warnings in `MODELS-003`, fallback transparency in
   `MODELS-004`) should extend that visible-counter discipline, not add a second opaque meter.
7. **Do not let a cost-saving or latency-motivated infra change silently become a quality
   regression.** Claude Code's documented six-week degradation (reasoning-effort silently dropped to
   fix a UI latency complaint, compounded by an unintended every-turn caching bug) shows how this
   class of change escapes eval gates that are narrower than production traffic. `VOICE-MEDIA-003`'s
   video-reconciliation cron and any future perf-motivated change to the routing/reasoning-effort
   path should ship behind the same eval gate as a capability change, not a lighter one.
8. **Do not undersell a safety-relevant change with soft release-note language.** Anthropic's own
   release notes described Fable 5's pull-and-relaunch as a "redeployment... with a new jailbreak
   severity scoring framework" — technically accurate, but it took outside reporting to reconstruct
   that this was a suspension. If this product ever needs to pull a model or disable a capability for
   a safety reason, say so plainly in the first-party changelog at the time, not only in the
   re-enablement announcement.
9. **Do not ship GPT-Live's specific regression** (full-duplex voice that dropped live camera/
   screen-share support at launch, still absent as of the source research date) **as a template for
   `VOICE-MEDIA-004`.** If/when full-duplex voice is built as its own product program (per its own
   correctly-deferred status in Phase 13), scope camera/vision input from the start rather than
   shipping voice-only and adding vision later as a second, separately-timed release.

**Prior-art rows already correctly declined, reaffirmed here rather than silently repeated:**

- **The 3+3 sign-in/sign-up route "duplication"** (`/login` vs `/sign-in` vs `/auth/login`, etc.) —
  retracted as a finding once read correctly: `/login` and `/signup` are the only real Clerk-backed
  screens; the rest are documented one-line `redirect()` aliases serving real external callers
  (the desktop app's cloud-auth handoff, Clerk's own `/sign-in` convention). Do not re-litigate this
  as dead code or route sprawl — it is a working alias pattern.
- **"The product is not publicly reachable"** — retracted. `https://agiworkforce.com` is live,
  public, and Vercel-served with a production-grade security posture (strict CSP with per-request
  nonces, HSTS preload, named third-party origins only). The real, separate finding is the
  promotion-failure/staleness issue in §4.5 and §18 — a different problem from unreachability.
- **`apps/desktop/archive/`** (204 files) and **`wiring-allowlist.json`**'s ~58 tracked exemptions
  (`DEAD-CODE-022`, `DEAD-CODE-023`) — both are already the correct end state (build/test-excluded,
  self-documented, fail-CI-on-regrowth) and need no action beyond periodic re-confirmation.

---

## 20. Keeping this plan honest

Two structural facts this synthesis pass surfaced apply to every phase above, not just Phase 0:

- **A false `Done` removes an item from the queue entirely** — worse than an open gap
  (`gaps/done-claim-verification.md`). Any phase above that closes a gap should be verified by the
  behavioral check listed for that phase, not by the presence of a component, a passing typecheck,
  or a prior `Done` label in `ui-gaps.csv`.
- **A stale `known-flaws.md`/ledger entry actively misleads the next agent or engineer** who reads
  it per `CLAUDE.md`'s mandated read order (`DEAD-CODE-001`'s `teams/` finding was wrong two days
  after it was written, and nothing caught the drift until this audit). Every DELETE/WIRE action in
  this plan that touches a `known-flaws.md` entry should update or remove that entry in the same
  change, not leave a second, now-contradicting source of truth behind.
