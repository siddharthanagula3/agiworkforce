# Founder actions

Status: Current
Owner: Founder
Last updated: 2026-11-11

Only actions that need the founder: an account, a credential, a signature, a
paid decision, or a call the founder reserves. Engineering work is never listed
here; it lives elsewhere in `audit/` (see `audit/README.md`). An entry is
deleted the moment the action is done and the dependent behaviour is verified
live.

Impact: RELEASE-BLOCKING (a surface cannot ship publicly) · FEATURE-BLOCKING
(one capability stays dark) · EXTERNAL-APPROVAL (waiting on a third party) ·
NON-BLOCKING.

The founder's decisions of 2026-09-15 live in
`docs/decisions/2026-09-15-founder-decisions.md`; the items they resolved were
removed here and their engineering is tracked in `audit/prior-audits/active-issues-register.md` (AGI-35).

The founder's decisions of 2026-10-22 (numbered 1 to 46) settled the OWNER rows
of the UI gap campaign. Each `DEF-` or `REF-` id below is a campaign row still
waiting on the founder; it closes when the action named beside it is done.
Undecided calls from that round are in [`open-questions.md`](open-questions.md).

## [Deploy] Apply migrations 0392 to 0418, then deploy main (decision 2)

- `scripts/config/production-migrations-applied.json` records production through 0391; `apps/web/db/neon`
  holds 0392 to 0418, none recorded as applied, and `deploy-production.yml` runs `pnpm db:migrate -- verify`,
  which refuses to deploy over a pending migration.
- Action: apply them to staging, check, then to production with
  `pnpm db:migrate -- apply --target production --confirm-production`, then deploy main through
  `deploy-production.yml`. A production apply cannot be undone, so it runs only at a time you choose.
  Procedure: `docs/development/ci-and-deploys.md` ("Schema prerequisites", "Staging tier").
- Until then the Chrome extension built from main does not fully work against production: browser tools
  fail in any chat saved to the account (the older server drops the caller-tool fields; the checkpoint
  they write needs `0397_caller_tool_checkpoints.sql`), and **Add a link** always fails
  (`/api/page-context/read` does not exist there). A store reviewer would hit both, so this deploy comes
  before the Chrome submission (`docs/runbooks/chrome-web-store-publish.md`, "First submission" step 12).
- Done when `pnpm db:migrate -- status --target production` lists 0418, the JSON record is updated, and
  `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://agiworkforce.com/api/page-context/read`
  prints anything but `404`.
  Impact: RELEASE-BLOCKING.

## [Models] One paid probe before video comes back (decision 1)

- You chose `gemini-omni-1.1-flash` for video; its adapter is merged (`0ed375f365`). The `google/veo`
  slot in `model-families.json` still names the retired `veo-3.1`, so default video stays off
  (`VIDEO-VEO-SLOTS-SHUTDOWN-2026-10-22` in `audit/registers/known-flaws.md`).
- Action: approve one paid probe (3 s, 720p, text only, about $0.30, local Google key); engineering then
  moves the slot with the probe as its gate evidence. Impact: FEATURE-BLOCKING (video generation).

## [Billing] Switch on usage promotions (decision 25)

- Built in `5daa5cb754` and its review fixes: banked limit resets and time-boxed limit uplifts as runtime
  promotions with a cost ceiling and a fail-closed switch. No amount is in code.
- Action: after 0390 is applied, create the promotions with live values in the admin route, then turn on
  the `billing_usage_promotions` flag. Rows: DEF-0029, DEF-0510, DEF-0512, DEF-1687, DEF-1802,
  DEF-2062, DEF-2314, DEF-3162, DEF-3272, DEF-3343.

## [AI artifacts] Switch on AI calls from inside artifacts (decision 23)

- DEF-0333: the redesign is merged (`7f4a4b93be`, `180b298342`, `81a310f8d5`) and passed independent
  review; it stays off behind `AGI_ARTIFACT_AI_ENABLED`.
- Action: confirm the per-app call counts in `maxArtifactAiCallsPerApp` (`billing-catalog.ts`), apply
  0391 after 0380, then set `AGI_ARTIFACT_AI_ENABLED=1`. Counsel approves the consent line saying the
  app may save output where its publisher can read it.

## [Connectors] Release switch (decision 16)

- You decided on 2026-10-22 to keep every connector Coming soon for now. To release one: register its
  OAuth app (the three connector entries below), write the Gmail data rule (`founder-decisions.md`
  item 42), apply 0381, then approve flipping `CONNECTOR_RELEASE_STATE`.
- Rows waiting on it: DEF-0723, DEF-0743, DEF-0767, DEF-1240, DEF-1920, DEF-2027, DEF-2054, DEF-2074,
  DEF-2083, DEF-2137, DEF-2141, DEF-2166, DEF-3236, DEF-3240, DEF-3262, DEF-3342.

## [Console] GitHub App events, store links and the Slack interactivity URL

- GitHub App console: subscribe the app to Issues and Releases events (decision 20); the shipped
  automation triggers receive nothing until then.
- DEF-3226: once both store listings are public, supply the App Store and Google Play URLs for the
  mobile page (decision 20).
- Slack app configuration: set the Interactivity Request URL to
  `https://agiworkforce.com/api/webhooks/slack-interactions` so the in-Slack Approve and Deny buttons work.

## [Mobile] First store release: the steps only you can take

- Version 1 ships free with no in-app purchases (`apps/mobile/src/features/billing/storePurchases.json`). The listings,
  reviewer notes and `apps/mobile/__tests__/ios-store-submission-config.test.ts` describe that build
  and the test is green again. Every remaining console, credential, device and decision step is in
  `docs/runbooks/mobile-store-first-release.md`, in order.
- Phone sign-in to Cloud has worked in production since 2026-11-10 through a hotfix (`a8e278c62e`,
  local branch `hotfix/mobile-native-session`, not pushed). `main` carries the same change
  (`568584454a`), so the next production release from `main` keeps phone sign-in working and
  replaces the hotfix.
- No store build can start before 2026-11-12: the Expo patch update the release check requires is
  held by the seven-day package-age rule until then (`MOBILE-EXPO-PATCH-LAG-2026-11-10`, runbook
  step 7 item 1).
- `codex/mobile-store-release` (2026-10-17) is not needed for this: its free-first idea was
  reimplemented on current code. Whether to keep or delete that branch is yours.

## [Legal] Register a DMCA designated agent (decision 32)

- DEF-0680, DEF-2376: file the designated-agent registration with the US Copyright Office (paid) and
  supply the registered details; engineering then adds the notice block to `/terms` and the copyright page.

## [Legal] Counsel wording from the 2026-10-22 decisions

Each line is one approval; engineering edits the page and its claim test after it.

- Decision 3, DEF-0671: reword the `/privacy` 30-day deletion sentence to match today; the purge switch
  itself is in "[Production env] Email sender and purge switch" below.
- Decision 4 (the no-training setting is now a hard block, `401247f726`, `8ac4898068`): DEF-0670
  training section and opt-out link on `/privacy`; DEF-0674 consumer training disclosure on `/privacy`
  and in Settings; DEF-0677 opt-out link in the terms Content section; DEF-1946 policy section 06
  control and link; DEF-1958 the broader no-training promise; DEF-0676 temporary-chat exclusions copy;
  DEF-0638 training line in the VS Code onboarding.
- Decision 6 (web images and video now carry the provenance claim, `170779caa1`): DEF-0736 reword
  `apps/web/app/acceptable-use/page.tsx`, which still says files carry no mark, and scope
  `apps/mobile/app/legal/article-50.tsx` to AGI-managed generation; DEF-2425 rule on whether "AGI can
  make mistakes. Check important info." returns under the composer, and its wording.
- Decision 7 (security reports acknowledged within 2 business days): DEF-0678, DEF-1964 that sentence on
  `/security` and the service-level page; DEF-1962 a user-responsibilities section on `/security`;
  DEF-1963 the "we may update this policy" clause.
- Decision 8: the subprocessor and privacy text say a video request carries only a text prompt; images
  can now be sent too.
- Decision 11 (one address, contact@, shown in full with its subject line): DEF-2368 the `/privacy`
  children's section, which says "email us" with no address; DEF-1930 the rights list with its
  verification and authorised-agent sentences; DEF-3062 the verification paragraph and under-13
  sentence; DEF-3358 the wording that lists contact@ by purpose; DEF-3084 the full-name requirement
  and opt-out statement in `/terms` section 17.
- Decision 31, DEF-0682: confirm Texas law, Travis County and the AAA, and settle the enterprise
  contract to match.
- Decision 33, DEF-1954, DEF-3365: the required contents of the arbitration opt-out email.
- Decision 34, one terms batch: DEF-1921 terms-update notice heading; DEF-1966 naming customers and
  showing logos; DEF-1967 "export your data before termination"; DEF-3074 capitals on the disclaimer
  and liability paragraphs.
- Decision 36: DEF-1947 rights list and Global Privacy Control sentence first; then DEF-1933 training
  sources and de-identified data, DEF-1957 consent by use, DEF-1959 service emails, DEF-1960 browser
  cookie controls.
- Decision 37: DEF-2262, DEF-3308 upload retention (kept with the chat until it is deleted); DEF-1206,
  DEF-1207 confirm live voice keeps the transcript and no audio, then the voice-retention line and its
  Learn more target; DEF-3366 confirm whether de-identified or promotional-route copies survive
  deletion, then the retention statement.
- Decision 38, approve first: DEF-2366, DEF-0161 notice that feedback and reports may be reviewed;
  DEF-1828 warning on approvals that read untrusted content or send data out; DEF-1174 the mobile
  billing notices (keep both). Then DEF-1304 safe-use guide from the AGI Work notice, DEF-0397
  usage-guidelines note on custom instructions, DEF-0404 and DEF-1588 privacy paragraph and privacy
  centre, DEF-3234 who can see a project's Work runs, DEF-0492 help articles on training and retention.
- Decision 22, desktop skill recorder: DEF-0374 consent and warning text naming what is captured and
  where it goes; DEF-2757 a one-sentence sensitive-data warning. DEF-0019 (input listener), DEF-0051
  (Input Monitoring row) and DEF-0376 (microphone channel) are built only after that wording is approved.
- Stale policy sentences (found 2026-10-23): `apps/web/app/privacy/page.tsx` (about line 1010) says every
  paid upgrade needs an access code or the waitlist, but mobile in-app purchase is open; the same page
  (about lines 1305 and 1526) says connectors are "coming soon", which goes false at release; and
  `apps/web/app/acceptable-use/page.tsx` (about line 118) says connector tools are "capped by plan",
  while Free now has none.
- Chrome extension history search is built opt-in (`apps/extension/src/features/computer-use/historySearch.ts`)
  and both policy pages now describe it: `/privacy` since commit `6ade64b7b9` (with the console and
  network lines the extension reads during browser control), and `/agent-permissions` in a Browsing
  history row of "Computer use in Chrome" dated 2026-11-11. Approve that wording or send it to counsel;
  whether the feature stays is in `open-questions.md`.

## [Release] GitHub environments and variables the release workflows read (F3, F4, F6 to F10)

**Why founder assistance is required**
Every release workflow is correct but reads configuration that does not exist: environments `macos-release`,
`cli-release`, `vscode-marketplace`, `open-vsx` and `chrome-web-store` are missing and no tag ruleset exists
(`gh api` GETs, 2026-11-11; `mobile-store-release` and `production-fly` exist), the only repository variables are the mobile ones, and repository secrets cannot be listed with the
agent token. This entry is the configuration half of
"Cut signed releases", "Chrome Web Store public key", "Signed CLI release before the Marketplace listing" and the mobile store entry.
**Exact action** In this order: protection before any credential, because a workflow that names a missing environment creates it unprotected, and a repository secret is readable by a workflow on any pushed branch.

1. Run `gh secret list` with admin rights and share the names present.
2. Before any signing key, publish identity or store credential exists, protect the four store and CLI release environments `cli-release`, `vscode-marketplace`, `open-vsx` and `chrome-web-store`: each with the owner as required reviewer, "Allow administrators to bypass configured protection rules" deselected, and a deployment policy of its tags only (`v-cli-*`, `v-vscode-*`, `v-vscode-*`, `v-ext-*`; no branch, so a `workflow_dispatch` from a branch cannot reach them). In the same step add the `release-tags` tag ruleset that lets only a repository admin create, move or delete `v-cli-*`, `v-vscode-*` and `v-ext-*` tags. Exact `gh api` commands: `docs/runbooks/cli-release.md`, "First release" step 2. Then run `node scripts/release/check-release-environments.mjs` (read-only `gh api` GETs) and continue only when it prints `OK`.
3. Create `macos-release` allowing `v-cloud-desktop-*` and `v-desktop-*` (`mobile-store-release` already allows `v-mobile-*`); `.github/rulesets/README.md` walks `.github/rulesets/environments.json` for it. That walk rewrites every listed environment, and the file still gives `vscode-marketplace` and `chrome-web-store` a `main` branch policy, so until it lists the four release environments tag-only, create `macos-release` with the same `PUT` and tag `POST` as step 2 instead, and rerun the probe after any walk.
4. `macos-release`: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_API_PRIVATE_KEY`; repository `VITE_CLERK_PUBLISHABLE_KEY`.
5. Windows signing variables `AZURE_ARTIFACT_SIGNING_ENDPOINT`, `AZURE_ARTIFACT_SIGNING_ACCOUNT`, `AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE` and secrets `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`.
6. `vscode-marketplace`, only after step 2: an Entra federated credential whose subject is exactly `repo:siddharthanagula3/agiworkforce:environment:vscode-marketplace` (bound to the environment, and through its tag-only policy to `v-vscode-*` tags), then `VSCODE_MARKETPLACE_AZURE_CLIENT_ID`, `VSCODE_MARKETPLACE_AZURE_TENANT_ID`. Open VSX needs no token: its trusted publisher names repository, workflow and environment `open-vsx`, plus the repository variable `OPEN_VSX_PUBLISH`, which is set only after the lead has added the pinned `ovsx` development dependency (Open VSX step 1). Commands: `docs/runbooks/vscode-marketplace-publish.md`, "First submission" and "Open VSX".
7. Repository variables `CLERK_PUBLISHABLE_KEY`, `CLERK_FRONTEND_API`, `CLERK_SYNC_HOST`, `CHROME_EXTENSION_PUBLIC_KEY`; `chrome-web-store`, only after step 2: a Google workload-identity provider whose condition admits only this repository's `chrome-web-store` environment on a tag, and `CWS_PUBLISHER_ID`, `CWS_EXTENSION_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `CWS_SERVICE_ACCOUNT`. Commands: `docs/runbooks/chrome-web-store-publish.md`, "First submission" step 6.
8. `mobile-store-release`: still missing secret `EXPO_TOKEN` and variable `ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS`; the App Store Connect and Play secrets, `ASC_APP_ID` and the live `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` are set (checked 2026-11-10). Steps: `docs/runbooks/mobile-store-first-release.md`.
9. CLI, only after step 2: `AGI_CLI_RELEASE_SIGNING_KEY` (a P-256 key whose public half is pinned in `apps/web/public/install.sh`) as an environment secret of `cli-release`, never a repository secret (`gh secret set AGI_CLI_RELEASE_SIGNING_KEY --env cli-release`); the probe fails if a repository secret of that name exists. Optional `SENTRY_DSN_CLI`, as a repository secret: the build jobs that read it run in no environment, so a `cli-release` copy is never read. The public half is pinned with `node scripts/release/release-signing-key.mjs pin agi-cli-release.pub`, not by hand (`docs/runbooks/cli-release.md`, step 6). The CLI ships only through the signed install script, so it needs no npm token or Homebrew tap. Steps: `docs/runbooks/cli-release.md`.

**Where** GitHub repository settings (environments, secrets, variables); Apple, Azure, Microsoft Entra, Google Cloud, Expo, npm.
**Needed input** Accounts and about two hours.
**How to verify completion** `node scripts/release/check-release-environments.mjs` prints `OK`, then tags `v-cli-0.0.1`, `v-cloud-desktop-1.2.0`, `v-desktop-1.2.1`, `v-vscode-<version in apps/extension-vscode/package.json>`, `v-ext-1.2.0`, `v-mobile-0.0.1` each produce a green release run.
**What remains after founder action** Pushing the tags and verifying each release (agent).
**Impact** RELEASE-BLOCKING (CLI, both desktops, VS Code, Chrome, mobile)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [QwenCloud] Verify provider-funded Free quota for launch

**Why founder assistance is required**
QwenCloud's [Free quota rules](https://docs.qwencloud.com/resources/free-quota)
say calls become paid after quota exhaustion unless the per-model `Free quota
only` switch is enabled. The switch is disabled by default and its state is
available in the account console, not through the inference API. Engineering
cannot attest to the founder's account setting from a model response. The
founder reported on 2026-09-27 that `Free quota only` is enabled; the exact
offerings, account-key match, current balance and expiry remain unverified.
**Exact action** In the QwenCloud Free Tier console, confirm `Free quota only`
for each offering intended for AGI's provider-funded Free catalogue. Confirm
the remaining quota and expiry for those offerings and that the API key in the
deployment belongs to the checked account, without sharing the key itself.
**Where** QwenCloud Free Tier and API Keys consoles.
**How to verify completion** Record an account-bound, current attestation for
the deployment key through the existing admin route; the catalogue then shows
only server-ready offerings. Engineering performs a signed-in mobile test turn
and checks the provider usage and response afterward.
**What remains after founder action** Mobile inference verification and
production deployment checks (agent).
**Impact** FEATURE-BLOCKING (provider-funded Free Qwen models).
**Status** FOUNDER ACTION REQUIRED

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
**What remains after founder action** The certification, pen-test, paging, analytics, customer-managed-key and EU-hosting engineering listed in `audit/prior-audits/enterprise-build-checklist-audit-2026-09-16.md` and the enterprise sections of `audit/partial/` and `audit/missing/`.
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
3. Create the live Team, Basic and Ultra products and prices to match
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
**Also gates** Self-serve Team checkout (Wave 6 of `audit/prior-audits/teams-enterprise-2026-08-22.md`) cannot complete until the live Team product and price ids exist; the rest of that wave proceeds without them.
**Impact** RELEASE-BLOCKING
**What remains after founder action** Until the cutover, `/api/cron/reconcile-credits` answers 500 once a day because six stored subscription ids are unknown to the live Stripe account ("refusing to guess its terminal state", production log 2026-09-10 00:30 UTC); the queue itself processes fine.
**Status** BLOCKED, FOUNDER ACTION REQUIRED

Decided 2026-09-15 (D-2026-09-15-17): preparation proceeds now; the cutover waits for green release-blocking billing, database and QA checks, the code catalogue is canonical, contradictory prices are retired, and the cutover is verified with one real low-value checkout, provisioning and a refund.

## [Enterprise / SSO] Paid Clerk plan with enterprise connections

**Why founder assistance is required**
Enterprise SSO connections (SAML and OIDC) are a paid Clerk feature, so the
plan upgrade is a billing decision on the founder's account.
**Exact action** Upgrade the production Clerk instance to a plan that includes
enterprise connections, and enable them.
**Where** Clerk Dashboard, production instance.
**Needed input** The plan choice and payment.
**How to verify completion** An enterprise connection can be created on the
production instance, and one live SSO sign-in succeeds against a test IdP (see
the QA tenant item above).
**What remains after founder action** The live SSO verification in Wave 5 of
`audit/prior-audits/teams-enterprise-2026-08-22.md`. Until then SSO stays
implemented but unverified, and every claim must describe it that way.
**Impact** FEATURE-BLOCKING (enterprise SSO cannot be verified or claimed)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Mobile] Selling plans in the app (deferred: version 1 sells nothing)

**Why founder assistance is required**
Apple and Google agreements, merchant profiles, products and tax registrations
exist only in the store consoles and belong to the account owner. None of this
is needed for the free version 1; its steps are in
`docs/runbooks/mobile-store-first-release.md`.
**Exact action**

1. Sign the Apple Paid Applications agreement and apply to the Small Business Program.
2. Create the Play Console merchant profile (permanent).
3. Finish the products in both stores as `docs/runbooks/mobile-store-products.md` lists them (the App Store ones were created on 2026-10-21 and are unattached).
4. Register India OIDAR, EU OSS and UK VAT before the first sale.

**Where** App Store Connect, Google Play Console, `apps/mobile/src/features/billing/storePurchases.json`, `apps/mobile/store-listing/`.
**Needed input** Signatures, tax registrations, about ninety minutes.
**How to verify completion** Sandbox purchases verify on both stores as section 8 of the products runbook describes.
**What remains after founder action** `nativePurchases: true`, listings and reviewer notes rewritten for a selling build, a new store review, then `MOBILE_IAP_ENABLED=true`.
**Impact** FEATURE-BLOCKING (in-app sales only; not the first release)
**Status** DEFERRED BY THE OWNER, 2026-11-10

## [Mobile / India] RBI auto-renewal ceiling and Razorpay

**Why founder assistance is required**
Pricing under the RBI ceiling is a commercial call; Razorpay's support for
recurring payments from a foreign entity is a sales conversation.
**Exact action** Pick how Ultra and Team are sold in India (under the ceiling, annual or invoice only, seat cap, or not yet); decide the INR top-up rate; ask Razorpay sales whether recurring subscriptions are available to a foreign entity; get an accountant's view on OIDAR GST.
**Where** Pricing decision, Razorpay sales, accountant.
**Needed input** One pricing decision and one external conversation.
**How to verify completion** The decision is recorded in `docs/decisions/`; if Razorpay proceeds, its answer picks the integration shape.
**What remains after founder action** Decided 2026-09-15 (D-2026-09-15-18): until Razorpay, the accountant and counsel resolve the questions above, Ultra and Team are invoice or assisted-sales only in India and there is no INR top-up conversion; engineering enforces that in checkout now.
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
**Decided 2026-10-22 (decision 45)** Apply to Figma first. DEF-2246 closes when the application is submitted and the issued OAuth client credentials are handed over.
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
**Decided 2026-10-22 (decision 30)** Keep 13. Rows DEF-0672 and DEF-3086 close when counsel confirms 13 as the minimum age on `/privacy` and `/terms`.
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
with the claims `{"surface": "mobile"}` and the default lifetime. Then set
`CLERK_AUTHORIZED_PARTIES` on the production web deployment to the web origin
and the extension's `chrome-extension://<item id>` origin, for example
`https://agiworkforce.com,chrome-extension://<item id>`, before the deploy that
precedes the Chrome submission. Without the extension origin, extension sign-in
appears to succeed and then every API call answers 401. Steps and check:
`docs/runbooks/chrome-web-store-publish.md`, "First submission" step 8.
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
**Progress** The production instance has the `agi-mobile` template (created
2026-10-19 with the Clerk CLI). Still open: the development instance template
and the `CLERK_AUTHORIZED_PARTIES` check on the production web deployment.
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

## [VS Code] Signed CLI release before the Marketplace listing

**Why founder assistance is required**
Publishing a signed multi-platform binary needs signing and distribution
credentials that are not in the repository.
**Exact action** Provide code-signing credentials and a release channel for the `agi` CLI, version `MINIMUM_SUPPORTED_RUNTIME_VERSION` or later speaking `DEVELOPER_SESSION_PROTOCOL_VERSION` (both in `packages/contracts/types/src/developer-session-versioning.ts`; 0.0.1 and protocol 8 on 2026-11-11), on every platform the Marketplace listing serves. The extension is published only after this (`docs/runbooks/vscode-marketplace-publish.md`, "Before the first submission").
**Where** Signing accounts, release infrastructure.
**Needed input** Credentials and a channel decision.
**How to verify completion** In a clean VS Code profile, **Code: Install AGI CLI** installs the published CLI and the extension completes a developer-session turn against it.
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
every Anthropic model in the catalogue sits on this one account, so a paying Premium,
Max or Ultra subscriber who selects any of them gets a provider error, and they are
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
**Exact action** Decided 2026-09-15 (D-2026-09-15-06): the privacy-safe default stays on every plan. What stays with the founder: set the company OpenRouter privacy settings in its dashboard to match (no training-enabled upstreams, data collection denied). At `01bf81b433`, the commit production served on 2026-10-03, background calls and AGI Code do not carry the request-level deny flag, so the dashboard setting this asks for is the only protection for those calls until `L19.0` is deployed (it is on the branch `fix/public-site-audit-2026-10-03`, not in production). `L19.0` does not close this entry: the dashboard setting stays with the founder, and it is the only control for video generation, whose API has no data-policy field.
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
instance before a store build. The production instance already reported the
Native API on (`/v1/environment`, 2026-10-19); the development instance is the
open half.
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

## [Release] First CLI version number: 0.0.1 or 1.0.0

**Why founder assistance is required** Which version a product first ships
under is a product call. `apps/cli/Cargo.toml` and
`MINIMUM_SUPPORTED_RUNTIME_VERSION` say `0.0.1`, and `docs/runbooks/cli-release.md`
step 8 tags `v-cli-0.0.1`, while the site's changelog announces "CLI v1.0"
(2026-05-03, `apps/web/lib/changelog-entries.ts`) for archives on a release the
repository no longer holds.
**The consequence either way** Shipping `0.0.1` leaves a public page that
names a higher version than the first installable one, and anyone still
holding one of the old 1.x binaries is told by `agi update` that their build is
newer than the published release, so it never updates them; they must
reinstall with the install script. Shipping `1.0.0` instead means raising the
version in `apps/cli/Cargo.toml` (Cargo updates `Cargo.lock`) and tagging
`v-cli-1.0.0`; it presents
the first signed build as a stable 1.0 rather than a preview.
**Exact action** Choose `0.0.1` (no change) or `1.0.0`, before runbook step 8.
**Impact** NON-BLOCKING (either choice can ship)
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [CLI] Copilot sign-in: stay removed, or add a real route

**Why founder assistance is required** Whether the CLI offers a provider at
all is a product call, and sending requests to GitHub's service with a Copilot
sign-in from a third-party tool is a terms question only the owner can accept.
**What changed** Until 2026-11-12 a Copilot sign-in silently took every turn
addressed to another provider, even with `--provider` set and a working key
for that provider (finding MR-03 in the 2026-11-11 model routing review). That
capture is removed. The model catalog has no Copilot provider, so nothing
could then use the sign-in; first-run setup no longer offers it and
`agi login copilot` says it is not available. `agi logout --all` still deletes
a token saved by an earlier build.
**The consequence either way** Leaving it removed means a user with only a
Copilot subscription has no way to use it in the CLI. Adding it back properly
means a catalog provider entry with its own model list and trust label, an
explicit `--provider` route, and the owner's acceptance of GitHub's terms for
that use.
**Exact action** Choose "stay removed" (no change) or "add a Copilot route".
**Impact** NON-BLOCKING (the CLI ships either way)
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
**The concrete consequence, re-measured 2026-11-11** The CLI has no release
at all (`gh release list` shows none), so the one documented install route,
`apps/web/public/install.sh`, stops with "No signed AGI CLI release is
published yet". `install.sh` also pins no release key yet, so a tag pushed
today stops at the workflow's pinned-key check before building. Homebrew is not
a documented route (D-2026-09-15-24) and the tap repository is still private.
The CLI steps, including a manual build run that proves every platform before
a key exists, are in `docs/runbooks/cli-release.md`.

**Impact** LAUNCH-BLOCKING (the documented CLI install route has nothing to
install, and on the verification path a missing file is indistinguishable from
a tampered one to the user who is checking precisely because they do not trust
the download)
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

## [Billing / Stripe] Price behind the failing payments check (FR09)

**Why founder assistance is required**
The public `/status` page showed the Payments check failing on 2026-10-03 at
18:51 GMT, while six other checks passed. The probe (`apps/web/lib/server/health-check.ts`,
lines 354 to 381) fails when any configured `STRIPE_PRICE_*` is not an active
recurring Price. The production log on 2026-10-03 at 23:05 UTC records the
reason: `1 configured Stripe Price(s) are not active recurring Prices`, raised
after the products read succeeded, so the Stripe API answers and exactly one
configured Price is inactive or not recurring. Which Price it is can be read
only in the Stripe Dashboard; the retired Pro yearly Price
(`WITHDRAWN_BILLING_INTERVALS` in `packages/contracts/types/src/billing-plan-catalog.ts`)
is the first to check. The public audit attempted no checkout, so whether
customers can pay is unknown. This extends the price cleanup in
"[Billing / Stripe] Live-mode cutover, Team product and price cleanup" above.
**Exact action**

1. The production log line is already read (one configured Price fails the
   active recurring test); note here which Price it is.
2. In the Stripe Dashboard, check whether the retired Pro yearly Price, or any
   Price behind a Vercel `STRIPE_PRICE_*` variable, is archived or sits in a
   different mode than the key.
3. Run one authorised checkout on a plan that is on sale.
4. Publish an incident notice only if that checkout fails.

**Where** Vercel production logs, Stripe Dashboard, `https://agiworkforce.com/api/health`.
**Needed input** About fifteen minutes and one low-value test checkout (decision L09-D1 of the public website audit).
**How to verify completion** `GET /api/health` reports `checks.stripe` healthy
after the probe fix deploys, or the failing step is written down here and the
checkout result is recorded.
**What remains after founder action** The probe fix that stops a retired Price failing the check ships as code; audit row FR09 in `audit/prior-audits/public-website-audit-2026-10-03.md` is narrowed, not deleted, until this is recorded.
**Impact** FEATURE-BLOCKING (upgrades, if checkout is failing)
**Status** FOUNDER ACTION REQUIRED

## [Production env] Email sender and purge switch (L10-D12)

**Why founder assistance is required**
The referral-trial reminder is promised by email two days before conversion, and
the privacy policy says soft-deleted data is held 30 days and then a daily job
deletes it permanently. Whether production has the sender and the purge switch
set is visible only in the Vercel project environment. This extends
"[Production env] Error reporting, tracing, email, push and sign-in providers (F12)"
above, which already lists `RESEND_API_KEY` and `AGI_NOTIFICATIONS_FROM_EMAIL`.
**Exact action** Read, by name only, whether `RESEND_API_KEY`,
`AGI_NOTIFICATIONS_FROM_EMAIL` and `SOFT_DELETED_RESOURCE_PURGE_ENABLED` are set
in the production environment. If the sender is unset, set it before referral
trials are promoted; the planned fix grants no trial without it. If the purge switch is
unset, turn it on or ask for the privacy sentence to be corrected in the same
policy revision.

Two further items ride on the same read and the same sender. First (L10-D8,
audit row TC06): answered on 2026-10-07. `AGI_BLOCK_EEA_TRAFFIC` was set in the
production environment and production refused the EEA from 2026-10-02. The owner
decided the EEA is open at the 2026-10-08 launch, and the lead reports removing
the variable that day, to take effect at the next deploy. No EU or UK
representative is appointed; `/supported-countries` and
`/legal/eu-representative` say so, and counsel's ruling on Article 27 stays open
under the counsel entry below (TC06). Second (audit row TC07): once
the breach-notice drill section exists in `docs/runbooks/personal-data-breach.md`,
run the drill with recipients you control and log it. The drill records the
selected channels, the recipient verification, the approved message, the
delivery evidence and the escalation. No page may say the procedure was
exercised until that log exists.
**Where** Vercel project environment (production), `apps/web/.env.example`.
**Needed input** Three yes or no answers (the three names above), and a sender
address if one is missing. The drill needs your own recipient addresses.
**How to verify completion** The three names are recorded as set or unset, and a test
trial reminder arrives with the right amount and cancel link. The drill log is
dated and names its recipients.
**What remains after founder action** The Stripe test-mode run that proves reminder timing, amount and cancel link needs your authorisation (audit row TC08 in `audit/prior-audits/public-website-audit-2026-10-03.md`). Counsel wording for the EEA statement is held by the counsel entry below (TC06).
**Decided 2026-10-22 (decision 3, DEF-0671)** Counsel rewords the deletion sentence first; set
`SOFT_DELETED_RESOURCE_PURGE_ENABLED` in production only after a recovery check, because every item
deleted more than 30 days earlier is then gone for good.
**Impact** FEATURE-BLOCKING (referral trials)
**Status** FOUNDER ACTION REQUIRED

## [Storage] Public R2 bucket inventory (TC03, L10-D2)

**Why founder assistance is required**
The public policies disclose that some stored files can be fetched by address
without signing in. The code at `01bf81b433` has private-object paths for generated media and
attachments (commit `84b9ca07ce` changed them), but the older public bucket may
still be addressable and may still hold customer files that catalogue rows point at
(`apps/web/lib/server/media-storage.ts`, `apps/web/lib/server/project-knowledge-object-storage.ts`).
Only the storage console shows what it holds, and the public audit did not probe
it. `audit/prior-audits/release-readiness-2026-08-25.md` item 9 is a historical
snapshot of the same decision.
**Exact action** From the storage console, with synthetic probe objects only:
(1) say whether the public bucket is publicly addressable, (2) list what it
holds by prefix, (3) say whether media, knowledge or attachment rows still point
at it, and (4) give the day production first ran the private-bucket change.
**Where** Cloudflare R2 console, production database (read only).
**Needed input** The four answers; about thirty minutes. No customer object is opened.
**How to verify completion** The answers are recorded here and the policy wording
is dated from them. If customer objects remain, a backfill is planned; if only
profile pictures remain, the legacy sentence is dropped in a later revision.
**What remains after founder action** Backfill, removal of the public fallback reads, and a later privacy, DPA and subprocessors revision (audit row TC03 in `audit/prior-audits/public-website-audit-2026-10-03.md`).
**Impact** EXTERNAL-APPROVAL (policy wording depends on the answers)
**Status** FOUNDER ACTION REQUIRED

## [Legal] Counsel questions from the public website audit

**Why founder assistance is required**
The audit corrected several published statements that counsel has not reviewed.
This extends "[Legal] Counsel review and grievance facts (DPDP)" and
"[Trust & Safety] Minimum-age policy" above and section 5 of
`audit/prior-audits/dpdp-audit-log-2026-08-22.md`; it does not replace them.
Until counsel answers, no new legal conclusion is published, the pages keep
their open-item statements, and `data-legal-review` stays `pending-counsel`.
**Exact action** Put these to counsel:

1. Does Article 27 of the GDPR apply, and what interim wording on
   `/legal/eu-representative` is acceptable (L10-D9, audit row TC06)?
2. The DPDP notice and annex, verifiable parental consent in section 9, the
   minimum-age approach, and whether translations are mandatory at this scale
   (L10-D9).
3. May the long publication-floor explanation in the policy-changes intro on
   `/release-notes` move into a disclosure, given that it fixes when the DPA
   subprocessor objection window starts (L03-D16)? Until counsel answers, both
   paragraphs stay visible.
4. Do the corrected DPA storage row and the mail-path statements need separate
   customer notice beyond the page, its date and `/changelog` (L10-D3)?
5. Three further points proceed on a default and need only confirmation: one
   shared launch-notification consent purpose for Mobile, Chrome and VS Code
   (L06-D4); `/mobile/legal` deferring to `/terms` with no mobile-specific
   exception (L10-D7); and a neutral pointer on `/mobile` in place of an
   in-progress compliance status line (L12-D6).
6. Breach notice wording (audit row TC07): the `/status` Notification row and
   `/privacy` now say a notice would arrive in the product and at a dated
   public address, not by email, and the DPA separates the notice to the
   Customer contact from the notice to each affected person. Is that wording
   acceptable under the DPDP Act and the GDPR while no operator mailing path
   exists (`audit/blockers/37-personal-data-breach-open-gaps.md`)?

**Where** `apps/web/app/legal/eu-representative/page.tsx`, `apps/web/app/privacy/india/page.tsx`, `apps/web/app/dpa/page.tsx`, `docs/runbooks/personal-data-breach.md`.
**Needed input** One counsel pass.
**How to verify completion** Counsel's answers are written down and the `data-legal-review` markers are changed by the owner, not by an agent.
**What remains after founder action** Wording edits to the policy pages in a dated version (audit rows TC06 and TC07 in `audit/prior-audits/public-website-audit-2026-10-03.md`).
**Impact** EXTERNAL-APPROVAL
**Status** BLOCKED, FOUNDER ACTION REQUIRED

## [Release] Preview deployment for the signed-in checks

**Why founder assistance is required**
Signed-in screens cannot be driven locally or in CI: the signed-in e2e harness
needs a Clerk secret and a database, and
`apps/web/__tests__/web-e2e-ci-coverage.test.ts` forbids such specs in CI. The
fixes for the signed-in web audit and the provider-training setting are proved by
component tests, and the browser pass needs a Preview deployment. Nothing has
been pushed.
**Exact action** Approve one of two ways to get a Preview deployment of `fix/public-site-audit-2026-10-03`: (a) a push of the branch, which the pre-push guard allows only after the policy release train has registered the three policy pages the branch changes (`/privacy`, `/referral-terms`, `/agent-permissions`); or (b) a Preview deployment made from the worktree with the Vercel CLI, which needs no push and can happen now.
**Where** The Vercel project for `apps/web`; the branch `fix/public-site-audit-2026-10-03`.
**Needed input** One approval, naming (a) or (b).
**How to verify completion** A Preview deployment of the branch is reachable and a signed-in session opens on it.
**Also waiting on a Preview** `/legal/open-source` is no longer force-static (decision 14); confirm on a Preview that it reads `public/legal/third-party-notices.json`.
**What remains after founder action** The Preview browser pass for the rows registered in `audit/prior-audits/signed-in-web-audit-2026-10-03.md` and `audit/prior-audits/public-comparison-2026-10-04.md`, and the signed-in Preview session of Study that gates `L18-D3`.
**Impact** EXTERNAL-APPROVAL
**Status** FOUNDER ACTION REQUIRED

## [Chrome extension] Confirm the 2026-11-12 store-policy calls before the first submission

**Why founder assistance is required**
A Chrome Web Store policy review on 2026-11-12 found four places where the listing or the privacy
text could be read as untrue. The lead settled them with reversible calls so the listing could be
fixed now; each is a product or disclosure call the founder reserves.
**Decisions taken, reversible**

1. Homepage URL is the site root, `https://agiworkforce.com`, for the first submission, because
   `/chrome-extension` says the extension is coming soon. It moves to `/chrome-extension` after
   approval (`docs/runbooks/chrome-web-store-publish.md`, First submission step 14).
2. A page attach keeps sending the current contents of the page's visible form fields (except
   password, payment card, one-time code, PIN and Social Security number fields), and this is now
   disclosed in the extension's Data handling text, the listing and `/privacy`, instead of removed.
3. Stricter wins on the Privacy tab: Personal communications and Location are ticked (page content
   the user attaches or approves for browser control; time-zone name only).
4. `/privacy` takes the change as a further, material revision of its unpublished 2026-11-11
   version rather than a new 2026-11-12 version (`docs/compliance/policy-versions.json`).
   **Exact action** Say yes, or name the call to reverse. To stop sending the time zone instead of
   ticking Location, or to stop sending form contents instead of disclosing them, ask for the code
   change; the listing and `/privacy` then change back with it.
   **Where** `apps/extension/docs/chrome-web-store-listing.md` (Data use disclosures, Listing fields).
   **Needed input** One answer.
   **How to verify completion** The Dashboard's Privacy tab matches the listing document when the item
   is submitted.
   **What remains after founder action** Nothing in engineering unless a call is reversed.
   **Impact** NON-BLOCKING
   **Status** FOUNDER ACTION REQUIRED

## [Remote Control] Deploy the web app, set the relay's standing address, then deploy the relay

**Why founder assistance is required**
The 2026-11-12 relay fixes make the relay ask the web app whether each live pairing may continue
(account, sign-in, plan, workspace policy). In production the relay refuses every registration until
it has that address, so the order matters, and deploys and Fly settings are the owner's.
**Exact action**

1. Deploy the web app first, so `/api/pair/standing` exists.
2. Set `SIGNALING_STANDING_URL=https://<canonical web host>/api/pair/standing` on the relay's Fly
   app, and confirm `SIGNALING_INTERNAL_SECRET` is identical on the relay and the web app.
3. Unset any `WS_MESSAGE_LIMIT`, `TRUSTED_PROXY_HOPS` or `TRUST_PROXY` value set on Fly, so the
   reviewed values in `services/signaling-server/fly.toml` apply.
4. Deploy the relay, then check `/admin/config-backup` shows nothing missing.
5. Confirm the relay's database and the web app's database are the same one: account erasure now
   deletes Remote Control pairing rows through the web app.
6. Confirm nothing else (a CDN or second proxy) sits in front of Fly for the relay's hostname.
7. Nothing to set for `SIGNALING_PAIRING_MAX_LIFETIME_MS`: the relay now ignores a value above
   seven days and logs that once at start, so the 2026-11-11 privacy text (a pairing record is
   kept at most seven days plus about an hour) holds whatever Fly sets.
8. Publish the 2026-11-11 privacy text with this relay deploy or after it, never before: the
   seven-day cap and the expiry sweep it describes exist only in the new relay.
   **Where** Vercel for the web app; the Fly app for the relay; `services/signaling-server/README.md`.
   **Needed input** None beyond the deploys.
   **How to verify completion** A phone pairs with `agi rc`, a long reply streams without being
   cut, and turning Remote Control off for the workspace ends the pairing within about a minute.
   **What remains after founder action** Nothing in engineering.
   **Impact** BLOCKING for the relay deploy only: deploying the relay without step 2 stops Remote
   Control for everyone until it is set.
   **Status** FOUNDER ACTION REQUIRED

## [Code and CLI sign-in] Decide whether a refresh credential used twice within seconds still revokes the device session

**Why founder assistance is required**
Two VS Code windows can renew the same device session at the same moment. The server treats the
second use of a refresh credential as a stolen-credential replay, revokes the whole session family
and signs the user out everywhere. The 2026-11-12 client fix makes a window re-read the stored
credential before renewing and adopt a session another window already renewed, which narrows the
race but cannot close it when both requests are in flight. Closing it changes the replay-detection
policy and its audit trail, which is a security decision.
**Exact action** Choose one:

1. Keep today's rule (any second use revokes). Simultaneous renewals stay a rare forced sign-in.
2. Recommended: for a short window after first use (30 to 60 seconds), when the family is not
   revoked, answer a new non-revoking refusal and issue nothing. The client then adopts the stored
   session. A thief inside the window gains no credential.
3. Return the same successor within the window. That needs the successor stored encrypted for the
   grace period.
   **Where** `apps/web/app/api/auth/device/refresh/route.ts`; the error list in
   `packages/contracts/cloud-contracts/src/device-authorization.ts`; `rotateAccountSession` in
   `apps/extension-vscode/src/utils/api.ts`.
   **Needed input** The choice, and the window length for option 2 or 3.
   **How to verify completion** Two windows renewing together both stay signed in, and a replay
   after the window still revokes the family.
   **What remains after founder action** Engineering implements the chosen option on the server and
   in the two clients.
   **Impact** NOT BLOCKING for any release.
   **Status** FOUNDER DECISION REQUIRED
