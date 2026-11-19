# Leader mobile apps, ecosystem links and valuations

Status: Current research snapshot
Owner: Product research
Verified: 2026-10-25
Coverage: mobile apps of ChatGPT, Claude, Gemini and Perplexity; how each vendor connects its web, desktop, mobile, CLI, IDE and Chrome surfaces and carries a subscription between them; latest valuation and scale data for OpenAI, Anthropic, Perplexity, Anysphere (Cursor), Cognition, xAI, Mistral, Google (Gemini app) and Microsoft/GitHub (Copilot)

This file extends `competitor-surfaces-2026-10-24.md` (sections Mobile, Plans and prices, Continuity),
`cross-surface-continuity-2026-09-21.md` and `chatgpt-claude-ecosystem-delta-2026-09-21.md`. It does not
repeat their per-vendor detail; where a claim is carried forward it says so. Product decisions still follow
`docs/product/competitive-guidance.md`: reopen the cited page before acting on any single claim.

Feature lists name no model versions. Figures in Part C carry the date they describe and a status.

## How to read this

Evidence labels, used on every claim:

- **Documented:** an official vendor, regulator or company page that I opened on 2026-10-25, with its URL. The
  date of the underlying event is given where the page has one.
- **Indirect:** a store listing I could not fully read, a search-returned summary of an official page I could not
  open, press, a republication of a primary source, or a third-party tracker. The outlet is named.
- **Observed:** seen first hand in a running app. None of this file is Observed: no app was run for it.
- **Unknown:** no source found, or the source was silent. Silence is not proof the capability is absent.

Valuation status labels in Part C:

- **Announced:** the company or its filing said it. Where I could not open the company page, the row says which
  republication I read.
- **Filed:** a regulator filing (SEC EDGAR) states it.
- **Reported:** a news outlet or tracker, usually citing unnamed sources, with no company confirmation.

Pages that refused automated reading on 2026-10-25: help.openai.com (403), openai.com (403), chatgpt.com,
cnbc.com (403), bloomberg.com (403), axios.com (403), streetinsider.com (403), Google Play listings (no content).
Claims that depend on them are Indirect.

## A. Mobile apps

### A1. Capability matrix

Each cell is a state plus its evidence label: D Documented, I Indirect, U Unknown. Detail and URLs follow in A2
to A5. "Prior file" means `competitor-surfaces-2026-10-24.md`, read 2026-10-24 and not re-opened for the cell.

| Capability                               | ChatGPT                                                  | Claude                                       | Gemini                                           | Perplexity                                               |
| ---------------------------------------- | -------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| iOS app                                  | Yes (D), iOS 18 or later, iPad, visionOS                 | Yes (D), iOS 18 or later, iPad               | Yes (D), iOS 18.2 or later, iPad                 | Yes (D), iOS 18 or later, iPad                           |
| Android app                              | Yes (I), Play page unreadable                            | Yes (D), Play link in vendor docs            | Yes (D), Android help page                       | Yes (D), Android help articles                           |
| Chat with account sync                   | Yes (D)                                                  | Yes (D)                                      | Yes (I)                                          | Yes (D)                                                  |
| Voice conversation                       | Yes (I), iOS, Android, web                               | Yes (D), beta on all plans                   | Yes (D), Gemini Live                             | Yes (D), iOS and Android assistants                      |
| Interrupting the voice reply             | Yes (I), full duplex                                     | Yes (D), speaking again stops it             | Yes (D), interrupt at any time                   | U                                                        |
| Camera in live voice                     | Older voice mode only (I)                                | U, photo upload only                         | Yes (D)                                          | Android Live View (I)                                    |
| Screen sharing in live voice             | Older voice mode only (I)                                | U                                            | Yes (I)                                          | Android on-screen context (I)                            |
| Image generation                         | Yes (D)                                                  | SVG graphics only (D)                        | Yes (D)                                          | U on mobile (prior file lists asset generation on plans) |
| Video generation                         | U                                                        | U                                            | Yes on paid plans (D)                            | U on mobile (prior file: Max plan, Computer)             |
| Photo and file upload                    | Photos (D); audio on paid plans (prior file)             | Photos, PDFs, screenshots (D)                | Documents, sheets, photos, video (D)             | Files on plans (prior file); mobile listing silent       |
| Projects                                 | Yes (I)                                                  | Yes (D)                                      | Notebooks, Gems, Canvas projects (D, prior file) | Projects with shared files (D, Computer); mobile U       |
| Memory                                   | Yes (D)                                                  | Yes (D)                                      | Yes in Live (D)                                  | Brain memory in Computer (D); mobile U                   |
| Web search with citations                | Yes (D)                                                  | Yes (D)                                      | Yes (D)                                          | Yes (D)                                                  |
| Deep research                            | U on current pages                                       | Research feature; mobile U (D)               | Yes on Free (prior file)                         | Yes (D)                                                  |
| Agent and tasks                          | Work, scheduled tasks, dots (D)                          | Cowork, Duet preview (D)                     | Spark, Daily Brief, Tasks (prior file)           | Computer tasks (D)                                       |
| Connectors                               | Plugins and apps (D)                                     | Gmail, Calendar, Drive, interactive apps (D) | Gmail, Calendar, Photos, YouTube (D)             | App connectors, role access (D)                          |
| Home-screen widget                       | iOS dot widget (D); voice lock-screen widget (I)         | iOS and Android (D)                          | U                                                | U                                                        |
| iOS Shortcuts, Action button, Siri       | Shortcuts and Action button (D); Siri U                  | Controls, Shortcuts, Siri intents (D)        | None listed (D)                                  | Shortcuts, Action button, lock screen (D); Siri U        |
| Android assistant replacement            | Beta seen March 2025 (I); today U                        | Not documented                               | Yes (D)                                          | Yes (D)                                                  |
| Live Activities or ongoing notification  | iOS Live Activity for voice (I)                          | U                                            | Android call-style notice (I, 2025)              | U                                                        |
| Notification when a long task ends       | Dot results and Codex input prompts (D); push settings U | Yes (D)                                      | Antigravity Remote Control (I)                   | U                                                        |
| Offline use or synced drafts             | U                                                        | U                                            | U                                                | U                                                        |
| Continue on desktop or web               | Yes, Work tasks (D)                                      | Yes, sessions and Dispatch (D)               | Partial (D)                                      | Yes, Remote Access (D)                                   |
| Drive desktop or CLI work from the phone | Codex Remote (D)                                         | Remote Control, Dispatch (D)                 | Antigravity Remote Control (I)                   | Remote Access (D)                                        |
| Coding on the phone                      | Codex in the app (D)                                     | Code tab (D)                                 | Via Antigravity Remote Control (I)               | None found (prior file)                                  |
| Browser agent on the phone               | U                                                        | Not on mobile (prior file)                   | Chrome auto browse on Android (I)                | Comet for Android and iOS (prior file, I)                |
| Subscription bought in the app           | Yes (D)                                                  | Yes (D)                                      | Yes (D)                                          | Yes (D)                                                  |

### A2. ChatGPT (OpenAI)

Platforms and billing. iOS 18.0 or later, iPadOS 18.0 or later, visionOS 2.0 or later; App Store 4.8 stars from
about 12M ratings, version 1.2026.286 (Documented, <https://apps.apple.com/us/app/chatgpt/id6448311069>,
2026-10-25). In-app purchases: Go $8.00, Plus $19.99, Pro 100 $100, Pro 200 $200, Pro 500 $500, credit packs
(100 for $4, 500 for $20, 1000 for $40). The listing also shows a second "ChatGPT Plus $200" line that
contradicts the $19.99 line; read as a possible listing error, not resolved. The Android Play listing returned no
content (Indirect).

Voice. The newest voice model began rolling out on 2026-07-08 to iOS, Android and web for consumer plans in
supported regions, excluding Business, Enterprise and Edu at launch; it listens and speaks at once and handles
interruptions. Camera and screen sharing are not in that mode at launch and stay in the older Advanced Voice
Mode for eligible users (Indirect: testingcatalog quoting the OpenAI release note,
<https://www.testingcatalog.com/openai-rolls-out-gpt-live-voice-for-chatgpt-on-web-and-mobile.md>, read
2026-10-25; the OpenAI note itself was unreadable). iOS voice supports Live Activities when "Background
Conversations" is on, and an Action button shortcut starts a voice conversation (Indirect: Thurrott, 2026-07-15,
<https://www.thurrott.com/a-i/338971/chatgpts-voice-mode-now-supports-live-activities-on-ios>). The desktop
voice page says mobile voice for Codex tasks arrives through Codex on iOS after pairing with a desktop host
(Documented, <https://learn.chatgpt.com/docs/features/voice.md>, 2026-10-25).

Widgets, Shortcuts, Action button. "Your dot" Home Screen widget and Shortcuts actions shipped with the iOS app
version 1.2026.279 in the week of 2026-10-12 and need dot access (Documented,
<https://learn.chatgpt.com/docs/whats-new>, 2026-10-25). A lock-screen voice widget is described by Tom's Guide
(Indirect). Siri: Unknown.

Android assistant. A March 2025 beta let ChatGPT be the default digital assistant, opened by the power-button
long press, with no wake word (Indirect: Android Authority via search, 2025). Whether this is in the stable app
today is Unknown.

Agent, tasks, dots. Dots are an always-on cloud agent reachable from the mobile app, desktop, web, calls, Slack
and Teams; a dot "reaches out with results or decisions that need you" and routes updates by channel; Pro 100,
200 and 500 users over 18 outside the EEA, UK and Switzerland, plus Business Premium and Enterprise rollouts
(Documented, <https://learn.chatgpt.com/docs/dots.md>, 2026-10-25). Create a dot, name it, customise it and
connect plugins from the phone (Documented, whats-new, week of 2026-10-05). Scheduled tasks on iOS and Android
and Locked chats on iOS and Android come from the prior file (carried; its source, the OpenAI release notes,
was unreadable today).

Work across devices. With local computer access enabled, eligible Work tasks continue "from desktop, web, or
mobile" (Documented, whats-new, 2026-09-28 week). A task started on desktop and continued on mobile needs sync
enabled in the workspace; if the computer is offline an eligible task continues in a cloud container without
local files (Documented, <https://learn.chatgpt.com/docs/get-started-with-work.md>, 2026-10-25).

Codex on the phone. The Codex tab starts, steers, approves and reviews tasks that run in the cloud or on a
paired Mac or Windows PC, including commands to approve, changed files and diffs (Documented,
<https://learn.chatgpt.com/docs/mobile.md>, 2026-10-25). That page names iOS only; the remote-connections page
says phones can be iOS or Android (Documented, <https://learn.chatgpt.com/docs/remote-connections.md>,
2026-10-25). Plan gating is not named there; the pricing page lists mobile remote control for Plus, Pro,
Business and Enterprise (Documented, <https://learn.chatgpt.com/docs/pricing.md>, 2026-10-25).

Projects, memory, search. Projects are documented for web and desktop; the page does not say whether iOS and
Android show them, though synced local-project tasks continue across "supported desktop, mobile, and web
experiences" (Documented, <https://learn.chatgpt.com/docs/projects.md>, 2026-10-25). Account-level search across
chats, projects, images and documents on web, iOS and Android dates from 2026-07-14 (Documented in the 2026-09-21
delta file, Indirect today). Memories carry context across chats (Documented,
<https://learn.chatgpt.com/docs/customization/memories.md> listed in the docs index, page not opened).

Not found: deep research on current mobile pages, offline use, synced drafts, push-notification settings for
agent tasks, video generation.

### A3. Claude (Anthropic)

Platforms and billing. iOS 18.0 or later, iPadOS 18.0 or later, 249.4 MB, 4.7 stars from about 286K ratings,
ranked 3 in Productivity top free; builds ship almost daily with the same one-line note (Documented,
<https://apps.apple.com/us/app/claude-by-anthropic/id6473753684>, 2026-10-25). In-app purchases: Pro $20.00
monthly, Pro annual $214.99, Max 5x $124.99 monthly, Max 20x $249.99 monthly, usage credits from 20 for $20 to
1000 for $700. Android is confirmed by the Google Play link in the vendor docs (Documented,
<https://code.claude.com/docs/en/mobile>, 2026-10-25); the Play page returned no content.

Voice. Voice mode is a beta on iOS, Android, desktop and web, for every plan. Hands-free mode listens
continuously and answers at natural pauses; "if it does interrupt, you can resume speaking to stop it"; push to
talk is the alternative. Gmail, Calendar, Docs and Slack connectors work in voice; transcripts are saved;
voice counts toward usage limits; it is not available in Cowork or Claude Code, which get dictation only. The
article says nothing on camera or screen sharing, lock screen, widgets or background use (Documented,
<https://support.claude.com/en/articles/11101966-use-voice-mode>, 2026-10-25).

Widgets and system hooks. Android widget (Android 8.0 or later): new chat, camera, dictation; no assistant
replacement, quick settings or lock screen in the article (Documented,
<https://support.claude.com/en/articles/10534883-using-the-claude-widget-on-android>, 2026-10-25). iOS 18 or
later: an "Ask Claude" intent from Spotlight, Siri and the Share menu, chainable in Shortcuts, a widget, and an
"Analyze Photo with Claude" control for Control Center and the Lock Screen (Indirect: search-returned text of
<https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios>). "Open
Claude" controls for the Lock Screen, Control Center and Action button (Documented,
<https://support.claude.com/en/articles/10302511-access-claude-for-ios-on-your-lock-screen-control-center-and-action-button>,
2026-10-25). Claude can draft in Messages and Mail, read and edit Calendar, use location and Maps, manage
Reminders, and read Apple Health in a US-only Pro and Max beta (Documented,
<https://support.claude.com/en/articles/11869619-use-claude-with-ios-apps>, 2026-10-25).

Interactive apps. "The Claude mobile app can now connect to fully interactive apps" on iOS and Android
(Documented, release notes, 2026-03-25, <https://support.claude.com/en/articles/12138966-release-notes>).

Cowork and tasks. Select Cowork in the message box on mobile; a phone notification arrives when Claude finishes
or needs input; sessions and files are saved to the account and resume on desktop, web and mobile; cloud
sessions keep running with the laptop closed; local files, browser use and computer use from mobile need the
Desktop app open and online (Documented, <https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile>,
2026-10-25). Cowork reached every conversation on web, desktop and mobile in a gradual rollout to Pro and Max
starting 2026-09-16 (Documented, release notes).

Claude Duet. A separate iOS and Android app and a claude.ai surface, announced 2026-10-21 as a research preview for
Pro and Max, waitlist, US first. It carries over memory, skills and connected apps, checks accounts every few
hours, uses 6,000 plus connectors and plugins, and asks approval before sending, paying, signing or deleting
(Documented, <https://claude.com/blog/claude-duet>, 2026-10-25).

Code tab. Cloud sessions, Projects, Remote Control and Dispatch live in the Code tab; push notifications when a
long task ends or a decision is needed; no Bypass permissions mode from the app; Dispatch is Pro and Max only
(Documented, <https://code.claude.com/docs/en/mobile>, 2026-10-25). Claude in Chrome is not available on mobile
(prior file).

Memory, search, projects. Chat search and memory work on web, desktop and mobile; each project has its own
memory; memory import and export is experimental (Documented,
<https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context>,
2026-10-25). Conversations, projects, memory and preferences sync when signed in; "share a task from your phone
and Claude can start it in Cowork on desktop" (Documented, <https://claude.com/download>, 2026-10-25).

Not found: raster image or video generation, camera or screen share in voice, assistant replacement on Android,
Live Activities, offline use, whether Research runs on mobile.

### A4. Gemini (Google)

Platforms and billing. iPhone and iPad on iOS or iPadOS 18.2 or later, 4.7 stars from about 2.4M ratings
(Documented, <https://apps.apple.com/us/app/google-gemini/id6477489729>, 2026-10-25). In-app purchases:
Google AI Plus $4.99, Pro $19.99, Ultra $199.99, 100 GB add-on $1.99. The listing states Gemini "does not
currently support iOS device actions like setting alarms or sending SMS". It names no widget, Siri, Shortcuts or
Live Activity feature. Android is documented by the Android help page; the Play listing returned no content.

Gemini Live. Camera sharing, interruption at any time, switching between typing and voice in one thread,
real-time visuals such as maps and weather cards, search of Gmail and Drive, Calendar, Tasks, Keep, Maps,
YouTube, smart home and phone settings, and memory across sessions; Gems, Notebooks and some creative tools
are not available during Live (Documented, <https://gemini.google/overview/gemini-live/>, 2026-10-25). Camera
and screen sharing details: the camera and screen share stop when Live is put on hold or the screen locks and do
not resume; screen share needs Live notifications on and can start from outside the app by saying "Hey Google"
and choosing "Share screen with Live" (Indirect: search-returned text of
<https://support.google.com/gemini/answer/15274899>; heise reports camera and screen sharing reached all users
on Android and iOS without a subscription, <https://heise.de/-10424328>).

Android as assistant. Gemini is a default digital assistant option; the power-button long press and "Hey
Google" open it, and the settings to turn each off are documented; "Gemini on lock screen" lets it answer without unlocking; the microphone
stays open up to 5 minutes; "Ask about screen" shares screen context over other apps (Documented,
<https://support.google.com/gemini/answer/16938321> and <https://support.google.com/gemini/answer/14554984>,
2026-10-25).

Agents and creation. Gemini Spark (24/7 agent), Daily Brief, Tasks, Google Flow credits and Jules limits are
plan-gated, with Spark on Ultra in the US, in English, in beta (Documented in the prior file, plan table). The
iOS listing names image generation and editing, video for paid plans, custom soundtracks, NotebookLM, study
quizzes and prototypes. Study notebooks reached mobile on 2026-08-19 (Documented,
<https://gemini.google/release-notes/>, 2026-10-25). Connected apps and customisation roll out "across web,
mobile, and the Gemini desktop app on Windows and macOS" (release notes, 2026-10-13).

Handoff and remote. The macOS Gemini app can start an Antigravity coding agent (release notes, 2026-10-13).
Antigravity Remote Control was announced 2026-08-21, reachable from a phone or browser on iOS and Android, first
for Ultra subscribers, with notifications when action is needed (Indirect: Gigazine, Product Compass; the
Google post <https://antigravity.google/blog> lists the title only). Gemini in Chrome reached all US Android
users on 2026-08-18, with auto browse for Pro and Ultra (Indirect: Android Authority, Android Central).

Not found: official widget, Live Activity or notification pages, offline use, a dedicated mobile deep research
statement beyond the plan table, Play-store details.

### A5. Perplexity

Platforms and billing. iOS 18 or later and iPadOS 18 or later, 518K ratings at 4.8, version 26.42.0 whose only
note is "Perplexity now supports Duo" (meaning not explained; Unknown). In-app purchases: Pro $20 and $200
(two lines, billing period not stated), Max $200, credit packs 500 for $5, 1,000 for $10, 2,500 for $25, 5,000
for $50 (Documented, <https://apps.apple.com/us/app/perplexity-ask-anything/id1668000334>, 2026-10-25). The
description lists Pro Search and Deep Research, thread follow-ups, an Assistant that drafts email, schedules
and books, Labs, voice answers, Discover and Your Library, and says the app syncs across devices.

iOS voice assistant. Open it from the voice icon; add the "Perplexity Voice Mode" Shortcut to the Home Screen
or the Lock Screen; map the Action Button to Ask Perplexity, Start a new chat, Start voice conversation, Open
Perplexity or Open Perplexity Search; sessions save to history; Siri is not covered (Documented,
<https://www.perplexity.ai/help-center/en/articles/11132456-how-to-use-the-perplexity-voice-assistant-for-ios.md>,
2026-10-25). Supported apps include Email and Messages (write only), Phone, Spotify, YouTube and YouTube Music,
Uber, Clock, a limited Safari and limited Settings; the page does not say which are iOS and which Android
(Documented, <https://www.perplexity.ai/help-center/en/articles/10452641-which-apps-is-the-perplexity-assistant-able-to-use.md>).

Android. Set Perplexity as the default digital assistant (Settings, Apps, Default Apps, Digital assist app);
launch by a corner swipe, power-button hold or home-button hold; Samsung, Xiaomi and Huawei have side-key or
quick-ball remapping (Documented, <https://www.perplexity.ai/help-center/en/articles/11066547-setting-up-the-perplexity-android-assistant.md>
and <https://www.perplexity.ai/help-center/en/articles/10450852-how-to-use-the-perplexity-android-assistant.md>,
2026-10-25). Draw to Search lets you highlight part of the screen to ask about it (Documented,
<https://www.perplexity.ai/help-center/en/articles/11080309-android-app-draw-to-search.md>). On Galaxy S26,
"Hey Perplexity" works with the screen off and the Side button long press can launch it (Documented, Samsung
Lebanon support page last updated 2026-06-16,
<https://www.samsung.com/lb/support/mobile-devices/how-to-use-perplexity-on-the-samsung-galaxy-s26-series>).
Camera queries through "Live View" and on-screen context come from Android Police via a search summary
(Indirect).

Computer and Comet on the phone. A Computer task can be started or directed from an iPhone, including Hybrid
compute tasks on a Mac; Effort Mode is on mobile since the 2026-10-05 changelog (carried from the prior file;
changelog page re-read today lists 2026-10-05 Automations and inline visualizations, 2026-10-19 role-based
connector access, <https://www.perplexity.ai/changelog>). Comet is on Android and iOS (prior file; iOS from
press only).

Not found: official widgets, Live Activities, notification pages, offline use, whether memory (Brain) and
Projects show on mobile.

## B. How the ecosystems connect

### B1. OpenAI (ChatGPT and Codex)

One account across surfaces. The ChatGPT desktop app, web, iOS and Android, the Chrome extension (through the
desktop app), the Codex CLI and the Codex IDE extension all sign in with a ChatGPT account (Documented,
<https://learn.chatgpt.com/docs/auth.md>, 2026-10-25). Sign-in choices for CLI and IDE are ChatGPT account
(subscription access; cloud features) or API key (usage billing; some workspace and cloud features
unavailable). The CLI and IDE extension share one cached login in `~/.codex/auth.json` or the OS credential
store; logging out in one signs the other out.

Subscription carry-over. A subscription follows the account that bought it; if it was bought in the iOS or
Android app, it is managed through Apple or Google (Indirect: search-returned text of
<https://help.openai.com/en/articles/8980438-can-i-access-my-chatgpt-plus-or-pro-subscription-from-another-device>,
page returned 403). OpenAI warns that buying through several channels can duplicate charges (prior file). Plus
covers Codex on web, CLI, IDE extension and iOS; ChatGPT Work and Codex share one plan allowance; local messages
and cloud chats draw from the same allowance; credits extend it; voice in the desktop app draws on the Codex
budget (Documented, <https://learn.chatgpt.com/docs/pricing.md>, 2026-10-25). The pages say nothing about
whether the purchase channel changes what the CLI or IDE receives: Unknown.

How the pieces talk.

- Phone to desktop host: enable "Control this Mac or PC" in the desktop app under Settings, Connections, scan a
  QR code, one pairing per phone and per host; a "secure relay layer" keeps hosts reachable without exposing
  them to the internet; remote access uses SSH to start the remote app server; the host must be awake, online
  and signed in to the same account and workspace; setup must start in the desktop app, not the CLI or IDE
  (Documented, <https://learn.chatgpt.com/docs/remote-connections.md>, 2026-10-25).
- Chrome extension to desktop app: installed from desktop Settings, Computer Use; sign-in is not set up
  separately and the extension works in the browser profile where it is installed; the browser permission prompt
  includes "Communicate with cooperating native applications", but the page does not describe the channel
  (Documented, <https://learn.chatgpt.com/docs/chrome-extension.md>, 2026-10-25).
- CLI, IDE and clients: the app server is "the interface Codex uses to power rich clients", over stdio by
  default, with experimental WebSocket and Unix socket transports; threads persist and can be resumed or
  forked; `codex --remote` connects a CLI to an app server on another machine; the VS Code extension is a named
  client (Documented, <https://learn.chatgpt.com/docs/app-server.md>, 2026-10-25).
- IDE to cloud: the IDE extension can hand a longer task to Codex web and the chat stays for review (Documented,
  <https://learn.chatgpt.com/docs/codex/ide.md>, 2026-10-25). Editors: VS Code, Cursor, Windsurf and Insiders
  use the extension; Xcode and JetBrains have their own integrations.

Conversation and project sync. Chat history syncs across devices (App Store listing). Work tasks started on
desktop continue on web or mobile when sync is on; local work stays on the computer (Documented, whats-new and
get-started-with-work, 2026-10-25). Projects combine chats, files and sources, and a project does not give access
to a folder on the computer; Work history is separate from Codex history (Documented, projects.md, 2026-10-25).

### B2. Anthropic (Claude and Claude Code)

One account across surfaces. One claude.ai account signs in to web, desktop and mobile ("enter the same email
address you use to log in"), and Claude Code accepts the same credentials in the terminal, VS Code, JetBrains
and the desktop app (Documented, <https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account>
and <https://code.claude.com/docs/en/authentication>, 2026-10-25). Other account types for Claude Code are
Console credentials, Bedrock, Vertex, Foundry or a gateway. Cloud sessions and Remote Control need a claude.ai
account and reject API keys and third-party providers. Claude in Chrome needs `/login`; an API key or a
`setup-token` token keeps the integration off.

Subscription carry-over. "A Pro or Max plan includes Claude on the web, desktop, and mobile apps, plus Claude
Code in your terminal" under "one unified subscription"; IDE use counts against the same five-hour and weekly
limits as chat (Documented, <https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan>,
2026-10-25). For subscriptions bought in the iOS or Android app, "your payment is handled by the Apple App
Store or Google Play", and cancelling or managing happens in the store (Documented,
<https://support.claude.com/en/articles/8325618-paid-plan-billing-faqs>, 2026-10-25). The Apple listing prices
Max at $124.99 and $249.99 and annual Pro at $214.99, against $100, $200 and $200 up front on the web (prior
file plan table, 2026-10-24; Documented listing today). Usage credits can be enabled only on the web version for
app-store subscribers (Indirect: search-returned text of the billing support pages). Moving a personal account
into Team or Enterprise: an Apple subscription is not cancelled and must be cancelled in Apple ID settings,
while a Google Play subscription is cancelled with a prorated refund (Documented,
<https://support.claude.com/en/articles/9267400-move-your-personal-claude-account-to-a-team-or-enterprise-organization>,
2026-10-25). The Claude Code pages do not mention subscriptions bought through Apple or Google: whether the
channel limits any surface is Unknown.

How the pieces talk.

- Chrome extension to Claude Code and Desktop: Claude Code installs a native messaging host file
  (`com.anthropic.claude_code_browser_extension.json`) read by Chrome, Edge and other Chromium browsers; the
  extension and Claude Code must be signed in to the same claude.ai account and organization; traffic also uses
  `bridge.claudeusercontent.com`; Windows uses named pipes; the browser tab group is tied to the session
  (Documented, <https://code.claude.com/docs/en/chrome>, 2026-10-25). Desktop prefers Claude in Chrome for
  browser work when it is set up (Documented, <https://code.claude.com/docs/en/desktop>).
- Remote Control: the local session makes outbound HTTPS only, opens no inbound ports, registers with the
  Anthropic API and polls for work; messages route over a streaming connection through the Anthropic API; the
  transcript is stored on Anthropic servers to sync devices; execution stays local; Pro, Max, Team and
  Enterprise; not available with Zero Data Retention or the HIPAA configuration; Trusted Devices is an opt-in
  beta (Documented, <https://code.claude.com/docs/en/remote-control>, 2026-10-25). Started from the CLI
  (`claude remote-control`), VS Code or the desktop app.
- Dispatch: a message from the mobile app becomes a task in the Desktop app, Pro and Max only (Documented,
  <https://code.claude.com/docs/en/mobile>).
- Desktop and CLI: Desktop reads the same settings files as the CLI; `/desktop` moves a CLI session into
  Desktop on macOS and x64 Windows with a subscription login; Desktop does not see sessions started in the CLI
  or VS Code except through cross-session messaging (Documented, <https://code.claude.com/docs/en/desktop>).
- VS Code and CLI: the extension bundles a private CLI, shares conversation history with it (`claude --resume`),
  and a CLI in the integrated terminal connects to the IDE automatically; cloud sessions can be resumed in VS
  Code with a claude.ai login (Documented, <https://code.claude.com/docs/en/vs-code>, 2026-10-25).
- Slack: `@Claude` runs cloud sessions under the user's account (Pro, Max) or as a shared org identity through
  Claude Tag (Team, Enterprise) (Documented, <https://code.claude.com/docs/en/platforms>).

Conversation and project sync. Conversations, projects, memory and preferences sync across web, desktop and
mobile (Documented, <https://claude.com/download>); memory is shared with Cowork only when Cowork runs in the
cloud, and each project has its own memory (Documented, chat-search-and-memory article). Code sessions persist
across devices: a task started on a laptop is reviewable from the phone (Documented,
<https://code.claude.com/docs/en/mobile>).

### B3. Google (Gemini, Antigravity, Chrome)

One account across surfaces. A personal Google account that the user manages signs in to the Gemini app, Chrome,
Antigravity, Jules and Workspace; plans are for ages 18 and over (Documented,
<https://gemini.google/subscriptions/>, 2026-10-25). The Antigravity extensions sign individuals in with a
Google account and enterprises with Gemini Enterprise or Google Cloud credentials (Documented,
<https://antigravity.google/blog/antigravity-ide-extensions>, 2026-10-25).

Subscription carry-over. One Google AI plan spans the Gemini app, Google Flow credits, Gemini in Chrome auto
browse (Pro and Ultra), Antigravity rate limits, Jules limits, Gemini in Workspace apps and storage; the Gemini
CLI is not listed on that page (Documented, gemini.google/subscriptions). On a phone, "manage your Google AI
subscription in the mobile app" through the profile picture and Settings. On iPhone the purchase is Apple's
billing; an upgrade opens the app the user first subscribed through, changing a plan opens Apple subscriptions,
and a plan bought on the web or Android may not be upgradable from iPhone (Documented,
<https://support.google.com/gemini/answer/14517446>, 2026-10-25). Antigravity limits differ "based on your
Google AI plan"; Pro and Ultra can add purchased credits; whether the Antigravity app, CLI and extensions share
one quota is not stated (Documented, <https://antigravity.google/docs/plans>, 2026-10-25). Consumer plans stopped
being served by the Gemini CLI and Code Assist extensions on 2026-06-18; enterprise licences are unaffected
(Documented, <https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/>,
2026-10-25).

How the pieces talk.

- Antigravity extensions (VS Code, Visual Studio, Zed, JetBrains from 2026.2.1, Xcode via its Intelligence
  panel) give access to conversations and multi-agent orchestration that "shares context with the rest of the
  Antigravity ecosystem", with the desktop app and CLI as the agent-first surfaces (Documented, ide-extensions
  post, 2026-10-25). The CLI's settings and permissions sync with the desktop app and sessions can be exported
  to it (carried from the prior file).
- The macOS Gemini app can start an Antigravity agent (release notes, 2026-10-13). Mobile and browser access to
  a running Antigravity session is Remote Control (Indirect, above).
- Gemini in Chrome is built into Chrome with no separate extension (prior file); Chrome on Android carries it.

Conversation and project sync. Not stated on any page read for Gemini chats; Canvas projects are viewable on
mobile with text editing desktop only (prior file). Cross-surface chat history and project sync: Unknown.

### B4. Perplexity

One account across surfaces. Web, the desktop apps (macOS 15 or later; Windows 10 1809 or later), iOS, Android
and Comet are Perplexity products; the pages read do not state that one subscription covers all of them
(Documented as silent, <https://www.perplexity.ai/help-center/en/articles/11187416-which-perplexity-subscription-plan-is-right-for-you>,
2026-10-25).

Subscription carry-over. The plan page warns: do not update payment details through the App Store or Google Play,
because that "creates a separate subscription"; update the payment method on the website only. The API is a
separate pay-as-you-go product, and Enterprise Max model access "does not apply to programmatic access via API"
(same page). In-app prices differ from the web: $20 and $200 in the App Store against $17 and $167 per month
billed annually on the pricing page (prior file; App Store lines re-read today). Computer credit packs are sold
in the iOS app. Whether Comet and Computer entitlements follow a store-bought plan: Unknown.

How the pieces talk.

- Remote Access: a request from any supported surface that needs a desktop device runs on a chosen signed-in
  desktop listed under Settings, Devices; the folders, browser and apps stay on that machine and its permissions
  apply; the page does not describe the connection mechanism, requirements or plan gating (Documented,
  <https://www.perplexity.ai/help-center/en/articles/19800009-use-remote-access.md>, 2026-10-25).
- Browser extension for Computer: Chrome, Edge and Brave; needs Perplexity for Mac 26.38.0 or later; Comet is
  the default browser when installed (prior file, from the changelog).
- CLI and IDE: no official Perplexity terminal agent or VS Code extension found; the API MCP server and Agent
  Plugin exist (prior file).

Conversation and project sync. The App Store says the app syncs across devices; Projects with shared files and
Brain memory shipped in Computer on 2026-08-04 and 2026-07-13; Ask threads and Computer tasks share a desktop
sidebar (prior file, carried). Comet browsing data syncs across Comet browsers.

### B5. What the four have in common and where they differ

- All four sell the paid plan inside the iOS app and tell users to manage a store-bought plan in the store.
- OpenAI, Anthropic and Google each have a terminal agent and IDE extensions that sign in with the same personal
  account as the phone app (Google through the Antigravity CLI and extensions, after the Gemini CLI stopped
  serving consumer plans on 2026-06-18). Perplexity has no official CLI or IDE client.
- Phone-to-computer control is documented for OpenAI (QR pairing and relay), Anthropic (outbound polling
  through the Anthropic API, Dispatch) and Perplexity (Remote Access by device name); for Google it rests on press.
- Of the pages read, only Anthropic's states that a Remote Control session transcript is stored on vendor servers.

## C. Valuations and scale

All figures are in the currency and unit the source uses. "Date" is the date of the event or statement, not the
read date. Rows with two statuses list the strongest first.

| Company                     | Figure                                                                                                                                                               | Date                                          | Status                                       | Lead investors and notes                                                                                                                                                    | Evidence and source                                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI                      | $122B committed at $852B post-money                                                                                                                                  | closed 2026-03-31                             | Announced                                    | Co-led by SoftBank; Amazon commitment $50B, Nvidia $30B, SoftBank $30B; also Microsoft, a16z, D. E. Shaw, MGX, TPG, T. Rowe Price; about $3B from individuals through banks | Indirect: Verdict, republished on Yahoo Finance <https://finance.yahoo.com/markets/stocks/articles/openai-closes-122bn-funding-round-093126735.html>; openai.com unreadable                        |
| OpenAI                      | Up to $30B at $1.25T (cut from $1.4T pitched)                                                                                                                        | 2026-10-22                                    | Reported, not signed                         | Led by UAE investors and Coatue; framed as a bridge before an IPO; OpenAI told investors it wants signatures by the end of the following week                               | Indirect: CNBC and FT via The Decoder <https://the-decoder.com/openai-lowers-valuation-target-raises-up-to-30-billion/>; CNBC and Bloomberg pages unreadable                                       |
| OpenAI                      | About $2B revenue per month; 2025 revenue $13.1B; over 900M weekly users; over 50M subscribers                                                                       | stated 2026-03                                | Announced                                    | From the same financing announcement                                                                                                                                        | Indirect: Verdict, as above                                                                                                                                                                        |
| OpenAI                      | 1.2B weekly ChatGPT users                                                                                                                                            | 2026-09-29                                    | Announced on stage                           | Shown on a slide and repeated by the CEO at DevDay                                                                                                                          | Indirect: Engadget live blog <https://www.engadget.com/2271985/openai-dev-day-live-blog-chatgpt-news/>                                                                                             |
| Anthropic                   | $65B Series H at $965B post-money                                                                                                                                    | 2026-05-28                                    | Announced                                    | Led by Altimeter, Dragoneer, Greenoaks, Sequoia; co-led by Capital Group, Coatue, D1, GIC, ICONIQ, XN; includes $15B of earlier hyperscaler commitments, $5B from Amazon    | Documented: <https://www.anthropic.com/news/series-h>                                                                                                                                              |
| Anthropic                   | Run-rate revenue above $47B                                                                                                                                          | "earlier this month", 2026-05                 | Announced                                    | Company sentence in the Series H post                                                                                                                                       | Documented: same page                                                                                                                                                                              |
| Anthropic                   | Run-rate revenue above $65B                                                                                                                                          | end of 2026-07                                | Reported                                     | Bloomberg, with Axios and others corroborating on 2026-08-17; Anthropic did not comment                                                                                     | Indirect: search summaries; Axios page unreadable                                                                                                                                                  |
| Anthropic                   | Confidential draft S-1 submitted; public listing timing and valuation not announced                                                                                  | 2026-06-01                                    | Announced (filing); targets Reported         | Reported targets of $1.5T to $2T and a trading date near 2026-11-26 are unconfirmed                                                                                         | Indirect: NPR <https://www.npr.org/2026/06/01/nx-s1-5843199/anthropic-ipo-filing-ai-large> (page timed out), Yahoo Finance, secondary trackers                                                     |
| Perplexity                  | Above $30B, round amount not disclosed                                                                                                                               | 2026-08-23                                    | Reported, talks                              | Nvidia in talks; The Information first, Reuters republished; Perplexity declined to comment                                                                                 | Indirect: Yahoo Finance copy of Reuters <https://finance.yahoo.com/technology/ai/articles/nvidia-discusses-perplexity-investment-30-031804276.html>                                                |
| Perplexity                  | $20B valuation after a $200M round                                                                                                                                   | 2025-09                                       | Reported                                     | Reuters citing The Information; no closed 2026 round found                                                                                                                  | Indirect: same article                                                                                                                                                                             |
| Perplexity                  | Annualized revenue over $750M, from under $250M at the start of 2026                                                                                                 | 2026-08                                       | Reported                                     | The Information via Reuters; driven by Computer                                                                                                                             | Indirect: same article                                                                                                                                                                             |
| Anysphere (Cursor)          | Acquired by SpaceX at an implied $60.0B equity value; about 389.3M SpaceX Class A shares plus RSU and option conversions                                             | agreed 2026-06-16, closed 2026-08-14          | Filed                                        | Cursor survives as a wholly owned subsidiary; all-stock                                                                                                                     | Documented: SEC 8-K <https://www.sec.gov/Archives/edgar/data/1181412/000162828026056945/spcx-20260814.htm>                                                                                         |
| Anysphere (Cursor)          | Cursor contributed $608M of SpaceX revenue from 2026-08-14 to 2026-09-30                                                                                             | 2026-10-20                                    | Filed                                        | Cursor ARR is not disclosed                                                                                                                                                 | Documented: SpaceX earnings release, Exhibit 99.1 <https://www.sec.gov/Archives/edgar/data/1181412/000162828026066482/spaceexplorationtechnologi.htm>                                              |
| Anysphere (Cursor)          | Last independent round: $2.3B Series D at $29.3B post-money                                                                                                          | 2025-11-13                                    | Announced                                    | Co-led by Accel and Coatue; Google and Nvidia participated                                                                                                                  | Indirect: Wikipedia, CNBC headline <https://www.cnbc.com/2025/11/13/cursor-ai-startup-funding-round-valuation.html> (not opened)                                                                   |
| Anysphere (Cursor)          | Run-rate above $4B                                                                                                                                                   | early 2026-06                                 | Reported                                     | A person familiar, via Dealroom; about 75 percent enterprise                                                                                                                | Indirect: <https://dealroom.co/news/134107-cursor-tops-4b-annualized-revenue/> (from search summary)                                                                                               |
| Cognition (Devin, Windsurf) | $2B at $48B (pre or post not stated)                                                                                                                                 | 2026-09-08                                    | Announced                                    | a16z, Accel, Founders Fund, General Catalyst, Avenir; four months after a $26B round                                                                                        | Indirect: TechCrunch quoting the company blog <https://techcrunch.com/2026/09/08/cognition-hits-48b-valuation-signaling-investors-believe-ai-coding-is-far-from-a-winner-take-all-market/>         |
| Cognition                   | Annualized run-rate revenue $900M, up from $492M in May                                                                                                              | 2026-09-08                                    | Announced                                    | Company's own metric, calculation not explained                                                                                                                             | Indirect: same article                                                                                                                                                                             |
| Cognition                   | $4B to $5B run-rate by end of 2026                                                                                                                                   | 2026-09                                       | Reported                                     | The Information; not company-confirmed                                                                                                                                      | Indirect: same article                                                                                                                                                                             |
| xAI (now inside SpaceX)     | Acquired by SpaceX in an all-stock deal valuing xAI at $250B and SpaceX at $1T, $1.25T combined                                                                      | 2026-02-02                                    | Reported by Reuters and CNBC, deal completed | xAI is a subsidiary; SpaceX Class A trades on Nasdaq as SPCX                                                                                                                | Indirect: Wikipedia citing Reuters <https://en.wikipedia.org/wiki/SpaceXAI>; ticker Documented in the 8-K above                                                                                    |
| xAI (SpaceX)                | SpaceX IPO prospectus (424B4) filed                                                                                                                                  | 2026-06-12                                    | Filed                                        | IPO price and size not read                                                                                                                                                 | Documented: EDGAR filing list <https://data.sec.gov/submissions/CIK0001181412.json>                                                                                                                |
| xAI (SpaceX)                | Super Intelligence segment revenue $7.56B vs $813M a year earlier; operating income $431M; capex $16.4B; "increased Grok adoption"; no Grok user or subscriber count | quarter ended 2026-09-30, reported 2026-10-20 | Filed                                        | The segment includes Cursor from 2026-08-14                                                                                                                                 | Documented: SpaceX earnings release (URL above)                                                                                                                                                    |
| Mistral                     | EUR 3B Series D at more than EUR 21B post-money (about $24.39B per TechCrunch)                                                                                       | 2026-09-08                                    | Announced                                    | Led by Samsung Electronics; co-led by EQT Scaleup Europe Fund and PSG Equity; new investors Advent, BlackRock-managed funds, Luxembourg; revenue not disclosed              | Documented: <https://mistral.ai/news/mistral-makes-sovereign-open-weight-ai-to-frontier/>; TechCrunch <https://techcrunch.com/2026/09/08/mistral-raises-e3b-as-sovereign-ai-becomes-big-business/> |
| Google (Gemini app)         | 950M monthly active users                                                                                                                                            | Q2 2026, reported 2026-07-22                  | Announced                                    | Alphabet 8-K, CEO statement                                                                                                                                                 | Documented: <https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000066/googexhibit991q22026.htm>                                                                                       |
| Google (Gemini app)         | Surpassed 1B monthly active users                                                                                                                                    | 2026-08-11                                    | Announced                                    | CEO post on X; standalone app only, AI Mode counted separately                                                                                                              | Indirect: TechCrunch <https://techcrunch.com/2026/08/11/googles-gemini-app-surges-to-one-billion-users/>                                                                                           |
| Microsoft / GitHub          | GitHub Copilot 50M users; GitHub 225M users; over 30M paid Microsoft 365 Copilot seats                                                                               | FY26 Q4 call, 2026-07-29                      | Announced                                    | CEO and CFO statements; "users" is not defined in the passage read; Copilot revenue up over 60 percent quarter on quarter                                                   | Documented: <https://www.microsoft.com/en-us/investor/events/fy-2026/earnings-fy-2026-q4>                                                                                                          |

Notes on the table.

- The brief lists Cursor and xAI as standalone companies. Both are now inside SpaceX (Cursor closed 2026-08-14;
  xAI merged 2026-02-02), so neither has a current standalone valuation; the SEC filings above are the primary
  record.
- The CNBC, Bloomberg and Axios pages named in the Reported rows could not be opened. Their figures reached this
  file through The Decoder, Yahoo Finance copies and search-returned summaries, so each is Indirect.
- Alphabet's Q3 2026 results and Microsoft's FY27 Q1 results were not found on 2026-10-25; a search summary lists
  Microsoft's next call as 2026-10-28 (Indirect). Figures above are the latest primary ones found.

## D. Unverified

Access limits.

- help.openai.com, openai.com, chatgpt.com, cnbc.com, bloomberg.com, axios.com and Google Play listings could not
  be read. Every ChatGPT release-note claim is therefore carried from the prior file, from learn.chatgpt.com
  docs that did open, or from named press.
- No app was run. Nothing is Observed.

Part A.

- ChatGPT on Android: no readable listing; default-assistant status in the stable app is Unknown (last seen in a
  2025 beta). Whether Projects and deep research appear in the mobile apps is Unknown. Push notification
  behavior for agent tasks is Unknown.
- The iOS ChatGPT listing's second "Plus $200" line is unexplained.
- Claude: camera or screen share in voice, Android assistant replacement, Live Activities, Research on mobile
  are Unknown. The iOS widget and intents article is Indirect (search text only).
- Gemini: official pages for widgets, Live Activities, lock screen on iOS and notifications were not found.
  The Live help article and the Chrome-on-Android details are Indirect. The Gemini Android Play listing was unreadable.
- Perplexity: Android camera, widgets, notifications and memory on mobile are Unknown; the App Store note
  "supports Duo" is unexplained; which supported apps apply to iOS versus Android is not stated.
- Offline use and synced drafts are Unknown for all four vendors.
- Date conflict: Engadget dates OpenAI's developer event 2026-09-29, while learn.chatgpt.com groups its DevDay
  items in the week of 2026-10-05 and the prior file says 2026-10-05. The 1.2B user statement is dated to the
  Engadget date.

Part B.

- Whether the store-versus-web purchase channel changes access on the CLI, IDE extension or Chrome extension is
  not stated by OpenAI, Anthropic, Google or Perplexity pages read: Unknown for all four.
- OpenAI: the channel between the Chrome extension and the desktop app is not described beyond the native
  application permission prompt.
- Google: Antigravity Remote Control and the IDE extensions' official posts could not be opened by URL;
  details are from press. Chat and project sync for Gemini: Unknown.
- Perplexity: how Remote Access connects a phone to a desktop, its requirements and plan gating are not stated.
- Older material re-verified today: Claude sync across web, desktop and mobile; Perplexity's warning about
  store payment changes; ChatGPT account-follows-subscription (Indirect only). Not re-verified from the
  2026-09-21 files: Claude's remote versus desktop connector split, ChatGPT connected-app scoping, ChatGPT
  Library and search details.

Part C.

- OpenAI: the March announcement was read through a Verdict republication, not openai.com. The $1.25T figure is
  described as pre-money by one search summary only; CNBC and The Decoder say "valuation". One summary mentions
  roughly $50B net versus $68B gross revenue with no named outlet; it is not used.
- Anthropic: the $65B run-rate, a Q3 2026 revenue of $16.8B attributed to the Financial Times, a 46 percent
  quarterly growth figure and a mid-November listing date all come from secondary pages and are not used as
  facts. Whether a public S-1 has been filed was not found.
- Perplexity: a January 2026 round near $22.6B to $23B appears only on trackers; the March 2026 ARR above $450M
  (attributed to the Financial Times) and the April $500M revenue post come from secondary pages. Perplexity user
  and query counts are unverified.
- Cursor: the funding table on its Wikipedia page carries a notice of possible machine-written text; only the
  SEC filings and the SpaceX release are treated as firm.
- xAI: the merger valuation rests on Wikipedia citing Reuters; a Series E of $20B at $230B in January 2026 is
  from a tracker only. The SpaceX IPO size and any valuation at pricing (a Wikipedia line says US$1.77 trillion
  without saying what it measures) were not read from the prospectus, which exceeded the fetch size limit.
  Branding changed from xAI to SpaceXAI in July 2026 and to SpaceX Super Intelligence in October 2026 per
  Wikipedia.
- Cognition: pre or post-money is not stated; the May round at $26B and the Windsurf acquisition are from
  secondary pages.
- Mistral: the dollar conversion is TechCrunch's; the prior EUR 11.7B Series C led by ASML is from a search summary.
- Google: Pichai's 1B post was not opened on X; TechCrunch reports it. TechCrunch also says ChatGPT reached 1B
  monthly users in June 2026; no OpenAI source was found, so it is not used.
- Microsoft: the definition of "users" (free, student, paid) is not in the passage read.
