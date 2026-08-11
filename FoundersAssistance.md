# Founder assistance

Status: Current
Owner: Platform lead
Last updated: 2026-08-11

Things the remediation cannot finish in code, because they need a dashboard, a
credential, a paid account, or a product decision that is not mine to make.

Each entry states what is blocked, what it costs to leave it, and the exact
steps. Nothing here is a suggestion for improvement — every item is a gate that
something else is waiting behind.

---

## 1. Restore `tools/skill-vetting/README.md` on `chore/retire-stale-docs`

**Blocks:** the skill supply-chain security gate, on that branch only.

Commit `7214d0c70` deleted `tools/skill-vetting/README.md`, but
`tools/skill-vetting/pyproject.toml:9` declares `readme = "README.md"`. Hatchling
treats that as a hard requirement, so `uv pip install` fails with
`OSError: Readme file does not exist: README.md`, and `verify.sh` runs under
`set -euo pipefail` — it aborts before scanning anything.
`.github/workflows/repo-operability.yml:188` runs that script, so the vetting
proof and the follow-on `scan-skills-with-vetting.mjs` step are both skipped.

Reproduced end to end by a verification agent. It does **not** reproduce on the
current branch (`fix/codeql-high-severity-batch-1`), where the README is present
and byte-identical to the pre-deletion version — so this is only a problem for
`chore/retire-stale-docs`, and only until that branch merges.

**Do:** on `chore/retire-stale-docs`, `git checkout 7214d0c70^ --
tools/skill-vetting/README.md`. Restore the file rather than dropping `readme =`
from `pyproject.toml` — the pointer is correct, the deletion was the mistake.
That commit's own message states its policy as "kept every markdown a build or a
published artifact consumes" and lists the Cargo and npm cases; hatchling
`readme =` is exactly that case and was missed.

---

## 2. Stop `verify.sh` reusing a cached venv in CI

**Blocks:** nothing today. It makes item 1 invisible, which is worse.

`tools/skill-vetting/verify.sh` reuses `$TMPDIR/skill-vetting-venv` when present.
A warm venv skips the install step entirely, so the gate reports success even
when the README is missing and the package cannot build. A CI runner with a
cached `TMPDIR` would go green while the gate was disarmed.

Found only because the verifying agent deleted the venv and re-ran; the first run
printed "reusing venv" and passed.

**Do:** decide whether CI should pass `--no-cache` (or set a per-run `TMPDIR`)
while local developer runs keep the cache. A security gate that passes because
it skipped its own setup is the failure mode this whole remediation exists to
find.

---

## 3. Vercel Git Comments toggle

**Blocks:** preview deployments.

Carried forward from earlier in this remediation and not yet actioned.

---

## 4. Disable CodeQL default setup

**Blocks:** Rust analysis on pull requests.

The repository has both default and advanced CodeQL setup. While default setup
is enabled, the advanced configuration's Rust analysis does not run on PRs, so
Rust findings are only ever discovered after merge.

**Do:** Settings → Code security → Code scanning → disable **Default setup**, so
`.github/workflows/codeql.yml` becomes the only configuration.

---

## 5. Grant the Stripe CLI permission to create the live Team product

**Blocks:** self-serve Team checkout. The product UI, minimum-two-seat selector,
member invitations, and billing quantity contract are implemented, but production
correctly reports Team checkout as unavailable because the live Team Price IDs do
not exist.

The Stripe CLI is authenticated to the correct live **AGI WORKFORCE** account
(`acct_1SgweG0zEfO6BZMh`), but Stripe rejected the attempted idempotent product
creation with `more_permissions_required`. No live Stripe object was created.

**Do:** in the Stripe Dashboard, open **Developers → API keys → Restricted
keys**, edit the key used by the Stripe CLI, and enable **Products: Write** and
**Features: Write**. Then run `stripe login` again if the CLI session does not
refresh automatically and tell Codex to continue. Codex will create one live Team
product with recurring Prices of **$25 USD per licensed seat per month** and
**$240 USD per licensed seat per year**, set
`STRIPE_PRICE_TEAM_MONTHLY_USD` and `STRIPE_PRICE_TEAM_YEARLY_USD` in the Vercel
Production environment, redeploy, and verify `/api/pricing/localized` reports
Team checkout as ready. INR yearly remains intentionally unavailable because no
founder-approved INR yearly price exists.

---

## 6. Register the first cross-platform connector OAuth applications

**Blocks:** turning the catalog's Google Workspace, Slack, Notion, and
Microsoft 365 entries from discoverable cards into real per-user connections.
AGI's broker, encrypted token storage, revocation, tenant isolation, MCP tool
permission controls, and approval flow are implemented; provider-issued client
credentials cannot be created by Codex.

In each provider's developer/admin console, create AGI's production OAuth
application with this exact redirect URI:

```text
https://agiworkforce.com/api/connectors/oauth/callback
```

Register Google services as separate connector applications/scopes where the
provider requires it (`gmail`, `google-calendar`, and `google-drive`); do not
merge their consent into a single broad card. Register Slack, Notion, and the
Microsoft 365 tenant application with the minimum read scopes first. Do not
enable send, create, update, delete, financial, or administrative scopes in the
first wave.

When the consoles show each client ID and secret, add them directly to the
Production and Preview Web deployment environments as
`CONNECTOR_OAUTH_<CONNECTOR_ID>_CLIENT_ID` and
`CONNECTOR_OAUTH_<CONNECTOR_ID>_CLIENT_SECRET`. Do not paste secrets into chat,
source, or `CONNECTOR_OAUTH_PROVIDERS_JSON`. The non-secret JSON descriptor must
use authorization, token, revocation, MCP endpoint, and scope values copied
from that provider's current official documentation; Codex will validate and
install those descriptors after you say the registrations are ready.

GitHub remains separate: it uses the existing GitHub App credentials and should
not be duplicated in the generic OAuth registry.

---

## 7. Wait for Vercel Hobby Fluid Active CPU capacity to reset

**Blocks:** another production build or deployment from this workspace. It does
not block local development, local browser verification, or the currently live
production deployment.

The Vercel Hobby team reported 100% use of its included four hours of Fluid
Active CPU on 2026-08-11. The founder does not want to upgrade. An unaliased
deployment that had just started was cancelled and removed before any public
alias or production promotion, so the current production deployment remains in
place.

**Do:** wait for Vercel's free allowance to reset or for the dashboard to show
available included capacity. Do not start another remote build merely to probe
the limit. When free capacity is available, run one working-tree deployment
because this release includes required untracked files; verify it on the
unaliased URL first, then promote only after the signed-in smoke checks pass.

---

## 8. Rotate and configure the OpenRouter video credential

**Blocks:** a paid Seedance end-to-end generation and signed webhook smoke. It
does not block the local demo: the reconciled schema enables video mode, the
catalog-derived picker exposes the OpenRouter video option, and model selection was
verified locally without provider egress.

The existing local OpenRouter credential was surfaced by an earlier broad local
search and must be treated as exposed. No paid request was sent with it.

**Do:** revoke that credential in OpenRouter, create a replacement with the
minimum required scope, and put it directly in the local/deployment environment
as `OPENROUTER_API_KEY`; do not paste it into chat or source. Configure the same
`OPENROUTER_WEBHOOK_SECRET` in the OpenRouter workspace and Web runtime and use a
public HTTPS `NEXT_PUBLIC_APP_URL` before webhook testing. After the private
video bucket is ready, authorize one paid Seedance smoke; until then, keep the
local UI/catalog verification non-egressing.

---

## 9. Provide the stable Chrome Web Store public key for release packaging

**Blocks:** producing the final Chrome Web Store ZIP with the same extension ID
as the published item. It does not block local unpacked-extension demos: the
production Chrome bundle and all extension tests build and pass locally.

`pnpm --filter @agiworkforce/extension package` intentionally fails closed when
`CHROME_EXTENSION_PUBLIC_KEY` is absent, because packaging without the Web Store
public key would create a different CRX identity and break the Clerk extension
origin allowlist. The local verification on 2026-08-11 passed typecheck, both
production Vite builds, and 1,470 tests before stopping at this release-only
identity guard.

**Do:** copy the single-line base64 DER RSA public key for the existing AGI item
from the Chrome Web Store dashboard and set it as the repository/developer
environment value `CHROME_EXTENSION_PUBLIC_KEY` (it is public identity material,
not a private signing key). Then rerun the package command and confirm the
resulting item ID matches `CWS_EXTENSION_ID`. Follow
`apps/extension/CHROME_WEB_STORE_PUBLISH_RUNBOOK.md`; do not paste a private key
or rotate the published item identity.

---

## 10. Create bucket-scoped R2 S3 credentials for local media lifecycle QA

**Blocks:** general local-browser verification of permanent Library deletion,
media cleanup, and deletion reconciliation. It does not require a Vercel upgrade
and does not block ordinary local Library browsing or recoverable 30-day soft
deletion.

The Web storage service deletes objects through R2's S3-compatible API. Wrangler
is authenticated and the `agiworkforce-media` bucket exists, but the local Web
runtime has no R2 S3 access-key pair. Permanent deletion therefore fails closed:
the object and database pointer are retained together instead of deleting only
the row and orphaning private bytes. The single retired model artifact
was removed safely by resolving its exact row and object key and deleting both;
that one-off operator action is not a substitute for runtime credentials.

**Do:** in Cloudflare Dashboard → R2 → **Manage R2 API Tokens**, create an
Object Read & Write token scoped only to `agiworkforce-media`. Put its Access Key
ID and Secret Access Key directly in the local Web environment as
`CLOUDFLARE_R2_ACCESS_KEY_ID` and `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, together
with the existing account ID, bucket name, and public base URL keys documented
in `apps/web/.env.local.example`. Do not paste the secret into chat or source.
Then run `node apps/web/scripts/verify-r2-connection.mjs` and repeat the signed-in
Library soft-delete, restore, and permanent-delete browser loop. Use a separate
private bucket and credentials for generated video as required by the adjacent
environment example; never reuse the public media bucket for private video.

---

## 11. Apply the purchased-credit carry migration before exposing top-ups

**Blocks:** production top-up checkout. The local route, Stripe Checkout,
webhook settlement/refund safeguards, and Billing UI are implemented, but the
new purchased-balance lifecycle depends on unapplied migration
`0111_credit_top_up_carry.sql`.

**Do:** review and apply migration 0111 through the canonical Neon migration
workflow before deploying the top-up UI/API. It adds separate purchased-credit
allocation, a unique Stripe Checkout Session receipt, refund retirement, and
12-month renewal carry. Do not expose `/api/billing/top-up` before the migration
is present. No new Stripe Product or recurring Price is required: top-ups use a
server-owned one-time Checkout amount. After Vercel's free capacity resets,
perform one explicitly authorized test-mode $10 Checkout and verify that it
grants exactly 500 units once, including after webhook replay; do not use a live
card for this proof.

---

## 12. Register and configure native Mobile subscriptions and top-ups

**Blocks:** enabling real iOS and Android in-app purchases. The Mobile purchase
UI, StoreKit/Google Play client, server-side receipt verification, idempotent
credit/subscription ledger, restore flow, renewal/cancellation/refund handling,
and store notification endpoints are implemented and locally tested. They stay
fail-closed until both stores contain exact products and migration
`0112_mobile_native_iap.sql` is applied. No store product was guessed or created
by Codex.

**Do:** complete these steps in App Store Connect and Google Play Console. Use
opaque store IDs of your choice and record the exact mapping; do not rename the
logical keys below in source:

1. Create subscriptions for `subscription_basic_monthly`,
   `subscription_pro_monthly`, `subscription_pro_yearly`,
   `subscription_max_monthly`, and `subscription_max_15x_monthly`. In App Store
   Connect, put them in one subscription group and assign upgrade levels so
   StoreKit owns upgrade/downgrade proration. In Google Play, configure the
   corresponding subscription products/base plans and keep prorated replacement
   enabled; the app requests `charge-prorated-price` for Android upgrades.
2. Create consumable one-time products for `top_up_10`, `top_up_20`,
   `top_up_50`, and `top_up_100`, priced at exactly **$10, $20, $50, and $100**
   in the base USD storefront. They grant **500, 1,000, 2,500, and 5,000
   units** respectively: 50 units per dollar, with no product below $10.
3. Apply Neon migrations **0111**, then **0112**, through the canonical migration
   workflow. Do not enable native purchases before both migrations are present.
4. Add the exact logical-key-to-store-ID maps to the Web runtime as
   `MOBILE_IAP_APPLE_PRODUCT_IDS_JSON` and
   `MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON`. Keep `MOBILE_IAP_ENABLED=false` until
   sandbox verification succeeds.
5. Configure Apple verification with `APPLE_APP_STORE_BUNDLE_ID`,
   `APPLE_APP_STORE_APP_ID`, and
   `APPLE_APP_STORE_ROOT_CA_CERTS_BASE64_JSON`. Register App Store Server
   Notifications V2 at
   `https://agiworkforce.com/api/mobile/iap/apple-notifications`.
6. Configure Google verification with `GOOGLE_PLAY_PACKAGE_NAME` and
   `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. Configure authenticated Pub/Sub RTDN to
   `https://agiworkforce.com/api/mobile/iap/google-notifications`, then set the
   exact push audience and service-account email in
   `GOOGLE_PLAY_PUBSUB_AUDIENCE` and
   `GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL`.
7. Produce a custom native development/preview build; Expo Go cannot load the
   native billing module. Using Apple sandbox and Google license-test accounts,
   verify each subscription purchase, upgrade, downgrade, restore, renewal,
   cancellation, expiry, top-up, webhook replay, partial refund, full refund,
   and refund reversal. Confirm the system purchase sheet shows the exact
   localized amount and that the server grants each purchase only once.
8. Only after those checks pass, set `MOBILE_IAP_ENABLED=true`, update the App
   Store/Play listing disclosures to say native purchases are available, and
   submit the build for review. Never paste store credentials, service-account
   JSON, or private keys into chat or source.

The Web Stripe subscription/top-up route remains separate. Native store
purchases must use Apple/Google billing inside the Mobile app; Stripe must not
be presented as an alternate in-app checkout.

---

## 13. Run the final iOS 27 and Android on-device model hardware matrix

**Blocks:** claiming physical-device certification for iOS 27 and the newest
Google on-device model. The Mobile workspace is upgraded to Expo 57 / React
Native 0.86, the iOS bridge uses Apple's real Foundation Models framework when
the OS/device reports it available, and Android uses ML Kit's Prompt API over
AICore. Local Mode remains offline and falls back only to another local runtime.
This Mac has Xcode 26.6 and can validate the iOS 26 SDK path, but it cannot
honestly certify an Xcode 27/iOS 27 build or the model behavior on hardware that
is not attached.

**Do:** complete this matrix before App Store/Play submission:

1. Install the current Xcode 27 beta or final release on this Mac, select it with
   `xcode-select`, and run a clean Expo prebuild plus Release archive. Confirm the
   generated app has an iOS launch-screen declaration and that the archive is
   built with the iOS 27 SDK. Do not hand-edit the generated `apps/mobile/ios`
   project; all native sources and settings come from tracked config plugins.
2. On an Apple Intelligence-capable physical device running iOS 27 with Apple
   Intelligence enabled, run Local Mode through availability, first-token
   streaming, cancellation, thermal throttling, an unavailable/disabled state,
   and a multi-turn prompt. Verify Settings identifies the Apple system model
   and airplane mode produces a response without network egress.
3. Re-run the prompt-quality fixtures on iOS 27. Apple explicitly changes the
   on-device system model with the OS release, so passing on iOS 26 is not a
   substitute for validating the iOS 27 model's behavior.
4. On supported Android hardware with the current AICore model, verify ML Kit
   reports `AVAILABLE` (or completes its system download), streams a Local Mode
   response in airplane mode, handles foreground/quota failures, and never
   falls through to AGI Cloud. The production AICore path is Gemini Nano; its
   current generation is based on Google's Gemma architecture. Do not relabel an older Nano device
   as a standalone Gemma checkpoint. A separately bundled Gemma artifact must
   remain hidden until its exact license, bytes, checksum, runtime, RAM, and
   thermal matrix are independently verified.
5. Record the physical device/OS/model availability results in the store release
   checklist, then regenerate App Store and Play screenshots from those release
   builds.

No Apple/Google developer credential is needed for local compilation, but the
physical-device and store-signing steps require the developer accounts already
listed in the native purchase item above.

---

## Not blocked, but worth a decision

**`readme = "<file>"` is an invisible coupling.** A documentation sweep can
disarm a security gate through it, and nothing in the guard chain knows the
pointer exists. Either `check-executable-docs.mjs` should learn about hatchling
`readme =` pointers the way it already knows about Cargo `readme` and npm
`files[]`, or the coupling should be removed. Left alone so far because it sits
outside the write set of the item that found it.
