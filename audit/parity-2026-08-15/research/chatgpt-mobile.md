# ChatGPT iOS & Android Native Apps — Production State

**Research date:** 2026-08-15
**Scope:** OpenAI's official ChatGPT native apps on iOS and Android (`com.openai.chatgpt` / App Store id6448311069). Web app and desktop (macOS/Windows/Linux) are referenced only for contrast.
**Method:** WebSearch + WebFetch against official OpenAI sources where reachable, App Store/Play Store listings and mirrors, tech press, OpenAI Developer Community bug reports, and third-party technical write-ups. Every claim below is dated and sourced; items I could not confirm are explicitly marked **UNVERIFIED**.

> Caveat on tooling: `help.openai.com` and `openai.com/index/...` returned HTTP 403 to automated fetches for this session (blocked to non-browser clients), so several claims rely on press coverage that quotes or paraphrases those help-center/blog pages rather than the primary text itself. Reddit was also unreachable via fetch this session. Where a claim rests only on secondary paraphrase, I've said so.

---

## 1. Snapshot: current versions and store standing

|                              | iOS                                             | Android                                                                                           |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Current version (2026-08-15) | **1.2026.209** (App Store, updated Aug 7 2026)  | **1.2026.223** (Play Store, updated Aug 13–14 2026)                                               |
| Size                         | ~198.4 MB                                       | ~70.9 MB (base APK)                                                                               |
| Rating                       | 4.8★ (9.4M ratings) on App Store                | ~7.2/10 per third-party aggregator (Play Store native rating not directly fetchable this session) |
| Min OS                       | iOS 17.0 (App Store minimum as of this listing) | Android 7.0+ (varies by APK variant; some listings show Android 12L+ for newer builds)            |
| Category                     | Productivity, 13+                               | Productivity, Teen                                                                                |
| Developer                    | OpenAI OpCo, LLC                                | OpenAI                                                                                            |
| Latest "What's New" text     | "Bug fixes and small improvements."             | "Minor fixes and improvements."                                                                   |

Both stores' visible release notes are **generic and undisclosed** — neither lists what actually shipped in the current build. This is itself a discoverability problem: users (and competitors doing parity research) cannot tell from the store listing alone that navigation, voice architecture, Health, or Work shipped in recent weeks. The real changelog has to be reconstructed from OpenAI's help-center release-notes article and press coverage, not the store pages.
Sources: [App Store listing](https://apps.apple.com/us/app/chatgpt/id6448311069), [APKPure listing](https://apkpure.com/chatgpt/com.openai.chatgpt), [AppFigures/APKMirror version list](https://www.apkmirror.com/apk/openai/chatgpt/chatgpt-1-2026-223-release/).

In-app purchase ladder shown on the iOS listing: ChatGPT Plus $19.99, ChatGPT Go $8.00, ChatGPT Pro 5x $100.00, ChatGPT Pro 20x $200.00, plus consumable credit packs (100/$4, 500/$20, 1000/$40). Source: [App Store listing](https://apps.apple.com/us/app/chatgpt/id6448311069).

ChatGPT topped Apple's 2025 most-downloaded free iPhone apps list in the US, ahead of Google and TikTok. Source: [Content Grip](https://www.contentgrip.com/chatgpt-apple-top-app/).

---

## 2. Navigation architecture — and a mid-2026 redesign in progress

- Historically the mobile app used a hamburger-style **drawer/sidebar** (chat list, pinned chats, custom GPTs, Projects) plus a bottom composer — broadly mirroring the web sidebar.
- **June 3, 2026** (unannounced): OpenAI shipped a sidebar redesign that consolidated pinned chats, custom GPTs, and Projects into one collapsible "Pinned" section, moved custom GPTs behind a "More" menu, and — specifically on mobile — **collapsed the sidebar into a horizontal bar** above the chat/Projects list carrying entry points for Images, Codex, Pulse, and Apps. Users reported pinned items "disappearing," GPTs now requiring More → GPTs → My GPTs (more taps), and Projects no longer opening a dashboard on tap (now requires hovering/tapping a small pencil icon). One user called it "one of their worst rollouts thus far." Source: [popularai.org sidebar complaint writeup](https://www.popularai.org/p/chatgpt-sidebar-pinned-chats-gpts-projects-missing) (secondary source quoting user reports; original Reddit/community threads not independently fetchable this session).
- **June 2026**, separately: a new **long-press gesture on the send button** lets users manually pick a reasoning/effort tier (reported as "Instant / Thinking / Extended") rather than have the model auto-select, gated by subscription tier. Source: search-summarized from [AndroidHeadlines coverage](https://www.androidheadlines.com/2026/06/chatgpt-hidden-gesture-navigation-table-of-contents.html) (page itself 403'd to fetch; relying on search snippet — **treat specifics as UNVERIFIED pending primary confirmation**).
- **July 2026**: OpenAI President Greg Brockman publicly acknowledged the app's navigation is "kind of a mess" after Work/Codex/GPT-5.6 were bolted onto the existing tab structure, and OpenAI is reportedly planning a "tab-free" unified redesign by end of 2026 (a "superapp" direction bundling chat, coding, agents, image gen, and partner services like Canva/Booking.com). This is a roadmap statement, not shipped — mark as **UNVERIFIED / forward-looking**, not current state. Source: [AndroidHeadlines "OpenAI Plans Major ChatGPT Desktop App Redesign"](https://www.androidheadlines.com/2026/07/openai-plans-major-chatgpt-desktop-app-redesign-following-user-backlash-its-kind-of-a-mess.html) (search-snippet only, page 403'd).

**Net effect as of 2026-08-15**: mobile navigation is a horizontal top bar (Images / Codex / Pulse / Apps) over a chat+Projects list, with Voice/GPT-Live and the composer anchored at the bottom — a live, actively-churning surface rather than a settled IA, with a company-acknowledged clutter problem and an announced-but-unshipped simplification.

---

## 3. Composer, camera, photo library, file handling

- Composer supports text entry, dictation toggle, and an attachment (+) button offering photo/file upload from camera or library.
- **Dictation** (Android, confirmed in Aug 2026 release-note digest): auto-retries once on connection failure/timeout instead of forcing a restart; the dictation button now stays visible after text/attachments are already added (previously it could disappear), so users can mix typed and dictated input in one message; composer suggestions update live as you type/delete; a connected physical keyboard now keeps composer focus instead of interrupting composition. Source: [Releasebot OpenAI/ChatGPT changelog aggregation](https://releasebot.io/updates/openai/chatgpt) (aggregator, not primary — cross-check recommended).
- **Photo/camera**: both store listings advertise "Snap or upload a picture to transcribe a handwritten recipe or get info about a landmark" — i.e., single-shot photo capture/upload for vision Q&A is a headline feature on both platforms. Source: [Play Store description via search summary](https://play.google.com/store/apps/details?id=com.openai.chatgpt).
- **File upload**: PDF/DOCX/XLSX/PPTX/CSV/TXT supported, up to (reported) 512MB/file across plans; some sources note DOCX occasionally fails to parse on mobile due to MIME-type handling differences from desktop, with PDF as the reliable fallback — this is a real, reproducible mobile-specific rough edge, not a one-off complaint. Source: [gptprompts.ai file-upload troubleshooting guide](https://gptprompts.ai/ai-errors-and-fixes/chatgpt-file-upload-not-working) (secondary; treat exact size limit as approximate/UNVERIFIED against an official spec page, which 403'd).
- **Image generation/editing on mobile**: "ChatGPT Images 2.0" (gpt-image-2 model family) is available on web, iOS, and Android, on all tiers including Free. It ships a real in-app editor: selection tool for targeted edits, undo/redo, aspect-ratio picker, and a dedicated "Images" section in the (now horizontal) nav bar with preset style library (Sketch, Plushies, 3D Glam Doll, Retro Mall Studio, etc.) and trending-prompt suggestions. Source: [search-aggregated coverage, felloai/imagen-ai style summaries] — **the specific model name "gpt-image-2" and "2K output" claims are UNVERIFIED against an official OpenAI spec page** (not independently confirmed via primary source this session).

---

## 4. Voice: Advanced Voice Mode → GPT-Live (major July 2026 change)

This is the single biggest mobile-relevant change in the last six months and is easy to miss because press coverage uses both names interchangeably.

- **July 8, 2026**: OpenAI shipped **GPT-Live** (models **GPT-Live-1** and **GPT-Live-1 mini**), a new integrated speech-to-speech architecture that **replaces Advanced Voice Mode as the default** voice experience in the ChatGPT app. Rollout is across **iOS, Android, and web** (chatgpt.com); desktop coverage is less clearly documented in the sources gathered. Free-tier users get GPT-Live-1 mini by default; Go/Plus/Pro get the full GPT-Live-1 model, which can delegate hard reasoning to GPT-5.5 in the background while the voice model keeps talking. Sources: [TechCrunch](https://techcrunch.com/2026/07/08/openai-releases-new-voice-models-for-more-natural-live-conversations/), [ExplainX](https://www.explainx.ai/blog/gpt-live-openai-chatgpt-voice-july-2026), [TechJournal](https://techjournal.org/what-is-gpt-live-chatgpt-voice), [AndroidHeadlines](https://www.androidheadlines.com/2026/08/openai-gpt-live-voice-architecture-rebuild.html) (last one 403'd on direct fetch, relied on search snippet).
- **Full-duplex / interruptions**: GPT-Live genuinely listens and speaks simultaneously — it can be interrupted mid-sentence, backchannels with short acknowledgments ("mhmm," "got it") while the user is still talking, and can silently hold context for a while before responding. This is architecturally different from the old AVM pattern (separate STT → LLM → TTS pipeline), which is now called out in coverage as "legacy" voice.
- **Voices**: nine voices, described as "remastered" for GPT-Live (Arbor, Breeze, Cove, Ember, Juniper, Maple, Sol, Spruce, Vale — this specific list is carried over from pre-GPT-Live Advanced Voice Mode FAQ coverage and **not independently re-confirmed post-GPT-Live**; treat the name list as **UNVERIFIED** for the current build even though the count of nine is corroborated).
- **REGRESSION — live camera / screen sharing dropped at launch**: Multiple independent sources agree GPT-Live shipped **without** video/screen-sharing support: _"GPT-Live doesn't currently support showing ChatGPT your screen or using the camera during a voice conversation... those stay with Advanced Voice Mode for now."_ OpenAI has given no public timeline for parity. Users who need live camera vision or screen sharing during a voice call must fall back to the legacy Advanced Voice Mode, which apparently remains selectable alongside GPT-Live. This is a genuine, dated regression as of the 2026-08-15 research date — not a hypothetical. Sources: [TechJournal](https://techjournal.org/what-is-gpt-live-chatgpt-voice), [TheAICareerLab](https://theaicareerlab.com/blog/chatgpt-gpt-live-voice-mode-2026), [reconn-ai](https://reconn-ai.com/news/chatgpt-voice-gpt-live-1-ai-visibility/).
- **Legacy Advanced Voice Mode** (pre-GPT-Live) — for reference on what camera/screen-share looked like when it worked: tap the camera icon at the bottom of the voice screen to start live camera sharing (tap again to stop); tap the "•••" menu and choose "Share Screen" to share the device screen. ChatGPT could reference what it saw later in the same conversation. This rolled out originally in December 2024 to Plus/Pro/Team, reaching Enterprise/Edu the following January. Sources: [Axios](https://www.axios.com/2024/12/12/chatgpt-video-screen-sharing-voice-chat), [TechRadar](https://www.techradar.com/computing/artificial-intelligence/chatgpt-adds-eyes-to-its-voice-with-new-screen-and-video-sharing-feature).
- **Live bug (Android, corroborated Aug 2025 → follow-up Feb 2026)**: an OpenAI Developer Community thread shows at least 14 users across multiple Android devices (Pixel 9 XL, OnePlus 13, Galaxy S24, etc.) reporting the camera icon appearing but the feed being unresponsive in Advanced Voice Mode; one iOS report followed in February 2026. OpenAI support escalated it; some users reported it "working again" within days, but it illustrates the camera/vision path in voice mode is not rock solid across the Android device matrix. Source: [OpenAI Developer Community thread](https://community.openai.com/t/live-camera-screen-share-in-advanced-voice-mode-camera-icon-appears-but-feed-unresponsive-android-chatgpt-5/1340204).
- **Background / lock-screen behavior**: when "Background Conversations" is enabled in Settings, a voice chat keeps running audio and lets you respond after locking the phone or switching apps; you can return later and continue as voice or text since it's saved to chat history. Background conversations can auto-end after about an hour or when plan usage limits are hit. Sources: search-aggregated from OpenAI Advanced Voice Mode FAQ coverage (primary help-center page 403'd; **treat exact 1-hour figure as approximate/UNVERIFIED against the primary doc**).
- **Transcript**: voice conversations are saved into normal chat history (implied by the "pick up as voice or text" behavior above) — a dedicated verbatim-transcript view/export was **not confirmed** in any source gathered this session; mark **UNVERIFIED**.
- **Real-time audio translation**: as of a March 2026 datapoint, ChatGPT voice does **not** do live speech-to-speech translation of a conversation between two people (it processes text-in/text-out under the hood even in voice mode); OpenAI has a separate `gpt-realtime-translate` model for developers building translation tools, but it is not exposed as a consumer feature inside the ChatGPT app. Source: [maestra.ai](https://maestra.ai/blogs/can-chatgpt-translate-in-real-time) / [OpenAI cookbook](https://developers.openai.com/cookbook/examples/voice_solutions/realtime_translation_guide) (secondary characterization of a dev-facing model, not an app feature).
- **User sentiment**: recurring complaint pattern (from earlier Standard Voice → Advanced Voice Mode transition, still echoed by some in GPT-Live coverage) that newer voice generations sound faster/more "robotic" and less "warm" than what preceded them, plus specific GPT-Live criticism that early non-English demos (e.g., Hindi) drew criticism for fluency gaps. Source: [TechRadar](https://www.techradar.com/computing/artificial-intelligence/chatgpt-fans-are-furious-as-openai-delays-rollout-of-next-gen-voice-mode) (note: some of this sentiment dates to the 2025 Standard→Advanced transition, not GPT-Live specifically — dates called out per-claim above).

---

## 5. Siri, Shortcuts, App Intents, and Android's assistant role

- **iOS Shortcuts / Siri (via Shortcuts automation)**: the ChatGPT app exposes Shortcuts actions; a common user-built automation chains "Dictate Text → Ask ChatGPT → Speak Text" so that "Hey Siri, Ask ChatGPT" round-trips through the app. This is a **user-assembled Shortcut**, not a built-in OS-level Siri replacement. Source: [Medium/Sam Parmar walkthrough](https://parmsam.medium.com/use-of-chatgpt-on-ios-with-apple-shortcuts-and-siri-600c2dd3c104), [Agentic Workers guide](https://www.agenticworkers.com/blog/easily-set-up-chatgpt-with-siri-for-seamless-ai-assistance-6nK7fz).
- **Apple's own Siri↔ChatGPT extension** (separate mechanism, OS-level, since iOS 18.2, Dec 2024): Apple Intelligence/Siri can route certain requests (complex questions, photo/document analysis, Writing Tools requests) to ChatGPT with per-request user consent, without opening the ChatGPT app. This still existed as of the sources gathered. Source: [MacStories](https://www.macstories.net/stories/apple-intelligence-and-chatgpt-in-18-2/), [MacRumors](https://www.macrumors.com/guide/ios-18-2-iphone-chatgpt-integration/).
- **This is now in flux for 2026**: Apple has reportedly signed a multi-year deal (~$1B/year) to have **Google Gemini** power the next-generation Siri overhaul, expected either in iOS 26.4 (~Mar/Apr 2026) or iOS 27 (~Sept 2026); Apple has separately been prototyping its own ChatGPT-style conversational app. Apple has **not confirmed** whether/how the existing ChatGPT extension survives this transition. Given the research date (Aug 15, 2026) sits inside this uncertain rollout window, **the current end-to-end state of Siri↔ChatGPT integration on a fully updated iPhone is UNVERIFIED** — it may still work as described, or may already be superseded depending on which iOS version a given user is on. Sources: [ia.acs.org.au](https://ia.acs.org.au/article/2026/apple-reveals-the-ai-behind-siri-s-big-2026-upgrade.html), [TechCrunch](https://techcrunch.com/2026/05/28/sneak-peek-at-new-siri-app-reveals-apples-plans-to-take-on-chatgpt-and-more/).
- **App Intents / Shortcuts app-action support**: OpenAI documents "iOS app intents" as a supported ChatGPT use case (drag-and-drop of individual messages into other apps was added in an earlier update); a Shortcuts action lets other automations pipe input into ChatGPT and route output elsewhere (Notes, Messages, etc.). Source: [OpenAI's own use-case page, learn.chatgpt.com](https://learn.chatgpt.com/use-cases/ios-app-intents) (this one loaded via search snippet only, not independently fetched — treat page contents as **UNVERIFIED in detail**, though its existence as an OpenAI-authored page is a strong signal the capability is real and documented).
- **Android — default assistant role**: since a beta in **v1.2025.070 (~March 2025)**, ChatGPT can be set as the Android phone's **default digital assistant**, replacing Google Assistant/Gemini, via Settings → Default digital assistant app; the overlay can also be triggered by the power-button long-press. Documented limitations at that time: **no hotword ("Hey Google"-style) support** because Google doesn't expose that API to third parties, and **no deep OS/Google-service integration** — ChatGPT-as-assistant cannot toggle system settings, control Google Home devices, control Spotify playback, or create native Google Calendar events. **No 2026 source found confirming these limitations have been lifted**; treat the limitation list as still current but **UNVERIFIED as unchanged** — this is exactly the kind of gap that could have quietly improved or regressed without press coverage. Sources: [9to5Google](https://9to5google.com/2025/03/14/chatgpt-default-assistant-android/), [AllThings.How](https://allthings.how/how-to-replace-gemini-or-google-assistant-with-chatgpt-on-android/).

---

## 6. Widgets

- iOS: OpenAI ships **two Lock Screen widgets** — one to start a **voice** conversation and one for a **text** conversation — plus Home Screen widget(s) that act as a "gateway to advanced AI without needing to open the app first," including one that can jump straight to the camera-based vision flow. Requires iOS 16.1+. Exact widget size options (small/medium/large) and whether there's an interactive (button-driven) widget vs. a launch-only widget were **not confirmed** in the sources reachable this session (the one dedicated widget-guide page fetched returned no usable content). Sources: [Mytour how-to](https://mytour.vn/en/blog/bai-viet/learn-how-to-effortlessly-add-the-chatgpt-widget-to-your-iphone-lock-screen-for-usage-and-quick-searches.html), [360-reader guide](https://360-reader.com/how-to-add-chatgpt-widget-to-iphone-lock-screen/) — both secondary how-to sites, not OpenAI documentation.
- Android: **no equivalent widget detail was found** in this session's sources — mark Android home-screen/widget support **UNVERIFIED** (absence of evidence, not evidence of absence).
- **Live Activities / Dynamic Island support**: not addressed by any source found — **UNVERIFIED**.

---

## 7. Share sheet extension

- **iOS**: the OS-level Share Sheet supports piping selected text/URLs into ChatGPT via a **user-configured Shortcut** ("Share to ChatGPT" — accepts Text, Rich Text, Safari pages, Articles), added by editing Share Sheet actions. Whether OpenAI ships a **native, first-party Share Extension** (as opposed to users building one via the Shortcuts app) was **not clearly confirmed** by the sources gathered — most guides describe a Shortcuts-based workaround rather than an out-of-the-box OS share-sheet entry. Treat "native ChatGPT share extension" as **UNVERIFIED**; the safer claim is that Share Sheet integration exists but is Shortcuts-mediated. Sources: [GitHub — Share-to-ChatGPT-Shortcut](https://github.com/reorx/Share-to-ChatGPT-Shortcut), [AppleVis forum thread](https://www.applevis.com/forum/ios-ipados/shortcut-action-automatically-share-chatgpt-share-sheet).
- **Android**: no evidence found of a native Android "Share to ChatGPT" target either; sources instead describe browser-based workarounds (add chat.openai.com as a home-screen shortcut). **UNVERIFIED / likely absent as a first-party feature.**
- Drag-and-drop of individual ChatGPT messages into other apps was added as an iOS-specific interaction in an earlier update (predates this research window but still referenced as current in 2026 guides). Source: [Andrew Ford's iOS ChatGPT shortcut writeup](https://andrewford.co.nz/articles/chatgpt-shortcut-on-ios/).

---

## 8. Notifications & push, background tasks, deep links

- **Push notifications**: supported on iOS, Android, macOS, and web (Windows reportedly "to follow"); the practical trigger is creating a **Scheduled Task** — OpenAI sends the result as a push notification and/or email. Source: search-aggregated OpenAI help-center content (primary page 403'd).
- **Scheduled Tasks** got a dedicated redesign starting **June 17, 2026**: a new "Scheduled" page in the sidebar (web and mobile) listing active tasks with next-run time, and controls to pause/resume/edit/delete; supports one-off tasks, recurring jobs, and "monitoring" tasks that only notify when something changed; supports fuzzy time windows ("morning," "evening") instead of exact times. Rolled out to **Go, Plus, Pro, Business, Enterprise** on **web, iOS, and Android** — **not available on the desktop app or the Codex app**. Per-plan active-task caps reported: Go 3, Plus 5, Pro/Business/Enterprise 15 (Free-tier cap not stated in sources — possibly no scheduled tasks on Free, **UNVERIFIED**). Sources: [ITBrief](https://itbrief.com.au/story/openai-expands-chatgpt-scheduled-tasks-with-new-hub), [Windows Forum thread](https://windowsforum.com/threads/chatgpt-scheduled-tasks-gets-a-dedicated-page-web-mobile-for-reliable-reminders.427609/), [AndroidAuthority](https://www.androidauthority.com/schedule-tasks-on-chatgpt-3678802/).
- **ChatGPT Pulse** — a **mobile-first, mobile-native** feature (this is notable for a parity audit): personalized morning-briefing "visual cards" built from overnight research on the user's activity/preferences, with a "Curate for tomorrow" control and opt-in notifications delivered "like your daily newspaper." Launched as **Pro-only, iOS/Android exclusive** around **September 2025**, with staged rollout to Plus and eventually all tiers mentioned as the plan. By mid-2026 it has a permanent slot in the app's horizontal nav bar (see §2), implying it graduated from a limited pilot into a standing surface. Source: [Yahoo Tech coverage of the OpenAI announcement](https://tech.yahoo.com/ai/chatgpt/articles/openai-launches-chatgpt-pulse-deliver-092118051.html) — **primary OpenAI announcement page not independently fetched (403); rollout-tier expansion by Aug 2026 is inferred from the nav-bar placement, not a direct statement, so treat "now available beyond Pro" as UNVERIFIED.**
- **Image-generation completion notifications**: users have explicitly requested (as a feature, in the OpenAI Developer Community) a push notification for "your image is ready" — as of the sources found, this does **not** appear to be a shipped native feature; third-party browser extensions exist to fill the gap on web. Source: [OpenAI Developer Community feature request thread](https://community.openai.com/t/suggestion-notifications-when-image-generation/1222976).
- **Deep links / app links**: a live OpenAI Developer Community feature request states the ChatGPT app **cannot currently be launched into a specific chat with a pre-filled prompt** via a URL scheme or Android intent — i.e., there's no documented public deep-link contract for "open ChatGPT at X with prompt Y." This is a real, current gap relevant to any automation/other-app integration story. Source: [OpenAI Developer Community feature request](https://community.openai.com/t/support-custom-url-schemes-or-intent-handlers-to-trigger-specific-behaviors-in-the-chatgpt-mobile-app/1255168).
- **Background App Refresh**: on iOS, disabling Background App Refresh for ChatGPT does **not** disable its notifications or widgets — those are treated as independent OS permission surfaces. Source: general iOS-behavior discussion (secondary, not ChatGPT-specific — **UNVERIFIED as ChatGPT-app-specific confirmation**, though it follows standard iOS platform behavior).

---

## 9. Offline behavior

- ChatGPT has **no offline inference mode** on any platform, including iOS and Android apps — every query requires a live connection to OpenAI's servers; there is no on-device/local model shipped in the consumer app. When offline, the app throws an error on new queries but still lets you scroll **previously loaded/cached conversation history**. This is consistent, longstanding behavior with no evidence of change in 2026. Source: [Fritz.ai](https://fritz.ai/can-you-use-chatgpt-offline/), [ai-toolbox.co "Can You Use ChatGPT Offline? Complete Guide 2026"](https://www.ai-toolbox.co/chatgpt-management-and-productivity/can-you-use-chatgpt-offline-complete-guide-2026) — both are generic explainer sites, not OpenAI documentation, but the underlying claim (cloud-only inference) is architecturally consistent with everything else found this session and treated as **reliable, though not primary-sourced**.

---

## 10. Projects, Tasks, and Library on mobile

- **Projects**: fully present on mobile. As of the ~Aug 2026 release digest: project **sharing** opened to **all plans (Free, Plus, Pro, Go)** globally on **web, iOS, and Android**; a **memory-setting toggle** (default memory vs. project-only memory) was added for eligible unshared projects; **Voice (GPT-Live) now supports file uploads and works inside Projects**, closing a prior gap where voice sessions couldn't see project context/files. Source: [Releasebot aggregation](https://releasebot.io/updates/openai/chatgpt) (aggregator; cross-reference with primary release notes recommended, primary page 403'd this session).
- **Library**: on **web** specifically, a "Quick Library" file-access flow avoids re-uploading a file that's already been shared once, and a **Google Drive** integration was added so files/folders (including ones shared with the user, not just owned) are browsable from Library and can be pulled into a chat via @mention without re-upload. **Whether this Library/Drive integration is present on the mobile apps specifically, or web-only, was not confirmed** — treat mobile availability of the Drive-in-Library feature as **UNVERIFIED**. Source: [Releasebot aggregation](https://releasebot.io/updates/openai/chatgpt).
- **Tasks**: see §8 (Scheduled Tasks) — present on mobile with the June 2026 redesign.
- **Interactive quizzes**: a newer feature (ask ChatGPT to quiz you on a topic, answer inline) shipped to **all consumer plans and Edu, on web and mobile**. Source: [Releasebot aggregation](https://releasebot.io/updates/openai/chatgpt).

---

## 11. Agent mode on mobile — "ChatGPT agent" retired, replaced by "ChatGPT Work"

This is a major naming/architecture change that a stale competitor profile would get wrong.

- The old standalone **"ChatGPT agent"** mode (browser-driving autonomous agent) is described by OpenAI's own help center (per secondary characterization, primary page 403'd) as **"no longer available,"** with users pointed instead to **ChatGPT Work** for multi-step tasks and to a "cloud browser" for browser-specific workflows. Source: [AIToolsReview](https://aitoolsreview.co.uk/insights/chatgpt-work) (paraphrasing the help-center notice; **treat exact wording as UNVERIFIED, the substance — agent mode replaced — as well-corroborated** across three independent secondary sources).
- **ChatGPT Work** launched **July 9, 2026**, restructuring the app around three modes: **Chat**, **Work** (multi-step agentic tasks producing finished deliverables — sheets, slides, docs, small web apps), and **Codex** (dev-focused). It is **not a new paid tier**; it's bundled into existing Plus/Pro/Business/Enterprise plans (no free-tier access reported for Work itself), drawing on the same agent-usage credit pool as Codex.
- **Mobile-specific limitation (important for a parity audit)**: Work is reachable from the **web and mobile apps**, but the **mobile/web clients cannot access local files or use Computer Use** (the click/type/file-management automation layer) — those require the **desktop app**. So "agent mode on mobile" today means: you can start, monitor, and steer a Work task from your phone, and it can reach connected cloud tools (Slack, Gmail, Google Drive, Salesforce, etc. via a Plugins directory) and run on a schedule, but it cannot drive your phone's local files or a Computer-Use browser session the way the desktop app can.
- Rollout order: Pro/Pro Lite/Enterprise/Edu got access first; Plus/Business followed "over the next few days" after July 9.
- Cross-device continuity for Work specifically improved **July 16, 2026**: a cloud Work thread can now move between the Windows desktop app, web, and mobile — start a task on one surface, check progress or add instructions from the phone.
  Source (all of the above): [AIToolsReview "ChatGPT Work, Explained"](https://aitoolsreview.co.uk/insights/chatgpt-work) — a secondary explainer, but internally consistent with independent Windows Forum and community coverage found in earlier searches; **treat pricing/plan-gating specifics as reasonably solid, exact help-center wording as UNVERIFIED**.

### Codex on mobile (adjacent to, not the same as, Work)

- **May 14–15, 2026**: OpenAI brought **Codex** (its coding agent) into the ChatGPT mobile app on **iOS and Android**, available to **all plans including Free and Go** (in preview). The phone acts as a **thin client / remote control**, not a coding environment: you can start/continue threads, send follow-up steering instructions, **approve** agent actions through the same approval gates as desktop, review syntax-highlighted diffs, view test results and Computer-Use screenshots, switch models mid-session, adjust reasoning effort, and get push notifications when an approval is needed. You explicitly **cannot** edit files directly, run shell commands manually, or configure plugins/MCP servers from the phone — that all stays on the connected host machine (Mac primary, Windows "coming soon," Linux via SSH). Pairing is via QR code; described security model (per a third-party technical write-up, **not an official OpenAI doc, so treat the crypto specifics as UNVERIFIED**) uses an encrypted relay with X25519/Ed25519/AES-256-GCM such that the relay only sees connection metadata, not payload content. Sources: [Engadget](https://www.engadget.com/2173235/openai-brings-its-codex-coding-app-to-mobile/), [Dataconomy](https://dataconomy.com/2026/05/15/codex-now-works-through-chatgpt-on-iphone-and-android/), [third-party technical deep-dive](https://codex.danielvaughan.com/2026/05/15/codex-mobile-chatgpt-app-relay-architecture-remote-agent-control/) (this last one is the most detailed but is an independent blog, not OpenAI — flagged accordingly).

---

## 12. Sora integration in the mobile app — genuinely unresolved as of research date

This is the murkiest area in the whole research pass, and honestly reported as such:

- OpenAI's standalone **Sora app and sora.com website were shut down on April 26, 2026** (developers notified March 24, 2026), reportedly for being financially unsustainable (~$1M/day cost vs. ~$2.1M total lifetime revenue) plus copyright/deepfake pressure and a pre-IPO profitability push. The **Sora (2) API is scheduled to be discontinued September 24, 2026** (still live as of this research date). Already-exported videos remain the user's to keep. Sources: [invideo.io](https://invideo.io/blog/sora-ai-video-generator/), [kaopiz.com Sora shutdown guide](https://kaopiz.com/en/articles/sora-shutdown-guide/), [alternativeto.net](https://alternativeto.net/news/2026/3/openai-is-shutting-down-sora-its-ai-video-slop-app-less-than-six-months-after-launch).
- Separately, an **APK teardown of ChatGPT Android v1.2026.076** (~March 2026, i.e., before the standalone Sora shutdown) found unreleased UI strings — "Video in ChatGPT is here," "Transform text and image into video with dialogue, soundtrack, and style," "Create video," "Explore, create, and share videos" — consistent with reporting (via _The Information_) that OpenAI planned to **fold Sora's video generation into the main ChatGPT app** rather than keep it as a separate product. Source: [Android Authority APK teardown](https://www.androidauthority.com/chatgpt-sora-3650424/).
- **What I could not confirm**: whether that in-app "Create video" capability actually shipped and is live inside the ChatGPT app (web or mobile) as of 2026-08-15. No source found in this session directly confirms a launched, user-facing video-generation entry point inside the current ChatGPT app; the evidence is a pre-launch APK teardown plus a since-executed standalone-app shutdown, with no connecting announcement located. **This is explicitly UNVERIFIED — flagged as a priority item to check directly in the live app** rather than assumed either way.

---

## 13. Health (new in 2026, iOS + web only — no Android)

Notable because it's a real recent expansion with a real platform gap:

- **Health in ChatGPT** launched in limited beta **January 7, 2026**, then relaunched with expanded access on **July 23, 2026** (US only). Lets users connect **Apple Health** data and supported medical records to get personalized answers: comparing lab results over time, summarizing changes since a prior visit, tracking medications, and relating sleep/activity/workouts to health questions.
- **Platform**: explicitly **web and iOS only** — no Android support found in any source (unsurprising given the Apple Health dependency, but confirms Android users structurally cannot get this feature via that data source).
- **Eligibility**: logged-in users **18+**, **US only**, available on **Free, Go, Plus, and Pro** plans.
- **Privacy**: OpenAI states connected health data and related conversations are **not used for model training or ad targeting**; permission is requested before each use of connected health data, with an allow-once / always-allow / disable choice in Health settings.
  Sources: [MacRumors](https://www.macrumors.com/2026/07/23/chatgpt-apple-health-integration/), [9to5Mac](https://9to5mac.com/2026/07/23/openai-relaunches-apple-health-connected-chatgpt-feature-with-expanded-access/), [MacRumors Jan 2026 launch piece](https://www.macrumors.com/2026/01/07/openai-chatgpt-health-apple-health-integration/).

---

## 14. Cross-device continuity, iPad, Apple Watch

- **Baseline sync**: signing into the same OpenAI account on any surface shows the same chat history — this is longstanding and unchanged. It does **not** sync folders/pins/prompt-library state consistently (per the sidebar-redesign complaint thread in §2), and the **Windows desktop app** in particular has been reported as not reflecting the latest threads without a restart — an active point of user frustration in the OpenAI Developer Community. Source: [community.openai.com thread on cross-device chat sync](https://community.openai.com/t/real-time-conversation-sync-across-devices-for-seamless-multi-device-use/1021452) (secondary search-snippet characterization).
- **Work-thread continuity** (agentic, not plain chat) specifically improved July 16, 2026 — see §11.
- **iPad**: no distinct iPad-optimized layout beyond what iPadOS's own **Split View / Slide Over / Stage Manager** provide for any iPhone-sized app; sources describe using ChatGPT alongside other apps via standard iPadOS multitasking rather than describing a bespoke wide/multi-column ChatGPT iPad interface. **A dedicated iPad-native layout (e.g., persistent sidebar + detail pane in landscape) was not confirmed** — treat as **UNVERIFIED / likely absent as a bespoke layout**, with the app instead relying on system-level multitasking.
- **Apple Watch**: **no official OpenAI watchOS app exists**. Access on Apple Watch is only via third-party apps (Petey/formerly WatchGPT, Wrist AI, WristWhiz — all unofficial, several paid) or via Apple Shortcuts bridging to the iPhone app. This is a clear, confirmed gap versus any competitor that does ship a native watch app. Sources: [Computerworld](https://www.computerworld.com/article/1620123/chatgpt-on-apple-watch-theres-an-app-for-that.html), [Petey official site](https://petey.app/).
- **Wear OS**: no evidence of any ChatGPT presence, official or unofficial, found in this session — **UNVERIFIED / likely none**.

---

## 15. Top complaints and hard-to-discover issues (App Store reviews, Developer Community, press)

| Theme                                                                                                                                                                                  | Evidence                                                | Date                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| Sidebar/nav redesign broke muscle memory — pinned chats "disappearing," GPTs buried behind More menu, Projects dashboard access unclear                                                | User quotes, "worst rollout" comment                    | June 2026                              |
| Company itself calls current app navigation "kind of a mess"                                                                                                                           | Greg Brockman (via press)                               | July 2026                              |
| GPT-Live shipped without camera/screen-share that legacy Advanced Voice Mode had                                                                                                       | 3 independent write-ups                                 | July 2026, still true at research date |
| Live camera/screen-share unresponsive on Android in (legacy) Advanced Voice Mode across many device models                                                                             | 14+ user reports, OpenAI Developer Community            | Aug 2025, recurrence reported Feb 2026 |
| "Less value now" — slower responses, features behave as an "interactive game/activity" instead of giving direct answers, occasional crashes                                            | App Store review (Nai Rot)                              | Nov 6, 2025                            |
| Free-tier usage caps hit fast ("five messages... limit is up for today")                                                                                                               | App Store review (squishy)                              | ~Feb 2026                              |
| Accuracy complaints ("gives out false information about crucial events")                                                                                                               | App Store review (Brie Corey)                           | ~Feb 2026                              |
| No native "image ready" push notification — long-generation jobs give no completion alert                                                                                              | OpenAI Developer Community feature request (unresolved) | ongoing into 2026                      |
| No documented deep-link / URL-scheme contract to open a specific chat with a prefilled prompt from another app                                                                         | OpenAI Developer Community feature request (unresolved) | ongoing into 2026                      |
| Rating split between App Store (4.8★/9.4M) and Trustpilot-style complaint aggregators (much lower, largely driven by billing/support/quality complaints rather than app-specific bugs) | Cross-referenced review platforms                       | Aug 2026                               |
| No in-app bug-reporting mechanism cited as "a serious omission" by at least one reviewer/press piece                                                                                   | Secondary press characterization                        | 2026                                   |

Sources for this table: [App Store reviews](https://apps.apple.com/us/app/chatgpt/id6448311069), [OpenAI Developer Community — image notification request](https://community.openai.com/t/suggestion-notifications-when-image-generation/1222976), [OpenAI Developer Community — deep link request](https://community.openai.com/t/support-custom-url-schemes-or-intent-handlers-to-trigger-specific-behaviors-in-the-chatgpt-mobile-app/1255168), [OpenAI Developer Community — camera/screen-share bug](https://community.openai.com/t/live-camera-screen-share-in-advanced-voice-mode-camera-icon-appears-but-feed-unresponsive-android-chatgpt-5/1340204), [popularai.org sidebar complaint](https://www.popularai.org/p/chatgpt-sidebar-pinned-chats-gpts-projects-missing). Direct Reddit threads could not be fetched this session (tool access to reddit.com was blocked); complaint evidence above leans on App Store reviews and the OpenAI Developer Community instead, which is a real gap in this research pass — Reddit sentiment specifically should be spot-checked manually.

---

## 16. What's genuinely new in the last ~6 months (Feb–Aug 2026), summarized

- **GPT-Live** replaces Advanced Voice Mode as default (Jul 8) — full-duplex, interruptible, backchanneling, but **launched without camera/screen-share** (still true at research date).
- **ChatGPT Work** replaces the old standalone "agent mode" (Jul 9) — mobile can drive it but can't do local files/Computer Use from mobile.
- **Codex** became controllable from the ChatGPT mobile app as a remote thin-client (mid-May).
- **Health in ChatGPT** expanded from limited beta to broader US rollout, iOS + web only, no Android (Jul 23).
- **Scheduled Tasks** got a dedicated page/hub on web and mobile (Jun 17).
- Mobile **sidebar collapsed into a horizontal bar** (Images/Codex/Pulse/Apps) — company-acknowledged as messy, "tab-free" redesign promised but not shipped.
- **Project sharing** opened to all plans, **Voice gained file upload + Projects awareness**.
- **Sora** standalone app/site killed (Apr 26); whether video generation survives inside the ChatGPT app itself is **unresolved/unverified** from available sources.
- Android composer/dictation got several smoothing fixes (retry-on-failure, persistent dictation button, live suggestion updates).
- Interactive **quizzes** feature added across consumer + Edu plans, web and mobile.

## What recently regressed

- Live camera vision + screen sharing during voice conversations (present in legacy Advanced Voice Mode, **absent** in GPT-Live at launch and still absent as far as any source confirms).
- Sidebar/Projects/GPTs discoverability on mobile (more taps, hidden behind menus, since the June 3 redesign).
- (Historically recurring pattern, not new) camera feed reliability bugs in voice mode on a chunk of Android devices.

## What's hard to discover

- The real changelog — App Store/Play Store "What's New" text is uninformative ("bug fixes and small improvements"); actual feature history has to be pieced together from OpenAI's help-center release notes (largely unreachable to automated tools) and press.
- Any native deep-link/URL-scheme contract for launching into a specific chat/prompt from another app — does not appear to exist; only Shortcuts-mediated workarounds do.
- Whether the Android "default assistant" role has gained deeper OS integration (hotword, system settings, calendar) since its March 2025 beta — no update found either way.
- Whether Sora-derived video generation actually shipped inside the ChatGPT app after the standalone product's shutdown.

---

## Sources

Official / primary-adjacent (OpenAI):

- App Store listing — https://apps.apple.com/us/app/chatgpt/id6448311069 (version, size, rating, IAPs, reviews)
- Play Store listing (search-summarized; direct fetch truncated) — https://play.google.com/store/apps/details?id=com.openai.chatgpt
- OpenAI Developer Community — camera/screen-share bug — https://community.openai.com/t/live-camera-screen-share-in-advanced-voice-mode-camera-icon-appears-but-feed-unresponsive-android-chatgpt-5/1340204
- OpenAI Developer Community — image-ready notification request — https://community.openai.com/t/suggestion-notifications-when-image-generation/1222976
- OpenAI Developer Community — deep link / URL scheme request — https://community.openai.com/t/support-custom-url-schemes-or-intent-handlers-to-trigger-specific-behaviors-in-the-chatgpt-mobile-app/1255168
- OpenAI use-case doc (existence confirmed, not fully fetched) — https://learn.chatgpt.com/use-cases/ios-app-intents
- Note: help.openai.com and openai.com/index/\* pages returned HTTP 403 to automated fetch throughout this session; all claims normally sourced there are instead cited to press/secondary paraphrase and flagged accordingly above.

Store mirrors / aggregators:

- APKPure ChatGPT listing — https://apkpure.com/chatgpt/com.openai.chatgpt (Android version 1.2026.223, Aug 14 2026)
- APKMirror version index — https://www.apkmirror.com/apk/openai/chatgpt/chatgpt-1-2026-223-release/
- Releasebot OpenAI/ChatGPT changelog aggregation — https://releasebot.io/updates/openai/chatgpt

Press / analysis:

- Content Grip — https://www.contentgrip.com/chatgpt-apple-top-app/ (2025 App Store download #1)
- TechCrunch — GPT-Live launch — https://techcrunch.com/2026/07/08/openai-releases-new-voice-models-for-more-natural-live-conversations/
- ExplainX — GPT-Live explainer — https://www.explainx.ai/blog/gpt-live-openai-chatgpt-voice-july-2026
- TechJournal — GPT-Live explainer (camera/screen-share gap) — https://techjournal.org/what-is-gpt-live-chatgpt-voice
- TheAICareerLab — GPT-Live explainer — https://theaicareerlab.com/blog/chatgpt-gpt-live-voice-mode-2026
- reconn-ai — GPT-Live-1 explainer — https://reconn-ai.com/news/chatgpt-voice-gpt-live-1-ai-visibility/
- AndroidHeadlines — GPT-Live architecture (search snippet only, page 403'd) — https://www.androidheadlines.com/2026/08/openai-gpt-live-voice-architecture-rebuild.html
- AndroidHeadlines — nav gesture / redesign backlash (search snippet only, pages 403'd) — https://www.androidheadlines.com/2026/06/chatgpt-hidden-gesture-navigation-table-of-contents.html and https://www.androidheadlines.com/2026/07/openai-plans-major-chatgpt-desktop-app-redesign-following-user-backlash-its-kind-of-a-mess.html
- popularai.org — sidebar redesign complaints — https://www.popularai.org/p/chatgpt-sidebar-pinned-chats-gpts-projects-missing
- Axios — original video/screen-share launch (Dec 2024, background context) — https://www.axios.com/2024/12/12/chatgpt-video-screen-sharing-voice-chat
- TechRadar — video/screen-share feature detail — https://www.techradar.com/computing/artificial-intelligence/chatgpt-adds-eyes-to-its-voice-with-new-screen-and-video-sharing-feature
- TechRadar — voice-mode transition backlash — https://www.techradar.com/computing/artificial-intelligence/chatgpt-fans-are-furious-as-openai-delays-rollout-of-next-gen-voice-mode
- 9to5Google — Android default assistant beta — https://9to5google.com/2025/03/14/chatgpt-default-assistant-android/
- AllThings.How — default assistant how-to / limitations — https://allthings.how/how-to-replace-gemini-or-google-assistant-with-chatgpt-on-android/
- MacStories — Siri/ChatGPT iOS 18.2 deep dive — https://www.macstories.net/stories/apple-intelligence-and-chatgpt-in-18-2/
- MacRumors — iOS 18.2 ChatGPT/Siri guide — https://www.macrumors.com/guide/ios-18-2-iphone-chatgpt-integration/
- ia.acs.org.au — Apple/Gemini Siri 2026 upgrade — https://ia.acs.org.au/article/2026/apple-reveals-the-ai-behind-siri-s-big-2026-upgrade.html
- TechCrunch — Apple's own ChatGPT-style Siri app — https://techcrunch.com/2026/05/28/sneak-peek-at-new-siri-app-reveals-apples-plans-to-take-on-chatgpt-and-more/
- Medium (Sam Parmar) — Shortcuts/Siri automation — https://parmsam.medium.com/use-of-chatgpt-on-ios-with-apple-shortcuts-and-siri-600c2dd3c104
- Agentic Workers — Siri setup guide — https://www.agenticworkers.com/blog/easily-set-up-chatgpt-with-siri-for-seamless-ai-assistance-6nK7fz
- GitHub — Share-to-ChatGPT-Shortcut — https://github.com/reorx/Share-to-ChatGPT-Shortcut
- AppleVis forum — share sheet shortcut — https://www.applevis.com/forum/ios-ipados/shortcut-action-automatically-share-chatgpt-share-sheet
- Andrew Ford — iOS ChatGPT shortcut / drag-and-drop — https://andrewford.co.nz/articles/chatgpt-shortcut-on-ios/
- Mytour / 360-reader — Lock Screen widget how-tos — https://mytour.vn/en/blog/bai-viet/learn-how-to-effortlessly-add-the-chatgpt-widget-to-your-iphone-lock-screen-for-usage-and-quick-searches.html, https://360-reader.com/how-to-add-chatgpt-widget-to-iphone-lock-screen/
- ITBrief — Scheduled Tasks hub — https://itbrief.com.au/story/openai-expands-chatgpt-scheduled-tasks-with-new-hub
- Windows Forum — Scheduled Tasks redesign — https://windowsforum.com/threads/chatgpt-scheduled-tasks-gets-a-dedicated-page-web-mobile-for-reliable-reminders.427609/
- AndroidAuthority — Scheduled Tasks catch/limits — https://www.androidauthority.com/schedule-tasks-on-chatgpt-3678802/
- AndroidAuthority — Sora strings in ChatGPT Android APK — https://www.androidauthority.com/chatgpt-sora-3650424/
- invideo.io — Sora shutdown timeline — https://invideo.io/blog/sora-ai-video-generator/
- kaopiz.com — Sora shutdown guide — https://kaopiz.com/en/articles/sora-shutdown-guide/
- alternativeto.net — Sora shutdown news — https://alternativeto.net/news/2026/3/openai-is-shutting-down-sora-its-ai-video-slop-app-less-than-six-months-after-launch
- MacRumors — Health in ChatGPT relaunch — https://www.macrumors.com/2026/07/23/chatgpt-apple-health-integration/
- 9to5Mac — Health in ChatGPT relaunch — https://9to5mac.com/2026/07/23/openai-relaunches-apple-health-connected-chatgpt-feature-with-expanded-access/
- MacRumors — Health in ChatGPT initial Jan 2026 launch — https://www.macrumors.com/2026/01/07/openai-chatgpt-health-apple-health-integration/
- Computerworld — no official Apple Watch app — https://www.computerworld.com/article/1620123/chatgpt-on-apple-watch-theres-an-app-for-that.html
- Petey (third-party Watch app) — https://petey.app/
- Fritz.ai — offline behavior — https://fritz.ai/can-you-use-chatgpt-offline/
- ai-toolbox.co — offline behavior 2026 guide — https://www.ai-toolbox.co/chatgpt-management-and-productivity/can-you-use-chatgpt-offline-complete-guide-2026
- gptprompts.ai — mobile file-upload troubleshooting — https://gptprompts.ai/ai-errors-and-fixes/chatgpt-file-upload-not-working
- Engadget — Codex mobile launch — https://www.engadget.com/2173235/openai-brings-its-codex-coding-app-to-mobile/
- Dataconomy — Codex mobile launch — https://dataconomy.com/2026/05/15/codex-now-works-through-chatgpt-on-iphone-and-android/
- Third-party technical deep dive — Codex mobile relay architecture (unofficial, detailed) — https://codex.danielvaughan.com/2026/05/15/codex-mobile-chatgpt-app-relay-architecture-remote-agent-control/
- AIToolsReview — "ChatGPT Work, Explained" — https://aitoolsreview.co.uk/insights/chatgpt-work
- Yahoo Tech — ChatGPT Pulse launch coverage — https://tech.yahoo.com/ai/chatgpt/articles/openai-launches-chatgpt-pulse-deliver-092118051.html
- maestra.ai — voice translation capability clarification — https://maestra.ai/blogs/can-chatgpt-translate-in-real-time

Not independently reachable this session (403 or blocked): help.openai.com/_ (release notes, Android FAQ, Advanced Voice Mode FAQ, ChatGPT agent article, Sora discontinuation article), openai.com/index/introducing-gpt-live/, reddit.com/_ (all variants), several androidheadlines.com and windowsforum.com pages (relied on search-engine snippets instead of full text where noted above).
