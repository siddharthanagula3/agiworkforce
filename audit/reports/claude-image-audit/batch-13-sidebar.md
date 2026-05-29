# Batch 13 Audit: Sidebar Navigation and Chat Management

Audited: 2026-05-24
Reference: Claude desktop screenshots (6 images)
Codebase: apps/web/features/chat/components/Sidebar/, services/, pages/

---

## IMG: 150_claude-max20x_chats_recents.png

- **Feature:** Full-page "Chats" index with search bar, relative timestamps, "Select chats" and "New chat" header buttons
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/150_claude-max20x_chats_recents.png
- **Implementation status:** missing
- **Primary files:** No equivalent route exists. Sidebar recents in `ChatSidebar.tsx` is the closest analog.
- **API endpoints:** `GET /api/chat/conversations` (via `useConversations` hook)
- **Data flow:**
  - No `/chats` or `/recents` route exists in `apps/web/app/`
  - All chat history is shown exclusively in the 260px sidebar (`ChatSidebar.tsx`)
  - The sidebar's search is client-side `Array.filter` on session titles/previews (line 496-502)
  - `GlobalSearchService` exists in services but is not wired to the sidebar
- **Flaws:**
  - [critical] No dedicated full-page chats index route exists. All 96 app routes confirmed; no `/chats` or `/recents` page. The entire feature shown in the reference image (full-width chat list with header controls, search bar, per-item relative timestamps like "15 minutes ago", "yesterday", "3 days ago", "6 days ago", "last week") is absent.
  - [major] Sidebar search (line 496-502) is purely client-side `String.includes` filtering on preloaded sessions. `globalSearchService.search()` with full-text message search, date filters, analytics, and autocomplete is never invoked from the sidebar.
  - [major] Relative timestamps in sidebar `SessionItem` use abbreviated format (`15m`, `6h`, `3d`) instead of reference format ("15 minutes ago", "yesterday", "last week") @ ChatSidebar.tsx:154-168
- **Visual gaps:**
  - Full-page layout with `Chats` heading and search bar above content area is entirely missing
  - "Select chats" / "New chat" pill buttons in top-right header are missing
  - Chat items in reference show full-width rows with title + relative timestamp inline; sidebar uses truncated 260px width
  - Project tag badges (e.g., "JOB" label visible on last item) are not rendered

---

## IMG: 152_claude-max20x_sidebar-more-menu.png

- **Feature:** Sidebar bottom "more" chevron dropdown with "Artifacts" and "Customize sidebar" menu items
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/152_claude-max20x_sidebar-more-menu.png
- **Implementation status:** missing
- **Primary files:** `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx` (collapsed rail at line 348-431)
- **API endpoints:** N/A (UI-only)
- **Data flow:**
  - In reference, a chevron-down icon at the bottom of the sidebar icon rail opens a small popover with "Artifacts" and "Customize sidebar"
  - In the codebase, the collapsed rail (`CollapsedSidebar`, line 352-431) has static icon buttons but no expandable "more" menu
  - No "Customize sidebar" feature exists anywhere in the codebase (zero grep hits)
- **Flaws:**
  - [major] No "more" chevron menu at the bottom of the icon rail. The collapsed sidebar has a `ChevronDown` icon (`<Download>` icon at line 413-420 labeled "Get apps") but it has no onClick handler and does not open a submenu.
  - [major] "Customize sidebar" feature is entirely missing. No implementation exists for sidebar customization (reordering nav items, toggling visibility).
  - [minor] "Artifacts" is shown as a top-level sidebar nav item (line 581-587) in expanded mode but is absent from the collapsed rail icon set
- **Visual gaps:**
  - Missing the small popover menu anchored to the bottom chevron icon
  - Missing "Artifacts" icon (grid-like icon) in the popover
  - Missing "Customize sidebar" icon (gear icon) in the popover

---

## IMG: 153_claude-max20x_chats_bulk-select-mode.png

- **Feature:** Full-page chats index in bulk-select mode with checkboxes, "0 selected" count, "Select all", "Move to project", "Delete", and "Cancel" toolbar
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/153_claude-max20x_chats_bulk-select-mode.png
- **Implementation status:** partial
- **Primary files:** `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx` (bulk mode at line 449-483, 513-532)
- **API endpoints:** `DELETE /api/chat/conversations/:id` (per-session), no bulk endpoint
- **Data flow:**
  - Sidebar has `bulkMode` state (line 449) toggled by a `CheckSquare` icon button (line 551-559)
  - In bulk mode, checkboxes render per session item (line 188-194)
  - `handleSelectAll` toggles all visible sessions (line 466-475)
  - `handleBulkDelete` iterates `selectedIds` and calls `onDeleteSession` per item (line 477-482) -- no batched API call
  - No "Move to project" action exists (zero grep hits for `moveToProject` or `Move to project`)
- **Flaws:**
  - [critical] Bulk select UI only exists in the sidebar (260px), not in a full-page view. The reference shows a full-page chats index with the bulk toolbar.
  - [major] "Move to project" bulk action is completely missing. Only "Select all", "Delete", and "Cancel" are implemented (line 514-531). The reference shows 4 actions: Select all, Move to project, Delete, Cancel.
  - [major] Bulk delete calls `onDeleteSession` in a serial loop (line 478-479) with no batched API endpoint, no error handling per item, and no progress indicator.
  - [minor] Selected count display uses `{selectedIds.size} selected` (line 515) without the "0 selected" initial label format shown in reference
- **Visual gaps:**
  - Full-page layout missing entirely
  - "Move to project" button absent from bulk toolbar
  - Checkbox style is native HTML checkbox (`accent-primary`) vs. reference's custom rounded checkbox styling

---

## IMG: 173_claude-max20x_chats-index_recent-project-chat.png

- **Feature:** Full-page chats index with project tag badges on chat items (e.g., "How to use Claude" tag), 3-dot hover menu, and relative timestamps
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/173_claude-max20x_chats-index_recent-project-chat.png
- **Implementation status:** partial
- **Primary files:** `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx` (SessionItem, line 116-284)
- **API endpoints:** `conversation-storage.ts` maps `tags` from metadata (line 744-745, 758), but they are never displayed
- **Data flow:**
  - `SessionLike` interface (line 48-56) has no `tags` or `projectName` field
  - The full `ChatSession` type in `conversation-storage.ts` supports `tags` (line 758), `is_starred`, `is_pinned`, `is_archived`, but `SessionLike` is a minimal subset used by the sidebar
  - `SessionItem` renders only title + abbreviated timestamp + hover menu (Rename / Delete)
  - The reference shows a hovered chat item ("Claude's execution models across surfaces") with a 3-dot vertical menu and a highlighted background row
  - Project association tags (like "How to use Claude" in the first item) are not rendered
- **Flaws:**
  - [major] Project tag badges are not displayed on chat list items. Data model supports tags (`conversation-storage.ts:758`) but `SessionItem` in `ChatSidebar.tsx` does not render them.
  - [major] `ConversationListItem.tsx` implements richer features (star, pin, archive, share, duplicate) but is completely orphaned -- exported from `Sidebar/index.ts` but never imported or rendered anywhere in the app.
  - [minor] Hover menu in reference uses a vertical 3-dot icon; sidebar uses horizontal `MoreHorizontal` icon @ ChatSidebar.tsx:229
  - [minor] Hover row highlight in reference is a subtle light background fill spanning full width; sidebar highlight is narrower with rounded corners @ ChatSidebar.tsx:173-178
- **Visual gaps:**
  - No project association badges inline with chat titles
  - Full-page layout missing (this is the same /chats route gap as IMG 150)
  - Timestamps in reference show natural language ("3 minutes ago", "17 minutes ago", "37 minutes ago", "yesterday", "6 days ago") vs sidebar's abbreviated format ("3m", "17m", "37m")

---

## IMG: 176_claude-max20x_expanded-sidebar_projects.png

- **Feature:** Expanded sidebar with Chat/Cowork/Code mode-switcher tabs, Projects grid with cards (title, description, time, "Shared" badge), and Recents conversation list below
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/176_claude-max20x_expanded-sidebar_projects.png
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx` (main sidebar used on /chat)
  - `apps/web/features/chat/v3/WebSidebar.tsx` (v3 sidebar with mode tabs, not used on /chat)
  - `apps/web/app/projects/page.tsx` (standalone projects page)
- **API endpoints:** N/A (UI layout)
- **Data flow:**
  - The reference shows an expanded sidebar with "Chat", "Cowork", "Code" tab switcher at the top
  - `v3/WebSidebar.tsx` implements this mode switcher (line 253-286) but it is only used in the v3 shell (`WebShellV3.tsx`), not the main `/chat` route which uses `ChatSidebar.tsx`
  - The main `ChatSidebar.tsx` has no mode tabs -- it shows: collapse toggle, search, bulk-select, New chat, Projects, Artifacts, Customize, Recents
  - Projects view is a separate full page at `/projects` using `ProjectGallery` component, not an inline sidebar panel
  - The sidebar's "Projects" nav button routes to `/projects` page (line 573-580) rather than showing projects inline
  - User profile in footer shows name + plan ("Max" dropdown) matching reference pattern
- **Flaws:**
  - [major] Chat/Cowork/Code mode-switcher tabs are missing from the main sidebar (`ChatSidebar.tsx`). They exist only in `v3/WebSidebar.tsx` which is not wired to the default `/chat` route.
  - [major] Projects grid is not shown inline within the sidebar. Reference shows project cards (JOB, research, claude Prompt, "How to use Claude") directly in the sidebar; our implementation routes to a separate `/projects` page.
  - [minor] "Shared" badge on project cards (visible on "How to use Claude" card in reference) is not supported in the sidebar context
  - [minor] "Code" nav item from the collapsed rail in the reference (visible as `</>` icon in the left icon rail) is missing from `ChatSidebar.tsx` collapsed rail. The collapsed rail has: PanelLeft, Plus, Search, MessageSquare, Folder, Settings, Download, Avatar -- no Code icon.
- **Visual gaps:**
  - No mode-switcher tabs at top of sidebar
  - No inline project cards within sidebar; projects require navigating to separate page
  - Missing "Shared" label on project cards
  - "Code" icon absent from collapsed rail

---

## IMG: 02_sidebar-expanded_chat-history.png

- **Feature:** Expanded sidebar with New chat, Search, Customize top nav, Chats, Projects, Artifacts nav items, Recents list with conversation titles, plan badge ("Free plan" / "Upgrade"), and user avatar with name at bottom
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/02_sidebar-expanded_chat-history.png
- **Implementation status:** partial
- **Primary files:** `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx`
- **API endpoints:** N/A (UI layout)
- **Data flow:**
  - Sidebar layout follows the reference structure: top controls, nav items, recents, footer with plan + avatar
  - Nav items in code: New chat, Projects, Artifacts, Customize (line 564-597) -- matches reference's "New chat", "Search", "Customize", "Chats", "Projects", "Artifacts"
  - Recents section shows grouped conversation list with time-bucket headers (line 599-640)
  - "Free plan" / "Upgrade" pill renders at bottom (line 643-650)
  - User profile area with avatar, name, email, and dropdown menu (line 290-343)
- **Flaws:**
  - [major] "Search" button in expanded sidebar header (line 543-548) has no `onClick` handler. It renders a search icon but clicking it does nothing. Search in reference opens a dedicated search experience.
  - [major] "Chats" nav item from the reference (between "Search" and "Projects") is missing. The sidebar jumps from Search icon to New chat. In the reference, "Chats" links to the full-page chats index.
  - [major] `FolderManagement.tsx` component is orphaned. It is exported from `Sidebar/index.ts` but never imported or rendered in `ChatSidebar.tsx` or any other component. The entire folder management feature (create/rename/delete folders, colored folder icons, session counts, drag-to-folder) plus `folder-management-service.ts` with `chat_folders` DB table access is dead code.
  - [minor] "Chats" button in collapsed rail (line 389-391) has no `onClick` handler -- dead button @ ChatSidebar.tsx:389
  - [minor] Settings menu item in user profile dropdown routes to `/chat` instead of `/settings/general` @ ChatSidebar.tsx:327
  - [minor] Recents items in sidebar show timestamps only on hover (`opacity-0 group-hover:opacity-100` at line 218) while reference shows no timestamps in sidebar recents, only in the full-page chats view
- **Visual gaps:**
  - "Chats" as a nav item is missing from the sidebar navigation list
  - Search button is non-functional
  - Folder management panel is not visible despite backend code existing
  - "Code" nav item missing from sidebar nav list (present in reference as `</>` icon)

---

## Summary of Cross-Cutting Issues

### Critical (3)

| # | Finding | Files |
|---|---------|-------|
| C1 | No `/chats` full-page index route. Three reference images (150, 153, 173) show a dedicated full-page chats view with header buttons, search, and full-width item rows. No such route exists among 96 app pages. | `apps/web/app/` (missing route) |
| C2 | `ConversationListItem.tsx` is orphaned dead code. Implements pin, star, archive, share, duplicate actions but is never imported outside `Sidebar/index.ts`. The main sidebar uses its own inline `SessionItem` with only rename/delete. | `apps/web/features/chat/components/Sidebar/ConversationListItem.tsx` |
| C3 | `FolderManagement.tsx` is orphaned dead code. Full folder CRUD component + `folder-management-service.ts` + `chat_folders` DB table exist but are never rendered. | `apps/web/features/chat/components/Sidebar/FolderManagement.tsx`, `apps/web/features/chat/services/folder-management-service.ts` |

### Major (9)

| # | Finding | File:Line |
|---|---------|-----------|
| M1 | "Move to project" bulk action missing from bulk-select mode | `ChatSidebar.tsx:514-531` |
| M2 | Chat/Cowork/Code mode-switcher tabs absent from main sidebar (exist only in unused v3 sidebar) | `ChatSidebar.tsx` (entire file) |
| M3 | "Customize sidebar" feature entirely absent | N/A (no implementation) |
| M4 | "More" chevron dropdown menu in collapsed rail missing | `ChatSidebar.tsx:348-431` |
| M5 | Project tag badges not rendered on chat list items despite data model support | `ChatSidebar.tsx:210-214`, `conversation-storage.ts:758` |
| M6 | GlobalSearchService not wired to sidebar; search is client-side filter only | `ChatSidebar.tsx:496-502` |
| M7 | Search button in expanded sidebar has no onClick handler | `ChatSidebar.tsx:543-548` |
| M8 | "Chats" nav item missing from sidebar navigation | `ChatSidebar.tsx:563-597` |
| M9 | Bulk delete is serial per-item with no batched API, no error handling, no progress | `ChatSidebar.tsx:477-482` |

### Minor (7)

| # | Finding | File:Line |
|---|---------|-----------|
| m1 | Settings menu item routes to `/chat` instead of `/settings/general` | `ChatSidebar.tsx:327` |
| m2 | "Chats" collapsed rail button has no onClick | `ChatSidebar.tsx:389` |
| m3 | "Search" collapsed rail button has no onClick | `ChatSidebar.tsx:385` |
| m4 | "Get apps" download button has no onClick | `ChatSidebar.tsx:413-420` |
| m5 | Timestamps use abbreviated format (3m, 6h, 3d) vs reference natural language | `ChatSidebar.tsx:154-168` |
| m6 | Hover menu icon is horizontal 3-dot vs reference vertical 3-dot | `ChatSidebar.tsx:229` |
| m7 | "Code" icon missing from collapsed sidebar rail | `ChatSidebar.tsx:352-431` |
