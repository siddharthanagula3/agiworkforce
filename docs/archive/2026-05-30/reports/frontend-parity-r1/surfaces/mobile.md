# mobile current state

**Frontend tree root**: `apps/mobile/`
**Approximate component count / file count**: 43 screens (tsx), ~75 components, 27 stores, 4 hooks, 19 lib files, 18 services — ~160 source files total (excluding tests and node_modules)

---

## Per-category inventory

#### 1. APP SHELL

HAS:

- Drawer navigator as primary nav shell (6 items: Chat / Skills / Projects / Dispatch / Connectors / Settings)
- Drawer header: "AGI Workforce" wordmark + [+] new chat button
- Recents section in drawer (last 5 conversations, auto-navigates)
- User profile card pinned at drawer bottom (avatar initials + display name + new chat shortcut)
- `DesktopCompanionWidget` pinned in drawer below nav items — shows desktop pairing status at-a-glance
- Tab navigator retained inside `(app)/(tabs)/` for compat (Chat / Projects / Settings mapped)
- Stack navigator for deep routes (chat/[id], agents/[id], settings/\*, companion, etc.)
- `SafeAreaView` on all screens; drawer uses `edges={['top','bottom']}`
- No multi-window support (N/A — mobile platform)
- No popout/mini mode (N/A)

#### 2. ONBOARDING / AUTH

HAS:

- 3-slide onboarding (`app/(public)/onboarding.tsx`): splash → "Every AI model, one app" → "Control your desktop from your phone"
- Animated dot indicator with spring expansion on active dot
- "Get Started" / "Sign In" CTAs on first slide; "Next" on intermediate; "Get Started" again on last
- MMKV flag `onboarding-done` gates the onboarding to first launch only
- Email/password `LoginForm` (`components/auth/LoginForm.tsx`) + `OAuthButtons` (Google/Apple/GitHub)
- Password-reset flow (`app/(auth)/reset-password.tsx`) with deep-link support
- Biometric gate on app resume (`hooks/useBiometricGate.ts`, `lib/biometricFlagStore.ts`)
- Secure storage chain: MMKV encrypted + SecureStore + biometric flag store

PARTIAL:

- No post-signin permissions overview screen (permissions handled contextually in-app)
- No explicit "mode selection" step in onboarding (Local vs Cloud); Cloud is assumed on mobile

#### 3. EMPTY STATE

HAS:

- `ChatEmptyState` with personalized headline: "Hi, {nickname}" or "Ask anything" fallback
- "How can I help you?" subtitle when no display name
- 3 horizontal prompt-chip shortcuts (Code / Write / Research) — one-tap to prefill composer
- Desktop pairing banner (first-launch): "Pair your desktop? Scan QR to connect" — dismissible, stored in MMKV

PARTIAL:

- No suggested prompts grid (only 3 fixed chips vs competitors' richer dynamic grids)
- Model badge not shown in empty state (model visible in composer toolbar only)
- No illustration (intentional — brand uses icon-in-circle pattern)

#### 4. COMPOSER

HAS:

- Multi-line `TextInput` (max `MAX_INPUT_LINES`, grows to 200px)
- `[+]` Add to Chat button → bottom sheet with 8 sections (see below)
- Model pill in composer toolbar: `ModelSelectorButton` → `ModelPickerSheet`
- Connectors shortcut (link icon) in composer toolbar
- Voice: `VoiceInputButton` (tap = push-to-talk, long-press = open voice conversation screen); `RecordingOverlay` with waveform + duration + cancel/send; `cleanupVoiceDictation` + `detectVoiceCommand` post-processing
- `RecordingOverlay` cancel and send-immediately actions
- Send button cycles: idle / streaming (stop) / queued (offline)
- `CommandPalette` triggered by `/` prefix — slash commands list (includes /compare, /search, etc.)
- Attachment strip (camera, photos, file) with preview and removal; images forwarded via `attachRef`
- Offline queue awareness: placeholder text changes, button shows queued count
- Haptic feedback on send and attachments

Add to Chat sheet sections:

- Attachments: Camera / Photos / File / Skills
- Mode selector: Chat / Research / Create (radio)
- Agent mode: Ask / Auto / Plan / Bypass (per-conversation override)
- Effort selector: Low / Medium / High / Max (gated by `supportsEffort` on model)
- Session toggles: Auto-approve (cycles ask/smart/full) + Temporary chat (purple toggle)
- Feature toggles: Web search / Image generation / Health (iOS beta)
- Config links: Add to project / Choose style / Tool access / Manage Connectors

PARTIAL:

- No `@mentions` for files/memory/people
- No citations toggle in composer (citations render automatically when present)
- No deep-research mode or plan-mode toggle at top level (plan is an agent mode option inside Add to Chat)
- No cloud-drive pickers (Google Drive / Dropbox / iCloud) — only Camera/Photos/File

#### 5. CHAT / MESSAGES

HAS:

- `MessageBubble` with avatar-left layout (matches Claude/ChatGPT pattern)
- Role label: "You" vs model name
- ThinkingLine: tappable → `ThinkingBottomSheet` with duration display (clock icon)
- `StatusStep` components for agentic steps (with step number and total)
- `InlineToolCall` rendered as left-border bar with tool name and expandable JSON (matches `packages/unified-chat/InlineToolCall`)
- `ApprovalCard`: risk-level color border (low/medium/high), tool type icon, description, approve/reject buttons, rejection reason text input, countdown bar for smart auto-approve
- Markdown rendering (`MessageContentRenderer`)
- `StreamingIndicator` (animated dots while generating)
- `GeneratedImage` inline with full-screen viewer (`ImageFullScreen`)
- `ImageGenProgress` while image is generating (progress bar, status, estimated time, error state)
- Inline citations: chips for ≤3 sources, `CollapsibleSources` card for 4+
- `CitationChip` with index + title + URL (tappable)
- `InlineArtifactCard` → `ArtifactFullScreen` modal
- Offline queued badge on user messages (clock icon + "queued" label)
- User attachments (images) rendered inline in user bubble
- Long-press context menu (iOS ActionSheet / Android Alert): Copy / Edit (user) / Retry / Export / Delete
- Message edit modal (`MessageEditModal`)
- `FileExportButton` bottom sheet for assistant messages
- Double-tap to rate (thumbs up → down → clear cycle) on assistant messages
- `FadeInDown` animation on new messages
- Scroll-to-bottom (handled by FlatList in `MessageList`)

PARTIAL:

- No branching/alternative response UI (retry replaces in-place, no visible branch selector)
- No explicit "comparison A/B layout" in the main chat view (`compare.tsx` is a separate hidden route)
- No per-message copy button visible by default (must long-press); competitors show it inline

#### 6. ARTIFACTS / SIDEBAR

HAS:

- `InlineArtifactCard` in message stream: shows artifact type + title + tap to expand
- `ArtifactFullScreen` modal with WebView preview for HTML artifacts, ScrollView for code/text
- Image artifacts viewable via `ImageFullScreen` (pinch-to-zoom)
- `ConversationExportSheet` for exporting chat content

PARTIAL:

- No persistent split-pane sidebar (mobile uses full-screen modal pattern instead)
- No artifact tabs (Preview/Source/Data) — single view only
- No toolbar with copy/refresh/print/download within artifact viewer
- No multi-artifact cards with "Download all"
- No dark-mode preview toggle for artifact content

MISSING: desktop-style right-panel artifact sidebar (N/A on mobile — full-screen modal is the correct mobile pattern)

#### 7. PROJECTS / SPACES

HAS:

- `Projects` tab screen: list view with `ProjectCard` per project
- Create/edit/delete project with custom name, description, system prompt, agent mode + effort defaults
- Active project indicator (badge count + "Active: {name}" label)
- `ProjectSelectorBar` in chat (shows active project)
- `agentControlStore` resolves per-conversation overrides cascading from project → global defaults
- `AddToChatSheet` "Add to project" link (project picker is placeholder per comment)

PARTIAL:

- List view only — no gallery grid view
- No detail view tabs (Chats / Sources / Knowledge)
- No knowledge/source file upload to project
- No preset templates in create modal

#### 8. CONNECTORS / TOOLS / SKILLS

HAS:

- `Connectors` screen with categorized toggle list: Cloud Storage / Productivity / Communication / Email & Calendar
- `ConnectorItem` with per-connector toggle (uses `integrationStore`)
- `Skills` screen (`app/(app)/skills/index.tsx`)
- `ToolAccessSelector` bottom sheet (Auto / On-demand / Always available) in Add to Chat
- `StyleSelector` bottom sheet in Add to Chat

PARTIAL:

- No connector detail view with per-permission toggles
- No OAuth grant flow visible in-app (connector toggle is UI-only; OAuth presumably out-of-band)
- No slash command autocomplete for installed skills (CommandPalette is static)
- No skills directory gallery grid with categories (skills screen content not fully verified)

#### 9. SETTINGS

HAS:

- Settings tab: 5 sections — Account / AI Configuration / Connections / Preferences / About
  - **Account**: Profile → (profile screen with stats + subscription + manage CTA), Subscription (Stripe portal via system browser), Usage screen
  - **AI Configuration**: Default Model, Capabilities (`settings/capabilities.tsx`), Auto-Approve (`settings/auto-approve.tsx`)
  - **Connections**: Desktop Pairing (→ companion screen with QR scanner), Connectors
  - **Preferences**: Appearance (dark/light/system 3-segment picker inline), Voice & Language (`VoiceSelector` bottom sheet), Notifications, Personalization, Haptic Feedback toggle
  - **About**: Help & FAQ, Privacy Policy, Terms of Service (all open in-app browser), Sign Out (destructive), version string from `expo-constants`
- `settings/memory.tsx`: memory management screen
- `settings/integrations.tsx`: device integrations screen
- `settings/notifications.tsx`: notification prefs screen
- `settings/personalization.tsx`: nickname, full name, display prefs

PARTIAL:

- No MCP Servers section in settings
- No Developer section
- No Extensions section
- No Archived / Worktrees / Environments / Git sections (desktop-specific, N/A on mobile)
- No keyboard shortcuts section (N/A — mobile)
- No Billing section as a distinct settings page (Subscription row opens Stripe portal externally)
- Settings content for Capabilities and Auto-Approve are stubs that need full verification

#### 10. PROFILE / USER POPOVER

HAS:

- Profile screen (`app/(app)/profile/index.tsx`): avatar initials, email, join date
- Subscription card with plan badge (Active/Free), "Manage Subscription" button
- `UpsellCard` for free/byok/local-only plans: dismissible (7-day TTL via MMKV), feature bullet list, Upgrade CTA
- Usage stats row: Chats / Messages / Agent Runs counts
- Account actions: Manage Account Online (external browser) + Sign Out (destructive alert)
- `normalizeBillingPlanTier` correctly distinguishes free/byok/local-only for upsell gate
- `ProPlusPaywall` bottom sheet triggered from model picker on cross-provider switch attempt

PARTIAL:

- No plan tier badge prominently shown in drawer/header (only on profile screen)
- No Zoom/font controls
- No dedicated Upgrade CTA in drawer (upsell only on profile screen + model picker paywall)

#### 11. MODEL / MODE FEATURES

HAS:

- Model picker bottom sheet (50%→90% snap): provider-grouped list, favorites section, search, auto-modes
- Auto modes (speed/balanced/quality) as card row above provider list
- Per-model favorites (star toggle)
- Per-model thinking toggle (expands on re-tap of selected model)
- Effort selector in Add to Chat sheet: Low/Medium/High/Max (gated by `supportsEffort`)
- Agent mode selector in Add to Chat sheet: Ask/Auto/Plan/Bypass (per-conversation)
- Pro+ guard on cross-provider model switches (`guardProviderSwitch` + `ProPlusPaywall` sheet)
- Remote model catalog fetch with local `MODEL_LIST` fallback
- Auto vs manual model selection handled by auto-mode cards

PARTIAL:

- No reasoning effort selector exposed separately from Add to Chat (no quick toggle in composer toolbar)
- No "quick mode" modal shortcut
- No region/routing toggle (US-only flag)
- No per-mode model changed banner

#### 12. PRICING / UPGRADE

HAS:

- `PaywallBottomSheet`: feature name + required tier + Upgrade CTA → pricing URL with UTM params
- `ProPlusPaywall` bottom sheet for Pro+ cross-provider gate
- `UpsellCard` on profile for free/byok users (dismissible, 7-day re-show)
- `tierStore` and `tierGuard` service for server-side plan enforcement
- `PaywallBottomSheet` handles unrecognized tier keys gracefully

PARTIAL:

- No full plans comparison modal (only contextual paywall cards)
- No individual vs team/enterprise tabs
- No credit balance or auto-refill display
- No "weekly limit" countdown banner

#### 13. ADMIN / ENTERPRISE

MISSING: No team admin console, audit log, SSO setup, seat management, or org-level model availability. Mobile is a personal-use surface.

N/A: enterprise admin features are web-only

#### 14. MOBILE / COMPACT MODE

HAS:

- Bottom-sheet model picker (correct mobile pattern)
- Full-screen modals for artifact viewer, image viewer, voice conversation
- Edge-swipe to open drawer (React Navigation drawer default)
- `SafeAreaView` on all screens with appropriate edge configurations
- Offline queue pattern: messages queued when no network, flushed on reconnect (`sendQueue.ts`)
- Haptic feedback throughout (toggle in settings)
- `useNetworkStatus` hook drives offline indicator
- Camera screen (`app/(app)/camera.tsx`) as native-feel photo capture

PARTIAL:

- Compare screen (`compare.tsx`) exists but stacked vertically only — no true landscape side-by-side layout
- No popout mini-window pattern (N/A)

#### 15. AGENTIC / COMPUTER USE

HAS:

- `ApprovalCard` inline in message stream: Approve / Reject with reason, risk-level (low/medium/high), tool type icons, countdown bar for smart auto-approve
- Auto-approve modes: Ask always / Smart auto / Full auto (cycle in Add to Chat sheet and settings)
- Agent modes: Ask / Auto / Plan / Bypass (per-conversation with project fallback)
- `AgentDashboard`, `ExecutionStream`, `StatusBanners` in companion screens (for desktop agentic run monitoring)
- `ToolTimeline` in agents screen
- `agentControlStore` resolves cascaded mode/effort from conversation → project → global

PARTIAL:

- No sandbox/permissions mode cycle (shift-tab pattern is desktop-only)
- No bypass-permissions warning banners (full-auto mode shows icon but no persistent banner)
- No action replay UI (execution stream is read-only live view)
- Computer use itself runs on desktop; mobile is the approval/monitoring surface only

#### 16. BROWSER EXTENSION UX

N/A: Mobile is not a browser extension surface.

#### 17. VSCODE EXTENSION UX

N/A: Mobile is not a VS Code extension surface.

#### 18. CLI / TUI UX

N/A: Mobile is not a CLI/TUI surface.

---

## Component reuse opportunities

**Currently using:**

- `@agiworkforce/types`: `PROVIDER_DISPLAY`, `normalizeBillingPlanTier`, `AgentMode`, `Effort`, `EFFORT_LABEL`, `AGENT_MODE_LABEL`, `AGENT_MODE_DESCRIPTION`, `ProviderId`
- `@agiworkforce/utils`: `cleanupVoiceDictation`, `detectVoiceCommand`
- `packages/unified-chat`: `InlineToolCall` is the shared component (`packages/unified-chat/src/components/InlineToolCall.tsx`) — mobile imports its own copy at `components/chat/InlineToolCall.tsx` (verify if this is re-exporting or a duplicate)
- Lucide icons via `lucide-react-native` (matches the Lucide single icon system)

**One-off implementations that should migrate to shared packages:**

- `MessageContentRenderer` (markdown parsing) — web has its own; candidate for `packages/chat` shared renderer
- `CitationChip` + `CollapsibleSources` — web has analogous components; candidate for `packages/unified-chat`
- `ApprovalCard` — desktop Dispatch also has approval UI; could share from `packages/unified-chat`
- `ConversationGrouping` logic (`lib/tagUtils.ts`, `services/autotag.ts`) — could live in `packages/utils`

---

## Known gaps the surface owner already knows about

1. **Dispatch HMAC gap**: desktop has zero `dispatchHmac`/`dispatchSalt` implementation; transitional unsigned-message path expires 2026-06-05 — desktop listener must ship or mobile needs a feature flag (per `FINAL_AUDIT §B`).
2. **`/api/user/stats` endpoint missing**: `ProfileScreen` gates the stats fetch behind `EXPO_PUBLIC_FEATURE_USER_STATS=1` because the web API endpoint doesn't exist yet; local-only fallback until implemented.
3. **Project picker in Add to Chat is a placeholder**: "Add to project" config link has a `// Placeholder — Phase G` comment; project association from composer not yet wired.
4. **Artifact viewer is limited**: no tabs (preview/source/data), no toolbar (copy/download/refresh); `ArtifactFullScreen` is a raw WebView/ScrollView with no chrome.
5. **No persistent conversation sidebar** in chat view (only drawer recents for last 5); full conversation search/filter lives on the Chat tab screen but there's no persistent left-pane within an open conversation like desktop competitors.
