# Claude Chrome Extension + VS Code Extension — UI Research

**Source**: `~/Desktop/reference/ui/claude/claude-chrome-extension/` (7 PNGs) and `~/Desktop/reference/ui/claude/claude-vscode-extension/` (9 PNGs).
**Date analyzed**: 2026-05-08.
**Mission**: Inform parity work on `apps/extension/` (Chrome MV3 v1.2.0) and `apps/extension-vscode/` (v0.3.0).

All claims below are pixel-cited per filename. Filenames are referenced by their numeric prefix (e.g. "C-01" for Chrome `01_…`, "V-05" for VS Code `05_…`).

---

## A. Chrome Extension

### A.1 Hosting model — side panel, not popup (Q1)

Every Chrome screenshot shows the extension docked as Chrome's **right-edge Side Panel** (introduced in MV3, manifest key `side_panel`), NOT a toolbar popup.

- **C-01** is the most diagnostic frame: full Chrome window with YouTube on the left and the Claude side panel pinned right. The Chrome-native Side Panel toolbar (bookmarks star, link, Claude starburst, puzzle piece, the active "side-panel toggle" icon framed in a gray square, an Assistant entry at the far right) sits above the panel content, confirming it is Chrome's first-party side panel rather than a custom iframe overlay.
- Visible side-panel width on **C-01** is roughly **400 px** (~1/4 of the window). On the close-ups (C-02 through C-07) the panel renders ~340 px wide content area inside the dashed yellow-dotted "selection" outline that Chrome paints around active panels.
- A pin/unpin icon and an X close-button live top-right on the panel header (C-02, C-04, C-05, C-07), beside the orange Claude starburst wordmark. Pinning keeps the panel attached when navigating between tabs.
- There is no popout toolbar bubble in any screenshot — the workflow assumes the panel stays open beside the page being assisted.

### A.2 Ask vs Act — agentic permission, not a chat-mode toggle (Q2)

Crucially this is **not** an "Ask vs Act" chat-mode segmented control like Cursor's. It is an **action-permission** dropdown that gates whether Claude executes browser actions autonomously or requests confirmation. **C-02** shows the open menu directly above the composer footer:

- Trigger: a low-emphasis pill in the bottom-left of the composer, currently reading `Ask before acting v` with a small hand-stop glyph (C-02 shows it as the unhovered state at the bottom of the panel; C-03/C-04/C-05 show the trigger swapped to `Act without asking` with a fast-forward `>>` glyph).
- Open menu (C-02) lists two options vertically:
  - `Ask before acting` (hand glyph) — _"Claude aligns on its approach before taking actions"_ — checked with a blue check mark.
  - `Act without asking` (`>>` glyph) — _"Claude takes actions without asking for permission"_.
- The currently selected option is mirrored on the trigger pill itself, so the composer footer always tells the user which permission stance is live.
- Visual difference between modes is restricted to that pill text + glyph; the panel body, color, and composer styling do not change. There is no separate "Ask mode chat" vs "Act mode chat" canvas.

This is the single biggest design lesson: Claude does **not** ship a chat/agent mode toggle; it ships a confirmation-gate toggle. Our `apps/extension/` should not invent a binary "chat vs agent" affordance — it should reuse this single permission pill.

### A.3 Quick Mode — experimental, modal opt-in, fastest-model + auto-act bundle (Q3)

Quick Mode is surfaced as a **lightning-bolt icon** in the top-right of the panel header (C-02..C-07), opposite the model picker. **C-06** captures the consent modal that fires the first time a user clicks it:

- Modal title: **"Quick mode is experimental"**.
- Body: _"This is an experimental mode that is still being evaluated. Monitor Claude closely while using it. Avoid sensitive workflows."_
- Two CTAs stacked vertically:
  - White button: `Enable with Haiku 4.5`.
  - Dark button: `Enable with Opus 4.6 (fast mode)`.
- Footer: _"Opus 4.6 (fast mode) is billed as extra usage at a premium rate. Separate rate limits apply."_
- Cancel link below: `Go back`.

**C-07** shows Quick Mode active: the bolt icon is filled orange, a black `Quick mode` tooltip surfaces, the model name in the top-left has flipped from `Sonnet 4.6 v` to `Haiku 4.5 v`, and the action-permission pill is auto-set to `Act without asking`. So Quick Mode is essentially a **two-thing bundle**: (1) downshift to the fast model the user picked at consent time, (2) flip the agentic permission to no-confirm. It is a "speed run" preset.

Implementation note: this is a clear UX win because it collapses two settings users would otherwise toggle independently. Our extension can mimic with a similar one-shot preset.

### A.4 Per-site behavior (Q4)

The screenshots do **not** show any visible per-site indicator (no domain breadcrumb, no site-scoped permission popover, no allowlist UI). The only site-context signal is the page sitting under/behind the panel itself. The action-permission pill is global — it does not branch by host. **Open question** flagged in §C.

### A.5 Composer (Q5)

Composer footer (visible on every Chrome PNG) layout, left to right:

- **Action-permission pill** (`Ask before acting v` / `Act without asking v`) — see A.2.
- **Cursor/pointer icon** with a subtle dotted-trail glyph (C-03..C-07). Best read as the Computer-Use / pointer-control affordance: it visually matches Anthropic's Computer Use cursor iconography. Clicking presumably hands input control to Claude.
- **`+` plus button** — opens the attachment menu (C-03):
  - `Take a screenshot` (camera glyph).
  - `Add an image` (image glyph).
  - Notably **no "Upload file"** option — extension is image-and-screenshot only.
- **Send button** — orange-brown rounded square with white up-arrow. Pressed state visible on C-04 and C-05.

Above the textarea sits a banner: _"Claude in Chrome requires a paid plan"_ with an `Upgrade plan` link (C-04, C-05, C-07). This is a permanent footer billboard shown to the unentitled user. Below the input is microcopy: _"Claude is AI and can make mistakes. Please double-check responses."_

Top of the composer pane has a header strip with:

- **Model selector** (top-left): `Sonnet 4.6 v` (or `Haiku 4.5 v` in Quick mode). Open state in **C-05** lists three models stacked with subtitles:
  - `Opus 4.6` — "Most capable for ambitious work".
  - `Sonnet 4.6` (currently checked, blue check) — "Most efficient for everyday tasks".
  - `Haiku 4.5` — "Fastest for quick answers".
- **Quick-mode bolt** (see A.3).
- **New-chat plus** (`+` inside a circle) — starts a fresh thread.
- **Three-dot kebab** — opens the more-options menu (C-04).

Empty-state placeholder text rotates between _"How can I help you today?"_ (C-04, C-07) and _"Type / for commands"_ (C-05) — implying slash commands are supported once the kebab/Settings are configured.

### A.6 Result rendering (Q6)

No screenshot shows an active conversation with assistant output, so result rendering cannot be confirmed. The empty-canvas size and composer styling suggest it parallels claude.ai's web markdown stack, but this is **unverified** (see Open Questions).

### A.7 Auth / paid-plan state (Q7)

Auth-state cues are subtle:

- No user avatar appears anywhere in the panel chrome (consistent with Claude's web app, which keeps the avatar in the global header — here, the user is presumed logged-in via the parent claude.ai session).
- Entitlement gate is shown via the persistent "Claude in Chrome requires a paid plan" banner with `Upgrade plan` link in the composer block (C-04, C-05, C-07).
- The model dropdown shows model names regardless of plan — no "locked" indicator on Opus 4.6.
- "Current model" is **always visible** as the leading element of the composer header.

### A.8 Settings access (Q8)

Settings live behind the **kebab `⋮` menu** in the composer header. **C-04** shows the open menu, three rows:

- `🕐 Convert to task` — converts the current conversation into a recurring/scheduled Claude task.
- `⚙ Settings` — gear glyph; presumably opens a settings page (likely in a new tab to claude.ai/settings, given the panel's narrow width).
- `🌐 Language >` — submenu chevron, opens a language picker.

There is NO inline preferences pane in the panel itself; Settings appears to deep-link out of the panel.

### A.9 Permissions surface (Q9)

The screenshots do not surface the underlying Chrome `host_permissions` / clipboard / scripting permissions visually. Implied permissions from features observed:

- **Read site / DOM** — required for any contextual help based on the page (necessary for Quick Mode + Act).
- **Take screenshot** — implies `activeTab` + `tabs.captureVisibleTab` or similar.
- **Cursor/pointer control** — implies content-script injection or scripting permission to drive the page.

But there is no in-panel "X site can read/write to this page" disclosure. Permissions are presumed approved at install time.

### A.10 Conversation history (Q10)

No history sidebar is shown. The composer header has only "new chat `+`" and the kebab. The `Convert to task` item under the kebab implies tasks are stored centrally (claude.ai). It is plausible that recent threads live behind some unseen affordance (perhaps a `🕐` recents icon) but **not visible in these 7 frames**.

---

## B. VS Code Extension

### B.1 Marketplace + extension identity (V-01, V-02)

**V-01** is the marketplace detail page:

- **Name**: "Claude Code for VS Code".
- **Publisher**: Anthropic (verified blue checkmark beside `anthropic.com`).
- **Identifier**: `anthropic.claude-code` (top-right Marketplace info card on V-03).
- **Version**: 2.1.86 on V-01 vs 7.1.86 on V-02 — note: V-02's version reads "7.1.86", which is anomalous and likely a mock/staging value. **Open question.**
- **Install count**: **6,000,000** (visible on both V-01 and V-02 as `⬇ 6,000,000`).
- **Rating**: 3.5/5 stars (57 reviews on V-01, 67 reviews on V-02 — different snapshots).
- **Auto Update** checkbox is on by default.
- Description copy: _"Claude Code for VS Code: Harness the power of Claude Code without leaving your IDE."_
- Five marketing bullets call out: Powerful intelligence, Works alongside you, New friendlier interface, Integrated with the editor, Powerful agentic features.

A late footer line on V-01 reads: _"Prefer the Terminal-based extension? If you miss the Terminal-style experience of the previous extension, don't worry! It hasn't gone anywhere. Use the `Claude Code: Use Terminal` setting to switch back."_ — confirming the new default is a sidebar/UI experience, with a settings flag to revert to a terminal-pass-through mode.

### B.2 Sidebar location and width (Q11)

**V-02, V-03, V-04, V-08, V-09** all show the chat docked in the **right-hand secondary sidebar** (VS Code calls this `auxiliary bar`), with the "Code-only softw[are]: New Chat" header label and tab strip across the top. Default width visible is ~210 px content area (the panel is narrower than the marketplace detail panel on V-01, which is the editor area showing `01_*`).

A tab beside `New Chat` reads `Untitled` (V-04), implying tab-grouped chat sessions inside the panel.

### B.3 Chat participant + invocation (Q12)

V-07 placeholder text reads: **`Plan, @ for context, / for commands`**. So the same invocation pattern as Anthropic's chat product:

- `@` opens the context picker (file/symbol).
- `/` opens slash commands.
- "Plan" is a recognized leading verb for plan-mode prompts.

**V-04**'s composer also shows the same placeholder. There is no visible `@agi` / `@claude` chat-participant intercept inside VS Code's native Chat surface — Claude Code ships its **own chat panel** rather than registering a participant in `vscode.chat`. That is a major divergence from our `apps/extension-vscode/` v0.3.0 which uses the `@agi` participant pattern.

### B.4 Inline edits + decorations + code lens (Q13, Q14)

No inline ghost-text, decoration, or code-lens overlays are visible in any of these 9 frames. All editing happens in the side panel via prompt → diff. The extension touches the editor through the file mention/attach flow rather than ambient inline UI. **Open question** on whether ghost-text exists post-prompt.

### B.5 Diff view (Q15)

Diff view UI is not directly shown. V-05 mentions modes including `Edit automatically` ("Claude will edit your selected text or the whole file") which would generate a diff. No screenshot captures the diff itself — likely it routes through VS Code's native diff editor (the standard left/right side-by-side `diff` document URI scheme) but **unverified here**.

### B.6 File-tree integration / context picking (Q7 in mapping → Q16)

**V-07** shows the `+` (Add context) menu opened in the bottom-left of the composer, containing:

- `↑ Upload from computer` (arrow-up glyph)
- `≡ Add context` (file/lines glyph)

Combined with the `@` mention placeholder (V-04, V-07), context is added either by uploading a file from outside the workspace or by `@`-mentioning a workspace file (this is the canonical `Mention file from this project…` row on V-06).

**V-06** has an explicit "Filter actions…" search box at the top of an actions menu listing context actions, model actions, etc. — hints at a Quick-Pick pattern for combined-action filtering.

The composer footer also shows a "current file pill" — `📄 audit.toml` — between the slash glyph and the bypass-permissions chip on V-05/V-06/V-07/V-08/V-09. This shows the **active editor file** as ambient context that travels with every message until removed.

### B.7 Terminal integration (Q17)

V-01 explicitly says the previous extension is terminal-based and the new one runs as a UI panel. Setting `Claude Code: Use Terminal` toggles between modes — confirmed by V-04's setting row "Claude Code: Use Terminal: Launch Claude in the terminal instead of the native UI." So terminal IS supported but as an opt-in, not a primary affordance.

V-03's settings list also includes a `Claude Code: Use Python Environment` row that "Automatically activate the workspace's Python environment when running Claude" — implying Claude can spawn shell processes via the integrated terminal.

### B.8 Status bar items (Q18)

VS Code status bar at the bottom of V-03/V-04/V-08/V-09 shows the standard VS Code items (`main*`, `agiworkforce`, `0`, `0`, `Cursor Tab`, `Screen Reader Optimized`). No Claude Code-specific status item is visible — surprising given the surface area available. Either the extension does not use the status bar OR the items are too small to read at this resolution. **Open question.**

### B.9 Settings (Q19)

**V-03** + **V-04** show the canonical VS Code Settings editor filtered by `@ext:Anthropic.claude-code`, listing **13 settings** (header reads "13 Settings Found"). Visible rows:

- `Claude Code: Allow Dangerously Skip Permissions` — _"Allow bypass permissions mode. Recommended only for sandboxes with no internet access."_
- `Claude Code: Autosave` — auto-saves files before Claude reads or writes them. **Default checked.**
- `Claude Code: Claude Process Wrapper` — executable path used to launch the Claude process.
- `Claude Code: Disable Login Prompt` — skip auth UI when auth handled externally.
- `Claude Code: Enable New Conversation Shortcut` — bind Cmd/Ctrl+N to new chat. Default **on**.
- `Claude Code: Environment Variables` — env var injection; can also be set in `settings.json`.
- `Claude Code: Hide Onboarding` — hide the onboarding checklist.
- `Claude Code: Initial Permission Mode` — dropdown defaulting to `default`.
- `Claude Code: Preferred Location` — dropdown `panel` (where Claude opens by default — panel vs editor vs sidebar).
- `Claude Code: Respect Git Ignore` — checked by default; respects `.gitignore`.
- `Claude Code: Use Ctrl Enter To Send` — when on, plain Enter creates a newline, Ctrl/Cmd+Enter sends.
- `Claude Code: Use Python Environment` — auto-activate workspace Python venv.
- `Claude Code: Use Terminal` — fallback to legacy terminal UI.

V-03/V-04 also have a **persistent right-side card** in the active chat: _"Upgrade for 3x usage & faster responses — You've reached your 3x usage limit. Responses may be slower. Upgrade to Pro+ for 3x more usage. [Upgrade to Pro+] [Set new limit]"_ — entitlement nag right inside the chat panel, same Pro+ branding our pricing memos use.

### B.10 Chat actions menu / slash + at commands (Q20)

**V-06** shows a tall "Filter actions…" menu opened via a control near the composer; rows grouped by section:

- **Context section**:
  - `Attach file…` (highlighted/hovered, dark gray bar).
  - `Mention file from this project…`.
  - `Clear conversation`.
  - `Rewind` — implies a checkpoint/rollback feature exists.
- **Model section**:
  - `Switch model… Default (recommended)` (right-aligned current value).
  - `Effort (High)` — three-position toggle (low/med/high), currently right-most.
  - `Thinking` — radio dot circle.
  - `Account & usage…`.
  - `Toggle fast mode (Opus 4.6 only)` — same "fast mode" Quick-mode concept as Chrome ext.

So the VS Code extension has a **Quick-Pick action palette** that combines context-management, model controls, and account access in one searchable menu. This is significantly more discoverable than scattering them across multiple buttons.

### B.11 Modes dropdown + effort slider (Q5 in mapping → V-05)

**V-05** is the most information-dense single screenshot. The "Modes" floating popover lists four mutually-exclusive permission/agency modes (`⌘ + tab` to cycle, per the chip in the popover header):

- `🤚 Ask before edits` — "Claude will ask for approval before making each edit."
- `</> Edit automatically` — "Claude will edit your selected text or the whole file."
- `🗒 Plan mode` — "Claude will explore the code and present a plan before editing."
- `🌀 Bypass permissions` (currently selected, with check mark) — "Claude will not ask for approval before running potentially dangerous commands."

Below the modes list sits an **`Effort (High)` slider** — three discrete dots (low/medium/high) with the high pip filled. Two "Modes" + "Effort" living in the same surface together captures the agency × intensity orthogonal axes.

Below: an empty composer ("Ask Claude to edit…"), the file-pill (`audit.toml`), and the `Bypass permissions` chip with chain-glyph at the right of the composer footer. Send button is a maroon-tinted up-arrow square — that maroon color is the visual signal that bypass mode is dangerous (V-05, V-07, V-08).

### B.12 Editor-canvas full-screen chat (Q in V-08, V-09)

**V-08** shows the chat opened in the **main editor area** (not the sidebar) — a tab labeled "Claude Code" sits on the editor tab strip, with the same `New Chat` content but expanded to full editor width. This is a tertiary placement: panel/sidebar/editor — selectable via the `Preferred Location` setting B.9.

The editor mode keeps the right secondary sidebar showing the entitlement upgrade card simultaneously, demonstrating both surfaces can co-exist.

### B.13 Sessions history (Q in V-09)

**V-09** opens the recent-sessions popover (clock icon top-right). Two tabs: `Local` (selected, dark) and `Web`. The list shows recent threads with relative-time stamps:

- `Untitled` 3m
- `hi` 11m
- `migrate-hardcoded-colors-tokens` 11m
- `[Image #11]no need of these` 2d
- `i want the 6 showcase cards images of the screen…` 2d
- `[Image #11]no need of these` 2d (dup)
- `it should show 350 credits that's correct it should…` 2d
- `Run docker/build-push-action@v7 GitHub Actions…` 2d
- `/model` 2d
- `/clear` 2d
- `/clear` 2d
- `i think we need to write the readme, use CLAUDE…` 3d

A search box (`Search sessions…`) sits above the list. The Local/Web split is an interesting differentiator: local conversations live on the user's filesystem (or a local Claude Code daemon); web ones round-trip through claude.ai. This is parity with our Local vs Cloud mode dichotomy in `packages/runtime/`.

---

## C. Cross-cutting

### C.1 Visual consistency (Q21)

The two surfaces share:

- The orange-brown Claude **starburst** logo as the only brand mark.
- A **single dark theme** (no light/dark toggle visible in either surface).
- The same **action-permission language** (`Ask before…`, `Act without asking`, `Bypass permissions`) — modes are progressively riskier in a consistent vocabulary.
- The same **Opus / Sonnet / Haiku** model nomenclature with the same one-line subtitles.
- The same **Quick / Fast mode** concept (lightning bolt in Chrome, "Toggle fast mode" in VS Code) — bundling speed + auto-permission.
- A **persistent paid-plan upsell** placed close to the composer (Chrome: "Claude in Chrome requires a paid plan"; VS Code: "Upgrade for 3x usage & faster responses").

But the affordances diverge:

- Chrome leans on **icon-buttons + popovers** because of the 340-px width constraint.
- VS Code uses a **Quick-Pick action palette** ("Filter actions…") that feels native to VS Code.

### C.2 What NOT to copy (Q22)

- **Persistent paid-plan banner** (Chrome ext) is loud and constantly visible. For our free-tier-first BYOK + Local positioning, we should not invert that polarity. A subtle "BYOK active" or "Local mode" pill would communicate the same state without nagging.
- **Three model tiers only** (Opus / Sonnet / Haiku). Our differentiator is **10+ providers**; we should NOT collapse to three tier presets. Keep the full provider × model picker.
- **No conversation history visible** in Chrome ext. We should ship recents (or at least pinned threads) on day one — even within 340 px the Claude side panel could afford it.
- **Bypass permissions** mode default-checked in V-05 with maroon-tinted send button is a worrisome default. We should default to Ask mode for safety; Bypass should be opt-in per workspace, not session-level.
- **Quick Mode confirmation modal worded as "experimental"** — feels like an unfinished feature flag. If we ship a similar bundle, ship it without the apology copy.
- **`tab` to cycle modes** chord (V-05) clashes with editor-tab-completion focus. We should use a different chord or the existing `Cmd+Shift+P` palette.

### C.3 Multi-provider visibility (Q23)

**Both extensions are Claude-only.** Every model name visible across the 16 frames is `Opus 4.6`, `Sonnet 4.6`, or `Haiku 4.5`. There is no provider switcher, no `gpt-*`, no `gemini-*`, no Ollama indicator. The "Switch model…" row in V-06 leads to "Default (recommended)" — implying a Claude-internal recommendation rather than cross-provider selection.

This is our biggest **differentiator opportunity**:

- Chrome ext: lead with a provider+model pill that says `Anthropic · Claude Sonnet 4.6` and lets users flip to OpenAI / Gemini / Ollama / xAI / DeepSeek mid-conversation.
- VS Code ext: in the action-palette equivalent, "Switch model…" should open a provider-grouped quickpick.

### C.4 Mode-vocabulary parity for our extensions

Recommendation: align `apps/extension/` and `apps/extension-vscode/` permission-pill copy with Anthropic's wording for cross-app muscle-memory: `Ask before acting` / `Act without asking` / `Bypass permissions`. Add a fourth `Plan mode` if we want VS Code parity.

### C.5 Surface-specific microinteractions worth copying

- Chrome **Quick Mode bundle**: speed-model + no-confirm packaged behind one click is well-designed. Worth copying as `Turbo` or similar with our own naming.
- VS Code **Filter actions… Quick Pick**: collapses 6+ scattered controls into a searchable list. Excellent discoverability, native VS Code idiom — copy this pattern wholesale.
- VS Code **Local / Web sessions tabs** (V-09): direct parity with our Local vs Cloud mode story; we should ship the same split.
- VS Code **`Rewind`** (V-06): conversation-checkpoint affordance. We have `apps/cli/` checkpoints/branches in flight — surfacing them in the extension chat panel is a natural extension.
- VS Code **active-file pill** in the composer footer (`📄 audit.toml`) — clearer ambient-context indicator than relying on the sidebar selection.

---

## D. Open Questions

1. **Per-site behavior in Chrome ext**: do `Ask`/`Act` permissions branch per host, or is the setting global? None of the 7 frames clarify. Worth installing the actual extension to inspect.
2. **Result rendering** in Chrome panel: no assistant-output frame is captured. Does it match claude.ai markdown (code blocks, tables, artifacts) or simplify? Need to drive a real conversation to verify.
3. **Conversation history in Chrome ext**: is there a recents drawer behind the kebab or the `+` "new chat" button? Currently invisible.
4. **VS Code chat-participant**: does the extension ALSO register in `vscode.chat` (`@claude` in the native Chat view) in addition to its own panel? V-02 suggests a separate panel only, but the marketplace listing at V-01 doesn't disambiguate.
5. **Inline ghost-text / decoration**: does Claude Code render `Inline Suggest` or `CompletionItem` decorations, or is all editing routed through the side panel + diff editor? V-05's `Edit automatically` mode is the most likely to produce ghost-text — capture is missing.
6. **Diff view layout**: side-by-side vs inline patch UI when `Edit automatically` runs?
7. **Status bar items**: does Claude Code expose model / mode / token-usage status items? Status bar is too small to read in the captures.
8. **Version anomaly**: V-01 shows `2.1.86`, V-02 shows `7.1.86`. Which is canonical? Did the team rebase the version scheme?
9. **`Web` tab in Local/Web sessions split** (V-09): does this stream conversations from claude.ai, or is it a different storage backend?
10. **Sidebar Activity Bar slot**: the Claude Code icon sits in the **Auxiliary Bar** (right side) by default per V-02; can users move it to the primary Activity Bar (left)? `Preferred Location: panel` is the default — what other values are accepted?
11. **Slash commands**: V-09 history shows `/model` and `/clear` slash commands. What's the full list? Likely surfaced via `/` autocomplete in the composer but not captured.
12. **Effort slider behavior**: low / medium / high — does this map to thinking-budget tokens, retries, or something else? V-05 + V-06 show two distinct surfaces of the same control.
13. **Auto-context size limit**: does the active-file pill (`audit.toml`) auto-truncate large files, or send the full file to context every turn?
14. **Cmd+Tab modes-cycle conflict**: how does the `⌘ + tab` chord coexist with macOS app-switcher — is it limited to focus-in-chat?
15. **Quick Mode rate-limit copy**: V-06 says `Opus 4.6 (fast mode) is billed as extra usage at a premium rate. Separate rate limits apply.` — what does "premium rate" map to numerically?
