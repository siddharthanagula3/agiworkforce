# Part 3 — Navigation, Settings, Accessibility, Dark/Light, Gestures & Physics

Status: Active · Part 3 of the AGI Mobile XcodeBuildMCP QA Playbook
Owner: Mobile lead · Parity bar: ChatGPT iOS + Claude iOS (parity = behavior/workflow conventions only — never copied assets, text, or branding)
Read first: `./README.md` (spine, 20-point per-screen template, 44-tool map, bug classification). This part covers **Phases 15–20**.

> You are an autonomous QA + automation + accessibility + regression engineer driving the AGI Mobile app (`apps/mobile`) on the iOS Simulator with XcodeBuildMCP. This part takes the app _after_ chat, composer, streaming, and tool-calling have been validated (Part 2) and stresses everything that lives at the edges of a production mobile app: the settings tree, lifecycle (backgrounding / lock / relaunch / memory pressure), rotation and reflow, accessibility (Dynamic Type, VoiceOver, tap targets, contrast, focus order, reduce-motion), the dark/light split across every primary screen, and the gesture / animation / physics / haptics / safe-area layer that separates "feels native" from "feels like a webview."
>
> Apply the **20-point per-screen template** from the README to **every** screen named here. Locate before acting (`snapshot_ui` → `testID` > `accessibilityLabel` > visible text → act at frame center). Wait, don't sleep (`wait_for_ui`). Capture evidence before _and_ after every interaction (`screenshot`), and `record_sim_video` around every multi-step or animated workflow. Assert expected-vs-actual; any mismatch is a classified issue. The trust boundary is sacred: any Local-mode network egress observed during any phase is an automatic **Critical** — stop and report.

---

## Ground truth for Part 3 (verified against the repo — re-verify before citing)

These are the real screens, routes, components, and behaviors this part exercises. If the implementation has drifted, re-read the file and update this section rather than testing a fiction.

**Navigation shell.** The app is wrapped by an **expo-router Drawer** at `apps/mobile/app/(app)/_layout.tsx`. The drawer is `drawerType: 'front'` (slide-out overlay) on phones and **`'permanent'` (always-visible sidebar) on tablets** (`isTablet = width >= 768`). `swipeEnabled` is true only on phones, with `swipeEdgeWidth: 40`. The drawer content is `apps/mobile/src/features/drawer/components/DrawerContent.tsx`: an `AGI` wordmark, profile + new-chat icon buttons, a search box (`testID="drawer-search-clear"`), primary nav rows (Projects, Artifacts, AGI Agent [Cloud-gated]), a desktop-companion widget, Projects + Recents lists (recents long-press → pin/unpin/delete via `Alert`), and a pinned footer (Settings, Help & About). The legacy bottom tab bar is **fully hidden** (`apps/mobile/app/(app)/(tabs)/_layout.tsx` renders `tabBar={() => null}`, `tabBarStyle: { display: 'none' }`) and retained only for route compatibility.

**Settings tree.** The settings landing is `apps/mobile/src/features/settings/index.tsx` (re-exported by the route wrapper `apps/mobile/app/(app)/(tabs)/settings.tsx`). It renders a large `Settings` title, a close (`X`) button (`accessibilityLabel="Close settings"`) that `router.replace`s to chat, a `ProfileHeader` card, and four `SectionCard` groups built from a `sections` array:

- **Device** — Appearance (`value` = theme), Accent Color, General, Notifications, Voice, Safety & Security, Parental Controls.
- **Local Mode** — Personalization, Memory, Capabilities, Data Controls.
- **Cloud** — Account, Cloud Personalization, Cloud Memory, Cloud Data Controls, Email / Phone Number, Privacy, Billing, Usage, Connectors, and (when signed in) **Log Out** (`tone: 'danger'`). Cloud-gated rows carry a `tag` (`'Cloud'` when unlocked, `'Sign in'` when not) and open an `InviteCodeModal` via `openCloudAccess`.
- **Support** — Report App Issue (→ `/(app)/feedback`), Help Center (external URL), About (`value` = `v{appVersion}`).

Each row is a `SettingsListRow` `Pressable` with `accessibilityRole="button"` and a composed `accessibilityLabel` (`[label, value, tag].filter(Boolean).join('. ')`), a leading `lucide` icon, optional value text, optional pill badge, and a trailing `ChevronRight`. Sub-screens live under `src/features/settings/*` and are reached by `/(app)/settings/<name>` routes.

**KNOWN ISSUE — confirm fixed (MOB-6).** Skills and Plugins **settings rows were deliberately removed** from the Cloud section. The code comment at `apps/mobile/src/features/settings/index.tsx` (around the Cloud section) states: _"MOB-6: Skills and Plugins settings entries removed — the screens were never built and only opened a cloud gate (a dead-end). Per 'implement or remove dead-ends', they are removed until a real mobile Skills / Plugins management surface exists."_ Separately, the standalone `/(app)/skills` route (`apps/mobile/app/(app)/skills/index.tsx`) is a **proper explainer screen** ("AGI Cloud skills") with a _Join waitlist_ / _Enter invite code_ pair that opens `InviteCodeModal` — **not** a dead-end. Phase 15 must confirm both: (a) no Skills/Plugins row that dead-ends inside Settings, and (b) the standalone Skills screen either works (waitlist/invite path) or is unreachable from primary nav. A Skills/Plugins entry that taps to nothing, spins forever, or opens a blank screen is a **High** regression of MOB-6.

**Per-screen toggles.** Switches use `apps/mobile/components/ui/switch` (`Switch`) with `accessibilityLabel` set to the row label and `onValueChange`. Confirmed example: `apps/mobile/app/(app)/settings/performance.tsx` has three persisted toggles (Pause at serious thermal / Pause at 15% battery / Show performance chip), each a `ToggleRow` wrapping `Switch`. Haptics is a stored setting (`useSettingsStore().hapticsEnabled`, read by `apps/mobile/app/(app)/voice.tsx` and others); General settings (`src/features/settings/general/index.tsx`) is its home.

**Standalone feature screens in scope.** `account.tsx`, `usage.tsx`, `models.tsx`, `translate.tsx`, `compare.tsx` (re-export of `src/features/compare`), `image.tsx`, `voice.tsx`, `about.tsx`, `feedback.tsx` (re-export of `src/features/feedback`). Each has a header with an `ArrowLeft` back button (`accessibilityLabel="Go back"`) except `image.tsx` (Done/Close text button) and `voice.tsx` (floating `X`, `accessibilityLabel="Close voice companion"`). `usage.tsx` has a `RefreshControl` (pull-to-refresh, `tintColor={colors.teal}`) and `Animated.View entering={FadeInDown...}` staggered cards. `translate.tsx` uses `KeyboardAvoidingView` + a slide-up language-picker `Modal`. `voice.tsx` is a full-screen `reanimated` orb (pulsing scale/glow), `react-native-svg` radial-gradient background, `expo-haptics` on key transitions, and `useSafeAreaInsets()` for close-button top inset + bottom controls.

**Edge-case components (error/oversize states).** `apps/mobile/src/features/edge-cases/components/`: `MessageErrorScreen.tsx` exports `ModelMissingError`, `DiskFullError`, `NetworkError` (full-area inline screens, `accessibilityRole="alert"`, icon + title + body + teal retry CTA + optional dismiss); `FileTooLargeModal.tsx` and `ImageTooLargeModal.tsx` (`Modal`, `accessibilityRole="alertdialog"`, `accessibilityViewIsModal`, single teal dismiss CTA). Copy lives in `copy.ts` (`EDGE_COPY`).

**Theming.** Colors come from `useThemeColors()` / `colors` (`apps/mobile/src/ui/theme`). Theme mode is per-app-mode (local vs cloud) via `useLocalSettingsStore`/`useCloudSettingsStore` `themeMode` (`system | light | dark`); Appearance settings sets it. There is no hard-coded `#fff`/black in production paths except a small allow-list (`apps/mobile/scripts/.no-hex-baseline.json`) — invisible text in either mode is a real bug, not a theme limitation.

**Screen-specific anchors worth pinning before you run.** These come straight from the files and will save you from tapping blind:

- `account.tsx` — header `Account` + `Go back`; an avatar/identity `Card` (initial, display name, email, "Member since"); a **Subscription** card (`{tierLabel} Plan`, a `Badge`, a _Manage Subscription_ row that opens Stripe portal via `WebBrowser`/`isAllowedExternalUrl`, and a _Usage_ row showing `{conversations.length} chats` → pushes `/(app)/usage`); an **Account** card (_Manage Account Online_ link, `accessibilityRole="link"`, and _Sign Out_ with a confirmation `Alert`). Plan labels come from `getBillingPlanPricing(tier).label` (single source of truth — watch for any other screen showing a different label for the same tier, that's a parity-honesty bug).
- `usage.tsx` — header `Usage`; a `RefreshControl`; staggered `FadeInDown` cards: Usage-This-Period, Estimated API Spend, a StatsRow (Tokens / Conversations / Total Cost), a 7-day daily bar chart (`accessibilityRole="image"`, label "Daily token usage chart for the last 7 days"), a per-model breakdown with progress bars; an `ErrorCard` ("Usage data unavailable / Pull down to retry"); an Actions card (_Manage Subscription_, _Restore Purchases_ — the latter Alerts "available when the app launches on the App Store"). Gated behind `FEATURES.billing` (else `FeatureUnavailable`). Crucially, the screen comment says _"Usage returned by the billing API. Do not invent plan quotas here"_ — confirm no fabricated quota bars.
- `models.tsx` — header `Models` (`Go back` → `/(app)/settings/general`); an **Active Model** card (icon = `Cloud` for `cloud_managed` else `Cpu`, name + detail, opens `ModelPickerSheet`); optional **Favorites** and **Recent** cards (each row shows an install-status label: Ready / Downloading / Retry download / Package pending / Locked / Download required); a _Browse Models_ CTA. Cloud scope is gated by `cloudUnlocked` (`modelScope={cloudUnlocked ? 'all' : 'local'}`).
- `translate.tsx` — `On-device · Private` chip in the header (assert it is honest — translation must not egress in Local mode); language bar (source button, swap, target button), source `TextInput`, a disabled-until-non-empty _Translate_ button (`accessibilityState={{ disabled }}`), a target pane that streams tokens, copies, shows an error block (`#f87171` on a red tint), and a backend/performance chip; a slide-up language-picker `Modal` with radio rows (`accessibilityRole="radio"`, `accessibilityState={{ checked }}`).
- `image.tsx` — `Image` header with a _Done_ text button; an eyebrow "Select an image to analyse with on-device AI"; two option cards — Photo Library (`testID="image-picker-library-btn"`) and Camera (requests camera permission, deep-links to Settings if denied). Once an asset is chosen it swaps to the full-screen `ImageWithQuestion` flow.
- `about.tsx` — `About` header; Sparkles logo + "AGI Workforce" + `v{APP_VERSION}` + tagline "Private Local Mode and AGI Cloud, on your phone."; a Build Info card (Build / Platform / Runtime, read from the manifest and `package.json` so they never drift); Resources links (Website, Privacy, Terms, Open Source Licenses); a Support card (_Send Feedback_ → `/(app)/feedback`, _Contact Support_ `mailto:`); footer "AGI Automation LLC · USA".
- `voice.tsx` — full-screen companion: radial-gradient SVG background, a pressable terracotta orb (idle slow-pulse, thinking aggressive pulse, listening/speaking audio-reactive spring), phase labels (Tap to speak / Listening… / Thinking… / Speaking…), an `ON-DEVICE` model badge, a `PerformanceChip`, a transcript preview, and bottom Mute + TTS controls. All processing on-device; the file header asserts "No audio leaves the device" — Phase 16 must prove the cleanup path actually stops capture/TTS on background.
- `feedback.tsx` / `compare.tsx` — thin Expo route wrappers re-exporting `src/features/feedback` and `src/features/compare`; test the real implementations there.

---

## How to drive the simulator for this part (tool recipes you will reuse)

Part 3 leans on lifecycle, appearance, and gesture tools more than Parts 1–2. Standard recipes:

- **Open the drawer (phone):** `gesture` swipe from the left edge (start x≈2, within `swipeEdgeWidth=40`) → `wait_for_ui` for `AGI` wordmark / the Settings footer row → `screenshot`. Fallback: tap the header menu affordance if present. On a tablet sim (≥768pt) the drawer is permanent; do not swipe — assert it is already visible.
- **Navigate to a settings sub-screen:** open Settings → `snapshot_ui` → locate the row by composed `accessibilityLabel` (e.g. `"Appearance. Dark"`) → `tap` its frame center → `wait_for_ui` for the sub-screen header → `screenshot`.
- **Background / foreground:** `button` `home` to background → `screenshot` (springboard, optional) → `launch_app_sim` (relaunch into the running instance) → `wait_for_ui` for the last screen's anchor element → `screenshot`. Use `stop_app_sim` + `launch_app_sim` only when testing cold-start state loss explicitly.
- **Lock / unlock:** `button` `lock` → wait → `button` `lock` again (or the unlock affordance) → `wait_for_ui` → `screenshot`.
- **Rotate:** `button`/`key_sequence` for the simulator rotate command (Device ▸ Rotate Left/Right, ⌘→/⌘←) or `gesture` if exposed → `wait_for_ui` for a reflowed anchor → `screenshot`. Rotate back the same way and re-assert.
- **Dynamic Type:** set the simulator content-size via the accessibility override (Settings ▸ Accessibility ▸ Display & Text Size ▸ Larger Text on the sim, or the XcodeBuildMCP appearance/content-size control if available) to the **largest non-AX and largest AX** sizes; relaunch or re-render the screen → `snapshot_ui` (read frame heights, check for truncation flags) → `screenshot`.
- **Appearance (dark/light):** flip the simulator-level appearance (the XcodeBuildMCP appearance control, or Settings ▸ Developer ▸ Dark Appearance) when `themeMode='system'`, _and separately_ flip the in-app Appearance setting to Light/Dark to test the app's own override path. Re-`screenshot` each primary screen in both.
- **Animations / physics:** `record_sim_video` start → perform the gesture (drag, swipe, pull, long-press) → stop → review the clip for direction, duration, spring, jank, and snap behavior. Haptics cannot be felt in the sim; verify the _code path_ fires (`expo-haptics` call present and reached) and that the triggering interaction is correct.
- **VoiceOver / a11y tree:** `snapshot_ui` returns the accessibility hierarchy — assert every interactive node has a non-empty label/role and a frame ≥44×44pt. Where the sim exposes a VoiceOver toggle, enable it and `screenshot` the focus ring; otherwise the `snapshot_ui` tree is the source of truth.

Name every artifact `<phase>-<screen>-<state>` (e.g. `15-settings-cloud-section-dark`, `18-account-dynamictype-axxxl`, `20-drawer-backswipe-video`).

---

# Phase 15 — Settings tree, toggles, sign-out, and the Skills/Plugins dead-end check

**Goal.** Walk the entire settings tree row-by-row in both appearances and at default + large Dynamic Type. Verify every row is present, correctly labeled, lands on a real screen (no dead-ends), every toggle flips and persists, destructive actions confirm, and the MOB-6 Skills/Plugins removal is intact. Confirm the trust-boundary labeling (Local vs Cloud sections) is honest and that no setting silently switches mode or routes Local data to Cloud.

### Tool sequence

1. From chat, open the drawer (left-edge `gesture` swipe, phone) → `wait_for_ui` for the footer `Settings` row → `record_sim_video` start.
2. `tap` the Settings row → `wait_for_ui` for the `Settings` title and the `Close settings` button → `screenshot` `15-settings-landing-dark`.
3. `snapshot_ui` → enumerate the full tree. Confirm the four section headers (`Device`, `Local Mode`, `Cloud`, `Support`) and every expected row (list above). Assert the `ProfileHeader` card shows a sane name/subtitle (`Local profile` / `Local mode active` in local mode; `AGI Cloud` in cloud mode) and `accessibilityLabel="Edit profile"`.
4. **Dead-end scan (MOB-6).** Search the `snapshot_ui` tree for any row labeled `Skills` or `Plugins` inside Settings. **Expected: none.** If present, tap it and verify it lands on a real management surface; if it opens only a cloud gate / blank / spinner, log **High** (MOB-6 regression).
5. **Walk every Device + Local Mode row.** For each: `tap` → `wait_for_ui` for the sub-screen header → `snapshot_ui` → `screenshot` (`15-settings-<row>-dark`) → assert the back button (`Go back`) returns to the same scroll position in Settings. Repeat for Appearance, Accent Color, General, Notifications, Voice, Safety & Security, Parental Controls, Personalization, Memory, Capabilities, Data Controls.
6. **Toggles.** On a screen with switches (e.g. Performance via General → Performance, or Notifications), `snapshot_ui` to read each `Switch` `accessibilityLabel` and current `value` → `tap` the switch frame → `wait_for_ui` for the value change → `screenshot` before/after → background+relaunch (`button home` → `launch_app_sim`) → re-open the screen → assert the new value **persisted**. Toggle back to restore state.
7. **Cloud section + gating.** `tap` a Cloud-gated row (e.g. Cloud Memory, tag `Sign in`/`Cloud`) → `wait_for_ui` for the `InviteCodeModal` → `screenshot` → confirm it is an explicit gate (waitlist/invite tabs), **not** a silent mode switch. Dismiss. Tap a real Cloud sub-screen (Privacy, Billing, Usage, Connectors) → confirm it loads.
8. **Sign-out.** If signed in, `tap` `Log Out` (`tone: 'danger'`) → `wait_for_ui` for the `Alert` (`"Log out of AGI Cloud on this device?"`) → `screenshot` → tap `Cancel` first (verify no-op) → re-trigger → tap `Log Out` → `wait_for_ui` for the post-logout state → `screenshot`. (Also covers `account.tsx`'s `handleSignOut` Alert: `"Are you sure you want to sign out?"`.)
9. **Support section.** Tap Report App Issue → confirm it pushes `/(app)/feedback` with `returnTo`. Tap About → confirm `/(app)/about` and the `v{appVersion}` value matches. Tap Help Center → confirm it opens the external URL via the safe-URL path (does **not** open an in-app webview with Local data).
10. `record_sim_video` stop (`15-settings-walkthrough-video`). Repeat the visual pass in **Light** appearance and at **largest Dynamic Type** (steps 2–3 minimum on each section card).

### Expected UI / behavior

- Every row renders with icon + label, correct value/badge, and a trailing chevron (or a `Switch` for toggle rows). No row is dead (every tap navigates, opens a sheet/modal, or fires a confirmable action).
- Section grouping honestly reflects trust boundaries: Local Mode rows manage on-device data; Cloud rows are visibly tagged and gated; nothing in a Local row routes to Cloud.
- Toggles flip instantly, are visually unambiguous (on/off), and persist across relaunch.
- Destructive actions (Log Out) require a confirmation `Alert` with a Cancel path.
- The close (`X`) button returns to chat; the back button on every sub-screen returns to Settings at the prior scroll offset.

### Acceptance criteria

- [ ] All four sections and every documented row present, correctly labeled, and reachable.
- [ ] **No Skills or Plugins row inside Settings** (MOB-6 intact); if a standalone Skills screen is reachable, it shows the AGI Cloud skills explainer with working waitlist/invite, not a blank/dead-end.
- [ ] Every Device + Local Mode sub-screen loads a real screen with a working back button; none 404, blank, or spin forever.
- [ ] At least one toggle verified to flip _and persist_ across background→relaunch.
- [ ] Cloud-gated rows open an explicit `InviteCodeModal` (gate), never a silent Local→Cloud switch.
- [ ] Log Out shows a confirmation Alert with a working Cancel.
- [ ] Settings legible and non-clipping in light + dark and at largest Dynamic Type.

### Parity notes

- **ChatGPT iOS:** grouped settings list, large title, account/data/voice/about clusters, destructive sign-out with confirm. AGI matches the grouped-list + confirm-on-destructive convention; AGI's explicit Local vs Cloud split is _stronger_ than ChatGPT's single account model and must read as intentional, not confusing.
- **Claude iOS:** clean sectioned settings, appearance control, feedback entry, version in About. AGI matches the section/appearance/about conventions. Parity is the _interaction pattern_ (tap row → push detail, toggle inline, confirm destructive) — never the labels or copy.

### Bug-classification examples

- A Skills/Plugins settings row that opens a blank screen or only a cloud gate → **High** (MOB-6 regression / dead-end).
- A toggle that flips visually but does not persist across relaunch → **Medium**.
- Log Out with no confirmation (immediate sign-out) → **High** (data-loss-adjacent / accidental).
- A Local Mode row that triggers a network request to a cloud endpoint → **Critical** (trust-boundary violation).
- Cloud rows untagged so the user can't tell Local from Cloud → **Medium** (honesty/clarity).
- Section header invisible in light mode → **Medium** (contrast).

### Recovery

If a sub-screen crashes on entry, capture `snapshot_ui` + `screenshot` + console, attach LLDB in Part 4 (`debug_attach_sim`, breakpoint on the screen component), and continue the walk on the remaining rows. If sign-out wedges auth, `stop_app_sim` + `launch_app_sim` to recover and note the repro.

### Checklist

- [ ] `record_sim_video` of the full settings walkthrough captured.
- [ ] All sections/rows enumerated from `snapshot_ui` and screenshotted (dark + light).
- [ ] MOB-6 dead-end scan performed and result logged.
- [ ] Toggle persistence verified across relaunch.
- [ ] Destructive sign-out confirm-flow verified (Cancel + confirm).
- [ ] Largest-Dynamic-Type pass on every section card.

---

# Phase 16 — Backgrounding, lifecycle, lock/unlock, and memory pressure

**Goal.** Prove the app survives the iOS lifecycle: backgrounding and relaunch restore state (current chat, scroll position, composer draft, settings screen), streaming behaves correctly when backgrounded mid-generation, lock/unlock is a clean no-op for state, and a simulated memory warning does not corrupt or silently drop user data.

### Tool sequence

1. **State restoration — chat.** Open a chat with several messages, scroll up partway, type a draft into `chat.composer.input` but **do not send**. `snapshot_ui` to record scroll offset + draft text → `screenshot` `16-chat-before-background`.
2. `button` `home` → app backgrounds → optional `screenshot` of springboard → `wait_for_ui` (short) → `launch_app_sim` to foreground → `wait_for_ui` for the chat anchor → `snapshot_ui` → `screenshot` `16-chat-after-relaunch`. **Assert:** same conversation, scroll position roughly preserved, **composer draft intact**.
3. **State restoration — settings/form.** Repeat steps 1–2 on a form screen: `translate.tsx` with `sourceText` typed (not yet translated), and a Settings sub-screen scrolled down. Assert text/scroll restored.
4. **Background during streaming.** Send a prompt to a local model → while tokens are streaming, `button home` to background → `record_sim_video` not applicable (backgrounded), but immediately `launch_app_sim` → `wait_for_ui` → `snapshot_ui`. **Assert:** either the stream resumed/continued to completion, or it stopped cleanly with a partial message + a retry affordance — **never** a duplicated message, a stuck spinner, or a torn half-rendered bubble. Confirm **no Local egress** occurred while backgrounded.
5. **Lock / unlock.** With a chat open, `button lock` → wait 2–3s → `button lock` (or unlock affordance) → `wait_for_ui` → `screenshot` `16-chat-after-unlock`. Assert the screen is identical, no spurious reload, no auth re-prompt mid-session.
6. **Voice during lifecycle.** Open `voice.tsx`, start listening, then `button home`. **Assert:** `voice.tsx`'s cleanup (`activeRef=false`, `VoiceInput.cancelCapture()`, `VoiceOutput.stop()`) fires — capture must stop, no mic indicator persists in the background, no audio leaves the device. Relaunch → orb returns to `idle`.
7. **Memory warning.** Trigger the simulator memory warning (Simulator ▸ Features ▸ Simulate Memory Warning, or the equivalent XcodeBuildMCP control) while a long conversation is open → `wait_for_ui` → `snapshot_ui` → `screenshot` `16-chat-after-memwarning`. Assert the list re-renders intact (virtualization may drop/recreate offscreen rows — acceptable), the current message and draft survive, and the app does not crash.
8. **Cold-start vs warm-start.** `stop_app_sim` then `launch_app_sim` (cold) → measure time to first interactive frame → `wait_for_ui` for chat anchor → `screenshot`. Compare to warm relaunch from step 2. Note any state intentionally not persisted across cold start (and confirm that is by design, not a bug).

### Expected UI / behavior

- Warm relaunch restores the foreground screen, conversation, scroll, and unsent composer/form drafts.
- Streaming interrupted by backgrounding ends in a coherent state (complete, or partial-with-retry) — no duplicates, no torn UI.
- Lock/unlock is invisible to app state.
- Voice capture and TTS stop on background; nothing audible or networked continues.
- Memory warning is survived gracefully; no crash, no silent data loss.

### Acceptance criteria

- [ ] Chat conversation + scroll + unsent draft restored after background→relaunch.
- [ ] At least one form screen (translate / settings) restores its in-progress input.
- [ ] Backgrounding mid-stream yields a coherent message (no dup, no stuck spinner, no torn bubble) and **zero Local egress**.
- [ ] Lock/unlock causes no reload, no auth re-prompt, no state change.
- [ ] Voice capture/TTS provably stop on background.
- [ ] Memory warning survived without crash or data loss.

### Parity notes

- **ChatGPT iOS / Claude iOS:** both restore the active conversation and unsent draft on relaunch, both handle backgrounding mid-stream without duplicating the answer, and neither leaks mic/audio when backgrounded. AGI must match this restoration + clean-interrupt behavior. Parity here is purely lifecycle correctness.

### Bug-classification examples

- Unsent composer draft lost on relaunch → **Medium** (degraded UX; ChatGPT/Claude preserve it).
- Backgrounding mid-stream duplicates the assistant message → **High** (core flow broken).
- Mic capture continues / audio plays after `home` → **Critical** (privacy / trust boundary).
- Any network request from Local mode while backgrounded → **Critical**.
- Crash on simulated memory warning → **Critical**.
- Auth re-prompt after a 3-second lock → **Medium** (annoying, non-standard).

### Recovery

On a lifecycle crash, capture the crash log and reproduce under LLDB in Part 4 (`debug_attach_sim`, `debug_continue`, `debug_stack` at the fault). If relaunch lands on a blank screen, `stop_app_sim` + cold `launch_app_sim`, and record whether state loss is the cold-start design or a warm-restore bug.

### Checklist

- [ ] Background→relaunch state restoration verified on chat + one form.
- [ ] Mid-stream background interruption tested; egress checked.
- [ ] Lock/unlock no-op verified.
- [ ] Voice background cleanup verified.
- [ ] Memory-warning survival verified.
- [ ] Cold vs warm start compared and any intentional non-persistence noted.

---

# Phase 17 — Rotation and layout reflow

**Goal.** Confirm the app reflows correctly between portrait and landscape on chat and on a form screen, returns cleanly to portrait, and — on a tablet-class width — presents the permanent drawer sidebar without breaking content layout. Catch clipped headers, overlapping safe-area insets, frozen scroll, and lost state across rotation.

### Tool sequence

1. **Chat — portrait → landscape.** Open a chat with content. `record_sim_video` start → `snapshot_ui` + `screenshot` `17-chat-portrait`. Rotate to landscape (`button`/`key_sequence` for Rotate Left, or the sim rotate control) → `wait_for_ui` for the chat anchor → `snapshot_ui` → `screenshot` `17-chat-landscape`. **Assert:** message list reflows to the wider width, composer stays pinned and full-width, header is not clipped, no element overlaps the notch/home-indicator insets, scroll still works.
2. **Chat — keyboard in landscape.** With the keyboard open in landscape, `screenshot` → assert the composer remains visible above the keyboard (no occlusion) and the list shifts appropriately (`KeyboardAvoidingView` behaves).
3. **Form — rotate.** Open `translate.tsx` (a `KeyboardAvoidingView` + language-bar + panes screen). Portrait `screenshot` `17-translate-portrait` → rotate to landscape → `wait_for_ui` → `screenshot` `17-translate-landscape`. **Assert:** language buttons + swap stay on one row or wrap sanely, source/target panes resize, the language-picker `Modal` (open it in landscape) renders as a bottom sheet without clipping. Repeat with a Settings sub-screen (a scrolling card list) to confirm cards reflow to the wider column.
4. **Rotate back.** Rotate to portrait → `wait_for_ui` → `snapshot_ui` → `screenshot`. **Assert:** layout returns to the portrait baseline, no residual landscape sizing, content/state preserved (draft text, scroll).
5. **Tablet-class width (if testing an iPad sim or a wide window).** Launch on an iPad simulator (width ≥768pt). **Assert:** the drawer is **permanent** (always-visible 280pt sidebar per `_layout.tsx`), `swipeEnabled` is false (an edge swipe must **not** also slide a second drawer), and the main content occupies the remaining width without the composer/header stretching awkwardly. `screenshot` `17-ipad-permanent-drawer`.
6. `record_sim_video` stop (`17-rotation-video`).

### Expected UI / behavior

- Both orientations are usable: nothing clipped, overlapped, or frozen; scroll and input work in both.
- Safe-area insets recompute on rotation (landscape notch inset on the side, home-indicator at the bottom).
- Rotating back restores the portrait layout and preserves state.
- On tablet width, the permanent sidebar is correct and edge-swipe does not summon a duplicate drawer.

### Acceptance criteria

- [ ] Chat reflows correctly portrait↔landscape; composer stays pinned and unobstructed (incl. with keyboard up).
- [ ] At least one form screen (translate) reflows correctly, including its modal/sheet.
- [ ] Rotating back to portrait restores the baseline layout and preserves state/draft/scroll.
- [ ] On tablet width, the permanent drawer renders and edge-swipe is disabled (no double-drawer).
- [ ] No safe-area overlap (notch/home-indicator) in either orientation.

### Parity notes

- **ChatGPT iOS / Claude iOS:** both remain fully usable in landscape and present an iPad sidebar/regular layout at wide widths. AGI's permanent-drawer-at-≥768 matches the iPad sidebar convention. Parity = "usable and uncluttered in every orientation/size," not pixel layout.

### Bug-classification examples

- Header text or back button clipped in landscape → **Medium**.
- Composer hidden behind the keyboard in landscape → **High** (core flow blocked).
- Scroll freezes after rotation → **High**.
- Edge-swipe on iPad opens a second overlay drawer on top of the permanent one → **Medium**.
- Content under the notch inset in landscape → **Medium** (safe-area).
- Draft/scroll lost on rotate-back → **Medium**.

### Recovery

If rotation wedges layout (blank or zero-height list), rotate back and re-`snapshot_ui`; if still broken, relaunch and note whether the break is rotation-triggered or persistent. Capture both orientation screenshots for the issue.

### Checklist

- [ ] Chat tested in both orientations (incl. keyboard-up landscape).
- [ ] Form screen + its modal tested in landscape.
- [ ] Rotate-back state/layout restoration verified.
- [ ] Tablet permanent-drawer behavior verified (if applicable).
- [ ] Safe-area checked in landscape.
- [ ] `record_sim_video` of rotation captured.

---

# Phase 18 — Accessibility (Dynamic Type, VoiceOver, tap targets, contrast, focus order, reduce-motion)

**Goal.** Make the app usable by everyone: layouts hold at the largest text sizes without clipping, every interactive element exposes a VoiceOver-usable label/role via the accessibility tree, tap targets meet the 44pt minimum, contrast passes in both appearances, focus order is logical, and reduce-motion is respected.

### Tool sequence

1. **Dynamic Type sweep.** For each primary screen (chat, settings landing, account, usage, models, translate, about, feedback, a settings sub-screen): set the sim content size to **largest non-AX (XXL)** then **largest AX (AX5)** → relaunch/re-render → `snapshot_ui` (read each text node's frame height and any truncation flag) → `screenshot` `18-<screen>-axxxl`. **Assert:** text scales, lines wrap (not clip), buttons grow to fit their label, no row collapses to overlap, headers don't truncate the screen title to an ellipsis where it shouldn't. Pay special attention to dense rows: `SettingsListRow` (icon + label + value + badge + chevron), `usage.tsx` stat rows, `models.tsx` rows.
2. **VoiceOver label audit.** On each screen, `snapshot_ui` → walk the accessibility tree → for **every** node that is interactive (`accessibilityRole` of `button`/`link`/`radio`/`switch`/`image` with an action, or a `Pressable`), assert a **non-empty `accessibilityLabel`** and a sensible role. Known-good anchors to spot-check: back buttons (`Go back`), `Close settings`, `Close voice companion`, settings row composed labels (`"<label>. <value>. <tag>"`), `Switch` labels (= row label), drawer rows (`"Open conversation: <title>"` + hint `"Long press to pin or delete"`), translate `"Swap languages"` / `"Source text input"` / `"Copy translation"`, image picker `"Choose from photo library"` / `"Take a photo with camera"`, voice orb (`PHASE_LABEL` + hint `"Tap to start or stop listening"`), charts (`accessibilityRole="image"` with a descriptive label, e.g. usage `"Daily token usage chart for the last 7 days"`). **Any interactive node with an empty/missing label is a bug.**
3. **Tap-target audit.** From the same `snapshot_ui`, compute each interactive frame. **Assert ≥44×44pt** (or an effective `hitSlop` that brings it there). Watch the small icon buttons: translate clear/copy (`padding: 4`), settings close (40pt — OK), drawer search clear (28pt visual but `hitSlop={8}` → 44 — OK if hitSlop is honored), about/feedback link rows (`minHeight: 40` → flag), the `voice.tsx` close (`36pt` → flag if no hitSlop). Log anything under 44 without compensating hitSlop.
4. **Contrast.** In both appearances, `screenshot` each primary screen and check text-on-surface and icon-on-surface contrast (muted text on elevated surface is the usual risk: `textMuted`, `textSecondary` on `surfaceElevated`/`surfaceBase`). Flag any text that approaches invisibility (e.g. `text-white/30` style muted captions on a near-white light surface). The error-state red (`#f87171`) on its tinted background and disabled (`opacity: 0.5`) states must remain legible.
5. **Focus order.** Where the sim exposes VoiceOver, enable it and swipe-right through a screen (settings landing, chat) → confirm focus moves top→bottom, left→right, header before content, and that modals/sheets trap focus (the `FileTooLargeModal`/`ImageTooLargeModal` use `accessibilityViewIsModal` — confirm focus does not escape behind them). Capture the focus ring via `screenshot`.
6. **Reduce-motion.** Enable Reduce Motion on the sim → re-enter screens with entrance animations (`usage.tsx` `FadeInDown`, `voice.tsx` orb pulse + `FadeIn` badges, any screen-transition). **Assert:** animations are reduced/removed or made instant, content still appears (never hidden because an animation was skipped), and the voice orb does not pulse aggressively. The codebase reads `AccessibilityInfo`/reduce-motion in several components (MessageList, ChatInput, ApprovalModal, voice) — confirm the reduced path is actually taken.
7. **Announcements.** Trigger an async action that announces (e.g. Performance ▸ Run Benchmark calls `AccessibilityInfo.announceForAccessibility('Running benchmark…')` and again on completion/failure). Confirm the announcement fires (observable in the a11y tree / VoiceOver) so non-visual users get progress.

### Expected UI / behavior

- All text scales with Dynamic Type up to AX5 without clipping or overlap; controls grow to fit.
- Every interactive element has a meaningful VoiceOver label + role; charts/icons-as-content have image roles with descriptions.
- Tap targets are ≥44pt (directly or via hitSlop).
- Contrast passes in light + dark; disabled and error states stay legible.
- Focus order is logical; modals trap focus.
- Reduce-motion is honored without hiding content; key async actions announce progress.

### Acceptance criteria

- [ ] Every primary screen holds layout at AX5 (no clipping/overlap); evidence captured.
- [ ] **Zero** interactive nodes with empty/missing `accessibilityLabel` across audited screens.
- [ ] All interactive tap targets ≥44pt or compensated by hitSlop; sub-44 targets logged.
- [ ] No invisible/near-invisible text in either appearance; disabled/error states legible.
- [ ] Focus order logical; `accessibilityViewIsModal` modals trap focus.
- [ ] Reduce-motion reduces/removes animations without hiding content.
- [ ] At least one async action's accessibility announcement verified.

### Parity notes

- **ChatGPT iOS / Claude iOS:** both fully support Dynamic Type (including AX sizes), label every control for VoiceOver, meet 44pt targets, and honor reduce-motion. This is table stakes, not a differentiator — AGI must meet the same bar. Parity = the _accessibility contract_, achieved with AGI's own labels/copy.

### Bug-classification examples

- Settings row text clipped/overlapping the chevron at AX5 → **Medium**.
- An interactive icon button (e.g. translate copy) with no `accessibilityLabel` → **Medium** (key control missing a11y label).
- A primary action whose tap target is 30pt with no hitSlop → **Medium**.
- Muted caption invisible on the light surface → **Medium** (contrast).
- A modal that lets VoiceOver focus the content behind it → **Medium** (focus trap broken).
- An entrance animation that, under reduce-motion, leaves the content permanently hidden → **High** (content unreachable).

### Recovery

If enabling VoiceOver/Reduce-Motion on the sim destabilizes input, disable it, relaunch, and continue with the `snapshot_ui` tree as the a11y source of truth (it carries labels/roles/frames even without VoiceOver running). Log the sim limitation, not as an app bug.

### Checklist

- [ ] Dynamic Type AX5 sweep across primary screens.
- [ ] VoiceOver label/role audit from `snapshot_ui` on every screen.
- [ ] Tap-target measurement pass; sub-44 list compiled.
- [ ] Contrast pass in light + dark.
- [ ] Focus-order + modal focus-trap check.
- [ ] Reduce-motion behavior verified (no hidden content).
- [ ] Async announcement verified.

---

# Phase 19 — Dark / Light mode across every primary screen

**Goal.** Screenshot every primary screen in both appearances and confirm there is no invisible text, surfaces and borders are correct, icons/badges adapt, and the high-frequency composites — tool-call card, composer, and bottom sheets/modals — read correctly in both. Test both the system-driven path (`themeMode='system'`) and the app's own Appearance override.

### Tool sequence

1. **Baseline both ways.** Set Appearance to **System**, flip the sim appearance to Dark → `screenshot` the chat. Flip sim to Light → `screenshot`. Then set Appearance explicitly to **Light**, confirm the app stays light even when the sim is Dark (override path), and vice-versa. This proves both the system-follow and the explicit-override code paths.
2. **Per-screen pass.** For each primary screen — chat (empty + populated), settings landing + one sub-screen, account, usage (loading + loaded + error card), models, translate (with a result), compare, image picker, about, feedback, drawer — capture **both** appearances: `screenshot` `19-<screen>-dark` and `19-<screen>-light`. Use `snapshot_ui` first to ensure the same state in both shots.
3. **Composites.** Capture in both appearances: the **composer** (idle, with text, disabled send), the **tool-call card** (`InlineToolCall`/`ToolTimeline` — from a chat that ran a tool), and **sheets/modals**: `ModelPickerSheet`, `AddToChatSheet`, `InviteCodeModal`, translate language `Modal`, `FileTooLargeModal`/`ImageTooLargeModal`, the long-press `Alert`. For each: `screenshot` dark + light.
4. **Inspect each shot for:** (a) no invisible text (muted/secondary text must clear its surface in _both_); (b) correct surface hierarchy (`surfaceBase` < `surfaceElevated` < `surfaceHover`/overlay) — cards must be distinguishable from the screen background; (c) borders visible but not harsh; (d) icons/badges legible (teal accent, warning amber, error red) on both backgrounds; (e) scrims/overlays (`colors.scrim`, modal `rgba(0,0,0,…)`) dim correctly; (f) the keyboard-region and safe-area fills match the surface (no white band under a dark composer).
5. **Accent color interaction.** Change Accent Color (Settings ▸ Accent Color) and confirm the accent recolors consistently (active model icon, primary CTAs, chart bars) in both appearances without producing low-contrast combinations.

### Expected UI / behavior

- Every screen is fully legible in both appearances; no element only works in one.
- Surfaces are layered and distinguishable; borders subtle but present.
- Accent/warning/error colors remain legible on both backgrounds.
- Sheets/modals dim the backdrop and render their own surface correctly in both.
- The explicit Appearance override beats the system setting when set; System follows the OS.

### Acceptance criteria

- [ ] Every primary screen screenshotted in **both** appearances; no invisible text found.
- [ ] Card/surface hierarchy and borders correct in both.
- [ ] Tool-call card, composer, and every sheet/modal verified in both.
- [ ] Accent / warning / error colors legible on both backgrounds.
- [ ] Both the system-follow and explicit-override theme paths verified.

### Parity notes

- **ChatGPT iOS / Claude iOS:** both ship polished, fully-legible dark _and_ light themes with layered surfaces, an in-app appearance control, and theme-correct sheets/keyboards. AGI must match the completeness (no one-theme-only screens) using its own palette. Parity = "both themes are first-class," not the specific colors.

### Bug-classification examples

- Any text that is invisible or near-invisible in light _or_ dark → **High** if it blocks reading core content, else **Medium**.
- A card indistinguishable from the background in one theme → **Medium**.
- A modal whose surface is dark in light mode (stale theme) → **Medium**.
- A white safe-area band under a dark composer → **Medium** (cosmetic-to-Low if minor).
- Accent color producing teal-on-teal low contrast in one theme → **Medium**.

### Recovery

If flipping appearance leaves a screen half-themed (some elements stale), navigate away and back to force a re-render; if it persists, it's a real theme-subscription bug — capture both shots and log. Note whether it reproduces on the system path, the override path, or both.

### Checklist

- [ ] System-follow + explicit-override paths both exercised.
- [ ] All primary screens captured in dark + light.
- [ ] Composer, tool-call card, all sheets/modals captured in both.
- [ ] Surface/border/contrast inspection done per shot.
- [ ] Accent-color interaction checked in both themes.

---

# Phase 20 — Gestures, animations, physics, haptics, transitions, and safe-area

**Goal.** Validate the native-feel layer: back-swipe navigation, long-press context menus, pull-to-refresh, bottom-sheet drag + snap points, scroll momentum/bounce, screen-transition direction/duration, haptics on the right actions, and correct safe-area handling on notch + home-indicator across screens. This is where "feels like a real app" is won or lost.

### Tool sequence

1. **Back-swipe.** On a pushed screen (e.g. `chat/[id]` opened from the drawer, or a settings sub-screen), `record_sim_video` start → `gesture` swipe from the left edge → `wait_for_ui` for the previous screen → `screenshot`. **Assert:** the interactive back-swipe tracks the finger and either completes (pops) or cancels (springs back) — no dead zone, no jump. On phones, also confirm the **drawer** edge-swipe (Phase 15/17) does not conflict with screen back-swipe (drawer edge-swipe is the app-root gesture; pushed-screen back-swipe is the stack gesture — both should feel intentional).
2. **Long-press menus.** In the drawer, `long_press` a Recents row → `wait_for_ui` for the `Alert` (Pin/Unpin, Delete, Cancel) → `screenshot` `20-drawer-longpress-menu`. Verify the destructive Delete chains to a second confirm (`"Delete chat? This cannot be undone."`). In chat, `long_press` a message bubble → verify the message context menu (copy/edit/etc., per Part 2) appears. Confirm a light **haptic** is the intended trigger feedback (code path present).
3. **Pull-to-refresh.** On `usage.tsx`, `gesture` pull-down past the threshold → `wait_for_ui` for the `RefreshControl` spinner (`tintColor` teal) → release → `wait_for_ui` for refreshed cards → `screenshot` before/after. **Assert:** the spinner appears at the right threshold, data reloads (or the error card shows with "Pull down to retry"), and the list settles without jump.
4. **Bottom-sheet drag + snap.** Open `ModelPickerSheet` (Models ▸ Browse Models, or composer model button) → `record_sim_video` → `drag` the sheet handle up and down → **assert** it honors snap points (snaps to defined detents, not arbitrary rest), can be flung to dismiss, and the backdrop scrim fades with position. Repeat for `AddToChatSheet` and the translate language `Modal` (slide-up). Confirm `bottom-sheet` testID where present.
5. **Scroll physics.** On a long chat and on the settings `ScrollView`, `gesture` a fast flick → **assert** momentum decay feels native and the top/bottom **bounce** (iOS rubber-band) is present; on the virtualized message list, confirm no blank/stutter as rows recycle during the fling. `record_sim_video` `20-chat-scroll-momentum`.
6. **Screen transitions.** Navigate forward into a pushed screen and back → `record_sim_video` → **assert** the transition direction is correct (push slides in from the right, pop slides out to the right; drawer slides from the left; modals/sheets slide up), duration is snappy (~250–350ms, matching the `FadeInDown.duration(200–250)` and reanimated springs in the codebase), and there is no flash/flicker between screens.
7. **Haptics audit (code-path).** Haptics cannot be felt in the sim — verify the _correct actions_ call `expo-haptics` and the call is reached: `voice.tsx` fires `ImpactFeedbackStyle.Light` on start-listen / stop-process / mute-toggle and `Heavy` on close; confirm other key actions (send, long-press menu open, destructive confirm, toggle) have their intended haptic per the component code, gated by `hapticsEnabled`. Then **flip `hapticsEnabled` off** (General settings) and confirm the guarded calls are skipped (no errors), proving the setting is honored.
8. **Safe-area sweep.** On a notch + home-indicator device profile, `snapshot_ui` + `screenshot` each screen type and **assert:** top content clears the notch/status bar (`SafeAreaView` `edges` include `top`; `voice.tsx` uses `insets.top + 10` for the close button), bottom content (composer, voice controls `insets.bottom + 20`, tab-less footer) clears the home indicator, and full-bleed backgrounds (voice gradient, image picker) extend _under_ the insets while interactive content stays within them. Check both orientations (cross-ref Phase 17) and both appearances (no mismatched safe-area fill).

### Expected UI / behavior

- Back-swipe is interactive and reversible; drawer vs stack swipe don't fight.
- Long-press opens the right menu with destructive double-confirm; intended haptic fires.
- Pull-to-refresh triggers at threshold, reloads/refreshes, settles cleanly.
- Bottom sheets honor snap points, fling-to-dismiss, and scrim-with-position.
- Scroll has native momentum + bounce; virtualized list doesn't stutter on fling.
- Transitions are correctly directed, snappy, flicker-free.
- Haptics fire on the right actions and are suppressed when `hapticsEnabled` is off.
- Safe-area is correct on notch + home-indicator, in both orientations and appearances; backgrounds bleed under insets, content stays within.

### Acceptance criteria

- [ ] Interactive back-swipe works and reverses; no conflict between drawer and stack swipes.
- [ ] Long-press menu (drawer Recents + chat message) appears; destructive actions double-confirm.
- [ ] Pull-to-refresh on usage triggers, refreshes/errors gracefully, and settles.
- [ ] At least two bottom sheets honor snap points + fling-dismiss + scrim fade.
- [ ] Scroll momentum + bounce present; no stutter on virtualized fling.
- [ ] Transitions correctly directed and snappy with no flicker.
- [ ] Haptic code paths verified on key actions and suppressed when disabled.
- [ ] Safe-area correct across screens on notch + home-indicator (both orientations).

### Parity notes

- **ChatGPT iOS:** interactive back-swipe, long-press message menus, snap-point sheets (model/attachment pickers), pull-to-refresh on lists, momentum scrolling, subtle haptics on send/long-press, and pixel-correct safe-area. AGI must match these _interaction physics_.
- **Claude iOS:** smooth sheet detents, reversible navigation gestures, restrained haptics, clean safe-area on notch/home-indicator. AGI matches the convention set (reversible gestures, real snap points, restrained haptics) — not the exact spring constants.

### Bug-classification examples

- Back-swipe that pops with no tracking (instant jump, not reversible) → **Medium** (feels non-native).
- Long-press Delete with no second confirm → **High** (accidental data loss).
- Bottom sheet that rests at arbitrary positions (no snap) or can't be dismissed by fling → **Medium**.
- Scroll stutter / blank rows during fast fling on long chats → **Medium** (degraded UX; cross-ref virtualization).
- Wrong transition direction (push slides up, or pop flashes) → **Low/Cosmetic** unless disorienting.
- Haptic firing on every scroll tick or not at all on send → **Low** (polish) — unless it ignores `hapticsEnabled`, then **Medium**.
- Content clipped under the notch or behind the home indicator → **Medium** (safe-area).
- A non-reanimated screen-transition flash exposing a white frame in dark mode → **Cosmetic/Low**.

### Recovery

If a gesture leaves the UI in a partial state (sheet stuck half-open, swipe stranded), tap the scrim or `button home`+`launch_app_sim` to reset, and capture the `record_sim_video` of the stuck state for the issue. For physics judgments, prefer the video over a single screenshot — jank and snap behavior are only visible in motion.

### Checklist

- [ ] Back-swipe interactivity + drawer/stack non-conflict captured on video.
- [ ] Long-press menus + destructive double-confirm verified.
- [ ] Pull-to-refresh (usage) verified incl. error path.
- [ ] Bottom-sheet snap/fling/scrim verified on ≥2 sheets.
- [ ] Scroll momentum/bounce + virtualization-under-fling captured.
- [ ] Transition direction/duration/flicker reviewed on video.
- [ ] Haptic code paths verified + `hapticsEnabled`-off suppression verified.
- [ ] Safe-area sweep across screens (notch + home-indicator, both orientations).

---

## Part 3 exit criteria

Before moving to Part 4 (debugging, coverage, regression, batch automation, performance/memory, failure recovery, end-of-run report), confirm:

- [ ] Phases 15–20 each completed with `screenshot` evidence (dark + light where visual) and `record_sim_video` for every animated/multi-step workflow.
- [ ] Every screen in scope was run through the **20-point per-screen template** and any deviation logged as a classified issue `{id, severity, phase, screen, testID, expected, actual, screenshot, video, repro, suggested fix}`.
- [ ] **MOB-6 confirmed:** no dead-end Skills/Plugins entry in Settings; standalone Skills screen works or is unreachable from primary nav.
- [ ] **Trust boundary intact:** zero Local-mode network egress observed during backgrounding, lifecycle, or any gesture/navigation in this part. Any egress was logged **Critical** and reported immediately.
- [ ] Accessibility bar met: AX5 layouts hold, every interactive element has a VoiceOver label, tap targets ≥44pt (or hitSlop), contrast passes in both themes, reduce-motion honored.
- [ ] Lifecycle correctness met: warm relaunch restores state; mid-stream background is coherent; lock/unlock is a no-op; memory warning survived.
- [ ] Tools exercised in this part (`launch_app_sim`, `button`, `key_sequence`, `gesture`, `drag`, `long_press`, `swipe`, `snapshot_ui`, `wait_for_ui`, `screenshot`, `record_sim_video`, `batch`) recorded in the running tool-usage matrix; any not-yet-used tool is flagged for Part 4 to close.

> Parity reminder for the whole part: every comparison to ChatGPT iOS or Claude iOS is about **behavior, interaction physics, and platform convention** — never copied assets, text, icons, layout pixels, or branding. AGI ships its own palette, copy, and structure; it must merely _behave_ as native and complete as the category leaders. This file is a runbook of steps and acceptance gates — it does not contain or imply test results. Results, screenshots, videos, and the classified issue list are produced by an actual run and assembled in Part 4.
