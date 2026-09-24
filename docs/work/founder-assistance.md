# Founder assistance

Status: Current
Owner: Founder
Last updated: 2026-09-16

Only actions that need the founder: an account, a credential, a signature, a
paid decision, or a call the founder reserves. Engineering work is never listed
here; it lives in `ACTIVE_ISSUES.md`. An entry is deleted the moment the action
is done and the dependent behaviour is verified live.

Impact: RELEASE-BLOCKING (a surface cannot ship publicly) · FEATURE-BLOCKING
(one capability stays dark) · EXTERNAL-APPROVAL (waiting on a third party) ·
NON-BLOCKING.

The founder's decisions of 2026-09-15 live in
`docs/decisions/2026-09-15-founder-decisions.md`; the items they resolved were
removed here and their engineering is tracked in `ACTIVE_ISSUES.md` (AGI-35).

## [Deploy] Release the production deploy queue (F1, F2)

**Why founder assistance is required**
`production-web` requires the founder as reviewer. Run 34549878676 (2026-09-11) has waited for that approval since, and
the `production-surfaces` concurrency group cancels every newer run behind it with zero jobs, so about 1,000 commits
(390 touching web) are not live. Migrations 0183 to 0193 have a contested applied state, and deployed code writes
columns from 0187 and 0189.
**Exact action**

1. Confirm in the Neon console (or `pnpm db:migrate -- status --target production`) whether 0183 to 0193 are applied; approve applying the missing ones in order.
2. Cancel run 34549878676 and the two August runs still marked in progress (31290571636, 31283553796).
3. Approve the next `deploy-production` run for the reviewed sha.

**Where** GitHub Actions, `production-web` environment; Neon console.
**Needed input** About fifteen minutes.
**How to verify completion** The newest production-web deployment status is `success`; `/api/health` is healthy; the deployment aliased to agiworkforce.com is newer than 2026-09-11.
**What remains after founder action** Signed-in production smoke (agent).
**Impact** LAUNCH-BLOCKING (every fix since 2026-09-11, including 8 of the 11 cleared §127 blockers)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Release] GitHub environments and variables the release workflows read (F3, F4, F6 to F10)

**Why founder assistance is required**
Every release workflow is correct but reads configuration that does not exist: environments `macos-release`,
`vscode-marketplace`, `chrome-web-store`, `mobile-store-release`, `production-fly` are missing, the repository has
zero variables, and repository secrets cannot be listed with the agent token. This entry is the configuration half of
"Cut signed releases", "Chrome Web Store public key", "Signed protocol-7 CLI release" and the mobile store entry.
**Exact action**

1. Run `gh secret list` with admin rights and share the names present.
2. Create the five environments above, each allowing its tag pattern (`v-cloud-desktop-*`/`v-desktop-*`, `v-vscode-*`, `v-ext-*`, `v-mobile-*`).
3. `macos-release`: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_API_PRIVATE_KEY`; repository `VITE_CLERK_PUBLISHABLE_KEY`.
4. Windows signing variables `AZURE_ARTIFACT_SIGNING_ENDPOINT`, `AZURE_ARTIFACT_SIGNING_ACCOUNT`, `AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE` and secrets `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`.
5. `vscode-marketplace`: `VSCODE_MARKETPLACE_AZURE_CLIENT_ID`, `VSCODE_MARKETPLACE_AZURE_TENANT_ID`; an Open VSX token.
6. Repository variables `CLERK_PUBLISHABLE_KEY`, `CLERK_FRONTEND_API`, `CLERK_SYNC_HOST`, `CHROME_EXTENSION_PUBLIC_KEY`; `chrome-web-store`: `CWS_PUBLISHER_ID`, `CWS_EXTENSION_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `CWS_SERVICE_ACCOUNT`.
7. `mobile-store-release`: secrets `EXPO_TOKEN`, `ASC_API_KEY_ID`, `ASC_API_KEY_ISSUER_ID`, `ASC_API_PRIVATE_KEY_BASE64`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64`; variables `ASC_APP_ID`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS`.
8. `NPM_TOKEN` able to publish `@agiworkforce/cli`; make the Homebrew tap public or give the release job write access.

**Where** GitHub repository settings (environments, secrets, variables); Apple, Azure, Microsoft Entra, Google Cloud, Expo, npm.
**Needed input** Accounts and about two hours.
**How to verify completion** Tags `v-cli-1.7.1`, `v-cloud-desktop-1.2.0`, `v-desktop-1.2.1`, `v-vscode-0.3.0`, `v-ext-1.2.0`, `v-mobile-1.2.0` each produce a green release run.
**What remains after founder action** Pushing the tags and verifying each release (agent).
**Impact** RELEASE-BLOCKING (CLI, both desktops, VS Code, Chrome, mobile)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Infra] Remote Control relay host points nowhere (F11)

**Why founder assistance is required**
The mobile app pins `wss://signaling.agiworkforce.com`, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy relay
runs at `agiworkforce-signaling.fly.dev`. The Railway deploy job is skipped because `RAILWAY_PUBLIC_URL` is unset.
**Exact action** Point `signaling.agiworkforce.com` at the Fly app (DNS plus Fly certificate), or set `RAILWAY_TOKEN` and `RAILWAY_PUBLIC_URL` and let the workflow deploy; set `SIGNALING_HTTP_URL` in Vercel production. Complete the `ALLOWED_ORIGINS` entry on the same deploy.
**Where** DNS provider, Fly.io, Railway, Vercel.
**Needed input** About twenty minutes.
**How to verify completion** `curl https://signaling.agiworkforce.com/health` returns healthy JSON and a phone pairs with a desktop.
**What remains after founder action** Pairing verification on both desktops (agent).
**Impact** RELEASE-BLOCKING (Remote Control)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Production env] Error reporting, tracing, email, push and sign-in providers (F12)

**Why founder assistance is required**
Production (`vercel env ls production`, names only, 2026-09-16) has no Sentry
DSN, OTel exporter endpoint, web push VAPID keys, email provider key or sender,
`AGI_AUTH_PROVIDERS` or `PAGER_WEBHOOK_URL`. The code ships and silently does
nothing without them. Decision 26 keeps the support widget out of Web v1 launch
scope, so its flag is not a launch requirement.
**Exact action** Create or confirm the vendor accounts and set:
`NEXT_PUBLIC_SENTRY_DSN` and the Sentry release variables;
`AGI_OTEL_EXPORTER_ENDPOINT`; `WEB_PUSH_VAPID_PUBLIC_KEY`,
`WEB_PUSH_VAPID_PRIVATE_KEY`; `RESEND_API_KEY`,
`AGI_NOTIFICATIONS_FROM_EMAIL`; enable Apple and Microsoft connections in Clerk
and set `AGI_AUTH_PROVIDERS`; `PAGER_WEBHOOK_URL`. Confirm that mail sent to
`contact@agiworkforce.com` arrives and name the person who monitors it before
the Web launch. If signed-in ticket notifications will be relied on, also set
`AGI_SUPPORT_FROM_EMAIL` and `AGI_SUPPORT_FALLBACK_EMAIL`. In GitHub Actions
secrets, set `SENTRY_DSN_DESKTOP` (desktop release workflows),
`SENTRY_DSN_CHROME_EXTENSION` (Chrome release) and `SENTRY_DSN_CLI` (CLI
release); each build reports nothing until its secret exists.
**Where** Vercel project environment, GitHub Actions secrets, Sentry, the tracing backend, Resend, Clerk.
**Needed input** Vendor choices and about one hour.
**How to verify completion** A test exception appears in Sentry with the
release tag; a notification email arrives; a message sent to
`contact@agiworkforce.com` receives an owner-confirmed acknowledgement; the
sign-in page shows Apple and Microsoft.
**What remains after founder action** Live verification of each channel (agent).
**Impact** RELEASE-BLOCKING for the Web support mailbox; FEATURE-BLOCKING for
monitoring, notifications and enterprise sign-in
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [GitHub] Branch protection on main (F13)

**Why founder assistance is required**
`main` has no branch protection and no active ruleset, so guards in `repo-operability.yml` block nothing. Enable it
after engineering brings CI below 10% red (currently 44%) so it does not stall every lane.
**Exact action** Apply `.github/rulesets/main.json` (or an equivalent protection) requiring `CI complete` and the operability job.
**Where** GitHub repository settings, Rules.
**Needed input** Five minutes, when engineering reports CI is stable.
**How to verify completion** `gh api repos/{owner}/{repo}/rulesets` lists an active ruleset for main.
**What remains after founder action** Nothing.
**Impact** NON-BLOCKING now, required for enterprise readiness
**Status** WAITING ON ENGINEERING (CI stabilisation), then FOUNDER ACTION

## [QA] Enterprise QA tenant usable by CI (F14)

**Why founder assistance is required**
46 of 53 web Playwright specs and the §130 enterprise smoke test need a real signed-in account, SSO and SCIM, and
creating identity-provider tenants and CI credentials belongs to the account owner.
**Exact action** Create a Clerk organization with a test SAML or OIDC IdP and SCIM token, a QA user credential that CI can sign in with, and add them as CI secrets.
**Where** Clerk dashboard, a test IdP (for example an Okta or Entra developer tenant), GitHub secrets.
**Needed input** About one hour.
**How to verify completion** The authenticated Playwright job runs in CI and `web-e2e-ci-coverage.test.ts` asserts the specs run.
**What remains after founder action** Wiring the specs and the smoke test into CI (agent).
**Impact** FEATURE-BLOCKING (verification of every signed-in flow)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Compliance / vendors] Certification, pen test and infrastructure contracts (F15)

**Why founder assistance is required**
The founder chose full external scope on 2026-09-16. Contracts and budget are founder decisions.
**Exact action** Select and sign: a SOC 2 auditor and compliance automation platform; an ISO 27001 certification body; a third-party pen-test firm; a paging vendor; a product analytics vendor; a cloud KMS for customer-managed keys; EU hosting (Neon EU project, Cloudflare R2 EU jurisdiction bucket, EU inference routes).
**Where** Vendor contracts.
**Needed input** Quotes and budget approval.
**How to verify completion** Contracts signed; kickoff dates on the programme plan.
**What remains after founder action** Waves 4 to 6 of `docs/work/enterprise-completion-plan-2026-09-16.md`.
**Impact** RELEASE-BLOCKING for enterprise claims (§128)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Product] Three open decisions from the enterprise checklist (F16)

**Why founder assistance is required**
Product scope calls reserved for the founder.
**Exact action** Decide: whether the web app becomes a Remote Control controller (today pairing "cannot be completed in a browser"); what Primary Owner can do that Owner cannot; whether paid plans offer a trial and for how long.
**Where** Reply in chat; recorded in `docs/decisions/`.
**Needed input** Three answers.
**How to verify completion** A dated decision record exists.
**What remains after founder action** Implementation in lanes E, G and H.
**Impact** FEATURE-BLOCKING (respective rows)
**Status** BLOCKED, FOUNDER DECISION REQUIRED

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

Decided 2026-09-15 (D-2026-09-15-17): preparation proceeds now; the cutover waits for green release-blocking billing, database and QA checks, the code catalogue is canonical, contradictory prices are retired, and the cutover is verified with one real low-value checkout, provisioning and a refund.

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
**What remains after founder action** Decided 2026-09-15 (D-2026-09-15-18): until Razorpay, the accountant and counsel resolve the questions above, Max 15x and Team are invoice or assisted-sales only in India and there is no INR top-up conversion; engineering enforces that in checkout now.
**Impact** FEATURE-BLOCKING (India only)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Routing] Provider gateways: commercial terms and credentials (D-2026-09-10-01)

**Why founder assistance is required**
Serving managed traffic through a re-hosting gateway is a commercial-terms and
data-residency commitment the founder reserves, and each gateway needs a funded
account. On main the DeepSeek defaults and the Moonshot flagship have no
managed route since the abroad-endpoint exclusion, and the Zhipu default has one.
On 2026-09-23, [CheaperInference's published terms](https://www.cheaperinference.com/legal/terms)
were checked again: they prohibit resale, sublicensing, or shared access to the
service or API keys except through a product or service expressly permitted by
Keak in writing. A link in AGI's Terms does not supply that permission; retain
the founder's commercial-terms gate for public managed traffic.
**Exact action** Decide, per gateway, whether its terms allow AGI to resell the model to managed users (Vercel AI Gateway, Cloudflare Workers AI, Experiential Labs, DeepInfra, Together, Novita, Cheaper Inference); fund the accepted ones; set their `*_API_KEY` and `*_BASE_URL` variables in Vercel Production and `.env.local`. Say which of options (a) promote the Vercel gateway harness, (b) move DeepSeek's OpenRouter routes to the managed harness, (c) drop DeepSeek and Moonshot from the managed catalogue.
**Where** `docs/decisions/2026-09-10-managed-gateway-routes.md`, each gateway's console, Vercel environment.
**Needed input** Terms acceptance and funding per gateway.
**How to verify completion** An explicit DeepSeek or Moonshot selection by a managed user no longer answers 422; `/operator` Routes shows each accepted gateway credentialed.
**What remains after founder action** Decided 2026-09-15 (D-2026-09-15-07): option (b), the DeepSeek and Moonshot routes go through the managed routing harness with several transports; engineering does that now. A gateway serves managed customers only after the founder accepts its commercial terms and data handling, which is the part that stays here.
**Impact** FEATURE-BLOCKING (managed routes for those vendors; cheaper capacity)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Localization] Translating the v3 namespace for ten languages

**Why founder assistance is required**
Settings offers twelve languages. The `v3` dictionary that names the sidebar, empty chat, response actions, thinking, artifacts, search, the account menu, customize, skills and connectors is translated for Spanish only; in the other ten languages 255 to 259 of its 330 values are still English (measured 2026-09-15), so a user who picks French, German, Japanese, Hindi, Arabic, Italian, Korean, Portuguese, Russian or Chinese sees most of the chat surface in English. ChatGPT and Claude ship every offered language fully. Producing 2,500 strings is a spend and a brand-voice call: a model-assisted pass reviewed by a native reader per language is the leaders' floor, a vendor is the ceiling.
**Exact action** Decided 2026-09-15 (D-2026-09-15-03): only complete, reviewed languages are offered, so the interface now exposes English and Spanish and hides the rest until they are model-translated and reviewed. What stays with the founder: name a native reviewer per language to be re-enabled (or say that no further languages are wanted at launch).
**Where** `packages/ui/i18n/locales/<lang>/v3.json`; the language control in Settings → General.
**Needed input** One product decision and, for the model-assisted route, permission to spend plan credits on the batch.
**How to verify completion** The English-value count per language in `v3.json` drops to the product names only, and the settings pass under each language shows one language on the chat surface.
**What remains after founder action** The translation batch and each language's review loop, then re-enabling it in the shared selectable set; all engineering.
**Impact** NON-BLOCKING for English; BLOCKING for offering the other languages honestly
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

Decided 2026-09-15 (D-2026-09-15-20): launch does not wait for every registration; Google Workspace, Microsoft 365, Slack, GitHub and Linear come first, and every unregistered connector shows Needs setup or Coming soon.

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
**Exact action** Decided 2026-09-15 (D-2026-09-15-12): refuse account creation and use below the regional legal threshold; no parental-consent vendor at launch. What stays with the founder: have counsel confirm the regional thresholds and the region-detection approach the gate will use.
**Where** `apps/mobile/src/features/auth/services/ageGate.ts`.
**Needed input** One risk decision, possibly a vendor contract.
**How to verify completion** The under-threshold flow matches the choice end to end; no marketing or listing claims compliance before then.
**What remains after founder action** The gate is being built on a documented default threshold table; counsel's confirmation replaces the defaults.
**Impact** RELEASE-BLOCKING (mobile stores)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Security] Managed Cloud plan-tier gate on bare session tokens

**Why founder assistance is required**
Decided 2026-09-15 (D-2026-09-15-09) and built: the gateway now binds a Clerk
token to the surface its signed claims prove (the `azp` origin for the web app
and the browser extension) and no longer trusts `x-agi-surface`. A native
token carries no origin, so the mobile app mints its token from a Clerk JWT
template that stamps a `surface` claim, and JWT templates are created in the
Clerk dashboard.
**Exact action** In the Clerk dashboard, JWT templates, on both the
development and the production instance: create a template named `agi-mobile`
with the claims `{"surface": "mobile"}` and the default lifetime. Then confirm
`CLERK_AUTHORIZED_PARTIES` on the production web deployment lists the web
origin and the published extension's `chrome-extension://<id>` origin.
**Where** The claim and template name are `SURFACE_TOKEN_CLAIM` and
`MOBILE_SESSION_TOKEN_TEMPLATE` in `packages/contracts/types/src/surface-binding.ts`;
the binding is `bindSurfaceFromClaims` in `apps/web/lib/free-chat-surface-policy.ts`;
the mobile minter is `getSurfaceToken` in `apps/mobile/src/integrations/clerk.ts`.
**Needed input** Two dashboard actions; no new deployment secret.
**How to verify completion** A token minted outside a browser from a free-tier
account, sent to `POST /api/llm/v1/chat/completions` with `x-agi-surface: web`,
answers `managed_cloud_surface_unknown`; the same header on a browser-minted
token still runs as web; a mobile build signed in on the development instance
completes a turn once the template exists.
**What remains after founder action** Nothing; until the template exists the
mobile app's turns are refused as an unknown surface, which is loud on purpose.
**Impact** RELEASE-BLOCKING for the mobile release only
**Status** BLOCKED, FOUNDER ACTION REQUIRED

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
**Exact action** Decided 2026-09-15 (D-2026-09-15-14): production crash reporting is on, through the provider-neutral telemetry abstraction, with aggressive scrubbing. What stays with the founder: create the mobile project in the crash-reporting vendor and hand over its DSN as a secret.
**Where** Mobile privacy copy, store listings, `apps/mobile` telemetry config.
**Needed input** One decision.
**How to verify completion** Copy, labels and code agree.
**What remains after founder action** Wiring the DSN, the scrubbing rules, the privacy and store copy; engineering.
**Impact** NON-BLOCKING
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
**What remains after founder action** Nothing in code. Since 2026-09-15 the plan parks the unfunded route and serves the same models through the proxy route, so they answer, but the first token arrives after about 4.1 seconds on the cheapest Claude model (dev log 15:37 UTC: the provider span took 4109 ms of a 4306 ms turn, the gateway's own work under 200 ms) where the direct route answered in about a second; beside ChatGPT or Claude that reads as a slow product. Until it is done every
Anthropic model is served slowly for everyone, not only for event visitors:
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

Decided 2026-09-15 (D-2026-09-15-19): fund the account with auto-reload and spend alerts; the routing fallback stays regardless.

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
4. Set `AGI_EVENT_ENABLED=1` last, and redeploy. The flag alone opens nothing:
   the gateway keeps the promotion closed until the allowlist, the budget and
   both instants are all present and the window is well-formed.

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

Decided 2026-09-15 (D-2026-09-15-26): `AGI_EVENT_ENABLED` stays 0 until a specific event, and an event needs an explicit model allowlist, a hard global USD budget, a start instant and an end instant.

## [Providers] MiniMax and Groq hold no credential

**Why founder assistance is required**
Creating a provider account and funding it is a payment and terms decision.
**Exact action** Decided 2026-09-15 (D-2026-09-15-08): MiniMax stays out of managed production until its terms are reviewed and accepted; Groq stays a backend provider option. What stays with the founder: fund and hand over a Groq credential if Groq is wanted for cost, latency or resilience, and review MiniMax's commercial terms when there is time.
**Where** Each provider's console, then Vercel Production.
**Needed input** Two keep-or-drop decisions and, for each keep, one account.
**How to verify completion** MiniMax no longer answers through any managed
route: its own route is customer-key only and its marketplace routes are blocked
in the registry, so the catalogue withholds it and an explicit request for it
on Managed Cloud is refused as unavailable. Once the terms are accepted, the
two route statuses in `packages/ai/model-registry/catalog/model-routes.json`
return to their managed values and MiniMax joins through the neutral layer.
The Groq-only models remain unselectable and count for nothing.
**What remains after founder action** Nothing blocking. If Groq is dropped
instead, its three models should leave the registry rather than sit there
unservable.
**Impact** FEATURE-BLOCKING (those models only)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Routing] The zero-price OpenRouter router on paid plans

**Why founder assistance is required**
Whether a paying customer's prompt may reach an upstream that trains on it is a
data-handling decision, not an engineering one.
**Exact action** Decided 2026-09-15 (D-2026-09-15-06): the privacy-safe default stays on every plan. What stays with the founder: set the company OpenRouter privacy settings in its dashboard to match (no training-enabled upstreams, data collection denied).
**Where** `packages/ai/model-registry/catalog/routing-policies.json`,
`packages/ai/providers/openrouter/src/provider-routing.ts`,
`docs/research/free-inference-tos-workbook-2026-09-01.md`, the OpenRouter dashboard.
**Needed input** One sentence naming the option.
**How to verify completion** A paid-plan pick of the free router answers, and the
registry contract test still refuses `free_` slots on paid tiers.
**What remains after founder action** Nothing in code.
**Impact** NON-BLOCKING (the picker entry works privacy-safe by default)
**Status** DECISION REQUESTED

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

## [Security] A Moonshot account string reached a pushed commit

**Why founder assistance is required**
Rotating a provider credential is an account action, and deciding whether the
history needs rewriting is the repository owner's call.
**Exact action** Decided 2026-09-15 (D-2026-09-15-13): correct forward, no history rewrite unless a real secret value turns up. What stays with the founder: rotate the Moonshot credential in its console if that is inexpensive.
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

Decided 2026-09-15 (D-2026-09-15-24): public CLI and Electron releases use the signed workflows and no install path is advertised while its assets or signatures are missing; engineering removes the dangling paths from the docs now.

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
