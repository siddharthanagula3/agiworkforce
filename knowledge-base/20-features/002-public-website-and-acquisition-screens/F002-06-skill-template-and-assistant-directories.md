---
id: "F002-06"
type: "feature"
title: "Skill, template and assistant directories"
aliases: ["Skills page", "Built-in skills list", "Gallery", "Artifacts gallery", "Inspiration examples", "Template page", "Gallery example", "Custom assistant directory (missing)", "S2.16", "S2.17", "S2.18", "S2.21"]
area: "2 Public website and acquisition screens"
available_on: ["web"]
implementation: {web: "partial", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "seen failing", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S2.16", "S2.17", "S2.18", "S2.21"]
depends_on: ["surface:web", "SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-authentication-and-identity", "file:apps/web/app/gallery/inspiration.ts", "file:apps/web/lib/services/skill-catalog-service.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F002-06 Skill, template and assistant directories

Public /skills lists the built-in skills to signed-out visitors. Public /gallery shows an Artifacts page with ten Inspiration examples, each with its own /gallery/<id> page and a 'Build one like it' button that starts a chat. A custom-assistant directory does not exist in the code.

Area: [2. Public website and acquisition screens](README.md). Requirement items: [S2.16](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s216), [S2.17](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s217), [S2.18](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s218), [S2.21](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s221).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | seen failing |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Signed out, /skills shows each built-in skill with a one-line summary and a sign-in button; signed in it opens the Skills section of Settings (apps/web/app/skills/page.tsx:38-52). /gallery lists a visitor's own artifacts, artifacts shared with them (signed in) and ten Inspiration examples; /gallery/<id> previews one example and links to chat with a starter prompt (apps/web/app/gallery/[templateId]/page.tsx:45-62).

**Why it exists.** Visitors should see what skills and starting examples exist and try one, as the leaders show examples and galleries.

**Who uses it.** Prospective users and signed-in users creating artifacts.

**Problems it solves**

- See which skills ship with every account before signing in (apps/web/app/skills/SignedOutSkills.tsx:21-26)
- Skill descriptions written for the model are shortened into one buyer-readable line (apps/web/app/skills/public-skill-summary.ts:24-35)
- Start from an example without a blank page

**Use cases**

- Visit /skills signed out and read the built-in skills
- Open /gallery, click an Inspiration card, then 'Open page'
- On /gallery/<id> click 'Build one like it' to start chat with a prefilled prompt
- Signed in, use New artifact and the three-step wizard to start a chat

## 2. User experience

**Where to find it**

- Web: /skills and /gallery (listed in the sitemap; /gallery on the site map page apps/web/app/sitemap-page/page.tsx:35)
- Web: /gallery/<template id> (ten ids, apps/web/app/gallery/inspiration.ts)
- Signed in: /skills opens Settings, Skills; the gallery is also used inside the app shell
- Other apps: not applicable; custom assistants have no page anywhere in the web code

**Before you start**

- None to browse; sign-in for Yours, Shared with you and the skills settings

**Screens and controls**

- /skills: heading 'Skills live in your workspace', list 'Built-in skills.', button 'Sign in to use skills', link 'What plugins can do' (apps/web/app/skills/SignedOutSkills.tsx:22-47)
- /gallery: heading 'Artifacts', segments 'All', 'Yours', 'Shared with you' (signed in only), search 'Search artifacts...', 'Filter by' menu for type and date ('Any time', 'Last 7 days', 'Last 30 days'), 'New artifact', 'Clear filters', section 'Inspiration' (apps/web/app/gallery/GalleryClient.tsx:159-163,1401-1530,1692)
- Drawer for an example with 'Open page' and 'Open chat'
- Template page: 'Build one like it' and 'Back to the gallery' (apps/web/app/gallery/[templateId]/page.tsx:47-58)
- New artifact flow: category picker (Apps and websites, Documents, Games, Productivity tools, Creative projects, Quiz or survey, Start from scratch), then steps 'Describe your idea', 'Who is it for?', 'Any extra requirements?' (apps/web/app/gallery/GalleryClient.tsx:58-94,614-621)

**Journey**

1. Visitor opens /gallery
2. Browses or searches the cards
3. Opens an example card and then its page
4. Clicks 'Build one like it'
5. Chat opens at /chat with the prompt placed in the composer (apps/web/features/chat/pages/WebChatPage.tsx:1146,1322-1327)

**What the person sees and gets**

- Skill list rows with name and short summary
- Gallery cards with rendered thumbnails or excerpts; a preview of the example on its page
- Empty state 'Artifacts you create in conversations will appear here.' with New artifact
- Prefilled composer text

**Settings**

- Skills on or off, install and write are in Settings after sign-in; not part of this public feature

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Signed-out skill list from the managed skill catalogue, executable and not plugin-owned, sorted by name, with an outage message and an empty message (apps/web/app/skills/page.tsx:21-36; apps/web/lib/services/skill-catalog-service.ts:261-267; apps/web/app/skills/SignedOutSkills.tsx:30-45)
- Gallery page with scopes, search, type and date filters, Shared with you with paging and retry, and ten Inspiration examples (apps/web/app/gallery/GalleryClient.tsx; apps/web/app/gallery/inspiration.ts)
- One addressable page per example, statically generated, in the sitemap with metadata (apps/web/app/gallery/[templateId]/page.tsx:15-33; apps/web/app/sitemap.ts:119-133)
- Launch into chat through /chat?starterPrompt=...; the chat page puts it in the composer and removes the parameter from the address (apps/web/features/chat/pages/WebChatPage.tsx:1322-1327)

**Incomplete**

- Gallery examples are finished sample artifacts, not starter templates with fields; only the prompt text is carried to chat
- The skill directory has no search and no detail page per skill; a test requires that no unlinked skills/[name] route ships (apps/web/app/skills/__tests__/skills-detail-route-orphan.test.ts:44-50)
- Whether a signed-out visitor can send the prefilled chat is not established in this review

**Present but disconnected or switched off**

- none found

**Not available**

- Custom-assistant directory: no route and no code found for custom assistants or custom GPT-style entries in apps/web/app, features, lib or shared
- /features/agents is a marketing page about CLI agents, not a directory (apps/web/app/features/agents/page.tsx:15-30)

## 4. Required behaviour

**Established requirements**

- A logged-out visitor can browse a public directory of skills (S2.16) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.16)
- A public gallery offers curated starting templates a visitor can preview and launch into chat (S2.17) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.17)
- A public directory lists custom assistants or agents a visitor can browse (S2.18, brief status missing) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.18)
- Each template has its own previewable, addressable page (S2.21) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.21)
- Artifacts in chat show real previews and the opened artifact works; unsupported formats are reported, not faked (source: doc: docs/product/competitive-guidance.md (items 38, 76, 80))

**Acceptance criteria**

1. Signed out, /skills shows built-in skills or a clear unreachable message
2. Signed in, /skills opens the Skills settings and not the public list
3. /gallery shows ten Inspiration cards for a signed-out visitor
4. Each Inspiration card has a /gallery/<id> page with a preview and Build one like it
5. Build one like it opens chat with the prompt in the composer
6. An unknown /gallery id returns 404
7. Yours and Shared with you appear only after sign-in

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A public custom-assistant directory needs a custom-assistant product concept first; none exists in the web code [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether S2.18 stays as a requirement
- [proposed] Add skill search and per-skill pages only if they are linked
- [proposed] Rename the example section or add real starter templates with fields

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Skills page | `apps/web/app/skills/page.tsx` | Chooses between Settings redirect and public list |
| component | SignedOutSkills | `apps/web/app/skills/SignedOutSkills.tsx` | Public skill list and sign-in surface |
| service | publicSkillSummary | `apps/web/app/skills/public-skill-summary.ts` | Shortens skill descriptions to one line of at most 160 characters |
| service | Managed skill catalogue | `apps/web/lib/services/skill-catalog-service.ts` | getManagedSkillCatalog returns executable, non-plugin skills |
| component | SettingsModalRedirect | `apps/web/features/settings/components/SettingsModalRedirect.tsx` | Opens the skills section for signed-in accounts |
| component | SignedOutSurface | `apps/web/shared/components/marketing/SignedOutSurface.tsx` | Shared signed-out layout with sign-in button |
| screen | Gallery page | `apps/web/app/gallery/page.tsx` | Metadata, header, footer and GalleryClient |
| component | GalleryClient | `apps/web/app/gallery/GalleryClient.tsx` | Scopes, search, filters, cards, drawer, wizard |
| config | Inspiration examples | `apps/web/app/gallery/inspiration.ts` | Ten example artifacts, findInspiration, inspirationPath |
| screen | Template page | `apps/web/app/gallery/[templateId]/page.tsx` | Static example page with Build one like it |
| component | TemplatePreview | `apps/web/app/gallery/[templateId]/TemplatePreview.tsx` | Renders the example with the shared artifact preview |
| hook | useSharedWithYou | `apps/web/app/gallery/use-shared-with-you.ts` | Loads artifacts shared with the signed-in user |
| hook | useArtifactIndex | `apps/web/features/chat/hooks/use-artifact-index.ts` | Account-wide artifact index for Yours |
| store | useArtifactsStore | apps/web/features/chat/stores/artifactsStore.ts (not found) (not found) | Local artifacts derived from opened conversations (path inferred from the import; not opened) |
| screen | Chat page with starter prompt | `apps/web/features/chat/pages/WebChatPage.tsx` | Reads starterPrompt and prefills the composer |
| config | Sitemap | `apps/web/app/sitemap.ts` | Lists /skills, /gallery and every example page |
| screen | Agents feature page | `apps/web/app/features/agents/page.tsx` | Marketing page; not a directory |
| test | Skills signed-out test | `apps/web/app/skills/__tests__/SkillsSignedOut.test.tsx` | Public list, outage and empty states, signed-in redirect |
| test | Gallery client test | `apps/web/app/gallery/GalleryClient.test.tsx` | Search, filters, empty states, shared tab |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The skills page checks identity on the server, falling back to signed out if identity is unreadable | our servers | apps/web/app/skills/page.tsx:20-27 |
| Signed out, it reads the managed skill catalogue and renders names with short summaries | our servers | apps/web/app/skills/page.tsx:29-36,54-58 |
| The gallery page renders client-side; Inspiration examples are built in; Yours merges the local store with the account index when signed in | device and our servers | apps/web/app/gallery/GalleryClient.tsx:1195-1235 |
| Example pages are generated at build time from the built-in list and render the preview in the browser | device | apps/web/app/gallery/[templateId]/page.tsx:15-17; TemplatePreview.tsx:6-17 |
| Build one like it navigates to /chat?starterPrompt=<text>; the chat page sets the composer text and cleans the address | device | apps/web/app/gallery/[templateId]/page.tsx:41-44; apps/web/features/chat/pages/WebChatPage.tsx:1322-1327 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Starter prompt text | In the address while navigating, then in the composer only; no row is created by this feature | no | Removed from the address after reading |
| Account artifact index rows (signed in) | Server database, read by the gallery (migration number 120 per the code comment) | Yes, account-wide | Owned by SYS-files-artifacts-and-storage |

**Models and providers.** No model is called by the pages. A started chat uses the visitor's chosen model and route after they reach the product; that belongs to SYS-chat-turn-pipeline.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None for the skill list, Inspiration cards and example pages; sign-in for Yours, Shared with you (also needs a verified email, apps/web/app/gallery/GalleryClient.test.tsx:444) and skill settings. |
| Permissions | Public pages; /skills and /apps read the session but are not gated (apps/web/proxy.ts:182-192). |
| Subscription | none found in the code for browsing; whether a signed-out visitor can send the prefilled chat or needs a plan is not established. |
| Limits and metering | none found in the code for these public views. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Web has no Local mode; nothing here runs locally. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Skill catalogue unreadable | 'The skill catalogue is temporarily unreachable. Reload in a moment.' | apps/web/app/skills/SignedOutSkills.tsx:36-41 |
| No built-in skills | 'No built-in skills are published right now.' | apps/web/app/skills/SignedOutSkills.tsx:42-46 |
| Identity unreadable | Treated as signed out and reported | apps/web/app/skills/page.tsx:20-27 |
| Gallery loading | Six skeleton cards | apps/web/app/gallery/GalleryClient.tsx:1604-1610 |
| Gallery empty | Empty message with New artifact; filters with no match show a clear action | apps/web/app/gallery/GalleryClient.tsx:1612-1650 |
| Shared list failed | Error with 'Try again' | apps/web/app/gallery/GalleryClient.tsx:1539; apps/web/app/gallery/GalleryClient.test.tsx:454 |
| Unknown template id | 404 page | apps/web/app/gallery/[templateId]/page.tsx:36-37 |
| Wizard cancel | Close wizard button returns to the gallery | apps/web/app/gallery/GalleryClient.tsx:729 |
| Offline or timeout | not handled in the code beyond the shared list retry | no other handling found |
| Accessibility | Scope group has an aria-label; search has an aria-label; cards are buttons | apps/web/app/gallery/GalleryClient.tsx:1479-1506 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/skills/__tests__/SkillsSignedOut.test.tsx`: Signed-out explanation in the first response, sign-up beside sign-in, built-in list, outage, empty list, signed-in redirect to the skills section, server component
- `apps/web/app/skills/__tests__/public-skill-summary.test.ts`: Summary shortening (contents not opened)
- `apps/web/app/skills/__tests__/skills-detail-route-orphan.test.ts`: No unlinked skills/[name] route; one skill source label projection
- `apps/web/app/gallery/GalleryClient.test.tsx`: Filter menu and New artifact order, search, scopes, empty states, type and date filters, card thumbnails, Shared with you tab, retry and paging
- `apps/web/app/gallery/[templateId]/TemplatePreview.test.tsx`: Both kinds of gallery example render
- `apps/web/app/gallery/use-shared-with-you.test.ts`: Shared-with-you hook (contents not opened)

**Test scenarios**

- **Signed-out skills**
  1. Open /skills in a private window
  - Expected: List of built-in skills with one-line summaries and a sign-in button
- **Signed-in skills**
  1. Sign in, open /skills
  - Expected: Settings opens on Skills
- **Gallery to chat**
  1. Open /gallery
  2. Open an Inspiration card
  3. Click Open page
  4. Click Build one like it
  - Expected: Chat opens with the prompt in the composer and the address cleaned
- **Unknown example**
  1. Open /gallery/does-not-exist
  - Expected: 404
- **New artifact wizard**
  1. Click New artifact
  2. Choose Games
  3. Answer the three steps and launch
  - Expected: Chat opens with the built prompt
- **Custom assistants**
  1. Search the site for a custom assistant directory
  - Expected: None exists (gap)

**Where to look when it fails**

- reportUnreadableIdentity log from /skills when identity cannot be read
- Skill catalogue load failure returns the unreachable state silently (no log in the page catch)
- Table behind the artifact index (migration 120)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/002-public-website-and-acquisition-screens.md](../../70-qa/test-plans/web/002-public-website-and-acquisition-screens.md)

## 10. Gaps and dependencies

- **S2.18 custom-assistant directory has no route or product concept in the web code** Affects: Web visitors. Evidence: No matches for custom assistant terms in apps/web app, features, lib, shared; apps/web/app/features/agents/page.tsx is CLI marketing. Work needed: Product decision, then a public route if the concept exists
- **Gallery 'templates' are sample artifacts, not starter templates; the page title says 'Artifacts built with AGI'** Affects: Visitors expecting templates. Evidence: apps/web/app/gallery/page.tsx:7-11; apps/web/app/gallery/inspiration.ts:1-10. Work needed: Align requirement wording or build real templates
- **Skill directory has no search or detail pages** Affects: Visitors browsing skills. Evidence: apps/web/app/skills/SignedOutSkills.tsx renders a plain ledger. Work needed: Add only if a use case needs it
- **No evidence that a signed-out visitor can send the prefilled prompt** Affects: Signed-out visitors using Build one like it. Evidence: /chat is exempt from the signed-out redirect (apps/web/proxy.ts:323-328) but sending rules were not reviewed. Work needed: Run the scenario signed out

**Depends on**

- surface:web
- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-authentication-and-identity
- file:apps/web/app/gallery/inspiration.ts
- file:apps/web/lib/services/skill-catalog-service.ts

## Unknown

- Whether a signed-out visitor can send the prefilled chat message
- Whether any custom-assistant concept exists in other apps or services (only the web app was searched)
- What the use-shared-with-you and summary tests check
- Exact store file path for the local artifacts store (taken from the import name)
- Which skills the managed catalogue currently holds
