---
id: "REQ-open-product-choices"
type: "requirements"
title: "Open product choices"
basis: "collected from the competitor traces and the system, app and engineering pages; none decided"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Open product choices

Decisions the product needs that nobody has made. Nothing on this page is decided. Each line comes from the page named above it. The owner's standing decisions are in [established-requirements.md](established-requirements.md).

## Conflicts with the product principles

- **PR-4 and Desktop.** The principle says supported local inference on mobile and desktop needs no paid subscription. The public Desktop app has no Local chat: it refuses every local-model command, citing the owner's decision of 2026-09-15 (`docs/decisions/2026-09-15-founder-decisions.md`). Local models reach Desktop only through AGI Code, which runs the CLI. Either that decision changes, or the principle means AGI Code only. See [SYS-local-inference](../40-systems/local-inference.md).
- **PR-4 and the shared composer.** The shared composer hides the Local option from Free-plan users, which would tie Local to a paid plan wherever that code runs. See [SYS-local-inference](../40-systems/local-inference.md), Gaps.
- **PR-3 and plan logic outside the subscription system.** Places where an app decides plan rules itself are listed in [SYS-subscriptions-entitlements-and-usage](../40-systems/subscriptions-entitlements-and-usage.md).
- **PR-1 and model promotion.** Several live model defaults were promoted without the evaluation gate the rules require. See [SYS-model-catalog-and-routing](../40-systems/model-catalog-and-routing.md).

## Asked of the owner on 2026-11-24, not answered

- May view-only members chat in a project shared with them? (The fix branch allows it.)
- Should idle sign-out be off by default? (The fix branch sets it to Never.)
- Should a paid plan granted by hand never lapse by date?
- Should Web also offer Local mode? The principle names mobile and desktop.
- Are individuals the first customers, with teams and enterprise after?
- Is free local inference plus own key the whole difference from the competitors?

## From the competitor traces

### [Conversations and history](../50-competitors/conversations-and-history.md)

- Locked chats: only ChatGPT documents them; match or not.
- Search default: ChatGPT includes archived chats; AGI web leaves them out unless a switch is on.
- Personalised temporary chat: definition.md says temporary chats neither read nor write memory; AGI code lets a user pick to read memory.
- Recently deleted for chats: AGENTS.md requires it; the owner must confirm the period and whether Delete all skips it.
- Temporary chat purge at 30 days versus the decision to keep no safety copy.
- Single-chat export formats and whether to match: neither leader's chat export is in the catalogue.
- Pin, rename and archive in CLI, VS Code and Chrome: decisions keep VS Code and Chrome at Claude's scope; the ledger and comparison disagree for Chrome.
- Whether Claude's lack of Save a temporary chat is a reason to drop it (ChatGPT only).

### [Editing, regeneration and branching](../50-competitors/editing-regeneration-and-branching.md)

- Whether Mobile keeps Branch Conversation from Here: code ships it, but owner decision D-2026-09-28-15 keeps branching off the phone because the leaders did not offer it there. The ChatGPT note of 2025-09-04 lists web only; Claude documents none.
- Whether to match Claude's documented limit (no branching from an earlier point in the unified Cowork and Chat experience) or keep ChatGPT-style branching everywhere.
- Whether a stopped partial answer is billed, and how usage is settled for stop and regenerate on every app.
- Whether to add search-on-retry (ChatGPT only) and the flagged-message edit-and-retry setting (Claude only).
- Whether CLI, VS Code and Chrome get message edit, or stay gated with a stated reason.
- Whether rewind and checkpoints should exist in Web and Desktop Code views, as both coding tools have them.
- Whether to keep the build flag that can switch message versions off.

### [Model selection](../50-competitors/model-selection.md)

- Should Free users get an Auto entry? Code policy says Free is auto only, yet a person saw a Free picker listing other models and no Auto.
- Do model rows carry a one-line description? Ledger S15.11 says yes; D-2026-11-12-05 says rows carry a name only.
- Build an ultra or ultracode level that delegates to subagents? Only the coding tools document it.
- Build an Ultrafast tier above Fast? Only ChatGPT Work and Codex document it, for top plans.
- Add the ultrathink keyword for one-turn deeper reasoning? Only Claude Code documents it.
- Add the 'switch model when a message is flagged' setting on web, desktop and mobile?
- Keep new models off by default for managed workspaces?
- Add a legacy-models toggle?
- Add a model and effort recommender?
- D-2026-09-28-07 says neither leader has an advisor model; Claude Code documents one and the CLI has one. Extend to desktop and web code sessions, or leave it?
- Add a plan-model and execute-model split (opusplan style)?
- Add a per-subagent or global subagent model default and per-subagent effort?
- Offer a larger-context variant in the picker?
- Show Think harder style entry points for low plans, or keep one picker?

### [Streaming and response states](../50-competitors/streaming-and-response-states.md)

- Whether to add smooth text fade-in while streaming (only ChatGPT is claimed to have it in the comparison; not confirmed here).
- Whether to match ChatGPT's early streaming (answer starts before thinking ends) where a provider allows it.
- Whether to keep Continue generating, which neither leader is shown to document.
- Whether a stopped Cloud run keeps its server-side spend, or the spend is cut at stop (owner rule on billing the partial).
- Target first-word time per route and per app, including a Local load-time target.
- Whether the CLI and VS Code should show reasoning by default or only on request.
- Whether steer or queue is the default while a run is active on each app (web setting exists; CLI uses Enter and Tab in the leader).

### [Context management](../50-competitors/context-management.md)

- Whether to match the Claude-only features: summarise from or up to a chosen message, a user-set compaction threshold, idle compaction, and the window-variant choice.
- Whether web and mobile chat should show a context meter, or only a warning near the limit, as both leaders do for chat.
- Whether a context-full notice may mention an upgrade, since ChatGPT does on Free and window size is set by the model in AGI.
- Whether Local-mode chats on Desktop and mobile compact with the local model, trim without a summary, or stop and offer a fresh chat.
- Whether the per-turn manifest should be shown to people, and in what form, as ChatGPT does with its Sources icon.
- Whether compaction calls count against quota like ordinary turns or are absorbed by the plan.

### [Memory and personalization](../50-competitors/memory-and-personalization.md)

- Memory default: the owner has not said whether web memory should start on (as Claude and ChatGPT do for most plans) or stay off. The web app starts off, and a tester hit this.
- Memory summary: decision D-2026-09-28-17 says no generated profile summary, but web has a summary card and ChatGPT now ships an editable summary. Keep, remove, or extend it?
- Whether to match ChatGPT-only features: not-relevant marks, memory version restore, financial memories, connected-app memory, writing style learned from connected sources, and Computer History activity memory.
- Whether to match Claude-only features: monthly recap beta on all apps, sensitive-topic opt-in wording, and memory shared with agent tasks.
- Whether Local-mode turns on desktop may use account memory, and what consent and label they need.
- Whether instruction length limits vary by plan, as ChatGPT's do (1,500 versus 5,000 characters).
- Whether per-agent memory is built, and if so who can view it (ChatGPT dots allow no view or edit).
- Whether to add org-wide instructions and an owner switch for memory.

### [Projects](../50-competitors/projects.md)

- Free plan project count: docs/product/definition.md says 1 on Free, 5 on Basic, 25 on Premium; the billing catalogue says 5 on Free and unlimited on every paid plan. Which is intended?
- Should a chat started inside a project open as an ordinary chat (as both leaders do) or keep landing in AGI Work (decision D-2026-09-10-03, revisit trigger is the owner's answer; a web tester flagged it again)?
- Match Claude Code Projects (one coordinator with parallel threads, beta, selected paid users only), or wait? Only one competitor documents it.
- Allow share-by-link to anyone signed in, outside a workspace, on individual plans (ChatGPT does; Claude does not).
- Allow sharing on Free, or keep sharing to workspaces only.
- Should deleting a project keep its chats (ledger) or remove them (ChatGPT) and should it go to Recently deleted first.
- Match Claude's Cowork-style folder-tied projects and ChatGPT's multi-folder primary folder in the desktop chat app, or keep folder projects to Desktop Code, CLI and VS Code.
- Project spend tags and cost-code reports: Claude Enterprise only and in beta; build or skip.
- Whether Local-mode projects may ever be shared or synced, and whether free Local projects have a count limit.
- Project import from other tools: only Codex documents it; decide scope.

### [Files and attachments](../50-competitors/files-and-attachments.md)

- Whether to accept video attachments (only ChatGPT documents it, with incomplete analysis).
- Whether to add audio attach with transcription on paid plans (only ChatGPT documents it) and whether Free gets it.
- Whether Library should browse connected storage (Drive, OneDrive, Box, Dropbox) or only attach from it in chat.
- Whether to match ChatGPT's folders, favorites and Space-style shared files in Library, which Claude does not document.
- Whether the mobile per-message limit should match the web paid limit or stay at 25 MB.
- Whether to accept ODT, RTF, EPUB and ODS, which both leaders list.
- Whether the Library should have a Shared-with-you view, given Claude has no documented Library.
- Whether Local mode on desktop and mobile may read office files and PDFs, or only text and photos.

### [Generated artifacts and documents](../50-competitors/artifacts-and-documents.md)

- Whether to match Claude-only artifact types: Whiteboards, Motion (MP4) and certified-query dashboards.
- Whether to match ChatGPT-only features: Space shared pages with live collaboration, prompt blocks in pages, Sites tunnels, bypass tokens and recurring Site refresh.
- Whether to ship Office add-ins (Word, Excel, PowerPoint) and Google Workspace live co-editing.
- Whether Office file creation and PDF export may run on the device in Local mode, or must use our servers, and how each app states that.
- Whether a Local-mode artifact can be published, and what consent text names what leaves the device.
- Whether publishing and AI-powered artifacts work for BYOK and gateway sessions (Claude Code blocks them on API-key sessions).
- Which artifact types and storage sizes each plan (Free, Premium, Max, Ultra) gets; the competitor plan tables are not a decision.
- Whether to keep two near-identical Download entries and a separate Design area 32 workspace.
- Whether to offer Python execution inside a document or code artifact.

### [Rich content rendering](../50-competitors/rich-content-rendering.md)

- Whether to match ChatGPT's tappable highlights with a facts panel, which only ChatGPT documents.
- Whether to build topic cards (weather, recipes, news, sports, flights, shopping) and which, since Claude documents weather and recipes and the catalogue shows no equivalent set for ChatGPT.
- Whether interactive charts and tables are a plan feature. ChatGPT's pricing page says Plus and Pro only while its Intelligent UI and release notes list all plans; the project rule is Free shows Upgrade only.
- Whether inline visuals must render on mobile. Claude's custom visuals are not rendered on iOS or Android; ChatGPT's Visualizations roll out on mobile; AGI's mobile code already renders them.
- Whether to follow ChatGPT's static and interactive chart switch and extra chart types, or keep four chart kinds.
- Whether to add formula-driven learning modules (ChatGPT only) beyond flashcards and quizzes.
- Whether CLI and VS Code should render visuals or only point to web and desktop.
- Whether the Claude-style default of visuals shown automatically with no setting, or the ChatGPT-style Layout and visuals reduction setting, is the model.
- Row cap, collapse rule and copy format for tables in terminals (Claude Code caps at 200 rows).

### [Web search](../50-competitors/search.md)

- Whether web search is automatic only, or also has a visible per-chat switch like Claude's classic chats and ChatGPT's search icon.
- Whether AGI offers search modes (cached, indexed, live, off) as ChatGPT workspaces and Codex do, and whether web search should be allowed on Free.
- Whether web search and page fetch need approval in the permissive tool mode (decision D-2026-09-10-02 is marked pending the founder).
- Whether to match features only ChatGPT documents: reservations, shopping research, search with an uploaded image, address-bar search, structured live answers.
- Whether Local mode may search at all, and if so whether consent is per turn or a standing setting.
- Whether research should let users edit the plan and steer mid-run on mobile, since Claude does not document this.
- Whether the CLI gets a per-session search cap like Claude Code and whether a Free cap message may show a count (Free shows only Upgrade).

### [Deep research](../50-competitors/research.md)

- Whether Free users get a limited research allowance, as ChatGPT does, or none, as Claude and decision D-2026-09-28-11 say. That decision was made before ChatGPT's page could be read.
- Whether research should ask clarifying questions first.
- Whether coding surfaces (CLI, VS Code) and Chrome get their own research run or only search and fetch, and whether to copy the Claude Code claim-voting workflow.
- Whether to build company knowledge across connected tools, and for which plans.
- Whether to add proactive background research like ChatGPT Dot.
- Whether specialist research (science, clinical, shopping) is in scope.
- Whether to offer research in Local mode with local sources only, or keep it cloud-only with a clear label.
- Whether a research run may use a different model for the checking pass than the chat model, and how that is shown.

### [Tools and code execution](../50-competitors/tools-and-code-execution.md)

- Whether sandboxed code and web search run without asking in the default read-only mode everywhere. D-2026-09-15-01 says yes, but a web Work test showed approvals.
- Whether to match features only one leader documents: Claude Cowork VM and computer use for chat, ChatGPT site tools (WebMCP), Python in canvas.
- Whether interactive charts and tables stay free or are plan-limited, since one ChatGPT page limits them to Plus and Pro.
- Whether inline visuals should appear on mobile; Claude does not render them there, ChatGPT does.
- Whether the hosted sandbox network default should be off or package managers only (Claude's default).
- Whether Free users get hosted code execution or only Local, given its metered cost.

### [Connectors, apps, plugins and skills](../50-competitors/connectors-apps-and-extensions.md)

- Multiple accounts per connector: owner decision of 2026-09-27 says one account; experience-contract.md requires multiple identities and ChatGPT documents it. Which stands?
- Whether to build the ChatGPT-only extras (Secure MCP Tunnel, developer mode, Sites hosting MCP plugins, app templates, Company Knowledge) or the Claude-only extras (desktop .mcpb extensions, skill recording, GitLab marketplace, Salesforce plugin).
- Whether any connector beyond the 13 named should be released before the release state changes to released, and which plans get which connectors on 2027-01-01 when subscription sales may start.
- Whether custom assistants stay as agents, become plugins only, or both, given ChatGPT retires custom GPTs on 11 Dec 2026.
- Whether skills are open to Free (billing catalog) given ChatGPT documents conflicting plan scope, and whether Free gets one custom connector as Claude does while the owner rule is paid only.
- Whether Office, Google Workspace, Teams and WhatsApp add-ins belong in scope as AGI surfaces.
- Whether Local mode may call cloud connectors through an explicit fork with visible provider label, or never.
- Whether mobile plugins are in v1: the surface matrix says absent, comparison cites screens.

### [Agent actions](../50-competitors/agent-actions.md)

- Whether to build an always-on personal agent (ChatGPT dots, Claude Duet) and, if so, Managed Cloud only.
- Whether to build a hosted cloud browser for agents; both leaders have one, with sign-in and plan limits that differ.
- Whether to match features only one leader documents: recorded browser shortcuts (Claude), site tools (ChatGPT), team shared tasks (ChatGPT), meetings (Claude).
- Whether Free accounts get Work, schedules or cloud code, since docs/product/requirements.md section 20 says Free Cloud execution is enabled but billing-catalog.ts gates Work to higher plans.
- Whether goal loops, subagents and agent view belong in the chat apps or only in the coding tools, where both leaders keep them.
- Whether to bring per-routine effort back, since the standing rule in D-2026-09-27-02 says neither leader has it but the catalogue shows Claude Code routines do.
- Whether Windows computer use ships before the Mac one is verified.
- Whether Local mode may run agent tasks at all: D-2026-09-15-15 keeps Local Tasks off until a small local model passes the tools and agentic matrix.

### [Approvals and permissions](../50-competitors/approvals-and-permissions.md)

- Whether to build a model-judged auto approval (Claude auto mode, Codex auto-review), given it costs tokens and sends actions to a model.
- Whether to build a wallet with biometric approval for purchases (ChatGPT only) and where money-action consent lives.
- Whether to match Claude's per-app tiers for computer use (view-only, click-only) on desktop.
- Whether to add personal standing rules like ChatGPT's dot Custom Rules.
- Whether to add edit-before-approve, which neither competitor documents.
- Whether to add the approve-generated-links prompt on web (ChatGPT only).
- Whether named permission profiles (Codex) are wanted on CLI and VS Code.
- Whether admins may block skip approvals and auto mode on every app, as Claude Code and Codex allow.
- Whether unattended runs deny or wait when a prompt is needed.

### [Voice](../50-competitors/voice.md)

- Whether to match ChatGPT-only features: voice that starts and steers tasks, live translation, pronunciation help, meeting recording, audio file upload, custom dictionary and dictation cleanup.
- Whether live voice must work for BYOK and Local users (today it is managed cloud only), or stays a Cloud feature with a turn-based fallback.
- Whether to build background voice, lock screen, CarPlay and Live Activity on mobile.
- Whether to add screen or camera sharing in voice (ChatGPT keeps it only in its older mode and desktop screen context; Claude: not shown in the catalogue).
- Whether VS Code gets dictation (the product matrix says a VS Code webview has no microphone) or stays absent.
- Whether web and desktop get push-to-talk in live voice.
- Whether to add workspace admin switches for voice and dictation.
- Whether system-wide dictation on Desktop is a shipped feature (code says built, contract and known-flaws say unwired) and whether to add Windows and a Caps Lock key.
- Whether voice limits are shown to paid users as meters or minutes, and what the mobile voice limit is when subscription sales resume.

### [Images and video](../50-competitors/images-and-video.md)

- Whether to build image templates, sketch to image and prompt sharing. The 2026-11-13 decision says image style templates and an Images page are not built, but a web Images page and presets exist in code.
- Whether to match features only ChatGPT has: saved @name references, GIF and image-to-video, sticker packs, virtual try-on, camera and screen share in voice.
- Whether to build video editing, extension, storyboards and likeness consent, given neither leader now offers video generation and ChatGPT's Sora is shut down.
- Whether mobile video generation switches on, given the flag is off and Free video is paid-only there.
- Whether to add provenance metadata and a verify page, since ledger and comparison disagree on the current state.
- Whether to add an image-hash abuse check on uploads, as Claude documents, and an admin switch for image generation.
- Whether to add a before-send warning for poor image quality and uncertainty marks in answers (no leader shows an in-product version).
- Which models count as image-capable in Local mode, and whether an on-device vision preprocessing path is wanted.

### [Coding workflows](../50-competitors/coding-workflows.md)

- Whether to build an editor-window reader in the chat app like Work with Apps (ChatGPT only in the evidence).
- Whether to build a deep multi-agent cloud review like Ultrareview (Claude only) and what to charge.
- Whether to build a pull-request inbox and Submit review in the app (ChatGPT only).
- Whether to build coordinated Projects that fan out many cloud threads (Claude only).
- Whether to start coding work from Slack, and whether to support GitLab, which ChatGPT lists in beta and Claude does not for cloud.
- Whether to ship an official CI action, or leave CI to the CLI non-interactive mode.
- Which severity words the review uses: Claude uses Important, Nit, Pre-existing; Codex uses P0 and P1; AGI uses blocker, major, minor, nit.
- How the Free plan describes Code: the page says included from Basic; the Basic upgrade card omits Code.
- Whether an unattended coding routine needs a per-user cost cap by default.

### [Tasks and schedules](../50-competitors/scheduled-tasks.md)

- Whether to match ChatGPT-only features: share task by link on Mobile, monitoring on Mobile, schedule inside an existing chat, always-on dots.
- Whether to match Claude Code-only features: /loop, combined schedule plus event triggers, scheduled artifact publishing, token-managed API trigger UI, CI scheduling.
- Whether Local scheduled tasks use the device only while the app is open, or also a background service.
- Whether a run blocked by the usage allowance is held and run after reset or skipped.
- Whether team shared tasks are in scope for the first release.
- Whether per-task notification settings stay web-only or become account-wide as the owner decision says.

### [Notifications](../50-competitors/notifications.md)

- Match ChatGPT's floating status pet (one competitor only)?
- Add SMS as a channel (ChatGPT only)? It needs a phone number and server cost.
- Let the agent send its own pushes (Claude Code PushNotification only)?
- Add a per-project mute (Claude Code desktop only)? An earlier decision kept routine notifications account-wide.
- Allow typed reply from a notification (ChatGPT dots only)?
- Offer outside channels such as iMessage, RCS or Slack for agent updates?
- Trusted contact for adults: build it or not?
- Send mobile pushes from CLI work when Remote Control stays hidden in v1?
- Build workspace webhooks for scan events (ChatGPT preview)?
- Plugin toasts and notifications in the CLI: build or not?

### [Sharing and collaboration](../50-competitors/sharing-and-collaboration.md)

- Whether links may have no expiry (both leaders' chat links last until unshared; AGI caps at 30 days).
- Whether to build named-person chat sharing, which only Claude documents.
- Whether to build live co-editing of documents, sheets and slides, and the whiteboard, and on which apps.
- Whether to build Teams, Spaces and Pages as ChatGPT has them, or keep workspace groups only; the requirements file defers full project collaboration and the team console.
- Whether projects may be shared by link outside a workspace, and what the per-plan collaborator caps are.
- Whether a single account with no workspace may share a project.
- Whether Local chats and files may be shared at all, and what the consent step names.
- Whether to match ChatGPT's shareable profile and Claude's embed code, each documented by one competitor.
- Whether group chats are wanted, given ChatGPT retired them.
- Whether phone apps may create shares (Claude is web only; ChatGPT allows it).

### [Synchronization and continuity](../50-competitors/synchronization-and-continuity.md)

- Whether to match Apple Handoff and a Hand off chat between hosts action, each documented by only one competitor.
- Whether Mobile Remote Control and Dispatch return after v1, and when (owner hid them in v1 on 2026-11-14).
- Whether Local inference on mobile and desktop needs sign-in; the project documents leave sign-in separate from payment.
- Which settings follow the account and which stay on the device; no list exists.
- Whether Read-only session attachment and an execution-owner indicator are wanted (ledger S68.10 and S68.12).
- Whether to build summary-only transfer and transcript branch as separate options when moving a session (S68.28 and S68.29 are marked not applicable).
- Whether Free accounts get any continuity beyond chat sync, given Remote Control is paid-only.
- Whether to build trusted-device verification for Remote Control.

### [Settings](../50-competitors/settings.md)

- How many interface languages to offer. D-2026-09-15-03 allows only complete and reviewed languages; leaders offer 11 to about 60, and only English and Spanish are selectable now.
- Whether to match the dyslexia-friendly font on mobile, which only Claude documents.
- Whether to build theme sharing and custom theme files, which only the coding tools (Claude Code, Codex) document.
- Whether time zone, interface density, sound effects, startup destination, default workspace and layout reset (all Should items with no leader evidence) are worth building.
- Whether chat-history import from other assistants is wanted; no leader chat product documents it in the catalogue.
- Whether accent color and text size are needed on CLI, VS Code and Chrome.
- Whether the Reduce sensitive content switch (ChatGPT Settings > Safety) belongs in this topic or in safety; AGI already has one on web and mobile.

### [Privacy and data controls](../50-competitors/privacy-and-data-controls.md)

- Whether to build locked chats behind a PIN or device check (only ChatGPT documents it).
- Whether to add a per-account zero data retention switch and a HIPAA or BAA offering, or keep stating that none exists.
- Whether to match Claude's fixed never-remembered data classes and sensitive-topics opt-in, or keep a user-managed never-remember list.
- Whether Free and Plus-style consumer retention periods should be stated as day counts in the pane, and which numbers.
- Whether chat deletion from the sidebar should go to Recently deleted like other paths, or stay permanent with its current copy.
- Whether CLI, VS Code and Chrome should get their own training, temporary-chat and delete-all controls or defer to the account setting.
- Whether to build a private or cloud browser session with cookie clearing.
- Whether to offer Lockdown mode on desktop, CLI and extensions.
- Whether to add a feedback record and a statement of feedback-upload exceptions to training.
- Whether Business admins can enforce MFA, which ChatGPT documents it cannot.

### [Subscriptions and plans](../50-competitors/subscriptions-and-plans.md)

- Whether to add an annual price for individual plans (only Claude shows it; ChatGPT individual plans are monthly).
- Whether to add a tier above Ultra (ChatGPT shows a $500 tier; Claude does not).
- Whether to match gift subscriptions, gift cards and a wallet balance (ChatGPT only; Claude's gifts are paused).
- Whether to run education, teacher, student, veteran, clinician or nonprofit programs, and which verification partner to use.
- Whether to bundle monthly API credits with top plans (both show them).
- Whether to sell discounted prepaid bundles (Claude only).
- Whether to add a device and card limit on paid accounts (ChatGPT only).
- Whether to offer self-serve Enterprise purchase (Claude only) or keep Enterprise sales-led.
- Whether to ever show ads on lower plans (ChatGPT only).
- When to open paid purchasing and retire the waitlist; no purchase surface works until then.
- Whether per-member and group admin budgets belong in the first paid Team launch.
- Whether to build the personal-to-workspace merge with refund before the first Team sale.

### [Usage limits](../50-competitors/usage-limits.md)

- Whether to match ChatGPT's per-app weekly cap and 'Sign in with plan' sharing, which only one competitor documents.
- Whether to add a verified-account rule before lifting the top tier's session cap, as Claude does.
- Whether to add a capped reserve model after limits, as one ChatGPT feature does.
- Whether to add paid instant resets, banked promotional resets or an assistant that redeems resets.
- Whether blocked work should auto-resume after reset (Claude Code only) or only notify.
- Whether to bundle monthly developer API credits with top plans, as both leaders do.
- Whether Free should have unlimited base chat, as ChatGPT advertises (comparison W55).
- What the Free usage rule means for CLI, which currently shows meters.
- Which warning threshold is the public one (80% in definition, 75% on Chrome).
- Whether Local use and BYOK use should be shown in Usage as unmetered lines.
- Whether per-device and per-card paid-account limits (one competitor) are wanted.

### [Recovery behaviour](../50-competitors/recovery-and-errors.md)

- Whether the web chat Delete dialog should say 'can be restored for 30 days' (matches code) or deletion should be permanent as ChatGPT states; the AGI rule wording and the dialog disagree.
- Whether to match auto-continue of interrupted turns (only Claude Code documents it).
- Whether to offer a search retry in the regenerate menu (ChatGPT, Enterprise and Edu only).
- Whether to add a restart control for stalled project conversations (Claude beta only).
- What Local mode does when a local model fails and the person has not agreed to cloud: stay local only, or offer an explicit fork with consent.
- Whether to show known-issue and incident notices on Mobile, CLI, VS Code and Chrome.

### [Account and sign-in](../50-competitors/account-and-sign-in.md)

- Whether to add phone-number sign-up or phone verification, which only Claude (verification at sign-up) and ChatGPT (phone-only sign-up in some regions) document.
- Whether to add SMS, WhatsApp and push approval as second factors, which only ChatGPT documents.
- Whether to build selfie or government-ID age proof for a wrongly blocked adult, or keep age as declared, on-device or store signal only.
- Whether web Guest chat without sign-in should be turned on, and whether desktop Local chat should need no account.
- Whether to offer sign-in with an AGI account for partner apps, which only ChatGPT documents.
- Whether to build verified access programs (security, life sciences).
- Whether web sessions should stay at the vendor's 7 days or move toward Claude's 28 days.
- Whether CLI and VS Code get managed login restrictions and company SSO (Claude Code and Codex both have them).
- Whether to build two-account switching on web and an admin switch for it.
- Whether join-by-domain, invite link and a move-personal-account flow are wanted.

### [Teams and admin](../50-competitors/teams-and-admin.md)

- Do workspace policies (model, connector, tool, feature switches) apply to a signed-in user's Local-mode sessions, or only to AGI Cloud routes? Leaders have no Local mode to compare.
- Should required SSO be built, and may it ever block free Local use?
- Match features only one leader has: dynamic groups, group spend pooling, spend-increase requests, company gateway, surveys, analytics chat.
- Data residency: keep the US-only decision (2026-09-04) or finish the region screen the code already has.
- MDM and managed policy for Desktop and Mobile, given Enterprise Local licensing is not approved (ADR 2026-07-30).
- Whether Team stays at the current seat prices while subscription sales are on hold before 2027-01-01.

### [Apps, install and updates](../50-competitors/apps-and-install.md)

- Whether the public Desktop ships for Windows and Linux, and in what order; today only Mac builds.
- Whether to offer a Stable/Latest channel (only Claude documents it) on desktop, CLI and VS Code.
- Whether to match enterprise fleet controls (MSIX, PKG, MDM keys, minimum version, in-app update switch) both leaders document for paid enterprise plans.
- Whether to build Apple Intelligence integration, CarPlay or Android Auto, and a hardware keyboard (each documented by ChatGPT only).
- Whether to read text from the front app (ChatGPT Work with Apps) and whether Claude-style background computer use is wanted.
- Whether to offer an installable web app and offline fallback; the manifest exists but the ledger marks both not applicable.
- Whether the CLI is offered through Homebrew, WinGet, apt, dnf and npm as the leaders do, or only by the signed script.
- Whether a managed Intune-style phone build and Office or Workspace add-ins are in scope.
- Whether the Android default-assistant role and Quick Settings tile are wanted.
- Whether the update check, an outside call, is allowed by default in a strict Local setup.

## From the system, app and engineering pages

### [Model catalog and routing](../40-systems/model-catalog-and-routing.md)

- Which resolver is canonical, TypeScript or Rust? The conformance test header says the question is undecided.
- The default auto alias has minTier basic while tierAllowedSlots.free and tierMaximumProfiles.free exist. How do the picker and server reconcile Auto for Free accounts?
- Challenge 'free users get Auto at economy band mixes two mechanisms': partly upheld. The page now separates the alias gate (minTier basic), the lane clamp and slot list (both serve Free), and the TypeScript-only Free Auto stage. The claim that Free is served only by the free-auto path was not confirmed: resolveRoutingLane applies tierMaximumProfiles and tierAllowedSlots to free directly. The max_15x, team and team_premium points were upheld and added (normalizeTier).
- Challenge on the seeded count stands: 13 of 28 seeded was not re-counted by this check (the evaluation.seeded path did not match in a re-count script) and is kept from the earlier read and the reviewer's count; re-verify with pnpm models:families.
- Where is the lifecycle-stage rule ('registered or later' for managed traffic) enforced in code?
- Which table holds the managed usage ledger rows that record model price versus route cost? Not read.
- Should on-device models be moved into the registry with the shared capability vocabulary? Product choice left open by the code.
- Should named profile weights (quality, cost, latency) drive ordering, or be removed? Latency has no direct weight in slot ordering today.
- Is failing open on an unreadable workspace policy acceptable under the fail-closed rule in AGENTS.md section 6? Only the doc comment was read.
- How do the Chrome side panel, mobile and CLI render picker locks and capability icons? Only Web, VS Code and Mobile warning text were read.
- Have any of the routing tests, guards or conformance replays passed on the current main? No run was recorded or made.
- Should the eight family slots promoted without the eval gate be re-gated, and should family fallback chains be filled (27 of 28 are empty)?
- Does any app let a user install on-device model files without reaching huggingface.co?

### [Inference providers](../40-systems/inference-providers.md)

- Does the public Electron desktop expose BYOK and local chat? AGENTS.md section 5 and docs/architecture/byok-provider-strategy.md say public Desktop chat is managed-cloud only, while harnesses.json lists desktop/byok-chat as implemented and desktop/local-chat as partial. I did not establish which is live.
- Is sign-in required for local inference on mobile and desktop? The requirement says payment is not, but I did not trace the account gate.
- What does the mistral harness depend on? It names a package that does not exist, and I found no model route using it. Is it planned, dead, or served some other way?
- Which HTTP methods do the /api/llm/v1 routes export (embeddings, models, route/preview, credits/balance)? I listed the route files but did not open each handler.
- Do the OpenAI and Anthropic SDK constructors apply their own default retries under web's retry? Not verified in SDK source.
- Are the table names routing_decision_traces and model_rollout_benchmarks present in the migrations? Taken from a doc only.
- Are the mobile and Chrome extension provider-runtime dependencies used at build time or only left over? No source import was found in either.
- How should audio (speech) and image providers be abstracted so a vendor swap needs no route edit? The code leaves this undecided.
- Who decides when gateway routes move from experimental_only to managed traffic? The doc says a founder-confirmed reseller agreement; no code gate beyond the catalog field was examined.
- Which plan names gate which providers or models for each subscription plan? Held in the subscription system, not read here.
- Do mobile's canAccessCloudModelForTier and web's canAccessModel read one shared entitlement source? The mobile gating is confirmed in service.ts, but I did not trace where its tier data comes from.
- Challenge 'wrong' (Chrome extension imports ThinkingTagSplitter only in freeTrialClient.ts) was checked and is right: the import is in three files (freeTrialClient.ts:91, conversationHistoryPull.ts:24, cloudAgentClient.ts:24). The page now cites all three. The 'only ThinkingTagSplitter from provider-protocol' part still stands, since a grep of apps/extension/src found no other import of provider-protocol or provider-runtime.
- Challenge 'missing' (mobile declares provider-runtime unused; header claims mobile and extension consume it) was checked and is right: apps/mobile/package.json:67 and apps/extension/package.json:50 declare it, and grep of both src trees found no import. Added to gaps and outdated_documents.
- Challenge 'missing' (mobile cloud gating by cloudUnlocked and tier) was checked and is right (service.ts:180-190,275-306). Added. The page does not claim every app shares one subscription check; that stays an open question above.
- Challenge 'missing' (mobile Provider-funded Free quota models) was checked and is right (service.ts:303-330, surface cloud_managed, shown only when cloud is unlocked). Added as a cloud-boundary fact.

### [Local inference](../40-systems/local-inference.md)

- Challenge accepted, not wrong: Mobile Local mode still reaches AGI servers for signed-in account controls and passes any non-AGI host, although Mobile has no own-key mode. Confirmed in apps/mobile/lib/egressGuard.ts:24-35, :210-244, :300-327 and now stated in the page. Still open: does the first-run disclosure or product copy tell users about these exemptions?
- Challenge accepted, not wrong: the Chrome extension has no local inference and reports localModels false (apps/extension/src/features/cloud-bridge/deviceHeartbeat.ts:33-39; side_panel.ts:10938, :10943 are icon ids). Now stated in the page. A full-repo search of the extension for a local model runtime was not done beyond these files.
- Does the retained Tauri desktop expose a working local chat path to the web composer? No handler for the six local-inference commands was found, but the Tauri commands are registered under different names (ollama_*). Whether the web client's invoke maps to them is not established.
- Is a Free-plan user meant to be blocked from Local models on Web? The ComposerFooter gate says yes, while the requirement says Local is free of any subscription.
- Should public Desktop offer Local chat? The brief says local inference on desktop is free, but founder decision D-2026-09-15-04 and the dispatcher make Desktop Cloud-only. This is a product choice the code leaves undecided.
- Are Mobile document attachments in Local mode parsed fully on the device? buildAttachedDocumentContext was not opened.
- Does the egress guard's account-control path require a bearer token exactly as the challenge states? The page repeats this from the challenge's citation (egressGuard.ts:210-244); the bearer test code was not re-read here.
- Does the hand-written local-llm catalog pass the repository's model-ID literal guards, or is it exempt? The guards were not run or read.
- Is the Apple system model's iOS 26 requirement enforced identically in JS capability detection? Only the Swift check was read.
- Which app, if any, calls the provider-ollama and provider-lmstudio TypeScript adapters at runtime for a user's own machine? The factory lists them and desktop's package.json depends on them, but no call site was traced.
- Is there a recorded real-device run of Mobile Local chat (iOS and Android)? None was found in the documents read.
- Does the CLI enforce a minimum context length for local models (the manifest says 65536)? No such check was found.

### [Execution boundaries: Local, own key, Cloud](../40-systems/execution-boundaries.md)

- Challenge: 'evaluateProviderEgress is called by three routes'. Right in substance and corrected. The grep shows one direct product caller (apps/web/lib/managed-compute-gate.ts, import line 14, call line 325). The three product files (artifact completion, experiential-free completions route, free-quota turn) call the wrapper buildProviderEgressGateResponse. Whether the main chat completions route reaches it is still not traced.
- Challenge: plan labels such as Premium are not code tiers. Right and corrected. The page now gives the code tiers and the sets PAID_TIERS and PRO_TIERS (billing-catalog.ts:332-341), with labels mapped once. The label mapping (pro is Premium, max_15x is Ultra) comes from billing-catalog.ts:5-16 and 166-232 read in the earlier pass; it was not re-opened here.
- Challenge: desktop renderer guard fails open on an unparseable host. Confirmed in apps/desktop/src/lib/egressGuard.ts:23-45 and 56-67 and added as Gap 16. Whether any renderer code can issue a relative-URL request that reaches our servers in private mode was not traced.
- Challenge: Electron Desktop is Cloud-only by recorded decision D-2026-09-15-04. Confirmed at dispatcher.ts:3235-3244; the page now names the decision in the app table and Gap 7. The decision document itself was not opened.
- Challenge: mobile v1LocalOnly flag. Confirmed at remoteChatGate.ts:3-8 and added as Gap 18. No released build sets it, per the code comment; build configuration was not checked.
- Challenge: split subscription rule between apps is not flagged as a departure from the one-subscription requirement. Confirmed and flagged in Rules item 3, Gap 17 and How it should work item 5. Whether the split is intended is unknown.
- Not re-verified in this pass: all other line citations carried over from the first draft; only the challenged points were re-opened. Nothing was run.
- Whether the web build can reach the Local path or the Local-to-own-key fork in a plain browser is unknown.
- Whether an own-key plan is required on any app other than the CLI and VS Code (which need none) is unknown, because allowedProviderSurfaces has no reader.

### [AGI Subscription: plans, entitlements, usage and limits](../40-systems/subscriptions-entitlements-and-usage.md)

- Which tool or admin route writes a hand-granted plan (the manual billing source, used for the mobile review account)? Not found in apps/web/app/api/admin or lib/services.
- Is it intended that any beta_redemptions row (not only billing-upgrade invites) opens the paid checkout gate? Code counts any row for the user.
- When will paid sales open? The gate flag billing.upgrades_open and the owner date for subscription sales are not stated in a repository document read here.
- Is the 50-credits-per-dollar top-up rate against the 200-credits-per-dollar credit definition a deliberate markup or a defect? The code keeps both constants and does not say.
- Is the up-to-5-minute CLI and VS Code cache lag after a cancellation accepted by the owner?
- What do the Chrome free-trial client and free-plan notices check, and do they match web wording and numbers? Not read.
- Do apps/web/features/billing components add any plan checks of their own beyond the shared helpers? Not read.
- Will catalog versions ever differ in allowances, and what is the 30-day notice process in practice? Only the mechanism exists.
- How the Free usage screen rule (Upgrade only, no meters) is enforced on mobile, desktop and Chrome; only a web test is named in project memory.
- Exact Stripe price ids and the full list of STRIPE_PRICE_* names beyond the first rows in apps/web/lib/pricing.ts were not enumerated.
- Challenge 'local-only and byok listed as available on web, desktop and mobile' was accepted in substance. The catalog does list them for web, desktop and mobile (billing-catalog.ts:235-247), but the page now states this is plan visibility only and adds the per-app mode table from trust-boundaries.md:45-60. The page never claimed Local ran on web; the mismatch between catalog visibility and mode support is now listed as a gap, and the page states that Local is offered only on Mobile, CLI, VS Code and the retained Tauri build.
- Challenge on Tauri desktop logic was accepted in part. The page already marked the Tauri code as retained, but rows 8 and 9 now say plainly they are not the public Desktop, and row 9 is described as a routing hint (free, basic, hobby), not an entitlement check. The findings stay listed because the code is still in the repository.
- Challenge on the manual billing source was accepted and corrected: a valid Stripe customer id with no subscription id reads as stripe (subscription-billing-owner.ts:56-66), and a free tier reads none. Manual needs a paid tier with no store id, no Stripe subscription id and no Stripe customer id.
- Challenge that the top-up rate is not reconciled with the credit definition was checked: the code has two separate constants (50 credits per $1 paid; a credit is $0.005 of provider cost) and neither the code nor credits.md establishes a markup or a defect, so the page no longer says there is no conflict.
- Challenge that Basic has no flagship cap was checked against managed-usage-limits.ts:250-258 and is right. The page table already showed none for Basic, and it now says why.
- Challenge on the webhook 503 was checked at stripe-webhook/route.ts:60-66 and is right. The page already mentioned it in prose; it now has its own failure-handling row and key fact.
- The Enterprise unlimited point was checked and is right (managed-usage-limits.ts:82-84; managed-usage-policy.ts:95-102). The page had Enterprise as 'contract (unlimited flag)'. It now states the Infinity allowance and the uncapped ledger constant.

### [Authorization, workspaces and sharing](../40-systems/authorization-and-workspaces.md)

- Which migrations are applied in production? Several migration headers (0200, 0217, 0234, 0236, 0248) say NOT YET APPLIED, but later migrations and live code depend on them. The migration ledger on the target database was not read.
- Has pnpm db:rls-probe or any guard run green against a live database, and when? No project document found records it.
- Does surface:vscode send the x-agi-organization-id header or apply the effective workspace policy? Not found in the files read.
- How does surface:chrome choose the workspace it syncs conversations into?
- What does mode:local require for sign-in or account on mobile and desktop, and does local mode ever consult this layer? Not traced.
- What is in scripts/config/membership-unattended-work-baseline.json and membership-exit-revocation-baseline.json today (the open leaks)?
- Is the public.workspaces table (migration 0234) intended to become the scoping key instead of organization_id? Product choice left undecided by the code read.
- Are paid team seats purchasable today, given the owner's decision of no subscription sales before 2027-01-01? Not checked in code.
- Which of the roughly 25 policies still use the role pair array['owner','admin'] after 0200, and is any still reachable by a custom role holder?

### [Data model and migrations](../40-systems/data-model-and-migrations.md)

- Who runs the production migration apply, with which target, and when? The production deploy workflow only runs verify and record.
- Does a migration file with its own BEGIN and COMMIT leave the ledger insert inside the runner's transaction? The runner opens BEGIN first and sends the file as one query. Not tested here.
- Is the mobile SQLite conversations and messages table pair intentionally empty, or is a writer planned? Product choice left open by the code.
- Which of the 278 created tables are in no erasure or retention inventory? check:retention-graph answers this but was not run.
- What is the Neon point-in-time history window for the production project?
- What does the VS Code extension store in globalState, workspaceState and secrets, and does it keep any chat history?
- Is any database row written for a signed-out Local mode session on any app? Not checked.
- Should the pre-0097 migrations get reversal scripts, or stay restore-only as the down README states?
- Should the 143 stale 'NOT YET APPLIED' headers be recorded in CORRECTIONS.md, given they cannot be edited?
- Who owns the legacy gateway tables conversations, messages and chat_messages now that no writer exists in apps/web?

### [API and shared contracts](../40-systems/api-and-contracts.md)

- Which database tables store API keys, workspace keys and request audit data was not opened here.
- Does the web route set a plan tier on any developer route, so that tier scaling applies? The doc says none do; each route was not checked.
- How the OpenAPI file is kept in step with routes beyond the key-reachable ones: no generator found, process is unconfirmed.
- What exact fields the OpenAI-style error body carries on every gateway route, and whether a single error shape is intended.
- Whether the api.agiworkforce.com alias has been deployed and verified live; no run record was read.
- Whether local-mode and own-key-mode users must sign in for any call to these routes (sync, entitlements); this is the account question the brief separates from payment.
- Plan-by-plan concurrency and usage numbers in billing-catalog.ts were not read.
- When the minimum supported API version should rise above the latest, since the supported list currently has one entry.
- Whether the services facade named in cloud-contracts docs still exists: packages/services/src is gone, but services/ holds signaling-server and upload-scanner only.
- Which other Rust consumers beyond CLI and desktop use the generated protocol types in TypeScript apps (only the Chrome extension was confirmed).

### [Chat turn pipeline](../40-systems/chat-turn-pipeline.md)

- Is plain (no-tool) chat meant to run on the durable Workflow transport? The route header says every managed or free-tier turn does; the code only does it for tool-loop and research turns.
- What is the CLI and VS Code Cloud and BYOK turn pipeline? Only the VS Code client call site and the policy matrix were read; CLI Rust internals and the VS Code endpoint configuration were not.
- What does api:POST /api/llm/v1/chat/completions/guest do and which limits apply? The file was not read.
- What is the table name behind the context manifest store (createPostgresContextManifestStore)? Not read.
- How does the free-quota completions route (/api/models/free-quota/completions) differ from the main pipeline in routing, billing and persistence? Not read.
- Should web code that has a Local turn path stay in the hosted web bundle while policy says Web has no Local? The code leaves it reachable only through a host bridge; the product choice is undecided.
- Exact per-plan limits (concurrent turns, attachments per message, connector tools) were not copied; read the billing catalog. Current plan names should be confirmed from the catalog, not from memory notes.
- Whether a local chat requires sign-in on mobile and desktop is a separate, undecided question from payment; not established here.
- Failed-turn records (recordFailedTurn) were read only as a call site; where they are stored and who reads them is unknown.
- No executed verification exists in the documents read; which of the listed tests currently pass is unknown.

### [Agents, tools and automation](../40-systems/agents-tools-and-automation.md)

- The brief's start file apps/web/lib/chat/tool-loop.ts does not exist; was a move intended, or is the real file under app/api/llm/v1/chat/completions/lib the owner's intended subject?
- Does the page id SYS-chat-turn-pipeline exist in the knowledge base? I used it only as named in the brief.
- What does the desktop Local routines panel (LocalRoutinesSection.tsx) run, and where, given the public Electron app reports no local inference? Not read.
- Product choice: the requirement says local inference on desktop is free of any paid subscription, but docs/architecture/desktop-local-runtime.md says the public Electron app rejects all local inference. Which holds? I did not verify the Electron code.
- Does the CLI have a separate image path? The matrix lists CLI image generation Present while the chat image tool excludes the CLI surface.
- Tool catalog entries after line 686 of tool-metadata.ts (GitHub, memory, plugin and connector tools) were not read.
- Whether the E2B flag and compute price are set in production is unknown; so is whether the provider-native code tool is the live path today.
- How mobile approves tools in detail (settings/auto-approve.tsx) and how VS Code applies approvalScope was not read beyond file existence.
- Whether the Chrome extension can create or approve scheduled runs beyond the run journal (scheduled-task-runs.ts) is not established.
- The apps/web/app/api/agents/* routes and agent_tools tables (custom agents and tool executions) were listed but not read, so how they relate to the tool loop is unknown.
- Whether free-plan code execution is exposed in practice (Free has 2 sandboxes and 60 minutes in the catalog) depends on the free chat surface policy, not read.
- Product choice left open by code: autonomous is the cloud default for new accounts; whether that is the intended long-term default is not stated in a requirement I read.

### [Connectors, plugins, skills and MCP](../40-systems/connectors-plugins-and-skills.md)

- Do desktop, CLI and VS Code MCP servers work with no account and no subscription? I did not check sign-in or plan gating in the Rust and Tauri code.
- Which plan has which customMcpServers number (0, 5, 25, unlimited or custom)? I did not map them to plan names.
- Has any released connector ever been connected end to end on production? No document records a run.
- When will the full launch switch leave coming_soon, and what decides which ids join the 13? The code leaves that open.
- Are the Google Developer Preview eligibility and the owner-registered OAuth apps (37 vendors) in place? The documents say these are unknown or owner-only.
- Does the Slack assistant's channel allow-list and agent credit cap enforce what migrations 0374 and 0385 imply? I read only the plan gates.
- Should the Chrome extension get a connector client, or stay limited to WebMCP page tools? The code does not say.
- How does the CLI or desktop MCP trust boundary keep a Local session from reaching cloud connectors, given AGENTS.md section 6? I did not trace it.
- I did not open the Slack interaction and approval routes, plugin scan and signature code (migrations 0232, 0289), org-shared plugins, or the Plaid and health connectors in depth.

### [Files, artifacts and storage](../40-systems/files-artifacts-and-storage.md)

- Is the sandbox origin (NEXT_PUBLIC_SANDBOX_ORIGIN) set and the sandbox project redeployed in production? No run record was found.
- Is CHAT_LARGE_FILES_ENABLED on in production, and has the scanner been deployed with UPLOAD_SCAN_SOURCE_HOSTS and measured at the raised clamd limits?
- Do the VS Code extension and the Chrome extension upload files through the same presign and complete path in practice? Only imports and the relay rule were seen.
- Can a pure mode:own-key or mode:local user on web or desktop attach files without our servers, and where would those files be kept (no store:<name> was identified)?
- What are the exact Enterprise and Team Premium attachment and download numbers? They derive from price helpers or are marked custom.
- Which table backs the account-wide artifact index (migration 0121)?
- Product choice: should a published site be able to hold binary assets, or stay a single text document up to 1,000,000 characters?
- Product choice: should locally held files on mobile and desktop get any malware scan, given they never reach the scanner?
- Which knowledge-base page ids cover the AGI Subscription and entitlement rules? Only SYS-chat-turn-pipeline was named in the brief.

### [Memory, projects and context](../40-systems/memory-projects-and-context.md)

- Do chats of a non-owner member of an org-shared project receive project instructions and files? loadProjectContext selects only projects owned by the caller (project-context-service.ts:206-209), yet other routes use a shared-read scope (project-read-access).
- Is it intended that the web local-model path fetches account memory and instructions from the server (api:GET /api/memory/local-context) for a Local-mode turn? AGENTS.md section 6 says Local must not silently route to managed cloud; here content flows server-to-device with a sign-in, and the product decision is not stated in code.
- Is it intended that a CLI Local session reads all three boundaries' merged memory files while BYOK and Managed read only their own?
- What exactly does the internal Tauri desktop build do for memory and projects (apps/desktop/src-tauri/src/core/agi/project_memory.rs, memory_manager.rs, sys/commands/memory.rs)? I did not read these.
- Which surfaces are in AMBIENT_TOOL_SURFACES (the set that gets memory tools and file-search)? Only inferred as the apps plus Chrome.
- Should the engine's token budget be passed on the web turn? The code leaves it unset; the product choice is undecided.
- How do plan tiers max and team_premium limit projects and knowledge storage? Only free, basic, pro, max_15x and team were read.
- What do mobile's cloud memory mirror and VS Code's account memory store persist on the device, and how long?
- Does any test lock the order of blocks inside a single layer (for example account memory versus past chats)?
- Is there a user-facing view of the context manifest ('why did this reach the turn')? I found the data and explanation strings but no viewer.

### [Voice, images and video](../40-systems/voice-and-media.md)

- Is the Free daily media offer (10 images, 5 videos) serving anything today? The terms review standing, the console check record and remaining allowances were not read, and most inventory entries show an expiry of 2026-10-21.
- Does the mobile image status poll (every 2 s) hit the 10 per minute image rate bucket in production? The identifier used by the limiter and the production rate-limit scale were not checked.
- Is it intended that Max (not Ultra) has video slots and a 300-second monthly cap in the tier policy while the capability table admits only Ultra and Enterprise?
- Is read-aloud meant to be outside the Free 10-minute voice pool? The code reserves usage money but never checks voice minutes.
- Do mobile on-device dictation and device read-aloud require sign-in? Not established.
- Can any app use own-key (BYOK) for live voice, image or video? The managed routes use server keys only; the CLI can use its own OpenAI key for transcription.
- Where does audio go in the Chrome extension's browser speech recognition and in the desktop Web Speech path? Browser-vendor behavior was inferred, not read.
- Whether free-plan and Basic-plan users can reach video through the free-quota offer was not traced to a test.
- Does the public Electron desktop have any local (on-device) speech path beyond the global dictation shortcut? Only the internal Tauri code shows local Whisper.cpp and Piper.
- Which image and video models are live right now? This lives in the generated catalog (packages/ai/model-registry/catalog/models.curation.json and model-families.json) and was deliberately not read into this page.

### [Sync, continuity and notifications](../40-systems/sync-and-continuity.md)

- Does api:POST /api/chat/sync check the cloud_sync plan capability by name? The route checks the workspace policy and the free daily allowance only.
- How does the Chrome extension write conversations to the account? Only its pull of the conversations scope was traced.
- Does the VS Code extension sync chat history, and does it get any push or email? Not traced.
- Does mobile read the server notification feed (api:GET /api/notifications) or only its local store of 50 items? Only the web client of the feed was found.
- How does the Electron desktop chat sync? It shows the hosted web app, and the conversation routes it uses were not traced.
- Is sync allowed in mode:own-key? Code does not say; AGENTS.md section 6 requires an explicit consent fork between Local and BYOK.
- Which plan should gate Remote Control: developer_surfaces (Pro and above, per the feature registry) or remote_control (Basic and above, per the code)?
- Production values of SIGNALING_HTTP_URL, SIGNALING_STANDING_URL, ALLOWED_ORIGINS, Resend and VAPID configuration are not visible in the repository.
- When will the relay host be deployed and the mobile companion and dispatch switches flipped? This is an owner decision.
- Should browsers also get push for local code-session activity? The code sends phones only.
- The relay README says initiator defaults to desktop while the web pairing route defaults to mobile; which default is intended?

### [Observability and operations](../40-systems/observability-and-operations.md)

- Where do production logs, metrics and dashboards actually get viewed (log drain, OTLP backend, Sentry project)? The repository declares dashboards as data but names no backend.
- Is AGI_DB_LOW_POWER=1 currently set in Production? It changes real cadence for 15 and 30 minute crons.
- Has the alert-path drill in incident-response.md been run recently, and is PAGER_WEBHOOK_URL set in production? No record found.
- Which apps other than web and CLI send crash or failure telemetry (desktop, mobile, VS Code, Chrome), and is each consent gated?
- Do all callers pass the plan tier to the limiter, so the tier scaling applies to every chat route, and does the managed turn slot apply to mode:own-key turns?
- What is the intended public availability commitment: the status page and SLO catalogue state objectives, but capacity and availability are unmeasured in a recorded run.
- Should there be a global backpressure mechanism and a database pool alert, or is the current latency-first behavior accepted?
- Observability of mode:local on-device inference is not defined anywhere found; product choice whether any local health or diagnostics are collected.

### [Security and privacy](../40-systems/security-and-privacy.md)

- Is the production upload scanner (UPLOAD_SCAN_WEBHOOK_URL and token) deployed, or is UPLOAD_SCAN_REQUIRED set to false? No repository file records production state.
- Is SOFT_DELETED_RESOURCE_PURGE_ENABLED set to true in production? The code ships it unset, so the published 30-day recovery window may not end on schedule.
- Where does the VS Code extension store provider keys? A grep of providerSetup.ts for secret storage returned nothing; not established.
- What does Lockdown mode enforce on the server, if anything? Only the preference panel was read.
- Does the mobile app ship on-device (local) inference? The trust page and privacy copy place Local mode in the CLI, but the product requirement says mobile and desktop local inference is free of any subscription. Not resolved from the files read.
- Does a CLI entry exist in the trust-boundary proof set? check-trust-boundaries.mjs lists none, though trust-claims.json has a CLI provider-key storage row.
- The HTTP method for /api/settings/sessions used by Log out of all devices was not read (SecuritySection.tsx:62-70 shows only the path).
- The web apps/web/__tests__/trust-boundary.test.ts begins with upgrade-tier and proration arithmetic tests; how much of it actually proves a trust boundary was not fully read.
- Product choice left open: whether to fill the key-rotation rehearsal table, escrow the updater key, and provision a KMS (all BLOCKED_BY_HUMAN or accepted risk).
- Product choice left open: whether to drop the 'needs-vendor-specific-review' scope pass-through for about 20 connectors.
- The US-only routing panel and the named-provider consent rows were seen only by name; their enforcement paths were not traced.
- Whether lethal-trifecta gating and the tool gate apply to local or own-key modes on any surface (the gate is in the Managed Cloud route).

### [Shared interface code and design system](../40-systems/shared-ui-and-design.md)

- Does the public Electron desktop run the apps/desktop/src shell that mounts ChatInterface, or does it show the hosted web app only? AGENTS.md says the latter, DesktopShellV3 says the former exists in the Tauri build.
- Do Chrome, VS Code and mobile install a CapabilityProvider, a client-failure sink and an artifact sandbox origin? Only web, desktop and Chrome (sandbox origin only) were found.
- Is the web-origin memory store meant to stay in unified-chat, or move behind a host-supplied client? The code gates it by environment sniffing, and the repo has no recorded decision.
- Does local inference on mobile and desktop need sign-in? The shared admission code has no plan check, but account requirements are set by each host and were not read.
- Which stores persist to device storage (store:* names), and under what keys? Not established per store.
- What does the client-failure reporter do when no sink is set?
- Is the AgiMark shine animation used on the landing logo, which the design skill forbids?
- Are network-error modules in ui and unified-chat duplicates or re-exports?
- What did the last run of check:css-tokens, check:i18n-parity and theme-contrast.test.ts report? No run record was found.
- Whether and when more than English and Spanish become selectable (decision D-2026-09-15-03 is cited in code; the decision record was not opened).
- Whether the CLI or any other surface shares tokens through a Rust or generated path; none was found.

### [Repository layout and guards](../40-systems/repository-and-guards.md)

- Does the full guard chain pass today? No run was made or found in the documents read.
- Are CI jobs (including the CI-only guards) required status checks on main? Branch protection settings are not in the repository.
- Why do check:trust-boundaries, check:rust-egress-boundary, check:hardcoded-arrays and verify-skills-lock stay out of the local pre-push chain? Intent is not stated.
- Which per-surface trust-boundary.test.ts files exist? AGENTS.md says there is one per surface; I did not open them.
- How the guards map one-to-one to subscription, quota and entitlement rules was not traced; see the pages that own those subjects (for example SYS-chat-turn-pipeline, not read).
- Product choice left open: when real GitHub teams exist, how CODEOWNERS and the lane owner roles will map to them.
- The owner notes mention scripts/commit.sh; I could not find it (found scripts/commit-pathspec.sh). Whether the name changed is unknown.

### [web app](../30-surfaces/web.md)

- Is web chat currently serving production users, and at which commit? Only GET /api/version or the deploy workflow run history can say; the tree records no run.
- Does the Electron-hosted web UI require sign-in for Local chat? The web code reaches local models through the host bridge but the sign-in requirement for that path was not traced.
- Can a BYOK target ever be reached from web? The handoff dialog exists in web but no web key storage was found.
- Is CHAT_LARGE_FILES_ENABLED on in production now, and is the scanner at protocol 2? Documented as off on 2026-11-15; ledger has since advanced to migration 425.
- Has the first free-pool entry in apps/web/config/free-pools.json been reviewed? Its reviewedBy and verifiedAtMs are null.
- Product choice left open: when to open paid acquisition on web to everyone (the waitlist switch is a run-time flag).
- Whether the guest chat flag guest.chat is on in production is unknown.
- Which of the surface-feature-matrix 'Unverified' web cells (Chat, Library, Search) are truly absent or only missed by its import search was not settled.

### [desktop app](../30-surfaces/desktop.md)

- Has release-desktop-cloud.yml ever produced a signed, notarized build, and when will web SURFACE_STATUS.desktop change from Coming soon?
- Which plans (Free, subscribed) can use Desktop Code through the bundled CLI, and does Code require sign-in to the account? No entitlement check was found in the Electron shell.
- Is own-key (BYOK) chat intended for the public Electron Desktop, given D-2026-09-15-04 keeps inference Managed Cloud while the product requirement says local inference on desktop is free of any subscription?
- Is Tauri a second public app? The 2026-10-24 decision note says yes and says it loads the hosted web app; the README and AGENTS.md still call Tauri internal, and the Tauri window shows the Vite renderer. This is an owner question.
- Will Windows and Linux Electron builds ship? electron-builder.yml has only a mac section.
- Is the desktop-devices flaw (no heartbeat) still true, since describeDeviceForRegistry exists in dispatcher.ts?
- What is the shipped product name and bundle name (productName is 'Desktop', app id contains 'cloud')?

### [mobile app](../30-surfaces/mobile.md)

- Has the release-mobile workflow ever run, and is there any TestFlight or Play internal build? The repo has no v-mobile tag and no record.
- Does a Local-only user have to pass the full age gate, or only Cloud? rootRouting redirects every unconfirmed user to the age gate, while a test is named age-gate-guards-cloud-not-local; isAgeGateConfirmed was not fully traced.
- Which exact plans get which cloud models on mobile? It is decided by server tables and the generated model catalog, not traced here.
- Will own-key ever be allowed on mobile? suite.md forbids it in v1; the egress guard comment still says Local is on-device plus BYOK, with no code path found.
- When will dispatch and companion (Desktop steering) be enabled? Routes exist but flags are false.
- How does mobile fit the AGI Subscription system once nativePurchases becomes true? Server side is described in docs/runbooks/mobile-store-products.md, not read.
- Is the unified-chat package really the chat engine on mobile, or does src/features/chat duplicate it? Not traced.
- provider-runtime and routing are dependencies but barely or never imported in scanned folders; their mobile role is unknown.

### [cli app](../30-surfaces/cli.md)

- Has any signed CLI release ever been published? The tree does not say; the installer reports none and the surface status is Coming soon.
- Can Local mode start with no AGI account at all? README says Local and own key need no plan, but I did not find the single code check for the no-account case.
- May a fallback chain cross from Local to own key or Managed without a consent step? AGENTS.md requires explicit consent for such moves; apps/cli/src/routing/fallback.rs was not read.
- Product choice: should Free and Basic users get any managed model in the CLI? Code excludes them; billing-catalog sets developer_surfaces to PRO_TIERS.
- Are the hook events really 35, and are all three MCP transports connected? Only the README states this.
- Do the packages ai/providers folders map to CLI providers? The CLI uses the Rust crate agiworkforce-llm, so provider:<package folder> edges are only approximate.
- What real verification (manual run, CI results) exists for Managed mode on production? None is recorded in the documents read.
- Does the Desktop (Electron) installer currently ship the CLI binary in a released build, given Desktop is also Coming soon?

### [vscode app](../30-surfaces/vscode.md)

- Is the extension published on the VS Code Marketplace or Open VSX? Only the workflow and the tag v-vscode-0.0.1 are visible; no run history or listing was checked.
- Is the AGI CLI sign-in or account required for Local mode inside the CLI itself? Only the extension side was read.
- Which of the audit defects from 2026-09 (six built-in slash commands, dropped unsaved edits, memory switch not stopping the runtime, IME Enter) are fixed in current code? Not re-checked.
- Are the declared dependencies i18n, observability and utils actually used? No direct import was found in src.
- Product choice: should Basic and Free get any Cloud model access in the editor, or only Local and own-key? Code gates on developer_surfaces (Pro and up).
- Product choice: should VS Code become available before the CLI has a signed release, for example by bundling a runtime?
- The identity provider behind the device-approval page (for example Clerk) is not visible from this folder.
- Whether the 0.0.2 manifest version and the only tag v-vscode-0.0.1 indicate an intended release is undecided.

### [chrome app](../30-surfaces/chrome.md)

- Has the release workflow ever run, and is the extension published in the Chrome Web Store? Not in the tree.
- Does the side panel show plan or remaining quota? Matrix marks it unverified; free-plan notices exist, but a meter or plan label was not found.
- Are @agiworkforce/browser-tool and @agiworkforce/provider-runtime used? They are in package.json but no import was found in src.
- Which exact tests cover free versus subscribed behaviour in the extension? Not enumerated here.
- Product choice: should Chrome ever offer own-key or a Desktop-routed Local chat? Code and threat model say no; the product requirement set does not decide it.
- Product choice: narrow the content script match to approved origins (EXT-CONTENT-SCRIPT-ALL-SITES-01) versus keep the broad match.
- The public name: manifest says AGI Extension; whether it matches the product-names registry was not checked.
- Whether account sign-in is required before any chat (signed-out chat route) was not traced beyond the listing statement and the null-token path in getAuthToken.

### [Development setup](../60-engineering/development-setup.md)

- Which Homebrew packages, Xcode version and Android tooling a fresh Mac needs: not stated anywhere I read.
- Whether Docker or Homebrew Postgres is the preferred local database; both are mentioned in different files.
- The exact pnpm filter name of the VS Code extension package (read only the scripts block); use commands.json.
- Whether humans outside Claude Code are expected to use heavy-job.sh; no hook or guard enforces it for them.
- Which execution mode (mode:local, mode:own-key, mode:cloud) each dev command exercises is not stated in the setup documents.
- No recorded run of the setup steps; verification status is unknown.
- Why heavy-job.sh starts the command after the 900 s wait even when memory is still short: a product choice the code leaves undecided.

### [Configuration](../60-engineering/configuration.md)

- Does the production deployment set AGI_ENFORCE_PRODUCTION_CONFIG=1? The code allows either; the example calls it an owner decision.
- Which feature flags exist as database rows in production? Only key families are visible from code.
- Is AGI_FREE_LANE_MODE covered by the config-key registry or the scripts/config/config-keys.json baseline? It is missing from the example file's key list and from documentedKeys.
- How do the env price names (basic, pro, max, max_20x, team, enterprise) map to customer-facing plan names, given the product direction to rename plans?
- Which env names does the Tauri or Rust desktop code read, and does the desktop have a config file beyond .env and electron/config.ts?
- Which apps use mode:own-key at runtime beyond the CLI BYOK keys? Web BYOK handling (lib/byok-providers.ts) was not opened.
- The product choice on whether EEA blocking (AGI_BLOCK_EEA_TRAFFIC) runs in production is undecided in code; the example ties it to the EU representative question.
- None of the doctor, drift or guard commands were run for this page; their current pass state is unknown.

### [Build, test and checks](../60-engineering/build-and-test.md)

- Which guards in the chain also run in CI, and which run only in the pre-push hook? Only the heap flag lines of ci.yml were read.
- What do .husky/pre-commit and .husky/commit-msg run? Not read.
- Is the desktop app also affected by the Vitest major mismatch the way AGENTS.md describes for web? Code shows both on 5.x but no doc says so.
- Should the 8 GB heap flag be built into the web typecheck script instead of relying on the caller (product/engineering choice the code leaves open)?
- Current pass/fail state of the full suites is unknown; no run record was found.
- What exactly is in the full guard chain list (package.json:397 is one long line and was only partly read)?

### [Deployment](../60-engineering/deployment.md)

- Is Deploy Production Surfaces still disabled in GitHub right now? The repo records it but cannot show live GitHub state.
- Do the production-web, staging-web and production-railway environments carry required reviewers? .github/rulesets/environments.json declares intent; applied state is unknown.
- Is the Railway signaling deploy actually live, or is Fly the live relay? Docs say Fly; the workflow auto-deploys Railway and only Fly satisfies the web release gate's relay check.
- Does the manual deploy run the same gates (canary, env reconcile, release-gate) as the workflow? No document says; the manual procedure is only described in outline.
- Where is the staging origin served from, since no persistent origin or custom domain is required and the staging URL is only a hand-made alias?
- Product choice: whether to re-enable the automatic workflows or keep manual owner-run deploys is undecided in the code.
- The Vercel author-email block and fix are only in owner memory; the repo has no document for it.

### [Database migrations](../60-engineering/migrations.md)

- Who is allowed to run a production apply, and how is the production connection string supplied? Not stated in the repo.
- Is production-migrations-applied.json updated by a script or by hand after each apply? The runbook only says to record it.
- Which Neon history retention window does production use? The runbook says the repo does not record it.
- Do non-web surfaces (gateway) have their own migrations? DEPLOYMENT_SURFACES lists gateway, but I found no separate chain.
- Non-transactional statements (CONCURRENTLY) in up files: the runner always wraps a file in a transaction, so how such a change should ship was not established.
- I ran nothing, so no command here is verified by execution.

### [Monitoring](../60-engineering/monitoring.md)

- Which backend receives OTLP metrics and traces in production, and is AGI_OTEL_EXPORTER_ENDPOINT set there? Not in the repository.
- Is a Sentry DSN set in production, and who reads it?
- Is AGI_DB_LOW_POWER=1 set in production? If so, health probing is hourly, not every 10 minutes.
- Has the alert-path drill ever been run, and where is the result recorded?
- What does the mobile app report for errors or crashes? No module found under apps/mobile/lib or services.
- How does the VS Code extension report errors?
- Where is the supported way to read Vercel request logs documented? Only a private owner note describes the API call.
- Is the package script name for scripts/check-route-observability.mjs defined?
- Product choice left open: whether to alert on database pool saturation, CPU, memory and storage, which the capacity runbook says are not alerted.
- Which routes are not wrapped in withErrorHandler, and so lack request id headers and span lines? I did not enumerate them.

### [Troubleshooting](../60-engineering/troubleshooting.md)

- Does a Clerk development key really force a handshake redirect, and is that the only cause of redirect loops? Only the troubleshooting document says so; I found no code that proves it.
- Which plan names do users see for each tier id (basic, pro, max, max_15x, team, team_premium)? The owner renamed plans, and I did not read the display catalog.
- Does Local mode on each app require sign-in? The requirement keeps account and payment separate, and I did not establish the answer per app.
- Where does the mobile chatSyncOffReason text come from, and when is chat sync turned off?
- How do the Chrome extension and the Electron Desktop show sign-in, limit and local-model failures? Only web, mobile, VS Code (partly), CLI (partly) and retained Tauri code were read.
- Which of the register rows marked 'source-corrected' have since been checked live? None were run by me.
- Do the 'closed-lane' completion failures really occur when the key-value provider is down? Only the document says so.
- Product choice left open: Free allowances above Basic (PLAN-PAID-ALLOWANCES-BELOW-FREE-01), and billing upgrade rule differences between web and store paths (BILLING-UPGRADE-RULE-DIVERGES-01).
- Product choice left open: whether a quota 429 on CLI should stop retrying (CLI-QUOTA-429-AS-RATE-LIMIT-01).
- Which workspace commands in docs/agent-context/commands.json cover each troubleshooting check? I did not read that file.

### [Recovery](../60-engineering/recovery.md)

- Is the Deploy Production Surfaces workflow enabled now, or is production still deployed only by hand with the Vercel CLI?
- What is the Neon history_retention_seconds of the production project today? (One drill saw 21,600 seconds on 2026-09-19.)
- Is SOFT_DELETED_RESOURCE_PURGE_ENABLED set in production, and are soft-deleted rows therefore still kept forever?
- What are the recovery windows for memory restore and custom-agent restore (routes read only by name)?
- Do desktop, mobile, CLI, VS Code and Chrome show any restore control for deleted chats, or is it web only?
- Does the account-deletion 24-hour deadline match the documented grace in the privacy pages, and is the Sign in with Apple note shown on all apps?
- Has apps/mobile/services/api.ts since started recognising CLIENT_UPDATE_REQUIRED (not re-verified)?
- Founder has not stated RPO or RTO; no second region or provider is planned in any document read.
- Is there any admin tool to restore one user's deleted rows from a Neon branch without a full restore? None found.
- Do the runbooks for legal hold, incident communication and security.md section 3 change any recovery step? Not read.
- Does the web UI on other apps expose the cancel path for a scheduled account deletion? Not checked beyond web routes.

### [Glossary](../00-start/glossary.md)

- Local inference on Desktop: the requirement says local inference on desktop needs no paid subscription, but supportsLocalAppMode is true only for the Tauri shell or a dev flag, and the Electron build coerces app mode to cloud. Whether the public Desktop is meant to gain Local mode is a product choice the code leaves undecided.
- Local mode and sign-in: the pricing copy says Local needs no account (pricing.json localFeature3), but I did not trace whether the mobile or desktop apps still require sign-in to open. Account requirements for Local are unknown.
- Credits: credits.ts gives 200 credits per USD while billing-topups.ts gives 50 credits per USD for top-ups. I did not establish whether this is a deliberate markup or a defect; both constants are in code.
- Free versus Basic: managed-usage-limits.ts gives Free 2000 monthly credits and Basic 400. I did not establish whether the Free allowance is meant to be spent on cheaper models only.
- Sales dates: a project memory note mentions a date before which no subscriptions are sold on any app. I found no such date in code; the code only shows a waitlist/access-code note and a mobile nativePurchases=false flag.
- Which name wins: PRODUCT_NAMES says Code and Extension, but the VS Code manifest says AGI Code and the Chrome manifest says AGI Extension; Desktop is Desktop in Electron and AGI in Tauri. No document resolves this.
- Work label: app labels say Work while billing labels (BILLING_PLAN_CAPABILITY_LABELS, USAGE_WORKLOAD_LABELS) still say AGI Work. Whether the billing copy should drop the prefix is undecided.
- Scheduled label: web says Scheduled, desktop and mobile say Schedules, and the desktop agent task panel hard-codes Scheduled outside i18n.
- Routines and Operator: the Routines nav label and the /operator page exist; I did not trace what they do or whether they are wired.
- Mobile store top-up amounts (10, 20, 50, 100) differ from web presets (20, 50, 100, 250, 1000); I did not check whether that is intended.
- Cloud availability on Desktop strings: v3.json says Cloud is available on Desktop and Local runs in the CLI; whether this copy matches shipped behaviour was not tested.
- Two AGI Code tests: planIncludesAgiCode (sandboxes plus coding budget, basic and up) and the developer_surfaces capability (pro and up) can disagree for a plan; not traced which one each screen uses.
- Verification status of every row is unknown; no run records were found.

### [Established product requirements and decisions](../10-requirements/established-requirements.md)

- Whether Local mode on Electron desktop and the CLI works fully signed out is documented as yes (requirements.md 7.1); Mobile is verified in code (no account, age confirmation first).
- Whether the owner's recorded 2027-01-01 sales deferral exists in any repository record; none found.
- Whether the public status of the Tauri app is second public desktop app (2026-10-24 decision) or internal (AGENTS.md, README.md); the decision says it loads the hosted web app, but the code shows the Vite renderer. Owner question.
- Whether every surface calls effectivePlanTier and the shared entitlement path; only the contract file was read.
- The Free chat daily share per account versus the 2026-10-07 no-cap decision (no record of that decision found).
- Whether surface-by-mode support matrix (item 25) is published anywhere; no default exists.
- The full contents of founder-actions.md (106 KB) and wire-or-cut.md (976 KB) were not read; requirements and decisions inside them may be missing.
- Whether mobile has been submitted to any store; the repository does not settle it.
- Model-improvement switch wording and minimum age wording await legal review.
