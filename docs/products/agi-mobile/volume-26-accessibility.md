# AGI Mobile — Volume 26 — Accessibility

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: Grounded in `AGENTS.md`, `docs/current/source-of-truth.md`, `apps/mobile/AGENTS.md`, `docs/products/README.md`, and verified mobile paths `apps/mobile/src/ui/theme/useTheme.ts`, `apps/mobile/src/ui/theme/tokens.ts`, `apps/mobile/src/features/edge-cases/components/OfflineBanner.tsx`, `apps/mobile/app/(app)/settings/performance.tsx`, and `apps/mobile/src/features/chat/components/ChatInput.tsx`. Model IDs come only from `packages/contracts/types/src/models.json`.

## Overview & stance

This volume defines accessibility (a11y) requirements for AGI Mobile (Expo / React Native; root iOS in `/ios`). Accessibility is a first-class, testable surface contract, not a polish pass. Because mobile exposes exactly two trust modes — **Local** (small on-device LLM, free) and **Managed Cloud** (public alpha, real auth gate) — and **no BYOK**, accessibility must behave identically across both modes. A blind or low-vision user must reach the same chat, model picker, and approval gates regardless of trust mode. Accessibility must never leak the trust boundary: assistive tech announces _which_ mode is active (Local vs Cloud) but must never offer a hidden affordance — there is no "enter API key" control to expose, because mobile has no BYOK. `remoteChatGate` failing closed when Cloud is disabled must also fail closed to assistive tech (no orphan focus targets, no announced-but-dead buttons).

A11y also respects mobile's compute posture: heavy generation (image gen, document rendering) is cloud-backed, so accessible progress announcements describe a remote operation, not a local one. The standing principle: every interactive element is reachable, labeled, operable, and state-announced under VoiceOver, TalkBack, Dynamic Type, High Contrast, external keyboards, and Reduced Motion.

## VoiceOver — iOS

VoiceOver support means every actionable element exposes an `accessibilityRole`, an `accessibilityLabel`, and (for stateful controls) `accessibilityState` / `accessibilityValue`. Custom composite controls must group children so VoiceOver reads one coherent element, not fragments. Live regions (streaming tokens, benchmark status) use `AccessibilityInfo.announceForAccessibility` so progress is spoken without stealing focus.

- 🟡 Partial — `accessibilityLabel`/`accessibilityRole` are applied across most screens and feature components (e.g. `apps/mobile/src/features/sidebar/components/ConversationItem.tsx`, `apps/mobile/app/(app)/(tabs)/chat.tsx`, `apps/mobile/app/(app)/billing/index.tsx`), and `announceForAccessibility` is wired in `apps/mobile/app/(app)/settings/performance.tsx`. Gap: coverage is not enforced repo-wide, custom grouping/`accessibilityValue` is inconsistent, and streaming chat token output has no audited live-region contract yet.
- 🔭 Planned — a lint/check gate (`pnpm check:mobile-hygiene` extension) that fails CI when a `Pressable`/`TouchableOpacity` ships without a label or role; a VoiceOver rotor/heading map for chat, settings, and the approval modal.

## TalkBack — Android

TalkBack consumes the same React Native accessibility props, but ordering, focus on screen change, and Android-specific announcements must be verified independently. Screen transitions must move focus to the new screen's heading; modals (approval, paywall, age gate) must trap focus and restore it on dismiss.

- 🟡 Partial — shared accessibility props carry to Android via React Native, so labeled controls work under TalkBack today. Gap: focus-on-navigation and modal focus-trap/restore are not explicitly implemented or tested on Android; no Android-specific announcement audit exists.
- 🔭 Planned — explicit `accessibilityViewIsModal` on every overlay (e.g. `apps/mobile/src/shared/components/ApprovalModal.tsx`) and programmatic focus management on route change for Expo Router stacks.

## Dynamic Type — font scaling

Text must scale with the OS font-size setting (iOS Dynamic Type / Android font scale). React Native scales `Text` by default, so the requirement is twofold: (1) do not disable scaling, and (2) clamp extreme multipliers so layout does not break — using `maxFontSizeMultiplier` on dense controls rather than `allowFontScaling={false}`. Containers must grow or wrap, never clip; touch targets stay ≥44×44pt as text grows.

- 🟡 Partial — no `allowFontScaling={false}` overrides were found, so OS scaling is honored by default. Gap: no `maxFontSizeMultiplier` clamps and no audited reflow at the largest accessibility text sizes; `useWindowDimensions` is used for layout (e.g. `apps/mobile/src/features/chat/components/MessageBubble.tsx`) but `fontScale` is not consulted.
- 🔭 Planned — a shared `AppText` primitive in `apps/mobile/src/ui/` that centralizes sensible `maxFontSizeMultiplier` defaults, plus snapshot tests at XXXL text.

## High Contrast

High-contrast support means meeting WCAG AA contrast in both light and dark themes and honoring the OS "Increase Contrast" / high-contrast setting with a stronger palette (heavier borders, higher-contrast text, non-color status cues).

- 🟡 Partial — the theme system (`apps/mobile/src/ui/theme/useTheme.ts`, `apps/mobile/src/ui/theme/tokens.ts`) provides curated light/dark palettes and an accent system, giving a controlled contrast baseline. Gap: there is no dedicated high-contrast token set and no listener for the OS increase-contrast flag; status is sometimes color-only (e.g. agent state colors) without a redundant icon/label.
- 🔭 Planned — a `highContrast` token variant resolved in `useTheme`, redundant non-color status indicators, and an automated contrast-ratio check over `tokens.ts`.

## Keyboard Navigation — external keyboards

Mobile must remain usable with a paired Bluetooth/USB keyboard (iPad, Android tablets, accessibility switch setups). This covers two layers: the soft-keyboard layout (already handled) and hardware-key navigation/shortcuts. Requirements: visible focus indication, logical tab order, Enter-to-send in the composer, and Escape/dismiss for modals.

- 🟡 Partial — soft-keyboard handling is solid: `KeyboardAvoidingView` and related patterns are used in the composer and sheets (e.g. `apps/mobile/src/features/chat/components/ChatInput.tsx`, `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx`). Gap: there is no hardware-key handling (`onKeyPress`-driven shortcuts), no managed focus ring, and no tab-order contract for external keyboards.
- 🔭 Planned — external-keyboard shortcut map (send, new chat, switch trust mode, dismiss) and a documented focus order, validated on iPadOS hardware keyboard.

## Reduced Motion

When the OS Reduce Motion setting is on, animations must degrade to instant or simple opacity transitions — no slides, springs, parallax, or looping motion. The app must read the flag and subscribe to changes.

- 🟡 Partial — Reduce Motion is honored in specific components via `AccessibilityInfo.isReduceMotionEnabled` (`apps/mobile/src/features/edge-cases/components/OfflineBanner.tsx`, `apps/mobile/src/features/edge-cases/components/ModelLoadingFirstRunModal.tsx`), which fall back to opacity-only transitions. Gap: there is no app-wide reduced-motion provider; other animated surfaces (voice UI, transitions, progress bars) do not consistently consult the flag, and the live `change` event is not subscribed.
- 🔭 Planned — a shared `useReducedMotion` hook feeding a motion-token layer so every animation respects the setting from one source.

## Repository map

- `apps/mobile/src/ui/theme/` — `useTheme.ts`, `tokens.ts` (palette, contrast baseline, target high-contrast variant).
- `apps/mobile/src/features/edge-cases/components/` — `OfflineBanner.tsx`, `ModelLoadingFirstRunModal.tsx` (reduced-motion reference implementations).
- `apps/mobile/app/(app)/settings/performance.tsx` — `announceForAccessibility` live status.
- `apps/mobile/src/features/chat/components/` — `ChatInput.tsx`, `MessageBubble.tsx` (composer keyboard handling, scaling-sensitive layout).
- `apps/mobile/src/shared/components/ApprovalModal.tsx`, `apps/mobile/src/features/billing/` paywall, `apps/mobile/app/(public)/age-gate.tsx` — modals needing focus trap/restore.
- `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/services/remoteChatGate.ts` — gating that must fail closed to assistive tech.
- Future shared a11y primitives belong in `apps/mobile/src/ui/`; cross-surface tokens should be reused from shared `packages/`, not re-forked.

## Competitor notes

ChatGPT and Claude mobile apps ship mature VoiceOver/TalkBack labeling, Dynamic Type, and reduced-motion handling for a single cloud chat. AGI's deliberate divergence: accessibility must hold across **two trust modes** (Local on-device + Managed Cloud) and across more surfaces than a single chat — model management, approvals, capture, schedules. Where competitors expose one account-keyed cloud assistant, AGI must keep parity between a free on-device model and cloud chat without ever surfacing a BYOK key field (mobile has none) and without faking availability. Multi-provider model choice (IDs from `packages/contracts/types/src/models.json`) must itself be accessible: the picker announces provider/model and trust mode, never an invented or hardcoded ID. Assistive tech should make the Local-vs-Cloud boundary _more_ legible, not less.

## Acceptance / Definition of Done

Production-ready means: every interactive element is reachable and labeled under VoiceOver and TalkBack; text reflows (not clips) at the largest accessibility size; contrast meets WCAG AA in both themes; modals trap and restore focus; Reduce Motion is honored app-wide; and no accessibility path crosses a trust boundary or exposes a non-existent (BYOK) affordance.

- [ ] Build / coverage: a CI check fails when an interactive element ships without role + label; XXXL-text snapshot and contrast-ratio checks pass.
- [ ] Trust: assistive tech announces active trust mode (Local vs Cloud); `remoteChatGate` failing closed leaves no orphan focus targets; no BYOK control is exposed anywhere.
- [ ] Security/privacy: accessibility announcements never read secrets, raw tokens, or Local chat content into Cloud paths; live-region text is sanitized.

## Anti-patterns

- Adding any BYOK / "enter API key" control on mobile to "complete settings a11y" — mobile has no BYOK; never add one.
- Auto-sending or auto-routing Local content to Cloud to make an accessible flow "just work" — trust boundaries hold under assistive tech too.
- Faking unsupported capability: announcing a feature (e.g. high-contrast mode, external-keyboard shortcuts) that is not implemented. Label it 🔭, do not ship a dead control.
- `allowFontScaling={false}` to "fix" layout — clamp with `maxFontSizeMultiplier` and reflow instead.
- Color-only status with no redundant icon/label; assuming a fixed light/dark contrast is enough without honoring the OS contrast flag.
- Hardcoding or inventing a model ID in an accessible picker — read from `packages/contracts/types/src/models.json`.
- Referencing Supabase or any removed tier ("Plus", "Hobby", `pro_plus`) in accessible copy, paywall labels, or settings.
