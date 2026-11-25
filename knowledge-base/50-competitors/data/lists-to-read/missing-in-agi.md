---
id: "DOC-50-competitors-data-lists-to-read-missing-in-agi"
type: "comparison-data"
title: "Missing in AGI"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Missing in AGI

Every feature that Claude or ChatGPT offers to subscribers and that our app does not have. Subscription and cloud only;
our Local mode is left out, and anything off by your own decision is not listed. Code read at main 22649ece43
(2026-11-21), leader docs read 2026-11-22. Nothing was run, so re-check a row against current code before acting on it.

★ = both Claude and ChatGPT ship it. "Claude" or "ChatGPT" = that leader ships it; the other was not checked or does not.

| App | Missing | Both leaders ship it |
|---|---|---|
| Web | 471 | 70 |
| Desktop | 162 | 30 |
| Mobile | 230 | 18 |
| CLI | 717 | 48 |
| VS Code | 100 | 16 |
| Chrome | 30 | 5 |
| **All apps** | **1710** | **187** |

19 more rows are at the end: marked Missing, but neither leader clearly ships them (deprecated or unconfirmed).

## Both leaders ship it (fix these first)

### Web (70)
- W1 **Account menu: Get apps and extensions** (Account and sign-in): No Get apps item in the account menu; a /download page exists but is not linked from this menu.
- W2 **Move a personal account into a team (bring what you can or start fresh)** (Account and sign-in): No flow to move personal chats and files into a team workspace or choose start fresh.
- W3 **Rule on reusing the email of a deleted account (30-day wait)** (Account and sign-in): No stated or coded rule on when a deleted account email can sign up again was found in the delete flow, the account pane or the privacy page.
- W4 **Verified access programs for security and life sciences work** (Account and sign-in): No application or verified tier that relaxes cyber or biology safeguards.
- W5 **Verify age with a selfie or government ID to restore access** (Account and sign-in): Age proof is declared age, an on-device check or a platform signal only;
- W18 **Academic researcher and science programs** (Plans, billing and usage): No researcher workspace, grant or discounted science plan exists.
- W19 **Education and Teachers plans** (Plans, billing and usage): No education or teacher plan or education admin defaults.
- W20 **Free plan for verified US K-12 teachers** (Plans, billing and usage): No teacher program or educator verification exists.
- W21 **Monthly API credits bundled with top plans, claimed by linking an API org** (Plans, billing and usage): Paid plans include no monthly developer API credits and there is no organization-linking claim step.
- W22 **Nonprofit discount on team plans** (Plans, billing and usage): No nonprofit verification or discounted team pricing exists.
- W23 **Per-member, group and seat-type monthly spend limits** (Plans, billing and usage): Only one workspace cap and one personal cap exist;
- W24 **Personal plan ends with refund when joining a workspace or domain claim** (Plans, billing and usage): Joining a team does not cancel or refund a personal plan.
- W25 **Request more usage from an admin when capped** (Plans, billing and usage): A blocked member sees the limit but has no in-product button to ask an admin for more.
- W76 **Export or copy a visual as an image, SVG or HTML** (Rendering and content): Diagrams and charts copy only their source;
- W93 **Image results in web search answers** (Search and research): Web answers show cited text sources only;
- W94 **Structured live answers: weather, sports scores, finance** (Search and research): No weather, sports or finance answer cards;
- W102 **Attach ODT, RTF, EPUB and ODS files** (Files, media and creation): The accepted list has PDF, text, code, HTML, JSON, CSV, docx, xlsx, pptx and images only.
- W115 **Collapse sections, rename tabs and navigate a document by outline** (Artifacts and documents): The document editor has a formatting toolbar only;
- W137 **Accessibility conformance report (VPAT or ACR)** (Accessibility and languages): Page states that no VPAT is held.
- W139 **Always-on proactive agent (Duet, dots)** (Agents, tasks and automation): No always-on agent; scheduled tasks and event triggers are the closest.
- W140 **Cloud browser that signs in to sites for Work, with site permissions** (Agents, tasks and automation): Cloud Work has no cloud browser; browser tools exist only for a paired computer.
- W141 **Hand off coding tasks from Slack or Linear triage rules** (Agents, tasks and automation): Slack tasks run Work, not coding sessions, and no Linear triage hand-off exists.
- W142 **Start a coding session from a Slack mention with a repository prompt** (Agents, tasks and automation): The Slack app answers and runs tasks in a channel but cannot start a cloud coding session on a repository.
- W174 **Agent browses on its own cloud browser and keeps working after you leave** (Browser actions): Our agents have no hosted browser; web tasks use search and page reading only.
- W177 **Cached environment setup, maintenance script and Reset cache** (Coding agent): Environments hold a setup script but nothing is cached between sessions and there is no maintenance script or cache reset.
- W178 **Continuous or scheduled security scanning of new commits** (Coding agent): Our security scan runs only when you start it on one session's repository;
- W179 **Editable threat model that steers what a scan flags** (Coding agent): The scan builds no threat model you can read or edit;
- W180 **Named environments with setup script and secret variables** (Coding agent): Saved environments are only a CRUD API and table: apps/web/lib/services/cloud-code-environment-service.ts is imported by nothing but apps/web/app/api/code/environments/route.ts and [environmentId]/route.ts.
- W181 **Reopen an expired cloud session or recover its saved state** (Coding agent): Closing a session destroys its environment and it cannot be reopened;
- W208 **Add a custom connector (remote MCP server)** (Connectors, apps, plugins and skills): Switched off: the Add custom connector wizard is shown only when connectors are released;
- W209 **Company knowledge and search across connected sources** (Connectors, apps, plugins and skills): No workspace-wide search across connected apps;
- W210 **Connect a GitHub Enterprise host** (Connectors, apps, plugins and skills): GitHub sign-in and repository access work against github.com only.
- W211 **Connect Gmail, Google Drive and Google Calendar** (Connectors, apps, plugins and skills): Switched off: connectors are "coming soon";
- W212 **Connect Microsoft 365 apps (Outlook, OneDrive, SharePoint)** (Connectors, apps, plugins and skills): Switched off: the Microsoft Graph connector exists but is not in the released list.
- W213 **Google Workspace add-on (Docs, Sheets, Gmail side panel)** (Connectors, apps, plugins and skills): No Workspace add-on; Google apps are only chat connectors, which are coming soon.
- W214 **Office add-ins for Word, Excel, PowerPoint and Outlook** (Connectors, apps, plugins and skills): No Office add-in.
- W215 **Outlook shared and delegated mailboxes and calendars** (Connectors, apps, plugins and skills): No shared or delegated mailbox support, and the Microsoft connector is switched off.
- W216 **Personal Finance: balances and spending from linked banks** (Connectors, apps, plugins and skills): A read-only Finances page exists but has no sidebar link and its bank connector is switched off.
- W217 **Slack connector in chat: search, summarize and actions** (Connectors, apps, plugins and skills): A Slack MCP endpoint is defined (apps/web/lib/connectors/mcp-endpoints.ts:163-165) but Slack is not released: CONNECTOR_RELEASE_STATE is 'coming_soon' and 'slack' is not in SELECTIVELY_RELEASED_CONNECTOR_IDS (packages/c…
- W218 **Teams meeting transcripts and recording metadata** (Connectors, apps, plugins and skills): No tool reads meeting transcripts.
- W271 **EU DSA point of contact and regional reporting** (Help, feedback and support): No DSA contact page was found.
- W272 **Free courses and learning academy** (Help, feedback and support): No academy or course area exists.
- W273 **Network requirements guide for IT (domains and WebSocket to allow)** (Help, feedback and support): No page tells a company network team which hosts and ports to allow.
- W295 **Cloud browser sign-in data and cookie clearing** (Privacy, security and data): No hosted cloud browser with user cookie management.
- W296 **Cyber trusted access program (Daybreak, Cyber Verification)** (Privacy, security and data): No verified security-researcher access program.
- W297 **Government or FedRAMP version of the product** (Privacy, security and data): No government or FedRAMP deployment.
- W298 **HIPAA support** (Privacy, security and data): Not offered; the privacy and DPA pages say no HIPAA agreement is signed.
- W299 **Location metadata sharing** (Privacy, security and data): No location setting.
- W340 **Live co-editing of docs, pages and sheets** (Sharing and collaboration): One person edits an artifact at a time; no shared live editing, presence or comment threads between editors.
- W341 **Share a project with a group** (Sharing and collaboration): Projects share with the whole workspace as can view or can edit, not with a group.
- W359 **Allowed email domains for joining** (Teams and admin): allowedDomains is accepted by the schema but refused on save;
- W360 **Bulk invite members by list or file** (Teams and admin): Invitations are created one at a time.
- W361 **Code review analytics: PRs reviewed, findings by severity, cost** (Teams and admin): No admin view of pull requests reviewed, findings by severity or review cost.
- W362 **Coding analytics: lines accepted, accept rate, leaderboard, value, CSV** (Teams and admin): No dashboard of accepted lines, suggestion accept rate, PRs with and without the agent, leaderboard or value estimate for Code sessions.
- W363 **Content-access limits inside connectors (Drive shared drives, SharePoint sites, sensitivity labels)** (Teams and admin): Connector policy limits connectors, tools and hosts, not content scope inside a connector.
- W364 **Domain capture and claiming personal accounts** (Teams and admin): No flow lists or claims personal accounts on a verified domain or moves a personal workspace into a managed one.
- W365 **Education plans and campus roles** (Teams and admin): No education plan or preset campus roles;
- W366 **Impact surveys and in-product surveys sent to members** (Teams and admin): No admin survey of members.
- W367 **Invite members in bulk by CSV (email, role, seat type)** (Teams and admin): Invite form takes one address at a time;
- W368 **Members request a connector or app from admins** (Teams and admin): Members cannot request a connector; admins set the allowed list.
- W369 **Members request more usage credits or extra usage when they hit limits** (Teams and admin): A member who hits the workspace cap is told why, but cannot ask an admin for more.
- W370 **Organization surveys with results and CSV** (Teams and admin): No admin surveys or impact surveys shown to members.
- W371 **Require SSO for the workspace (no email sign-in)** (Teams and admin): For an owner this does not exist yet: the Identity page lists 'Requiring SSO' under 'Not yet available' and says a member with a password can still use it (features/workspace-console/components/WorkspaceIdentityPanels.t…
- W372 **Restrict connected accounts to approved or company domains** (Teams and admin): No domain limit on which account a member connects.
- W373 **Restricted access programs for cyber work** (Teams and admin): No program, grant or eligibility flow for cyber access.
- W374 **SCIM sync preview before applying and manual Sync now** (Teams and admin): SCIM is push-based from the identity provider with an activity log;
- W375 **Self-hosted environments and runners for cloud code sessions** (Teams and admin): Cloud environments are ours only; no self-hosted runner.
- W376 **Tenant-wide console across several workspaces** (Teams and admin): Each workspace has its own console; no parent view sets identity, groups or policy across workspaces.
- W377 **Usage or spend limit increase requests from members** (Teams and admin): A member who hits the cap cannot ask an admin for more from the product.
- W378 **Workspace web search on or off for members** (Teams and admin): Workspace features list has no web search switch (research only).

### Desktop (30)
- D13 **Manual conversation compaction on demand** (Conversations and message actions): Long chats are trimmed on the server automatically;
- D23 **LaTeX editing with a compiled PDF preview and Markdown or LaTeX write-ups** (Artifacts and documents): There is no LaTeX source editor or compile step;
- D27 **Computer use on Windows** (Agents, tasks and automation): Computer use is Mac only: off Mac the app says controlling the mouse and keyboard is supported on macOS only.
- D28 **Goal loop: a completion condition the agent keeps working toward** (Agents, tasks and automation): No /goal command or progress row exists;
- D29 **Parallel chunks of work and parallel goals per chat** (Agents, tasks and automation): A chat runs one thing at a time; you can start other chats or tasks, but one request is not split into parallel pieces.
- D30 **Secure sign-in form and saved-card purchases for the agent** (Agents, tasks and automation): The browser agent leaves password and payment fields for you and always asks before purchases;
- D31 **Subagents and built-in helper agents (explorer, worker, planner) with their own context** (Agents, tasks and automation): Cloud chat and tasks have no delegation to subagents with separate context;
- D39 **Browser pane tabs** (Browser actions): One page at a time; no tabs.
- D40 **Choose the built-in browser or the Chrome extension for tasks** (Browser actions): No preferred-browser choice; agent browser work uses the paired Chrome extension only.
- D41 **Mark up the page and send it to the chat; point at an element** (Browser actions): The browser pane cannot capture its page or pick an element;
- D42 **Open a link in the built-in browser by deep link or choose where links open** (Browser actions): Deep links open chats, Code and settings only, and external links always open in your default browser with no choice.
- D43 **The assistant reads, clicks and types in the built-in browser** (Browser actions): Browser work by the agent drives your own Chrome through the paired extension, not the pane;
- D48 **Export findings as JSON, CSV or SARIF** (Coding agent): Findings are viewable on the scan page only;
- D49 **Inline comments on diff lines that feed the next turn** (Coding agent): The cloud session Changes panel has no line comments;
- D50 **Lifecycle hooks: UserPromptSubmit, Stop, SubagentStop** (Coding agent): The public Desktop and Cloud Code expose no hook editor;
- D51 **Security guidance and hardening proposals beside scans** (Coding agent): No in-session security guidance mode and no hardening comparison;
- D52 **Security workbench: scan history, cross-repo findings, compare scans** (Coding agent): Each report is tied to one session; there is no history, filter or comparison across repositories.
- D53 **Subagents with distinct roles and tools** (Coding agent): Cloud Code runs one agent; subagents belong to the CLI.
- D86 **Excel and PowerPoint add-ins** (Connectors, apps, plugins and skills): No Office add-in exists.
- D93 **Computer use works in the background without taking the screen** (Device and OS integration): Input is posted on the shared session, so the agent uses the screen and pauses when you move the mouse.
- D94 **Deep link that starts a new chat with a prefilled prompt** (Device and OS integration): A chat link must name an existing chat; the link parser keeps only a target and an id and drops any query, so no link opens a new chat with text in the box.
- D109 **Admin option to turn off in-app updates and deploy pinned versions** (Install, release and update): The updater always runs on Mac; no managed switch exists and only DMG and ZIP are built for MDM.
- D110 **Get the Windows app from the Microsoft Store or winget** (Install, release and update): No Store listing or winget package; searched for them in the build config and workflows and found none.
- D111 **IT policy pushed to the desktop app (MDM profile, policy refresh, relaunch card)** (Install, release and update): Workspace policy lives in the web console, but the Mac shell reads no managed preferences or device profile.
- D112 **Linux app (.deb, .rpm, apt)** (Install, release and update): No Linux package target exists and the download route returns unavailable for Linux.
- D113 **Published list of network hosts the desktop app needs, for company firewalls** (Install, release and update): No help or download page lists the hosts the app needs or its signing identity for IT allowlists.
- D114 **Windows app (installer, x64 and ARM64)** (Install, release and update): No Windows build is made or offered: the website download route answers 503 for anything but Mac.
- D138 **Admin pushes policy to the desktop app through MDM or a managed file** (Teams and admin): The Electron app reads no MDM, managed file or device policy;
- D139 **Deploy the desktop app on managed Windows devices (Intune, winget, Store)** (Teams and admin): The public Electron app builds only for Mac (dmg and zip);
- D140 **Device management policies (MDM) for the desktop app** (Teams and admin): No MDM keys, managed configuration or enforced login method;

### Mobile (18)
- M1 **Account phone number** (Account and sign-in): The app stores and shows no phone number and does no phone verification.
- M2 **Verify age with a selfie or ID to restore an account or lift teen limits** (Account and sign-in): Age check uses only the phone store age signal;
- M9 **Assistant pays for approved purchases with one-time cards (Link, Shop Pay, Wallet)** (Plans, billing and usage): We have no assistant that pays for purchases for the user.
- M14 **Health destination in the side menu** (Home and navigation): No Health area or health data connection in the app.
- M22 **Strip of recent photos inside the add menu** (Composer and input): The sheet has a Photos card but no strip of recent device photos;
- M56 **Accessibility conformance report or statement** (Accessibility and languages): The app has no accessibility statement link;
- M77 **Cloud browser card in the task with an Open button** (Browser actions): Agent steps show a browser icon in the timeline only;
- M78 **Take control of the cloud browser and hand back** (Browser actions): No take-over or hand-back of an agent browser.
- M80 **Default environment created automatically** (Coding agent): No default environment; the user creates one first.
- M105 **Finances: link bank accounts and ask about money** (Connectors, apps, plugins and skills): Bank linking through Plaid is built but switched off in v1 (FEATURES.bankLinking false), so no Finances view or bank connector is offered.
- M106 **Health Connect data on Android (Claude and ChatGPT)** (Connectors, apps, plugins and skills): No Health Connect or Apple Health access on either platform.
- M141 **Health data from the phone** (Device and OS integration): No HealthKit or Health Connect link.
- M142 **Share device location for local results with a precise toggle** (Device and OS integration): The app requests no location permission and has no location setting.
- M158 **Live store listing** (Install, release and update): AGI Mobile has no live App Store or Google Play listing;
- M159 **Managed app for Microsoft Intune organisations** (Install, release and update): No managed Intune build exists.
- M173 **Clear cloud browser cookies and data** (Privacy, security and data): No cloud browser exists, so no browser data or cookie control.
- M174 **Link bank accounts for finance chats; finance data kept out of memory** (Privacy, security and data): Bank linking is switched off in mobile v1.
- M182 **Project file limits by plan** (Projects and organization): The app shows no per-plan project file count or size limit.

### CLI (48)
- C1 **Admin limits on how and where people sign in** (Account and sign-in): Ours has no managed setting that forces a login method or organisation in the CLI.
- C13 **Wrap-up allowance: the reply in progress finishes when the five-hour limit is hit** (Plans, billing and usage): No grace allowance was found; the limit message names the limit and reset time.
- C53 **Admin allowlist and blocklist of selectable models** (Models and reasoning): The CLI offers whatever the plan allows;
- C54 **Reasoning effort for each subagent** (Models and reasoning): Agent files set model, tools and turn limits but not effort;
- C55 **See the model's reasoning in the terminal (Ctrl+O, thinking summaries)** (Models and reasoning): Reasoning text reaches editor and app-server clients only;
- C56 **Ultra and ultracode: Claude plans a workflow or subagents for substantial tasks** (Models and reasoning): /workflow runs workflows by hand; no setting or effort level makes the agent plan one for each substantial task.
- C151 **Async background hooks** (Coding agent): Hooks are blocking or non-blocking but never wake the agent later.
- C152 **Auto mode pauses after repeated blocked actions** (Coding agent): No count of consecutive denials; only deny-all-remaining for a turn.
- C153 **Connect the GitHub app from the terminal** (Coding agent): /install-github-app only prints the app install link;
- C154 **Custom security guidance and per-edit patterns** (Coding agent): No guidance or patterns file.
- C155 **Dev Container install** (Coding agent): No Dev Container Feature; install is the CLI binary.
- C156 **Reply must match a JSON schema (--json-schema, --output-schema)** (Coding agent): No flag constrains the final answer to a schema or writes it to a file.
- C157 **Turn all hooks off** (Coding agent): No setting turns off user hooks.
- C158 **Validate a finding and generate a verified patch** (Coding agent): No command checks a finding against code or drafts a verified fix patch.
- C159 **Whole-repository vulnerability scan** (Coding agent): /security-review reviews pending changes only;
- C160 **Write your own Auto mode rules and trusted environment** (Coding agent): /auto-mode-setup reviews the mode, but there are no user rule lists, trusted-environment notes or defaults/critique commands.
- C291 **Skill listing context budget** (Connectors, apps, plugins and skills): No cap or setting on how much context the skill list uses.
- C368 **Slash command /ide** (Device and OS integration): Prints a fixed note about AGI Code and a download link;
- C387 **Homebrew install** (Install, release and update): A Homebrew formula script exists but writes to a private tap and is not offered to users.
- C388 **Native Windows installer (PowerShell, CMD or WinGet)** (Install, release and update): The script needs Git Bash, MSYS2, Cygwin or WSL;
- C389 **npm install** (Install, release and update): No npm package; the CLI is published only as release archives and the script.
- C390 **Public page shows the install command** (Install, release and update): The CLI is still marked Coming soon on the site, so /cli and /download do not show the install command although v0.0.1 is published.
- C411 **Choose how the terminal alerts you (bell, iTerm2, Kitty, Ghostty, OSC 9)** (Notifications): The only alert is a terminal bell on or off (ui.bell_on_finish);
- C419 **Compare scans and record false-positive reasons** (Privacy, security and data): No saved scans or findings store.
- C420 **Compliance audit log export** (Privacy, security and data): Org policy defines audit_export but no CLI code writes an audit export.
- C421 **Custom CA bundle and mutual TLS for corporate networks** (Privacy, security and data): No setting for a CA bundle or client certificate;
- C422 **Export findings as JSON, CSV, SARIF or Markdown** (Privacy, security and data): Findings come as text; no structured export.
- C423 **External guardrail integration for prompts** (Privacy, security and data): No hook for an external guardrail service on prompts or traffic.
- C424 **Generate, apply and verify a patch for a finding** (Privacy, security and data): Findings are not turned into verified patches.
- C425 **HIPAA and zero-data-retention configurations** (Privacy, security and data): The CLI has no HIPAA or ZDR mode that locks features for covered accounts.
- C426 **OpenTelemetry export of sessions and tool events** (Privacy, security and data): The CLI has no OpenTelemetry exporter; OTLP variables are only scrubbed from child environments.
- C427 **Sandbox network allowlist by domain** (Privacy, security and data): Sandboxed commands get only deny, external-only or full network;
- C428 **Scan effort levels, exit codes and dry run for CI** (Privacy, security and data): No scan command, so no severity exit codes.
- C429 **Security scan of the whole repo or a focus area with verifier agents** (Privacy, security and data): Only /security-review of changes exists;
- C496 **Alternate screen and scrollback choice** (Settings): Ours TUI always enters the alternate screen;
- C497 **Clickable terminal links** (Settings): Links print as plain text (/links lists and opens them);
- C498 **Custom CA certificates and certificate store choice** (Settings): Ours has no CA bundle setting; it passes SSL_CERT_FILE to child processes only.
- C499 **Rotating spinner tips toggle** (Settings): Ours shows no rotating tips, so there is also no setting to hide them.
- C611 **Admin analytics on CLI use (dashboard, contribution metrics, plugin usage API)** (Teams and admin): Ours /usage and cost summary are personal;
- C612 **Admin lock on login method or organization** (Teams and admin): No managed key restricts how a user may sign in or which organization account is accepted.
- C613 **Admin model allowlist, denylist and org default model** (Teams and admin): An administrator cannot restrict which models a CLI user may pick or set an org default model;
- C614 **Different policy per user group** (Teams and admin): The workspace policy resolves to one effective policy per account;
- C615 **Managed session retention (cleanup period)** (Teams and admin): The CLI keeps local sessions with no retention setting or sweep;
- C616 **Marketplace allowlist and blocklist for plugins** (Teams and admin): Managed plugin policy only requires signed plugins;
- C617 **Restrict allowed API providers** (Teams and admin): Ours org policy has allowed providers but the CLI does not depend on that crate, so nothing enforces it.
- C618 **Restrict selectable models (availableModels, deniedModels)** (Teams and admin): Ours model picker follows plan tiers only;
- C619 **Run models through Amazon Bedrock, Vertex or Foundry** (Teams and admin): No cloud-provider enterprise inference mode in the CLI;
- C620 **Self-hosted SSO gateway for the CLI** (Teams and admin): Ours has no self-hosted gateway or corporate SSO sign-in for the CLI.

### VS Code (16)
- V1 **Company sign-in: identity provider, workspace restriction, automation tokens** (Account and sign-in): The extension and CLI have no company identity provider sign-in, no workspace-only restriction and no member-created automation tokens.
- V14 **Rename sessions and auto-archive inactive ones** (Conversations and message actions): Local sessions cannot be renamed in the editor (only cloud runs) and nothing archives them after a period of inactivity.
- V21 **Show the model reasoning summary** (Models and reasoning): The engine streams reasoning deltas but the editor chat does not display thinking text.
- V22 **Ultra mode: parallel subagents or planned workflows for big tasks** (Models and reasoning): No Ultra or workflow switch in the editor;
- V35 **Approvals judged by a model (auto mode, auto-review)** (Coding agent): No model-judged approval mode.
- V36 **Extra folders the agent may use beyond the workspace** (Coding agent): The CLI has an --add-dir flag but the editor has no way to add a folder to a session and /add-dir is not runnable there.
- V37 **Managed GitHub review service** (Coding agent): No editor-side hosted GitHub review service.
- V38 **Multi-agent security scan with verified findings and a report** (Coding agent): Only a single-pass /security-review of pending changes exists;
- V39 **Other editor integrations: JetBrains and Xcode** (Coding agent): Only VS Code and its forks are supported;
- V60 **Turn off feedback uploads** (Help, feedback and support): No user or admin setting turns the feedback command off.
- V63 **JetBrains and Xcode support** (Install, release and update): VS Code only; no JetBrains or Xcode integration in the repo.
- V66 **Agent writes its own memory notes across sessions** (Memory and personalization): In the editor, memory is saved only on request (Remember this);
- V74 **Auto mode where a model reviews each action** (Settings): The editor Auto mode lets edits through and asks for commands;
- V93 **Admin-forced login method and organisation** (Teams and admin): No managed login policy in the extension.
- V94 **Company configuration server or gateway with corporate sign-in** (Teams and admin): No company gateway or configuration server;
- V95 **OpenTelemetry export of usage and events to your own backend** (Teams and admin): No telemetry export to an organisation's collector;

### Chrome (5)
- X4 **Thumbs up and thumbs down on a reply** (Conversations and message actions): No reply rating; searched: thumb, feedback, rating, ThumbsUp in apps/extension/src.
- X7 **Scroll-to-bottom arrow over a long answer** (Rendering and content): No jump-to-latest button; the panel scrolls itself while streaming; searched: scroll-to-bottom, jump in side_panel.ts.
- X17 **Plugins entry in the + menu** (Connectors, apps, plugins and skills): No plugins menu; searched: plugin in apps/extension/src.
- X20 **Extension is published in the Chrome Web Store and installable** (Install, release and update): Not in the store yet: our own docs say publication was never proven and the site page says coming soon;
- X23 **Admin control over which approval modes members can use and the default** (Teams and admin): The mode is a per-user setting only. Our managed policy and workspace policy carry no field for allowed or default approval modes, so an admin cannot stop Full access.

## Web: all 471 missing

### Account and sign-in (17)
- W1 ★ **Account menu: Get apps and extensions**: No Get apps item in the account menu; a /download page exists but is not linked from this menu.
- W2 ★ **Move a personal account into a team (bring what you can or start fresh)**: No flow to move personal chats and files into a team workspace or choose start fresh.
- W3 ★ **Rule on reusing the email of a deleted account (30-day wait)**: No stated or coded rule on when a deleted account email can sign up again was found in the delete flow, the account pane or the privacy page.
- W4 ★ **Verified access programs for security and life sciences work**: No application or verified tier that relaxes cyber or biology safeguards.
- W5 ★ **Verify age with a selfie or government ID to restore access**: Age proof is declared age, an on-device check or a platform signal only;
- W6 **End a conversation and temporary suspension after repeated endings** [ChatGPT]: No conversation-ending behavior or temporary suspension step.
- W7 **Find and join your organization by work email domain** [Claude]: No discoverable-organization listing or join-by-domain request.
- W8 **Regional social login such as Kakao** [ChatGPT]: Sign-in offers Google, Apple, Microsoft and GitHub, not Kakao.
- W9 **Report a compromised account and have sessions ended** [ChatGPT]: An account-compromise API exists but no screen calls it (dead code).
- W10 **Secure sign in with the assistant account (use it to sign in elsewhere)** [ChatGPT]: No sign-in-with-AGI for other sites.
- W11 **Sign up with a phone number only** [ChatGPT]: Sign-up needs an email or social login; there is no phone-only path.
- W12 **Stay signed in to two accounts and switch** [ChatGPT]: No second-account switcher; only switching between personal and workspace inside one account.
- W13 **Two-step sign-in by push approval** [ChatGPT]: No push-approval second factor.
- W14 **Two-step sign-in by text message or WhatsApp** [ChatGPT]: Security pane says SMS two-step is not available;
- W15 **Use without signing in** [ChatGPT]: Guest chat code exists at /chat (daily message limit) but sits behind the guest.chat flag, which no code enables by default;
- W16 **Username** [ChatGPT]: No username field.
- W17 **Workspace owner switch that allows or blocks staying signed in to two accounts** [ChatGPT]: Signing in to two accounts at once is not built, so there is no admin switch for it.

### Plans, billing and usage (40)
- W18 ★ **Academic researcher and science programs**: No researcher workspace, grant or discounted science plan exists.
- W19 ★ **Education and Teachers plans**: No education or teacher plan or education admin defaults.
- W20 ★ **Free plan for verified US K-12 teachers**: No teacher program or educator verification exists.
- W21 ★ **Monthly API credits bundled with top plans, claimed by linking an API org**: Paid plans include no monthly developer API credits and there is no organization-linking claim step.
- W22 ★ **Nonprofit discount on team plans**: No nonprofit verification or discounted team pricing exists.
- W23 ★ **Per-member, group and seat-type monthly spend limits**: Only one workspace cap and one personal cap exist;
- W24 ★ **Personal plan ends with refund when joining a workspace or domain claim**: Joining a team does not cancel or refund a personal plan.
- W25 ★ **Request more usage from an admin when capped**: A blocked member sees the limit but has no in-product button to ask an admin for more.
- W26 **$500 plan** [ChatGPT]: No plan above $200 for individuals.
- W27 **Admin view of who is blocked or near a limit** [Claude]: Workspace usage analytics lists usage per member but not who is blocked or close to a cap.
- W28 **Always-on agent (dots) with admin-set tiers and pricing** [ChatGPT]: No always-on agent product, tiers or admin control exists.
- W29 **Annual billing for individual plans** [Claude]: Individual plans are monthly only; yearly prices exist only for Team.
- W30 **Apply enterprise commitment to partner software (marketplace)** [ChatGPT]: No commitment-based partner marketplace exists;
- W31 **Buy an Enterprise plan online without sales** [Claude]: Enterprise has no checkout; it starts with a sales conversation.
- W32 **Buy credits for someone else or gift credits** [ChatGPT]: No gifting of credits.
- W33 **Chat-app bot usage billed per channel with spend limits** [Claude]: Our Slack integration has no usage balance or per-channel limits.
- W34 **Coding-agent-only seats billed on credits** [ChatGPT]: Seats cannot be limited to the coding product.
- W35 **Counter of deep research runs left** [ChatGPT]: Research draws on the shared plan usage and only a quota warning header is sent;
- W36 **Discounted prepaid usage bundles** [Claude]: Only plain credit top-ups exist; no discounted prepaid bundles.
- W37 **Education workspace plan for universities** [ChatGPT]: No education plan or university workspace type exists.
- W38 **Free clinician workspace for verified US clinicians** [ChatGPT]: No clinician program or professional verification exists.
- W39 **Free student offers (Plus months, Codex credits)** [ChatGPT]: No student verification or student offer exists.
- W40 **Free year of paid plan for US service members and veterans** [ChatGPT]: No military or veteran offer or ID.me verification exists.
- W41 **Gift a subscription and redeem a gift** [Claude]: No gift purchase or redeem page.
- W42 **Industry plan built on Enterprise (financial services)** [ChatGPT]: No industry-specific plan exists.
- W43 **Let connected apps spend credits after plan limits** [ChatGPT]: No setting lets connected apps spend credits.
- W44 **Linked billing: third-party apps bill your own API org** [Claude]: No way to let outside apps bill a customer account or set a per-app limit.
- W45 **Member Request more button when team budget runs out** [Claude]: No member request flow for more budget or credits.
- W46 **Notice that you are now running on credits after a limit** [Claude]: No message tells the user that a turn is being paid from credits.
- W47 **Partner plugin credit promotions and agentic workspace credits** [ChatGPT]: No partner-plugin credit promotion or promotional workspace credits exist.
- W48 **Per-device and per-card limit on paid accounts** [ChatGPT]: No device or card limit on paid accounts exists.
- W49 **Per-user usage limits with group and individual overrides** [ChatGPT]: Workspace has one monthly spend cap with enforcement and alert threshold;
- W50 **Project cost-code tags for spend tracking** [Claude]: Projects have no cost-code tags.
- W51 **Prompt to verify your payment method at sign-in** [Claude]: No payment-method verification prompt.
- W52 **Redeem a gift card** [ChatGPT]: No gift card redemption (the only access codes are upgrade waitlist codes).
- W53 **Regional payment methods (UPI, Pix, bank debit)** [ChatGPT]: Checkout is cards only.
- W54 **Spend by project or cost-code tags with CSV export** [Claude]: No project cost tags or tagged spend report.
- W55 **Unlimited everyday chat on a base model** [ChatGPT]: Free chat runs on a daily quota and no plan advertises unlimited base-model chat.
- W56 **Use plan allowance inside partner apps** [ChatGPT]: No way to let third-party apps spend a user's included usage.
- W57 **Verified academic researcher workspaces** [ChatGPT]: No academic program or verification flow exists.

### Home and navigation (10)
- W58 **Chat row menu: Move to group** [Claude]: No chat groups. Searched: Move to group, chat group in the sidebar package.
- W59 **Cmd+click a search result opens it in a new tab** [ChatGPT]: Search results are buttons, not links, so a modifier click cannot open a result in a new tab.
- W60 **Dots: persistent assistants that keep working and report back** [ChatGPT]: We have no long-lived assistant with its own notes that runs ongoing responsibilities across apps.
- W61 **Finances dashboard widgets you can reorder or hide** [ChatGPT]: Our Finances page has fixed sections (accounts, categories, months, recent) with no subscriptions, bills, net worth or portfolio widgets and no layout editing.
- W62 **Health tab with connected health data, charts and a health profile** [ChatGPT]: Health only opens a health project in the US;
- W63 **Pets shown in Work chats, with custom sprite upload** [ChatGPT]: No pets or sprite upload exist in settings or chat.
- W64 **Project overview grouped by thread state (Ready for review, Waiting on you, Working)** [Claude]: Project pages list chats but do not group them by working, waiting or ready-for-review state.
- W65 **Sidebar search also finds files in connected Google Drive** [ChatGPT]: Search covers chats, projects, files and documents we hold, but not files in a connected Drive;
- W66 **Sidebar: Design surface pinned above the account row** [Claude]: No Design entry in the rail. Searched: Design in app-nav-items.ts and the sidebar package.
- W67 **Task suggestions under the composer drawn from connected mail** [ChatGPT]: Home only shows a hint to connect an app for new users;

### Composer and input (5)
- W68 **Design editor shortcuts (duplicate, group, flip, zoom, layout guides)** [Claude]: No canvas design editor with object shortcuts exists on web.
- W69 **Docs editor slash menu, @ mentions and emoji insertion** [Claude]: The artifact document editor has a toolbar but no slash block menu, @ mention or emoji picker.
- W70 **Pasted rich text keeps headings, bold, links and lists** [ChatGPT]: The composer takes only plain text from the clipboard, so pasted formatting is dropped.
- W71 **Plus menu: take a screenshot** [Claude]: No screenshot row in the browser plus menu.
- W72 **Use finance data in any chat with /finances or @finances** [ChatGPT]: A finance dashboard and linked banks exist, but no composer token brings that data into a chat.

### Conversations and message actions (3)
- W73 **Comment on a response** [ChatGPT]: No comment on answers. Searched message comment; comments exist only inside artifacts.
- W74 **Is this conversation helpful so far? strip with thumbs** [ChatGPT]: No conversation-level helpfulness strip;
- W75 **Locked chats behind a PIN** [ChatGPT]: No locked chats. Searched locked chat and chat lock.

### Rendering and content (8)
- W76 ★ **Export or copy a visual as an image, SVG or HTML**: Diagrams and charts copy only their source;
- W77 **Inline web images with source attribution** [ChatGPT]: Answers show source cards and generated images but no web images from search.
- W78 **Interactive learning modules for math and science** [ChatGPT]: We have a study page but no manipulable formula modules.
- W79 **Notice when thinking is cut for safety** [Claude]: No such notice exists in the thinking block.
- W80 **Recipe cards with serving changes and cooking mode** [Claude]: No recipe card or cooking mode exists.
- W81 **Table of contents for long chats** [ChatGPT]: Long chats have no contents list.
- W82 **Tappable highlights with a facts side panel** [ChatGPT]: Answers have no tappable entity highlights.
- W83 **Weather visual** [Claude]: No weather visual; weather questions go to web search text.

### Models and reasoning (9)
- W84 **Admin control that sends automatic reasoning to a smaller thinking model** [ChatGPT]: Workspace model policy allows or blocks models and sets defaults;
- W85 **Approval-based specialist models (cyber, law, life sciences)** [ChatGPT]: No approval program or specialist model tier exists.
- W86 **Interactive model and effort recommender** [ChatGPT]: No recommender; the picker only gives one line per model.
- W87 **Model knowledge cutoff dates** [Claude]: No cutoff date is shown in the picker or the models pages.
- W88 **Model selector inside voice mode** [Claude]: Voice mode and voice settings have no model choice.
- W89 **New models stay off until an admin enables them** [ChatGPT]: A new catalog model reaches members at once unless an allow list is set.
- W90 **Show or hide older models** [ChatGPT]: The picker offers current catalog models only and labels retiring ones;
- W91 **Speed tiers beyond fast: Ultrafast** [ChatGPT]: We have a fast mode switch but no faster tier.
- W92 **Ultra effort that delegates to parallel subagents** [ChatGPT]: Our top effort is Max; no mode splits a chat task across subagents automatically.

### Search and research (9)
- W93 ★ **Image results in web search answers**: Web answers show cited text sources only;
- W94 ★ **Structured live answers: weather, sports scores, finance**: No weather, sports or finance answer cards;
- W95 **Healthcare and clinician clinical search** [ChatGPT]: No clinical search workspace or medical-literature mode;
- W96 **Live job search and resume tailoring** [ChatGPT]: No job listings search or resume tailoring flow.
- W97 **Restaurant booking (OpenTable, Resy, Yelp)** [ChatGPT]: No booking. Searched OpenTable, Resy and reservation.
- W98 **Search the web with an uploaded image** [ChatGPT]: No image-based web search or similar-product lookup from an uploaded picture.
- W99 **Search uses your approximate location** [ChatGPT]: No location input to search. Searched geolocation and user location.
- W100 **Shopping research buyer's guides and virtual try-on** [ChatGPT]: Product comparison cards exist but no buyer's guide mode, try-on or saved favourites.
- W101 **Web search served from a stored index instead of live providers (governed search)** [ChatGPT]: Search always calls live search providers;

### Files, media and creation (13)
- W102 ★ **Attach ODT, RTF, EPUB and ODS files**: The accepted list has PDF, text, code, HTML, JSON, CSV, docx, xlsx, pptx and images only.
- W103 **Audio file upload and transcription** [ChatGPT]: Audio is not an attachable type in chat.
- W104 **Box, Dropbox and SharePoint files in the Library** [ChatGPT]: The Library holds uploads and created files only.
- W105 **Comment on a generated image and share its prompt** [ChatGPT]: The image card copies, downloads, shares and edits a region;
- W106 **GIF output from image generation** [ChatGPT]: No GIF output. Searched gif in image options.
- W107 **Image templates (poster, logo) to fill in** [ChatGPT]: No image template picker exists.
- W108 **Images with thinking and sketch input** [ChatGPT]: No reasoning-assisted image mode or sketch input exists.
- W109 **Import Overleaf or LaTeX projects (Prism)** [ChatGPT]: Only code highlighting for LaTeX exists;
- W110 **Meeting recording and notes (ChatGPT Record)** [ChatGPT]: No meeting recording or notes feature exists.
- W111 **Provenance metadata on generated images and a verify page** [ChatGPT]: No provenance metadata or checker was found.
- W112 **Save generated files to Google Drive or OneDrive** [Claude]: Same feature as the row above but marked Same.
- W113 **Video file attachments** [ChatGPT]: Video is not an attachable type; video appears only as input images for video generation.
- W114 **Virtual try-on for shopping listings** [ChatGPT]: No shopping try-on exists.

### Artifacts and documents (22)
- W115 ★ **Collapse sections, rename tabs and navigate a document by outline**: The document editor has a formatting toolbar only;
- W116 **Admin enables each artifact template (Slides, Design, Data, Docs)** [Claude]: Artifact types cannot be switched on or off per workspace.
- W117 **Apps made in chat can call the AI themselves (AI-powered artifacts)** [Claude]: Switched off: AGI_ARTIFACT_AI_ENABLED defaults to 0 until a security review passes, so in-app AI calls answer "not available yet".
- W118 **Ask about or change a selected range of spreadsheet cells** [Claude]: Spreadsheet artifacts are read-only tables with sorting;
- W119 **Certified queries reused across dashboards** [Claude]: No reusable approved queries for dashboards.
- W120 **Convert a document to a deck** [Claude]: A document and a deck are separate artifacts;
- W121 **Design offers 2 or 3 variations, and Claude can save a direction to try another** [Claude]: A design has one result per request; no variation set or saved directions.
- W122 **Fix button on a broken artifact that sends the error to the assistant** [Claude]: A failed artifact shows the error text only;
- W123 **Live co-editing of a Google Doc, Sheet or Slides file beside the chat** [Claude]: A document can be saved to Google Docs or Drive, but the Google file does not open in a pane for co-editing.
- W124 **Motion artifacts exported as MP4** [Claude]: No motion artifact type or MP4 export; video generation is a separate Max 15x tool.
- W125 **Prompt block that readers run to start a chat about the page** [ChatGPT]: No prompt blocks in documents.
- W126 **Run Python in a canvas document or code file** [ChatGPT]: Code in an artifact is shown and edited, and HTML or React previews run, but Python cannot be run in place.
- W127 **Send a document as a Gmail or Outlook draft** [ChatGPT]: No draft button on documents; drafts exist only as a chat connector action and Gmail and Outlook connectors are switched off (coming soon).
- W128 **Several design systems per organization and an admin lock to one** [Claude]: Brand kits are personal libraries; an admin cannot publish or lock one for a workspace.
- W129 **Sites: a token so a script can call a sign-in-protected site** [ChatGPT]: A protected site can only be opened by a signed-in, permitted person;
- W130 **Sites: private tunnels to internal services and deploy an existing local project** [ChatGPT]: Sites are built from chat; no tunnel to private services and no import of an existing project.
- W131 **Sites: schedules that refresh a published site** [ChatGPT]: A schedule cannot update a published site;
- W132 **Sites: usage analytics (visitors and page views)** [ChatGPT]: A published site shows no visitor or page view counts.
- W133 **Slash menu in a page to generate text, a visualization or an image inline** [ChatGPT]: The document editor has no slash insert menu;
- W134 **Slides co-editing by several people** [ChatGPT]: Decks are edited by their owner; there is no shared live editing.
- W135 **Space: interactive pages and decks shared with other Space users** [ChatGPT]: No shared multi-person space of pages and decks;
- W136 **Whiteboard artifacts** [Claude]: No whiteboard artifact type; the artifact types are html, react, svg, mermaid, code, document, spreadsheet, table, csv, presentation, email, chart, image.

### Accessibility and languages (2)
- W137 ★ **Accessibility conformance report (VPAT or ACR)**: Page states that no VPAT is held.
- W138 **Keyboard shortcuts for document, slide and design editors** [Claude]: Our artifacts have no document, slide or design editor with its own shortcut set or F6 area traversal.

### Agents, tasks and automation (35)
- W139 ★ **Always-on proactive agent (Duet, dots)**: No always-on agent; scheduled tasks and event triggers are the closest.
- W140 ★ **Cloud browser that signs in to sites for Work, with site permissions**: Cloud Work has no cloud browser; browser tools exist only for a paired computer.
- W141 ★ **Hand off coding tasks from Slack or Linear triage rules**: Slack tasks run Work, not coding sessions, and no Linear triage hand-off exists.
- W142 ★ **Start a coding session from a Slack mention with a repository prompt**: The Slack app answers and runs tasks in a channel but cannot start a cloud coding session on a repository.
- W143 **Admin permissions to browse, build, share and publish agents** [ChatGPT]: Workspace controls have no switch for building, sharing or publishing agents;
- W144 **Admin website blocklist for agent browsing** [ChatGPT]: Only the agent's owner can block sites for one agent;
- W145 **Agent texts you by iMessage or RCS** [ChatGPT]: No messaging channel from an agent to your phone besides push and email.
- W146 **Ask the assistant inline in a published page** [ChatGPT]: Published sites have no inline assistant.
- W147 **Assistant joins video meetings and takes notes** [Claude]: No meeting join, notes page or auto-join setting.
- W148 **Build an agent by describing it, with a draft plan to review** [ChatGPT]: The agent editor is a form only; no assistant drafts the agent from a description.
- W149 **Business agent and Business Hub for merchants** [ChatGPT]: No merchant tools.
- W150 **Buy products in chat with Instant Checkout and a saved wallet card** [ChatGPT]: No shopping, checkout or wallet; Stripe is for plans only.
- W151 **Clinician skills and starter prompts** [ChatGPT]: No clinician starter prompts or skill pack.
- W152 **College planner for students** [ChatGPT]: Study features exist but no college planning tab.
- W153 **Create an agent from a template** [ChatGPT]: An agent always starts from a blank form.
- W154 **Daily brief from a proactive agent** [Claude]: No daily brief; a scheduled task can be set up by hand.
- W155 **Dot rules: act without asking, act if pre-approved, ask first, hand off** [ChatGPT]: No per-agent autonomy rules beyond account approval modes.
- W156 **Duplicate an agent as a draft copy** [ChatGPT]: An agent can be exported, imported, transferred or deleted, but there is no duplicate action.
- W157 **Office add-ins for Excel and PowerPoint** [Claude]: No Excel or PowerPoint add-in.
- W158 **Parallel subagents inside one task with a read-only activity list** [ChatGPT]: Cloud tasks and Work run as one agent; there is no way to delegate parts to subagents and see their results in the chat.
- W159 **Prism: shared LaTeX writing workspace with an assistant** [ChatGPT]: No LaTeX writing workspace; documents are rich text or Markdown.
- W160 **Projects: one ongoing conversation that starts parallel threads, with suggested threads** [Claude]: Cloud code sessions are separate; there is no parent conversation that proposes and starts threads for you.
- W161 **Quick task shortcut in the sidebar** [Claude]: No separate quick-task entry; a task is started by switching the composer to Work.
- W162 **Rosalind Workbench for sequencing and bioinformatics research** [ChatGPT]: No science workbench or sequencing viewers.
- W163 **Run an agent from any chat by typing @ and its name** [ChatGPT]: An agent opens in its own chat from the Agents page;
- W164 **Run the assistant in CI (GitHub Actions, GitLab)** [Claude]: No published Action or CI template in the web app.
- W165 **Safety monitoring that pauses a task for review** [ChatGPT]: Runs pause only for tool approvals or when the user pauses them;
- W166 **Schedule a task inside an existing chat so results return to that chat** [ChatGPT]: Schedules run on their own and are made from a prompt;
- W167 **Scheduled and standing instructions in Slack** [Claude]: The Slack app only reacts to mentions; it cannot run a standing digest or watch a channel.
- W168 **Scheduled runs can publish an artifact** [Claude]: A scheduled run returns text results only;
- W169 **Self-hosted cloud environments on your own runners** [Claude]: Cloud sessions run only on our managed sandboxes.
- W170 **Take over a dot's cloud browser and hand control back** [ChatGPT]: Take over exists for local Code sessions only;
- W171 **Team tasks: shared recurring tasks run by a workspace with approved tools** [ChatGPT]: Schedules belong to one person; a workspace cannot keep a shared recurring task that teammates edit and run with admin-approved apps.
- W172 **Test an agent in a preview before publishing** [ChatGPT]: The agent editor has no preview or test pane;
- W173 **Weekly finances update task created when a financial account is connected** [ChatGPT]: Connecting a financial account never creates a recurring update task.

### Browser actions (3)
- W174 ★ **Agent browses on its own cloud browser and keeps working after you leave**: Our agents have no hosted browser; web tasks use search and page reading only.
- W175 **Cloud task opens your app in a browser to reproduce and verify a fix** [ChatGPT]: Cloud code sessions run commands only; no browser to start the app and check it.
- W176 **Use ChatGPT or Claude in your own Chrome profile with @Chrome** [ChatGPT]: Web chat cannot hand a task to the browser extension;

### Coding agent (31)
- W177 ★ **Cached environment setup, maintenance script and Reset cache**: Environments hold a setup script but nothing is cached between sessions and there is no maintenance script or cache reset.
- W178 ★ **Continuous or scheduled security scanning of new commits**: Our security scan runs only when you start it on one session's repository;
- W179 ★ **Editable threat model that steers what a scan flags**: The scan builds no threat model you can read or edit;
- W180 ★ **Named environments with setup script and secret variables**: Saved environments are only a CRUD API and table: apps/web/lib/services/cloud-code-environment-service.ts is imported by nothing but apps/web/app/api/code/environments/route.ts and [environmentId]/route.ts.
- W181 ★ **Reopen an expired cloud session or recover its saved state**: Closing a session destroys its environment and it cannot be reopened;
- W182 **Answer the agent's questions in a cloud session** [Claude]: The question card appears only in local sessions;
- W183 **Automatic dependency install for common package managers** [ChatGPT]: Dependencies are installed only by the environment's own setup script.
- W184 **Browse pull requests you wrote or were asked to review, with summary and changes tabs** [ChatGPT]: No list of your pull requests to review;
- W185 **Built-in GitHub tools in cloud sessions (issues, pull requests, comments)** [Claude]: The cloud code agent has file, list and command tools only;
- W186 **Create a draft pull request from the session** [Claude]: The Create pull request button always opens a normal pull request;
- W187 **Dynamic workflows for hours-long engineering jobs with an admin switch** [Claude]: No long-running workflow mode or admin toggle for it in Code.
- W188 **GitLab or Bitbucket repositories** [Claude]: GitHub only.
- W189 **Hooks that run at lifecycle points in cloud sessions** [Claude]: Hooks exist only in the CLI; cloud sessions run no user hooks or session-start installs.
- W190 **Import findings from other scanners (Wiz, Snyk, Endor Labs)** [ChatGPT]: No way to upload or connect another scanner's findings for assessment.
- W191 **Inline comments on a diff** [Claude]: Diffs are read-only; no line comments.
- W192 **Pick more than one repository in a single session** [Claude]: A session attaches one repository and branch.
- W193 **Pre-fill a new session from URL parameters** [Claude]: The Code page reads no prompt, repository or environment query parameters.
- W194 **Private networking from cloud tasks (Tailscale or VPN, TCP services)** [ChatGPT]: Network access is none, trusted hosts or full internet plus extra hosts;
- W195 **Projects that start and track many cloud sessions, with steering of one thread** [Claude]: Chat projects hold files and instructions but cannot start or coordinate cloud coding sessions.
- W196 **Publish and republish an environment, with an Unpublished badge and a Start skill** [ChatGPT]: Says you can edit an environment and new sessions use it.
- W197 **Published egress IP ranges for allowlisting agent traffic** [ChatGPT]: No published address list for the cloud environment's outbound traffic.
- W198 **Repository review rules in AGENTS.md guide reviews** [ChatGPT]: The pull request reviewer does not read repository instruction files;
- W199 **Repository rules file that customizes reviews (REVIEW.md, CLAUDE.md)** [Claude]: The pull request reviewer does not read any repository file for rules, severity changes, skipped paths or extra checks.
- W200 **Review check run with findings table and annotations** [Claude]: Reviews post as a pull request review with line comments;
- W201 **Separate admin permissions to use Code and to manage shared environments** [ChatGPT]: Admins have one Code on or off switch for the workspace;
- W202 **Session link added to commits and pull requests, with a way to turn it off** [Claude]: Commits and pull requests made from a session carry no link back to it.
- W203 **Share environments with the workspace and keep personal secrets in a vault** [ChatGPT]: Environments belong to one user inside a workspace;
- W204 **Short-lived cloud credentials through OIDC for AWS, Azure or Google Cloud** [ChatGPT]: Cloud sessions cannot get provider credentials through OIDC trust.
- W205 **Slash commands for compact, context and clear in cloud sessions** [Claude]: The cloud code composer offers only /review and /security-review: its menu is built from CLOUD_CODE_GOAL_COMMANDS (apps/web/features/code/components/CodeComposer.tsx:1789-1799;
- W206 **Subagents and agent teams inside cloud sessions** [Claude]: Cloud sessions run a single agent with no repository-defined subagents or teams.
- W207 **Submit a review (Comment, Approve, Request changes) from chat** [ChatGPT]: We show whether a pull request is approved or has changes requested, but you cannot draft or post a review verdict from the app.

### Connectors, apps, plugins and skills (58)
- W208 ★ **Add a custom connector (remote MCP server)**: Switched off: the Add custom connector wizard is shown only when connectors are released;
- W209 ★ **Company knowledge and search across connected sources**: No workspace-wide search across connected apps;
- W210 ★ **Connect a GitHub Enterprise host**: GitHub sign-in and repository access work against github.com only.
- W211 ★ **Connect Gmail, Google Drive and Google Calendar**: Switched off: connectors are "coming soon";
- W212 ★ **Connect Microsoft 365 apps (Outlook, OneDrive, SharePoint)**: Switched off: the Microsoft Graph connector exists but is not in the released list.
- W213 ★ **Google Workspace add-on (Docs, Sheets, Gmail side panel)**: No Workspace add-on; Google apps are only chat connectors, which are coming soon.
- W214 ★ **Office add-ins for Word, Excel, PowerPoint and Outlook**: No Office add-in.
- W215 ★ **Outlook shared and delegated mailboxes and calendars**: No shared or delegated mailbox support, and the Microsoft connector is switched off.
- W216 ★ **Personal Finance: balances and spending from linked banks**: A read-only Finances page exists but has no sidebar link and its bank connector is switched off.
- W217 ★ **Slack connector in chat: search, summarize and actions**: A Slack MCP endpoint is defined (apps/web/lib/connectors/mcp-endpoints.ts:163-165) but Slack is not released: CONNECTOR_RELEASE_STATE is 'coming_soon' and 'slack' is not in SELECTIVELY_RELEASED_CONNECTOR_IDS (packages/c…
- W218 ★ **Teams meeting transcripts and recording metadata**: No tool reads meeting transcripts.
- W219 **Admin app templates for GitHub Enterprise, Snowflake or Databricks with guided setup** [ChatGPT]: No guided templates for publishing workspace-specific apps.
- W220 **Always-on personal agent in Slack that follows channels** [ChatGPT]: The Slack assistant answers mentions and tasks;
- W221 **Assign an issue to the agent from Linear** [ChatGPT]: Linear is only a connector; no assigning or mentioning the agent in an issue starts a run.
- W222 **Browse Google Drive, Box, Dropbox or SharePoint inside Library** [ChatGPT]: Library shows only files saved in the app;
- W223 **Canvas LMS integration through LTI for education** [Claude]: No LTI integration for Canvas courses or assignments.
- W224 **Chat with the assistant on WhatsApp without an account** [ChatGPT]: No WhatsApp chat channel; WhatsApp exists only as a connector for sending messages.
- W225 **Choose which connectors a scheduled task may use** [Claude]: The form keeps a connector list (apps/web/features/schedules/components/ScheduleForm.tsx:734), but while connectors are unreleased it shows 'Connectors for scheduled runs are coming soon.' (ScheduleAccessFields.tsx:134-…
- W226 **Connect a Microsoft account as a guest of another tenant** [ChatGPT]: No tenant ID or guest option exists; the Microsoft 365 connector itself is switched off.
- W227 **Connect a personal Microsoft account (Outlook.com, OneDrive)** [Claude]: Only the work Microsoft 365 connector is catalogued and it is switched off;
- W228 **Connect apps and custom connectors to an artifact** [Claude]: An artifact that binds connectors is refused at run time while connectors are unreleased: artifact-completion returns 403 connectors_coming_soon when connectors.length > 0 and connectorsReleased() is false (apps/web/app…
- W229 **Connect Box or Dropbox to search files in chat** [ChatGPT]: Switched off: Box and Dropbox are in the connector catalog but not among the 13 released connectors, so they show as coming soon.
- W230 **Connect GitLab to read and change projects, merge requests and pipelines** [ChatGPT]: GitLab is in the connector catalog but is not in the released list, so Connect is off.
- W231 **Connect iCloud Mail and Calendar with an app-specific password** [ChatGPT]: No iCloud connector or app-specific-password sign-in exists.
- W232 **Credit score and report from Experian** [ChatGPT]: Linked banks are covered elsewhere; no credit report connection.
- W233 **Custom connector sign-in choices (always, on demand, none) and client registration** [Claude]: Switched off with the wizard; the form has a bearer token and OAuth client fields, not the three-way sign-in or registration choice.
- W234 **Data warehouse connectors (Snowflake, Databricks, BigQuery, Genie)** [ChatGPT]: Snowflake, BigQuery and Databricks are in the catalog but not in the released list, so Connect is off.
- W235 **Developer mode for building and testing custom connectors** [ChatGPT]: No developer mode; custom connectors are added by URL and workspace admins publish servers.
- W236 **Edit a skill's files with the assistant beside the chat** [Claude]: The skill editor is a plain form; no assistant edits a skill's files.
- W237 **Financial services plugin with built-in market data** [ChatGPT]: No built-in financial data sources or finance onboarding.
- W238 **Google Meet meeting assistant** [Claude]: No meeting assistant.
- W239 **Healthcare plugins (clinical references, records, public data, prescribing)** [ChatGPT]: A lab-results skill and Health records exist;
- W240 **Host your own MCP server as a plugin from a site** [ChatGPT]: Sites are published pages with viewers and data;
- W241 **Microsoft Teams: ask the assistant from Teams** [ChatGPT]: No Teams app or bot.
- W242 **OneNote notes: find, summarize, create and update** [ChatGPT]: No OneNote connector or tool.
- W243 **Open and pin an interactive connector from navigation** [Claude]: There is no connector page to open or pin;
- W244 **Partner skills paired with partner connectors** [Claude]: The skills catalog holds bundled and community skills;
- W245 **Per-account permission override with reset to Default** [ChatGPT]: Tool permissions are saved per user, connector and tool, not per connected account.
- W246 **Plugin extensions: side panels, file viewers and forms beside the chat** [ChatGPT]: Plugins cannot add interface surfaces next to the chat.
- W247 **Reach private-network MCP servers through a secure tunnel** [ChatGPT]: Custom connectors must be public HTTPS servers;
- W248 **Salesforce plugin with sales skills** [Claude]: Sales skills ship (pipeline-review, deal-review, prospecting) but Salesforce is not a released connector.
- W249 **Security findings API, webhooks and connector for scans** [Claude]: Security scans run in the app; no findings API, webhooks or connector.
- W250 **Shop for products from merchant catalogs in chat** [ChatGPT]: No shopping results or merchant checkout in chat;
- W251 **Sign in with ChatGPT for partner apps and plan sharing** [ChatGPT]: We are not an identity provider; partner apps cannot sign people in with our account.
- W252 **Sites on your own domain** [ChatGPT]: A site lives at its link only; no custom domain setup.
- W253 **Sites that reach private internal services through tunnels** [ChatGPT]: Sites cannot reach private networks.
- W254 **Sites that use each visitor's connected apps, tunnels and Sign in with ChatGPT** [ChatGPT]: Site settings and data tabs have no connected-app, tunnel or visitor sign-in option.
- W255 **Sites use each visitor's own connected accounts through plugins** [ChatGPT]: Sites keep their own data per visitor but call no plugins or connectors on the visitor's behalf.
- W256 **Snowflake app through a Snowflake-managed MCP server** [ChatGPT]: Snowflake only has a logo; there is no Snowflake connector entry or setup.
- W257 **Suggestion cards offering a plugin for the current task** [Claude]: Only a new-chat connector suggestion strip and cards for plugins the assistant drafts exist;
- W258 **Sync a GitHub repository into a project** [Claude]: Projects take uploads and Google Drive files only;
- W259 **Sync a plugin marketplace from GitLab** [Claude]: Plugin marketplaces accept GitHub repository URLs only.
- W260 **Synced connectors that index Notion, Linear, SharePoint and similar content** [ChatGPT]: Connectors are called live per request; nothing builds a searchable index of connected app content.
- W261 **Trade through a plugin with per-trade confirmation** [ChatGPT]: No plugin submits trades.
- W262 **Wallet: the agent buys things with biometric approval** [ChatGPT]: No wallet or purchasing agent.
- W263 **Watch the skills intro video** [Claude]: No intro video entry in the skills Add menu.
- W264 **Workspace connections: admins authorize shared app accounts once** [ChatGPT]: Admins can approve connectors and plugins, but there is no shared workspace account that members use.
- W265 **Zendesk and OneNote plugins** [ChatGPT]: No Zendesk or OneNote connector or plugin exists beyond logos.

### Cross-device continuity (2)
- W266 **Slash commands (/compact, /clear, /context, /usage, /recap) from web and mobile coding sessions** [Claude]: The web coding composer has no such slash commands.
- W267 **Switch between two accounts on one device** [ChatGPT]: No account switcher on web; sign out and in again.

### Device and OS integration (3)
- W268 **Admin permission to use image generation** [ChatGPT]: The workspace feature list has no image generation switch.
- W269 **ChatGPT inside WhatsApp, Kakao and Viber** [ChatGPT]: No messaging-app channel exists.
- W270 **Device location sharing with a separate precise-location switch** [ChatGPT]: No location sharing setting or location request exists.

### Help, feedback and support (7)
- W271 ★ **EU DSA point of contact and regional reporting**: No DSA contact page was found.
- W272 ★ **Free courses and learning academy**: No academy or course area exists.
- W273 ★ **Network requirements guide for IT (domains and WebSocket to allow)**: No page tells a company network team which hosts and ports to allow.
- W274 **Capacity constraint message that is not an outage** [Claude]: No distinct high-demand message was found.
- W275 **Enterprise owners designate who reaches human support** [Claude]: Our support handoff has no workspace setting that decides which members can reach a person.
- W276 **List of official channels, email domains and apps to spot fakes** [ChatGPT]: No page lists our genuine sender domains, accounts or apps.
- W277 **Phone support line** [ChatGPT]: No phone line.

### Memory and personalization (11)
- W278 **Chats that draw on your saved Library files automatically, with an admin switch** [ChatGPT]: A Library file is used only when you attach it with Add from library;
- W279 **Don't mention this again and mark a memory source not relevant** [ChatGPT]: A memory can be deleted but not muted, and there is no mark as not relevant action.
- W280 **Financial memories: goals, loans and assets** [ChatGPT]: No finance-specific memory type exists next to Finances.
- W281 **Memory capacity by plan and automatic clean-up of stale memories** [ChatGPT]: Saved facts have no stated capacity by plan and nothing prunes or merges stale facts;
- W282 **Memory remembers details from connected apps and sharpens web searches** [ChatGPT]: Memory is built from chats only; connected app data and memory do not shape search queries.
- W283 **Organization instructions that apply to every member** [Claude]: Workspaces have no shared instruction text applied to all members chats.
- W284 **Reference my writing style and record history** [ChatGPT]: No writing-style capture or record-history setting.
- W285 **Restore earlier versions of memory and prioritize items** [ChatGPT]: Memory items can be edited and deleted but there is no version history or restore.
- W286 **Saved reference photos reused with @name** [ChatGPT]: No saved reference photos or @name mention exist for images.
- W287 **Study mode uses memory for goals and style** [ChatGPT]: Study sessions do not load memory.
- W288 **Workspace owner turns memory off for all members** [ChatGPT]: Workspace feature switches do not include memory, so an admin cannot disable it workspace-wide.

### Notifications (6)
- W289 **Banner offering to notify when a reply finishes** [Claude]: No banner above the composer offering notification.
- W290 **Dispatch message notifications** [Claude]: No notification category for dispatch messages on web.
- W291 **Marketing and personalized tips notifications** [ChatGPT]: No tips or marketing category; marketing consent is under Privacy.
- W292 **Proactive messages about stalled work or decisions** [Claude]: Notifications cover finished replies and tasks, not nudges about stalled work.
- W293 **SMS as a notification channel** [ChatGPT]: Notification settings offer push and email only.
- W294 **Trusted contact notified about a serious safety concern** [ChatGPT]: No trusted contact setting exists.

### Privacy, security and data (15)
- W295 ★ **Cloud browser sign-in data and cookie clearing**: No hosted cloud browser with user cookie management.
- W296 ★ **Cyber trusted access program (Daybreak, Cyber Verification)**: No verified security-researcher access program.
- W297 ★ **Government or FedRAMP version of the product**: No government or FedRAMP deployment.
- W298 ★ **HIPAA support**: Not offered; the privacy and DPA pages say no HIPAA agreement is signed.
- W299 ★ **Location metadata sharing**: No location setting.
- W300 **Account PIN and locked chats** [ChatGPT]: No locked chats or account PIN.
- W301 **Approval prompt before opening generated links** [ChatGPT]: Links in replies open without a leaving-the-app approval;
- W302 **Claude Meetings: transcript, summary and notes** [Claude]: We have no meeting recording, transcript or notes feature on the web.
- W303 **Contacts upload to find people on the service** [ChatGPT]: No contact upload or friend finding.
- W304 **External guardrail service that scans prompts (block or alert)** [ChatGPT]: No way to connect a third-party scanning service to prompts.
- W305 **Locked chats behind a PIN or device check** [ChatGPT]: We have no way to lock a chat behind a PIN or device check;
- W306 **Matching uploaded images against known child-abuse image hashes, with reporting** [Claude]: Only a text classifier looks for such requests;
- W307 **Natural-language action limits for agents** [ChatGPT]: Agents have tool permissions but no plain-language constraint that generates a reviewed rule.
- W308 **Trusted contact** [ChatGPT]: Security shows a static Not configured notice;
- W309 **Your feedback record** [Claude]: No list of feedback you sent.

### Projects and organization (6)
- W310 **Archive every chat in a project at once** [ChatGPT]: Chats are archived one at a time or all chats in the account from Settings;
- W311 **Claude Code Projects: one coordinating conversation with parallel cloud threads** [Claude]: Cloud code sessions are separate; no conversation coordinates several sessions or can be paused as a project.
- W312 **Library favorites for products and places, with folders** [ChatGPT]: The Library has folders for files but no bookmarking of products or places from answers.
- W313 **Project tags** [Claude]: Projects have no tags.
- W314 **Sidebar groups for chats (Move to group)** [Claude]: No custom chat groups; chats are organized by project, pin and archive.
- W315 **Spaces for pages, files and sharing** [ChatGPT]: We have Projects and a Library but no spaces with folders and pages.

### Settings (24)
- W316 **Age category shown in Account settings** [ChatGPT]: The 18-and-over decision is held on the server and not shown in Account settings.
- W317 **Capabilities: AI-powered artifacts switch** [Claude]: No separate switch for AI-powered artifacts.
- W318 **Capabilities: connector search switch** [Claude]: No connector search toggle.
- W319 **Capabilities: network egress switch and domain allowlist** [Claude]: Sandbox reaches only GitHub, npm and PyPI;
- W320 **Capabilities: switch models when a message is flagged** [Claude]: No toggle to switch model when a message is flagged.
- W321 **Claude Code settings pane** [Claude]: No Code pane in web settings; the nav lists Skills, Connectors and Plugins under Customize only.
- W322 **Claude in Chrome settings pane** [Claude]: Browser pairing renders nothing in a normal browser tab;
- W323 **Cloud browser settings (default permission, site list, cookies)** [ChatGPT]: No cloud browser permission or cookie settings in web settings.
- W324 **Cowork settings pane** [Claude]: No Cowork pane on web; remote control and browser pairing show only inside the desktop host.
- W325 **Design systems management in settings** [Claude]: No design systems store to apply to generated designs.
- W326 **Developer mode and Enforce CSP switches** [ChatGPT]: No developer mode switch in web settings.
- W327 **Dot agent: custom rules, look and handle, Wallet cards** [ChatGPT]: No personal dot agent, so no dot rules, appearance or wallet cards.
- W328 **Fast answers switch** [ChatGPT]: No fast answers toggle; reasoning effort is chosen per message and as a default.
- W329 **Hosted site custom domain** [ChatGPT]: Published sites keep an AGI address that can be renamed;
- W330 **Information shared with apps (partner permissions)** [ChatGPT]: No review screen for what was shared with partner apps;
- W331 **Per-app weekly usage limits and connected-app usage** [ChatGPT]: Usage shows plan use only; no cap per connected app.
- W332 **Pet companion** [ChatGPT]: No pet setting.
- W333 **Reference my writing style / record history** [ChatGPT]: No writing style or record history reference.
- W334 **Reset ChatGPT Work and Work network access** [ChatGPT]: No Work reset or Work network access control in settings.
- W335 **Sharing settings for cloud code sessions: require repository access, hide your name** [Claude]: No such switches for shared code sessions.
- W336 **Shortcut to open Settings (Shift+Cmd+comma)** [Claude]: No keyboard shortcut opens Settings.
- W337 **Simple layout and visuals setting** [ChatGPT]: No setting to reduce rich cards and visuals in answers;
- W338 **Site environment variables and secrets** [ChatGPT]: Site settings have name, sharing, versions, URL and unpublish;
- W339 **Trusted Contact for adults** [ChatGPT]: No trusted contact; Security says conversations are not monitored to notify anyone.

### Sharing and collaboration (19)
- W340 ★ **Live co-editing of docs, pages and sheets**: One person edits an artifact at a time; no shared live editing, presence or comment threads between editors.
- W341 ★ **Share a project with a group**: Projects share with the whole workspace as can view or can edit, not with a group.
- W342 **Branch a teammate's chat in a shared project** [ChatGPT]: Project members see shared files and instructions, chats stay private;
- W343 **College Planner with read-only plan link** [ChatGPT]: No college planning space.
- W344 **Embed code for a published artifact** [Claude]: Published pages give a link only; no embed snippet.
- W345 **Give a teammate edit access to an agent, share it with a group, and handle two people editing** [ChatGPT]: An agent has one owner who sets who can use it;
- W346 **Leave a shared project and keep a copy** [ChatGPT]: No leave-and-copy step for shared projects.
- W347 **Live whiteboard with follow mode** [Claude]: No whiteboard artifact or live multi-person canvas.
- W348 **Locked chats keep their link but stop adding messages** [ChatGPT]: No way to lock a chat.
- W349 **Plugin publish review (request changes, approve)** [Claude]: Plugins publish straight to the workspace;
- W350 **Share a chat with specific people (view-only, invites expire in 30 days)** [Claude]: Chats can be public or workspace-wide only;
- W351 **Share a project by link to anyone invited, outside a workspace** [ChatGPT]: Project access is limited to workspace members and invited workspace people.
- W352 **Share Library files with Viewer or Editor roles** [ChatGPT]: Files cannot be shared from Library; only artifacts, sites, projects and agents share.
- W353 **Share templates as plugin or ZIP** [ChatGPT]: No shareable template object.
- W354 **Shareable profile with activity stats and Sites showcase** [ChatGPT]: No public or workspace profile page.
- W355 **Site co-editing and editor role** [ChatGPT]: Sites are owner-only; invited people are view-only.
- W356 **Sites: transfer ownership of a site to another person** [ChatGPT]: A site stays with its publisher; ownership transfer exists only for workspaces.
- W357 **Smart reports shared with chosen members** [Claude]: No smart reports.
- W358 **Teams inside a workspace to share pages, spaces and tasks** [ChatGPT]: Groups and roles exist; no team object to share items with.

### Teams and admin (108)
- W359 ★ **Allowed email domains for joining**: allowedDomains is accepted by the schema but refused on save;
- W360 ★ **Bulk invite members by list or file**: Invitations are created one at a time.
- W361 ★ **Code review analytics: PRs reviewed, findings by severity, cost**: No admin view of pull requests reviewed, findings by severity or review cost.
- W362 ★ **Coding analytics: lines accepted, accept rate, leaderboard, value, CSV**: No dashboard of accepted lines, suggestion accept rate, PRs with and without the agent, leaderboard or value estimate for Code sessions.
- W363 ★ **Content-access limits inside connectors (Drive shared drives, SharePoint sites, sensitivity labels)**: Connector policy limits connectors, tools and hosts, not content scope inside a connector.
- W364 ★ **Domain capture and claiming personal accounts**: No flow lists or claims personal accounts on a verified domain or moves a personal workspace into a managed one.
- W365 ★ **Education plans and campus roles**: No education plan or preset campus roles;
- W366 ★ **Impact surveys and in-product surveys sent to members**: No admin survey of members.
- W367 ★ **Invite members in bulk by CSV (email, role, seat type)**: Invite form takes one address at a time;
- W368 ★ **Members request a connector or app from admins**: Members cannot request a connector; admins set the allowed list.
- W369 ★ **Members request more usage credits or extra usage when they hit limits**: A member who hits the workspace cap is told why, but cannot ask an admin for more.
- W370 ★ **Organization surveys with results and CSV**: No admin surveys or impact surveys shown to members.
- W371 ★ **Require SSO for the workspace (no email sign-in)**: For an owner this does not exist yet: the Identity page lists 'Requiring SSO' under 'Not yet available' and says a member with a password can still use it (features/workspace-console/components/WorkspaceIdentityPanels.t…
- W372 ★ **Restrict connected accounts to approved or company domains**: No domain limit on which account a member connects.
- W373 ★ **Restricted access programs for cyber work**: No program, grant or eligibility flow for cyber access.
- W374 ★ **SCIM sync preview before applying and manual Sync now**: SCIM is push-based from the identity provider with an activity log;
- W375 ★ **Self-hosted environments and runners for cloud code sessions**: Cloud environments are ours only; no self-hosted runner.
- W376 ★ **Tenant-wide console across several workspaces**: Each workspace has its own console; no parent view sets identity, groups or policy across workspaces.
- W377 ★ **Usage or spend limit increase requests from members**: A member who hits the cap cannot ask an admin for more from the product.
- W378 ★ **Workspace web search on or off for members**: Workspace features list has no web search switch (research only).
- W379 **1Password for Claude enablement** [Claude]: No password manager integration or toggle.
- W380 **Admin analytics by synced group** [ChatGPT]: Usage analytics have no group filter.
- W381 **Admin change of a member's email** [ChatGPT]: Members change their own email; admins cannot.
- W382 **Admin control of who can create and share agents or GPTs** [ChatGPT]: No workspace rule on who may create or publish agents.
- W383 **Admin conversational plugin for roles and access review** [ChatGPT]: The console is forms only; no assistant that explains access or assigns roles.
- W384 **Admin dots inventory, pause and delete** [ChatGPT]: No personal dot agent to manage.
- W385 **Admin in-product surveys** [Claude]: No survey tool.
- W386 **Admin Insights: use cases and tasks** [ChatGPT]: Usage analytics group by model and provider, not by use case.
- W387 **Admin limit on plan use by other apps** [ChatGPT]: No allowance shared with external apps.
- W388 **Admin setting for who can see member profiles** [ChatGPT]: There are no member profiles to share or hide.
- W389 **Admin switch to disable referral promotions** [ChatGPT]: Referrals are a per-account setting; no workspace switch.
- W390 **Agent in Microsoft Teams chats** [Claude]: No Microsoft Teams app.
- W391 **Agentic work and estimated time saved metrics** [Claude]: No workspace metric estimates time saved or how agentic work is.
- W392 **Alert webhooks for safety or misalignment events** [ChatGPT]: Audit streaming forwards audit events; no safety alert webhook.
- W393 **Allow external domain invites** [ChatGPT]: No workspace rule on invite domains.
- W394 **Allowed email domains for joining the workspace** [Claude]: The organization route accepts an allowedDomains setting but rejects the whole settings patch as unsupported, so no domain list limits invites or joins.
- W395 **Analytics chat: ask plain-language questions about org usage** [Claude]: No assistant answers admin questions about workspace usage;
- W396 **App action policy: read, write and new actions** [ChatGPT]: No workspace read or write action setting or guided templates;
- W397 **Artifact presence: see who has an artifact open** [Claude]: No live presence on artifacts and so no admin toggle.
- W398 **Artifacts admin master toggle and per-type defaults** [Claude]: Workspace features list has only a connected-apps-in-artifacts switch;
- W399 **Ask Your Org toggle** [Claude]: No organization-wide ask feature.
- W400 **Auto-approve mode org controls** [Claude]: No workspace switch for the automatic-approval mode.
- W401 **Bulk plugin availability up to 25 at once** [ChatGPT]: Plugin state is set one plugin at a time.
- W402 **Claude Meetings and Cowork cloud enablement per role** [Claude]: No meetings product; Work features switch exists but no meeting or guest control.
- W403 **Company branding on the agent home screen** [Claude]: No organization branding on the Work home screen.
- W404 **Computer use app block list or allow list** [Claude]: The switch is all or nothing; no list of permitted or blocked apps.
- W405 **Cost-code tags on projects for spend tracking** [Claude]: Usage is not tagged by project cost code.
- W406 **Disable sharing of chats that use connectors** [Claude]: No such switch; sharing rules do not look at whether a chat used connectors.
- W407 **Distribute plugins by syncing a GitHub or GitLab marketplace** [Claude]: Admins pick from plugins already in our catalog;
- W408 **Domain memberships export** [Claude]: No list of accounts on a verified domain.
- W409 **Dynamic groups built from directory attributes** [ChatGPT]: Group membership is manual or SCIM-pushed;
- W410 **Education admin: require study mode** [ChatGPT]: Study mode exists, but an admin cannot require it.
- W411 **Export member list as CSV** [Claude]: No member list export; only usage and audit exports exist.
- W412 **Export public plugin catalog as CSV** [ChatGPT]: No plugin catalog export.
- W413 **External access policies for Sign in with ChatGPT and Sites** [ChatGPT]: No admin policy for apps signing in with our account or sites using members' connections.
- W414 **Feedback (thumbs) to provider on or off for the org** [Claude]: Product analytics switch exists; no thumbs feedback control.
- W415 **Feedback thumbs switch for the organization** [Claude]: No workspace switch for feedback controls.
- W416 **Financial Services workspace setup** [ChatGPT]: No admin enablement of a finance workspace.
- W417 **Free workspaces for verified researchers and clinicians** [ChatGPT]: No verified-professional program.
- W418 **Group visibility settings (who can find, share with, see members)** [ChatGPT]: Groups have no visibility toggles.
- W419 **Industry benchmarks in admin analytics** [ChatGPT]: No benchmark comparisons in workspace analytics.
- W420 **Inference hooks that screen model requests** [Claude]: No admin-defined hook can inspect or block model requests;
- W421 **Inference hooks: org server allows or denies each prompt and tool call** [Claude]: No customer-hosted pre-check endpoint.
- W422 **Join approval mode: automatic or admin approval** [Claude]: No join-request queue; people join only through an invitation an admin sends. Setting fields for it are rejected as not available yet.
- W423 **K-12 educators and district setup** [Claude]: No K-12 district setup. Ours is 18 and over everywhere.
- W424 **List employees with personal accounts on the company domain and invite them** [ChatGPT]: No view of personal accounts on the verified domain, and no required merge.
- W425 **Manage admin policy by API or Terraform** [ChatGPT]: Policy is changed in the console; no policy API for admin keys or Terraform provider was found.
- W426 **Maps and image search toggles for organizations** [Claude]: No workspace toggles for maps or image search.
- W427 **Member requests a Premium seat; owner approves** [ChatGPT]: Seat changes are made only by an admin; members have no request button.
- W428 **Members blocked by a spend limit view** [Claude]: Admins cannot see who is blocked or near a limit.
- W429 **Members can invite teammates (member-to-member invites)** [Claude]: Only owners and admins invite; the allowMemberInvites setting is refused as not available yet.
- W430 **Merge or move personal workspace data into the company workspace** [ChatGPT]: No path to copy personal chats, projects or memory into a shared workspace.
- W431 **Migration window when moving a workspace to Enterprise** [Claude]: No self-service migration claim.
- W432 **Network allowlist for server-side requests from hosted sites** [ChatGPT]: No workspace allowlist for what a hosted site may call.
- W433 **No seat assigned: park a member without removing** [ChatGPT]: Seat type is Standard or Premium only; no unassigned state that keeps the member but removes access.
- W434 **Office agent telemetry sent to the org's OpenTelemetry collector** [Claude]: No customer telemetry export; audit streaming only.
- W435 **OpenTelemetry stream of agent events** [Claude]: Audit streaming sends administrative events;
- W436 **Org design systems shared with everyone** [Claude]: No workspace design system object.
- W437 **Org-authorized connectors for all members and Entra consent** [Claude]: Each member connects their own account; there is no one-time organization authorization or tenant consent step.
- W438 **Org-shared cloud environments with default** [Claude]: Only a draft migration for saved cloud environments exists, marked not applied, with no route or screen using it.
- W439 **Org-shared cloud environments, status message, retry and revoke token** [Claude]: Environments are per user; no org-shared environment or admin session actions.
- W440 **Organization AI policy shown to members periodically** [ChatGPT]: No workspace policy notice shown to members.
- W441 **Organization discovery: coworkers find and join at signup** [Claude]: No signup-time lookup of a company workspace by email domain.
- W442 **Organization instructions applied to every conversation** [Claude]: No workspace-wide instructions field.
- W443 **Organization-wide invite link (generate, disable, regenerate, 90-day expiry)** [Claude]: Only per-email invitations exist (private link, 7 days);
- W444 **Parent and child organizations (merge organizations, parent roles and groups)** [Claude]: One flat workspace; no parent or child hierarchy.
- W445 **Per-agent spend cap for the Slack agent** [ChatGPT]: One workspace spend limit exists; no Slack-agent limit.
- W446 **Per-member SSO exemption for external members** [ChatGPT]: No per-member exemption; SSO routing is by email domain only.
- W447 **Pull request review level: Quick, Standard, Deep** [Claude]: One review depth is used for every pull request.
- W448 **Ranked group configurations** [Claude]: Exceptions can only narrow and combine; no ranking exists.
- W449 **Request access to a Business workspace; owner approves** [ChatGPT]: No access-request flow; an admin must invite the person.
- W450 **Restrict organization creation on verified domains** [Claude]: Domain verification exists for SSO only;
- W451 **Restrict sign-in to people in the SCIM directory** [Claude]: Directory sync provisions users but sign-in is not limited to the directory list.
- W452 **Review rules file read from the default branch** [Claude]: Reviews take no repository rules file to tune what they flag.
- W453 **Science and Data products admin toggles** [Claude]: No Science or certified-query product exists to toggle.
- W454 **Self-hosted runners and environments for cloud sessions** [Claude]: Sessions run only on our cloud; no self-hosted environment, runner, key or toggle exists.
- W455 **Several identity providers per organization or domain; hide a provider at sign-in** [Claude]: One SSO connection per domain (second is refused);
- W456 **Slack agent as org-shared identity with admin pairing and spend limit** [Claude]: Slack links each person's own account; no shared organization identity, pairing code or Slack spend limit.
- W457 **Slack direct messages disable** [Claude]: No organization switch for Slack direct messages.
- W458 **Smart reports: AI analysis of team usage** [Claude]: No AI-written report of how the team uses the product.
- W459 **Spend by project tags or cost centers** [Claude]: Spend cannot be split by project tag or cost center.
- W460 **Split domains: several identity providers for one domain** [Claude]: A verified domain maps to one SSO connection;
- W461 **SSO exemptions for external members** [ChatGPT]: No per-member exemption from required SSO.
- W462 **Task insights: task categories and topics heat map** [ChatGPT]: Usage analytics count activity but do not classify what the work was about.
- W463 **Tenant restrictions via network proxy header** [Claude]: No tenant restriction header support.
- W464 **Voice mode admin disable** [Claude]: Workspace features list has no voice switch.
- W465 **Workspace cap on access token lifetime** [ChatGPT]: The expiry is chosen per key; no workspace maximum.
- W466 **Workspace discovery and auto-join for company email** [ChatGPT]: Verified domains exist but no discover-and-request-to-join flow.

### Voice (5)
- W467 **Admin switch for voice and for screen sharing in voice** [ChatGPT]: Workspace feature switches have no voice entry.
- W468 **Live translation between two languages** [ChatGPT]: No translation mode or instruction in the voice session.
- W469 **Pronunciation help with audio and phonetics** [ChatGPT]: No pronunciation answer card.
- W470 **Screen and video sharing in voice** [ChatGPT]: Voice takes the microphone and attachments only;
- W471 **Voice with custom GPTs or agents** [ChatGPT]: Voice session context carries project and memory, not a chosen custom agent.

## Desktop: all 162 missing

### Account and sign-in (1)
- D1 **Finish setup card after import for connections that need authorization** [ChatGPT]: No import exists to leave work half done;

### Plans, billing and usage (3)
- D2 **Let the assistant apply a banked usage reset when you ask** [ChatGPT]: A banked reset is applied only with the button in Usage settings;
- D3 **Per-chat credit use and top consuming chats** [ChatGPT]: Usage shows no per-chat cost or heavy-chat ranking.
- D4 **Request a higher personal usage limit from Usage** [ChatGPT]: No in-product request for a higher limit.

### Home and navigation (7)
- D5 **Choose, create or hide a custom floating pet and see chat status on it** [ChatGPT]: No pet, Mini mode or status badge; the covered row shows there is no floating companion at all.
- D6 **Composer predictions of your next prompt** [ChatGPT]: No ghost-text or tab-to-accept prediction in the composer.
- D7 **Open recent models by shortcut** [ChatGPT]: No chord for recent models; the picker has favourites only.
- D8 **Open the project picker by shortcut** [ChatGPT]: No project picker chord is registered.
- D9 **Shortcut to jump to the next chat that needs attention** [ChatGPT]: Only Previous Chat and Next Chat exist; nothing jumps to a chat that is waiting for an answer or approval.
- D10 **Shortcut to toggle the Activity view** [ChatGPT]: Activity (notifications list) has no keyboard shortcut.
- D11 **Switch between Chat, Work and Code with shortcuts** [ChatGPT]: No keyboard chord switches modes.

### Composer and input (1)
- D12 **Take Photo from the plus menu** [ChatGPT]: Take a photo lives in packages/ui/unified-chat/src/components/AttachmentMenu.tsx:703, rendered only by ChatInput/ChatInterface, which only the retained Tauri client mounts (apps/desktop/src/features/v3/DesktopShellV3.ts…

### Conversations and message actions (1)
- D13 ★ **Manual conversation compaction on demand**: Long chats are trimmed on the server automatically;

### Rendering and content (1)
- D14 **Smooth text fade-in while a response streams** [ChatGPT]: Streamed text appears without a fade animation.

### Models and reasoning (4)
- D15 **1M context option in the model picker** [Claude]: The picker has no long-context variant choice.
- D16 **Advisor model that reviews the main model** [Claude]: No advisor setting or command.
- D17 **Deeper reasoning for one turn with a keyword (ultrathink)** [Claude]: Effort is set by the picker only; no keyword trigger.
- D18 **Ultrafast tier above Fast** [ChatGPT]: Only one fast tier exists.

### Search and research (1)
- D19 **Admin sets allowed web search mode and default** [ChatGPT]: No workspace control over web search.

### Files, media and creation (3)
- D20 **Comment on parts of one or several images and send them with edit instructions** [ChatGPT]: The image edit panel takes a text request only;
- D21 **Record meetings and voice notes into a summary (Record mode)** [ChatGPT]: Dictation types speech into the box, but there is no meeting recorder or transcript-and-summary flow.
- D22 **Take a photo with the camera and attach it** [ChatGPT]: The attach menu offers files and screenshots, but no camera capture on the desktop.

### Artifacts and documents (3)
- D23 ★ **LaTeX editing with a compiled PDF preview and Markdown or LaTeX write-ups**: There is no LaTeX source editor or compile step;
- D24 **Reproducible figures, tables and notebooks that store code and environment** [Claude]: Artifacts keep version history but do not store the code, environment and conversation that produced a figure.
- D25 **Reviewer that flags wrong citations and untraceable numbers** [Claude]: Citations show as pills and artifacts have a changes review, but nothing checks numbers or citations against their source.

### Accessibility and languages (1)
- D26 **Desktop pet that respects reduced motion** [ChatGPT]: There is no pet or companion character in the app, so there is nothing to calm down for reduced motion.

### Agents, tasks and automation (12)
- D27 ★ **Computer use on Windows**: Computer use is Mac only: off Mac the app says controlling the mouse and keyboard is supported on macOS only.
- D28 ★ **Goal loop: a completion condition the agent keeps working toward**: No /goal command or progress row exists;
- D29 ★ **Parallel chunks of work and parallel goals per chat**: A chat runs one thing at a time; you can start other chats or tasks, but one request is not split into parallel pieces.
- D30 ★ **Secure sign-in form and saved-card purchases for the agent**: The browser agent leaves password and payment fields for you and always asks before purchases;
- D31 ★ **Subagents and built-in helper agents (explorer, worker, planner) with their own context**: Cloud chat and tasks have no delegation to subagents with separate context;
- D32 **Computer History: opt-in activity timeline turned into memories** [ChatGPT]: No computer history feature.
- D33 **Computer use blocked for trading and crypto apps** [Claude]: The refused-apps list starts empty and holds only what you add;
- D34 **Dynamic workflows: scripted multi-agent runs with progress view, approval card and saved slash commands** [Claude]: There is no workflow scripting, ultracode keyword, workflow progress view or saved workflow commands;
- D35 **Meeting notes without a bot, with suggested action items** [ChatGPT]: The app can dictate speech into text but cannot record a meeting and produce a summary with action items.
- D36 **Per-app permission tiers for computer use (view-only browsers, click-only terminals)** [Claude]: An allowed app gets full mouse and keyboard control;
- D37 **Proactive read-only research before you ask** [ChatGPT]: The assistant only works when asked or on a schedule;
- D38 **Research workbench and managed compute for remote jobs (Science app)** [Claude]: No science workbench or remote job submission exists.

### Browser actions (9)
- D39 ★ **Browser pane tabs**: One page at a time; no tabs.
- D40 ★ **Choose the built-in browser or the Chrome extension for tasks**: No preferred-browser choice; agent browser work uses the paired Chrome extension only.
- D41 ★ **Mark up the page and send it to the chat; point at an element**: The browser pane cannot capture its page or pick an element;
- D42 ★ **Open a link in the built-in browser by deep link or choose where links open**: Deep links open chats, Code and settings only, and external links always open in your default browser with no choice.
- D43 ★ **The assistant reads, clicks and types in the built-in browser**: Browser work by the agent drives your own Chrome through the paired extension, not the pane;
- D44 **Annotate pages and send comments, with style adjust controls, to the agent** [ChatGPT]: The browser pane has no annotation mode;
- D45 **Bring your sign-ins over from Chrome, Edge or Firefox** [Claude]: Not built; the research note says reading other browsers' sign-ins needs an owner decision on the system prompt, per-site choice and legal wording.
- D46 **Browser annotation API for site developers** [ChatGPT]: No developer interface lets a site shape what people annotate.
- D47 **Developer mode with full DevTools Protocol access for the agent** [ChatGPT]: Full browser control is granted per site for a run, but there is no developer mode for inspecting network, console or performance;

### Coding agent (38)
- D48 ★ **Export findings as JSON, CSV or SARIF**: Findings are viewable on the scan page only;
- D49 ★ **Inline comments on diff lines that feed the next turn**: The cloud session Changes panel has no line comments;
- D50 ★ **Lifecycle hooks: UserPromptSubmit, Stop, SubagentStop**: The public Desktop and Cloud Code expose no hook editor;
- D51 ★ **Security guidance and hardening proposals beside scans**: No in-session security guidance mode and no hardening comparison;
- D52 ★ **Security workbench: scan history, cross-repo findings, compare scans**: Each report is tied to one session; there is no history, filter or comparison across repositories.
- D53 ★ **Subagents with distinct roles and tools**: Cloud Code runs one agent; subagents belong to the CLI.
- D54 **/init creates an AGENTS.md for the project** [ChatGPT]: Only /review and /security-review are goal commands;
- D55 **App state capture for visual debugging (Appshots)** [ChatGPT]: No command captures a running app window for the agent;
- D56 **Auto-review of approval requests** [ChatGPT]: Approvals go to the user; no automatic reviewer exists.
- D57 **Backlog triage of alerts and advisories with confirmed or not actionable verdicts** [ChatGPT]: The security scan finds and validates its own findings;
- D58 **Claude Science: desktop research app with sandboxed code** [Claude]: No separate research app.
- D59 **Cloud session with several repositories** [Claude]: A session takes one repository and branch.
- D60 **Code intelligence plugins (language servers)** [Claude]: No language-server plugins for code sessions.
- D61 **Code Review inbox of pull requests across repos** [ChatGPT]: No inbox of GitHub pull requests; only the session's own pull request is tracked.
- D62 **Computer use on Windows apps** [ChatGPT]: Computer use is macOS only; other systems are refused.
- D63 **Continue or recover findings from an interrupted scan** [ChatGPT]: A failed scan shows an error and a retry;
- D64 **Control an open Excel workbook from the desktop app** [ChatGPT]: No direct control of an open Excel workbook.
- D65 **Copy branch name for a session's branch** [Claude]: The session shows its working branch but offers no copy-branch action.
- D66 **Create, edit and delete saved environments** [Claude]: No UI in the hosted web app calls the environments API (apps/web/app/api/code/environments/route.ts): grep for code/environments, listEnvironments, createEnvironment, deleteEnvironment in apps/web/features finds nothing;
- D67 **Deep link that opens a new session with a prefilled prompt** [Claude]: Links open Code or an existing session; no link starts a new session with a prompt.
- D68 **Deep scan: repeated scans merged** [ChatGPT]: Only a single scan, which can be repeated by hand.
- D69 **Fix failing checks by attaching CI output to a message** [ChatGPT]: Failed check names are listed, but there is no Fix button that carries the CI output into the message box.
- D70 **Goal mode: pursue an outcome with success criteria and a token budget** [ChatGPT]: No goal command or persisted goal with success criteria and a budget.
- D71 **Lifecycle hooks (before tool, after tool, session start, permission request)** [ChatGPT]: Cloud sessions have no user-defined hooks;
- D72 **Live scan progress and token usage** [ChatGPT]: The page shows only a scanning message until finished.
- D73 **Mark files as viewed and Stack view of dependent PRs** [ChatGPT]: No viewed markers on changed files and no view of related stacked pull requests.
- D74 **Merge when ready (GitHub auto-merge)** [Claude]: A session can open a pull request but cannot turn on auto-merge or merge it.
- D75 **Mods: customize Claude Code behavior and look in TypeScript** [Claude]: No user-written mods for the interface or agent behavior.
- D76 **PR Auto-fix of failing checks and review comments** [Claude]: Failing checks are shown but nothing starts a fix automatically;
- D77 **Projects that group coding sessions** [Claude]: Code sessions are not tied to Projects; the list groups only by Ready and Idle.
- D78 **Review delivery: inline in the chat or in a separate chat** [ChatGPT]: The /review command always runs in the same session;
- D79 **Review rules in AGENTS.md that customize GitHub reviews** [ChatGPT]: Automated GitHub reviews read no repository rules file;
- D80 **SECURITY.md files guide scans** [ChatGPT]: Scans do not read a repository security policy file.
- D81 **Suggested follow-up tasks as cards (Start, Do it here, Start all)** [Claude]: The agent does not offer separate follow-up tasks as cards.
- D82 **Terminal shortcuts: clear the session terminal with Ctrl+L** [ChatGPT]: A cloud session's terminal is a run-a-command box with a list of past commands;
- D83 **Thread goal with /goal** [ChatGPT]: No goal can be set on a session.
- D84 **Track findings in Linear, GitHub Issues or Jira** [ChatGPT]: Findings can be approved or dismissed; no issue is drafted.
- D85 **Triage external findings and verify a fix** [ChatGPT]: Only findings from our own scan are handled.

### Connectors, apps, plugins and skills (4)
- D86 ★ **Excel and PowerPoint add-ins**: No Office add-in exists.
- D87 **Apple Messages plugin on Mac** [ChatGPT]: No Messages connector exists.
- D88 **Desktop extensions (.mcpb) directory and install** [Claude]: No extension package format, directory or custom install exists.
- D89 **Meetings plugin: notes and action items from meeting speech** [ChatGPT]: No meeting capture or notes feature exists on desktop.

### Cross-device continuity (3)
- D90 **Desktop app and IDE extension share chats and context** [ChatGPT]: The VS Code extension does not share chats with the desktop app.
- D91 **Hand off a running chat to another host** [ChatGPT]: A chat or session cannot be moved from one computer to another.
- D92 **Move a local session to the cloud** [Claude]: A session on this computer cannot be sent to a cloud session.

### Device and OS integration (14)
- D93 ★ **Computer use works in the background without taking the screen**: Input is posted on the shared session, so the agent uses the screen and pauses when you move the mouse.
- D94 ★ **Deep link that starts a new chat with a prefilled prompt**: A chat link must name an existing chat; the link parser keeps only a target and an id and drops any query, so no link opens a new chat with text in the box.
- D95 **Admin switch to disable window sharing (Appshots)** [ChatGPT]: The governed features list has no switch for sharing the front window.
- D96 **Admin switch to stop the app registering its link scheme** [Claude]: The app always registers its link scheme.
- D97 **Apple Handoff between Mac and iPhone** [ChatGPT]: No Handoff activity is published; chats sync through the account only.
- D98 **Apple Intelligence, Siri, Writing Tools and Visual Intelligence** [ChatGPT]: No Apple Intelligence or Siri integration exists.
- D99 **Computer History: memories and a timeline from screen events** [ChatGPT]: No screen history feature exists.
- D100 **Floating companion (Pets) with voice and text** [ChatGPT]: No floating companion; the quick panel is a window that hides when you click away.
- D101 **Hardware control keys: Work Louder Micro keyboard** [ChatGPT]: No hardware keyboard support exists.
- D102 **Locked Use: computer use continues after the Mac locks** [ChatGPT]: A task stops when the screen locks.
- D103 **Log Out item in the app menu** [ChatGPT]: Signing out is only in the hosted account menu, not in the app, tray or dock menu.
- D104 **Open File item in the File menu** [Claude]: File has Open Folder but no Open File.
- D105 **Read the open app (notes, editor, terminal) into chat (Work with Apps)** [ChatGPT]: Nothing reads text from another app into a chat;
- D106 **Start computer use by typing @Computer or @AppName** [ChatGPT]: The @ menu has no computer or app entry.

### Help, feedback and support (2)
- D107 **Record a network log, turn off hardware acceleration, reset app data** [Claude]: Troubleshooting offers only logs, diagnostics and clear cache;
- D108 **System Status link in the Help menu** [ChatGPT]: No status link in the app.

### Install, release and update (10)
- D109 ★ **Admin option to turn off in-app updates and deploy pinned versions**: The updater always runs on Mac; no managed switch exists and only DMG and ZIP are built for MDM.
- D110 ★ **Get the Windows app from the Microsoft Store or winget**: No Store listing or winget package; searched for them in the build config and workflows and found none.
- D111 ★ **IT policy pushed to the desktop app (MDM profile, policy refresh, relaunch card)**: Workspace policy lives in the web console, but the Mac shell reads no managed preferences or device profile.
- D112 ★ **Linux app (.deb, .rpm, apt)**: No Linux package target exists and the download route returns unavailable for Linux.
- D113 ★ **Published list of network hosts the desktop app needs, for company firewalls**: No help or download page lists the hosts the app needs or its signing identity for IT allowlists.
- D114 ★ **Windows app (installer, x64 and ARM64)**: No Windows build is made or offered: the website download route answers 503 for anything but Mac.
- D115 **App updates itself on Windows** [Claude]: Self-update runs only on Mac (the supported check is platform darwin);
- D116 **Choose a release channel (Stable or Latest, about one build a day)** [Claude]: There is one channel; the feed always returns the latest stable release and Settings has no channel choice.
- D117 **Force an update by blocking app versions below a minimum** [Claude]: No minimum desktop version check; the only version gate is for the local CLI runtime.
- D118 **Managed-fleet installers (Windows MSIX, Mac PKG)** [Claude]: Only DMG and ZIP are built; no MSIX or PKG installer for IT teams.

### Memory and personalization (1)
- D119 **Computer History: opt-in memory from app and site activity (Mac)** [ChatGPT]: No activity recording or timeline memory on the desktop.

### Notifications (3)
- D120 **Meeting reminders, call detection and auto-stop of notes** [ChatGPT]: No calendar-driven reminders or call detection on the desktop.
- D121 **Per-project notification setting** [Claude]: Project settings have no notification switch.
- D122 **Workspace messages and headlines for members** [ChatGPT]: No admin-posted announcement reaches members.

### Privacy, security and data (3)
- D123 **Admin allowlist of destinations the desktop app may reach** [ChatGPT]: The egress guard is fixed in code; admins cannot set domains or storage folders.
- D124 **App pins its server certificates** [ChatGPT]: The shell uses the system trust store with no pinning.
- D125 **HIPAA business associate agreement and restricted mode** [Claude]: Not offered: the trust page says no BAA is signed and AGI is not for protected health information.

### Projects and organization (1)
- D126 **Named sections and a Pinned section in the sidebar** [ChatGPT]: Pinning exists but the sidebar has no user-named sections.

### Settings (11)
- D127 **Apple integration: Siri and Apple Intelligence handoff with confirm toggle** [ChatGPT]: The desktop app has no Siri or Apple Intelligence hook.
- D128 **Choose where a shared window goes (Appshot destination)** [ChatGPT]: No setting; the capture always goes to the main chat window.
- D129 **Claude Science: science databases, native viewers and admin controls** [Claude]: No science database access or molecule and genomics viewers.
- D130 **Computer History: activity memory from your own Mac use** [ChatGPT]: No computer history or activity timeline exists.
- D131 **Desktop mods: plugins that recolour or restyle the interface** [Claude]: No mod system; theming is limited to the Appearance settings.
- D132 **Import setup from Claude Code, Cowork or Cursor** [ChatGPT]: Memory import from another assistant exists, but nothing imports settings, skills, plugins or projects from other tools.
- D133 **Meetings: record and take notes with private pages** [ChatGPT]: No meeting recording or notes feature; dictation exists but not meeting capture.
- D134 **Pets: floating companion with mini mode** [ChatGPT]: No pet or floating companion exists.
- D135 **Preferred browser for Cowork: built-in or Chrome** [Claude]: Both a browser pane and the Chrome extension exist but no setting picks which one tasks use.
- D136 **Start view and app icon choice** [ChatGPT]: No start-view or icon setting; the app opens on the main window.
- D137 **Windows desktop app with its own settings** [ChatGPT]: The public Desktop builds macOS only: a dmg and a zip.

### Teams and admin (20)
- D138 ★ **Admin pushes policy to the desktop app through MDM or a managed file**: The Electron app reads no MDM, managed file or device policy;
- D139 ★ **Deploy the desktop app on managed Windows devices (Intune, winget, Store)**: The public Electron app builds only for Mac (dmg and zip);
- D140 ★ **Device management policies (MDM) for the desktop app**: No MDM keys, managed configuration or enforced login method;
- D141 **Admin 1Password sign-in toggle and org-only sign-in** [Claude]: Neither switch exists.
- D142 **Admin blocks bypass-permissions mode** [Claude]: No organization key forbids a member from turning permission prompts off in desktop agent runs.
- D143 **Admin browser policies: website defaults, uploads, downloads, extensions** [ChatGPT]: No admin browser policy for the desktop pane beyond the extension site lists.
- D144 **Admin control of desktop extensions: allowlist, block all** [Claude]: There is no installable extension format;
- D145 **Admin controls desktop auto-update (disable, enforcement hours, release channel)** [Claude]: The app checks for updates daily on the Mac and offers the install, but an admin cannot disable it, set a forced-restart window or pin a channel.
- D146 **Admin limits which apps computer use may reach and whether approvals save** [ChatGPT]: Admins can switch computer use off but cannot restrict apps or block saved approvals.
- D147 **Admin switch for Apple Intelligence and Work with Apps on macOS** [ChatGPT]: The features they would switch off do not exist here.
- D148 **Admin switches for dictation, voice, chat screens and local scheduled tasks in the desktop app** [ChatGPT]: The governed feature list has work, code, research, skills, plugins, hooks, browser, computer use, Remote Control, schedules, event triggers, projects, artifact connectors and fast mode;
- D149 **Admin toggle for the built-in desktop browser and cookie import** [Claude]: The browser pane has per-user site lists only;
- D150 **Admin toggle: usage shown in credits and dollars** [ChatGPT]: No workspace control over how usage is shown to members.
- D151 **Admin turns off coding sessions on the member's own computer** [Claude]: The Code switch governs cloud sessions and Desktop cloud sync governs syncing;
- D152 **Import claude.ai chat history into the desktop app** [Claude]: There is no way to bring chats from another assistant into history;
- D153 **Owner-managed list of allowed desktop extensions and custom extension upload** [Claude]: There is no desktop extension format, directory or organization upload;
- D154 **Personal analytics: members ask about their own activity and workspace trends** [ChatGPT]: Admins get usage analytics in the console, but members cannot ask the assistant about their own activity.
- D155 **Restrict desktop sign-in to the organization's own accounts** [Claude]: Desktop sign-in opens the browser to the normal sign-in page;
- D156 **Run an endpoint security (EDR) sensor inside the desktop agent sandbox** [Claude]: Our desktop agent does not run in a managed virtual machine, so no sensor can be placed inside it.
- D157 **Wallet payments need biometric approval on every payment** [ChatGPT]: We have no assistant wallet or payments feature.

### Voice (5)
- D158 **Dictation cleanup and custom dictionary** [ChatGPT]: Dictation inserts the transcript as heard and has no personal word list or cleanup setting.
- D159 **Live dictation: text appears as you speak, no time limit** [ChatGPT]: The desktop dictation bar records and then transcribes, and ends after 10 minutes;
- D160 **Meeting recorder with summary canvas, speaker labels and calendar join** [ChatGPT]: There is no meeting or voice-note recorder;
- D161 **Screen context: voice sees your front window on request** [ChatGPT]: Live voice cannot capture your screen or front window;
- D162 **Voice works while using other apps (Work with Apps)** [ChatGPT]: Voice has no link to other apps' windows;

## Mobile: all 230 missing

### Account and sign-in (8)
- M1 ★ **Account phone number**: The app stores and shows no phone number and does no phone verification.
- M2 ★ **Verify age with a selfie or ID to restore an account or lift teen limits**: Age check uses only the phone store age signal;
- M3 **Account PIN** [ChatGPT]: There is no account PIN. Security and login offers an authenticator app, backup codes, passkeys, App Lock and a session timeout instead.
- M4 **More menu in the switch account sheet header** [ChatGPT]: The Cloud accounts card has no header menu for extra account actions.
- M5 **Push approval of a login in the signed-in app** [ChatGPT]: No push-to-approve login; two-step sign-in uses codes only.
- M6 **Sign in to other apps and sites with your assistant account** [ChatGPT]: AGI is not an identity provider for other apps;
- M7 **Sign in with a passkey** [ChatGPT]: The sign-in screen has no passkey option.
- M8 **Text message sign-in code** [ChatGPT]: Two-step sign-in supports only an authenticator app (with backup codes);

### Plans, billing and usage (5)
- M9 ★ **Assistant pays for approved purchases with one-time cards (Link, Shop Pay, Wallet)**: We have no assistant that pays for purchases for the user.
- M10 **Active scheduled task limit per plan** [ChatGPT]: The app shows no cap on active scheduled tasks or a plan-based count.
- M11 **Cloud session VM resource and time limits** [Claude]: Cloud code sessions show no resource or time limits in the app.
- M12 **Early access to test new features** [ChatGPT]: The app has no early access or preview opt-in setting.
- M13 **Manage the subscription** [Claude]: Subscription says 'Managed on the web' or 'where you subscribed';

### Home and navigation (8)
- M14 ★ **Health destination in the side menu**: No Health area or health data connection in the app.
- M15 **Choose in-app or system browser for links** [Claude]: The setting is built but hidden by the linkBrowser switch, so every link opens in the in-app sheet.
- M16 **Continue with phone number** [ChatGPT]: No phone-number sign-in.
- M17 **Finances area with a financial data source** [ChatGPT]: Bank linking exists in code but is switched off in v1, and no Finances destination shows.
- M18 **Personal companion chat row (Your dot)** [ChatGPT]: No personal companion chat in the side menu;
- M19 **Space: pages workspace with Shared with you and Recents** [ChatGPT]: This row and the row Space: shared interactive pages that update from connected apps describe the same ChatGPT Space and disagree (Partial against Missing).
- M20 **Suggested prompts on an empty chat** [ChatGPT]: No starter prompt chips on the empty chat;
- M21 **Tab bar with pinnable favourites (new mobile layout)** [ChatGPT]: Navigation is only the side drawer; the tab bar is hidden and destinations cannot be pinned to the home screen.

### Composer and input (6)
- M22 ★ **Strip of recent photos inside the add menu**: The sheet has a Photos card but no strip of recent device photos;
- M23 **Dictation history** [ChatGPT]: No list of past dictations.
- M24 **Dictation retries once after a connection issue** [ChatGPT]: Dictation is on-device; a failure shows a message to tap again.
- M25 **Long-press send to pick a model for one message** [ChatGPT]: Send has no long-press menu; the model chip changes the model for the chat.
- M26 **Magnifier-in-ring button in the composer** [ChatGPT]: No such button; web search is a row in the Add to Chat sheet.
- M27 **Memory row in the Add to Chat sheet** [Claude]: The sheet has no Memory row; memory is managed in Settings.

### Conversations and message actions (5)
- M28 **Automatic summarising of older messages in long chats** [Claude]: The chat only warns near the context limit and offers a fresh chat;
- M29 **Delivered status under a sent message** [ChatGPT]: Only queued offline and failed states show;
- M30 **Drag a reply into another app on iPad** [ChatGPT]: No drag-out of reply content was found.
- M31 **Locked chats behind a PIN or device unlock** [ChatGPT]: No locked chats; the app lock covers the whole app only.
- M32 **Search connected Google Drive files from the sidebar** [ChatGPT]: Search covers our own chats, projects, uploads and library only, not files in a connected drive.

### Rendering and content (8)
- M33 **Interactive learning modules for math and science** [ChatGPT]: Study mode exists but no manipulable formula or graph modules.
- M34 **Pronunciation guidance with audio** [ChatGPT]: No pronunciation audio feature exists beyond normal read-aloud.
- M35 **Restaurant reservations inside a chat** [ChatGPT]: The assistant cannot show reservation times or book a table.
- M36 **Shopping: product cards, buyer's guide, comparison, image search, try-on** [ChatGPT]: The app has no shopping results, buyer's guides or try-on.
- M37 **Switch a chart between static image and interactive** [ChatGPT]: Charts do not have a static or interactive switch.
- M38 **Tappable highlights open a side panel for people, places, products** [ChatGPT]: Named people, places and products in an answer are not tappable.
- M39 **Weather card in chat** [Claude]: Weather is answered as text; there is no weather card.
- M40 **Writing blocks: editable drafts with send-email or save to Library** [ChatGPT]: Drafts appear as normal text with no editable block or send-by-email action.

### Models and reasoning (1)
- M41 **Show legacy models and auto-switch to thinking (Configure menu)** [ChatGPT]: The picker has no legacy-model toggle or auto-switch setting.

### Search and research (3)
- M42 **Fast answers toggle in Personalization** [ChatGPT]: Personalization has no fast-answers switch.
- M43 **Interrupt a running research report to change focus** [ChatGPT]: Research can be started and read but not steered during a run.
- M44 **Restrict research to chosen sites** [ChatGPT]: No way to limit research to chosen sites.

### Files, media and creation (8)
- M45 **Attach audio files** [ChatGPT]: Audio files are not an accepted attachment type.
- M46 **Attach video files** [ChatGPT]: Video files are not an accepted attachment type.
- M47 **Cloud file storage quota and storage manager** [ChatGPT]: Our Storage page covers on-device usage only;
- M48 **GIF creation from a prompt or sketch** [ChatGPT]: Video generation is off and no GIF creation exists.
- M49 **Images page with Templates and Trending ideas** [ChatGPT]: The route renders <ImagesScreen /> with no props (apps/mobile/app/(app)/images.tsx:4).
- M50 **Personalised sticker packs for iMessage and WhatsApp** [ChatGPT]: No sticker creation exists.
- M51 **Sketch to image on mobile** [ChatGPT]: No drawing canvas feeds image creation.
- M52 **Virtual try-on for clothing and accessories** [ChatGPT]: No try-on exists.

### Artifacts and documents (3)
- M53 **Space: shared interactive pages that update from connected apps** [ChatGPT]: No Space, folders, pages or favorites for generated work;
- M54 **Start an artifact from a template gallery** [Claude]: No templates; artifacts exist only once the assistant makes them.
- M55 **Whiteboards for thinking with the assistant** [Claude]: No whiteboard artifact type.

### Accessibility and languages (3)
- M56 ★ **Accessibility conformance report or statement**: The app has no accessibility statement link;
- M57 **Dyslexia-friendly chat font** [Claude]: No chat font choice; only a code font choice exists for coding sessions.
- M58 **Language of the app** [ChatGPT]: The app-language picker is switched off, so the app shows English only.

### Agents, tasks and automation (18)
- M59 **Add a site permission** [ChatGPT]: No per-site permission list for the agent.
- M60 **Always-on proactive agent that texts or calls you (Duet)** [Claude]: No always-on agent, morning brief or proactive updates in the app.
- M61 **Browser cookies list** [ChatGPT]: No cookies list for the agent browser.
- M62 **Clear all cookies** [ChatGPT]: No clear cookies control for the agent.
- M63 **Cloud browser settings for the agent** [ChatGPT]: No settings page for how the cloud agent uses a browser.
- M64 **College Planner for US high-school students** [ChatGPT]: No planner; AGI is for 18 and over only.
- M65 **Create and customize a dot in the mobile app** [ChatGPT]: No dot to create or customize in the app.
- M66 **Default permission for opening websites** [ChatGPT]: No default website permission for the agent.
- M67 **Dot delegates to Work or Codex and runs background agents in parallel** [ChatGPT]: No agent that delegates to other tasks or runs background agents on its own.
- M68 **Dot reacts to events on connected services** [ChatGPT]: Event-run schedules exist, but there is no always-on agent that watches services and drafts work.
- M69 **Dot rules: custom rules, pause and delete** [ChatGPT]: There is no dot, so no per-action rules, pause or delete.
- M70 **dots text you by iMessage or RCS and buy with Wallet approval** [ChatGPT]: No texting agent and no in-chat wallet purchases.
- M71 **dots: always-on personal agent with its own cloud computer ("Your dot")** [ChatGPT]: No always-on personal agent or rules for acting without asking;
- M72 **Message routing: answer in place, start a thread, or join a thread** [Claude]: Each message goes to the chat or task the user chose;
- M73 **Permission for email verification codes** [ChatGPT]: No setting to let the agent read email sign-in codes.
- M74 **Restaurant reservation search** [ChatGPT]: No reservation integration in the app.
- M75 **Share a scheduled task by link** [ChatGPT]: Schedules have no share link or copy-from-link.
- M76 **Shopping checkout in chat (Instant Checkout)** [ChatGPT]: No in-chat buying flow.

### Browser actions (3)
- M77 ★ **Cloud browser card in the task with an Open button**: Agent steps show a browser icon in the timeline only;
- M78 ★ **Take control of the cloud browser and hand back**: No take-over or hand-back of an agent browser.
- M79 **Cloud browser availability and per-plan limits** [ChatGPT]: No cloud browser feature, so no plan gating for it.

### Coding agent (25)
- M80 ★ **Default environment created automatically**: No default environment; the user creates one first.
- M81 **Archive a cloud environment** [Claude]: Environments can only be deleted, on a screen no menu links to.
- M82 **Auto-fix pull requests and watch a PR from the phone** [Claude]: Review, commit and open a pull request exist;
- M83 **Choose a setup script file** [Claude]: No saved environment form exists.
- M84 **Create a cloud environment** [Claude]: No create button or form; the unreachable environments screen only lists and deletes.
- M85 **Dispatch tasks to a paired desktop** [Claude]: Dispatch flag is off in v1 and nothing in the app opens it;
- M86 **Edit the cloud environment of a running session** [Claude]: The session screen has no environment edit;
- M87 **Environment allow package managers switch** [Claude]: No saved environment form exists.
- M88 **Environment allowed domains text area** [Claude]: No saved environment form exists.
- M89 **Environment name field** [Claude]: No saved environment form exists.
- M90 **Environment setup script text area** [Claude]: No saved environment form exists.
- M91 **Environment variables text area** [Claude]: No saved environment form exists.
- M92 **Follow-up behavior** [ChatGPT]: No setting for how follow-up messages sent mid-run are handled (queue or steer) in Code settings.
- M93 **Help for cloud environments** [Claude]: No help for environments because the feature is not reachable.
- M94 **List of cloud environments** [Claude]: The list screen with swipe delete exists but is unreachable (dead code);
- M95 **Live Activities** [ChatGPT]: No lock-screen Live Activity for running coding sessions.
- M96 **Manage cloud environments** [Claude]: A Cloud environments list screen exists but no link, search entry or deep link opens it (dead code), so a user cannot reach it.
- M97 **Network secrets that stay out of the session** [Claude]: Environments hold plain variable names only;
- M98 **Pin Codex as a favorite in the mobile tab bar** [ChatGPT]: No tab bar with pinnable favorites; Code is a side menu row.
- M99 **Pinned Codex chats sync to the phone** [ChatGPT]: No pinning of coding sessions; sessions are listed by state only.
- M100 **Reference another task with @ in a coding thread** [ChatGPT]: The coding session composer has no @ task reference.
- M101 **Several repositories in one coding session** [Claude]: The new session sheet takes one repository (or none) and a branch.
- M102 **Submit the new environment** [Claude]: No saved environment form exists.
- M103 **Task view option: Priority** [ChatGPT]: No priority ordering; sessions can be filtered by state (Running, Failed and so on) but not ranked by priority.
- M104 **Transcript text size slider** [Claude]: No text size control for the coding transcript;

### Connectors, apps, plugins and skills (33)
- M105 ★ **Finances: link bank accounts and ask about money**: Bank linking through Plaid is built but switched off in v1 (FEATURES.bankLinking false), so no Finances view or bank connector is offered.
- M106 ★ **Health Connect data on Android (Claude and ChatGPT)**: No Health Connect or Apple Health access on either platform.
- M107 **Add a Health account** [ChatGPT]: No way to add a health account. Reads nothing from Apple Health or Health Connect.
- M108 **Allow or refuse Health access** [ChatGPT]: The app asks for no health permissions. Reads nothing from Apple Health or Health Connect.
- M109 **Ask about your health in the floating bar** [ChatGPT]: No health composer bar. Reads nothing from Apple Health or Health Connect.
- M110 **Choose each Health topic to share** [ChatGPT]: No per-topic health sharing. Reads nothing from Apple Health or Health Connect.
- M111 **Choose how much Health data to share** [ChatGPT]: No sharing duration step. Reads nothing from Apple Health or Health Connect.
- M112 **Connect medical records** [ChatGPT]: No medical records connection. Reads nothing from Apple Health or Health Connect.
- M113 **Connected source row with menu** [ChatGPT]: No connected health sources. Reads nothing from Apple Health or Health Connect.
- M114 **Continue Health data access prompt** [ChatGPT]: No health data access prompt. Reads nothing from Apple Health or Health Connect.
- M115 **Continue to the Health permission sheet** [ChatGPT]: No Health permission sheet is requested.
- M116 **Credit score and report in Finances (Experian)** [ChatGPT]: Bank linking is switched off and there is no credit report code.
- M117 **Custom insights tooltip** [ChatGPT]: No Health tooltip. Reads nothing from Apple Health or Health Connect.
- M118 **Go back from the sharing step** [ChatGPT]: No sharing step. Reads nothing from Apple Health or Health Connect.
- M119 **Google connection: approve all permissions or select fewer apps** [ChatGPT]: Connect has no app picker; permissions show read-only.
- M120 **Grouped Health metric cards** [ChatGPT]: No health metric cards. Reads nothing from Apple Health or Health Connect.
- M121 **Health accounts list** [ChatGPT]: No health accounts list. Reads nothing from Apple Health or Health Connect.
- M122 **Health area with metrics and chats** [ChatGPT]: No Health area; the side menu has no Health entry. Reads nothing from Apple Health or Health Connect.
- M123 **Health chats list** [ChatGPT]: No separate health chats list. Reads nothing from Apple Health or Health Connect.
- M124 **Health records connect prompt** [ChatGPT]: No medical records prompt. Reads nothing from Apple Health or Health Connect.
- M125 **Health three-dot menu** [ChatGPT]: No Health menu. Reads nothing from Apple Health or Health Connect.
- M126 **iCloud Mail and Calendar connections with an app-specific password** [ChatGPT]: No iCloud mail or calendar connector or password flow.
- M127 **Manage linked finance accounts: sign in again and unlink** [Claude]: Unlink and reconnect code sits behind the switched-off bank linking flag.
- M128 **New and Noteworthy plugins list** [ChatGPT]: No New and Noteworthy section; the catalogue sorts by Popular or Name and shows category shelves.
- M129 **Open a metric row** [ChatGPT]: No metric rows to open. Reads nothing from Apple Health or Health Connect.
- M130 **Passwords source row to set up or connect** [ChatGPT]: No passwords source; personal sources cover email and calendar only.
- M131 **Per-connected-account permission override with reset to Default** [ChatGPT]: Connector details show granted scopes read-only;
- M132 **Prompt to reconnect phone health data** [ChatGPT]: No phone health data link to reconnect. Reads nothing from Apple Health or Health Connect.
- M133 **Remove Health access** [ChatGPT]: No health access to remove. Reads nothing from Apple Health or Health Connect.
- M134 **Select all Health topics at once** [ChatGPT]: No topic list. Reads nothing from Apple Health or Health Connect.
- M135 **Small Business plugins section** [ChatGPT]: No Small Business section; category shelves are driven by the plugin catalogue.
- M136 **Start a chat from a Health prompt card** [ChatGPT]: No health prompt cards. Reads nothing from Apple Health or Health Connect.
- M137 **Switch between Health tabs** [ChatGPT]: No Health tabs (Home, Chats, Records, Accounts).

### Cross-device continuity (3)
- M138 **Apple Handoff between iPhone and Mac** [ChatGPT]: No Handoff activity is declared by the iPhone app.
- M139 **Dispatch a task from the phone to the desktop app** [Claude]: The dispatch switch is off in v1, so the phone cannot hand a task to a desktop app.
- M140 **Slash commands from the phone in a session** [Claude]: The message box has no slash command parsing.

### Device and OS integration (14)
- M141 ★ **Health data from the phone**: No HealthKit or Health Connect link.
- M142 ★ **Share device location for local results with a precise toggle**: The app requests no location permission and has no location setting.
- M143 **Apple Intelligence Writing Tools and Visual Intelligence** [ChatGPT]: No Writing Tools or Visual Intelligence entry;
- M144 **Apple Vision Pro app** [ChatGPT]: No visionOS build.
- M145 **CarPlay voice** [ChatGPT]: No CarPlay support.
- M146 **Dictation auto-submit setting** [ChatGPT]: Dictation fills the box; no auto-send setting was found.
- M147 **Live Activities for voice** [ChatGPT]: No Live Activity.
- M148 **Location and Maps (Android)** [Claude]: No location access and no Maps hand-off.
- M149 **Messages and email drafting, alarms and timers (Android)** [Claude]: No message or email drafting and no alarms or timers from chat.
- M150 **Optional contact importing to find people** [ChatGPT]: No contacts permission or import exists.
- M151 **Set the assistant as Safari default search engine** [ChatGPT]: No Safari search extension or setup is offered;
- M152 **Text your dot through iMessage or RCS** [ChatGPT]: No messaging-app channel to the assistant exists.
- M153 **Use the assistant inside Apple Intelligence without an account** [ChatGPT]: No Apple Intelligence extension was found.
- M154 **Your dot on the iPhone: widget, Shortcuts action and share sheet** [ChatGPT]: The dot companion does not exist in AGI Mobile;

### Help, feedback and support (3)
- M155 **Include screenshot in report switch** [ChatGPT]: The issue report cannot attach a screenshot;
- M156 **Phone support line** [ChatGPT]: No phone line. Support is by email or, for signed-in Cloud users, a ticket from About.
- M157 **Shake iPhone to report a bug switch** [ChatGPT]: No shake gesture to report a bug.

### Install, release and update (3)
- M158 ★ **Live store listing**: AGI Mobile has no live App Store or Google Play listing;
- M159 ★ **Managed app for Microsoft Intune organisations**: No managed Intune build exists.
- M160 **Duet standalone mobile app** [Claude]: No second companion app exists.

### Memory and personalization (10)
- M161 **Add reference photos of yourself** [ChatGPT]: No profile reference photos for image creation;
- M162 **Custom instructions length limit by plan** [ChatGPT]: The Custom Instructions field shows no limit or counter;
- M163 **Custom rules row** [ChatGPT]: No rules row. Custom instructions and approval policy are the nearest controls.
- M164 **Dismissible memory warning** [Claude]: No dismissible warning on the memory controls;
- M165 **Don't mention this again on a memory** [ChatGPT]: Memories can be pinned, edited or deleted, with a Never remember list, but not muted.
- M166 **Export memories** [Claude]: No memory export; only import and delete exist.
- M167 **Fast answers switch** [ChatGPT]: No Fast answers switch in Personalization;
- M168 **Financial memories from goals, loans and assets** [ChatGPT]: Finance is off in v1 and no finance memory type exists.
- M169 **Switch between improved memory and the legacy saved list** [ChatGPT]: One memory list plus summary exists with no mode switch.
- M170 **Visual answers** [ChatGPT]: No Visual answers preference; the Inline visualizations switch in Capabilities is the nearest control.

### Notifications (2)
- M171 **Choose where the agent reaches you (text, app, Slack) and what needs attention** [ChatGPT]: We have no always-on agent and no routing choice between channels for updates and decisions.
- M172 **Reply to an agent notification from the lock screen** [ChatGPT]: Our push notifications have an approval category but no typed reply and no dot agent to reply to.

### Privacy, security and data (9)
- M173 ★ **Clear cloud browser cookies and data**: No cloud browser exists, so no browser data or cookie control.
- M174 ★ **Link bank accounts for finance chats; finance data kept out of memory**: Bank linking is switched off in mobile v1.
- M175 **Account PIN change and reset** [ChatGPT]: There is no account PIN to set, change or reset.
- M176 **Always-on dot agent with custom rules, name, shape and handle** [ChatGPT]: We have no always-on agent, so no custom rules, appearance, handle or delete action.
- M177 **Device integrity check that refuses tampered or rooted phones** [ChatGPT]: No attestation or root check exists in the phone app.
- M178 **Location access** [ChatGPT]: No location permission or setting; the app never asks for location.
- M179 **Lock individual chats behind a PIN or device authentication** [ChatGPT]: We lock the whole app with the device, but no single chat can be locked or hidden.
- M180 **Upload contacts to find people using the product** [ChatGPT]: The app never asks to read or upload contacts.
- M181 **Voice data consent sheet (Allow, Not now, close)** [Claude]: No consent sheet on first voice use; voice use for improvement is a switch in Privacy and is off by default.

### Projects and organization (8)
- M182 ★ **Project file limits by plan**: The app shows no per-plan project file count or size limit.
- M183 **Add a response to project sources** [ChatGPT]: The message menu can save an answer as a document, but not to a project's sources.
- M184 **Claude Code Projects: one coordinator with parallel cloud threads** [Claude]: Cloud code has a session list but no coordinating conversation across parallel threads.
- M185 **Favourites tab in the library** [ChatGPT]: No favourites tab or star in the Library.
- M186 **Folders in the library** [ChatGPT]: No folders in the Library.
- M187 **Sort project sources by newest, oldest or name** [ChatGPT]: The project Sources tab has no sort control.
- M188 **Start a project from a chat** [ChatGPT]: Move to project in a chat menu lists existing projects and Remove from project only;
- M189 **Suggested documents and pages tabs** [ChatGPT]: No suggested or pages tab; artifacts and documents list in one gallery.

### Settings (8)
- M190 **CarPlay opens straight into voice mode** [ChatGPT]: No CarPlay entry exists.
- M191 **Choose the browser that opens links** [Claude]: The browser choice for links (in-app or system) is switched off;
- M192 **Permission mode for cloud tasks: Manual, Accept edits, Plan, Auto** [Claude]: Cloud code asks per action but has no mode picker.
- M193 **Scene backdrop and colour scheme from a mod** [Claude]: Mods are not supported on mobile.
- M194 **Search suggestions switch** [ChatGPT]: No search suggestions switch; the search screen has none to turn off.
- M195 **Switch models when a message is flagged** [Claude]: No setting to fall back to another model when a message is flagged.
- M196 **Trending searches switch** [ChatGPT]: No trending searches switch or list.
- M197 **Trusted contact (page and Get started)** [ChatGPT]: No trusted contact setup; no owner decision rules it out.

### Sharing and collaboration (8)
- M198 **Claude Design sharing with view, comment or edit** [Claude]: No Design projects to share; published artifacts offer only public, workspace or invited audience.
- M199 **Leave a shared project and keep a copy of your chats** [ChatGPT]: Recipients can only hide a sharer; no leave action and no copy of their chats.
- M200 **Library files and folders shared with Viewer or Editor access** [ChatGPT]: Library has no sharing of files or folders with people.
- M201 **Live whiteboard collaboration with follow mode** [Claude]: No whiteboard or live co-editing surface.
- M202 **Pages and spaces with real-time co-editing and inherited access** [ChatGPT]: No shared pages or spaces.
- M203 **Project share link for anyone with the link and collaborator caps** [ChatGPT]: No anyone-with-link option for projects and no collaborator cap shown.
- M204 **Share a scheduled task as a link** [ChatGPT]: Schedules have no share link or copy-from-link flow.
- M205 **Share an image prompt as a template link** [ChatGPT]: Images screen has no prompt template link.

### Teams and admin (10)
- M206 **Admin controls for assistant rules and the dots admin guide** [ChatGPT]: No dots or custom rules with admin gating.
- M207 **Admin enables or disables each model per org and role; Haiku always on** [Claude]: No code reads an organization model allow list;
- M208 **Allow external domain invites toggle** [ChatGPT]: No toggle for invites outside verified domains in the app.
- M209 **Effort level caps per model at org and role level** [Claude]: Effort picker has no cap from organization or role.
- M210 **Environment picker at session start** [Claude]: New cloud session sheet picks repositories only;
- M211 **Managed deployment through Intune with app-protection policy** [Claude]: No managed app configuration or Intune policy support in the iOS or Android app.
- M212 **Organization-shared environments and org default** [Claude]: Environments screen is personal; no organization sharing or default.
- M213 **Request more usage when a team budget runs out** [Claude]: No request-more action exists on the limit banner or in the team screens.
- M214 **Self-hosted environments for cloud sessions** [Claude]: Only AGI managed environments exist.
- M215 **Wallet payments with biometric approval per payment** [ChatGPT]: No wallet or agent payments; bank linking is switched off.

### Voice (15)
- M216 **Background conversations switch** [ChatGPT]: Voice stops when the app leaves the screen or the device locks.
- M217 **Call a dot by phone from its chat** [ChatGPT]: No dots; voice is started only from chat or launch.
- M218 **Call ended summary bubble in the chat** [ChatGPT]: No Call ended bubble; the session simply closes.
- M219 **Camera and screen share in voice** [ChatGPT]: No video or screen share in a voice conversation.
- M220 **Collapse the call to a compact card and expand it** [ChatGPT]: Live voice is always full screen; no compact card.
- M221 **Live translation in voice until told to stop** [ChatGPT]: Voice has a speech language setting but no continuous two-language translation mode;
- M222 **Live voice on Lock Screen and Dynamic Island** [ChatGPT]: No Live Activity; voice stops when the app leaves the screen.
- M223 **Menu button in the call header** [ChatGPT]: The header has call time, pause, captions and settings but no menu.
- M224 **Phone gesture to start voice** [ChatGPT]: No raise-to-ear gesture.
- M225 **Pronunciation help with audio and phonetics** [ChatGPT]: Answers have no pronunciation card; read aloud exists for whole replies.
- M226 **Text a dot by iMessage or RCS** [ChatGPT]: No messaging channel to the assistant.
- M227 **Voice data consent sheet** [Claude]: This row and the row Voice data consent sheet (Allow, Not now, close) describe the same Claude sheet and disagree (Partial against Missing).
- M228 **Voice in Apple CarPlay** [ChatGPT]: No CarPlay entitlement or scene.
- M229 **Voice inside a Project using its sources and instructions** [ChatGPT]: Voice screen takes no project; it does not carry project instructions or sources.
- M230 **Voice reasoning level choice** [ChatGPT]: Voice offers the answer model only, with no voice intelligence level.

## CLI: all 717 missing

### Account and sign-in (12)
- C1 ★ **Admin limits on how and where people sign in**: Ours has no managed setting that forces a login method or organisation in the CLI.
- C2 **Custom CA bundle for corporate TLS proxy** [ChatGPT]: Ours only passes SSL_CERT_FILE through to sandboxed commands;
- C3 **Gateway Google Workspace group lookup** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C4 **Gateway login notice** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C5 **Gateway session token lifetime and secret rotation** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C6 **Gateway SSO sign-in with OIDC device flow** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C7 **Gateway SSO via OIDC with email-domain and group restrictions** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C8 **Gateway: Certificate (private_key_jwt) client authentication to the IdP** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C9 **headersHelper: a command that returns auth headers for an MCP server at connect time** [Claude]: Remote servers take fixed headers only (agi mcp add --header "Name: value");
- C10 **Log out of every device and session at once** [Claude]: Ours logout clears the sign-in on this machine only;
- C11 **Managed enforceAnthropicSignIn: require the vendor account sign-in instead of keys** [Claude]: No managed key forces account sign-in; a user can still set a provider key or AGI_API_KEY. The managed config section has only permissionMode, privacyMode and allowProjectConfig (privacyMode can pin Managed, which is th…
- C12 **Managed gatewayInternalNetworks: allow a login gateway on internal address blocks** [Claude]: The CLI signs in only to the AGI account;

### Plans, billing and usage (16)
- C13 ★ **Wrap-up allowance: the reply in progress finishes when the five-hour limit is hit**: No grace allowance was found; the limit message names the limit and reset time.
- C14 **Admin per-member and pooled group spend budgets** [Claude]: The CLI has only the user's own /budget;
- C15 **attributionProject: tag CLI usage with a project or cost code for spend tracking** [Claude]: No setting tags usage with a project or cost code.
- C16 **Keep waiting and resume the task after a usage limit resets** [Claude]: A turn that hits the limit stops with the reset time;
- C17 **Last-known usage shown when the usage service is down** [Claude]: If the account lookup fails, /usage shows Unavailable with the reason and no earlier figures.
- C18 **Plugin code reads context use and plan rate-limit use** [Claude]: No plugin API exposes context or usage figures.
- C19 **Plugin context cost estimate shown before install** [Claude]: Plugin install shows no estimate of how much context or usage the plugin adds each turn.
- C20 **Press f in /usage to apply usage-saving recommendations** [Claude]: /usage lists usage but offers no key to apply savings suggestions.
- C21 **Prompt cache hit and miss statistics in /usage and status line** [Claude]: The CLI records cache token counts for sub-agents but /usage and the status line show no cache hit ratio or warm state.
- C22 **Prompt caching switches and cache lifetime choice** [Claude]: No setting or environment switch turns prompt caching off or picks its lifetime.
- C23 **Setting to hide cost warnings** [Claude]: The near-limit notice and credit notices cannot be turned off.
- C24 **Spend-limit warnings at 75% and 95% of a cap** [Claude]: No warning appears as a personal or admin cap is approached;
- C25 **Status line shows plan rate-limit usage and reset time** [Claude]: The status line has no field for plan window usage or reset time;
- C26 **Usage report over recent sessions (/insights)** [Claude]: /insights only prints a hint to read the session's JSON events;
- C27 **Wait for the limit reset and continue automatically** [Claude]: When a limit is hit the CLI says when it resets and stops;
- C28 **Warning before resuming an idle conversation that would burn a large share of the limit** [Claude]: Resuming an old session gives no warning about how much of the five-hour limit it will use.

### Home and navigation (1)
- C29 **Terminal pets** [ChatGPT]: No pet or mascot companion in the terminal UI.

### Composer and input (12)
- C30 **Command completion after text in a prompt** [Claude]: The command palette only opens when the composer is empty.
- C31 **Mods: plugin-built panes, inputs and buttons** [Claude]: Plugins add commands, agents, skills, hooks and MCP servers but no custom terminal panes or controls.
- C32 **Mouse support in the terminal UI** [Claude]: The terminal UI takes no mouse input; terminal selection and scrolling work natively.
- C33 **Native terminal cursor option (CLAUDE_CODE_NATIVE_CURSOR)** [Claude]: No option; the TUI draws its own caret.
- C34 **Prompt suggestions (predicted next prompt)** [Claude]: The composer never proposes a next prompt.
- C35 **Saved prompt presets (/presets)** [ChatGPT]: No saved prompt slots.
- C36 **Search prompt history with Ctrl+R** [Claude]: No history search key; only step-by-step Up and Down recall (and /find searches the current conversation).
- C37 **Spell check in the prompt** [Claude]: No spell check in the composer.
- C38 **Toggle the to-do checklist (Ctrl+T)** [Claude]: Tasks are shown only on request through /plan todos;
- C39 **Vim insert-mode remaps (jj to Escape)** [Claude]: No remap setting; vim keys use the line-editor defaults.
- C40 **Word movement and delete shortcuts** [Claude]: Only character moves, Home, End, Backspace, Delete and Ctrl+U edit the draft;
- C41 **You should know side-agent suggestions** [Claude]: No side agent that flags a missed tradeoff.

### Conversations and message actions (10)
- C42 **Auto-continue a session that ended mid-turn** [Claude]: Interrupted turns are not resumed automatically.
- C43 **Filter session picker to current git branch** [Claude]: The picker has search only; no branch filter.
- C44 **Move a session to another folder (/cd)** [Claude]: No /cd slash command.
- C45 **Quiet view that shows only prompt, tool summary and answer (/focus)** [Claude]: No /focus command.
- C46 **Recap shown automatically when you return to a session** [Claude]: /recap only runs when typed; nothing shows a summary on return.
- C47 **Resume from a pull request (--from-pr)** [Claude]: No flag or picker filter by pull request.
- C48 **Rewind menu: summarize from here or up to here** [Claude]: The picker offers restore code and conversation, conversation only, or code only.
- C49 **Slash command /checkpoint (alias of /rewind)** [Claude]: /rewind exists with no /checkpoint alias;
- C50 **Trim old history from transcript files in long headless runs (CLAUDE_CODE_TRANSCRIPT_LOCAL_GC)** [Claude]: No transcript trimming switch.
- C51 **Warning when a session is open in two terminals** [Claude]: No warning when the same session is resumed twice.

### Rendering and content (1)
- C52 **Image previews inside the full-screen transcript** [ChatGPT]: Images are shown only as attachment chips and sent to the model;

### Models and reasoning (25)
- C53 ★ **Admin allowlist and blocklist of selectable models**: The CLI offers whatever the plan allows;
- C54 ★ **Reasoning effort for each subagent**: Agent files set model, tools and turn limits but not effort;
- C55 ★ **See the model's reasoning in the terminal (Ctrl+O, thinking summaries)**: Reasoning text reaches editor and app-server clients only;
- C56 ★ **Ultra and ultracode: Claude plans a workflow or subagents for substantial tasks**: /workflow runs workflows by hand; no setting or effort level makes the agent plan one for each substantial task.
- C57 **Adaptive thinking switches (CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING, CLAUDE_CODE_ALWAYS_ENABLE_EFFORT)** [Claude]: Reasoning is set only through /effort and --effort;
- C58 **Admin cap on the highest reasoning effort** [Claude]: The CLI has no admin or user setting that caps the effort level.
- C59 **Choose prompt cache lifetime (5 minutes or 1 hour) or turn caching off** [Claude]: Cache markers are fixed on the request; no setting changes the cache lifetime or disables it.
- C60 **Custom /model picker lineup with own labels and order** [Claude]: The picker order and labels come from the shared catalog;
- C61 **Effort level set by environment variable** [Claude]: Effort can be set with --effort, /effort or config, but no environment variable sets it.
- C62 **Extended thinking on/off toggle (Alt+T) and always-thinking setting** [Claude]: The terminal has no thinking toggle or setting;
- C63 **Fixed thinking token budget setting (MAX_THINKING_TOKENS)** [Claude]: The terminal user cannot set a thinking budget;
- C64 **Idle compaction of long conversations** [Claude]: Compaction only runs when a turn needs room or on /compact;
- C65 **Notice when the chosen model is scheduled for retirement or remapped** [Claude]: No retirement or remap notice; a retired catalog id fails when used.
- C66 **opusplan: stronger model in plan mode, cheaper model to execute** [Claude]: Plan mode runs on the session's current model;
- C67 **Pin the model version behind each alias for a team** [Claude]: No alias exists to pin; teams set default.model to an exact catalog id in config.
- C68 **Plan with a stronger model, run with a cheaper one (opusplan)** [Claude]: Plan mode does not switch models; /model and /route set one choice.
- C69 **Saved default advisor model (advisorModel)** [Claude]: /advisor picks its model from the catalog each time;
- C70 **Separate reasoning effort for plan mode** [ChatGPT]: Plan mode uses the same effort as normal turns.
- C71 **Set an advisor model at launch (--advisor)** [Claude]: Only the /advisor command exists; no launch flag.
- C72 **Settings for reasoning summaries and response length** [ChatGPT]: No config key shortens responses or turns reasoning summaries off.
- C73 **Start with customizations switched off to find what trips a problem (--safe-mode)** [Claude]: No flag runs a session with instructions, skills, MCP and hooks disabled;
- C74 **Ultrafast low-latency tier above fast mode** [ChatGPT]: /fast is one swap to a faster catalog model;
- C75 **ultrathink keyword for one deep-reasoning turn** [Claude]: No keyword in a prompt raises effort for one turn;
- C76 **Unattended retry of capacity errors (retry watchdog)** [Claude]: On 429 or 5xx the CLI moves to the next fallback model or stops;
- C77 **Warning before a model switch throws away the warm prompt cache** [Claude]: /model switches at once with no cost warning.

### Search and research (2)
- C78 **Web search call limit per session** [Claude]: No cap or refill on searches; web_fetch can be turned off with --disallowedTools.
- C79 **Web search modes and --search flag** [ChatGPT]: web_search is one live search; no cached, indexed or disabled mode, no --search flag and no context size or location setting.

### Files, media and creation (2)
- C80 **Artifact tool on/off setting (enableArtifact)** [Claude]: No key switches artifact publishing off.
- C81 **Send a generated file to your phone from the session** [Claude]: No tool delivers files to a phone; hand-off moves the conversation only.

### Artifacts and documents (5)
- C82 **Artifact pages that read live data through connectors** [Claude]: Published pages are static content; no live connector data.
- C83 **Artifact permission prompt, auto-open and off switches** [Claude]: The CLI does not ask before publish beyond the command itself and has no artifact on/off or auto-open setting.
- C84 **Create living documents (/docs, Docs templates, Docs connector)** [Claude]: No /docs command; the CLI only reads attached documents.
- C85 **Design canvas and design system commands (/design, /design-sync)** [Claude]: No /design or /design-sync command in the terminal.
- C86 **Reopen the latest artifact with a key and a session pill** [Claude]: No shortcut or on-screen pill reopens the latest artifact.

### Accessibility and languages (8)
- C87 **Announced deletions when editing text** [Claude]: Ours does not announce text deleted by line-editing shortcuts.
- C88 **Cost summary printed at exit in screen reader mode** [Claude]: Ours prints no cost summary on exit in screen reader mode.
- C89 **Jump between turns with terminal prompt markers (OSC 133)** [Claude]: Ours writes no prompt markers, so terminals cannot jump between turns.
- C90 **Published accessibility conformance report for the CLI** [Claude]: No conformance report covers the CLI; the accessibility page does not mention it.
- C91 **Response language setting** [Claude]: Ours has no setting that makes the agent reply in a chosen language.
- C92 **Screen magnifier cursor that follows the caret** [Claude]: Ours has no option to keep the terminal cursor on the input caret for magnifiers.
- C93 **Screen reader cursor pre-park delay (CLAUDE_AX_PREPARK_MS)** [Claude]: No variable holds the cursor at line start for a screen reader;
- C94 **Screen reader startup confirmation and pause** [Claude]: Ours prints no line saying screen reader mode is on and no pause before the first prompt.

### Agents, tasks and automation (52)
- C95 **Agent and HTTP hook handlers** [Claude]: Ours runs command hooks only; an agent handler type exists in the protocol crate but nothing runs it, and there are no HTTP hooks.
- C96 **Agent team display in split panes** [Claude]: Ours shows teammates in the one session only;
- C97 **Agent view keyboard shortcuts** [Claude]: There is no agent view screen; background runs are a text list.
- C98 **Agent view scoped to one project (--cwd)** [Claude]: There is no agent view; agi background list has no folder filter.
- C99 **Agent view settings (defaultToAgentsView, leftArrowOpensAgents)** [Claude]: There is no agent view to configure.
- C100 **Agent view: dispatch a new session with agent, repo, command or PR mentions** [Claude]: There is no agent view screen; background runs are a text list.
- C101 **Agent view: filter sessions (a:, s:, n:, o:, PR number)** [Claude]: There is no agent view screen; background runs are a text list.
- C102 **Agent view: footer hint and count of sessions waiting on you** [Claude]: There is no agent view screen; background runs are a text list.
- C103 **Agent view: group, pin, reorder and rename sessions** [Claude]: There is no agent view screen; background runs are a text list.
- C104 **Agent view: one screen of all background sessions** [Claude]: Ours lists background runs in plain text;
- C105 **Agent view: one-line row summaries from a small model** [Claude]: There is no agent view screen; background runs are a text list.
- C106 **Agent view: paste images and long text into a dispatch** [Claude]: There is no agent view screen; background runs are a text list.
- C107 **Agent view: peek panel and inline reply** [Claude]: There is no agent view screen; background runs are a text list.
- C108 **Agent view: pull request status label on rows** [Claude]: There is no agent view screen; background runs are a text list.
- C109 **Auto-restart of a stalled background agent (CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS, stallMs)** [Claude]: No stall timer or restart for subagents or workflow steps was found.
- C110 **Background session removal flags (--discard-unpushed, --force-remove-worktree)** [Claude]: agi background rm takes only an id; background runs have no worktree of their own to protect.
- C111 **Background sessions edit in an isolated worktree** [Claude]: Ours background runs edit the working directory directly.
- C112 **Channels: push events from chat apps or servers into a session** [Claude]: Ours has triggers that start new runs but no channel that pushes into a running session.
- C113 **Cloud session from local code when the repo has no remote** [Claude]: Cloud Code starts only from a GitHub checkout;
- C114 **Cloud session network access level and secrets** [Claude]: Every cloud session gets one fixed network level and no per-environment secrets are set from the CLI.
- C115 **Define subagents inline per session and extend their prompt** [Claude]: Ours has no inline agents flag or flag to append text to every subagent prompt.
- C116 **Deny named subagents by permission rule** [Claude]: Ours permission rules cannot name a subagent to refuse.
- C117 **Effort level that plans a workflow for every task (ultracode)** [Claude]: Ours effort levels stop at max; no setting turns every task into a workflow.
- C118 **GitLab CI integration** [Claude]: Ours has no GitLab CI job or integration.
- C119 **Goal loop: keep working until a condition is met** [Claude]: Ours has no /goal command or completion-condition loop.
- C120 **Hook handler types beyond shell commands (HTTP, prompt, agent, MCP tool)** [Claude]: A hook can only run a shell command or a program with arguments.
- C121 **Hook on configuration changes** [Claude]: Ours has no config-change hook event.
- C122 **Message other running sessions, and receive messages in headless runs** [Claude]: Sessions cannot message each other; only teammates inside one session talk.
- C123 **MessageDisplay hook (displayContent)** [Claude]: No display hook.
- C124 **Messages between separate sessions** [Claude]: Ours messages only teammates inside one team;
- C125 **One default model for all subagents** [Claude]: A subagent runs on the parent session model unless its own agent file names one;
- C126 **One task list shared by several sessions (CLAUDE_CODE_TASK_LIST_ID)** [Claude]: Task lists are per session or per team; separate sessions cannot share one.
- C127 **Permission changes returned by a PermissionRequest hook (addRules, setMode, addDirectories)** [Claude]: Hook output can block, stop, rewrite tool input or output, and add context;
- C128 **Pick the default cloud environment from the CLI (/remote-env)** [Claude]: Ours /remote-env only prints proxy and API base variables;
- C129 **Plan-first teammates that need the lead to approve their plan** [Claude]: Teammates start working at once; there is no plan-then-approve step.
- C130 **PostToolUse note for the auto mode classifier (classifierContext)** [Claude]: Auto mode uses fixed command rules, so there is no classifier to annotate for.
- C131 **PostToolUseFailure hook** [Claude]: No separate failure event; PostToolUse is the only after-tool event. Whether a failed call reaches PostToolUse was not traced.
- C132 **Resume a finished subagent with a follow-up message** [Claude]: A finished subagent cannot be continued;
- C133 **Run a shell command as a background job (--exec, ! prefix in agent view)** [Claude]: agi background start takes a prompt only;
- C134 **Saved workflows as reusable scripts with a run list** [Claude]: /workflow plans a goal once; there is no saved workflow, run list, stop or resume.
- C135 **ScheduleWakeup for self-paced loops** [Claude]: No loop and no wake-up tool.
- C136 **Send a follow-up message to a running cloud session from the CLI** [Claude]: agi code lists, shows, opens, approves or rejects cloud sessions, but cannot send a new message to one.
- C137 **Session-local recurring prompt (/loop)** [Claude]: No command repeats a prompt on an interval inside one session.
- C138 **Slow subagents move to the background on their own (CLAUDE_AUTO_BACKGROUND_TASKS)** [Claude]: No automatic move to the background.
- C139 **Subagent extras in the agent file: own hooks, worktree isolation, background flag, first prompt, skip CLAUDE.md** [Claude]: Agent files have no keys for hooks, isolation, background, first prompt or leaving out project instructions.
- C140 **SubagentHandback report delivery** [Claude]: Subagent results return as plain tool output.
- C141 **Switch off the built-in subagents (CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS, CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS)** [Claude]: No switch or rule removes a built-in agent type.
- C142 **Switches to turn off background agents, scheduler and workflows** [Claude]: Ours has no setting or environment variable to switch these features off.
- C143 **TaskCreated and TaskCompleted hooks** [Claude]: No hook fires when a task is created or completed.
- C144 **Teammates in split terminal panes (tmux or iTerm2)** [Claude]: Teammates run only inside the one terminal;
- C145 **Turn all hooks off with one switch** [Claude]: HooksConfig holds only hooks and a sandbox flag (apps/cli/src/features/hooks/hooks.rs:512-524);
- C146 **Workflow settings: keyword trigger and size guideline (workflowKeywordTriggerEnabled, workflowSizeGuideline)** [Claude]: /workflow has a fixed step cap per stage;

### Browser actions (4)
- C147 **Computer use: operate desktop apps by screen** [Claude]: The CLI cannot see or click the screen; the device registry reports computer use as false.
- C148 **Managed allowClaudeInChromeWithManagedMcp: keep the built-in browser server when MCP is locked down** [Claude]: There is no local managed MCP file to lock servers, and the workspace MCP allowlist has no exemption for the built-in browser bridge.
- C149 **Record a GIF of a browser flow** [Claude]: Browser tools are limited to read, find, click, type, fill, navigate, history, screenshot, console and network.
- C150 **Upload a local file into a web page** [Claude]: No browser tool attaches a file to a page upload field.

### Coding agent (140)
- C151 ★ **Async background hooks**: Hooks are blocking or non-blocking but never wake the agent later.
- C152 ★ **Auto mode pauses after repeated blocked actions**: No count of consecutive denials; only deny-all-remaining for a turn.
- C153 ★ **Connect the GitHub app from the terminal**: /install-github-app only prints the app install link;
- C154 ★ **Custom security guidance and per-edit patterns**: No guidance or patterns file.
- C155 ★ **Dev Container install**: No Dev Container Feature; install is the CLI binary.
- C156 ★ **Reply must match a JSON schema (--json-schema, --output-schema)**: No flag constrains the final answer to a schema or writes it to a file.
- C157 ★ **Turn all hooks off**: No setting turns off user hooks.
- C158 ★ **Validate a finding and generate a verified patch**: No command checks a finding against code or drafts a verified fix patch.
- C159 ★ **Whole-repository vulnerability scan**: /security-review reviews pending changes only;
- C160 ★ **Write your own Auto mode rules and trusted environment**: /auto-mode-setup reviews the mode, but there are no user rule lists, trusted-environment notes or defaults/critique commands.
- C161 **--disable-slash-commands flag** [Claude]: No flag turns slash commands or skills off for a run.
- C162 **/run and /verify to launch the app and see a change working** [Claude]: No command launches the app and drives it;
- C163 **/verify builds and runs the app to check a finished change** [Claude]: No /verify command or skill; the session only recognises test and build commands it ran, to report in a handoff.
- C164 **A deny rule with only a tool name hides the tool from the model** [Claude]: Deny rules block calls at run time; a denied tool still appears in the model's tool list.
- C165 **Agent-based and other hook types beyond shell commands** [Claude]: Hooks only run a command; there is no agent, prompt or HTTP hook type.
- C166 **Auto mode shell subcommands (auto-mode defaults, config, critique, reset)** [Claude]: Only /auto-mode-setup exists inside a session;
- C167 **Auto mode: send every shell command to the classifier** [Claude]: No setting to route every shell command through the classifier or to drop broad allows.
- C168 **Auto-compaction stops when one output refills the context** [Claude]: Compaction triggers at a fixed share of the window with no repeat guard.
- C169 **Automatic review of approvals in exec (--approve-for-me)** [ChatGPT]: Headless exec has no automatic approval review;
- C170 **Automatic security review at end of turn or before commit** [Claude]: Reviews run only when asked.
- C171 **Background daemon the CLI reuses** [ChatGPT]: agi daemon runs triggers (cron, webhooks), not a shared server for interactive sessions.
- C172 **Bare run that skips hooks, skills, plugins and project files (--bare)** [Claude]: No flag turns off hooks, skills and project instructions for one run.
- C173 **Built-in git instructions toggle (includeGitInstructions)** [Claude]: No key removes the built-in git guidance.
- C174 **Bulk scan retries (--max-attempts) and per-attempt reports** [ChatGPT]: No security scan command exists in the CLI;
- C175 **Bulk scan workers, knowledge base and prompt files (--workers, --knowledge-base)** [ChatGPT]: No security scan command exists in the CLI;
- C176 **Bulk scans across many repos with SARIF export** [ChatGPT]: No bulk scan, CSV inventory or SARIF output.
- C177 **Bulk-scan many repositories in one campaign** [ChatGPT]: No multi-repository scan.
- C178 **Bundled skill /artifact-capabilities** [Claude]: No bundled skill or command by this name;
- C179 **Bundled skill /artifact-diagramming** [Claude]: No bundled skill or command by this name;
- C180 **Bundled skill /claude-in-chrome** [Claude]: No bundled skill or command by this name;
- C181 **Bundled skill /plugin-authoring** [Claude]: No bundled skill or command by this name;
- C182 **Bundled skill /run-skill-generator** [Claude]: No bundled skill or command by this name;
- C183 **Bundled skill /workflow-authoring** [Claude]: No bundled skill or command by this name;
- C184 **Bundled skills /simplify, /verify, /run, /update-config, /fewer-permission-prompts** [Claude]: None of these bundled commands exist; /batch is a different glob-and-prompt fan-out.
- C185 **Bypass mode refuses to run as root** [Claude]: Bypass runs as root without a check; the sandbox note does not stop it.
- C186 **Checkpoint count and retention settings** [Claude]: Checkpoints exist but no setting for how many to keep or how long.
- C187 **Clear context when accepting a plan** [Claude]: /plan accept approves the plan and keeps the conversation.
- C188 **Clickable file citations that open in an editor (file_opener)** [ChatGPT]: File references are plain text.
- C189 **Clickable issue references like owner/repo#123** [Claude]: No terminal hyperlink output for issue or PR references.
- C190 **Cloud environments with network access, variables and setup scripts** [Claude]: No environment configuration in the CLI;
- C191 **Cloud session from a local repo without GitHub** [Claude]: Cloud start needs a GitHub checkout; no upload of a local-only repo.
- C192 **Cloud session from a repo with no GitHub** [Claude]: agi code start needs a GitHub checkout.
- C193 **Cloud setup scripts and service start** [Claude]: No cloud environment setup script is editable from the CLI;
- C194 **Code review rules section in AGENTS.md** [ChatGPT]: Review reads no rules section from instruction files.
- C195 **Compact Instructions section that steers the summary** [Claude]: /compact accepts a focus argument, but instruction files are not read for a compaction section.
- C196 **Configurable diagnostic log folder** [ChatGPT]: Only the daemon has a log folder; there is no setting.
- C197 **Connect the CLI terminal UI to a remote app-server** [ChatGPT]: The CLI hosts an app server but its terminal UI cannot attach to a remote one.
- C198 **Connect the terminal to an IDE (/ide, --ide)** [Claude]: /ide prints where to get AGI Code; the terminal does not connect to an editor.
- C199 **Custom language server for any language** [Claude]: Code intelligence is a fixed server list: rust, TypeScript and JavaScript, Go and Python.
- C200 **Custom named permission profiles with filesystem rules** [ChatGPT]: Only a fixed profile per permission mode exists;
- C201 **Custom severity rubric (--rubric)** [ChatGPT]: No security scan command exists in the CLI;
- C202 **Custom validation step for findings (--validation-prompt-file, --validate)** [ChatGPT]: No security scan command exists in the CLI;
- C203 **Deep scan time and cost caps (--max-time, --max-cost)** [ChatGPT]: No security scan command exists in the CLI;
- C204 **Design and chart skills (/design, /slides, /dataviz)** [Claude]: The CLI has no design, slides or chart command;
- C205 **Design commands (/design, /design-sync)** [Claude]: No design commands.
- C206 **Dispatch a cloud run on a chosen environment from a script** [Claude]: agi code start has no environment or ref flag.
- C207 **Edit tools refuse non-UTF-8 and binary files** [Claude]: Reads decode with lossy UTF-8 and no refusal check was found.
- C208 **Edits to the main checkout blocked in an isolated session** [Claude]: No guard stops an isolated worktree session reaching the main checkout.
- C209 **Export a saved threat model (export --artifact threat-model)** [ChatGPT]: No security scan command exists in the CLI;
- C210 **Fast bare mode for scripts (--bare)** [Claude]: No --bare flag; every run loads local config.
- C211 **Follow-up message to a running cloud session** [Claude]: agi code has start, list, show, open and approve, but no command to send a message.
- C212 **GitHub Actions or GitLab CI integration** [Claude]: No GitHub Action or GitLab job ships; CI use is by running agi exec yourself.
- C213 **Gitignore-style path patterns in file rules** [Claude]: File rules are exact path keys for write, edit and patch;
- C214 **Hold messages from other sessions** [Claude]: No cross-session inbound messages.
- C215 **Hook shell choice (bash or powershell)** [Claude]: Hooks always run through the platform shell helper or a direct program launch;
- C216 **Hook spinner text (statusMessage) and prompt suppression** [Claude]: Hooks have no spinner message and no option to hide the blocked prompt text.
- C217 **Hooks can write environment variables for later commands** [Claude]: No env file handed to hooks.
- C218 **Hooks declared in skill and subagent frontmatter** [Claude]: Skills and subagents carry no hooks; hooks come only from user, plugin and managed files.
- C219 **Hooks for config changes, directory changes and added folders** [Claude]: None of the three events exist; FileChanged does.
- C220 **InstructionsLoaded hook when instruction files load** [Claude]: No event fires when instruction or rule files are loaded.
- C221 **Memory cap for shell tools** [Claude]: No memory limit is set on shell commands.
- C222 **Memory warning above a heap threshold** [Claude]: No memory-use warning.
- C223 **Mods that change Claude's behaviour or look with TypeScript** [Claude]: No user mod system; customization is plugins, skills, hooks and themes.
- C224 **Move the session to another folder (/cd)** [Claude]: No /cd; start a new session in the other folder.
- C225 **Named custom permission profiles** [ChatGPT]: Only built-in profiles tied to the permission mode exist;
- C226 **Non-interactive ultrareview command for CI** [Claude]: /ultrareview is a TUI command; no CLI subcommand.
- C227 **Open the worktree session in tmux (--tmux)** [Claude]: No --tmux flag.
- C228 **Overview screen of all background sessions** [Claude]: Same feature as row 154, which says Missing.
- C229 **Perforce read-only file protection** [Claude]: No Perforce support.
- C230 **Pin threads and keep ordered chat sections** [ChatGPT]: No pinning or sections in the session list.
- C231 **Plan mode tools the agent calls itself (EnterPlanMode, ExitPlanMode)** [Claude]: Plan mode is switched by the user (/plan, Shift+Tab, flag);
- C232 **PR and merge request status badge in the footer** [Claude]: The footer shows no PR or MR status.
- C233 **PR link URL template for internal review tools** [Claude]: No PR link template.
- C234 **Project and plugin path variables for hook scripts** [Claude]: Hooks get only a host PATH in the environment;
- C235 **Pull request attribution and commit trailer settings** [Claude]: No setting for commit or PR attribution text.
- C236 **Record which files a shell command changed (bashEditDiffEnabled, CLAUDE_CODE_BASH_EDIT_DIFF)** [Claude]: No setting records or reports files changed by a shell command.
- C237 **Reduced-refusal mode for authorized security work** [ChatGPT]: No such mode.
- C238 **Repo-wide security scan from the terminal with saved scans** [ChatGPT]: Only /security-review on the branch diff exists;
- C239 **ReportFindings structured code-review list** [Claude]: Review output is prose; no findings tool.
- C240 **Required MCP server failure aborts a run** [ChatGPT]: No required flag on MCP servers.
- C241 **Retries when a reply fails its JSON schema (MAX_STRUCTURED_OUTPUT_RETRIES)** [Claude]: There is no schema-bound output, so nothing to retry.
- C242 **Rules that restrict the /cd command** [Claude]: No /cd command and no rule type for directory changes.
- C243 **Run once ignoring user config and rules (--ignore-user-config, --ignore-rules, --trust)** [ChatGPT]: /trust marks a project; no flag ignores user config or rules for one run.
- C244 **Run-once hook (once field)** [Claude]: No once option exists on a hook.
- C245 **Scan dashboard, --headless progress and --json output** [ChatGPT]: No security scan command exists in the CLI;
- C246 **Scan then patch and open a draft PR (--patch, --patch-severity, --create-pr)** [ChatGPT]: No security scan command exists in the CLI;
- C247 **SDK session-state events and idle auto-exit (CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS, CLAUDE_CODE_EXIT_AFTER_STOP_DELAY)** [Claude]: No such switches; stream output has no idle-exit timer.
- C248 **Security guidance plugin that reviews its own edits** [Claude]: No built-in plugin that self-reviews edits for vulnerabilities.
- C249 **Security scan modes standard and deep with tuning flags (--workers, --subagents, --stop-after-no-new, --max-discovery-runs)** [ChatGPT]: No security scan command exists in the CLI;
- C250 **Security scan project config file (init, --config)** [ChatGPT]: No security scan command exists in the CLI;
- C251 **Security scan provider, model and effort selection** [ChatGPT]: No security scan command exists in the CLI;
- C252 **Security scan targets (--path, --diff, --working-tree, --exclude-path)** [ChatGPT]: No security scan command exists in the CLI;
- C253 **Security scans in CI with a severity gate** [ChatGPT]: No CI scan command or severity threshold.
- C254 **SECURITY.md files guide scans** [ChatGPT]: SECURITY.md is not read as scan guidance.
- C255 **Send the GitHub CLI token to cloud sessions (/web-setup)** [Claude]: Cloud sessions use the account's GitHub connection;
- C256 **Session scratchpad folder** [Claude]: No per-session scratch folder is created.
- C257 **SessionStart hook can add a first message, title and watch paths** [Claude]: SessionStart hooks run but their output fields for message, title and watch paths are not read.
- C258 **Setting to stop @ mentions from including file content** [Claude]: No switch turns off @ file inclusion.
- C259 **Show config layers and requirements (/debug-config)** [ChatGPT]: /config shows and sets values, but does not show which layer each value came from.
- C260 **Slash command /autocompact (set auto-compaction threshold)** [Claude]: No command or setting to choose the compaction threshold.
- C261 **Slash command /cd (move session to another directory)** [Claude]: No /cd; the session stays in the launch directory and /add-dir only adds more.
- C262 **Slash command /claude-api** [Claude]: No command loads a provider API reference.
- C263 **Slash command /color (prompt bar color)** [Claude]: No command sets the prompt bar color; /theme changes the whole palette instead.
- C264 **Slash command /deep-research** [Claude]: No deep-research command; /search answers one question from a web search.
- C265 **Slash command /design-login** [Claude]: No design commands exist, so there is no sign-in for them.
- C266 **Slash command /focus (condensed view)** [Claude]: No focus view; Ctrl-O only toggles full tool output.
- C267 **Slash command /install-github-app** [Claude]: Prints a fixed install link and a reminder to reconnect;
- C268 **Slash command /install-slack-app** [Claude]: No command installs a Slack app from the CLI.
- C269 **Slash command /list-agents (sessions Claude can message)** [Claude]: /agents lists agent definitions only, not live sessions or teammates to message.
- C270 **Slash command /loop (repeat a prompt on an interval)** [Claude]: No /loop; scheduled runs exist through agi schedules, which outlive the session instead.
- C271 **Slash command /port-task-data (bring a Cowork task into the CLI)** [Claude]: No command imports a task from another AGI app as files;
- C272 **Slash command /reload-skills** [Claude]: No /reload-skills; skills are read at start or after /skills import.
- C273 **Slash command /restart (apply update and resume)** [Claude]: agi update --install replaces the binary but nothing restarts the session.
- C274 **Slash command /settings (alias of /config)** [Claude]: /config exists; /settings is not registered.
- C275 **Slash command /web-setup (connect GitHub for cloud sessions)** [Claude]: No command connects GitHub from the terminal for cloud sessions.
- C276 **Slash commands /heapdump, /skill-doctor, /scroll-speed, /radio, /stickers** [Claude]: None of these exist in the CLI.
- C277 **Slash commands /subtask and /stop (forked subagent, stop background session)** [Claude]: Neither a /subtask nor a /stop command exists;
- C278 **Start a worktree from a pull request or merge request** [Claude]: -w takes a name only; it cannot start from a PR number or URL.
- C279 **Stash prompt, bring back a cleared draft** [Claude]: No stash key and no recovery of a cleared draft.
- C280 **Stream event when an API call is retried** [Claude]: The event stream reports fallback model switches but not each retry attempt.
- C281 **Streaming JSON input (--input-format stream-json)** [Claude]: The flag is refused on purpose; a test holds that it stays unaccepted until two-way SDK input is wired.
- C282 **Subagent events nested in the stream** [Claude]: Stream events have no parent tool id and subagent text is not forwarded.
- C283 **Subagents in their own worktrees** [Claude]: Agent definitions have no isolation field, so subagents share the working tree.
- C284 **Suspend (Ctrl+Z) and background current task (Ctrl+B)** [Claude]: No such keys; /background does the detach by command.
- C285 **Temporary override file and size knobs for instruction files** [ChatGPT]: No override file and no setting for the size limit or fallback names;
- C286 **Triage findings: severity, owners, duplicates** [ChatGPT]: No triage commands.
- C287 **Triage, track and write up findings** [ChatGPT]: No finding triage, issue filing or report writing for security.
- C288 **Turn file checkpoints off (fileCheckpointingEnabled, CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING)** [Claude]: Checkpoints are always on; there is no key or switch.
- C289 **Unix socket allowlist in the sandbox** [ChatGPT]: With network off the sandbox denies local sockets, with no user list to allow one.
- C290 **Worktree settings: base ref, sparse checkout, symlinked folders** [Claude]: No worktree config for base ref, sparse checkout or symlinked node_modules;

### Connectors, apps, plugins and skills (73)
- C291 ★ **Skill listing context budget**: No cap or setting on how much context the skill list uses.
- C292 **Add an MCP server from JSON** [Claude]: agi mcp add takes flags only; there is no JSON form.
- C293 **Admin controls for channels** [Claude]: No channels, so no controls.
- C294 **Admin-provided MCP servers** [Claude]: Admins can restrict servers but not push their own to users.
- C295 **Ask the agent to write a mod that loads in the current session (plugin-authoring skill)** [Claude]: No mod system and no bundled plugin-authoring skill;
- C296 **Automatic install of a plugin's Node dependencies from its lockfile** [Claude]: Installing a plugin copies or clones it and checks hash or signature;
- C297 **Badge on connectors whose sign-in the organization manages** [Claude]: /connectors and /mcp show no marker for organization-managed sign-in.
- C298 **Channels: servers push events into a session** [Claude]: No channel support; schedules and triggers start new runs instead.
- C299 **defaultEnabled: a plugin that installs switched off** [Claude]: Installed plugins start enabled; the manifest has no default-off flag.
- C300 **Disable bundled skills** [Claude]: Built-in commands cannot be turned off by a setting.
- C301 **disableClaudeAiConnectors: stop the CLI fetching account connectors** [Claude]: The CLI lists account connectors (agi connectors, /connectors) and has no setting or managed key to stop that;
- C302 **Enterprise MCP sign-in with account grants** [ChatGPT]: MCP OAuth is per server; no organization-granted account sign-in for MCP.
- C303 **Environment variables inside MCP config** [Claude]: Config values are used literally; no variable expansion.
- C304 **Import MCP servers from Claude Desktop** [Claude]: agi migrate claude reads Claude Code; no Claude Desktop config import.
- C305 **Inline shell in skills (!command)** [Claude]: Skill bodies are plain text; no command injection step.
- C306 **Install with a marketplace flag that adds an unknown marketplace in the same command** [Claude]: agi marketplace get needs the marketplace already added to the account (agi marketplace add);
- C307 **Length limits on MCP server instructions and tool descriptions** [Claude]: No cap on tool description or server instruction length was found.
- C308 **Load a plugin for one session from a folder or URL** [Claude]: No flag loads a plugin folder or release zip for one session.
- C309 **Long MCP calls move to the background** [Claude]: A slow MCP call blocks the turn until its timeout;
- C310 **Managed allowAllClaudeAiMcps: load account connectors next to managed MCP servers** [Claude]: No managed MCP server file exists, so there is no switch to add account connectors beside it.
- C311 **Managed allowManagedMcpServersOnly: only the admin allowlist counts** [Claude]: The workspace policy allowlist (allowedMcpServers with mcpRestrictionActive) is already the only allowlist because users have none, but there is no local managed file and no key that makes user lists void.
- C312 **Managed disableCommandPluginSources: block plugins that install by running a command** [Claude]: Command-sourced plugins do not exist here (sources are a local path or git), so there is nothing to block and no managed key;
- C313 **Managed pluginTrustMessage: organization text on the plugin install trust warning** [Claude]: Plugin install checks a pinned hash or publisher signature and prints fixed text;
- C314 **Managed prependPlugins and appendPlugins: organization mods run before or after user mods** [Claude]: No mods (in-process plugin code) and no managed plugin ordering.
- C315 **Manifest declaration of the network hosts a plugin reaches** [Claude]: No hosts field; nothing lists a plugin's network reach at install or validate.
- C316 **Marketplace entry strict mode: merge the entry's components with the manifest or let the entry define them** [Claude]: No such switch in the marketplace entry model.
- C317 **Marketplace renames map and forced removal of deleted plugins** [Claude]: No rename migration or forced removal when a marketplace drops a plugin.
- C318 **MCP always-load exemption per server or tool** [Claude]: No per-server or per-tool setting to keep tools loaded;
- C319 **MCP image results shown inline** [Claude]: Tool results are read as text only; image content is dropped.
- C320 **MCP output size limits** [Claude]: No MCP-specific result cap or file spill;
- C321 **MCP read-only and idempotent hints** [Claude]: MCP tools always run one at a time; hints are not used.
- C322 **MCP resource tools for the model** [Claude]: Only your typed @ mention reads a resource;
- C323 **MCP server instructions** [ChatGPT]: The client stores instructions from the server but they are not passed to the model.
- C324 **MCP tasks that run long jobs on the server** [Claude]: No MCP tasks support or task list for server-side jobs.
- C325 **Model-side plugin and skill search tools** [Claude]: The agent has no tool to browse the plugin catalog;
- C326 **Mods: plugin code that hooks tool calls, prompts and turns** [Claude]: Hooks are command entries in hooks.json;
- C327 **Notice that each connected MCP server uses context, with a way to see the cost** [Claude]: Tool schemas are deferred, but nothing shows how much context each server costs.
- C328 **npm package as a plugin source, fetched without running install scripts** [Claude]: Plugin sources are a local path or a git URL only.
- C329 **Official plugin marketplace registers itself on first launch (with an off switch)** [Claude]: No built-in marketplace: the plugin registry URL must be set by the user (AGI_PLUGIN_REGISTRY_URL or plugins.registry_url) and resolving without it is an error.
- C330 **Organization-installed plugins shown at Managed scope and locked against disable or uninstall** [Claude]: Managed settings cannot install or lock a plugin;
- C331 **Packaged MCP bundles (.mcpb) in plugins** [Claude]: Plugins declare stdio command servers only;
- C332 **Permission rules for skills: deny the Skill tool or allow and deny one skill by name** [Claude]: Skills are switched off per skill (disabled list, /skills) or by plan capability;
- C333 **Plugin and marketplace auto-update** [Claude]: Updates are manual: agi plugin update and agi marketplace update.
- C334 **Plugin code calls a model itself (standalone completion or a fork of the session)** [Claude]: Plugins cannot call a model; only hooks (shell commands), skills, agents and MCP servers are loaded from a plugin.
- C335 **Plugin code follows each turn and can pick the model or effort for a step** [Claude]: No plugin hook can choose the model or effort for a turn;
- C336 **Plugin code sends messages to another session, subagent or teammate** [Claude]: No plugin API for cross-session messages.
- C337 **Plugin eval suite** [Claude]: No plugin evaluation command.
- C338 **Plugin executables on PATH from bin/** [Claude]: No bin directory handling for plugins was found.
- C339 **Plugin hot reload while the session runs, with an approval prompt and fallback to the last working version** [Claude]: /reload-plugins reloads on request; nothing watches plugin files and reloads on save.
- C340 **Plugin install hint: another CLI can prompt once to install its plugin** [Claude]: No hint tag is read from command output and no install prompt is raised from it.
- C341 **Plugin LSP servers** [Claude]: Plugin manifests have no language-server field and the CLI has no LSP client.
- C342 **Plugin output styles, themes, monitors and workflows** [Claude]: Plugin manifests carry commands, agents, skills, hooks, servers and apps only.
- C343 **Plugin prune, tag and test commands** [Claude]: None of these maintenance commands exist.
- C344 **Plugin sources: archive, command, authenticated** [Claude]: Plugins come from git, a local path or a marketplace;
- C345 **Plugin timers: recurring or one-shot background work inside the session** [Claude]: No plugin timer; hooks fire only on session events.
- C346 **Pre-approve project MCP servers in settings** [Claude]: Project servers always ask and re-ask when the launch changes;
- C347 **Remote MCP over WebSocket** [Claude]: Transports are stdio, SSE and HTTP only.
- C348 **Reset project MCP approvals** [Claude]: No command clears saved project-server approvals.
- C349 **Restore or discard plugin options and secrets set aside after uninstall** [Claude]: No set-aside store; there is no restore command.
- C350 **Scaffold a new plugin** [Claude]: No plugin scaffold command.
- C351 **Self-hosted cloud sessions: claude.ai connectors delivered to self-hosted sessions** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C352 **Self-hosted cloud sessions: MCP servers baked into the runner image** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C353 **Self-hosted cloud sessions: Turn off Claude Code Remote built-in MCP server** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C354 **Session-only plugins from a folder, zip or URL** [Claude]: Plugins must be installed; no flag or env loads one for a single session.
- C355 **Skill frontmatter: context fork and background subagent** [Claude]: Skills run inline in the conversation; no forked-subagent option.
- C356 **Skill live reload and /reload-skills** [Claude]: Skills are discovered at start; no reload command or file watching.
- C357 **Skill usage report (/skill-doctor)** [Claude]: No usage or cost report for skills.
- C358 **skillListingMaxDescChars: cap on description length per skill in the listing** [Claude]: No setting caps the per-skill description length shown to the model.
- C359 **Skills trash and recovery** [Claude]: Removing a skill deletes it; no trash folder.
- C360 **Skills-directory plugins: a folder with a plugin manifest under the skills folder loads as a plugin every session** [Claude]: Plugins load only from ~/.agiworkforce/plugins and the project's .agiworkforce/plugins;
- C361 **The model is told which MCP server failed to connect and why** [Claude]: Not found: failed servers are reported to the user in /mcp and startup lines, with no message added for the model.
- C362 **Uninstall of a project-enabled plugin offers 'disable for me' or 'remove for everyone'** [Claude]: Uninstall removes the one user-level copy.
- C363 **Validate a plugin or marketplace** [Claude]: Validation runs only during install; no validate command.

### Cross-device continuity (4)
- C364 **--desktop flag opens the directory in the desktop app** [Claude]: Only the /desktop command hands a running session over;
- C365 **Channels: send tasks in from Telegram, Discord, iMessage or webhooks** [Claude]: No chat-app channels. Webhook triggers exist as agi triggers, but no Telegram, Discord or iMessage bridge.
- C366 **Remote Control server flags: pre-create a session in the folder, bring back a session by id, starting permission mode, settings file, browser tools, debug log** [Claude]: agi remote-control (alias rc) takes no options at all;
- C367 **remoteControlAtStartup: connect Remote Control for every session** [Claude]: Remote Control starts only from agi remote-control or /remote-control;

### Device and OS integration (9)
- C368 ★ **Slash command /ide**: Prints a fixed note about AGI Code and a download link;
- C369 **autoConnectIde: connect to a running editor from an external terminal** [Claude]: No editor connection from the terminal exists (/ide prints a note), so no auto-connect setting.
- C370 **autoInstallIdeExtension: /ide installs the editor extension** [Claude]: /ide does not install the VS Code extension;
- C371 **Computer use: control native macOS apps from the CLI** [Claude]: The CLI drives a browser through its browser tools but cannot open or click native apps.
- C372 **Connect the terminal to an editor (/ide)** [Claude]: No command attaches this terminal to an open editor;
- C373 **Copy to the local clipboard over SSH (OSC 52)** [Claude]: /copy uses the machine's clipboard only;
- C374 **Deep links that open the CLI with a prefilled prompt** [Claude]: No URL scheme is registered for the CLI.
- C375 **diffTool: show proposed edits in the editor diff view or the terminal** [Claude]: Diffs always render in the terminal; no setting sends them to an editor.
- C376 **disableDeepLinkRegistration: stop registering the CLI link handler** [Claude]: The CLI registers no link handler, so there is nothing to disable (the deep-link feature itself is Missing).

### Help, feedback and support (10)
- C377 **'You should know' notes: a side agent posts a note above the prompt when it spots something** [Claude]: No side agent watches the session to post notes.
- C378 **/share sends a report and the session transcript to the vendor** [Claude]: No /share command; /feedback sends a rating and comment only.
- C379 **Claude-drafted feedback cards and feedback queue** [Claude]: /feedback sends only what you type; nothing drafts a report or keeps a queue.
- C380 **Doctor flags unused add-ons and audits instruction files** [Claude]: agi doctor reports health only; it does not recommend removing unused items or audit instruction files.
- C381 **Gateway log level and JSON log format env vars** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C382 **Heap snapshot command for memory problems** [Claude]: No command writes a memory snapshot; the support bundle from doctor has no heap data.
- C383 **OpenTelemetry export and rotating headers helper** [Claude]: The CLI has no OpenTelemetry exporter; its trace output is local logs only.
- C384 **Safe mode start with all customizations off** [Claude]: No flag starts without project instructions, plugins, hooks and MCP servers;
- C385 **Session quality survey** [Claude]: No in-session rating prompt.
- C386 **Sign-in diagnostics log file** [ChatGPT]: Sign-in writes no dedicated log file; failures are printed to the terminal.

### Install, release and update (14)
- C387 ★ **Homebrew install**: A Homebrew formula script exists but writes to a private tap and is not offered to users.
- C388 ★ **Native Windows installer (PowerShell, CMD or WinGet)**: The script needs Git Bash, MSYS2, Cygwin or WSL;
- C389 ★ **npm install**: No npm package; the CLI is published only as release archives and the script.
- C390 ★ **Public page shows the install command**: The CLI is still marked Coming soon on the site, so /cli and /download do not show the install command although v0.0.1 is published.
- C391 **Admin version floor and ceiling (minimum and maximum version)** [Claude]: Managed policy cannot hold a version limit and agi update cannot be pinned.
- C392 **Alpine and other musl Linux** [Claude]: install.sh refuses musl Linux because builds need glibc 2.35 or newer.
- C393 **HIPAA and zero data retention: HIPAA minimum app versions** [Claude]: The CLI has no HIPAA or zero-data-retention mode: nothing detects a covered account, switches features off for it or shows its status.
- C394 **Linux package repositories (apt, dnf, apk)** [Claude]: No apt, dnf or apk repository; Linux users use the script or the tar.gz archive.
- C395 **Package-manager installs update themselves (Homebrew, WinGet)** [Claude]: When the binary is owned by Homebrew, Nix, cargo or snap, agi update only tells the user to use that tool;
- C396 **Platform code signing (Apple notarization, Windows Authenticode)** [Claude]: The binaries carry no Apple Developer ID or Authenticode signature;
- C397 **Release channels (stable and latest)** [Claude]: One stable feed; prereleases are ignored and there is no way to pick a faster channel.
- C398 **Self-hosted cloud sessions: Pin and upgrade runner version** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C399 **Source available (open source CLI)** [ChatGPT]: The CLI is proprietary; the source is not published.
- C400 **Uninstall command and instructions** [Claude]: No agi uninstall command or documented removal steps;

### Memory and personalization (10)
- C401 **Choose the auto memory folder (autoMemoryDirectory)** [Claude]: The memory location is fixed under the config root;
- C402 **Compact a long conversation after an hour idle** [Claude]: Compaction runs on the limit or /compact only;
- C403 **Exclude chosen instruction files by pattern** [Claude]: No setting skips specific instruction or rules files.
- C404 **HTML comments stripped from instruction files** [Claude]: Instruction files are injected whole, comments included.
- C405 **Import other files into the instruction file with @path** [Claude]: Instruction files are sent as written; @path lines are not expanded.
- C406 **Limit on inline shell output sent to the model** [Claude]: No user setting caps shell output length sent to the model.
- C407 **Organization-wide instructions pushed by admins** [Claude]: The managed policy file carries no instruction text.
- C408 **Personal project instructions file (CLAUDE.local.md)** [Claude]: Only AGENTS.md, CLAUDE.md and the project instruction file are read;
- C409 **Subagents with their own persistent memory** [Claude]: Subagents do not keep memory between runs.
- C410 **Switch all instruction files off (CLAUDE_CODE_DISABLE_CLAUDE_MDS)** [Claude]: No switch skips AGENTS.md and rules for a run (and no --bare).

### Notifications (8)
- C411 ★ **Choose how the terminal alerts you (bell, iTerm2, Kitty, Ghostty, OSC 9)**: The only alert is a terminal bell on or off (ui.bell_on_finish);
- C412 **Alert only when the terminal is not focused, and only for chosen events** [ChatGPT]: The bell rings after any turn longer than a set time;
- C413 **Hooks can emit terminal notification, title and progress sequences** [Claude]: Hook output is captured; a hook cannot send escape sequences to the terminal.
- C414 **Listen for notifications pushed by plugin servers (--channels)** [Claude]: No flag listens for MCP channel notifications in a session.
- C415 **Plugin feedback surfaces: persistent status line under the prompt, toast, log line, desktop notification** [Claude]: Plugins cannot post status, toasts or notifications;
- C416 **Session status shown by terminals that support OSC 7501** [Claude]: The CLI sets the terminal title only; it sends no status sequence.
- C417 **The agent sends a notification itself when it decides to (PushNotification)** [Claude]: The agent has no tool to notify you; alerts come only from the finish bell and hooks.
- C418 **Warning to the agent when disk or memory is low** [Claude]: Nothing checks free disk or memory.

### Privacy, security and data (77)
- C419 ★ **Compare scans and record false-positive reasons**: No saved scans or findings store.
- C420 ★ **Compliance audit log export**: Org policy defines audit_export but no CLI code writes an audit export.
- C421 ★ **Custom CA bundle and mutual TLS for corporate networks**: No setting for a CA bundle or client certificate;
- C422 ★ **Export findings as JSON, CSV, SARIF or Markdown**: Findings come as text; no structured export.
- C423 ★ **External guardrail integration for prompts**: No hook for an external guardrail service on prompts or traffic.
- C424 ★ **Generate, apply and verify a patch for a finding**: Findings are not turned into verified patches.
- C425 ★ **HIPAA and zero-data-retention configurations**: The CLI has no HIPAA or ZDR mode that locks features for covered accounts.
- C426 ★ **OpenTelemetry export of sessions and tool events**: The CLI has no OpenTelemetry exporter; OTLP variables are only scrubbed from child environments.
- C427 ★ **Sandbox network allowlist by domain**: Sandboxed commands get only deny, external-only or full network;
- C428 ★ **Scan effort levels, exit codes and dry run for CI**: No scan command, so no severity exit codes.
- C429 ★ **Security scan of the whole repo or a focus area with verifier agents**: Only /security-review of changes exists;
- C430 **Advanced sandbox network knobs (proxy ports, Unix sockets, local binding)** [Claude]: None of these sandbox options are configurable.
- C431 **Approval before a memory file imports files outside the folder** [Claude]: Mentions and memory files read inside the file boundary, but there is no import-approval dialog.
- C432 **Auto mode classifier: custom rules, model choice and sub-agent review** [Claude]: The command safety classifier is fixed code;
- C433 **Claude can end an abusive conversation** [Claude]: No tool ends a session on abuse.
- C434 **Code Mode controls: permission checks on each call from code, an ask rule to approve each program, hook on its output, admin block** [Claude]: No Code Mode (a program that makes many tool calls) exists in the CLI, so none of its permission, hook or admin controls apply.
- C435 **Command sandbox on Windows** [ChatGPT]: Windows has no sandbox backend, so commands there run with full user rights.
- C436 **Commands excluded from the sandbox (excludedCommands)** [Claude]: No per-command exclusion list; the sandbox is on, off or forced per workspace.
- C437 **Cross-marketplace dependency allowlist** [Claude]: Dependencies install from the configured plugin registry under the signature policy;
- C438 **Data residency selection** [ChatGPT]: The CLI has one API base setting; no residency region choice.
- C439 **Demo mode hides email and organization** [Claude]: /status and the header always show the account.
- C440 **Draft a SECURITY.md policy** [ChatGPT]: No policy-drafting command.
- C441 **Feedback sends transcript with scope choice and quality survey** [Claude]: /feedback sends only the typed subject and message, with no transcript or session survey.
- C442 **Gateway IP allow/deny lists** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C443 **Gateway private-network and TLS fingerprint pinning guards** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C444 **Gateway telemetry relay via OTLP to your collectors** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C445 **Gateway: Direct-to-collector telemetry via policy env** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C446 **Gateway: Telemetry destination failure handling** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C447 **Gateway: Telemetry stamped with user identity and groups** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C448 **HIPAA and zero data retention: Features disabled under HIPAA** [Claude]: The CLI has no HIPAA or zero-data-retention mode: nothing detects a covered account, switches features off for it or shows its status.
- C449 **HIPAA and zero data retention: Features disabled under ZDR** [Claude]: The CLI has no HIPAA or zero-data-retention mode: nothing detects a covered account, switches features off for it or shows its status.
- C450 **HIPAA and zero data retention: Features turned off by HIPAA configuration** [Claude]: The CLI has no HIPAA or zero-data-retention mode: nothing detects a covered account, switches features off for it or shows its status.
- C451 **HIPAA and zero data retention: HIPAA BAA coverage without ZDR** [Claude]: The CLI has no HIPAA or zero-data-retention mode: nothing detects a covered account, switches features off for it or shows its status.
- C452 **HIPAA and zero data retention: HIPAA configuration for Claude Code local mode** [Claude]: The CLI has no HIPAA or zero-data-retention mode: nothing detects a covered account, switches features off for it or shows its status.
- C453 **HIPAA and zero data retention: HIPAA configured indicators and monitoring** [Claude]: The CLI has no HIPAA or zero-data-retention mode: nothing detects a covered account, switches features off for it or shows its status.
- C454 **HIPAA and zero data retention: HIPAA eligible connections** [Claude]: The CLI has no HIPAA or zero-data-retention mode: nothing detects a covered account, switches features off for it or shows its status.
- C455 **HIPAA and zero data retention: HIPAA mode: tools, memory and permission modes in local sessions** [Claude]: The CLI has no HIPAA or zero-data-retention mode: nothing detects a covered account, switches features off for it or shows its status.
- C456 **HIPAA and zero data retention: HIPAA status indicators** [Claude]: The CLI has no HIPAA or zero-data-retention mode: nothing detects a covered account, switches features off for it or shows its status.
- C457 **HIPAA and zero data retention: Policy-violation retention under ZDR** [Claude]: The CLI has no HIPAA or zero-data-retention mode: nothing detects a covered account, switches features off for it or shows its status.
- C458 **HIPAA and zero data retention: ZDR enterprise admin capabilities** [Claude]: The CLI has no HIPAA or zero-data-retention mode: nothing detects a covered account, switches features off for it or shows its status.
- C459 **HIPAA and zero data retention: ZDR scope exclusions** [Claude]: The CLI has no HIPAA or zero-data-retention mode: nothing detects a covered account, switches features off for it or shows its status.
- C460 **Import external scanner findings** [ChatGPT]: No import path.
- C461 **Local transcript retention period (cleanupPeriodDays)** [Claude]: Org policy has a retention_days field but the CLI never reads it, and no sweep deletes old local sessions.
- C462 **Managed instruction text delivered by the organization** [Claude]: Managed document has policy, config, trust, hooks, plugins and sandbox sections, but no instruction text.
- C463 **Managed sandbox allowManagedReadPathsOnly: only admin read paths count** [Claude]: No user or managed read-path lists exist for the sandbox.
- C464 **Managed sandbox.bwrapPath and sandbox.socatPath: name the sandbox binaries outside PATH** [Claude]: The Linux sandbox finds bwrap itself and uses no socat proxy;
- C465 **Managed sandbox.network.allowManagedDomainsOnly: only admin-listed domains are reachable** [Claude]: Sandboxed commands have no domain allowlist at all, managed or user.
- C466 **MCP tool that always asks for approval** [Claude]: The MCP layer does not read a server's tool annotations, so a server cannot force a prompt for one tool.
- C467 **Memory cap on commands the agent runs** [Claude]: No setting limits memory for shell commands.
- C468 **OpenTelemetry export to your own collector** [Claude]: The CLI has no OpenTelemetry exporter, no per-developer cost attribution export and no collector settings.
- C469 **OpenTelemetry: OpenTelemetry content and attribute gates** [Claude]: The CLI has no OpenTelemetry exporter, so this export option has no counterpart;
- C470 **OpenTelemetry: OpenTelemetry export tuning** [Claude]: The CLI has no OpenTelemetry exporter, so this export option has no counterpart;
- C471 **OpenTelemetry: Survey routing to own OpenTelemetry collector** [Claude]: The CLI has no OpenTelemetry exporter, so this export option has no counterpart;
- C472 **Pasted text marked as untrusted for the model** [Claude]: Summaries mark history untrusted, but pasted user text is sent as-is without a warning to the model.
- C473 **Placeholder credential substitution so the model never sees secrets** [Claude]: Credentials are scrubbed and redacted, but there is no proxy that swaps in real values at send time.
- C474 **Pre-commit hook that scans staged changes** [ChatGPT]: No hook installer for scans.
- C475 **Reference dev container and whole-process sandbox runtime** [Claude]: No devcontainer, firewall script or whole-process sandbox wrapper ships with the repository.
- C476 **Request body compression switch and hide-working-directory switch** [Claude]: No setting turns request compression on or off and none hides the working directory from the prompt or telemetry.
- C477 **Restricted mode for evaluation harnesses** [Claude]: No restricted launch flag exists; a harness must combine tool deny flags itself.
- C478 **Route print-mode permission prompts to an MCP tool or host** [Claude]: Headless runs refuse unapproved actions;
- C479 **sandbox.credentials awsPairs and sigv4: re-sign AWS requests with masked credentials** [Claude]: No credential proxy, so no AWS re-signing options.
- C480 **sandbox.filesystem.disabled: keep network isolation but lift file isolation** [Claude]: Sandbox modes are whole presets (read-only, workspace-write, full access);
- C481 **sandbox.ignoreViolations: silence expected sandbox violation reports** [Claude]: No violation-report filter setting.
- C482 **sandbox.network.allowMachLookup: extra macOS service names a sandboxed command may reach** [Claude]: The macOS sandbox has a fixed built-in service allowlist;
- C483 **sandbox.ripgrep: point the sandbox at your own ripgrep binary** [Claude]: No setting names a search binary for the sandbox.
- C484 **Scan of subagent reports for injected instructions** [Claude]: Subagent results are logged in an audit file but not scanned or marked for instruction-like text.
- C485 **Self-hosted cloud sessions: decode-token subcommand for wrapper scripts** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C486 **Self-hosted cloud sessions: Repo-committed permission rule restrictions** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C487 **Self-hosted cloud sessions: Session access token (JWT) in self-hosted sessions** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C488 **Self-hosted cloud sessions: Telemetry controls for session children** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C489 **Server-delivered managed settings with approval dialog** [Claude]: Managed settings come only from a local MDM file or environment path, with no server delivery or approval dialog.
- C490 **Tenant restrictions: network-level control of which organizations a device can sign in to** [Claude]: No header or proxy-based tenant restriction is honored at sign-in;
- C491 **Transcript retention period** [Claude]: Sessions stay until you archive or delete them;
- C492 **useAutoModeDuringPlan: classifier reviews shell commands while in plan mode** [Claude]: No auto-mode classifier exists; plan mode is read-only by rule.
- C493 **Warning dialog before auto or bypass mode first use** [Claude]: --dangerously-skip-permissions starts at once with no acceptance dialog;
- C494 **Weaker sandbox switches for containers and special tools** [Claude]: No nested-container, Apple Events, Unix socket or TLS-trust switches;
- C495 **Web fetch result is read by a separate model before it reaches the main model** [Claude]: No second model call summarizes or screens a fetched page;

### Settings (113)
- C496 ★ **Alternate screen and scrollback choice**: Ours TUI always enters the alternate screen;
- C497 ★ **Clickable terminal links**: Links print as plain text (/links lists and opens them);
- C498 ★ **Custom CA certificates and certificate store choice**: Ours has no CA bundle setting; it passes SSL_CERT_FILE to child processes only.
- C499 ★ **Rotating spinner tips toggle**: Ours shows no rotating tips, so there is also no setting to hide them.
- C500 **API key helper script for rotating credentials** [Claude]: Ours reads keys from the credential store or env;
- C501 **Auto charts from tool results** [Claude]: No chart tool or automatic charting of tool results.
- C502 **Auto-compact window and idle compaction settings** [Claude]: Context compacts on its own and with /compact, but no flag or setting changes the window or compacts an idle session.
- C503 **Auto-continue at a usage limit** [Claude]: The CLI reports the limit and when it resets but does not resume by itself.
- C504 **Auto-scroll setting for the transcript** [Claude]: No setting controls whether the view follows new output.
- C505 **Automatic recap on return** [ChatGPT]: /recap is a command you run; nothing recaps automatically after you were away.
- C506 **Bare mode for scripted runs** [Claude]: No flag skips hooks, skills, plugins, MCP and instruction files for a lean scripted call.
- C507 **Build an allowlist from past approvals** [Claude]: No command scans earlier sessions to propose allow rules.
- C508 **Cache lifetime and prompt-caching switches** [Claude]: No setting picks a cache lifetime or turns prompt caching off.
- C509 **Cap on stored tool output size** [ChatGPT]: Ours has no setting for tool output size kept in the session.
- C510 **Commit and PR attribution settings** [Claude]: No setting edits or removes attribution lines or the built-in git instructions.
- C511 **Config layer listing and strict config check** [ChatGPT]: No /debug-config and no flag that errors on unknown config keys.
- C512 **Copy on select** [Claude]: Selected text is not copied automatically;
- C513 **Custom @ file suggestion command** [Claude]: The @ picker lists workspace files filtered by .gitignore;
- C514 **Custom request headers, beta flags and API timeouts by environment variable** [Claude]: Out-of-scope BYOK providers aside, the account route takes no user headers or timeout variable;
- C515 **Custom spinner verbs and tips** [Claude]: The working indicator and tips cannot be customized or hidden.
- C516 **Custom status line from your own command** [Claude]: /statusline only picks which built-in fields show;
- C517 **Emoji shortcode completion** [Claude]: Typing :name: in the composer does not suggest or replace emoji.
- C518 **Environment variables set in settings** [Claude]: config.toml has no env block that sets variables for sessions.
- C519 **Footer link badges from patterns** [Claude]: Ids such as issue keys in the conversation do not become footer link badges.
- C520 **Generic per-run config override flag (-c key=value)** [ChatGPT]: Ours -c means continue; no flag sets an arbitrary config key for one run, only fixed flags and env.
- C521 **Granular approval categories and auto-review** [ChatGPT]: Approvals are one policy through the permission mode;
- C522 **HIPAA and zero data retention: HIPAA configuration permission defaults** [Claude]: The CLI has no HIPAA or zero-data-retention mode: nothing detects a covered account, switches features off for it or shows its status.
- C523 **Keep the machine awake while a turn runs** [ChatGPT]: Ours does not hold the system awake during a long turn.
- C524 **Launch shell choice and command wrapper (SHELL_PREFIX, PROCESS_WRAPPER)** [Claude]: Ours has no setting to pick the shell or wrap commands with a prefix.
- C525 **Mods that draw panes and restyle the interface** [Claude]: Plugins add hooks, skills and servers but cannot draw panes, bands or buttons, rewrite displayed text or intercept requests.
- C526 **Mods: user-built panels, status bands, commands and hooks** [Claude]: Ours has plugins, hooks and skills but no mod system for custom panels or screen elements.
- C527 **Mouse wheel scroll speed setting** [Claude]: Ours has no scroll speed setting.
- C528 **Mouse wheel speed, acceleration and mouse capture options** [Claude]: The TUI does not capture the mouse, so there is no wheel scrolling to tune;
- C529 **Named config profiles (--profile)** [ChatGPT]: Ours has no named profile files for CLI runs.
- C530 **Personal per-project settings file kept out of git** [Claude]: Ours has only the shared project config file;
- C531 **Plugin state and a store shared by all sessions on the machine** [Claude]: Plugins keep no managed state; the only persisted plugin values are its settings (userConfig).
- C532 **Plugin validate and test commands** [Claude]: agi plugin has list, install, sign and manage commands but no validate or test command.
- C533 **Plugins can ship output styles and color themes** [Claude]: Ours plugins cannot contribute themes or output styles;
- C534 **Prompt suggestions (grayed predicted next prompt)** [Claude]: Ours does not predict or show a suggested next prompt.
- C535 **Prose width cap for readable lines** [Claude]: Ours wraps to terminal width with no cap setting.
- C536 **Question and dialog timeouts** [Claude]: An unanswered question waits forever; there is no auto-continue or expiry setting.
- C537 **Restricted mode flag (--restricted)** [Claude]: Ours has no single restricted flag; sandbox mode and trust gates are set separately.
- C538 **Resumed sessions use current or saved folder (tui.resume_cwd)** [ChatGPT]: Ours has no setting; resume uses the saved session folder.
- C539 **Safe mode and disable-all-hooks switch** [Claude]: Ours has no single switch that turns off all hooks and plugins for a session.
- C540 **Safe mode that loads no plugins** [Claude]: No flag starts without any installed plugin;
- C541 **Self-hosted cloud sessions: Disable Artifact tool in sessions (CLAUDE_CODE_DISABLE_ARTIFACT)** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C542 **Self-hosted cloud sessions: Orchestrator flag --debug-dir** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C543 **Self-hosted cloud sessions: Orchestrator flag --expected-spawn-seconds** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C544 **Self-hosted cloud sessions: Orchestrator flag --hook-concurrency** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C545 **Self-hosted cloud sessions: Orchestrator flag --hook-label** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C546 **Self-hosted cloud sessions: Orchestrator flag --hook-timeout** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C547 **Self-hosted cloud sessions: Orchestrator flag --min-idle** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C548 **Self-hosted cloud sessions: Orchestrator flag --shutdown-drain-sec** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C549 **Self-hosted cloud sessions: Runner environment-variable-only settings** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C550 **Self-hosted cloud sessions: Runner flag --api-url** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C551 **Self-hosted cloud sessions: Runner flag --base-dir** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C552 **Self-hosted cloud sessions: Runner flag --capacity** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C553 **Self-hosted cloud sessions: Runner flag --client-label** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C554 **Self-hosted cloud sessions: Runner flag --configure-git** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C555 **Self-hosted cloud sessions: Runner flag --confine-repo-settings** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C556 **Self-hosted cloud sessions: Runner flag --debug-token-dir** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C557 **Self-hosted cloud sessions: Runner flag --defer-shutdown-max-min** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C558 **Self-hosted cloud sessions: Runner flag --drain-grace-sec** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C559 **Self-hosted cloud sessions: Runner flag --drain-marker-file** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C560 **Self-hosted cloud sessions: Runner flag --drain-wait-sec** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C561 **Self-hosted cloud sessions: Runner flag --environment-secret-file** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C562 **Self-hosted cloud sessions: Runner flag --exec-path** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C563 **Self-hosted cloud sessions: Runner flag --exit-if-unused-min** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C564 **Self-hosted cloud sessions: Runner flag --git-host-rewrite** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C565 **Self-hosted cloud sessions: Runner flag --git-ssh-rewrite** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C566 **Self-hosted cloud sessions: Runner flag --health-port** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C567 **Self-hosted cloud sessions: Runner flag --hold-idle-file** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C568 **Self-hosted cloud sessions: Runner flag --hooks-dir** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C569 **Self-hosted cloud sessions: Runner flag --host-config-snapshot** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C570 **Self-hosted cloud sessions: Runner flag --kill-session-after-min** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C571 **Self-hosted cloud sessions: Runner flag --lock-to-account** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C572 **Self-hosted cloud sessions: Runner flag --log-file** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C573 **Self-hosted cloud sessions: Runner flag --log-level** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C574 **Self-hosted cloud sessions: Runner flag --max-hold-min** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C575 **Self-hosted cloud sessions: Runner flag --post-session-hook-timeout-sec** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C576 **Self-hosted cloud sessions: Runner flag --proxy-authorization-command** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C577 **Self-hosted cloud sessions: Runner flag --proxy-authorization-file** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C578 **Self-hosted cloud sessions: Runner flag --push-outcome-on-release** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C579 **Self-hosted cloud sessions: Runner flag --release-idle-session-min** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C580 **Self-hosted cloud sessions: Runner flag --remove-session-state** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C581 **Self-hosted cloud sessions: Runner flag --repository-folder** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C582 **Self-hosted cloud sessions: Runner flag --retire-at** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C583 **Self-hosted cloud sessions: Runner flag --server-auto-mode-lists** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C584 **Self-hosted cloud sessions: Runner flag --session-stop-grace-sec** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C585 **Self-hosted cloud sessions: Runner flag --startup-timeout-min** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C586 **Self-hosted cloud sessions: Runner flag --trust-workspace** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C587 **Self-hosted cloud sessions: Runner flag --use-anthropic-git-proxy** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C588 **Session recap after time away** [Claude]: Ours shows no recap when the user returns to an idle session.
- C589 **Session variables passed to shell commands and hooks** [Claude]: Ours does not hand the effort level or session id to shell commands as variables.
- C590 **Setting: switch models automatically when a message is flagged, or stop instead** [Claude]: No setting chooses between falling back to another model and stopping when a request is flagged;
- C591 **Settings edits apply to a running session** [Claude]: Config is read at start; only trigger files are watched.
- C592 **Settings files reload live while a session runs** [Claude]: Config is read at start; no file watcher re-applies config, permissions or hooks mid-session.
- C593 **Setup hooks (init and maintenance)** [Claude]: --init writes AGENTS.md; no flag runs setup or maintenance hooks and exits.
- C594 **Show or hide model reasoning** [ChatGPT]: No setting hides reasoning, shows raw reasoning or sets summary detail and verbosity.
- C595 **spellcheck: underline misspellings in the prompt** [Claude]: No spell check in the composer.
- C596 **Switch to auto mode from a Bash approval prompt** [Claude]: Ours approval prompt cannot switch mode in one step;
- C597 **Terminal and platform tweak variables (Windows Backspace, automount roots, config lock)** [Claude]: No such variables. Automount paths are handled by a fixed built-in rule (refused unless the session started on that host), not a setting.
- C598 **Terminal progress bar in tab or taskbar** [Claude]: Ours does not send progress signals to the terminal tab.
- C599 **terminalTitleFromRename: keep the generated tab title instead of the session name** [Claude]: /title picks what the title shows from fixed items, but there is no switch for whether /rename changes the tab title.
- C600 **Time zone and time format settings** [Claude]: Ours uses the system clock only; no time zone or format setting.
- C601 **Tuning keys for idle thread unload delay and background terminal limits** [ChatGPT]: No config keys for these; only the stored tool output cap is compared elsewhere.
- C602 **Turn duration line after each reply** [Claude]: Ours does not show how long a turn took and has no setting for it.
- C603 **Turn off all skills and commands for a session** [Claude]: No flag disables skills and custom slash commands for one run.
- C604 **Unbind a default shortcut by setting its action to null** [Claude]: ui.keybindings can rebind a fixed set of actions to another key;
- C605 **Variable to force synchronized terminal output and stop flicker** [Claude]: No switch forces synchronized output for terminals that are not auto-detected.
- C606 **Verbose output and transcript view modes (default, verbose, focus)** [Claude]: Ours --verbose is debug logging only; no setting expands tool output inline or switches transcript views.
- C607 **vimInsertModeRemaps: map a key pair such as jj to Escape** [Claude]: ui.edit_mode = vi exists in plain line mode only, with no remap setting.
- C608 **Wrap Claude's prose at a column width** [Claude]: No setting caps the reply line width in wide terminals.

### Sharing and collaboration (2)
- C609 **Comments on shared artifacts answered by the agent** [Claude]: Ours CLI has /artifacts but does not watch artifact comments or reply to them.
- C610 **Session link trailer in commits and PRs** [Claude]: Ours does not add a session link to commit trailers or PR text.

### Teams and admin (103)
- C611 ★ **Admin analytics on CLI use (dashboard, contribution metrics, plugin usage API)**: Ours /usage and cost summary are personal;
- C612 ★ **Admin lock on login method or organization**: No managed key restricts how a user may sign in or which organization account is accepted.
- C613 ★ **Admin model allowlist, denylist and org default model**: An administrator cannot restrict which models a CLI user may pick or set an org default model;
- C614 ★ **Different policy per user group**: The workspace policy resolves to one effective policy per account;
- C615 ★ **Managed session retention (cleanup period)**: The CLI keeps local sessions with no retention setting or sweep;
- C616 ★ **Marketplace allowlist and blocklist for plugins**: Managed plugin policy only requires signed plugins;
- C617 ★ **Restrict allowed API providers**: Ours org policy has allowed providers but the CLI does not depend on that crate, so nothing enforces it.
- C618 ★ **Restrict selectable models (availableModels, deniedModels)**: Ours model picker follows plan tiers only;
- C619 ★ **Run models through Amazon Bedrock, Vertex or Foundry**: No cloud-provider enterprise inference mode in the CLI;
- C620 ★ **Self-hosted SSO gateway for the CLI**: Ours has no self-hosted gateway or corporate SSO sign-in for the CLI.
- C621 **Admin allow and block list for plugin marketplaces** [Claude]: Ours has no admin list of permitted marketplaces;
- C622 **Admin allowlist of API providers** [Claude]: The licensing crate models an allowedProviders field, but no CLI code reads it, so a CLI session is not refused on a provider by org policy.
- C623 **Admin cap on reasoning effort per model and role** [Claude]: No managed or workspace setting caps reasoning effort;
- C624 **Admin hiding of slash commands** [Claude]: No policy key hides or disables built-in commands.
- C625 **Admin in-product surveys** [Claude]: Ours CLI shows no admin-set surveys.
- C626 **Admin limits on the Windows sandbox and sandbox by hostname** [ChatGPT]: There is no Windows sandbox, and no per-hostname sandbox rule.
- C627 **Admin permission and spend limits for Ultrafast speed** [ChatGPT]: No Ultrafast tier or admin switch for it;
- C628 **Admin push of MCP servers and plugin-only customization lock** [Claude]: No managed key delivers MCP servers or limits skills, agents, hooks and MCP to plugins;
- C629 **Admin switch to disable Remote Control** [Claude]: Ours managed file cannot turn off the remote control feature.
- C630 **Admin-enforced login method and workspace** [ChatGPT]: Ours managed file has no login method or workspace setting.
- C631 **Admin-set minimum and required version range for the CLI** [Claude]: Nothing lets an admin pin a version floor or refuse start-up outside a range;
- C632 **Block sideloading (plugin-dir, agents and MCP config flags)** [Claude]: Ours managed file cannot disable the --mcp-config or similar flags.
- C633 **Company announcement at startup** [Claude]: Ours shows no organization message at startup.
- C634 **Config-change hook and managed-settings audit event** [Claude]: No hook event fires when settings change, and the loaded managed policy source is not logged or shown.
- C635 **Fleet policy for plugin auto-update per managed marketplace** [Claude]: Plugin updates are manual and no managed key controls them.
- C636 **Force-install plugins and suggest plugins from admin marketplace** [Claude]: Managed settings cannot register a marketplace or force-enable plugins on every machine.
- C637 **Gateway IdP requests via forward proxy and proxy-only egress** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C638 **Gateway listener, public URL, TLS and trusted proxies** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C639 **Gateway OTLP telemetry fan-out** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C640 **Gateway PostgreSQL store for device grants and rate limits** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C641 **Gateway request size, header, URL, timeout and sign-in rate limits** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C642 **Gateway secret expansion from env vars and files** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C643 **Gateway: Layered policy mode applies every matching policy** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C644 **Gateway: Managed policies by IdP group or email domain** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C645 **Gateway: Managed settings pushed through the gateway** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C646 **Gateway: Per-IdP-group model access and managed settings** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C647 **Gateway: Per-team upstreams via groups lists** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C648 **Gateway: Per-user identity headers to a proxy upstream** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C649 **Gateway: Precedence of gateway settings over MDM or local managed settings** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C650 **Gateway: Server-side model allowlist enforcement** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C651 **Gateway: Static headers on upstream requests** [Claude]: There is no self-hosted gateway in front of the CLI: no company single sign-on, no gateway-delivered policy, spend limits or telemetry relay.
- C652 **HIPAA and zero data retention: Offboarding does not delete local data** [Claude]: The CLI has no HIPAA or zero-data-retention mode: nothing detects a covered account, switches features off for it or shows its status.
- C653 **Host-specific sandbox overrides** [ChatGPT]: Managed sandbox policy is not matched by hostname.
- C654 **Inference hooks: an organization-hosted allow or deny check on every prompt, tool call and upload** [Claude]: Managed hooks are local commands delivered in the managed file;
- C655 **Managed CLAUDE.md-style org instructions file** [Claude]: No org-level instructions file is read from the managed path;
- C656 **Managed disableAgentView: turn off background agents and the supervisor** [Claude]: No managed key turns off agi background, /background or the daemon.
- C657 **Managed env block and per-variable merge** [Claude]: The managed policy has no env section to set environment variables for sessions.
- C658 **Managed feature switches that turn off computer use, browser tools, apps and plugins** [ChatGPT]: The managed file and the workspace policy cannot switch off browser tools or plugins;
- C659 **Managed parentSettingsBehavior: how settings from an embedding host combine with policy** [Claude]: No notion of settings supplied by an embedding host process;
- C660 **Managed policyHelper: an executable that computes managed settings at startup (path, timeout, refresh interval)** [Claude]: Managed settings come only from a system file, an env pointer or the cached copy, plus the account workspace policy;
- C661 **Managed prompt-cache TTL and contracted model pricing** [Claude]: No admin control of cache lifetime or per-token rates in the CLI.
- C662 **Managed requirement that forces fast mode on or off** [ChatGPT]: No managed key pins fast mode; managed config holds permissionMode, privacyMode and allowProjectConfig only.
- C663 **Managed settings bypassed or withheld on custom providers and until server confirms** [Claude]: Managed policy comes from a local file or the account cache;
- C664 **Managed settings from a drop-in directory** [Claude]: Only one managed-settings.json is read; no drop-in directory or merge.
- C665 **Managed subagents from an admin directory** [Claude]: Agents load from user, project and plugins;
- C666 **Managed Windows deployment of the CLI** [ChatGPT]: No Windows deployment guidance; sandboxed commands are unsupported on Windows.
- C667 **MDM starter templates (Jamf, Intune, Group Policy) for the managed policy** [Claude]: No deployment templates or admin guide for the managed file ship in the repository;
- C668 **OpenTelemetry monitoring** [Claude]: No OpenTelemetry export; crash reports go to Sentry only.
- C669 **OpenTelemetry usage metrics, events and traces** [Claude]: No OpenTelemetry export, usage counters or exporter settings;
- C670 **OpenTelemetry: Content logging opt-ins** [Claude]: The CLI has no OpenTelemetry exporter, so this export option has no counterpart;
- C671 **OpenTelemetry: Eight usage metrics** [Claude]: The CLI has no OpenTelemetry exporter, so this export option has no counterpart;
- C672 **OpenTelemetry: Host name and ID attribution** [Claude]: The CLI has no OpenTelemetry exporter, so this export option has no counterpart;
- C673 **OpenTelemetry: Managed OTel settings pin the collector** [Claude]: The CLI has no OpenTelemetry exporter, so this export option has no counterpart;
- C674 **OpenTelemetry: Metrics cardinality controls** [Claude]: The CLI has no OpenTelemetry exporter, so this export option has no counterpart;
- C675 **OpenTelemetry: OTel exporters** [Claude]: The CLI has no OpenTelemetry exporter, so this export option has no counterpart;
- C676 **OpenTelemetry: Telemetry event types** [Claude]: The CLI has no OpenTelemetry exporter, so this export option has no counterpart;
- C677 **Organization per-tool controls on connectors (ask every time or blocked)** [Claude]: Per-tool allow, ask and block are user settings (agi mcp allow, ask, block);
- C678 **Plugin and mod vetting by validate and policy mod** [Claude]: No command that lists a plugin's capabilities before install and no admin policy plugin.
- C679 **Plugin install and load telemetry for fleets** [Claude]: No plugin activity events or analytics are exported.
- C680 **Restrictive keys (disable connectors, artifacts, peer isolation) are honored from any settings scope** [Claude]: Those keys do not exist, so there is no any-scope rule;
- C681 **Route the CLI through an organization LLM gateway** [Claude]: The CLI has no org gateway mode; managed Cloud is the only org-governed route (BYOK is out of scope).
- C682 **Self-hosted cloud sessions: Allow self-hosted environments admin toggle** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C683 **Self-hosted cloud sessions: Authenticate to an egress proxy** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C684 **Self-hosted cloud sessions: Corporate egress proxy and mTLS support** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C685 **Self-hosted cloud sessions: Guided setup command (self-hosted-runner setup)** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C686 **Self-hosted cloud sessions: Lifecycle hook: checkout** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C687 **Self-hosted cloud sessions: Lifecycle hook: command** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C688 **Self-hosted cloud sessions: Lifecycle hook: post-session** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C689 **Self-hosted cloud sessions: Make on-demand runners exit when idle** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C690 **Self-hosted cloud sessions: On-demand runners via orchestrator** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C691 **Self-hosted cloud sessions: Orchestrator graceful stop** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C692 **Self-hosted cloud sessions: Owner lock: one runner serves one account** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C693 **Self-hosted cloud sessions: Pass-through of session child metrics** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C694 **Self-hosted cloud sessions: Pre-warming standby runners** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C695 **Self-hosted cloud sessions: Private CA trust with Anthropic-managed git** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C696 **Self-hosted cloud sessions: Prometheus metrics for runners and orchestrator** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C697 **Self-hosted cloud sessions: Provision credentials scoped to session creator** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C698 **Self-hosted cloud sessions: Runner /healthz endpoint** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C699 **Self-hosted cloud sessions: runner doctor subcommand** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C700 **Self-hosted cloud sessions: Runner session lease and requeue behavior** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C701 **Self-hosted cloud sessions: Session config seeded from host ~/.claude snapshot** [Claude]: No self-hosted runner or orchestrator exists, so this operator option has no counterpart: cloud Code sessions run only on AGI hosting and agi code start has no environment option.
- C702 **Self-hosted configuration server: enroll the CLI with company sign-in and receive defaults and required settings from it** [ChatGPT]: Policy comes only from our own account service (the workspace effective policy) or a file on the device;
- C703 **Self-hosted runners and environments for cloud sessions** [Claude]: Cloud runs only on our infrastructure; no self-hosted runner or environment.
- C704 **Self-hosted runners for cloud sessions** [Claude]: Ours cloud sessions run only on our hosting;
- C705 **Service accounts and tokens for headless runs** [ChatGPT]: No workspace service account or scoped token for headless CLI use;
- C706 **Show which managed source is in force in /status** [Claude]: /status shows session model, tokens and mode only and does not name which managed policy source applies.
- C707 **Stable and early-access plugin marketplaces assigned per user group** [Claude]: No group targeting and no managed marketplace assignment.
- C708 **Traces linking prompts to model requests and tool runs** [Claude]: No trace spans or trace context passed to shell commands;
- C709 **Trusted Devices for Remote Control** [Claude]: Remote control has no admin-required device verification.
- C710 **Workspace access tokens for non-interactive runs** [ChatGPT]: Ours CLI has interactive and API key login only;
- C711 **Wrapper script run around each session process** [Claude]: No wrapper hook or self-hosted runner wrapper environment.
- C712 **WSL reads the Windows managed policy** [Claude]: No Windows registry or Program Files policy chain and no WSL inheritance setting.
- C713 **Zero data retention for qualified Enterprise accounts** [Claude]: No zero-retention account mode; /privacy states 30-day retention for deleted and temporary chats.

### Voice (4)
- C714 **Auto-send the transcript on key release** [Claude]: After transcription we always ask to send, edit, re-record or discard;
- C715 **Dictation inside agent view for background sessions** [Claude]: Voice works only in the main prompt, not a background-session panel.
- C716 **Rebind the dictation key** [Claude]: The dictation key is fixed to Space.
- C717 **Transcription tuned for code with project hints** [Claude]: Transcription sends only audio and a language code, with no project or coding hints.

## VS Code: all 100 missing

### Account and sign-in (1)
- V1 ★ **Company sign-in: identity provider, workspace restriction, automation tokens**: The extension and CLI have no company identity provider sign-in, no workspace-only restriction and no member-created automation tokens.

### Plans, billing and usage (1)
- V2 **Ask a workspace owner for more credits or limits** [ChatGPT]: A user who hits a limit sees upgrade or top-up links but cannot message an admin from the editor.

### Home and navigation (4)
- V3 **Bookmark a session** [Claude]: No bookmark control for sessions.
- V4 **Focus view for a single session** [Claude]: No focus view found.
- V5 **Open a conversation in a separate window (command)** [Claude]: No command opens a chat in its own window;
- V6 **Open the chat automatically when the editor starts** [ChatGPT]: activateOnStartup only starts background work;

### Composer and input (7)
- V7 **/goal to set a long-running objective** [ChatGPT]: No /goal command.
- V8 **Add to Chat from the Explorer right-click menu** [Claude]: The Explorer has no menu entry; adding a file is a Command Palette command, a chip or an @ mention.
- V9 **Attach a recent chat as context from the composer** [ChatGPT]: The plus menu offers upload, selection, open editors, problems, Git changes, terminal output and web page;
- V10 **Move a running subagent to the background** [Claude]: The chat lists running subagents with their progress but has no control to send one to the background.
- V11 **Pasted text cleaned of invisible characters, with a notice** [Claude]: The composer paste handler only accepts pasted files;
- V12 **Recall earlier prompts with Up arrow or history search** [Claude]: In the editor composer the Up arrow only moves through the slash menu;
- V13 **Suggested next prompt after a reply, accepted with Tab** [Claude]: The editor chat shows no suggested next prompt after a reply.

### Conversations and message actions (6)
- V14 ★ **Rename sessions and auto-archive inactive ones**: Local sessions cannot be renamed in the editor (only cloud runs) and nothing archives them after a period of inactivity.
- V15 **Idle compaction before the prompt cache expires** [Claude]: No idle compaction; a long session compacts only when it fills.
- V16 **Mark a session as unread** [Claude]: Sessions have no unread state.
- V17 **Plan mode restored when a session is resumed** [Claude]: The mode is a workspace setting, not saved per session, so a resumed session takes the current setting.
- V18 **Prompt cache clock** [Claude]: No cache timer in the panel.
- V19 **Take over a conversation that is open in another window** [Claude]: No notice or take-over step when a session is already open in another window.

### Rendering and content (1)
- V20 **Math typeset in chat (LaTeX)** [Claude]: Replies render math as plain text.

### Models and reasoning (6)
- V21 ★ **Show the model reasoning summary**: The engine streams reasoning deltas but the editor chat does not display thinking text.
- V22 ★ **Ultra mode: parallel subagents or planned workflows for big tasks**: No Ultra or workflow switch in the editor;
- V23 **Fast mode (/fast)** [ChatGPT]: No fast-mode switch.
- V24 **One-off deeper reasoning with a keyword (ultrathink)** [Claude]: No keyword raises reasoning for one prompt;
- V25 **Reply length (verbosity) setting** [ChatGPT]: No setting for reply length; the personalization screen covers tone only.
- V26 **Separate reasoning effort for plan mode** [ChatGPT]: Plan mode uses the same effort as the session.

### Artifacts and documents (1)
- V27 **Agent publishes a page or file to the cloud as an artifact** [Claude]: The editor lists, opens and saves published artifacts but the agent cannot publish one from a session.

### Agents, tasks and automation (6)
- V28 **Monitor: background watch whose output feeds the agent** [Claude]: No monitor tool or equivalent background watch in the CLI or editor.
- V29 **Save a workflow as a slash command, pass it arguments, ship it in a plugin** [Claude]: No workflow scripts to save, run with arguments or package in a plugin.
- V30 **Scripted multi-agent workflows from the prompt** [Claude]: The CLI has a terminal-only /workflow goal command;
- V31 **Ultracode effort and keyword for a workflow on every task** [Claude]: No ultracode effort level or keyword; the effort picker has its own ladder only.
- V32 **Workflow progress view with stop, resume and per-agent detail** [Claude]: No workflow list or per-phase view; the Subagents panel shows child tasks only.
- V33 **Workflow size guideline, large-run warning, and off switch** [Claude]: None of these exist because workflows do not.

### Browser actions (1)
- V34 **Browser connection on by default for new sessions** [Claude]: The Browser tool group is switched on per session;

### Coding agent (14)
- V35 ★ **Approvals judged by a model (auto mode, auto-review)**: No model-judged approval mode.
- V36 ★ **Extra folders the agent may use beyond the workspace**: The CLI has an --add-dir flag but the editor has no way to add a folder to a session and /add-dir is not runnable there.
- V37 ★ **Managed GitHub review service**: No editor-side hosted GitHub review service.
- V38 ★ **Multi-agent security scan with verified findings and a report**: Only a single-pass /security-review of pending changes exists;
- V39 ★ **Other editor integrations: JetBrains and Xcode**: Only VS Code and its forks are supported;
- V40 **Block reads of secret files by pattern** [ChatGPT]: Sensitive files are kept out of attached context and completions, but no setting blocks the agent from reading a path pattern;
- V41 **Connect an external terminal to the open editor** [Claude]: The extension drives the CLI itself; a CLI started in another terminal cannot attach to the open editor.
- V42 **Fast mode for quicker replies** [ChatGPT]: The CLI lists /fast but the editor cannot run it and has no fast switch.
- V43 **In-session security guidance on the agent's own edits** [Claude]: No built-in step makes the agent security-check its own edits;
- V44 **Instruction override file, fallback file names and size limit** [ChatGPT]: The file names and the token budget are fixed in code;
- V45 **Named permission profiles that bundle file and network rules** [ChatGPT]: Only the four agent modes exist; there are no named profiles, custom profiles or inheritance.
- V46 **Offer a cheaper model near a usage limit** [ChatGPT]: The panel shows context use and a limit error with a recovery link, but never offers a cheaper model before the limit.
- V47 **Perforce read-only file protection** [Claude]: Nothing handles Perforce read-only files.
- V48 **Run code in the active Jupyter notebook after an Execute or Cancel prompt** [Claude]: The agent can edit notebook cells but cannot run one in the editor's kernel.

### Connectors, apps, plugins and skills (6)
- V49 **Install plugins for me, for a repository or for one folder** [Claude]: The editor installs a plugin only into the user scope;
- V50 **MCP tools loaded on demand through tool search** [Claude]: The MCP tool search catalog is not wired: the developer host passes tool_search_catalog None, so every MCP tool schema is sent up front.
- V51 **Plugin options dialog with masked secrets** [Claude]: Installing a plugin asks only for its source and pin;
- V52 **Plugins that draw panels, toasts and status lines (mods)** [Claude]: Plugins can bundle skills, hooks and MCP servers but cannot draw anything in the editor chat panel.
- V53 **Shareable link that opens the plugin install dialog** [Claude]: The editor link handler accepts only context, cloud-task and developer-session links, not a plugin install link.
- V54 **Turn off or uninstall a shared project plugin for me only or for everyone, and keep or delete its data** [Claude]: A plugin has one toggle and one Remove with a single confirmation;

### Cross-device continuity (3)
- V55 **A conversation that failed to open twice is left closed after a reload, with Open it anyway** [Claude]: No guard against a chat that keeps crashing on restore.
- V56 **Connect Remote Control for every session automatically** [Claude]: Remote Control is started by hand per window;
- V57 **Files the agent sends you appear as clickable rows in the chat** [Claude]: No send-file tool and no sent-file row in the panel.

### Device and OS integration (2)
- V58 **Reopen the most recently closed chat tab (Cmd/Ctrl+Shift+T)** [Claude]: No command or key reopens a closed chat tab.
- V59 **Terminal CLI connects to the running editor for diffs and selection** [Claude]: The terminal /ide command only prints how to get the extension;

### Help, feedback and support (3)
- V60 ★ **Turn off feedback uploads**: No user or admin setting turns the feedback command off.
- V61 **Agent drafts a feedback report when something fails** [Claude]: Feedback is only written by the user in the Send feedback command;
- V62 **Show Logs command in the editor** [Claude]: The extension has no output channel for its own log;

### Install, release and update (3)
- V63 ★ **JetBrains and Xcode support**: VS Code only; no JetBrains or Xcode integration in the repo.
- V64 **JetBrains plugin settings and networking (collapsed row)** [Claude]: Follows from having no JetBrains plugin.
- V65 **Works without installing a separate command-line tool** [ChatGPT]: The extension needs the AGI CLI installed first (walkthrough step one, Install AGI CLI runs a script).

### Memory and personalization (4)
- V66 ★ **Agent writes its own memory notes across sessions**: In the editor, memory is saved only on request (Remember this);
- V67 **Import other files into an instruction file (@path)** [Claude]: Instruction files are read as written; an @path line is not expanded.
- V68 **Output styles** [Claude]: No output-style picker.
- V69 **Private instruction file that is not committed** [Claude]: There is a per-user file and project files, but no private per-project file kept out of the repository.

### Notifications (1)
- V70 **Agent sends a push notification to the phone** [Claude]: The agent has no notify tool; phone alerts come only through Remote Control pairing.

### Privacy, security and data (3)
- V71 **Admin can remove auto mode or bypass mode** [Claude]: Admin workspace policy turns hooks and MCP off but cannot block Bypass or Auto;
- V72 **Custom CA bundle for company TLS inspection** [ChatGPT]: No CA bundle setting or variable for the engine or extension requests.
- V73 **Export usage events with OpenTelemetry** [ChatGPT]: No OpenTelemetry export for editor sessions.

### Settings (19)
- V74 ★ **Auto mode where a model reviews each action**: The editor Auto mode lets edits through and asks for commands;
- V75 **Activate the Python environment in agent terminals** [Claude]: Commands do not activate the selected Python environment and there is no setting.
- V76 **Choose what marks a project root** [ChatGPT]: The project root is found from a fixed built-in list of five marker files and cannot be configured.
- V77 **Custom spinner verbs while the agent works** [Claude]: The working indicator wording is fixed; no setting changes it.
- V78 **Environment variables and process wrapper settings for the engine** [Claude]: Only cliPath and apiEndpoint are configurable;
- V79 **Escape key stops the agent (escapeStopsClaude)** [Claude]: No setting; Escape in the panel only closes menus and the onboarding card.
- V80 **Keep the computer awake while a turn runs** [ChatGPT]: Nothing in the extension or CLI holds the machine awake during a long turn.
- V81 **Named settings profiles chosen at launch** [ChatGPT]: There is one user config and one project config;
- V82 **Output styles menu in the slash menu** [Claude]: The panel does not list /output-style. The slash list keeps only CLI commands flagged prompt or runnable (apps/extension-vscode/src/features/surfaces/surfaceMenu.ts:272-275) and output-style is neither (apps/cli/src/app…
- V83 **Personal per-project settings file kept out of git** [Claude]: No personal per-project layer exists; project config is the shared file only, and saved approvals are not written to a git-ignored local file.
- V84 **Pin the prompt box to the bottom of the panel (pinPrompt)** [Claude]: No setting to pin or unpin the prompt box.
- V85 **Plugins that draw their own panels, status lines and toasts in the editor panel** [Claude]: Plugins add tools, commands and hooks but cannot draw into the extension panel.
- V86 **Prompt box honours the CLI keybindings file (for example unbinding Ctrl+J)** [Claude]: The panel's keys are fixed in the webview;
- V87 **Settings changes apply to a running session** [Claude]: No file watcher; settings changes reach a session when the engine reads them again.
- V88 **Settings JSON schema for autocomplete and validation in the editor** [Claude]: Our settings are TOML and the extension contributes no schema or validation for them.
- V89 **Show timestamps on chat messages** [Claude]: Messages in the panel carry no timestamp and there is no setting for one.
- V90 **Terminal interface options (animations, alternate screen, tooltips, notification types)** [ChatGPT]: Terminal mode runs our CLI interface, which has no such toggles.
- V91 **Tool output size, idle thread unload and background terminal timeout settings** [ChatGPT]: None of these limits is user-configurable.
- V92 **Unanswered agent question continues by itself after a timeout** [Claude]: A question waits until answered; no timeout setting.

### Teams and admin (7)
- V93 ★ **Admin-forced login method and organisation**: No managed login policy in the extension.
- V94 ★ **Company configuration server or gateway with corporate sign-in**: No company gateway or configuration server;
- V95 ★ **OpenTelemetry export of usage and events to your own backend**: No telemetry export to an organisation's collector;
- V96 **Admin network rules for sandboxed commands (domains, ports, sockets)** [ChatGPT]: The managed document has no network section;
- V97 **Admin-pinned default model, effort, fast mode and required review** [ChatGPT]: Managed config pins only permission mode, privacy mode and project-config use.
- V98 **Custom CA certificates, certificate store choice and client certificates** [Claude]: No setting for extra CAs, certificate store or mutual TLS in the CLI or extension.
- V99 **Published list of hosts to allow through a firewall** [Claude]: No allowlist page or in-product host list for the extension was found.

### Voice (1)
- V100 **Voice dictation in the chat panel** [Claude]: No dictation control in the panel.

## Chrome: all 30 missing

### Account and sign-in (1)
- X1 **Log out of all active sessions at once** [Claude]: Ours signs out this browser only; no sign-out-everywhere action in the extension.

### Composer and input (2)
- X2 **Composer disclaimer that the AI can make mistakes** [Claude]: No mistake disclaimer under the composer;
- X3 **Goal control in the + menu** [ChatGPT]: No generic Goal control in the composer;

### Conversations and message actions (3)
- X4 ★ **Thumbs up and thumbs down on a reply**: No reply rating; searched: thumb, feedback, rating, ThumbsUp in apps/extension/src.
- X5 **Letter-key hints in the title menu (P, R, A, D)** [Claude]: Menu rows have no key hints or letter shortcuts.
- X6 **Title menu: Turn into skill** [Claude]: No way to turn a chat into a skill; searched: turn into skill, intoSkill in apps/extension/src.

### Rendering and content (1)
- X7 ★ **Scroll-to-bottom arrow over a long answer**: No jump-to-latest button; the panel scrolls itself while streaming; searched: scroll-to-bottom, jump in side_panel.ts.

### Search and research (1)
- X8 **Extension that makes the assistant the address-bar search engine** [ChatGPT]: No search-provider override and no omnibox keyword in our manifest.

### Agents, tasks and automation (2)
- X9 **Record an animated GIF of the browser work** [Claude]: No GIF export; searched: gif in apps/extension/src (only image types).
- X10 **Schedule a saved shortcut to run in the browser** [Claude]: Dead code. The replay runs only for a locally scheduled task with a shortcutId (apps/extension/src/background.ts:3987-3998), and such a task is created only by the CREATE_SCHEDULED_TASK message (5858), which no page in…

### Browser actions (6)
- X11 **Adult and pirated sites blocked** [Claude]: No built-in blocked categories; searched: adult, pirat, gambling.
- X12 **Developer mode with full DevTools protocol access** [ChatGPT]: Our settings say AGI does not expose an unrestricted DevTools protocol mode.
- X13 **Password manager sign-in (1Password) approved by biometrics** [Claude]: No password manager sign-in; searched: 1password, passwordManager.
- X14 **Save a page screenshot to disk and report where it went** [Claude]: Screenshots go into the chat or to the agent only;
- X15 **Site access prompt: allow for all sites** [ChatGPT]: No allow-for-all-sites choice; only one site at a time.
- X16 **Web app chat uses your Chrome tabs through the extension** [ChatGPT]: Our web app cannot reach the extension: the manifest has no externally_connectable entry and apps/web has no code that messages it.

### Connectors, apps, plugins and skills (2)
- X17 ★ **Plugins entry in the + menu**: No plugins menu; searched: plugin in apps/extension/src.
- X18 **Connectors entry in the + menu** [Claude]: Switched off: connector release state is coming soon (13 named connectors are released one by one);

### Help, feedback and support (1)
- X19 **Thumbs feedback and report a prompt injection** [Claude]: No thumbs or report-a-problem control in the panel or options.

### Install, release and update (2)
- X20 ★ **Extension is published in the Chrome Web Store and installable**: Not in the store yet: our own docs say publication was never proven and the site page says coming soon;
- X21 **Try a demo button and challenge cards on the install page** [Claude]: No demo or practice challenges; searched: demo, challenge in apps/extension/src.

### Settings (1)
- X22 **Language submenu** [Claude]: Only English ships; no language menu.

### Teams and admin (8)
- X23 ★ **Admin control over which approval modes members can use and the default**: The mode is a per-user setting only. Our managed policy and workspace policy carry no field for allowed or default approval modes, so an admin cannot stop Full access.
- X24 **Admin can pin the extension to one organization's sign-in** [Claude]: No managed setting restricts which account or organization may sign in to the extension.
- X25 **Admin can stop desktop tasks from driving the browser** [Claude]: No admin setting blocks paired desktop commands;
- X26 **Admin export of browser decisions to the organization's own log collector** [ChatGPT]: Action receipts go only to our own servers;
- X27 **Admin switch for password-manager sign-in** [Claude]: No password-manager sign-in exists (row 103), so there is no admin switch for it either.
- X28 **Extension off by default under HIPAA or zero data retention** [Claude]: No compliance-mode default or switch; the privacy notice mentions retention only.
- X29 **Managed install through Chrome management** [Claude]: The cited manifest lines only register a schema for managed settings (apps/extension/manifest.json:36-38).
- X30 **Per-role capability for the browser extension** [Claude]: The only admin controls are the managed site policy and install;

## Marked Missing, but no leader clearly ships it

- Chrome: **Edit a message you already sent**: Only Send again and editing a queued message;
- Chrome: **Extension updates itself through the store**: Depends on a store listing that repo docs say is not live: the Chrome release workflow has no runs and store availability is unverified (docs/product/competiti…
- Chrome: **Run JavaScript on the page**: Only model self-reports
- CLI: **Sandbox on Windows**: Codex Windows sandbox is described for the desktop app;
- CLI: **Slash command /goal**: Codex /goal (IDE). IDE only; CLI not stated.
- CLI: **Slash command /ide-context**: Codex /ide-context. IDE only; CLI not stated.
- CLI: **Slash command /local**: Codex /local. IDE only; CLI not stated.
- CLI: **Slash command /project**: Codex /project (IDE). IDE only; CLI not stated.
- CLI: **Slash command /remote-env**: Not named in research files.
- CLI: **Slash command /replay**: Not named in research files.
- CLI: **Slash command /terminal-setup**: Not named in research files.
- CLI: **Slash command /tui**: Not named in research files.
- CLI: **Slash command /vim**: Not named in research files.
- Desktop: **Admin limits which surfaces (desktop, web, phone) the organization may use**: Leaders gate the desktop app through sign-in restriction and policy keys.
- Mobile: **Android default assistant and Quick Settings tile**: ChatGPT default-assistant support in 2026 is unverified;
- Mobile: **Video generation from a description**: ChatGPT video (Sora) is deprecated; Claude has none.
- Web: **Live multi-person chat or group chat**: ChatGPT group chats were deprecated (none created since 2026-07-09).
- Web: **Save an artifact to Google Docs, Google Drive or OneDrive**: The leader files do not name this action.
- Web: **Shortcut: temporary chat**: ChatGPT desktop only: Cmd+Shift+N
