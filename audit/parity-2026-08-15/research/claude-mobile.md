# Claude iOS and Android — Production State Research

Research date: **2026-08-15**. All claims below are sourced; where a source is a third-party blog/aggregator rather than an official Anthropic page, that is flagged. Anything I could not confirm is marked **UNVERIFIED**.

---

## 1. App identity, store listings, versions

|                                 | iOS                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Android                                                                                                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Store listing                   | App Store — "Claude by Anthropic," id6473753684 ([apple.com](https://apps.apple.com/us/app/claude-by-anthropic/id6473753684))                                                                                                                                                                                                                                                                                                                         | Play Store — `com.anthropic.claude` ([play.google.com](https://play.google.com/store/apps/details?id=com.anthropic.claude))                                                                                                             |
| Current version (research date) | **1.260813.0**, "Last Updated: 2 days ago" per App Store fetch on 2026-08-15                                                                                                                                                                                                                                                                                                                                                                          | **1.260813.10**, listed update date **2026-08-15** per Uptodown mirror ([uptodown](https://claude.en.uptodown.com/android))                                                                                                             |
| Version-string pattern          | Both use a `1.YYMMDD.N` scheme, implying near-daily/continuous release cadence                                                                                                                                                                                                                                                                                                                                                                        | same                                                                                                                                                                                                                                    |
| Min OS                          | iOS 18.0 / iPadOS 18.0 (App Store listing fetch); a separate Help Center install article states **iOS 17.0 and above** ([support.claude.com](https://support.claude.com/en/articles/9266462-install-claude-for-ios)) — these two figures disagree, likely because the store page reflects the newest build's floor while the help article is stale. Treat "iOS 18+" as the current effective floor and the 17.0 claim as **possibly outdated**.       | Android 8.0 Oreo+ per Help Center ([support.claude.com](https://support.claude.com/en/articles/9612887-install-claude-for-android)); Uptodown lists **Android 10+** for the current build — same kind of stale-vs-current disagreement. |
| Size                            | 208.5 MB (App Store)                                                                                                                                                                                                                                                                                                                                                                                                                                  | 21.73 MB per Uptodown (likely a stripped/base APK, not the full install; Play Store's dynamically-delivered bundle is almost certainly larger — **UNVERIFIED** exact installed size)                                                    |
| Rating                          | **4.7 / 5 (≈230K ratings)** on App Store                                                                                                                                                                                                                                                                                                                                                                                                              | **≈4.5 / 5 (≈625K ratings)** per aggregated secondary source — **UNVERIFIED** directly against Play Store's own page, which returned only a JS shell to WebFetch both times it was tried                                                |
| Age rating                      | **18+** on both stores. This is enforced in-product too: Anthropic requires all account holders to be 18+, using app-store-supplied age signals (from state child-safety laws) to gate access, including cases where the flag comes from a Family Sharing/Family Link setup a parent configured ([support.claude.com](https://support.claude.com/en/articles/13117299-minimum-age-requirement-access-restriction))                                    | same policy, same mechanism                                                                                                                                                                                                             |
| Recent "What's New" text        | Generic and unhelpful for several versions running: **"Squashed some bugs and improved the overall experience. Yours, Claude"** — this exact string has shipped on multiple consecutive releases (App Store listing fetch, 2026-08-15)                                                                                                                                                                                                                | Changelog not surfaced by the Uptodown mirror; official release notes are consolidated on the Help Center rather than in-store copy                                                                                                     |
| Category rank                   | #3 Productivity (App Store, at fetch time)                                                                                                                                                                                                                                                                                                                                                                                                            | UNVERIFIED                                                                                                                                                                                                                              |
| Notable spike                   | Claude briefly hit **#1 on Apple's US free chart**, passing ChatGPT, after a late-Feb/early-Mar 2026 dispute over a blocked Pentagon deal — Anthropic said free-user signups tripled and paid subs grew >60% since January in the aftermath ([CNBC](https://www.cnbc.com/2026/02/28/anthropics-claude-apple-apps.html), [TechCrunch](https://techcrunch.com/2026/03/01/anthropics-claude-rises-to-no-2-in-the-app-store-following-pentagon-dispute/)) | same underlying spike drove Android installs                                                                                                                                                                                            |

---

## 2. Navigation architecture / differences vs. web

- Both apps use a **hamburger-menu-driven sidebar** (three-line icon, top-left) for Settings, chat history, Projects, and (new) Cowork — mirrors web's left rail rather than a bottom tab bar, based on Help Center screenshots-described flows for Settings→Memory navigation.
- A dedicated **"Code" section** in the nav reaches Claude Code Remote Control sessions from the phone: "In the Claude mobile app, tap **Code** in the navigation to reach the session list" ([code.claude.com/docs/remote-control](https://code.claude.com/docs/en/remote-control)).
- A dedicated **Cowork tab/entry point** was added to the sidebar starting **July 7, 2026**; it is not a separate app ([Engadget](https://www.engadget.com/2209495/now-you-can-direct-anthropics-claude-cowork-ai-from-your-phone/), [MacRumors](https://www.macrumors.com/2026/07/07/claude-cowork-mobile-web/)). Anthropic's stated direction is to eventually **merge Chat and Cowork into one unified surface** (already done on web/desktop per the July 7 announcement) and eventually fold Projects/Artifacts in too — mobile had not received that merge as of the July 7 rollout, per a third-party analysis piece.
- **Known gap:** the **iPad app has no "Claude Code" section at all** — only iPhone shows it — so an iPad cannot be linked to a Claude Code Remote Control session (raised in a closed-as-stale GitHub issue: [anthropics/claude-code#60208](https://github.com/anthropics/claude-code/issues/60208)).

---

## 3. Composer on mobile

- Standard chat input field with a **"+" attachment button** (files/photos/camera), a **microphone icon** for dictation, and a **voice-mode sound-wave icon** next to it.
- Model/effort picker is reachable by tapping the model name near the send button — the Help Center's "change model, effort, thinking" article gives no mobile-specific instructions or caveats, i.e. it documents the flow as platform-agnostic ([support.claude.com](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings)).
- Multi-file attach: up to **20 files per conversation**, **30 MB per file**, wide format support (PDF, DOCX, CSV, images, etc.) — reported consistently across secondary how-to guides; treat exact numeric caps as **directionally correct, not verified against a single canonical source**.
- **Complaint (App Store review, "Landscape mode needs work," Jul 30 2026, reviewer NCJohn):** in portrait, tables get cut off; rotating to landscape doesn't help much because "the overall viewport seems to be ~half of what it could be" due to padding, the text-entry box, and other chrome eating screen space. This same complaint recurs in the iPad review set.

---

## 4. Camera & photo upload

- Three entry points: **live camera capture** in-conversation, **photo-library picker**, and dedicated **document/receipt/whiteboard scanning** flows (multiple secondary guides converge on this; no single canonical Help Center page enumerates all three, so treat as **well-corroborated but not primary-sourced**).
- iOS-specific fast paths:
  - **Home Screen/Today View widget** camera button — "take a photo and share it with Claude for analysis" ([support.claude.com — App Intents/Shortcuts/Widgets](https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios)).
  - **"Analyze Photo with Claude" Control Center / Lock Screen control**, addable via iOS 18's Controls gallery — one-tap camera-to-Claude from the lock screen ([same source]).
- Android-specific fast paths: home-screen widget with a dedicated **camera/photo-analysis button**, functionally parallel to iOS ([support.claude.com — Android widget](https://support.claude.com/en/articles/10534883-use-the-claude-widget-on-android)).
- All widget- and control-initiated interactions **count against normal usage limits** — explicitly called out in both the iOS and Android widget docs.

---

## 5. Voice mode

**Platforms:** iOS and Android (and desktop/web); the Help Center explicitly says it's "built to work best from your phone" ([support.claude.com](https://support.claude.com/en/articles/11101966-using-voice-mode-on-claude-mobile-apps)).

**Activation:** tap the sound-wave icon next to the mic icon in the composer.

**Modes:**

- **Hands-free** — listens continuously, responds to natural pauses.
- **Push-to-talk** — hold a button to speak.

**Interruption / barge-in:** official Help Center language is that if Claude starts talking over you, "simply start speaking again — Claude will stop and listen," and you can also tap a stop button. The troubleshooting section separately addresses false-positive interruptions from background noise, recommending push-to-talk or a quieter room. **The word "full-duplex" appears in third-party coverage** (e.g., [datastudios.org](https://www.datastudios.org/post/claude-voice-mode-from-tap-to-talk-to-fully-duplex-ai-conversations)) describing Claude as able to "start composing and speaking a response before you've even finished talking," but another secondary source explicitly frames Claude's architecture as **turn-based**, contrasting it with what it calls ChatGPT's duplex architecture ([Tom's Guide-style coverage synthesized in search]). **This is a genuine discrepancy in public description; Anthropic's own Help Center article does not use the term "full-duplex" and does not resolve it either way.** Treat "full duplex" as marketing-adjacent framing, not a confirmed architectural claim.

**Major update — July 23, 2026** (per [voiceos.com](https://www.voiceos.com/blog/claude-voice-mode), a third-party but reasonably detailed source):

- Voice mode previously ran **exclusively on Haiku**; the update added **Opus, Sonnet, and Haiku** with mid-conversation model switching via the model selector. **Claude Fable (the Mythos-class model) remains unavailable in voice mode**, confirmed independently by the official Help Center ("Claude Fable remains unavailable for voice conversations").
- Added **connected-tools reach mid-conversation** — voice mode can check calendar/email and take actions (e.g., reschedule) without dropping to text.
- **Languages: 11 total** — English, French, German, Hindi, Indonesian, Italian, Japanese, Korean, Brazilian Portuguese, Spanish (LatAm and Spain) — with in-conversation language switching. (Note: an older/less-current secondary source claims dictation, not voice mode, supports a _different_ 11-language list including Russian, Turkish, Ukrainian — see Dictation section below; **voice mode's language list and dictation's language list are not the same set** across sources, which may reflect real product divergence or simply drift between differently-dated secondary articles.)

**Model behavior:** voice mode uses "the same Claude models you use in text chat," auto-upgrading to the latest generation of whichever model you'd been using in text.

**Not compatible with:** Claude Cowork or Claude Code (explicit Help Center statement).

**Enterprise:** admins can disable voice mode org-wide on request.

**Background mode:** **UNVERIFIED** — the official Help Center article does not state whether voice mode continues with the screen locked or app backgrounded; it only warns that voice processing drains battery faster than text and that Claude "silences output if your device enters low power mode" (per a third-party summary of the same page). No source confirms true background/lock-screen audio continuation; treat as **likely foreground-only** pending direct confirmation.

**Free vs. paid:** Voice mode is available to **every user, free or paid** — repeated across multiple sources including a dedicated Tom's Guide-style "voice mode is now free for everyone" piece.

---

## 6. Dictation

Distinct from voice mode: **"Dictation turns your speech into text so you can send a written prompt, and Claude replies in text. Voice mode is a full spoken conversation."** ([support.claude.com](https://support.claude.com/en/articles/10065434-use-dictation-on-claude-mobile))

- iOS and Android only.
- Non-English support is **in beta**; a language must be chosen up front (changeable later in Settings).
- **Privacy:** audio is deleted after transcription; not retained or used for model training, per the Help Center article.
- Available on **all plans**, including Free.
- Widget mic button and Control-Center/Lock-Screen shortcuts open the app directly into dictation mode (see §8).

---

## 7. OS integrations — iOS (App Intents, Shortcuts, Siri, Widgets, Lock Screen/Control Center/Action Button)

Source: [support.claude.com — App Intents, Shortcuts, Widgets on iOS](https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios) and [support.claude.com — Lock Screen/Control Center/Action Button](https://support.claude.com/en/articles/10302511-access-claude-for-ios-on-your-lock-screen-control-center-and-action-button). Both require **iOS 18+**.

- **"Ask Claude" App Intent** — invocable from Spotlight, Siri, the Share menu (select text anywhere → Share → Claude), and any app that supports iOS intents.
- **Shortcuts app integration** — "Ask Claude" can be chained with other Shortcuts actions (worked example: a "Summarize with Claude" shortcut built from a Share action + "Ask Claude" action with a fixed prompt template). The **model used is whatever is currently selected as default in the app** — the Shortcuts action itself has no separate model picker.
- **Home Screen / Today View widget** — three buttons: new chat, dictation-mode mic, camera capture.
- **"Analyze Photo with Claude" Control** — addable to Control Center and to the Lock Screen's customizable control slots.
- **Action Button** (iPhone 15 Pro+) — can be mapped to "Open Claude" via Settings → Action Button → Controls.
- **Usage counts:** every intent/widget/Shortcuts interaction counts toward normal usage limits — no free-tier bypass.
- **Emerging, not yet fully shipped:** Apple's **iOS 27 "Extensions"** framework (announced WWDC, June 8 2026) will let users set Claude as the AI provider behind system Siri, Writing Tools, and Image Playground, with Anthropic named as a confirmed launch partner alongside OpenAI and Google. Timeline per third-party coverage: **developer beta June 8 2026 → public beta ~July 2026 → GA September 2026 with new iPhones** ([modemguides.com](https://www.modemguides.com/blogs/modemguides-blog/apple-adds-claude-as-an-iphone-ai-option-what-ios-27-extensions-mean-for-you)). A separate search hit independently corroborates the underlying mechanism: Anthropic has "released a Swift package in beta that adds Claude as a server-side LanguageModel in Apple's Foundation Models framework," callable through the same `LanguageModelSession` API as Apple's on-device model on iOS 27. **As of the research date (2026-08-15), this sits in the public-beta window and is NOT yet a GA, mainstream-user feature** — flag it as "coming," not "shipped," in any parity comparison. Source quality here is secondary/blog-tier, not Apple's own developer docs directly fetched — treat the exact dates as **best-available, not primary-confirmed**.

---

## 8. OS integrations — Android

Source: [support.claude.com — Use Claude with Android apps](https://support.claude.com/en/articles/11869629-use-claude-with-android-apps) and [support.claude.com — Android widget](https://support.claude.com/en/articles/10534883-use-the-claude-widget-on-android).

- **Home-screen widget**, Android 8.0+: chat button, camera button, mic/voice-dictation button — same three-affordance pattern as iOS.
- **Native share-sheet integration** — Claude appears as a share target from essentially any app (text, images, links).
- **Text-selection context menu** — "Ask Claude" appears when selecting text system-wide (per secondary source [claudelog.com], not independently confirmed against a primary Anthropic page — treat as **plausible, secondary-sourced**).
- **App-to-app actions**, available on **all Claude plans** (no Pro/Max gate, unlike iOS's Health feature):
  - Messaging: draft/send via default SMS or third-party apps (WhatsApp, Slack, Messenger).
  - Email: composes pre-filled drafts that open in the user's mail app.
  - Calendar: read schedule, create events (editing existing events depends on ownership).
  - Location/Maps: contextual suggestions and destination display.
  - **Alarms & Timers** via the Clock app — this is an **Android-only** affordance; the iOS equivalent list has Reminders instead of Alarms/Timers, and iOS has no Reminders/alarm parity noted on Android ("No contact access or reminders support" on Android per the same article).
  - Health data via **Health Connect**, read-only, **Pro/Max only, US users only, Android 14+ required**.
- **Limitations explicit in the doc:** Team/Enterprise members can't use the location tool; Claude can read but never write/modify Health Connect entries; no contacts access; no Reminders support on Android (unlike iOS).
- **UNVERIFIED / not found in this research pass:** Android Auto integration, Wear OS companion app, or Claude as a default/system assistant replacing Gemini on Android. No official or credible secondary source surfaced any of these as shipped; do not claim they exist.

---

## 9. iOS-only vs Android-only feature matrix (as documented)

| Capability                                                | iOS                                       | Android                                       |
| --------------------------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Messaging draft/send                                      | Yes (Messages + 3rd-party)                | Yes (default SMS + 3rd-party)                 |
| Email draft (opens in mail app)                           | Yes                                       | Yes                                           |
| Calendar read/create                                      | Yes                                       | Yes                                           |
| Location/Maps context                                     | Yes (Team/Enterprise excluded)            | Yes (Team/Enterprise excluded)                |
| Reminders                                                 | Yes                                       | **No**                                        |
| Alarms/Timers                                             | Not documented                            | **Yes** (Clock app)                           |
| Health data (read-only)                                   | Apple Health, Pro/Max, US only, beta      | Health Connect, Pro/Max, US only, Android 14+ |
| Lock Screen / Control Center / Action Button entry points | Yes (iOS 18+)                             | N/A (no OS equivalent)                        |
| Spotlight/Siri "Ask Claude" intent                        | Yes                                       | N/A                                           |
| Text-selection "Ask Claude" context menu                  | Not documented for iOS beyond Share sheet | Reported (secondary source only)              |

---

## 10. Notifications

- **Cowork:** "When Claude finishes a task or needs your input, you'll get a notification on your phone" ([support.claude.com — Cowork on mobile/web/desktop](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile)).
- **Claude Code Remote Control push notifications:** documented in detail at [code.claude.com/docs/remote-control](https://code.claude.com/docs/en/remote-control) — two independent toggles in `/config`: **"Push when Claude decides"** (proactive) and **"Push when actions required"** (permission prompts/questions). Claude Code **suppresses pushes while you're actively typing in/focused on the connected terminal** (and, as of CLI v2.1.181, for as long as an admin-configured presence-marker file exists, e.g. tied to a screen-lock listener). Troubleshooting tips from the same doc: if `/config` shows "No mobile registered," reopen the phone app to refresh the push token; iOS Focus modes/notification summaries can suppress or delay delivery; Android aggressive battery optimization can delay delivery and should be exempted for the Claude app.
- **Known bug, status "closed as not planned":** push notifications for Claude Code Remote Control **do not arrive on linked iOS devices** even when correctly configured and the device shows as linked — [anthropics/claude-code#60208](https://github.com/anthropics/claude-code/issues/60208). A related, still-open complaint: **"Mobile push requested" reports success server-side but nothing is delivered** ([anthropics/claude-code#50949](https://github.com/anthropics/claude-code/issues/50949), title only, not independently fetched). Treat this as a **currently-reproducible reliability gap** in the notification pipeline for the Code surface specifically, distinct from ordinary Cowork task-complete notifications, which are not reported as broken in the same way.

---

## 11. Background / long-running work reachable from mobile

Mobile is a **control/monitoring surface**, not a place where autonomous agent work executes on-device. Five distinct mechanisms, each with different execution location:

| Mechanism                        | Trigger                                                                    | Where Claude actually runs                                       | Mobile role                                                                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cowork (cloud sessions)**      | Message a task from mobile (or web/desktop)                                | **Anthropic cloud**                                              | Full start/steer/review from phone; works even with all devices offline once a task is running                                                                                              |
| **Dispatch**                     | Message from phone into a persistent thread paired with a specific desktop | **Your desktop**, which must stay awake with Claude Desktop open | Phone is the initiator/remote; desktop does the work. Launched as research preview **March 17, 2026**                                                                                       |
| **Remote Control (Claude Code)** | `claude remote-control` / `--rc` / `/rc` on your machine                   | **Your machine** (local filesystem, local MCP servers)           | Phone is a live window into the local session; can send messages, approve permission prompts, run a subset of slash commands (`/model`, `/effort`, `/mcp`, `/config`, text-output commands) |
| **Scheduled tasks** (Cowork)     | Recurring schedule set by user                                             | **Anthropic cloud**                                              | Notification on completion or when input needed; does not require the phone or any device to be awake                                                                                       |
| **Claude Code on the web**       | Kick off from claude.ai/code or app                                        | **Anthropic cloud sandbox**                                      | Distinguished from Remote Control by not needing any local machine at all                                                                                                                   |

**What mobile explicitly cannot do (per official Cowork doc):**

- **Local file access and browser use** on a Cowork session require the **desktop app open** — "a cloud session can read and write files in folders you've connected on your computer only while the desktop app is open on that computer."
- **Computer use and live artifacts within a Cowork session are desktop-only.**
- Mobile **cannot itself be automated** — i.e., you cannot point Cowork/Dispatch at actions on the phone itself; it only lets you observe/steer work happening elsewhere ([Engadget](https://www.engadget.com/2209495/now-you-can-direct-anthropics-claude-cowork-ai-from-your-phone/): "You cannot use Claude's agent to automate tasks on your phone").

**Cowork/mobile rollout specifics:** beta launched **July 7, 2026**, Max subscribers first, expanding to Pro/Team/Enterprise-with-admin-opt-in over subsequent weeks ([claude.com/blog/cowork-web-mobile](https://claude.com/blog/cowork-web-mobile), [MacRumors](https://www.macrumors.com/2026/07/07/claude-cowork-mobile-web/)). Usage limits were **doubled through August 5, 2026** as a launch incentive, after which normal per-tier weekly caps resumed — several users reported hitting those caps quickly once the promo ended (per aggregated review commentary in the MacRumors comment-thread summary).

---

## 12. Deep links

Source: [support.claude.com — Open the Claude mobile app with a link](https://support.claude.com/en/articles/14898120-open-the-claude-mobile-app-with-a-link).

- Custom scheme: **`claude://`**, plus universal-link equivalents at `https://claude.ai/code/...` (OS opens the installed app if present, else falls back to browser).
- **Important scope limitation: the documented deep-link surface is Claude Code-specific, not general chat.** Confirmed routes:
  - `claude://code` — opens the Code tab's session list.
  - `claude://code/{session-id}` — jumps to a specific Remote Control session (falls back to session list if not found).
  - `claude://code/new?q=...&mode=plan|code&repo=owner/name&branch=...` — prefilled new-session composer.
  - This feature **"requires Claude Code access on your account"** per the Help Center article — it is not a general-purpose "open Claude to conversation X" deep link for ordinary chat.
- **UNVERIFIED:** no source found for a deep link that opens a specific ordinary chat conversation or a specific Project from outside the app.

---

## 13. Offline behavior

- **No offline mode.** The official apps require an active connection for all interactions — corroborated across multiple secondary sources, no contradicting official claim found.
- **UX gap flagged by users:** when connectivity drops, the app reportedly **shows a "thinking" state with no explicit offline/error indicator**, leaving the user unsure whether Claude is processing or the network is down (secondary-sourced usability complaint, not an official acknowledgment — **UNVERIFIED against Anthropic's own bug tracker**, but plausible and specific enough to record).
- Remote Control has defined offline-recovery behavior on the **desktop** side (auto-reconnect, ~10-minute give-up in server mode, longer tolerance in interactive-session mode) — see §11/§10 — but that's about the _local machine's_ network, not the phone's.

---

## 14. Projects on mobile

- Projects are supported on mobile: "organize related tasks into separate workspaces with their own files, context, instructions, and memory" ([support.claude.com — Get started with Cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)).
- Projects integrate with Cowork sessions on mobile per the same source.
- **Local file access remains desktop-only** even inside a Project/Cowork context — mobile Projects work with cloud-side files/context, not the phone's local filesystem.
- Same models, conversation history, and Projects sync as the web version — "shares the same models, conversation history, and Projects as the web version, so you can seamlessly pick up your work" (secondary source on iPad experience, consistent with the official cross-device continuity framing elsewhere).

---

## 15. Artifacts / Interactive Apps / Interactive connectors on mobile

Three related-but-distinct things showed up in research, worth keeping separate:

1. **Classic Artifacts** (the code/doc/mini-webapp side panel from chat) — **mobile viewing/creation not independently re-verified this pass**; the official dedicated artifacts help page returned 404 during this research session (URL guessed, not confirmed to exist at that slug). Cross-device continuity language elsewhere implies parity, but this specific claim is **UNVERIFIED at the primary-source level** for this pass.
2. **"Interactive Apps"** — a named March 25, 2026 release-note item: mobile app can now connect to "fully interactive applications with live charts, sketch diagrams, and build shareable assets," rendered inline in the conversation ([support.claude.com/release-notes](https://support.claude.com/en/articles/12138966-release-notes), mobile release-notes extraction). This reads as the mobile rollout of what elsewhere is called artifacts becoming genuinely interactive (not static previews).
3. **Interactive Connectors** — a distinct, well-documented feature confirmed **explicitly available on Claude for iOS/Android**: "available for all users on Claude, Cowork, Claude Desktop, and Claude for iOS/Android" ([support.claude.com — Use interactive connectors in Claude](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude)). These render live, functional interfaces (dashboards, task boards, design tools) inline or fullscreen from connectors including **Amplitude, Asana, Box, Canva, Clay, Figma, Hex, Slack**, with sandboxed-iframe/CSP security and JSON-RPC messaging; no financial-transaction capability; require no extra permission beyond base connector auth.
   - **Within a Cowork session specifically**, however, "live artifacts" are called out as **desktop-only** (§11) — so the interactive surface available in ordinary mobile chat is not the same guarantee as what's available mid-Cowork-task on mobile. This is a real, documented asymmetry, not a contradiction to gloss over.

---

## 16. Connectors / MCP on mobile

- **Directory connectors** (Google Workspace, Slack, Asana, etc.) can be toggled on/off per-conversation from mobile via the "+" → Connectors flow, same as web.
- **Custom remote-MCP connectors**: mobile **can** now install them too, but it's explicitly **in beta**, and Anthropic's own copy says "Claude Desktop and web remain the primary path for custom connectors" ([support.claude.com — Use connectors to extend Claude's capabilities](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities)). This is a **more permissive state than earlier secondary-source claims** ("no way to configure remote MCP directly from the mobile app" — dated content, apparently now superseded) — the beta rollout narrows that gap.
- **Local MCP servers are impossible on mobile** — mobile apps cannot run local scripts/processes, so only remote MCP is reachable, consistent across all sources.
- Connectors configured elsewhere (web/desktop) sync down: "will be available to use the next time you log in to your account on Claude for iOS or Android."

---

## 17. Files

- Attach via camera, photo library, or file picker; up to ~20 files/conversation, ~30MB/file (secondary-sourced numeric caps, not independently confirmed against one canonical page this pass).
- Remote Control lets you **send images/files from the phone into a local Claude Code session** — "attach a photo or file in the Claude app... Claude sees attached photos directly as part of your message. Claude Code downloads other files to your machine and passes them to Claude as `@` file references" (code.claude.com/docs/remote-control).
- A **specific, still-open complaint**: attaching images from the iOS Photos library into a Remote Control session doesn't work as expected — [anthropics/claude-code#65868](https://github.com/anthropics/claude-code/issues/65868), title-only confirmation, not independently fetched for full detail this pass.
- Local, on-device file read/write for Cowork/Dispatch tasks is **desktop-only** (repeated theme, §11/§14).

---

## 18. Memory

- Location: **Settings → Memory** (new experience) or **Settings → Capabilities** (legacy experience) — reachable identically on mobile: "tap the three-horizontal-line icon in the top-left corner to open the menu, tap Settings, then select Memory" ([support.claude.com — chat search and memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context)).
- Memory **applies across web, Desktop, and Mobile** — one shared memory store, not per-device.
- Full UI parity implied: list of stored memories with per-item delete, "Clear all memories," and a full on/off toggle, all reachable from the mobile Settings screen per the same source.
- Available on **Free, Pro, and Max** (not gated to paid-only).

---

## 19. Model & thinking/effort selection on mobile

- Model picker: tap model name near send button (same interaction pattern as web, per Help Center, which draws no platform distinction).
- **Effort selector** applies to Opus 5, Sonnet 5, Fable 5, and prior-gen Opus/Sonnet models (4.8/4.7/4.6/4.6) per a secondary synthesis of the official settings article — **thinking** and **effort** are separate controls (Low/Medium/High/Extra-high "xhigh" for the latter).
- **Claude Fable** (Mythos-class model) is unavailable specifically inside **voice mode** but is otherwise available in text chat on mobile like any other model — confirmed by the official voice-mode Help Center page.
- Fable 5 / Mythos 5 were announced **June 9, 2026** ([anthropic.com/news/claude-fable-5-mythos-5](https://www.anthropic.com/news/claude-fable-5-mythos-5)); the announcement itself does not call out mobile-specific availability or exclusions, and mobile inherits whatever's on the account by default.
- Claude Code Remote Control exposes `/model` and `/effort` from mobile as **argument-only commands** (no interactive picker/slider on phone) — e.g. `/model sonnet`, `/effort high` — a real, documented UX reduction versus the terminal's interactive picker (code.claude.com/docs/remote-control, "Some commands are local-only" section).
- **Stale third-party listing risk:** at least one mirror site's App Store description text still references "Claude Opus 4 and Claude Sonnet 4" as the models powering the app — this is almost certainly **stale marketing copy from an unofficial mirror**, not evidence of what model generation actually ships; do not treat store-description model names as authoritative.

---

## 20. iPad / tablet layout

- The iPad app is the same native binary as iPhone, sharing "the same models, conversation history, and Projects as the web version" (secondary source, consistent with general cross-device sync claims elsewhere).
- Layout: sidebars/session panels that collapse on iPhone are visible simultaneously on the larger canvas; tap targets are sized up; multi-turn, image-heavy conversations scroll less.
- **Known, documented gap:** the **iPad app has no "Claude Code" section** — Remote Control session linking is iPhone-only among Apple's form factors ([anthropics/claude-code#60208](https://github.com/anthropics/claude-code/issues/60208), and corroborated independently by a third-party iPad-coding-workflow piece noting Claude Code has to be reached via browser on iPad rather than the native app's own Code tab).
- **Same landscape-mode complaint as phone** (§3) recurs specifically in App Store iPad reviews: viewport feels roughly halved by padding/composer/chrome when rotated to landscape, with a direct ask for better screen-real-estate use.

---

## 21. Cross-device continuity

- **Cowork/Dispatch/Remote Control** are all explicitly designed around mid-task handoff: "sessions in the cloud follow your Claude account. Start a task on one surface, steer it from another, and pick up the finished output wherever you are" (Cowork getting-started doc).
- Customer-quote used in Anthropic's own marketing: _"I started on my laptop and picked the session up on my phone while waiting for my bag to come out. It just held the thread."_ — Armmand Hosseini, Ramp ([claude.com/blog/cowork-web-mobile](https://claude.com/blog/cowork-web-mobile)).
- Remote Control specifically syncs **conversation, subagent progress, and dynamic-workflow state** live across terminal, browser, and phone simultaneously — you can literally type from any of the three interchangeably mid-session.
- **No evidence found of an Apple-Handoff-style OS-level continuity mechanism** (i.e., a system Handoff icon to resume a Claude session cross-device via iCloud); continuity is implemented as Anthropic's own account-level cloud sync, not OS Handoff. Do not claim Handoff integration exists — it's **UNVERIFIED / likely does not exist**.

---

## 22. Is Cowork/agentic work reachable from mobile? (direct answer)

**Yes, as a control/monitoring surface — no, not as an execution surface.** You can start, steer, approve, and review Cowork tasks and Claude Code Remote Control sessions entirely from the iOS/Android app, and scheduled/cloud Cowork tasks genuinely run with zero devices online. But nothing runs _on_ the phone: Cowork executes in Anthropic's cloud (or, via Dispatch, on your desktop which must stay awake), and Remote Control executes on whatever machine you started it from. The phone is never the compute target — only the initiator, monitor, and approval device. This is repeated consistently across every official source touching the topic (§11).

---

## 23. What's new in roughly the last 6 months (Feb–Aug 2026)

| Date                                                | What shipped                                                                                                                                                       | Platform                                              | Source                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------- |
| Mar 17, 2026                                        | **Dispatch** research preview — persistent phone-to-desktop thread, QR pairing                                                                                     | iOS, Android, Desktop                                 | release notes; corroborated by third-party Dispatch guides |
| Mar 25, 2026                                        | **Interactive Apps** — mobile chat can render fully interactive live charts/sketch diagrams/shareable assets, not just static artifact previews                    | iOS, Android                                          | release notes                                              |
| Jun 8–9, 2026                                       | Claude Fable 5 / Mythos 5 launched; Apple announces iOS 27 Extensions (Claude as launch partner) at WWDC                                                           | API/web immediately; iOS integration in beta pipeline | anthropic.com; modemguides.com                             |
| Jul 7, 2026                                         | **Cowork expands to mobile (iOS/Android) and web**; Chat+Cowork unify into one home surface (web/desktop first); usage limits doubled through Aug 5                | iOS, Android, web                                     | claude.com/blog; MacRumors; Engadget                       |
| Jul 23, 2026                                        | **Voice mode overhaul** — model switching (Opus/Sonnet/Haiku, was Haiku-only), connected-tools access mid-conversation, 11-language support with in-call switching | iOS, Android, Desktop, web                            | voiceos.com (secondary, detailed)                          |
| Beta-only MCP install from mobile (date not pinned) | Custom remote-MCP connector install directly from the mobile app, beta                                                                                             | iOS, Android                                          | support.claude.com connectors doc                          |

---

## 24. What recently regressed / known reliability gaps

- **Claude Code Remote Control push notifications on iOS**: documented as broken/undelivered despite correct setup and a "linked" device state; the primary GitHub issue was closed **"as not planned"** rather than fixed ([#60208](https://github.com/anthropics/claude-code/issues/60208)); a related open issue reports the server-side "Mobile push requested" success response with no actual delivery ([#50949](https://github.com/anthropics/claude-code/issues/50949)).
- **iPad has no Claude Code tab** — a persistent, not-yet-closed gap versus iPhone.
- **Image attachment from iOS Photos into Remote Control sessions** reported broken in a still-open issue ([#65868](https://github.com/anthropics/claude-code/issues/65868)).
- **Landscape-mode layout complaint** recurs across both iPhone and iPad App Store reviews as of late July 2026 — a UI regression/gap that has not been addressed across multiple recent point releases (the same "squashed some bugs" changelog text has shipped repeatedly without resolving it, per the reviewer's dated complaint sitting after several subsequent version bumps).
- **Offline/connectivity UX**: no explicit "you're offline" state; app can appear to be silently "thinking" during a network outage (secondary-sourced, plausible, not officially acknowledged).
- Broader, **not mobile-specific** but affecting the mobile experience same as web: multiple 2026 threads describe Claude "feeling worse" (shorter responses, more refusals) and infrastructure-level misrouting incidents reminiscent of an August–September 2025 postmortem; a March 2026 incident reportedly caused earlier-session instructions to stop being reliably retrieved from long-context conversations. These are platform-wide model/infra issues, not mobile-app bugs per se, but they land on mobile users identically. **Source quality for this paragraph is weak/aggregated secondary commentary — treat as directional sentiment, not verified incident detail.**

---

## 25. Common complaints, by source

| Source                                                                               | Complaint                                                                                                                        | Sentiment weight                                                          |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| App Store review, "Landscape mode needs work" (Jul 30 2026)                          | Tables truncate in portrait; landscape doesn't reclaim enough space due to UI chrome                                             | Specific, reproducible, recent                                            |
| App Store review, "Paid for annual subscription...still a free account" (Mar 7 2026) | Cross-device subscription activation failure + slow support                                                                      | Billing/account, not app-code                                             |
| Aggregated Play Store commentary                                                     | Rate limits feel punitive on free tier; "becoming unusable" as credits deplete faster than they replenish                        | Directional, not individually sourced                                     |
| Aggregated Play Store commentary                                                     | Occasional dropped/lost messages                                                                                                 | Directional, not individually sourced                                     |
| GitHub issues (#60208, #50949, #65868)                                               | Mobile push notifications for Remote Control unreliable or entirely absent; Photos-library image attach broken in Remote Control | Concrete, reproducible, code-level                                        |
| MacRumors comment-thread summary                                                     | Cowork rate-limit frustration once the Aug 5 2026 doubled-limits promo ended                                                     | Time-boxed, likely resolved as caps reset to normal tier levels over time |
| General 2026 sentiment (multiple aggregators, not mobile-specific)                   | "Claude feels worse" — shorter responses, more refusals, perceived quality regression since early 2026                           | Weak sourcing, platform-wide not app-specific                             |

**Reddit-native complaint threads could not be directly fetched in this research pass** — `reddit.com` and `old.reddit.com` were both blocked to the WebFetch tool in this environment. Everything above sourced "from Reddit" reached this report only via secondary aggregation inside other search results, not direct thread reads; treat Reddit-attributed sentiment as **lower-confidence** than the App Store/Play Store review text and GitHub issues, which were read more directly.

---

## Sources

- [App Store — Claude by Anthropic listing](https://apps.apple.com/us/app/claude-by-anthropic/id6473753684) — version, size, rating, description, release-notes text (fetched 2026-08-15)
- [App Store — iPhone reviews](https://apps.apple.com/us/app/claude-by-anthropic/id6473753684?see-all=reviews&platform=iphone) — recent user review text
- [App Store — iPad reviews](https://apps.apple.com/us/app/claude-by-anthropic/id6473753684?see-all=reviews&platform=ipad) — iPad-specific complaints
- [Uptodown — Claude for Android mirror](https://claude.en.uptodown.com/android) — version/size/date (secondary mirror, not Play Store direct)
- Google Play Store listing (`play.google.com/store/apps/details?id=com.anthropic.claude`) — attempted twice, returned only JS-shell navigation to WebFetch both times; no reliable data extracted directly
- [support.claude.com — Release notes](https://support.claude.com/en/articles/12138966-release-notes) — mobile feature timeline Feb–Aug 2026
- [support.claude.com — Use voice mode on Claude mobile apps](https://support.claude.com/en/articles/11101966-using-voice-mode-on-claude-mobile-apps)
- [support.claude.com — Use dictation on Claude Mobile](https://support.claude.com/en/articles/10065434-use-dictation-on-claude-mobile)
- [support.claude.com — Use Claude app intents, shortcuts, and widgets on iOS](https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios)
- [support.claude.com — Access Claude for iOS on Lock Screen, Control Center, Action Button](https://support.claude.com/en/articles/10302511-access-claude-for-ios-on-your-lock-screen-control-center-and-action-button)
- [support.claude.com — Use the Claude widget on Android](https://support.claude.com/en/articles/10534883-use-the-claude-widget-on-android)
- [support.claude.com — Use Claude with iOS apps](https://support.claude.com/en/articles/11869619-use-claude-with-ios-apps)
- [support.claude.com — Use Claude with Android apps](https://support.claude.com/en/articles/11869629-use-claude-with-android-apps)
- [support.claude.com — Install Claude for iOS](https://support.claude.com/en/articles/9266462-install-claude-for-ios)
- [support.claude.com — Install Claude for Android](https://support.claude.com/en/articles/9612887-install-claude-for-android)
- [support.claude.com — How to update Claude for iOS](https://support.claude.com/en/articles/11825384-how-to-update-claude-for-ios)
- [support.claude.com — Open the Claude mobile app with a link](https://support.claude.com/en/articles/14898120-open-the-claude-mobile-app-with-a-link)
- [support.claude.com — Minimum age requirement / access restriction](https://support.claude.com/en/articles/13117299-minimum-age-requirement-access-restriction)
- [support.claude.com — Use Claude Cowork on web, desktop, and mobile](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile)
- [support.claude.com — Get started with Claude Cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
- [support.claude.com — Assign tasks from anywhere in Claude Cowork (Dispatch)](https://support.claude.com/en/articles/13947068-assign-tasks-from-anywhere-in-claude-cowork)
- [support.claude.com — Use interactive connectors in Claude](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude)
- [support.claude.com — Use connectors to extend Claude's capabilities](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities)
- [support.claude.com — Use Claude's chat search and memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context)
- [support.claude.com — Change the model, effort, and thinking settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings)
- [support.claude.com — Claude Mobile apps collection index](https://support.claude.com/en/collections/9387080-claude-mobile-apps)
- [code.claude.com/docs/en/remote-control](https://code.claude.com/docs/en/remote-control) — full Remote Control mechanics, mobile push notifications, mobile-reachable slash commands, limitations
- [anthropics/claude-code#60208](https://github.com/anthropics/claude-code/issues/60208) — iOS push notifications broken, closed-not-planned; iPad missing Code section
- [anthropics/claude-code#50949](https://github.com/anthropics/claude-code/issues/50949) — mobile push reports success but doesn't deliver (title-level only)
- [anthropics/claude-code#65868](https://github.com/anthropics/claude-code/issues/65868) — iOS Photos image attach into Remote Control broken (title-level only)
- [claude.com/blog/cowork-web-mobile](https://claude.com/blog/cowork-web-mobile) — official Jul 7 2026 Cowork mobile/web announcement, customer quote, usage-limit promo
- [MacRumors — Claude Cowork Expands to iPhone and the Web](https://www.macrumors.com/2026/07/07/claude-cowork-mobile-web/)
- [Engadget — Now you can direct Anthropic's Claude Cowork AI from your phone](https://www.engadget.com/2209495/now-you-can-direct-anthropics-claude-cowork-ai-from-your-phone/)
- [aitoolsreview.co.uk — Claude Cowork Goes Mobile: The Beta, Explained (Aug 2026)](https://aitoolsreview.co.uk/insights/claude-cowork-mobile) — secondary
- [XDA Developers — Claude's Dispatch feature turned my phone into a remote control](https://www.xda-developers.com/claudes-dispatch-feature-turned-my-phone-into-a-remote-control-for-my-entire-workflow/) — secondary, first-person usage account
- [voiceos.com — Claude Voice Mode Gets Smarter (Jul 23 2026 update)](https://www.voiceos.com/blog/claude-voice-mode) — secondary but detailed, model/language/tool-access changes
- [datastudios.org — Claude Voice Mode: From Tap-to-Talk to Fully Duplex](https://www.datastudios.org/post/claude-voice-mode-from-tap-to-talk-to-fully-duplex-ai-conversations) — secondary, conflicting "full duplex" framing
- [anthropic.com/news/claude-fable-5-mythos-5](https://www.anthropic.com/news/claude-fable-5-mythos-5) — official Fable 5/Mythos 5 announcement, June 9 2026
- [modemguides.com — Apple Adds Claude as an iPhone AI Option (iOS 27 Extensions)](https://www.modemguides.com/blogs/modemguides-blog/apple-adds-claude-as-an-iphone-ai-option-what-ios-27-extensions-mean-for-you) — secondary, WWDC/iOS 27 timeline
- [CNBC — Anthropic's Claude hits No. 1 on Apple's top free apps list](https://www.cnbc.com/2026/02/28/anthropics-claude-apple-apps.html)
- [TechCrunch — Anthropic's Claude rises to No. 1 in the App Store following Pentagon dispute](https://techcrunch.com/2026/03/01/anthropics-claude-rises-to-no-2-in-the-app-store-following-pentagon-dispute/)
- [claudelog.com — Claude Android Features: Widgets, Sharing, and Deep Integration](https://claudelog.com/faqs/claude-android-specific-features-integration/) — secondary, text-selection context-menu claim not independently confirmed (fetch to this specific page returned 403 in this pass; claim carried from an earlier search-result synthesis of the same page, so confidence is lower than a direct fetch would give)

**Explicitly not found / not claimed to exist:** offline mode; Android Auto integration; Wear OS companion app; Claude as a system default-assistant replacement for Gemini on Android; OS-level Apple-Handoff continuity; a general (non-Code) chat deep-link scheme; a canonical primary-sourced numeric cap for file-attachment count/size (numbers reported are secondary-sourced only).
