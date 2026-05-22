# Team Brief — `claude-parity-2026-05-21`

**Mission:** Independent fresh audit of agiworkforce frontend parity with Claude applications, in engineering hours.

**Output target:** `audit/anthropic-apps-parity/team-2026-05-21/`

## Scope decisions (locked 2026-05-21)

- **Vendor:** Claude only. Ignore ChatGPT, Codex, Gemini, Perplexity, Cursor screenshots.
- **Time unit:** Engineering hours (one integer per row; one mid-level engineer with codebase familiarity, working uninterrupted on that specific gap).
- **Prior audit:** Teammates do NOT read these during fresh-audit phase. Only the lead reads them during reconciliation:
  - `audit/anthropic-apps-parity/competitive-baseline-2026-05-20.md`
  - `audit/anthropic-apps-parity/surface-gap-ledger.md`
  - `audit/anthropic-apps-parity/feature-ledger.md`
  - `audit/anthropic-apps-parity/application-suite-thesis-2026-05-20.md`
  - `audit/anthropic-apps-parity/compute-artifacts-2026-05-20.md`
  - `audit/anthropic-apps-parity/sdk-strategy-2026-05-20.md`
  - `reports/frontend-parity-r1/GAP_MATRIX.md`
  - `docs/design/design-spec-2026-05-15.md`
- **Output location:** `audit/anthropic-apps-parity/team-2026-05-21/`

## Shared rubric (every teammate report)

Every report file is a markdown document with one section per feature area, each containing one row of:

| Feature area | Evidence ref | Current state | Gap delta | Severity | Hours |
| ------------ | ------------ | ------------- | --------- | -------- | ----- |

- **Feature area:** composer, sidebar, model picker, tool-call rendering, settings, onboarding, billing, artifacts, computer-use, browser-automation, history/projects, memory, connectors, voice, search, attachments, multi-modal, slash-commands, keyboard-shortcuts — pick whichever apply.
- **Evidence ref:**
  - Image side: exact PNG path under `~/Desktop/reference/ui/`. Multiple PNGs OK, comma-separated.
  - Source side: `path:line-range` (e.g. `apps/desktop/src/features/chat/ChatInputArea.tsx:42-87`). Multiple OK.
- **Current state:** 2-4 sentences describing what exists today on the side you analyzed.
- **Gap delta:** 2-4 sentences describing what the _other_ side has that this side doesn't, OR an explicit "no gap visible — needs cross-validation by the lead".
- **Severity:**
  - **P0** — blocks v1 parity (user-visible missing core feature; "ChatGPT/Claude has this, we don't").
  - **P1** — visible UX gap, not blocking (worse experience but the workflow exists).
  - **P2** — polish (small visual or interaction detail).
- **Hours:** One integer in engineering hours. Assume one mid-level engineer who knows this codebase, working uninterrupted on this specific gap. Include design, implementation, basic testing. Do NOT include code review, deploy, or QA.

## Slot assignments (12 teammates)

### Image side (work from `~/Desktop/reference/ui/`)

- **`img-1`** → Claude desktop core. Folders: `desktop/claude/`, `desktop/claude-free/`, `desktop/claude-max20x/`. ~115 PNGs.
- **`img-2`** → Claude desktop artifacts + connectors. Folders: `desktop/claude-artifacts/`, `desktop/claude-connectors/`. ~51 PNGs.
- **`img-3`** → Claude mobile iOS. Folder: `mobile/claude-ios/`. 27 PNGs.
- **`img-4`** → Claude Code CLI. Folder: `cli/claude-code/`. 31 PNGs.
- **`img-5`** → Claude web + Chrome ext + VS Code ext. Folders: `web/claude-auth/`, `web/claude-public/`, `chrome-extension/claude/`, `vscode-extension/claude/`, `vscode-extension/cursor-claude-code/`. ~50 PNGs.
- **`img-6`** → Cross-surface pattern synthesis. Read `~/Desktop/reference/ui/INDEX.md`, then sample at least 5 PNGs per Claude folder. Produce a normalized feature-pattern taxonomy: for each feature area in the rubric, describe Claude's pattern across surfaces (1-2 sentences). No agiworkforce comparison — your output feeds the lead's synthesis.

### Source side (read-only audit of agiworkforce frontend)

- **`src-1`** → Canonical shared UI: `packages/unified-chat` (68 React components) + `packages/design-tokens` (palette, radii, CSS vars, icon usage).
- **`src-2`** → Web frontend: `apps/web/app/chat`, `apps/web/app/settings`, `apps/web/app/payment*`, `apps/web/app/customers`, `apps/web/app/signup`, `apps/web/app/verify`, `apps/web/src/*`.
- **`src-3`** → Desktop frontend: `apps/desktop/src/features/{chat,artifacts,computer-use,browser,settings,onboarding,billing,model-picker}`.
- **`src-4`** → Mobile frontend: `apps/mobile/src/features/{chat,model-picker,artifacts,billing,paywall,settings,onboarding,voice,agents,connectors,auth}`.
- **`src-5`** → Chrome extension: `apps/extension/src/{popup,side-panel,content,background,features,autofill,inPagePanel,ui}.ts*` and `apps/extension/src/features/`.
- **`src-6`** → VS Code extension: `apps/extension-vscode/src/features/{sidebar-webview,chat-participant,model-picker,code-lens,inline-completions,trees,desktop-bridge}`.

## Coordination contract

1. **Wait for brief.** Lead will `SendMessage` you with your slot brief + the absolute path to write your report.
2. **Do the work.** Read evidence (PNGs or source). Apply the rubric. Be specific — exact paths, line numbers, observed UX patterns.
3. **Write your report.** ONE file only: `audit/anthropic-apps-parity/team-2026-05-21/{slot}-report.md` (e.g. `img-1-report.md`, `src-3-report.md`).
4. **Source-side teammates: DO NOT EDIT OR MODIFY SOURCE CODE.** Read-only audit. The only file you may Write is your own report.
5. **Mark task complete.** `TaskUpdate` the task whose owner is you, set `status: completed`.
6. **Signal lead.** `SendMessage` to `lead`: short plain text starting `done:` followed by a 5-bullet TL;DR.
7. **Idle.** Stay alive — lead may message you with follow-up questions.

## Lead synthesis phase

After all 12 teammates signal `done`:

1. Read all 12 reports.
2. Read the May-20 audit corpus (the blocked-paths list above) and `docs/design/design-spec-2026-05-15.md`.
3. Write `SYNTHESIS.md` — combined gap matrix, one row per (surface × feature), columns: surface · feature · image evidence ref · source evidence ref · status (Done/Partial/Gap) · gap delta · severity · hours.
4. Write `RECONCILE.md` — at least 3 points where fresh team agrees with May-20 baseline; explicit disagreements with 1-sentence resolution.
5. Write `EXEC-SUMMARY.md` — top-10 P0 gaps ranked by hours-to-impact, plus grand total hours (sum of all rows in SYNTHESIS.md), with subtotals by surface and by severity.
6. Return a ~200-word executive summary to the main session.
