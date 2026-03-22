# Mobile App Restructure — TODO

> Tracks all work items for aligning the existing mobile app with MOBILE_APP_SPEC.md.
> Reference: `docs/MOBILE_APP_SPEC.md` (single source of truth)

## Wave 1 (Parallel — No Dependencies)

### Phase A: Navigation Restructure

- [ ] Replace bottom tab navigator with slide-out drawer
- [ ] Create DrawerContent component with 6 items (Chat, Skills, Projects, Dispatch, Connectors, Settings)
- [ ] Add Recents section below nav items (recent conversations)
- [ ] Add user profile card at drawer bottom (avatar + name + [+] new chat)
- [ ] Set drawerType='front' for iPhone, 'permanent' for iPad (width >= 768)
- [ ] Move existing tab screens to drawer-based routes
- [ ] Create new route: `/dispatch`
- [ ] Create new route: `/connectors`
- [ ] Remove Home/Dashboard tab (merge into Chat)
- [ ] Rename Agents route to Dispatch

### Phase C: Model Selector Rework

- [ ] Remove provider grouping headers from ModelPickerSheet
- [ ] Add auto modes at top: Economy / Balanced / Best (highlighted cards with subtitles)
- [ ] Convert to flat model list with provider brand icons (no section headers)
- [ ] Add per-model "With thinking" toggle (expand selected model to show toggle)
- [ ] Remove brain icon from input bar
- [ ] Keep favorites, search, "New" badges
- [ ] Verify model catalog matches spec (9+ providers)

### Phase F: Thinking UI + Streaming Cursor

- [ ] Create ThinkingBottomSheet component (90% snap, "Thought process" title, X close)
- [ ] Add collapsed thinking line in chat: "⏱ [preview]... >"
- [ ] Tap collapsed line → opens bottom sheet with full scrollable thinking text
- [ ] Replace StreamingIndicator with AGI Workforce teal sparkle logo animation
- [ ] Update chat header to minimal (back arrow + menu dots only, no model info)

## Wave 2 (Depends on Wave 1 Navigation)

### Phase B: Input Bar + Add to Chat

- [ ] Restructure input bar layout: [+][Model▾]...[🔗][🎙][➤]
- [ ] Separate + button from Model pill (two distinct tappable areas)
- [ ] Create AddToChatSheet bottom sheet with:
  - [ ] Attachment row: Camera, Photos, File, Skills (4 cards)
  - [ ] Mode selector: Chat / Research / Create (mutually exclusive radio)
  - [ ] Feature toggles: Web search (ON), Image gen (ON), Health Beta (OFF)
  - [ ] Config: Add to project (None >), Choose style (Normal >), Tool access (Auto >)
  - [ ] Link: Manage Connectors >
- [ ] Add sources/connectors quick access button [🔗]
- [ ] Update streaming state: "Reply to [Model]..." placeholder + [■] stop button
- [ ] Hide model pill and [🔗] during streaming

### Phase D: Dispatch Page

- [ ] Create Dispatch page at `app/(app)/dispatch/index.tsx`
- [ ] Show desktop connection status (🟢 Connected / 🔴 Disconnected + device name)
- [ ] Persistent thread UI (messages between phone and desktop)
- [ ] Task result cards (✅ status + file name + location + [Preview] + [Open on Mac])
- [ ] "Desktop offline" state when disconnected
- [ ] Remove old Agents tab/dashboard (keep approval modal for push notifications)
- [ ] Wire WebRTC DataChannel for task messaging

### Phase E: Connectors Page

- [ ] Create Connectors page at `app/(app)/connectors/index.tsx`
- [ ] Categorized toggle list: Cloud Storage, Productivity, Communication, Email & Calendar
- [ ] Connected state: toggle ON (teal) with service icon + name + description
- [ ] Available state: "Connect" button → OAuth flow
- [ ] v1 connectors: Google (Drive/Gmail/Calendar), GitHub, Linear, Jira, Slack, Teams, Notion, Dropbox
- [ ] Link from AddToChatSheet "Manage Connectors"

## Wave 3 (Depends on Wave 2 Input Bar)

### Phase G: Add to Chat Features

- [ ] StyleSelector component: Normal / Concise / Detailed / Creative
- [ ] ToolAccessSelector component: Auto / On demand / Always available
- [ ] Add to project selector (list user's projects, select one)
- [ ] HealthKit integration (Beta toggle, expo-health or react-native-health)
  - [ ] Reference HxF Swift app at ~/Desktop/HxF for patterns
  - [ ] Read: steps, sleep, heart rate, workouts
- [ ] CollapsibleSources component for web search citations
  - [ ] "View X sources ▶" collapsed / expanded with favicon + domain + title

### Phase H: Settings & Personalization

- [ ] Restructure Settings page to 5 groups, 18 items per spec:
  - [ ] Account: Profile, Subscription, Usage
  - [ ] AI Configuration: Default Model, Capabilities, Auto-Approve
  - [ ] Connections: Desktop Pairing, Connectors
  - [ ] Preferences: Appearance, Voice & Language, Notifications, Personalization, Haptic Feedback
  - [ ] About: Help & FAQ, Privacy Policy, Terms of Service, Sign Out, Version
- [ ] Create Personalization sub-page:
  - [ ] Full Name, Nickname, Occupation text fields
  - [ ] Custom Instructions text area
  - [ ] 4 Response Style sliders (Warmth, Enthusiasm, Headers/Lists, Emoji)
- [ ] Update Usage page with progress bars + reset countdown
- [ ] Add Capabilities toggles page (Web search, Image gen, Memory, Desktop control)
- [ ] Add Auto-Approve selector (Ask Always / Smart Auto / Full Auto)

## Wave 4 (Final Polish)

### Phase I: Onboarding + Polish

- [ ] Rework onboarding to 3 screens:
  - [ ] Screen 1: Welcome (logo + "One app, every model" + Get Started / Sign In)
  - [ ] Screen 2: Multi-model (9+ providers highlight)
  - [ ] Screen 3: Desktop companion (phone + desktop illustration)
- [ ] First launch: empty chat + greeting + dismissible desktop pairing banner
- [ ] Verify empty state: minimal (logo + time-aware greeting, no chips)
- [ ] Verify message bubbles: dark rounded right-aligned user, left-aligned no-bubble AI
- [ ] Add SwipeReply component (swipe right to quote-reply)
- [ ] Add MessageReaction component (double-tap for 👍/👎)
- [ ] Haptic feedback audit (send, approve/reject, toggles, navigation, swipe)
- [ ] iPad adaptive layout testing (permanent sidebar at width >= 768)
- [ ] Offline mode verification (MMKV cached conversations, graceful degradation)
- [ ] Verify conversation grouping (Pinned + Today/Yesterday/This Week/Older)
- [ ] Verify swipe gestures on conversations (left=delete, right=pin)
- [ ] Verify long-press menu on messages (Copy, Share, Retry, Edit)
- [ ] Verify voice mode (tap=transcribe, long-press=full-screen)
