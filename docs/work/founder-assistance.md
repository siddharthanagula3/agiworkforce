# Founder assistance

Status: Current
Owner: Founder
Last updated: 2026-09-10

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
changes what a credential carries.
**Exact action** Choose: bind the surface into a Clerk custom session claim; require a surface-bearing credential for non-browser callers (parked patch `agiworkforce-security-run/blocked/w1-W1-E-surface-header-trust.patch`); or accept the residual and gate on billing audit.
**Where** `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts`.
**Needed input** One security-architecture decision.
**How to verify completion** A free-tier bare token can no longer reach the developer surfaces.
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
**Exact action** Approve and apply `0183_provider_cost_events_customer_and_cogs_split.sql`, and confirm the search bounds shipping with it: 20 included searches per 30 days on Free, 300 on paid interactive chat, and 1 cent per Perplexity call or 2 cents per grounded call on API, CLI, VS Code, scheduled agents, AGI Work and deep research.
**Where** Neon production (migration), no dashboard or env change; the two existing rate overrides `AGI_PERPLEXITY_SEARCH_MICROUSD_PER_CALL` and `AGI_GOOGLE_GROUNDING_MICROUSD_PER_CALL` are unchanged and stay unset.
**Needed input** One approval to apply, one confirmation of the bounds.
**How to verify completion** `provider_cost_events` carries `customer_canonical_microusd` and `feature`; a search on a paid account writes a row with `feature = 'web_search_perplexity'`; the per-user count the bounds read is non-zero.
**What remains after founder action** Nothing; the bounds and the ledger writes ship with the migration and are tested. Until 0183 is applied, `feature` does not exist, the per-user count fails open and every search stays included.
**Impact** FEATURE-BLOCKING (the search bounds stay inert)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

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
Applying a production migration is a call the founder reserves.
**Exact action** Approve and apply
`0184_provider_cost_reconciliation_days.sql` after a branch rehearsal.
**Where** Neon production. No dashboard or environment change.
**Needed input** One approval to apply.
**How to verify completion** `provider_cost_reconciliation_days` exists; after
the next nightly run it holds one row per provider that answered, and the
admin economics page stops reporting the table as absent.
**What remains after founder action** Nothing. Until it is applied the cron
records nothing and the economics page reports provider reports as unavailable.
**Impact** NON-BLOCKING
**Status** BLOCKED, FOUNDER ACTION REQUIRED

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
**Impact** BLOCKS VERIFICATION, NOT THE FIXES
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
