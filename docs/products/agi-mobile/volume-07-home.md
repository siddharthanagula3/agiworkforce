# AGI Mobile — Volume 07 — Home

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md`, `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, and the real surface paths `apps/mobile/app/(app)/_layout.tsx`, `apps/mobile/app/(app)/index.tsx`, `apps/mobile/app/(app)/(tabs)/_layout.tsx`, `apps/mobile/src/features/drawer/components/DrawerContent.tsx`, `apps/mobile/stores/chatStore.ts`, `apps/mobile/services/remoteChatGate.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `packages/types/src/models.json`.

## Overview & stance

This volume specifies the AGI Mobile "home" — the navigation shell a signed-in (or local-only) user lands in: the chat home, the navigation drawer, recents, search, projects, pins, the profile entry, notifications, and the empty/loading states that frame all of them. Home is the spine that routes into every other mobile domain.

Mobile exposes exactly two trust modes: **Local** (a small on-device LLM, free) and **Managed Cloud** (public alpha, open by default; the signed-in entitlement is the gate). **Mobile has no BYOK** — there is no API-key affordance anywhere in home, and "provider configuration" on mobile means on-device model management, not keys. Home is mode-aware: an `appMode` of `local` or `cloud` decides which recents and projects surface (`executionModeForConversation`), and Local conversations never auto-route off the device. Local→Cloud is an explicit, consent-gated switch (`ModeSwitchModal`), never silent. The new-chat home stays deliberately simple — **no suggestion or starter cards**.

## Home Layout

The landing surface is the chat home. `app/(app)/index.tsx` redirects to `/(app)/(tabs)/chat`, which renders a centered AGI brand mark above a greeting and the composer — no starter/suggestion cards (founder rule). The chat home doubles as the empty state for "no conversation selected." Header affordances open the drawer, profile, and a new chat. **✅ Built** — `apps/mobile/app/(app)/index.tsx`, `apps/mobile/app/(app)/(tabs)/chat.tsx` (centered brand mark + greeting, no starter cards).

## Navigation — bottom navigation + routing

The bottom tab bar has been **replaced by a slide-out drawer** (permanent sidebar on iPad ≥768px, front-drawer on iPhone). The Expo Router `Tabs` group is retained only for route compatibility with the tab bar fully hidden (`tabBar={() => null}`), so legacy routes like `/(app)/(tabs)/chat|projects|settings` still resolve. Primary nav (Projects, Artifacts, Library, the cloud-only "AGI Agent") lives in the drawer; Settings and Help & About are pinned to the drawer footer. The cloud-only AGI Agent item is hidden in local mode and, in cloud mode, opens the consent modal rather than silently switching. **✅ Built** — `apps/mobile/app/(app)/_layout.tsx`, `apps/mobile/app/(app)/(tabs)/_layout.tsx`, `apps/mobile/src/features/drawer/components/DrawerContent.tsx`. A reinstated visible bottom tab bar is **🔭 Planned** only if a future nav study justifies it; it is not built today.

**"AGI Code" (deferred, do not build now, founder decision 2026-07-04):** a richer remote-agent-session browser — top-level nav item listing live coding-agent sessions grouped by project/paired-machine, with organize/archive/connections management — is explicitly **not** in scope until CLI and Desktop are themselves production-ready, since AGI Code and the related "dispatch" companion feature both depend on those surfaces working first. Do not add a nav entry, placeholder screen, or "coming soon" affordance for this yet.

Requirements: every route registered in the drawer must resolve without crash; swipe-to-open is enabled only on phone (`swipeEnabled: !isTablet`); the active route is reflected in `accessibilityState.selected`.

## Chat History

Recents render in the drawer under a "Recents" header, capped at `DRAWER_RECENT_LIMIT` (8), filtered to the current `appMode` so Local and Cloud histories never intermix. Tapping pushes `/(app)/chat/[id]`; long-press opens pin/delete actions. History is backed by `chatStore` (`conversations`, `isLoadingConversations`). **✅ Built** — `apps/mobile/src/features/drawer/components/DrawerContent.tsx`, `apps/mobile/stores/chatStore.ts`. A full dedicated history screen with infinite scroll beyond the drawer's 8 is **🔭 Planned**.

Requirements: pinned chats sort first; deletion is confirm-gated and irreversible; Local chats are never uploaded as a side effect of being listed.

## Search Entry

A rounded search box sits below the drawer header and drives a **mode-aware** search: cloud mode runs server full-text search (`chatViewStore.searchConversations`), local mode searches on-device; results merge title matches with content matches (`searchResults`). A clear (✕) button resets the query (`testID="drawer-search-clear"`). While searching, the recents header switches to "Results." **✅ Built** — `apps/mobile/src/features/drawer/components/DrawerContent.tsx`, `apps/mobile/stores/chat/chatViewStore.ts`. A dedicated full-screen search with filters/scopes is **🔭 Planned**.

Requirements: cloud search must never run against Local-only conversations; an empty query shows recents, not an error.

## Projects

Projects appear as a drawer section (cap 6) and the Projects screen. In cloud mode the list reads `cloudProjectStore` (synced via `cloudSyncEngine`, excluding tombstoned/archived); in local mode it reads the local project store. Gated by `FEATURES.projects` (true). **✅ Built** — `apps/mobile/src/features/projects/` (`store.ts`, `service.ts`, `components/ProjectCard.tsx`), `apps/mobile/stores/projects/cloudProjectStore.ts`, `apps/mobile/app/(app)/(tabs)/projects.tsx`, `apps/mobile/app/(app)/projects/[id].tsx`.

Requirements: Local and Cloud project lists stay separate per `appMode`; deletions sync as tombstones, not hard wipes mid-render.

## Library — 🔭 Planned (approved scope addition, 2026-07-04)

A drawer nav item distinct from Artifacts/Projects: a single aggregated view of **all generated content** (generated images, generated documents/artifacts, any other model-generated output), independent of which conversation produced it. This is a read/browse surface over existing generated-content stores (image-generation output, artifact output) — it must not introduce a second copy of that data; it indexes/aggregates the same records already owned by their respective features (Volume 17 — Image Generation; Artifacts). Same Local/Cloud mode-filtering convention as Projects and Chat History.

## Pinned Conversations

Long-pressing a recent opens an action sheet to Pin/Unpin (`pinConversation`) or Delete (`deleteConversation`). Pinned items render a filled `Pin` glyph and sort above unpinned within the active mode. **✅ Built** — `apps/mobile/src/features/drawer/components/DrawerContent.tsx` (`handleConversationLongPress`), `apps/mobile/stores/chatStore.ts` (`pinConversation`).

Requirements: pin state persists across relaunch; pinning a Local chat keeps it Local.

## Profile Menu

A profile icon (`UserCircle`) in the drawer header routes to `/(app)/profile`. Mobile keeps a **real auth gate for Cloud** — there is no demo bypass; signing in is the Managed-Cloud entitlement. The profile menu must never expose API-key entry (no BYOK). **✅ Built** — `apps/mobile/src/features/drawer/components/DrawerContent.tsx` (header `UserCircle`), `apps/mobile/app/(app)/profile/index.tsx`.

Requirements: signed-out users see Local state and a sign-in path; account/usage/billing surfaces honor `FEATURES.billing` gating.

## Notifications

The notification center (`/(app)/notifications`) lists in-app notifications with timestamps, priority tiers, and deep-link actions, backed by `useNotificationCenter` and `formatNotificationTime`. **🟡 Partial** — screen and store exist (`apps/mobile/app/(app)/notifications/index.tsx`, `apps/mobile/services/notifications.ts`, `apps/mobile/src/features/notifications/`), but push delivery and several producers remain feature-flag gated (`FEATURES`), so the center can render empty until producers ship. A persistent drawer entry point and unread badge are **🔭 Planned**.

## Empty States

Home shows explicit empty copy, never blank panes: "No recent chats" / "No matches" in the drawer, the centered brand-mark + greeting on the chat home, and a project empty state on the Projects screen. **✅ Built** — `apps/mobile/src/features/drawer/components/DrawerContent.tsx`, `apps/mobile/app/(app)/(tabs)/chat.tsx`, `apps/mobile/app/(app)/(tabs)/projects.tsx`.

Requirements: empty copy must distinguish "nothing yet" from "search returned nothing"; cloud-disabled empty states must read as Local-available, not broken (`remoteChatGate` messaging).

## Loading States

`chatStore` exposes `isLoadingConversations` and `isLoadingMessages`; lists must show a loading affordance and avoid flashing the empty state during hydration. **🟡 Partial** — loading flags exist (`apps/mobile/stores/chatStore.ts`), but standardized skeletons across drawer/projects/notifications are **🔭 Planned**; today some lists fall back to empty copy while loading.

## Repository map

- `apps/mobile/app/(app)/_layout.tsx`, `apps/mobile/app/(app)/index.tsx`, `apps/mobile/app/(app)/(tabs)/_layout.tsx` — drawer shell + route-compat tabs.
- `apps/mobile/src/features/drawer/components/DrawerContent.tsx` — home navigation, recents, search, pins, profile/new-chat header.
- `apps/mobile/src/features/sidebar/` — `ConversationList`, `SearchBar`, `TagFilter` (shared list primitives).
- `apps/mobile/src/features/projects/`, `apps/mobile/stores/projects/cloudProjectStore.ts`, `apps/mobile/app/(app)/projects/[id].tsx` — projects.
- `apps/mobile/stores/chatStore.ts`, `apps/mobile/stores/chat/chatViewStore.ts` — history, search, pin state.
- `apps/mobile/app/(app)/notifications/index.tsx`, `apps/mobile/services/notifications.ts`, `apps/mobile/src/features/notifications/` — notifications.
- `apps/mobile/services/remoteChatGate.ts`, `apps/mobile/lib/v1FeatureFlags.ts` — Cloud gating (fails closed), mode flags.
- `apps/mobile/app/(app)/profile/index.tsx` — profile entry.

## Competitor notes

ChatGPT and Claude mobile both use a single-account cloud history with a slide-out conversation drawer and an account menu; neither offers a local on-device trust mode, and neither asks for provider keys on phone. AGI's deliberate divergence: home is **mode-partitioned** — Local (on-device LLM) and Managed Cloud recents/projects never intermix, and the cloud entitlement is an explicit, consent-gated step rather than the only path. AGI's drawer surfaces a multi-provider, per-surface trust model (Local + Cloud here; BYOK only on Desktop/CLI/VS Code). Like the incumbents, AGI keeps the new-chat home minimal (no starter cards), but unlike them it never implies a single always-cloud account.

## Acceptance / Definition of Done

Home is production-ready when navigation, recents, search, projects, pins, profile, notifications, and empty/loading states all behave correctly in both Local and Cloud modes, with no BYOK affordance anywhere and no silent Local→Cloud routing.

- [ ] Build: every drawer route resolves; chat home renders with no starter cards; typecheck (`pnpm --filter @agiworkforce/mobile typecheck`) and tests (`pnpm --filter @agiworkforce/mobile test`) pass.
- [ ] Trust: recents/projects honor `appMode`; Local items never upload as a listing side effect; Local→Cloud requires `ModeSwitchModal` consent; `remoteChatGate` fails closed when Cloud is disabled and the empty state reads Local-available.
- [ ] Security: profile/account exposes no API-key entry; deletes are confirm-gated; signed-out users get Local state plus a real sign-in path (no demo bypass).

## Anti-patterns

- Adding any BYOK / API-key field to mobile home, profile, or settings.
- Auto-sending or auto-routing Local chats to Cloud, or merging Local and Cloud recents/projects.
- Re-adding suggestion/starter cards to the new-chat home.
- Faking notifications, badges, or availability the producers do not yet emit.
- Hardcoding a model ID; read from `packages/types/src/models.json`.
- Referencing Supabase (removed) or any deprecated tier ("Plus", `pro_plus`, "Hobby"); use Free / Basic / Pro / Max / Enterprise.
- Showing a blank pane instead of an explicit empty or loading state.
