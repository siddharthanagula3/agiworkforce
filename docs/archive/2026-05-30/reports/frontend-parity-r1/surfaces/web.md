# apps/web current state

**Frontend tree root**: `/Users/siddhartha/Desktop/agiworkforce/apps/web/`
**Approximate component count / file count**: 1,106 .ts/.tsx files (231 routes + 91 API endpoints + 392 feature files + 249 components)

Active chat lives at `features/chat/` (184 files). Marketing landing at `app/page.tsx`. Deployment: Vercel, Next.js 14 App Router.

---

## Per-category inventory

#### 1. APP SHELL

HAS:

- Left sidebar (`features/chat/components/Sidebar/ChatSidebar.tsx`) with collapsed/expanded toggle (`sidebarCollapsed` state in `WebChatPage.tsx`)
- Sidebar sections: search bar at top, time-grouped conversation list (Today / Yesterday / Last 7 days / Last 30 days / Older), user profile area pinned to bottom
- Top bar per-chat: `ChatHeader.tsx` + `ChatTopBar.tsx` in `features/chat/components/Main/`
- `CommandPalette` at `components/CommandPalette/CommandPalette.tsx` with provider (`CommandPaletteProvider.tsx`)
- Error boundary at shell level (`components/ErrorBoundary.tsx`), section-level error boundaries (`shared/ui/SectionErrorBoundary.tsx`)
- Offline indicator (`components/OfflineIndicator.tsx`)

MISSING:

- Multi-window / popout mini-mode (no detached window or picture-in-picture flow)
- Tab/window chrome (single-tab architecture only)

#### 2. ONBOARDING / AUTH

HAS:

- Email/password sign-up at `app/signup/page.tsx` and sign-in at `app/login/page.tsx`
- OAuth callback at `app/auth/callback/route.ts`; SSO check at `app/api/auth/sso-check/route.ts`
- Forgot-password at `app/forgot-password/page.tsx`; password update at `app/auth/update-password/page.tsx`
- Email verify page at `app/verify/page.tsx`
- Device auth flow at `app/device-auth/page.tsx` and `app/auth/device/page.tsx`
- BYOK onboarding page at `app/byok/page.tsx`

PARTIAL:

- No post-signin permissions overview screen (device auth only); BYOK key entry wired but no guided step-by-step wizard for new users choosing between BYOK, Local, Hobby
- No splash / animated intro screen; lands directly on login form

#### 3. EMPTY STATE

HAS:

- `GreetingBanner` component at `features/chat/components/GreetingBanner/` with `useGreeting.ts` hook (time-aware greeting)
- `FollowUpSuggestions.tsx` renders quick-action prompt pills in empty/post-message state
- Composer `prefillText` prop: clicking a suggestion pill pre-fills composer (`ChatComposerNew.tsx`)

PARTIAL:

- No dedicated hero illustration; empty state is text-based greeting + suggestion pills only
- Model badge not prominently shown in empty state (shown in composer footer)
- No multi-category quick-action layout (search / write / code / analyze tabs like Claude/Gemini)

#### 4. COMPOSER

HAS:

- `ChatComposerNew.tsx` — primary composer with: textarea (auto-resize), drag-drop file support (`DragDropOverlay.tsx`), attachment preview strip (`AttachmentPreview.tsx`), ghost-text prompt completion (`GhostTextOverlay.tsx`)
- Attachment menu with: Image (`ImageIcon`), Video, Document (`FileText`), Web Search (`Globe`), Code execution (`Code2`), Image generation (`Sparkles`)
- Focus mode buttons (`FocusModeButtons.tsx`): web / academic / code / writing / research — adds mode-tag chips to composer
- Agent mode switcher (`AgentModeSwitcher.tsx`): solo / collaborative multi-agent modes
- Slash command palette (`SlashCommandMenu.tsx`) triggered by `/`
- Style selector (`StyleSelector.tsx`) in composer footer
- Voice input (`VoiceInputButton.tsx` + `VoiceRecordingOverlay.tsx` + `use-voice-recording.ts` + `voice-input-store.ts`) — recording lifecycle with overlay, Whisper transcription via `app/api/llm/v1/audio/transcriptions/route.ts`
- Model picker in `ComposerFooter.tsx`: Popover + Command list, grouped by provider, provider logos, effort/thinking toggle (low/medium/high/max) for providers that support it, budget tracker display
- Send button with queue state when streaming (`SendButton.tsx`)
- Folder context selector (`FolderContextSelector.tsx`)
- `ActiveModeTags.tsx` chips below composer showing active focus modes

PARTIAL:

- `@mention` token present in `EnhancedMessageInput.tsx` but not wired into primary `ChatComposerNew.tsx`
- Citations toggle not exposed as a dedicated button in composer (enabled implicitly when web search is on)
- No cloud-drive connectors in attachment menu (Google Drive, Dropbox absent)
- No screenshot capture affordance
- No "deep research" or "plan mode" named toggle separate from focus modes (research focus mode approximates it)

#### 5. CHAT / MESSAGES

HAS:

- User bubble and assistant bubble rendering (`MessageBubble.tsx`)
- `ThinkingBlock.tsx` wired into `MessageBubble.tsx` at lines 60, 402-405 for extended reasoning display
- `ReasoningAccordion.tsx` with tests — collapsible reasoning block
- `MarkdownContent.tsx` with react-markdown + remark-gfm + remark-math + remark-breaks + rehype-highlight + rehype-raw (at `MessageBubble.tsx:44-49`)
- `EnhancedMarkdownRenderer.tsx` as alternative renderer
- `MermaidRenderer.tsx` for diagram rendering
- `CodeExecutionBlock.tsx` for code execution results
- Inline tool-use rendering: `ToolCallCard.tsx`, `ToolTimeline.tsx`, `InlineToolResults/` (InlineSearchResults, InlineFileRead, InlineCodeDiff, InlineTerminalOutput, ToolResultCard)
- Inline web search results: `InlineSearchResults.tsx`, `SearchResults` component referenced in `MessageBubble.tsx`, `InlineCitation.tsx` / `CitationFooter`
- Message actions (`MessageActions.tsx`): copy, reaction (ThumbsUp / ThumbsDown via `use-message-reactions.ts`), regenerate (`RefreshCw`), pin, edit (`Pencil`), delete (`Trash2`), branch (`GitFork`)
- `EditableMessage.tsx` for in-place user message editing
- Scroll-to-bottom: `ChatMessageList.tsx` + `shared/hooks/useAutoScroll.ts` + scroll FAB present
- `BranchNavigator.tsx` for conversation branch navigation
- `CollaborativeMessageDisplay.tsx` for multi-agent output
- `MediaDisplay.tsx` for generated images/video inline
- `ImageLightbox.tsx` for full-size image view
- `AudioPlayer.tsx` + `AudioVisualizer.tsx` for voice/audio messages
- Streaming typing indicator (`TypingIndicator.tsx`), skeleton loader (`MessageBubbleSkeleton.tsx`)
- Message search within conversation (`MessageSearch.tsx`), global search dialog (`GlobalSearchDialog.tsx`)
- Framer-motion entrance animations on bubbles (`messageListVariants`, `messageBubbleVariants` exported from `MessageBubble.tsx`)

PARTIAL:

- Thinking blocks show duration but no clock-icon-per-step or step-count like Claude Desktop
- No explicit A/B comparison layout (only branching navigation via `BranchNavigator`)
- Inline web search favicons: `InlineSearchResults.tsx` exists but favicon display not confirmed

#### 6. ARTIFACTS / SIDEBAR

HAS:

- `ArtifactsPanel.tsx` — right-panel sidebar, tab-per-artifact navigation, per-artifact viewer with syntax highlight (Prism), copy, download actions
- `ArtifactPreview.tsx` — Preview / Code tabs; supports html / react / svg / mermaid / code artifact types; version history (History tab); share button; fullscreen; XSS sanitization via `html-sanitizer`; iframe sandbox for live HTML rendering
- `ArtifactBlock.tsx` inline within messages
- `InlineArtifactCards.tsx` — multi-artifact card strip in message stream
- `artifact-detector.ts` utility to parse artifact blocks from streamed content
- `DocumentMessage.tsx` and `DocumentActions.tsx` for generated document artifacts
- `ImageAttachmentPreview.tsx` for image artifacts

PARTIAL:

- No print action in artifact toolbar (copy, download, share present)
- No dark-mode iframe preview (iframe content renders in default browser theme)
- No spreadsheet / data-table artifact type (html/react/svg/mermaid/code only)
- "Download all" multi-artifact bulk action absent

#### 7. PROJECTS / SPACES

HAS:

- `ProjectSidebar.tsx` — sidebar panel listing projects with folder open/closed icons, color dots, description, "New Project" button
- `ProjectSettingsDialog.tsx` — modal with name, description, color picker, custom instructions (system prompt), knowledge file upload
- `project-store.ts` Zustand store for project CRUD

PARTIAL:

- No gallery/grid view of projects; only sidebar list
- No per-project "Chats" / "Sources" / "Knowledge" tab tabs (knowledge upload is in the settings dialog, not a dedicated tab)
- Project system prompt wired in dialog but no indication whether it's sent as a prepended system message at API call time (needs service-layer check)
- No project-level analytics or usage view

#### 8. CONNECTORS / TOOLS / SKILLS

HAS:

- `ConnectorsPage.tsx` at `features/connectors/pages/` — connector directory listing with logos (`connector-logos.ts`)
- `SkillsMenu.tsx` in chat components for inline skill invocation
- Slash command menu doubles as skill launcher
- `app/skills/page.tsx` marketing page for skills directory
- `app/api/connectors/route.ts` backend endpoint

PARTIAL:

- ConnectorsPage is a listing UI but no confirmed OAuth grant modal flow
- Per-connector permission toggles not confirmed in UI (config only in `connector-logos.ts`)
- No MCP-Servers settings section in settings page (missing from TABS list)
- Skills library has no category browsing (legal / marketing / data subcategories) in the web chat UI

#### 9. SETTINGS

HAS:

- `SettingsPage.tsx` with tab structure: Appearance / Chat / Models / Commands / Privacy & Data / Billing / Notifications
- Appearance tab: theme (AppearanceSettings), chat font (Default / System / Dyslexic Friendly)
- Chat tab: chat preferences (`ChatSettings.tsx`)
- Models tab: custom model endpoints (`CustomModelsSettings.tsx`)
- Commands tab: custom slash commands (`CustomCommandsSettings.tsx`)
- Privacy tab: export data (`ExportData.tsx`), account deletion with "delete confirm" dialog
- Billing tab: inline Stripe Billing Dashboard
- Notifications tab: notification preferences (`Notifications.tsx`)
- Two-factor auth settings (`TwoFactor.tsx`), profile settings (`Profile.tsx`), API keys (`ApiKeys.tsx`) in `features/settings/components/Settings/`
- `AdvancedModeToggle.tsx` for advanced/agentic mode

PARTIAL (vs taxonomy schema target):

- Missing: General / Personalization / Shortcuts / MCP-Servers / Developer / Extensions / Archived / Worktrees / Environments / Git sections
- Keyboard shortcuts dialog exists (`KeyboardShortcutsDialog.tsx`) but not as a settings tab
- No dedicated Account tab (profile/2FA scattered in sub-components)
- API key management present but not surfaced as primary settings tab

#### 10. PROFILE / USER POPOVER

HAS:

- `UserProfileArea` (bottom of `ChatSidebar.tsx`): avatar + display name + email, Settings link, Log out button
- `DropdownMenu` pattern — click user avatar to open menu
- Plan/tier badge: `PLAN_LABEL` + `PLAN_DESCRIPTION` from `@agiworkforce/types` shown in `SettingsPage.tsx`
- `CreditMonitor.tsx` at `components/dashboard/CreditMonitor.tsx` + `CreditAlertModal.tsx`

PARTIAL:

- Upgrade CTA in user popover not confirmed; upgrade flow routes to Billing tab in settings
- No zoom/font-size controls in user popover (font is in Appearance settings tab)
- Tier badge placement is in settings, not inline in the sidebar user area

#### 11. MODEL / MODE FEATURES

HAS:

- Effort selector in `ComposerFooter.tsx`: low / medium / high / max via `EFFORT_ORDER` constant; only shown for providers where `supportsEffort` is true
- Thinking toggle (enable/disable) in `ComposerFooter.tsx` bound to model store `thinkingEnabled`
- Focus mode buttons in composer approximate mode switching (web / academic / code / writing / research)
- `AgentModeSwitcher.tsx`: solo vs multi-agent collaboration mode
- Model changed banner not confirmed (no explicit per-mode model changed notification component found)

PARTIAL:

- No explicit "Plan Mode" toggle (research focus mode + advanced toggle is the closest analog)
- No "Quick Mode" modal (no fast/slow model tradeoff modal)
- No manual vs auto model selection UX (all selections are manual via the model picker)
- No US-only region/routing toggle exposed in UI

#### 12. PRICING / UPGRADE

HAS:

- `InlinePaywallCard.tsx` — inline upgrade card rendered inside chat when tier limit hit
- `app/pricing/page.tsx` — full pricing page
- `BillingDashboard.tsx` — subscription view (Subscription / Usage / Topup components), invoice list, payment methods
- `Topup.tsx` — token pack purchase UI
- `Usage.tsx` — usage breakdown by provider/capability
- `CreditAlertModal.tsx` — credit warning modal
- Monthly / yearly billing period toggle in `BillingDashboard.tsx`
- Stripe Checkout wired (`stripe-payments.ts`): Hobby, Pro, Max upgrade flows + enterprise contact-sales
- `upgradeToProPlan` / `upgradeToMaxPlan` replaced with "Join Waitlist" CTA for Pro/Max (per locked platform rules)

PARTIAL:

- No plans comparison modal with individual vs team/enterprise tabs (pricing page exists but modal form not confirmed)
- No "weekly limit" countdown UI component
- Credit balance visible in `CreditMonitor` but auto-refill toggle not confirmed in UI

#### 13. ADMIN / ENTERPRISE

HAS:

- `TeamSettingsPanel.tsx` at `features/teams/components/`
- `TeamSwitcher.tsx` for org switching
- `team-store.ts` Zustand store
- `lib/services/audit-service.ts` backend service
- `app/api/admin/directory-sync/route.ts` — directory sync endpoint
- `app/enterprise/page.tsx` marketing page

PARTIAL:

- No full admin console UI (team settings panel only, not a dedicated admin route)
- Audit log service exists but no frontend audit log viewer confirmed
- SSO setup page not found (only `app/api/auth/sso-check/route.ts`)
- Seat management UI not confirmed

#### 14. MOBILE / COMPACT MODE

HAS:

- Responsive Tailwind classes throughout (e.g. `ResponsiveContainer.tsx` at `components/ui/`)
- `lib/hooks/useMobileVoiceInput.ts` separate mobile voice hook
- Sidebar collapsed state (`sidebarCollapsed` boolean) for narrow viewports

PARTIAL:

- No bottom-sheet model picker for mobile
- No full-screen modal patterns adapted for mobile (uses same desktop modals)
- No edge-swipe navigation
- No dedicated mobile breakpoint compositor layout (composer doesn't collapse to icon bar on narrow widths)

#### 15. AGENTIC / COMPUTER USE

HAS:

- `AgentStatusBar.tsx` — animated spinner, "Working on: [action]" text, elapsed time counter, collapsible `ActionTrail`
- `ActionTrail.tsx` — timeline of agent steps with status icons
- `AgentModeSwitcher.tsx` — solo vs collaborative mode
- `agentMode.ts` type definitions
- Agent execution API at `app/api/agents/execute/route.ts`

PARTIAL:

- No Ask-vs-Act approval prompts (no user-confirmation dialog before agent takes an action)
- No sandbox/permissions mode cycle (no shift-tab analog)
- No bypass-permissions warning banner
- Computer use (screen capture / DOM control) not wired in web surface (server-side agent only, not interactive)

#### 16. BROWSER EXTENSION UX

N/A: apps/web is the web app, not the Chrome extension. No browser extension shell patterns apply here.

#### 17. VSCODE EXTENSION UX

N/A: apps/web is the web app. VS Code extension patterns do not apply.

#### 18. CLI / TUI UX

N/A: apps/web is the web app. CLI/TUI patterns do not apply.

---

## Component reuse opportunities

- **`packages/chat`**: `ChatSidebar`, message components, and artifact panel are web-local re-implementations; candidates for migration to `packages/chat` (23 components, 8 hooks, 7 stores already there).
- **`packages/unified-chat`**: `InlineToolCall` at `packages/unified-chat/src/components/InlineToolCall.tsx` is shared — web should verify it consumes this rather than `ToolCallCard.tsx` (potential duplication).
- **`packages/design-tokens`**: Teal/terracotta tokens; web uses Tailwind CSS variables but should stay in sync with token package.
- **Lucide**: Web already uses Lucide single icon system throughout (consistent with locked icon rule).
- **`shared/ui/` vs `components/ui/`**: Web has two UI primitive locations — `apps/web/shared/ui/` (shadcn primitives from shared package) and `apps/web/components/ui/` (local copies). Should be collapsed to one location.
- **`@agiworkforce/types`**: `PLAN_LABEL`, `PLAN_DESCRIPTION`, `PROVIDER_DISPLAY`, `EFFORT_LABEL` already imported from shared types package — good pattern to maintain.

---

## Known gaps the surface owner already knows about

1. **Web search tool execution loop missing**: `web-search-tool-loop-needed.md` memory note — web chat triggers web search but does not loop results back into a follow-up completion call (per `web-search-tool-loop-needed.md`).
2. **31 pre-existing failing tests**: `core/integrations/*.test.ts` + security tests expect specific error strings that changed after RLS migration; deferred per audit notes.
3. **Stripe migration not applied to production DB**: Canonical `supabase/migrations/` has the idempotency RPC at filesystem level but `supabase db push` has not been run; paid Hobby tier is NO-GO until applied.
4. **No Ask-vs-Act approval UX**: Agentic mode has a status bar and trail but no user-confirmation gate before destructive agent actions.
5. **Settings tabs missing MCP-Servers, Developer, Extensions, Shortcuts, Worktrees, Environments, Git**: The `SettingsPage.tsx` TABS array only has 7 tabs vs the 18+ sections competitors expose.
