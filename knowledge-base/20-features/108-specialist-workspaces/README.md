---
id: "AREA-108"
type: "area"
title: "Specialist workspaces"
features: ["F108-01", "F108-02", "F108-03", "F108-04", "F108-05", "F108-06", "F108-07", "F108-08", "F108-09", "F108-10", "F108-11", "F108-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 108. Specialist workspaces

Specialist workspaces give a person focused tools for one field of life or work: money, health records, legal and contract work, research with cited sources, study, sales, support, HR, marketing, shopping and travel. Most of the brief's 35 items are not built yet. Built today: the bank-accounts dashboard (web), the Health space (web, partly), deep research with cited reports (all apps), Study mode (web and mobile), and skill-driven business workflows. Each area is a separate feature, and some of them carry legal limits (US only, not in organisation workspaces, owner sign-offs still pending) that the product must enforce.

**Who uses it.** Every signed-in person for Study mode (no plan check found in apps/web/app/api/study/sessions/route.ts). Paid plans only for linked bank accounts (connectors capability: PAID_TIERS, packages/contracts/types/src/billing-catalog.ts:351). Deep research only on Pro and higher plans (PRO_TIERS, billing-catalog.ts:354-355) and never on a free-trial turn (apps/web/app/api/llm/v1/chat/completions/route.ts:567). The Health space only for an individual, in the United States, not inside an organisation workspace (apps/web/lib/services/health-space-service.ts:23-29). Workspace admins: no admin-only control for these features was found. Developers: the skill files under .agents/skills define the business workflows.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F108-01](F108-01-bank-accounts-and-spending-dashboard.md) | Bank accounts and spending dashboard | partly | partly | partly | n/a | n/a | no |
| [F108-02](F108-02-budgets-net-worth-credit-and-financial-document-ex.md) | Budgets, net worth, credit and financial document explanation (not built) | no | no | no | n/a | n/a | no |
| [F108-03](F108-03-deep-research-workspaces-finance-company-legal-sci.md) | Deep research workspaces (finance, company, legal, science) | built | built | built | n/a | n/a | no |
| [F108-04](F108-04-financial-filings-analysis-and-source-library-not.md) | Financial filings analysis and source library (not built) | no | no | no | n/a | n/a | no |
| [F108-05](F108-05-health-record-workspace-health-space-healthex.md) | Health-record workspace (Health space, HealthEx) | partly | partly | no | n/a | n/a | no |
| [F108-06](F108-06-health-features-not-built-timeline-lab-explanation.md) | Health features not built (timeline, lab explanation, wearables, appointment prep) | no | no | no | n/a | n/a | no |
| [F108-07](F108-07-contract-review-and-legal-matters.md) | Contract review and legal matters | partly | partly | partly | n/a | n/a | partly |
| [F108-08](F108-08-reproducible-research-environments-code-and-notebo.md) | Reproducible research environments (code and notebooks) | built | built | no | n/a | n/a | no |
| [F108-09](F108-09-study-mode-learn-practise-review.md) | Study mode (learn, practise, review) | built | built | built | n/a | n/a | no |
| [F108-10](F108-10-sales-support-hr-and-marketing-workflows.md) | Sales, support, HR and marketing workflows | built | built | partly | n/a | n/a | partly |
| [F108-11](F108-11-shopping-comparisons-and-travel-planning.md) | Shopping comparisons and travel planning | built | built | partly | n/a | n/a | built |
| [F108-12](F108-12-items-with-no-code-found-business-operations-cad-v.md) | Items with no code found (business operations, CAD, virtual try-on, voice agents) | no | no | no | n/a | n/a | no |

Requirement items for this area: [10-requirements/capabilities/108-specialist-workspaces.md](../../10-requirements/capabilities/108-specialist-workspaces.md).

## How this area works in the code

1. **Open the finance page.** The Finance route renders the FinanceDashboard component inside the web app shell. (`apps/web/app/chat/finance/page.tsx:1-20`, `apps/web/features/finance/components/FinanceDashboard.tsx:103`)
2. **Link a bank through the hosted Plaid window.** The person clicks link. The client lists linked banks, then posts to the link endpoint. The server checks CSRF, rate limit, setup, US region and the connector policy, then asks Plaid for a hosted-link or link token. Plaid runs the bank sign-in in its own window. (`apps/web/features/finance/components/LinkedBanks.tsx:45`, `apps/web/app/api/connectors/bank-accounts/link/route.ts:1-60`, `apps/web/lib/connectors/bank-accounts.ts:167`, `apps/web/lib/connectors/bank-accounts.ts:186`)
3. **Exchange the Plaid public token and store the item.** After the bank sign-in, the exchange endpoint receives the link token and stores a new bank item. The access token is encrypted before it is written to the bank_account_items table. (`apps/web/app/api/connectors/bank-accounts/exchange/route.ts:87`, `apps/web/lib/connectors/bank-accounts.ts:433`, `apps/web/lib/connectors/bank-accounts.ts:362`, `apps/web/lib/connectors/bank-accounts.ts:21`)
4. **Read balances and transactions.** The server reads bank items for the user, decrypts each access token, and calls Plaid's balance and transactions endpoints. The dashboard fetches an overview from a finance overview path with a period parameter (that route was not opened). (`apps/web/lib/connectors/bank-accounts.ts:315-345`, `apps/web/lib/connectors/bank-accounts.ts:312`, `apps/web/lib/connectors/bank-accounts.ts:349`, `apps/web/features/finance/components/FinanceDashboard.tsx:335`)
5. **Offer bank tools in chat.** In a chat turn, the bank read tools are added to the tool list for the turn. Only read-class tools are offered for sensitive connectors. Mobile turns never get them. (`apps/web/lib/user-connector-tools.ts:2356`, `apps/web/lib/connectors/bank-accounts.ts:579-586`, `apps/web/lib/connectors/sensitive-data-connectors.ts:26-40`, `apps/web/lib/connectors/plaid-config.ts:15-18`)
6. **Start a deep research run.** A Research turn checks the plan capability and the free-trial state. If both allow it, the turn goes to the research loop instead of the one-shot path. The loop plans, searches in rounds within fixed bounds, always runs a final synthesis, and streams cumulative sources. (`apps/web/app/api/llm/v1/chat/completions/route.ts:567`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1508-1518`, `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:178-184`, `apps/web/app/api/llm/v1/chat/completions/route.ts:786`)
7. **Save the research report.** The finished report, with its sources and steps, is written to the research_reports table, and reports are read back for the reports screens. (`apps/web/lib/services/research-report-service.ts:205`, `apps/web/lib/services/research-report-service.ts:237`, `apps/mobile/app/(app)/reports/index.tsx`)
8. **Open the Health space.** The availability endpoint returns available or unavailable with a reason. When available, the Health space is a per-user project row, created once. (`apps/web/app/api/health-space/route.ts:21-35`, `apps/web/lib/services/health-space-service.ts:23-29`, `apps/web/lib/services/health-space-service.ts:46-58`, `apps/web/lib/health-space.ts:1`)
9. **Start a study session.** Study starts from the study page. The session endpoint validates the topic, mode and level strictly, then writes the session to the study_sessions table. The study instruction is composed and ranked against account and request instructions. (`apps/web/app/chat/study/page.tsx:1-18`, `apps/web/app/api/study/sessions/route.ts:28-35`, `apps/web/app/api/study/sessions/route.ts:75-82`, `apps/web/features/study/server/study-session-store.ts:114`, `apps/web/features/study/lib/study-session.ts:58-115`)
10. **Run a business workflow skill.** Business workflows are skill files. The skill catalog lists them for the person unless they turned them off. The skill runs as chat instructions. Its lock entries pin its content. (`.agents/skills/review-contract/SKILL.md:1-6`, `apps/web/lib/services/skill-catalog-service.ts:145-160`, `skills-lock.json:595`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/finance/components/FinanceDashboard.tsx` | Finance dashboard UI: balances, spending, category list and empty and waiting notices. |
| `apps/web/lib/connectors/bank-accounts.ts` | Plaid calls, the bank_account_items table access, token encryption, and the bank read tools for chat. |
| `apps/web/lib/connectors/plaid-config.ts` | Reads PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV; hides bank tools from mobile turns. |
| `apps/web/app/api/connectors/bank-accounts/link/route.ts` | Endpoint that starts a bank link; applies CSRF, rate limit, setup, region and connector policy checks. |
| `apps/web/lib/connectors/sensitive-data-connectors.ts` | US-only region rule for bank and Health connectors; offers only read tools for them. |
| `apps/web/lib/services/health-space-service.ts` | Health space availability reasons and the per-user Health project row. |
| `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Bounded deep research loop: plan, search rounds, cited synthesis; defines the round, search and time limits. |
| `apps/web/app/api/llm/v1/chat/completions/route.ts` | Chat completions route; branches a Research turn into the research loop unless it is a free trial. |
| `packages/contracts/types/src/billing-catalog.ts` | Which plan tiers have each capability (connectors, deep research and others). |
| `apps/web/features/study/lib/study-session.ts` | Study prompts: mode, level, teaching rules, and the study plan request. |
| `apps/web/app/api/study/sessions/route.ts` | Study session API: start, read and end a session for a conversation. |
| `.agents/skills/review-contract/SKILL.md` | Contract review workflow, written as a skill; the catalog lists it per person. |

## What is stored

- Linked bank items: Plaid item id, encrypted access token, institution name, and excluded account ids. Row per linked bank for each user.: Database table public.bank_account_items (apps/web/lib/connectors/bank-accounts.ts:315-316, 345, 362, 458, 480).
- Bank balances and transactions are requested live from Plaid for each read; no table storing balances or transactions was seen in the code read.: Plaid's API, called from apps/web/lib/connectors/bank-accounts.ts:312 and :349.
- Health space: one project row per user with space kind 'health' (name 'Health').: Database table user_projects (apps/web/lib/services/health-space-service.ts:46-58).
- Study sessions: one row per session, tied to a conversation (topic, mode, level, start and end).: Database table public.study_sessions (apps/web/features/study/server/study-session-store.ts:54-153).
- Research reports: report content, sources, steps, status.: Database table public.research_reports (apps/web/lib/services/research-report-service.ts:205-364).
- Bank link actions are recorded as audit events.: recordAuditEvent in apps/web/app/api/connectors/bank-accounts/link/route.ts:58.
- Mobile research reports and study screens may cache data on the device; not checked.: Not verified.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV**: Turn bank linking on. PLAID_ENV must be sandbox or production. Missing values make the bank feature unavailable with a setup message. (Read in apps/web/lib/connectors/plaid-config.ts:45-58 (plaidCredentials, missingPlaidEnv).)
- **Bank tools on mobile**: Bank tools are never offered on mobile chat turns. (apps/web/lib/connectors/plaid-config.ts:15-18.)
- **FEATURES.bankLinking (mobile)**: Hides bank linking UI on mobile. Value is false. (apps/mobile/lib/v1FeatureFlags.ts:30; used in apps/mobile/src/features/settings/cloud-connectors/index.tsx:633 and apps/mobile/app/(app)/connectors/[id].tsx:11.)
- **FEATURES.research (mobile)**: Shows the Research toggle on mobile. Value is true. (apps/mobile/lib/v1FeatureFlags.ts:24; used at apps/mobile/src/features/chat/components/AddToChatSheet.tsx:230.)
- **Plan tier for connectors**: Connectors (including bank accounts) need a paid plan: basic, pro, max, max_15x, team, team_premium, enterprise. (packages/contracts/types/src/billing-catalog.ts:351 (connectors: PAID_TIERS).)
- **Plan tier for deep research**: Deep research needs pro or higher. (packages/contracts/types/src/billing-catalog.ts:355 (deep_research: PRO_TIERS); refusal text at apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1508-1518.)
- **Free trial**: A free-trial turn does not enter the research loop. (apps/web/app/api/llm/v1/chat/completions/route.ts:567.)
- **Research bounds**: Maximum gathering rounds (6), searches (12), time budget (4 minutes), parallel tool calls (3), query rewrites (4). (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:178-227.)
- **CONNECTOR_OAUTH_PROVIDERS_JSON and the OAuth redirect base URL**: Lists the OAuth connectors that are configured. The Health space is unavailable ('not_configured') until HealthEx is in this list. (apps/web/lib/connectors/oauth-registry.ts:22-23, 138, 198-205.)
- **US-only region rule**: Bank and Health connectors refuse requests from outside the United States, using the x-vercel-ip-country request header. (apps/web/lib/connectors/sensitive-data-connectors.ts:11-24.)
- **Skill install overrides**: A skill the person switched off is hidden from the catalog. (apps/web/lib/services/skill-catalog-service.ts:145-160.)

## Shared between apps

Shared across apps: the bank and Health contracts in packages/contracts/cloud-contracts (apps/web/lib/connectors/plaid-config.ts:1-6 re-exports the bank constants; apps/mobile/services/connectors.ts:19-22 uses the same paths); plan tiers in packages/contracts/types/src/billing-catalog.ts; interactive card types (packages/contracts/types/src/interactive-cards.ts); the chat completions API that web, desktop (hosted web app) and the CLI call. Skills under .agents/skills are shared content delivered through the skill catalog. Separate per app: the web finance page and Health space UI (apps/web/features/finance, apps/web/features/health); mobile's own study screen (apps/mobile/src/features/study), research reports screen (apps/mobile/src/features/research) and feature flags (apps/mobile/lib/v1FeatureFlags.ts); the Chrome extension has no code for these features that was checked.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief cites plaid-config.ts:32 for the gates. Line 32 is the Plaid Link script URL constant. The real gates are the mobile exclusion at lines 15-18 and the credential and environment functions at lines 45-58. (apps/web/lib/connectors/plaid-config.ts:32 (wrong citation); :15-18 and :45-58 (real gates).)
- Brief cites oauth-scope-allowlist.ts:234 for the HealthEx entry. The file has 40 lines and no HealthEx entry. HealthEx is registered in the connector catalog. (apps/web/lib/connectors/oauth-scope-allowlist.ts (40 lines); apps/web/lib/connectors/catalog.ts:274.)
- Brief names the env var CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID. No code reading that name was found; OAuth providers are read from CONNECTOR_OAUTH_PROVIDERS_JSON. (apps/web/lib/connectors/oauth-registry.ts:22 and :138.)
- Brief marks Study mobile as missing. A mobile study route and screen exist, and the composer menu on mobile links to it. (apps/mobile/app/(app)/study.tsx:1; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:584-588.)
- Brief says travel 'can make reservations'. The itinerary tool does not book anything; its guidance tells the model to use a booking connector. The only reservation code in the file is for search billing. (apps/web/lib/places/itinerary-tool.ts:217-220 and :264-277.)
- Brief cites ComposerPlusMenu.tsx:877 for research. That line is the Study menu row. The web Research toggle is checked at ChatComposerNew.tsx:1621, and mobile's research toggle is at AddToChatSheet.tsx:230-235. Brief cites AddToChatSheet.tsx:116 for research, but line 116 is the cloud-access prop. (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:877; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1621; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:116.)
- Brief cites vendor directory entries and route.ts:798 for curriculum generation. Those are directory entries and a route line, not curriculum code. Curriculum output comes from the study prompt and plan request (study-session.ts:115-122). (apps/web/lib/connectors/directory/sources/vendor-directory.json:1028; apps/web/app/api/llm/v1/chat/completions/route.ts:798.)
- Reproducible environments: the sandbox harness is spawned by name, and the template list is declared in code. The file header does not show a pinned version per template, so reproducibility is not established by this code. (apps/web/lib/e2b/templates.ts:1-20.)
- Contract review, sales, support, HR and marketing are marked done, but the code read is skill files and the catalog. No runtime path showing these skills run to completion was checked. (.agents/skills/review-contract/SKILL.md:1-6; apps/web/lib/services/skill-catalog-service.ts:145-160.)
- Privacy text says Health-space chats go only to providers recorded as not training on user data, and refuses others. The availability code read does not enforce this; the enforcement was not found in the lines read. (apps/web/app/privacy/page.tsx:1580-1585 (policy text); apps/web/lib/services/health-space-service.ts:23-29 (availability only).)

## Not established

- Whether the Plaid steps the owner must finish are the only thing blocking the bank feature in production; not verified against the live Plaid account.
- The exact route behind the finance overview path (FINANCE_OVERVIEW_PATH) and what it returns were not opened.
- Whether the Chrome extension has any of these features; no extension code was read.
- Whether the CLI or VS Code extension has any of these features; the brief lists no status for them.
- How skills such as contract review or sales workflows reach a chat turn at run time (which code loads a skill's content into the prompt) was not traced.
- Whether Health-space chats are restricted to non-training providers in code (the privacy text says so); the enforcement was not found.
- Whether HealthEx is connectable in any environment; the code gate is CONNECTOR_OAUTH_PROVIDERS_JSON, and no production value was checked.
- What the Desktop app shows beyond the hosted web app; the statuses are taken from the brief.
- Whether mobile reports or study data are cached on the device; not checked.
- Full details of the research synthesis and citation format; only the header comments of research-loop.ts were read.
- Feature-by-feature status for items the brief marks missing: searches found no code, but the search was by name only and was not exhaustive.
