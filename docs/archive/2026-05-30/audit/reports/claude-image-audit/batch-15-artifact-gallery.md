# Batch 15 — Artifact Gallery and New Artifact Picker

Auditor: Claude Opus 4.7 (1M context)
Date: 2026-05-24
Ref images: 7 screenshots (claude-max20x + claude-free, 2026-05-15)
Web app root: `apps/web/`

---

## IMG: 149_claude-max20x_artifacts_my-empty-or-loading.png

- **Feature:** Artifact Gallery page ("Artifacts") showing user-owned artifacts in a card grid with dark thumbnail previews, titles, and "Last edited" timestamps. Left sidebar shows icon-rail navigation with icons for new chat, search, chats, projects, code, file manager, settings, and chevron-down. Top-right "New artifact" button with outline style.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/149_claude-max20x_artifacts_my-empty-or-loading.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/app/gallery/page.tsx`
  - `apps/web/app/gallery/GalleryClient.tsx`
  - `apps/web/features/chat/stores/artifacts-store.ts`
  - `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx`
- **API endpoints:** None (client-side localStorage-only via zustand persist)
- **Data flow:**
  - User navigates to `/gallery` via sidebar "Artifacts" button (ChatSidebar.tsx:582)
  - `GalleryPage` renders `Header` + `GalleryClient`
  - `GalleryClient` reads `useArtifactsStore(s => s.artifacts)` from localStorage-persisted zustand store
  - Artifacts sorted newest-first by `createdAt`, rendered in `ArtifactCard` grid
  - Empty state shown when no artifacts exist
  - Click on a card opens `ArtifactDrawer` with `ArtifactPreview` rendering
- **Flaws:**
  - [critical] No "New artifact" button exists anywhere in the gallery page. Claude reference shows a prominent "New artifact" outline button top-right; AGI gallery has no equivalent. @ `apps/web/app/gallery/GalleryClient.tsx` (entire file -- missing feature)
  - [major] Artifact card thumbnails are missing. Claude shows dark preview thumbnails of artifact content (rendered HTML/code snapshots); AGI cards show only text (title, language badge, subtitle). @ `apps/web/app/gallery/GalleryClient.tsx:237-305`
  - [major] No "Last edited X months ago" timestamp format. Claude shows "Last edited 5 months ago" style; AGI shows "Created 2d ago" format using `relativeTime()`. The wording differs ("Created" vs "Last edited") and the store lacks an `updatedAt` field -- only `createdAt`. @ `apps/web/features/chat/stores/artifacts-store.ts:14-19`
  - [minor] Page title says "Gallery." (with period) vs Claude's "Artifacts". The branding/nomenclature diverges. @ `apps/web/app/gallery/GalleryClient.tsx:530`
  - [minor] Sub-heading "Your artifacts" is rendered as a tab selector (yours | inspiration) rather than a static label. Claude shows only "Your artifacts" as a section header. @ `apps/web/app/gallery/GalleryClient.tsx:557-567`
  - [cosmetic] Card grid uses `minmax(280px, 1fr)` vs Claude's ~3-column layout with narrower cards. @ `apps/web/app/gallery/GalleryClient.tsx:499`
- **Visual gaps:**
  - Claude's icon-rail sidebar has ~10 distinct nav icons (sidebar toggle, new chat, search, chats, projects, code/artifacts, file manager, settings, chevron-down); AGI collapsed sidebar only has 8 icons (panel, plus, search, chat, folder, settings, download, avatar)
  - No code/artifacts icon in the collapsed sidebar icon rail (the Layers icon only appears in expanded sidebar)
  - Artifact card aspect ratio and dark preview thumbnails completely absent
  - Claude cards show rendered content preview (actual artifact output); AGI cards are text-only

---

## IMG: 149b_claude-max20x_artifacts_grid-loaded.png

- **Feature:** Same Artifact Gallery with loaded card grid. Cards show dark rendered previews of artifact content with titles like "The Anthropic and Claude Suite Com...", "Anthropic's Executive Compensation...", etc. Demonstrates 3-column grid at desktop width with consistent card sizing.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/149b_claude-max20x_artifacts_grid-loaded.png`
- **Implementation status:** partial
- **Primary files:** Same as IMG 149
- **API endpoints:** None
- **Data flow:** Same as IMG 149
- **Flaws:**
  - [critical] Same as 149 -- no "New artifact" button, no rendered preview thumbnails, no content snapshot in cards.
  - [major] Artifact preview thumbnails require either server-side rendering or screenshot capture of artifact HTML/code output. Neither mechanism exists. The `ArtifactPreview` component renders artifacts inline but does not produce static thumbnail images. @ `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx`
  - [major] Claude truncates long titles with ellipsis (e.g., "The Anthropic and Claude Suite Com..."); AGI cards do have ellipsis via CSS `textOverflow: 'ellipsis'` but the card layout lacks the fixed-height dark preview area above the title. @ `apps/web/app/gallery/GalleryClient.tsx:237-305`
  - [minor] No hover interaction on cards shows a preview expansion or tooltip. Claude cards appear to have subtle hover states with border brightening. AGI does implement `onMouseEnter`/`onMouseLeave` for border color change. @ `apps/web/app/gallery/GalleryClient.tsx:255-260`
- **Visual gaps:**
  - Card structure is fundamentally different: Claude = dark preview area (60%+ of card) + title + timestamp below; AGI = title + language badge + subtitle text only
  - Grid density: Claude fits ~4 columns of wider cards; AGI auto-fills at 280px minimum

---

## IMG: 048_claude-free_artifacts.png

- **Feature:** Artifact Gallery on Claude Free tier in a browser tab (URL: `claude.ai/artifacts/my`). Same layout as Max20x but in a browser window. Shows "Artifacts" heading, "Your artifacts" section header, and "New artifact" button. Cards show rendered content previews. A loading spinner appears on the first card position.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/048_claude-free_artifacts.png`
- **Implementation status:** partial
- **Primary files:** Same as IMG 149
- **API endpoints:** None
- **Data flow:** Same as IMG 149
- **Flaws:**
  - [critical] No loading state / spinner. Claude shows a circular loading indicator for artifacts that are still rendering their preview. AGI gallery has no loading state for artifact cards -- the store is synchronous localStorage, so either content is there or it shows empty state. @ `apps/web/app/gallery/GalleryClient.tsx:579-634`
  - [major] URL path mismatch: Claude uses `/artifacts/my`; AGI uses `/gallery`. Not necessarily a bug, but the route naming diverges from the reference. @ `apps/web/app/gallery/page.tsx`
  - [major] No "Search chats..." bar at the page level. The Claude free screenshot shows a `Search chats...` input at the top of the page; AGI gallery page has no search bar for filtering artifacts. @ `apps/web/app/gallery/GalleryClient.tsx` (missing feature)
- **Visual gaps:**
  - Claude's artifact page has a top-level search bar ("Search chats...") that spans the full width -- AGI has none
  - Loading spinner / skeleton state for cards is absent
  - "Last edited X months ago" shown under each card title in Claude; AGI shows "Created" instead

---

## IMG: 048b_claude-free_artifacts_loaded-grid.png

- **Feature:** Artifact Gallery fully loaded on Claude Free. Same as 048 but all cards rendered with dark content previews. Shows 3-column grid. Bottom-left shows download icon with blue notification dot.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/048b_claude-free_artifacts_loaded-grid.png`
- **Implementation status:** partial
- **Primary files:** Same as IMG 149
- **API endpoints:** None
- **Data flow:** Same as IMG 149
- **Flaws:**
  - [critical] Same missing features as above (no New artifact button, no rendered previews, no search bar)
  - [minor] AGI sidebar has an "Artifacts" nav item that routes to `/gallery` but the page title shows "Gallery." not "Artifacts". Naming inconsistency between sidebar label and page heading. @ `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx:583` vs `apps/web/app/gallery/GalleryClient.tsx:530`
- **Visual gaps:**
  - Same as IMG 048 -- fundamental card layout difference (no preview thumbnails)
  - Claude free sidebar status indicator / badge (blue dot on download icon) vs AGI's similar implementation in `CollapsedSidebar` line 419

---

## IMG: 154_claude-max20x_new-artifact_category-picker.png

- **Feature:** "New Artifact" creation flow, step 1: Category picker. Shows heading "Let's get cooking! Pick an artifact category or start building your idea from scratch." Below: 7 category cards in a 4+3 grid layout:
  Row 1: "Apps and websites" (monitor icon), "Documents and templates" (doc icon), "Games" (gamepad icon), "Productivity tools" (sparkles icon)
  Row 2: "Creative projects" (palette icon), "Quiz or survey" (clipboard icon), "Start from scratch" (plus icon)
  Left sidebar shows collapsed icon-rail. Title bar shows "Untitled" with dropdown.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/154_claude-max20x_new-artifact_category-picker.png`
- **Implementation status:** missing
- **Primary files:** None -- no equivalent component exists
- **API endpoints:** N/A
- **Data flow:** N/A (feature does not exist)
- **Flaws:**
  - [critical] Entire "New Artifact" creation flow is missing. No category picker, no artifact template selection, no guided creation wizard. There is no route, component, or UI element that provides this workflow. @ N/A
  - [critical] No artifact category taxonomy exists in the codebase. Claude defines 7 categories (Apps and websites, Documents and templates, Games, Productivity tools, Creative projects, Quiz or survey, Start from scratch); AGI has no equivalent concept. @ N/A
  - [major] The `GalleryClient.tsx` has an "Inspiration" tab with 6 static example cards, but these are hardcoded code snippets, not the Claude-style guided category picker that leads to a new chat with artifact intent. @ `apps/web/app/gallery/GalleryClient.tsx:22-169`
- **Visual gaps:**
  - Entire screen is absent -- the card-based category picker with icons does not exist
  - No "Untitled" project title bar at top
  - No guided artifact creation UX

---

## IMG: 155_claude-max20x_new-artifact_start-from-scratch-chat.png

- **Feature:** "New Artifact" flow after selecting "Start from scratch". Shows:
  1. Category picker grid still visible at top (with "Start from scratch" highlighted)
  2. A "Start from scratch" pill button below the grid
  3. A notification banner: "Want to be notified when Claude responds?" with [Notify] and [X]
  4. A numbered option list in the chat area: "What do you want to create?" with options 1-5 (App or website, Document, Game, Tool or utility, Something else) plus a "Something else" text input and "Skip" button. Shows "1 of 3" pagination.
  5. Bottom composer showing "Or reply directly..." with Opus 4.7 Adaptive model selector
  6. Footer: "up/down to navigate . Enter to select . or type below"
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/155_claude-max20x_new-artifact_start-from-scratch-chat.png`
- **Implementation status:** missing
- **Primary files:** None
- **API endpoints:** N/A
- **Data flow:** N/A (feature does not exist)
- **Flaws:**
  - [critical] Entire guided artifact creation chat flow is missing. Claude shows a multi-step wizard (3 pages: "1 of 3") that walks the user through artifact type selection before starting the chat. AGI has no equivalent. @ N/A
  - [critical] Numbered option list UI component does not exist. Claude shows a numbered menu (1. App or website, 2. Document, 3. Game, 4. Tool or utility, 5. Something else) with arrow-key navigation, Enter to select, free-text fallback, and "Skip" button. This is a distinct chat-UI component that AGI lacks. @ N/A
  - [major] No notification permission prompt ("Want to be notified when Claude responds?") exists in AGI's chat interface. @ N/A
  - [major] "Or reply directly..." placeholder in the composer during artifact creation wizard is a contextual placeholder state that AGI's `ChatComposerNew.tsx` does not implement. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - [minor] Footer instruction bar ("up/down to navigate . Enter to select . or type below") is a contextual footer that changes based on chat state. AGI has no equivalent dynamic footer. @ N/A
- **Visual gaps:**
  - Entire screen is absent -- no guided creation wizard, no numbered option list, no notification prompt
  - "Share" button in top-right of the title bar does not exist in AGI's artifact/chat pages
  - Model selector shows "Opus 4.7 Adaptive" with audio waveform icon -- AGI model selector does not have adaptive mode display

---

## IMG: 151_claude-max20x_global-search-modal.png

- **Feature:** Global search modal (appears to be triggered from the "Chats" page). Shows:
  1. A floating modal with "Search chats and projects" placeholder and X to close
  2. Results list showing projects (folder icon + "JOB" with arrow) and chats (chat icon + titles like "research", "claude Prompt" with author names or timestamps)
  3. Result entries show metadata: author name ("Siddhartha Nagula") for projects, "Past hour" / "Past week" for chats
  4. Different icon types: folder for projects, chat bubble for conversations, code brackets for code-related chats
  5. Behind the modal: the Chats list page with "Select chats" and "New chat" buttons, a "Search chats..." input bar
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/151_claude-max20x_global-search-modal.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx`
  - `apps/web/features/chat/services/global-search-service.ts`
  - `apps/web/features/chat/v3/WebSearchModalCmdK.tsx`
  - `apps/web/components/CommandPalette/CommandPalette.tsx`
- **API endpoints:**
  - Supabase RPC: `track_search`, `get_recent_searches`, `get_popular_searches`, `clear_search_history`, `get_search_suggestions`
  - Supabase tables: `web_conversations`, `web_messages`
- **Data flow:**
  - User triggers search (Cmd+K or click search icon)
  - Two competing implementations exist:
    Path A: `WebSearchModalCmdK` -- uses `useChatStore` conversations + static items, searches locally
    Path B: `GlobalSearchDialog` -- uses `globalSearchService` which queries Supabase `web_conversations` and `web_messages` tables via `.ilike()` pattern matching
  - Path A groups results by kind (chats, projects, skills, connectors, settings)
  - Path B groups by type (session vs message), shows matched text with highlighting
  - Both support keyboard navigation (arrow up/down, Enter, Escape)
- **Flaws:**
  - [critical] Two competing search modal implementations exist with no clear routing. `WebSearchModalCmdK` (v3) and `GlobalSearchDialog` coexist. Neither exactly matches Claude's modal. The v3 modal searches locally; the GlobalSearchDialog searches Supabase. No unified search across both chats AND projects in a single modal. @ `apps/web/features/chat/v3/WebSearchModalCmdK.tsx` vs `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx`
  - [major] Neither search modal shows project results with author names. Claude's modal shows "JOB" (project) with a right-arrow icon and "research" / "claude Prompt" with "Siddhartha Nagula" author attribution. `WebSearchModalCmdK` has hardcoded static project entries (e.g., "Sales pipeline") rather than real project data. `GlobalSearchDialog` only searches conversations/messages, not projects. @ `apps/web/features/chat/v3/WebSearchModalCmdK.tsx:23-31` and `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx`
  - [major] Claude's search modal is lightweight/floating with a clean border; AGI's `GlobalSearchDialog` is a heavy Dialog with DialogHeader, DialogTitle, filter panel, ScrollArea, and footer. Over-engineered compared to Claude's minimal floating search. @ `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:282-616`
  - [major] Search placeholder text differs: Claude says "Search chats and projects"; `WebSearchModalCmdK` says "Search chats, projects, skills, connectors, settings..."; `GlobalSearchDialog` says "Search messages and conversations...". Neither matches exactly. @ `apps/web/features/chat/v3/WebSearchModalCmdK.tsx:179` and `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:298`
  - [minor] Claude's search shows icon differentiation (folder icon for projects, chat icon for regular chats, code brackets for code chats). `WebSearchModalCmdK` maps kinds to icons (FolderOpen, MessageSquare, Wrench, Plug, Settings) but does not distinguish between code-related and regular chats. @ `apps/web/features/chat/v3/WebSearchModalCmdK.tsx:34-40`
  - [minor] `CommandPalette.tsx` is a third competing modal that handles Cmd+K in some contexts. It has duplicate `id: 'go-chat'` entries (line 121 and 124) and the "Go to Settings" action routes to `/chat` instead of `/settings/general`. @ `apps/web/components/CommandPalette/CommandPalette.tsx:121-136`
  - [minor] `CommandPalette.tsx` "Go to Settings" action (line 136) and "Go to Media Generation" action (line 149) both route to `/chat` -- incorrect navigation targets. @ `apps/web/components/CommandPalette/CommandPalette.tsx:136,149`
- **Visual gaps:**
  - Claude's search modal is a floating centered card; `GlobalSearchDialog` is a full Dialog component with header/footer chrome
  - Claude results show right-arrow icon for projects; AGI `WebSearchModalCmdK` shows `ArrowRight` only on selected item
  - Claude's search sits atop the Chats page (visible behind); AGI search modals use backdrops/overlays
  - No visual distinction between projects and chats in search results (e.g., folder vs chat icon) in `GlobalSearchDialog`

---

## Summary of Critical Gaps

| # | Gap | Severity | Scope |
|---|-----|----------|-------|
| 1 | No "New artifact" button on gallery page | critical | Gallery |
| 2 | No rendered content preview thumbnails in artifact cards | critical | Gallery |
| 3 | Entire New Artifact category picker flow missing | critical | New Artifact |
| 4 | Entire guided artifact creation chat wizard missing (numbered options, multi-step, Skip) | critical | New Artifact |
| 5 | Two competing search modals (WebSearchModalCmdK + GlobalSearchDialog) with no unified routing | critical | Search |
| 6 | No loading/skeleton state for artifact gallery cards | critical | Gallery |
| 7 | Search does not query real projects -- only hardcoded stubs | major | Search |
| 8 | Artifact store lacks `updatedAt` field; uses "Created" not "Last edited" | major | Gallery |
| 9 | No notification permission prompt in chat | major | Chat |
| 10 | Gallery page titled "Gallery." not "Artifacts" | minor | Gallery |
| 11 | CommandPalette has duplicate IDs and wrong navigation targets | minor | CommandPalette |
| 12 | Artifact cards lack dark preview thumbnails, aspect ratio differs | cosmetic | Gallery |

### Duplicate/Fragmented Artifact Stores

Two separate artifact stores exist:
1. `apps/web/shared/stores/artifact-store.ts` -- `useArtifactStore` (message-keyed, version control, Supabase sharing)
2. `apps/web/features/chat/stores/artifacts-store.ts` -- `useArtifactsStore` (flat array, localStorage persist, code-block extraction)

The gallery uses store #2 (`useArtifactsStore`). Store #1 (`useArtifactStore`) is used by the chat artifact system. These are not synchronized. An artifact created via store #1 will NOT appear in the gallery (store #2), and vice versa. This is a data integrity gap.

### Files Audited

| File | Lines | Role |
|------|-------|------|
| `apps/web/app/gallery/page.tsx` | 20 | Gallery route |
| `apps/web/app/gallery/GalleryClient.tsx` | 661 | Gallery UI |
| `apps/web/app/gallery/layout.tsx` | 44 | Gallery metadata |
| `apps/web/features/pages/ArtifactGallery.tsx` | 261 | Legacy gallery (unused?) |
| `apps/web/features/chat/stores/artifacts-store.ts` | 303 | Artifact store (gallery) |
| `apps/web/shared/stores/artifact-store.ts` | 233 | Artifact store (chat) |
| `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx` | 617 | Global search dialog |
| `apps/web/features/chat/services/global-search-service.ts` | 500 | Search service |
| `apps/web/features/chat/v3/WebSearchModalCmdK.tsx` | 319 | Cmd+K search modal |
| `apps/web/components/CommandPalette/CommandPalette.tsx` | 461 | Command palette |
| `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx` | 669 | Chat sidebar |
| `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | 60+ | Artifact preview |
| `apps/web/app/api/artifacts/publish/route.ts` | 156 | Publish API |
| `apps/web/lib/artifact-sandbox.ts` | 50+ | Sandbox helpers |
