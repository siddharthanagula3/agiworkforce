---
id: "F002-01"
type: "feature"
title: "Product entry and sign-in redirect"
aliases: ["Home page", "Site root", "Marketing landing", "Signed-in rewrite", "AGI Work entry page (/agi-work)", "AGI Code entry page (/agi-code)", "S2.01", "S2.04", "S2.05"]
area: "2 Public website and acquisition screens"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "seen failing", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S2.01", "S2.04", "S2.05"]
depends_on: ["surface:web", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "file:apps/web/proxy.ts", "file:packages/platform/identity/src/session-cookie.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F002-01 Product entry and sign-in redirect

The Web home page (/) and the two entry pages /agi-work and /agi-code. A signed-out visitor sees a marketing page with Try chat, Sign in and a desktop link. A visitor with a browser session cookie is rewritten to the product (/chat or /code) at the same address.

Area: [2. Public website and acquisition screens](README.md). Requirement items: [S2.01](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s201), [S2.04](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s204), [S2.05](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s205).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen failing |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows the public home page and the Work and Code entry pages to signed-out visitors. For a visitor whose browser holds a session cookie, the web proxy swaps the marketing page for the product page without changing the address bar: / and /agi-work show the chat root, /agi-code shows the cloud code page (apps/web/proxy.ts:124-134, 208-210). It also decides which routes load the browser identity provider, so public pages stay light (apps/web/app/BrowserIdentityBoundary.tsx:8-19).

**Why it exists.** The product must work like the leaders: a returning user lands in the product, a new visitor gets a pitch and a way in. The proxy comment says a signed-in visitor gets the surface instead of the pitch for it (apps/web/proxy.ts:96-104).

**Who uses it.** New visitors on Web, returning signed-in users who type the site address, and search or campaign traffic that lands on /agi-work or /agi-code.

**Problems it solves**

- A signed-in user is not shown a sales page when opening the site
- A signed-out visitor has a clear route to sign in, try chat or check desktop availability
- Public pages do not download the identity script unless the route needs it (apps/web/lib/identity/browser-provider-routes.ts:30-34)

**Use cases**

- A returning user opens the site root and lands in chat
- A visitor clicks Try chat on the home page and is sent to /login with a return to /
- A visitor on /agi-work clicks Open Work and signs in, then returns to Work mode
- A signed-in developer opens /agi-code and sees the cloud code page

## 2. User experience

**Where to find it**

- Web: site root /
- Web: /agi-work (nav label from PRODUCT_NAMES.work, apps/web/features/marketing/components/system/nav.ts, Products group)
- Web: /agi-code (nav label from PRODUCT_NAMES.code, same group)
- Desktop, Mobile, CLI, VS Code, Chrome: not applicable; the Desktop window shows the hosted web app, so it shows these routes only as the web does (AGENTS.md section 5)

**Before you start**

- None for the marketing view
- A browser session cookie (Clerk __client_uat nonzero, or a __session cookie when __client_uat is absent) for the rewrite (packages/platform/identity/src/session-cookie.ts:16-20)

**Screens and controls**

- Home hero buttons: 'Try chat' (to /login?redirectTo=%2F) and a desktop call to action that reads 'Check Desktop availability' while Desktop is Coming soon (apps/web/features/marketing/components/MarketingLanding.tsx hero ctas; apps/web/lib/surface-status.ts surfaceCta)
- Header signed out: 'Sign in', 'Try chat', 'Contact sales'; signed in: 'Open chat' (apps/web/features/marketing/components/system/MarketingHeader.tsx:62-75)
- /agi-work buttons: 'Open <Work name>' to /login?redirectTo=%2Fagi-work, and a secondary button to /tasks (apps/web/app/agi-work/page.tsx:72-76)
- /agi-code buttons: 'See the CLI', 'See the VS Code extension', and the VS Code surface call to action, which is 'Get notified' (/download#notify) while VS Code is Coming soon (apps/web/app/agi-code/page.tsx; apps/web/lib/surface-status.ts)

**Journey**

1. Visitor opens / (or /agi-work, /agi-code)
2. The web proxy runs identity session middleware for these paths (apps/web/proxy.ts:208-210)
3. With no session cookie the marketing page renders
4. Visitor clicks Try chat or Open Work and goes to /login with a redirectTo value
5. After sign-in the visitor returns to the requested path; with the cookie now present the proxy rewrites it to the product
6. With a cookie, / and /agi-work render the chat page; /agi-work sets Work mode from the x-agi-pathname header (apps/web/app/chat/page.tsx:8-20); /agi-code renders the cloud code page

**What the person sees and gets**

- Marketing page with sections for the six surfaces and their availability status
- Address bar keeps the marketing path after the rewrite (apps/web/proxy.ts:96-104)
- When the identity provider is not configured, / answers a 503 JSON error 'Authentication is unavailable' (apps/web/proxy.ts:228-235)

**Settings**

- No user settings
- Server configuration: identity authorized-party allowlist; if it cannot be resolved the identity proxy is disabled and / answers 503 (apps/web/proxy.ts:196-218)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Rewrite of / and /agi-work to /chat and /agi-code to /code only when the session cookie is present; otherwise the page passes through with a CSP header (apps/web/proxy.ts:105-134)
- Cookie test follows Clerk's convention: __client_uat empty or 0 means signed out; if the cookie is absent, a __session cookie counts (packages/platform/identity/src/session-cookie.ts:5-20)
- The Work path sets initial Work mode through the x-agi-pathname request header (apps/web/proxy.ts:108-112; apps/web/app/chat/page.tsx:8-20)
- The browser identity provider mounts lazily and only for product, auth and listed public prefixes, also when a route is a rewrite target (apps/web/app/BrowserIdentityBoundary.tsx:8-19; apps/web/lib/identity/browser-provider-routes.ts:6-45)
- Header reads the cookie after mount and swaps Sign in / Try chat for Open chat (apps/web/shared/components/layout/Header.tsx:11-19)

**Incomplete**

- The rewrite decides on cookie presence only; what a visitor sees when the cookie is present but the session is expired or invalid is not established in this review

**Present but disconnected or switched off**

- Landing text for Desktop, CLI, Mobile, VS Code and Chrome shows 'Coming soon' because every surface except Web is set to Coming soon in the status registry (apps/web/lib/surface-status.ts:6-13)

**Not available**

- Desktop, Mobile, CLI, VS Code and Chrome apps have no equivalent entry page of their own; they are not part of this feature

## 4. Required behaviour

**Established requirements**

- A visitor to / sees a product homepage with sign-in, try and download calls to action; a signed-in visitor lands in the product without error (S2.01) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.01)
- A public page presents agentic work and a way to start; signed-in visitors reach the product without error (S2.04) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.04)
- A public page presents the coding agent and how to get it (S2.05) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.05)
- Marketing navigation, download paths and account entry points are benchmarked against the leaders; first-run intent is preserved (source: doc: docs/product/competitive-guidance.md (section 5.1, items 2 and 5))
- The public Desktop shows the hosted web app, so a change to web routes reaches Desktop (source: doc: AGENTS.md section 5)

**Acceptance criteria**

1. With no session cookie, GET / returns the marketing page and no rewrite header
2. With __client_uat set to 0, GET / still returns the marketing page
3. With a nonzero __client_uat, GET / is rewritten to /chat and the address stays /
4. With a session cookie, /agi-work is rewritten to /chat in Work mode and /agi-code to /code
5. Signed out, the header shows Sign in and Try chat; signed in, it shows Open chat
6. The identity script is not loaded on / for a signed-out visitor

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A signed-in visitor should never see a flash of an error page when the rewrite target needs a valid session [inferred from S2.01 'without error']

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide and test the behaviour for a present but expired session cookie on /, /agi-work and /agi-code
- [proposed] Render the header sign-in state on the server to avoid the signed-out buttons showing briefly before the cookie is read

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Web proxy | `apps/web/proxy.ts` | Rewrites /, /agi-work, /agi-code for a signed-in cookie; redirects signed-out product routes; builds CSP |
| service | hasBrowserSessionCookie | `apps/web/lib/session-cookie.ts` | Thin wrapper for the cookie test used by the proxy and the header |
| service | clerkHasBrowserSessionCookie | `packages/platform/identity/src/session-cookie.ts` | Defines signed-in as a nonzero __client_uat or a __session cookie |
| component | BrowserIdentityBoundary | `apps/web/app/BrowserIdentityBoundary.tsx` | Mounts the lazy identity provider only for routes that need it |
| config | browser-provider-routes | `apps/web/lib/identity/browser-provider-routes.ts` | List of identity-aware public prefixes and the route test |
| config | product-routes | `packages/contracts/types/src/product-routes.ts` | Product, auth and shell route prefixes shared by the proxy and the desktop shell |
| screen | Home page | `apps/web/app/page.tsx` | Metadata and MarketingLanding for / |
| component | MarketingLanding | `apps/web/features/marketing/components/MarketingLanding.tsx` | Hero, surface index, capability and trust sections with the Try chat call to action |
| component | MarketingHeader | `apps/web/features/marketing/components/system/MarketingHeader.tsx` | Sign in, Try chat, Open chat buttons |
| component | Header | `apps/web/shared/components/layout/Header.tsx` | Reads document.cookie after mount to pass signedIn to the header |
| config | nav and entry links | `apps/web/features/marketing/components/system/nav.ts` | WEB_ENTRY_HREF, sign-in href helpers, product nav items |
| screen | Work entry page | `apps/web/app/agi-work/page.tsx` | Marketing page for Work with Open Work button |
| screen | Code entry page | `apps/web/app/agi-code/page.tsx` | Marketing page for the CLI and VS Code stack |
| screen | Chat root page | `apps/web/app/chat/page.tsx` | Reads x-agi-pathname to start in Work mode |
| screen | Cloud code page | `apps/web/app/code/page.tsx` | Rewrite target for /agi-code; not indexed |
| config | surface status registry | `apps/web/lib/surface-status.ts` | Coming soon / Available now labels and surfaceCta |
| config | auth route helpers | `apps/web/features/auth/authRoutes.ts` | Builds /login and /signup URLs with the redirectTo parameter |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser requests /, /agi-work or /agi-code; the proxy matcher covers these paths | our servers | apps/web/proxy.ts:208-210, 370-378 |
| Identity session middleware runs, then the handler checks the cookie | our servers | apps/web/proxy.ts:208-218; packages/platform/identity/src/session-cookie.ts:16-20 |
| With a cookie the request is rewritten to /chat or /code, with the original path in the x-agi-pathname header; without it the page passes through with a CSP nonce | our servers | apps/web/proxy.ts:105-122 |
| The page renders; the chat page reads the header to choose Work mode | our servers | apps/web/app/chat/page.tsx:8-20 |
| In the browser the header reads document.cookie and shows the right buttons; the identity provider loads only if the route needs it | device | apps/web/shared/components/layout/Header.tsx:11-19; apps/web/app/BrowserIdentityBoundary.tsx:8-19 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Session cookies (__client_uat, __session) | Visitor's browser, set by the identity provider | Not synced by this feature | Owned by SYS-authentication-and-identity; this feature only reads them |

**Models and providers.** No model or provider is called by this feature. Identity is provided by the identity adapter (Clerk); AI models take part only after the visitor reaches the product.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account for the marketing view; a session cookie for the product rewrite. |
| Permissions | Public. Product routes behind the rewrite are protected separately: signed-out access to a product route is redirected to sign-in (apps/web/proxy.ts:323-328). |
| Subscription | none found in the code; the pages do not check a plan. |
| Limits and metering | none found in the code for these pages. |
| Feature flags | No feature flag found. Server configuration for the identity allowlist can disable the identity proxy (503) (apps/web/proxy.ts:196-218). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Web has no Local mode; these pages never run local inference. The Desktop window shows the same hosted routes. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Signed out | Marketing page; no rewrite | apps/web/__tests__/proxy-public-route.test.ts:154-170 |
| __client_uat is 0 or an anonymous dev-browser cookie | Treated as signed out | apps/web/__tests__/proxy-public-route.test.ts:162-196 |
| Identity not configured | 503 JSON 'Authentication is unavailable: no authorized-party allowlist is configured.' | apps/web/proxy.ts:228-235 |
| Cookie present but session invalid | not handled in the code reviewed for the rewrite; outcome unknown | apps/web/proxy.ts:105-122 checks presence only |
| Loading before cookie is read in the browser | Header first renders the signed-out buttons, then updates after mount | apps/web/shared/components/layout/Header.tsx:12-19 |
| Embedded page | Header is hidden when the page is embedded | apps/web/shared/components/layout/Header.tsx:16-17 |
| Offline, retry, cancel, timeout | not handled in the code for these static entry pages | no handling found in apps/web/app/page.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/proxy-public-route.test.ts`: / with no cookie, with __client_uat 0, with a nonzero value; /agi-work and /agi-code rewrites and pass-through; public pages outside session middleware
- `apps/web/app/BrowserIdentityBoundary.test.tsx`: Identity provider mounts or not for routes, including rewrites
- `apps/web/lib/identity/browser-provider-routes.test.ts`: Route segment matching and which routes mount identity
- `packages/platform/identity/src/__tests__/session-cookie.test.ts`: Cookie signed-in rule
- `apps/web/app/page.test.tsx`: Home page renders one main landmark and an AGI heading, and offers no free image or video
- `apps/web/shared/components/layout/Header.test.tsx`: Header states (contents not opened in this review)

**Test scenarios**

- **Signed-out home**
  1. Open / in a private window
  2. Click Try chat
  - Expected: Marketing page shows; the click goes to /login?redirectTo=%2F
- **Signed-in rewrite**
  1. Sign in
  2. Open / in the same browser
  - Expected: Chat shows with address /; no error
- **Work entry**
  1. Signed in, open /agi-work
  - Expected: Chat shows in Work mode at /agi-work
- **Code entry**
  1. Signed in, open /agi-code
  2. Then signed out, open /agi-code
  - Expected: Signed in: cloud code page; signed out: marketing page with CLI and VS Code buttons
- **Expired session**
  1. Keep the cookie but invalidate the session server side
  2. Open /
  - Expected: Unknown; record the result (gap)

**Where to look when it fails**

- Response header x-middleware-rewrite shows the rewrite target
- Error text 'Authentication is unavailable' means the identity allowlist is missing
- Log helper reportUnreadableIdentity for pages that read identity (apps/web/app/skills/page.tsx)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/002-public-website-and-acquisition-screens.md](../../70-qa/test-plans/web/002-public-website-and-acquisition-screens.md)

## 10. Gaps and dependencies

- **Behaviour for a present but invalid session cookie is not tested or documented** Affects: Returning users on Web. Evidence: apps/web/proxy.ts:105-122 decides on presence only. Work needed: Run the scenario, then add a test and a recovery rule
- **Header shows signed-out buttons until the cookie is read after mount** Affects: Signed-in visitors on every public page. Evidence: apps/web/shared/components/layout/Header.tsx:12-19. Work needed: Decide whether to accept it or pass signed-in state from the server
- **No end-to-end test drives the real sign-in and rewrite; only unit tests with a mocked identity layer are found** Affects: Release confidence. Evidence: apps/web/__tests__/proxy-public-route.test.ts uses a mocked clerk state. Work needed: Human-style run with a seeded account

**Depends on**

- surface:web
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- file:apps/web/proxy.ts
- file:packages/platform/identity/src/session-cookie.ts

## Unknown

- What a visitor sees with a present but expired session cookie
- Whether the rewrite target /code works for every signed-in account (plan or workspace restrictions on /code not reviewed)
- Whether any end-to-end browser test exists for this path
- Exact line of the Try chat and Desktop buttons in MarketingLanding (read from the hero ctas prop, not by line)
