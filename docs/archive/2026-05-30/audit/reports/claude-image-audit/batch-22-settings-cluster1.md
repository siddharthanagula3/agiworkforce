# Batch 22 — Settings Cluster 1: General / Account / Privacy / Billing / Usage

Audited: 2026-05-24
Reference: Claude Desktop + Claude Web (Free tier) screenshots
Target: AGI web app `/settings/*` pages

---

## IMG: 024-settings-general.png

- **Feature:** Settings > General — Profile section (avatar, full name, preferred name, work description, custom instructions for Claude) plus Preferences section (appearance toggle, chat font dropdown, voice dropdown). Left nav: General / Account / Privacy / Billing / Usage / Capabilities / Connectors / Claude Code / Cowork / Claude... (Beta). Desktop app sub-nav: General / Extensions / Developer. Search bar at top.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/024-settings-general.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/app/settings/general/page.tsx`
  - `apps/web/app/settings/layout.tsx`
  - `apps/web/app/settings/SettingsNavActive.tsx`
- **API endpoints:** none (general page has no server interaction)
- **Data flow:**
  - Layout (`layout.tsx`) renders left nav with 6 items: General, Account, Privacy, Billing, Capabilities, Connectors
  - `GeneralSettingsPage` reads `user` from `useBillingStore` to extract `full_name` / `name` from `user_metadata`
  - Avatar initials derived from `fullName` — no image upload
  - Theme state via `useAppTheme` hook which delegates to `next-themes`
  - Work description `<select>` uses `defaultValue=""` with no `onChange` and no state — selection is discarded
  - Custom instructions `<textarea>` has no `onChange`, no state, no save mechanism
- **Flaws:**
  - **[critical]** Work description `<select>` and instructions `<textarea>` are non-functional — they render UI elements with no state binding, no onChange handler, and no persistence mechanism. User input is silently discarded on any re-render. @ `apps/web/app/settings/general/page.tsx:69-104`
  - **[critical]** Full name and preferred name fields are read-only `<span>` elements, not editable inputs. Claude shows editable text fields for both. Users cannot update their name from this page. @ `apps/web/app/settings/general/page.tsx:56-66`
  - **[major]** Duplicate profile/general pages exist: `general/page.tsx` (non-functional read-only) and `profile/page.tsx` (functional with save). The nav label "Account" links to `/settings/profile` which has working controls, but `/settings/general` which is the default landing has broken ones. @ `apps/web/app/settings/general/page.tsx` vs `apps/web/app/settings/profile/page.tsx`
  - **[major]** Chat font dropdown offers "Newsreader Serif / System Sans / JetBrains Mono" but has no onChange, no state, no persistence. Claude shows "Anthropic Serif" — AGI uses different font name but also the control is non-functional. @ `apps/web/app/settings/general/page.tsx:144-157`
  - **[major]** Voice dropdown has no state, no onChange, no persistence — purely decorative. @ `apps/web/app/settings/general/page.tsx:159-173`
- **Visual gaps:**
  - Claude shows a search bar at top of settings nav — AGI has none
  - Claude nav has 10+ items (General, Account, Privacy, Billing, Usage, Capabilities, Connectors, Claude Code, Cowork, Claude... Beta) plus Desktop app section — AGI nav has only 6 items
  - Claude shows "Instructions for Claude" with a "Learn more" link — AGI shows "Instructions for AGI" but textarea is non-functional
  - Claude's avatar shows initials in a circle with the user's initials — AGI shows initials but no upload affordance on this page

---

## IMG: 025-settings-account.png

- **Feature:** Settings > Account — Log out button, Delete account button (requires subscription cancellation), Organization ID with copy button, Active sessions table (device, location, created, updated, with current session badge).
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/025-settings-account.png`
- **Implementation status:** missing (nav label "Account" points to `/settings/profile` which is a profile editor, not an account management page)
- **Primary files:**
  - `apps/web/app/settings/profile/page.tsx` (what "Account" nav item points to)
  - `apps/web/app/settings/layout.tsx:10` (maps Account -> /settings/profile)
- **API endpoints:**
  - `POST /api/portal` (Stripe portal, exists)
  - `DELETE /api/user/delete-account` (exists but not wired from profile page)
  - No session management API exists
- **Data flow:**
  - User clicks "Account" in nav -> routed to `/settings/profile`
  - Profile page shows: avatar, full name (editable), preferred name (editable), work description, instructions, appearance theme
  - Save button persists to localStorage + Supabase `updateUser`
  - No logout-all-devices, no session list, no org ID, no delete account on this page
- **Flaws:**
  - **[critical]** Account page is entirely missing. The nav item labeled "Account" routes to the Profile editor page which serves a completely different purpose. Claude's Account page shows session management, logout, delete account, and org ID — none of which exist at the routed destination. @ `apps/web/app/settings/layout.tsx:10`
  - **[major]** No active sessions UI exists anywhere in the web app. Users cannot see where they are logged in or revoke sessions. Claude shows device name, location, creation time, last update, and a "Current" badge.
  - **[major]** No "Log out of all devices" button exists. Only individual sign-out is available via the sidebar/header.
  - **[major]** No Organization ID display or copy button exists. Claude shows a masked org ID with a copy-to-clipboard button.
  - **[minor]** Delete account exists on the Privacy page (`/settings/privacy`) but not on the Account page where Claude places it. The flow is split across the wrong pages.
- **Visual gaps:**
  - Entire Account page content (sessions table, logout, org ID, delete) is absent
  - Claude shows a table with columns: Device, Location, Created, Updated — AGI has no equivalent
  - Claude shows "Current" badge on the active session row — AGI has no session awareness

---

## IMG: 026-settings-privacy.png

- **Feature:** Settings > Privacy — Introductory paragraph about data practices with links to Privacy Center and Privacy Policy. Expandable sections "How we protect your data" and "How we use your data". Preferences section with toggle switches for "Location metadata" and "Help improve Claude". "Your data" section with "Export data" button and "Shared chats" manage button. "Memory preferences" manage button with external link icon.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/026-settings-privacy.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/app/settings/privacy/page.tsx`
  - `apps/web/app/settings/memory/page.tsx`
- **API endpoints:**
  - `GET /api/user/data` (data export)
  - `DELETE /api/user/delete-account` (account deletion)
- **Data flow:**
  - Privacy page renders 3 toggles stored in localStorage: rememberChats, improveModelTraining (disabled, Cloud Managed), shareTelemetry
  - Export button calls `GET /api/user/data` -> downloads JSON blob
  - Delete account section uses CSRF-protected `DELETE /api/user/delete-account`
  - Toggle values read/written via `readToggle`/`writeToggle` helpers using localStorage
- **Flaws:**
  - **[major]** No introductory paragraph about data practices. Claude shows a prominent block: "Anthropic believes in transparent data practices. Learn how your information is protected..." with links to Privacy Center and Privacy Policy. AGI has a single-line description. @ `apps/web/app/settings/privacy/page.tsx:155-160`
  - **[major]** No expandable "How we protect your data" or "How we use your data" sections. Claude shows two expandable sections with arrow indicators. AGI has none. @ `apps/web/app/settings/privacy/page.tsx`
  - **[major]** No "Shared chats" manage button. Claude shows an "Export data" + "Shared chats" pair each with a "Manage" button. AGI only has export. @ `apps/web/app/settings/privacy/page.tsx`
  - **[major]** No "Memory preferences" manage link. Claude shows a "Memory preferences" row with a "Manage" button + external link icon. AGI has a separate `/settings/memory` page but no link to it from Privacy. @ `apps/web/app/settings/privacy/page.tsx`
  - **[minor]** Toggle labels differ from Claude. Claude uses "Location metadata" with description about city/region; AGI uses "Remember chats" as first toggle. Claude's toggles are styled as pill switches; AGI uses HTML checkboxes. @ `apps/web/app/settings/privacy/page.tsx:184-189`
  - **[minor]** "Help improve Claude" toggle uses a blue pill switch in Claude. AGI uses an HTML checkbox with the text "Help improve AGI models" and a "Cloud Managed" badge. @ `apps/web/app/settings/privacy/page.tsx:39-44`
  - **[cosmetic]** AGI shows a "Danger zone" section with delete account inline on the Privacy page. Claude puts delete account on the Account page instead.
- **Visual gaps:**
  - Missing Privacy Center / Privacy Policy doc links at top
  - Missing expandable documentation sections
  - Missing "Shared chats" management row
  - Missing "Memory preferences" management row with link to memory settings
  - HTML checkboxes instead of styled toggle switches
  - Different toggle ordering and labels

---

## IMG: 027-settings-billing.png

- **Feature:** Settings > Billing — Current plan card ("Max plan", "20x more usage than Pro", auto-renew date). Payment section showing "Link by Stripe" with debit owed amount and Update button. Invoices table with columns: Date, Due, Total, Status (all "Paid"), Actions ("View" links). Multiple invoice rows with various amounts.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/027-settings-billing.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/app/settings/billing/page.tsx`
  - `apps/web/features/billing/components/Billing/Usage.tsx`
  - `apps/web/features/billing/components/Billing/Subscription.tsx`
  - `apps/web/stores/unified/auth.ts`
- **API endpoints:**
  - `POST /api/portal` (Stripe billing portal)
  - `GET /api/me` (subscription + credit data)
- **Data flow:**
  - `BillingSettingsPage` reads `subscription`, `creditBalance_cents`, `dailyUsage_cents`, `dailyLimit_cents` from `useBillingStore`
  - Plan tier derived from `subscription?.tier` with fallback to 'free'
  - Pricing data from `BILLING_PLAN_PRICING` in `@agiworkforce/types`
  - "Upgrade plan" / "Change plan" link goes to `/pricing`
  - "Manage billing" link goes to `/billing` (separate full dashboard)
  - Usage section conditionally shown when `balanceDollars !== null`
- **Flaws:**
  - **[critical]** No invoice history table. Claude shows a full invoice table with Date, Due, Total, Status, and View action columns. AGI billing page has zero invoice display. The `Usage.tsx` component in `features/billing/` has invoice rendering but it is not used on the `/settings/billing` page — it belongs to the separate `/billing` dashboard. @ `apps/web/app/settings/billing/page.tsx`
  - **[major]** No payment method display. Claude shows "Link by Stripe" with debit owed ($0.38) and an "Update" button. AGI shows no payment method information on the settings billing page. @ `apps/web/app/settings/billing/page.tsx`
  - **[major]** No "Adjust plan" button. Claude shows an "Adjust plan" button in the plan header. AGI shows "Upgrade plan" (free tier) or "Change plan" (paid tier) linking to `/pricing`, which is a different flow. @ `apps/web/app/settings/billing/page.tsx:108-141`
  - **[major]** Plan card is minimal. Claude shows plan name, multiplier description ("20x more usage than Pro"), and auto-renew date. AGI shows plan name, status, renewal date, and price — but missing the multiplier description and the prominent plan badge/icon. @ `apps/web/app/settings/billing/page.tsx:48-99`
  - **[minor]** Two separate billing UIs exist: the settings page at `/settings/billing` (minimal) and the full dashboard at `/billing` (with `Usage.tsx`, `Subscription.tsx`, `Topup.tsx`). The settings version is the one users see from nav and it is far less complete.
- **Visual gaps:**
  - No invoice table with date/due/total/status/actions columns
  - No payment method card with Stripe link
  - No plan badge/icon (Claude shows a circular progress-style icon)
  - No "Adjust plan" CTA in plan header
  - No debit owed display

---

## IMG: 028-settings-usage.png

- **Feature:** Settings > Usage — "Plan usage limits" header showing plan tier (Max 20x). Current session progress bar. Weekly limits section with "All models", "Sonnet only", and "Claude Design" rows each showing reset time (Wed 6:00 PM), usage percentage bars, and "% used" labels. "Last updated: just now" timestamp with refresh button. Additional features section showing "Daily included routine runs" with 0/15 progress.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/028-settings-usage.png`
- **Implementation status:** missing
- **Primary files:** None — no `/settings/usage` page exists
- **API endpoints:**
  - `GET /api/usage` (route exists but not wired to any settings page)
- **Data flow:**
  - No data flow — page does not exist
  - The nav in `layout.tsx` has no "Usage" entry
  - The closest equivalent is the usage section in `/settings/billing/page.tsx:145-181` which shows credit balance and daily usage as text, not progress bars
  - The `features/billing/components/Billing/Usage.tsx` component exists but is wired to the standalone `/billing` dashboard, not settings
- **Flaws:**
  - **[critical]** Usage settings page is entirely missing. Claude has a dedicated Usage tab showing per-model weekly limits with progress bars, current session tracking, reset timers, and additional feature quotas (routine runs). AGI has no equivalent anywhere in the settings nav. @ `apps/web/app/settings/layout.tsx:8-15`
  - **[critical]** No per-model usage breakdown exists. Claude shows separate progress bars for "All models", "Sonnet only", and "Claude Design" with individual reset times. AGI only tracks aggregate credit balance in cents.
  - **[major]** No current session tracking. Claude shows a "Current session" progress bar that starts when a message is sent. AGI has no session-level usage concept.
  - **[major]** No weekly reset timer. Claude shows "Resets Wed 6:00 PM" for each model tier. AGI has no usage period concept.
  - **[major]** No "Daily included routine runs" quota display (Claude shows 0/15). AGI has no routine/scheduled run quota tracking.
- **Visual gaps:**
  - Entire page is absent — no nav entry, no route, no component
  - No progress bars for usage visualization
  - No per-model breakdown
  - No reset timer display
  - No "Last updated" timestamp with refresh

---

## IMG: 051_claude-free_settings_general.png

- **Feature:** Claude Free tier Settings > General (web browser view at claude.ai/settings/general). Full-width layout with left sidebar nav (General, Account, Privacy, Billing, Capabilities, Connectors, Claude Code). Profile section: Avatar circle, Full name text input, "What should Claude call you?" text input, "What best describes your work?" dropdown (Select), Instructions for Claude textarea. Preferences: Appearance (system/light/dark icons), Chat font dropdown (Anthropic Serif), Voice dropdown (Buttery).
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/051_claude-free_settings_general.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/app/settings/general/page.tsx`
  - `apps/web/app/settings/layout.tsx`
- **API endpoints:** none
- **Data flow:** Same as IMG 024 — `GeneralSettingsPage` renders profile fields but work description, instructions, chat font, and voice dropdowns have no state or persistence.
- **Flaws:**
  - **[critical]** Same non-functional controls as IMG 024: work description, instructions, chat font, and voice all lack state/onChange/persistence. @ `apps/web/app/settings/general/page.tsx:69-173`
  - **[major]** Full name and preferred name are read-only spans, not editable inputs like Claude shows. @ `apps/web/app/settings/general/page.tsx:56-66`
  - **[major]** Claude Free web nav shows 7 items (General, Account, Privacy, Billing, Capabilities, Connectors, Claude Code). AGI nav shows 6 items (General, Account, Privacy, Billing, Capabilities, Connectors) — missing Claude Code equivalent. @ `apps/web/app/settings/layout.tsx:8-15`
  - **[minor]** Voice dropdown says "Buttery" in Claude. AGI has "Default / Warm / Professional" options. @ `apps/web/app/settings/general/page.tsx:168-171`
- **Visual gaps:**
  - Claude shows full-width page with sidebar — AGI uses same layout pattern (matches)
  - Claude's nav items render as plain text links — AGI's match this pattern
  - Claude's avatar is a colored circle with initial letter — AGI matches this
  - Font name differs: Claude says "Anthropic Serif", AGI says "Newsreader Serif"

---

## IMG: 052_claude-free_settings_billing.png

- **Feature:** Claude Free tier Settings > Billing (web browser at claude.ai/settings/billing). Shows "Free plan / Try Claude" header with feature checklist (10 bullet items with checkmarks). "Upgrade plan" button. Invoices section with a single historical invoice row (Nov 14, 2025, $21.32, Paid, View link).
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/052_claude-free_settings_billing.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/app/settings/billing/page.tsx`
- **API endpoints:**
  - `GET /api/me` (plan data)
  - `POST /api/portal` (Stripe portal)
- **Data flow:**
  - `BillingSettingsPage` reads subscription from `useBillingStore`
  - Free tier renders plan name "Free", status "inactive", and an "Upgrade plan" link
  - No feature checklist is rendered
  - No invoice history is shown
- **Flaws:**
  - **[critical]** No plan feature checklist. Claude Free shows 10 checkmarked features (Chat on web/iOS/Android, Generate code, Write/edit content, Analyze text/images, Web search, Create files, Desktop extensions, Google Workspace, MCP connectors, Extended thinking). AGI shows only plan name and status. @ `apps/web/app/settings/billing/page.tsx:48-99`
  - **[critical]** No invoice history on settings billing page. Claude shows past invoices even for free-tier users who previously had paid plans. AGI has no invoice rendering on this page. @ `apps/web/app/settings/billing/page.tsx`
  - **[major]** No "Try Claude" / "Try AGI" subtitle or descriptive text next to the plan name. Claude shows "Free plan" with "Try Claude" as a subtitle. AGI shows just "Free". @ `apps/web/app/settings/billing/page.tsx:77`
- **Visual gaps:**
  - Missing plan feature checklist with checkmark icons
  - Missing invoice table with Date/Total/Status/Actions columns
  - Missing "Upgrade plan" styled as a prominent outlined button (AGI has it but styled differently as a link)
  - Missing "Try Claude" / "Try AGI" subtitle

---

## IMG: 203_claude-desktop_settings-general.png

- **Feature:** Claude Desktop Settings > General (modal overlay). Same structure as IMG 024 but from a 2026-05-15 capture showing product management selected for work description, custom instructions textarea with example text. Left nav includes Desktop app section (General / Extensions / Developer) below the main settings nav.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/203_claude-desktop_settings-general.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/app/settings/general/page.tsx`
  - `apps/web/app/settings/layout.tsx`
- **API endpoints:** none
- **Data flow:** Same as IMG 024 / IMG 051. Non-functional form controls.
- **Flaws:**
  - **[critical]** Same non-functional form controls as IMG 024. @ `apps/web/app/settings/general/page.tsx:69-173`
  - **[major]** No "Desktop app" sub-section in nav (General / Extensions / Developer). Claude desktop separates these as a distinct nav group below the main settings items. AGI has no desktop-specific settings. @ `apps/web/app/settings/layout.tsx:8-15`
  - **[minor]** Claude shows settings as a modal overlay on the desktop app. AGI shows settings as a full page. This is expected since AGI web is a browser app, not a desktop shell — this is a valid architectural difference rather than a flaw.
- **Visual gaps:**
  - Missing "Desktop app" nav section (General / Extensions / Developer)
  - Missing "Cowork" and "Claude... Beta" nav items
  - Missing search bar in settings nav

---

## IMG: 38_feature-showcase_integrations-middle.png

- **Feature:** Feature showcase / integrations modal showing 4 product cards: Cowork (hand off complex tasks, "Only on desktop", Upgrade button, illustration), Claude Code (build/debug from terminal or IDE, Upgrade button, links to Terminal/VS Code/Desktop app/JetBrains/Slack), Mobile (chat hands-free, iOS/Android download buttons), Chrome (navigate/click/fill forms, Upgrade button). Each card has description text, product illustration, and relevant CTAs.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/38_feature-showcase_integrations-middle.png`
- **Implementation status:** missing
- **Primary files:**
  - `apps/web/app/integrations/page.tsx` (marketing page, not a settings card grid)
  - `apps/web/app/settings/connections/page.tsx` (OAuth connectors, different content)
- **API endpoints:** none relevant
- **Data flow:**
  - No equivalent feature showcase modal or card grid exists in AGI web
  - The `/integrations` page is a marketing page with text descriptions of MCP/native messaging/BYOK patterns
  - The `/settings/connections` page lists OAuth connector stubs (Google Drive, GitHub, Slack, etc.) in a list format, not product cards
- **Flaws:**
  - **[major]** No cross-surface product showcase exists. Claude shows a visual card grid with Cowork, Claude Code, Mobile, Chrome products, each with illustrations, descriptions, and platform-specific CTAs (download buttons, external links). AGI has no equivalent UI for discovering and accessing its multi-surface products. @ N/A — no matching component exists
  - **[major]** No download links for mobile apps (iOS/Android) from within the web app settings. Claude shows download buttons for mobile apps within the integrations showcase. @ N/A
  - **[minor]** AGI's `/integrations` page is a marketing landing page with text content, not an interactive product card grid. The content pattern is fundamentally different from Claude's modal-based showcase.
- **Visual gaps:**
  - No product card grid with illustrations
  - No Cowork/Claude Code/Mobile/Chrome equivalent cards
  - No platform download buttons (iOS/Android/Terminal/VS Code/JetBrains)
  - No Slack integration link
  - No "Only on desktop" badge equivalent

---

## IMG: 39_feature-showcase_integrations-platforms.png

- **Feature:** Continuation of integrations showcase (scrolled down). Shows: bottom of Cowork card illustration, Slack external link in Claude Code card, Mobile card (iOS/Android download buttons), Chrome card (browser automation description + Upgrade button, with a demo screenshot showing a returns workflow). Additional product card at bottom showing health data tracking with a chart visualization.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/39_feature-showcase_integrations-platforms.png`
- **Implementation status:** missing
- **Primary files:** Same as IMG 38 — no matching component exists
- **API endpoints:** none relevant
- **Data flow:** No data flow — feature does not exist
- **Flaws:**
  - **[major]** Same as IMG 38 — no cross-surface product showcase or integration card grid exists. @ N/A
  - **[major]** No health data / personal data integration card. Claude shows a health data tracking visualization. AGI has no health/personal data integration surface in the web app. @ N/A
  - **[minor]** No browser automation demo screenshots within integration cards. Claude shows an inline screenshot of a returns workflow in the Chrome card. @ N/A
- **Visual gaps:**
  - Same as IMG 38 — entire feature showcase is absent
  - No health data card with chart visualization
  - No inline demo screenshots in product cards

---

## Cross-cutting findings

### Navigation IA gaps

| Claude nav item | AGI equivalent | Status |
|---|---|---|
| General | `/settings/general` | Present but non-functional controls |
| Account | `/settings/profile` (mislabeled) | Wrong content — profile instead of account |
| Privacy | `/settings/privacy` | Partial — missing docs/shared chats/memory links |
| Billing | `/settings/billing` | Partial — missing invoices/payment method |
| Usage | (none) | **Missing entirely** |
| Capabilities | `/settings/capabilities` | Present |
| Connectors | `/settings/connections` | Present (waitlisted stubs) |
| Claude Code | (none) | **Missing** |
| Cowork | (none) | **Missing** |
| Claude... Beta | (none) | **Missing** |
| Desktop app > General | (none) | **Missing** (N/A for web) |
| Desktop app > Extensions | (none) | **Missing** (N/A for web) |
| Desktop app > Developer | (none) | **Missing** (N/A for web) |
| Search bar | (none) | **Missing** |

### Duplicate settings implementations

Two separate settings systems coexist:

1. **App Router pages** (`/app/settings/*`): Used by nav, renders individual pages. Several have non-functional form controls.
2. **Feature-module tabs** (`features/settings/pages/SettingsPage.tsx`): Tab-based UI with Appearance/Chat/Models/Commands/Privacy & Data/Billing/Notifications tabs. Uses different stores (`useAuthStore` vs `useBillingStore`). Not mounted on any App Router route — appears orphaned.

The feature-module `SettingsPage.tsx` at `apps/web/features/settings/pages/SettingsPage.tsx` is dead code as no App Router page imports or mounts it.

### Critical-severity summary

| # | Description | File |
|---|---|---|
| 1 | General page form controls (work desc, instructions, font, voice) have no state/onChange/persistence | `general/page.tsx:69-173` |
| 2 | Account page entirely missing — nav routes to Profile instead | `layout.tsx:10` |
| 3 | Usage page entirely missing — no route, no component, no nav entry | `layout.tsx:8-15` |
| 4 | No invoice history on billing settings page | `billing/page.tsx` |
| 5 | No plan feature checklist on billing page (free tier) | `billing/page.tsx:48-99` |

### Major-severity summary

| # | Description | File |
|---|---|---|
| 1 | Full name / preferred name are read-only spans, not editable inputs | `general/page.tsx:56-66` |
| 2 | No active sessions UI or session revocation | N/A — not implemented |
| 3 | No log-out-all-devices button | N/A — not implemented |
| 4 | No organization ID display/copy | N/A — not implemented |
| 5 | No privacy data practice documentation links | `privacy/page.tsx:155-160` |
| 6 | No "Shared chats" manage button on privacy page | `privacy/page.tsx` |
| 7 | No "Memory preferences" link on privacy page | `privacy/page.tsx` |
| 8 | No payment method display on billing page | `billing/page.tsx` |
| 9 | No per-model usage breakdown | N/A — not implemented |
| 10 | No current session / weekly limit tracking | N/A — not implemented |
| 11 | No cross-surface product showcase / integration cards | N/A — not implemented |
| 12 | Orphaned `SettingsPage.tsx` (tab-based) is dead code | `features/settings/pages/SettingsPage.tsx` |
