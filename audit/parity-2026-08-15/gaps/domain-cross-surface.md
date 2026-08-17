# Cross-Surface Parity + Shared Architecture — Domain Audit

Audited 2026-08-15 at commit `e15df56e3` (branch `compliance/dpdp`, tree clean). Domain
scope: §28 (cross-surface consistency) and §29 (shared architecture) of the parity
audit brief. Method: read the completed research + inventory phase, then independently
re-verified every load-bearing claim in code (line counts, import graphs, grep
confirmations) before filing a gap. 15 gaps filed; full detail in
`domain-cross-surface.json`.

---

## 1. Headline finding — four chat implementations, one of them the primary surface

The single most consequential architectural fact in this repo: **`@agiworkforce/unified-chat`
is a real, substantial, well-adopted shared chat UI package (~75 components, `ChatInterface.tsx`
1,063 lines, `MessageList.tsx` 393, `ChatInput.tsx` 1,422, `MessageBubble.tsx` 924) — and Web's
primary chat route does not use it.**

| Surface                                                        | Route                                         | What renders                                                                               | Shares message/composer code with unified-chat?                                  |
| -------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Desktop (Tauri + Electron-bundled)                             | `App.tsx:1976` (unconditional)                | `DesktopShellV3` → `ChatInterface` from `@agiworkforce/unified-chat`                       | **Yes, fully**                                                                   |
| Web — primary (`/`, `/chat`, `/chat/[sessionId]`)              | `WebChatRoot` → `WebChatPage.tsx`             | Own `ChatMessageList` (1,593 ln), `MessageBubble` (2,254 ln), `ChatComposerNew` (3,621 ln) | **No** — only 3 named type/component imports, verified by grep                   |
| Web — secondary (`/agi-work`, `/chat/code`, `/chat/schedules`) | `WebShellV3`                                  | `ChatInterface` from the shared package                                                    | Yes                                                                              |
| Mobile                                                         | `app/(app)/chat/[id].tsx`                     | Fully independent RN components (`MessageBubble.tsx` 1,124 ln, `ChatInput.tsx` 1,249 ln)   | No — architecturally correct (RN cannot import a package that pulls `react-dom`) |
| Chrome extension                                               | `side_panel.ts` (10,933 ln, vanilla DOM)      | Hand-rolled composer, comment says it "Mirrors `ChatInput.tsx`"                            | No — manually re-derived by reading the source, not imported                     |
| VS Code extension                                              | native `vscode.ChatParticipant` + own webview | —                                                                                          | No — architecturally reasonable, plugs into VS Code's own chat surface           |

I independently confirmed every line count with `wc -l` and every import claim with `grep`:
`WebChatPage.tsx` is 4,407 lines; its own `MessageBubble.tsx` (2,254 ln) is 2.4x the shared
component's 924; its own `ChatComposerNew.tsx` (3,621 ln) is 2.5x the shared `ChatInput.tsx`'s
1,422. `WebChatPage.tsx:17,168` imports exactly `UsageWarningBanner`, `LocalByokHandoffDialog`,
and the `ChatMessage` type from `unified-chat` — nothing that renders a message or composes one.
`apps/desktop/src/features/v3/DesktopShellV3.tsx:7-13` genuinely imports `ChatInterface` and
mounts it unconditionally from `App.tsx:1976`.

**Consequence, made concrete by two secondary findings:**

1. The Chrome extension's composer, which explicitly documents mirroring the shared `ChatInput.tsx`
   by hand (`side_panel.ts:9352-9354`, confirmed verbatim), is **already missing six controls** the
   shared component has: the Ask/Auto/Plan/Bypass agent-mode row, Skill `@mention` picker, explicit
   Research toggle, explicit web-search toggle, code-execution toggle, and writing-style picker
   (confirmed absent by grep for each). Two are arguably desktop-only concepts (project/folder
   scoping — correctly omitted); the other four are not.
2. A fix landed in `unified-chat` (a markdown-rendering bug, an attachment-cap change, a
   paste-image handler) reaches Desktop and Web's secondary Work/Code mode, but **not** Web's
   primary surface, Mobile, or the Chrome extension.

This is filed as `CROSS-SURFACE-001` (P1) and `CROSS-SURFACE-002` (P2). Mobile and VS Code's
non-adoption are **not** filed as gaps — they are the correct call given the runtime constraints
(RN cannot run React-DOM components; VS Code's chat surface is a platform API, not ours to
replace), and the audit should say so plainly rather than manufacture parity theater.

---

## 2. Capability × surface matrix

Statuses: COMPLETE / PARTIAL / BROKEN / MOCKED / DEAD / MISSING / NOT_APPLICABLE / NEEDS_VALIDATION.
"NOT_APPLICABLE" below means the capability is architecturally inappropriate for that surface
(justified, not a gap) — distinguished from MISSING, which means it plausibly should exist there
and doesn't.

| Capability                                                    | Web                                                                                                                        | Mobile                                                                                                               | Electron                                                                                      | Tauri                                                                                              | Chrome Ext                                                                                                                           | VS Code Ext                                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Shared chat UI (`unified-chat`) adoption                      | **PARTIAL** — primary route bypasses it, secondary route uses it                                                           | NOT_APPLICABLE (own RN impl, justified)                                                                              | **PARTIAL** — only in the rarely-used bundled fallback; default renders the (partial) web app | COMPLETE                                                                                           | NOT_APPLICABLE by design, but the manual mirror has measurably drifted (§1)                                                          | NOT_APPLICABLE by design (native VS Code chat API)                                            |
| Local/BYOK/Managed-Cloud trust boundary (runtime enforcement) | NOT*APPLICABLE (web \_is* cloud)                                                                                           | COMPLETE — enforced inside the send path itself, tested                                                              | COMPLETE — verified Local mode is unreachable, forced-cloud                                   | COMPLETE — best-engineered part of the repo; regression-tested                                     | COMPLETE — fail-closed Managed-Cloud provenance gate                                                                                 | **NEEDS_VALIDATION** — real logic exists, but its own regression tests are currently red (§4) |
| Egress allowlist (`trust-boundaries` package)                 | NOT_APPLICABLE                                                                                                             | COMPLETE, real consumer                                                                                              | NOT_APPLICABLE (no Local mode to guard)                                                       | COMPLETE, real consumer                                                                            | NOT_APPLICABLE (no Local-vs-cloud egress concept found)                                                                              | NEEDS_VALIDATION (not confirmed either way)                                                   |
| Cross-device sync (`packages/client/sync`)                    | PARTIAL — pull-only artifact-cursor consumer                                                                               | COMPLETE — real consumer (`cloudSyncEngine.ts`)                                                                      | NOT_APPLICABLE (no local persistence to sync)                                                 | COMPLETE — via Rust reimplementation, fixture-replay parity (§5)                                   | NOT_APPLICABLE — its own separate write-through mirror (`conversationSyncClient.ts`) via `cloud-contracts`, correctly not delta-sync | NOT_APPLICABLE                                                                                |
| Model registry / retirement migration                         | PARTIAL — ad hoc in `model-store.ts`, not shared                                                                           | PARTIAL — own equivalent, own tests                                                                                  | PARTIAL (inherits web when default)                                                           | PARTIAL — own equivalent, own tests                                                                | NEEDS_VALIDATION                                                                                                                     | NEEDS_VALIDATION                                                                              |
| Design tokens / UI primitives                                 | PARTIAL — 114-file real adoption, but ~95-119 hardcoded hex bypasses found                                                 | NOT_APPLICABLE (RN, own primitives) — but `design-tokens` CSS-var layer does reach mobile per package consumer count | inherits web's partial state by default                                                       | PARTIAL — 55-file real adoption, but ~252+ hardcoded hex bypasses found                            | **COMPLETE** — real, non-decorative token consumption (`tokens.ts`)                                                                  | COMPLETE — real consumption confirmed (`webviewContent.ts:11`)                                |
| Article 50 AI-content provenance marker                       | **BROKEN** — hand-restated duplicate, admits streamed text/audio unmarked, explicit-disclosure sentence removed 2026-08-14 | PARTIAL — real usage, but package's own serialization bug would break interop if ever compared to web's              | inherits web's broken state by default                                                        | NEEDS_VALIDATION — zero confirmed consumers                                                        | NEEDS_VALIDATION                                                                                                                     | NEEDS_VALIDATION                                                                              |
| Skills pipeline (`packages/tools/skills`)                     | COMPLETE (8 consumers)                                                                                                     | MISSING — no shared-package consumer found                                                                           | inherits web when default                                                                     | PARTIAL (2 consumers)                                                                              | MISSING                                                                                                                              | MISSING                                                                                       |
| MCP execution (`packages/tools/mcp`)                          | COMPLETE (12 consumers, contract-tested)                                                                                   | MISSING                                                                                                              | inherits web when default                                                                     | PARTIAL (3 consumers)                                                                              | MISSING (extension has its own CDP-based automation instead — different concern)                                                     | NEEDS_VALIDATION                                                                              |
| Enterprise licensing enforcement                              | MISSING (package unwired everywhere)                                                                                       | MISSING                                                                                                              | MISSING                                                                                       | MISSING                                                                                            | MISSING                                                                                                                              | MISSING                                                                                       |
| Agent runtime (planning/tool-loop/approvals)                  | own implementation (server-side)                                                                                           | own implementation                                                                                                   | inherits Tauri's or web's                                                                     | own implementation (Rust, `core/agi/`) — **no shared package, no cross-language parity test** (§6) | NOT_APPLICABLE (no autonomous agent loop; has a bounded CDP automation engine instead)                                               | own implementation                                                                            |

**Reading the matrix:** the strongest cross-surface story in the repo is the trust-boundary
enforcement row — genuinely COMPLETE on every surface that needs it, with VS Code's status
downgraded to NEEDS_VALIDATION not because the logic is wrong but because its test suite is
currently red (§4). The weakest is the "own implementation, no shared contract" pattern that
recurs three times: chat UI (partially, §1), model retirement (§7), and the agent runtime (§6).

---

## 3. What's genuinely strong here — say so plainly

This audit's brief explicitly asks for honest strengths, and there are real ones:

1. **The trust-boundary egress allowlist (`packages/contracts/trust-boundaries`) is the model
   case for how to fix exactly the kind of drift this audit hunts for.** Its own header comment
   documents the bug it replaced: desktop and mobile each hand-maintained an `OUR_CLOUD_HOSTS`-
   equivalent list, and they had drifted apart (desktop missing `vercel.app`, mobile missing
   `clerk.dev`/`clerk.services`) — a real potential Local-mode data leak in each direction. The
   fix reconciled both into a safe union in one platform-free TS module, consumed by both
   `apps/desktop/src/lib/egressGuard.ts` and `apps/mobile/lib/egressGuard.ts` at ~20-30 real call
   sites each. This is not a gap — it is evidence the team has already executed this exact
   remediation once and it held.
2. **`packages/client/sync`'s cross-language parity strategy (fixture-replay tests on both the TS
   and Rust sides) is the right pattern** for a problem that genuinely cannot be solved by a single
   shared binary. I'd like to see it applied to `packages/contracts/licensing` (§9 below) before
   that package is ever wired into an enforcement path, and its own CI-coverage completeness is
   worth a quick confirmation (`CROSS-SURFACE-011`, P3).
3. **The platform capability matrix (`packages/contracts/types/src/capabilities.ts`) is
   well-designed**, not decorative: it's explicitly scoped to the platform axis only (deliberately
   orthogonal to model capabilities and feature flags), documents its own spec-silent cells, and
   is the correct layering pattern (`isCapabilityEnabled(platform, cap)` first, narrower gates
   second). Shared UI is instructed to consume this instead of `platform === 'desktop'` string
   branches.
4. **Desktop's Tauri↔Electron IPC wiring gates (`check-wiring.sh` for Tauri,
   `wiring-allowlist.json`) are a real, self-enforcing drift-prevention mechanism** — a reachability
   walk from the actual entry point, not a lexical presence check, with a "may only shrink" rule on
   the allowlist. This is worth holding up as the pattern other shared-contract problems in this
   repo (composer feature parity, model-retirement logic) should eventually adopt.
5. **The Chrome extension is far more capable than its 5-row prior-art tracking suggested.** It is
   a ~35,000-line hand-built MV3 application with real CDP-based browser automation, a fail-closed
   Managed-Cloud provenance gate, and 1,549 passing tests — not a thin wrapper. Its composer drift
   (§1, `CROSS-SURFACE-002`) is real, but it should be read against that baseline, not as evidence
   the extension is thin.
6. **Mobile is the most mature surface in the monorepo per its own inventory**, and my read of its
   cross-surface-relevant pieces (trust-boundary enforcement in the send path, the physically
   separate local/cloud memory stores with tombstone-based delete propagation, the deep-link
   contract test that reads the real Swift source off disk) backs that up.

---

## 4. VS Code extension: a real trust-boundary safety net is currently blind

`apps/extension-vscode` shipped a genuinely good security-hardening change two days before this
audit (commit `1e858a7f1`, 2026-08-13): `Config.model()` was switched from reading VS Code's
merged/workspace config to `getUserScoped()` (global-scope only, via `.inspect()`), specifically
to stop a checked-out repo's `.vscode/settings.json` from silently moving a user's
Local/BYOK/Managed-Cloud trust boundary. That's the right fix for a real risk class.

The problem: the two test files that exercise exactly this logic —
`chatParticipant.test.ts` (local-model authority resolution) and `usageMeterTrustBoundary.test.ts`
(the Local/BYOK/Managed-Cloud usage-meter pill) — mock only `.get()`, not the new `.inspect()`
path. Under the new code, `Config.model()` silently falls back to `'auto'` inside these tests, so
12 of the suite's assertions now fail for a reason unrelated to what they were written to catch.
`npx vitest run` at `apps/extension-vscode` reproduces **17 failing / 862 passing**.

This matters specifically for this domain because trust-boundary labeling correctness is the one
invariant `CLAUDE.md` and `AGENTS.md` treat as non-negotiable across every surface. Right now, a
second, real regression in VS Code's Local-vs-Cloud labeling would ship undetected. Filed as
`CROSS-SURFACE-006`, P1 — the fix itself is small (update two test mocks to also stub
`.inspect()`), but the exposure window matters.

---

## 5. Cross-device sync: sound design, one open verification question

`packages/client/sync` (717 lines across `cursor.ts`, `conversations.ts`, `messages.ts`,
`memory.ts`, `projects.ts`, `settings.ts`) is real, well-tested, cursor-based delta-sync apply
logic — bigint `server_version` comparisons (explicitly guarded against the "9" vs "10"
lexicographic-compare bug), three-way JSON settings merge with prototype-pollution-safe key
filtering, last-observed-server-revision tiebreaking. It is genuinely last-writer-wins-by-revision,
not a CRDT, and that's an honest, defensible choice for this problem.

Mobile is a real consumer (`cloudSyncEngine.ts`). Desktop's Rust side (`cloud_sync.rs`)
independently reimplements the same rules — necessarily, since Rust cannot import a TS module —
with parity kept honest by a shared golden-fixture replay suite on both sides. Web only consumes
cursor mechanics for a pull-only artifact overlay; conversation/message persistence stays
server-owned for web, which is architecturally correct (web has no local store to reconcile).

The one open question I could not close in this pass's tool budget: does CI actually run _both_
the TS vitest suite and the Rust `cfg(test)` fixture-replay module whenever either side's fixtures
or logic change, or could one drift silently ahead of the other? Filed as `CROSS-SURFACE-011`
(P3) — explicitly flagged NEEDS_VALIDATION rather than asserted as broken, since I did not
locate and read the specific CI workflow file in this pass.

---

## 6. The agent runtime has no shared contract at all

`packages/ai/agent-core` is named like it should be the shared agentic execution engine. It is
not: it contains exactly two substantive files (`context.ts` for context-window budgeting,
`memory.ts` for memory-relevance scoring). A repo-wide grep for
`tool.?loop|subagent|checkpoint.*resume|approval.*gate` across `packages/ai/*` turns up only
incidental string matches, not an implementation. `packages/ai/provider-runtime`'s own `AGENTS.md`
describes it as owning "AGI-owned tool-loop scaffolding," but its actual contents are
streaming/retry/failover/gateway/watchdog modules — no loop control flow either.

The real agent loop — planning, tool-call sequencing, checkpoint/resume, approval gates — lives
independently inside each app's native layer: Desktop's Rust `core/agi/` (with its own,
separately-tracked `checkpoint_*` vs `coding_checkpoint_*` duplication noted in the Tauri
inventory), and the CLI's Rust `src/agent/`. There is no shared TS package, and — unlike
`packages/client/sync`'s cross-language cursor/settings contract — **no fixture-replay or contract
test verifying that two surfaces' agent loops apply the same approval-gate rules or checkpoint
semantics.** If Desktop's agent loop and a future Web/Mobile agentic surface diverge on when a
tool call requires approval, nothing in the repo's test suite would catch it.

This is not asserted as currently causing a visible behavioral bug — no such bug was found in this
pass — but the absence of any shared contract for a capability this safety-relevant is itself the
finding. Filed as `CROSS-SURFACE-014`, P2 (architecture-gap, not a functional break).

---

## 7. Duplicated/drifted implementations — summary table

| Implementation                                       | Surfaces involved                                                     | Drift status                                                                                                          | Gap ID                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Chat UI (message rendering + composer)               | Web-primary vs. Desktop/Web-secondary vs. Mobile vs. Chrome ext       | **Actively drifted** — web-primary duplicate 2.4-2.5x larger than shared equiv; extension missing 6 composer controls | `CROSS-SURFACE-001`, `CROSS-SURFACE-002` |
| Article 50 provenance marker                         | Web (hand-restated) vs. Mobile (real usage of shared pkg)             | **Broken interop** — shared package's own serialization bug + web's independent duplicate                             | `CROSS-SURFACE-005`                      |
| Egress allowlist (`trust-boundaries`)                | Desktop vs. Mobile                                                    | **Historical drift, already fixed** — cited as the model remediation case, not a live gap                             | — (strength, §3)                         |
| Cloud-sync apply logic (`client/sync`)               | Web (partial) vs. Mobile (TS) vs. Desktop (independent Rust reimpl)   | Not drifted today; parity depends on a fixture-replay test whose CI coverage is unconfirmed                           | `CROSS-SURFACE-011`                      |
| Enterprise licensing                                 | TS package vs. Rust crate                                             | Both real, both unwired, **no parity test between them at all** (unlike sync)                                         | `CROSS-SURFACE-009`                      |
| Model retirement/migration                           | Web vs. Desktop vs. Mobile                                            | Each surface independently reimplements the same "is this model still current" check                                  | `CROSS-SURFACE-010`                      |
| Agent runtime (planning/approvals/checkpoints)       | Desktop (Rust) vs. CLI (Rust) vs. any future Web/Mobile agent surface | No shared package, no contract test at all                                                                            | `CROSS-SURFACE-014`                      |
| `api-gateway` REST routes vs. `apps/web` Next.js API | Backend topology, not client surfaces                                 | Two live implementations of the same route families; unclear which one production traffic actually hits               | `CROSS-SURFACE-008`                      |
| Provider request-shaping (`provider-protocol`)       | Web only; Mobile/Extension unconfirmed                                | Open question, not a confirmed duplication                                                                            | `CROSS-SURFACE-015`                      |

---

## 8. What NOT to copy from the benchmark

`research/cross-cutting-and-complaints.md` documents two live, unresolved desktop-vs-web parity
bugs at both ChatGPT and Claude as of the research date — OpenAI's new unified desktop app
reportedly shipping without a working Chat mode on some versions, and a reported Claude-Chrome
sidebar bug that can lose an entire conversation because it wasn't stored in chat history. Neither
vendor had a public resolution timestamp. The lesson for this repo is not "match their bar" — it's
lower than this repo's actual chat-availability track record across surfaces — but rather:
**cross-surface parity bugs are apparently hard to keep out even for well-resourced incumbents,
which is exactly why the mechanical drift-prevention patterns already proven in this repo
(wiring-allowlist.json's reachability walk, trust-boundaries' historical remediation, sync's
fixture-replay) are worth extending to the areas that don't have them yet (composer parity, model
retirement, the agent runtime) rather than assuming manual vigilance will hold.**

The anti-pattern catalogue in that same document (§8: don't rename a core surface without a
migration story, don't default a chat product to a non-chat mode, don't bury a paid feature behind
an undiscoverable settings flag) is a useful checklist for this repo's own Electron
Local/Cloud-toggle silent-no-op finding (`CROSS-SURFACE-004`) — it is the same class of "a control
that looks live but silently doesn't do what it says" defect the benchmark's own users are
complaining about, just in a different feature.

---

## 9. Evidence index (files opened/verified directly in this pass)

- `apps/web/features/chat/pages/WebChatPage.tsx`, `.../components/messages/{MessageBubble,ChatMessageList}.tsx`, `.../components/Composer/ChatComposerNew.tsx` — line counts confirmed via `wc -l`
- `packages/ui/unified-chat/src/components/{MessageBubble,ChatInput,ChatInterface,MessageList}.tsx` — line counts confirmed
- `apps/mobile/src/lib/capabilities.tsx:6` — RN/react-dom comment confirmed
- `apps/extension/src/side_panel.ts:9340-9365` — mirror comment confirmed verbatim; `apps/extension/package.json` react-dependency absence confirmed by grep
- `apps/desktop/electron/main.ts:1-40` — hosted-web-app-by-default header comment read directly
- `packages/contracts/trust-boundaries/src/egress-policy.ts` — full header + `OUR_CLOUD_HOSTS` read directly; consumer list confirmed by grep (`apps/desktop/src/lib/egressGuard.ts`, `apps/mobile/lib/egressGuard.ts`)
- `packages/client/sync/src/*.ts` — line counts and consumer list confirmed by `wc -l` / grep
- `packages/contracts/types/src/capabilities.ts` — header + capability list read directly
- `apps/extension/src/features/cloud-bridge/conversationSyncClient.ts` — read directly, confirmed it uses `@agiworkforce/cloud-contracts`, not `@agiworkforce/sync` (correctly, not a duplication)
- Hardcoded-hex spot check: `grep -rEo "#[0-9a-fA-F]{6}\b" apps/desktop/src` (252 hits) and the equivalent for `apps/web/features`+`apps/web/shared` (95 hits) — run independently, same order of magnitude as the inventory's 294/119
- `audit/parity-2026-08-15/gaps/done-claim-verification.md` — GAP-210 pairing-copy-drift finding read in full and cited as prior art
- `audit/parity-2026-08-15/inventory/{shared-packages,desktop-electron,desktop-tauri,mobile,extension-chrome,extension-vscode,runtime-infra}.md` — read in full or targeted sections as cited per-gap above

---

## 10. Gap severity summary

| Severity | Count | IDs                                                                  |
| -------- | ----- | -------------------------------------------------------------------- |
| P1       | 3     | `CROSS-SURFACE-001`, `CROSS-SURFACE-005`, `CROSS-SURFACE-006`        |
| P2       | 8     | `CROSS-SURFACE-002`, `003`, `004`, `007`, `008`, `010`, `012`, `014` |
| P3       | 4     | `CROSS-SURFACE-009`, `011`, `013`, `015`                             |

No P0 filed. Nothing found in this domain rises to "blocks a primary workflow" — every surface's
own chat/core loop works; the gaps here are architectural drift risks, a currently-blind test
suite, and one genuine legal-compliance interoperability break (`CROSS-SURFACE-005`), which is P1
rather than P0 because it does not prevent any user from completing a core task.
