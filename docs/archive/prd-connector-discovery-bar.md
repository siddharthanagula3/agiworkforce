# PRD: Connector Discovery Bar for agiworkforce.com/chat

**Author**: Spec Writer Agent
**Date**: 2026-03-20
**Status**: Draft
**Surface**: Web (`apps/web/`)
**Effort**: Medium (3-5 engineering days)

---

## 1. Problem Statement

### The Gap

When a new user lands on `agiworkforce.com/chat`, they see a generic greeting ("What can I help you with?"), four suggested prompt cards, and a text composer. There is zero indication that AGI Workforce can connect to external services like GitHub, Gmail, Google Drive, Slack, Notion, or Salesforce. The platform's connector ecosystem -- one of its strongest differentiators -- is completely invisible until a user navigates to dashboard settings.

### Why This Matters

1. **First impression is everything.** The empty-state chat page is the highest-traffic screen for new signups. If a user does not discover integrations within their first session, the probability of them returning drops sharply. Claude.ai solves this with "From Drive" / "From Gmail" pills directly in the input area. Perplexity Computer has a dedicated "Connectors" sidebar link. Our competitive analysis (see `docs/COMPETITIVE_SINGLE_SOURCE_OF_TRUTH.md`, lines 104-108) explicitly flags this as a gap:

   > **AGI Workforce Gap**: No connector-linked pills (From Drive, From Gmail)

2. **Credibility signal.** A row of recognizable service icons (GitHub octocat, Gmail envelope, Slack hash) instantly communicates "this product is serious and integrates with your stack" -- before the user types a single word.

3. **Integration discovery drives retention.** Users who connect at least one service are significantly more likely to become daily active users because the AI can pull context from their actual workflow tools, not just freeform text.

4. **Revenue impact.** Connected users consume more tokens (richer context = longer conversations), hit usage limits sooner, and upgrade to paid plans at higher rates.

### Desktop Precedent

The desktop app already ships `ConnectorDiscoveryBar.tsx` (at `apps/desktop/src/components/UnifiedAgenticChat/ConnectorDiscoveryBar.tsx`) with a working pattern: a slim clickable bar showing connector initials, a "Connect your tools" label, a dismiss button, and localStorage-based persistence. The web implementation should follow the same UX principles but adapt to the web's server-rendered architecture, Supabase-backed state, and Tailwind CSS variable system.

---

## 2. User Stories

### US-1: New User (Unauthenticated Visitor)

**As** a visitor who has not signed up yet,
**I want** to see recognizable service icons (GitHub, Gmail, Slack, etc.) in the chat empty state,
**So that** I understand this product integrates with my workflow tools, increasing my motivation to sign up.

**Acceptance Criteria:**

- Connector icons are visible in the empty state even when not logged in.
- Icons are shown in a muted/gray state with a "Sign up to connect" tooltip.
- Clicking any icon or the bar itself redirects to the auth page with a `?returnTo=/chat&connector=<id>` parameter.

### US-2: New Authenticated User (Zero Connectors)

**As** a newly signed-up user with no connected services,
**I want** to see a connector discovery bar below the suggested prompts or above the composer,
**So that** I can quickly connect my first service without leaving the chat page.

**Acceptance Criteria:**

- All icons shown in "not connected" gray state.
- Clicking an icon opens the OAuth flow for that service (or navigates to `/dashboard/settings` with the relevant connector pre-selected, if OAuth is not yet wired for that service).
- The bar includes a dismiss (X) button.
- Dismissing persists the preference via Zustand + localStorage (matching `chat-preferences-store.ts` pattern).
- The bar reappears if a new connector becomes available (version bump).

### US-3: Returning User (Some Connectors Connected)

**As** a returning user who has connected Gmail and GitHub,
**I want** those icons to appear colored/active while unconnected services remain gray,
**So that** I can see at a glance which tools are active and discover new ones.

**Acceptance Criteria:**

- Connected connectors shown with their brand color.
- Unconnected connectors shown in muted gray.
- Connected connectors show a green checkmark badge or colored ring.
- Hovering a connected connector shows "Connected" tooltip; hovering unconnected shows "Click to connect [Service Name]".

### US-4: User Who Dismissed the Bar

**As** a user who previously dismissed the connector bar,
**I want** the bar to stay hidden on future visits,
**So that** I am not annoyed by persistent prompts.

**Acceptance Criteria:**

- Dismissal stored in `chat-preferences-store.ts` (Zustand persist to localStorage).
- Bar does not reappear on page reload or new sessions.
- A "Show integrations" link in settings or footer can re-enable it.

### US-5: Admin / Workspace Owner

**As** a workspace admin,
**I want** to see which connectors my team has enabled and control which appear in the discovery bar,
**So that** I can enforce security policies (e.g., disable Salesforce for non-sales teams).

**Acceptance Criteria:**

- (Phase 2) Admin settings page to whitelist/blacklist connectors per workspace.
- For Phase 1, all connectors from the allowlist are shown to all users.

---

## 3. Competitive Analysis

### Claude.ai (Max Plan, March 2026)

- **Pattern**: Quick-action pills in the input area: "Code", "Write", "Learn", "From Drive", "From Gmail".
- **Connector pills**: "From Drive" and "From Gmail" are connector-linked actions that open a file picker within the context of that service.
- **Strengths**: Action-oriented (not just "connect" but "use from"), minimal visual footprint.
- **Weakness**: Only 2 connectors shown; not scalable to 20+ integrations.

### ChatGPT (Plus Plan, March 2026)

- **Pattern**: No connector bar in the empty state. GPTs section in sidebar shows connected GPTs (e.g., "Canva").
- **Connector discovery**: Buried in sidebar "Apps" and "Explore GPTs" sections.
- **Strengths**: Clean empty state.
- **Weakness**: Poor discoverability of integrations for new users.

### Perplexity Computer (Pro Plan, March 2026)

- **Pattern**: Dedicated "Connectors" link in the sidebar navigation.
- **Connector page**: Grid of service icons with connect/disconnect toggles.
- **Strengths**: Dedicated surface for connector management.
- **Weakness**: Requires navigating away from the chat to discover connectors.

### Manus AI

- **Pattern**: Service icons displayed directly in the empty-state input area as a horizontal row.
- **Icons include**: GitHub, Gmail, Slack, Google Drive, Notion, Jira, Figma, Salesforce, Calendar, and more.
- **States**: Grayscale when not connected, colored when connected.
- **Strengths**: Maximum discoverability, visually impressive, instant credibility signal.
- **Weakness**: Can feel cluttered with 10+ icons.

### Our Approach (Recommended Hybrid)

Combine Manus's visual icon row with Claude's action-oriented mindset:

- Show a horizontal row of service icons (Manus pattern) in the empty-state area.
- Keep it slim and dismissible (desktop ConnectorDiscoveryBar pattern).
- On hover, show action-oriented tooltips: "Search GitHub repos", "Import from Drive", "Read Gmail" -- not just "Connect GitHub".
- Position it between the suggested prompts and the composer, creating a natural visual flow: greeting -> suggestions -> connectors -> input.

---

## 4. Detailed Requirements

### 4.1 Visual Design

**Layout**: A horizontal row of circular service icons, preceded by a link icon and "Connect your tools" label, with a dismiss (X) button at the trailing edge.

**Dimensions**:

- Bar height: 40px (py-2 + icon height)
- Icon size: 28px (w-7 h-7) circular
- Max width: `max-w-2xl` (matches SuggestedPrompts and composer width)
- Centered horizontally within the empty state

**Position in DOM hierarchy** (within `apps/web/app/chat/page.tsx`):

```
<div> (empty state container)
  <Greeting />           -- "What can I help you with?"
  <SuggestedPrompts />   -- 4 action cards
  <ConnectorDiscoveryBar /> -- NEW: between prompts and composer
</div>
<ChatComposerNew />      -- sticky bottom composer
```

**Color System** (uses existing CSS custom properties):

- Bar background: `bg-[var(--chat-bg-elevated)]` or `bg-card/40` (matching SuggestedPrompts)
- Bar border: `border-border/30` (subtle, matching prompt cards)
- Not-connected icon: `bg-muted/60 text-muted-foreground` (grayscale)
- Connected icon: Brand color background (e.g., `bg-red-500/15 text-red-500` for Gmail)
- Hover: `ring-2 ring-primary/30` with tooltip

### 4.2 Connector Icon Set (Phase 1)

| Service      | Icon           | Brand Color                             | Connector ID   | Priority |
| ------------ | -------------- | --------------------------------------- | -------------- | -------- |
| GitHub       | Octocat SVG    | `zinc-400`                              | `github`       | P0       |
| Gmail        | Envelope SVG   | `red-500`                               | `gmail`        | P0       |
| Google Drive | Drive SVG      | `yellow-500` / `blue-500` / `green-500` | `google-drive` | P0       |
| Slack        | Hash SVG       | `purple-500`                            | `slack`        | P0       |
| Notion       | N glyph        | `zinc-200` (on dark)                    | `notion`       | P0       |
| Jira         | Jira SVG       | `blue-600`                              | `jira`         | P1       |
| Figma        | Figma SVG      | `purple-400`                            | `figma`        | P1       |
| Salesforce   | Cloud SVG      | `blue-400`                              | `salesforce`   | P1       |
| Calendar     | Calendar SVG   | `blue-500`                              | `calendly`     | P1       |
| Linear       | Linear SVG     | `violet-400`                            | `linear`       | P2       |
| Confluence   | Confluence SVG | `blue-500`                              | `confluence`   | P2       |

**Icon Source**: Use Lucide React icons where available (`Github`, `Mail`, `HardDrive`, `Hash`, `Calendar`). For services without Lucide equivalents (Notion, Jira, Figma, Salesforce, Linear), use the first-letter initial in a branded circle (matching the desktop implementation pattern).

**Ordering**: Connected services first (sorted by connection date), then unconnected services in the priority order above.

### 4.3 Interaction States

**Not Connected (default)**:

- Icon: Grayscale (`text-muted-foreground/60`)
- Background: `bg-muted/30`
- Cursor: `pointer`
- Hover: Icon brightens to `text-muted-foreground`, background shifts to `bg-muted/60`, tooltip appears
- Tooltip text: "Connect [Service Name]"

**Connected**:

- Icon: Brand color (e.g., `text-red-500` for Gmail)
- Background: Brand tint (e.g., `bg-red-500/15`)
- Small green dot badge at bottom-right (3px circle, `bg-green-500`)
- Hover: Tooltip text: "[Service Name] connected"
- Click: Opens service-specific action (Phase 2) or shows "Already connected" toast

**Hover (all states)**:

- Tooltip: Appears below the icon after 300ms delay
- Tooltip content: Service name + connection status
- Scale: `scale-110` transform on hover for micro-interaction

**Loading**:

- While fetching connector status from `/api/connectors`: Show skeleton placeholders (pulsing circles)
- Duration: Match existing skeleton patterns in the codebase

**Error**:

- If the API call fails: Show the bar with all icons in "not connected" state
- No error toast for the discovery bar itself (non-critical UI)

### 4.4 Click Behavior

**Not Connected + Authenticated**:

1. Click triggers navigation to `/dashboard/settings` with `?tab=connectors&connect=<connectorId>` query params.
2. (Phase 2) For services with OAuth wired (GitHub, Gmail, Google Drive), directly initiate the OAuth popup flow without leaving the chat page.

**Not Connected + Unauthenticated**:

1. Click triggers navigation to `/auth/login?returnTo=/chat&connector=<connectorId>`.
2. After login, the user returns to `/chat` and sees the connector bar with a prompt to connect the clicked service.

**Connected**:

1. Click shows a brief `sonner` toast: "[Service Name] is connected" with a "Manage" link to settings.
2. (Phase 2) Click opens a context menu: "Search [Service]", "Import from [Service]", "Disconnect".

**Dismiss (X button)**:

1. Click sets `connectorBarDismissed: true` in the `chat-preferences-store`.
2. Bar animates out (opacity fade + height collapse, 200ms).
3. Bar does not reappear until the user resets preferences or a new major version of the connector list is released (tracked via a `connectorBarVersion` integer).

### 4.5 Responsive Behavior

**Desktop (>= 1024px, `lg`):**

- Full horizontal row, all icons visible.
- Bar width: `max-w-2xl` centered.

**Tablet (768px - 1023px, `md`):**

- Same layout, but icons may wrap to a second row if more than 8 are shown.
- Or: horizontal scroll with fade gradient at edges.

**Mobile (< 768px, `sm`):**

- Horizontal scrollable row with `overflow-x-auto` and `-webkit-overflow-scrolling: touch`.
- Leading/trailing fade gradients (`mask-image: linear-gradient(...)`) to indicate scrollability.
- Smaller icon size: `w-6 h-6` (24px).
- Bar is dismissible (same X button).

### 4.6 Dismiss and Persistence

- **Storage**: `useChatPreferencesStore` (already at `apps/web/features/chat/stores/chat-preferences-store.ts`) with Zustand `persist` middleware pointing at localStorage key `agi-chat-preferences`.
- **New fields**:
  ```typescript
  connectorBarDismissed: boolean; // default: false
  connectorBarVersion: number; // default: 1
  ```
- **Version bump logic**: If the hardcoded `CURRENT_CONNECTOR_BAR_VERSION` in the component exceeds the stored `connectorBarVersion`, reset `connectorBarDismissed` to false and update the stored version. This allows re-showing the bar when significant new connectors are added.

---

## 5. Technical Specification

### 5.1 New Files to Create

| File                                                               | Purpose                                                        |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `apps/web/features/chat/components/ConnectorDiscoveryBar.tsx`      | Main component                                                 |
| `apps/web/features/chat/components/ConnectorDiscoveryBar.test.tsx` | Unit tests                                                     |
| `apps/web/features/chat/hooks/use-connectors.ts`                   | Hook to fetch user's connected services from `/api/connectors` |

### 5.2 Files to Modify

| File                                                      | Change                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/web/app/chat/page.tsx`                              | Import and render `<ConnectorDiscoveryBar />` between `<SuggestedPrompts />` and the composer |
| `apps/web/features/chat/stores/chat-preferences-store.ts` | Add `connectorBarDismissed` and `connectorBarVersion` fields                                  |

### 5.3 Files NOT to Modify

| File                                                                       | Reason                                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/web/app/api/connectors/route.ts`                                     | Existing API is sufficient; no changes needed                   |
| `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`           | Connector bar is positioned outside the composer, not inside it |
| `apps/desktop/src/components/UnifiedAgenticChat/ConnectorDiscoveryBar.tsx` | Desktop version; reference only                                 |
| `apps/desktop/src/stores/mcpStore.ts`                                      | Desktop-only Tauri store; web uses its own API route            |

### 5.4 Component API

```typescript
// apps/web/features/chat/components/ConnectorDiscoveryBar.tsx

interface ConnectorDiscoveryBarProps {
  /** Additional className for the outer container */
  className?: string;
  /** Called when a connector icon is clicked (for analytics) */
  onConnectorClick?: (connectorId: string, isConnected: boolean) => void;
}

export function ConnectorDiscoveryBar(props: ConnectorDiscoveryBarProps): React.ReactElement | null;
```

### 5.5 Connector Data Model

```typescript
// Hardcoded connector manifest (Phase 1)
// Phase 2: fetch from API or shared config

interface ConnectorDefinition {
  id: string; // matches VALID_CONNECTOR_IDS in route.ts
  name: string; // Display name
  icon: LucideIcon | null; // Lucide icon component, null = use initial
  initial: string; // Fallback: first letter(s) for circle
  brandColor: string; // Tailwind color class (e.g., 'red-500')
  category: 'productivity' | 'development' | 'communication' | 'crm' | 'design';
  actionVerb: string; // For tooltip: "Search repos" / "Import files"
}

interface ConnectorStatus {
  connectorId: string;
  isConnected: boolean;
  connectedAt?: string; // ISO date from API
}
```

### 5.6 Data Flow

```
1. Component mounts
2. Check `useChatPreferencesStore().connectorBarDismissed`
   - If true AND version matches: render null (bar hidden)
   - If true AND version outdated: reset dismissed, continue
3. Check `useAuthStore().user`
   - If null (unauthenticated): render all icons as gray, click -> auth redirect
   - If authenticated: fetch connector status
4. Call `useConnectors()` hook
   - GET /api/connectors (authenticated)
   - Returns list of connected connector IDs
   - Merges with hardcoded CONNECTOR_DEFINITIONS to produce full list
5. Render bar with correct states
6. On click:
   - Not connected: navigate to /dashboard/settings?tab=connectors&connect=<id>
   - Connected: show toast
7. On dismiss:
   - Update store: { connectorBarDismissed: true, connectorBarVersion: CURRENT_VERSION }
```

### 5.7 Hook: `useConnectors`

```typescript
// apps/web/features/chat/hooks/use-connectors.ts

interface UseConnectorsReturn {
  /** Map of connectorId -> isConnected */
  connectedMap: Record<string, boolean>;
  /** True while the initial fetch is in flight */
  isLoading: boolean;
  /** Error message if fetch failed (null on success) */
  error: string | null;
  /** Re-fetch connector status */
  refresh: () => void;
}

export function useConnectors(): UseConnectorsReturn;
```

Implementation notes:

- Uses `fetch('/api/connectors')` with credentials.
- Caches result in a module-level `Map` to avoid re-fetching on every mount within the same session.
- Falls back gracefully: if fetch fails, `connectedMap` is empty (all icons show as not connected).
- Does NOT use SWR or React Query (the web app does not currently use these libraries for chat features).

### 5.8 Integration with `page.tsx`

Current structure of `ChatPageInner` return:

```tsx
return (
  <div className="flex flex-1 flex-col overflow-hidden">
    <div className="flex flex-1 flex-col items-center justify-center px-4 pb-4">
      <div className="mb-8 text-center">{/* Greeting */}</div>
      <div className="w-full max-w-2xl">
        <SuggestedPrompts onSelect={handleSend} />
      </div>
      {/* NEW: ConnectorDiscoveryBar goes here */}
    </div>
    <ChatComposerNew onSend={handleSend} isLoading={isLoading} />
  </div>
);
```

New structure:

```tsx
return (
  <div className="flex flex-1 flex-col overflow-hidden">
    <div className="flex flex-1 flex-col items-center justify-center px-4 pb-4">
      <div className="mb-8 text-center">{/* Greeting */}</div>
      <div className="w-full max-w-2xl">
        <SuggestedPrompts onSelect={handleSend} />
      </div>
      <div className="mt-4 w-full max-w-2xl">
        <ConnectorDiscoveryBar />
      </div>
    </div>
    <ChatComposerNew onSend={handleSend} isLoading={isLoading} />
  </div>
);
```

---

## 6. Implementation Plan

### Phase 1: MVP (Target: 3 days)

**Day 1: Component + Hook**

1. Create `apps/web/features/chat/hooks/use-connectors.ts` with fetch logic.
2. Create `apps/web/features/chat/components/ConnectorDiscoveryBar.tsx` with:
   - Hardcoded `CONNECTOR_DEFINITIONS` for 9 services (GitHub, Gmail, Drive, Slack, Notion, Jira, Figma, Salesforce, Calendar).
   - Gray/colored states based on `useConnectors()` data.
   - Tooltips on hover (use Radix `Tooltip` from `@shared/ui/tooltip`).
   - Dismiss button with `useChatPreferencesStore` integration.
   - Skeleton loading state.
3. Update `apps/web/features/chat/stores/chat-preferences-store.ts` with new fields.

**Day 2: Integration + Responsive** 4. Update `apps/web/app/chat/page.tsx` to render `<ConnectorDiscoveryBar />`. 5. Implement responsive behavior: scroll on mobile, full row on desktop. 6. Implement click behavior: navigate to settings page for unconnected, toast for connected. 7. Handle unauthenticated state: gray icons with auth redirect.

**Day 3: Polish + Tests** 8. Write unit tests for `ConnectorDiscoveryBar.test.tsx` (render states, dismiss, click handlers). 9. Visual QA: dark mode, light mode, mobile viewport, empty state, all-connected state. 10. Accessibility audit: keyboard navigation, screen reader, ARIA labels.

### Phase 2: Enhanced (Future Sprint)

- Inline OAuth popup for GitHub, Gmail, Google Drive (no page navigation).
- Action-oriented click: "Search GitHub repos" opens a GitHub search in-chat.
- Admin controls for workspace connector visibility.
- Analytics event tracking for connector clicks and connections.
- Animated entrance: staggered icon fade-in on first render.

---

## 7. Success Metrics

### Primary Metrics

| Metric                             | Target                                                              | Measurement                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Connector bar visibility rate      | 80%+ of new users see the bar                                       | Percentage of `/chat` page loads where bar renders (not dismissed)                                |
| Connector click-through rate (CTR) | 15%+ of users who see the bar click at least one icon               | Clicks / impressions                                                                              |
| First connector connection rate    | 10%+ of new users connect at least one service within first session | Supabase `user_connectors` table, filtered by `connected_at` within 1h of `auth.users.created_at` |
| Dismiss rate                       | <40% of users dismiss the bar                                       | `connectorBarDismissed` events                                                                    |

### Secondary Metrics

| Metric                                | Target                        | Measurement                          |
| ------------------------------------- | ----------------------------- | ------------------------------------ |
| Return visit rate (connected vs. not) | 2x higher for connected users | DAU/MAU segmented by connector count |
| Average connectors per user           | 2.0+ after 30 days            | `user_connectors` count per user     |
| Time to first connection              | <5 minutes from signup        | Timestamp delta                      |

### Guardrail Metrics

| Metric                          | Threshold           | Action if Breached                             |
| ------------------------------- | ------------------- | ---------------------------------------------- |
| Chat page load time regression  | <200ms p95 increase | Defer connector fetch to `requestIdleCallback` |
| Dismiss rate                    | >60%                | Redesign bar (too intrusive)                   |
| Error rate on `/api/connectors` | >5%                 | Add retry logic, circuit breaker               |

---

## 8. Edge Cases

### 8.1 No Connectors Available

- **When**: The `VALID_CONNECTOR_IDS` allowlist is empty (should never happen in production).
- **Behavior**: Bar renders nothing (returns `null`).

### 8.2 All Connectors Connected

- **When**: User has connected every service in the definition list.
- **Behavior**: Bar still renders with all icons colored. The "Connect your tools" label changes to "Your connected tools". Dismiss button remains available.

### 8.3 Auth Token Expired During Fetch

- **When**: User's Supabase session expires between page load and connector fetch.
- **Behavior**: `/api/connectors` returns 401. Hook treats this as "no connectors" (all gray). No error toast (the auth refresh middleware should handle session renewal separately).

### 8.4 Slow Network / Timeout

- **When**: `/api/connectors` takes >3 seconds.
- **Behavior**: Show skeleton loading for up to 5 seconds, then fall back to "all unconnected" state. The bar is still useful as a discovery mechanism even without live status.

### 8.5 OAuth Redirect Interruption

- **When**: User clicks a connector, gets redirected to OAuth, but abandons the flow.
- **Behavior**: No state change. Connector remains "not connected" on next visit. No dangling state.

### 8.6 Connector Disconnected Externally

- **When**: User revokes access in the third-party service (e.g., GitHub settings).
- **Behavior**: Our API still shows the connector as "connected" until the next token refresh fails. Phase 2 should add a health-check mechanism. For Phase 1, accept stale state.

### 8.7 localStorage Unavailable

- **When**: Incognito mode with strict privacy settings, or Safari ITP.
- **Behavior**: `useChatPreferencesStore` persist middleware handles this gracefully (Zustand persist catches the error). Bar always appears (dismiss does not persist). Acceptable UX degradation.

### 8.8 Server-Side Rendering

- **When**: Next.js SSR renders the chat page.
- **Behavior**: Component is `'use client'`. On server, `useConnectors()` returns `isLoading: true`. Skeleton is rendered. Hydration shows the real state. No flash of incorrect content because the skeleton is the initial state.

---

## 9. Accessibility Requirements

### 9.1 ARIA Labels and Roles

```html
<!-- Bar container -->
<nav aria-label="Available integrations" role="navigation">
  <!-- Each connector icon -->
  <button aria-label="Connect GitHub" title="Connect GitHub" role="button" tabindex="0">
    <!-- icon -->
  </button>

  <!-- Connected connector -->
  <button aria-label="GitHub - connected" title="GitHub connected" role="button" tabindex="0">
    <!-- icon with green badge -->
  </button>

  <!-- Dismiss button -->
  <button aria-label="Dismiss integrations bar" tabindex="0">
    <X />
  </button>
</nav>
```

### 9.2 Keyboard Navigation

- **Tab**: Moves focus through connector icons left-to-right, then to the dismiss button.
- **Enter / Space**: Activates the focused connector (same as click).
- **Escape**: Dismisses the bar (same as clicking X).
- Focus ring: Use the standard `focus-visible:ring-2 focus-visible:ring-primary/50` pattern used throughout the web app.

### 9.3 Screen Reader Support

- Bar announced as "Available integrations, navigation" (via `<nav>` + `aria-label`).
- Each icon button announced as "Connect [Service Name]" or "[Service Name], connected".
- Dismiss button announced as "Dismiss integrations bar".
- When bar is dismissed, announce via `aria-live="polite"`: "Integrations bar dismissed. You can re-enable it in settings."

### 9.4 Color Contrast

- Gray icons on dark background: Ensure `text-muted-foreground/60` meets WCAG AA contrast ratio (4.5:1) against `bg-card/40`.
- Brand color icons: Each brand color must meet AA contrast against its tinted background. Verified for the 9 services listed.
- Green "connected" badge: Use `bg-green-500` (not `bg-green-400`) for sufficient contrast.

### 9.5 Reduced Motion

- Respect `prefers-reduced-motion: reduce`:
  - Disable hover scale transform.
  - Disable dismiss animation (instant hide instead of fade).
  - Use `motion-safe:` Tailwind prefix for all transitions.

---

## 10. Timeline Estimate

| Phase                       | Scope                               | Effort                  | Dependencies                                  |
| --------------------------- | ----------------------------------- | ----------------------- | --------------------------------------------- |
| Phase 1 (MVP)               | Component, hook, integration, tests | **Medium** (3 eng days) | None -- uses existing `/api/connectors` route |
| Phase 2 (OAuth Inline)      | Inline OAuth popups, action menus   | **Medium** (3 eng days) | OAuth callback routes for each service        |
| Phase 3 (Analytics + Admin) | Event tracking, admin controls      | **Small** (1 eng day)   | Analytics infrastructure                      |

**Total Phase 1 estimate**: 3 engineering days (Medium effort).

---

## 11. Open Questions

1. **Icon source**: Should we use real SVG brand logos (requires licensing review) or Lucide + initials (simpler, already used on desktop)?
   **Recommendation**: Lucide + initials for Phase 1; real brand SVGs for Phase 2 after legal review.

2. **Position**: Below suggested prompts (recommended) vs. inside the composer (Claude pattern)?
   **Recommendation**: Below suggested prompts. The composer is already complex (8 buttons, ghost text, slash commands). Adding icons inside would increase visual noise.

3. **Number of icons**: Show all 9 at once, or limit to 5-6 with a "+N more" overflow?
   **Recommendation**: Show up to 7 on desktop, scrollable on mobile. If more than 7 connectors exist, show the most popular 7 and a "+N" pill that links to the full connectors page.

4. **Supabase migration**: The `user_connectors` table is referenced in `apps/web/app/api/connectors/route.ts` but no migration file exists in the repo. Is this table already created in production Supabase, or does it need a migration?
   **Blocker for Phase 1 if the table does not exist.** The hook will return an empty array and the bar will still function as a discovery tool (all gray icons), but connected-state rendering depends on the table existing.

---

## Appendix A: Desktop Implementation Reference

The desktop version at `apps/desktop/src/components/UnifiedAgenticChat/ConnectorDiscoveryBar.tsx` provides these patterns to reuse:

- `DISMISS_KEY = 'connectorBarDismissed'` stored in localStorage.
- Five connectors hardcoded: Gmail, Slack, GitHub, Notion, Calendar.
- Click opens settings dialog via `useSettingsDialogStore((s) => s.openSettings)`.
- Accessible: `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space.
- Dismiss via `e.stopPropagation()` on the X button.
- Returns `null` when dismissed.

Key differences for the web version:

- Web uses Supabase auth (not Tauri managed state).
- Web stores preferences in `useChatPreferencesStore` (Zustand persist), not raw localStorage.
- Web fetches connector status from `/api/connectors` (server-side Supabase), not from a Tauri `invoke()` call.
- Web needs SSR-safe rendering (`'use client'` directive, no `localStorage` access during SSR).

## Appendix B: API Contract

**GET /api/connectors** (existing, no changes needed):

```json
// Request: GET /api/connectors (with auth cookie or Bearer token)
// Response 200:
{
  "connectors": [
    {
      "id": "uuid",
      "connectorId": "github",
      "authType": "oauth",
      "connectedAt": "2026-03-18T10:00:00Z",
      "updatedAt": "2026-03-18T10:00:00Z"
    }
  ]
}
// Response 401: { "error": "Unauthorized" }
```

The `connectorId` field in the response is matched against `ConnectorDefinition.id` to determine connected status.

## Appendix C: Connector Definition Constants

```typescript
const CONNECTOR_DEFINITIONS: ConnectorDefinition[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: Github,
    initial: 'GH',
    brandColor: 'zinc-400',
    category: 'development',
    actionVerb: 'Search repos',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    icon: Mail,
    initial: 'GM',
    brandColor: 'red-500',
    category: 'communication',
    actionVerb: 'Read emails',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    icon: HardDrive,
    initial: 'GD',
    brandColor: 'yellow-500',
    category: 'productivity',
    actionVerb: 'Import files',
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: Hash,
    initial: 'SL',
    brandColor: 'purple-500',
    category: 'communication',
    actionVerb: 'Search messages',
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: null,
    initial: 'N',
    brandColor: 'zinc-200',
    category: 'productivity',
    actionVerb: 'Search pages',
  },
  {
    id: 'jira',
    name: 'Jira',
    icon: null,
    initial: 'J',
    brandColor: 'blue-600',
    category: 'development',
    actionVerb: 'View issues',
  },
  {
    id: 'figma',
    name: 'Figma',
    icon: null,
    initial: 'F',
    brandColor: 'purple-400',
    category: 'design',
    actionVerb: 'Browse files',
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    icon: null,
    initial: 'SF',
    brandColor: 'blue-400',
    category: 'crm',
    actionVerb: 'Search contacts',
  },
  {
    id: 'calendly',
    name: 'Calendar',
    icon: Calendar,
    initial: 'CA',
    brandColor: 'blue-500',
    category: 'productivity',
    actionVerb: 'Check schedule',
  },
];
```

These IDs align with the `VALID_CONNECTOR_IDS` set in `apps/web/app/api/connectors/route.ts`.
