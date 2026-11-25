---
id: "COMP-voice"
type: "competitor-trace"
title: "Voice"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Voice: competitors to requirements

Both leaders document live spoken conversation, dictation, voice and language settings, and voice privacy. ChatGPT goes further on voice (files, plugins, background, CarPlay, translation, voice-driven work, plan hours). Claude adds a coding-tool dictation set. AGI has live voice, dictation and read aloud on web, desktop, mobile and Chrome, but live voice is cloud-only and tied to one managed provider. Gaps: VS Code, push-to-talk on web, screen share, background voice, admin switches, translation, meetings.

**How the products divide this topic.** Review date for all competitor evidence: 2026-11-22 (catalog ids cited as ch/cc/cl/oh numbers). Claude (support.claude.com) documents voice mode (beta, all plans; web, Desktop, iOS, Android), mobile dictation, Quick Entry dictation on Mac, and meetings. Claude Code (code.claude.com) is a separate tool: /voice push-to-talk dictation in the CLI, a mic button in the VS Code extension, claude.ai sign-in required (no API key, Bedrock, Vertex or gateway), not in cloud, SSH or VS Code Remote sessions; the chat product's own page says Cowork and Claude Code get dictation only, not voice conversation (ch01:124). ChatGPT (help.openai.com) documents the live voice experience, dictation and Record. Codex (learn.chatgpt.com) is the separate coding tool; its voice pages (voice chat hotkey, voice that starts and checks tasks, appshot screen context, Micro Mic key) sit inside the ChatGPT desktop app's Chat, Work and Codex, so they are marked ChatGPT and Codex. Plan limits matter: ChatGPT voice has rolling 24 hour limits by plan (oh05:52) and older voice modes retire on Dec 11, 2026; Claude voice counts toward normal plan limits (ch01:121); Claude Code dictation needs Pro, Max, Ultra or Team/Enterprise via claude.ai and does not use tokens (cc21:158). The catalogue shows no Claude read-aloud feature and no Claude voice limits table, so those are unknown, not absent. The comparison CSVs sometimes say Claude has a feature the catalogue does not show; this page follows the catalogue. AGI status comes from code reading (comparison README, snapshot 2026-11-22), and the ledger briefs (areas 48-50) are sometimes older than the comparison rows; conflicts are named per capability. Nothing is seen working by a person except the web voice basics W-10 (scorecard and defect file).

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-voice-01](#cap-voice-01) | Live voice conversation | yes | yes | partly built | seen working by a person |
| [CAP-voice-02](#cap-voice-02) | Voice and text in one thread | yes | yes | built | seen working by a person |
| [CAP-voice-03](#cap-voice-03) | Hands-free and push-to-talk modes | yes | partly | partly built | code inspected only |
| [CAP-voice-04](#cap-voice-04) | Interrupt the assistant while it speaks | yes | yes | built | not verified |
| [CAP-voice-05](#cap-voice-05) | Voice choice with preview | yes | yes | partly built | code inspected only |
| [CAP-voice-06](#cap-voice-06) | Voice speed and pace | yes | partly | built | code inspected only |
| [CAP-voice-07](#cap-voice-07) | Voice and spoken language setting | yes | yes | partly built | code inspected only |
| [CAP-voice-08](#cap-voice-08) | Live captions and call transcript | yes | yes | built | code inspected only |
| [CAP-voice-09](#cap-voice-09) | Tools, search and connectors inside voice, with on-screen approval | yes | yes | built | code inspected only |
| [CAP-voice-10](#cap-voice-10) | Files, images and Projects in voice | unknown | yes | partly built | code inspected only |
| [CAP-voice-11](#cap-voice-11) | Model and thinking-depth choice inside voice | yes | yes | partly built | code inspected only |
| [CAP-voice-12](#cap-voice-12) | Voice usage limits and metering | partly | yes | partly built | seen failing by a person |
| [CAP-voice-13](#cap-voice-13) | Voice that starts and steers tasks | no | yes | partly built | code inspected only |
| [CAP-voice-14](#cap-voice-14) | Screen, camera and video sharing in voice | unknown | partly | not built | not verified |
| [CAP-voice-15](#cap-voice-15) | Background voice, lock screen and car entry | unknown | yes | partly built | code inspected only |
| [CAP-voice-16](#cap-voice-16) | Voice reliability and error states | unknown | partly | partly built | seen failing by a person |
| [CAP-voice-17](#cap-voice-17) | Composer dictation into editable text | yes | yes | partly built | seen failing by a person |
| [CAP-voice-18](#cap-voice-18) | Live dictation (text appears while speaking) | partly | yes | partly built | code inspected only |
| [CAP-voice-19](#cap-voice-19) | Dictation languages | yes | partly | built | code inspected only |
| [CAP-voice-20](#cap-voice-20) | Dictation controls in the CLI and coding tools | yes | partly | partly built | code inspected only |
| [CAP-voice-21](#cap-voice-21) | Dictation cleanup and custom dictionary | unknown | yes | not built | not verified |
| [CAP-voice-22](#cap-voice-22) | System-wide dictation into any app | yes | unknown | partly built | not verified |
| [CAP-voice-23](#cap-voice-23) | Read a reply aloud | unknown | partly | partly built | seen failing by a person |
| [CAP-voice-24](#cap-voice-24) | Voice recording privacy and training consent | yes | yes | partly built | code inspected only |
| [CAP-voice-25](#cap-voice-25) | Admin controls for voice and dictation | partly | yes | not built | not verified |
| [CAP-voice-26](#cap-voice-26) | Live translation in voice | unknown | yes | not built | not verified |
| [CAP-voice-27](#cap-voice-27) | Meeting and voice-note recording with notes | partly | yes | not built | not verified |
| [CAP-voice-28](#cap-voice-28) | Audio file upload and transcription | unknown | yes | partly built | not verified |
| [CAP-voice-29](#cap-voice-29) | Pronunciation help | unknown | yes | not built | not verified |
| [CAP-voice-30](#cap-voice-30) | Microphone and speaker choice | partly | unknown | partly built | code inspected only |

## CAP-voice-01 Live voice conversation

A two-way spoken conversation with the assistant, started from a chat or as a new chat, with spoken replies and a transcript.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): ch01:113 Full two-way spoken conversation; voice and text switchable in one chat; best on phones (beta). ch01:114 sound wave icon on web and Desktop; ch01:115 on mobile. Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): oh05:50 Default live voice listens and speaks at the same time; can search, use memory, widgets, text and images in the same chat. oh05:51 older voice modes switch to the new one on Dec 11, 2026. Plans: Free (limited), Go, Plus, Pro, Business, Enterprise, Edu. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity; docs/product/competitive-guidance.md section 5.16 items 121-124). Voice conversation must exist on Web, Desktop and Mobile, start from an existing or new chat, and show the spoken turns in the chat. It must work with any model the user has chosen for the chat, with voice transport kept separate from the reasoning model.

**With different models, providers and the one subscription.** Today the live session uses the managed voice_live slot and refuses any unmanaged provider (apps/web/app/api/voice/live/sessions/route.ts:193-195), so BYOK users cannot use live voice. Minutes must be metered by the one AGI Subscription. In Local mode live voice is not available; the app must say so and fall back to turn-based voice (apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:17-26).

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile: built (Cloud only). CLI: /voice is push-to-talk dictation, no spoken reply. VS Code, Chrome: absent. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.01, S48.02, S48.03, S48.04
- Comparison list ids: none matched; rows without an id: web: Voice conversation mode (no list_id); mobile: Voice conversation mode (no list_id)
- Code: `apps/web/features/chat/lib/live-voice-session.ts:41`; `apps/web/app/api/voice/live/sessions/route.ts:193`; `apps/mobile/app/(app)/(tabs)/chat.tsx:998`; `apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:17`

**Gap.** Live voice is cloud-only with one managed provider; no BYOK or Local path; VS Code absent (the product matrix says a VS Code webview has no microphone); Chrome has dictation but no conversation. The ledger says CLI done for S48.01-03; the comparison row describes only dictation, so the CLI claim is unconfirmed.

**Acceptance criteria**

1. On web, press the voice button in a new and in an existing chat; a session starts, the orb shows Listening, and spoken turns appear in the chat.
2. On mobile in Local mode, start voice; the app states live voice needs AGI Cloud and offers turn-based voice.
3. As a BYOK-only user, start voice; the app either works or explains which provider is needed, with no silent failure.
4. After ending the call, the transcript stays in the chat and the usage page shows the minutes used.

**Verification: seen working by a person.** Web basic W-10 (scorecards/web.csv): start, Listening, mute, unmute, end and a typed turn inside voice worked for Free and Ultra accounts. The spoken path could not be tested because the test microphone gave silence, so spoken turns are not seen working.

## CAP-voice-02 Voice and text in one thread

Spoken turns land in the same message list as typed turns, the user can type during or after a call, and unfinished work continues in text.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): ch01:113 Voice and text switch inside one chat with context carried over. Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): oh08:322 Spoken answers with streamed text, images and widgets in the same thread; type back; a Separate mode setting restores the old screen. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): oh05:55 During a call the add button attaches images and the user can type. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). A voice conversation is a normal chat: transcript kept, text continuation allowed, resume a past voice chat by voice.

**With different models, providers and the one subscription.** The thread must stay on the model the user chose; ending voice must not change the chat's provider or mode. Local chats stay Local.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, Desktop, Mobile built; typing inside the voice screen on web works (seen). Web has no separate-screen setting. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.03, S48.22, S48.38, S48.39
- Comparison list ids: WP350; rows without an id: web: Voice written transcript added to chat after the call; mobile: Voice shown inside the chat thread with text, images and widgets
- Code: `apps/web/features/chat/stores/voice-session-store.ts`; `apps/mobile/src/features/voice/components/VoiceInlineBar.tsx`; `apps/web/features/chat/components/Voice/VoiceChatDock.tsx:24-25`

**Gap.** No setting for a separate voice screen on web (WP350). The ledger marks 'type while speaking' not applicable, while the comparison and the browser run show typing in voice works; the ledger row is out of date.

**Acceptance criteria**

1. Say a question, end the call; the question and answer are in the chat after reload.
2. During a call, type a message; it is answered and kept.
3. Open a past voice chat and start voice; the earlier turns are used as context.

**Verification: seen working by a person.** W-10 scorecard: a typed turn in voice mode answered and was kept after reload (Free and Ultra).

## CAP-voice-03 Hands-free and push-to-talk modes

Choose between continuous listening and holding a button to talk (useful in noisy places).

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): ch01:116 Hands-free is the default: listens, answers at pauses, stops when you speak. ch01:117 Push-to-talk: hold a button while speaking. Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT and Codex: partly**
  - [https://learn.chatgpt.com/docs/features/codex-micro.md](https://learn.chatgpt.com/docs/features/codex-micro.md): cl05:149 Micro Mic key: hold to talk, double press for hands-free, or start Voice Chat (limited status). The chat voice pages show continuous voice with interruption but no push-to-talk setting. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity (Claude); docs/product/competitive-guidance.md item 121). Offer hands-free and push-to-talk on every app that has live voice, with the mode saved as a setting.

**With different models, providers and the one subscription.** The mode is an input choice and must not depend on the model. Push-to-talk also reduces billed minutes; it must be metered the same way.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile: both modes. Web and Desktop: hands-free only. CLI: hold Space, no tap mode. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.12, S48.13
- Comparison list ids: CP370, WP349; rows without an id: mobile: Hands free or push to talk
- Code: `apps/mobile/src/features/settings/voice/index.tsx:473`; `apps/mobile/src/features/voice/hooks/useVoiceConversation.ts:249`; `apps/cli/src/voice.rs:37`

**Gap.** No push-to-talk on web or desktop live voice; CLI has no tap mode or saved voice setting.

**Acceptance criteria**

1. On web, a Mode setting offers hands-free and push-to-talk; in push-to-talk nothing is sent until the button is released.
2. On mobile, switch the mode and start a call; it behaves as chosen.

**Verification: code inspected only.** Comparison rows WP349 and mobile 'Hands free or push to talk'; no person ran it.

## CAP-voice-04 Interrupt the assistant while it speaks

Talking over the spoken reply stops it so the user can redirect.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): ch01:116 Claude stops when you speak again. Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): oh05:50 Full-duplex voice so users can interrupt. Desktop voice for tasks: cl05:160 interrupt, follow up or change direction. Apps: web, ios, android, desktop.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W13 (interruption has a recoverable state); docs/product/competitive-guidance.md item 122). The user can interrupt a spoken reply, and can stop the speech without cancelling the task.

**With different models, providers and the one subscription.** Interruption lives in the voice transport, not the model, so it must work for whichever model answers. Unspoken audio must not be billed.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, Desktop, Mobile: built in code, never run on a device (ledger marks unverified). Separate stop-speech and cancel-task controls exist. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.14, S48.41
- Comparison list ids: none matched; rows without an id: mobile: Interrupt the assistant by speaking while it talks; desktop: Voice shows live captions and lets you interrupt while it speaks
- Code: `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:343-364`; `apps/web/features/chat/lib/live-voice-session.ts:723`; `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:294`

**Gap.** Not verified by a person; interruption delay never measured (W13 asks for it).

**Acceptance criteria**

1. While the assistant speaks, say something; speech stops within about a second and the new turn is taken.
2. Press Stop speaking; the speech stops and a running task keeps going.

**Verification: not verified.** W-10 spoken path could not be tested (silent fake microphone).

## CAP-voice-05 Voice choice with preview

Pick the assistant's voice from a fixed set and hear a sample first.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): ch01:118 Preset voices with previews; change in Settings > Capabilities > Voice (web) or the in-call settings button (mobile). ch01:123 only preset voices, to stop cloning. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): oh05:57 Settings > Voice offers nine voices plus extra voices for several languages; switching starts a new call. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). Users choose from a fixed set of voices with a preview; no voice cloning.

**With different models, providers and the one subscription.** The voice list must come from the voice slot of the active provider, not a hardcoded list per app, and must change when the provider changes. In Local mode the list is the device's own voices.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile: picker built. Preview: ledger says the sample files are not generated, so Play sample is hidden; comparison says a sample button exists. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.15, S48.16
- Comparison list ids: none matched; rows without an id: web: Voice sample preview and audio output picker; mobile: Choose the assistant's voice
- Code: `apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx:266`; `apps/web/public/voice-samples/manifest.json:2`; `apps/mobile/src/features/voice/components/VoicePickerSheet.tsx:139`

**Gap.** Sample manifest is empty until the owner runs scripts/generate-voice-samples.mjs and commits the files (ledger S48.16).

**Acceptance criteria**

1. Open voice settings, pick another voice; the next call speaks with it.
2. Press Play sample on a voice; a short sample plays.

**Verification: code inspected only.** Ledger S48.16 and web manifest; no run.

## CAP-voice-06 Voice speed and pace

Control how fast the assistant speaks.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): ch01:118 Voice and pace are changed in voice settings. Apps: web, desktop, ios, android.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): oh05:59 Tone and pace can be asked for aloud, but there is no precise playback speed control. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity (Claude)). A speed control for spoken replies and read aloud.

**With different models, providers and the one subscription.** Speed is applied by the speech engine, so it must work for the cloud voice and the device voice alike.

**Current implementation, as this trace read it on 2026-11-24: built.** Web (read aloud and conversation speed), Mobile (0.5x to 2x plus pitch), Chrome (read-aloud speed). CLI and VS Code: none. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S50.03
- Comparison list ids: WP253; rows without an id: mobile: How fast the voice speaks; chrome: Read-aloud voice and speed settings
- Code: `apps/mobile/src/features/settings/voice/index.tsx:441`; `apps/web/features/settings/sections/GeneralSection.tsx:1266`; `apps/extension/src/features/options/read-aloud-row.ts:50`

**Gap.** None known for apps with voice; WP253 notes no style choice on web.

**Acceptance criteria**

1. Set speed to the lowest and highest values; a read-aloud reply is audibly slower or faster.
2. Setting persists after restart.

**Verification: code inspected only.** Comparison rows; no run.

## CAP-voice-07 Voice and spoken language setting

A spoken-language setting for voice, separate from the display language, applied to recognition and speech.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10769299-how-to-use-claude-in-your-preferred-language](https://support.claude.com/en/articles/10769299-how-to-use-claude-in-your-preferred-language): ch01:94 Spoken language set at Settings > Capabilities > Voice, independent of display language. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): oh05:58 Settings > Voice > Language fixes the spoken language when detection is wrong; can also ask to switch mid-conversation. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md (General settings must include voice and voice speed); competitor parity for the language picker). A voice language setting that applies to dictation, live voice and spoken replies, with an automatic option.

**With different models, providers and the one subscription.** The language list must be the intersection of what the active speech provider supports; show only supported ones. Device recognition in Local mode may support fewer languages and must say so.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web 17 languages, Mobile all app languages plus Automatic, CLI 20, Chrome browser languages. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.17, S49.03
- Comparison list ids: CP51, WP118; rows without an id: mobile: Language used in voice mode
- Code: `apps/web/features/settings/sections/VoiceSection.tsx:50,94`; `apps/mobile/src/features/voice/services/speechSettings.ts:18`; `apps/cli/src/voice_languages.rs:8`

**Gap.** Web lists 17 languages (WP118); CLI lacks Greek, Indonesian and Ukrainian (CP51); no voices tied to a language (MP113).

**Acceptance criteria**

1. Set Spanish in voice settings; dictation and a live call recognise Spanish.
2. Choose Automatic; recognition follows the device language.
3. Choose a language the device has no model for in Local mode; the app says it is unavailable.

**Verification: code inspected only.** Comparison rows; no run.

## CAP-voice-08 Live captions and call transcript

Text of the conversation shown while it is spoken, and kept afterwards.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): ch01:122 Audio is discarded after transcription; the transcript stays in chat history. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): oh05:65 Live responses appear as text while spoken; a transcript is added after the call and may not be word for word. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 124 (captions); item 126 (transcript integrity)). Captions can be shown or hidden during voice, and the transcript is saved to the chat.

**With different models, providers and the one subscription.** Captions come from the transport, so they must work with any answering model.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, Desktop, Mobile, CLI built. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.21, S48.22
- Comparison list ids: none matched; rows without an id: web: Voice captions; mobile: Live text of the conversation
- Code: `apps/web/features/chat/components/Voice/VoiceCaptions.tsx:26`; `apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:313,440`

**Gap.** None known.

**Acceptance criteria**

1. Toggle captions during a call; lines appear and hide.
2. After the call the same lines are in the chat.

**Verification: code inspected only.** Comparison rows; spoken path not run by a person.

## CAP-voice-09 Tools, search and connectors inside voice, with on-screen approval

The voice assistant can search the web and use connected apps, and asks for approval on screen.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): ch01:120 Voice can use web search and connectors like Gmail, Calendar, Docs and Slack; Free can connect one tool, paid more; some results cannot be shown on screen. Plans: Free (one tool), paid more. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): oh05:53 Plugins and connected apps under existing permissions; actions needing approval prompt on screen; spoken approval is not supported. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md items 125 and 128, and section on voice backend separation (a voice provider change must not replace the permission model)). Voice may use tools and connectors under the same permissions as text, and approval is always on screen.

**With different models, providers and the one subscription.** Tool permissions belong to the AGI harness, not the voice provider. In Local mode only local tools run; tools that call outside services must show the boundary.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, Desktop, Mobile built; CLI approval built. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.26, S48.27, S48.28
- Comparison list ids: none matched; rows without an id: web: Tools used in voice with approval on screen; mobile: Web search and connected apps in voice
- Code: `apps/web/lib/voice/live-voice-tools.ts:90,241`; `apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:517`

**Gap.** Mobile cannot open a generated document from voice (S48.28).

**Acceptance criteria**

1. Ask by voice for something that needs a connector; an Allow and Deny card appears on screen and the action waits.
2. Deny it; nothing runs and the assistant says so.
3. Spoken 'yes' does not approve.

**Verification: code inspected only.** Comparison rows; not run.

## CAP-voice-10 Files, images and Projects in voice

Add files or images during a call and use voice inside a Project with its instructions and sources.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): oh05:55 Add button attaches images during a call. oh01:201 (help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes) upload files and use voice in Projects with recent chats, sources and instructions. Plans: Enterprise, Edu, Healthcare noted for the release note. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/decisions/2026-11-13-founder-decisions.md (adding a photo or file during a voice conversation is built); competitive-guidance.md item 125). Files, images and a Project's context can be used in a voice conversation.

**With different models, providers and the one subscription.** Not every voice backend accepts images; the app must check what the active provider accepts and say when it cannot, rather than dropping the file.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and Desktop built. Mobile: attachments only on the turn-based bar; live screen has none; no Project context. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.25, S48.29
- Comparison list ids: M229, MP110; rows without an id: web: Files and images during a voice conversation
- Code: `apps/web/features/chat/lib/voice-attachments.ts:9-30`; `apps/web/app/api/voice/live/sessions/lib/live-voice-context.ts:28-44`; `apps/mobile/src/features/voice/components/VoiceInlineBar.tsx:90`

**Gap.** Mobile live screen lacks attachments (MP110) and Projects (M229). Voice replies cannot show images or maps (S48.25). The ledger still lists attach-image as missing on web and desktop, which the code now contradicts.

**Acceptance criteria**

1. On web, attach a PDF during a call and ask about it; the answer uses it.
2. On mobile live voice, an add control exists or the screen says why not.
3. Start voice in a Project; the answer follows its instructions.

**Verification: code inspected only.** Comparison rows; not run.

## CAP-voice-11 Model and thinking-depth choice inside voice

Switch the model or reasoning level that answers during a voice conversation.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): ch01:119 A selector switches model families mid-call; voice starts on the last used family. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): oh01:175 Voice can use a stronger text model for search and reasoning with the same model and effort controls; effort levels and per-minute credit price documented. Plans: Enterprise, Edu. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). Let users choose the answering model or an Instant/Thinking depth for voice, using the same model picker rules as chat.

**With different models, providers and the one subscription.** The choice must come from the catalog slots, show the credit rate per minute, and respect the user's plan. Local mode: only local models offered, and no cloud escalation without consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: Instant or Thinking only, no model selector. Mobile: Answer model row in settings, none in the call. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M230, MP112, MP28, W88; rows without an id: web: Voice answer depth (instant or thinking)
- Code: `apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx:58-63`; `apps/mobile/src/features/settings/voice/index.tsx:410`

**Gap.** No model selector inside voice on web (W88) or in the mobile call (MP28); no reasoning-level choice on mobile (M230).

**Acceptance criteria**

1. Open voice settings; the answering model or depth can be changed and is used on the next turn.
2. The setting shows the credit cost per minute.

**Verification: code inspected only.** Comparison rows.

## CAP-voice-12 Voice usage limits and metering

Voice minutes are limited or counted by plan, shown to the user, and the user is told when they run out.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): ch01:121 Voice consumes the normal plan usage limits (no separate minutes table in the catalogue). Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): oh05:52 Rolling 24 hour limits by plan from limited on Free to hours on paid plans, extra at a per-minute credit price. cl08-pr01:40 (chatgpt.com/pricing) Free has voice, Plus expanded, Pro unlimited under reasonable use. Plans: Free, Go, Plus, Pro, Business, Enterprise, Edu. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 128 and 170 (meter actual voice usage, disclose limits); owner decision that Free usage screens show only Upgrade). Voice use is metered by the one AGI Subscription on every app that has live voice, with a clear notice at the limit. Free usage screens show only Upgrade, not meters.

**With different models, providers and the one subscription.** One quota system across apps, rates read from the catalog, never constants. Local on-device dictation costs nothing and must not use the quota. Mobile v1 is free with no plans, so mobile voice limits are off by decision.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and Desktop: Free 10 voice minutes a month, paid uncapped; per-minute billing in code; limit notice built. Mobile: off by decision. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.37
- Comparison list ids: none matched; rows without an id: web: Voice time limits by plan; desktop: Voice conversations priced per minute; mobile: Voice usage limits by plan
- Code: `packages/contracts/types/src/model-catalog.ts:1256`; `apps/web/lib/voice/live-voice-billing.ts:43-46`; `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:190`

**Gap.** A person saw the Settings > Usage Voice row say 'No voice left until a limit above resets' while limits were not used (defect W-19, Basic and Premium accounts). Per-minute rate was not read from a catalog value in the comparison note.

**Acceptance criteria**

1. A Free account that has used its voice minutes sees a limit notice in voice and is offered Upgrade.
2. The Usage page shows a correct voice row for Basic, Premium and Free.
3. One call reduces the same quota on web and desktop.

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv, W-19 subscribed minor product_defect: wrong 'No voice left' text.

## CAP-voice-13 Voice that starts and steers tasks

Speak to start background tasks, check progress, and change direction, using the same permissions as text.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: no**
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): ch01:124 In Cowork and Claude Code only dictation is available, not voice conversation. Apps: web, desktop, ios, android.
- **ChatGPT and Codex: yes**
  - [https://learn.chatgpt.com/docs/features/voice.md](https://learn.chatgpt.com/docs/features/voice.md): cl05:156,161,162 Voice in the desktop app starts separate tasks, checks existing ones, sends follow-ups and switches between tasks; same permissions as the tasks; cl05:157 works from iOS after pairing. Plans: Plus, Pro, Business, Edu, Enterprise. Apps: desktop, ios.
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): oh05:54 Voice in Work on web and mobile; unfinished tasks continue in text. Plans: Business, Enterprise, Edu, paid. Apps: web, ios, android, desktop.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Decide whether voice starts and steers Work tasks; if built, tasks follow existing approvals and the voice provider never replaces the permission model.

**With different models, providers and the one subscription.** Task runs bill under the one subscription; Local mode cannot start cloud tasks without explicit consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile: voice can start a Work task; cannot check or steer other tasks. Remote coding voice control on web and desktop; not mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.40
- Comparison list ids: DP135, DP136, MP114, WP348
- Code: `apps/web/lib/voice/live-voice-tools.ts:44,241`; `apps/web/features/chat/lib/live-voice-session.ts:741`; `packages/contracts/cloud-contracts/src/live-voice-tools.ts:53`

**Gap.** No voice check or steer of existing tasks; not in Code (DP135).

**Acceptance criteria**

1. Ask by voice to start a task; it appears in Tasks and follows approvals.
2. Ask for progress on a running task by voice and hear a status (only if the owner chooses to match).

**Verification: code inspected only.** Comparison rows.

## CAP-voice-14 Screen, camera and video sharing in voice

Share the camera or screen with the assistant during a voice call.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT and Codex: partly**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): oh05:56 Camera and screen share exist on mobile only in the older voice mode, marked deprecated; oh05:50 the new live voice has no video or screen sharing. Plans: Eligible subscribers. Apps: ios, android.
  - [https://learn.chatgpt.com/docs/features/voice.md](https://learn.chatgpt.com/docs/features/voice.md): cl05:163 On macOS, Screen context lets voice capture the front window on request; needs Screen Recording and Accessibility permission; admins can disable. Apps: desktop.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Not decided. If built, sharing is opt-in per call with a visible indicator and a stop control.

**With different models, providers and the one subscription.** Needs a provider that accepts video or images; state which provider receives the frames. Local mode must not send frames to the cloud.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on web, desktop and mobile (ledger S48.31-33 missing; camera sharing n/a). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.30, S48.31, S48.32, S48.33
- Comparison list ids: D161, D162, M219, W470
- Code: `searched: getDisplayMedia in apps/web/features/chat (feedback dialog only)` (not found)

**Gap.** No screen or camera in voice; no desktop screen context.

**Acceptance criteria**

1. If the owner chooses it: starting a share shows a clear indicator, and ending the call stops the share.

**Verification: not verified.** Absence from code search only.

## CAP-voice-15 Background voice, lock screen and car entry

Voice keeps running when the app is not on screen, shows on the lock screen, and can start from the car or phone assistant.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): oh05:61 Voice continues while other apps are open or the phone is locked, controlled in Settings > Voice; oh05:60 CarPlay start; oh05:62 Start with Voice setting. Apps: ios, android.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): oh08:180 Live Activities on Lock Screen and Dynamic Island; oh08:208 idle check ends inactive background sessions. Apps: ios, android.

**AGI requirement** (inferred; source: competitor parity; docs/product/competitive-guidance.md item 127). Decide whether voice may run in the background. If built: a user setting, a visible recording indicator, an idle check, and lock-screen controls.

**With different models, providers and the one subscription.** Background recording raises a consent question under the trust boundaries; metering must stop when the idle check ends the call.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile: Start with Voice built; Siri phrases partial; no background voice, CarPlay or Live Activity. Voice stops when the app leaves the screen. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.34, S48.35
- Comparison list ids: M145, M147, M190, M216, M222, M224, MP74; rows without an id: mobile: Start with Voice switch
- Code: `apps/mobile/src/features/settings/voice/index.tsx:380,399`; `apps/mobile/native/ios/AGIAppIntents/AppShortcuts.swift:27`

**Gap.** No background setting, lock-screen controls, CarPlay, Live Activity or raise-to-ear.

**Acceptance criteria**

1. Leaving the app ends or keeps voice exactly as the setting says, with an indicator.
2. Start with Voice opens a new chat in voice.

**Verification: code inspected only.** Comparison rows.

## CAP-voice-16 Voice reliability and error states

Clear states for microphone denied, no microphone, dropped connection, offline, reload, and only one voice session at a time.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): oh05:66 Only one voice session can run; iOS Voice Isolation tip. oh05:61 session ends on user exit, force close, usage limit or max length. Apps: ios, web, android.
  - [https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps](https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps): oh09:162 Voice uses UDP port 3478 with TCP 443 as fallback. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W13). Permission denied, absent microphone, transcription failure, mute, interruption and exit all have recoverable states; exit releases capture and playback.

**With different models, providers and the one subscription.** Handling is in the app, so it is the same for every provider.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: reconnect, usage notice, open-session prompt built; microphone-denied start shows nothing; offline keeps saying Listening; reload leaves the session open. Mobile: reconnect built. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.36, S48.37
- Comparison list ids: none matched; rows without an id: mobile: End the voice conversation; desktop: Only one voice chat active at a time
- Code: `apps/web/features/chat/hooks/use-voice-session.ts:136`; `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:179`

**Gap.** Four defects seen in browser: no message when the microphone is denied (W-10 free, major); misleading 'conversation unavailable' toast on microphone failure (subscribed, major, unclear); reload leaves a session open on the server (minor); call time does not reset on a new call (minor); offline still says Listening (minor).

**Acceptance criteria**

1. Deny the microphone, press Start voice mode; a message and a recovery step appear (as dictation already does).
2. Reload mid-call; the server session is closed or the app offers to continue it.
3. Go offline mid-call; the status changes from Listening.
4. Start a second call; the timer starts at zero.

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv W-10 rows (free major product_defect; free minor product_defect x2; subscribed minor unclear).

## CAP-voice-17 Composer dictation into editable text

A microphone control that turns speech into text in the message box so the user can edit before sending; separate from live voice.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/10065434-use-dictation-on-claude-mobile](https://support.claude.com/en/articles/10065434-use-dictation-on-claude-mobile): ch01:15 Microphone icon in the chat input turns speech to text, sent as a written prompt; arrow sends and X cancels. Different from voice mode. Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: ios, android.
  - [https://support.claude.com/en/articles/14554000-claude-code-power-user-tips](https://support.claude.com/en/articles/14554000-claude-code-power-user-tips): ch03:203 Claude Code: /voice in the CLI, a microphone button in Desktop, system dictation on iOS and macOS. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli, desktop, ios.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12168547-voice-dictation-faq](https://help.openai.com/en/articles/12168547-voice-dictation-faq): oh02:196 Microphone icon; audio transcribed to editable text before sending; audio kept while the chat exists. cl06:120 (learn.chatgpt.com/docs/prompting.md) Dictate button fills the composer for review. Apps: web, ios, android, desktop.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 22 (keep dictation separate from live conversation; preserve typed text) and item 121). Dictation exists on every app with a composer, keeps typed text and attachments, and is separate from live voice.

**With different models, providers and the one subscription.** Speech to text has its own slot (voice_transcription) so it works whatever chat model is chosen. On mobile it runs on the device for free. In Local mode on desktop and CLI, transcription must run locally or ask before sending audio out.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile, CLI, Chrome built. VS Code absent. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S49.01, S49.02, S49.05, S49.06, S49.07, S49.09
- Comparison list ids: V100; rows without an id: web: Voice dictation into the message box; mobile: Dictate with the microphone button; chrome: Microphone button for voice input
- Code: `apps/web/features/chat/hooks/use-dictation.ts:101`; `apps/web/app/api/voice/transcribe/route.ts:29`; `apps/mobile/src/features/voice/components/VoiceInputButton.tsx:139`; `apps/cli/src/voice.rs:956`; `apps/extension/src/features/side-panel/voice.ts:96`

**Gap.** VS Code has no dictation (V100). Whether web and desktop transcription works in Local mode was not established. A person saw web dictation return text in the wrong language with the test recording; the test instrument may be at fault.

**Acceptance criteria**

1. Press the microphone, speak, stop; text appears in the box, editable, with existing text kept.
2. Cancel discards the recording.
3. After a failure, Try again works without re-recording setup.
4. On mobile with airplane mode on, dictation still works (on-device).

**Verification: seen failing by a person.** W-10 free scorecard: dictation returned unrelated text with the fake recording, unproven whether the product or the recording; microphone-denied dictation showed a clear message and Try again.

## CAP-voice-18 Live dictation (text appears while speaking)

Words appear as the user speaks, with no short recording cap.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/voice-dictation.md](https://code.claude.com/docs/en/voice-dictation.md): cc21:160 In the CLI the transcript appears dimmed while holding and finalises on release; cc21:162 tap mode stops after 15 seconds of silence or two minutes. Apps: cli, ide.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): oh08:114 Nov 18, 2026: speech appears as text while talking; the 10 minute limit is removed; rolling out to all plans. Plans: Free, Go, Plus, Pro, Business, Enterprise, Edu. Apps: web, ios, android, desktop.

**AGI requirement** (inferred; source: competitor parity (ChatGPT)). Dictation shows words as spoken, with a documented maximum length.

**With different models, providers and the one subscription.** Needs a streaming speech engine; the on-device engine on mobile already streams, a cloud engine must be a catalog slot.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile built (stops after 60 seconds). Web and Desktop record then transcribe (desktop bar ends at 10 minutes). CLI, Chrome: no streaming. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S49.04, S49.10
- Comparison list ids: D159, MP17, WP49; rows without an id: mobile: Live transcript while dictating
- Code: `apps/web/features/chat/hooks/use-dictation.ts:30-37,204`; `apps/desktop/electron/dictationElsewhere.ts:45`; `apps/mobile/src/features/voice/services/voiceInput.ts:68,436`

**Gap.** Web and desktop show no text until the recording stops; mobile caps at 60 seconds.

**Acceptance criteria**

1. On web, speak a sentence; words appear before stopping.
2. Dictate for longer than the stated cap; the cap and what happens are stated.

**Verification: code inspected only.** Comparison rows.

## CAP-voice-19 Dictation languages

A dictation language setting and the list of languages supported.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/10065434-use-dictation-on-claude-mobile](https://support.claude.com/en/articles/10065434-use-dictation-on-claude-mobile): ch01:16,17 Mobile supports 12 languages (non-English in beta); Speech Input Language setting. Plans: All plans. Apps: ios, android.
  - [https://code.claude.com/docs/en/voice-dictation.md](https://code.claude.com/docs/en/voice-dictation.md): cc21:165 Claude Code dictation supports 20 languages and uses the language setting, falling back to English. Apps: cli, ide.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): oh08:234 Jun 26, 2026: new speech-to-text with better accuracy across languages, accents, code-switching and noise. No list of languages in the catalogue. Plans: Free to Enterprise. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). A dictation language setting, with the supported list shown per app.

**With different models, providers and the one subscription.** The list depends on the engine in use (device or cloud) and must be read from it.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, Desktop, Mobile, CLI (20), Chrome built. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S49.03
- Comparison list ids: CP51; rows without an id: web: Dictation language; mobile: Dictation languages (12 languages, non-English in beta); chrome: Dictation language choice
- Code: `apps/web/features/settings/sections/VoiceSection.tsx:184-192`; `apps/cli/src/voice_languages.rs:8`; `apps/extension/src/features/side-panel/dictation-language.ts:14`

**Gap.** CLI lacks three Claude Code languages (CP51).

**Acceptance criteria**

1. Change the dictation language; recognition follows it.
2. The list shown matches what the engine supports.

**Verification: code inspected only.** Comparison rows.

## CAP-voice-20 Dictation controls in the CLI and coding tools

Hold or tap modes, auto-send, cancel, rebindable key, coding-aware recognition, and use in agent views.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/voice-dictation.md](https://code.claude.com/docs/en/voice-dictation.md): cc21:159-167 /voice sets hold, tap or off; autoSubmit sends on release for three or more words; Esc or Ctrl+C cancels; key is rebindable; recognises coding terms and adds project name and branch as hints; works in agent view; cc21:169 Linux recorder fallbacks. Plans: claude.ai account. Apps: cli, ide.
- **Codex and ChatGPT: partly**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): oh08:368 Optional auto-submit of dictation, off by default (mobile). cl08-pr01:206 (learn.chatgpt.com/guides/best-practices.md) Dictate instructions in the Codex desktop app. Apps: ios, android, desktop.

**AGI requirement** (inferred; source: competitor parity (Claude Code)). Coding surfaces get dictation with the same controls as chat; ledger lists these as the target set.

**With different models, providers and the one subscription.** Unlike Claude Code, which needs a claude.ai sign-in and is off with API keys or other providers, AGI dictation must work with any provider through the transcription slot, or a local speech binary in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI: /voice and /dictate, hold Space, Esc cancel, language flag; Local mode blocks cloud transcription without opt-in. No VS Code. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.12, S49.01
- Comparison list ids: C714, C715, C716, C717, CP20, CP368, CP369, CP370
- Code: `apps/cli/src/voice.rs:65-72,555-600,753`; `apps/cli/src/tui/tui_app.rs:6284-6312`

**Gap.** No tap mode, auto-send, key rebinding, coding hints, agent-view dictation, Linux fallback recorder; usage exclusion unverified.

**Acceptance criteria**

1. In the CLI, hold Space to record; release gives a transcript with send, edit, re-record, discard.
2. With Local privacy mode and no local speech binary, the CLI refuses and explains rather than sending audio out.

**Verification: code inspected only.** Comparison CLI rows; Local gate read in apps/cli/src/voice.rs.

## CAP-voice-21 Dictation cleanup and custom dictionary

Dictation removes filler and applies a personal word list for names, paths and code symbols.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT and Codex: yes**
  - [https://learn.chatgpt.com/docs/whats-new.md](https://learn.chatgpt.com/docs/whats-new.md): cl07:185 Desktop dictation cleans up text and accepts a custom dictionary for names, file paths and code symbols. Apps: desktop.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Not decided; see unresolved choices.

**With different models, providers and the one subscription.** Cleanup uses a rewrite step (a voice_rewrite slot exists in the catalog); in Local mode it must use a local model.

**Current implementation, as this trace read it on 2026-11-24: not built.** Desktop D158 missing; the catalog has a voice_rewrite slot and the desktop has a dictation cleanup route test, so partial plumbing may exist and was not checked end to end. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S49.29
- Comparison list ids: D158
- Code: `packages/contracts/types/src/model-catalog.ts (voice_rewrite slot)`; `apps/desktop/src/stores/__tests__/dictationCleanupRoute.test.ts`

**Gap.** No custom dictionary or cleanup setting is shown to users.

**Acceptance criteria**

1. If chosen: add a word to the dictionary; dictation spells it as entered.

**Verification: not verified.** Comparison row D158.

## CAP-voice-22 System-wide dictation into any app

A global shortcut that dictates into whichever app is focused.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac](https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac): ch02:133 Quick Entry dictation via Caps Lock, off by default; macOS 14+ and Speech recognition permission; Mac only. cc05:284 not on Linux. Plans: Free to Enterprise. Apps: desktop.
- **ChatGPT: unknown**
  - [https://learn.chatgpt.com/docs/features/voice.md](https://learn.chatgpt.com/docs/features/voice.md): cl05:159 A hotkey starts voice chat; the catalogue does not show system-wide dictation into other apps. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md (system-wide dictation is a separate native subsystem; item DESKTOP-SYSTEM-DICTATION-UNWIRED-01)). System-wide dictation is a separate native subsystem on Desktop, not a composer-only microphone.

**With different models, providers and the one subscription.** Desktop dictation into other apps sends audio to transcription; in Local mode it must run locally or ask first. It asks for Accessibility and refuses password fields.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop (Mac): global shortcut and a bar that types into the other app are in code; Option+Shift+V default. The contract and the ledger (S49.28) still say it is unbuilt or gated off. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S49.28
- Comparison list ids: DP133; rows without an id: desktop: Dictation types into the app you are using
- Code: `apps/desktop/electron/dictationElsewhere.ts:1-45`; `apps/desktop/electron/voiceDictation.ts:52-78`; `apps/desktop/electron/main.ts:1899-1910`

**Gap.** Sources disagree: the comparison says built, the contract and known-flaws row say unwired. Code wins per AGENTS.md rank 2, but no person has run it. Caps Lock not offered; Windows behaviour unknown.

**Acceptance criteria**

1. With the setting on, press the shortcut in a text editor, speak; text is typed there.
2. In a password field it refuses.
3. Without Accessibility permission, the app asks and explains.

**Verification: not verified.** Conflicting sources; no run.

## CAP-voice-23 Read a reply aloud

A control on an assistant reply speaks it, with stop, voice and speed settings.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/8142208-using-the-chatgpt-mobile-app-classic-experience](https://help.openai.com/en/articles/8142208-using-the-chatgpt-mobile-app-classic-experience): oh08:90 Android: touch and hold to select text, with Copy, Read aloud and Share buttons below responses. The catalogue shows no other read-aloud page. Apps: android, ios.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md (Read aloud listed as a message action); competitive-guidance.md item 39). Read aloud on each reply on every app with a chat screen, using the chosen voice and speed, reading the same text a user sees (rich answer blocks included).

**With different models, providers and the one subscription.** Speech engine is separate from the chat model. In Local mode the device voice is used; in Cloud the reply text goes to the managed speech provider and the privacy copy must say so (known-flaws row MOBILE-READ-ALOUD-PRIVACY-COPY-01 says the web policy and data-safety note do not yet).

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Mobile, Chrome built; Desktop shares the web UI. CLI and VS Code: none. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S50.01, S50.02, S50.03
- Comparison list ids: none matched; rows without an id: web: Read a response aloud; mobile: Read a reply aloud; chrome: Read a reply aloud
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:3990`; `apps/web/lib/hooks/useTTS.ts:10,225`; `apps/mobile/src/features/voice/services/voiceOutput.ts:131`; `apps/extension/src/features/side-panel/bubbles.ts:530`

**Gap.** QA findings file (results/page/findings.json, code-read) says read aloud speaks the raw markdown so cards and charts read as 'code block omitted'. Privacy copy gap for cloud speech. A person saw uneven indentation of the Read message aloud menu item (cosmetic, W-6).

**Acceptance criteria**

1. Press Read message aloud on a reply; it speaks and the control becomes Stop.
2. A reply with a table or card is read as its contents.
3. In Local mode, no text leaves the device to speak.

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv W-6 free cosmetic (menu item indentation); speech itself not heard by a tester.

## CAP-voice-24 Voice recording privacy and training consent

Audio is deleted after use, and sharing recordings for model training is a separate opt-in.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/17644704-share-your-voice-recordings-with-anthropic](https://support.claude.com/en/articles/17644704-share-your-voice-recordings-with-anthropic): ch05:221 Audio from voice mode and dictation is deleted after transcription; users may opt in after the first voice chat (mobile). ch01:122 transcript kept. Plans: Free, Pro, Max, Ultra (not Team, Enterprise). Apps: ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): oh05:63 Live audio stored with the transcript for 30 days and deleted within 30 days of chat deletion. oh08:48 voice has its own data-sharing setting; oh02:197 turning it off stops sharing dictation and voice audio. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/decisions/2026-11-13-founder-decisions.md D-2026-11-13-03). Two switches, off until turned on: chats and voice recordings used to improve models. Say what is stored and for how long.

**With different models, providers and the one subscription.** Recording handling is the same whichever provider transcribes. In Local mode audio stays on the device. A voice provider must not train on audio unless the switch is on.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: switch built and privacy page says audio is not stored. Mobile: switch built, no consent sheet or delete-shared-recordings control. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S49.17, S49.27
- Comparison list ids: M181, M227, MP111, MP95; rows without an id: web: Voice audio is not kept, transcript is; mobile: Allow voice recordings to be used to improve the models
- Code: `apps/web/features/settings/sections/PrivacySection.tsx:80-92`; `apps/web/app/privacy/page.tsx:248-262`; `apps/mobile/src/features/settings/cloud-privacy/TrainingPreferenceGroups.tsx:63-67`

**Gap.** No first-use consent sheet or per-call ask on mobile; no way to delete already-shared recordings; two comparison rows disagree about the consent sheet.

**Acceptance criteria**

1. The voice-training switch is off for a new account.
2. Turning it on is recorded and can be turned off.
3. The privacy page states that audio is not kept after transcription.

**Verification: code inspected only.** Comparison rows and decision record.

## CAP-voice-25 Admin controls for voice and dictation

A workspace owner can switch voice, dictation or screen sharing in voice on or off.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: partly**
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): ch01:125 Enterprise owners must ask Support to turn voice mode off. cc21:169 org policy can disable Claude Code voice. Plans: Enterprise. Apps: web, desktop, cli.
- **ChatGPT and Codex: yes**
  - [https://learn.chatgpt.com/docs/config-file/config-reference.md](https://learn.chatgpt.com/docs/config-file/config-reference.md): cl02:221 Requirements can disable dictation and real-time voice in the desktop app. Plans: Enterprise. Apps: desktop.
  - [https://learn.chatgpt.com/docs/enterprise/higher-education-roles-and-permissions.md](https://learn.chatgpt.com/docs/enterprise/higher-education-roles-and-permissions.md): cl04:11 Separate toggles for Voice and for screen and video sharing in Voice. Plans: Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Workspace admins can turn voice and dictation off per workspace.

**With different models, providers and the one subscription.** Admin switches are entitlements in the one subscription system and must be enforced by the server for every app.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on web and desktop; the workspace feature list has no voice entry. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D148, W464, W467
- Code: `packages/contracts/types/src/enterprise/workspace-controls.ts:3-18`

**Gap.** No voice switch in workspace controls.

**Acceptance criteria**

1. An admin turns voice off; members see voice hidden or disabled on web, desktop and mobile, and the server refuses a session.

**Verification: not verified.** Code search only.

## CAP-voice-26 Live translation in voice

Ask voice to translate between two languages and it keeps translating until told to stop.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): oh08:359 Jun 7, 2025: ask Voice to translate and it keeps translating between two languages until told to stop. Plans: Free, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Not decided; see unresolved choices.

**With different models, providers and the one subscription.** A model instruction rather than a feature of one provider; works with any model that can follow it, quality depends on the voice engine.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on web and mobile; a separate translate screen exists on mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M221, W468
- Code: `apps/mobile/app/(app)/translate.tsx`

**Gap.** No continuous two-language mode in voice.

**Acceptance criteria**

1. If chosen: say 'translate between English and Spanish'; each turn is translated until told to stop.

**Verification: not verified.** Code search only.

## CAP-voice-27 Meeting and voice-note recording with notes

Record a meeting or voice note, get a transcript, summary and action items.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/18325154-use-claude-meetings](https://support.claude.com/en/articles/18325154-use-claude-meetings): ch06:41 Claude in meetings saves transcript, summary and screen descriptions, not audio; Team and Enterprise (beta). Plans: Team, Enterprise. Apps: other.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11487532-chatgpt-record](https://help.openai.com/en/articles/11487532-chatgpt-record): oh02:80-85 Record button live-transcribes, makes a summary canvas with action items; pause and resume; four hour cap; speaker labels; Google Meet auto-join. macOS desktop only (beta). Plans: Plus, Pro, Business, Enterprise, Edu. Apps: desktop.

**AGI requirement** (proposed; source: competitor parity). Not decided; see unresolved choices.

**With different models, providers and the one subscription.** Recording must show a consent notice first; audio goes to transcription only; Local mode needs a local engine.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on all apps. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S49.12, S49.16, S49.18, S49.20, S49.21, S49.22, S49.23
- Comparison list ids: D160, D21, D89, W302
- Code: `searched: meeting record, transcript in apps/desktop/electron and apps/web/features` (not found)

**Gap.** No recorder, transcript, summary, speaker labels.

**Acceptance criteria**

1. If chosen: record a short talk; a transcript and summary appear and audio is deleted per policy.

**Verification: not verified.** Code search only.

## CAP-voice-28 Audio file upload and transcription

Attach an audio file and get a transcript, summary or notes.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8555545-uploading-files-and-audio-in-chatgpt](https://help.openai.com/en/articles/8555545-uploading-files-and-audio-in-chatgpt) (this address is not in the saved catalogue; treat as unverified): oh09:76 Paid plans can attach audio (WAV, MP3, OGG, FLAC, AAC, M4A) up to 512 MB; not on Free. oh08:139 Oct 6, 2026 transcripts, summaries and notes. Plans: Plus, Pro, Business, Enterprise, Edu. Apps: web, ios, android.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Not decided; see unresolved choices.

**With different models, providers and the one subscription.** Uses the transcription slot; billed to the subscription by audio length.

**Current implementation, as this trace read it on 2026-11-24: partly built.** API route for transcription exists; no audio attachment type in the chat on web or desktop. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S49.08
- Comparison list ids: W103
- Code: `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:590`

**Gap.** Audio cannot be attached in chat.

**Acceptance criteria**

1. If chosen: attach an audio file; a transcript is returned and counted in usage.

**Verification: not verified.** Code search only.

## CAP-voice-29 Pronunciation help

Asking how to say a word gives audio playback and a phonetic breakdown.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): oh08:183 Aug 31, 2026: asking how to say a word offers audio playback and phonetics (rolling out). Apps: web, ios, android.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Not decided; see unresolved choices.

**With different models, providers and the one subscription.** Small feature that reuses read aloud; works in Local mode with the device voice.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on web and mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M225, M34, W469
- Code: `searched: pronunciation, phonetic in apps/web, apps/mobile` (not found)

**Gap.** No pronunciation card.

**Acceptance criteria**

1. If chosen: ask how to say a word; a play control and phonetics appear.

**Verification: not verified.** Code search only.

## CAP-voice-30 Microphone and speaker choice

Choose the microphone and the audio output for dictation and voice.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/10065434-use-dictation-on-claude-mobile](https://support.claude.com/en/articles/10065434-use-dictation-on-claude-mobile): No microphone or output picker is described; the catalogue shows only that Claude Code dictation runs a microphone check (cc21:159). Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 124). Provide microphone, mute, stop and input and output device selection with an understandable connection state.

**With different models, providers and the one subscription.** Device choice is local to the app and independent of the provider.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: microphone select and output picker in code; Mobile: audio route picker; CLI: none. The ledger lists input selection as missing, the comparison row says the web select exists. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S48.18, S48.19, S48.20
- Comparison list ids: none matched; rows without an id: web: Enable dictation switch and microphone choice; mobile: Choose the audio output during a call
- Code: `apps/web/features/settings/sections/VoiceSection.tsx:113-165`; `apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:90`; `apps/mobile/src/features/voice/components/AudioRoutePicker.tsx:27`

**Gap.** Sources disagree for web microphone choice; CLI has none.

**Acceptance criteria**

1. Choose a different microphone in Voice settings; dictation uses it.
2. Choose another output during a call; sound moves there.

**Verification: code inspected only.** Comparison and ledger rows disagree; no run.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to match ChatGPT-only features: voice that starts and steers tasks, live translation, pronunciation help, meeting recording, audio file upload, custom dictionary and dictation cleanup.
- Whether live voice must work for BYOK and Local users (today it is managed cloud only), or stays a Cloud feature with a turn-based fallback.
- Whether to build background voice, lock screen, CarPlay and Live Activity on mobile.
- Whether to add screen or camera sharing in voice (ChatGPT keeps it only in its older mode and desktop screen context; Claude: not shown in the catalogue).
- Whether VS Code gets dictation (the product matrix says a VS Code webview has no microphone) or stays absent.
- Whether web and desktop get push-to-talk in live voice.
- Whether to add workspace admin switches for voice and dictation.
- Whether system-wide dictation on Desktop is a shipped feature (code says built, contract and known-flaws say unwired) and whether to add Windows and a Caps Lock key.
- Whether voice limits are shown to paid users as meters or minutes, and what the mobile voice limit is when subscription sales resume.

## Could not establish

- Whether Claude has read-aloud: the catalogue shows no Claude read-aloud page, so it is unknown, not absent.
- Claude voice limits by plan, screen or camera sharing, background voice, translation, files in voice: not in the catalogue.
- Whether the spoken path of web live voice and dictation works: the test microphone produced silence (W-10), so no person has seen a spoken turn work.
- Whether web and desktop dictation and read aloud work in Local mode without sending audio or text to AGI Cloud: not established; only the CLI Local gate and mobile Local fallbacks were read.
- Whether desktop system-wide dictation actually runs: sources conflict and no run exists.
- Whether the ledger rows for CLI voice conversation (S48.x CLI done) describe a spoken conversation or only dictation.
- Any behaviour on Windows desktop, Android, VS Code and Chrome beyond code reading; no person-run results for those apps.
- Whether the live voice provider can be changed by catalog slot alone (voice_live slot exists; only managed providers are accepted).
