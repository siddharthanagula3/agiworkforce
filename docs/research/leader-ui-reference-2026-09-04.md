# chatgpt.com and claude.ai interface reference (observed 2026-09-04)

Status: Current
Owner: Product (founder) and the parity agents
Last updated: 2026-09-04

Every statement here was observed first hand in the founder's signed-in sessions (ChatGPT Plus, Claude Max) in Chrome on 2026-09-04, driven by the orchestrating agent. It records what is on screen, what it does and what it talks to, so agents build parity from evidence instead of memory. It extends `claude-ai-ui-reference-2026-09-03.md`, which still holds for the parts of claude.ai it covers; where the two differ, this file is newer. Nothing not written here was opened and must not be assumed.

Vocabulary: "rail" is the right column of a task page; "drawer" is a right panel toggled from a header button; "step line" is one collapsed activity row inside an assistant turn.

## 1. chatgpt.com

### 1.1 Shell and boot

- Header: a segmented control "Chat | Work" centred at the top of every page (it remembers its state across pages), a Temporary chat button on the right. Sidebar: Search, New chat, Library, Scheduled, Plugins, More (Images, Health, Finances, Sites, GPTs); Projects; Chats; a footer with the profile menu and a "Download apps" button.
- Greeting rotates ("Ready when you are.", "What's on your mind today?", "Hey, Siddhartha. Ready to dive in?"). In Chat mode the composer reads "Ask ChatGPT" with an effort chip ("High"), dictation and voice; the model name is hidden. Below it, up to three suggestion rows sourced from a connected Gmail account (icon, a task sentence, an X to dismiss).
- Boot requests, in order: telemetry; assets (route-split CSS, hashed JS chunks, two SVG sprite sheets for shell and composer icons, OpenAI Sans woff2); then user consent, account check, me, settings, a sentinel prepare and finalize pair (bot check), system_hints in basic, plugins and custom_agents modes, models and picker presets, group chat summary, pins, one page of 28 conversations ordered by update time, first-party eligibility, an adult check. The greeting paints before the sidebar data arrives; the composer never waits for it.

### 1.2 Work mode

- Switching to Work changes the greeting to "What should we work on?", enlarges the composer ("Work on anything"), shows the full model name with its effort level and adds a chip row under the composer: Project, Files (a popover that searches the Library), Plugins (connected icons) and "Open desktop app". The same row appears in Chat mode once the composer is focused.
- The switch is not a navigation. It calls conversation init, usage, a conversation prepare, `composer/items?entrypoint=work` for suggestions, `prompt_library` with a model slug that carries a `-wm` suffix (Work has its own model variant), connector links, featured and installed plugins, and records that suggestions were shown. Work is the same conversation runtime with a model variant, a suggestion feed and a plugin surface of its own.

### 1.3 Anatomy of a Work turn (web search)

- On send the URL flips to `/c/WEB:<client id>` and then to `/c/<server id>`. For about two seconds the transcript shows one word, "Working", under the user bubble; the composer placeholder becomes "Follow up"; the send button becomes Stop. The header gains the generated title with a " · Work" suffix, Share, an overflow menu and a rail toggle.
- Done: the activity collapses to one line, "Worked for 10s >". Expanded it shows an interim narrative sentence ("I'm checking a live market source..."), then a step line "Searched 9 websites" with stacked favicons, then the answer. Sources are inline links ("Kitco ↗"), not chips. A strip "Is this conversation helpful so far?" with thumbs appears under the answer.
- Response action row: copy, thumbs up and down, comment, share, "Switch model" (the regenerate icon; its tooltip names the model used and opens a model choice), and More actions (timestamp, View sources, Branch in new chat, Read aloud).
- The rail toggle opens a floating panel at the top right (not a docked column on the web): Outputs with a plus and "Create file or site"; Sources with a plus and "Web search".
- Requests: conversation prepare then the streaming POST, sentinel prepare, ping, finalize and req around the send, `conversation/<id>/stream_status` for resume, the conversation list refetched after the title arrives, per-project conversation lists to rebuild the sidebar nesting, `conversation/<id>/textdocs`, a latency report, usage after the turn. The client owns the optimistic id; resume is a first-class endpoint; the sidebar is rebuilt from the server after a title, not patched locally; usage refreshes on the turn boundary.
- Header overflow on a chat: View files in chat, Pin chat, Archive, Delete, Move to project. Sidebar row menu: Share, Rename, Pin chat, Archive, Delete, Move to project. Work chats carry a "Work" badge in the sidebar row. Delete confirm: "Delete chat? This will delete <title>. Visit settings to delete any memories saved during this chat." Cancel and Delete; the app returns home.

### 1.4 Documents: canvas is gone

- Asking for a canvas document in Chat mode gets the reply "Canvas is deprecated, but here is the poem in an editable writing block": an inline card in the transcript with Edit, copy, download and expand, followed by two follow-up suggestion chips and the response action row. The block is inline first and expands to full screen.
- Files and sites are Work outputs ("Create file or site" in the rail) and live in the Library. There is no side-by-side canvas editor on chatgpt.com any more.

### 1.5 Library, Scheduled, Plugins, Skills

- Library is a file manager: Search, New, tabs All, Images, Documents, a filter, grid or list, a table with Name, Modified, Size. Rows mix a connector folder (Google Drive), project folders, documents and uploads. One space across chats, projects and connectors.
- Scheduled: a page with its own composer ("Schedule a task", mic, send), an Active filter, task rows (name, type such as Monitoring, "Next run in 3 days"), then Recommended templates with plus buttons.
- Plugins: a directory with a Plugins and Skills switch, search, an Installed row, a Popular grid (installed items show an overflow, others a plus), then New and Noteworthy. Skills: "Instructions that extend ChatGPT's capabilities", search, a plus, and an empty state that says to ask ChatGPT Work to create skills for repeatable tasks.

### 1.6 Projects

- Project page (Work): folder icon and name, Share, overflow (Project settings, Pin project); a tall composer "New chat in <project>" with plus, model and effort, mic, send; chips Files, connected plugins and "Open desktop app"; tabs Chats (title, last message preview, date) and Sources (Add sources tile, file rows with type and date, Newest and All filters; the URL carries `?tab=sources`).
- Project settings: name with an icon picker, Instructions, Memory ("Default memory: this project can access memory from outside chats, and vice versa"), Library access ("Enabled: sharing the project disables library access"), Delete project.

### 1.7 Settings

- A modal (URL gains `#settings`) with search and sections: General (Appearance, Contrast, Accent color, Language, "Higher intelligence" toggle, Enable Dictation), Notifications, Personalization, Plugins, Voice, Billing, Usage, Analytics, Data controls, Cloud browser, Storage, Safety, Security and login, Parental controls.
- Personalization: base style and tone, traits as Less or More (Warm, Enthusiastic, Headers and Lists, Emoji), Fast answers toggle, Suggested prompts toggle, Custom instructions.
- Data controls: Improve the model, Location, Information shared with apps, Work network access, Reset ChatGPT Work, Shared links, Archived chats, Archive all, Delete all.
- Cloud browser: default permission "Always allow", per-site overrides, cookies saved by the cloud browser. Storage shows a usage breakdown.

## 2. claude.ai

### 2.1 Home and navigation

- `/new` is titled "New task" in Cowork mode and "New chat" in Chat mode. Greeting "Afternoon, Siddhartha" in the serif beside the asterisk mark. The composer holds plus, a "Chat | Cowork" segmented toggle, the model with effort ("Sonnet 5 High"), mic with a dropdown. In Cowork mode the placeholder is "Type / for skills" and two selectors sit under the composer, Project and Auto; below them an Active list of running tasks with "Clear active". A Beta pill sits top right.
- Sidebar hrefs: New `/new` (shift cmd O), Projects `/cowork/projects`, Artifacts `/artifacts`, Scheduled `/scheduled-task` (`/scheduled` is a 404), Customize `/customize`. Rows under "Chats and tasks" carry a status dot (blue while running).
- Model menu: Fable 5.1 "For your toughest challenges", Opus 5 "For complex tasks", Sonnet 5 "Most efficient for everyday tasks", Haiku 4.5 "Fastest for quick answers", then an Effort submenu (one toggle, "Extended: Always uses deep reasoning") and More models.

### 2.2 Anatomy of a chat turn (web search)

- Requests: POST `chat_conversations/<id>/completion` (streamed), then POST `.../title` (the server names the chat), then one GET of the conversation with `tree=True&rendering_mode=messages&render_all_tools=true&include_inline_comparison=true`; also `composer_notices` per conversation and `artifacts/<conversation>/versions?source=w`. Tree, tool renders and inline comparisons are one read.
- While streaming: one line "Searching the web >" with the orange asterisk. After: "Searched the web <query> v" with the query inline; expanding lists result rows (favicon, page title, domain right-aligned) with a scroll affordance.
- The answer is set in the serif; a citation is a small uppercase pill ("KITCO") after the sentence. The footer reads "Please double-check cited sources." when citations exist and shows the model and effort on the right.
- Assistant action row: Copy, Good response, Bad response, Retry, Read aloud. User row: Retry, Edit, Copy. Relative timestamps live in the accessibility text.
- Title dropdown: Pin (P), Rename (R), Add to project, Delete (D), single-key shortcuts. Delete confirm: "Delete chat? Are you sure you want to delete this chat?"; then a toast "Chat deleted" and the app lands on `/new`.

### 2.3 Artifacts

- The artifact tool renders as a step line with its title and elapsed time while running ("Simple click counter button in HTML with inline CSS and JavaScript 7s >"), then the title plus a filename chip ("click-counter.html").
- The side panel does not open on its own for every artifact. A document icon appears in the header beside Share and toggles an "Artifacts" drawer listing cards ("Click counter · Code · HTML", download). Clicking a card opens the split view: the chat narrows; the panel header has a preview or code toggle, the title and type, a Copy split button, expand and close.
- While a reply streams, a banner above the composer offers "Want to be notified when Claude responds?" with Notify.
- `/artifacts`: tabs All, Yours, Shared with you; search; "New artifact". Cards show a live thumbnail, title, a lock and "Edited 25m ago". "New artifact" does not open an editor: it starts a Cowork task at `/cowork/cse_<id>` with a canned first message ("I want to make an artifact: a web page published with the Artifact tool. Ask me a few questions about what it should show, then build it and publish it.").

### 2.4 Cowork task page

- Header: task title as a dropdown, a rail toggle. Rail: Progress (a stepper), Outputs, Context (folder chips), and a "Suggested connectors" card (Claude in Chrome, Notion, Linear, See all connectors) on a fresh task. Status line "Getting set up for this task..." before the first step. A banner above the composer: "Automatically approve is on. Claude runs on its own and pauses if anything looks unsafe." The footer shows "Auto" on the left and the resolved model and effort on the right once the run starts; Stop is the square button inside the composer.
- Task title menu: Schedule, Turn into skill, Copy session ID, Pin (P), Rename (R), Add to project, Archive (A), Delete (D). Delete confirm: "Delete task. Are you sure you want to delete this task?"

### 2.5 Projects and Scheduled

- Project page at `/cowork/project/<id>`: breadcrumb, pin, overflow (Edit details, Archive, Delete); the composer with the Auto selector; empty state "Give Claude a task and it'll pick up your project context automatically."; rail Instructions, Memory ("Only you"), Context (drop area), Scheduled.
- `/scheduled-task`: "Scheduled tasks", "Run tasks on a schedule or whenever you need them.", search, "Sort by Next run", "New task"; empty state with a stopwatch, "No scheduled tasks yet."; a wavy divider; templates (Daily briefing, Inbox triage, Meeting prep, Weekly review, Content ideas, Monitor a topic) each with a default cadence.

### 2.6 Settings and Customize

- `/customize` and `/settings/<section>` open the same modal (`#settings/<section>`): Settings (General, Account, Privacy, Billing, Usage, Capabilities, Claude Code, Cowork, Claude in Chrome) and Customize (Skills, Connectors, Plugins), with search.
- General: profile fields and "Instructions for Claude" kept across chats and Cowork; Appearance. Capabilities: Memory (search and reference chats; generate memory, marked Legacy; import memory from other providers via a prompt to run there), Tool access mode "Load tools when needed", connector search, switch models when a message is flagged. Cowork: require trusted devices, only on your computer, preferred browser, global instructions. Claude in Chrome: enable, site permissions shared with the built-in browser, default policy. Privacy: location metadata, help improve models, export data, shared chats and artifacts.
- Skills: a table (Skill, Last updated, Author) with Browse and Add. Connectors: Popular row, filters All, Connected, Not connected, a table, search and Add. Plugins: empty state with Browse plugins.

## 3. What this changes for AGI Workforce

1. A task turn starts generic ("Working", "Searching the web") and collapses to one line when done ("Worked for 10s", "Searched the web <query>"). Our reasoning and search labels follow the same shape; the collapsed line must carry a count or the query.
2. Documents are outputs of work, not a separate canvas. Prose comes back as an inline editable block with follow-up chips; files and pages sit in a rail and a library. The artifact split view opens from a header toggle and a drawer, on click, not on every output.
3. The mode toggle sits at the composer (Claude) or the top of the page (ChatGPT) and is remembered per chat; ours is at the composer and now persists per conversation.
4. A project is a page with a composer, chats, files or sources, instructions and a memory scope; a Cowork task can become a schedule or a skill from its own header.
5. Titles are named by the server after the first turn; the sidebar is rebuilt from the server rather than patched; delete confirms name the chat and mention memory.
6. The model menu shows one line of guidance per model and a separate effort control; the footer shows the resolved model and effort.
7. Connector-sourced proactive suggestions and the More gallery need products we do not ship; they stay out of scope.
