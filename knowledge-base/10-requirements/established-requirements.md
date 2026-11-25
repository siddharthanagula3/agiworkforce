---
id: "REF-product-requirements-sources"
type: "requirements"
title: "Established product requirements and decisions"
basis: "code inspection and project documents"
second_reader: "not challenged; corrected after the consistency check across pages"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Established product requirements and decisions

Index of established product requirements and founder decisions in docs/product, docs/decisions and audit/decisions, each with source and date. Covers the trust modes, one subscription across six apps, plan catalog, gated paid upgrades, mobile decisions of November 2026, unresolved choices, and where documents contradict each other or the code. Code settles three points that were open: the minimum age of 18 is enforced in code, Local needs no account on Mobile (after an on-device age confirmation), and the Ultra plan has no 5-hour cap. No repository source states a 2027-01-01 sales deferral. The Tauri second-public-app decision of 2026-10-24 exists, but the repository still treats Tauri as internal. Read-only; nothing was run.

## How to read this page

This page collects what the repository records as product requirements and founder decisions. It is an index for citing, not a spec.

**Basis tags.** [code] means I opened the file at that line. [requirement] means a project document states it. [inferred] is my reasoning from code. [proposed] is my suggestion. [unknown] means not established. Nothing here is [executed]: no document I read records a real run of these requirements, and I ran nothing.

**Two statuses.** Implementation status is whether code exists and is connected. Verification status is whether anyone ran it. This page gives only implementation status, and only where quick to check. The surface matrix says a Present cell has been located, not exercised (file:docs/product/surface-feature-matrix.md, header).

**Precedence.** AGENTS.md section 2 ranks code above prose. Where a document disagrees with code, code wins and the document is listed under Contradictions.

**Handles.** REQ-* names are my stable short names for requirements. D-yyyy-mm-dd-nn are the founder's own decision IDs.

| Topic | Owner file | Status line |
|---|---|---|
| Product definition | file:docs/product/definition.md | Current, 2026-11-19 |
| Long PRD | file:docs/product/requirements.md | see its section 27 |
| Suite thesis, sync boundary | file:docs/product/suite.md | Current |
| Commercial model | file:docs/product/commercial.md | Current, 2026-11-11 |
| Experience contract | file:docs/product/experience-contract.md | Current target, implementation incomplete, 2026-11-11 |
| Feature by surface matrix | file:docs/product/surface-feature-matrix.json (rendered to .md) | Generated, 2026-09-20 |
| Competitive guidance | file:docs/product/competitive-guidance.md | Current, 2026-11-19 |
| Decision index | file:docs/decisions/README.md | Last updated 2026-11-11 |
| Founder decision records | file:docs/decisions/2026-09-15-founder-decisions.md, 2026-09-27, 2026-11-10, 2026-11-12, 2026-11-13 | Current |
| Open founder calls | file:audit/decisions/founder-decisions.md, open-questions.md, founder-actions.md | open lists |

I read the product and decision files and the audit/decisions headings. I did not read all of founder-actions.md (about 106 KB) or wire-or-cut.md (about 976 KB); I read their section lists only. I did not read the full text of competitive-guidance.md (76 KB) beyond its opening and its surface inventory.

## Product definition

| Name | Statement | Source and date | Code today |
|---|---|---|---|
| REQ-six-surfaces | AGI is one suite across six first-class surfaces: Web, Mobile, Desktop, Chrome extension, VS Code extension, CLI. Seven code implementations map to six surfaces because Electron is the public Desktop and Tauri is retained internal code. | [requirement] file:docs/product/definition.md (Product Definition), file:AGENTS.md section 5 | [code] app folders exist: apps/web, apps/mobile, apps/desktop (electron and src-tauri), apps/cli, apps/extension, apps/extension-vscode (paths named in file:docs/product/competitive-guidance.md inventory table) |
| REQ-parity-plus-modes | v1 target is practical parity with leading AI apps, plus one differentiator: the user chooses Local models, own provider key (BYOK), or AGI Managed Cloud. Parity means user capability and workflow, not copied code or branding. | [requirement] definition.md, Product Definition | [code] three modes exist as a typed contract, TRUST_MODE_CONTRACTS (packages/contracts/types/src/trust-mode-contract.ts:52) |
| REQ-model-agnostic | Models and providers are interchangeable underneath; model-specific behaviour stays behind shared provider and model abstractions; no dependency on one AI company because a reference product uses it. | [requirement] file:docs/decisions/2026-09-15-founder-decisions.md, Governing rule (2026-09-15); AGENTS.md section 4 | [code] one generated model catalog is the only place model IDs may be literal (AGENTS.md section 4; enforced by check:model-id-literals per that file). I did not re-run the guard. |
| REQ-provider-agnostic | Several inference providers; decision 8 of the index says gateways and proxy paths are never default for Local or strict BYOK. | [requirement] file:docs/decisions/README.md, Locked Decisions 7 and 8 | [inferred] provider adapters live under packages/ai/providers/* (AGENTS.md section 5); coupling not audited here |
| REQ-brand | Public product name AGI; formal name AGI Workforce; CLI command agi; repo identifiers stay agiworkforce. Brand strings come from the product-names registry. | [requirement] requirements.md 2.1; definition.md; AGENTS.md section 4 | [unknown] not checked. The registry file is packages/contracts/types/src/product-names.ts per AGENTS.md. |
| REQ-serial-order | Build one surface at a time: Website, Mobile, Desktop, Chrome, CLI, VS Code. Founder order of 2026-09-21; supersedes the 2026-08-05 shortest-first order. | [requirement] definition.md Launch Lock; requirements.md 2.2 | Not a code property. Contradicted in practice by later decisions that run mobile and desktop work in parallel (see Contradictions). |
| REQ-surface-roles | Web: account, projects, synced chat, billing, admin, no BYOK. Desktop: account Cloud app plus trusted local developer host. Mobile: on-device Local plus Cloud, no BYOK in v1. CLI: developer agent and canonical local session host. VS Code: thin client over the CLI-hosted session. Chrome: Cloud-only browser assistant. | [requirement] definition.md Surface Roles table | [code, partial] mobile has no BYOK mode, per the comment in apps/mobile/src/features/chat/utils/sessionLabeling.ts:10. Web BYOK exists only as a docs page (matrix row BYOK, web: apps/web/lib/byok-providers.ts reached by apps/web/app/docs/byok-env/page.tsx). |
| REQ-two-domains | Two continuity domains. Account Cloud: Web, Mobile Cloud, Desktop Cloud, eligible Chrome Managed Cloud chats. Host Developer: Desktop Code, CLI, VS Code. Desktop is the explicit bridge; moving context between domains is a previewed, secret-scanned, consented handoff. | [requirement] definition.md Continuity And Reuse Lock; suite.md Sync Boundary; experience-contract.md section 1 | [unknown] sync behaviour not verified here; owned by other pages |
| REQ-chrome-mirror | A Chrome conversation mirrors to the account store only if every turn ran in Managed Cloud. Unknown, Local or BYOK provenance fails closed and stays browser-local. | [requirement] definition.md; docs/decisions/README.md Locked Decision 4 | [unknown] |
| REQ-docs-honesty | Documentation describes current reality; the product never shows a control for a capability that does not work. 'If a visible control conflicts with the effective runtime capability, the control is the bug.' | [requirement] AGENTS.md section 11; experience-contract.md header | n/a |

## Experience requirements

| Name | Statement | Source and date | Code today |
|---|---|---|---|
| REQ-local-never-silent | Local never silently routes chats, files, tools or developer sessions to BYOK or Cloud. The original Local thread stays Local forever; a move is an explicit fork with context selection, secret scan, payload preview, provider label, retention/cost disclosure and consent. | [requirement] definition.md Trust Modes; requirements.md 2.4 and 7.4; AGENTS.md section 6 | [code] local contract: storage device, keyAttribution none, failover refuse, cloudEgressAllowed false, syncsAcrossDevices false (packages/contracts/types/src/trust-mode-contract.ts:52-60). Per-surface enforcement is [unknown] here; AGENTS.md names check:trust-boundaries. |
| REQ-byok-labeled | BYOK is user-controlled provider routing, not private like Local. Label provider, model, endpoint class and tool route. Provider retention shown from verified metadata or marked unknown. | [requirement] requirements.md 7.2, 4.3 | [unknown] |
| REQ-byok-native-first | In BYOK, prefer provider-native tools by default, with consent before sending files or screenshots; never use native tools in Local. | [requirement] requirements.md 2.5 | [unknown] |
| REQ-capability-honesty | Never claim a model can do something unless capability metadata proves it. Hide or disable tools for a route that cannot call tools. Web search, memory, MCP, sandbox and similar depend on a provider route or AGI harness, not the model. | [requirement] requirements.md 4.3; AGENTS.md section 4 | [code] on-device models carry a capabilities record (text, visionIn, audioIn, toolCalls, structuredOutput) in packages/contracts/types/src/on-device-models.ts:20-26 |
| REQ-one-chat | No separate 'file chat'. One chat takes files, references, projects, tools, connectors, artifacts. | [requirement] requirements.md 4.2; definition.md Launch Lock | [unknown] |
| REQ-home-two-shapes | One home answers directly or escalates to a durable work run with progress, approvals and reopenable output. | [requirement] experience-contract.md, September 21 Ecosystem Delta | [inferred] Work and AGI Code exist in the matrix as Present on all surfaces except where noted; not exercised |
| REQ-inspectable-memory | Memory scopes (saved, referenced history, project, work, local workspace) are separate; each entry shows provenance, update time, edit, exclusion, export, delete. | [requirement] experience-contract.md Delta; requirements.md 18 | [unknown] |
| REQ-artifact-lifecycle | Generated outputs are versioned objects with preview, edit, compare, restore, share, export, revoke, reopen. | [requirement] experience-contract.md Delta, section 10 | [unknown] |
| REQ-approvals | Safe read-only actions are automatic; consequential external actions ask. An action a user cannot undo asks first and names the consequence; agents never destroy user data on their own. | [requirement] D-2026-09-15-01; AGENTS.md section 9 | [unknown] AGENTS.md names useConfirmAction as the surface |
| REQ-precision-order | Use the most precise path first: typed connector or tool, then controlled browser automation, then screen-level computer use. A less precise path never bypasses a permission or trust boundary. | [requirement] definition.md Competitive Ecosystem Synthesis Lock | [unknown] |
| REQ-usage-ui | Usage is shown as percentage progress and reset time on Web, Mobile, Desktop, CLI and VS Code, without private plan allowance units, token conversion or provider cost. The top-up checkout is the exception (50 top-up units per $1). Chrome has no usage dashboard. | [requirement] definition.md Continuity And Reuse Lock | [unknown] |
| REQ-unavailable-hidden | Unsupported or incomplete capabilities are hidden or clearly unavailable. | [requirement] D-2026-09-15 Governing rule | [unknown] |
| REQ-leaders-benchmark | Where ChatGPT and Claude converge, that is the default; where they differ, choose what fits our architecture; copy behaviour, never proprietary implementation. D-2026-09-27-02: features neither leader offers are not built. | [requirement] file:docs/decisions/2026-09-15-founder-decisions.md Governing rule; file:docs/decisions/2026-09-27-founder-decisions.md D-2026-09-27-02 | n/a |
| REQ-phone-web-rules | Below 768 px the web app never scrolls sideways, keeps a 16 px gutter, no text under 12 px, 44 px icon buttons, no autofocus on touch (sign-in excepted). | [requirement] D-2026-11-13-07 (2026-11-13) | [unknown] The decision names the check apps/web/e2e/phone-layout-rules.spec.ts. I did not open it or run it; the decision says Safari on iPhone was not used. |
| REQ-one-line-copy | Text under an option is one short line; on web 12 px. Consequences (cannot be undone, what is billed, who sees it, what leaves the device) stay. | [requirement] D-2026-11-13-08 | [unknown] |
| REQ-mobile-empty-chat | A new mobile chat shows only the logo symbol, greeting and composer. | [requirement] D-2026-11-10-01 | [unknown] |
| REQ-mobile-mode-switch | Mode (Local or Cloud) is switched in the side panel and in Settings, not in the new-chat header. | [requirement] D-2026-11-10-02, amended by D-2026-11-12-02 and D-2026-11-13-05 | [unknown] |
| REQ-mobile-model-picker | Model picker sits on the composer; one row per provider with logo; Auto is the only routing choice; Instant, Economy, Images, Files are filters read from the catalog. Web and desktop still offer Instant, Best and Economy. | [requirement] D-2026-11-12-04 to -07 (2026-11-12) | [unknown] |
| REQ-mobile-destination-scope | In Local mode the phone shows only what works with no account. Each destination is classified device or cloud; an unclassified one is treated as cloud. | [requirement] D-2026-11-13-05 | [code] apps/mobile/src/features/shell/destinationScope.ts:54-63 (unclassified route returns cloud; isShownInMode) |
| REQ-mobile-code | On the phone, Code is one list mixing cloud sessions and sessions on the paired computer; Remote is no longer a destination. | [requirement] D-2026-11-13-06 | [unknown] |

## Commercial and plan requirements

| Name | Statement | Source and date | Code today |
|---|---|---|---|
| REQ-one-subscription | One AGI account has one effective suite entitlement. Free access and any paid plan resolve through the same account or organization entitlement on every surface. No per-surface subscription. | [requirement] definition.md Continuity Lock; commercial.md Subscription Ownership; requirements.md 4.1 | [code] effectivePlanTier returns the plan only if status is active or trialing, else free (packages/contracts/types/src/subscription-entitlement.ts:3-18). Whether every surface calls it is [unknown]. |
| REQ-one-billing-owner | One subscriptions row has exactly one billing owner: Stripe, Apple or Google. While the owner is entitled the second channel loses; once not entitled, a new purchase takes over and clears the other channel's identifiers. Cancellation stays with the selling channel. | [requirement] commercial.md Subscription Ownership | [code, partial] files named by the document exist as references: apps/web/lib/server/subscription-billing-owner.ts is imported by billing-waitlist-access.ts:6; the handoff file was not opened |
| REQ-local-free | Local use is free of any paid subscription and core differentiation. Local and BYOK stay useful without paying AGI. | [requirement] commercial.md Launch Posture; suite.md Current Product Direction | [code] plan local-only has monthlyPriceUsd 0 (packages/contracts/types/src/billing-catalog.ts:167-172); isFreeOfChargePlanTier covers local-only, byok, free (billing-catalog.ts:296-300) |
| REQ-local-no-account | Local mode needs no AGI account. Account and sign-in are a separate question from payment. | [requirement] requirements.md 7.1 | [code] Mobile: no account is needed for Local, but an on-device age confirmation comes first. resolveRootRedirect sends every user to the age gate until it is confirmed, and when the user is signed out and onboarding is done it routes to the app, not to sign-in (apps/mobile/src/features/auth/services/rootRouting.ts:30-60; apps/mobile/app/index.tsx:9-12). CLI and VS Code: no account for Local, per the local-inference page. Electron Desktop chat has no Local mode. |
| REQ-plan-catalog | Public plan names and prices are owned by billing-catalog.ts. Plan IDs: local-only, byok, free, basic ($7), pro (label Premium, $20), max (label Max, $100), max_15x (label Ultra, $200), team ($25 per seat, $240 yearly), team_premium ($125 per seat), enterprise (contract). Display names changed while stored IDs stayed. | [requirement] commercial.md Plan Presentation | [code] packages/contracts/types/src/billing-catalog.ts:167-231 (BILLING_PLAN_PRICING). Relationship names: plan:local-only, plan:byok, plan:free, plan:basic, plan:pro, plan:max, plan:max_15x, plan:team, plan:team_premium, plan:enterprise. |
| REQ-monthly-only | Individual plans (Basic, Premium (`pro`), Max (`max`), Ultra (`max_15x`)) are sold monthly only; yearly Premium withdrawn. Team keeps both cadences. A legacy yearly Premium subscription keeps renewing at its price. The decision record and commercial.md still use the retired names Pro, Max 5x and Max 20x. | [requirement] D-2026-09-27-01 (2026-09-27) | [code] only team and team_premium carry yearlyPriceUsd among self-serve tiers beyond the free ones (billing-catalog.ts:209-224); the type satisfies a check that individual tiers have no yearlyPriceUsd (billing-catalog.ts:230) |
| REQ-managed-free-open | Managed Cloud Free is public alpha, open to signed-in users (founder, 2026-06-27). Env AGI_MANAGED_COMPUTE_PRIVATE_BETA is an incident kill-switch only. Metering, quotas, abuse, refund, retention and provider-terms controls must keep pace but do not gate Free. | [requirement] definition.md; commercial.md Bootstrap Rule; requirements.md 7.3 | [code] the env name is defined as MANAGED_COMPUTE_PRIVATE_BETA_ENV (apps/web/lib/managed-compute-gate.ts:40). How the gate is evaluated was not read. |
| REQ-paid-gated | Paid acquisition stays waitlist or access-code gated until the founder opens purchasing. Working checkout code does not open it. Access codes authorise acquisition, not a second subscription owner. | [requirement] commercial.md Paid Acquisition Gate; D-founder 2026-09-21 clarification (docs/decisions/README.md Locked Decision 5) | [code] apps/web/lib/server/billing-waitlist-access.ts: message 'Paid upgrades are opening in stages' (line 11); gate is open if AGI_BILLING_WAITLIST_OPEN is 1 (line 28) or an operator runtime flag is on (lines 38-40); a beta_redemptions row also grants access (lines 44-52). An unreadable flag store reads closed (apps/web/lib/feature-flags/billing-upgrade-gate.ts, comment above readBillingUpgradesOpen). Consumers listed by search: apps/web/app/api/checkout/route.ts, portal/route.ts, waitlist/route.ts. This gate is the code's sales gate; no repository source gives a fixed sales date. |
| REQ-mobile-sells-nothing | Mobile v1 sells nothing in the app; no purchase, upgrade, top-up or restore control; Play Billing permission dropped. Changing it needs a new store build and review. | [requirement] commercial.md Paid Acquisition Gate; owner deferral 2026-11-10 | [code] apps/mobile/src/features/billing/storePurchases.json:2 has nativePurchases false |
| REQ-usage-windows | Ultra (`max_15x`) has no rolling 5-hour cap; weekly and monthly allowances remain. Zero ceiling means zero usage, including unknown plans. credits.five_hour is null for that tier. | [requirement] commercial.md Plan Presentation | [code] packages/contracts/types/src/managed-usage-limits.ts: max_15x has fiveHourCredits null, weeklyCredits 5_000 and monthlyCredits 20_000. |
| REQ-credit-crossing | A turn that crosses a 5-hour, weekly or flagship-weekly window finishes on the plan; the monthly period keeps a hard edge. Purchased credits are not spent while usage credits are off. | [requirement] D-2026-10-25-01 (2026-10-25, owner's delegation of reversible billing calls) | [unknown] decision names migration 0420_managed_usage_plan_finishes_crossing_turn.sql; not opened |
| REQ-credits-hand-billed | Usage credits and top-ups appear in Billing only for Stripe, Apple or Google billed accounts; other accounts are pointed to whoever manages the plan. | [requirement] D-2026-10-25-02 | [unknown] |
| REQ-official-price | Managed users are billed the model's official price in credits; the company keeps routing savings. Top-up is 50 credits per dollar. | [requirement] file:docs/decisions/2026-09-05-living-decision-model.md D-2026-09-06-17 | [unknown] |
| REQ-per-seat | Team and Enterprise get per-seat credits, two-seat minimum, no admin cap on a member's personal spend (decision 29, 2026-10-22). | [requirement] audit/decisions/founder-decisions.md item 9 | [code] MIN_PURCHASABLE_SEATS = 2 (billing-catalog.ts:154) |
| REQ-paid-launch-gates | Before self-serve paid opens: usage ledger, price table, quota reservation and settlement, fraud controls, refund and chargeback policy, dispute reserve, tax model, provider terms review, retention rules. | [requirement] commercial.md Managed Credit Requirements | [unknown] |
| REQ-enterprise-path | Enterprise needs org policy, audit logs, SSO/SCIM, roles, provider/connector policy, credit ledger, support links. Enterprise Local licensing verifiers are kept as contract tests only, with no runtime consumer. | [requirement] commercial.md Enterprise Path; file:docs/decisions/2026-07-30-enterprise-local-verifier-retention.md (2026-07-30) | n/a |
| REQ-us-only | Managed data and inference run in the US only today, on a region-neutral design. | [requirement] file:docs/decisions/2026-09-04-region-neutral-data-residency.md | [unknown] |
| REQ-minimum-age | Every account must be at least 18. | [code] packages/contracts/types/src/account-eligibility.ts:1 has ACCOUNT_MINIMUM_AGE = 18; the mobile age gate floors every regional threshold at that constant (apps/mobile/src/features/auth/services/ageGate.ts:25-26, 50, 69-70). Server enforcement points are described on the authentication page. | [code] |

**Execution boundaries.** What runs where, as the documents state it, not verified here.
| Mode | Where it runs | Pays | Source |
|---|---|---|---|
| mode:local | on the device or local host; cloud egress false | nobody; free | trust-mode-contract.ts:52-60 [code]; commercial.md [requirement] |
| mode:own-key | direct to the user's provider with their key; labeled | user pays provider | requirements.md 7.2 [requirement] |
| mode:cloud | AGI-managed providers and compute; metered | plan or credits | requirements.md 7.3 [requirement] |

The documents say the public Electron Desktop does cloud chat only and runs inference in Managed Cloud (D-2026-09-15-04 note of 2026-10-24); the retained Tauri host carries Local and BYOK. [requirement]

## Per-app requirements

Matrix counts: file:docs/product/surface-feature-matrix.json holds 51 features across seven columns (six surfaces plus api). I counted its cells today: 190 present, 106 absent, 60 unverified, 1 partial [code, computed from the JSON]. The matrix header is dated 2026-09-20.

| Surface | Requirement | Source and date | Code today |
|---|---|---|---|
| surface:web | Managed Cloud only; account, projects, synced chat, artifacts, billing, admin, Neon-backed entitlement. Must not expose BYOK or env-key chat, or claim in-browser Local compute. Phone rules from D-2026-11-13-07. | definition.md; suite.md; experience-contract.md 12.1 | [code, partial] web BYOK appears only as docs page apps/web/app/docs/byok-env/page.tsx (matrix). Chat cell for web is Unverified in the matrix. |
| surface:desktop | Electron is the one public Desktop (D-2026-09-15-04). It shows the hosted web app, runs Cloud chat (no Local mode), and hosts Desktop Code, local files, computer use, voice. Local MCP servers run through the bundled agi app-server (superseded in part 2026-10-24). The decision record also says the owner chose on 2026-10-24 to ship Tauri as a second public app (name open), but the repository still treats Tauri as internal and the Tauri window shows the Vite renderer, not the hosted web app; the public status of Tauri is an owner question. | D-2026-09-15-04; AGENTS.md section 5; README.md | [code] AGENTS.md and README.md say Tauri is retained internal code and Electron is the only public Desktop. apps/desktop/src-tauri/tauri.conf.json sets devUrl http://127.0.0.1:5173 and frontendDist ../dist (the Vite app in apps/desktop/src), not the hosted web app. AGENTS.md: a change to apps/desktop/src never reaches the Electron window. Electron folder exists: apps/desktop/electron. |
| surface:mobile | Expo React Native; on-device Local plus Cloud; no BYOK in v1; sells nothing in v1; unpublished; small on-device models; no account needed for Local (an on-device age confirmation comes first); Cloud needs sign-in. Release bar: App Store release, TestFlight QA pass, review blockers fixed, privacy and support links live, Local boundary verified. | requirements.md 2.3, section 10; commercial.md; suite.md | [code] nativePurchases false (storePurchases.json:2); BYOK absent (sessionLabeling.ts:10); on-device model catalog exists (on-device-models.ts) with a shipsInV1 flag per model; age gate precedes the app (rootRouting.ts:30-60). Store release status [unknown]. |
| surface:cli | Developer agent, Rust TUI over the canonical session engine; Local, BYOK and admitted Managed; workspace-scoped; no automatic sync to app chats. Sandbox may read the whole disk (open question 46). | definition.md; experience-contract.md 12.4 | [code] apps/cli exists as a Rust binary agi (competitive-guidance.md inventory). The inventory records no successful release-cli run as of 2026-11-11 [requirement]. |
| surface:vscode | Thin client over the CLI-hosted developer session; Local, BYOK, Managed claims must match the real execution stack; do not trust workspace settings for tier or endpoint. | definition.md; suite.md; experience-contract.md 12.5 | [code] apps/extension-vscode exists. Experience contract itself says to remove a secondary provider-stream settings path (12.5); whether done is [unknown]. |
| surface:chrome | Cloud-only browser assistant; page context is untrusted; scope held at Claude in Chrome's (D-2026-09-28-23); Quick mode is a per-turn Auto Economy override; restricted pages keep chat but lose page tools. | definition.md; experience-contract.md 12.6 | [code] apps/extension exists. Two coexisting per-site tool mechanisms remain (audit open item 48). |

**Release evidence on record.** The competitive guidance inventory (checked 2026-11-11) says the Mobile, Electron, Chrome and VS Code release workflows are active with no runs, the CLI has no successful run, one draft release exists and none published, and store availability is unverified [requirement, dated 2026-11-11]. I did not re-check GitHub.

## Owner decisions by date

Each record is in its own file under docs/decisions unless noted. Memory-only items are not in the repository and are excluded from the table (see Unresolved).

| Date | ID | Decision | Source |
|---|---|---|---|
| 2026-06-27 | founder note | Managed Free is open in public alpha after sign-in | definition.md, commercial.md (cited, no own record) |
| 2026-07-30 | ADR | Keep the two Enterprise Local verifiers with no runtime claim | docs/decisions/2026-07-30-enterprise-local-verifier-retention.md |
| 2026-09-04 | ADR | US-only data residency on a region-neutral design | docs/decisions/2026-09-04-region-neutral-data-residency.md |
| 2026-09-05 | model | Living decision model; entries record question, evidence, options, decision, revisit trigger | docs/decisions/2026-09-05-living-decision-model.md |
| 2026-09-06 | D-2026-09-06-17 | Bill official model price; company keeps routing saving; credits shown, top-up 50 per dollar | same file |
| 2026-09-10 | D-2026-09-10-03 | Project chats keep opening in AGI Work (decided by the architect, status Decided) | docs/decisions/2026-09-10-managed-gateway-routes.md |
| 2026-09-15 | D-2026-09-15-01 to -26 | 26 decisions: governing rule (leaders as benchmark), tool approvals, auto-memory, localization, Electron as the public Desktop (04), CLI auth, managed gateways, Managed Cloud plan-tier gate with trusted surface claim (09), dispatch pairing, TLS pinning, minimum age (12), Stripe cutover, India, connectors, QA accounts, migrations, signed releases | docs/decisions/2026-09-15-founder-decisions.md |
| 2026-09-21 | order | Serial surface order Web, Mobile, Desktop, Chrome, CLI, VS Code; paid upgrades stay gated | definition.md; requirements.md 2.2 |
| 2026-09-27 | D-2026-09-27-01, -02 | Individual plans monthly only; features the leaders lack are not built | docs/decisions/2026-09-27-founder-decisions.md |
| 2026-09-28 | D-2026-09-28-01 to -29 | Local and Cloud mobile memory separate (02), voice on a live API (04), no device-only web chats (20), only cloud coding sessions shared (21), Chrome stays at Claude in Chrome scope (23), VS Code at Claude Code in VS Code scope (25), mobile sends web-billed plan management to web (27), terminal agent at Claude Code and Codex CLI scope (29) | same file |
| 2026-10-19 | O2, O6 | Mobile store purchase opens with no waitlist; text names not provider logos (O6, later amended) | commercial.md; D-2026-11-12-06 |
| 2026-10-22 | decisions 9, 29, 41 | Per-seat credits; ticker removed; home hero kept; agents page prose only | audit/decisions/founder-decisions.md items 9, 17, 18, 30 |
| 2026-10-24 | amendment | Electron runs local MCP servers via app-server; owner chose to ship the Tauri app as a second public desktop app, name open. The repository still treats Tauri as internal (AGENTS.md section 5, README.md), so this decision is not reflected in the code or the other documents. | D-2026-09-15-04 note (docs/decisions/2026-09-15-founder-decisions.md:78-99) |
| 2026-10-25 | D-2026-10-25-01, -02 | Crossing turn finishes on plan; credits only on Stripe, Apple, Google billed accounts | 2026-09-27 file |
| 2026-11-10 | D-2026-11-10-01 to -03 | Mobile empty chat; mode switch only in side panel; logo symbol alone | docs/decisions/2026-11-10-founder-decisions.md |
| 2026-11-12 | D-2026-11-12-01 to -09 | Side panel is navigation only; Settings has the mode switch; add menu on one screen; model picker on composer; one row per provider; logos return; Auto plus filters; reasoning slider; layouts documented | docs/decisions/2026-11-12-founder-decisions.md |
| 2026-11-13 | D-2026-11-13-01 to -08 | Build features shared by the leaders; multiple accounts; opt-in model-improvement switches (off by default, lawyer review open); app language row back; short side panel with More fold; Code is one list; phone rules for web; one-line explanations | docs/decisions/2026-11-13-founder-decisions.md |
| 2026-11-18 | audit item 1 | Model calls are refused when a governed workspace's model policy cannot be read | audit/decisions/founder-decisions.md item 1 (not yet moved to docs/decisions) |

**Note.** The decision text on 2026-11-13-03 supersedes earlier declines (GAP-032, GAP-160, GAP-176) and says 'today nothing uses customer content to improve a model' [requirement]. Any future use must treat a missing or unreadable choice as no.

## Unresolved product choices

From file:audit/decisions/open-questions.md (undated list) and file:audit/decisions/founder-decisions.md (items 1 to 53). Counted as open unless the file says Decided.

| Choice | Source | Status in source |
|---|---|---|
| When to open paid checkout (staged) | founder-decisions.md item 11 | Open |
| Mobile bottom tab bar is hidden with no decision record: keep drawer-only or restore tabs | item 3 | Open |
| Where mobile runs by default: Local (apps/web/app/mobile/page.tsx says) or managed cloud (privacy page groups it) | item 16 | Open; no route sentence about Mobile may be published |
| Surface by route matrix: which of Local, Your key, AGI Cloud each surface supports | item 25 | Open |
| Training choice and provider-training setting enforcement incomplete | items 2, 40 | Open (toggle exists, enforcement partial) |
| Business-plan training default; temporary chats routing; CLI memory pool per provider | open-questions.md round of 2026-10-22 | Open |
| What a downgrade removes (BYOK and local-only tiers losing connectors and Remote Control) | open-questions.md | Open |
| Chat system prompt v14 versus keep v6 | open-questions.md | Open, about $2 gate |
| Custom assistant editor port or cut; plugin marketplace content from another vendor | items 5, 6 | Open |
| Two status registers (matrix versus audit/ledger) | open-questions.md | Open |
| Mobile local runtime and model pack shipping mechanism; VS Code BYOK timing; store privacy labels; invite-code backend; retention schema; local encryption; memory import; artifact retention; desktop native host protocol; billing ledger before Cloud launch; visual artifact workspace | open-questions.md items 1 to 11 | Open |
| Routing: canonical resolver, model snapshot identity, tier vocabulary, verifier owner, task identity, non-managed cost ledger | open-questions.md OQ-1 to OQ-8 | Open |
| Browser agent isolation; second extension site-tool mechanism; desktop notification model; desktop browser pane sign-in import | items 12, 48, 49, 50, 52 | Open |
| Support hours, accessibility scan scope, base text size, policy dates | items 14, 15, 21, 23 | Open |
| Wording that lawyers must review: model-improvement switches, minimum age wording (the 18 floor itself is enforced in code) | D-2026-11-13-03; D-2026-09-15-12 | Open |
| Free chat daily share per account versus 2026-10-07 no-cap decision | item 43 | Open; the 2026-10-07 decision is cited but I did not find its own record |
| Public status of the Tauri app (second public desktop app per the 2026-10-24 decision, or internal per AGENTS.md and README.md) | D-2026-09-15-04 note | Owner question |

**Minimum age and sales date.** The 18-and-over rule is enforced in code (ACCOUNT_MINIMUM_AGE = 18 in packages/contracts/types/src/account-eligibility.ts:1; the mobile age gate floors every regional threshold at it, apps/mobile/src/features/auth/services/ageGate.ts:25-26, 50, 69-70), so it is a code fact, not an unrecorded owner memory. The owner's memory notes also mention a decision that no subscription is sold on any surface before 2027-01-01. A search of apps/web/lib, apps/web/app, packages/contracts, docs and apps/mobile/src for '2027-01-01' found only test fixtures and contract dates, so no repository source states that date; it is [unknown] here and needs a decision record. The code's sales gate is the waitlist and access-code gate in apps/web/lib/server/billing-waitlist-access.ts.

## Contradictions between documents

| Item | Document A says | Document B or code says | Winner |
|---|---|---|---|
| Desktop public count | file:docs/product/competitive-guidance.md (2026-11-19), experience-contract.md 12.2, AGENTS.md section 5 and README.md: Electron is the one public Desktop; Tauri is retained internal code | D-2026-09-15-04 amendment of 2026-10-24: owner chose to ship Tauri as a second public app, loading the hosted web app | The decision exists, but the repository still treats Tauri as internal, and the code shows the Tauri window loading the Vite renderer (tauri.conf.json devUrl and frontendDist), not the hosted web app. Public status is an owner question. |
| Desktop modes | requirements.md 12: Desktop exposes Local, BYOK and Cloud | definition.md and experience-contract.md 12.2: Electron is Cloud chat plus host; inference is Managed Cloud | definition.md and the decision; requirements.md section 12 is stale |
| Website scope | requirements.md 11: pricing is a placeholder, no full Cloud chat before controls proven | definition.md: Managed Free chat open to signed-in users since 2026-06-27 | definition.md |
| Mobile status | suite.md: unpublished, Desktop steering planned | requirements.md section 10 treats store release as the bar; store state [unknown] | Not a conflict; status unknown |
| Serial order | definition.md: one surface active at a time | Founder decisions of 2026-11-10 to 11-13 push mobile, desktop and web work in parallel | The decisions; the serial rule is no longer how work runs [inferred] |
| Paid gate wording | commercial.md, suite.md: waitlist or access code gated | Code: a runtime operator flag plus env override plus beta_redemptions row (billing-waitlist-access.ts:28-52) | Code; the documents omit the flag mechanism |
| Plan names | D-2026-09-27-01 and commercial.md use Pro, Max 5x, Max 20x | Code labels: Premium (`pro`), Max (`max`), Ultra (`max_15x`) (billing-catalog.ts:192-207); the Ultra ID `max_15x` no longer matches a '20x' label | Code |
| Decision index | docs/decisions/README.md lists dated records but omits 2026-11-12 and 2026-11-13, and lists wire-or-cut.md | Both files exist | Directory; README is incomplete |
| Matrix counts | open-questions.md: 184 present, 95 absent, 63 unverified, 1 partial | JSON today: 190, 106, 60, 1 | JSON |
| Model picker routing | D-2026-11-12-07: Auto only on mobile | Web and desktop still offer Instant, Best, Economy | Recorded as a deliberate deviation |
| Local to Cloud on mobile model picker layout | D-2026-11-10-02 says side panel only | Amended twice (2026-11-12-02, 2026-11-13-05) | Latest |
| Design rule 6 forbids decorative glow | D-2026-11-13-01 allows voice glow that carries state | Decision records the deviation | Decision |
| Tauri-related guidance | competitive-guidance.md date 2026-11-19 but research baseline 2026-09-21 | Its own text says prefer the later comparisons | Later comparisons |

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Plan IDs are local-only, byok, free, basic, pro, max, max_15x, team, team_premium, enterprise; public labels differ (Premium is `pro`, Ultra is `max_15x`). | read in the code | `packages/contracts/types/src/billing-catalog.ts:167-231` |
| Individual plans are named Basic, Premium (`pro`, $20), Max (`max`, $100) and Ultra (`max_15x`, $200); the names Pro, Max 5x and Max 20x are retired. | read in the code | `packages/contracts/types/src/billing-catalog.ts:192-207` |
| Ultra (`max_15x`) has no 5-hour cap (fiveHourCredits null) and keeps weekly (5_000) and monthly (20_000) credit allowances. | read in the code | `packages/contracts/types/src/managed-usage-limits.ts:63-69` |
| Local plan and BYOK plan cost zero; isFreeOfChargePlanTier covers local-only, byok and free. | read in the code | `packages/contracts/types/src/billing-catalog.ts:167-179`; `packages/contracts/types/src/billing-catalog.ts:296-300` |
| Entitlement resolves to free unless subscription status is active or trialing. | read in the code | `packages/contracts/types/src/subscription-entitlement.ts:3-18` |
| One AGI account has one effective subscription across all six surfaces; surfaces never create a second entitlement. | stated requirement | `docs/product/definition.md Continuity And Reuse Lock`; `docs/product/commercial.md Subscription Ownership` |
| Mobile v1 sells nothing in the app: nativePurchases is false. | read in the code | `apps/mobile/src/features/billing/storePurchases.json:2` |
| Paid upgrades are gated by a runtime operator flag, an env override AGI_BILLING_WAITLIST_OPEN=1, or a beta_redemptions row; unreadable flag means closed. This is the code's sales gate. | read in the code | `apps/web/lib/server/billing-waitlist-access.ts:28-52`; `apps/web/lib/feature-flags/billing-upgrade-gate.ts` |
| Managed Free is public alpha after sign-in since 2026-06-27; AGI_MANAGED_COMPUTE_PRIVATE_BETA is only a kill-switch. | stated requirement | `docs/product/definition.md`; `docs/product/commercial.md Bootstrap Rule`; `apps/web/lib/managed-compute-gate.ts:40 (env name)` |
| Local mode never silently reaches BYOK or Cloud; the typed Local contract has cloudEgressAllowed false and failover refuse. | read in the code | `packages/contracts/types/src/trust-mode-contract.ts:52-60` |
| Mobile has no BYOK mode in v1. | read in the code | `apps/mobile/src/features/chat/utils/sessionLabeling.ts:10`; `docs/product/definition.md Surface Roles` |
| Individual plans are monthly only; Team keeps yearly. Decided 2026-09-27. | stated requirement | `docs/decisions/2026-09-27-founder-decisions.md D-2026-09-27-01` |
| The minimum account age is 18, enforced in code: ACCOUNT_MINIMUM_AGE = 18 and the mobile age gate floors every regional threshold at it. | read in the code | `packages/contracts/types/src/account-eligibility.ts:1`; `apps/mobile/src/features/auth/services/ageGate.ts:25-26, 50, 69-70` |
| Local mode on Mobile needs no account, but the on-device age confirmation comes first; Electron Desktop chat has no Local mode. | read in the code | `apps/mobile/src/features/auth/services/rootRouting.ts:30-60`; `apps/mobile/app/index.tsx:9-12` |
| Electron is the public Desktop. A 2026-10-24 amendment records an owner choice to ship Tauri as a second public app (name undecided), but AGENTS.md and README.md still treat Tauri as internal and the Tauri window shows the Vite renderer, not the hosted web app. Public status is an owner question. | read in the code | `docs/decisions/2026-09-15-founder-decisions.md:78-99`; `AGENTS.md section 5`; `README.md:78`; `apps/desktop/src-tauri/tauri.conf.json:9-10` |
| Serial surface order is Website, Mobile, Desktop, Chrome, CLI, VS Code (founder 2026-09-21). | stated requirement | `docs/product/definition.md Launch Lock`; `docs/product/requirements.md 2.2` |
| Surface feature matrix today: 190 present, 106 absent, 60 unverified, 1 partial over 51 features; Present means located, not exercised. | read in the code | `docs/product/surface-feature-matrix.json (computed)`; `docs/product/surface-feature-matrix.md header` |
| Two continuity domains: Account Cloud (Web, Mobile Cloud, Desktop Cloud, eligible Chrome) and Host Developer (Desktop Code, CLI, VS Code). | stated requirement | `docs/product/definition.md`; `docs/product/experience-contract.md section 1` |
| On mobile in Local mode only device-scoped destinations are shown; unclassified screens count as cloud. | read in the code | `apps/mobile/src/features/shell/destinationScope.ts:54-63` |
| Model-improvement training switches (chats, voice) are decided opt-in and off by default on 2026-11-13, pending lawyer review; nothing uses customer content for training today. | stated requirement | `docs/decisions/2026-11-13-founder-decisions.md D-2026-11-13-03` |
| Model picker on mobile: Auto only, with Instant, Economy, Images, Files filters from the catalog; web and desktop keep Instant, Best, Economy. | stated requirement | `docs/decisions/2026-11-12-founder-decisions.md D-2026-11-12-07` |
| Managed turns that cross a usage window finish on the plan; monthly allowance is a hard edge (2026-10-25). | stated requirement | `docs/decisions/2026-09-27-founder-decisions.md D-2026-10-25-01` |
| Per-seat credits, two-seat minimum for Team (decision 29, 2026-10-22). | read in the code | `packages/contracts/types/src/billing-catalog.ts:154`; `audit/decisions/founder-decisions.md item 9` |
| US-only managed data and inference, on a region-neutral design. | stated requirement | `docs/decisions/2026-09-04-region-neutral-data-residency.md` |
| Model IDs may be literals only in the generated catalog; defaults reference family slots. | stated requirement | `AGENTS.md section 4` |
| Competitive guidance: ChatGPT and Claude primary references; parity measured by outcomes and continuity, not label matching. | stated requirement | `docs/product/competitive-guidance.md section 1`; `docs/product/definition.md Competitive Ecosystem Synthesis Lock` |
| No release has been shown to have run as of 2026-11-11: surface workflows have no runs, one draft release, store availability unverified. | stated requirement | `docs/product/competitive-guidance.md inventory text, checked 2026-11-11` |
| No repository source states a no-sales-before-2027-01-01 decision; a search found only test fixtures and contract dates. The code's sales gate is the waitlist and access-code gate. | unknown | `grep of apps/web/lib, apps/web/app, packages/contracts, docs and apps/mobile/src for 2027-01-01` (not found); `apps/web/lib/server/billing-waitlist-access.ts` |

## Open questions

- Whether Local mode on Electron desktop and the CLI works fully signed out is documented as yes (requirements.md 7.1); Mobile is verified in code (no account, age confirmation first).
- Whether the owner's recorded 2027-01-01 sales deferral exists in any repository record; none found.
- Whether the public status of the Tauri app is second public desktop app (2026-10-24 decision) or internal (AGENTS.md, README.md); the decision says it loads the hosted web app, but the code shows the Vite renderer. Owner question.
- Whether every surface calls effectivePlanTier and the shared entitlement path; only the contract file was read.
- The Free chat daily share per account versus the 2026-10-07 no-cap decision (no record of that decision found).
- Whether surface-by-mode support matrix (item 25) is published anywhere; no default exists.
- The full contents of founder-actions.md (106 KB) and wire-or-cut.md (976 KB) were not read; requirements and decisions inside them may be missing.
- Whether mobile has been submitted to any store; the repository does not settle it.
- Model-improvement switch wording and minimum age wording await legal review.

## Project documents found out of date

- `docs/product/requirements.md section 12 (Desktop Requirements)`: Says Desktop exposes Local, BYOK and Cloud modes and is the local-private compute host with BYOK setup. The code says: definition.md, experience-contract.md 12.2 and D-2026-09-15-04 say the public Electron Desktop shows hosted Cloud chat with inference in Managed Cloud; Local and BYOK live in the retained Tauri host. (docs/product/requirements.md lines 1108-1147 versus docs/product/definition.md Surface Roles and docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-04)
- `docs/product/requirements.md section 11 (Website Requirements)`: Describes Website v1 as a pricing placeholder that must not launch a full Cloud chat product. The code says: definition.md and commercial.md say Managed Free chat is open to signed-in users since 2026-06-27 and Web chat is subscription-backed. (docs/product/requirements.md lines 1080-1107 versus docs/product/definition.md Launch Lock)
- `docs/decisions/README.md`: Dated record list omits 2026-11-12 and 2026-11-13 founder decisions; last updated 2026-11-11. The code says: Both files exist in docs/decisions. (ls docs/decisions; README Decision Sources list)
- `audit/decisions/open-questions.md (matrix paragraph)`: Reports matrix totals of 184 present, 95 absent, 63 unverified, 1 partial as of 2026-09-20. The code says: The JSON now computes to 190 present, 106 absent, 60 unverified, 1 partial. (computed from docs/product/surface-feature-matrix.json)
- `docs/decisions/2026-09-27-founder-decisions.md D-2026-09-27-01 and docs/product/commercial.md`: Name plans Pro, Max 5x, Max 20x and max_15x. The code says: Public labels are Premium (`pro`), Max (`max`) and Ultra (`max_15x`). (packages/contracts/types/src/billing-catalog.ts:192-207)
- `docs/product/competitive-guidance.md (surface inventory)`: States Tauri is not a second public Desktop 'under the current founder decision'. The code says: D-2026-09-15-04 records a 2026-10-24 owner choice to ship Tauri as a second public app, yet AGENTS.md and README.md still treat Tauri as internal; the public status is unresolved. (docs/product/competitive-guidance.md inventory table row Retained Tauri Desktop versus docs/decisions/2026-09-15-founder-decisions.md lines 78-99)
