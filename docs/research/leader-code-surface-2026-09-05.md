# claude.ai code surface reference (observed 2026-09-05)

Status: Current
Owner: Product (founder) and the parity agents
Last updated: 2026-09-05

Every statement here was observed first hand in the founder's signed-in claude.ai session in Chrome on 2026-09-05, driven by the orchestrating agent, after the founder connected GitHub to that account. It fills the gap `claude-ai-ui-reference-2026-09-03.md` left open ("the Code surface was not observed") and is the evidence base for the web Code page rebuild. Model names shown in that product's pickers are omitted on purpose; our surface reads them from the registry.

## Reference: the leader's web coding surface (claude.ai/code), measured at 1470 wide, dark

Layout: its own left column (about 290 px) and a single main column. No marketing copy anywhere.

Left column, top to bottom:

1. Wordmark ("Claude Code") with a two-button segmented toggle at the right: chat glyph (back to chat) and code glyph (selected).
2. A full-width primary row "+ New" (a link to the surface root).
3. Rows "Artifacts" (link to /code/artifacts) and "Customize" (link to /customize).
4. A collapsible "More" row opening a small menu: "Routines", "Dispatch" with a Beta tag, "Edit sidebar".
5. Section label "Recents" with a filter glyph at the right. Empty state: "No sessions match the current filters" plus a "Show all sessions" button. Populated: one row per session, an archive-box glyph at the left, the session title truncated with an ellipsis, the current session highlighted.
6. Bottom: a dismissible promo card, then the user row (avatar, name, plan word, chevron) with three small icon buttons (bug or feedback, search, collapse sidebar).

Home (no session selected): centred greeting "What's up next, <first name>?" with the logo mark before it, in the upper third of the column. Everything else sits at the bottom:

- A row of two chips above the composer: "Default" with a cloud glyph (the environment) and "+ Select repository..." (a repo picker). A first-run popover anchored to the repo chip: "Two steps to work in your repo", two checklist rows (Connect your GitHub account / Install the GitHub app, each with a one-line description) and a "Connect GitHub" button.
- A one-line tip banner above the composer with a lightbulb glyph, a "Try it" link and a close X.
- Composer: a single rounded field with the placeholder "Describe a task or ask a question" and a return-key glyph at the right edge. Below the field, outside it, a control row: at the left "Auto" (the permission mode word, a menu), "+" (attach), mic, chevron; at the right the model name, the effort word ("High") and a small usage ring. The whole composer block is about 800 px wide, centred.

Session view (a session selected):

- Header bar: laptop glyph, the session title, a small grey chip with the repository name; at the right three icon buttons (changes or diff panel, share, more).
- Transcript: assistant replies are ordinary markdown prose (bold, inline code chips, ordered and unordered lists, links). Tool activity is one-line, muted, collapsible rows between prose paragraphs: "Ran a command, read <file>, used a tool >" (a grouped summary with a chevron), "Ran workflow <name>", "Sent notification <state> v", "Background workflow completed · <label> · took 30m 11s"; an interrupted tool prints a red line "Tool execution was interrupted."; a small key: value block prints structured tool output. A card "8 background commands completed, 2 running >" summarises background work. Under a reply: an action row (copy, pin, read aloud) and a relative timestamp ("last month"). A row with the logo mark and "3 running tasks" sits below the last reply.
- Archived session: where the composer would be, a full-width muted banner "This session is archived. Unarchive it to keep working in this session." with an "Unarchive" button at the right. Live sessions show the same composer as home (without the repo chips, the repo is in the header).
- Two modals appeared on open (device verification and a notifications prompt); both are dismissible and not part of the surface.

## Ours today (localhost:3100/chat/code, CloudCodePage.tsx, 1158 lines)

A landing-style page: eyebrow "MANAGED CODE", headline "Build in an isolated cloud workspace.", two lines of marketing copy, a "+ New session" button; below it a two-column card layout: "Sessions" card with a refresh button and session rows (title, state word, trust word, chevron), and a session card with a header (title, state dot, working directory, network word), a raw terminal transcript (commands and output in monospace), a "Run a command" field with a Run button, then an "AGENT" section with a paragraph and a textarea "Install dependencies and run the test suite" and a "Start agent turn" button; two more cards at the bottom ("Work with local code" and "Open in VS Code"). The create flow is a form (title, repository URL, branch, network access radio with three tiers, runtime id, extra hosts, task goal).

What the backend already gives us (apps/web/features/code/services/cloud-code-api.ts): list, get (session plus terminal entries), create (title, repositoryUrl, repositoryBranch, networkAccess none | trusted | full with acknowledgement, runtimeId, extraHosts), run(command), close, commit(message), startAgentTurn, listApprovals, decideApproval. Agent turns carry stop reasons (waiting for approval, step limit, command denied, running, needs attention). This is enough for the leader shape; nothing new is needed on the server for this slice.

## Target: the same surface, our names, no vendor names

1. Route and shell: keep /chat/code inside the app shell (our global rail stays; the leader's own left column becomes our page's left column inside the content area, or the existing sidebar in "Code" context). The page has no hero, no marketing copy, no bottom cards. "Open in VS Code" and "Work with local code" move to the More menu as two rows.
2. Left column: "+ New" primary row; "Artifacts" (links to the Library filtered to code artifacts, or the Library if no filter exists); "Customize" (links to Settings > Capabilities, where tool approval lives); "More" opening Routines (our Schedules), Dispatch (hidden unless the desktop pairing surface exists; otherwise omit), "Open in VS Code", "Work with local code" (desktop download). "Recents" with the session list: archive glyph, title, active highlight, filter glyph that toggles closed sessions; empty state copy in our voice ("No sessions yet" and a "Show closed sessions" link when closed ones exist).
3. Home: greeting "What's up next, <first name>?" using the existing greeting source (reuse whatever the chat home uses for the time-of-day greeting and name); chips row: environment chip (our network tier word: Isolated, Trusted hosts, Full internet; click opens the picker with the same three tiers and the full-internet acknowledgement) and "+ Select repository..." (a popover with a repository URL field and branch field; when a GitHub connector exists it lists repositories, otherwise the URL field alone; no fake checklist); a first-run hint only when no session exists. Composer: "Describe a task or ask a question", Enter starts a session with the task as the first agent turn (create then startAgentTurn, already supported in handleCreate); control row: permission mode word at the left ("Auto" or "Ask", from the existing tool approval preference; a menu with the graduated options the Capabilities settings already define), "+" attach (files to the session, if the API lacks upload keep it out), mic (reuse the dictation strip from the chat composer), and at the right the model trigger identical to the chat composer's (effort word plus chevron, no box, never a hardcoded model name) and the usage ring only if a usage source is already wired.
4. Session view: header with the session title, the repository chip, and right icons: Changes (opens a right panel listing the terminal entries and commit action, our version of the diff panel; commit uses api.commit with a message field), share (if the share route exists, else omit), more (Close session, Rename if supported). Transcript: agent turns render as markdown prose using the chat MarkdownContent; commands the agent ran render as the muted one-line collapsible rows ("Ran a command >" expanding to the command and output; group consecutive commands as "Ran 3 commands >"); approvals render inline as a card with the command and Approve or Reject buttons (api.decideApproval); stop reasons render as one muted line in our copy; a denied or failed command prints one red line. Below the last reply the action row (copy, read aloud) and a relative time. A closed session shows the archived banner in the composer slot: "This session is closed. Start a new one to keep working." with a "New session" button (we have close but no reopen; do not invent unarchive).
5. The raw terminal and "Run a command" stay available but secondary: a "Terminal" toggle in the Changes panel or the more menu reveals the existing transcript and command field. Nothing existing is deleted from the API layer; the page just leads with the conversation.
6. Widths and type: main column content 800 px max, centred; transcript type from the chat tokens; both themes; 390 px collapses the left column into the existing drawer pattern; keyboard: Enter sends, Shift+Enter newline, Escape closes popovers; reduced motion respected.
7. Copy rules: no vendor names, no "Managed Code" eyebrow, no marketing sentences; buttons say what they do.

## Verification the lead will apply before the commit

Screenshots at 1440 dark and light for home (empty), home (with recents), session view (live, with at least one command row and one prose reply), closed session; plus 390 dark home. Compared against the four reference captures in product-audit/code-ref-\*.png. Component tests for the session list states, the chips, the composer send path, approvals card, closed banner. One Playwright pass on the running dev server with the QA account.

## Addendum 1 (observed live after the founder connected GitHub, 07:45 UTC)

Repository picker: the "+ Select repository..." chip opens a popover listing owner/name rows from the connected account with a "Search repositories..." field at the bottom; choosing one replaces the chip with two chips, the repository name (code glyph) and the branch name (branch glyph), followed by a small "+" chip to add a second repository. Ours: when a GitHub connector is connected list its repositories the same way; without one, the popover holds a repository URL field and a branch field; the chosen repo and branch render as the same two chips.

Session start: Enter on the home composer creates the session and navigates to its route; the session is auto-titled from the task ("Repository structure overview") and the header shows a cloud glyph, the title, and one chip "Default · agiworkforce" (environment · repository). The user's message renders as a right-aligned grey bubble. Progress rows appear at the left: "Cloning repository >" (collapsible), then a row with the logo mark, an elapsed counter and a state word ("5s · Sending…"). Recents shows the new session at the top with a small dot glyph while it runs (the archive-box glyph marks finished sessions). While a turn runs the composer placeholder reads "Type / for commands" and the trailing control is a stop square.

Live reply: rows in order: "Initialized session >", a one-line prose lead ("I'll take a look at the repository structure."), "Ran 3 commands >" (a grouped collapsible row), the markdown answer with inline code chips, a closing line "No files were modified.", the action row (copy, pin, read aloud, relative time "just now"), then a lone logo mark row marking the idle end of the turn. After the reply the composer placeholder becomes a ghost follow-up suggestion ("now do the same for packages/") that Enter would send.

Changes panel: the first header icon opens a right panel about 700 px wide that narrows the transcript column; its header shows the branch flow "main -> claude/<slug> v" (a menu), a more button whose tooltip reads "Changes settings", expand and close icons; the body reads "No changes to show" when clean, otherwise the file diffs. The header chip in the transcript collapses to a folder glyph while the panel is open. Ours: the same panel driven by the session's working branch when the API exposes it (the commit result carries the branch), listing terminal entries that changed files or the diff when a diff endpoint exists; "No changes to show" when clean; commit and push through the existing commit action.

## Addendum 2: every control clicked (orchestrating agent, 07:50 to 08:05 UTC)

Composer control row (session and home):

- Mode menu (the "Auto" word): heading "Mode"; rows with a one-line description and a number shortcut: "Auto" (the assistant handles permission decisions, 1, checked), "Accept edits" (automatically accept all file edits, 2), "Plan" (create a plan before making changes, 3). Ours maps to the graduated tool-approval options in Settings > Capabilities; keep three rows with the same shape and shortcuts.
- Plus menu: "Add files or photos" (Cmd U), "Slash commands", "Add connectors".
- Mic chevron: a popover headed "Microphone" listing input devices with a check on the active one, then a "Hold to record" toggle. Ours: device list from the dictation hook, hold-to-record toggle stored in settings.
- Model word: a menu of four model rows with number shortcuts 1 to 4, the active one checked, then "More models >" opening the full list. Ours: the registry's short list (the same rows the chat picker pins first) with shortcuts, then "More models" to the full picker; never hardcoded names.
- Effort word: a popover "Effort <word>" with a help glyph, a slider with six stops labelled "Faster" at the left and "Smarter" at the right. Ours: the effort levels the registry declares for the chosen model as slider stops.
- Usage ring: a popover with "Context window 61.2k / 1M (6%) >" and a segmented bar, "Plan usage limits · <plan> ->", three bars each with a label, "Resets in N hr N min" and a percentage (5-hour limit, Weekly all models, Weekly <flagship>), and "See detailed breakdown". Ours: context window from the session's token count against the model's limit; plan bars from the existing usage meter source; omit any bar we cannot source.

Session header:

- Changes icon: the right panel already described.
- Share icon: modal "Share session", subtitle, two rows "Private / Only you have access" (checked) and "Public / Anyone with the link can view", a usage-policy footnote. Ours: the same two-state modal over the existing share route; omit if no share route exists for code sessions and say so.
- More icon: "Artifacts"; "Open in >" (Terminal, Desktop app); "Rename" (R); "Transcript view >" (Normal checked, Verbose); "Copy link" (C); "Edit environment"; separator; "Archive" (A); "Delete" (D, destructive colour). Ours: Terminal opens our terminal panel; Desktop app opens the desktop deep link; Rename inline; Transcript view toggles the verbose tool rows; Copy link; Edit environment opens the network tier picker; Close session (our archive) and Delete through useConfirmAction.

Transcript rows expanded:

- "Initialized session" expands to a checklist: "Set up a cloud container" (check), "Cloned repository" (check), "Run setup script" (skipped glyph, with a link line "Add a setup script to install dependencies and configure your environment."), "Started <agent>" (check). Ours: the provisioning steps the session API reports (container, clone, setup script if configured, agent started).
- "Ran 3 commands" expands to one card per command with a natural-language summary ("Listed top-level directories >", "Inspected apps and apps/web >", "Read web AGENTS.md header and features >"), each expanding to the command and its output. Ours: the summary line comes from the agent turn's step label when present, else the command itself.

Left column:

- Recents filter glyph: a menu with "Status: All >", "Environment: All >", "Group by: None >", "Sort by: Last activity >", "Show PR status" (checked), "Clear filters". The "Recents" label gains a chevron while the menu is open. Ours: Status (open, closed, all), Environment (the network tiers), Sort by (last activity, created, title); omit PR status until a PR source exists.
- Artifacts: a page titled "Artifacts" with tabs "All / Yours / Shared with you", a search glyph, a "New artifact" button, and a three-column card grid (thumbnail, title, lock glyph, "Edited 14h ago"). Ours: link to the Library; if the Library lacks a grid, this is the P1.13 Library grid item.
- Customize: opens the Settings modal at Customize > Skills (left: Settings: General, Account, Privacy, Billing, Usage, Capabilities, <the code surface>, <the cowork surface>, <the browser extension>; Customize: Skills, Connectors, Plugins, Memory). Skills is a table (Skill, Last updated, Author) with "Browse" and "Add" buttons and an empty-state illustration. The code-surface settings section holds: "Classify session states" toggle (auto-classify sessions as blocked, ready for review, done), "Switch models when a message is flagged" toggle, "Code appearance" (light and dark code themes as dropdowns with a diff preview), "Code font" input, "Interface font" (brand face or System). Capabilities holds "Tool access mode" (Load tools when needed), "Connector search", the same model-switch toggle, Visuals (Artifacts, AI-powered artifacts, Inline visualizations), "Code execution and file creation". Ours: Customize opens our Settings modal at Skills; a "Code" settings section with the two toggles we can honour (session state classification if the session API exposes states; code theme light and dark; code font) is a follow-up, not this slice.
- More > Routines: a page inside the code sidebar ("Routines" replaces the More row while open): title, description "Create templated routines that can be kicked off on schedule, by API, or webhook.", a composer "What do you want automated?" with three suggestion chips and a "Draft routine" button, "No routines yet.", "Or start from a template" with eight template cards (title, description, cadence line, "Works with" integrations). Ours: link to Schedules (which already has templates with cadence); adopting the composer-first "What do you want automated?" entry on the Schedules page is a separate P3 item.
- More > Dispatch: leaves the code surface for the cowork agent route (desktop pairing; "Couldn't connect" without the desktop app). Ours: omit until the desktop pairing surface exists.
- Search glyph (user row): a command palette "Search chats and projects" listing matching sessions with a code glyph and a return hint. Ours: reuse the existing Cmd K search scoped to code sessions.
- Feedback glyph: tooltip "Open a session to send feedback." Ours: the existing feedback control, scoped to the session.
- Collapse glyph: hides the whole left column, leaving a small toggle at the top left; the composer block re-centres. Ours: the same.
- User row chevron: email, Settings (shortcut), Language, Get help; plan action; Get apps and extensions; an academy link; Learn more >; Get API keys (external); Log out. Ours: the existing account menu.

Home chips:

- Environment chip ("Default"): a menu "Local" (a Download tag, "Desktop only"), "Cloud >", "Remote Control >". Ours: "Cloud" with our three network tiers as the submenu; "Local" and "Remote control" rows point at the desktop app download until those surfaces exist.
- Add repository "+" chip: the same repository list with a search field; a second repository adds another chip.
- Tip banner: a one-line product tip with "Try it" and a close X; ours can reuse the existing announcement source or omit.
