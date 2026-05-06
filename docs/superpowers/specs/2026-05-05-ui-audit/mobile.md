# Mobile UI/UX Gap Audit — 2026-05-05

## Surface

- App path: `apps/mobile/`
- Refs studied: 10 screenshots (note: no mobile-native refs — adapted from compact + general layouts: ChatGPT popout, Codex popout, Claude desktop, Claude Chrome extension, Claude desktop settings/pricing)
- Engineer: mobile-engineer

## A. Current state inventory

1. **Drawer navigation** — `apps/mobile/app/(app)/_layout.tsx:34` — Expo drawer replaces tabs; 6 nav items (Chat, Skills, Projects, Dispatch, Connectors, Settings) + recents + profile card. Tablet gets permanent sidebar at ≥768px.
2. **Chat input (composer)** — `apps/mobile/components/chat/ChatInput.tsx:226` — Rounded card, [+] → AddToChatSheet, model pill, auto-approve toggle, temp-chat toggle, connectors link, mic, send/stop. Voice recording overlay with waveform.
3. **Model picker** — `apps/mobile/components/model-picker/ModelPickerSheet.tsx:28` — Bottom sheet (50%/90%), search, auto-mode cards, favorites section, flat model list, per-model thinking toggle on second tap.
4. **Chat screen** — `apps/mobile/app/(app)/chat/[id].tsx:41` — Minimal header (back + ···), offline banner, MessageList, QuotedReplyBar, ChatInput, AddToChatSheet, ModelPickerSheet, VoiceConversationScreen, ThinkingBottomSheet, ExportSheet.
5. **Empty state** — `apps/mobile/components/chat/ChatEmptyState.tsx:44` — Teal sparkle icon, time-aware greeting, "How can I help you?", ConversationStarters, dismissible desktop-pairing banner.
6. **Settings** — `apps/mobile/app/(app)/(tabs)/settings.tsx:221` — SectionList with 5 groups (Account, AI Configuration, Connections, Preferences, About). Inline theme picker (3-segment radio). Toggle row for haptics.
7. **Profile / billing** — `apps/mobile/app/(app)/profile/index.tsx:40` — Avatar card, subscription card (plan + badge + Manage Subscription button), usage stats (3 counters), account actions.
8. **Dispatch** — `apps/mobile/app/(app)/dispatch/index.tsx:474` — Thread-style chat UI, desktop status strip, QR pairing empty state, TaskResultCard with status/result details.

---

## B. Pattern audit

### 1. Composer in narrow viewport

- Reference: `chatgpt-desktop/18_popout-window_compact-mode-empty-state.png` — Single-row toolbar below text area: [+] Globe Tool-selector ModelName Record Send. No secondary labels, icon-only row.
- Ours: `components/chat/ChatInput.tsx:286` — Two sub-rows inside a card: text input above, then left group ([+] Model AutoApprove TempChat) + right group (Connectors Mic Send). Crowded left group on narrow phones.
- Gap: Left toolbar row has 4 tappable targets in a row before the mic/send; on 375pt screens this leaves <36pt per target. AutoApproveToggle and TemporaryChatToggle are always-visible toggles that most users rarely change — they could live in AddToChatSheet.
- Verdict: ADJUST
- Impact: 4
- Effort: S
- Priority: P1

### 2. Drawer navigation (sidebar IA)

- Reference: `claude/claude-desktop/02_sidebar-expanded_chat-history.png` — Recents grouped under section header, user avatar anchored to bottom with popover access.
- Ours: `components/drawer/DrawerContent.tsx:49` — Header + 6 nav items + DesktopCompanionWidget + recents (last 5 only) + profile card at bottom. Profile card has a redundant [+] new chat button duplicating the header button.
- Gap: Recents capped at 5 with no "See all" entry point. Search bar absent from drawer. Redundant [+] button in profile card.
- Verdict: ADJUST
- Impact: 3
- Effort: S
- Priority: P2

### 3. Model picker (mobile bottom sheet)

- Reference: `claude/claude-chrome-extension/05_sidebar-extension_model-selector-dropdown_opus-sonnet-haiku.png` — Compact dropdown list, name + one-line description, checkmark on selected. All Claude models only.
- Ours: `components/model-picker/ModelPickerSheet.tsx:28` — Bottom sheet with search, auto-mode cards, favorites, flat list with thinking toggle revealed on second tap of selected model. Multi-provider, 10+ models.
- Gap: No provider grouping makes the flat list long to scan for less-familiar users. Provider logo/badge absent from ModelRow — hard to distinguish Claude 4.6 from GPT-5.5 at a glance. No "reasoning effort" slider (Codex has Low/Medium/High).
- Verdict: ADJUST
- Impact: 4
- Effort: M
- Priority: P1

### 4. Attachment / plus menu

- Reference: `chatgpt-desktop/07_composer_attachment-menu-upload-file-photo-screenshot.png` — Three-item vertically stacked menu: Upload file, Upload photo, Take screenshot.
- Ours: `components/chat/AddToChatSheet.tsx:37` — Full 90% bottom sheet with sections: Attachment row (Camera/Photos/File/Skills), Mode selector (Chat/Research/Create), feature toggles, connectors link, project selector bar. Very tall sheet for a simple pick.
- Gap: 90% height is disproportionate for the common case (pick a photo). Primary actions (camera/photos/file) are buried at the top of a long scrollable sheet. First-time user scanning a 90% sheet before sending an image is friction.
- Verdict: ADJUST
- Impact: 3
- Effort: M
- Priority: P2

### 5. Empty state / new chat

- Reference: `codex-desktop/21_popout-window_compact-mini-mode-empty-state.png` — Logo centered, product name, rich composer placeholder ("@ to add files, / for commands, $ for skills"), model + reasoning chips in composer.
- Ours: `components/chat/ChatEmptyState.tsx:44` — Sparkle icon, time-aware greeting, "How can I help you?", ConversationStarters grid, dismissible pairing banner.
- Gap: No hint text in the composer placeholder beyond "Ask anything…". ConversationStarters grid is fine but starters are not personalized. Pairing banner always fires on first launch even if user is on a phone-only plan.
- Verdict: KEEP (good) with minor ADJUST on placeholder hint
- Impact: 2
- Effort: S
- Priority: P2

### 6. Thinking blocks (mobile)

- Reference: `claude/claude-chat-artifacts-and-tools/11_inline-reasoning-steps_thinking-blocks-clock-icons.png` — Inline collapsed "Thinking…" line with clock icon, expandable in place.
- Ours: `components/chat/ThinkingBottomSheet.tsx:38` + `components/chat/ThinkingLine.tsx` — Collapsed ThinkingLine triggers a 90% bottom sheet with raw text. No inline expand-in-place.
- Gap: Bottom sheet for thinking forces user to lose message context. Desktop/web show inline collapsible blocks. On mobile a taller inline collapsible (accordion) would preserve chat scroll position.
- Verdict: ADJUST
- Impact: 3
- Effort: M
- Priority: P1

### 7. Settings IA (mobile)

- Reference: `claude/claude-desktop/07_settings-general-tab.png` — Left sidebar with tabs (General, Account, Privacy, Billing, Capabilities, Connectors, Desktop App, Developer). Right pane shows selected tab content.
- Ours: `app/(app)/(tabs)/settings.tsx:221` — Single-column SectionList with 5 section groups, inline theme picker, most items navigate to a sub-screen. No search within settings.
- Gap: Inline theme segment selector inside a SectionList row is non-standard (iOS normally uses a separate Appearance detail screen). `settings/index.tsx` redirects to app root instead of the settings tab — bug.
- Verdict: ADJUST (fix redirect bug; keep single-column — correct mobile pattern)
- Impact: 3
- Effort: S
- Priority: P0 (redirect bug)

### 8. Profile / billing sheet

- Reference: `claude/claude-desktop/20_profile-popover-menu.png` — Compact popover: email, Settings, Language, Help, Upgrade plan, Get apps, Log out. Upgrade is CTA-prominent.
- Ours: `app/(app)/profile/index.tsx:40` — Full-screen scroll view: avatar card, subscription card, 3 usage stat counters, account links. Upgrade / tier upsell not prominent; no "Hobby → Pro" upsell banner for free users.
- Gap: Billing screen has no tier comparison (no "Upgrade to Hobby" CTA visible when on free plan). Claude shows upgrade inline in the popover — high conversion surface. Our profile is full-screen and buries the upsell.
- Verdict: ADJUST
- Impact: 4
- Effort: M
- Priority: P1

### 9. Dispatch UI

- Reference: (no direct ref; adapted from `chatgpt-desktop/18_popout-window_compact-mode-empty-state.png` for narrow-viewport thread) — Single-column thread, status chip in header.
- Ours: `app/(app)/dispatch/index.tsx:474` — Thread-style with desktop status strip, TaskResultCard (colored left border, status icon, result details/preview buttons), QR pairing empty state. Solid implementation.
- Gap: Attachment button in DispatchInput (`dispatch/index.tsx:278`) has no handler — tap does nothing. Task result "Open on Mac" button is hardcoded label (not "Open on Windows" cross-platform). No push-notification for task completion shown in this screen.
- Verdict: ADJUST
- Impact: 3
- Effort: S
- Priority: P1

### 10. Onboarding flow

- Reference: `codex-cli/02_cli_welcome-signin-3-options-chatgpt-device-api.png` — Three clear sign-in options with visual separation. `claude-code/02_cli_first-run-login-3-options.png` — Same three-option pattern.
- Ours: `app/onboarding.tsx:23` — 3 slides (brand tagline, providers, Dispatch concept), dot indicator, Get Started / Sign In. No BYOK, no local-mode, no mode picker during onboarding.
- Gap: Onboarding skips the Local vs Cloud mode choice that is a core differentiator. Users land on the app without knowing they can run fully local (no account needed). BYOK entry point is absent. Sign In is secondary-styled text-only link — low prominence for returning users.
- Verdict: ADJUST
- Impact: 4
- Effort: M
- Priority: P1

### 11. Push notification UI

- Reference: `perplexity/18_settings_notifications-scheduled-search-presets-price-alerts.png` — Granular per-type notification toggles with preview of what triggers each.
- Ours: `app/(app)/settings/notifications.tsx` exists as a sub-screen (listed in settings layout) but was not read; `settings/(tabs)/settings.tsx:363` links to it via Bell row.
- Gap: Unknown detail level — notifications sub-screen exists but completeness unverified in this audit.
- Verdict: NEEDS_VERIFY
- Impact: 2
- Effort: S
- Priority: P2

### 12. About screen

- Reference: (no direct ref; adapted from general settings screens)
- Ours: `app/(app)/about.tsx:14` — Hardcoded `APP_VERSION = '1.0.0'` and `APP_BUILD = '1.0.0 (1)'` strings despite comment saying they come from package.json. `RUNTIME` correctly reads from `pkg.dependencies`. Version fields are stale constants.
- Gap: `APP_VERSION` and `APP_BUILD` are hardcoded literals at lines 14-15, contradicting the platform convention of reading from `Constants.expoConfig` (as `settings.tsx:195` correctly does).
- Verdict: ADJUST
- Impact: 2
- Effort: S
- Priority: P1 (correctness bug)

### 13. Mode picker (Local vs Cloud)

- Reference: `claude/claude-desktop/07_settings-general-tab.png` — Mode choice is prominently in General settings, not buried.
- Ours: No mobile mode picker found. Local mode is Desktop-only per platform spec; Cloud mode flows through auth. But there is no in-app explanation of this distinction visible to the user post-onboarding.
- Gap: Per locked spec, Local mode is Desktop-only so no mobile mode picker is needed. But the app has no "you are in Cloud mode" indicator visible to users. A subtle status chip in the drawer or profile would surface this.
- Verdict: ADD (status chip only, no full picker)
- Impact: 2
- Effort: S
- Priority: P2

---

## C. Top 10 priority gaps (ranked)

1. **Settings redirect bug** — Ref: `claude/claude-desktop/07_settings-general-tab.png` — Ours: `app/(app)/settings/index.tsx:6` — `settings/index.tsx` redirects to app root `/(app)` instead of the settings tab; any deep-link to `/settings` drops user at home — Fix redirect to `/(app)/(tabs)/settings` — P0 (Impact 3, Effort S)
2. **About screen hardcoded version** — Ref: n/a — Ours: `app/(app)/about.tsx:14` — `APP_VERSION` and `APP_BUILD` are hardcoded string literals; version shown to users will be permanently "1.0.0" — Replace with `Constants.expoConfig?.version` and build number, matching `settings.tsx:195` pattern — P1 (Impact 2, Effort S)
3. **Dispatch attachment button no-op** — Ref: `chatgpt-desktop/07_composer_attachment-menu-upload-file-photo-screenshot.png` — Ours: `app/(app)/dispatch/index.tsx:278` — Plus button has no onPress handler, silently does nothing — Wire to file/photo picker or remove — P1 (Impact 3, Effort S)
4. **Composer toolbar crowding on narrow screens** — Ref: `chatgpt-desktop/18_popout-window_compact-mode-empty-state.png` — Ours: `components/chat/ChatInput.tsx:296` — 4 left-group targets including rarely-changed AutoApprove and TempChat toggles visible always — Move AutoApprove and TempChat into AddToChatSheet; show only [+] Model in default toolbar — P1 (Impact 4, Effort S)
5. **Thinking bottom sheet loses context** — Ref: `claude/claude-chat-artifacts-and-tools/11_inline-reasoning-steps_thinking-blocks-clock-icons.png` — Ours: `components/chat/ThinkingBottomSheet.tsx:38` — Full-screen 90% sheet discards scroll context; inline accordion preferred on mobile — Convert ThinkingLine to an inline collapsible accordion in MessageBubble — P1 (Impact 3, Effort M)
6. **Profile lacks tier upsell CTA** — Ref: `claude/claude-desktop/35_plans-pricing_individual-plans.png` — Ours: `app/(app)/profile/index.tsx:177` — Free-tier users see no upgrade prompt in profile screen — Add "Upgrade to Hobby" banner card when `subscriptionPlan` is null — P1 (Impact 4, Effort M)
7. **Onboarding skips Local/BYOK mode and key prominence** — Ref: `codex-cli/02_cli_welcome-signin-3-options-chatgpt-device-api.png` — Ours: `app/onboarding.tsx:96` — Sign In is text-only secondary link, no Local/BYOK framing — Add 4th slide for mode choice or surface BYOK option before auth; elevate Sign In to outlined button — P1 (Impact 4, Effort M)
8. **Model picker lacks provider visual identity** — Ref: `claude/claude-chrome-extension/05_sidebar-extension_model-selector-dropdown_opus-sonnet-haiku.png` — Ours: `components/model-picker/ModelRow.tsx` — No provider logo/badge; flat list hard to scan with 10+ models — Add provider color dot or logo badge to ModelRow — P1 (Impact 4, Effort M)
9. **Drawer recents capped at 5, no search** — Ref: `claude/claude-desktop/02_sidebar-expanded_chat-history.png` — Ours: `components/drawer/DrawerContent.tsx:56` — Only 5 recents shown, no search, no "See all" — Add search bar to drawer header and "See all" link to full chat list — P2 (Impact 3, Effort S)
10. **Dispatch "Open on Mac" label hardcoded** — Ref: n/a — Ours: `app/(app)/dispatch/index.tsx:197` — Label says "Open on Mac" regardless of connected desktop OS — Detect OS from device info in connectionStore or default to "Open on Desktop" — P2 (Impact 2, Effort S)

---

## D. Anti-patterns from refs we should NOT copy on mobile

1. **Desktop artifact sidebar panel** (`claude/claude-chat-artifacts-and-tools/12_artifact-sidebar_html-resume-preview.png`) — Right-side split panel taking ~50% width works on 1440px desktop; on 375pt phone it leaves no room for chat. Mobile must use full-screen modal or ArtifactFullScreen (which we already have at `components/chat/ArtifactFullScreen.tsx`).
2. **Tab-pane settings navigation** (`claude/claude-desktop/07_settings-general-tab.png`) — Left-sidebar tab navigation is efficient with a pointer and hover; on touch it requires two-step navigation and duplicates chrome. Our single-column SectionList is the correct mobile idiom.
3. **Hover-triggered popover for profile** (`claude/claude-desktop/20_profile-popover-menu.png`) — Desktop profile popover opens on click near a cursor. On mobile the equivalent is a bottom sheet or a full-screen profile screen (which we have). Do not replicate a small floating popover anchored to a bottom-left avatar — touch targets would be too small and it would be clipped by safe areas.
4. **Condensed icon-only toolbar without labels** (`chatgpt-desktop/18_popout-window_compact-mode-empty-state.png`) — The ChatGPT popout uses 7 icon-only buttons in a single row because it is a mouse-targeted desktop window. On mobile, icon-only rows without labels fail WCAG touch-target and discoverability standards for new users. Keep the model pill text label we have.
5. **Multi-column connector/skill grid** (`perplexity/08_connectors_grid-gmail-drive-notion-github-slack-jira.png`) — 3-4 column grid works on tablet/desktop; on 375pt phone it makes tap targets ≤80pt wide with truncated labels. Use single or two-column list for connectors/skills on phone, grid only on tablet (≥768pt).

---

## E. Open product questions (need user decision)

1. **Local mode on mobile** — Spec says Local mode is Desktop-only. Should mobile show any Local-mode context (e.g., badge saying "Cloud mode" in drawer) or stay completely silent about the distinction?
2. **BYOK on mobile** — Should mobile allow BYOK key entry in settings, or is BYOK also Desktop-only? Onboarding currently has no BYOK slide.
3. **Hobby tier gate** — Should Cloud mode features be gated behind a Hobby paywall on mobile, with an inline upsell when free users try to start a cloud conversation? Currently no gate is implemented.
4. **Thinking blocks UX** — Inline accordion vs bottom sheet: inline keeps scroll context but requires re-architecting MessageBubble. Bottom sheet is simpler but loses context. Which is the P0 choice before v1 launch?
5. **Dispatch attachment** — What file types should the Dispatch attachment button support? Same as chat (camera/photos/file) or only file-sharing with the paired desktop?
