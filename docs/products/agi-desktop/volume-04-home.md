# AGI Desktop — Volume 04 — Home

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/desktop/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and the real Desktop paths cited in the Repository map below (V3 shell, stores, offline-sync) plus the Neon delta-sync routes `apps/web/app/api/{chat,memory,projects}/sync/route.ts`.

## Overview & stance

The Home surface is the persistent left rail plus empty-state landing that frames every AGI Desktop session — the launchpad for New Chat, Recents, Projects, Search, and profile controls. Desktop is the suite's **full-trust** surface: Local + BYOK + Managed Cloud are all selectable with correct visible labels, and Home must never blur those boundaries. The Local↔Cloud toggle lives at the foot of the sidebar and delegates to trust-boundary guards; BYOK is reached through Models & Keys, never auto-selected. Home shows history for the active trust mode and must never present a Local conversation as Cloud-synced. Cross-device history reflects **Managed-Cloud chats only** — Local/BYOK rows stay on-device. This volume covers the Home rail and landing as built in the V3 shell, flagging parity gaps as 🔭.

## Chat History

Chat History is the reverse-chronological record of conversations in the sidebar's Recents area. Requirements: entries sort by `updatedAt` descending, archived rows are excluded, each row supports inline rename, delete (with a confirm step), and pin toggle. ✅ Built — `apps/desktop/src/features/v3/ConversationRow.tsx` (rename/delete/pin menu) and `apps/desktop/src/stores/chat/chatStore.ts` (`renameConversation`, `deleteConversation`, `togglePinnedConversation`, `archived` field). History persists locally by default; only Managed-Cloud chats propagate cross-device (see Cloud Synchronization Status). Archived-chat management UI is 🔭 Planned — the store exposes `getArchivedConversations` but no Home surface lists them yet.

## Search

Global search opens a ⌘K modal over Home entities. Requirements: a single fuzzy query returns grouped results across Chats, Projects, Skills, Connectors, and Settings; results are keyboard-navigable (↑/↓/Enter, Esc/⌘K to close); selecting a chat jumps to it. ✅ Built — `apps/desktop/src/features/v3/SearchModalCmdK.tsx` and `apps/desktop/src/hooks/useGlobalSearch.ts` (Fuse.js over `conversations`, `projects`, `skills`, `connectors`, plus a static settings list). Search must stay scoped to the active trust mode's local data and server-visible Cloud data; it must never surface BYOK secrets or route a query off-device implicitly. Full-text search across message bodies (beyond title/`lastMessage`) is 🔭 Planned.

## Projects

Projects are ChatGPT-style folders that scope chats, custom instructions, and files. Requirements: the sidebar shows up to six active (non-archived) projects with create/open/rename/delete; opening a project switches the main view to the Projects panel; starting a chat from a project scopes the new conversation to it. ✅ Built — sidebar Projects section in `apps/desktop/src/features/v3/Sidebar.tsx`, the `AgiWorkProjects` panel, `apps/desktop/src/stores/projectStore.ts` (`customInstructions`, `conversationIds`, `files`, archive), and `setConversationProject` in `chatStore.ts`. Project files stay local unless explicitly transferred; a Local→BYOK/Cloud fork of project context requires context selection, secret scan, payload preview, provider label, consent.

## Recent Conversations

Recents groups non-pinned history into time buckets — Last hour, Today, Yesterday, Past week, Past month — capped at 30 visible items with a "Show all" expander. Requirements: buckets render only when non-empty; ordering within a bucket follows `updatedAt`; the active conversation is marked. ✅ Built — `groupConversations` and the Recents block in `apps/desktop/src/features/v3/Sidebar.tsx`. The 30-item cap is a display cap, not a retention limit.

## Pinned Chats

Pinned conversations float to a dedicated top group, independent of recency and exempt from the 30-item cap. Requirements: pin/unpin from the row's overflow menu toggles `pinned`; the pinned group renders above time buckets; a pin glyph marks pinned rows. ✅ Built — pinned handling in `groupConversations` (the `noCap` group) plus `togglePinnedConversation` in `chatStore.ts` and the pin/unpin menu in `ConversationRow.tsx`.

## Favorites

A Favorites concept distinct from Pinned (a starred set spanning chats, projects, and artifacts) is 🔭 Planned. Today "pin" is the only chat-level prioritization primitive; a separate `favorite` flag exists in the marketplace store (`apps/desktop/src/features/marketplace/marketplaceStore.ts`) but is unrelated to Home conversations. If introduced, Favorites must be a store field parallel to `pinned`, trust-mode-scoped, and never conflated with Cloud sync unless the chat is a Managed-Cloud chat.

## New Chat

New Chat starts a fresh conversation in the active trust mode. Requirements: the sidebar's New chat button (and any project "new chat") creates a conversation via the host bridge and selects it, switching the main view to chat; an optional `projectId` scopes it; the empty state renders when no messages exist. ✅ Built — `handleNewChat` in `apps/desktop/src/features/v3/DesktopShellV3.tsx` (`hostBridge.createConversation` + `selectConversation`), `EmptyChat.tsx`, and the New chat button in `Sidebar.tsx`. New chats inherit the current Local/Cloud mode; never silently created against a different trust boundary.

## Profile

The profile controls live at the sidebar footer: an avatar with initials, the account display name, the current plan badge, and a Settings gear. Clicking the footer (when signed in) opens the in-rail Account menu — Settings, Language, Privacy & security, View all plans (with plan name), BYOK & local models, Apps & extensions, Help, and Log out. ✅ Built — `apps/desktop/src/features/v3/AccountMenu.tsx` and the footer in `Sidebar.tsx`. Signed-out users see a Sign in affordance opening the Account settings tab. Plan naming must follow the canon ladder — Free / Basic ($8·₹399) / Pro ($20) / Max ($100 and $200) / Enterprise — surfaced from server state; Home must not hardcode removed tiers ("Plus"/"Hobby"/`pro_plus`) or top-ups. 🟡 The plan label reads from `planDisplayName`; reconciling it with the canon ladder depends on the tracked `billing-catalog.ts` cleanup.

## Workspace Navigation

The rail is the primary navigation: New chat, Search, flat nav (Artifacts; Scheduled; Dispatch — both beta-badged), Projects folders, Recents, an update pill, the Local↔Cloud toggle, and the account footer; it collapses to a 64px icon rail (from 240px). Requirements: nav routes switch the main panel (`chat`/`projects`/`artifacts`/`scheduled`/`dispatch`); Local↔Cloud switching enforces guards (Cloud needs a signed-in eligible account, Local needs the runtime, no mid-stream switch). ✅ Built — `Sidebar.tsx`, `DesktopShellV3.tsx` routing, and `LocalCloudToggle.tsx` (delegates to `appModeStore.setMode`). 🟡 AGI Code exists (`apps/desktop/src/features/v3/CodeModeHome.tsx`) but is not mounted; convergence to the locked Settings IA is also pending.

## Cloud Synchronization Status

Home must show whether Managed-Cloud data is synced, pending, or offline. Requirements: an offline/pending indicator surfaces network state and queued items; Cloud sync is opt-in and off by default (Desktop stores local, coercing persisted `"cloud"` back to `"local"` on load per `apps/desktop/AGENTS.md`); only Managed-Cloud chats sync via Neon delta-sync (cursor + tombstones + idempotent upsert), Web↔Mobile↔Desktop; Local/BYOK rows never sync. 🟡 Partial — `apps/desktop/src/features/offline-indicator/index.tsx` and `apps/desktop/src/lib/offline/offlineSync.ts` (shared `@agiworkforce/runtime` factory) provide status/queue plumbing; delta-sync endpoints are `apps/web/app/api/{chat,memory,projects}/sync/route.ts`. A per-conversation "synced/local-only" badge is 🔭 Planned. Settings sync is allowlist-gated and lands last.

## Repository map

- `apps/desktop/src/features/v3/DesktopShellV3.tsx` — shell, panel routing, New Chat.
- `apps/desktop/src/features/v3/Sidebar.tsx` — rail (new chat, search, nav, projects, recents, footer).
- `apps/desktop/src/features/v3/ConversationRow.tsx` — pin/rename/delete actions.
- `apps/desktop/src/features/v3/SearchModalCmdK.tsx`, `apps/desktop/src/hooks/useGlobalSearch.ts` — ⌘K search.
- `apps/desktop/src/features/v3/{LocalCloudToggle,AccountMenu,EmptyChat}.tsx` — mode toggle, profile, empty state.
- `apps/desktop/src/stores/{chat/chatStore.ts,projectStore.ts,appModeStore.ts}` — history, projects, trust mode.
- `apps/desktop/src/features/offline-indicator/index.tsx`, `apps/desktop/src/lib/offline/offlineSync.ts` — sync status.
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — Neon delta-sync.

## Competitor notes

Claude, ChatGPT, and Codex present a single-provider, cloud-first Home where history is implicitly server-synced and search runs over the vendor's store. AGI Desktop diverges deliberately: Home is **local-first and multi-trust**. History defaults to on-device; sync is opt-in and confined to Managed-Cloud chats; BYOK (Desktop/CLI/VS Code only) lets the same Home drive user-key providers with a visible provider label and an explicit Local→BYOK fork. The rail's first-class Local↔Cloud toggle has no competitor equivalent, and search stays scoped to the active trust boundary rather than one hosted index. CLI parity uses the `agi` binary.

## Acceptance / Definition of Done

Home is production-ready when: history/recents/pinned/projects render and persist; New Chat and Search work with keyboard parity; the trust-mode label for every conversation matches its actual storage; and no Local/BYOK data appears as Cloud-synced.

- [ ] Build: typecheck + tests green (`pnpm --filter @agiworkforce/desktop typecheck`, `pnpm --filter @agiworkforce/desktop test`); Recents grouping, pin float, and ⌘K search covered by tests.
- [ ] Trust: Local↔Cloud toggle enforces guards; Local/BYOK conversations never sync; Cloud sync stays opt-in with the local-default coercion intact; provider labels visible.
- [ ] Security: search never exposes BYOK secrets; delete/rename/pin mutate only local or authorized-Cloud rows; no silent cross-boundary routing.

## Anti-patterns

- Presenting a Local/BYOK conversation as Cloud-synced, or auto-syncing Local rows.
- Removing the local-default coercion or defaulting chat storage to `"cloud"`.
- Hardcoding model IDs, plan names, or INR prices; referencing removed tiers (Plus/Hobby/`pro_plus`) or top-ups.
- Any Supabase reference or `middleware.ts` (Next.js 16 uses `proxy.ts`).
- Faking a "synced" badge, archived-chat list, or Favorites set without a real store field — mark 🔭 instead.
- Silently forking Local→BYOK/Cloud without context selection, secret scan, payload preview, provider label, consent.
