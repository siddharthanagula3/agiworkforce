# EXEC-SUMMARY.md — `claude-parity-2026-05-21`

**One-line executive line:** Closing Claude parity across 6 surfaces is a **~3,136 engineering-hour** investment, dominated by `apps/desktop` (833h, mostly Cowork/Code mode build-out) and `apps/cli` (658h, mostly slash-command + subsystem parity), with the highest-ROI P0 items concentrated in the **shared `packages/unified-chat`** layer.

---

## Top-10 P0 gaps, ranked by impact / hours

> Ranking heuristic: gap **breaks parity on the most surfaces per hour**. Items that close a primitive used by every surface (shared package, IAP, settings shell) rank above items that close one surface's specific feature.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                           | Surfaces affected                                        | Hours                                                                                                                           | Why this ranks here                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Mobile StoreKit IAP** — replace external pricing-URL redirect in `apps/mobile/src/features/paywall/components/ProPlusPaywall.tsx:78-84` with native StoreKit (`@expo/store-kit` or `react-native-iap`), wire restore-purchase, receipt validation, paywall sheet.                                                                                                           | mobile                                                   | **40**                                                                                                                          | Submission-blocking under Apple Guideline 3.1.1. Direct contradiction with locked memory ("StoreKit IAP default globally at 15% via Apple Small Business Program"). No parity is possible if the app cannot ship. |
| 2   | **Token-system unification in `packages/unified-chat`** — collapse three coexisting color families (`--chat-*`, shadcn `hsl(var(--popover))`, hardcoded `ReactPreview`) into one canonical token set.                                                                                                                                                                         | shared-package (all 6 consumers)                         | **16**                                                                                                                          | Pre-req for any pixel-parity. Highest ROI: 16 hours unlocks coherent visual work across web + desktop + extension webviews.                                                                                       |
| 3   | **Composer drag-drop + paste-image + inline thumbnail preview** in `unified-chat` `ChatInput.tsx` — add `onDragOver/onDrop` handlers, `onPaste` clipboard handler, thumbnail strip above textarea.                                                                                                                                                                            | shared-package + web + desktop + chrome-ext + vscode-ext | **8 (shared) + 13 (chrome-ext fix) = 21**                                                                                       | Highly visible: every Claude surface accepts drag/drop and paste. Chrome ext fix is a correctness bug (`pendingAttachments` never forwarded in `CHAT_MESSAGE`).                                                   |
| 4   | **Shared Settings shell** in `unified-chat` — replace `SettingsModal.tsx:1-22` event-dispatcher stub with a real settings shell (Profile, Capabilities, Connectors, Permissions, Appearance, Speech language).                                                                                                                                                                | shared-package (all 6)                                   | **40**                                                                                                                          | Today every host (web/desktop/mobile/extension/vscode) reimplements settings → visual drift + double-spend on every change. One shell makes all surface settings polishable in one place.                         |
| 5   | **Settings depth on web** — `apps/web/app/settings/*` has 4 pages with inline styles; add Profile (avatar/name), Connections, Privacy/Data Controls, Memory, Notifications; persist theme via `next-themes`.                                                                                                                                                                  | web                                                      | **28**                                                                                                                          | Most visible Claude-parity gap on web. Settings is the most-visited non-chat surface.                                                                                                                             |
| 6   | **Memory editor surface** in `unified-chat` — list/edit/delete cross-conversation memory facts; expose "View your memory" entry from Capabilities (matching `mobile/claude-ios/12_*`).                                                                                                                                                                                        | shared-package + web + chrome-ext + vscode-ext           | **24 (shared) + 24 (web) = 48**                                                                                                 | Claude exposes memory controls in Settings; AGI has only a local `PromptStash` (different primitive). Web has nothing; extensions have nothing.                                                                   |
| 7   | **Artifacts — versioning + live React/HTML preview + publish** in `unified-chat` `ArtifactPanel.tsx` — add version-stepper toolbar, enable `allow-scripts` for sandboxed live preview (with referrerPolicy + isolated theme), wire `handlePublish` to share-link service.                                                                                                     | shared-package + web + desktop                           | **24 (publish) + 16 (live preview) + 12 (version history) + 30 (web) = 82**                                                     | Claude's three signature artifact affordances (`< >` carets, source↔preview eye toggle, Publish-to-URL). Today every is a stub or absent.                                                                         |
| 8   | **CLI slash-command palette (~70 commands)** in `apps/cli` — implement the v1-relevant subset of `/init`, `/permissions`, `/mcp`, `/agents`, `/skills`, `/plugin`, `/plan`, `/tasks`, `/memory`, `/context`+`/rewind`, `/hooks`, `/branch`, `/resume`, `/clear`, `/compact`, `/recap`.                                                                                        | cli                                                      | **80 (catalog) + 200 (heavy primitives ≈ /agents+/skills+/plugin+/mcp+/permissions+/plan+/memory+/context+/tasks+/init) = 280** | Claude Code is the parity engine. Any CLI shipping <20 commands is materially behind.                                                                                                                             |
| 9   | **Desktop Code mode surface** — replace `DesktopShellV3.tsx:117-145` "coming" placeholder with sessions list, repo+branch+worktree picker, permission-mode menu (Ask/Accept edits/Plan/Auto/Bypass), Model × Effort matrix, stats heat-map, and 4-bar usage popover.                                                                                                          | desktop                                                  | **80 (3-mode shell) + 32 (Models×Effort) + 40 (stats dashboard) + 18 (usage popover) = 170**                                    | One of Claude desktop's three top-level products; today entirely a placeholder.                                                                                                                                   |
| 10  | **Desktop Customize hub (Skills / Connectors / Plugins)** — left-nav with vertical categories, right pane with 3-card CTAs (Connect your apps / Create new skills / Browse plugins); per-connector permission detail page (read-only group "Always allow" + write-delete group "Needs approval" with per-tool quick actions); Skill detail (SKILL.md + README 3-column view). | desktop                                                  | **48 (hub) + 40 (per-connector detail) + 32 (skill detail) + 28 (custom remote MCP modal copy) = 148**                          | "Connectors moved to Customize" is the IA pivot in Claude desktop; AGI desktop's Settings → Connectors is partial without the Customize hub.                                                                      |

**Top-10 P0 sum: 893 hours.** This is the floor for a v1 Claude-parity shipping bar.

---

## Grand total — full hour reconciliation

The grand total is the **arithmetic sum of every per-row Hours cell** across `SYNTHESIS.md` sections A through G:

| Section / surface                                                      | Hours           |
| ---------------------------------------------------------------------- | --------------- |
| A. Shared package (`packages/unified-chat` + `packages/design-tokens`) | 347             |
| B. `apps/web`                                                          | 252             |
| C. `apps/desktop`                                                      | 833             |
| D. `apps/mobile`                                                       | 392             |
| E. `apps/cli`                                                          | 658             |
| F. `apps/extension` (Chrome MV3)                                       | 433             |
| G. `apps/extension-vscode`                                             | 221             |
| **Grand total**                                                        | **3,136 hours** |

> Showing the work — the per-section subtotals are themselves arithmetic sums of every row's Hours cell in `SYNTHESIS.md`. (For example: shared-package = 16 + 18 + 40 + 32 + 32 + 24 + 24 + 24 + 16 + 24 + 8 + 3 + 12 + 8 + 6 + 16 + 24 + 12 + 8 = 347.)

### Reconciliation with teammate self-reports

| Slot                        | Self-reported subtotal | Note                                                                         |
| --------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| img-1                       | ≈ 822h                 | Claude desktop core (image-side observation roll-up)                         |
| img-2                       | 190h                   | Claude artifacts + connectors (P0=8 + P1+P2 spread)                          |
| img-3                       | ≈ 250h                 | Claude mobile iOS image-side                                                 |
| img-4                       | ≈ 535h                 | Claude CLI (full v2.1.128; before v1 cloud-only subtraction)                 |
| img-5                       | ≈ 410h                 | Claude web + Chrome ext + VS Code ext                                        |
| img-6                       | 0h                     | Pattern doc only (per brief)                                                 |
| src-1                       | ≈ 476h                 | `packages/unified-chat`                                                      |
| src-2                       | 214h                   | `apps/web` (parity rows only; +5h incidental bugs filed separately)          |
| src-3                       | 25h                    | `apps/desktop` source-side (mostly inverse: AGI exceeds Claude in most rows) |
| src-4                       | 164h                   | `apps/mobile` (StoreKit P0 = 40h dominates)                                  |
| src-5                       | ≈ 340h                 | `apps/extension` (Chrome MV3)                                                |
| src-6                       | ≈ 222h                 | `apps/extension-vscode`                                                      |
| **Teammate self-total sum** | **≈ 3,648h**           |                                                                              |

**Why the synthesis total (3,136h) is lower than the teammate self-total sum (3,648h):**

1. Cross-validated rows are counted once at the most-canonical layer (e.g. tool-call renderer consolidation lives in `src-1` at 18h; the per-surface `src-2`/`src-3`/`src-4`/`src-5`/`src-6` reports each note this as a knock-on but the synthesis attributes the hours to the shared package only).
2. Image-side estimates for CLI (img-4 = 535h) include cloud-only commands (`/teleport`, `/remote-control`, `/upgrade`, `/install-*`, `/voice`, `/mobile`, `/desktop`, `/usage`, `/ultrareview`, `/extra-usage`, `/stickers`, `/passes`, `/powerup`, `/install-slack-app`, `/install-github-app`). Lead filter for v1 local-only subtracts these (≈ 100-120h saved).
3. Image-side estimates for desktop (img-1 = 822h) include items already implemented in `apps/desktop` (e.g. inline tool prompts = `apps/desktop/src/features/chat/Cards/ApprovalRequestCard.tsx` exists; src-3 rates this at 0h while img-1 conservatively estimates 28h).

The synthesis number is the load-bearing parity-cost figure; the per-row trail in `SYNTHESIS.md` carries the math.

---

## Subtotals by severity (synthesis matrix)

| Severity  | Hours            | Note                                                                          |
| --------- | ---------------- | ----------------------------------------------------------------------------- |
| P0        | 2,155            | Visible-missing core features; blocks v1 parity                               |
| P1        | 935              | Visible UX gaps; workflow exists                                              |
| P2        | 40               | Polish                                                                        |
| Done / 0  | 6 zero-hour rows | Intentional carve-outs, parity already met, or items where AGI exceeds Claude |
| **Total** | **3,136**        | Arithmetic sum                                                                |

(P0 = ~69% of total work; P1 = ~30%; P2 = ~1%. The P2 share is small because the audit was scoped to parity gaps, not polish hunts.)

---

## Subtotals by surface (synthesis matrix)

| Surface                               | Hours | % of total | Largest single P0                                                          |
| ------------------------------------- | ----- | ---------- | -------------------------------------------------------------------------- |
| apps/desktop                          | 833   | 27%        | 3-mode shell (Chat/Cowork/Code) build-out — 80h                            |
| apps/cli                              | 658   | 21%        | Slash-command palette breadth — 80h shell + ~200h for the heavy primitives |
| apps/extension (Chrome)               | 433   | 14%        | Side-panel React migration to `unified-chat` — 40h                         |
| apps/mobile                           | 392   | 12%        | StoreKit IAP wiring — 40h                                                  |
| packages/unified-chat + design-tokens | 347   | 11%        | Shared Settings shell — 40h                                                |
| apps/web                              | 252   | 8%         | Public `/pricing` + support subdomain — 60h                                |
| apps/extension-vscode                 | 221   | 7%         | Tool-call structured viewer + permission prompts — 18h                     |

---

## Recommendations for prioritization

1. **Unblock submission first.** The mobile P0 StoreKit IAP fix is 40h and must precede any other mobile work — App Store rejection is binary.
2. **Invest in `packages/unified-chat` before per-surface polish.** Token unification (16h), shared Settings shell (40h), Memory editor (24h), Artifacts versioning/live-preview/publish (52h), composer drag-drop/paste (8h), shared Projects component (32h) total **172h** and close gaps across web + desktop + mobile + 2 extensions simultaneously.
3. **CLI: ship the parity engine.** Pick the 10-12 highest-leverage commands (`/init`, `/permissions`, `/mcp`, `/agents`, `/skills`, `/plan`, `/memory`, `/context`+`/rewind`, `/branch`, `/clear`, `/compact`) for v1 — that is ~280h of the 658h CLI total and covers >90% of the parity surface.
4. **Desktop Cowork/Code modes are deferrable.** The v1 lock (`v1-local-only-cloud-waitlist-2026-05-18`) does not require Cowork to ship. Decide whether to ship Chat-only v1 desktop (~150h closeable) or commit to all-three-modes (~600h).
5. **Chrome ext: fix the attachments correctness bug now.** The image-bytes-not-forwarded defect (3h) costs nothing relative to its visibility ("we have an Add Image button that silently drops images").

---

## End of EXEC-SUMMARY.md
