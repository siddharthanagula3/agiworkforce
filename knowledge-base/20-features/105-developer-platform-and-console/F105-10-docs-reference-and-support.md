---
id: "F105-10"
type: "feature"
title: "Docs, reference and support"
aliases: ["API docs", "/api-docs", "OpenAPI bundle", "SDK documentation (S105.23)", "API reference (S105.24)", "Integration examples (S105.25)", "Migration guides (S105.26)", "Deprecation notices (S105.27)", "Support page", "Developer support (S105.28)"]
area: "105 Developer platform and console"
available_on: ["web", "desktop", "cli"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "partial", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S105.23", "S105.24", "S105.25", "S105.26", "S105.28"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "mode:cloud", "SYS-api-and-contracts", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "api:GET /api/llm/v1/models", "api:POST /api/llm/v1/chat/completions", "file:apps/web/public/openapi.json", "plan:pro", "F105-09", "F105-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F105-10 Docs, reference and support

Public web pages describe the managed gateway: credentials and scopes, code samples in curl, Python and TypeScript, webhooks, migration from the OpenAI and Anthropic formats, model retirements and an OpenAPI file. A support page lists channels and response terms by plan. The CLI can send bug reports and a diagnostics file.

Area: [105. Developer platform and console](README.md). Requirement items: [S105.23](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10523), [S105.24](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10524), [S105.25](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10525), [S105.26](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10526), [S105.28](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10528).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** /api-docs explains authentication, scopes, code, webhooks, migration, deprecations and reference (apps/web/app/api-docs/page.tsx:164-398). /openapi.json is the machine description. /support lists the help centre and email, response terms by plan, and a ticket path (apps/web/app/support/page.tsx:59-122).

**Why it exists.** A developer who points an existing client at the gateway needs exact credentials, scopes and differences from the original format. A support page states honestly what help exists (it says there is no 24/7 coverage, support/page.tsx:34).

**Who uses it.** Developers and evaluators, signed in or not [inferred: public pages with no auth call], and support-seeking customers.

**Problems it solves**

- Which credential works on which endpoint.
- How to keep an OpenAI-style client working.
- Which models are leaving and when.
- Who to contact and what response to expect.

**Use cases**

- Copy a curl sample and run it with an API key.
- Follow 'From the Anthropic API' to map tools and messages.
- Read the scheduled model retirements before pinning a model.
- Open /support, then raise a ticket from Settings, Help.

## 2. User experience

**Where to find it**

- Web: /api-docs; sections #quickstart, #sdks, #webhooks, #migrating, #deprecations, #reference (apps/web/app/api-docs/page.tsx:185, :215, :247, :280, :342, :374).
- Web: /openapi.json, linked from the hero button 'OpenAPI bundle' and the console Reference card (page.tsx:179; DeveloperConsolePage.tsx:49-96).
- Web: /support (apps/web/app/support/page.tsx).
- Web: Developer console Reference card with links API docs, Migration guides, Webhooks, Deprecations, Models, Usage (DeveloperConsolePage.tsx:16-47).
- Desktop: the public pages are web pages; the desktop shows the hosted web app (doc: AGENTS.md section 5). Opening them inside desktop was not run.
- CLI: slash commands /bug and /feedback (apps/cli/src/claude_parity.rs:194-212), agi doctor --export (apps/cli/src/lib.rs:7474-7490), and error hints that point to https://.../support (apps/cli/src/errors.rs:1578-1583).

**Before you start**

- API docs and support pages: none found in the code (no sign-in check in the page files).
- To raise a ticket: an account (support page text, apps/web/app/support/page.tsx:107-110).
- To run the samples: an AGI API key with the right scope, which needs plan:pro or above (page.tsx:200-212 text; billing-catalog.ts:358).

**Screens and controls**

- Hero with buttons 'OpenAPI bundle' and 'Authentication and scopes' (page.tsx:176-181).
- Tabbed code blocks: Session token and API key (credentials), Python and TypeScript (SDK), plus HTTP and webhook tabs (page.tsx:52-132).
- Support page buttons: 'Email a bug report', 'Raise a ticket', 'Check service status', 'Open the contact page', and hero 'Browse the help index' (support/page.tsx:79-122).

**Journey**

1. Open /api-docs and read Quick start for the credential and scope table.
2. Copy a sample from the tabs and run it.
3. Read #migrating if coming from another provider's format.
4. Check #deprecations for retirement dates.
5. If stuck, open /support and use email or 'Raise a ticket' (/settings/help).

**What the person sees and gets**

- Static pages with live values: retirement list, webhook timeout and retry days, plan labels for managed API (page.tsx:48-49, :187-212, :262-264, :352-372).
- Support table 'Support by tier' with rows Local / BYOK, individual plans, Team, Enterprise, Premium support add-on (apps/web/features/marketing/components/pages/company/support-content.ts:15-40).
- CLI: '/bug' replies with usage text when empty (apps/cli/src/cloud/feedback.rs:35).

**Settings**

- Page cache: revalidate 3600 seconds (page.tsx:36).
- None for the user.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- API docs page renders all sections from code and a samples file (apps/web/app/api-docs/page.tsx:164-398; apps/web/content/api-docs/code-samples.json).
- Retirements come from listScheduledModelRetirements (page.tsx:165; apps/web/lib/developer-api/model-retirements.ts:9).
- OpenAPI bundle is a static file with 30 paths (apps/web/public/openapi.json).
- Support page shows channels, tiers and bug-report guidance (apps/web/app/support/page.tsx:59-122; support-content.ts).
- Tickets are created through /api/support/tickets (apps/web/features/support/lib/ticket-client.ts:1-20; apps/web/app/api/support/tickets/route.ts).
- CLI feedback posts to /api/feedback (apps/cli/src/cloud/feedback.rs:5) and doctor export posts the report shape to /api/support/diagnostics (apps/cli/src/diagnostics_bundle.rs:11).

**Incomplete**

- The OpenAPI bundle covers the gateway and account endpoints but not /api/developers/* management routes or /api/plugins (grep of openapi.json).
- The brief marks CLI support unverified; the CLI has /bug, /feedback and doctor export but no command that opens a ticket thread (grep of apps/cli/src found none).
- Product docs under docs/product that mention developer pages were not opened.

**Present but disconnected or switched off**

- none found: no switch for the pages was found.

**Not available**

- An AGI SDK: the page says none exists and points to the official libraries of the OpenAI chat format (page.tsx:215-235).
- A Postman collection (page.tsx:380-384).
- Responses, Assistants, Batch, Files, Images and fine-tuning endpoints (page.tsx:318-324 text).

## 4. Required behaviour

**Established requirements**

- There is documentation for official client SDKs. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.23)
- A published API reference documents every public endpoint, credential and scope. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.24)
- Docs include copyable examples in curl, Python and TypeScript. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.25)
- Developers get migration guides for API or model changes and from other providers. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.26)
- Developers are told ahead of time when a model or API is deprecated. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.27)
- Developers have a support channel reachable from the product. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.28)
- The docs must not advertise an SDK while every package is private; the bundle it links to must be served. (source: apps/web/app/api-docs/__tests__/api-docs-metadata.test.ts:72-87)
- The support page claims no 24/7 coverage and no response-time commitment below Team. (source: apps/web/app/support/page.tsx:34; support-content.ts:15-30)

**Acceptance criteria**

1. /api-docs loads without sign-in and shows the six section links.
2. The Session token and API key tabs list the same paths and scopes as the OpenAPI bundle.
3. Every gateway path named on the page exists in /openapi.json.
4. Copying a sample and running it with a valid key returns a response.
5. Deprecations lists each scheduled retirement with a date, or says none are scheduled.
6. /support states Team and Enterprise response targets and 'no commitment' for other plans.
7. The SDK section says there is no AGI SDK.
8. The webhook section's timeout and retry days match F105-09 constants.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The page values for timeout and retry days stay correct because they are imported, not typed (page.tsx:262-264).
- [inferred] The brief's line for S105.27 is 'done' on web and api: model listing carries deprecation_date (models route lines 104 per brief).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the developer-console management routes to the OpenAPI bundle or state that they are session-only.
- [proposed] Add a CLI command that links to /support with the current version attached.
- [proposed] Fix the stale 2026-08-06 decision row that says json_schema is refused, now that docs and code enforce it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | /api-docs page | `apps/web/app/api-docs/page.tsx` | Public docs page |
| config | code samples | `apps/web/content/api-docs/code-samples.json` | curl, Python, TypeScript sample text with placeholders |
| service | model retirements | `apps/web/lib/developer-api/model-retirements.ts` | Scheduled retirements shown on the page |
| service | webhook constants | `apps/web/lib/developer-api/webhook-events.ts` | Events, timeout, retry days shown in docs |
| other | OpenAPI bundle | `apps/web/public/openapi.json` | Machine-readable reference, 30 paths |
| config | API key scopes | `apps/web/lib/api-key-scopes.ts` | models:read, inference:write, usage:read |
| screen | /support page | `apps/web/app/support/page.tsx` | Channels, tiers, bug guidance, buttons |
| config | support rows | `apps/web/features/marketing/components/pages/company/support-content.ts` | Support by tier table |
| service | ticket client | `apps/web/features/support/lib/ticket-client.ts` | Browser calls for tickets and diagnostics |
| endpoint | /api/support/tickets | `apps/web/app/api/support/tickets/route.ts` | Create and list tickets |
| component | HelpSection | `apps/web/features/settings/sections/HelpSection.tsx` | Settings, Help entry |
| component | DeveloperConsolePage Reference card | `apps/web/features/developers/components/DeveloperConsolePage.tsx` | Links to docs, models, usage and the bundle (lines 16-96) |
| command | /bug and /feedback | `apps/cli/src/claude_parity.rs` | Slash handler (lines 194-212) |
| service | CLI feedback client | `apps/cli/src/cloud/feedback.rs` | POST /api/feedback with version and platform |
| command | agi doctor --export | `apps/cli/src/lib.rs` | Writes a diagnostics file to attach to support (lines 7474-7490) |
| service | diagnostics bundle | `apps/cli/src/diagnostics_bundle.rs` | Shape posted to /api/support/diagnostics |
| service | CLI support hint | `apps/cli/src/errors.rs` | Points limit errors to /support (line 1580) |
| config | plan capability tiers | `packages/contracts/types/src/billing-catalog.ts` | managed_api tiers shown on the page (line 358) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The server renders /api-docs, filling placeholders with the site URL and reading retirements, plan labels and webhook values, and caches for one hour. | our servers | apps/web/app/api-docs/page.tsx:36, :44-49, :164-166 |
| The browser shows tabs; copying uses the person's clipboard. | device | apps/web/app/api-docs/page.tsx:52-132 (CodeTabs); copy behaviour not opened |
| A sample run is a request from the developer's own machine to the gateway with their key. | device and our servers | apps/web/app/api-docs/page.tsx:175 hero sample; routes in apps/web/app/api/llm/v1 |
| Raising a ticket from Settings, Help sends the ticket and diagnostics to our servers. | device and our servers | apps/web/features/support/lib/ticket-client.ts:1-20; support/page.tsx:107-110 |
| The CLI /bug posts a message with version and platform to /api/feedback. | device and our servers | apps/cli/src/cloud/feedback.rs:5-30 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Docs content | Source files and static JSON in the web app | Deployed with the web app | Versioned in git |
| Support tickets and replies | Server (ticket routes); table not opened | Server only | unknown |
| CLI diagnostics file | Current directory on the device, written by agi doctor --export | Only if the user attaches it | The user deletes it |

**Models and providers.** Docs name no provider. The model list and retirement dates come from the model catalog through listScheduledModelRetirements and GET /models (page.tsx:165, :335-339). Which provider serves a request is not described on the page.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found for reading the public pages. A ticket needs an account (support/page.tsx:107-110). |
| Permissions | none found in the code |
| Subscription | Pages are open to every plan. Content describes plan gating: API keys need managed_api tiers (plan:pro, plan:max, plan:max_15x, plan:team, plan:team_premium, plan:enterprise); a key on other plans is refused with managed_api_plan_required (page.tsx:200-212; request-surface.ts:59-63). Support terms by plan: Team and Enterprise have response targets; plan:free, plan:basic, plan:pro, plan:max, plan:max_15x have none (support-content.ts:15-40). |
| Limits and metering | none found for the pages. Sample calls use the gateway limits described in F105-08. |
| Feature flags | none found in the code |
| Model compatibility | Docs state the gateway speaks the OpenAI chat format and lists which parameters are passed or ignored (page.tsx:297-308). |
| Provider restrictions | Docs say bring-your-own-key use on listed surfaces never touches this gateway (page.tsx:212 via BYOK_SURFACES). |
| Local mode | Pages are web pages and need a network. The CLI /bug and /feedback post to our servers; whether they are refused in Local mode was not checked (feedback.rs uses CloudClient; admission rule not opened). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No scheduled retirements | Page says 'No model retirements are scheduled.' | page.tsx:366-371 |
| Phone-opened support page | A shorter page without the tier table. | support/page.tsx:60-62, :87-95; apps/web/app/support/__tests__/SupportFromPhone.test.tsx |
| Stale cache | Docs refresh at most hourly. | page.tsx:36 |
| Plan without API access | Docs say the console issues no keys and existing keys are refused. | page.tsx:208-212 |
| Offline | not handled in the code (static pages). | not found |
| Accessibility | Sections use labelledby headings and a main landmark with a skip target. | page.tsx:170, :185-187 |
| Ticket failure or empty | not opened (support client tests exist by name). | apps/web/features/support/__tests__/support-client.test.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api-docs/__tests__/api-docs-credential-claims.test.ts`: Gateway paths named on the page exist in the bundle; credit balance path; embeddings is the only session-only operation; chat completions is not session-only; the page says which operation refuses a key
- `apps/web/app/api-docs/__tests__/api-docs-metadata.test.ts`: No SDK is advertised while packages are private; links to and serves the bundle; does not promise the bundle for a future launch
- `apps/web/app/support/__tests__/SupportFromPhone.test.tsx`: name only; not opened
- `apps/web/features/settings/sections/__tests__/HelpSection.test.tsx`: Help rows open where their icon says, link without query strings, Report a bug lands on the bugs section
- `apps/web/features/support/__tests__/support-client.test.ts`: name only; not opened

**Test scenarios**

- **Docs match bundle**
  1. Open /api-docs.
  2. List every path in the credential tabs.
  3. Compare with /openapi.json.
  - Expected: Each path and scope appears in the bundle.
- **Run a sample**
  1. Create a key with inference:write.
  2. Copy the curl sample and run it.
  - Expected: A chat completion response arrives.
- **Retirement list**
  1. Open #deprecations.
  - Expected: Dates match GET /models deprecation_date for the same ids.
- **Support terms**
  1. Open /support.
  - Expected: Table rows match support-content.ts; the page says no 24/7 coverage.
- **Raise a ticket**
  1. Signed in, press 'Raise a ticket'.
  - Expected: Settings, Help opens and a ticket can be created.
- **CLI bug report**
  1. In a managed CLI session run /bug something broke.
  - Expected: The CLI reports the message was sent, or a clear refusal.

**Where to look when it fails**

- Next build output for the /api-docs route; revalidate 3600.
- api-docs tests failing name the missing path.
- CLI: feedback errors from cloud::feedback (apps/cli/src/cloud/feedback.rs).
- Network tab for /api/support/tickets.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/105-developer-platform-and-console.md](../../70-qa/test-plans/web/105-developer-platform-and-console.md)
- Desktop: [70-qa/test-plans/desktop/105-developer-platform-and-console.md](../../70-qa/test-plans/desktop/105-developer-platform-and-console.md)
- CLI: [70-qa/test-plans/cli/105-developer-platform-and-console.md](../../70-qa/test-plans/cli/105-developer-platform-and-console.md)

## 10. Gaps and dependencies

- **Bundle does not cover the developer-console routes.** Affects: Developers. Evidence: openapi.json has no /developers or /plugins paths. Work needed: Add or declare them session-only.
- **CLI support is partial: feedback and diagnostics exist, no ticket path.** Affects: CLI users. Evidence: claude_parity.rs:194-212; lib.rs:7474-7490. Work needed: Verify behaviour, then decide on a ticket link.
- **Decision doc says json_schema is refused while docs and code enforce it.** Affects: Anyone reading the decision doc. Evidence: docs/decisions/wire-or-cut.md section 2026-08-06 vs openapi.json:726. Work needed: Update the decision doc.
- **Sample correctness is not tested by running them.** Affects: Developers. Evidence: Tests check paths and claims only. Work needed: Add a test that runs or lints each sample.
- **Desktop behaviour of these pages was not run.** Affects: Desktop users. Evidence: Brief says done; no desktop code. Work needed: Open them in the desktop app.

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- mode:cloud
- SYS-api-and-contracts
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- api:GET /api/llm/v1/models
- api:POST /api/llm/v1/chat/completions
- file:apps/web/public/openapi.json
- plan:pro
- F105-09
- F105-08

## Unknown

- What the sample text in code-samples.json contains beyond placeholders (not opened).
- Whether /bug and /feedback work in Local mode.
- Where support tickets are stored and how long.
- Whether the ticket route needs authentication (not opened).
- Whether docs/product files describe these pages.
- Whether the docs and support pages render correctly inside the desktop app.
