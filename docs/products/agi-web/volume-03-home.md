# AGI Web — Volume 03 — Home

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/web/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), grounded in real repo code: `apps/web/features/chat/v3/**`, `apps/web/features/chat/components/{GreetingBanner,dialogs/GlobalSearchDialog,messages,Sidebar}`, `apps/web/features/chat/{hooks,services}/**`, `apps/web/features/projects/**`, `apps/web/app/{projects,gallery,settings}/**`, `apps/web/app/api/{chat,memory,projects}/sync/route.ts`, `apps/web/proxy.ts`, and model facts from `packages/contracts/types/src/models.json` (via `@agiworkforce/types`).

## Overview & stance

This volume specifies the AGI Web **Home** shell: the persistent left sidebar, chat history/recents, global search, the Projects and Artifacts entry points, new chat, the account/profile area, notifications, and empty/loading states. AGI Web is the **cloud-only** surface — there is **no Local mode and no BYOK affordance**, and none may ever be added to Home. Everything reachable from Home runs in the **Managed Cloud** trust mode, RLS-scoped to the authenticated Clerk user in Neon, and subscription-backed. Recents, history, projects, and artifacts are populated by the Neon delta-sync APIs Web hosts (`apps/web/app/api/{chat,memory,projects}/sync`); only Managed-Cloud rows appear, and Local/BYOK rows from Desktop/CLI/VS Code are structurally excluded. The shell renders through Next.js 16 App Router with `proxy.ts` (exported `proxy` function — never `middleware.ts`) gating auth before any Home route paints.

## Layout

The Home shell is a full-height flex layout: a collapsible left sidebar plus a main view area hosting the chat interface or a routed view. ✅ Built — `apps/web/features/chat/v3/WebShellV3.tsx` renders `WebSidebar` (240px expanded / 64px collapsed) beside `ChatInterface` from `@agiworkforce/unified-chat`. Ctrl+K / Cmd+K toggles global search shell-wide via a `keydown` listener. Nav resolves to real routes through `VIEW_ROUTES` (`/projects`, `/gallery`, `/customize`, `/settings/*`). The layout stays single-column-collapsible with no second permanent panel, reusing shared unified-chat components so Web keeps reuse-not-rewrite parity with Desktop's `DesktopShellV3`.

## Sidebar — search, collapse, new chat, projects, artifacts, recents, account area (UX Lock)

The sidebar is the fixed navigation contract for Home; its element set and order are a **UX Lock** — not silently removed or reordered. ✅ Built — `apps/web/features/chat/v3/WebSidebar.tsx`, top to bottom: (1) **AGI wordmark** + **collapse toggle** (`PanelLeftClose`/`PanelLeftOpen`, animates 240↔64px); (2) **New chat** button (`Plus`); (3) **Search** row with a visible `Ctrl+K` hint; (4) per-mode **nav** — **Projects** (`FolderOpen`), **Artifacts** (`Box`), **Customize** (`Sliders`); (5) **Recents** (grouped, see Chat History); (6) a **collapsed icon rail** (Projects/Artifacts/Customize/Settings) when narrowed; (7) the **account area** footer — avatar initials, display name, plan badge. Trust rule: the sidebar exposes **no** provider-key entry, Local toggle, or BYOK fork anywhere — forbidden on Web. The plan badge reads from the billing store (`subscription.display_name`, defaulting to `Free`) and must render canon tiers (Free / Basic / Pro / Max / Enterprise), never removed tiers.

## Chat History

Recents surface the user's most recent conversations, grouped into time buckets — Last hour, Today, Yesterday, Past week, Past month — capped at 30 with a **Show all** expander. ✅ Built — `groupConversations`/`normalizeConversations` in `WebSidebar.tsx` (filters archived, sorts by `updatedAt`), fed by the host-bridge snapshot; full CRUD (rename, star, pin, archive, delete, duplicate, share) lives in `apps/web/features/chat/hooks/use-conversation-history.ts` + `services/conversation-storage.ts`. History is user-scoped and cross-device: it hydrates from and writes tombstones through `apps/web/app/api/chat/sync/route.ts`, and clicking an item jumps via `hostBridge.selectConversation`. History must never surface another user's rows or any Local/BYOK conversation.

## Search

Global search opens from the sidebar row or Ctrl+K and searches across all sessions and messages with filters, result navigation, and recent/popular history. ✅ Built — `apps/web/features/chat/v3/WebSearchModalCmdK.tsx` is a thin alias mounting the canonical `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx` (Fix 37), backed by `services/global-search-service.ts` and `hooks/use-search-history.ts`. Results are user-scoped; queries and history are RLS-bound and must never return another user's rows. In-conversation find (Cmd+F) is a separate scope in Volume 04.

## Projects

Projects is a first-class Home destination for grouping conversations, sources, and knowledge files under a workspace. ✅ Built — sidebar nav routes to `/projects` (`apps/web/app/projects/page.tsx`), which mounts the shared `ProjectGallery`/`ProjectCard` from `@agiworkforce/unified-chat` with sort modes (Updated / Created / Name / Starred, Fix 52). Project management UI (`ProjectSidebar`, `ProjectSettingsDialog`, `AddSourcesModal`, `KnowledgeFilesPanel`, `SourcesPanel`) lives in `apps/web/features/projects/`. Project rows are Managed-Cloud only and sync via `apps/web/app/api/projects/sync/route.ts`. Artifacts route to `/gallery` (`apps/web/app/gallery/`). 🟡 The sidebar exposes Artifacts as a nav entry to the gallery, but the deeper live-artifacts workflow (`work-artifacts`) is a Work-mode surface, not the default chat Home.

## New Chat

The New chat action starts a fresh conversation from anywhere in Home. ✅ Built — `handleNewChat` in `WebShellV3.tsx` calls `hostBridge.createConversation('New Conversation')` (falling back to `runtime.createConversation`) then selects it; the label switches to "New session" only in code mode. A new conversation is a user-scoped Neon row in the Managed-Cloud boundary; the composer's model selector reads the catalog from `@agiworkforce/types` (backed by `packages/contracts/types/src/models.json`) — **never a hardcoded model ID**.

## Profile Menu

The account/profile area is the sidebar footer button showing avatar initials, display name, and current plan. 🟡 Partial — `WebSidebar.tsx` renders the footer and calls `onOpenAccountMenu`, which currently **navigates** to `/settings/account` (via `WebShellV3` → `VIEW_ROUTES.account`) rather than opening an in-place dropdown. Identity is Clerk-backed; account/profile/billing/usage live under `apps/web/app/settings/{account,profile,billing,usage}`. 🔭 A true inline profile **popover** (quick links to Profile, Billing, Usage, Theme, Sign out without a route change) is design intent, not built — do not label a dropdown menu as shipped.

## Notifications

Two notification concerns exist. ✅ Built — a **browser notification-permission** prompt appears during long generations (`apps/web/features/chat/pages/WebChatPage.tsx`, `Bell` banner calling `Notification.requestPermission()`); and **notification preferences** are configurable at `apps/web/app/settings/notifications` (`apps/web/features/settings/components/Settings/Notifications.tsx`). 🔭 A dedicated in-app **notification center / inbox** in Home (unread badge, activity feed) is planned, not built — do not present an inbox as available.

## Empty States

When a conversation has no messages, Home shows a time-aware greeting with quick-start suggestion chips. ✅ Built — `apps/web/features/chat/v3/WebEmptyChat.tsx` renders `GreetingBanner` (`components/GreetingBanner/`, `useGreeting.ts`), whose chips pre-fill the composer draft via `setDraftContent` (they do not auto-send) and use design tokens, not hardcoded colors. Empty history/recents render nothing rather than a broken group header. (The simple-home rule applies to Mobile; Web deliberately keeps the greeting + chips.)

## Loading States

History, gallery, and chat views show skeletons rather than blank frames while data hydrates. ✅ Built — `apps/web/features/chat/components/messages/ChatLoadingState.tsx` arranges alternating `MessageBubbleSkeleton.tsx` bubbles; `apps/web/components/ui/Skeleton.tsx` is the shared primitive; `apps/web/app/gallery/loading.tsx` is a route-level loading boundary. Skeletons must match the eventual layout to avoid content-shift; streaming/first-token states live in Volume 04.

## Repository map

- `apps/web/features/chat/v3/` — `WebShellV3.tsx` (layout), `WebSidebar.tsx` (UX-lock sidebar), `WebEmptyChat.tsx`, `WebSearchModalCmdK.tsx`.
- `apps/web/features/chat/components/` — `GreetingBanner/`, `dialogs/GlobalSearchDialog.tsx`, `messages/{ChatLoadingState,MessageBubbleSkeleton}.tsx`, `Sidebar/`.
- `apps/web/features/chat/{hooks,services}/` — `use-conversation-history.ts`, `conversation-storage.ts`, `global-search-service.ts`, `use-search-history.ts`.
- `apps/web/features/projects/` — gallery/sidebar/settings/sources components + stores.
- `apps/web/app/{projects,gallery,settings}/` — Projects hub, Artifacts gallery, account/notifications routes.
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — Neon delta-sync feeding recents/projects; `apps/web/proxy.ts` gates Home routes.

## Competitor notes

Claude, ChatGPT, and Codex all ship a left-rail Home with search, recents, projects, and an account menu. AGI Web's deliberate divergence: (1) **per-surface trust** — Home is Managed-Cloud-only with **no BYOK/Local** entry point, unlike Desktop/CLI/VS Code; (2) **multi-provider by catalog** — new chats read models from `packages/contracts/types/src/models.json`, not one vendor; (3) **local-first suite posture** — Home is fed by the Neon delta-sync Web hosts for Mobile/Desktop, and Local/BYOK data is structurally excluded, not optionally hidden. We match the table-stakes shell and win on trust clarity and provider neutrality.

## Acceptance / Definition of Done

Home is production-ready when a signed-in user lands in the shell, sees grouped recents, opens global search, starts a new chat, reaches Projects/Artifacts and account settings — all RLS-scoped, cross-device consistent via the sync APIs, and free of any Local/BYOK affordance.

- [ ] Build: sidebar collapse, new chat, search (Ctrl+K), recents grouping + Show all, Projects/Artifacts nav, empty and loading states pass `pnpm --filter @agiworkforce/web test` and typecheck.
- [ ] Trust: no Local/BYOK/provider-key control anywhere in Home; recents/projects show only Managed-Cloud rows; the plan badge uses the canon ladder (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) — flag `apps/web/lib/pricing.ts` older-tier encoding as 🟡 for the separate reconciliation task.
- [ ] Security: Home routes gated by `proxy.ts`; search/history/projects RLS-scoped; sync never surfaces rows lacking a `cloud_id`; no cross-user leakage.

## Anti-patterns

- Adding any Local, BYOK, or provider-key affordance to the sidebar, account area, or new-chat flow — forbidden on Web.
- Reordering or dropping the UX-lock sidebar element set without an explicit decision.
- Claiming the Profile Menu popover or an in-app notification center as shipped without a real path.
- Hardcoding or inventing a model ID for new chats instead of reading `models.json`.
- Referencing removed tiers (Plus, `pro_plus`, Hobby), inventing Pro/Max INR prices, or adding credit top-ups.
- Any Supabase reference, or renaming `proxy.ts` back to `middleware.ts`.
- Letting Local/BYOK rows reach Home via the sync APIs, or exposing another user's conversations via recents or search.
