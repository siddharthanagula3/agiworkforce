---
id: "F002-02"
type: "feature"
title: "Product pages for the chat, research, images, video and voice"
aliases: ["Features pages", "AGI Web page (/web)", "AI chat page", "Deep research page", "Image generation page", "Video generation page", "Voice page", "S2.02", "S2.03", "S2.06", "S2.07", "S2.08"]
area: "2 Public website and acquisition screens"
available_on: ["web"]
implementation: {web: "partial", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "seen working", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S2.02", "S2.03", "S2.06", "S2.07", "S2.08"]
depends_on: ["surface:web", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-voice-and-media", "SYS-shared-ui-and-design", "file:packages/contracts/types/src/billing-catalog.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F002-02 Product pages for the chat, research, images, video and voice

Public Web pages that explain one capability each: chat (/web and /features/ai-chat), deep research, image generation, video generation and voice. Each ends with a way to start (Open chat) and a link to the plan comparison. Image, video and voice pages exist in code, so the brief's 'missing' is stale.

Area: [2. Public website and acquisition screens](README.md). Requirement items: [S2.02](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s202), [S2.03](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s203), [S2.06](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s206), [S2.07](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s207), [S2.08](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s208).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built (this page lists unfinished parts) | partly built | seen working |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Presents chat, research, image, video and voice as public pages with metadata, an interface preview and calls to action: 'Open chat' to sign in, 'See plans' to the pricing comparison (apps/web/app/features/images/page.tsx:52-56).

**Why it exists.** Visitors compare against ChatGPT and Claude page by page; each capability needs a truthful explanation and an entry point (doc: docs/product/competitive-guidance.md section 5.1).

**Who uses it.** Prospective users on Web, search engines, and sales staff who share a link.

**Problems it solves**

- Visitors learn what a capability does and which plans include it before signing up
- Plan names on the pages come from the billing catalog, not typed text (apps/web/app/features/images/page.tsx:15-16)
- Claims stay honest: image generation is stated as a Cloud chat feature (apps/web/app/features/images/page.tsx:61-67)

**Use cases**

- A visitor reads /features/images, then clicks Open chat and signs in
- A buyer checks /features/video for the monthly video allowance and clicks See plans
- A visitor reads /features/voice to learn about dictation and voice mode
- A visitor reads /features/deep-research to see the plan, approve, cite flow

## 2. User experience

**Where to find it**

- Web: /web (nav item named from PRODUCT_NAMES.chat, apps/web/features/marketing/components/system/nav.ts), /features (nav item 'Features')
- Web: /features/ai-chat, /features/deep-research, /features/images, /features/video, /features/voice, linked from the features index (apps/web/app/features/page.tsx:131-146) and the site map page (apps/web/app/sitemap-page/page.tsx:99-101)
- Other apps: not applicable

**Before you start**

- None to read; an account to use the capability after clicking Open chat

**Screens and controls**

- Buttons 'Open chat' (to /login?redirectTo=%2Fchat on images, video and voice; webEntryHref('/chat') on deep research; WEB_ENTRY_HREF with label 'Open <chat name>' on ai-chat) and 'See plans' (to /pricing#pricing-compare-title)
- Closing section buttons 'See which plans include it' or 'See plans'
- Interface preview scene (non-interactive) on each page

**Journey**

1. Visitor opens the page from navigation or search
2. Reads the sections (for images: Create, limits, Revise)
3. Clicks Open chat; goes to sign-in with a return to chat
4. Or clicks See plans and lands on the plan comparison section

**What the person sees and gets**

- Static page with a title, description and share metadata
- Plan lists such as 'Included on <plans> plans' built from the billing catalog (apps/web/app/features/images/page.tsx:62-66)

**Settings**

- Voice page tells the reader that dictation and language are set in Settings, Voice (apps/web/app/features/voice/page.tsx:85-90); no settings on the pages themselves

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Image page at /features/images with metadata and a sitemap entry (apps/web/app/features/images/page.tsx:25-29; apps/web/app/sitemap.ts:54)
- Video page at /features/video (apps/web/app/features/video/page.tsx:34-38; apps/web/app/sitemap.ts:55)
- Voice page at /features/voice (apps/web/app/features/voice/page.tsx:34-38; apps/web/app/sitemap.ts:56)
- Deep research page at /features/deep-research (apps/web/app/features/deep-research/page.tsx:22-26)
- Chat pages at /web and /features/ai-chat (apps/web/app/web/page.tsx:25-31; apps/web/app/features/ai-chat/page.tsx:26-30)
- Image page's Open chat links to login with a redirect to the chat (apps/web/app/features/images/page.tsx:52)

**Incomplete**

- Status in the brief (web missing for S2.06-S2.08) is stale; the feature is partial only because the brief was not updated and no recorded human check exists

**Present but disconnected or switched off**

- none found: no flag hides these pages

**Not available**

- No page shows a live demo; previews are coded scenes (apps/web/app/features/images/page.test.tsx covers 'exposes no control a visitor could try to use')

## 4. Required behaviour

**Established requirements**

- A public page presents the general chat assistant with what it does and a way to start (S2.02) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.02)
- A public page presents deep research (cited reports) and how to use it (S2.03) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.03)
- Dedicated public pages present image generation, video generation and voice (S2.06, S2.07, S2.08) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.06, S2.07, S2.08)
- Demonstrations are authentic or labelled examples, not fake live activity or unsupported claims (source: doc: docs/product/competitive-guidance.md (section 5.1, item 3))
- Web search, memory, image generation and similar capabilities depend on a provider route or AGI harness and must not be described as intrinsic model capabilities (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. /features/images, /features/video and /features/voice return 200 with a title and one h1
2. Each page's Open chat button leads to sign-in and returns to /chat
3. Each See plans link lands on #pricing-compare-title
4. Plan names on image, video and deep research pages match the billing catalog
5. The three pages appear in the sitemap and the site map page
6. No page promises an unshipped capability

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Plan sentences should change when the billing catalog changes without editing the page [inferred from use of billingPlanCapabilityPlanLabels]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the area brief status of S2.06-S2.08 to done after a human check
- [proposed] Add a live, recorded demo only when it is real

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Image generation page | `apps/web/app/features/images/page.tsx` | Page with Create, bounds and Revise sections |
| screen | Video generation page | `apps/web/app/features/video/page.tsx` | Page with stages ledger and plan allowance |
| screen | Voice page | `apps/web/app/features/voice/page.tsx` | Dictation and voice mode sections |
| screen | Deep research page | `apps/web/app/features/deep-research/page.tsx` | Plan, approve, gather, cite, keep |
| screen | AI chat feature page | `apps/web/app/features/ai-chat/page.tsx` | Composer and reply explanation with Open chat |
| screen | Web product page | `apps/web/app/web/page.tsx` | Chat, projects, research product page |
| screen | Features index | `apps/web/app/features/page.tsx` | Links every feature page |
| config | Sitemap | `apps/web/app/sitemap.ts` | Lists the three media pages |
| screen | Site map page | `apps/web/app/sitemap-page/page.tsx` | Human-readable list including these pages |
| config | Navigation | `apps/web/features/marketing/components/system/nav.ts` | Product and Features nav items and WEB_ENTRY_HREF |
| service | buildMetadata | `apps/web/lib/seo/metadata.ts` | Page title, description and canonical path |
| config | Billing catalog | `packages/contracts/types/src/billing-catalog.ts` | Plan labels per capability used by the pages |
| component | ImageScene | `apps/web/features/marketing/components/scenes/ImageScene.tsx` | Non-interactive image preview |
| component | FeatureScenes | `apps/web/features/marketing/components/FeatureScenes.tsx` | Shared scenes for research and chat pages |
| test | Image page test | `apps/web/app/features/images/page.test.tsx` | Claims and sections |
| test | Video page test | `apps/web/app/features/video/page.test.tsx` | Plans and allowances |
| test | Voice page test | `apps/web/app/features/voice/page.test.tsx` | Voice page checks (contents not opened) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Visitor requests a feature page; it is rendered on the server with metadata | our servers | apps/web/app/features/images/page.tsx:25-29 |
| Plan and style text is computed from catalog modules at render time | our servers | apps/web/app/features/images/page.tsx:15-21 |
| Browser shows the page; Header reads the cookie to show the right buttons | device | apps/web/shared/components/layout/Header.tsx:11-19 |
| Click on Open chat navigates to /login?redirectTo=%2Fchat | device | apps/web/app/features/images/page.tsx:52 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No visitor data is created by these pages | none | no | not applicable |

**Models and providers.** No model or provider is called. Pages state that image and video generation run in Cloud chats and name the catalog plans; the image page draws the catalog image model name from the model catalog in its preview (apps/web/app/features/images/page.test.tsx:186).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None to read the pages. |
| Permissions | Public. |
| Subscription | Pages state which plans include image, video and deep research from the billing catalog and say the composer row shows Upgrade on other plans (apps/web/app/features/images/page.tsx:61-67). |
| Limits and metering | The pages describe allowances (video monthly allowance from the tier policy, apps/web/app/features/video/page.test.tsx:98); they enforce none. |
| Feature flags | none found in the code for these pages. |
| Model compatibility | none found in the code; the image preview names the catalog image model. |
| Provider restrictions | none found in the code. |
| Local mode | Pages describe Cloud chat for image generation; no Local mode statement found on the image page; Local is not offered on Web. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Signed in | Header shows Open chat; the page itself is not rewritten | apps/web/shared/components/layout/Header.tsx:11-19 |
| Plan catalog changes | Text follows the catalog; tests check no plan literals | apps/web/app/features/images/page.test.tsx:131-153 |
| Error boundary | The features folder has an error page | apps/web/app/features/error.tsx |
| Loading, empty, retry, offline, cancel | not handled in the code; the pages are static | no client fetch found in the page files |
| Accessibility | h1 is screen-reader only; sections use aria-labelledby ids | apps/web/app/features/images/page.tsx:42-49 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/features/images/page.test.tsx`: Sections, plan names from catalog, menu label, reference limit, no unshipped promises, scene preview and stylesheet rules
- `apps/web/app/features/video/page.test.tsx`: Heading, plans from catalog, monthly allowances, composer row names, no unshipped labels, previews
- `apps/web/app/features/voice/page.test.tsx`: Test file exists; contents not opened
- `apps/web/app/features/__tests__/features-page.test.ts`: Features index links existing pages only; image and video plan lists read from the catalog; no Local promise on Web
- `apps/web/__tests__/feature-page-claims.test.ts`: Feature page claims (contents not opened)
- `apps/web/app/__tests__/indexed-routes-have-titles.test.ts`: Indexed routes have titles (name only)

**Test scenarios**

- **Open each page**
  1. Visit /features/images, /features/video, /features/voice, /features/deep-research, /web, /features/ai-chat
  - Expected: Each loads with a title and a visible preview
- **Open chat path**
  1. Signed out, click Open chat on /features/images
  - Expected: Sign-in screen; after sign-in the chat opens
- **Plans link**
  1. Click See plans on /features/video
  - Expected: Pricing page scrolls to the comparison table
- **Claims match the product**
  1. Compare plan names on the page with the pricing table and the composer rows
  - Expected: Same plans; Upgrade row on others
- **Sitemap**
  1. Open /sitemap.xml and /sitemap-page
  - Expected: All three media pages listed

**Where to look when it fails**

- Next.js route 404 means the page file or its folder is missing
- Test failures in the page tests name the claim that drifted

**Hands-on test plans**

- Web: [70-qa/test-plans/web/002-public-website-and-acquisition-screens.md](../../70-qa/test-plans/web/002-public-website-and-acquisition-screens.md)

## 10. Gaps and dependencies

- **Brief marks S2.06-S2.08 missing though the pages exist** Affects: Planning and status reports. Evidence: apps/web/app/features/images/page.tsx; video/page.tsx; voice/page.tsx. Work needed: Update the brief and record a human check
- **Pages have no recorded human review of look and accuracy against the running product** Affects: Web visitors. Evidence: No file records a run. Work needed: Drive the pages and the real chat rows side by side
- **Feature pages are not listed in the main nav; reached via /features and the site map page** Affects: Web visitors. Evidence: grep of apps/web/features/marketing/components/system/nav.ts found no /features/images item. Work needed: Decide whether a nav entry is wanted

**Depends on**

- surface:web
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-voice-and-media
- SYS-shared-ui-and-design
- file:packages/contracts/types/src/billing-catalog.ts

## Unknown

- What the voice page test checks
- Which plans the catalog currently lists for each capability (read at render time)
- Whether the live product matches every statement on the pages
- Whether /features/ai-chat and /web are in the sitemap (not checked)
