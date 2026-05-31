# Batch 01 — Home / Composer Empty State

Audit date: 2026-05-24
Branch: `audit/preexisting-remediation-2026-05-23`
Auditor: Claude Opus 4.7 (automated)

Reference screenshots from Claude Desktop/Web (claude.ai).
Target: AGI Workforce web app (`apps/web/`).

---

## IMG: 100_claude-max20x_home_composer.png

- **Feature:** Home empty state with time-aware greeting, composer with model+effort label, suggestion chips, sidebar with Chat/Cowork/Code tabs, recents list, user profile with plan badge
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/100_claude-max20x_home_composer.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/pages/WebChatPage.tsx`
  - `apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx`
  - `apps/web/features/chat/components/GreetingBanner/useGreeting.ts`
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - `apps/web/features/chat/components/Composer/ComposerFooter.tsx`
  - `apps/web/features/chat/components/Composer/SendButton.tsx`
  - `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx`
- **API endpoints:**
  - `POST /api/chat/conversations` (createConversation)
  - `POST /api/chat/conversations/:id/messages` (sendMessage via useChatStream)
- **Data flow:**
  - User lands on `/chat` -> `WebChatPage` mounts -> `useEffect` creates new conversation via `createConversation('New Chat')` -> redirects to `/chat/:id`
  - `GreetingBanner` renders when `isEmptyChat === true` (no messages, not loading) -> `useGreeting()` reads `useAuthStore().user?.name` and localStorage `agi.profile.preferredName` -> returns time-band greeting with user name
  - User types in `ChatComposerNew` textarea -> `handleInputChange` updates state -> on Cmd+Enter, `handleSubmit` -> `handleSend` -> `sendContent` -> `useChatStream().sendMessage` -> SSE stream to `/api/chat/conversations/:id/messages`
  - Suggestion chips (below composer) onClick -> `setComposerPrefill(chip.prompt)` -> `ChatComposerNew` prefillText prop -> sets textarea value
  - `ComposerFooter` renders model selector from `useModelStore` -> popover with grouped models from `AVAILABLE_MODELS` (built from `MODEL_PRESETS` / `models.json`)

- **Flaws:**
  - [major] **No "Adaptive" effort label rendered next to model name.** Claude shows `Opus 4.7 Adaptive v` inline in the composer toolbar. AGI has the underlying auto-routing presets (`AVAILABLE_MODELS` includes auto-economy / auto-balanced / auto-premium from `managed_cloud` group at `model-store.ts:72-78`) but `ComposerFooter.tsx:213` renders only `selectedModel.name` -- no "Adaptive" suffix or routing-mode label appears next to it. The data plumbing exists; only the display label is missing. @ `apps/web/features/chat/components/Composer/ComposerFooter.tsx:213`
  - [major] **Chat | Cowork | Code top tabs missing.** The Claude desktop sidebar header shows 3 mode tabs (Chat, Cowork, Code). AGI sidebar (`ChatSidebar.tsx`) has no equivalent tab switcher -- it jumps straight to the nav items (New chat, Projects, Artifacts, Customize). @ `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:563`
  - [major] **User profile plan badge missing.** Claude shows `Siddhartha Nagula · Max v` in the sidebar footer with the plan tier visible. AGI shows only the user name and email with a chevron-up dropdown, no plan tier label. @ `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:299-320`
  - [minor] **Late-night greeting uses comma before name.** Claude shows "It's late-night Siddhartha Nagula" (no comma). AGI code produces `It's late-night, Siddhartha Nagula` (comma from template literal `${greeting}, ${safeName}` at `useGreeting.ts:56`). The comma after "It's late-night" reads awkwardly. @ `apps/web/features/chat/components/GreetingBanner/useGreeting.ts:56`
  - [minor] **Duplicate CHIPS arrays.** `GreetingBanner.tsx:25-51` defines a `CHIPS` array with suggestion chips, and `WebChatPage.tsx:60-66` defines `EMPTY_CHAT_CHIPS`. Only the WebChatPage version renders (GreetingBanner's `onSendMessage` prop is never passed at `WebChatPage.tsx:630`). The GreetingBanner CHIPS are dead code. @ `apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx:25` and `apps/web/features/chat/pages/WebChatPage.tsx:60`
  - [minor] **Free plan upgrade pill always visible in sidebar.** `ChatSidebar.tsx:642-650` hardcodes a "Free plan - Upgrade" pill at the bottom of every sidebar, regardless of the actual user plan tier. Claude only shows this for free-tier users. @ `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:642-650`

- **Visual gaps:**
  - Claude's sparkle icon is an asymmetric multi-ray burst; AGI uses a symmetric 4-point star SVG (`GreetingBanner.tsx:76-78`)
  - Claude places the model label + "Adaptive" dropdown inline inside the composer input area (bottom-right of the textarea). AGI places the model selector in the `ComposerFooter` below the composer container
  - Claude shows a `+` button at bottom-left of composer and a microphone icon at bottom-right. AGI shows `+`, paperclip, Search/Think/Research toggles on the left side, and voice+send on the right -- more cluttered than the Claude reference
  - The play-button icon in the top-right of image 4 (suggests a video/tutorial feature) has no equivalent in AGI

---

## IMG: 041_claude-free_home_composer.png

- **Feature:** Free-plan home empty state with greeting, composer with Sonnet 4.6 + Adaptive label, suggestion chips, collapsed icon sidebar, "Free plan - Upgrade" banner at top-center, "Get apps and extensions" prompt at bottom-left
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/041_claude-free_home_composer.png`
- **Implementation status:** partial
- **Primary files:** (same as IMG 1)
- **API endpoints:** (same as IMG 1)
- **Data flow:**
  - Same as IMG 1 -- `WebChatPage` renders `GreetingBanner` + `ChatComposerNew` when `isEmptyChat`
  - Free plan detection: `useEffect` in `WebChatPage.tsx:153-174` calls `refreshSubscriptionStatus()` + `hasByokEnvKeys()` and redirects to `/byok` if no valid sub and no BYOK keys
  - Model defaults to `auto-balanced` from `AVAILABLE_MODELS` via `useModelStore` persisted state

- **Flaws:**
  - [major] **"Free plan - Upgrade" banner placement wrong.** Claude (free tier) shows it as a top-center dismissible bar spanning the main content area. AGI shows it only in the sidebar footer as a small pill (`ChatSidebar.tsx:642-650`), which is less prominent and appears for all tiers. @ `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:642-650`
  - [major] **Collapsed sidebar icon rail incomplete.** Claude free shows a collapsed icon sidebar with icons for: sidebar toggle, new chat, search, chats, projects, integrations, code/API, and app download. AGI `CollapsedSidebar` (`ChatSidebar.tsx:352-431`) has: sidebar toggle, new chat, search, chats, projects, customize, download, account -- missing integrations icon and code/API icon. @ `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:352-431`
  - [major] **No "Adaptive" effort label rendered** (same as IMG 1). Auto-routing data plumbing exists but the label is not displayed. @ `apps/web/features/chat/components/Composer/ComposerFooter.tsx:213`
  - [minor] **"Claude's choice" chip absent.** Claude free shows 5 suggestion chips: Code, Learn, Write, Life stuff, Claude's choice. AGI shows: Code, Write, Learn, Life stuff, From Gmail. The "Claude's choice" chip (auto-selected prompt) is missing; "From Gmail" is AGI-specific and has no Claude equivalent. @ `apps/web/features/chat/pages/WebChatPage.tsx:60-66`
  - [minor] **Chip order differs.** Claude free shows: Code, Learn, Write, Life stuff, Claude's choice. AGI shows: Code, Write, Learn, Life stuff, From Gmail. "Learn" and "Write" are swapped. @ `apps/web/features/chat/pages/WebChatPage.tsx:60-66`
  - [minor] **"Get apps and extensions" download prompt missing.** Claude free shows a blue-highlighted "Get apps and extensions" label at the bottom-left near the collapsed sidebar. AGI's `CollapsedSidebar` has a download icon with a blue dot but no text label. @ `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:413-419`

- **Visual gaps:**
  - Claude free uses a light theme (white/cream background, dark text). AGI forces `dark` class on the root container (`WebChatPage.tsx:583`: `className="dark fixed inset-0 ..."`), so it never renders in light mode even if the system preference is light
  - Claude free composer has more subtle, thinner border with rounded corners. AGI composer has a visible teal focus ring (`border-teal-500/40 shadow-md ring-2 ring-teal-500/30` at `ChatComposerNew.tsx:629`) which is more prominent
  - Claude free shows a soundwave/dictation icon at the composer bottom-right; AGI shows a Mic icon from lucide-react

---

## IMG: 200_claude-desktop_home-empty-or-last-chat.png

- **Feature:** Dark mode home empty state with full-width centered greeting, composer with Opus 4.7 + Adaptive + voice button, suggestion chips, minimal top bar (hamburger menu left, notification icon right)
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/200_claude-desktop_home-empty-or-last-chat.png`
- **Implementation status:** partial
- **Primary files:** (same as IMG 1)
- **API endpoints:** (same as IMG 1)
- **Data flow:** (same as IMG 1)

- **Flaws:**
  - [major] **No "Adaptive" effort label rendered** (same as IMG 1). @ `apps/web/features/chat/components/Composer/ComposerFooter.tsx:213`
  - [major] **Minimal top bar layout missing.** Claude desktop dark mode shows only a hamburger icon (top-left) and a notification bell icon (top-right) in the header. AGI shows a header with a Share button (when messages exist) and an Artifacts toggle button (`WebChatPage.tsx:600-623`), but no hamburger menu toggle or notification icon. @ `apps/web/features/chat/pages/WebChatPage.tsx:600-623`
  - [minor] **Greeting vertical position.** Claude centers the greeting + composer vertically in the viewport (roughly 35% from top). AGI uses `justify-center pb-[8vh]` (`WebChatPage.tsx:628`) which is close but the visual weight distribution differs -- AGI's greeting sits slightly higher due to the sidebar taking horizontal space.

- **Visual gaps:**
  - Claude's dark mode background is a smooth warm dark (#1a1a1a). AGI matches this with `--chat-bg: #1a1a1a` in globals.css -- good parity
  - Claude's composer in dark mode has a subtle elevated background with rounded corners. AGI uses `bg-[var(--chat-bg-elevated)]` (`rgba(34,34,34,0.9)`) which is close but the border radius differs: Claude uses a pill-shaped (very high radius) composer; AGI uses `rounded-[26px]` in empty state which is near-parity
  - Claude's voice button uses a soundwave glyph; AGI uses a standard Mic icon

---

## IMG: 011-claude-desktop-chat-home.png

- **Feature:** Desktop app home with sidebar showing Chat/Cowork/Code tabs, New chat + Projects + Artifacts + Customize nav, recents list, user profile with plan (Max), centered greeting with Sonnet 4.6 Adaptive, suggestion chips, play button top-right
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/011-claude-desktop-chat-home.png`
- **Implementation status:** partial
- **Primary files:** (same as IMG 1)
- **API endpoints:** (same as IMG 1)
- **Data flow:** (same as IMG 1)

- **Flaws:**
  - [major] **Chat | Cowork | Code tabs missing** (same as IMG 1). @ `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:563`
  - [major] **User profile plan badge missing** (same as IMG 1). Claude shows `Siddhartha Nagula · Max v` with a plan label and a share icon. @ `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:299-320`
  - [major] **No "Adaptive" effort label** (same as IMG 1). Shows `Sonnet 4.6 Adaptive v` in the composer. @ `apps/web/features/chat/components/Composer/ComposerFooter.tsx:213`
  - [minor] **Sidebar nav items partially match.** Claude shows: New chat, Projects, Artifacts, Customize. AGI sidebar shows the same 4 items -- good parity. However, the icons and visual weight differ slightly.

- **Visual gaps:**
  - Claude shows a play-button icon in the greeting area (top-right of the main content). This suggests an onboarding or tutorial video feature that AGI does not have
  - Sidebar session items in Claude show only the title text with no timestamp or action button until hover; AGI matches this pattern
  - Claude's suggestion chips have a slightly different visual style: outlined pills with icon + label. AGI's implementation at `WebChatPage.tsx:648-660` uses `border border-[var(--chat-border)]` which is close

---

## IMG: 210_claude-desktop_updated-chat-home-type-for-skills.png

- **Feature:** Updated home screen with Opus 4.7 Adaptive label, suggesting the composer supports skill/command autocomplete when typing. Sidebar shows same nav items without tabs
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/210_claude-desktop_updated-chat-home-type-for-skills.png`
- **Implementation status:** partial
- **Primary files:** (same as IMG 1, plus `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx`)
- **API endpoints:** (same as IMG 1)
- **Data flow:**
  - Same empty state flow as IMG 1
  - Skill autocomplete: user types `/` in `ChatComposerNew` -> `handleInputChange` detects `/` prefix -> sets `showSlashMenu=true` -> `SlashCommandMenu` renders with filtered commands
  - `@mention` detection: user types `@` -> `handleInputChange` detects `@` -> sets `showMentions=true` -> filtered `availableSkills` from `ChatAIService.getAvailableSkillsSync()` shown in dropdown

- **Flaws:**
  - [major] **No "Adaptive" effort label** (same as IMG 1). @ `apps/web/features/chat/components/Composer/ComposerFooter.tsx:213`
  - [minor] **No placeholder hint about skills.** The image filename suggests "type for skills" -- Claude's placeholder or tooltip may hint that typing triggers skill autocomplete. AGI's composer placeholder is `"How can I help you today?"` (set via prop at `WebChatPage.tsx:638`) with no mention of skills or commands. @ `apps/web/features/chat/pages/WebChatPage.tsx:638`
  - [minor] **Sidebar missing Chat/Cowork/Code tabs** in this updated screenshot (same finding as IMG 1 and 4, though this image shows the sidebar without tabs too, suggesting Claude may have removed them in this update). @ `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:563`

- **Visual gaps:**
  - This is an updated version of the home screen showing `Opus 4.7 Adaptive` (upgraded from Sonnet 4.6). AGI's model selector displays whatever model the user has selected but without the "Adaptive" suffix
  - The sidebar nav items match Claude's: New chat, Projects, Artifacts, Customize (Recents list follows)

---

## Cross-cutting findings

### Consolidated flaws (deduplicated)

| Severity | Finding | Location | Images |
|----------|---------|----------|--------|
| major | **No "Adaptive" effort label rendered next to model name in composer.** Claude shows `{ModelName} Adaptive v` inline. AGI has auto-routing presets in `model-store.ts:72-78` (auto-economy / auto-balanced / auto-premium) but `ComposerFooter.tsx:213` renders only `selectedModel.name` without an "Adaptive" suffix. Data plumbing exists; display label is missing. | `ComposerFooter.tsx:213` | 1,2,3,4,5 |
| major | **Chat/Cowork/Code mode tabs missing in sidebar header.** Claude desktop shows 3 mode tabs. AGI has no equivalent mode switcher. | `ChatSidebar.tsx:510-561` | 1,4 |
| major | **User profile plan badge missing.** Claude shows plan tier (Max, Pro, Free) next to user name in sidebar footer. AGI shows no plan information. | `ChatSidebar.tsx:299-320` | 1,4 |
| major | **Free plan upgrade banner placement wrong.** Claude places it at top-center of main content for free users. AGI places a static pill in the sidebar footer for all users. | `ChatSidebar.tsx:642-650` | 2 |
| major | **Forced dark mode.** `WebChatPage.tsx:583` hardcodes `className="dark"` on the root container, overriding `ThemeProvider` (which properly supports light/dark/system at `ThemeProvider.tsx:39-83`). Claude free (IMG 2) renders in light mode. | `WebChatPage.tsx:583` | 2 |
| minor | **Late-night greeting comma.** Code produces "It's late-night, {name}" but Claude shows "It's late-night {name}" without comma. | `useGreeting.ts:56` | 1 |
| minor | **Dead CHIPS array in GreetingBanner.** `GreetingBanner.tsx:25-51` defines chips never rendered because `onSendMessage` is never passed. Only `WebChatPage.tsx:60-66` chips render. | `GreetingBanner.tsx:25` | all |
| minor | **Chip order and content differ from Claude.** "Learn" and "Write" swapped; "From Gmail" is AGI-specific; "Claude's choice" absent. | `WebChatPage.tsx:60-66` | 2 |
| minor | **Free plan upgrade pill shown to all tiers.** The sidebar pill at line 642 is unconditional; should be gated on `plan_tier === 'free'`. | `ChatSidebar.tsx:642` | all |
| cosmetic | **Sparkle icon shape.** AGI uses a symmetric 4-point star SVG; Claude uses an asymmetric multi-ray burst. | `GreetingBanner.tsx:76-78` | all |
| cosmetic | **Mic icon vs soundwave glyph.** AGI uses lucide `Mic` icon; Claude uses a soundwave/dictation glyph. | `VoiceInputButton.tsx:196` | 1,2,3 |
| cosmetic | **Composer toolbar layout density.** AGI shows +, paperclip, Search, Think, Research buttons inline alongside the textarea. Claude shows only + and mic, with model selector inside the composer. AGI's layout is more cluttered. | `ChatComposerNew.tsx:690-941` | all |

### Data flow summary (all images share this)

1. **Mount:** `WebChatPage` loads -> checks subscription/BYOK access -> creates conversation if none -> renders empty state with `GreetingBanner` + `ChatComposerNew`
2. **Greeting:** `useGreeting()` reads `useAuthStore().user?.name` + localStorage preferred name -> applies time-band greeting -> returns headline
3. **Composer:** `ChatComposerNew` manages textarea state + attachments + ghost-text completion + slash commands + @mentions + voice input -> on submit calls `handleSend` -> `sendContent` -> `useChatStream().sendMessage` via SSE
4. **Model selection:** `ComposerFooter` reads `useModelStore` -> renders model name + provider logo -> popover dropdown with all AVAILABLE_MODELS grouped by provider
5. **Chips:** `EMPTY_CHAT_CHIPS` in `WebChatPage.tsx:60-66` -> onClick sets `composerPrefill` state -> passed as `prefillText` prop to `ChatComposerNew` -> populates textarea

### Accessibility notes

- Composer textarea has `aria-label="Message input"` and `aria-describedby` for ghost-text -- good
- Send/Stop buttons have proper `aria-label` per state -- good
- Suggestion chips lack `role="listitem"` or group semantics; they are individual buttons which is acceptable
- Voice button has dynamic `aria-label` and `aria-pressed` -- good
- Sidebar session items lack explicit `role="listitem"`; they rely on implicit div semantics which is suboptimal for screen readers
