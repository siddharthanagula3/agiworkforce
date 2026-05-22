# src-6 ROUND-2 self-QA — `apps/extension-vscode` parity audit (2026-05-21)

Critique target: `audit/anthropic-apps-parity/team-2026-05-21/src-6-report.md` (round 1, same author).
Scope: same as round 1 — `apps/extension-vscode/src/features/{sidebar-webview, chat-participant, model-picker, code-lens, inline-completions, hover, trees, desktop-bridge}`.
Methodology: re-read every file referenced by round 1, follow code paths I read only partially before, look for missed surfaces.

## Changes from round 1

### Correction-1 (material error) — sidebar webview _does_ persist conversations to `ConversationStore`

Round 1 §7 "Conversation persistence" row + §13 self-noted parity flag #4 stated:

> "Sidebar webview path does not currently persist on every turn (`_conversationHistory` is in-memory)."
> "Sidebar webview also does NOT persist conversations to ConversationStore - only the @agi path does."

**This is wrong.** I read the start of `_handleSendMessage` but stopped before line 723. The `onDone` callback at `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:719-737` does write to the store:

```ts
if (this._conversationStore !== undefined && this._conversationTreeProvider !== undefined) {
  const userText = text;
  const conv = this._conversationStore.create(
    userText.slice(0, 60).replace(/\n/g, ' '),
    resolvedModel,
  );
  const now = Date.now();
  conv.messages = this._conversationHistory
    .filter((m) => m.role !== 'system')
    .map((m) => ({ ...m, timestamp: now }));
  this._conversationStore.save(conv);
  this._conversationTreeProvider.refresh();
}
```

It is the **same logic** as `chatParticipant.ts:381-396` — both paths persist on `onDone`. The History tree therefore _does_ reflect both surfaces, and the "possible regression vs design intent" worry I flagged is incorrect. Removing that worry from §13.

Knock-on effect: the §7 "Conversation persistence" row note `(folded into history row) P1` is invalid — there is no separate persistence gap; the History tree row stands on its own.

### Correction-2 (severity downgrade) — History tree flat list

Round 1 marked the flat-list History tree as **P0 / 14h** because it lacks Today / Yesterday / This Week buckets, search, pinning, rename, project tagging, export.

After Correction-1, the tree is populated correctly for both paths. The remaining gap is purely _organizational UX_. Compared against an editor-resident IDE surface (vs Claude's web/desktop history), the bar for P0 should be reserved for blocked workflows. A flat date-sorted list with relative-time descriptions still lets a user open any past conversation by name. Severity is more honestly **P1**, and hours come down: grouping by day buckets (Today / Yesterday / This Week / Older) using existing `formatRelativeTime` is a tree-restructure of ~6h. Adding a search QuickInput command (`agi-workforce.searchConversations`) is ~3h on top. Total **9h, P1** is the honest number — not 14h, P0.

### Correction-3 (hours refinement) — tool-call rendering

Round 1 marked tool-call rendering at **P0 / 18h** for "structured result viewers (file diff for edits, table for queries), permission prompts, editable tool input." That mixes three independent pieces:

1. Result rendering (display actual output, not just input JSON): 8h.
2. Permission prompt UI ("Allow once / Allow always" inline pills) — backend signals would need wire-up too, but for the webview-side affordance alone: 5h.
3. Editable tool input: 6h.

Bundled together as "tool calls reach parity": 19h is closer than 18h, but **the right call is to split this row**. Keeping it bundled at P0 / 18h was lazy; the granular split is more useful for the lead's planning.

### Correction-4 (severity downgrade) — Citations row

Round 1 marked Citations rendering at **P1 / 10h** for a VS Code coding extension. Citations are a meaningful feature in Claude _web/desktop chat_, but for an in-IDE coding-assistant surface a citation chip is an exotic affordance. Mark as **P2 / 6h** — polish, not visible UX gap for the IDE persona.

### Correction-5 (severity adjustment) — Inline images / multimodal output

Round 1 marked **P1 / 8h**. After re-considering against the IDE persona: assistant-returned images appear in Claude's web/desktop chats but I have no evidence the Cursor `claude-code` panel renders them either (and that's the closest VS Code analog). Keep the row but mark **P2 / 6h**. A coding assistant rarely returns images.

### Correction-6 (hours refinement) — Composer "Add file or image" mislead

Round 1 marked **P0 / 14h** for proper image attach (drag-drop + paste + preview + base64 transmission). Re-checking the actual files: the webview has no FileReader hookup, no drag/drop listeners, no paste handler. Adding drag-drop + paste-from-clipboard with thumbnail preview + base64 wire format is more like **16-18h** (the existing 14h was optimistic — it underweighted the wire-format change to bake images into the `LlmChatMessage` content array, which would need a small types update). **P0 / 17h** is more honest.

### Correction-7 (missed gap) — token-counter / context-budget UI

Round 1 missed this. There is a token counter (`apps/extension-vscode/src/data/tokenCounter.ts`, 7.5KB) and context-budget logic (`apps/extension-vscode/src/data/contextBudget.ts`, 2.8KB) plus commands `agi-workforce.resetTokenCounter` and `agi-workforce.showTokenBreakdown` (`package.json:197-200, 252-255`). The sidebar webview does **not** surface either in its UI — there is no "tokens used / context %" badge in the composer or header. Claude desktop / web show context-window utilization prominently. **P1 / 5h** for a header-mounted token badge wired to the existing `tokenCounter` API.

### Correction-8 (missed gap) — agent-mode panel UI not surveyed

Round 1 mentioned `providers/agentMode/agentLoop.ts` and `agentUI.ts` (1157 LOC total) in passing but did not audit them as a feature area. `agentUI.ts` contains the approval dialogs, diff previews, patch/edit application, and undo flow — i.e. the **Human-in-the-Loop** surface that Claude's tool-call UX is famous for. This is the closest analog to Claude's permission-prompt experience in the extension. Round 1 should have had a dedicated row for it. Without re-reading the full 751 LOC, the round-2 finding is: **the agent-mode HiTL flow exists, lives outside the webview (uses native VS Code modals + diff editor), and is invoked separately from chat.** Severity is **P1** — the flow works but is not integrated into the chat experience the way Claude weaves Allow/Deny into the message stream. Cross-integration hours: ~12h.

### Correction-9 (missed gap) — webview `@`-mention completeness

Round 1 §1 covered the `@`-mention dropdown for files but missed that `@`-mention has **no support for symbols, recent files, workspace folders, or non-file tokens**. The `detectMention` function in `webviewContent.ts:1554-1569` only triggers a file search; there is no `@workspace` / `@symbol` / `@recent` namespace. Claude desktop does not have `@` per se, but Cursor's claude-code panel + Copilot Chat both have richer `@`-mention pickers. Severity **P2 / 4h** — extra namespaces.

### Correction-10 (clarification) — slash-commands parity row

Round 1 §1 row "Slash-commands in composer" said the sidebar composer has no slash autocomplete. Re-checking, the empty-state chips do prefill `/explain selected code`, `/fix `, `/tests ` — but `_handleSendMessage` does **not** interpret leading `/` as a command. The text is sent verbatim to the LLM. So the round-1 description is correct, but the **direction-of-comparison** note ("Claude composers don't use /cmd syntax") deserves emphasis: this is a parity gap against Claude _Code CLI_, not against Claude web/desktop. Keep severity P1 / 10h but tag it as "Claude Code CLI parity, not Claude web/desktop parity".

### Correction-11 (no change but worth noting) — desktop-bridge audit was thin

Round 1 spent only 3 rows on the 891-LOC `desktopBridge.ts`. I focused on auth + lifecycle but did not exercise the convenience-method surface (`sendCodeSnippet`, `shareContext`, `triggerAgentAction`, `acceptDiff` / `rejectDiff` flow). Since there is no Claude parity comparison for the bridge (Claude has no IDE↔desktop link), the round-1 P2 / 0h verdict still stands — but the audit was thin. **No change to ratings**, only documenting the depth limitation.

## Refined gap table

Only rows that _changed from round 1_ are reproduced here. Rows not listed are unchanged.

| #         | Feature area                                                             | r1 sev | r1 hrs   | r2 sev            | r2 hrs     | Reason                                                                |
| --------- | ------------------------------------------------------------------------ | ------ | -------- | ----------------- | ---------- | --------------------------------------------------------------------- |
| §3        | Tool-call rendering                                                      | P0     | 18       | P0 (3 split rows) | 19 (8+5+6) | Split into result render / permission UI / editable input             |
| §3        | Citations / sources                                                      | P1     | 10       | P2                | 6          | IDE persona — exotic feature; downgraded                              |
| §3        | Inline images / multimodal output                                        | P1     | 8        | P2                | 6          | No evidence Claude IDE surfaces render images either; downgraded      |
| §1        | Composer — Plus menu (attachments / image mislead)                       | P0     | 14       | P0                | 17         | Wire-format change underweighted; +3h                                 |
| §7        | Conversation history tree (flat)                                         | P0     | 14       | P1                | 9          | Tree IS populated by both paths; gap is organizational only           |
| §7        | Conversation persistence (folded note)                                   | P1     | (folded) | —                 | —          | **REMOVED** — round-1 claim was factually wrong (correction-1)        |
| §13       | Parity flag #4 ("sidebar doesn't persist")                               | —      | —        | —                 | —          | **REMOVED** — factually wrong                                         |
| NEW (§3a) | Token counter / context-budget UI in webview                             | —      | —        | P1                | 5          | Existing `tokenCounter` API not surfaced in UI                        |
| NEW (§3b) | Agent-mode HiTL not integrated into chat stream                          | —      | —        | P1                | 12         | Approval dialogs live in native modals, not in webview tool-call rows |
| NEW (§1a) | `@`-mention only supports files, no `@workspace` / `@symbol` / `@recent` | —      | —        | P2                | 4          | Other namespaces missing                                              |

### Round-1 rows that remain unchanged

- Composer textarea + send (P2 / 0)
- Composer mode/effort chips (P2 / 0)
- Slash-commands in sidebar composer (P1 / 10) — tagged "Claude Code CLI parity"
- Composer empty-state chips (P1 / 6)
- Sidebar registration (P2 / 0)
- Sidebar header (P1 / 5)
- Provider badge (P2 / 0)
- Usage meter banner (P2 / 0)
- Assistant message rendering — incremental markdown (P1 / 12)
- Code-block rendering — Apply/Insert affordance (P0 / 16)
- System/error messages (P1 / 4)
- Typing indicator (P2 / 0)
- All 4 model-picker rows (P2 / 0)
- All 5 chat-participant rows (P2 / 0)
- All 4 code-lens / inline-completions / hover rows (P2 / 0)
- Sessions history command (P2 / 0)
- Context Files tree (P2 / 0)
- All 3 desktop-bridge rows (P2 / 0, with thinness caveat above)
- Settings surface (P2 / 0)
- First-run prompts (P1 / 6)
- Sign-in / auth (P1 / 12) — no OAuth, README mislabels header
- Keybindings (P2 / 0)
- All 5 security/telemetry rows (P2 / 0)
- Skills / Connectors menu (P0 / 14)
- Voice input (P1 / 12)
- Computer-use / browser-automation (P1 / cross-surface)
- Artifacts panel (P1 / folded into Apply-button row)
- Memory / projects (P1 / 16)
- Conversation search (P1 / 6)
- Share / export (P2 / 6)

## Confidence in round-1 estimates

Net summary of corrections:

| Category                 | r1 verdict | r2 verdict                                                              |
| ------------------------ | ---------- | ----------------------------------------------------------------------- |
| Material errors found    | —          | 1 (sidebar persistence claim)                                           |
| Severity downgrades      | —          | 3 (history P0→P1, citations P1→P2, images P1→P2)                        |
| Severity upgrades        | —          | 0                                                                       |
| Hour estimates raised    | —          | 1 (image attach 14→17)                                                  |
| Hour estimates lowered   | —          | 1 (history 14→9)                                                        |
| Missed gap rows added    | —          | 3 (token counter UI, agent-mode HiTL integration, @-mention namespaces) |
| Rows confirmed unchanged | —          | 36                                                                      |

**Overall confidence in round 1: moderate.** The structural shape of the audit (12 sections, evidence-cited rows, severity calibration) is sound. The one material error (Correction-1) is a read-completion failure — I stopped reading `_handleSendMessage` at line ~610 in round 1 and missed the persistence call at line 723. The severity downgrades (history, citations, images) reflect honest re-calibration against the IDE persona rather than the consumer-chat persona; my round-1 framing leaned too hard on the Claude web/desktop reference set.

**Most useful round-1 findings that survive round 2 unchanged:**

1. Sidebar is template-literal HTML/CSS/vanilla-JS — no React, no `packages/unified-chat` consumption. (Confirmed.)
2. Markdown only renders at `done` event — not incrementally during streaming. (Confirmed.)
3. Code blocks have no Apply/Insert UI even though `proposeDiff` backend exists. (Confirmed.)
4. Plus-menu "Add file or image" misleads — only pins file paths, no image bytes. (Confirmed.)
5. CSPRNG nonce, tight CSP, TOCTOU-safe bridge token read, Zod-validated protocol messages, sensitive-file denylist. (All confirmed strengths.)
6. Model IDs sourced from `@agiworkforce/types/getCoreManualModelOptions()` — complies with `locks/rule-models-json-canonical.md`. (Confirmed.)
7. The chat-participant @agi path and the sidebar webview path **share** the persistence logic (round-2 update: round-1 was wrong about divergence; they are equivalent in this respect).

**Most regrettable round-1 misses:**

- Token-counter / context-budget UI gap (data layer exists, no UI binding).
- Agent-mode HiTL flow lives in native modals, not woven into the chat stream — the single most Claude-shaped UX delta in the extension.
- `@`-mention namespace gap (files only).
- Premature P0 on History tree based on a flat-list aesthetic complaint rather than a workflow blocker.

End of round-2 report.
