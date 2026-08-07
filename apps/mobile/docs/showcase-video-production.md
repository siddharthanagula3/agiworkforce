# AGI Workforce Mobile — Frontend Showcase Video

Status: Draft
Owner: Founder
Last updated: 2026-08-06
Target: ~2:40 product walkthrough, iOS Simulator (iPhone 17 Pro), narrated

A production document for filming the mobile frontend. Every screen below was
verified by reading its source. Claims that could not be verified are marked
**[unverified]** — do not build a shot around one without opening it first.

---

## 1. What this app is

AGI Workforce Mobile is an Expo / React Native client for a multi-surface AI
workspace. Its organizing idea is a hard trust boundary: **Local Mode** runs an
on-device model with no account and no network, and **AGI Cloud** is an optional
signed-in tier adding durable tasks, schedules, connectors, and skills. The app
opens in Local Mode and never forces a sign-in. A third pillar is **Desktop
Companion** — pair the phone to a desktop by QR and the phone becomes a live
remote for agents running there, including approving their tool calls.

The frontend is roughly **70 screens** across 84 route files and 37 feature
modules. Navigation is **100% a left drawer**. A `(tabs)` route group exists but
its tab bar is force-hidden (`tabBar={() => null}`, `tabBarStyle: {display:'none'}`)
and survives only so legacy paths resolve. **Never say "tab" on camera.** Chat is
home; `app/(app)/index.tsx` is a bare `<Redirect>`.

Stack: Expo Router, NativeWind + a `useThemeColors()` hook, `react-native-reanimated`
(56 files), `@gorhom/bottom-sheet`, `react-native-svg`, `expo-haptics` (38 files),
FlashList, Zustand, Clerk, MMKV.

---

## 2. Design system

Mobile keeps **its own palette** in `src/ui/theme/tokens.ts` (`mobileNativeColors`)
— a neutral, ChatGPT-leaning scheme. It is **not** the warm terracotta/teal palette
in `@agiworkforce/design-tokens` that web and desktop use. If the video juxtaposes
surfaces, do not claim shared hex values.

| Token           | Light                | Dark                    |
| --------------- | -------------------- | ----------------------- |
| background      | `#ffffff`            | `#0f0f0f`               |
| surfaceBase     | `#f7f7f7`            | `#171717`               |
| surfaceElevated | `#ffffff`            | `#212121`               |
| surfaceOverlay  | `#ffffff`            | `#2a2a2a`               |
| surfaceHover    | `#ececec`            | `#303030`               |
| textPrimary     | `#111111`            | `#f4f4f4`               |
| textMuted       | `rgba(17,17,17,.48)` | `rgba(244,244,244,.48)` |
| agentThinking   | `#8b5cf6`            | `#a78bfa`               |
| agentSuccess    | `#10a37f`            | `#10a37f`               |
| agentError      | `#dc2626`            | `#f87171`               |

> **The `teal` token is not teal.** It resolves to `#111111` light / `#f4f4f4`
> dark. Every "teal" CTA in the source — the idle Send button, active tool chips,
> SendPreview icons — renders near-black or near-white on a neutral accent. Pick a
> non-neutral accent before shooting (see §7).

**Typography.** System font throughout. The only branded face, **Newsreader**
(`Newsreader_600SemiBold`), appears in exactly two places: the new-chat wordmark
and the drawer header. Nowhere else.

**Spacing** 4/8/12/16/20/24/32/40. **Radii** 6/8/12/16/24/32/full; `cardRadius` 24,
`sheetRadius` 32.

**Depth is borders, not shadows.** Real elevation appears in only 3 files. Expect a
flat bordered surface stack.

**Icons:** `lucide-react-native`, exclusively (177 import sites).

**Absent entirely:** no `expo-blur`, no Lottie, no `expo-linear-gradient`. There is
no frosted glass anywhere. The only gradients in the app are `react-native-svg`
gradients inside the voice components.

**There is no component gallery or Storybook screen.** The design system can only
be shown through real screens.

---

## 3. Surface inventory

**shipped** = real and reachable · **dark** = built but unreachable behind a flag ·
**stub** = intentionally thin or dead.

### Cold start, onboarding, auth

| Screen                     | Route                    | State   | Demo       | Description                                                                                           |
| -------------------------- | ------------------------ | ------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| Splash / lock gate         | `app/_layout.tsx`        | shipped | skip       | Spinner while MMKV decrypts; biometric unlock if app-lock is on.                                      |
| Age gate                   | `/(public)/age-gate`     | shipped | supporting | Shield chip, numeric age input, region-aware threshold from IANA timezone.                            |
| Onboarding 1 — hero        | `/(public)/onboarding`   | shipped | **hero**   | 12-spoke SVG mark, 94px Newsreader wordmark, "Your AI workspace for everyday work.", one pill CTA.    |
| First-run disclosure       | overlay                  | shipped | supporting | EU AI Act Art. 50 sheet with a collapsible verbatim legal box.                                        |
| Onboarding 2 — device tier | `/(public)/onboarding`   | shipped | **hero**   | "Set up local chat on {actual device}", recommended-model card, cellular toggle.                      |
| Onboarding 3 — download    | `/(public)/onboarding`   | shipped | **hero**   | 160px SVG radial progress ring, live %, size/speed/ETA line.                                          |
| Cloud sign-in              | `/(auth)/login`          | shipped | supporting | Spinning AGI mark header above Clerk's prebuilt AuthView. Uses Clerk's own warmer theme — keep short. |
| Reset password             | `/(auth)/reset-password` | dark    | skip       | Deep-link catcher; recovery is web-owned.                                                             |
| EU AI Act Article 50       | `/legal/article-50`      | shipped | supporting | Verbatim legal reference.                                                                             |
| About                      | `/(app)/about`           | shipped | supporting | Version, build info, resource cards.                                                                  |

### Navigation shell

| Screen                    | Route                   | State   | Demo     | Description                                                                                                                                                                                                                                                           |
| ------------------------- | ----------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **App drawer**            | `app/(app)/_layout.tsx` | shipped | **hero** | Wordmark, 3 circular header actions, nav list with "Cloud" pills, an **AGI Work** row that toggles the session stance (moved here from the `+` sheet 2026-08-06), companion widget, ≤6 projects, ≤8 recents (pinned first). Overlay on phone; pinned sidebar ≥1000px. |
| Hidden tabs navigator     | `(tabs)/_layout.tsx`    | n/a     | skip     | Tab bar force-hidden app-wide.                                                                                                                                                                                                                                        |
| Home redirects            | `/(app)/index`          | stub    | skip     | No UI. There is no dashboard.                                                                                                                                                                                                                                         |
| `src/features/sidebar/**` | —                       | stub    | skip     | Complete, zero importers. Its README wrongly claims it is live.                                                                                                                                                                                                       |

### Chat

| Screen                     | Route                | State    | Demo       | Description                                                                                                                                                                           |
| -------------------------- | -------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New chat (home)**        | `/(app)/(tabs)/chat` | shipped  | **hero**   | `AgiMark` 30px + Newsreader "AGI" wordmark, time-of-day greeting ("How can I help you this morning?"), ModeToggle + TemporaryChatToggle in header, composer pinned bottom. 890 lines. |
| **Thread**                 | `/(app)/chat/[id]`   | shipped  | **hero**   | FlashList transcript, swipe-to-reply, scroll-to-bottom FAB.                                                                                                                           |
| Chat history               | `/(app)/chats`       | shipped  | strong     | Date-grouped SectionList; bottom search pill live-narrows into Chats/Projects/Files/Library/Artifacts groups.                                                                         |
| `ChatEmptyState` component | —                    | shipped  | supporting | 28px system-font `Hi, {name}` (fallback `Ask anything`) fading in 500ms + dismissible "Pair your desktop?" banner. **No wordmark here** — that's on the new-chat screen.              |
| `ConversationStarters`     | —                    | **stub** | **skip**   | Fully built starter grid, exported, **rendered nowhere**.                                                                                                                             |
| PaywallBottomSheet         | on 429               | shipped  | supporting | "Upgrade to {tier}", pan-down-to-close.                                                                                                                                               |

### Voice and capture

| Screen              | Route                    | State    | Demo       | Description                                                                                                                                   |
| ------------------- | ------------------------ | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Voice Companion** | `/(app)/voice`           | shipped  | **hero**   | Full-screen orb on a dark maroon radial gradient, phase label, transcript preview, push-to-talk toggle.                                       |
| `VoiceInlineBar`    | in chat                  | shipped  | strong     | Voice as a chat state; mute flips to a solid red `MicOff` circle.                                                                             |
| `RecordingOverlay`  | in chat                  | shipped  | strong     | Replaces the composer in place — pulsing red dot, live waveform, Cancel/Send.                                                                 |
| VoicePickerSheet    | sheet                    | shipped  | strong     | 5 swipe-paged presets: Aurora, Nova, Sage, Ember, Atlas.                                                                                      |
| Camera              | `/(app)/camera`          | shipped  | strong     | Full-bleed `CameraView`, 72px white shutter ring, frosted icon buttons. **Device only.**                                                      |
| **Document scan**   | `/(app)/scan`            | shipped  | **hero**   | Teal 4-corner guide frame; on-device OCR via native `AGIVisionOCR`; teal bounding boxes snap onto text regions. **Device + dev client only.** |
| Translate           | `/(app)/translate`       | shipped  | strong     | Source/target panes, `ArrowLeftRight` swap, 10-language sheet with native-script subtitles.                                                   |
| **Compare models**  | `/(app)/compare`         | shipped  | **hero**   | One prompt, two panels streaming in parallel, amber Trophy "Faster" badge, TTFT/token/duration chips. Needs signed-in Cloud.                  |
| Share preview       | `/(app)/share-preview`   | shipped  | supporting | Share-extension landing. Real entry needs device + dev client.                                                                                |
| Widget setup        | `/(app)/widget-setup`    | **stub** | **skip**   | Not a widget configurator — a static Siri Shortcuts explainer, marked deferred in its own comments.                                           |
| Reminder review     | `/(app)/reminder-review` | shipped  | supporting | EventKit reminder creation; native confirm Alert works in Simulator.                                                                          |

### Projects, library, memory

| Screen         | Route                            | State   | Demo       | Description                                                                                        |
| -------------- | -------------------------------- | ------- | ---------- | -------------------------------------------------------------------------------------------------- |
| Projects       | `/(app)/(tabs)/projects`         | shipped | **hero**   | FadeInDown-staggered cards, active-project pill, floating "New project" pill.                      |
| Project detail | `/(app)/projects/[id]`           | shipped | supporting | Plain name/description header + Chats/Sources segmented tabs. Rich `ProjectHeader` is flag-dark.   |
| Library        | `/(app)/library`                 | shipped | **hero**   | Responsive 2–3 col grid mixing image covers, document tiles, artifact code previews. Filter chips. |
| Artifacts      | `/(app)/artifacts`               | shipped | **hero**   | Grid of colored kind badges over fading monospace code previews.                                   |
| Memory         | `/(app)/settings/memory`         | shipped | **hero**   | Controls card, search + All/Pinned chips, FAB → sheet editor; list dims to 45% when memory is off. |
| Archived chats | `/(app)/settings/archived-chats` | shipped | supporting | Cloud-only restore/delete.                                                                         |

### Companion, agents, cloud

| Screen              | Route                                                         | State    | Demo       | Description                                                                                                                                     |
| ------------------- | ------------------------------------------------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Companion**       | `/(app)/companion`                                            | shipped  | **hero**   | Pulsing status pill with live latency, setup checklist, QR pairing, dispatch composer, agent dashboard, Emergency Stop.                         |
| Agent dashboard     | inline                                                        | shipped  | **hero**   | FlashList of agent cards: status badge, model, elapsed/ETA, current-action pill, progress bar. Risk-colored approval cards with live countdown. |
| QR scanner          | inline                                                        | shipped  | strong     | Animated corner brackets + scan line. **Device only.**                                                                                          |
| Cloud tasks         | `/(app)/agents`                                               | shipped  | strong     | Filter chips, inline approve/deny of pending tool calls.                                                                                        |
| **Connectors**      | `/(app)/connectors`                                           | shipped  | **hero**   | ~22 brand-logo rows, category chips, per-row Connect / green check / amber reauth / "Coming soon".                                              |
| Connector detail    | `/(app)/connectors/[id]`                                      | shipped  | strong     | **Granted** scopes, per-tool Allow/Ask/Block radios.                                                                                            |
| **Schedules**       | `/(app)/schedules`                                            | shipped  | **hero**   | Staggered cards with on/off switches, run-status badges, expandable history.                                                                    |
| **Quick Schedule**  | modal                                                         | shipped  | **hero**   | Natural-language time input with a live-parsed preview chip.                                                                                    |
| Usage               | `/(app)/settings/cloud-usage`                                 | shipped  | strong     | Live percentage bars turning red past 90%.                                                                                                      |
| Notification center | `/(app)/notifications`                                        | shipped  | strong     | Priority icons, unread dots, deep links. Empty on a cold session.                                                                               |
| Skills              | `/(app)/skills`                                               | shipped  | supporting | Read-only cloud catalog with source badges.                                                                                                     |
| Legacy agents ×3    | `/(app)/agents/[id]`, `(tabs)/agents`, `companion/agent/[id]` | **dark** | **skip**   | Complete screens behind `FEATURES.agents = false`.                                                                                              |

### Settings (~30 routes)

| Screen                                                                                           | Route                               | State    | Demo       | Description                                                                                                     |
| ------------------------------------------------------------------------------------------------ | ----------------------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| Settings root                                                                                    | `/(app)/(tabs)/settings`            | shipped  | strong     | Profile card + 6 grouped sections, ~30 rows with live values.                                                   |
| **Performance**                                                                                  | `/(app)/settings/performance`       | shipped  | **hero**   | Thermal dot polling every 10s, Tier 1/2/3 card, two hand-drawn SVG `Polyline` charts, real on-device benchmark. |
| **Storage**                                                                                      | `/(app)/settings/storage`           | shipped  | **hero**   | Live byte usage, per-model delete, staged GDPR export, double-confirmed Danger Zone.                            |
| **Personalization**                                                                              | `/(app)/settings/personalization`   | shipped  | **hero**   | Name/occupation/instructions + 4 native sliders (warmth, enthusiasm, headers, emoji).                           |
| **Capabilities**                                                                                 | `/(app)/settings/capabilities`      | shipped  | **hero**   | Tone-colored icon tiles with inline switches across device/workflow/cloud.                                      |
| Accent color                                                                                     | `/(app)/settings/accent-color`      | shipped  | strong     | Six swatches that recolor the app instantly.                                                                    |
| Notification prefs                                                                               | `/(app)/settings/notifications`     | shipped  | **hero**   | Quiet-hours S M T W T F S letter toggles + custom time-picker modal.                                            |
| Permissions                                                                                      | `/(app)/settings/permissions`       | shipped  | strong     | Real OS states; green tiles when granted. Polls on focus, never prompts.                                        |
| Voice                                                                                            | `/(app)/settings/voice`             | shipped  | strong     | Speed/pitch sliders with live readouts.                                                                         |
| Reflect                                                                                          | `/(app)/settings/reflect`           | shipped  | strong     | 60-day activity bar chart, topic bars, insight cards.                                                           |
| Appearance, Auto-approve, General, Safety, Workspace, Shared links, Data controls, Cloud account | `/(app)/settings/*`                 | shipped  | supporting | Consistent shell; several **[unverified]** in visual detail.                                                    |
| Parental controls                                                                                | `/(app)/settings/parental-controls` | **stub** | **skip**   | Its own copy admits account linking does not exist.                                                             |

---

## 4. Hero surfaces

### 1. The composer

`src/features/chat/components/Composer/Composer.tsx` + `ChatInput.tsx`

A rounded pill (`radii.full`, `surfaceElevated`, min-height 44) with `[+]` inside
the left edge, a multiline input, a mic inside the right edge, and a 40×40 circular
send button outside on the right. Once text passes one line, the whole row
**restacks**: the pill becomes a 24px-radius card with the text on its own row, a
controls row beneath (`[+]`, model label, mic), and a `Maximize2` button appearing
top-right for the full-screen editor. Placeholder cascades by state — "What's on
your mind?" → "Reply to {model}…" → "Offline — message will send on reconnect (N
queued)".

The **send button** is a 3-state Reanimated pressable whose background cross-fades
via `interpolateColor` over 200ms: idle (Send icon) → streaming (red, filled
`Square`) → queued (amber `Clock`).

A paste of ≥10,000 characters collapses into a "Pasted text" chip instead of
flooding the input.

**Film:** type a long sentence so the restack happens on camera, then send and let
the button cross-fade to the red stop square.

### 2. The `+` sheet

`AddToChatSheet.tsx` — a 75% bottom sheet titled "Add to Chat" with square Camera /
Photos / File cards, then a **Create** section with **Image** and **Video** rows,
then **live switches**: "Deep research" (Telescope, "Multi-step research with cited
sources"), "Run code" (Terminal, "Let the model execute code in a secure sandbox"),
and a deliberately disabled "Computer use" row with a Lock icon and a "Desktop"
pill. The backing flags (`research`, `codeExecution`, `imageGen`, `webSearch`) are
all **`true`**.

> **Changed 2026-08-06.** Image generation used to be a toggle here, and AGI Work
> used to be a switch in a "Session" section above it. Image and Video are now
> _modes_ that name the model they switch to, and AGI Work moved to the drawer.
> Video needs Max 15x or Enterprise, so it is hidden on lower plans.

**Film:** open the sheet, tap **Image**, and watch the composer pick up the Image
chip and change its placeholder to "Describe the image to create"; dismiss the chip
to return to text. The disabled Computer use row is worth leaving visible — it
reads as honest.

### 3. Message rendering

`MessageList.tsx`, `MessageContentRenderer.tsx`, `ToolCallTimeline.tsx`

User turns are right-aligned 24px pills at 85% max width; **assistant turns are
plain full-width text with no bubble and no avatar**. Rows enter with
`FadeInDown.duration(200).springify()`. Markdown is a **hand-rolled regex renderer**
— no library — with h1–h4 at 22/19/17/15px, blockquotes with a 3px left border, and
syntax-highlighted code blocks whose copy icon flips to a green checkmark for 2s.

Tool calls render as an expandable timeline with Request/Response monospace panels
and a "View full output" page-sheet. An MCP tool awaiting approval shows a
`ShieldAlert` row with green Allow / outlined Deny — and `ApprovalCard` has a
**countdown bar that visibly drains and auto-approves**.

**Film:** the approval countdown draining is the single best 6 seconds in the app.

### 4. PerformanceChip

`PerformanceChip.tsx` — a `Zap` icon at 11px and `{n} tok/s` in muted text, under a
completed local reply.

> **Correction to earlier notes:** it accepts `ttftMs`, `totalMs`, `tier`, and
> `modelId` props but **renders none of them**. It shows tokens/sec only, and
> returns `null` when there is no measured value — so **cloud replies show no chip
> at all**. Frame this shot on a Local Mode reply, and narrate "tokens per second",
> not "time to first token".

### 5. Voice orb

`src/features/voice/components/VoiceOrb.tsx`

One SVG circle, 104px default, filled with a vertical gradient: `voiceOrbStart`
periwinkle → `voiceOrbMid` at 55% → `voiceOrbEnd` near-white. Optional halo scales
to 1.45× behind it.

It animates by **uniform scale only** — no shape morphing, no particles, no Skia.
Idle breathes 1.04 ↔ 0.98 over 2000ms. Thinking pulses 1.1 ↔ 0.94 over 750ms.
Listening and speaking drive scale to `1 + level * 0.28` off smoothed mic amplitude
(EMA, history weight 0.75, `withTiming` 110ms — deliberately not a spring, because
a re-targeted spring never settles and that overshoot was the reported shake).

**Film:** the phase transition. Speak (orb tracks your voice) → stop (orb shifts to
the slower 750ms thinking pulse) → reply begins. Those three states in one take
tell the whole story without narration.

### 6. Document scan

`app/(app)/scan.tsx` — teal 4-corner guide frame over a live `CameraView`; shutter
triggers on-device OCR through the native `AGIVisionOCR` module; the photo returns
with teal bounding rects mapped onto exact text regions and a "Copy text" pill that
flips to "Copied" with a haptic tick.

**Device + custom dev client required.** No simulator substitute exists.

### 7. Performance settings

`app/(app)/settings/performance.tsx` — the most technically credible screen. A
thermal dot polling every 10s, a Tier 1/2/3 card with RAM and OS rows, avg tok/s
and memory-peak chips, and **two hand-drawn `react-native-svg` charts** (`Polyline`

- grid + dots) plotting 7 days of throughput and latency. Run Benchmark executes a
  genuine on-device inference pass and updates the "Last benchmark result" row.

**Film:** tap Run Benchmark and let the result land.

### 8. Compare models

`app/(app)/compare.tsx` — one prompt, two panels streaming simultaneously, then an
amber Trophy "Faster" badge and per-panel TTFT/token/duration chips. Requires
signed-in Cloud mode and network.

### 9. Connectors directory

~22 rows with real brand-logo tiles, category filter chips, and honest per-row
states. **Only GitHub and custom MCP complete a live connect** — the other ~19
return a truthful "Coming soon" because the server 501s their registration
(`MOBILE-CONNECTORS-501`, open). Film the directory and the chips; complete a
connect only with GitHub.

### 10. Quick Schedule

Type "weekdays at 9am" and a live preview chip resolves the recurrence as you type.
Type slowly so it is legible.

---

## 5. Shot-by-shot reel (~2:40)

A continuous journey: set it up on-device, use it, then discover what pairing and
cloud add.

### Act I — It runs on your phone (0:00–0:36)

| #   | Screen          | Action                                                                      | Dur       | Narration / caption                                            |
| --- | --------------- | --------------------------------------------------------------------------- | --------- | -------------------------------------------------------------- |
| 1   | Onboarding hero | Hold on the SVG mark + wordmark, tap the CTA                                | 0:00–0:06 | _"AGI Workforce. An AI workspace that starts on your device."_ |
| 2   | Device tier     | Hold so the viewer reads the real device name in the headline; tap Download | 0:06–0:14 | _"It detects your device and picks a model that fits it."_     |
| 3   | Download ring   | Let the SVG ring fill with live % and ETA                                   | 0:14–0:26 | _"The model downloads to the phone. No account. No server."_   |
| 4   | New chat        | Land on the AgiMark + Newsreader wordmark and the time-of-day greeting      | 0:26–0:36 | _Caption: "How can I help you this morning?"_                  |

### Act II — Using it (0:36–1:32)

| #   | Screen          | Action                                                                                    | Dur       | Narration / caption                                                       |
| --- | --------------- | ----------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------- |
| 5   | Composer        | Type a long prompt so the pill **restacks** into a card                                   | 0:36–0:44 | _"The composer grows with your thought."_                                 |
| 6   | Send            | Tap send; button cross-fades to the red stop square; reply streams                        | 0:44–0:56 | —                                                                         |
| 7   | PerformanceChip | Hold on the `⚡ N tok/s` chip under the finished reply                                    | 0:56–1:02 | _"Real on-device inference — with the tokens per second to prove it."_    |
| 8   | `+` sheet       | Open it, toggle Deep research on, close                                                   | 1:02–1:12 | _"Research, code execution, image generation — switched on per message."_ |
| 9   | Voice           | Long-press the mic; speak; let the orb track your voice, then shift to the thinking pulse | 1:12–1:26 | _"Talk to it. The orb moves with your actual voice."_                     |
| 10  | Drawer          | Edge-swipe open; show the Cloud pills; tap Library                                        | 1:26–1:32 | _Caption: "One drawer. Everything you've made."_                          |

### Act III — Depth (1:32–2:18)

| #   | Screen               | Action                                                                                        | Dur       | Narration / caption                                                                     |
| --- | -------------------- | --------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------- |
| 11  | Library → Artifacts  | Cycle filter chips so the grid recomposes; open an artifact; tap Copy for the checkmark flash | 1:32–1:44 | _"Images, documents, and generated artifacts in one place."_                            |
| 12  | Performance          | Hold on the SVG charts; tap Run Benchmark; let the result land                                | 1:44–1:56 | _"It benchmarks itself and charts a week of real throughput."_                          |
| 13  | Storage              | Trigger the export, let the stage text advance; open the delete confirm and back out          | 1:56–2:06 | _"Your data. Exportable and deletable on demand."_                                      |
| 14  | Companion → approval | Show a running agent card, then **Approve a tool call as the countdown drains**               | 2:06–2:18 | _"Approve what your desktop agents do — from your pocket."_ **Do not tap the chevron.** |

### Act IV — Close (2:18–2:40)

| #   | Screen                | Action                                                                          | Dur       | Narration / caption                                    |
| --- | --------------------- | ------------------------------------------------------------------------------- | --------- | ------------------------------------------------------ |
| 15  | Quick Schedule        | Type "weekdays at 9am" slowly so the preview chip resolving is readable; Create | 2:18–2:32 | _"And when you're not around, it keeps working."_      |
| 16  | Accent color → drawer | Tap two accent swatches so the app recolors live, then rest on the drawer       | 2:32–2:40 | _Caption: "Local by default. Cloud when you want it."_ |

---

## 6. Do not film

**Flag-disabled** (`lib/v1FeatureFlags.ts`, read directly):

- `/(app)/(tabs)/agents`, `/(app)/agents/[id]`, `/(app)/companion/agent/[id]` — three
  complete screens behind `agents: false`. They render a generic
  "isn't available yet" fallback.
- **The agent dashboard's chevron / "View Thread" is a live dead end** — the working
  companion screen pushes into one of those disabled screens. Use only the inline
  expand.
- `ProjectHeader` (the chip-rich header) is behind `crossDeviceSync: false`; project
  detail always falls back to a plain card.
- "Manage billing" is hidden entirely (`billing: false`, App Store 3.1.1).
- Computer use is `false` — the row appears deliberately disabled with a Lock icon,
  which is fine to show.

**Built but rendered nowhere:**

- `ConversationStarters.tsx` — a complete starter-card grid, exported, zero render
  sites.
- `TaskChips.tsx` — fully wired for data, but `Composer.tsx` never renders it.
- All of `src/features/sidebar/**` — zero importers; its README is wrong.
- `CloudWaitlistSheet`, `InviteCodeModal`, `ModeCard` — zero production callers.
- `VoiceRecording.tsx` — no confirmed import site found. **[unverified]**

**Stubs:**

- **Parental controls** — on-screen copy admits linked accounts don't exist.
- **Widget setup** — a Siri Shortcuts explainer, not a widget configurator, and
  marked deferred. Do not call it "setting up a widget".
- `/(app)/index`, `/legal` — pure redirects.

**Would raise questions:**

- **Connectors "Connect" on anything but GitHub or custom MCP** — ~19 of 21 show
  "Coming soon" (server 501s registration). Filming the directory is fine; a live
  connect is not.
- **Cloud chat sends** are fine. `chat.tsx:241` and `chat/[id].tsx:344` carry an
  _"AGI Cloud is not ready on mobile"_ alert, but it is gated on
  `!FEATURES.cloudChat` and that flag is `true` — so the alert is **unreachable
  dead code**, not a live block. Safe to film cloud chat. (Worth deleting, but it
  does not affect the shoot.)
- **Notification center on a cold session** — fed only by real receipt events. It
  will be honestly empty unless you trigger something first.
- **Library artifact cards have no `onPress`.** Tapping does nothing; only the
  Artifacts gallery opens a preview.
- **MathBlock fetches KaTeX from a live CDN** inside a WebView. Confirm network
  before any LaTeX shot.

---

## 7. Pre-production checklist

### Settings to set before rolling

- **Dark mode.** The surface stack (`#0f0f0f` → `#171717` → `#212121` → `#2a2a2a`)
  reads far better on video.
- **A non-neutral accent** (green, blue, or violet). On neutral, every "teal" CTA
  renders near-black or near-white and looks flat. Keep the Accent Color screen
  itself for the live-recolor beat.
- **Reduce Motion OFF.** `VoiceOrb`, message rows, and several modals gate their
  animation on it — you would silently lose the motion.
- Haptics on, voice input on, all permissions pre-granted so the Permissions screen
  shows green tiles and no prompt interrupts a take.

### Seed data

Empty screens are the main risk. Before recording, populate:

- 8+ conversations, at least one **pinned**, so drawer Recents shows the ordering.
- 4–6 projects, one **set active** so the active pill and card badge appear.
- Enough images, documents, and artifacts that the **Library grid shows all three
  card treatments at once** — that mixed grid is the entire point of shot 11.
- 6+ artifacts of varying kinds for a spread of colored badges.
- 10+ memories, 2–3 pinned.
- 3–4 schedules in mixed states (one off, one with history, one failed).
- **Enough chat history that the Performance 7-day charts and Reflect's 60-day chart
  have data — both hide entirely when empty.**
- Run one benchmark before recording so the "Last benchmark result" row exists, then
  run a second on camera.

### Simulator limits

You are shooting on iPhone 17 Pro Simulator. These beats **cannot** be captured
there:

| Beat                              | Why                                | Substitute                                                                |
| --------------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| Camera, document scan, QR pairing | No camera hardware                 | Cut the scan beat, or shoot those three on a real device in a second pass |
| Share extension entry             | Needs `AGIShareInbox` + dev client | Deep-link `share-preview` with `?text=`                                   |
| Voice orb amplitude               | Needs live mic level               | Simulator can pass host mic — **rehearse this before committing shot 9**  |
| Face ID                           | —                                  | Works: Features › Face ID › Enrolled                                      |
| Reminder creation                 | —                                  | Works, native Alert and all                                               |

The reel above is already sequenced to avoid camera-dependent beats. If you want the
scan shot — and it is the most impressive thing in the app — plan a short device
pass and cut it in after shot 11.

### Existing harness

`apps/mobile/scripts/screenshots/` drives the app through Detox with stable testIDs
(`chat.composer.input`, `chat.message.assistant.streaming`, `performance-chip`,
`voice-orb`) across a 5-device matrix, compositing overlays.

```
pnpm --filter @agiworkforce/mobile screenshots:ios
```

Existing specs cover multi-provider, onboarding, first message,
mode-toggle-to-sign-in, and voice record/send. Useful for rehearsing beats
deterministically and for pulling stills. It does **not** cover the companion
dashboard or the artifact viewer — those need manual capture.

### Audit before shooting

Open `lib/v1FeatureFlags.ts` and confirm flag state on the build you actually
record. Decide up front whether you are flipping `agents` on — if you do, three more
screens become filmable and the dashboard chevron stops being a dead end. **Do not
change flags mid-shoot.**
