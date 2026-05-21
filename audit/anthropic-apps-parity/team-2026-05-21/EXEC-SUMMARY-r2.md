# EXEC-SUMMARY-r2.md — verification synthesis

**One-line executive line:** Round-2 verification confirms the round-1 framework but raises the merged best-estimate cost of Claude parity from **3,136h → 3,778h** (≈ +20%). The increase concentrates in the Claude desktop (`img-1` missed the Artifacts category entirely) and `apps/web` (src-2 missed 6 feature areas) surfaces. Two correctness shifts merit immediate attention: `apps/web` Attachments promoted **P1 → P0**, and `apps/extension` Allowlist UI promoted **P1 → P0**. One round-1 false positive retracted (`apps/extension-vscode` persistence-not-wired).

---

## Convergence rate

- ~75% of round-1 rows survived unchanged.
- ~15% materially repriced (overwhelmingly upward).
- ~10% retracted, downgraded, or net-new.
- **Strongest convergence signal:** the cross-surface UX synthesis (`img-6-r2`) and Claude mobile iOS image-side (`img-3-r2`) — both fresh-blind — produced **the same five cross-surface signatures** as round 1 with only a +2% hour delta.
- **Largest variance:** image-side estimates for Claude web + Chrome ext + VS Code ext (`img-5-r2` fresh blind) doubled from 410h to **838h** — indicates the r1 image-side was notably optimistic for this surface set.

---

## Merged grand total — round 2

| Section / surface                                           | r1        | r2        | Δ               |
| ----------------------------------------------------------- | --------- | --------- | --------------- |
| A. Shared package (`packages/unified-chat` + design-tokens) | 347       | **373**   | +26             |
| B. apps/web                                                 | 252       | **408**   | +156            |
| C. apps/desktop                                             | 833       | **1,113** | +280            |
| D. apps/mobile                                              | 392       | **397**   | +5              |
| E. apps/cli                                                 | 658       | **730**   | +72             |
| F. apps/extension (Chrome MV3)                              | 433       | **522**   | +89             |
| G. apps/extension-vscode                                    | 221       | **235**   | +14             |
| **Grand total r2**                                          | **3,136** | **3,778** | **+642 (+20%)** |

(If the lead chooses the shorter 3h CSS-var alias path on shared-package token unification instead of the full 16h migration, the grand total is **3,765h**. We carry 3,778h as the conservative best estimate.)

The grand total is the **arithmetic sum of every per-row Hours r2 cell** across `SYNTHESIS-r2.md` sections A–G.

---

## Subtotals by severity (round-2 matrix)

| Severity | Hours r1 | Hours r2         | Δ    |
| -------- | -------- | ---------------- | ---- |
| P0       | 2,155    | **2,488**        | +333 |
| P1       | 935      | **1,189**        | +254 |
| P2       | 40       | **96**           | +56  |
| Done / 0 | n/a      | 5 zero-hour rows | n/a  |

P0 still ~66% of total work (vs 69% in r1) — the share is mostly stable; the rise is dominated by upward re-estimates on existing P0s plus new P0 rows (Artifacts category on desktop, attachments severity escalation on web, allowlist UI promotion on chrome-ext).

---

## Top-10 P0 gaps — merged ranking (round-2 weights)

Same ranking heuristic as r1: gaps that **break parity across the most surfaces per hour** rank higher.

| #   | Gap                                                                                                                                                                                                                                                  | Surfaces affected                                        | Hours r2                                                                             | r1 → r2 delta                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Mobile StoreKit IAP** — wire native StoreKit, restore-purchase, receipt validation. App-Store submission blocker (Guideline 3.1.1).                                                                                                                | mobile                                                   | **24**                                                                               | 40 → 24 (r2 found existing Restore + Manage Subscription rows in `usage.tsx:500-507`; only the wire remains)                                |
| 2   | **Token-system unification in `packages/unified-chat`** — CSS-var alias path consolidating `--chat-*` + shadcn `hsl(var(…))` + shadcn `bg-card`/`border-border`.                                                                                     | shared-package (6 consumers)                             | **3 (alias) or 16 (full)**                                                           | Confirmed; r2 recommends alias path for fastest unblock                                                                                     |
| 3   | **Composer drag-drop + paste-image + thumbnail preview** in `unified-chat` `ChatInput.tsx`. Add `onDragOver/onDrop`, `onPaste`, thumbnail strip.                                                                                                     | shared-package + web + desktop + chrome-ext + vscode-ext | **8 (shared) + 14 (chrome wire fix) + 17 (vscode-ext) = 39**                         | Unchanged primitives; vscode-ext +3h, chrome-ext +1h                                                                                        |
| 4   | **Web Attachments — signed uploads + MIME accept (SEVERITY ESCALATION P1→P0)**                                                                                                                                                                       | web                                                      | **12**                                                                               | Promoted P1→P0; reliability not polish — large image uploads bloat payload (Claude uses signed URLs)                                        |
| 5   | **Chrome ext Allowlist management UI (SEVERITY ESCALATION P1→P0)** — error string literally tells users "Add it from the extension popup" but popup has no such UI.                                                                                  | chrome-ext                                               | **8**                                                                                | Promoted P1→P0 — misleading product copy                                                                                                    |
| 6   | **Shared Settings shell in `unified-chat`** — replace 22-line stub with real Profile / Capabilities / Connectors / Permissions / Appearance / Speech-language IA.                                                                                    | shared-package (all 6 consumers)                         | **40**                                                                               | Unchanged.                                                                                                                                  |
| 7   | **Web Settings depth** — Profile (avatar/name), Connections, Privacy/Data Controls, Memory, Notifications + persist theme.                                                                                                                           | web                                                      | **36**                                                                               | 28 → 36 (r2 added profile editor + theme persistence + privacy + restyling sub-totals)                                                      |
| 8   | **Memory editor surface** — list/edit/delete cross-conversation facts; "View your memory" entry from Capabilities.                                                                                                                                   | shared-package + web + chrome-ext + vscode-ext           | **24 (shared) + 32 (web) + 16 (vscode-ext) = 72**                                    | web +8h                                                                                                                                     |
| 9   | **Artifacts — versioning + live React/HTML preview + publish + edit-in-place** in `unified-chat` `ArtifactPanel.tsx`. Add stepper, `allow-scripts` sandboxed iframe, wire `handlePublish`, inline editor.                                            | shared-package + web + desktop                           | **24 + 16 + 12 (shared) + 42 (web) + 92 (img-1 missed-category desktop adds) = 186** | r2 surfaced an entire Artifacts category missed on Claude desktop (+92h) and repriced web from 30h → 42h                                    |
| 10  | **CLI slash-command palette (~63 unique core)** — implement the v1-relevant subset: `/init`, `/permissions`, `/mcp`, `/agents`, `/skills`, `/plugin`, `/plan`, `/tasks`, `/memory`, `/context`+`/rewind`, `/branch`, `/clear`, `/compact`, `/recap`. | cli                                                      | **96 + ~310 for heavy primitives = ~406**                                            | Catalog +16h (r2 spec); subsystem totals raised on `/mcp`, `/agents`, `/skills`, `/plugin`, `/tasks`, `/permissions`, `/memory`, `/context` |

**Top-10 P0 r2 sum: ~982 hours** (vs r1's 893h). +89h reflects the upward revisions across the same primitives.

---

## Subtotals by surface (round-2 matrix)

| Surface                               | Hours r2 | % of total | Largest single P0                                                                |
| ------------------------------------- | -------- | ---------- | -------------------------------------------------------------------------------- |
| apps/desktop                          | 1,113    | 29%        | Three-mode shell build-out (Chat / Cowork / Code) — 120h                         |
| apps/cli                              | 730      | 19%        | Slash-command palette — 96h catalog + 30-60h per heavy primitive                 |
| apps/extension (Chrome)               | 522      | 14%        | Side-panel React refactor (now P1) and Artifacts panel — 60h + 80h               |
| apps/web                              | 408      | 11%        | Public `/pricing` + support subdomain — 60h                                      |
| apps/mobile                           | 397      | 11%        | Permissions screens (per-permission enums) — 32h                                 |
| packages/unified-chat + design-tokens | 373      | 10%        | Shared Settings shell — 40h                                                      |
| apps/extension-vscode                 | 235      | 6%         | Tool-call rendering split (result viewer + permission UI + editable input) — 19h |

---

## Confidence in the revised 3,778h grand total

- **Direction:** high confidence. Round 2's fresh blind agents independently arrived at the same matrix shape and the same top-10 P0 list.
- **Magnitude:** moderate confidence. The fresh-blind mean delta was +30%; r2 matrix delta is +20%. We carry **±15% noise band** → realistic range **3,200h – 4,350h**.
- **Recommended interpretation:** treat **3,800h as a planning anchor**, with the understanding that v1 scoping decisions (Cowork/Code modes deferred, cloud-only CLI commands dropped, mobile billing pared back) can shave 300-500h.

---

## Round-2 correctness corrections (lead must adopt)

1. **mobile/billing P0:** lower hours but same severity — StoreKit IAP wire remains the App-Store blocker; Restore Purchases UI already present, so the gap is the IAP call itself.
2. **web/attachments:** **P1 → P0**. Update top-10 ranking accordingly (now #4 above).
3. **chrome-ext/allowlist UI:** **P1 → P0**. Misleading product copy is a parity blocker.
4. **chrome-ext/extendedThinking wire:** **NEW P1 row** — second wire bug alongside the attachments-dropped bug.
5. **vscode-ext persistence:** **RETRACTED**. Sidebar webview DOES persist via `ChatStateManager.ts:719-737`. Remove from gap set.
6. **vscode-ext/history-tree:** P0 → P1 (downgrade); citations and inline images P1 → P2.
7. **img-1/Artifacts:** entire Claude-desktop Artifacts category was missing from r1; +92h added to desktop subtotal.
8. **src-2 missed categories:** branching, share, export, citations, reasoning, markdown — all added to web; +84h.

---

## Recommendations (verification-grounded)

1. **Re-rank the top-10 P0 list** in any v1 sequencing document — mobile StoreKit moves down (smaller scope than r1 thought); web attachments + chrome-ext allowlist UI move up (severity escalation).
2. **Use the alias path** for shared-package token unification — 3h vs 16h, unblocks the same downstream work.
3. **Schedule the shared-package investments first** (Settings shell + Projects component + Artifacts core + Memory editor + composer attach/paste) — closes gaps across all 6 surfaces simultaneously and is the highest-leverage spend.
4. **Defer Cowork/Code modes** on desktop unless the v1 lock changes — they alone represent ~250-300h of the desktop subtotal and the `v1-local-only-cloud-waitlist-2026-05-18` lock does not require them.
5. **CLI parity:** ship the 10-12 highest-leverage commands first — ~400h gets us 90% of CLI parity surface. Cloud-dependent commands (`/teleport`, `/remote-control`, `/upgrade`, `/install-*`, `/voice`, `/mobile`, `/desktop`, `/usage`, `/ultrareview`) can wait for cloud unlock.

---

## End of EXEC-SUMMARY-r2.md
