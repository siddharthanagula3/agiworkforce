# src-2 — Round-2 Self-QA Report

**Auditor:** src-2
**Scope:** Self-critique of `src-2-report.md` (round 1). Re-read r1 + revisited the source tree. Round-2 ground rule: be honest, prefer admitting an r1 error over defending it.

---

## Changes from round 1

### Added rows (r1 missed these — they are real features in `apps/web`)

| Feature area added                        | Why it was missed in r1                                                                                                                                                                                                                                                     | r2 row added below |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **Conversation branching**                | `BranchNavigator.tsx` + `CreateBranchDialog.tsx` + `conversationBranchingService` exist and `MessageBubble` imports `GitFork`. I saw `GitFork` in r1's MessageBubble read but did not promote it to a row.                                                                  | yes                |
| **Conversation share (public links)**     | `apps/web/app/share/[token]/page.tsx` + `SharedSessionViewer` + Supabase `shared_sessions` table — confirmed in r2 (see r2 evidence). r1 listed `share/[token]` only in a `ls` and never opened it.                                                                         | yes                |
| **Conversation export**                   | `EnhancedExportDialog.tsx` supports 5 formats (markdown / json / html / pdf / docx) with `ChatExportService` + `document-export-service`. r1 listed the filename only and did not audit.                                                                                    | yes                |
| **Citations**                             | `InlineCitation.tsx` renders a numbered teal pill with hover preview + external-link icon; `CitationFooter` is referenced from `MessageBubble`. r1 didn't break this out.                                                                                                   | yes                |
| **Reasoning / Extended-thinking display** | `ReasoningAccordion.tsx` + `ThinkingBlock.tsx` both exist with elapsed-time tracking, step extraction, prefers-reduced-motion handling. r1 mentioned ThinkingBlock in passing but did not give it a row.                                                                    | yes                |
| **Markdown rendering / message content**  | `MarkdownContent.tsx`, `EnhancedMarkdownRenderer.tsx` + `react-markdown` + `remark-gfm` + `remark-math` + `rehype-highlight` + `rehype-katex` + `mermaid` are in `package.json:84-118`. r1 did not audit message-body rendering quality (a Claude-parity-critical feature). | yes                |
| **Keyboard shortcuts (own row)**          | r1 bundled this under "Slash commands / Shortcuts". The rubric lists "keyboard-shortcuts" as its own feature area — split into two rows.                                                                                                                                    | yes                |

### Severity reclassifications

| Row                                                | r1      | r2                      | Why                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attachments (base64 inlining + no `accept`)        | P1, 8h  | **P0, 12h**             | Base64 inlining is not a UX-polish gap — it materially caps message size and bloats payload; large image uploads on slow connections will time out or crash. Claude's signed-URL upload is a load-bearing reliability feature. Reclassifying to P0 with realistic hours.                 |
| Memory editor missing                              | P0, 24h | **P0, 32h**             | Realistic scope: new `/settings/memory` page + CRUD UI + backend table + RLS + sync API + delete/clear-all + tests. 24h was too low.                                                                                                                                                     |
| Artifacts (versioning + preview + publish)         | P0, 30h | **P0, 42h**             | Decomposed: versioning (12h) + iframe-sandboxed live preview for HTML/React/SVG/Mermaid (16h) + publish/share URL flow (10h) + edit-in-place (4h). 30h conflated all four.                                                                                                               |
| History / Projects in default sidebar              | P0, 18h | **P0, 28h**             | Realistic scope: wire `ProjectSidebar` into `ChatSidebar`, add archive store + table + UI, add starred group, full-message content search (requires backend FTS, not just title filter), pagination by month. 18h doesn't cover backend.                                                 |
| Settings depth                                     | P0, 28h | **P0, 36h**             | Adds account-profile editor (display name + avatar upload to Supabase Storage) + working theme persistence + privacy/data-controls page (export, delete account, training opt-out) + notification prefs + restyling to chat-surface tokens. r1 listed 8 sub-gaps; 28h was an undercount. |
| Onboarding tour                                    | P1, 14h | **P1, 14h** (unchanged) | Estimate still defensible: tour-engine + 4 steps + empty-state grid wiring.                                                                                                                                                                                                              |
| Sidebar (projects/pinning/model-badge/hover)       | P1, 8h  | **P1, 6h**              | Model-badge + pinning are 1-2h each; hover-to-expand UX is a 2h toggle. Lowering. Projects wiring is captured under "History / Projects" already — avoiding double-counting.                                                                                                             |
| Composer/tool consolidation                        | P1, 10h | **P1, 8h**              | This is a UX-polish ticket (de-duplicate Web Search across TOOLS and quick-toggles). 10h was generous.                                                                                                                                                                                   |
| Analysis-tool inline previews (Composer extra row) | P1, 6h  | **P1, 8h**              | DataFrame summary table rendering + chart thumbnail + sandboxed iframe wiring. Slightly higher.                                                                                                                                                                                          |
| Default/opt-in divergence (architectural)          | P1, 0h  | **P0, 0h**              | This is a parity-blocker root cause for half the gaps below, not a P1. Still 0h here because the migration is its own multi-week project — counted elsewhere. Flagged as P0 to surface it in EXEC-SUMMARY.                                                                               |

### Removed rows

| Row                              | Why removed                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Computer-use, Browser-automation | Kept (still no-gap, 0h) — but moved to a single "Out of scope on web (no gap)" line at the end of the table to save synthesis time. |

### Hour shifts at the totals level

| Bucket            | r1            | r2                                                                                                                                                                 | Delta    |
| ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| **P0**            | 100h (4 rows) | **150h** (6 rows: Artifacts re-priced, Settings re-priced, History re-priced, Memory re-priced, Attachments promoted from P1, default/opt-in promoted to P0 at 0h) | +50h     |
| **P1**            | 88h (8 rows)  | **112h** (12 row entries — 8 carried over from r1 with re-pricing, plus 4 new rows: branching, share, citations, second composer row for analysis-tool previews)   | +24h     |
| **P2**            | 26h (4 rows)  | **36h** (6 rows: kbd-shortcuts split out, reasoning + markdown added)                                                                                              | +10h     |
| **Surface total** | 214h          | **298h**                                                                                                                                                           | **+84h** |

The net jump is mostly:

- **+44h** from rows r1 never enumerated (branching, share, citations, reasoning, markdown, kbd shortcuts as own row).
- **+44h** from re-pricing memory + artifacts + history + settings + attachments to realistic scopes.
- **−4h** from de-duplicating Sidebar scope (Project wiring belongs to History/Projects, not double-counted).

I missed substantial scope in r1. The under-count was driven by reading `Composer/`, `Sidebar/`, `messages/MessageBubble`, and `artifacts/` deeply, but only listing `dialogs/`, `messages/InlineCitation`, `messages/ReasoningAccordion`, `BranchNavigator`, and `app/share/` without opening them. A 40% surface-total bump is the cost of that.

---

## Refined gap table (r2)

### Composer (no change to row content; hours unchanged)

| Evidence ref                                                                                                                                                      | Current state | Gap delta                              | Severity | Hours |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------- | -------- | ----- |
| `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:100-918`, `ComposerFooter.tsx:90-291`, `SlashCommandMenu.tsx:16-22`, `VoiceInputButton.tsx:42-80` | (same as r1)  | (same as r1) — confirmed by r2 re-read | P1       | 8     |
| `ChatComposerNew.tsx:78` (Run Code (Python) tool entry)                                                                                                           | (same as r1)  | (same as r1)                           | P1       | 8     |
| `SlashCommandMenu.tsx:16-22` (5 built-ins + custom commands)                                                                                                      | (same as r1)  | (same as r1)                           | P2       | 4     |

### Sidebar

| Evidence ref                                                        | Current state | Gap delta                                                                                          | Severity | Hours |
| ------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------- | -------- | ----- |
| `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:385-580` | (same as r1)  | (a) starred/pinned group missing (b) model badge on hover missing (c) hover-to-expand collapsed UX | P1       | 6     |

### Model picker

| Evidence ref                 | Current state | Gap delta                                                               | Severity | Hours |
| ---------------------------- | ------------- | ----------------------------------------------------------------------- | -------- | ----- |
| `ComposerFooter.tsx:204-286` | (same as r1)  | (same as r1) — Recommended row + context-window indicators + usage caps | P1       | 12    |

### Tool-call rendering

| Evidence ref                                                                                                                                                        | Current state | Gap delta                                                                       | Severity | Hours |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------- | -------- | ----- |
| `apps/web/features/chat/components/ToolCallCard.tsx:1-80` (read); `messages/ToolTimeline.tsx`, `InlineToolResults/{...}.tsx` (file exists; not opened in this pass) | (same as r1)  | (a) no explicit View input/output toggle; (b) collapsed pill vs our card chrome | P1       | 8     |

### Artifacts (r2 re-priced)

| Evidence ref                                                           | Current state | Gap delta                                                                                                                                                                                             | Severity | Hours  |
| ---------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:1-278` | (same as r1)  | (a) versioning [12h] (b) live preview for HTML/React/SVG/Mermaid [16h] (c) publish/share URL [10h] (d) edit-in-place [4h] (e) overflow chevron / kbd nav for tab list [polish only — out of P0 scope] | **P0**   | **42** |

### Settings (r2 re-priced)

| Evidence ref                                                                                     | Current state | Gap delta                                                                                                                                              | Severity | Hours  |
| ------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ |
| `apps/web/app/settings/{layout,page,general/page,billing/page,voice/page,capabilities/page}.tsx` | (same as r1)  | 8 sub-gaps as in r1 (profile, theme persistence, Workspace, Privacy/data-controls, Custom-instructions, Notifications, Voice actionability, restyling) | **P0**   | **36** |

### Onboarding

| Evidence ref                                                                                         | Current state | Gap delta                                                                                          | Severity | Hours |
| ---------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------- | -------- | ----- |
| `apps/web/app/signup/page.tsx:1-229`, `verify/page.tsx`, `login/page.tsx`, `WebChatPage.tsx:167-178` | (same as r1)  | No tour, no empty-state grid on default `/chat`, no starter-prompt pills, no ChatGPT-import prompt | P1       | 14    |

### Billing

| Evidence ref                                                                                                                                                           | Current state | Gap delta                                                                                      | Severity | Hours |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- | -------- | ----- |
| `apps/web/app/billing/page.tsx:1-29`, `features/billing/pages/BillingDashboard.tsx:1-100+`, `app/payment-failure/page.tsx:1-65`, `app/settings/billing/page.tsx:1-201` | (same as r1)  | (a) downgrade path missing in UI; (b) annual/monthly toggle visibility; (c) inline invoice PDF | P2       | 10    |

### History / Projects (r2 re-priced)

| Evidence ref                                                                                                                                    | Current state | Gap delta                                                                                                                                                                           | Severity | Hours  |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| `ChatSidebar.tsx:70-86,90-107`, `features/projects/components/{ProjectSidebar,ProjectSettingsDialog}.tsx`, `Composer/FolderContextSelector.tsx` | (same as r1)  | (a) Projects not in default sidebar; (b) no starred/pinned; (c) no archive (only delete); (d) title-only search vs full content; (e) "Older" terminal bucket, no monthly pagination | **P0**   | **28** |

### Memory (r2 re-priced)

| Evidence ref                                                                                                                        | Current state                                                        | Gap delta | Severity | Hours |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------- | -------- | ----- |
| no dedicated memory UI; closest analogue is `LocalByokHandoffDialog` + `buildHandoffContextCandidates` at `WebChatPage.tsx:264-268` | No Settings → Memory page, no per-fact list, no clear-all, no toggle | **P0**    | **32**   |

### Connectors / MCP

| Evidence ref                                                                                                                                                                                                                                    | Current state | Gap delta                                                                                                | Severity | Hours |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- | -------- | ----- |
| `features/connectors/pages/ConnectorsPage.tsx:1-100+` (32 connectors), `features/connectors/config/connector-logos.ts` (file exists; not opened), `app/connectors/{page,mcp-directory/}`, `app/integrations/page.tsx` (file exists; not opened) | (same as r1)  | (a) per-connector scope/permission UI unknown; (b) under `/connectors` not Settings; (c) phase-gating UX | P1       | 12    |

### Voice (transcription)

| Evidence ref                                                                                                                                                                                                         | Current state | Gap delta                                                                                                                        | Severity | Hours |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| `Composer/VoiceInputButton.tsx:1-80` (read); `chat/stores/voice-input-store.ts` (referenced; not opened); `Composer/VoiceRecordingOverlay.tsx` (file exists; not opened); `app/settings/voice/page.tsx:1-194` (read) | (same as r1)  | (a) voice button ahead of Claude web parity; (b) no voice-conversation mode (Claude Mobile only); (c) settings page is read-only | P2       | 6     |

### Search (global)

| Evidence ref                                                                                                                                                           | Current state | Gap delta                                                                                     | Severity | Hours |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------- | -------- | ----- |
| `chat/v3/WebSearchModalCmdK.tsx:1-80+` (opt-in shell), `ChatSidebar.tsx:507-526` (default), `chat/components/dialogs/GlobalSearchDialog.tsx` (file exists; not opened) | (same as r1)  | (a) Cmd+K only on `?unified=1`; (b) static items hard-coded; (c) title-only filter on default | P1       | 10    |

### Attachments (r2 re-priced, severity changed)

| Evidence ref                                                                                                                                                         | Current state                                                                                                                                                                     | Gap delta | Severity | Hours |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------- | ----- |
| `Composer/{AttachmentPreview,DragDropOverlay}.tsx`, `chat/hooks/use-attachments.ts` (referenced; not opened), `Composer/ChatComposerNew.tsx:206-228, 864-875` (read) | (a) Base64 inlining bloats payload + caps image size (load-bearing reliability gap, not polish). (b) No `accept` MIME filter. (c) Image-only previewer; code/PDF preview unknown. | **P0**    | **12**   |

### Multi-modal output

| Evidence ref                                                                                                                                                                                 | Current state                                                                                                                 | Gap delta | Severity | Hours |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- | -------- | ----- |
| `messages/MessageBubble.tsx:46-65` (read); `chat/components/MediaDisplay.tsx`, `messages/CodeExecutionBlock.tsx`, `artifacts/DocumentMessage.tsx`, `ImageLightbox.tsx` (4 files; not opened) | (a) Analysis tool DataFrame previews unclear; (b) image gen ahead of Claude parity; (c) DOCX/PDF matches Claude Word artifact | P1        | 8        |

### Slash commands (split from r1's combined row)

| Evidence ref                                                                                                                                | Current state                                                           | Gap delta                                                                                                             | Severity | Hours |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| `Composer/SlashCommandMenu.tsx:16-22, 36-50`, `dialogs/CustomShortcutDialog.tsx`, `shortcuts/PromptShortcuts.tsx` (files exist; not opened) | 5 built-ins + user-defined custom commands stored in `useSettingsStore` | (a) coverage of built-ins is shallow vs Claude (cross-validate); (b) custom commands are client-only and may not sync | P2       | 4     |

### Keyboard shortcuts (new row — split from slash-commands)

| Evidence ref                                                                                                       | Current state                                                                                                   | Gap delta                                                                                                                                                                                       | Severity | Hours |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| `dialogs/KeyboardShortcutsDialog.tsx:1-80` (read), `chat/hooks/use-keyboard-shortcuts.ts` (referenced; not opened) | Dialog renders categorized shortcuts (navigation / conversation / message / ui) with platform-aware key glyphs. | (a) Cmd+K only on `?unified=1` surface (already counted under Search); (b) some Claude shortcuts may be missing — needs image cross-check; (c) no in-product `?` hint cue to surface the dialog | P2       | 4     |

### Conversation branching (NEW r2 row)

| Evidence ref                                                                                                                                                                                                                                                     | Current state                                                                                                                                       | Gap delta                                                                                                                                                                                                                                                             | Severity | Hours |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| `apps/web/features/chat/components/BranchNavigator.tsx:1-40` (read partial — visual branch tree, navigate, name; uses `conversationBranchingService`), `dialogs/CreateBranchDialog.tsx` (file exists; not opened), `MessageBubble.tsx:36` imports `GitFork` icon | Branch tree visualization + create / rename / navigate branches via a service layer. UX entry point is the `GitFork` action on individual messages. | Claude has "Edit + branch" on user messages and "Try again with different model" on assistant messages. We have explicit branch UI but the **trigger affordances on hover** may not match Claude's inline edit/regenerate buttons cleanly. Cross-validate with image. | P1       | 8     |

### Conversation share (NEW r2 row)

| Evidence ref                                                                                                                                                                                                                                                    | Current state                                                                                                 | Gap delta                                                                                                                                                                                                                                                                                                                                                  | Severity | Hours |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| `apps/web/app/share/[token]/page.tsx:1-52` (read — Supabase `shared_sessions` table, 24-char token, expiry-aware, `ExpiredShareBanner`), `apps/web/components/share/SharedSessionViewer.tsx` (referenced; not opened), `apps/web/app/share/{error,loading}.tsx` | Public conversation share via Supabase `shared_sessions` table with token + expiry. SSR-rendered shared view. | Claude has a "Share" button on every conversation that opens a dialog (toggle public + copy URL + revoke). We have the route + table + viewer but the **share-action affordance from the sidebar/message list** is not obvious — I didn't find a "Share" button in `ChatSidebar` or `MessageActions`. May be hidden behind the export dialog or not wired. | P1       | 10    |

### Conversation export (NEW r2 row)

| Evidence ref                                                                                                                                                                          | Current state                                     | Gap delta                                                                                                                                                                                  | Severity | Hours                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------------------------- |
| `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:1-40` (read — 5 formats: markdown / json / html / pdf / docx via `ChatExportService` + `document-export-service`) | Multi-format export dialog with format selection. | Claude offers Export Conversation (Markdown / JSON) — we are a **superset** (PDF + DOCX + HTML). Likely **no parity gap**, but confirm the entry-point affordance from a session is clear. | P2       | 0 (no gap, just verify affordance) |

### Citations (NEW r2 row)

| Evidence ref                                                                                                                                                                               | Current state                                                                                                                           | Gap delta                                                                                                                                                                                                                                                                                                                                                                                | Severity | Hours |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| `apps/web/features/chat/components/messages/InlineCitation.tsx:1-50` (read — numbered teal pill, hover preview, opens in new tab); `CitationFooter` referenced from `MessageBubble.tsx:64` | Numbered inline `[1]`-style pill with hover preview card (title + snippet + external link). Footer aggregates citations at message end. | Claude web search renders citations as numbered superscript pills + a "Sources" panel at the message end. Likely gaps: (a) **Sources panel** with all citations aggregated and ordered — `CitationFooter` exists but visual style + grouping vs Claude needs image cross-check. (b) No "Open in citations panel" interaction. (c) Hover preview is OK but Claude shows favicon + domain. | P1       | 8     |

### Reasoning / Extended-thinking display (NEW r2 row)

| Evidence ref                                                                                                                                                                                                                                                                                             | Current state                                                                                                                                                              | Gap delta                                                                                                                                                                                                                                                                                                                                             | Severity | Hours |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| `apps/web/features/chat/components/messages/ReasoningAccordion.tsx:1-50` (read — step extraction, summary heuristic, prefers-reduced-motion), `apps/web/features/chat/components/ThinkingBlock.tsx:1-80` (read — live timer, collapsible, "Thought for Xs", `startedAt`/`completedAt`/`durationSeconds`) | Two coexisting components: `ReasoningAccordion` (steps[]) and `ThinkingBlock` (raw content + timer). Both collapsible, both stream-aware, both prefer-reduced-motion safe. | Claude renders extended thinking as a collapsible "Thought for Xs" block — we match that pattern. Likely gaps: (a) **Two coexisting components** (`ReasoningAccordion` and `ThinkingBlock`) is fragmentation — Claude has one. (b) Step extraction heuristic in `ReasoningAccordion:23-50` is regex-based — may over/under-summarize. Cross-validate. | P2       | 6     |

### Markdown rendering / message body (NEW r2 row)

| Evidence ref                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current state                                                                                                                                                                 | Gap delta                                                                                                                                                                                                                                                                                                                                                                                                 | Severity | Hours |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| `apps/web/features/chat/components/messages/MarkdownContent.tsx`, `messages/EnhancedMarkdownRenderer.tsx` (files exist; not opened), `MessageBubble.tsx:48-50` (dynamic import of `MarkdownContent` with skeleton fallback), `apps/web/package.json:84-118` (`react-markdown` ^10.1.0, `remark-gfm` ^4.0.1, `remark-math` ^6.0.0, `remark-breaks` ^4.0.0, `rehype-highlight` ^7.0.2, `rehype-katex` ^7.0.1, `rehype-raw` ^7.0.0, `katex` ^0.16.44, `mermaid` ^11.15.0, `react-syntax-highlighter` ^16.1.1) | Full markdown pipeline: GFM, math (KaTeX), code highlighting (Prism via react-syntax-highlighter), Mermaid diagrams, breaks, raw HTML. Dynamic-imported with skeleton loader. | Claude renders the same set (markdown + math + Mermaid + code highlight). Likely gaps: (a) **Custom code-block actions** — Claude shows copy + "Apply to file" affordances on code blocks; ours may be copy-only. (b) **Table affordance** — Claude lets you copy-as-CSV; unknown for us. (c) **Math block accessibility** — KaTeX needs aria labels; ours is the default `rehype-katex`. Cross-validate. | P2       | 6     |

---

### Out of scope on web (no gap)

| Area               | Note                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Computer-use       | Delegated to apps/desktop (`/features/tools` redirect at `app/features/tools/page.tsx:3`). Claude does not offer computer-use on web. **0h.** |
| Browser-automation | Delegated to `apps/extension` (Chrome MV3). Claude does not offer this on web. **0h.**                                                        |

---

## Refined totals (r2)

Re-summed row-by-row from the gap table above; this is the canonical r2 total.

**P0 (6 rows, 150h):**

- Default/opt-in divergence: 0h (architectural)
- Artifacts versioning/preview/publish/edit: 42h
- Settings depth: 36h
- History/Projects: 28h
- Memory editor: 32h
- Attachments signed uploads + MIME filter: 12h

**P1 (11 rows, 112h):**

- Composer (main UX consolidation): 8h
- Composer (Analysis-tool inline previews): 8h
- Sidebar (starred/pinned/model-badge/hover): 6h
- Model picker (tier/context/caps indicators): 12h
- Tool-call rendering (view input/output toggle): 8h
- Connectors per-server scopes: 12h
- Onboarding (tour + empty-state grid): 14h
- Search (Cmd+K on default + content search): 10h
- Multi-modal (DataFrame preview): 8h
- Branching (affordance polish): 8h
- Share (sidebar/message affordance): 10h
- Citations (Sources panel + favicon/domain): 8h

(That's 12 row entries summing to 112h — I count the two Composer rows separately.)

**P2 (6 rows, 36h):**

- Slash commands: 4h
- Keyboard shortcuts: 4h
- Billing (downgrade + invoice PDF): 10h
- Voice (settings actionability): 6h
- Reasoning display (component fragmentation): 6h
- Markdown (code-block actions, table CSV): 6h

**No-gap rows: 0h** — Export (we are a superset), Computer-use (delegated to desktop), Browser-automation (delegated to extension).

**Surface total (r2): 150 + 112 + 36 = 298h.**

> NOTE on the arithmetic: an earlier draft had 306h from a different sub-total; the **canonical r2 total is 298h** computed by row-by-row sum above. The +84h jump from r1's 214h is real and is driven primarily by the 6 missed feature areas (branching + share + citations + reasoning + markdown + kbd shortcuts as own row) and the artifacts/memory/settings re-pricing.

---

## Confidence in round-1 estimates

### High confidence in the r1 call

These rows I read directly in r1, the gap delta is straightforward, and r2 finds no new evidence:

| Row                       | r1 hours | Confidence                                                                                                     |
| ------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| Composer (main)           | 10 → 8   | **high** — I read 918 lines of ChatComposerNew.tsx and the gap is UX-polish                                    |
| Sidebar                   | 8 → 6    | **high** — read all 593 lines of ChatSidebar.tsx; gap delta is concrete                                        |
| Settings                  | 28 → 36  | **high** in finding (all 4 settings pages read), **medium** on hours (depends on profile-editor backend scope) |
| Memory                    | 24 → 32  | **high** in absence claim, **medium** on hours (greenfield)                                                    |
| Computer-use no-gap       | 0        | **high** — multiple confirming references in source                                                            |
| Browser-automation no-gap | 0        | **high** — absent from `apps/web`                                                                              |
| Onboarding                | 14       | **high** — signup/verify/login pages all read                                                                  |

### Medium confidence

These rows I cited but only partially opened; the gap call is defensible but image-side validation can shift hours ±25%.

| Row                 | r1 hours | Confidence                                                                                                                                          | Why medium                                                                                                     |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Model picker        | 12       | **medium**                                                                                                                                          | Read ComposerFooter fully but Claude's tier-ribbon claim is from memory, not from image evidence in this audit |
| Artifacts           | 30 → 42  | **medium** on hours — versioning/preview/publish scopes are real, but estimate depends on whether Claude requires server-side rendering for preview |
| History/Projects    | 18 → 28  | **medium**                                                                                                                                          | Project store + sidebar exist but I didn't open ProjectSettingsDialog to see depth                             |
| Tool-call rendering | 8        | **medium**                                                                                                                                          | Only read first 80 lines of ToolCallCard; InlineToolResults/\* not opened                                      |
| Connectors          | 12       | **medium**                                                                                                                                          | Only read first 100 lines of ConnectorsPage.tsx; per-server scope picker unknown                               |
| Multi-modal         | 8        | **medium**                                                                                                                                          | MediaDisplay, CodeExecutionBlock not opened                                                                    |
| Branching (NEW)     | 8        | **medium**                                                                                                                                          | First 40 lines only                                                                                            |
| Citations (NEW)     | 8        | **medium**                                                                                                                                          | First 50 lines of InlineCitation; CitationFooter not opened                                                    |
| Reasoning (NEW)     | 6        | **medium**                                                                                                                                          | Both components read but only ~80 lines each                                                                   |

### Low confidence

These rows I called from limited evidence; the lead should expect ±50% on hours.

| Row                | r1 hours | Confidence       | Why low                                                                                                                                            |
| ------------------ | -------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search (global)    | 10       | **low**          | WebSearchModalCmdK is opt-in only; default-surface global search may exist via GlobalSearchDialog (not opened)                                     |
| Attachments        | 8 → 12   | **low on hours** | The reliability concern (base64 inlining) is high-confidence; the precise migration cost to signed uploads is low-confidence without backend audit |
| Slash commands     | 4        | **low**          | CustomShortcutDialog + PromptShortcuts not opened — can't confirm sync behavior                                                                    |
| Keyboard shortcuts | 4        | **low**          | Only KeyboardShortcutsDialog opened, not the hook that defines the full shortcut catalog                                                           |
| Voice              | 6        | **low**          | voice-input-store.ts not opened; tier-allowance enforcement may be backend-only                                                                    |
| Markdown (NEW)     | 6        | **low**          | Only inferred from package.json deps + MessageBubble dynamic import; MarkdownContent + EnhancedMarkdownRenderer not opened                         |
| Share (NEW)        | 10       | **low**          | SharedSessionViewer not opened; the actual share-dialog component absent from my reads                                                             |
| Export (NEW)       | 0        | **low**          | Only first 40 lines opened; affordance entry-points not traced                                                                                     |

---

## Honest assessment of r1

1. **r1 was undercounted.** Surface total moves from 214h → 306h, a 43% bump, driven by 6 missed feature areas and 4 underpriced gaps. The lead should treat r1's surface total as a floor, not a ceiling.
2. **The branching, share, and export features are real and shipped** — I missed them because I focused on `Composer/`, `Sidebar/`, `messages/`, and `artifacts/` and skimmed past `dialogs/` and `app/share/`. Reading the dialog directory listing was not sufficient.
3. **Attachments severity was the most material error** — base64 inlining is not P1 polish, it's P0 reliability, especially given Claude's signed-URL upload baseline and the message-size cap implication. The image cross-check will not move this — it's deductive from the code.
4. **Citations and Markdown** are not gap-rich (we have most of what Claude has) but they each merited a row in the rubric because they are listed as features Claude has and we have something to compare against — r1 silently elided them.
5. **One thing I did right in r1**: separating "Bugs found incidentally" from parity gaps. The ChatSidebar:324 Settings misroute is still a bug, still 1h, still not P0-parity, and r2 keeps it where it is.

If the lead can only act on one r2 change, it should be the **attachment-base64 → signed-upload promotion to P0**. Everything else is additive scope; that one is a fix to a wrong call.
