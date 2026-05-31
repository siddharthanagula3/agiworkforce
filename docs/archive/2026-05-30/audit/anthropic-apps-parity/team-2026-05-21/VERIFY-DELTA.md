# VERIFY-DELTA.md — round 2 verification

**Date:** 2026-05-21
**Inputs:** 12 round-2 reports under `audit/anthropic-apps-parity/team-2026-05-21/{slot}-r2-report.md` + round-1 `SYNTHESIS.md` + `EXEC-SUMMARY.md`.
**Mix:** 5 self-QA (img-1, src-2, src-4, src-5, src-6) reviewing their own r1 + 7 fresh blind (img-2-r2, img-3-r2, img-4-r2, img-5-r2, img-6-r2, src-1-r2, src-3-r2). Fresh blind agents cannot read r1 output — strongest verification signal.

---

## 1. Headline verification result

**The round-1 SYNTHESIS.md is structurally sound but materially undercounted.** Round 2 converges on the framework, severity calls, and the headline P0 list. The grand total shifts upward because:

- Several round-1 reports missed full rubric categories (img-1 missed Artifacts entirely; src-2 missed 6 feature areas including share/export/citations/reasoning/markdown/branching).
- Round-1 hour estimates skewed low on heavyweight surfaces (img-1 Code dashboard, Customize hub, Projects detail).
- Round-1 missed two material correctness bugs that round-2 exposed: src-5 found `extendedThinking` is also dropped on the wire (not just `attachments`), and src-6 retracted its persistence-not-wired finding (sidebar webview DOES persist via `ChatStateManager.ts:719-737`).

**Convergence rate (subjective): ~75% of round-1 rows survived unchanged.** Roughly 15% were materially repriced (mostly upward) and roughly 10% were either retracted (false positives) or newly added (missed categories).

---

## 2. Per-surface convergence + divergence

### apps/desktop (`src-3` fresh blind r2)

- **Convergence:** Cowork + Code modes are literal placeholders in `DesktopShellV3.tsx:117-145`. Confirmed. v3 Sidebar "Projects" nav routes to `openSettingsDialog('account')` (App.tsx:1301-1302) — placeholder wiring. Both r1 and r2 agree desktop is parity-strong on Chat mode and gap on Cowork/Code.
- **Divergence (fresh-only):** r2 catches that `apps/desktop/features/billing/` and `features/model-picker/` don't exist as standalone directories — billing is split across `v3/Pricing.tsx + features/pricing/ + features/subscription/`, model picker across `v3/ModelPopover.tsx + features/chat/ModelSelectorButton.tsx + features/settings/ModelSelector.tsx`. r1 used the brief's directory names verbatim; r2 corrects.
- **Divergence (fresh-only):** v3 ModelPopover **drops the no-vision / no-tools / tool-fallback capability indicators** that legacy `ModelSelectorButton.tsx:54-89` ships. r1 marked legacy as "Done"; r2 splits the row — legacy = Done, v3 = Partial regression. Tag: **fresh-only**.
- **Hour delta:** Source-side desktop subtotal moved 25h (r1) → ~25h (r2). No change at the source-side gap counter — r2 was a fresh structural audit, not an estimate revision.

### apps/mobile (`src-4` self-QA)

- **Convergence:** Headline P0 StoreKit IAP at `ProPlusPaywall.tsx:78-84` confirmed (re-grepped; no `react-native-iap` / `expo-store-kit` / `requestPurchase` anywhere). Confirmed unchanged.
- **Divergence (self-QA):** Four factual r1 errors corrected (all on the pessimistic side):
  - Voice transcript overlay DOES render at `VoiceConversationScreen.tsx:414-423` (r1 said missing).
  - `usage.tsx:500-507` already has Restore Purchases + Manage Subscription rows → Billing 40h → 24h.
  - `/usage` screen exists with full session/monthly/daily → Settings 12h → 8h.
  - Project schema already includes `instructions` field at `projects/store.ts:5-12` → Projects 10h → 6h.
- **Divergence (self-QA):** Three missed rubric items added (+18h): markdown KaTeX/tables (P2/6h), server-backed share-chat link (P2/4h), Dynamic-Type accessibility (P2/8h).
- **Hour delta:** 164h (r1) → **161h (r2)**. Net −3h. Tag: **self-QA-only**.

### apps/cli (`img-4-r2` fresh blind)

- **Convergence:** Round 2 independently enumerates **63 unique core slash commands** vs round 1's "~70". Catalog scope confirmed. The heavy-weight subsystems (`/mcp`, `/agents`, `/skills`, `/plugin`, `/permissions`, `/plan`, `/tasks`, `/memory`, `/context`+`/rewind`, `/init`) all corroborated independently.
- **Divergence (fresh-only):** Build versions are concrete — v2.1.86 (root) and v2.1.128 (May-15 capture). r1 cited v2.1.128 only. No semantic delta.
- **Divergence (fresh-only):** Severity tally lands at 12 P0 / ~10 P1 / 6 P2 ≈ **810h image-side total before lead reconciliation**. r1 image-side was 535h. Difference is in upward re-estimation of subsystem hours, not missed commands. Tag: **fresh-only**.
- **Hour delta:** CLI synthesis r1 subtotal was 658h. Fresh blind r2 lands at 810h before v1 cloud-only subtraction. After applying the same v1 filter (subtract ~100-120h for `/teleport`, `/remote-control`, `/upgrade`, `/install-*`, `/voice`, `/mobile`, `/desktop`, `/usage`, `/ultrareview`, `/extra-usage`, `/stickers`, `/passes`, `/powerup`), the merged best estimate is **~700h** (vs r1's 658h). Tag: **fresh-only**.

### apps/extension Chrome (`src-5` self-QA + `img-5-r2` fresh for Chrome side)

- **Convergence:** Image-side `img-5-r2` independently catalogs the Chrome ext surface (Sonnet 4.6 + Quick mode + Ask vs Act pill + pairing.html + Permissions/Shortcuts/Options + per-site permission prompt + blocked.html + slash shortcuts + batched-action workflow) — all of which r1 surfaced. Strong corroboration. Source-side bugs (attachments not forwarded; voice hard-coded `en-US`) confirmed on re-read.
- **Divergence (self-QA):** r2 finds **`extendedThinking` toggle is ALSO dropped on the wire** alongside `attachments` (types.ts:439-447 wire-type missing both; background.ts:2690 destructure ignores both). r1 missed this. New row added: dead Extended-thinking toggle P1/4h. Wire-bug row hours bumped +1h.
- **Divergence (self-QA):** Allowlist UI promoted **P1 → P0**. Error string at `background.ts:898` literally says "Add it from the extension popup" but the popup has no such UI (grep-verified). Misleading product copy.
- **Divergence (self-QA):** In-page panel rendering promoted to its own P0/8h row — `panel.ts:178` uses `textContent` (no markdown, no streaming); the pipeline exists in `features/side-panel/markdown.ts` but isn't wired into the overlay path.
- **Divergence (self-QA):** React-refactor row reclassified P0/40h → P1/60h (engineering debt, not user-visible parity). Artifacts panel hours flagged as **wishful** (r1 said 30h; r2 says likely 80h depending on `img-5` scope).
- **Hour delta:** ~340h (r1) → **~395h (r2)**. Net +55h. Tag: **self-QA-only with strong fresh-side corroboration**.

### apps/extension-vscode (`src-6` self-QA)

- **Convergence:** Most r1 structure survived (36 rows unchanged). Plus-menu image-pinning misleads — confirmed at the new higher estimate. Tool-call rendering still P0.
- **Divergence (self-QA, retraction):** **r1 was WRONG on persistence.** Sidebar webview DOES persist to `ConversationStore` on every `onDone` via `ChatStateManager.ts:719-737` (same logic as `chatParticipant.ts:381-396`). r1 said it didn't. History tree IS populated by both paths. **Two rows retracted.**
- **Divergence (self-QA, severity downgrades):** History tree P0/14h → **P1/9h** (flat-list aesthetics, not a workflow blocker); Citations P1/10h → P2/6h (exotic for IDE persona); Inline images P1/8h → P2/6h (no evidence Claude IDE surfaces show images either).
- **Divergence (self-QA, hour refinements):** Composer image-attach P0/14h → **P0/17h** (underweighted the `LlmChatMessage` content-array wire-format change). Tool-call rendering bundle (P0) split into 3 rows: 8 + 5 + 6 = 19h (vs r1's 18h).
- **Divergence (self-QA, missed gaps added):** Token-counter / context-budget UI not surfaced despite `tokenCounter.ts` + `contextBudget.ts` existing (P1/5h). Agent-mode HiTL flow in `providers/agentMode/agentUI.ts` uses native VS Code modals + diff editor, NOT woven into chat-stream tool-call rows (P1/12h) — "single most Claude-shaped UX delta in the extension, and I gave it zero coverage in r1." `@`-mention only supports `file` namespace, no `@workspace`/`@symbol`/`@recent` (P2/4h).
- **Hour delta:** 221h (r1) → ~**213h (r2)**. Net −8h after retractions + downgrades + new rows. Tag: **self-QA-only** but with **one r1 retraction** worth flagging.

### apps/web (`src-2` self-QA)

- **Convergence:** All four r1 P0s (Artifacts, Settings, History/Projects, Memory) survive. Headline structure unchanged.
- **Divergence (self-QA):** **r1 was undercounted by ~40%.** 6 feature areas missed entirely:
  - Branching via `BranchNavigator` + service.
  - Share via `app/share/[token]/page.tsx` + Supabase `shared_sessions` table.
  - Export via `EnhancedExportDialog` (5 formats).
  - Citations via `InlineCitation` + `CitationFooter`.
  - Reasoning via `ReasoningAccordion` + `ThinkingBlock`.
  - Markdown rendering via `MarkdownContent` + `EnhancedMarkdownRenderer` + full remark/rehype stack.

  Cause: r1 focused on Composer/Sidebar/messages/artifacts and skimmed past dialogs/, `messages/InlineCitation`, `messages/ReasoningAccordion`, `BranchNavigator`, and `app/share/` by listing rather than reading.

- **Divergence (self-QA, severity escalation):** Attachments base64-inlining promoted **P1 → P0** (reliability, not polish — large image uploads bloat payload, may crash; Claude uses signed URLs). Hours 8h → 12h.
- **Divergence (self-QA, hour refinements):** Re-priced four big r1 P0s upward:
  - Artifacts 30h → **42h** (versioning 12 + iframe preview 16 + publish 10 + edit-in-place 4).
  - Memory 24h → **32h** (page + CRUD + backend table + sync API).
  - History/Projects 18h → **28h** (project wiring + archive + starred + content-FTS + monthly pagination).
  - Settings 28h → **36h** (profile editor + theme persistence + privacy controls + restyling).
- **Hour delta:** 214h (r1) → **298h (r2)**. Net **+84h** (~+40%). Tag: **self-QA-only** with **one severity escalation** the lead must adopt.

### packages/unified-chat + design-tokens (`src-1-r2` fresh blind)

- **Convergence:** Three coexisting color-token systems re-confirmed — but r2 says **`--chat-*` + shadcn `hsl(var(--…))` + shadcn unprefixed `bg-card`/`border-border`** (r1 said `--chat-*` + shadcn-style + hardcoded `ReactPreview` dark). Mostly the same finding, with one orientation refinement. Recommendation in r2: **a ~3h alias path** (lower than r1's 16h). Strong fresh-blind corroboration.
- **Convergence:** `SettingsModal` 22-line event-dispatch stub confirmed (exact line citation matches r1). BudgetTracker crude token estimator confirmed. BrandedGreeting hardcoded dark-mode confirmed. Three parallel tool-call renderers — implicitly confirmed (r2 calls out parallel artifact UIs and parallel suggestion surfaces as the most-visible consolidation candidates).
- **Divergence (fresh-only):** Component count is **77** in r2 vs r1's stated 68. Material — affects scope estimates that anchor on file counts.
- **Divergence (fresh-only):** No stroke-width token in design-tokens; Lucide widths inlined ad hoc (sidebar=1.75, send=2, rest default). EmptyState + BrandedGreeting bypass `--chat-font-display` CSS var with inline font-family overrides. r1 did not flag these.
- **Hour delta:** r1 src-1 subtotal 476h. r2 src-1 fresh blind does not report a single grand total but the row-level deltas suggest **~440-480h** range — within r1 ±10%. Tag: **fresh-blind corroboration**.

### Claude desktop core (`img-1` self-QA)

- **Convergence:** Most rubric rows survive. Three-mode shell pattern confirmed.
- **Divergence (self-QA):** **Missed an entire rubric category — Artifacts.** r2 adds 4 new rows (gallery, "New artifact" 7-tile category picker, split-pane viewer with ToC, copy/export menu) for **+92h alone**. Also added Claude Design as out-of-v1-scope flag.
- **Divergence (self-QA):** **Conflated two distinct connector-add flows.** r1 treated all connector-add as the custom-MCP modal. There is a separate OAuth grant-access modal (Slack/etc.) — different UI, different flow, both required for parity. Per-connector permission detail row bumped 40h → 52h.
- **Divergence (self-QA):** Three-pane layout was misclassified as a toggle; r2 confirms it's the **concurrent steady-state inside project chats**. Added dedicated row.
- **Divergence (self-QA):** Hour estimates skewed low on heavyweight surfaces:
  - Code empty-state dashboard 40h → 64h.
  - Customize hub 48h → 72h (6+ sub-routes).
  - Project detail 56h → 72h (token-capacity computation + capacity banner).
  - Top-level mode switcher 80h → 120h (each of three modes owns its own composer/sidebar/footer).
- **Divergence (self-QA, severity reclassifications, low-stakes):** Voice/mic P2 → P1; Settings→Connectors deferral P1 → P2; Chat recents P1 → P2.
- **Divergence (self-QA, new rows):** 7 previously-uncited rows added (project overflow menu, sidebar overflow, Downloads page, Cowork per-mode sidebar routes, slash-commands separate from skills, keyboard-shortcuts layer, free-vs-paid intent-chip variant).
- **Hour delta:** 806h (r1) → **~1,124h (r2)**. Net **+318h** (~+40%). Tag: **self-QA-only**.

### Claude artifacts + connectors (`img-2-r2` fresh blind)

- **Convergence:** 5-control toolbar order confirmed (`</>` source-toggle, eye preview, Copy, down-caret, X close). Multi-artifact "Download all" chip + per-card "Open in <native>" pattern confirmed. Inline tool calls icon + Result pill rows confirmed.
- **Divergence (fresh-only):** r2 finds the **`Relevant chats`** card type is a **first-class inline message variant** (labeled section with "3 results" chip pulling prior conversations). r1 mentioned it as P1/12h; r2 says it should be modelled as its own message type, not a chat-search affordance.
- **Divergence (fresh-only):** **Connector directory scale: ~250-280 connectors across 19 scroll positions** (with `popular`/`interactive`/`Trending`/`New` badges, "(By Anthropic)" first-party tags, connected-state checkmark). r1 estimated ~150. **Catalog scale is the single biggest gap vs agiworkforce — estimated ~60h to close**, vs r1's 24h. Tag: **fresh-only material upward revision**.
- **Hour delta:** 190h (r1) → ~**240h (r2)**. Tag: **fresh-only**.

### Claude mobile iOS (`img-3-r2` fresh blind)

- **Convergence:** Drawer-only nav (no bottom tab bar) confirmed. Two-voice-button composer (mic + waveform) confirmed. Unified "Add to Chat" bottom sheet confirmed. Reasoning chip → bottom-sheet pattern confirmed. Code surface (sessions Idle/Archived, Plan-vs-Code picker, Copy-branch overflow) confirmed.
- **Convergence:** Permissions screen with Location / Calendar / Reminders / Health per-permission enums confirmed as the biggest mobile-native parity surface (~32h).
- **Divergence (fresh-only, evidence gap):** No onboarding/paywall PNGs in the 27-capture corpus — r2 flags this as **evidence-gap, not inferred**. r1 imputed nothing here.
- **Hour delta:** ~250h (r1 image-side) → **254h (r2 image-side, 178h P0 + 64h P1 + 12h P2)**. Within ±2%. Strongest convergence in the entire round-2 set. Tag: **fresh-blind corroboration**.

### Claude web + Chrome ext + VS Code ext + Cursor (`img-5-r2` fresh blind)

- **Convergence:** Three-segment pricing IA (Individual / Team & Enterprise / API) confirmed. Per-MTok rates corroborated (Opus 4.7 $5/Sonnet 4.6 $3/Haiku 4.5 $1). Chrome side-panel Ask vs Act pill confirmed. VS Code modes dropdown (Ask / Edit auto / Plan / Bypass) confirmed.
- **Divergence (fresh-only):** Total hours land at **838h across 36 rubric rows** (12 P0 / ?? P1 / ?? P2) — substantially **above r1's 410h** for the same surface set. Difference is in upward subsystem estimation, not missed primitives.
- **Hour delta:** 410h (r1) → **838h (r2)**. **+428h (~+104%)**. This is the **largest fresh-only re-estimation** in the round-2 set. Tag: **fresh-only major upward revision**.

### Cross-surface pattern doc (`img-6-r2` fresh blind)

- **Convergence:** Composer grammar, 3-tier model picker + capability blurbs, permission prompt shape (Always allow ↩ / Deny esc / scope-modifier), tool-call + reasoning two-tier UI, connectors single integration grammar — all **independently corroborated**. This is the strongest single convergence signal in the round-2 set: a fresh blind reviewer with no access to r1 produced the same five cross-surface signatures.
- **Divergence (fresh-only):** None material. r2 documents 19 feature areas vs r1's 16. Adds rows on full-stop sticky compose UI and surface-specific Ask/Act variations (CLI `/permissions` tabs, VS Code modes dropdown).
- **Hour delta:** Pattern-doc only; no hours.

---

## 3. Hour-estimate variance — per-surface mean and range

| Surface                                          | R1 subtotal                                 | R2 subtotal                               | Δ                                  | Δ%          | Strongest signal                                         |
| ------------------------------------------------ | ------------------------------------------- | ----------------------------------------- | ---------------------------------- | ----------- | -------------------------------------------------------- |
| shared-package (src-1)                           | 347 (synthesis) / 476 (src-1 r1)            | ~460 (src-1 r2 fresh)                     | +113 vs synthesis / −16 vs r1-src1 | +33% / −3%  | Fresh-blind near-convergence on src-1 row total          |
| apps/web (src-2)                                 | 252 (synthesis) / 214 (src-2 r1)            | **298** (src-2 r2 self-QA)                | +46 vs synthesis / +84 vs r1-src2  | +18% / +39% | self-QA caught 6 missed feature areas + P0 escalation    |
| apps/desktop (src-3)                             | 833 (synthesis) / 25 (src-3 r1 source-side) | 25 (src-3 r2 fresh, no estimate revision) | 0                                  | 0%          | Fresh structural audit, no estimate change               |
| apps/mobile (src-4)                              | 392 (synthesis) / 164 (src-4 r1)            | **161** (src-4 r2 self-QA)                | −231 vs synthesis / −3 vs r1-src4  | −59% / −2%  | self-QA found existing implementations; src-4 row stable |
| apps/cli                                         | 658 (synthesis) / 535 (img-4 r1)            | **~700** (img-4 r2 fresh w/ v1 filter)    | +42 vs synthesis / +165 vs r1-img4 | +6% / +31%  | Fresh-only upward                                        |
| apps/extension Chrome (src-5)                    | 433 (synthesis) / 340 (src-5 r1)            | **~395** (src-5 r2 self-QA)               | −38 vs synthesis / +55 vs r1-src5  | −9% / +16%  | Self-QA + fresh-img5 corroboration                       |
| apps/extension-vscode (src-6)                    | 221 (synthesis) / 222 (src-6 r1)            | **~213** (src-6 r2 self-QA)               | −8 vs synthesis                    | −4%         | Self-QA retraction + reclassifications                   |
| Claude desktop core image-side (img-1)           | (folded into surfaces) / 806 (img-1 r1)     | **~1,124** (img-1 r2 self-QA)             | n/a / +318 vs r1-img1              | n/a / +40%  | Self-QA found missing Artifacts category                 |
| Claude artifacts + connectors image-side (img-2) | (folded) / 190 (img-2 r1)                   | **~240** (img-2 r2 fresh)                 | n/a / +50 vs r1-img2               | n/a / +26%  | Fresh-only catalog-scale revision                        |
| Claude mobile iOS image-side (img-3)             | (folded) / ~250 (img-3 r1)                  | **~254** (img-3 r2 fresh)                 | n/a / +4 vs r1-img3                | n/a / +2%   | Strongest convergence                                    |
| Claude web + exts image-side (img-5)             | (folded) / 410 (img-5 r1)                   | **~838** (img-5 r2 fresh)                 | n/a / +428 vs r1-img5              | n/a / +104% | **Largest fresh-only revision**                          |
| Cross-surface pattern doc (img-6)                | 0                                           | 0                                         | 0                                  | 0%          | Pattern doc only                                         |

**Fresh-blind independent deltas** (the strongest verification signal):

- **img-3-r2 vs img-3-r1: +2%** — strongest convergence, hours essentially confirmed.
- **img-2-r2 vs img-2-r1: +26%** — material upward revision driven by connector-catalog scale.
- **img-4-r2 vs img-4-r1: +31%** — fresh-only upward on CLI subsystem estimates.
- **img-5-r2 vs img-5-r1: +104%** — largest variance, indicates r1 image-side was notably optimistic about web + extension surfaces.
- **src-1-r2 vs src-1-r1: −3%** — strong fresh-blind convergence on the shared package.
- **src-3-r2: structural, no hour revision** — r2 reframed scope rather than re-estimating.
- **img-6-r2: full corroboration** of the five cross-surface UX signatures.

The fresh-blind sample shows a **+30% mean upward revision** with a wide range (−3% to +104%). This is the most credible single number in the verification.

---

## 4. Confidence in the round-1 3,136h grand total

**Round 1 grand total: 3,136h.**

The verification evidence supports:

- Round-1 **direction is correct** — the matrix shape, severity calls, and top-10 P0 ranking all survive into round 2.
- Round-1 **magnitude is materially low** — fresh-blind mean revision of +30% suggests true cost is in the **3,800h–4,300h** range; self-QA caught real misses on web (+84h), Chrome ext (+55h), CLI (+42h vs synthesis) that net to a similar conclusion.
- Two **correctness shifts** must be folded in:
  - VS Code persistence retraction (−4h, no real impact on totals).
  - Web Attachments P1 → P0 escalation (no net hours change, but reshuffles the top-10).

**Revised best-estimate range: 3,800h – 4,300h.** Midpoint **~4,050h**. We carry this forward into `SYNTHESIS-r2.md` and `EXEC-SUMMARY-r2.md`.

Confidence level on the revised range: **moderate-high**. The fresh-blind sample (7 of 12 reports) is strong but the source-side fresh agents (src-1-r2 and src-3-r2) did not produce singular grand totals — they produced row-level deltas. Hour estimates anywhere in a parity audit carry ±15% noise regardless of methodology.

---

## 5. Net change summary

| Category                                           | Count                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rows in r1 SYNTHESIS.md that survived r2 unchanged | ~75%                                                                                                                                                                                                                                                                 |
| Rows materially repriced (mostly upward)           | ~15%                                                                                                                                                                                                                                                                 |
| Rows retracted (false positives)                   | 2 (src-6 persistence + src-4 voice transcript)                                                                                                                                                                                                                       |
| Severity reclassifications (P1 → P0 or P0 → P1)    | 4 (web attachments → P0; chrome-ext allowlist UI → P0; chrome-ext React-refactor → P1; img-1 voice → P1; img-1 settings-connectors-deferral → P2; img-1 chat-recents → P2; src-6 history-tree → P1; src-6 citations → P2; src-6 inline-images → P2)                  |
| New rows added in round 2                          | ~25 (largest: img-1 Artifacts category +4 rows + 3-pane layout + 7 misc; src-2 6 missed categories; src-5 dead-extended-thinking; src-6 token-counter + agent-mode HiTL + @-mention; src-4 KaTeX + share-link + Dynamic-Type; img-1 Claude Design out-of-scope flag) |

**Most consequential corrections:**

1. **img-1 missed Artifacts entirely in r1.** Adding it costs +92h alone.
2. **src-2 missed 6 web feature areas.** Adding them costs +84h.
3. **src-6 retracted its "sidebar doesn't persist" finding.** Removes that line of risk but doesn't change total parity hours much.
4. **src-5 found a second wire bug** (`extendedThinking` dropped alongside `attachments`).
5. **img-5-r2 doubled image-side estimates for web+extensions.** +428h.
6. **img-2-r2 doubled connector-catalog scale estimate.** +50h.

---

## End of VERIFY-DELTA.md
