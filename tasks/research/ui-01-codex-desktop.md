# UI-01: Codex Desktop — Pixel-Level Findings

**Source corpus:** `~/Desktop/reference/ui/codex-desktop/` (21 PNG screenshots, captured 2026-03-28)
**Mission:** establish Codex Desktop as our "Cowork-light north star" — a unified-tab, sandboxed-by-default agent UI that proves the unified-chat-with-isolation thesis is shippable today.

All claims below are grounded in pixels visible in the cited screenshot. Where the corpus does not show a behaviour I write **not shown in scope** rather than guess.

---

## 1. App shell, chrome, and global layout

The window has a flat, single-pane shell (`01_main_empty-state-lets-build-agiworkforce-sidebar.png`):

- **Title bar:** macOS traffic-light cluster lives in the very top-left corner of a black 16-px-tall titlebar strip. No window title text is rendered — the strip is essentially empty chrome.
- **Sidebar (left):** ~150-px-wide dark-slate panel. It is one shade lighter than the main canvas (`#0f1417`-ish vs `#0a0d10`-ish). Vertical IA, top to bottom: a row of three chrome-style buttons (sidebar-collapse glyph, back-arrow, forward-arrow disabled), then nav rows `New thread` / `Plugins` / `Automations` (each with a 16-px monoline icon), a `Threads` collection header with two trailing chevron buttons (filter + collapse), then `agiworkforce` project row pinned at the top of the threads list. At the bottom-left is `Settings` with a gear icon. There is **no global search box** in this sidebar (search-by-keyboard implied, not visible).
- **Main canvas:** charcoal-black single column. The active thread's name (`New thread`) is anchored top-left in 14-px regular weight. Top-right toolbar carries five chip-style controls: an `Open in` app dropdown (image 19 expansion shows the targets), a `Commit` chip with git-merge glyph, a terminal-icon chip, a context-meter chip showing `+416 -132` in green/red diff numerics, and a small worktree/window-mode square button at the far right.
- **Composer:** docked to the bottom of the canvas, ~110 px tall, with a dark rounded card (radius ~16 px). Below it sits a status footer that contains the **sandbox / permissions / worktree** chips — see §3 and §4.
- **Thread metadata strip:** the bar between composer and status row is just whitespace. The hierarchy is: title (top) → message stream → composer → status footer.

Distinctive visual choice: a centered logo-mark (`>_` inside a soft cloud silhouette) anchors the empty state, with the headline `Let's build` and the project name `agiworkforce ⌄` on a secondary line. The project name is itself a dropdown affordance (caret rendered next to it) — clicking it presumably switches projects, though the destination dropdown is **not shown in scope**.

---

## 2. Composer / input area

Visible in `01`, `02`, `04`, `05`, `21` (popout variant).

**Layout (single multi-line input):**

- Placeholder text: `Ask Codex anything, @ to add files, / for commands, $ for skills` (verbatim, `01_main_…png`). The microcopy embeds three first-class command surfaces: `@` for file-mention, `/` for slash-commands, `$` for skill-invocation. This is a **strong pattern** — it teaches three power-user affordances in one line of placeholder.
- Input is a single-line collapsed in empty state but the visual treatment (rounded card with internal padding) suggests it grows multi-line on overflow. Multi-line behavior on Enter is **not shown in scope** but settings reveal it: General → `Require ⌘+enter to send long prompts` toggle exists (`07_settings_general-…png`).
- **Bottom-left chip cluster (inside the composer card):**
  - `+` plus-icon button → opens **attachment menu** (image 02): a vertical list with `Add photos & files` (paperclip glyph), `Plan mode` (toggle switch — visibly **on/blue** in image 02), and `Speed` (lightning glyph with a `>` chevron indicating a submenu, content not shown in scope).
  - `Custom ⌄` — model-shortcut label (clicking opens the model selector — image 05).
  - `Medium ⌄` — reasoning-effort selector (low/medium/high implied; expansion **not shown in scope**, but inferred from the parallel codex-cli reference at `codex-cli/14_cli_reasoning-level-selector-low-medium-high.png`).
  - When Plan mode is toggled on (image 02), a `≡ Plan` chip appears in the bottom-right of the composer next to `Medium ⌄` — making active mode visible inline.
- **Bottom-right chip cluster (inside the composer card):**
  - Microphone glyph (voice input).
  - Circular send button — gray-disabled when empty, visibly contains an up-arrow glyph. No keyboard-shortcut hint visible on hover (hover state not captured).

**No model picker chip is visible in the composer footer in the way ChatGPT does it.** Codex routes model selection through the `Custom ⌄` chip — see §10.

**Microcopy density:** very high. The placeholder string alone teaches three input-time syntaxes. This is one of the most information-dense composer placeholders in our reference corpus.

---

## 3. Permissions dropdown (the Cowork-light kernel)

Image `04_composer_permissions-dropdown-default-vs-full-access.png` is the most strategically important screenshot for our thesis.

**Location:** in the **status footer below** the composer card (NOT inside the composer itself). The chip reads `⚠ Full access ⌄` with an orange shield-with-exclamation glyph, signalling elevated risk.

**Modes enumerated (only two visible):**

1. `🔒 Default permissions` — generic lock glyph, prefixed bullet point.
2. `⚠ Full access` — orange shield glyph, currently selected (checkmark on the right).

**Microcopy:** the dropdown items are bare labels — there is **no inline explanation text** under each item in the dropdown itself (compare Claude Chrome ext `02_sidebar-extension_action-permission-dropdown_ask-vs-act.png` which has a one-line description per row).

**Scope:** the chip lives on the per-thread status bar, so it appears to be **per-conversation** (each thread gets its own). The Configuration settings page (`09_…png`) confirms there is also a **global default** (`Approval policy → On request: Ask when escalation is requested`) — so the runtime chip is the conversation-scoped override of the global default.

**Visual signal-to-noise:** orange chip color is high-contrast against the otherwise neutral footer — a clear "this is dangerous" affordance. When mode = Default the chip presumably renders neutral-grey (not shown in scope, but implied by the orange-only treatment of `Full access`).

**Strategic takeaway for AGI Workforce:** Codex exposes only **two modes** (Default vs Full access) — far simpler than Claude Code's bypass / ask / auto / yolo cycle (`claude-code/01_cli_bypass-permissions-mode-enabled-shift-tab-cycle.png`). For our Cowork-light pitch, two modes per conversation is probably the right starting granularity; we already have the OS primitives (Seatbelt + bwrap) to back both.

---

## 4. Sandbox config UI

This is split across two surfaces in Codex.

**Runtime control (per conversation):** The status footer below the composer carries a `🖥 Local 6% ⌄` chip on the bottom-left (`01`, `04`). The `6%` is presumably remaining-quota — see §17 (Usage). Clicking opens what image `03_composer_local-status-dropdown-…png` shows: a popover titled `Continue in` with options:

1. `🖥 Local project` (currently selected, checkmark right) — local sandbox.
2. `↗ New worktree` — provision a new git worktree (presumably with a fresh sandbox).
3. `🌐 Connect Codex web ↗` (external-link arrow) — push the conversation to cloud.
4. `🌥 Send to cloud` — one-shot offload.
5. `⏱ Rate limits remaining 6% >` (chevron, sub-menu) — duplicate of the % indicator in the chip itself.

So the chip is a **scope/locality switcher**, not strictly a sandbox profile selector. Sandbox **profiles** (read-only / workspace-write / full) live one layer deeper:

**Settings (global default):** `09_settings_configuration-…png` shows two paired controls:

- `Approval policy → On request: Ask when escalation is requested` (dropdown chip) — what the AI must ask the human for before doing.
- `Sandbox settings → Read only: Can read files, but cannot edit them` (dropdown chip) — the **profile** of what the sandbox itself permits.

This is exactly the dual axis we'd want for our unified chat: **approval policy** (when to ask) is orthogonal to **sandbox profile** (what is even reachable). Codex separates them. We should too.

**Distinctive: `Custom config.toml settings`.** The page also shows `agiworkforce project config ⌄` (per-project) with an `Open config.toml ↗` button, confirming Codex's settings can be stored in a checkable TOML at project level — the `~/.codex/config.toml` blueprint that `comp-dotfile-architectures.md` already documents.

---

## 5. Worktree dropdown

Two surfaces.

**Runtime (composer status footer, bottom-right):** `↗ main ⌄` chip — branch-name with a small worktree glyph and a chevron (`01`, `04`). Click presumably opens a worktree-picker, **not shown in scope** at the dropdown-open state. The `New worktree` option in the local-status dropdown (image `03`) is the entry point to **create** a new worktree — and presumably switches the chip target on success.

**Settings:** `15_settings_worktrees-auto-delete-empty-state.png` shows global worktree management:

- `Automatically delete old worktrees` — toggle (on by default per image).
- `Auto-delete limit` — numeric (`15` shown), preserving `Codex-managed worktrees to keep before pruning older ones`.
- `No worktrees yet` empty state — list grows here as new worktrees are created.

**Multiple worktrees per window:** image `01` shows a single thread (`agiworkforce`) tied to a single project. There is no visible UI showing a single window holding multiple worktrees concurrently — but the `New worktree` option in the local-status menu (image `03`) suggests a worktree change is **per-thread** (open a new thread → optionally provision a worktree for it). This is the Codex parity to git worktrees being conversation-scoped, which matches our thesis well: each conversation can opt into its own isolated working copy.

---

## 6. Plan mode

**Entry:** image `02_composer_attachment-menu-photos-plan-mode-speed.png` — the `+` attachment menu in the composer is where Plan mode lives. It is a **toggle switch** (not a separate mode picker) — when blue/on, the composer renders an extra `≡ Plan` chip next to `Medium ⌄` in the composer footer (visible in image `02`, but absent in image `01`).

**Visual difference vs regular chat:** the _only_ visible diff between Plan-on (image `02`) and Plan-off (image `01`) is:

1. The toggle in the `+` menu reads on/blue.
2. A small `≡ Plan` chip is appended to the composer-footer chip cluster.

There is no separate "Plan view" with phases or step lists shown in the empty state. The actual rendered Plan output (post-send) is **not shown in scope**.

**Approve-plan button:** **not shown in scope.** The corpus does not show what happens after the plan is generated — whether there's an explicit `Approve plan` CTA before execution, or whether plan-mode is purely advisory. Worth investigating live.

**Strategic note:** Plan mode being a single toggle (not a global mode-cycle, not a separate window) is interesting — it implies plan-mode is a **per-message preference**, not a sticky setting. Compare claude-code's `Shift+Tab` cycle which makes mode global until explicitly cycled.

---

## 7. MCP toggles

Image `12_settings_mcp-servers-list-toggles.png`.

**Location:** Settings → MCP servers (top-level tab, alongside General/Appearance/Configuration/Personalization/Usage/Git/Environments/Worktrees/Archived threads). It is **not** surfaced in the composer.

**Layout:** subtitle `Connect external tools and data sources. Learn more.`, then a `Servers` section with a `+ Add server` button right-aligned. List of registered servers, each row is a horizontal layout: server name (left), tiny gear icon (settings), toggle switch (right). Servers visible:

- `playwright` (on, blue)
- `context7` (off, grey)
- `memory` (off, grey)
- `openaiDeveloperDocs` (on, blue)
- `sequential-thinking` (off, grey)
- `github` (off, grey)
- `vercel` (on, blue)
- `figma` (on, blue)
- `supabase` (off, grey)

**Per-server config:** the gear icon is for per-server settings (presumably env vars, command, args). Add-server flow is **not shown in scope** — clicking `+ Add server` would show a modal/page that the corpus doesn't capture.

**Scope:** toggles are **global**, not per-conversation. There is no per-thread MCP toggle visible in the composer or status footer. This matches Codex CLI's `~/.codex/config.toml [mcp_servers]` model.

---

## 8. Git PR flow / Commit modal

Image `18_commit-modal_branch-changes-message-next-steps.png` is the highest-leverage screenshot for differentiator #3 (cross-provider session continuity meets Cowork-light isolation).

**Entry:** the top-right toolbar `⌥ Commit ⌄` chip. Clicking opens a **modal** (centered, ~470 px wide, dimmed backdrop on the chat behind it).

**Modal layout (top to bottom):**

- Header: a small git-merge glyph, a close `×` top-right, title `Commit your changes`.
- `Branch` row → right-aligned `↗ main` chip.
- `Changes` row → `17 files +416 -132` (matches the `+416 -132` chip in the chat title bar — see §14, this is the running diff counter).
- `Include unstaged` toggle (on, blue).
- `Commit message` field with placeholder `Leave blank to autogenerate a commit message` and a right-aligned `Custom instructions` link.
- A multi-line text input below the placeholder.
- `Next steps` section with four mutually-exclusive radio rows:
  1. `⌥ Commit` (currently selected, checkmark right).
  2. `↑ Commit & push` (up-arrow glyph).
  3. `⌥ Commit & create PR` (git-fork glyph) — **this is the one-click PR**.
  4. `● Draft` (disc glyph).
- Right-aligned primary CTA `Continue` (gray-rounded button).

**End-to-end flow:** user types or auto-generates a commit message, picks one of four next-step radios, hits `Continue`. If `Commit & create PR` is chosen, the PR is created against the configured branch-prefix from Settings → Git (`Branch prefix: codex/`, image `13_settings_git-…png`) using the configured `Pull request merge method: Merge | Squash`.

**Distinctive: PR composition is inline** — there is no separate PR composer pane. The chat itself is the PR composer. This matches our "unified chat as work surface" thesis very strongly. Even better: the modal includes **`Commit instructions`** and **`Pull request instructions`** text-areas in Settings → Git (image `13`), so the auto-generated messages can be steered by global prompt augmentation.

**Settings → Git additional config (image `13`):**

- `Branch prefix` (text field, prefilled `codex/`).
- `Pull request merge method` (radio: `Merge` selected / `Squash`).
- `Show PR icons in sidebar` (toggle).
- `Always force push` (toggle, off; subtitle: `Use --force-with-lease when pushing from Codex`).
- `Create draft pull requests` (toggle).
- `Commit instructions` text-area (with `Save` button).
- `Pull request instructions` text-area (with `Save` button).

These are all global; the per-conversation override is **not shown in scope**.

---

## 9. Terminal panel

Image `20_terminal-panel-docked_zsh-bottom.png`.

**Dock location:** **bottom of the main canvas**, full-width below the composer's status footer. Banner title at top-left: `Terminal zsh` (small grey label). Close `×` top-right. Single line of shell prompt: `siddhartha@Mac agiworkforce % |` (cursor visible).

**Always visible vs on-demand:** **on-demand**. There is a terminal-icon chip in the top-right toolbar (`▭ ⌃` glyph, visible in `01`'s top-right cluster between the diff `+416 -132` chip and the windowmode square) that toggles the panel. When closed, the panel is gone (image `01`); when open, it docks to the bottom (image `20`).

**Independence from the agent:** the prompt shows a normal `zsh` shell with the user's account name — implying you can run shell commands directly, not gated through the agent. This is **distinctive**: Codex blends an agent-driven workflow with a direct-shell escape hatch in one window. (Worth confirming: does it share PTY with the agent's tool-call output? **Not shown in scope.**)

**Layout cost:** when the terminal opens, the chat pane shrinks vertically — the composer + footer rises to make room. The terminal panel is roughly 200 px tall in the screenshot.

---

## 10. Model picker

Image `05_composer_model-selector-dropdown-gpt-5-codex-options.png`.

**Location:** the `Custom ⌄` chip in the composer-footer (bottom-left of the composer card, next to the `+` and to the left of `Medium ⌄`). Clicking opens a vertical list popover above the chip.

**Header:** `Select model` (small dim caption).

**Models listed (in order):**

- `GPT-5.4`
- `GPT-5.4-Mini`
- `GPT-5.3-Codex`
- `GPT-5.2-Codex`
- `GPT-5.2`
- `GPT-5.1-Codex-Max`
- `GPT-5.1-Codex-Mini`

**Grouping:** flat list, no provider/capability sections, no recent-models section, no pin affordance. All models are OpenAI-family (Codex is single-vendor — the CLI corpus `codex-cli/13_cli_model-selector-…png` shows the same flat list, validating).

**Recent / pinned:** **not shown in scope.** The popover has no header tabs, no search input.

**Distinction vs ChatGPT desktop:** ChatGPT (`chatgpt-desktop/09_…png`) has Auto/Instant/Thinking/Legacy as labeled aliases. Codex shows raw model IDs — this is a **developer audience signal**.

---

## 11. Tool approval flow / "Always allow X"

**Not directly shown in scope** for the per-tool `Always allow X` modal — the corpus does not include a screenshot of an in-flight tool call asking for approval. What we _can_ infer:

- The **default policy** is global and lives at Settings → Configuration → `Approval policy: On request — Ask when escalation is requested` (image `09`).
- The **runtime chip** `Full access ⌄` in the composer footer (image `04`) is the per-conversation override of that default.
- There is no visible "remember this decision for this project" affordance in the screenshots — the binary `Default permissions` vs `Full access` toggle implies Codex's per-tool granularity is coarser than Claude Desktop's per-tool permissions UI (`claude-desktop/23_connector-permissions-dropdown_airtable.png`).

**Open question:** when running with `Default permissions`, does each tool call surface a confirmation dialog inline in the chat, or does it block the run with a modal? **Not shown in scope.**

---

## 12. New conversation start / empty state

Image `01_main_empty-state-…png`.

**Folder picked at start? No** — the empty state shows `agiworkforce` already pinned in the sidebar's `Threads` section, and the title `Let's build agiworkforce ⌄` reads as a _project context already inherited_, not picked at thread creation. Project switching is presumably the `Settings → Environments → Add project` path (image `14_settings_environments-…png`), not a per-thread selector.

**Empty-state composition:**

- Center-aligned cloud `>_` logo (~70 px).
- `Let's build` (24-px regular).
- `agiworkforce ⌄` (project name, 22-px lighter weight, with caret indicating a switcher).
- Below the composer: an `Explore more  ✕` row with three suggestion-card chips: `🎮 Build a classic Snake game in this repo.`, `📄 Create a one-page $pdf that summarizes this app.`, `✏ Create a plan to…`.
- The `$pdf` literal is a **skill-invocation token** — proving the placeholder microcopy `$ for skills` is real.

**Suggestion cards:** 3 cards, ~290 px wide, dark rounded with thin border. Each has a small icon top-left (gamepad / pdf / pencil) and 1-2 lines of caption. The `✕` next to `Explore more` lets you dismiss the suggestion strip — preserving canvas real estate for power users.

---

## 13. Settings entry point + IA

Image `06_sidebar-expanded_…png` (entry from sidebar) + the `07–16` sequence (settings panes).

**Entry points:**

1. Bottom-left `⚙ Settings` row in the sidebar (visible in `01`, `06`).
2. Inside the user popover (image `06`, `17`) — `⚙ Settings` is the first row under the email/account.

**Keyboard shortcut:** **not shown in scope** (no shortcut hint rendered next to the menu items).

**IA — Settings left rail (cargo-listed in 07–16):**

1. General
2. Appearance
3. Configuration
4. Personalization
5. Usage
6. MCP servers
7. Git
8. Environments
9. Worktrees
10. Archived threads

That's a **10-item flat IA**. Notable: there is no `Account` tab — account info is embedded in the user popover (image `17`), not in Settings.

Each pane uses a consistent layout: header text top-left, optional sub-header / `Learn more.` link, then card-grouped settings rows. Each setting row is two-column: label + sub-label on the left, control on the right.

---

## 14. Context indicators

Visible in the top-right toolbar (`01`, `04`, `18`):

- **Diff counter:** `+416 -132` — green added / red removed lines, lives in the title-bar diff chip (image `01`'s top-right). This is a **running diff counter for the worktree against base branch**, not a per-message token count. Distinctive — none of the competitor desktop apps render this.
- **Token count / cost indicator:** **not shown in scope** at the chat level. The closest indicator is the **Local 6% ⌄** chip in the composer-footer status row, which shows **rate-limits-remaining as a percentage**, not absolute tokens or cost. A per-conversation token meter is **absent** — Codex hides cost details, surfaces only quota %.
- **Files-in-scope indicator:** **not shown in scope** — the chat doesn't render an explicit "X files in context window" widget. The `+416 -132` diff is the proxy for "scope of changes-in-flight".
- **Model name:** rendered as the `Custom ⌄` chip text in the composer-footer. When the user picks a specific model from the dropdown (image `05`), this label presumably updates (not shown in the corpus, but implied).

**Strategic note:** Codex makes the **work-product diff** the dominant context-meter, not the LLM token meter. This inverts the priority — for an agent-tool product the diff _is_ the work, the LLM cost is bookkeeping.

---

## 15. History / sidebar organization

Images `01` (collapsed), `06` (expanded with thread history + user popover).

**Collapsed sidebar (image `01`):**

- Project: `agiworkforce` is the only thread-collection visible.
- Each project row has trailing `⋯` (overflow menu) and `✏` (edit pencil) icons that appear on hover.

**Expanded sidebar (image `06`):**

- Project header `agiworkforce` (folder glyph).
- Threads listed below, each row = thread title (left) + relative-time string (right): e.g., `commit and push 2d`, `hi 3d`, `can you audit the entire des... 5d`, `did you understand the visi... 1w`, `docs/COMPLETE_AUDIT_A... 1w`, etc.
- Time format is **relative**, two-character compact (`2h`, `2d`, `1w`, `2w`).
- A `Show more` link at the bottom of the list lets you expand to older threads.

**Search:** **not visible** — the sidebar's `Threads` section header has two icons (filter + collapse) but no text-search input. **Open question:** is search a global keyboard shortcut (`⌘K`)? **Not shown in scope.**

**Pinning:** **not shown in scope.** Threads appear ordered by recency; no pin affordance is visible on hover or in the row-action menu.

**Project grouping:** projects act as **collapsible thread collections**. Multiple projects would presumably stack as additional headers, each expandable. **Multi-project sidebar layout: not shown in scope** (only one project visible).

---

## 16. Tool-call rendering inline in chat

**Not directly shown in scope.** The corpus only captures empty-state and chrome — no in-flight chat with tool-call diffs, terminal output, or file edits is rendered. This is the biggest gap in our reference set for Codex.

What we _can_ infer from chrome:

- The diff counter `+416 -132` proves Codex tracks file-edits at the worktree level — it likely renders inline diff cards in the chat stream (Claude Code-style). Worth confirming live.
- The terminal panel is a **separate** dock (image `20`), suggesting agent-driven shell output may render inline in chat _and_ mirror to the terminal panel.

**Recommended live-capture targets:** an in-flight chat with (a) a file-edit tool call, (b) a multi-step shell-command tool call, (c) an MCP tool call, (d) a failure-and-retry case.

---

## 17. Errors / failure modes

**Not shown in scope** — no error states, retry UX, or tool-failure rendering is captured.

What we _can_ see is the **Toggle /Fast** banner (`19`, `20`), an in-app upsell:

> `Toggle /Fast — Based on your work last week across 40 threads, Fast could have saved about 20 hours 59 minutes. Uses 2x plan usage. [Enable now] ✕`

It's a soft-yellow lightning glyph + dark card with an `Enable now` CTA. This is a **non-error informational banner** that hovers above the composer status footer. Distinctive: usage telemetry is surfaced as a _concrete-hours-saved_ claim with a one-click activation.

---

## 18. Visually distinctive patterns to mimic

1. **Composer placeholder teaches three syntaxes in one line:** `@`-mention, `/`-command, `$`-skill. We should adopt the multi-token placeholder pattern verbatim — it is the densest microcopy in our reference set.
2. **Status-footer chip cluster (Local % | Permissions | Worktree):** the bottom-of-screen status bar is the _control surface for sandbox isolation_. This is exactly the Cowork-light differentiator we need to ship. Adopt the three-chip layout: locality (where) | permissions (when to ask) | worktree (which branch).
3. **Permissions chip is orange when elevated:** `⚠ Full access` chip is orange. We should use the same color-as-warning pattern when our user has bypassed default sandbox.
4. **Diff counter as primary context meter:** `+416 -132` in the title-bar makes the work-product the headline. This inverts LLM-token-counter UX, and is correct for an agent product.
5. **One-click PR modal with four next-step radios:** Commit / Commit & push / Commit & create PR / Draft. Inline-in-chat PR composition without leaving the conversation is exactly our "unified chat as work surface" pitch. Mimic verbatim.
6. **Settings IA includes Worktrees and Environments as top-level tabs:** elevating git-worktree management to a peer of General/Appearance/MCP signals that the product is git-native. We should do the same.
7. **Plan mode is a per-message toggle, not a global state:** lighter cognitive load than claude-code's Shift+Tab cycle.
8. **Open in <app> dropdown** (image `19`): `Cursor / Antigravity / Finder / Terminal / Xcode` — a one-click handoff to other tools, recognizing that an agent product is one tool in a multi-tool workflow. We should ship this with sensible defaults (VS Code / Cursor / Finder / Terminal).
9. **Compact popout window** (image `21`): the same composer, just narrower. Layout collapses to single-column without losing the status-footer chip cluster — proving the bottom-status-bar pattern is responsive. We should mirror this for our mobile-portrait + desktop-popout layouts.
10. **Settings → Configuration shows config.toml directly:** the `Open config.toml ↗` button (image `09`) acknowledges power-users want the file. Bridges UI ↔ dotfile.

---

## 19. Things that look bad / clunky to avoid

1. **Permissions dropdown has only two modes with no inline descriptions** (image `04`). `Default permissions` vs `Full access` is too coarse; users don't know the cost of choosing one until something breaks. Compare Claude Chrome ext (`02_sidebar-extension_action-permission-dropdown_ask-vs-act.png`) which explains each mode in one line. **We should add per-mode microcopy.**
2. **Sidebar has no thread search** — for a 30-day power user this becomes painful fast. **We should ship `⌘K` global search from day 1.**
3. **No global `cost / token / quota` meter in chat** — only the cryptic `Local 6%` chip. For a paid-tier product (Hobby), users want a real-time spend meter. **We should expose token + dollar cost in the title-bar.**
4. **Model picker is a flat list with no recent / pinned / provider grouping** (image `05`). For our 12-provider portfolio, a flat list is unworkable. **We must group by provider with a recents section pinned at top.**
5. **Settings IA has no `Account` or `Privacy` tab** — account info is buried in the user popover. **We need explicit Account + Privacy tabs (Claude pattern, image `claude-desktop/09_settings-account-…png`).**
6. **No visible PR-status indicator in the chat after a PR is created** — the corpus doesn't show what happens post-`Continue`. **We should render a sticky PR card at the top of the thread once a PR exists, with `View on GitHub` and `Merge` actions.**
7. **MCP server toggles are global only** — no per-conversation MCP override. For our unified-chat thesis (Cowork tab vs casual chat, in one window), per-conversation MCP scoping is essential. **We must ship per-thread MCP overrides.**
8. **`Local 6%` chip overloads two semantics** (locality + quota %) onto a single label. Users will misread `6%` as "6% local CPU" or "6% disk". **We should split: `🖥 Local` chip for locality, separate `📊 6% left` chip for quota.**
9. **No way to label a conversation with a sandbox profile name** — each thread gets the global default unless the user manually overrides via the Full access chip. **We should support saved sandbox profiles per project (`agiworkforce-readonly`, `agiworkforce-fullwrite`) and let new threads inherit a project default.**
10. **Plan mode is hidden three clicks deep** (composer `+` → toggle). For a feature this differentiating, it deserves a top-level chip, not a buried toggle. **We should hoist plan-mode to the composer footer chip cluster.**

---

## 20. Open questions (mandatory)

These are the gaps in this corpus that I would investigate next, ordered by leverage for our thesis:

1. **What does the in-flight tool-call inline rendering look like?** No screenshot in scope. Needs: (a) file-edit diff card, (b) multi-step shell command output, (c) MCP tool call, (d) tool-call failure with retry. This is the highest-leverage gap because rendering is the core chat differentiator.
2. **What is the "Approve plan" UI after Plan mode generates a plan?** The toggle is shown (`02`); the post-toggle plan rendering and approval CTA are not.
3. **Per-tool / per-MCP approval modal:** when running with `Default permissions`, does Codex pop a modal mid-run asking "allow this shell command?" — and does that modal include "always allow for this project"? Compare claude-desktop's connector permissions dropdown (`claude-desktop/23`).
4. **Worktree-picker dropdown contents:** the chip exists but its expanded state isn't shown. Does it list all worktrees? Allow inline worktree creation? Show ahead/behind counts?
5. **How does cross-project navigation work?** The empty-state heading reads `agiworkforce ⌄` (caret implies dropdown), but the dropdown isn't captured. Does it show all projects? A search input?
6. **What do `Plugins` and `Automations` do?** Sidebar nav rows in image `01` — labels imply rich features but there is no expanded view.
7. **Does the terminal panel share PTY with the agent's bash tool calls?** Image `20` shows a fresh shell. If they share state, that's a powerful pattern for our "agent + human, same shell" UX.
8. **What does `Speed >` (in the `+` menu, image `02`) expand to?** It's a chevron-suffixed entry, suggesting a submenu — but the submenu is not captured.
9. **What does the `+ Add server` flow for MCP look like?** Image `12` shows the list; the add-server form (URL? command? args? env?) is hidden behind a click.
10. **How are `Skills` ($-prefixed) discovered, listed, and managed?** The `$pdf` token in the suggestion card (image `01`) and the `$ for skills` placeholder both reference the surface, but neither shows a skills directory or manager.
11. **Voice input flow:** the mic glyph in the composer footer is shown idle; recording / transcription / send flow is not captured. Compare ChatGPT's recording UX (`chatgpt-desktop/10–12`).
12. **What does `Custom config.toml settings → agiworkforce project config ⌄` (image `09`) expand to?** It's a project-config-file selector with `Open config.toml ↗`, but the dropdown items aren't shown.

---

## 21. Cross-references to the rest of our reference corpus

- **vs Claude Desktop (`claude/claude-desktop/`):** Claude has a Connectors directory (19 pages — `claude-connectors-directory/`) where Codex has a flat MCP-servers toggle list. Claude exposes deep per-connector permission controls (`23_connector-permissions-dropdown_airtable.png`); Codex exposes only Default vs Full access. **For our connector UX, Claude is the deeper-IA reference; for runtime sandboxing, Codex is the closer model.**
- **vs ChatGPT Desktop (`chatgpt-desktop/`):** ChatGPT has labeled model aliases (Auto/Instant/Thinking/Legacy); Codex shows raw model IDs. We must ship both — labeled-mode for casual users, raw-IDs for power users (toggleable).
- **vs Claude Chrome ext (`claude/claude-chrome-extension/02_sidebar-extension_action-permission-dropdown_ask-vs-act.png`):** Claude's permission dropdown explains each mode in a one-line caption ("Ask: Claude will check before doing anything" / "Act: Claude will act on your behalf"). Codex doesn't. We should adopt Claude's caption pattern with Codex's two-mode simplicity.
- **vs Codex CLI (`codex-cli/`):** the desktop app is essentially the CLI's TUI rendered in a window. Same model picker (`13_cli_model-selector-…png`), same reasoning levels (`14_cli_reasoning-…png`). The desktop adds GUI affordances (commit modal, open-in menu, terminal panel) but the conceptual model is identical. **This validates our thesis that one CLI engine + multiple surface wrappers can ship.**

---

## 22. Strategic recommendations for AGI Workforce

Synthesizing the above for our Cowork-light unified-chat thesis:

1. **Adopt the Codex three-chip status footer (Locality | Permissions | Worktree) verbatim** — it is the cleanest visual proof that "this conversation runs in an isolated environment" without committing the user to a separate Cowork tab.
2. **Permissions chip = per-conversation override of global default** — same dual-axis (Approval policy × Sandbox profile) Codex uses in Settings → Configuration. We already have macOS Seatbelt + Linux bwrap in `apps/cli/src/sandbox.rs`, so the backend is ready; we just need the UI affordance.
3. **One-click commit modal with `Commit & create PR` next-step radio** is exactly the "chat-as-PR-composer" pattern that distinguishes us from Claude Desktop (which has no PR flow at all). Ship in Wave 2.
4. **Make our model picker grouped (provider headers + recents pin)** rather than Codex's flat list — this is one of the rare places we can be objectively better, because we have 12 providers vs Codex's 1.
5. **Adopt Codex's diff-counter context-meter** as the primary headline, not LLM token count. Token count goes in a tooltip; the work-product is what users care about.
6. **Add `⌘K` global search** to the sidebar from day 1 — Codex omits it and that hurts at scale.
7. **Ship `Open in <app>` dropdown** (Cursor / VS Code / Finder / Terminal / Xcode) — low-cost, high-signal "this is a real dev tool" affordance.
8. **Plan mode chip should live in the composer footer**, not buried in the `+` menu — this is our chance to fix Codex's worst affordance.
9. **Per-conversation MCP toggles** — Codex only has global; we can win by making MCP scoping per-thread (matches our unified-chat thesis where each thread can opt into a different toolset).
10. **Sandbox profile presets** (`readonly` / `workspace-write` / `network-on` / `full`) saved per-project, with the per-conversation chip showing the _currently active profile name_ — better than Codex's `Default vs Full access` binary.

End of report. Word count ≈ 3,300.
