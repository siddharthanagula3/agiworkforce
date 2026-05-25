# Batch 20 — Projects Full Lifecycle Audit

**Date:** 2026-05-24
**Auditor:** Claude Opus 4.7 (automated)
**Scope:** 18 reference screenshots from Claude desktop/web covering the full projects lifecycle — creation, detail view, file preview, options menu, edit dialog, model selector, project chat, reasoning, skeleton loading, chat list, sort/search, and three-pane layout.
**Codebase root:** `/Users/siddhartha/Desktop/agiworkforce`
**Web app root:** `/Users/siddhartha/Desktop/agiworkforce/apps/web`

---

## Summary

The AGI web app has a project gallery (`ProjectGallery` in `packages/unified-chat`) and a project detail page (`apps/web/app/projects/[id]/page.tsx`), but the implementation covers only a fraction of the Claude reference. Of the 18 images audited, roughly 3 features are partially present, 2 are present at a stub level, and 13 are missing entirely. The largest gaps are: no project create form matching Claude's full-page flow, no project detail right sidebar (context/memory/files panel), no in-project chat composer, no project-scoped model selector, no file preview modal, no options menu with star/edit/archive/delete, no edit-details dialog from the index page, no loading skeleton, no sort menu, no three-pane layout, and no project-scoped chat view.

**Flaw totals:** 14 critical, 12 major, 8 minor, 6 cosmetic

---

## IMG: 159_claude-max20x_project-create-form.png
- **Feature:** Full-page "Create a personal project" form with Name + Description fields, Cancel/Create buttons
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/159_claude-max20x_project-create-form.png`
- **Implementation status:** partial
- **Primary files:**
  - `packages/unified-chat/src/components/ProjectGallery.tsx` (lines 254-367)
  - `apps/web/app/projects/page.tsx`
- **API endpoints:** `POST /api/projects` (apps/web/app/api/projects/route.ts)
- **Data flow:**
  - User clicks "New project" button in ProjectGallery header
  - Inline form expands within the gallery (not a full-page form)
  - Form collects name only (via emoji + text input) — no description field
  - On submit, `handleCreate` generates a local UUID and calls `addProject` on zustand store
  - If `onCreate` prop is provided, it calls that instead (for Cloud Managed)
  - Auto-selects the created project and routes to `/projects/{id}`
- **Flaws:**
  - [critical] Create form is an inline expandable section, not the full-page centered form shown in Claude. Claude shows a dedicated page with "Create a personal project" heading, two labeled fields ("What are you working on?" / "What are you trying to achieve?"), and centered Cancel + Create buttons. AGI has a small inline emoji+name input with "Quick start" presets. @ `packages/unified-chat/src/components/ProjectGallery.tsx:254-367`
  - [major] No description/goal field in the create form. Claude's second field "What are you trying to achieve?" maps to description, which is completely absent from the inline form. @ `packages/unified-chat/src/components/ProjectGallery.tsx:277-285`
  - [minor] Field labels differ — Claude uses "What are you working on?" and "What are you trying to achieve?"; AGI has only a placeholder "Project name". @ `packages/unified-chat/src/components/ProjectGallery.tsx:283`
- **Visual gaps:**
  - Claude form is centered on the full page with generous whitespace; AGI form is cramped inline under the search bar
  - Claude uses labeled fields with distinct sections; AGI uses a single-line emoji+name input
  - No textarea for description/goal in AGI

---

## IMG: 160_claude-max20x_example-project_overview.png
- **Feature:** Project detail overview with back-link, title + badge, description, composer, chat list CTA, right sidebar (context info card, Memory section, Files section with file cards)
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/160_claude-max20x_example-project_overview.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/app/projects/[id]/page.tsx`
  - `packages/unified-chat/src/components/ProjectHeader.tsx`
  - `apps/web/features/projects/components/KnowledgeFilesPanel.tsx`
- **API endpoints:**
  - `GET /api/projects/[id]` (apps/web/app/api/projects/[id]/route.ts)
  - `GET /api/projects/[id]/knowledge-files` (apps/web/app/api/projects/[id]/knowledge-files/route.ts)
- **Data flow:**
  - URL params extract project `id`
  - `useProjectStore` looked up in the unified-chat store for project data
  - `summarizeProjectHeader` builds a `ProjectHeaderPresentation` from the project record
  - `ProjectHeader` renders icon, name, description, privacy/provider chips
  - Tab navigation shows "Chats" and "Sources" panels
  - KnowledgeFilesPanel fetches from `/api/projects/{id}/knowledge-files`
- **Flaws:**
  - [critical] No right sidebar panel. Claude shows a right sidebar with "Add relevant context for your project" info card, Memory section with "Only you" privacy toggle, and Files section with file cards (showing filename, line count, file type badge). AGI has only a flat two-tab layout (Chats/Sources) with no sidebar. @ `apps/web/app/projects/[id]/page.tsx:141-283`
  - [critical] No in-project chat composer. Claude shows a "How can I help you today?" input directly on the project overview page with model selector and attachment button. AGI's project detail has no composer — only a "Start a chat" empty-state button that navigates away to `/chat`. @ `apps/web/app/projects/[id]/page.tsx:228-238`
  - [major] No "Example project" badge next to the title. Claude shows a gray pill badge. AGI does not render badges in `ProjectHeader`. @ `packages/unified-chat/src/components/ProjectHeader.tsx:159-174`
  - [major] No star/favorite toggle next to the title. Claude shows a star icon beside the three-dot menu. AGI has no star in the detail view. @ `apps/web/app/projects/[id]/page.tsx:178`
  - [major] No three-dot options menu in the detail header. Claude shows a vertical ellipsis for project actions. @ `apps/web/app/projects/[id]/page.tsx:178`
  - [minor] Chat list CTA text differs — Claude says "Start a chat to keep conversations organized and re-use project knowledge." AGI says "Start a conversation -- project instructions and files will be carried in." @ `apps/web/app/projects/[id]/page.tsx:232-233`
- **Visual gaps:**
  - Claude uses a two-column layout (main content + right sidebar); AGI is single-column
  - File cards in Claude show filename, line count, and a file-type badge (e.g., "MD"); AGI's KnowledgeFilesPanel shows a flat list with filename + KB size
  - Memory section with "Only you" privacy toggle is entirely absent
  - "Add relevant context" info card with description is absent

---

## IMG: 161_claude-max20x_project-file-preview-modal.png
- **Feature:** Modal overlay showing a file preview (markdown content rendered) for a project knowledge file, with filename and metadata in header
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/161_claude-max20x_project-file-preview-modal.png`
- **Implementation status:** missing
- **Primary files:**
  - `apps/web/features/projects/components/KnowledgeFilesPanel.tsx`
  - `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/route.ts`
- **API endpoints:** `GET /api/projects/[id]/knowledge-files/[fileId]`
- **Data flow:**
  - In Claude, clicking a file card opens a modal overlay with the file's rendered content
  - AGI has no click handler on file items in `KnowledgeFilesPanel` — they are inert list items
  - The `[fileId]/route.ts` exists but no UI consumes it for preview
- **Flaws:**
  - [critical] No file preview modal exists anywhere in the codebase. Claude renders a centered overlay with the file name, metadata ("414 lines"), and the full rendered content. AGI's `KnowledgeFilesPanel` renders files as a flat list with no click action. @ `apps/web/features/projects/components/KnowledgeFilesPanel.tsx:129-155`
- **Visual gaps:**
  - Entire modal overlay with backdrop blur is missing
  - No markdown rendering for file content preview
  - No file metadata (line count) in file list items

---

## IMG: 162_claude-max20x_project-options-menu.png
- **Feature:** Project card three-dot context menu with Star, Edit details, Archive, Delete options on the project index page
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/162_claude-max20x_project-options-menu.png`
- **Implementation status:** missing
- **Primary files:**
  - `packages/unified-chat/src/components/ProjectCard.tsx`
  - `packages/unified-chat/src/components/ProjectGallery.tsx`
- **API endpoints:**
  - `PUT /api/projects/[id]` (for star/archive)
  - `DELETE /api/projects/[id]`
- **Data flow:**
  - In Claude, each project card has a three-dot button that opens a dropdown menu with four actions: Star, Edit details, Archive, Delete
  - AGI's `ProjectCard` has only a star toggle button — no three-dot menu, no edit/archive/delete options from the card
  - The `ProjectSettingsDialog` exists but is only accessible from `ProjectSidebar`, not from the gallery cards
- **Flaws:**
  - [critical] No three-dot context menu on project cards. Claude shows a dropdown with Star / Edit details / Archive / Delete. AGI cards only have a star button. @ `packages/unified-chat/src/components/ProjectCard.tsx:67-100`
  - [major] No archive action. Claude has an "Archive" option; AGI's project store has no `isArchived` field in the unified-chat store (only in the web-only `project-store.ts`). @ `packages/unified-chat/src/stores/projectStore.ts`
  - [major] No delete action from the gallery. AGI's delete is only accessible through `ProjectSettingsDialog` which is in the sidebar, not the gallery. @ `packages/unified-chat/src/components/ProjectCard.tsx`
  - [minor] No "Edit details" quick action from card. Claude opens an edit dialog directly; AGI has no equivalent affordance on gallery cards. @ `packages/unified-chat/src/components/ProjectCard.tsx`
- **Visual gaps:**
  - Three-dot button with popover menu is entirely absent
  - Context menu styling with separator between Archive and Delete (destructive red text) is missing
  - Card shows "Updated 2 weeks ago" relative timestamp at bottom, AGI card has different format

---

## IMG: 163_claude-max20x_project-edit-details-modal.png
- **Feature:** "Edit details" modal dialog with Name (required) and Description (required) fields, Cancel/Save buttons
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/163_claude-max20x_project-edit-details-modal.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/projects/components/ProjectSettingsDialog.tsx`
- **API endpoints:** `PUT /api/projects/[id]`
- **Data flow:**
  - In Claude, "Edit details" from the card context menu opens a simple modal with Name and Description fields
  - AGI has `ProjectSettingsDialog` which is more complex — includes Name, Description, Color picker, Knowledge Files upload, Custom Instructions textarea, plus Delete button
  - The dialog is only reachable from `ProjectSidebar`, not from the project gallery cards
- **Flaws:**
  - [major] Edit dialog is not accessible from the project gallery index page — only from the sidebar. Claude triggers it from the card's three-dot menu. @ `apps/web/features/projects/components/ProjectSidebar.tsx:187-198`
  - [minor] Dialog title differs — Claude says "Edit details"; AGI says "Project Settings". @ `apps/web/features/projects/components/ProjectSettingsDialog.tsx:116`
  - [cosmetic] Claude's edit dialog is minimal (Name + Description only); AGI's dialog is overloaded with Color, Knowledge Files, Custom Instructions, and Delete. While more capable, it doesn't match the simple pattern.
- **Visual gaps:**
  - Claude's modal is clean and simple with two labeled fields; AGI's has multiple sections and a file upload zone
  - Field labels differ — Claude has "Name *" and "Description *" with asterisks; AGI uses "Name" and "Description" without required indicators
  - Button styles differ — Claude has a black "Save" button; AGI uses the default shadcn Button

---

## IMG: 166_claude-max20x_project-model-selector.png
- **Feature:** In-project model selector dropdown showing Opus 4.7, Sonnet 4.6, Haiku 4.5, Adaptive thinking toggle, and "More models" link
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/166_claude-max20x_project-model-selector.png`
- **Implementation status:** missing
- **Primary files:**
  - `apps/web/app/projects/[id]/page.tsx` (no composer present)
  - `apps/web/shared/stores/model-store.ts`
- **API endpoints:** N/A (client-side state)
- **Data flow:**
  - In Claude, the project detail page has a composer with a model selector dropdown
  - Dropdown shows three models with descriptions, a checkmark on the selected model, an "Adaptive thinking" toggle, and a "More models" chevron
  - AGI's project detail page has no composer and therefore no model selector
- **Flaws:**
  - [critical] No in-project model selector. Claude shows a dropdown with model options, descriptions, thinking toggle, and "More models" link directly in the project page composer. AGI has no composer on the project detail page at all. @ `apps/web/app/projects/[id]/page.tsx`
  - [major] Model selector dropdown pattern with per-model descriptions ("Most capable for ambitious work", "Responsive everyday work", "Fastest, most efficient") and adaptive thinking toggle is not implemented anywhere in AGI web. @ `apps/web/shared/stores/model-store.ts`
- **Visual gaps:**
  - Entire dropdown UI with model list, descriptions, checkmark, toggle, and "More models" link is absent
  - "Adaptive" label next to model name in the composer bar is absent

---

## IMG: 167_claude-max20x_project-chat-composer-ready.png
- **Feature:** Project detail page with a message typed in the composer, orange send button activated, right sidebar showing context info, memory, and files
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/167_claude-max20x_project-chat-composer-ready.png`
- **Implementation status:** missing
- **Primary files:**
  - `apps/web/app/projects/[id]/page.tsx`
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - `apps/web/features/chat/components/Composer/SendButton.tsx`
- **API endpoints:** N/A (UI component)
- **Data flow:**
  - In Claude, the project detail page has a full composer with typed text, model selector, attachment button (+), and an activated send button (orange circle with up arrow)
  - AGI's project detail has no composer — chat is initiated only via "Start a chat" button that navigates to `/chat`
- **Flaws:**
  - [critical] No project-scoped composer on the detail page. Claude embeds the full chat composer (with send button, model selector, attachment) directly in the project overview. AGI routes to a separate `/chat` page. @ `apps/web/app/projects/[id]/page.tsx:228-238`
- **Visual gaps:**
  - Orange send button with up-arrow icon is missing from project context
  - Attachment button (+) is missing
  - Model/Adaptive label bar is missing
  - Right sidebar with context card, memory, files is missing

---

## IMG: 168_claude-max20x_project-chat_response-loading.png
- **Feature:** Project chat view — user message sent, assistant response displayed with formatting (italics), response action buttons (copy, thumbs up, feedback, retry), loading spinner for follow-up
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/168_claude-max20x_project-chat_response-loading.png`
- **Implementation status:** missing (project-scoped chat)
- **Primary files:**
  - `apps/web/features/chat/pages/WebChatPage.tsx`
- **API endpoints:** Chat API (not project-specific)
- **Data flow:**
  - In Claude, submitting from the project composer navigates to a project-scoped chat view with breadcrumb "How to use Claude / Learning Claude through adaptive thinking"
  - The chat view shows user message, assistant response with rich formatting, action buttons, and a bottom composer with "Write a message..." placeholder
  - AGI has a general chat page at `/chat` but no project-scoped chat view with project breadcrumbs
- **Flaws:**
  - [critical] No project-scoped chat view. Claude shows a chat within the project context (breadcrumb: "Project / Chat Title"), Share button, and the project's knowledge context applied. AGI navigates to a generic `/chat` page with no project breadcrumb. @ `apps/web/features/chat/pages/WebChatPage.tsx`
  - [major] No response action buttons below assistant messages (copy, thumbs up/down, feedback, retry icons). @ `apps/web/features/chat/pages/WebChatPage.tsx`
- **Visual gaps:**
  - Project breadcrumb navigation at top ("Project / Chat Title" with dropdown) is absent
  - Share button in top-right is absent
  - Response action bar (copy/thumbs/feedback/retry) is absent
  - Loading spinner (asterisk-style) below response is absent
  - "Claude is AI and can make mistakes" disclaimer at bottom is absent

---

## IMG: 169_claude-max20x_project-chat_completed-response.png
- **Feature:** Same as 168 — completed response view (identical screenshot, likely the same state captured twice)
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/169_claude-max20x_project-chat_completed-response.png`
- **Implementation status:** missing (project-scoped chat)
- **Primary files:** Same as IMG 168
- **API endpoints:** Same as IMG 168
- **Data flow:** Same as IMG 168
- **Flaws:** Same as IMG 168 — see above
- **Visual gaps:** Same as IMG 168

---

## IMG: 170_claude-max20x_project-chat_reasoning-expanded.png
- **Feature:** Project chat with extended thinking/reasoning block expanded, showing structured analysis with numbered lessons, formatted markdown
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/170_claude-max20x_project-chat_reasoning-expanded.png`
- **Implementation status:** missing (project-scoped reasoning display)
- **Primary files:**
  - `apps/web/features/chat/pages/WebChatPage.tsx`
  - `packages/unified-chat/src/lib/types.ts` (ThinkingBlock type exists)
- **API endpoints:** Chat streaming API
- **Data flow:**
  - In Claude, extended thinking output is shown as an expandable section within the chat
  - The content shows structured reasoning with headers, numbered lists, and formatted text
  - AGI defines `ThinkingBlock` and `ThinkingStep` types but the project-scoped chat view does not exist
- **Flaws:**
  - [critical] No project-scoped reasoning/thinking display. While the types exist in `packages/unified-chat/src/lib/types.ts:164-198`, there is no project chat view to render them. The general chat may have thinking support but it is not project-scoped. @ `apps/web/features/chat/pages/WebChatPage.tsx`
  - [minor] "Want to be notified when Claude responds?" toast notification at bottom is absent from any AGI chat view. @ `apps/web/features/chat/pages/WebChatPage.tsx`
- **Visual gaps:**
  - Expandable reasoning section with structured content is absent in project context
  - Long-form response with numbered lessons, bold headers, and rich formatting in project context is absent

---

## IMG: 171_claude-max20x_project-return-loading-skeleton.png
- **Feature:** Project detail page loading skeleton — pulsing gray bars replacing chat list items while data loads
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/171_claude-max20x_project-return-loading-skeleton.png`
- **Implementation status:** missing
- **Primary files:**
  - `apps/web/app/projects/[id]/page.tsx`
- **API endpoints:** N/A (UI loading state)
- **Data flow:**
  - In Claude, navigating back to the project detail from a chat shows skeleton loading bars in the chat list area while conversations load
  - AGI's project detail page has no skeleton loading state — the zustand store is synchronous so there is no loading transition
- **Flaws:**
  - [major] No skeleton/shimmer loading state. Claude shows animated placeholder bars while the conversation list loads. AGI reads from a synchronous zustand store and shows content immediately (or an empty state), with no graceful loading transition. @ `apps/web/app/projects/[id]/page.tsx:228-276`
- **Visual gaps:**
  - Gray pulsing skeleton bars of varying widths are absent
  - Loading transition when navigating back to project is absent

---

## IMG: 172_claude-max20x_project-after-chat-no-chat-list.png
- **Feature:** Project detail after creating a chat — shows the new conversation in the chat list with title and "Last message 2 minutes ago"
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/172_claude-max20x_project-after-chat-no-chat-list.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/app/projects/[id]/page.tsx` (lines 239-275)
- **API endpoints:** N/A (local state)
- **Data flow:**
  - In Claude, after starting a chat in a project, returning to the project detail shows the conversation listed with its auto-generated title and relative timestamp
  - AGI's project detail shows conversations by their IDs (truncated to 8 chars: "Conversation 01h8x9...") with no titles or timestamps
- **Flaws:**
  - [major] Conversation list shows truncated UUIDs instead of conversation titles. Claude shows the full auto-generated title ("Learning Claude through adaptive thinking"); AGI shows "Conversation 01h8x9..." @ `apps/web/app/projects/[id]/page.tsx:53-58`
  - [major] No "Last message X ago" relative timestamp on conversation list items. Claude shows "Last message 2 minutes ago". AGI shows no timestamp. @ `apps/web/app/projects/[id]/page.tsx:243-275`
- **Visual gaps:**
  - Conversation items in Claude are clean with title + timestamp; AGI shows opaque ID fragments
  - No relative timestamp display

---

## IMG: 174_claude-max20x_projects-index_cards-sort-search.png
- **Feature:** Projects index page with full sidebar navigation, project cards in grid, sort by Activity dropdown, search bar, "New project" button
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/174_claude-max20x_projects-index_cards-sort-search.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/app/projects/page.tsx`
  - `packages/unified-chat/src/components/ProjectGallery.tsx`
  - `packages/unified-chat/src/components/ProjectCard.tsx`
- **API endpoints:** N/A (local zustand)
- **Data flow:**
  - In Claude, the sidebar shows Chat/Cowork/Code tabs at top, then navigation (New chat, Projects, Artifacts), recent chats list, and user profile at bottom
  - Project cards show title, description, relative timestamp ("13 days ago"), shared badge
  - Sort dropdown and search are present
  - AGI renders a custom sidebar nav with icon-only buttons (72px wide), then the ProjectGallery
- **Flaws:**
  - [cosmetic] Sidebar layout differs significantly — Claude has a full text sidebar with sections (navigation, recents, user profile); AGI has a minimal 72px icon-only nav rail. @ `apps/web/app/projects/page.tsx:51-81`
  - [cosmetic] Project cards don't show three-dot menu or "Shared" badge. @ `packages/unified-chat/src/components/ProjectCard.tsx`
  - [minor] Card timestamp format differs — Claude shows "13 days ago", "1 month ago"; AGI shows "13d ago", "1m ago" (abbreviated). @ `packages/unified-chat/src/components/ProjectCard.tsx:28-40`
  - [cosmetic] Sort button is static — clicking does nothing. Claude's sort actually reorders cards. @ `packages/unified-chat/src/components/ProjectGallery.tsx:210-217`
- **Visual gaps:**
  - Full sidebar with recent chats is absent
  - Tab bar (Chat/Cowork/Code) at top of sidebar is absent
  - User profile section at bottom of sidebar is absent

---

## IMG: 175_claude-max20x_projects-sort-menu.png
- **Feature:** Sort dropdown menu open showing options: Recent (checked), Created, Alphabetical
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/175_claude-max20x_projects-sort-menu.png`
- **Implementation status:** missing
- **Primary files:**
  - `packages/unified-chat/src/components/ProjectGallery.tsx` (lines 210-217)
- **API endpoints:** N/A
- **Data flow:**
  - In Claude, clicking "Sort by" opens a dropdown with three options: Recent, Created, Alphabetical, with a checkmark on the active option
  - AGI renders a static "Activity" button that does nothing — no dropdown opens, no sort options are available
  - The gallery always sorts by `updatedAt` descending with starred pinned to top
- **Flaws:**
  - [major] Sort menu is completely non-functional. The button renders but has no click handler to open a dropdown. @ `packages/unified-chat/src/components/ProjectGallery.tsx:210-217`
  - [minor] Sort options differ — Claude has "Recent / Created / Alphabetical"; AGI's button label says "Activity" (not "Recent"). @ `packages/unified-chat/src/components/ProjectGallery.tsx:214`
- **Visual gaps:**
  - Dropdown popover with checkmark indicator is absent
  - Sort option list (Recent, Created, Alphabetical) is absent

---

## IMG: 047_claude-free_projects.png
- **Feature:** Claude Free tier — projects index page in browser with Search bar, Sort by Activity dropdown, "New project" button, single "How to use Claude" example project card
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/047_claude-free_projects.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/app/projects/page.tsx`
  - `packages/unified-chat/src/components/ProjectGallery.tsx`
- **API endpoints:** N/A
- **Data flow:**
  - Same as Claude paid, but with only the example project card visible
  - Shows the Free tier has full project functionality including search and sort
  - AGI has no tier-based gating — all users see the same projects experience
- **Flaws:**
  - [cosmetic] Search bar placeholder text differs — Claude says "Search projects..." (with ellipsis); AGI says "Search projects" (no ellipsis). @ `packages/unified-chat/src/components/ProjectGallery.tsx:247`
  - [cosmetic] Card layout — Claude's "How to use Claude" card spans the full width of a half-column with wrapped description text and "Updated 6 months ago" timestamp; AGI card style is similar but minor spacing/typography differences exist.
- **Visual gaps:**
  - Browser chrome visible (tabs, URL bar) — showing this is the web version at claude.ai/projects; AGI's web version matches the same URL pattern `/projects`
  - Minor typography and spacing differences in card rendering

---

## IMG: 03_projects-gallery-view.png
- **Feature:** Earlier version of projects gallery (March 2026) — darker theme, search bar at top, sort by Activity dropdown, two project cards, "How to use Claude" card with "Example project" + "Shared" badges
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/03_projects-gallery-view.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/app/projects/page.tsx`
  - `packages/unified-chat/src/components/ProjectGallery.tsx`
- **API endpoints:** N/A
- **Data flow:**
  - Same gallery pattern as newer screenshots but with search above sort
  - Cards show "Updated 11 days ago" format
  - "How to use Claude" card has both "Example project" and "Shared" badges
  - New project button with "+" prefix
- **Flaws:**
  - [cosmetic] Search bar placement — Claude puts search at the top of the card grid area; AGI places it below the header. Layout order is inverted.
  - [minor] No "Shared" badge support on project cards. Claude shows "Shared" on projects shared with team members. AGI has no sharing concept. @ `packages/unified-chat/src/components/ProjectCard.tsx`
- **Visual gaps:**
  - "+" icon in "New project" button is before the text (matching AGI), but AGI renders with slightly different spacing
  - Sort dropdown placement differs (right-aligned vs. inline with title)

---

## IMG: 04_project-detail_knowledge-panel_error-banner.png
- **Feature:** Project detail view with full right sidebar — Memory section (with content), Instructions section, Files section with capacity usage bar (324%), error banner "Project knowledge exceeds maximum. Remove files to continue.", file cards showing GitHub repos and text files
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/04_project-detail_knowledge-panel_error-banner.png`
- **Implementation status:** missing
- **Primary files:**
  - `apps/web/app/projects/[id]/page.tsx`
  - `apps/web/features/projects/components/KnowledgeFilesPanel.tsx`
- **API endpoints:**
  - `GET /api/projects/[id]/knowledge-files`
- **Data flow:**
  - In Claude, the project detail right sidebar shows:
    - Memory section with editable content and "Only you" / edit button
    - Instructions section with editable prompt area
    - Files section with capacity meter (percentage bar), error banner when over limit, add button, and file cards with type badges (GITHUB, TEXT)
  - AGI has none of these — the right sidebar does not exist
- **Flaws:**
  - [critical] No right sidebar with Memory/Instructions/Files sections. This is the core project knowledge management UI and it is entirely absent. @ `apps/web/app/projects/[id]/page.tsx`
  - [critical] No project capacity tracking or error banners. Claude shows "324% of project capacity used" with a red progress bar and "Project knowledge exceeds maximum" error banner. AGI has no capacity concept. @ `apps/web/features/projects/components/KnowledgeFilesPanel.tsx`
  - [critical] No GitHub repo file integration. Claude shows GitHub repos as file cards with repo name, branch, and "GITHUB" badge. AGI has no GitHub integration for project files. @ `apps/web/features/projects/components/KnowledgeFilesPanel.tsx`
  - [major] No Instructions section in project detail. Claude has "Instructions - Add instructions to tailor Claude's responses" with an add button. AGI's project store supports `instructions` but the detail page doesn't expose an editor for it. @ `apps/web/app/projects/[id]/page.tsx`
- **Visual gaps:**
  - Right sidebar with three collapsible sections is absent
  - Capacity progress bar with percentage is absent
  - Red error banner with warning icon is absent
  - File type badges (GITHUB, TEXT) are absent
  - Memory editor with "Only you" toggle and edit pencil icon is absent
  - "+" add buttons on Instructions and Files headers are absent

---

## IMG: 05_three-pane-layout_sidebar-chat-project.png
- **Feature:** Three-pane layout — left sidebar (navigation + recent chats), center chat area (project-scoped chat list with messages), right sidebar (project knowledge panel with Memory/Instructions/Files)
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/05_three-pane-layout_sidebar-chat-project.png`
- **Implementation status:** missing
- **Primary files:**
  - `apps/web/features/chat/pages/WebChatPage.tsx`
  - `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx`
  - `apps/web/features/projects/components/ProjectSidebar.tsx`
- **API endpoints:** All project + chat APIs
- **Data flow:**
  - Claude shows a three-pane layout:
    - Left: Full navigation sidebar with New chat, Search, Customize, Chats, Projects, Artifacts, Code links, plus Recent chats list, user profile
    - Center: Project-scoped chat with composer ("How can I help you today?"), large knowledge warning banner, and conversation list
    - Right: Project knowledge sidebar (Memory, Instructions, Files with capacity/error state)
  - AGI has no three-pane layout for project-scoped chat — the chat page is a separate route from the project page
- **Flaws:**
  - [critical] No three-pane layout combining navigation + chat + project knowledge. Claude integrates all three panels into a single view for project-scoped chat. AGI separates chat (`/chat`) from projects (`/projects/[id]`) with no combined view. @ `apps/web/features/chat/pages/WebChatPage.tsx`
  - [critical] No project knowledge sidebar visible during chat. When chatting within a project, Claude shows the project's files, instructions, and memory alongside the conversation. AGI provides no project context visibility during chat. @ `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx`
- **Visual gaps:**
  - Entire three-pane layout is absent
  - Left sidebar with full navigation and recent chats is different from AGI's 72px icon rail
  - Center pane with project-scoped chat list is absent
  - Right knowledge sidebar visible during chat is absent

---

## Cross-cutting flaws

1. **[critical] Two divergent project stores** — The web app has TWO project stores that are not synchronized:
   - `apps/web/features/projects/stores/project-store.ts` (web-only, persisted as `agi-projects`, has `isArchived`, `instructions`, `color` fields)
   - `packages/unified-chat/src/stores/projectStore.ts` (shared, NOT persisted, has `starred`, `conversationIds`, `iconEmoji`, `accentColor` fields)
   
   The `/projects` page uses the shared store via `ProjectGallery`, but `ProjectSidebar` uses the web-only store. Projects created in one store are invisible to the other. @ `apps/web/features/projects/stores/project-store.ts` and `packages/unified-chat/src/stores/projectStore.ts`

2. **[critical] Hardcoded colors in projects page** — The projects page uses inline hex color values (`bg-[#1f1f1d]`, `text-[#f3f0e8]`, etc.) and CSS custom properties with hardcoded values, violating the project's "no hardcoded colors" feedback rule. @ `apps/web/app/projects/page.tsx:34-48`

3. **[major] Knowledge files upload is permanently disabled** — The `KnowledgeFilesPanel` upload button is always disabled with `cursor: not-allowed` and tooltip "Cloud Managed (private beta)". The `ProjectSettingsDialog` has a file upload zone but it only stores files in component state — they are never persisted. @ `apps/web/features/projects/components/KnowledgeFilesPanel.tsx:57-72` and `apps/web/features/projects/components/ProjectSettingsDialog.tsx:188-248`

4. **[major] Hardcoded colors in KnowledgeFilesPanel** — Multiple hex color values (`#e8e4db`, `#b3aea4`, `rgba(255, 235, 205, 0.16)`) are used as inline styles instead of design tokens. @ `apps/web/features/projects/components/KnowledgeFilesPanel.tsx:49-94`

---

## Flaw summary table

| Severity | Count | Key areas |
|----------|-------|-----------|
| Critical | 14 | No right sidebar, no project-scoped chat, no three-pane layout, no file preview modal, no card context menu, no model selector, no capacity tracking, dual stores, hardcoded colors |
| Major | 12 | No sort menu, no archive action, no delete from gallery, no conversation titles, no loading skeleton, no instructions editor, knowledge upload disabled, hardcoded colors |
| Minor | 8 | Missing description field in create, label differences, timestamp format, search placeholder, shared badge, notification toast |
| Cosmetic | 6 | Sidebar style, search placement, card spacing, button styling |

---

## Recommendations (prioritized)

1. **Consolidate project stores** — Merge `features/projects/stores/project-store.ts` into the shared `packages/unified-chat/src/stores/projectStore.ts` with persistence. This is a data integrity issue.
2. **Build project detail right sidebar** — Implement the Memory/Instructions/Files panel matching Claude's reference (IMGs 160, 167, 172, 04, 05).
3. **Embed composer in project detail** — Mount the chat composer directly on `/projects/[id]` so users can start conversations without navigating away.
4. **Add card context menu** — Implement the three-dot dropdown on `ProjectCard` with Star/Edit/Archive/Delete actions.
5. **Implement sort dropdown** — Make the "Sort by" button functional with Recent/Created/Alphabetical options.
6. **Build file preview modal** — Add a click handler on knowledge file items that opens a content preview overlay.
7. **Replace hardcoded colors** — Use design tokens / CSS variables throughout projects pages and components.
8. **Implement skeleton loading** — Add shimmer/pulse loading state for the conversation list in project detail.
