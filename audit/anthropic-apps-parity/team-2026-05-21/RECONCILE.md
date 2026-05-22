# RECONCILE.md — fresh team vs May-20 baseline

**Date:** 2026-05-21
**Inputs to reconcile:**

- This team's 12 fresh reports (`audit/anthropic-apps-parity/team-2026-05-21/{img,src}-{1..6}-report.md`)
- May-20 baseline: `audit/anthropic-apps-parity/{competitive-baseline,surface-gap-ledger,feature-ledger}-2026-05-20.md` (+ application-suite-thesis, compute-artifacts, sdk-strategy)
- `docs/design/design-spec-2026-05-15.md` (where applicable)
- `reports/frontend-parity-r1/GAP_MATRIX.md` (referenced; no on-disk read needed for this reconcile)

Format: agreement points first (≥3, with citation pairs), then disagreements (each with a 1-sentence resolution).

---

## Agreements (fresh team ↔ May-20 baseline)

### A1. Projects are a cross-surface gap with multiple owners and no single sync model

- **May-20 (`surface-gap-ledger.md:22-27`):** "No single cross-surface project sync owner. Web/mobile client stores can remain local-only despite cloud APIs." Lists Desktop SQLite + Web `/api/projects` + Mobile MMKV + CLI trust registry + Supabase migration as parallel owners.
- **Fresh team:** `src-1` flags absence of a `Projects` component in `packages/unified-chat` (32h gap). `src-2` flags Projects not in default `/chat` sidebar (P0, 18h). `src-4` shows mobile projects exist locally but per-project files/instructions schema unclear (P1, 10h). `src-5` and `src-6` both flag Projects absent in extensions (P0, 24h and 16h).
- **Resolution:** Both audits agree Projects is a P0 cross-surface gap; the fresh team adds package-level granularity (a shared Projects component would close most per-surface gaps at once).

### A2. Artifacts are a cross-surface partial — versioning + publish + live preview are missing

- **May-20 (`feature-ledger.md:24-26`):** Artifacts marked "Partial" against the official source `https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them`. `surface-gap-ledger.md:27-29` says "Mobile, VS Code, and Chrome do not yet appear to have Claude-style durable artifacts. Web artifacts are client-state/code-fence extracted and persistence is not clearly connected to cloud data."
- **Fresh team:** `src-1` confirms `ArtifactPanel.handlePublish` is a no-op stub (P0, 24h), `ArtifactPanel` iframe omits `allow-scripts` so live React/HTML preview doesn't run in the canonical panel (P0, 16h), and no version-history navigator (P1, 12h). `src-2` mirrors: no version tabs, no live preview, no publish (P0, 30h). `src-3` confirms desktop has the strongest version-history support but is missing "Remix" affordance (P1, 3h). `src-4` confirms mobile is read-only by intentional carve-out but lacks HTML/SVG/Mermaid rendering (P1, 24h).
- **Resolution:** Both audits agree Artifacts is a major partial; fresh team specifies the exact missing primitives (publish stub, no-allow-scripts iframe, no version-history navigator, no "Remix") that block parity.

### A3. Connectors / MCP — the v1 gap is custom-MCP entry + per-tool granular permissions, not breadth

- **May-20 (`surface-gap-ledger.md:29-31`):** Notes desktop has "MCP config, registry, OAuth, credentials, permissions, bundles, and self-hosted server commands" but "`services/api-gateway/src/routes/agents.ts` and `services/api-gateway/src/mcp/mcpRoutes.ts` exist but are not mounted." `competitive-baseline-2026-05-20.md:45` ("Connectors") flags the distinction between remote synced connectors and local desktop extensions.
- **Fresh team:** `img-1` documents the per-connector permission ladder (read-only "Always allow" vs write-delete "Needs approval", P0, 40h) and the custom-MCP modal trust copy (P0, 28h). `img-2` flags the custom-connector entry path in the directory header as the load-bearing affordance (P0, 8h). `src-1` confirms no connector list / OAuth in `packages/unified-chat`. `src-3` shows desktop is close to parity (P2, 0h) with custom remote-MCP dialog already present.
- **Resolution:** Both agree connector breadth (~150 in Claude) is not the v1 bar; what matters for v1 parity is **the directory shell + custom-MCP entry + per-tool granular permissions**, which the May-20 ledger and the fresh team's row-level work both flag.

### A4. Mobile is locked to local-only v1; billing and connectors are intentionally gated off

- **May-20 (`surface-gap-ledger.md:33`):** "Mobile v1 intentionally hides BYOK/cloud through feature flags."
- **Fresh team:** `src-4` reads `apps/mobile/lib/v1FeatureFlags.ts:22-70` and confirms `cloudChat`, `billing`, `auth`, `byokKeys`, `agents`, `dispatch`, `connectorsCloudOnly`, `webSearch`, `computerUse`, `imageGen`, `crossDeviceSync` all default `false`. Many surfaces are coded but runtime-gated.
- **Resolution:** Both agree on the v1 mobile posture; fresh team adds the **P0 correctness finding** that `ProPlusPaywall.tsx:78-84` opens an external pricing URL (40h to wire StoreKit IAP). The May-20 ledger does not call this out at the same severity — see Disagreement D1.

### A5. CLI is the parity engine; multiple surface flows must align

- **May-20 (`feature-ledger.md:15-18`):** "Claude Code overview/project awareness/MCP" — Partial. "Built-in slash commands — 83-command registry, shared TUI/REPL runtime, custom commands, MCP prompt commands" — Partial. "Custom slash commands — `.agiworkforce/commands`, imported `.claude/commands`, user commands" — Gap. "MCP prompts as slash commands — Dynamic `/mcp__server__prompt` commands" — Gap.
- **Fresh team:** `img-4` documents ~70 commands in Claude Code v2.1.128. Notes substantial parity work: `/agents` (30h), `/skills` (24h), `/plugin` (54h subsystem), `/mcp` (46h), `/permissions` (24h), `/plan` (12h), `/hooks` (14h), `/memory` (30h), `/context`+`/rewind` (36h), `/init` (12h), `/tasks` (24h).
- **Resolution:** Both agree CLI slash-command breadth is the heaviest CLI-side parity item; fresh team adds per-command hour estimates that ladder up to ~500h within the v1 local-only filter (cloud-dependent commands subtracted).

### A6. Web/Mobile/Desktop chat sync is the canonical app-tier; CLI/VS Code/Chrome are workspace/task-scoped

- **May-20 (`competitive-baseline-2026-05-20.md:9-37`):** "Locked AGI Product Decision — Normal chat sync is only for: Web, Mobile, Desktop. Developer and context-capture surfaces do not silently join global chat history." Explicit table mapping CLI/VS Code/Chrome to local/workspace/task scope.
- **Fresh team:** Fresh reports preserve this boundary. `src-2` for web, `src-3` for desktop, `src-4` for mobile all design against the synced-chat assumption. `src-5` (Chrome ext) and `src-6` (VS Code ext) keep workspace/task scope and explicitly do not auto-sync. `src-6` notes the sidebar webview does not persist to `ConversationStore` (which only the `@agi` Copilot path does), matching the May-20 boundary.
- **Resolution:** Both agree on the sync boundary; fresh team's surface-by-surface review confirms the boundary is implemented (even if some surfaces have inconsistencies within their own scope, e.g. VS Code sidebar vs Copilot path).

### A7. Token-system / design-system fragmentation is a real defect

- **May-20 (`docs/design/design-spec-2026-05-15.md`):** establishes design-tokens as the canonical surface. (Not a verbatim quote — referenced as the design-spec baseline.)
- **Fresh team:** `src-1` documents three parallel color-token families coexisting inside `packages/unified-chat` (`--chat-*`, shadcn `hsl(var(--popover))`, hardcoded `ReactPreview` dark). Concrete file:line evidence at `SlashCommandMenu.tsx:51-94`, `KeyboardShortcutsDialog.tsx:97-156`, `BranchNavigator.tsx:82-115`, `ChatInputToolbar.tsx:30-209`, `InlineToolCall.tsx:281-345`, `ReactPreview.tsx:53-55`. Calls out the unification as P0 (16h) prerequisite for pixel-parity work.
- **Resolution:** May-20 ledger does not explicitly flag the multi-system fragmentation as a P0 — fresh team **adds this finding**, and it is the load-bearing pre-req for the next round of surface work.

---

## Disagreements (with 1-sentence resolution)

### D1. Mobile StoreKit IAP — severity escalation

- **May-20:** `surface-gap-ledger.md:33` mentions "Mobile v1 intentionally hides BYOK/cloud" but does **not** flag the existing `ProPlusPaywall.tsx` external-URL redirect as an App-Store blocker.
- **Fresh team:** `src-4` finds `ProPlusPaywall.tsx:78-84` opens an external pricing URL via `openExternalUrl`, marks it **P0** (40h) as a direct violation of Apple Guideline 3.1.1, and notes it contradicts memory lock "StoreKit IAP default globally at 15% via Apple Small Business Program."
- **Resolution:** Fresh team is correct — this is a submission-blocking issue and must be P0; update the May-20 ledger to elevate.

### D2. Desktop is _not_ the strong-parity surface — it has placeholder mode surfaces

- **May-20 (`surface-gap-ledger.md:27-34`):** Presents desktop as the leader across artifacts, projects, MCP, memory, computer-use, browser-automation, voice — i.e. the parity-strongest surface.
- **Fresh team:** `img-1` documents that Claude desktop ships **three modes** (Chat / Cowork / Code), and `src-3` confirms our v3 shell `DesktopShellV3.tsx:117-145` has Cowork and Code as **placeholder text ("coming")**. That makes desktop a substantial Gap on the Cowork/Code halves of the surface even though Chat-mode parity is strong.
- **Resolution:** Fresh team adds nuance — desktop is parity-strong on Chat mode, but Cowork/Code modes are placeholders; severity is P0 to bring them out of placeholder if Cowork/Code parity is targeted.

### D3. Settings is _not_ a partial — it is a P0 architectural gap

- **May-20:** Implicit. `surface-gap-ledger.md` lists Settings as a host responsibility under each surface; no explicit "Settings UI" row in `feature-ledger.md`.
- **Fresh team:** `src-1` finds `SettingsModal.tsx:1-22` is a pure `window.dispatchEvent('chat:action')` stub — there is **no actual settings UI in the unified-chat package**. Every host (`src-2` web, `src-3` desktop, `src-4` mobile, `src-5` Chrome ext, `src-6` VS Code ext) implements its own settings UI, producing significant visual drift. Marked P0 (40h to build shared shell).
- **Resolution:** Fresh team is correct — Settings is a P0 architectural item; treat it as a cross-surface unification investment rather than a per-surface polish.

### D4. Memory editor parity gap is bigger than baseline suggests

- **May-20 (`surface-gap-ledger.md:31`):** "Sync is mostly status/counting today. Desktop privacy export does not obviously cover every memory/artifact/team table."
- **Fresh team:** `src-1` and `src-2` both find **no Memory list/edit/delete UI** anywhere — closest is `PromptStash` (local prompts), which is not the same primitive. `src-2` explicitly: no `/settings/memory` page in web. `src-4` mobile has local memory + import but no cross-conversation memory editor as Claude exposes.
- **Resolution:** Fresh team confirms baseline's "Partial" understates the parity gap; a Memory editor surface is missing in the shared package (24h) and per-host (24h web, 16h vscode-ext, ~24h chrome-ext).

### D5. Composer drag-drop + paste-image + thumbnail preview is a P0 gap, not P1 polish

- **May-20:** Composer attachments not explicitly enumerated as a parity gap.
- **Fresh team:** `src-1` reads `ChatInput.tsx:239-252, 244` and finds the file input is `accept`-list-driven only — **no drag-drop handler, no paste-from-clipboard, no inline thumbnail preview** in the canonical composer. Claude desktop/web ships all three. Marked P0 (8h).
- **Resolution:** Fresh team adds this finding; treat as P0 because attachments are a primary chat-input gesture and absence is immediately visible.

### D6. Chrome extension Ask-vs-Act permission pill — fresh team finds it absent

- **May-20:** Treats Chrome extension as the WebMCP + native-bridge surface; does not flag the Ask-vs-Act permission pill as a missing primitive.
- **Fresh team:** `img-5` and `img-6` cross-surface synthesis flag the **Ask before acting / Act without asking** permission pill (Chrome side-panel, in-stream permission cards with ⏎/Esc/⌘⏎ keyboard ladder) as a **first-class composer affordance** in Claude. `src-5` confirms no Ask/Act toggle exists in `apps/extension`. Marked P0 (16h core toggle + 32h in-stream prompts).
- **Resolution:** Fresh team is correct — this is a P0 visible-missing gap for the Chrome ext; baseline did not catch it.

### D7. VS Code "Add file or image" is a correctness defect, not a polish gap

- **May-20:** Notes IDE agent mode for VS Code; no specific defect on Add-file/Image labelling.
- **Fresh team:** `src-6` reads `webviewContent.ts:373-390, 924-932, 1348-1377` and `ChatStateManager.ts:438-451` and finds the "Add file or image" button **only pins file paths** — no image bytes are read, no preview shown, no transmission as base64 in the chat payload. **The label is misleading.** Marked P0 (14h).
- **Resolution:** Fresh team is correct; this is a labelling defect with parity implications; either rename the button (cheap) or implement image attach (expensive).

### D8. Custom slash commands — feature-ledger marks Gap, fresh team confirms partial coverage on web

- **May-20 (`feature-ledger.md:18`):** "Custom slash commands — Gap."
- **Fresh team:** `src-2` reads `SlashCommandMenu.tsx:16-22, 36-50` and finds 5 built-ins **plus** user `customCommands` from `useSettingsStore.customCommands` — i.e. **user-defined slash commands ARE supported on web**, but stored client-side only (no cross-device sync). `apps/web/features/chat/components/shortcuts/PromptShortcuts.tsx` + `dialogs/CustomShortcutDialog.tsx` are the user-defined slash command editors.
- **Resolution:** Update May-20 ledger from "Gap" to "Partial" — custom commands exist but are local-storage only; sync is the remaining work.

### D9. Web has a dual-pipeline build that materially shadows route work

- **May-20:** Not flagged.
- **Fresh team:** `src-2` reads `apps/web/package.json:8` and finds the web build runs `apps/desktop`'s Vite first and copies it into `apps/web/public/chat` before `next build`. Default `/chat` thereby has a Next-route AND a desktop-driven SPA bundle competing. This is an architectural risk because Next routing may be shadowed by the SPA `index.html` in some deploy modes.
- **Resolution:** Fresh team adds this — assign clarification to platform lead before any web parity work is committed.

### D10. v3 / unified shell adoption is uneven — fresh team finds default `/chat` runs the web-local fork

- **May-20:** Treats `WebShellV3` + `ChatInterface` from `@agiworkforce/unified-chat` as the canonical web surface.
- **Fresh team:** `src-2` finds `apps/web/app/chat/page.tsx:15-19` selects **`WebChatPage` by default** (web-local components), gating `UnifiedChatPage` behind `?unified=1` query param. So most of `/chat` traffic does **not** consume `unified-chat`. Any parity work on the default surface is invisible to the opt-in surface and vice versa.
- **Resolution:** Fresh team is correct; flag for platform lead to decide whether to retire the web-local fork or roll forward the unified shell as the default — pick one to avoid double-spend.

---

## Synthesis-of-the-reconcile

- The **fresh team agrees on the broad strokes** of the May-20 baseline (Projects/Artifacts/Connectors/MCP/Sync-boundary), and **adds concrete file:line gaps** the baseline did not have.
- The fresh team **upgrades severity** on three baseline-tracked items: Mobile StoreKit IAP (D1, now P0), Settings shared shell (D3, now P0), Memory editor (D4).
- The fresh team **introduces three new findings** not in the baseline: token-system fragmentation (A7), composer attachment gestures (D5), Chrome ext Ask/Act pill (D6).
- The fresh team **provides per-row hour estimates** that the May-20 baseline did not contain — these feed `EXEC-SUMMARY.md`.

---

## End of RECONCILE.md
