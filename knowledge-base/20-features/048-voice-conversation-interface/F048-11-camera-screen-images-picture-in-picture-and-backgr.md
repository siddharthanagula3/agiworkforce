---
id: "F048-11"
type: "feature"
title: "Camera, screen, images, picture-in-picture and background"
aliases: ["Camera, screen, images, picture-in-picture and background", "View images and maps during Voice (S48.25)", "Attach image during Voice (S48.29)", "Camera sharing (S48.30)", "Screen sharing (S48.31)", "Camera switching (S48.32)", "Picture-in-picture (S48.33)", "Background-conversation preference (S48.34)", "Lock-screen controls (S48.35)", "Add photos & files"]
area: "48 Voice conversation interface"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S48.25", "S48.29", "S48.30", "S48.31", "S48.32", "S48.33", "S48.34", "S48.35"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "provider:openai", "plan:free", "SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "F048-09", "F048-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F048-11 Camera, screen, images, picture-in-picture and background

A group of extras around a live call. Web lets a person share a photo or PDF during a call and shows images tools return. A camera-share control is built but never switched on in the web page. Screen sharing, camera switching, maps, picture-in-picture, a background setting and lock-screen controls were not found. Calls end when the page or app goes to the background.

Area: [48. Voice conversation interface](README.md). Requirement items: [S48.25](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4825), [S48.29](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4829), [S48.30](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4830), [S48.31](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4831), [S48.32](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4832), [S48.33](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4833), [S48.34](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4834), [S48.35](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4835).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets the assistant see things during a call (photo, PDF, camera) and lets the call survive leaving the screen (picture-in-picture, background, lock screen).

**Why it exists.** Competing voice assistants show images, accept pictures and keep running in the background. The brief lists eight such items; founder decision D-2026-11-13-01 says adding a photo or file during a voice conversation is built (doc: docs/decisions/2026-11-13-founder-decisions.md:27-30).

**Who uses it.** Web and Desktop users (photo/PDF), iPhone users (images from tools).

**Problems it solves**

- Cannot show the assistant what you mean while talking.
- Voice call dies when you switch tabs or apps.

**Use cases**

- Share a photo of a receipt and ask about it by voice.
- Ask for a chart and see the generated image on the call screen.
- Share a PDF and ask for a summary.
- Keep talking while using another app (not available).

## 2. User experience

**Where to find it**

- Web and public Desktop: in the voice composer press the plus button (aria 'Open this chat panel') then 'Add photos & files' in the panel titled 'In this chat' (apps/web/features/chat/components/Voice/VoiceChatDock.tsx:18-26, 99-103; VoiceComposer.tsx:11, 87-99).
- Web tool images: shown in the tool results area of the voice screen (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:477-493).
- iPhone tool images: inside the result box of the live bar (apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:133-152, 502-504).
- Camera: component with 'Share your camera' and 'Stop sharing your camera' exists but is not shown in the web page (VoiceModeSurface.tsx:524-557).

**Before you start**

- A started live call.
- For attachments: a photo (image) or PDF small enough for the connection's message limit (apps/web/features/chat/lib/voice-attachments.ts:10-11).

**Screens and controls**

- 'Add photos & files' menu item opens a file picker accepting images and PDFs (VoiceModeSurface.tsx:620-640).
- Notices after sharing: 'Shared with the assistant. Ask about it.', 'That file is too large to share during a voice conversation. Attach it to a typed message instead.', 'Voice can look at photos and PDFs.', 'That file could not be read.', 'Wait for the current action to finish, then share it.', 'Start talking first, then share it.' (apps/web/features/chat/hooks/use-voice-session.ts:377-385).
- Tool image: clickable thumbnail opening in a new tab (web).

**Journey**

1. 1. Start live voice and speak once.
2. 2. Open the plus panel, choose 'Add photos & files', pick a photo or PDF.
3. 3. The app downsizes the photo and sends it to the assistant's backend; a notice confirms.
4. 4. Ask about it by voice; the answer comes from the backend model that can see it (apps/web/features/chat/lib/live-voice-session.ts:704-739).

**What the person sees and gets**

- A short notice for 8 seconds (apps/web/features/chat/hooks/use-voice-session.ts:63, 368-375).
- Images the assistant created appear inline with alt text equal to the file name.

**Settings**

- None found for background behaviour, picture-in-picture or lock screen.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Photo or PDF sharing on web: photo downscaled to JPEG trying 1280, 1024, 768 pixel edges; PDF sent whole; both limited to the realtime connection's largest message (default 256 KB) (apps/web/features/chat/lib/voice-attachments.ts:11, 17-21, 63-80; apps/web/features/chat/lib/live-voice-session.ts:709-740).
- Tool-made images shown in place on web and iPhone (VoiceModeSurface.tsx:477-493; LiveVoiceBar.tsx:133-152).
- Session ends on pagehide (web) and on app background (iPhone) in a controlled way (apps/web/features/chat/hooks/use-voice-session.ts:924-933; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:486-490).
- Navigation inside the web app keeps the call for up to 5 seconds while the next page mounts (apps/web/features/chat/hooks/use-voice-session.ts:162, 508-514).

**Incomplete**

- Attachments on iPhone: the live bar has no add control; its tests assert that (apps/mobile/__tests__/LiveVoiceBar.test.tsx:558). The iPhone inline voice bar does carry attachments (apps/mobile/app/(app)/chat/[id].tsx:2815-2816; apps/mobile/src/features/voice/hooks/useVoiceAttachments.ts) [turn-based voice, not live].
- Images only through tools; the assistant has no way in the code to return a map.

**Present but disconnected or switched off**

- Camera sharing on web: VoiceModeSurface renders the control only when an onVisualFrame sink is passed and the app is not the desktop shell (VoiceModeSurface.tsx:258, 524); WebChatPage builds its voice props without onVisualFrame (apps/web/features/chat/pages/WebChatPage.tsx:6841-6854), so the control is never shown.
- The shared capture code already supports screen and window sources and a front or back camera option (packages/contracts/types/src/visual-session.ts:14; packages/contracts/types/src/visual-session-capture.ts:73) but the voice screen only uses the 'camera' source (VoiceModeSurface.tsx:259-263).

**Not available**

- Screen sharing UI, camera switching UI, maps on screen, picture-in-picture, background-conversation preference, lock-screen or system media controls: none found in apps/web features and lib, apps/desktop electron and src, or apps/mobile src and app (search for pictureInPicture, MediaSession, lock screen found only unrelated files).
- Desktop camera: the Desktop shell grants audio only (apps/desktop/electron/permissionPolicy.ts:46-57).
- iOS background audio mode: not added by the config read (apps/mobile/app.config.js:30-43 removes fetch and processing modes; full file not read).

## 4. Required behaviour

**Established requirements**

- Voice replies can put images or maps on screen. (source: S48.25)
- The user can attach an image while voice continues. (source: S48.29)
- The user can share camera and screen, switch cameras, use picture-in-picture, choose background conversation, control from lock screen. (source: S48.31-S48.35 (S48.30 camera sharing not applicable per brief))
- Adding a photo or file during a voice conversation is built on mobile. (source: doc: docs/decisions/2026-11-13-founder-decisions.md:27-30)

**Acceptance criteria**

1. On web, sharing a photo during a call gives the notice 'Shared with the assistant. Ask about it.' and the assistant can answer a question about it.
2. A PDF or photo too big for the message limit gives the 'too large' notice.
3. A non-image non-PDF file gives 'Voice can look at photos and PDFs.'
4. An image returned by a tool appears inline on web and iPhone.
5. Hiding the tab or closing the page ends the call and settles usage.
6. Camera control: not shown today; if wired it must show 'Share your camera' and a live preview, and be absent in the Desktop shell.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The first draft's 'Not built' is wrong for photo/PDF sharing and tool images [inferred from code].
- A call ended by page hide should not leave usage counting [inferred from endLiveVoiceSession settle path].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Either wire onVisualFrame to a real sink and test it, or remove the dead camera control.
- [proposed] Add a background-conversation preference only after deciding the usage and privacy rules.
- [proposed] Add iPhone attachments in the live bar if the founder decision requires it for live calls.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | VoiceChatDock | `apps/web/features/chat/components/Voice/VoiceChatDock.tsx` | Plus panel with 'Add photos & files', Library, Connectors, Captions, 'Pause call'. |
| component | VoiceModeSurface | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | Hidden file input (620-631), tool images (477-493), camera control (524-557). |
| service | voice-attachments | `apps/web/features/chat/lib/voice-attachments.ts` | Prepares photo and PDF for the data channel. |
| service | LiveVoiceSession.shareAttachment | `apps/web/features/chat/lib/live-voice-session.ts` | Sends the item to the backend over the data channel (709-740). |
| hook | useVoiceSession.shareAttachment and pagehide | `apps/web/features/chat/hooks/use-voice-session.ts` | Notices (377-385), attachment (979-989), page hide (924-933). |
| hook | useVisualSession | `apps/web/lib/visual/use-visual-session.ts` | Camera capture hook used by the surface. |
| service | visual-session-capture | `packages/contracts/types/src/visual-session-capture.ts` | Capture session with facing mode option. |
| service | visual-session kinds | `packages/contracts/types/src/visual-session.ts` | Source kinds camera, screen, window (line 14). |
| component | WebChatPage voice props | `apps/web/features/chat/pages/WebChatPage.tsx` | Builds voiceSurfaceProps without onVisualFrame (6841-6854). |
| config | desktop media permission | `apps/desktop/electron/permissionPolicy.ts` | Audio only; no camera. |
| component | LiveVoiceBar (mobile) images | `apps/mobile/src/features/voice/components/LiveVoiceBar.tsx` | VoiceToolImage and results. |
| hook | useLiveVoiceSession background end | `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts` | Ends call on background (486-490). |
| hook | useVoiceAttachments (mobile) | `apps/mobile/src/features/voice/hooks/useVoiceAttachments.ts` | Attachments for turn-based inline voice. |
| config | mobile app config | `apps/mobile/app.config.js` | Removes fetch and processing background modes (30-43). |
| test | voice-attachments test | `apps/web/features/chat/lib/voice-attachments.test.ts` | PDF, photo downscale, size limit, unsupported type. |
| test | VoiceModeSurface test | `apps/web/features/chat/components/Voice/VoiceModeSurface.test.tsx` | Camera control hidden without sink or in Desktop shell; camera preview (438-497). |
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts` | Session whose backend receives the attachment. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A file is chosen; the browser reads it, downsizes a photo to JPEG, or reads a PDF as base64. | device | apps/web/features/chat/lib/voice-attachments.ts:37-80 |
| Size is checked against the connection's maximum message (at most 256 KB). | device | apps/web/features/chat/lib/live-voice-session.ts:712-717 |
| The item is sent over the realtime data channel to the voice provider session, which hands it to its backend model that can read images and files. | outside service | apps/web/features/chat/lib/live-voice-session.ts:721-735; apps/web/features/chat/lib/voice-attachments.ts:1-8 |
| The live model is quietly told a file arrived so it refers questions to the backend. | outside service | apps/web/features/chat/lib/live-voice-session.ts:736-738 |
| Tool image: our tool route stores a file and returns its /api/files address; the screen loads it. | our servers | apps/web/lib/voice/live-voice-tool-runner.ts:157-188; VoiceModeSurface.tsx:67-72 |
| On page hide the web call is closed and settled; on iPhone background the call ends. | device and our servers | apps/web/features/chat/hooks/use-voice-session.ts:926; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:486-490 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Shared photo or PDF | Sent over the data channel; not stored by our code in the path read | No | Subprocessor policy says AGI does not store the audio; file retention at the provider unknown (apps/web/app/subprocessors/page.tsx:115) |
| Camera frames (if ever wired) | Capture ring in memory; contract says pixels are never persisted or logged (packages/contracts/types/src/visual-session.ts:1-8 comment) | No | Stops when the call stops (apps/web/lib/visual/use-visual-session.ts:17-22) |

**Models and providers.** Photo and PDF go to the plan's backend model on the managed OpenAI route; the live voice model cannot see them (apps/web/features/chat/lib/voice-attachments.ts:1-8; apps/web/app/api/voice/live/sessions/route.ts:311-318). Images shown on screen come from tools run on our servers.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in (live call). |
| Permissions | Camera permission would be needed for the unwired control; Desktop never grants camera (apps/desktop/electron/permissionPolicy.ts:46-57). iPhone microphone permission handled before the call. |
| Subscription | Same as live voice: plan allowVoice and minutes. No separate rule for attachments found. |
| Limits and metering | Attachment size limited to the data channel message (max 256 KB); the backend work is added to the session's backend usage (apps/web/features/chat/lib/live-voice-session.ts:624-626). |
| Feature flags | canUseVoice; camera control needs a frame sink. |
| Model compatibility | Works only with the managed live voice route; not with the chat model. |
| Provider restrictions | Managed OpenAI only. |
| Local mode | No live voice in Local mode on web or iPhone, so none of these controls exist there (apps/web/features/chat/pages/WebChatPage.tsx:5907-5911; apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:25). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No active session | 'Start talking first, then share it.' | apps/web/features/chat/hooks/use-voice-session.ts:980-983 |
| Tool busy | 'Wait for the current action to finish, then share it.' | apps/web/features/chat/lib/live-voice-session.ts:711 |
| File too big or unsupported or unreadable | Matching notice; nothing sent. | apps/web/features/chat/lib/voice-attachments.ts:72, 80; use-voice-session.ts:377-385 |
| Session replaced while preparing | Returns unavailable and sends nothing. | apps/web/features/chat/lib/live-voice-session.ts:718 |
| Camera not allowed | Shows the visual session error text; control not rendered in practice. | VoiceModeSurface.tsx:535-539 |
| Background or hidden page | Call ends; no background mode. | use-voice-session.ts:926; useLiveVoiceSession.ts:486-490 |
| Mic permission prompt on iPhone sends app inactive | Call keeps connecting while the prompt is open. | apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:488; test apps/mobile/__tests__/LiveVoiceBackgroundCancel.test.tsx:211-261 |
| Tab switched but page not unloaded on web | unknown: only pagehide is listened to. | use-voice-session.ts:927 |
| Accessibility | Camera sharing would announce 'Your camera is being shared with this call.' | VoiceModeSurface.tsx:50, 542-544 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/lib/voice-attachments.test.ts`: PDF as input_file, too large, photo downscale retries, unsupported type.
- `apps/web/features/chat/components/Voice/VoiceModeSurface.test.tsx`: Camera control hidden without a sink and in Desktop shell; preview and stop; tool image rendering (438-497, 616).
- `apps/web/features/chat/components/Voice/VoiceChatDock.test.tsx`: Plus panel items (case names not read).
- `apps/mobile/__tests__/LiveVoiceBackgroundCancel.test.tsx`: Call ends when app backgrounds, with exceptions for the microphone prompt.
- `apps/mobile/__tests__/LiveVoiceBar.test.tsx`: Image in results (442) and no add control (558).
- `apps/mobile/__tests__/useVoiceAttachments.test.tsx`: Inline voice attachments.

**Test scenarios**

- **Share a photo**
  1. Start a web call and say hello.
  2. Plus panel, 'Add photos & files', pick a JPEG.
  3. Ask 'what is in the picture?'
  - Expected: Notice 'Shared with the assistant. Ask about it.' then a spoken description.
- **Oversize PDF**
  1. Share a 5 MB PDF.
  - Expected: 'That file is too large...' notice.
- **Background ends call**
  1. Start a web call, close the tab.
  2. Reopen and check usage.
  - Expected: Session closed and settled; no continued minutes.
- **iPhone background**
  1. Start live voice on iPhone, press Home.
  - Expected: Call ends; reopening shows the chat, not a running call.
- **Camera control**
  1. Open web voice mode and look for 'Share your camera'.
  - Expected: Not present with the current wiring (documented gap).

**Where to look when it fails**

- Notice texts above; console in browser for data-channel errors.
- Server provider notice events in use-voice-session.ts:652-656.
- None recorded for camera since it is not rendered.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/048-voice-conversation-interface.md](../../70-qa/test-plans/web/048-voice-conversation-interface.md)
- Desktop: [70-qa/test-plans/desktop/048-voice-conversation-interface.md](../../70-qa/test-plans/desktop/048-voice-conversation-interface.md)
- Mobile: [70-qa/test-plans/mobile/048-voice-conversation-interface.md](../../70-qa/test-plans/mobile/048-voice-conversation-interface.md)

## 10. Gaps and dependencies

- **Camera sharing is built but never connected on web** Affects: Web users. Evidence: apps/web/features/chat/pages/WebChatPage.tsx:6841-6854; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:524. Work needed: Wire a frame sink (and decide how frames reach the model) or delete the control.
- **Screen sharing, camera switching, maps, picture-in-picture, background preference, lock-screen controls missing** Affects: Web, Desktop, iPhone. Evidence: searches described under not_available; brief S48.25, S48.31-S48.35. Work needed: Design and build per item; each needs usage and privacy decisions.
- **The brief marks attach image missing on web and Desktop, but it exists** Affects: Documentation. Evidence: apps/web/features/chat/components/Voice/VoiceChatDock.tsx:21; apps/web/features/chat/lib/live-voice-session.ts:709. Work needed: Update S48.29 and S48.25 (images from tools).
- **iPhone live bar has no attachment control although a founder decision lists photo/file during voice as built** Affects: iPhone live voice users. Evidence: apps/mobile/__tests__/LiveVoiceBar.test.tsx:558; doc: docs/decisions/2026-11-13-founder-decisions.md:27-30. Work needed: Clarify scope (inline turn-based voice only) or add to live bar.
- **Calls always end in the background** Affects: All live voice users. Evidence: use-voice-session.ts:926; useLiveVoiceSession.ts:486-490. Work needed: Needs a preference and platform audio modes.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- provider:openai
- plan:free
- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- F048-09
- F048-10

## Unknown

- Whether the Desktop window can use the plus panel file picker as web does (same code; no Electron-specific test found).
- Whether the iPhone app config adds any background audio mode (file not read in full).
- Whether tab switching without page unload keeps the web call running.
- Provider retention of shared photos and PDFs.
- What the camera frame sink was intended to feed.
- Whether apps/mobile/src/features/voice/services/serverSpeech.ts relates to background audio.
