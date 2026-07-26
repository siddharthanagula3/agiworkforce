# Claude.ai Live UI/Backend Audit — parity reference for AGI Workforce web app

Date: 2026-07-09
Account: Siddhartha Nagula (Max plan)
Method: Claude-in-Chrome MCP, read-only + limited real sends (per authorization)

2026-07-25 model-name amendment: model labels in this dated UI snapshot were
normalized to the current AGI catalog. They should not be read as evidence that
Opus 5 was available on the original observation date.

---

## 1. HOME (Chat mode)

Screenshot: home-chat.png (captured)

Layout:

- Top-left: "Claude" wordmark (serif), sidebar collapse icon, global search icon (top right of sidebar column)
- Sidebar: Home/Code segmented toggle at top, then "+ New" button, then nav list: Chats and tasks, Projects, Artifacts, Scheduled, Customize
- "Recents" section below nav with un-grouped flat list of recent chat titles (truncated with ellipsis), a sort/filter icon (up/down arrows icon) top-right of "Recents" label
- Bottom of sidebar: account chip "SN Siddhartha Nagula · Max" with chevron (opens account menu), plus a download/export-looking icon button next to it
- Top-right of main pane: small ghost/chat-bubble icon (feedback? ghost logo — need to check)
- Greeting: "☀️ Good evening, Siddhartha Nagula" (time-of-day aware emoji+greeting, serif font for name)
- Composer: rounded card, placeholder "How can I help you today?"
  - Bottom-left of composer: "+" attach button, "Chat"/"Cowork" segmented toggle (Chat active)
  - Bottom-right of composer: model picker "Fable 5 Max ⌄", mic icon, audio-waveform icon (voice mode?)
- Below composer: suggestion chips row: "</> Code", "✏️ Write", "💬 Learn", "☕ Life stuff", "Claude's choice" (this last one appears greyed out/disabled)

Sidebar nav items confirmed: Home, Code (top toggle) / New / Chats and tasks / Projects / Artifacts / Scheduled / Customize / Recents (list) / account chip

### Composer "+" (plus) menu — full inventory

- Add files or photos (⌘U)
- Take a screenshot
- Add to project ▸ (submenu, not yet expanded)
- Add from GitHub (only appeared after menu was reopened a second time — may load async/lazily; GitHub connector-flow interstitial modal "Try Claude Code for GitHub" popped up once when clicking near Skills — this looks like an unrelated promo modal that intercepted a click, not caused by Skills itself. Closed via X without clicking either CTA (both were side-effectful: "Continue to GitHub sync" would connect a service, "Try Claude Code" would navigate away).
- Skills ▸ flyout: algorithmic-art, brand-guidelines, canvas-design, doc-coauthoring, humanizer, internal-comms, mcp-builder, skill-creator, slack-gif-creator (this last one greyed/cut off), then "Manage skills" and "+ Browse skills"
- Connectors ▸ (badge: ⚠1) flyout: "+ Add connector ▸", "Manage connectors", then per-connector rows with toggle switches: Indeed (off), Tsenta (on), Vercel (on), Gmail (warning triangle — likely needs reauth, no toggle shown), "Add from Vercel ▸", "Tool access ▸"
- Plugins ▸ flyout: Brand Voice ▸, Common Room ▸, Apollo.io ▸, Slack ▸, Legal ▸ (each has its own chevron — per-plugin tool submenu), "Manage plugins", "+ Browse plugins"
- Research (toggle-style menu item, no checkmark shown)
- Web search (checkmark shown — enabled/default)

This "+" menu is the extensibility control surface: attachments, GitHub import, Skills, Connectors (external SaaS integrations with granular on/off + warning badges for broken auth), Plugins (per-vendor plugin tool access), and mode toggles (Research, Web search). AGI Workforce web currently has nothing equivalent to Skills/Connectors/Plugins as first-class composer menu items — this is a major parity gap for "how Claude extends itself mid-chat."

### Model picker — full inventory

Trigger button reads "Fable 5 Max" (current model + current effort level, both shown inline).
Dropdown:

- Fable 5 — badge "Included until July 12" — subtitle "For your toughest challenges" — checkmark (selected)
- Opus 5 — "For complex tasks"
- Sonnet 5 — "Most efficient for everyday tasks"
- Haiku 4.5 — "Fastest for quick answers"
- divider
- Effort ▸ (shows current: "Max") — flyout: Low / Medium / High ("Default" badge) / Extra / Max (checkmark, has an ⓘ info icon) — header text: "Higher effort means more thorough responses, but takes longer and uses your limits faster."
- More models ▸ — flyout (legacy/older models): Opus 4.7, Opus 4.6, Opus 3, Sonnet 4.6 (this is the full visible list, no further scroll)

Notable: effort level is a first-class, per-model control shown directly on the composer trigger ("Fable 5 Max"), not buried in settings — this is a stronger parity target than AGI Workforce's current model picker, which doesn't surface a reasoning-effort dial at all.

## 2. COWORK home

Switching Chat→Cowork via the segmented toggle changes the whole page (not just the composer): a "Beta" badge appears top-right, greeting stays the same, composer placeholder same, but below the composer a second control row appears:

- "Project ⌄" selector — opens a searchable list: "Search projects" input, then project rows (How to use Claude, agi, o1, JOB, research, claude Prompt), divider, "+ Create new project", "View all projects"
- "Manual ⌄" approval-mode selector — opens: "Manually approve — Claude pauses so you can approve each action." (checked/default) vs "Skip all approvals — Claude never pauses, even for unsafe actions." (warning-triangle icon). Did NOT toggle this — it's a real safety-relevant setting.
- Right-aligned usage banner: "⚡ 2× more usage until August 5" (a promo/limited-time usage multiplier banner)
- Mic icon only in Cowork composer (no separate voice-waveform icon like Chat mode has)
- "Ideas for you" section below composer: "Send me a daily briefing" (icon: sun/notification), "Organize my inbox" (icon: chat bubbles), "Customize Cowork for me" (icon: pencil/doc) — these are clickable prompt starters, not yet tested by sending

Parity signal: Cowork is a distinct autonomous-task mode with its own approval-gate primitive (manual-approve vs skip-all-approvals) and project scoping baked into the composer itself, not just a chat variant. AGI Workforce has no equivalent "autonomous task with approval gate" concept in its composer today.

## 3. Real chat send — markdown/streaming/branching behavior (test prompt #1)

Prompt sent (Chat mode, Fable 5, Max effort): "Give me a short comparison table of Python vs Rust for CLI tools, then a tiny code sample in each."

Observed behavior:

- On submit: conversation auto-titled instantly ("Python vs Rust for CLI tools"), appears at top of sidebar Recents, URL changes to `/chat/<uuid>`.
- Pre-stream "thinking" phase: a rotating single-word status label next to the orange sun/asterisk icon — cycled through "Sifting" → "Honing" → "Picturing" → "Figuring" → "Honing" → ... (looked like a randomized/looping verb pool, not a fixed sequence) for roughly 25-30 seconds total before any visible text. This is notably slow for a "Max"-effort Fable 5 answer to a fairly simple prompt — worth noting as a real latency data point, not just UI.
- Status label then switches to a plain spinner icon briefly, then the composer's mic/waveform icons on the right are temporarily replaced by a square "stop" icon (generation-in-progress affordance) and the text area grows a top divider.
- Full response then appears to render in one shot rather than a token-by-token visible stream in this observation (may be because the wait intervals were coarse — could not confirm true per-token streaming cadence at this poll granularity).
- A toast appeared during generation: "Want to be notified when Claude responds?" with a "Notify" button (browser push-notification opt-in) and an X dismiss. Dismissed via X (did not grant notification permission, avoiding a browser-permission dialog).
- Rendered response: serif-body markdown, a real HTML table (not an image), inline code chips (e.g. `greet.py`, `cargo add clap --features derive`), two syntax-highlighted fenced code blocks (python, rust) with muted language label top-left of each block (no visible per-block copy button in this pass — may require hover, not confirmed).
- Once complete: "Share" button appeared top-right of the conversation header (was absent while composing/loading). A circular ↓ "scroll to latest" affordance floats above the composer once content overflows the viewport.
- Assistant message hover/footer row (always visible, not hover-only): copy, read-aloud (speaker), thumbs-up, thumbs-down, retry (circular arrow) icons.
- User message hover row (top-right of the user bubble): timestamp ("7:53 PM"), retry, edit (pencil), copy icons.

### Edit → branch test

Clicked the pencil (edit) icon on the user message. It turned the message into an inline editable textarea with an inline warning: "Editing this message will create a new conversation branch. You can switch between branches using the arrow navigation buttons." Cancel/Save buttons appear.
Appended " Keep it very brief." and saved → triggered a fresh generation (same ~25s multi-verb thinking phase: Triangulating → Weighing → Picturing → ...) and produced a shorter table + shorter code.
After the edit, a branch indicator appeared next to the timestamp: "2 / 2" with `<` `>` chevrons. Clicking `<` switched back to branch 1/2, correctly restoring BOTH the original longer user-message text and its original response — confirming branches store the full (prompt, response) pair per edit, with left/right navigation between them. This is a clean, discoverable "edit re-forks the conversation" UX with a version counter — AGI Workforce should target the same explicit branch counter + arrow-nav pattern rather than silently discarding the old response on edit.

## 4. Artifact generation — full agentic tool-call transcript + side panel (test prompt #2)

Prompt (new chat, Chat mode, Fable 5 Max): "Create a small interactive HTML page with a button that counts clicks and shows a fun emoji animation."

This is the single richest finding of the session. The response was NOT a simple markdown code block — it ran as a visible multi-step agent trace, live in the transcript, before the artifact side panel opened:

1. Status: "Working" (persistent header while the whole tool sequence runs)
2. Step 1 (icon: skill/doc icon): "Reading the frontend-design skill before building the HTML page" — Claude autonomously selected and invoked a Skill (the same "frontend-design" skill concept that exists in this Claude Code environment) mid-conversation, and the UI names exactly which skill and why, live, before any code appears.
3. Step 2 (icon: HTML file icon): "Creating the interactive emoji click-counter HTML page as a single self-contained file" — followed by a live, auto-scrolling read-only code preview box showing the actual file being written line-by-line in real time (full syntax highlighting, monospace, scrolling as more lines arrive) — this is a genuine streamed-file-write view, not a fake progress bar.
4. Step 3: "Presented file" (icon: file/doc)
5. Step 4: "Done" (checkmark icon)
   Total wall-clock time from send to artifact fully rendered: approximately 90-100 seconds (much longer than the first prompt) — the two skill/tool steps plus a large single-file HTML/CSS/JS artifact (Google Fonts import, CSS custom properties for a color palette, physics-y emoji burst animation, reduced-motion handling, keyboard accessibility) account for the time.
   Once done, this whole step sequence collapses into a single clickable summary line in the transcript: "Viewed a file, created a file, read a file ›" — clicking it re-expands the full step-by-step trace with the same icons, labels, and the filename chip "emoji-popper.html" attached to the creation step. The final assistant prose response ("Here's your Emoji Popper page. Every press of the big jelly button bumps the counter...") appears below/after this collapsed trace, describing what was built in plain language.

### Artifact side panel

Opening the artifact split the layout into 3 columns: sidebar / chat / artifact panel (not a modal — chat stays interactive alongside it).
Panel header controls (left to right): eye icon (Preview tab, active by default), `</>` icon (Source tab), artifact title (truncated, "Emoji po..."), "Copy" button with a chevron for a dropdown, a circular refresh/reload icon, a fullscreen-expand icon, an X close icon.

- Preview tab: live rendered iframe of the actual HTML/CSS/JS — title "THE EMOJI POPPER", a "0 CLICKS" counter, a pink "POP!" button, subtitle text. Fully interactive (did not click POP to avoid an unnecessary action, but it renders live, not a screenshot).
- Source tab: full line-numbered, syntax-highlighted source (real `<!DOCTYPE html>` through closing tags), scrollable — same viewer quality as the streaming preview during generation.
- Copy button dropdown (▾): "Download as HTML" and "Publish artifact" — did not click either (download triggers a file save, publish makes the artifact public — both are side-effectful and out of scope for a read-mostly audit).
- No visible version-history chip on this single-turn artifact (would need to send a follow-up edit to test versioning — not attempted, to conserve the send budget).

Parity signal: this "Claude reasons about which skill to use, live-streams the file it's writing, collapses into an auditable step trace, opens a synced live-preview panel" pipeline is the single biggest gap between claude.ai and a typical clone. AGI Workforce's artifact/canvas equivalent (if any) should be checked specifically for: (a) does it show which skill/tool ran and why, (b) does it stream the file content live rather than just a spinner, (c) does the completed trace stay expandable/collapsible as a permanent audit log in the transcript, (d) does Preview/Source live in a persistent side panel that keeps the chat interactive rather than a blocking modal.

### Backend endpoints observed for the artifact flow

- `GET https://claude.ai/api/organizations/{orgId}/conversations/{conversationId}/wiggle/download-file?path=%2Fmnt%2Fuser-data%2Foutputs%2Femoji-popper.html` -> 200. Notable: the artifact/code-execution backend is internally namespaced "wiggle", and generated files live in a sandboxed path `/mnt/user-data/outputs/<filename>` fetched per-conversation. This confirms artifacts are backed by a real sandboxed filesystem per conversation, not just inline text stored in the message.
- `POST https://a-api.anthropic.com/v1/b` -> 200, fired multiple times during the session (looks like a minified/obfuscated analytics or event-batching endpoint on a separate `a-api.anthropic.com` host from the main `claude.ai/api` app backend).
- Client-side syntax highlighting is powered by tree-sitter compiled to WASM, loaded on demand: `claude.ai/tree-sitter/wasm/web-tree-sitter.wasm`, `claude.ai/tree-sitter/html/tree-sitter-html.wasm`, `claude.ai/tree-sitter/html/highlights.scm`. This explains why code blocks and the artifact Source tab render instantly with accurate, real grammar-based highlighting rather than a regex highlighter — worth matching for AGI Workforce's own code rendering if it isn't already tree-sitter-based.
- Datadog RUM beacons (`browser-intake-us5-datadoghq.com/api/v2/rum`) fire continuously for frontend observability/session replay analytics.

## 5. Web search tool card + citations (test prompt #3)

Prompt (new chat): "What happened in AI news today?"

Tool-call UI while running:

- "AI news today" search query header with a live "10 results" counter, expanding into a scrollable list of individual result rows (favicon, page title, bare domain) — e.g. TechCrunch, artificialintelligence-news.com, socialmediatoday.com, news.syr.edu — rendered as the actual result set, not a black box.
- A second step "Searching the web" appears below/after the result list (a second round of fetching, likely reading a subset of the results in full).

Final answer rendering:

- Prose response with bold section headers per topic, and inline citation pills after the relevant sentence/paragraph, e.g. `OpenAI +2`, `TechCrunch`, `Build Fast with AI`, `Tech-reader`, `Crescendo AI` — these look like per-claim source chips (some collapse multiple sources into "X +2"), not a single end-of-message source list.
- Footer disclaimer text changed specifically for a search-grounded answer: "Claude is AI and can make mistakes. Please double-check cited sources." (default non-search disclaimer elsewhere reads "Please double-check responses.") — a deliberate, context-specific microcopy variant.
- Notable: the response referenced the user's own product by name ("For AGI Workforce's multi-provider routing, Terra and Luna look like the interesting new nodes...") unprompted — this implies Claude is drawing on cross-conversation memory/context about the account's project, not just the search results, when synthesizing a "why this matters for you" section. Worth flagging as a real personalization capability (persistent user/project memory feeding into unrelated new chats) that AGI Workforce's memory system should be benchmarked against.
- The assistant proactively ended with a follow-up offer ("Want me to pull the official GPT-5.6 API docs and map Sol/Terra/Luna against your current routing catalog?") rather than a flat stop — a conversational-continuation pattern.

## 6. Sidebar pages

### Chats and tasks

Full-width list view (not just a sidebar dropdown): "Search chats and tasks..." bar, "Select" (bulk actions), "Filter by All ▾" (options: All, Chat, Shared, Cowork, Archived), "New" button. Each row shows a relative timestamp (minutes ago / yesterday / Jun 30 / etc.) and, on hover, a kebab (⋮) menu: Pin (P), Rename (R), Add to project ▸, Delete (D, red) — with single-letter keyboard shortcuts shown inline.

### Projects

Grid of cards (title, optional badge like "Example project", description snippet, "Updated X ago"), "Sort by Last updated ▾", "New project", search bar.
Project detail page: breadcrumb (Projects / name), pin icon, ⋮ menu (Edit details, Archive, Delete). Composer with a Chat/Task-list icon toggle. Right rail: "Instructions" (+ to add — "tailor Claude's responses"), "Memory" (badge "🔒 Only you"; on the filled example project this showed real synthesized content: "Purpose & context: Siddhartha is building a project focused on teaching others how to prompt Claude..." with a "Last updated" date — i.e. Claude writes its own running summary of the project, not just raw chat logs), "Context" (file drop zone, "Add PDFs, documents, or other text..."; filled example showed a real file card "Claude prompting guide.md · 414 lines · MD" with a search icon over the section), "Scheduled" (+ "Set up recurring tasks for this project"). Clicking a context file opens a modal with the rendered file content and a preview/source toggle.

### Artifacts (gallery)

Tabs: All (32+) / Yours (32+) / Shared with you (0). Cards show a type badge — "Code" (renders a generic `</>` glyph, no thumbnail) or "Chat" (renders the actual leading text of the artifact as a preview, since these are generated documents/reports) — plus title, description snippet, and either "Edited X ago" with a lock icon + eye icon + view count, or just "Edited X ago" for chat-type artifacts.
Opening a gallery artifact (as opposed to one embedded in an open chat) navigates to a dedicated full-page route (`/code/artifact/{id}`), not the side panel: header has an artifact-type icon, editable title with a dropdown chevron, "Artifact by you" byline, pencil (edit) icon, "Share" button, account avatar. One opened artifact ("Web Bug Fixes — agiworkforce.com") turned out to be a fully custom interactive React dashboard — colored stat tiles (43 Fixed / 3 Blocked / 9 Live-verified / 46 Total findings), color-coded callout boxes, and collapsible "What changed" disclosures per finding — confirming artifacts can be arbitrarily rich client-side apps, not just static HTML/text.

### Scheduled

Empty state ("No scheduled tasks yet") with a clock/timer icon, "Sort by Next run ▾", "New task ▾" (dropdown). Below the empty state, a fixed row of task templates to jump-start scheduling: Monitor a topic (daily 9am), Weekly review (Fri 4pm), Daily briefing (weekdays 8am), Content ideas (Mon 9am), Meeting prep, Inbox triage — each with an icon, description, and default cadence shown.

### Global search (sidebar search icon)

Opens a centered modal overlay (not a full page): "Search chats and projects" input. With no query, shows a recency-ranked mixed feed: chat conversations, a Claude Code CLI/browser session ("Chrome restart and desktop settings alignment" with a `</>` icon and a return-arrow affordance marking it as resumable), a GitHub PR autofix entry ("Autofix PR: siddharthanagula3/agiworkforce#399 (qa/mobile-fixes)" tagged "PR #399"), and a project ("How to use Claude", byline "Siddhartha Nagula"). Typing a query ("emoji") instantly filters to title matches with the matched substring bolded, and a "Searching deeper..." label appears below with progressive/async full-text results loading in. This is a genuinely unified cross-surface search index (chat + Claude Code sessions + GitHub automation + projects), not just a chat-title filter.

### Account menu (bottom-left avatar chip)

Shows the account email, then: Settings (⇧⌘,), Language ▸, Get help, divider, View all plans, Get apps and extensions, Gift Claude, Learn more ▸, divider, Log out (red-adjacent, not clicked).

## 7. Settings modal — section by section

Reached via Customize sidebar entry, the account-chip "Settings" item, or the ⇧⌘, shortcut. Two-column modal: left nav (Settings: General/Account/Privacy/Billing/Usage/Capabilities/Claude Code/Cowork/Claude in Chrome; Customize: Skills/Connectors/Plugins) with a search box above it, right pane shows the selected section.

**General**: Profile (avatar, full name, "What should Claude call you?", "What best describes your work?" dropdown = e.g. "Product management", "Instructions for Claude" textarea with a note that Claude applies these across chats and Cowork, linking to Anthropic's guidelines). Preferences: Appearance (system/light/dark icon toggle), Chat font ("Anthropic Serif ▾" — explains the serif headings seen throughout), Motion (System/Reduced — animation reduction for streaming). Voice: Language (English ▾), Style ("Buttery ▾" — a whimsically named voice-style preset), Speed (Normal ▾). Notifications: five toggles, all default ON — Response completions, Code notifications, Code permission requests, Emails from Claude Code on the web, and "Dispatch messages" ("Get a push notification on your phone when Claude messages you in Dispatch") — "Dispatch" is a previously-unseen product surface name worth tracking down separately.

**Account**: Log out of all devices button (not clicked), "To delete your account, please cancel your Claude Max subscription first" gate + Delete account button (disabled path, not clicked), Organization ID (shown in full, a UUID), "Trusted devices" section — "Devices that can control your local machine through remote sessions" (empty: "No trusted devices") — this is the remote-control/pairing feature, and "Active sessions" table (Device / Location / Created / Updated) showing the current Chrome session tagged "Current" with city-level location and exact login timestamps.

**Privacy**: Intro blurb linking to Privacy Center and Privacy Policy, two expandable rows ("How we protect your data", "How we use your data"), Preferences: "Location metadata" toggle (OFF — "Allow Claude to use coarse location metadata (city/region) to improve product experiences") and "Help improve our AI models" toggle (OFF — the training opt-in/out control), "Your data": Export data button, Shared chats (Manage), Uploaded files (Manage).

**Billing**: Plan card (Max plan, "20x more usage than Pro", auto-renew date) with "Adjust plan" button; Payment via "Link by Stripe" with an "Update" button; a "Debit owed: $0.03" line item (small pending balance, notable as a real micro-billing detail); Invoices list; Cancellation section with a red "Cancel" button (not clicked, per rules).

**Usage**: "Plan usage limits — Max (20x)". Current session bar ("52% used, resets in 2 hr 41 min"). Weekly limits shown per bucket: "All models" and "Fable" each with independent percentage-used bars and reset timestamps (confirms usage is metered both in aggregate and per top-tier-model-family). "Last updated: just now" with a manual refresh icon. Usage credits: a toggle (OFF) to "keep using Claude if you hit a limit," with its own spend/reset tracking ("$0.00 spent," "Resets Aug 1").

**Capabilities**: Memory section duplicates and explains the mechanism behind the cross-chat personalization seen in the search-tool test: "Search and reference chats" (ON — "Allow Claude to search for relevant details in past chats") and "Generate memory from chat history" (ON — "controls memory for both chats and projects"), plus "Import memory from other AI providers" with a "Start import" button (a Cursor/ChatGPT-style memory migration flow — not clicked, this exact action is on the forbidden list). General: "Tool access mode" ("Load tools when needed ▾"), "Connector search" (OFF), "Switch models when a message is flagged" (OFF — "When off, your chat will pause instead" — a safety-fallback behavior toggle). Visuals: "Artifacts" (ON), "AI-powered artifacts" (ON — "Build apps and interactive documents that use Claude inside the artifact," i.e. artifacts can themselves call the model), "Inline visualizations" (ON — charts/diagrams directly in the conversation, distinct from the artifact panel). Code execution and file creation: "Cloud code execution and file creation" (ON — "Claude can execute code on a server and create and edit docs, spreadsheets, presentations, PDFs, and data reports. Required for skills" — this is the "wiggle" sandbox backend observed in network requests), "Allow network egress" (ON, with an explicit security-risk warning link) and a "Domain allowlist" control currently set to "All domains" with a visible warning banner "Claude can access all domains on the internet" — a real, user-configurable sandbox network policy.

**Claude Code**: A referral card ("Gift a week of Claude Code" / guest pass, "0/3 left", copy-link box — not clicked). General: "Classify session states" (ON — auto-classifies sessions as blocked/ready for review/done, and counts toward plan usage), "Switch models when a message is flagged" (ON, a second instance of this toggle scoped specifically to Claude Code web/remote sessions). Code appearance: separate "Claude Light" and "Claude Dark" theme pickers each with a live two-line diff preview rendered inline, plus a custom "Code font" text input (e.g. "JetBrains Mono"). Appearance: High-contrast dark theme (OFF), Interface font (Anthropic Sans / System), Transcript text size (Small/Medium/Large), Transcript width (cut off before I could capture).

**Cowork**: Just two controls — "Run new tasks in the cloud" (ON — "When on, new Cowork tasks start in the cloud instead of on this computer," confirming Cowork also has a local/on-device execution mode when toggled off) and "Global instructions" (an Edit button for instructions that apply to all Cowork sessions).

**Claude in Chrome** (Beta): "Site permissions" — "Default for all sites: Allow extension ▾" with the note "Claude in Chrome works everywhere except sites you block below," and a "Blocked sites" domain list (empty, "Add websites" button) — this is the exact permission surface governing the very extension used for this audit.

**Customize > Skills**: A table (Skill / Last updated / Author) listing built-in Anthropic skills all stamped "7/9/26" (today) — algorithmic-art, brand-guidelines, canvas-design, doc-coauthoring, internal-comms, mcp-builder, skill-creator, slack-gif-creator, theme-factory, web-artifacts-builder — plus one user-authored skill, "humanizer" (Author: "You", updated 3/18/26). "Browse" and "Add ▾" buttons, a search icon.

**Customize > Connectors**: Full table (Connector / Type / Status) with tabs All/Connected/Not connected: Indeed, Tsenta (Custom badge), Vercel — all connected (✓); Gmail ("⚠ Reconnect"), n8n (Custom, "⚠ Connection issue") — broken; Airtable, Canva, GitHub Integration, Google Calendar, Google Drive, Slack — all "Connect" (not yet linked). Opening a connector (Indeed) shows: Disconnect button, ⋮ menu, a description of what the connector does, and a "Tool permissions" section that groups tools (e.g. "Read-only tools (4)") with a group-level default plus a per-tool three-state control — a checkmark (auto-allow), a hand (ask each time), or a no-entry circle (blocked) — for each individual tool (Company Information, Job Details, Get Resume, Job Search). This granular per-tool, three-state permission model is a strong, concrete reference for how AGI Workforce should gate its own connector/tool actions.

**Customize > Plugins**: Table (Plugin / Author / Skills count / Last updated): Brand Voice (Tribe AI, 3), Common Room (6), Apollo.io (3), Slack (interestingly authored by "Salesforce", 2), Legal (Anthropic, 9) — all updated "7/9/26". Opening one (Legal) shows: a "Customize" button + enabled toggle + ⋮ menu, "Source: Marketplace (Anthropic & Partners)", Author, Last updated ("6 hours ago" — note this differs from the list's "7/9/26", i.e. per-plugin freshness is tracked more precisely than the table shows), a description, and two tabs — Skills and Connectors. The Skills tab lists slash-invokable commands with descriptions, e.g. `/brief`, `/compliance-check`, `/legal-response`, `/legal-risk-assessment`, `/meeting-briefing`, `/review-contract`, `/signature-request` — each explains what it does and when to use it, with the note "Invoke by typing / in chat, or let Claude use them automatically for relevant tasks." This confirms Plugins are marketplace bundles of Skills (+ their own Connectors), each skill independently invocable via a slash command or autonomously.

## 8. Top 20 highest-signal findings for parity

1. **Tool-call transparency in the transcript.** Every agentic step (skill read, file write, search) renders live with an icon + one-line label, then collapses into a single clickable summary ("Viewed a file, created a file, read a file ›") that re-expands into the full trace forever. This is the single biggest structural gap versus a typical clone.
2. **Live-streamed file writes.** Artifact generation shows the actual file content scrolling into view line-by-line as it's written, not a spinner — genuine transparency into a long-running server-side operation.
3. **Client-side tree-sitter WASM highlighting** for all code (chat code blocks and the artifact Source tab) — real-grammar, not regex-based, loaded on demand.
4. **Sandboxed per-conversation code execution backend** (internal name "wiggle"), with generated files served from `/mnt/user-data/outputs/<file>` per conversation — a real filesystem, not inline text.
5. **Configurable sandbox network policy**: a "Domain allowlist" setting (default: all domains) with an explicit on-screen security-risk warning — a concrete, user-facing sandbox trust boundary.
6. **Per-tool, three-state connector permissions** (auto-allow / ask-each-time / blocked) grouped by tool category, not just one connect/disconnect toggle.
7. **Skills, Connectors, and Plugins as first-class composer menu items**, each with its own flyout, alongside Research and Web search toggles — a full extensibility surface reachable mid-chat via "+".
8. **Plugins are marketplace bundles of Skills + Connectors**, each skill independently slash-invokable (`/review-contract`, `/compliance-check`, etc.) or auto-invoked by Claude when relevant.
9. **Edit-creates-a-branch with an explicit "n / total" counter and prev/next arrows** — both the edited prompt and its original response are fully preserved and swappable, not silently overwritten.
10. **Cross-chat persistent memory** feeding unrelated new conversations: an unprompted web-search answer referenced the user's own product by name, sourced from "Search and reference past chats" + "Generate memory from chat history" settings (both on by default) — real longitudinal personalization, not per-session context only.
11. **Per-project synthesized memory** distinct from raw files — the project's Memory panel shows a Claude-written running summary ("Purpose & context: Siddhartha is building a project focused on...") with its own last-updated timestamp, separate from the Context (file upload) section.
12. **Search-grounded answers get per-claim inline citation chips** (`OpenAI +2`, `TechCrunch`, collapsing multiple sources into "+N") plus a distinct footer disclaimer ("double-check cited sources" vs the default "double-check responses").
13. **A live, expandable search-tool card** during generation: query text, running result counter, and an actual scrollable list of favicon+title+domain results — not a black-box spinner.
14. **Cowork is a distinct autonomous-task mode** with its own approval-gate primitive baked into the composer: "Manually approve" (pauses for each action) vs "Skip all approvals" (never pauses, explicitly flagged as covering "unsafe actions" too) — and a matching global "Run new tasks in the cloud" vs local-machine toggle in Settings.
15. **A unified, cross-surface global search**: one search box surfaces chat conversations, Claude Code CLI/browser sessions, and even automated GitHub PR entries ("Autofix PR: ...#399") together, with instant title-match highlighting plus an async "Searching deeper..." full-text pass.
16. **Model picker exposes reasoning effort as a first-class, always-visible control** ("Fable 5 Max" shown directly on the composer trigger, not buried in settings), with five effort levels (Low/Medium/High-default/Extra/Max) each carrying a cost/quality trade-off explainer.
17. **Scheduled tasks ship with ready-made recurring templates** (Monitor a topic, Weekly review, Daily briefing, Content ideas, Meeting prep, Inbox triage) shown even in the empty state, each with a default cadence, lowering the barrier to first use.
18. **Granular, per-surface safety-fallback controls**: "Switch models when a message is flagged" appears twice (general Capabilities and Claude Code-specific), each explicitly stating the alternative behavior ("your chat/session will pause instead") rather than failing silently.
19. **Metered usage is split by session, by weekly aggregate, and by top-tier model family** (a distinct "Fable" bucket alongside "All models"), each with independent percentages and reset timestamps, visible in Settings without needing a support ticket.
20. **A real micro-billing line item ("Debit owed: $0.03")** surfaced directly in Billing settings — small-balance transparency that most SaaS billing pages hide until invoice time.

## Assumptions and unresolved items

- Fable 5 at Max effort took roughly 25-100+ seconds per response in this session (longest for the artifact + skill invocation); this is a real, observed latency data point, not a UI artifact, and should inform expectations when benchmarking AGI Workforce's own model response times.
- Per-token streaming cadence could not be conclusively confirmed at the polling granularity used (5-10s waits); the final text appeared essentially complete between polls rather than visibly character-streaming, but this may be an artifact of poll timing rather than proof of non-streaming.
- Did not test: thinking/reasoning disclosure UI for a dedicated "thinking" toggle (Fable 5's Max effort may fold this into the multi-verb "Sifting/Honing/..." status animation rather than a separate expandable thinking block — not confirmed), artifact version history (would require a follow-up edit to an existing artifact), Retry behavior on an assistant message (only Edit-branch was tested), and the Scheduled task creation flow itself (only the empty state and templates were observed).

Parity signal: this "Claude reasons about which skill to use → live-streams the file it's writing → collapses into an auditable step trace → opens a synced live-preview panel" pipeline is the single biggest gap between claude.ai and a typical clone. AGI Workforce's artifact/canvas equivalent (if any) should be checked specifically for: (a) does it show _which_ skill/tool ran and why, (b) does it stream the file content live rather than just a spinner, (c) does the completed trace stay expandable/collapsible as a permanent audit log in the transcript, (d) does Preview/Source live in a persistent side panel that keeps the chat interactive rather than a blocking modal.
