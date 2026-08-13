# Founder assistance

Status: Current
Owner: Platform lead
Last updated: 2026-08-13

Things the remediation cannot finish in code, because they need a dashboard, a
credential, a paid account, or a product decision that is not mine to make.

Each active entry states what is blocked, what it costs to leave it, and the
exact steps. Branch-specific or source-resolved carryovers are labeled
explicitly so they are not mistaken for current founder gates.

---

## 1. Restore `tools/skill-vetting/README.md` on `chore/retire-stale-docs`

**Status:** `BRANCH-SPECIFIC`, not a blocker in the current release worktree.

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

**Status:** `CODE_BACKLOG`, not blocked by founder access or a dashboard.

**Blocks:** nothing today. It makes item 1 invisible, which is worse. This is
retained here only so the branch-specific context is not lost; it belongs in a
normal CI remediation lane rather than the founder-action queue.

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
origin allowlist. The local verification on 2026-08-13 passed extension
typecheck, lint, both production Vite builds, cloud-IPC and color guards, two
real Chromium smoke loops, and the 320/390/500px dark/light rendered review
before stopping at this release-only identity guard.

The same run had no real Google Chrome profile available for a live side-panel
or Options click-through. That does not weaken the Chromium layout evidence,
but it is not exact Chrome Web Store/profile acceptance evidence; the browser
and live-account portion remains tracked separately in item #14.

**Do:** copy the single-line base64 DER RSA public key for the existing AGI item
from the Chrome Web Store dashboard and set it as the repository/developer
environment value `CHROME_EXTENSION_PUBLIC_KEY` (it is public identity material,
not a private signing key). Then rerun the package command and confirm the
resulting item ID matches `CWS_EXTENSION_ID`. Follow
`apps/extension/CHROME_WEB_STORE_PUBLISH_RUNBOOK.md`; do not paste a private key
or rotate the published item identity.

---

## 10. Recheck local R2 media lifecycle acceptance

**Status:** `NO LONGER PROVEN BLOCKED_BY_HUMAN`; one-app Web acceptance remains.

The earlier “local runtime has no R2 S3 access-key pair” claim is stale. Both
local Web environment files now declare the account, access key, secret,
public bucket, and distinct private bucket settings, and the durable video
ledger records a successful PUT/HEAD/GET/DELETE round-trip with the replacement
account-owned token across both buckets. Secret values were not printed or
revalidated during this source-only reconciliation.

**Remaining acceptance:** in the next one-app Web loop, use a synthetic owned
asset to repeat Library soft-delete, restore, and double-confirmed permanent
delete. Confirm both the R2 object and owner-scoped database pointer disappear.
If that fails because the declared credentials are invalid or insufficiently
scoped, restore this as a concrete founder credential action with the exact
non-secret error; until then, do not ask for a second token pre-emptively.

Permanent deletion must continue to fail closed by retaining the database
pointer if object deletion cannot be authenticated.

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

## 14. Verify exact-package Chrome presentation and signed-in chat continuity

**Blocks:** exact packaged-store presentation evidence plus acceptance proof that a Chrome
Managed Cloud chat appears in Web, Mobile Cloud, Tauri Cloud, and Electron
Cloud. The UI implementation, automatic mirror, provenance gate, owner
fencing, retry/idempotency, deletion tombstones, shared-store consumers, tests,
typecheck, lint, cloud-egress guard, and production build are complete.

**Already verified locally:** `pnpm --filter @agiworkforce/extension test:e2e` loads
the real unpacked MV3 build in Chromium, passes the 320/390/500px dark/light
overflow matrix, contains the model and approval menus, verifies Escape
dismissal, drives drawer/model/composer/allowlist/autofill flows, and builds
without CSP or page exceptions. On 2026-08-13 this loop passed twice. Separate
rendered captures also verified Options and the injected page panel; that review
caught and fixed the previously hidden 320px navigation overflow and truncated
Managed Cloud boundary label. With `AGI_E2E_SCREENSHOT_DIR` and an exact ZIP,
the same harness captures named exact-artifact screenshots.

**Why the remainder is manual:** it needs a published/exact signed package, a
live authenticated test account, and Web, Mobile Cloud, Tauri Cloud, and
Electron Cloud running together. No remaining code change can substitute for
that deployed-account proof.

**Observed 2026-08-13:** no real Google Chrome profile was available to this
one-app run, and the stable Web Store public key was absent. The run therefore
could neither create the stable-ID ZIP nor perform an exact-browser/profile
click-through. The completed Playwright Chromium loop remains valid unpacked-UI
evidence, but it is not a substitute for these two release acceptance steps.

**Do:**

1. Make the current stable Google Chrome and the intended test profile
   available, then open Chrome → `chrome://extensions`, enable **Developer mode**, choose
   **Load unpacked**, and select
   `apps/extension/dist`.
2. Open the AGI side panel at approximately 320px, 390px, and 500px widths.
   Confirm the header actions and composer never clip or scroll horizontally;
   the branded empty state, rounded composer, warm-neutral surfaces, terra Send
   button, and Cloud/local trust strip remain readable in dark and light mode.
3. Open the model, attachment, reasoning, and browser-action approval menus.
   Confirm each menu stays inside the panel, uses the rounded elevated surface,
   closes with Escape, and can be traversed with Tab plus arrow keys where
   applicable. Selecting **Full access** must require the explicit menu choice;
   clicking the status itself must not change the approval boundary.
4. Open **AGI Chrome settings**. Confirm the 16px cards, sidebar navigation,
   focus rings, headings, toggles, approved-sites list, account controls, and
   mobile horizontal navigation render without overlap in dark and light mode.
5. Sign in to the same test account used on Web,
   Mobile Cloud, Tauri Cloud, and Electron Cloud.
6. Start a new Chrome chat with a distinctive prompt such as
   `Chrome continuity check 2026-08-13`, wait for the assistant response to
   finish, and confirm the composer says **Syncs to your account**.
7. Open conversation history on each Cloud surface and confirm the same title,
   user turn, assistant turn, ordering, and resolved model label appear. Refresh
   each surface once to prove server persistence rather than in-memory state.
8. Delete the chat from Chrome. Within one minute, refresh the other Cloud
   surfaces and confirm the account copy is gone. If deletion cannot be queued,
   Chrome must keep the local history row and show **Could not delete this chat.
   Try again.**
9. For the fail-closed proof, an old pre-feature Chrome conversation with
   unknown provenance must remain labeled **Saved on this device** and must not
   appear in account history.

**How to report:** record pass/fail plus any console/network error. A failure
needs the Chrome service-worker log and the response status for
`/api/chat/conversations`; do not paste bearer tokens or captured page content.

**Status:** `BLOCKED_BY_HUMAN` only for the exact signed package, real-Chrome
profile pass, and live-account cross-surface continuity/deletion steps. The
unpacked rendered-UI loop is complete and green.

---

## 15. Deploy and accept the Mobile Cloud map-card path

**Blocks:** claiming that map results work in the production Mobile Cloud app.
The local implementation and regression matrix are complete: Mobile advertises
`map-search.v1`, the server offers `search_maps` to the Mobile surface only when
that exact capability and map intent are present, native tiles carry the
signed-in Bearer header, Local performs no Managed Cloud tile request, and cards
persist through Cloud message metadata.

**Observed 2026-08-13:** a real iPhone 17 Pro / iOS 26.5 simulator send against
`https://agiworkforce.com` completed successfully but returned prose saying it
could not display an interactive map. That is expected from the currently
deployed backend because the Mobile `search_maps` admission change in this
worktree has not been deployed. Pointing the app at the local Next.js server was
not an acceptable substitute: its Clerk environment did not recognize the
existing production session and the app failed closed with `Authentication
required`.

**Do:** after the current server/mobile changes are reviewed and deployed:

1. Install or update the signed Mobile build that advertises
   `x_interactive_cards.supported = ['map-search.v1']` and sign in to the same
   test account used for Cloud continuity checks.
2. Ask `Find three coffee shops near downtown Austin and show them on a map.`
   Confirm the request reaches the deployed chat route with surface `mobile`,
   Web Search enabled, and the advertised card kind. Do not capture bearer
   tokens in screenshots or logs.
3. Confirm the transcript shows a compact activity row followed by one rounded
   map card with authenticated tiles, numbered places, and a working external
   Maps action. The assistant must not say maps are unavailable when a valid
   card was emitted.
4. Background and reopen the app, then open the same Cloud conversation on Web.
   Confirm exactly one validated map card remains on both surfaces.
5. Switch to Local and confirm no request reaches `/api/maps/tile/*`; any old
   Cloud map content must not be presented as locally generated.
6. Exercise signed-out and denied-tile states. The card must keep an honest
   `Open in Maps` fallback and never show a blank tile canvas as success.

**Status:** `BLOCKED_BY_HUMAN` until the server/mobile build is deployed and the
credentialed acceptance pass succeeds. No production deployment was performed
from the dirty multi-surface worktree.

---

## 16. Provide a routing credential so map cards can draw a real route line

- **What is blocked.** The `map-search.v1` card renders real OpenStreetMap
  tiles with numbered pins and a place list, but it cannot draw the driving
  route between them. Claude's equivalent card draws the polyline and states
  "about 1,220 miles, roughly 18 hours, via I-20 W", which is the single
  biggest remaining visual gap for a demo recording.
- **Why the agent cannot do it.** Drawing a route needs a routing engine, and
  every viable one needs a credential or forbids production use:
  - `GOOGLE_API_KEY` is a Generative Language key, NOT a Maps Platform key.
    Verified 2026-08-12 against the real value: Maps Static, Geocoding and
    Directions all return `REQUEST_DENIED / API key is invalid`, while
    `generativelanguage.googleapis.com` returns the Gemini catalogue.
  - OSRM's public demo server (`router.project-osrm.org`) is documented as
    development-only with no SLA, so it must not back a shipped feature.
  - Geocoding is fine as-is: Nominatim is keyless and already in use.
- **Exact founder steps.** Pick ONE:
  1. **OpenRouteService** (recommended for a keyless-ish start) — sign up at
     `openrouteservice.org`, create a token, free tier is ~2,000 requests/day.
     Then `vercel env add OPENROUTE_API_KEY production` and add it to
     `.env.local`.
  2. **Google Maps Platform** — in Google Cloud, enable _Directions API_,
     _Geocoding API_ and _Maps Static API_, create a SEPARATE key from the
     Gemini one, restrict it by HTTP referrer/IP, then
     `vercel env add GOOGLE_MAPS_API_KEY production`. This also unlocks
     Google-quality tiles and place photos, matching the reference card most
     closely, but it is billed per request.
- **How to verify.** Ask the product "show me a map of the route from Dallas to
  Las Vegas". The card should draw a line following I-20/I-10/I-40 rather than
  only pinning the two endpoints.
- **What becomes available afterward.** Route polylines, real distance and
  duration in the answer text, and — on the Google option — themed tiles and
  place thumbnails.
- Status: `BLOCKED_BY_HUMAN`. The card ships and is useful without it; the
  renderer will gain the line with no further UI work once a provider exists.

---

## 17. Approve a verified Local model profile before enabling Desktop Tasks

**Blocks:** claiming that Desktop Local **Tasks** can run on the models
currently installed on this machine. Project Chat remains available and was
manually verified with the selected Ollama model.

**Observed 2026-08-13:** Ollama reports the installed models as completion-only
or as supporting generic function tools, vision, and/or thinking. None is an
exact model in the canonical registry with both `tools` and `agentic`
capabilities. Those runtime flags do not prove that a model can produce valid
AGI plans or invoke the registered Task tool vocabulary. A manual attempt with
the installed model named by `AGI_WDIO_OLLAMA_MODEL_ID` generated malformed or
invented tool identifiers, confirming that generic tool support is not sufficient.

**Already fixed:** the model picker now labels dynamic models only with
provider-reported capabilities and no invented quality tier. The Tasks creator
shows an explicit **available for chat, not Tasks** state, disables Launch in
every execution mode, and the Rust command boundary independently rejects the
same unverified model. The one-app WDIO pass exercised real picker clicks,
Sequential/Parallel controls, the disabled launch state, and the native
rejection.

**Founder action:** choose a concrete Local model/build that is acceptable for
the 16 GB minimum device target and approve its validation matrix. The profile
must be added only after empirical checks prove stable structured planning,
exact registered tool IDs, permission handling, cancellation, and bounded
memory/latency. Do not alias an Ollama tag to a similarly named cloud model.

**Acceptance:** after the verified profile is in the canonical model registry,
repeat the WDIO journey with that exact installed tag/digest. Launch must become
enabled, the native planner and executor must use the selected model, a
one-step disposable task must reach **Ready for review** with inspectable
output, and restart/status history must retain the result. No Local prompt or
tool payload may leave the device.

**Status:** `BLOCKED_BY_HUMAN` until a Local Tasks model/resource target is
chosen and approved for empirical certification.

---

## 18. Align Stripe key mode, recurring Price IDs, and production checkout

**Blocks:** proving that Basic, Pro, and Max upgrades can enter Stripe Checkout
from the public Pricing and Billing surfaces. The UI and ownership guards now
fail closed, but a correctly rendered plan is not the same as a purchasable
plan.

**Observed 2026-08-13:** the signed-in local Web browser loop loaded the real
account, plan, payment method, invoices, and Billing controls. The localized
pricing endpoint then rejected every configured Pro/Max Price lookup because
the supplied Stripe secret was test-mode while those Price IDs exist in live
mode. It served catalog prices for display and correctly kept checkout closed.
Basic, Max 15x, and Team Price IDs were also absent from the local runtime.
No checkout session or payment was created.

**Founder action:** in each Vercel environment, verify that
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and every configured
`STRIPE_PRICE_*` value belong to the same Stripe account and mode. Preview/test
must use test Prices; Production must use live Prices. Complete item 5 for Team,
add the founder-approved Basic and Max 15x Prices, configure the Customer Portal,
and redeploy. Do not paste any secret into chat or source.

**Acceptance:** with an explicitly authorized test customer, `/api/pricing/localized`
must report checkout-ready exact Price IDs; Pricing must open an owned Checkout
Session; the signed webhook must provision the expected tier once; returning to
Billing must show the verified payment/activation state; replay must not grant a
second entitlement. Repeat once against Production with a founder-authorized
live transaction and refund it through the normal operator process.

**Status:** `BLOCKED_BY_HUMAN`. Source and local UI behavior are complete; the
remaining proof requires Stripe/Vercel dashboard configuration and an
authorized transaction.

---

## 19. Publish and certify the developer-session protocol 7 AGI CLI

**Blocks:** using the public VS Code extension for real Local, provider BYOK,
or Managed Cloud developer turns. The packaged extension is usable for
onboarding, account/billing, Settings, Context, and workspace Memory, but it
correctly disables the composer when its AGI CLI is missing or too old.

**Observed 2026-08-13:** the verified `agi-workforce-0.3.0.vsix` was installed
into a clean VS Code 1.131 profile and manually exercised. The host found an AGI
CLI, but its developer-session handshake did not support protocol 7. The
sidebar stayed on `Route pending`, displayed the exact upgrade/path recovery,
opened Runtime Settings, and sent no prompt. No AGI extension-host error or
warning occurred.

**Founder/release action:** publish a signed protocol-7 `agi` CLI with a
supported version of at least 1.7.1 for every Marketplace platform, document
the official install/update/rollback/uninstall path, and make that artifact
available to the extension's clean-machine setup journey. Do not point users at
an unpublished workspace build or silently fall back to another trust boundary.

**Acceptance:** in a fresh signed package/profile, verify CLI discovery,
version/protocol handshake, and one real thread for each configured boundary:
Local, provider BYOK, and Managed Cloud. Before `turn/start`, the header must
switch from `Route pending` to the CLI-reported boundary; account refresh must
not change it. Exercise streaming activity, a denied and approved tool, Stop,
resume/history, missing/old CLI recovery, update, rollback, and uninstall. Prove
that Local/BYOK developer sessions remain workspace-scoped and never enter
consumer chat history.

**Status:** `BLOCKED_BY_HUMAN` until the signed CLI artifact and release channel
exist. The extension UI/package fail closed and are source-verified; a release
binary cannot be fabricated inside this worktree.

---

## 20. Ratify the remaining public-media and orphan-upload policy

**Blocks:** claiming that every Web upload is private, byte-inspected before
public access, and covered by retention/account erasure.

**Already patched in source:** chat attachments and project knowledge now use
the provisioned private R2 bucket for direct presigned PUTs, return opaque keys
only, scan private bytes before registration, and leave reads/deletes behind
their existing owner/workspace API gates. Legacy public rows remain readable
and deletable during rollout. New generated images, videos, and files also use
owner-hashed keys in the private bucket and leave only through the catalog-backed
`/api/files/{id}` owner gate. An uncataloged generated file is now removed and
reported as a storage failure instead of being returned through a raw locator.
This was source-only while another app owned the one runtime slot, so the
focused Web and deployed R2 acceptance pass is still due.

**Decision required:** avatars still upload directly to the public bucket and
persist a permanent URL. Replacing one loses the only pointer to the previous
avatar object. Generated objects created before the private-storage change also
retain their public locations until a migration policy is chosen. Pick one
avatar policy:

1. **Private by default (recommended):** move avatars to the private bucket and
   serve them through authenticated or short-lived signed routes.
   Migrate/delete legacy public objects, then disable the public custom domain.
2. **Public avatars only:** stage each avatar in private storage, inspect its
   real bytes, copy only an accepted image public, and delete the prior owned
   avatar on successful replacement. Keep generated media private.

For either policy, approve a pending-upload lifecycle: write presigns under a
staging prefix and apply a bounded R2 lifecycle rule (or durable pending-row
cron) so a client that never calls completion cannot create an untracked object
that account erasure cannot find. Specify the legacy migration window and the
allowed recovery/retention duration.

**Acceptance:** after deployment, use a synthetic account to prove private PUT
→ inspection → owner-only read → deletion for chat and project sources; abandon
one presign and verify bounded cleanup; replace an avatar twice and prove the
prior bytes are gone; permanently delete a generated image and prove both row
and object disappear. A foreign/signed-out request must never read private
bytes.

**Status:** `BLOCKED_BY_HUMAN` only for the public-avatar/public-bucket and
retention-duration/legacy-migration choices. The new generated-media and
chat/project private-boundary code is present but intentionally not described
as runtime-verified yet.

---

## Not blocked, but worth a decision

**`readme = "<file>"` is an invisible coupling.** A documentation sweep can
disarm a security gate through it, and nothing in the guard chain knows the
pointer exists. Either `check-executable-docs.mjs` should learn about hatchling
`readme =` pointers the way it already knows about Cargo `readme` and npm
`files[]`, or the coupling should be removed. Left alone so far because it sits
outside the write set of the item that found it.
