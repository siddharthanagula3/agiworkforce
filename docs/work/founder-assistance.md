# Founder assistance

Status: Current
Owner: Founder
Last updated: 2026-09-14

Only actions that need the founder: an account, a credential, a signature, a
paid decision, or a call the founder reserves. Engineering work is never listed
here; it lives in `ACTIVE_ISSUES.md`. An entry is deleted the moment the action
is done and the dependent behaviour is verified live.

Impact: RELEASE-BLOCKING (a surface cannot ship publicly) · FEATURE-BLOCKING
(one capability stays dark) · EXTERNAL-APPROVAL (waiting on a third party) ·
NON-BLOCKING.

## [Billing / Stripe] Live-mode cutover, Team product and price cleanup

**Why founder assistance is required**
Restricted-key permissions and the go-live call exist only in the Stripe
Dashboard.
**Exact action**

1. Decide go-live timing.
2. On the CLI's live restricted key enable Products:Write and Features:Write.
3. Create the live Team, Basic and Max 15x products and prices to match
   `packages/contracts/types/src/billing-catalog.ts`; archive the five active
   live prices that contradict it; revoke the temporary write permission.
4. Repoint every Vercel `STRIPE_PRICE_*` variable in the same change as the
   live key; redeploy; run one real-card checkout and refund.

**Where** Stripe Dashboard, Vercel Production environment.
**Needed input** The go/no-go call and about ten minutes of dashboard edits.
**How to verify completion** `/api/pricing/localized` reports checkout-ready
ids for every plan; one live checkout provisions once; zero contradicting
active prices.

**What remains after founder action** Nothing; checkout, webhook and ledger code ship and are tested.
**Impact** RELEASE-BLOCKING
**What remains after founder action** Until the cutover, `/api/cron/reconcile-credits` answers 500 once a day because six stored subscription ids are unknown to the live Stripe account ("refusing to guess its terminal state", production log 2026-09-10 00:30 UTC); the queue itself processes fine.
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Mobile] Store submission accounts, products, listing facts

**Why founder assistance is required**
Apple and Google agreements, merchant profiles, products and contact details
exist only in the store consoles and belong to the account owner.
**Exact action**

1. Sign the Apple Paid Applications agreement and apply to the Small Business Program.
2. Create the Play Console merchant profile (permanent).
3. Create the five subscriptions and four top-ups in both stores with the ids in `apps/mobile/store-listing/*.json`.
4. Copy the App Store Connect Issuer ID and create the Play service-account JSON for `pnpm release:asc-probe` and `release:preflight`.
5. Replace the three `__FOUNDER_TO_FILL__` phone fields and supply the two `__DESIGN_TO_PRODUCE__` graphics.
6. Register India OIDAR, EU OSS and UK VAT before the first sale.

**Where** App Store Connect, Google Play Console, `apps/mobile/store-listing/`, `apps/mobile/eas.json`.
**Needed input** Signatures, a contact phone, tax registrations, about ninety minutes.
**How to verify completion** `pnpm --filter @agiworkforce/mobile release:preflight` passes for the production profile; no placeholder tokens remain in the listing files.
**What remains after founder action** Sandbox purchase verification, then `MOBILE_IAP_ENABLED=true`.
**Impact** RELEASE-BLOCKING (mobile stores)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Mobile / India] RBI auto-renewal ceiling and Razorpay

**Why founder assistance is required**
Pricing under the RBI ceiling is a commercial call; Razorpay's support for
recurring payments from a foreign entity is a sales conversation.
**Exact action** Pick how Max 15x and Team are sold in India (under the ceiling, annual or invoice only, seat cap, or not yet); decide the INR top-up rate; ask Razorpay sales whether recurring subscriptions are available to a foreign entity; get an accountant's view on OIDAR GST.
**Where** Pricing decision, Razorpay sales, accountant.
**Needed input** One pricing decision and one external conversation.
**How to verify completion** The decision is recorded in `docs/decisions/`; if Razorpay proceeds, its answer picks the integration shape.
**What remains after founder action** India e-mandate delay handling (engineering) once INR billing is live.
**Impact** FEATURE-BLOCKING (India only)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Routing] Provider gateways: commercial terms and credentials (D-2026-09-10-01)

**Why founder assistance is required**
Serving managed traffic through a re-hosting gateway is a commercial-terms and
data-residency commitment the founder reserves, and each gateway needs a funded
account. On main the DeepSeek defaults and the Moonshot flagship have no
managed route since the abroad-endpoint exclusion, and the Zhipu default has one.
**Exact action** Decide, per gateway, whether its terms allow AGI to resell the model to managed users (Vercel AI Gateway, Cloudflare Workers AI, Experiential Labs, DeepInfra, Together, Novita, Cheaper Inference); fund the accepted ones; set their `*_API_KEY` and `*_BASE_URL` variables in Vercel Production and `.env.local`. Say which of options (a) promote the Vercel gateway harness, (b) move DeepSeek's OpenRouter routes to the managed harness, (c) drop DeepSeek and Moonshot from the managed catalogue.
**Where** `docs/decisions/2026-09-10-managed-gateway-routes.md`, each gateway's console, Vercel environment.
**Needed input** Terms acceptance and funding per gateway.
**How to verify completion** An explicit DeepSeek or Moonshot selection by a managed user no longer answers 422; `/operator` Routes shows each accepted gateway credentialed.
**What remains after founder action** Flip the routes' `commercialStatus` in the catalogue, regenerate, and land the uncommitted registry work.
**Impact** FEATURE-BLOCKING (managed routes for those vendors; cheaper capacity)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Localization] Translating the v3 namespace for ten languages

**Why founder assistance is required**
Settings offers twelve languages. The `v3` dictionary that names the sidebar, empty chat, response actions, thinking, artifacts, search, the account menu, customize, skills and connectors is translated for Spanish only; in the other ten languages 255 to 259 of its 330 values are still English (measured 2026-09-15), so a user who picks French, German, Japanese, Hindi, Arabic, Italian, Korean, Portuguese, Russian or Chinese sees most of the chat surface in English. ChatGPT and Claude ship every offered language fully. Producing 2,500 strings is a spend and a brand-voice call: a model-assisted pass reviewed by a native reader per language is the leaders' floor, a vendor is the ceiling.
**Exact action** Say which of the two routes to take, or narrow the offered languages to the ones that will be reviewed; name a reviewer per kept language if there is one. Say too whether the other clients should follow the account language: today mobile follows the device locale with almost no translated strings, the Chrome extension ships one locale and VS Code has none.
**Where** `packages/ui/i18n/locales/<lang>/v3.json`; the language control in Settings → General.
**Needed input** One product decision and, for the model-assisted route, permission to spend plan credits on the batch.
**How to verify completion** The English-value count per language in `v3.json` drops to the product names only, and the settings pass under each language shows one language on the chat surface.
**What remains after founder action** The batch itself, its review loop and a guard that fails the build when a locale trails English by more than a few keys; all engineering.
**Impact** NON-BLOCKING for English; BLOCKING for offering the other languages honestly
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Product] Tool-approval defaults versus the leaders (D-2026-09-10-02)

**Why founder assistance is required**
The founder set the policy on 2026-09-08 that even "run read-only actions
without asking" still asks before code execution, web search and page
fetches. ChatGPT and Claude run sandboxed code and search without asking, so
a plain file-analysis question here needs two manual approvals.
**Exact action** Say whether sandboxed code execution and web search may run without approval in the read-only mode (connector writes keep asking either way), or whether the current gate stays.
**Where** Settings → Capabilities → Tool approvals; `apps/web/shared/types/toolApprovalPolicy.ts`.
**Needed input** One product-security decision.
**How to verify completion** A CSV analysis on the default model completes without an approval prompt (if relaxed), or the docs and banners say clearly that code and search ask first (if kept).
**What remains after founder action** The policy change and the copy, both engineering.
**Impact** NON-BLOCKING (the gate works; it is friction, not breakage)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Connectors] Register OAuth apps at six providers

**Why founder assistance is required**
Google Workspace, Microsoft 365, Slack, Box, HubSpot and Atlassian require a
developer-console registration under the company identity.
**Exact action** Register a production OAuth app at each (Gmail, Calendar and Drive as separate apps) with redirect URI `https://agiworkforce.com/api/connectors/oauth/callback` and read scopes only; hand the client id and secret to the agent for `CONNECTOR_OAUTH_<ID>_CLIENT_ID` / `_SECRET`.
**Where** Each provider's developer or admin console.
**Needed input** Domain verification per provider, about fifteen minutes each.
**How to verify completion** `GET /api/connectors` lists each provider as available.
**What remains after founder action** Credential install and a live connect test (agent).
**Impact** FEATURE-BLOCKING (those six connectors)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Connectors] Partner-program allowlisting at six MCP vendors

**Why founder assistance is required**
Asana, Dropbox, Figma, Intercom, Square and Vercel refuse dynamic client
registration and require a business application.
**Exact action** Apply to each vendor's partner programme asking for the redirect URI above to be allowlisted; forward any issued client credentials.
**Where** Each vendor's partner or developer-relations programme.
**Needed input** One application per vendor; weeks of turnaround.
**How to verify completion** The agent flips each directory entry from preregistered to dynamic and a live connect succeeds.
**What remains after founder action** Verification only.
**Impact** EXTERNAL-APPROVAL (six connectors; the directory already shows them as not yet available)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Connectors] OAuth client pairs for the twenty-seven remaining first-party connectors

**Why founder assistance is required**
Each of these is a developer-console registration under the company identity,
and the client secret is a credential only the account owner can issue. The two
entries above own a different set of vendors; none of these twenty-seven is
listed there.
**Exact action** Register one production OAuth app per vendor with redirect URI `https://agiworkforce.com/api/connectors/oauth/callback` and read scopes only, then hand over the client id and secret for each. The env names follow one rule: the connector id upper-cased with hyphens as underscores, prefixed `CONNECTOR_OAUTH_` and suffixed `_CLIENT_ID` or `_CLIENT_SECRET`, for example `CONNECTOR_OAUTH_GOOGLE_SHEETS_CLIENT_ID` and `CONNECTOR_OAUTH_GOOGLE_SHEETS_CLIENT_SECRET`. The twenty-seven connector ids are google-sheets, zoom, salesforce, calendly, google-analytics, mailchimp, shopify, linkedin, twitter, discord, basecamp, evernote, pagerduty, gitlab, bitbucket, gcp, azure, bigquery, pipedrive, adobe, quickbooks, xero, instagram, facebook, youtube, epic-fhir and cerner. Several share one console (Google covers google-sheets, google-analytics, bigquery, gcp and youtube; Meta covers instagram and facebook), so the app count is lower than the connector count.
**Where** Each vendor's developer or admin console, then the Vercel Production environment.
**Needed input** One registration per vendor console, plus the decision of which vendors are worth registering at all.
**How to verify completion** `GET /api/connectors` names each id in `available`, and its Settings and Connectors card offers Connect instead of Needs setup.
**What remains after founder action** The descriptor entry in `CONNECTOR_OAUTH_PROVIDERS_JSON` and a live connect test, both engineering.
**Impact** FEATURE-BLOCKING (twenty-seven connectors; each is honestly shown as Needs setup until then)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Connectors] One live OAuth consent on a real account (LIVE-3)

**Why founder assistance is required**
Discover, authorize, expire and revoke can only be proven against a real
third-party account, and vendor consent screens require a person.
**Exact action** In Settings → Connectors connect one vendor (Linear is ready) with an account you own, use it once in a chat, then revoke it from the vendor side.
**Where** The live product, Settings → Connectors.
**Needed input** Five minutes and one account.
**How to verify completion** Tell the agent; the connector row shows connected, then revoked, and the chat turn that used it is in history.
**What remains after founder action** Nothing.
**Impact** NON-BLOCKING (connectors work; this closes the live-validation row)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Memory] Whether auto-memory may spend a model call per turn (AGI-29)

**Why founder assistance is required**
The extraction is written, wired and tested; what is not decided is whether
memory may cost one cheap utility completion on every eligible turn. That is a
per-turn spend, which is a founder call rather than an engineering one.
**Exact action** Say yes or no. Yes means setting `AGI_MODEL_MEMORY_EXTRACTION=1` in the Vercel Production and Preview environments; no means the pattern list stays and the row closes as decided rather than open. Temporary chats, Memory-off chats, the API surface and zero-data-retention turns are never sent either way, and every failure falls back to the patterns, so the downside is spend rather than behaviour.
**Where** Vercel environment variables, or a one-line answer.
**Needed input** One decision.
**How to verify completion** A fact stated with no trigger phrase, for example "I just moved to Berlin", is stored and answered in a second conversation.
**What remains after founder action** Setting the variable and one live two-chat check, both engineering.
**Metering** Since 2026-09-14 the extraction call is reserved and finalized on
the managed usage ledger under the `memory_extraction` quota feature, so it
counts against the session, weekly and flagship caps and appears on
`GET /api/usage` like any other spend. A turn whose reservation is refused
skips the model and keeps the pattern candidates. The only decision still open
is the on/off call above; nothing about where the spend is recorded remains
undecided.
**Impact** NON-BLOCKING (memory works today for the phrasings the patterns know)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Legal] Counsel review and grievance facts (DPDP)

**Why founder assistance is required**
Breach-notice wording needs a lawyer; the grievance officer, notice address
and mailbox are facts about the business.
**Exact action** Send `docs/runbooks/personal-data-breach.md` §3, §4 and §5 (both notice templates) to counsel; name a Grievance Officer or confirm a role account is acceptable under Indian law; confirm or replace `NOTICE_ADDRESS`; decide whether `privacy@` and `grievance@` exist and who watches them against the 30-day target.
**Where** `apps/web/lib/legal-constants.ts`, the runbook.
**Needed input** One counsel pass and a few confirmations.
**How to verify completion** Runbook header reads counsel-approved; `GRIEVANCE_OFFICER_DESIGNATE` is set or the role-account decision is written down.
**What remains after founder action** Nothing; code and tests exist.
**Impact** NON-BLOCKING today, legal exposure if an incident lands first. This is not a hold on sending.
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Trust & Safety] Minimum-age policy

**Why founder assistance is required**
No verifiable parental consent exists; refusing minors or buying a consent
vendor is a legal-risk and spend decision.
**Exact action** Choose: refuse users under the regional threshold, or name and fund a verifiable-parental-consent vendor; have counsel confirm the thresholds and whether a timezone-inferred region is defensible.
**Where** `apps/mobile/src/features/auth/services/ageGate.ts`.
**Needed input** One risk decision, possibly a vendor contract.
**How to verify completion** The under-threshold flow matches the choice end to end; no marketing or listing claims compliance before then.
**What remains after founder action** Build the chosen option.
**Impact** RELEASE-BLOCKING (mobile stores)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Security] Dispatch manual pairing trust model

**Why founder assistance is required**
The relay can forge signed approval frames on the manual pairing path; the
three fixes trade security against pairing UX and force every device to re-pair.
**Exact action** Pick QR-only pairing, honestly labelled relay-trusted manual entry, or manual entry verified by a short authentication string; approve the `DISPATCH_HMAC_REQUIRED_AFTER` cutover date.
**Where** Desktop Dispatch pairing; plan in `ExecutionPlan.md` SEC-16.
**Needed input** One decision and a cutover date.
**How to verify completion** The chosen option ships and the re-pair cutover is announced.
**What remains after founder action** Engineering per SEC-16.
**Impact** RELEASE-BLOCKING (desktop–mobile Dispatch)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Security] Managed Cloud plan-tier gate on bare session tokens

**Why founder assistance is required**
A free-tier account can script around the Pro-only API paywall with a bare
session token; two remediations were rejected in review, and the durable fix
changes what a credential carries. Registered as
`WEB-SEC-SCAN-2026-09-09-F88`: an API key and a developer credential already
pin their surface, a bare session token does not, so the plan gate reads the
advisory `x-agi-surface` header the caller controls.
**Exact action** Choose one of three: bind the surface into a Clerk custom session claim (`CLERK_SECRET_KEY` already set, no new environment variable; the claim is added in the Clerk dashboard under Sessions, Customize session token); require a surface-bearing credential for non-browser callers, which makes every CLI, extension and IDE caller mint a developer token first; or accept the residual and gate on billing audit instead.
**Where** The header is trusted in `apps/web/app/api/llm/v1/chat/completions/lib/request-surface.ts`; the plan gate that acts on it is `enforceManagedCloudSurface` in `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts`.
**Needed input** One security-architecture decision. No new deployment secret under any of the three options.
**How to verify completion** With a free-tier account, a bare session token sent to `POST /api/llm/v1/chat/completions` with `x-agi-surface: cli` answers `developer_surface_plan_required` rather than completing the turn.
**What remains after founder action** Engineering.
**Impact** RELEASE-BLOCKING (revenue integrity, no data exposure)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Security / Mobile] TLS pin key selection

**Why founder assistance is required**
Pinning is built and report-only; choosing which CA keys to trust per host is
a security-owner call, and a wrong choice hard-fails every installed app.
**Exact action** Pick two or more keys per host (issuing CA and root, never the leaf); decide whether the OpenAI and Anthropic hosts are pinned at all; then run the four-step provisioning in `apps/mobile/lib/pinning.ts` and flip `PINNING_ROLLOUT`.
**Where** `apps/mobile/lib/pinning.ts`; the build plugin `./native/withAGITlsPinning.cjs` stamps the pins.
**Needed input** The key selection.
**How to verify completion** `apps/mobile/__tests__/pinning.test.ts` passes with real hashes and a release build logs no report-only refusals.
**What remains after founder action** Route the pairing WebSocket and upload paths through `secureFetch` (engineering). Closes CLAUDE-SECURITY-20260821-170634 F6 (CWE-295).
**Impact** RELEASE-BLOCKING (mobile MITM exposure)
**Status** BLOCKED_BY_HUMAN, FOUNDER ACTION REQUIRED

## [Infra] `ALLOWED_ORIGINS` on the signaling deploy

**Why founder assistance is required**
The Fly and Railway secrets are outside the repo, and the value needs the real
client Origin headers. Missing it fails closed (pairing refused), not open.
**Exact action** Confirm the production state; set `ALLOWED_ORIGINS` to the exact desktop and mobile origins and confirm `SIGNALING_INTERNAL_SECRET` on both deploys.
**Where** Fly.io and Railway dashboards for `services/signaling-server`.
**Needed input** Dashboard access.
**How to verify completion** A desktop–mobile pairing completes in production.
**What remains after founder action** Nothing.
**Impact** RELEASE-BLOCKING if unset (pairing), fails safe
**Status** BLOCKED, FOUNDER ACTION REQUIRED (confirm current state first)

## [Chrome extension] Chrome Web Store public key

**Why founder assistance is required**
The published item's key is visible only in the Web Store dashboard.
**Exact action** Copy the item's public key into `CHROME_EXTENSION_PUBLIC_KEY` in the deploy environment.
**Where** Chrome Web Store Developer Dashboard.
**Needed input** Two minutes.
**How to verify completion** `pnpm --filter @agiworkforce/extension package` produces the item id in `CWS_EXTENSION_ID`.
**What remains after founder action** Exact-package acceptance pass (agent).
**Impact** FEATURE-BLOCKING (store-exact release only)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [VS Code] Signed protocol-7 CLI release

**Why founder assistance is required**
Publishing a signed multi-platform binary needs signing and distribution
credentials that are not in the repository.
**Exact action** Provide code-signing credentials and a release channel for the `agi` CLI (protocol 7, 1.7.1 or later) across the Marketplace platforms.
**Where** Signing accounts, release infrastructure.
**Needed input** Credentials and a channel decision.
**How to verify completion** The VS Code extension completes a developer-session turn against the published CLI.
**What remains after founder action** The release pipeline (engineering).
**Impact** FEATURE-BLOCKING (VS Code developer sessions)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Maps] Routing credential for map-card route lines

**Why founder assistance is required**
Every routing engine needs an account; the existing Google key is
generative-language only.
**Exact action** Create an openrouteservice token (free tier) or a restricted Google Maps Platform key; set `OPENROUTE_API_KEY` or `GOOGLE_MAPS_API_KEY` in Vercel Production.
**Where** openrouteservice.org or Google Cloud console; Vercel environment.
**Needed input** One signup.
**How to verify completion** A map card draws a route line.
**What remains after founder action** Nothing.
**Impact** NON-BLOCKING (cosmetic; map cards already work)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [CI] Funded `ANTHROPIC_API_KEY` secret for the scheduled quality evals

**Why founder assistance is required**
The scheduled eval needs a budgeted key; none exists as a repo secret and the
2026-09-07 run failed for that reason.
**Exact action** Add a dedicated funded key under repository Settings → Secrets → Actions and dispatch the workflow once.
**Where** GitHub repository settings, Anthropic console.
**Needed input** A small weekly budget.
**How to verify completion** The live eval job scores all three corpora.
**What remains after founder action** Nothing.
**Impact** NON-BLOCKING (offline harness still runs)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Desktop] Approved Local model for Desktop Tasks

**Why founder assistance is required**
No installed local model carries both tools and agentic capability; picking
the model that meets the 16 GB quality bar is a product call.
**Exact action** Name the model tag and digest for the minimum target and approve its validation matrix.
**Where** Model registry curation; the fail-closed guards already block Tasks in Local mode.
**Needed input** One model choice.
**How to verify completion** Desktop Tasks run on the approved local model through its validation matrix.
**What remains after founder action** Registry entry and validation run.
**Impact** FEATURE-BLOCKING (Local-mode Tasks only)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Privacy] Legacy email digests before `EMAIL_HASH_PEPPER`

**Why founder assistance is required**
Deciding whether pre-pepper rows are re-keyed or accepted as legacy needs the
date the variable went live in Vercel Production, which only the dashboard history shows.
**Exact action** Read the deploy history for the first deployment carrying `EMAIL_HASH_PEPPER`; decide whether `waitlist.email` and `consent_records.subject_email_sha256` rows before it are re-keyed or kept.
**Where** Vercel dashboard.
**Needed input** One date and one decision.
**How to verify completion** Decision recorded; any re-key migration applied.
**What remains after founder action** The migration, if chosen.
**Impact** NON-BLOCKING
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Mobile] Crash reporting stance

**Why founder assistance is required**
The current no-crash-reporting privacy stance is the founder's; reversing it
changes privacy copy and store labels.
**Exact action** Keep the stance (and say so more prominently in the app) or supply a mobile Sentry DSN and approve the updated privacy copy and store labels.
**Where** Mobile privacy copy, store listings, `apps/mobile` telemetry config.
**Needed input** One decision.
**How to verify completion** Copy, labels and code agree.
**What remains after founder action** Engineering either way.
**Impact** NON-BLOCKING
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [QA] A workspace-bearing QA account

**Why founder assistance is required**
The QA account has no organization, so admin and team surfaces only ever
render their empty states.
**Exact action** Give the QA account a real organization, or confirm a test-mode Team checkout is acceptable once the Stripe cutover lands.
**Where** Account administration.
**Needed input** One provisioning action.
**How to verify completion** Team and workspace admin pages render data for the QA account.
**What remains after founder action** Nothing; the agent seeds the rest through the product.
**Impact** NON-BLOCKING (coverage debt)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Billing] Search bounds and the COGS ledger split (migration 0183)

**Why founder assistance is required**
Running a production migration and changing what a paying customer is charged
are both calls the founder reserves.
**Exact action** DO NOT APPLY `0183`. This migration is already in production as `0180_provider_cost_events_customer_and_cogs_split.sql`, applied between 09-07 and 09-11; the two files carry the same name and differ only in the number inside their own comments. `0183` is this branch's duplicate of it and is withdrawn by the reconciliation in ACTIVE_ISSUES. The only thing still open here is confirming the search bounds shipping alongside it: 20 included searches per 30 days on Free, 300 on paid interactive chat, and 1 cent per Perplexity call or 2 cents per grounded call on API, CLI, VS Code, scheduled agents, AGI Work and deep research.
**Where** Neon production (migration), no dashboard or env change; the two existing rate overrides `AGI_PERPLEXITY_SEARCH_MICROUSD_PER_CALL` and `AGI_GOOGLE_GROUNDING_MICROUSD_PER_CALL` are unchanged and stay unset.
**Needed input** One confirmation of the bounds. No migration approval.
**How to verify completion** `provider_cost_events` carries `customer_canonical_microusd` and `feature`, which it already should; a search on a paid account writes a row with `feature = 'web_search_perplexity'`; the per-user count the bounds read is non-zero.
**What remains after founder action** Nothing; the bounds and the ledger writes ship with the migration that is already applied.
**Impact** NON-BLOCKING (the schema is in production; only the bounds confirmation is open)
**Status** CORRECTED 2026-09-12, NO MIGRATION TO APPLY

## [Billing] Provider cost reconciliation credentials

**Why founder assistance is required**
Both figures come from organization-level admin credentials that only an owner
of the provider account can mint; no engineering change can produce them.
**Exact action**

1. OpenAI: create an Admin API key with the `api.usage.read` scope at the
   organization level and set it in Vercel Production as `OPENAI_ADMIN_API_KEY`.
   A normal project key cannot read the Costs API and returns 401.
2. Anthropic: create an organization Admin API key and set it in Vercel
   Production as `ANTHROPIC_ADMIN_API_KEY`. The workspace key already used for
   inference cannot read the cost report.

**Where** OpenAI platform settings, Anthropic Console organization settings,
then Vercel Production environment variables. No code change either way.
**Needed input** Two credentials, pasted into Vercel.
**How to verify completion** `/api/cron/reconcile-provider-costs` answers with
`status: "reported"` for openai and anthropic instead of `not_configured`, and
the admin economics page shows a reported figure and a gap for yesterday.
**What remains after founder action** Nothing; the daily cron, the storage
table and the gap comparison ship with this change. Until each variable is set
that provider is skipped and its ledger cost stays an unverified estimate.
**Impact** NON-BLOCKING (margin stays estimate-only)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Billing] Reconciliation storage (migration 0184)

**Why founder assistance is required**
It no longer is. This entry asked for a production migration that had already
been applied under a different number.
**Exact action** DO NOT APPLY `0184`. It is already in production as
`0181_provider_cost_reconciliation_days.sql`, applied between 09-07 and 09-11.
The two files carry the same name and differ only in the number inside their
own comments. `0184` is this branch's duplicate and is withdrawn by the
reconciliation in ACTIVE_ISSUES.
**Where** Nowhere. No Neon, dashboard or environment change.
**Needed input** None.
**How to verify completion** `provider_cost_reconciliation_days` already
exists; after a nightly run it holds one row per provider that answered. If it
is absent, that is a reconciliation question, not a reason to apply `0184`.
**What remains after founder action** Nothing.
**Impact** NON-BLOCKING
**Status** CORRECTED 2026-09-12, NO MIGRATION TO APPLY

## [QA] A dedicated paid QA account for billing verification

**Why founder assistance is required**
Creating an account and setting its plan is an account action, and the billing
gate cannot be proven without one. The harness must not run on the founder's
own Max 15x account: verification spends real allowance, and the erroneous
$1.00 settlement already landed there.
**Exact action**

1. Create a normal account, for example `qa-billing@agiworkforce.com`, through
   the standard sign-up.
2. Put it on a paid plan that exercises the paid ledger.
3. Put its email and password in a gitignored local `.env.qa`, never in the
   repository and never in a log.

**Where** Production sign-up, then a local file.
**Needed input** One account, one plan assignment, one credential handoff.
**How to verify completion** The harness signs in through the normal login
form, sends one Luna turn, and the resulting `managed_usage_requests` row
settles at the token-derived cost rather than a dollar-scale amount.
**What remains after founder action** Nothing; the emergency branch is pushed
and the regression tests are green. Until the account exists, Preview and
Production settlement cannot be verified with one controlled request, which is
the gate the emergency deployment is held behind.
**Impact** RELEASE-BLOCKING
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Providers] The Anthropic account has no API credit

**Why founder assistance is required**
Adding credit to a provider account is a payment action on Anthropic's console.
**Exact action**

1. Open the Anthropic console, Plans and Billing.
2. Add credit or enable auto-reload for the key that production uses.
3. Confirm the same key is the one in the production `ANTHROPIC_API_KEY`.

**Where** console.anthropic.com, then Vercel Production if the key changes.
**Needed input** One payment decision.
**How to verify completion** A minimal `/v1/messages` call to any Anthropic
model answers instead of returning 400 "Your credit balance is too
low to access the Anthropic API". A smoke probe on 2026-09-12 04:00 UTC got
that 400 for every Anthropic model while OpenAI, Google, DeepSeek, Qwen, Moonshot and xAI all
answered normally.
**What remains after founder action** Nothing in code. Until it is done every
Anthropic model is unservable for everyone, not only for event visitors:
every Anthropic model in the catalogue sits on this one account, so a paying Pro
or Max subscriber who selects any of them gets a provider error, and they are
held out of the event allowlist for the same reason.

The outage is now handled rather than merely classified: an unfunded provider
is marked degraded for five minutes, the catalogue reports those models
`temporarilyUnavailable`, and the picker shows them unselectable instead of
letting a customer send a turn that cannot succeed. Nothing is deleted, so the
models return on their own within five minutes of the credit landing, with no
deploy and no configuration change.
**Impact** RELEASE-BLOCKING
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Event] Production environment for the public event

**Why founder assistance is required**
Setting production environment variables is a deployment action on the Vercel
project, and the spend ceiling is a money decision.
**Exact action**

1. Set `AGI_EVENT_MODELS` to the comma-separated canonical model ids the event
   offers. An id the registry does not know, or a deprecated one, is dropped
   rather than widening the promotion.
2. Set `AGI_EVENT_GLOBAL_BUDGET_USD` to the total the event may spend. Leaving
   it unset means no global ceiling at all, which is the wrong setting for a
   public event.
3. Set `AGI_EVENT_STARTS_AT` and `AGI_EVENT_ENDS_AT` to ISO instants, so the
   promotion expires on its own if the flag is forgotten.
4. Set `AGI_EVENT_ENABLED=1` last, and redeploy.

**Where** Vercel Production for the web project.
**Needed input** The model list, the budget number, and the two instants.
**How to verify completion** An anonymous request to `/api/models/catalogue`
returns the promoted models with `eventAccess: true`, and the picker shows
them badged "Free during event".
**What remains after founder action** Nothing. Four independent controls bound
the spend and each is reversible without a deploy: `AGI_EVENT_GLOBAL_BUDGET_USD`
for the event as a whole, the existing free rolling windows per user,
`AGI_EVENT_DISABLED_MODELS` to drop one model, and
`AGI_EVENT_DISABLED_PROVIDERS` to drop one supplier. The per-provider switch is
event-scoped, so paid customers who bought access to that provider keep it.
Clearing `AGI_EVENT_ENABLED` ends the promotion and restores permanent Free
behaviour; nothing is stored, so there is nothing to migrate back.
**Impact** BLOCKS THE EVENT
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Providers] MiniMax and Groq hold no credential

**Why founder assistance is required**
Creating a provider account and funding it is a payment and terms decision.
**Exact action**

1. Decide whether MiniMax is kept. Its own terms have never been read
   (the open question recorded under the gateway entry above), and it is
   currently served only through a marketplace route.
2. If it is kept, create a MiniMax account and set `MINIMAX_API_KEY` in
   Production.
3. Decide whether Groq is wanted at all. Three registry models are served only
   by Groq, so today no plan can run them.
4. If it is wanted, set `GROQ_API_KEY` in Production.

**Where** Each provider's console, then Vercel Production.
**Needed input** Two keep-or-drop decisions and, for each keep, one account.
**How to verify completion** A live sweep on 2026-09-12 called every selectable
managed chat route: 25 of 29 models answered. MiniMax answered through its
marketplace route; the Groq-only models could not be called by anyone. After
the keys are set, both answer on their direct routes.
**What remains after founder action** Nothing blocking. The catalogue already
withholds a model with no credentialed route, so neither provider is offered to
a customer today and no user sees a broken model. If Groq is dropped instead,
its three models should leave the registry rather than sit there unservable.
**Impact** FEATURE-BLOCKING (those models only)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [QA] Somewhere to exercise this work before it ships

**Why founder assistance is required**
Starting a server is a standing founder decision in this repository, and
deploying is gated on CI and on the founder's own approval.
**Exact action**

1. Either start the dev server and say so, or approve a preview deployment of
   `fix/provider-outage-health-2026-09-12`.
2. Say which of the two, so the confirmations below are run in the right place.

**Where** Localhost, or a Vercel preview of that branch.
**Needed input** One decision and, for the preview, one approval.
**How to verify completion** The branch's own confirmations become runnable.
Each was written down with the fix that needs it, and none can be made from a
checkout: a durable run for `LIVE-8`; a real sandbox for the attachment staging;
a live voice session for the delegated backend cost row; a reload for the turn
metadata and the citations; a long thread for the retry anchor; a fresh stack
for the listener warning; and a deployment for the route that our own data
policy excludes.
**What remains after founder action** Nothing in code for the items above. They
are implemented and unit tested; what is missing is observation, and every one
of them says so in its own entry rather than claiming a confirmation that was
never made.

Narrowed 2026-09-12 by what could be observed without either: the whole web
suite now runs against the branch in a clean worktree, 17,059 passing, and the
live site answers read-only requests, which measured three customer-visible
defects the branch fixes and which the same three requests will confirm after a
deploy. What is still unobservable from a checkout is everything behind a
session: a durable run, a real sandbox, a live voice session, a reload, and a
long transcript.
**Impact** BLOCKS VERIFICATION, NOT THE FIXES
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Database] Apply migrations 0183 to 0192 in production before the next deploy

**Why founder assistance is required**
Production database credentials exist only with the founder, and the deploy job
refuses to promote while a draft migration is unapplied.
**Exact action**

1. Rehearse on a Neon branch, then apply to production, with the procedure the
   0175 to 0182 batch used: `pnpm db:migrate -- apply --target branch`, then
   `pnpm db:migrate -- apply --target production --confirm-production`, with
   the production URL exported for the command.
2. The seven drafts: `0183_video_generation_completion_notice.sql` (a claim
   column so a finished video job is announced once), `0184_organization_shared_artifacts.sql`
   (artifact visibility plus the workspace grant table),
   `0185_org_shared_artifact_policy_recursion.sql` (splits the grant policy per
   command; without it every publish raises 42P17),
   `0186_organization_shared_sessions.sql` (the same two-part shape for
   conversation shares: a `visibility` column on `shared_sessions`, the
   `organization_shared_sessions` grant table, and row level security on
   `shared_sessions` itself with SELECT and UPDATE granted to `app_rls`, so a
   member read is decided by a policy rather than by a route),
   `0187_device_refresh_token_workspace_binding.sql` (an `organization_id`
   column on `device_refresh_tokens`, so removing a member from one workspace
   revokes the credentials that workspace issued instead of every credential on
   their account) and
   `0188_github_installation_verified_repositories.sql` (a
   `verified_repositories` column on `github_installations`, so a connected
   installation lists and clones only the repositories the linking GitHub
   account proved it can reach) and
   `0189_user_memories_per_user_identity.sql` (moves the `user_memories` row key
   from a global `id` to `(user_id, id)` and adds the `import_key` dedupe column,
   so one account can no longer occupy another's memory row id) and
   `0190_device_step_checkpoint.sql` (the checkpoint row that holds a cloud turn
   paused on a step the user's desktop must run, bound to one device, so the
   tool loop can resume from that device and refuse any other). Apply all eight
   in ascending order, 0183 first and 0190 last: each assumes the ones before it
   have run. The deployment carrying 0187 to 0190 must not go out before
   they are applied: the device pairing insert, the GitHub connect flow and the
   memory import insert all name the new columns, the memory sync and
   auto-memory inserts name `(user_id, id)` as their conflict target, which the
   old single-column key cannot satisfy, and a desktop turn that reaches a device
   step writes the checkpoint row before it pauses. The ninth is
   `0191_research_report_settled_cost.sql` (a nullable `settled_cost_microusd`
   column on `research_reports`, so a finished Deep Research report can state
   what the managed usage ledger settled for the run instead of leaving the
   cost unsaid). The tenth is `0192_project_knowledge_anchors.sql` (a nullable
   `extracted_anchors` column on `project_knowledge_files`, holding where each
   page or heading begins in the extracted text, so a turn answering from a
   project file can say which page it read). Apply both after 0190, 0191 first.

**Where** A terminal with the production database URL, as for the 0175 batch.
**Needed input** The production database URL and the confirm flag.
**How to verify completion** `pnpm db:migrate -- status` against production
lists 0192 as applied; the deploy job's migration verify step passes; importing
the same memory text twice adds it once and a memory sync push applies rather
than conflicts; a video
job completion produces one notice; an artifact and a conversation can each be
shared with the workspace, read by a member, and refused to a signed-out
visitor holding the link; a desktop pairs and refreshes without error; and the
GitHub connect flow reconnects an installation and still lists its
repositories; a finished Deep Research report names the credits the run
consumed; and a question answered from a multi-page PDF in a project names the
page it was answered from.
**What remains after founder action** Nothing in code.
**Impact** RELEASE-BLOCKING (the deploy job refuses to promote)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [QA] A QA credential the native SDKs can use

**Why founder assistance is required**
Creating a sign-in method on the QA account is an account action.
**Exact action**
Give the QA account a password (or a second QA account with one) and put it in
the local env files under the `E2E_` names the web harness reads. The web
harness signs in with a Clerk backend ticket, which the mobile app, the Chrome
extension and the Electron shell cannot consume, so every cloud-gated flow on
those three surfaces (share into the app, start Work from the phone, ask a
question about a page, approvals, cancel) was verified only at unit level today.
Also set `CHROME_EXTENSION_PUBLIC_KEY` for local builds so the extension id is
stable enough for Clerk to accept the sync.

**Where** Clerk dashboard for the QA account; the local env files.
**Needed input** A password or a second account, and the extension public key.
**How to verify completion** A native sign-in on the simulator and in the loaded
extension completes without a browser step; the deferred simulator and
extension flows above run end to end.
**What remains after founder action** Re-run those flows and record the captures.
**Impact** FEATURE-BLOCKING (native surfaces cannot be exercised end to end)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Routing] The zero-price OpenRouter router on paid plans

**Why founder assistance is required**
Whether a paying customer's prompt may reach an upstream that trains on it is a
data-handling decision, not an engineering one.
**Exact action**
Decide one of: keep the privacy-safe default shipped on 2026-09-14 (an explicit
pick of the zero-price router on any plan sends `data_collection: deny`, so
training-permitted upstreams are excluded and the router may answer "no
endpoints" when only those are online); allow training-permitted upstreams for
explicit picks on paid plans; or remove the router from the paid-plan pickers.
Also change the company OpenRouter account's privacy settings at
openrouter.ai/settings/privacy if the first option should succeed more often.
**Where** `packages/ai/model-registry/catalog/routing-policies.json`,
`packages/ai/providers/openrouter/src/provider-routing.ts`,
`docs/research/free-inference-tos-workbook-2026-09-01.md`, the OpenRouter dashboard.
**Needed input** One sentence naming the option.
**How to verify completion** A paid-plan pick of the free router answers, and the
registry contract test still refuses `free_` slots on paid tiers.
**What remains after founder action** Nothing for the default; a one-line policy
and provider change for either alternative.
**Impact** NON-BLOCKING (the picker entry works privacy-safe by default)
**Status** DECISION REQUESTED

## [Mobile QA] A native sign-in path for the QA account

**Why founder assistance is required**
The QA user signs in with Google only (no password, a real Gmail inbox nobody on
the team reads), and the phone cannot mint the Clerk ticket the web and Chrome
passes use. Every mobile Cloud flow (sync, projects, account rows, shared links)
therefore stays unverified on the simulator, and setting a credential on an
account the founder owns is the founder's call.
**Exact action**
Either sign in once on the booted iPhone 17 Pro simulator with the QA Google
account when the mobile fix package lands, or give the QA user a password in the
Clerk dashboard (Users, the QA user, Set password) and put it in
`apps/web/.env.local` as `MOBILE_QA_PASSWORD` (gitignored; never in the repo).
**Where** Clerk dashboard for the development instance; the simulator.
**Needed input** One of the two actions above.
**How to verify completion** The mobile Cloud sign-in screen accepts the account
and the Settings rows resolve to the account's real values.
**What remains after founder action** Run the mobile Cloud pass (sync, projects,
account data) and record it in the release doc's verification matrix.
**Impact** VERIFICATION-BLOCKING (mobile Cloud mode only; Local mode and every
other client are unaffected)
**Status** NON-BLOCKING, FOUNDER ACTION REQUESTED

## [Mobile] Enable the Native API on the Clerk development instance

**Why founder assistance is required**
The iOS app's Cloud sign-in screen renders a heading and no fields: the Clerk
instance answers `native_api_disabled` ("The Native API is disabled for this
instance. Visit the Clerk Dashboard to enable it.") to the app's environment
call, so the native SDK has no sign-in strategies to draw and Clerk never
reports loaded. This is an instance setting in the Clerk Dashboard, not app
code, and it also means the item above (a password for the QA user) cannot
help until it is on.
**Exact action**
In the Clerk Dashboard for the development instance (`handy-jawfish-73`), open
Native applications and enable the Native API; add the iOS bundle id
`com.agiworkforce.app` if the page asks for one. Repeat on the production
instance before a store build.
**Where** Clerk Dashboard, development instance, then production.
**Needed input** One toggle per instance.
**How to verify completion** A fresh launch of the iOS app shows sign-in
fields on the Cloud Account screen and the Settings rows resolve from "Sign
in" to the account's values after signing in.
**What remains after founder action** Run the mobile Cloud pass (sync,
projects, account data) and record it in the release doc's matrix.
**Impact** VERIFICATION-BLOCKING (mobile Cloud mode; Local mode is unaffected)
**Status** NON-BLOCKING, FOUNDER ACTION REQUESTED

## [Chrome QA] One click on Chrome's host-permission prompt

**Why founder assistance is required**
The side panel's Site Allowlist "Add" now asks Chrome for read access to the
site (it used to write storage only, so page context never worked). Chrome
answers with its own native prompt, which is browser chrome: Playwright cannot
see or click it, and the computer-use tools are read-only over browsers. The
happy path therefore has unit coverage and no live proof.
**Exact action**
Load the extension from `apps/extension/dist` (or the store build), open the side
panel on any site, choose Settings, Site Allowlist, click Add, click Allow on
Chrome's prompt, turn on "Add the browser page" and ask "What is this page
about?". One minute.
**Where** Chrome on the founder's machine.
**Needed input** One click on Allow, then a yes or no.
**How to verify completion** The reply describes the page and the outgoing
message carries page context; a refusal still shows the panel's own sentence.
**What remains after founder action** Record the result in the release doc's
verification matrix and the Screen Studio gate.
**Impact** VERIFICATION-BLOCKING (page context in the side panel only)
**Status** NON-BLOCKING, FOUNDER ACTION REQUESTED

## [Durability] Ship the world transport fix and end the two stranded runs

**Why founder assistance is required**
Deploying is gated on CI and on the founder's own approval, and cancelling a
production workflow run mutates live state.
**Exact action**

1. Deploy main to production once CI is green on the same commit. The fix is the
   `@workflow/world-vercel` override raised to `4.7.4` in the root `package.json`
   plus the lockfile; nothing in the Vercel dashboard needs to change, because
   `WORKFLOW_NODE_HTTP=1` is already set on production and preview and was only
   ever being ignored.
2. Cancel the two runs still stranded on the retired deployment
   `dpl_BCUkf2a6vE4xsymKphDiAhDNQXcE`, which the queue redelivers every fifteen
   minutes into an 800 s function each time:

   ```
   WORKFLOW_NODE_HTTP=1 npx workflow cancel wrun_01M29D4FY1WTT3T8FYR2T726JP \
     --backend vercel --project agiworkforce --team siddharthanagula4 --env production
   WORKFLOW_NODE_HTTP=1 npx workflow cancel wrun_01M27B9P5V0K81W755HBD4HVH7 \
     --backend vercel --project agiworkforce --team siddharthanagula4 --env production
   ```

   The flag is required on the command too: without it the CLI's own world calls
   hang and the command never returns.

**Where** GitHub Actions or the Vercel project, then a terminal.
**Needed input** One deploy approval and the two cancels.
**How to verify completion** A signed-in AGI Work turn on the deployed build
returns `X-AGI-Tool-Loop: durable`; the run lists as `completed` rather than
`running`; and `/.well-known/workflow/v1/flow` stops answering 504 on the
quarter hour. Before this change no production run had ever reached a terminal
state other than `cancelled`.
**What remains after founder action** Nothing in code. The transport fix, its
regression guard, the run-age contract and the stalled-run UI are implemented
and exercised on `:3100`; what cannot be observed from a checkout is a
production run.
**Impact** RELEASE-BLOCKING (AGI Work is not durable in production)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Security] A Moonshot account string reached a pushed commit

**Why founder assistance is required**
Rotating a provider credential is an account action, and deciding whether the
history needs rewriting is the repository owner's call.
**Exact action**

1. Decide whether to rotate `MOONSHOT_API_KEY`.
2. Decide whether commit `a7bb63eb0` on
   `fix/provider-outage-health-2026-09-12` should be rewritten, or whether
   correcting it forward is enough.

**Where** The Moonshot console, and this repository's history.
**Needed input** One rotation decision and one history decision.
**How to verify completion** `git grep` for the fragment finds nothing on any
branch that is kept.

**What happened, precisely.** A live Moonshot rate-limit error on 2026-09-12
answered by quoting the caller back at itself: an account id and an access-key
identifier in angle brackets. Two separate mistakes followed. The probe wrote
provider error text into a file that is committed, which is fixed: that text is
now redacted before it is written, and `check:secrets` is blind to both shapes,
which is how it would have passed. Then the test proving the redaction was
written using the real observed string rather than a synthetic one, so the
fragment landed in `a7bb63eb0` and was pushed. The fixture is synthetic as of
the following commit.

**What it is and is not.** The string is an account identifier and a key
identifier, the part a provider quotes in errors, not an `sk-` secret, and no
secret value was written anywhere. Rotation is offered as a precaution rather
than as a response to a known key disclosure. History was not rewritten, because
force-updating a pushed branch is not a call to make unasked.
**Impact** PRECAUTIONARY
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Release] Cut signed releases so the verification instructions work

**Why founder assistance is required**
Publishing artifacts under the project's signing identity is a release action,
not an engineering change. The workflows are already correct.
**Exact action** Cut one CLI release and one desktop release from current
`main`, so the published assets are produced by the signing workflows, then
follow the verification transcript on `/download` on each platform.
**Where** GitHub releases, via `release-cli.yml` and `release-desktop.yml`.
**Needed input** One release cut per surface, and a pass through the published
verification steps.
**How to verify completion** `v-cli-<version>` carries `SHA256SUMS` and its
Sigstore bundle, and `cosign verify-blob` succeeds against the certificate
identity `release-cli.yml@refs/tags/v-cli-<version>`. The desktop release
carries a `.sig` beside each artifact and a notarized macOS build, and
`minisign -Vm` succeeds against the updater public key committed in
`tauri.conf.json`.
**What remains after founder action** Nothing. The download controls already
resolve against the live release API, so they start offering the platforms the
moment assets exist.
**The concrete consequence, measured 2026-09-12** Both documented CLI install
routes fail for the public right now, so this is not only about verification:

1. `scripts/install.sh` fetches `SHA256SUMS` and `SHA256SUMS.sigstore.json`
   before it will unpack anything. The only published CLI release carries
   neither, so the script exits 1 with "Release signature metadata is missing;
   refusing to install unverified bytes." The guard is correct; there is simply
   nothing signed to verify against.
2. The Homebrew tap repository `siddharthanagula3/homebrew-tap` is private
   (`gh api repos/siddharthanagula3/homebrew-tap --jq .private` returns `true`),
   so `brew install` cannot resolve it for anyone outside the account.

**Impact** LAUNCH-BLOCKING (both published install paths fail, and on the
verification path a missing file is indistinguishable from a tampered one to
the user who is checking precisely because they do not trust the download)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Product] Decide which desktop app the public desktop page describes

**Why founder assistance is required**
Two desktop apps exist and both have release pipelines: the Electron shell
"AGI Cloud" (`apps/desktop/electron`, tag scheme `v-cloud-desktop-*`, the app
every workstream since 2026-09-05 has been building on, per the founder's
"Electron is the desktop, leave Tauri alone" instruction) and the frozen Tauri
app (`apps/desktop/src-tauri`, tag scheme `v-desktop-*`, last touched
2026-09-09). The public page at `/desktop` still describes the Tauri app: its
specification ledger names "Tauri 2, Rust backend", its computer-use copy
describes the Tauri commands rather than the screen steps the Electron shell
carries out, and the Linux artifacts it links are Tauri builds. Which app the public sees is a
product decision, not an engineering one.
**Exact action** Say one of: (a) the Electron app is the desktop, so `/desktop`
and the release API's default should describe and serve it and the Tauri rows
(engine, Linux AppImage) come off the page until the Electron shell has them; or (b) both stay public, with `/desktop` split into two
named downloads and their real capability lists.
**Where** A reply in this file's entry or in chat.
**Needed input** The choice, and for (a) whether the Tauri Linux download stays
linked anywhere.
**How to verify completion** `/desktop` names one engine, lists only capabilities
the linked build has, and the release-state guard and the surface page claim
tests pass on the rewritten copy.
**What remains after founder action** Engineering rewrites the page and the
release API default in one commit. The Electron shell now carries out computer
use itself, on macOS only, as cloud-to-device screen steps under a `computer.use`
grant; Windows and Linux builds report it unsupported, so the rewritten page
must say which platforms have it.
**Impact** LAUNCH-BLOCKING for honesty (the page today promises a capability
the app the team is shipping does not deliver)
**Status** BLOCKED, FOUNDER DECISION REQUIRED

## [Legal] Privacy and cookie policy revision dates after a material correction

**Why founder assistance is required**
Bumping a policy revision date re-asks every existing user for cookie consent,
because `POLICY_LAST_UPDATED` feeds `COOKIE_NOTICE_VERSION` and
`hasCurrentConsent` compares against it. Re-consenting the whole user base
against leaving a stale date on a policy that materially changed is a
counsel call, not an engineering one.
**Exact action** Decide whether to bump `POLICY_LAST_UPDATED.privacy` and
`POLICY_LAST_UPDATED.cookies`. Both policies were materially corrected on
2026-09-12: the privacy page had denied that any per-organisation retention
window is enforced when a nightly job does delete past it, understated the
erasure table count, and called the sandbox reclaim daily when it is hourly;
the cookie page listed ten device-storage entries when fourteen persisted
stores exist, including one holding an unsent message the user typed.
**Where** `apps/web/lib/legal-constants.ts`.
**Needed input** One decision, and counsel's view on whether the corrections
require re-consent.
**How to verify completion** Either the dates are bumped and a returning user
is re-asked once, or a dated note records the decision to leave them.
**What remains after founder action** Nothing; the page corrections have
shipped and are pinned by tests. The subprocessors and trust dates were bumped
already, since those are display-only and the subprocessors page runs its
objection window from the date it publishes.
**Impact** NON-BLOCKING (the policies are now accurate; this is about notice)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [QA] Re-grant Accessibility to the process that runs the agents

**Why founder assistance is required**
From about 10:05 local time on 2026-09-14, synthetic input from the agents'
shell (System Events, CGEvent clicks, keystrokes) reaches no application:
window counts read zero for every app, a click at a known control changes
nothing, a keystroke types nowhere, while screen capture still works. At 09:08
the same commands clicked the desktop shell's capability prompt. Accessibility
is a per-process grant in System Settings on the founder's machine, and an
agent must not change it.
**Exact action**
System Settings, Privacy and Security, Accessibility: confirm the terminal (or
Claude) process that runs the agents is listed and on; turn it off and on if it
already is. Then re-run the VS Code sidebar leg of the browser tool: with the
dev host open on the QA project and a browser paired, type a prompt that asks
for the open page's title. One minute.
**Where** System Settings on the founder's machine.
**Needed input** The toggle, then a yes or no on the sidebar leg.
**How to verify completion** An osascript count of Finder's windows through
System Events returns a number above zero, and the VS Code sidebar's transcript
shows the paired page's title.
**What remains after founder action** Record the sidebar leg in the release
doc's verification matrix (VS Code to Chrome moves from the app-server
boundary to the sidebar itself) and the native-prompt proofs run unattended
again.
**Impact** VERIFICATION-BLOCKING (the VS Code sidebar leg of the browser tool
and every native-prompt proof)
**Status** NON-BLOCKING, FOUNDER ACTION REQUESTED

## [Product] The CLI's OpenAI sign-in runs a ChatGPT-subscription OAuth flow

**Why founder assistance is required**
`agi login openai` authenticates "with OpenAI (ChatGPT Plus/Pro subscription)"
by opening an OAuth authorization on OpenAI's server with a client id and a
simplified-flow flag that belong to OpenAI's own Codex CLI, then asking the
user to paste the callback code. Whether AGI Workforce may use another
vendor's OAuth client to draw on a user's ChatGPT subscription is an
authorization and terms question, and it sits against the product's own model
(users pay AGI for a plan; a vendor API key is the optional "Your key" path).
On 2026-09-14 the founder said VS Code and the CLI should run on the AGI Pro
or Max subscription rather than ask for an OpenAI sign-in.
**Exact action**
Decide whether the ChatGPT-subscription flow stays. Recommendation: remove it,
keep `agi login openai` as API-key entry for "Your key", and let `agi login`
with no provider sign in to the AGI account. Until the decision, no client
offer and no CLI copy leads to that flow (protocol-4 in the release doc).
**Where** `apps/cli/src/oauth.rs` (the provider entry and the authorize URL),
`apps/cli/src/auth.rs` (the ChatGPT client id and the subscription check).
**Needed input** One decision: remove, or keep with the founder's own
authorization on record.
**How to verify completion** Either the two files no longer carry the ChatGPT
client id and the subscription copy, and `agi login openai` asks for an API
key, or a dated note records the authorization to keep the flow.
**What remains after founder action** Nothing on removal beyond the commit;
on keeping it, a release note stating the flow's basis.
**Impact** NON-BLOCKING for the product; a terms exposure while it ships.
**Status** BLOCKED, FOUNDER DECISION REQUIRED

## [Desktop QA] One click on the shell's run-commands consent for the QA folder

**Why founder assistance is required**
Starting a coding session in a folder from the desktop shell raises the
shell's own consent sheet ("Allow AGI Workforce to run commands in
.../scratchpad/qa-project? ... This is a high-impact permission."). Every
grant on this machine was cleared during an earlier cleanup, and an agent
must not answer a high-impact consent on a person's behalf; the machine's
accessibility grant is also broken (the item above), so the sheet cannot be
clicked by automation either. The composer's Local mode is proven up to that
sheet: it names the host command and the right folder, and the managed API is
never called.
**Exact action**
With the dev shell running on the dev origin, open AGI Code, choose "Add a
folder" in the environment menu and approve the scratch folder on the native
"Choose a project folder" sheet, then keep Local · qa-project selected, send
"Reply with only: ok" on the cheap model the chip names, and click "Allow this
session" on the consent sheet. Two clicks; after them both the folder path
and the turn can be driven by automation again. One minute.
**Where** The Electron shell on the founder's machine.
**Needed input** Two clicks, then a yes or no on the reply.
**How to verify completion** The transcript shows the reply and the session
appears under On this device with the Desktop source.
**What remains after founder action** Record the turn in the release doc's
verification matrix for the coding surface's Local mode.
**Impact** VERIFICATION-BLOCKING (the last leg of the Local composer proof)
**Status** NON-BLOCKING, FOUNDER ACTION REQUESTED

## [Providers] A managed route answers with exhausted provider billing

**Why founder assistance is required**
On 2026-09-14 a direct turn on the managed route for one Anthropic model
returned 503 with `provider_billing_exhausted` on the dev server: the
provider account behind that route is out of credit. The route's health
state had not been marked degraded, so the catalogue still offered the model
and the panel showed nothing for it while Auto answered on another route.
Topping up or changing the provider account is a billing action on the
founder's accounts.
**Exact action**
Check the Anthropic account the managed cloud route uses (the key in the
deployment's environment), top it up or replace the key, and confirm one
cheap turn on that route answers. Then confirm the billing alert on that
account reaches you before it runs dry again.
**Where** The provider's billing console and the deployment's environment.
**Needed input** The top-up, and a yes that the alert is set.
**How to verify completion** A turn on that route returns 200 on the dev
server and in production.
**What remains after founder action** Nothing on the engineering side: F56
landed in ff92e2e0d (the picker, the dispatcher and the hosted model list read
one unfunded-credential fact, and a turn is steered to another transport of
the same model for the cooldown window; the marks clear on their own once the
route answers again). The first explicit turn after a quiet window still
reaches the unfunded route once per window (F58 in the release doc).
**Impact** USER-VISIBLE while it lasts (one provider family unusable on the
plan), NON-BLOCKING for the release.
**Status** BLOCKED, FOUNDER ACTION REQUIRED
