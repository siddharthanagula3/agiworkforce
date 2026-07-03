# AGI Mobile — Volume 31 — UI Component Library

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md` (root), `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/mobile/components/ui/`, `apps/mobile/src/features/chat/components/`, `apps/mobile/src/ui/theme/tokens.ts`, `packages/ui/src/`, `packages/unified-chat/src/components/`, `packages/design-tokens/src/`, `apps/mobile/lib/v1FeatureFlags.ts`, `packages/types/src/models.json`.

## Overview & stance

This volume specifies the reusable UI component layer for AGI Mobile: the navigation chrome, composer, chat surface, cards, dialogs, bottom sheets, toasts, typography, icons, and motion that every mobile screen composes from. The mandate (per memory `feedback-shared-packages-mandate`) is **reuse, do not fork the shell**: the shared chat shell lives in `packages/unified-chat/src/components/` and shared primitives/tokens in `packages/ui/src/` and `packages/design-tokens/src/`. Mobile themes and wraps those for React Native — it does not reimplement a parallel design system.

Trust mode shapes the component layer in two binding ways. First, **Mobile has no BYOK** — there is no API-key field, no "add provider key" affordance anywhere in this library. "Provider Configuration" on mobile means on-device model management (downloads, tier guard), surfaced through the model picker, not key entry. Second, components must render the **Local vs Managed Cloud** boundary honestly: a visible mode/provider label, a real auth gate before Cloud, and `remoteChatGate` failing closed when Cloud is disabled (`apps/mobile/services/remoteChatGate.ts`, `apps/mobile/lib/v1FeatureFlags.ts`). The new-chat home stays simple — no suggestion/starter cards (memory `feedback-mobile-home-simple`). Model labels come only from `packages/types/src/models.json`; components never hardcode IDs.

## Navigation Components

Routing uses Expo Router. The tab navigator (`apps/mobile/app/(app)/(tabs)/_layout.tsx`) registers `chat`, `projects`, `agents`, `settings` but renders `tabBar={() => null}` — primary navigation is the **drawer/sidebar**, not a bottom tab bar. The shared sidebar shell lives in `packages/ui/src/sidebar/` (`Sidebar.tsx`, `Menu.tsx`, `SessionItem.tsx`, `SearchOverlay.tsx`); mobile-specific drawer/sidebar wrappers live in `apps/mobile/src/features/drawer/` and `apps/mobile/src/features/sidebar/`. ✅ Built (`apps/mobile/app/(app)/(tabs)/_layout.tsx`, `apps/mobile/src/features/drawer/`). Requirements: header back affordance honors gesture-handler swipe-back; the drawer lists conversations grouped temporally (`packages/ui/src/sidebar/temporal.ts`); search overlay is a single shared component; no Cloud-only destination is reachable when `FEATURES.cloudChat` is off or auth is absent.

## Composer Components

The composer is the mobile message input: `apps/mobile/src/features/chat/components/Composer/Composer.tsx` plus `ChatInput.tsx`, `SendButton.tsx`, `AttachmentPreview.tsx`, `QuotedReplyBar.tsx`, `ModeToggle.tsx`, `ModelSelectorButton.tsx`, `SendPreview.tsx`. ✅ Built. Requirements: a single multiline input that grows to a capped height then scrolls; an explicit send control (never auto-send a Local draft — see Anti-patterns); a visible mode toggle (Local / Cloud) and model label sourced from `models.json`; attachment menu mirrors the shared `AttachmentMenu`/`ChatInputToolbar` from `packages/unified-chat/`. `SendPreview.tsx` is shown for the Local→Cloud transition with a payload preview and consent. Keyboard avoidance via `react-native-safe-area-context`. Image generation surfaced here is cloud-backed only — mobile is not the first heavy local image-gen surface.

## Chat Components

The transcript layer reuses shared components themed for RN. Shared: `packages/unified-chat/src/components/` (`MessageBubble`, `MessageList`, `InlineToolCall`, `ToolCallCard`, `ProvenanceFooter`, `ThinkingBlock`). Mobile: `apps/mobile/src/features/chat/components/` (`MessageBubble.tsx`, `MessageList.tsx`, `MessageContentRenderer.tsx`, `InlineToolCall.tsx`, `StreamingIndicator.tsx`, `TypingIndicator.tsx`, `ThinkingChip.tsx`, `CitationChip.tsx`, `CodeBlockCopyButton.tsx`, `MathBlock.tsx`). ✅ Built. Requirements: markdown + code + math render without layout thrash during streaming; tool calls render inline with collapsible detail; every assistant turn carries a provenance/mode label; long lists virtualize. The inline tool-call UI is verified by fixture tests (recent commit `f56a56868`).

## Cards

Primitive card in `apps/mobile/components/ui/card.tsx`. Domain cards: `ApprovalCard.tsx`, `GeneratedFileCard.tsx`, `InlineArtifactCard.tsx`, `PerformanceChip.tsx` (`apps/mobile/src/features/chat/components/`), plus shared `ProjectCard`/`DownloadCard` in `packages/unified-chat/`. ✅ Built. Requirements: cards use token surfaces (`surfaceElevated`, `border`) from `apps/mobile/src/ui/theme/tokens.ts`, never raw hex; `ApprovalCard` is the human-in-the-loop gate for risky/remote actions and must require explicit confirmation; generated-file/long-compute cards delegate to Desktop/host or managed compute rather than running heavy work on-device (`apps/mobile/AGENTS.md`).

## Dialogs

Modal dialogs: `MessageEditModal.tsx`, `ModeSwitchModal.tsx` (`apps/mobile/src/features/chat/components/`), `ModelLoadingFirstRunModal.tsx` (`apps/mobile/src/features/edge-cases/components/`), and `CommandPalette.tsx`. ✅ Built. Requirements: dialogs trap focus, dim with the `scrim` token, dismiss on backdrop/back-gesture, and never silently change trust mode — `ModeSwitchModal` is the consent surface for Local↔Cloud. A standardized shared confirm/alert dialog is 🔭 Planned (today modals are per-feature; consolidating into one shared primitive is not yet built).

## Bottom Sheets

Backed by `@gorhom/bottom-sheet` (^5). Primitive: `apps/mobile/components/ui/bottom-sheet.tsx`. Instances: `PaywallBottomSheet.tsx`, `ThinkingBottomSheet.tsx`, `AddToChatSheet.tsx`, `ConversationExportSheet.tsx`. ✅ Built. Requirements: detents/snap points are defined per sheet; sheets respect safe-area insets and gesture-handler drag-to-dismiss; `PaywallBottomSheet` renders plans strictly from the canon ladder (Free / Basic / Pro / Max / Enterprise) and never invents INR for Pro/Max; it surfaces no key-entry affordance.

## Toasts

A unified toast/snackbar system is **🔭 Planned**. Today, transient feedback is delivered through inline banners: `OfflineBanner.tsx` (`apps/mobile/src/features/edge-cases/components/`) and `SendErrorBanner.tsx` (`apps/mobile/src/features/chat/components/`) — 🟡 Partial (banners exist; no centralized, queued, auto-dismissing toast host). Requirements for the planned host: a single imperative API, queueing with max concurrency, accessible announcements, success/error/info variants mapped to token surfaces (`successSurface`, `dangerSurface`, `warningSurface`), and haptic pairing via `expo-haptics`. Until shipped, do not fake a toast with an ad-hoc per-screen overlay.

## Typography

Shared scale in `apps/mobile/components/ui/text.tsx` with `variant` values `default | heading | subheading | caption | mono`, layered over NativeWind (`tailwind.config.js`) and theme tokens. ✅ Built. Requirements: all screen text routes through `Text` (no raw `RNText` with hardcoded sizes); line-height is auto-derived when only `fontSize` is set; color comes from `textPrimary/textSecondary/textMuted` tokens for light/dark parity; `mono` is reserved for code and IDs.

## Icons

Icons use `lucide-react-native` (^0.577) and `react-native-svg`; tool-call glyph mapping in `apps/mobile/src/features/chat/components/toolIconRN.ts` (shared resolver `packages/ui/src/toolIcon.ts`); brand marks `AgiMark.tsx` and `ProviderMark.tsx` (`packages/ui/src/`). ✅ Built. Requirements: one icon set (no mixing libraries per screen); icon size/stroke pulled from tokens; provider marks reflect the real active provider — never show a provider badge for a model that is not actually serving the turn.

## Animations

Motion uses `react-native-reanimated` (4.3.1) with `expo-haptics`. Animated components include `StreamingIndicator.tsx`, `TypingIndicator.tsx`, `ImageGenProgress.tsx`, `ConversationItem.tsx`, `OfflineBanner.tsx`. ✅ Built. Requirements: animations run on the UI thread (worklets) and stay 60fps; respect OS reduce-motion; streaming/typing indicators must reflect real stream state, not a decorative loop that runs without an active request; durations/easings centralized rather than per-component magic numbers (centralization is 🔭 Planned).

## Repository map

- `apps/mobile/components/ui/` — primitives: `text`, `button`, `card`, `bottom-sheet`, `input`, `badge`, `avatar`, `switch`, `separator`, `skeleton`, `AgiMark`.
- `apps/mobile/src/features/chat/components/` — composer, message, card, dialog, indicator components.
- `apps/mobile/src/features/{drawer,sidebar,model-picker,edge-cases}/` — navigation + feedback surfaces.
- `apps/mobile/src/ui/theme/` — `tokens.ts`, `useTheme.ts`.
- `apps/mobile/app/(app)/(tabs)/_layout.tsx` — navigator.
- `packages/ui/src/` — shared sidebar, settings-modal, marks, icon resolver.
- `packages/unified-chat/src/components/` — shared chat shell (reuse target).
- `packages/design-tokens/src/` — `chat.css`, token index.

## Competitor notes

ChatGPT and Claude mobile ship a single-provider, cloud-only component set: one model family, a bottom-tab/drawer hybrid, native sheets, and a toast/snackbar layer. AGI's deliberate divergence: components must express **multi-provider** model selection (labels from `models.json`), an **on-device Local** mode alongside Managed Cloud, and **per-surface trust** rendered in the UI (visible mode/provider label, explicit Local→Cloud consent). Unlike both competitors, AGI mobile **never** exposes a key-entry component — BYOK is Desktop/CLI/VS Code only. Components are built once in shared packages so Web/Desktop/Mobile stay visually and behaviorally consistent.

## Acceptance / Definition of Done

Production-ready when every screen composes from this library (no one-off duplicates), trust state is always visible, and `pnpm --filter @agiworkforce/mobile typecheck` and `test` pass.

- [ ] Build: components consume `src/ui/theme/tokens.ts` (no hardcoded hex); typecheck + component tests green; light/dark parity verified.
- [ ] Trust: mode/provider label visible on every turn; no BYOK/key-entry affordance anywhere; `remoteChatGate` fails closed when Cloud is off; Local→Cloud requires `SendPreview`/`ModeSwitchModal` consent.
- [ ] Security/integrity: `ApprovalCard` gates risky/remote actions; provider/availability badges reflect real state (no fake badges); model labels resolve from `models.json`.

## Anti-patterns

- Adding a BYOK/API-key field or "Provider Configuration = keys" anywhere in mobile UI.
- Auto-sending a Local draft, or silently routing Local content into Cloud without preview + consent.
- Faking unsupported capability: decorative toasts/spinners/availability badges with no backing state.
- Hardcoding model IDs/labels instead of reading `packages/types/src/models.json`.
- Forking the shared chat/sidebar shell instead of theming `packages/unified-chat` / `packages/ui`.
- Hardcoding colors/sizes instead of theme tokens; mixing multiple icon libraries on one screen.
- Referencing Supabase, or surfacing removed tiers (Plus / pro_plus / Hobby) in any pricing component.
