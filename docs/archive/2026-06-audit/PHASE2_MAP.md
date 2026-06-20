# PHASE2_MAP.md

Status: Phase 2 deliverable (codebase audit/map for `apps/web` chat + shell)
Owner: VC-demo production push (ultracode workflow)
Last updated: 2026-06-13
Method: read-only mapping pass over `apps/web/app/chat`, `apps/web/features/chat`,
`packages/{design-tokens,unified-chat,providers,types}`, plus the existing repo audit
(`AUDIT_FINDINGS.md`, `REMEDIATION_PRIORITY.md`). **`path:line` references are from the mapping pass
and MUST be re-confirmed at edit time** (Phase 3 think-step) before relying on them.

---

## 1. CHAT PAGE COMPOSITION

- `apps/web/app/chat/page.tsx` — `'use client'`; dynamically imports `WebChatPage` with `ssr:false`.
- `apps/web/app/chat/layout.tsx` — **server** component; Clerk auth gate → redirects unauthenticated
  users to `/login?redirectTo=…`; `export const dynamic = 'force-dynamic'`. **(This is why the
  authenticated chat cannot be screenshotted without Clerk env — see Verification note below.)**
- `apps/web/app/chat/[sessionId]/page.tsx` — present but routing flows through bare `/chat`.
- **`WebChatPage`** (`apps/web/features/chat/pages/WebChatPage.tsx`, large client component) renders a
  `fixed inset-0 flex` shell: `ChatSidebar` | main area (header toggles · error/notification banners ·
  empty state `GreetingBanner + ChatComposerNew` **or** `ChatMessageList` + pinned composer) |
  `ResearchPanel` / `ArtifactsPanel` (toggle-driven) + modals (`DirectoryModal`,
  `CloudUpgradeWaitlistDialog`, `LocalByokHandoffDialog`).

### State (Zustand stores + hooks)
- Stores: `useChatStore` (messages/activeConversationId/isLoading/error), `useModelStore`
  (availableModels/selectedModelId), `useBillingStore` (subscription.tier), `useAutoEconomyTrialStore`
  (promptsUsed/limit), `useArtifactsStore`, `useResearchPanelStore`.
- Hooks: `useConversations()` (CRUD), `useChatStream()` (send + stream), `useShareConversation()`,
  Clerk `useAuth()`.
- Server: conversation CRUD via `/api/chat/conversations/[id]` + `…/messages`; persistence to Neon
  (`web_messages`); message POST returns `skipLlm:true` (streaming is separate — see §5).

---

## 2. COMPONENT INVENTORY (all WIRED unless noted)

Exported from `apps/web/features/chat/components/index.ts`. Major subtrees:

- **Sidebar/** `ChatSidebar`, `ConversationListItem`, `FolderManagement` — WIRED. Tailwind + `--chat-*` tokens.
- **Composer/** `ChatComposerNew` (+ `SendButton`, `VoiceInputButton`, `AgentModeSwitcher`,
  `StyleSelector`, `FocusModeButtons`, `AttachmentPreview`, `SlashCommandMenu`, `ComposerFooter`,
  `ActiveModeTags`, `DragDropOverlay`, `VoiceRecordingOverlay`, `GhostTextOverlay`) — WIRED (rendered
  twice: empty-state + pinned). Token-based.
- **messages/** `ChatMessageList`, `MessageBubble`, `TypingIndicator`, `MessageBubbleSkeleton`,
  `MarkdownContent`, `EnhancedMarkdownRenderer`, `MessageActions`, `ReasoningAccordion`,
  `ComparisonResponse`, `EditableMessage`, `AudioPlayer`, `MediaDisplay` — WIRED.
- **artifacts/** `ArtifactsPanel`, `ArtifactsToggleButton`, `ArtifactPreview`, `InlineArtifactCards`,
  `DocumentMessage`, `DocumentActions`, `ImageAttachmentPreview` — WIRED.
- **research/** `ResearchPanel`, `ResearchToggleButton` — WIRED.
- **dialogs/** `DirectoryModal`, `CloudUpgradeWaitlistDialog`, `LocalByokHandoffDialog`,
  `GlobalSearchDialog`, `KeyboardShortcutsDialog`, `CreateBranchDialog`, `BookmarksDialog`,
  `TokenAnalyticsDialog`, `UsageWarningModal`, `EnhancedExportDialog` — WIRED (Radix Dialog).
- **cards/** `StepsCard`, `RecipeCard`, `ComparisonCard`, `CalculationCard` — WIRED (structured-response detection).
- **search/** `SearchResults`, `SearchResultCard` — WIRED.
- **workflows/** `WorkflowDisplay`, `WorkingProcess`, `CollaborativeTaskView`, `ToolProgressIndicator` — conditionally WIRED (agent mode).
- **agents/** `AgentParticipantPanel`, `EmployeeSelector`, `EmployeeWorkStream` — conditionally WIRED.
- **Tools/** `ModeSelector`; **tokens/** usage displays; **shortcuts/** `PromptShortcuts` — WIRED/conditional.
- **Main/** `ChatTopBar`, `ChatHeader`, `MessageList`, `MultiAgentChatInterface` — partial; **`MultiAgentChatInterface`/`MessageList` appear legacy/superseded** by `ChatMessageList` (candidate dead code — confirm before deletion).
- Top-level: `ThinkingBlock`, `ArtifactBlock`, `ToolCallCard`, `VoiceInputButton` — WIRED.

**Orphan candidates to confirm:** `Main/MessageList`, `Main/MultiAgentChatInterface`, old
`ChatComposer`/`MessageListNew` (referenced as superseded). `chat-interface.css` (~320 lines of
gradients/animations) appears unimported by the main page.

---

## 3. STYLING SOURCE OF TRUTH

- **`packages/design-tokens`** is the SSOT and is real/complete: `agiPalette.light/.dark`
  (surface/text/border/accent/state), `agiRadii`, `agiTypography` (sans Inter, serif IBM Plex,
  display Crimson Pro, mono JetBrains), `agiShadows`, **`agiChatCssVars.light/.dark`** (the `--chat-*`
  variables), `agiNativeColors`, plus VS Code / extension palettes.
- Dark theme: full `.dark` variants; applied via `.dark` class from `next-themes`.
- **`globals.css`** (~7.3k lines): `@import 'tailwindcss'` + `@import '@agiworkforce/design-tokens/chat.css'`
  + `@plugin "tailwindcss-animate"`; `@variant dark`; Tailwind v4 `@theme` block; scoped
  `.agi-dashboard-theme` (used by /chat) and `[data-design='agi']` (marketing).
- **Token consumption:** chat shell uses `bg-[var(--chat-bg)] text-[var(--chat-text-primary)]`;
  components use `--chat-*` throughout. **Design tokens ARE consumed** (not hardcoded) in the main flow.
- **Hardcoded-hex scan:** ~54 files contain hex or `bg-[#…]`, but most are legitimate (PDF/HTML export
  in `conversation-export.ts`, unused `chat-interface.css` gradients, test snapshots). Real UI issue:
  `messages/ReasoningAccordion.tsx` uses a **fallback hex** `var(--chat-accent-primary,#c8892a)` —
  should be pure token. (Cross-refs audit systemic #10 PII/dev-path + magic-constants sweeps.)

---

## 4. SHARED CHAT LOGIC & MODEL CATALOG

- `@agiworkforce/unified-chat` provides `SendPreview` (privacy-disclosure card above composer) +
  chat/provider-mode types; `@agiworkforce/types` provides `ChatMessage`, model metadata.
- **Model list is dynamic** (`useModelStore.availableModels`), tier-aware (free tier forced to an
  auto-economy model via `getBestAutoModeForTier('free')`). **No hardcoded model list in the chat page** — good,
  matches the locked catalog rule. (Audit systemic #9 still flags hardcoded model IDs elsewhere — out of chat-page scope.)
- `packages/providers/*` = anthropic/openai/ollama/google/deepseek/lmstudio/perplexity/xai; model SSOT
  `packages/types/src/models.json` (generated; edit `models.curation.json` + `pnpm sync:models`).

---

## 5. STREAMING / API WIRING

- Client: `useChatStream()` (`apps/web/lib/hooks/useChatStream.ts`) → `sendMessage(content, {model,
  conversationId, attachments, webSearch, thinkingEnabled, codeExecution, styleMode, skillBody})`;
  exposes `stopGeneration()`, `isStreaming`; `ChatApiError` wraps message/code/HTTP status.
- Persistence route: `apps/web/app/api/chat/conversations/[id]/messages/route.ts` (CSRF + rate-limit +
  Zod `CreateMessageSchema`, writes user msg, returns `skipLlm:true`).
- **Streaming endpoint:** OpenAI-compatible `/api/llm/v1/chat/completions` (referenced; not deeply
  mapped — confirm at edit time). Attachments: images → base64 data URL; **non-image files are blocked
  and trigger the cloud-waitlist paywall** (`WebChatPage`, ~L481) — untested path.

---

## 6. GLOBAL SHELL

- `apps/web/app/layout.tsx` — fonts Geist Sans/Mono, Newsreader (serif), JetBrains Mono as CSS vars;
  `<html suppressHydrationWarning>`.
- `apps/web/app/providers.tsx` — `QueryProvider > ThemeProvider(next-themes) > I18nextProvider >
  WaitlistModalProvider > {children} + CommandPaletteProvider + OfflineIndicator + sonner Toaster`.
- Tailwind **v4.2.2** via `@tailwindcss/postcss`; config in `globals.css` `@theme` (no JS config file).

---

## 7. TOP RISKS / GAPS FOR THE VC DEMO (verify each at edit time)

**Correctness / dead code**
1. `ReasoningAccordion.tsx` fallback hex `#c8892a` → token-ize (small, safe, do early).
2. **BYOK handoff gated by a hardcoded `false` flag** in `WebChatPage` with ~100 lines of dead path —
   ties to audit **P0-A trust-boundary**; either remove or properly gate (do NOT silently enable).
3. Non-image attachment → paywall path untested end-to-end (may 500 if cloud endpoint absent).
4. Confirm `Main/MultiAgentChatInterface`, `Main/MessageList`, `chat-interface.css` are dead before deletion.

**Visual parity (vs REFERENCE_ANALYSIS.md)**
5. Palette direction unresolved (§0 of REFERENCE_ANALYSIS) — warm vs cool.
6. Empty state: ensure serif greeting + centered composer + outlined suggestion chips (Claude tell).
7. Composer must read as one pill with **text model-label + icon-circle send** (verify current render).
8. User-bubble-right / assistant-flat-left asymmetry — verify `MessageBubble` does NOT card the assistant side.
9. Reasoning/tool/artifact rendering aligned to the **quiet** patterns + favicon results-card.
10. Sidebar sectioning (Projects/Recents headers, optional mode-switcher, profile popover) for parity.

**States & a11y**
11. Loading/error/empty states incomplete: skeletons rarely shown; error banner has dismiss but no
    "Try again"; streaming has cursor only (no stop affordance confirmed in UI); trial-exhaustion is abrupt.
12. Research/Artifacts panels: favicon fallback uses Google S2 (**CSP-blocked in prod** → broken
    icons); artifact tab bar can overflow with no scroll/overflow menu; dialog focus management/keyboard nav gaps.

**Cross-cutting from the existing audit (not chat-page-local, but demo-relevant):** P0-A trust-boundary
routing, P0-B markdown/HTML XSS (`MarkdownContent`/`EnhancedMarkdownRenderer`/`ArtifactRenderer` are
named members), P0-C web-API IDOR. These are security blockers the audit says fix before release.

---

## 8. VERIFICATION CONSTRAINT (important for the "never say done without a screenshot" rule)

The chat layout is auth-gated (Clerk) and the real API keys live in **Vercel env, not `.env.local`**
(local only has `VERCEL_OIDC_TOKEN`). So a sandbox `pnpm dev` will, without secrets, redirect `/chat`
→ `/login` and cannot render the authenticated chat. Options to enable real screenshot verification:
- (a) pull a dev-safe env (test Clerk keys + a throwaway Neon URL) so the sandbox dev server can boot
  and headless Playwright can screenshot `/chat` and the public pages;
- (b) owner runs `pnpm dev:web` locally and Claude drives the Chrome MCP / owner shares screenshots;
- (c) for pure-visual component work, render target components in an isolated harness route
  (unauthenticated) and screenshot that.
This must be chosen before Priority-2 chat work can satisfy the visual gate. Public/marketing pages
(pricing/features/docs/etc.) are mostly unauthenticated and CAN be screenshotted via (a) immediately.
