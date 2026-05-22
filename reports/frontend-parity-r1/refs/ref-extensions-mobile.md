# Extensions & Mobile Reference Analysis

**Image set covered:**

- `/reference/ui/claude/claude-chrome-extension/` — 7 files
- `/reference/ui/claude/claude-vscode-extension/` — 9 files
- `/reference/ui-capture-runs/20260513-185809-agent-platform-reference/screenshots/claude-chrome/` — 11 files
- `/reference/ui-capture-runs/20260513-185809-agent-platform-reference/screenshots/claude-mobile/` — 0 files (empty; mobile ref exists only in MEMORY as March 2026 iOS app captures)

**Total images read**: 27 browser extension + editor extension files; mobile reference from memory artifact

---

## Mislabel report

None found. All filenames accurately describe content.

---

## Per-competitor pattern inventory

### Claude Chrome Extension (MV3)

#### 1. APP SHELL

- **Side panel layout**: Right-side fixed-width sidebar (dark theme, 300–350px approx). Minimal chrome — Claude logo + model selector + header controls (spark icon for reasoning, chat icon, more-options menu).
- **Header stack**: Model name (e.g., "Sonnet 4.6") + dropdown chevron; spark button (reasoning mode toggle); comment/feedback icon; three-dot menu (Convert to task / Settings / Language / Log out).
- **Chat composition**: Text input field with placeholder, attachment affordances (+ button), send button (orange/terracotta accent), action-permission dropdown selector (Ask before acting / Act without asking).
- **Context awareness**: "Claude in Chrome requires a paid plan" dismissible banner when feature-gated.

#### 4. COMPOSER

- **Attachment menu**: Triggered by + icon; two options: "Take a screenshot" + "Add an image" (both with icons).
- **Model selector**: Dropdown showing Opus 4.6, Sonnet 4.6 (current, checkmark), Haiku 4.5 with capability descriptions ("Most capable", "Most efficient", "Fastest").
- **Action permission toggle**: Two-option modal: "Ask before acting" (default, checked) vs "Act without asking" with explanatory copy; persisted state.
- **Quick mode toggle**: Experimental modal with two CTA buttons: "Enable with Haiku 4.5" + "Enable with Opus 4.6 (fast mode)"; disclaimer copy; "Go back" tertiary button.
- **More-options menu**: Convert to task, Settings, Language (submenu with chevron).
- **Task conversion**: Shortcut to save chat as a scheduled task in Dispatch.

#### 11. MODEL / MODE FEATURES

- **Quick mode**: Separate experimental feature (not a global toggle like extended thinking); Haiku 4.5 is the implied default; Opus 4.6 labeled "(fast mode)" suggesting Opus is capable but slower. Modal is gating mechanism.
- **Reasoning mode**: Spark button in header suggests extended thinking or similar reasoning toggle.

#### 16. BROWSER EXTENSION UX (primary focus)

- **Sidebar empty state**: Dark background, model selector visible, "Claude in Chrome requires a paid plan" banner (upgrade link), input field with "How can I help you today?" placeholder, action-permission selector at bottom.
- **Model selector**: Inline dropdown in header; Opus 4.6, Sonnet 4.6, Haiku 4.5 with capability taglines; checked indicator on current.
- **Attachment menu**: Minimal — screenshot + image only (no cloud drives, notebooks, files like web/desktop); triggered by + button.
- **More-options menu**: Accessible via ... button; includes task conversion, settings, language selection.
- **Action permission selector**: At composer bottom; two stable states (Ask / Act) with explanatory copy; "Always allow action on this site" checkbox variant in some flows.
- **Permissions page**: Settings tab with sections: Notifications (toggle for task completion), Microphone (allow access button), Your approved sites (list with "Revoke" action), Shortcuts (create shortcut modal with Name / Prompt / Start URL / Schedule toggle fields).
- **Quick mode modal**: Experimental feature dialog with two CTA paths (Haiku vs Opus).
- **Page blocking**: Shield icon + "Can't access this page" message when content is blocked for safety (sensitive sites).
- **Floating panel affordances**: None visible in current captures (no YouTube summarize or in-page floating panels in scope).
- **Browser-control assistant patterns**: "Convert to task" affordance suggests task dispatch; no explicit browser-control mode visible.

#### 18. CLI / TUI UX (not in scope for this surface but visible in shortcuts)

- Shortcuts feature includes command palette with filtering ("Show me the permissions list for this sidebar..."); batch actions (e.g., "Batch — 12 actions").

---

### Claude VS Code Extension (v0.3.0)

#### 1. APP SHELL

- **Marketplace detail page**: Extension shows 6,000,000 installs, 4.5 stars (87 reviews), "Auto Update" checkmark, DETAILS + FEATURES tabs.
- **Sidebar chat panel**: Narrow left-side chat column; tab bar at top ("New Chat"); "Claude Code" branding (icon + text); icons for time/history + new-chat in header.
- **Full-screen editor integration**: Chat can expand to full editor width; tab-like header showing "Claude Code" with close button.

#### 2. ONBOARDING / AUTH

- **Marketplace detail page**: Description, features list, "New to Claude Code?" section, "Prefer the Terminal-based extension?" callout with "Use Terminal" setting link.
- **Auth state**: Sidebar shows email once logged in (e.g., "siddhartha@...gmail.com" in top-right).

#### 3. EMPTY STATE

- **Sidebar empty state**: Dark background, Claude Code logo (pixelated 8-bit icon, orange/terracotta), centered text: "What to do first? Ask about this codebase or we can start writing code."
- **Full-screen editor empty state**: Identical message + icon placement, larger scale.
- **Heroic framing**: "Ask about this codebase" is the first suggested path (exploratory), not "Let's code" — matches non-coding-first positioning.

#### 4. COMPOSER

- **Text input**: Placeholder "Ask Claude to edit..." (when in Ask mode) or "Ask Claude to edit..." (generic); pink/magenta accent border when focused/active.
- **Attachment menu**: Two-part: "Upload from computer" + "Add context" (both with icons); triggered by buttons to left of input.
- **Mode selector dropdown**: Shows 4 modes: "Ask before edits" (default), "Edit automatically", "Plan mode", "Bypass permissions"; each with icon + description.
- **Effort slider**: Labeled "Effort (High)" with 3-notch slider (low / mid / high); integrated in the actions menu, not always visible.
- **Additional controls**: "Bypass permissions" toggle (separate button); Account & usage link; "Toggle fast mode (Opus 4.6 only)" option.
- **Add context menu**: Expandable section with "Attach file..." and "Mention file from this project..." options.

#### 6. ARTIFACTS / SIDEBAR (editor-native)

- **Code diff inline**: Not a separate panel; changes appear in-editor with accept/reject buttons.
- **Rewind action**: Undo/revert last edit button in actions menu.
- **Clear conversation**: Explicit action to reset context.

#### 9. SETTINGS

- **Settings editor view**: Tabbed view (DETAILS tab visible); left nav includes "Extensions (13)" section for Claude Code (13); collapsible subsections for settings categories.
- **Setting types**: Toggles (e.g., "Auto Bypass permissions mode"), checkboxes, dropdowns (e.g., Initial Permission Mode = "default"), multi-line text input for environment variables.
- **Featured settings visible**: "Claude Code: Auto Dismiss Sky Permissions" (toggle), "Claude Code: Autoassume" (checkbox + explanation), "Claude Code: Check Process Wrapper" (description), "Claude Code: Disable Login Prompt", "Claude Code: Enable New Conversation Shortcut", "Claude Code: Environment Variables", "Claude Code: Hide Onboarding", "Claude Code: Initial Permission Mode".
- **Usage limit sidebar**: Right panel shows "Upgrade for 4x usage & faster responses" banner with plan/pricing info.

#### 11. MODEL / MODE FEATURES

- **Modes**: Dropdown menu offering Ask / Edit / Plan / Bypass Permissions (with checkmark on current selection).
- **Effort slider**: Three-position slider for reasoning effort (High shown); persists across modes.
- **Thinking toggle**: Separate switch in actions menu.
- **Fast mode toggle**: "Toggle fast mode (Opus 4.6 only)" — implies fast mode is Opus-exclusive.

#### 17. VSCODE EXTENSION UX (primary focus)

- **Sidebar chat empty state**: Minimal; icon + hero text only, no quick-action chips.
- **Modes dropdown**: In input area, compact dropdown showing 4 modes (Ask / Edit / Plan / Bypass); descriptions inline in each menu item.
- **Effort slider**: Integrated in actions menu, not in input bar by default; 3-notch control.
- **Actions menu**: Accessible via ... or triggered by mode/settings button; sections: Context (Attach file / Mention project file / Clear conversation / Rewind), Model (Switch model / Effort slider / Thinking toggle / Account & usage / Toggle fast mode), Usage warning (if applicable).
- **Add context menu**: Two buttons (Upload from computer / Add context) in input area; context-specific file mention inline.
- **Settings editor**: Full-screen tab or side pane showing Claude Code settings with toggles, checkboxes, text inputs; settings are managed per-workspace or per-user profile.
- **Sessions history**: Dropdown with searchable session list; sidebar show recent chats with timestamps (e.g., "11 steps", "Created a plan", "Batch — 12 actions").
- **Marketplace detail page**: Title, install count, rating, description, features list, requirements section.
- **Inline permissions banner**: "Prefer the Terminal experience? Switch back in Settings." Dismissible callout.
- **Usage warning**: Right-side banner showing "Upgrade for 4x usage & faster responses" with "Upgrade to Pro" button link.
- **Full-screen chat in editor**: Chat can be toggled to expand full editor width; same UI controls (mode, effort, actions) available.

#### 18. CLI / TUI UX

- **Terminal-based extension fallback**: Mentioned in settings ("Use Terminal" preference); implies a pure-CLI variant exists for users preferring TUI.

---

### Claude Mobile iOS (March 2026 capture, from MEMORY artifact)

#### 1. APP SHELL

- **Sidebar (drawer)**: Slide-out left nav with "Claude" heading; 5 nav items (Chats, Projects, Artifacts, Code, Dispatch); "Recents" label + conversation list; user profile at bottom (avatar, name, orange "+" new chat button).
- **Header**: Model selector dropdown (current + chevron), no persistent top bar (mobile-optimized).

#### 3. EMPTY STATE

- **Hero**: Dark warm background (olive/brown dark theme, matches web); Claude sparkle icon animation (orange/red asterisk); time-aware greeting ("How can I help you this evening?").
- **Input**: "Chat with Claude" placeholder.
- **Bottom bar**: `+` (left, new chat), mic, voice-mode waveform icon (right).
- **NO quick chips** (unlike Gemini's 5 suggested prompts).

#### 4. COMPOSER

- **Voice integration**: Mic button (push-to-talk style); voice-mode waveform indicator visible in empty state.
- **Input affordances**: Text field with attachment options (likely swipe or menu).

#### 11. MODEL / MODE FEATURES

- **Model dropdown**: Opus 4.6 (checkmark), Sonnet 4.6, Haiku 4.5 with capability labels; "Extended thinking" toggle (checkmark); "More models" submenu for legacy models.
- **Usage warning**: Banner when using Opus: "Opus consumes usage limits faster than other models" (dismissible X).

#### 14. MOBILE / COMPACT MODE (primary focus)

- **Bottom sheet model picker**: Model selector is modal/bottom-sheet (suggested by nav positioning).
- **Full-screen modals**: Sidebar is slide-out, not always visible; navigation uses drawer pattern.
- **Edge-swipe navigation**: Implied by drawer nav; no explicit gesture affordances shown in static captures.
- **Compact composer**: No visible mode/effort controls in empty state; simplified surface compared to desktop.
- **Voice as first-class input**: Mic button prominent in empty state (bottom bar).

---

## Standout patterns worth copying

1. **Action permission toggle (Ask / Act binary)** — observed in Chrome extension sidebar (02, 07 files); intuitive permission model for AI actions; consider for desktop/web agentic flows.

2. **Model selector with capability taglines** — observed in Chrome/VSCode extensions + iOS (e.g., "Most capable / Most efficient / Fastest"); helps users make informed model picks without jargon; use in our multi-provider UI.

3. **Quick mode modal (experimental feature gating)** — observed in Chrome extension (06, 07 files); clear on/off modal dialog with explanation; useful pattern for future experimental modes.

4. **Compact modes dropdown in editor** — observed in VSCode extension (05 file); dropdown list with descriptions and checkmarks; space-efficient way to show multiple operation modes inline.

5. **Settings editor UI in IDE extension** — observed in VSCode (03, 04 files); toggles + checkboxes + dropdowns + multiline text inputs all in one tabbed pane; blueprint for settings architecture in extensions.

6. **Task conversion affordance (Convert to task button)** — observed in Chrome extension (02, 04 files); bridges chat → Dispatch workflow; consider for desktop when integrating Dispatch.

7. **Permissions page sections (Notifications / Microphone / Approved sites / Shortcuts)** — observed in Chrome extension permissions tab (404 file); well-organized settings structure; reusable for multi-surface permissions UI.

8. **Marketplace detail page layout** — observed in VSCode extension (01 file); standard MV3/store format with install count, rating, feature tabs, requirements; good reference for Chrome Web Store listing.

9. **Effort slider as 3-notch control** — observed in VSCode (05, 06 files); compact reasoning effort selector; cleaner than radio buttons or dropdowns for bounded choices.

10. **Session history dropdown with search** — observed in VSCode (09 file); filterable conversation list; useful for quick conversation switching in IDE-integrated chat.

---

## Anti-patterns or design choices to avoid

1. **"Claude in Chrome requires a paid plan" banner blocking the UI** — observed in Chrome extension (01, 04, 05, 07 files); repeatedly shown, never persisted as "dismissed" state; creates friction for free-tier users. AGI Workforce should persist banner dismissal or use softer inline upsell (callout, not banner).

2. **Quick mode as hidden experimental feature** — observed in Chrome extension (06, 07 files); users may not discover it; if valuable, surface it in primary UI (not modal-gated). If experimental, keep experimental badge visible; don't make it feel like a secret.

3. **"Always allow action on this site" checkbox without clear revocation path** — observed in Chrome extension permissions flow (406 file); once checked, no easy way to undo per-site; users may grant overly broad permissions by accident. Add explicit site-level permission revocation to approved-sites list.

4. **Marketplace copy describing clipboard/code model as "just code editing"** — observed in VSCode marketplace detail (01 file); Claude Code is actually multi-modal (chat + code + browse + computer use); extension description undersells capabilities (copy says "coding assistant", should clarify general AI + code specialty). AGI Workforce should front the "productivity workforce" framing, not niche coding.

5. **Effort slider positioned in secondary menu (not composer)** — observed in VSCode (05, 06 files); reasoning effort is important control but hidden behind "..." menu; should be more discoverable. For our reasoning models, consider making reasoning effort visible in primary composer area.

---

## Mislabel cross-check

Ran `grep -ri "voice\|whisper\|microphone\|push.?to.?talk" apps/desktop apps/web apps/mobile apps/cli` — voice features exist in desktop, web (Hobby tier voice slot per AGI_WORKFORCE.md), mobile (mic button in empty state per MEMORY iOS ref). Voice is wired in our stack at the same tier as Claude's.

Ran `grep -ri "artifact\|ArtifactPanel\|sidebar" apps/desktop apps/web apps/mobile` — artifacts exist as core feature in all surfaces (desktop UnifiedAgenticChat, web features/chat, mobile code/artifacts nav).

No false negatives found from schema cross-reference.
