# Claude and ChatGPT Live Interaction Atlas — 2026-07-16

**Status:** Active evidence record  
**Owner:** Frontend platform  
**Evidence date:** 2026-07-16  
**Scope:** Signed-in web products at `claude.ai` and `chatgpt.com`  
**Method:** Open every safe visible control, record the resulting page, panel, menu, modal, tab, state, and interaction contract. Stop before destructive, purchasing, publishing, installation, permission-granting, data-transmission, or account-security side effects.

**Model-name amendment (2026-07-25):** model labels in this dated interaction
record were normalized to the current AGI catalog. They are not evidence that
Opus 5 was available on the original observation date.

This is a dated competitor observation, not AGI's product source of truth. Product decisions belong in `docs/current/frontend-experience-contract.md`. Account-specific conversation names, repository names, connectors, usage totals, and personal data are intentionally omitted or generalized.

## Evidence labels

- **Verified-opened:** the control was clicked in the live signed-in product and the resulting state was inspected.
- **Verified-visible:** the control and its accessible state were observed, but clicking would create an external or privileged side effect.
- **Pending:** the control still needs a safe interaction pass.
- **Blocked:** inspection requires a user-authorized side effect, unavailable entitlement, different device, or installed native application.

## Safety boundary

The pass may open navigation, menus, drawers, selectors, tabs, read-only detail pages, unsaved creation forms, and confirmation screens. It must not:

- send prompts or messages;
- create, edit, archive, publish, share, or delete durable user data;
- change model, connector, notification, privacy, security, billing, or permission settings;
- connect repositories or external accounts;
- install applications or integrations;
- activate the microphone, camera, filesystem picker, or browser permission prompts;
- expose secrets, environment-variable values, private chat content, or personal usage details in this document.

## Claude: global shell

### Layout

**Verified-opened.** Claude uses a resizable left sidebar and a main workspace. The sidebar exposes collapse (`Command+B`), search, a top-level Home/Code mode switch, surface-specific navigation, pinned items, recent items, account access, and application downloads. The navigation model changes substantially when Code is active; Code is not merely a composer mode.

### Home-mode sidebar

**Verified-visible.** Primary destinations:

- Home
- Code
- New
- Quick task
- Chats and tasks
- Projects
- Artifacts
- Scheduled
- Customize
- Pinned
- Recents
- View all
- Filter and group recents
- Design
- Account/plan menu
- Apps and extensions

Pinned and Recents are collapsible. Recent items expose an item-level overflow action. The sidebar can be resized by dragging and collapsed independently of the main workspace.

### Search dialog

**Verified-opened.** Search opens as a modal dialog over the current workspace rather than navigating away.

- Search field: `Search chats and projects`
- Results: listbox with keyboard selection
- Default results group items by relative age such as past week, past month, and past year
- Keyboard affordances show arrow navigation, Enter to select, Tab for actions/open menu, and `Command+K`
- A close button restores the underlying workspace without navigation

### Code-mode sidebar

**Verified-opened.** Code replaces the Home navigation set with:

- New session (`Shift+Command+O`)
- Artifacts
- Routines
- Customize
- More
- Routines section with unread-response state
- Pinned
- Recents
- Filter
- Code-session rows with run/PR status and item overflow
- Optional Slack installation promotion
- Account/plan menu

The Code shell therefore owns developer-session navigation, execution environments, repositories, agent policy, routines, usage, and session history.

## Claude: Home workspace

### Landing composition

**Verified-visible.** The Home workspace includes:

- beta label;
- time-aware personalized greeting;
- large prompt editor;
- contextual helper text;
- add-files/connectors menu;
- Chat/Cowork surface selector;
- model plus effort selector;
- composer settings;
- press-and-hold dictation;
- optional project association;
- approval mode;
- plan/usage promotion;
- suggested task cards labeled by surface.

The observed default surface was Cowork. Chat and Cowork share the shell but are represented as explicit radio choices, not undocumented routing behavior.

### Pending Home interactions

- Chat/Cowork post-click differences
- add-files/connectors menu
- model and effort picker
- composer Settings menu
- project selector
- approval selector
- Quick task
- Chats and tasks
- Projects
- Artifacts
- Scheduled
- Customize
- Design
- account menu and settings modal
- apps and extensions
- recent-item overflow
- filter/group recents

## Claude: Code workspace

### New-session layout

**Verified-opened.** A Code session starts from a dedicated workspace containing:

- execution environment selector;
- repository combobox;
- task editor;
- Send action;
- permission/operation mode selector;
- Add menu;
- dictation and dictation settings;
- model selector;
- effort control;
- combined context-window and plan-usage meter;
- tile/split keyboard guidance for workspace layout.

### Execution environment menu

**Verified-opened.** The environment selector is divided into three trust/execution groups:

1. **Local** — requires/downloads the Claude desktop application and is labeled desktop-only.
2. **Cloud** — selects a named cloud environment, exposes per-environment settings, and can add another cloud environment.
3. **Remote Control** — instructs the user to run `claude rc` on a machine so the web UI can control Code there.

These are visibly distinct execution authorities. AGI must not flatten Local, managed cloud, and remote-device control into one ambiguous runtime toggle.

### Cloud environment editor

**Verified-opened.** The environment settings action opens an `Update cloud environment` modal. It states that changes apply to new sessions and contains:

- Name
- Network access level
- links to network-policy and access-level documentation
- Environment variables in `.env` format
- an explicit warning that values are visible to anyone using the environment and therefore must not contain secrets or credentials
- Setup script, described as a Bash script run before Claude Code launches
- Archive
- Cancel
- Save changes
- Close

The modal separates environment configuration from repository selection and from per-session prompts.

### Repository selector

**Verified-opened.** The repository control opens an anchored dialog containing:

- a searchable combobox (`Search repos…`);
- a listbox of connected repositories;
- keyboard-compatible option selection;
- no implicit repository selection when the menu opens.

### Code permission mode

**Verified-opened.** The `Accept edits` selector exposes three radio modes with numeric shortcuts:

- Accept edits (`1`)
- Plan (`2`)
- Auto (`3`)

This is session execution policy, not model selection. AGI should represent it as a first-class policy contract and preserve the user's visible choice in every tool approval and transcript event.

### Add menu

**Verified-opened.** The Code Add menu contains:

- Add files or photos (`Command+U`)
- Slash commands
- Connectors

The slash-command action inserts `/` into the prompt and opens a filterable command menu. Observed commands:

- `model`
- `workflows`
- `usage`
- `config`

The connectors submenu lists connected providers as checkable per-session tools and exposes:

- connected/disconnected status;
- reconnect state;
- Manage connectors;
- Browse connectors.

Opening the submenu does not toggle a connector. Connector mutations were not performed.

### Dictation settings

**Verified-opened.** Dictation is a split control:

- press and hold to record;
- settings menu.

The settings menu contains a checked `Hold to record` microphone behavior toggle. Microphone activation was not performed.

### Code model picker

**Verified-opened.** The picker is a radio menu with keyboard shortcuts and entitlement labels. Observed entries on this account:

- Fable 5, with a temporary inclusion label
- Opus 5
- Sonnet 5
- Haiku 4.5
- More models

This is dated product evidence only. AGI model identifiers must still come from its canonical machine-readable model registry and current official provider documentation.

### Effort control

**Verified-opened.** Effort opens a compact dialog containing:

- title and current value;
- `About effort` action;
- Faster-to-Smarter axis;
- slider.

The observed selected label was High and the slider exposed numeric value `2`. The pass did not change the value.

### Usage dialog

**Verified-opened.** The Code usage button combines current context-window use and plan allowance. The dialog includes:

- disabled/read-only context-window summary;
- context progress bar;
- plan name/allowance;
- link to Settings usage;
- rolling five-hour limit and reset time;
- weekly all-model limit and reset time;
- model-specific weekly limit and reset time;
- a progress bar and percentage for each allowance.

Personal values are intentionally omitted.

## Claude: Routines

### Routines index

**Verified-opened.** The page describes routines as templates triggered by schedule, API, or webhook. It contains:

- New routine;
- natural-language automation draft field;
- suggested routine prompts;
- disabled Draft routine until input exists;
- All and Calendar views;
- Include completed switch with count;
- routine cards showing schedule and next-run state.

### New-routine form

**Verified-opened; unsaved and cancelled.** The builder contains:

- required Name;
- Instructions with dictation;
- repository selector;
- environment selector;
- trigger selection;
- Connectors tab with a selected-count badge;
- Behavior tab;
- Notifications tab;
- Cancel;
- Create disabled until required fields are valid.

The Connectors tab warns that selected connectors expose all of their tools, including writes, without asking permission during runs. Each connector is removable and another connector can be added.

### Trigger types

**Verified-opened.** Initial choices:

- Schedule — recurring cron-like schedule or a future one-time run
- GitHub event — enabled only after selecting a repository
- API — triggered by an authenticated POST request

Selecting Schedule installs a default daily trigger and exposes:

- Once
- Hourly
- Daily
- Weekdays
- Weekly
- Custom
- time input
- server-load staggering disclosure
- Add another trigger
- Remove trigger

Selecting API shows `Call via API` and states that a token is generated after saving. No routine was created and no token was generated.

### Behavior tab

**Verified-opened.** Exposes `Auto-fix pull requests`, described as watching CI and review comments on PRs opened by the routine and allowing Claude to push fixes. The switch was not changed.

### Notifications tab

**Verified-opened.** Exposes a master `Notify me when this routine finishes` switch and per-channel delivery:

- Push notification to Claude mobile and desktop apps
- Email to the account address
- Slack direct message matched by account email, effective on the next run

The product explains that condition-watching routines notify only when something is worth reporting. No notification setting was changed.

## Claude: pending Code interactions

- Local download boundary
- Add cloud environment form
- Remote Control setup flow
- More models
- About effort
- Artifacts page and artifact detail interactions
- Customize page and all tabs
- More navigation menu
- Filter and Code-session overflow menus
- existing routine detail, run history, and item actions
- Code session detail, transcript events, diffs, approvals, artifacts, browser/computer-use, checkpoints, branch/PR state, and split panes

## Claude: Artifacts library

### Library layout

**Verified-opened.** Artifacts is a first-class library page shared across Chat and Code. It contains:

- page heading;
- type filter;
- New artifact;
- artifact search;
- All, Yours, and Shared with you tabs;
- artifact list/cards with origin surface, title, preview, privacy state, edited time, view count, and overflow action.

The type filter is a radio menu with All, Chat, and Code. The library therefore unifies outputs across the conversational and developer surfaces while preserving origin metadata.

### New artifact

**Verified-opened; not sent.** New artifact returns to the Code new-session composer and inserts a complete starter prompt asking Claude to clarify, build, and publish a self-contained web artifact. It does not send automatically. The prompt was cleared without creating a session.

### Pending artifact interactions

- Yours and Shared with you empty/populated states
- search result behavior
- item overflow actions
- Code artifact detail
- Chat artifact detail and side-by-side conversation state
- version history, edit, fork/remix, share, publish, unpublish, copy, download/export, fullscreen, responsive preview, and collaboration states

## Claude: Settings modal

### Modal layout and information architecture

**Verified-opened.** Customize opens one large two-column `Settings` dialog over the current workspace. It preserves the underlying workspace and contains:

- left navigation with Settings heading;
- searchable settings field;
- grouped navigation;
- close button;
- independently scrolling content panel.

Primary Settings group:

- General
- Account
- Privacy
- Billing
- Usage
- Capabilities
- Claude Code
- Cowork
- Claude in Chrome

Customize group:

- Skills
- Connectors
- Plugins

Each item uses an icon plus text. The selected item has an active state. The dialog is shared across Home and Code rather than reimplemented per surface.

### General

**Verified-opened.** Sections and controls:

**Profile**

- randomized avatar action;
- full name;
- preferred display name;
- work-description combobox;
- persistent instructions for Claude, with guidelines and personalization help links.

**Preferences**

- appearance: System, Light, Dark;
- chat font selector;
- motion: System or Reduced.

**Voice**

- language;
- voice style;
- speed.

**Notifications**

- response completion notifications;
- Code notifications;
- Code permission-request notifications;
- email for Code-on-the-web completion or response needed;
- Dispatch messages to the phone.

No preference was changed.

### Account

**Verified-opened.** Contains:

- Log out of all devices;
- account-deletion state, disabled while an active subscription prevents deletion;
- copy Organization ID;
- Trusted devices table for machines allowed to participate in remote sessions;
- Active sessions table with application/device, coarse location, created time, updated time, current-session marker, and row actions.

Logout, session revocation, device removal, and account deletion were not invoked. Personal identifiers and session details are intentionally omitted from this document.

### Privacy

**Verified-opened.** Includes links to the Privacy Center and Privacy Policy plus expandable disclosures.

Expanded `How we protect your data` states that users control conversation data, can change preferences, can request deletion subject to stated exceptions, and that data is not sold.

Expanded `How we use your data` describes permission-based model improvement, account/billing/communications use, aggregated analysis, and opt-in controls for additional features.

**Preferences**

- coarse location metadata;
- allow chats and coding sessions to improve models.

**Your data**

- Export data;
- manage shared chats;
- manage shared artifacts;
- manage uploaded files;
- manage memory preferences.

The switches and data actions were not changed or submitted.

### Billing

**Verified-opened.** Contains:

- current plan and allowance description;
- renewal date;
- Adjust plan;
- payment provider/method summary;
- Update payment;
- outstanding/debit amount if applicable;
- invoice table with date, due date, total, status, and View action;
- Load more;
- plan cancellation action.

No plan, payment, invoice, or cancellation action was opened. Personal amounts and dates are omitted.

### Usage

**Verified-opened.** Contains:

- current plan and multiplier/allowance;
- current-session meter and reset time;
- weekly all-model meter and reset time;
- model-specific weekly meter and reset time;
- last-updated state and Refresh;
- usage-credit opt-in for continuing after plan limits;
- monthly reset and usage-credit meter;
- monthly spending cap with explanation and Adjust limit;
- current balance;
- auto-reload state;
- Buy usage credits with discount badge.

No credits were purchased and no limit or auto-reload setting was changed.

### Capabilities

**Verified-opened.** This is the central capability-policy page rather than a cosmetic feature list.

**Memory**

- Search and reference chats;
- Generate memory from chat history, with legacy label and shared chat/project scope;
- View and manage memory with last-updated state;
- Import memory from another AI provider using a guided prompt.

**General**

- Tool access mode, observed as lazy/on-demand loading for new conversations;
- connector-directory search;
- automatic model switch when a message is safety-flagged, with pause behavior when disabled.

**Visuals**

- Artifacts baseline capability, enabled and locked;
- AI-powered artifacts that call Claude;
- inline visualizations, charts, and diagrams.

**Code execution and file creation**

- cloud code execution;
- document, spreadsheet, presentation, PDF, and data-report creation/editing;
- network egress for package installation and advanced processing, with explicit security warning;
- sandbox domain allowlist, including an all-domains state and visible description.

**Skills**

- moved into the Customize/Skills destination.

No capability policy was changed. AGI must treat these as policy inputs to the real runtime, not settings-only toggles.

### Claude Code settings

**Verified-opened.** This section is substantially larger than a CLI preferences page.

**Guest access**

- remaining guest-pass count;
- copy referral link;
- statement that the pass covers Cowork and Code.

**General**

- automatic session-state classification into blocked, ready for review, or done, with usage disclosure;
- automatic safety fallback model for web and remote sessions.

**Code appearance**

- independent light and dark syntax themes with live diff/code preview;
- custom monospace font.

**Appearance**

- high-contrast dark theme;
- interface font: Anthropic Sans or System;
- transcript text size: Small, Medium, Large;
- transcript width: Narrow, Medium, Wide.

**Pull requests**

- configurable branch prefix shared by local and cloud sessions;
- automatically create PRs for remote sessions;
- create auto-generated PRs as draft;
- monitor and auto-fix CI failures/review comments, with disclosure that Claude may post comments for the user.

**Authorization tokens**

- token table with application, connection age, scopes, and revoke action;
- observed scope concepts include file upload, inference, MCP servers, profile, and Claude Code sessions.

**CLI, Desktop, and IDE data**

- permanently delete Anthropic's server-side copies without affecting local copies;
- explicit separation from Code-on-the-web session management;
- manage session sharing.

Referral copy, token revoke, session delete, PR automation, and appearance mutations were not performed.

### Cowork settings

**Verified-opened.** Contains:

- `Run new tasks in the cloud`, defining whether new Cowork tasks begin in managed cloud or on the current computer;
- Global instructions applied to all Cowork sessions;
- Edit action for the global instructions.

The execution-location switch was not changed. This is direct evidence that Cowork's location is a user-visible policy and must remain separate from conversation sync.

### Claude in Chrome settings

**Verified-opened.** Contains:

- beta label;
- extension enable/disable policy;
- shared site-permission statement covering both Claude in Chrome and the in-app browser in Claude Code Desktop;
- default site policy selector;
- current policy explanation;
- blocked-sites table;
- Add websites.

No site permission was changed. The cross-surface sharing of one site-policy model is an important architectural signal: browser extension and desktop browser should consume a common permission contract even though their chats/sessions differ.

### Skills

**Verified-opened.** The Skills section contains:

- Search skills;
- Browse;
- Add menu;
- table with skill name, last updated, author;
- item rows that open detail.

Observed rows include user-authored and Anthropic-authored skills, demonstrating that skills are installable/versioned assets with provenance, not hardcoded prompt buttons.

Skill detail, browse, and add/import flows remain pending because some paths can install or transmit data.

### Connectors

**Verified-opened.** Contains:

- Search connectors;
- Add connector menu;
- All, Connected, and Not connected filters;
- table with connector, transport/type, and status;
- status values including Connected, Reconnect, Connection issue, and Connect;
- Web and Custom type badges;
- row detail action.

Connection and reconnection were not invoked.

### Plugins

**Verified-opened.** Contains:

- Search plugins;
- Browse;
- Add menu;
- table with plugin, author, skill count, and last updated;
- row detail action.

The observed design makes a plugin a distributable bundle that can contribute multiple skills. Plugin browsing/installation and detail remain pending.

### Pending Settings interactions

- settings search results and keyboard behavior;
- profile/work selector options;
- chat fonts, voice languages/styles/speeds;
- active-session row menu up to the revocation confirmation;
- shared-chat/artifact/uploaded-file management pages;
- memory detail and import flow;
- tool-access options and sandbox domain editor;
- Code appearance selector option inventories;
- session-sharing manager;
- Cowork global-instructions editor;
- Chrome blocked-site form;
- Skill, Connector, and Plugin detail/search/browse/add flows up to the external-action boundary.

## ChatGPT: global shell

### Layout

**Verified-visible.** ChatGPT uses a collapsible sidebar, top banner, and central new-chat workspace. The sidebar exposes a compact rail and an expanded history/navigation panel.

### Expanded sidebar

**Verified-visible.** Observed destinations and controls:

- New chat (`Shift+Command+O`)
- Search (`Command+K`)
- Library
- Scheduled
- Plugins
- More
- Pinned
- Projects
- Organize chats
- New project
- Chats
- per-project home and overflow actions
- per-chat pin and overflow actions
- account/plan row
- Download apps

### New-chat workspace

**Verified-visible.** The top banner contains:

- Model selector, visually labeled ChatGPT
- Temporary chat toggle

The main area contains:

- personalized/new-chat heading;
- Add files and more;
- multiline composer;
- Start dictation;
- Start Voice;
- unlabeled compact action controls requiring visual inspection;
- suggested actions: Create an image, Write or edit, Look something up.

### Pending ChatGPT interactions

Every visible ChatGPT control still requires the post-click interaction pass, including:

- model selector;
- temporary chat;
- Add files and more;
- dictation and voice boundaries;
- suggested actions;
- Search;
- Library;
- Scheduled;
- Plugins;
- More;
- project page, project overflow, organize chats, and new-project form;
- conversation page, message actions, inline tools, citations, artifacts/canvas, share, branching, and overflow;
- account menu and every settings section;
- download apps.

## AGI implementation rule derived from this pass

Do not copy page names without their interaction contracts. Each parity item must include:

1. entry control and accessible name;
2. opened state type: page, modal, drawer, popover, menu, sheet, split pane, or inline expansion;
3. visible fields, tabs, options, icons, counters, states, and keyboard affordances;
4. state owner and persistence scope;
5. backend/API/IPC/tool contract;
6. trust boundary and required approval;
7. loading, empty, error, disabled, offline, cancellation, and recovery states;
8. tests proving the control reaches the real capability.

## Completion ledger

| Product area                   | Baseline visible |                                                                                                           Safe controls opened | Deep states complete | Status      |
| ------------------------------ | ---------------: | -----------------------------------------------------------------------------------------------------------------------------: | -------------------: | ----------- |
| Claude global/Home shell       |              Yes |                                                                                                        Search, Code, Customize |                   No | In progress |
| Claude Code new session        |              Yes | Environment, environment editor, repositories, mode, Add, slash commands, connectors, dictation settings, model, effort, usage |              Partial | In progress |
| Claude Routines                |              Yes |                                                                          Index, create, schedule, API, Behavior, Notifications |              Partial | In progress |
| Claude conversations/tasks     |              Yes |                                                                                                                             No |                   No | Pending     |
| Claude Projects                |              Yes |                                                                                                                             No |                   No | Pending     |
| Claude Artifacts               |              Yes |                                                                                                  Library, filter, new artifact |                   No | In progress |
| Claude Customize/Settings      |              Yes |                                                                                              All 12 section-level destinations |              Partial | In progress |
| ChatGPT shell                  |              Yes |                                                                                                                             No |                   No | Pending     |
| ChatGPT conversations/projects |              Yes |                                                                                                                             No |                   No | Pending     |
| ChatGPT settings/tools/plugins |              Yes |                                                                                                                             No |                   No | Pending     |
