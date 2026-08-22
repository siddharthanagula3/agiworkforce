# Founder assistance

Status: Current
Owner: Platform lead
Last updated: 2026-08-17

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

**Narrowed on 2026-08-14.** Notion no longer belongs in this item — it connects
through MCP authorization discovery with no registration at all (see §22). What
remains are the providers that publish no MCP endpoint we can discover, or that
publish one and still demand a pre-registered app: **Google Workspace
(gmail, google-calendar, google-drive), Microsoft 365, Slack, Box, HubSpot, and
the Atlassian pair (jira, confluence)**. Do these only if you want those
specific services; the 15 connectors in §22 need none of it.

**Blocks:** turning the catalog's Google Workspace, Slack, and
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

## 21. Store a Cloudflare API token so R2 CORS can be re-applied from the repo

**Status:** `BLOCKED_BY_HUMAN` for reproducibility only. **The policy itself is
already applied and verified in production** — this entry exists so the next
person can re-apply it without me.

**Blocks:** nothing at runtime today. It blocks `scripts/r2-apply-cors.mjs` from
running unattended (in CI, or after a bucket is recreated).

**Background.** Chat attachments upload browser-direct to R2 with a presigned
PUT, so the browser sends a CORS preflight the bucket must answer. On
2026-08-13 the private bucket (`agiworkforce-media-private`) had **no CORS
configuration at all**, so every attachment upload in the web app failed at the
preflight and the message was dropped — this had never worked in a browser, on
any origin, production included. The public bucket had a policy but was missing
the `chat.` and `*.vercel.app` origins.

Both buckets now carry a `browser-direct-upload` rule (6 origins, PUT/GET/HEAD,
`Content-Type` + the two `x-amz-*` checksum headers, `ETag` exposed, 1h max-age),
applied through the authenticated Cloudflare API and read back to confirm.
Re-verified end to end in the browser: a PNG and a .txt uploaded, reached the
model, and appear in Library.

**Why it needs you.** Bucket _configuration_ is not an S3-token capability. The
R2 key pair in `CLOUDFLARE_R2_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` is
object-scoped, and `PutBucketCors` returns `AccessDenied` with it (confirmed).
The script therefore uses the Cloudflare REST API and needs an account token.

**Do:**

1. Cloudflare dashboard → My Profile → API Tokens → Create Token → Custom.
2. Permission: **Account · Workers R2 Storage · Edit**. Scope it to the
   `Agiautomationllc@gmail.com` account only.
3. Add to `apps/web/.env.local` (and the Vercel project env, if CI should run it):
   - `CLOUDFLARE_API_TOKEN=<token>`
   - `CLOUDFLARE_ACCOUNT_ID=3c4f35af67459cbabbccb783f232fad9` (or reuse
     `CLOUDFLARE_R2_ACCOUNT_ID`)
4. Verify: `node scripts/r2-apply-cors.mjs --check` → prints
   `✔ <bucket>: verified — 6 origins, methods PUT/GET/HEAD` for both buckets and
   exits 0.

**Afterwards:** the CORS policy becomes reproducible infrastructure rather than a
one-off dashboard state, and adding a new origin (a custom domain, a new preview
host) is a one-line edit to `ALLOWED_ORIGINS` plus one command.

---

## 22. Turn on connectors — MOSTLY SUPERSEDED on 2026-08-14, GitHub only

**Status:** the generic-connector half of this item is **closed**. Re-verified
live against the running app on 2026-08-14, signed in:

| Surface    | Live result                                                            | Needs you?            |
| ---------- | ---------------------------------------------------------------------- | --------------------- |
| Skills     | `GET /api/skills` → **9 skills**, `source: bundled`, `downloadable`    | **No**                |
| Plugins    | `GET /api/plugins` → built-in catalog entries (`github-automation`, …) | **No**                |
| Connectors | `GET /api/connectors` → **15 available**                               | **No**, except GitHub |

Connectors are no longer empty. `apps/web/lib/connectors/mcp-discovery.ts` now
discovers each server's authorization server from the MCP endpoint itself and
obtains a client identity without anyone registering an OAuth app, so notion,
linear, stripe, airtable, monday, clickup, todoist, sentry, datadog,
cloudflare, canva, paypal, plaid, posthog, and huggingface connect with no
founder action. Section A below (GitHub) is the only part of this item still
open, and it needs exactly one secret — see the checklist there.

The paragraph below about the registry shipping with zero providers is still
true and still the right design; it is simply no longer the ONLY path to a
working connector.

Skills load from `.agents/skills/` and are traced into the Vercel bundle by
`outputFileTracingIncludes` in `apps/web/next.config.ts`, so they ship. Plugins
render from the built-in catalog; only `status: 'published' && webInstallable`
entries (`public.plugin_registry_entries`, migration `0096_plugin_registry.sql`)
are installable from the web, and today's entries are `source: builtin`,
`status: preview`, so the catalog shows without an install path. Neither needs
founder action to appear.

Connectors are empty because `apps/web/lib/connectors/oauth-registry.ts` ships
with **zero providers on purpose** — authorize/token endpoints and scopes are
provider facts the repo refuses to guess, because a wrong endpoint would send a
user's authorization code to the wrong host. Nothing is broken; nothing is
configured.

**Two independent paths. Do either or both.**

### A. GitHub (its own app, not the generic OAuth broker)

`github` is a reserved connector id served by `apps/web/lib/github-app.ts`. It
needs a **GitHub App**, not an OAuth app.

GitHub does **not** use `/api/connectors/oauth/callback` — that path belongs to
the generic MCP broker. GitHub has its own three routes, and the install flow is
deliberately two turns: install first, then a SEPARATE OAuth turn that proves
the browser-supplied `installation_id` really belongs to the signed-in user
(GitHub warns setup-URL ids can be spoofed — `install/route.ts:63-65`).

Flow: Connect → `/api/github/install/start` (sets state cookie) → GitHub install
→ **Setup URL** `/api/github/install` → our own OAuth turn → **Callback URL**
`/api/github/oauth/callback` → ownership verified against
`GET /user/installations`.

**Form values** (github.com → Settings → Developer settings → GitHub Apps → New):

| Field                                             | Value                                                |
| ------------------------------------------------- | ---------------------------------------------------- |
| GitHub App name                                   | `AGI Workforce` (must be unique across GitHub)       |
| Homepage URL                                      | `https://agiworkforce.com`                           |
| Callback URL                                      | `https://agiworkforce.com/api/github/oauth/callback` |
| Expire user authorization tokens                  | leave **checked**                                    |
| Request user authorization (OAuth) during install | leave **UNCHECKED**                                  |
| Setup URL                                         | `https://agiworkforce.com/api/github/install`        |
| Redirect on update                                | unchecked                                            |
| Webhook · Active                                  | checked                                              |
| Webhook URL                                       | `https://agiworkforce.com/api/github/webhook`        |
| Webhook secret                                    | → `GITHUB_WEBHOOK_SECRET`                            |
| Where can this be installed                       | **Any account** (multi-tenant product)               |

"Request user authorization during installation" must stay OFF: with it on,
GitHub jumps straight to the Callback URL and the Setup URL never runs, so the
install-state cookie is never validated and the linking turn breaks.

**Repository permissions** — exactly what the three shipped tools need
(`user-connector-tools.ts`: get a PR, comment on an issue/PR, post a
comment-only PR review):

- Pull requests: **Read and write**
- Issues: **Read and write**
- Metadata: Read-only (GitHub forces this)

**Subscribe to events:** Issue comment. (`installation` and `ping` are delivered
to every app automatically — `webhook-router.ts` handles those three and ignores
the rest.)

**Then set seven env vars** in Vercel Production/Preview **and**
`apps/web/.env.local`:

- `GITHUB_APP_ID` — numeric, top of the app page
- `GITHUB_APP_SLUG` — the slug in `github.com/apps/<slug>`
- `GITHUB_APP_CLIENT_ID` — starts `Iv1.` / `Iv23`
- `GITHUB_APP_CLIENT_SECRET` — "Generate a new client secret"
- `GITHUB_APP_PRIVATE_KEY_BASE64` — `base64 -i key.pem | tr -d '\n'`
- `GITHUB_WEBHOOK_SECRET` — the same value typed into the webhook form
- `GITHUB_TOKEN_ENCRYPTION_KEY` — **64 hex chars**, `openssl rand -hex 32`
  (seals installation tokens at rest; `HEX_64_RE` rejects any other shape)

The first five are the availability gate — `github-app.ts:97-101` treats a
partial set as absent, so a missing one makes the connector silently not appear
rather than appear broken. Without the seventh, tokens cannot be stored at all.

**Verify:** `GET /api/connectors` lists `github` under `available`, and
Settings → Connectors completes install → OAuth → linked.

### B. Any MCP connector (Linear, Notion, Slack, …) through the generic broker

1. Register an OAuth app with the provider. Redirect/callback URI:
   `https://agiworkforce.com/api/connectors/oauth/callback`.
2. Set `CONNECTOR_OAUTH_REDIRECT_BASE_URL=https://agiworkforce.com` (falls back
   to `NEXT_PUBLIC_APP_URL`). It is read server-side and never from the Host
   header, so it must be exact.
3. Set `CONNECTOR_OAUTH_PROVIDERS_JSON` — one JSON blob, all providers, **no
   secrets in it**:

   ```json
   {
     "providers": [
       {
         "connectorId": "linear",
         "displayName": "Linear",
         "authorizationUrl": "<from the provider's current OAuth docs>",
         "tokenUrl": "<from the provider's current OAuth docs>",
         "mcpUrl": "<the connector's MCP endpoint>",
         "transport": "streamable-http",
         "scopes": ["<provider scope strings>"],
         "usePkce": true,
         "tokenAuthMethod": "client_secret_post"
       }
     ]
   }
   ```

   Take every URL and scope from that provider's **current** docs — do not copy
   them from memory or from an older integration.
   `connectorId` must match `^[a-z0-9][a-z0-9-]{0,63}$`, cannot be `github`, and
   becomes the MCP `serverId`, so no underscores.

4. Per provider, add the two secrets (id upper-cased, `-` → `_`):
   - `CONNECTOR_OAUTH_LINEAR_CLIENT_ID`
   - `CONNECTOR_OAUTH_LINEAR_CLIENT_SECRET`
     (a public client with `"tokenAuthMethod": "none"` needs only the id)
5. Redeploy. A provider whose descriptor parses but whose secrets are missing is
   treated as **absent**, not as broken-but-advertised — so a half-finished
   provider silently does not appear rather than offering a Connect button that
   500s.
6. Verify: `GET /api/connectors` lists it under `available`, and the Connect
   flow completes authorize → callback → stored credential → tool discovery.

**Meanwhile:** "Connect remote MCP server" in Settings → Connectors already
works today for any MCP server the user supplies themselves. That path needs
nothing from you.

---

## 23. Mobile store credentials — the only remaining store-submission blockers

**Status:** `BLOCKED_BY_HUMAN`. Everything else in the release preflight now
passes; see the fixed dependency defect below.

`apps/mobile/scripts/release/preflight.sh production` was failing at its FIRST
substantive gate — "Mobile and @agiworkforce/local-llm resolve different React
Native runtimes" — which blocked every store build. Fixed (details in
`ExecutionPlan.md`); the preflight now reaches the credential checks and stops
only there. Current output:

```
[ok] node version OK          [ok] EAS account: agiautomationllc
[ok] eas.json + app.config.js [ok] Expo SDK dependencies are compatible
[ok] EAS project linked       [ok] Expo Updates URL + fingerprint policy
[ok] production profile/channel
[ok] TLS pins provisioned     [ok] release-state registry matches live stores
[err] iOS store submission requires the non-secret numeric ascAppId
```

**What this machine already has** (checked 2026-08-13, names/paths only):

- `APPLE_TEAM_ID=D2PR62RLT4` exported from `~/.zshrc` — matches
  `eas.json submit.production.ios.appleTeamId` exactly. ✔
- Two App Store Connect API keys, both valid PKCS#8:
  `~/.appstoreconnect/private_keys/AuthKey_36R2M2XQV2.p8` and
  `AuthKey_G74VBWKN82.p8` (the latter is duplicated in `~/Downloads`). The Key ID
  is the 10 characters in the filename.
- `~/Downloads/SubscriptionKey_92GDPTCS7S.p8` is an **In-App Purchase** key
  (App Store Server API / receipt validation), NOT a submission key. Keep it for
  the native-purchase path; do not point `ascApiKeyPath` at it.
- `~/Documents/CertificateSigningRequest.certSigningRequest` is a **CSR**
  (`-----BEGIN CERTIFICATE REQUEST-----`), used to request a signing
  certificate. It is not an API key and is not needed — EAS manages signing
  certificates itself.
- `APPLE_ID` / `APPLE_PASSWORD` are also exported. Those drive the legacy
  altool/Transporter path; EAS prefers the API key and ignores them here.

**Missing: the Issuer ID only.** It is not recorded anywhere on this machine.

**Do, for iOS:**

1. App Store Connect → Users and Access → Integrations → **App Store Connect
   API**. Copy the **Issuer ID** (a UUID, shown above the key list — one per
   account, shared by every key). Confirm which of the two keys above has the
   **App Manager** role.
2. Probe it — this authenticates the key against Apple and, if the app record
   exists, prints the exact `ascAppId` so it is never transcribed by hand:

   ```bash
   cd apps/mobile
   ASC_API_KEY_ID=36R2M2XQV2 \
   ASC_API_KEY_ISSUER_ID=<the UUID> \
   pnpm release:asc-probe
   ```

   Read-only. `401` means the Issuer ID does not match that key — try the other
   key id. A success prints every app record and flags the one whose bundle id
   is `com.agiworkforce.app`.

3. If the probe reports no record for `com.agiworkforce.app`: App Store Connect
   → Apps → **+** → New App with that bundle id (already registered to team
   `D2PR62RLT4`), then re-run the probe.
4. Put the printed id in `apps/mobile/eas.json` →
   `submit.production.ios.ascAppId`. It is NOT a secret and belongs in the repo.
5. Copy the chosen key to the path `eas.json` points at, and export the two ids:

   ```bash
   cp ~/.appstoreconnect/private_keys/AuthKey_36R2M2XQV2.p8 \
      apps/mobile/secrets/asc-api-key.p8      # already git-ignored
   export ASC_API_KEY_ID=36R2M2XQV2
   export ASC_API_KEY_ISSUER_ID=<the UUID>
   ```

**Do, for Android:**

6. Play Console → create the app for package `com.agiworkforce.app`.
7. Google Cloud → the project linked to Play → Service Accounts → create one →
   JSON key. In Play Console → Users and permissions, invite that service
   account and grant release permissions.
8. Save the JSON at `apps/mobile/secrets/google-play-service-account.json`
   (git-ignored).

**Verify:** `pnpm --filter @agiworkforce/mobile release:preflight` prints
`preflight passed for profile=production` (from a clean git tree, or with
`EAS_SKIP_CLEAN_CHECK=1` for a dry run).

**Then:** `release:ios:prod` / `release:android:prod`, and after the listings are
live, update `apps/mobile/src/features/release-state/mobileReleaseState.json`.
That registry fails closed — until it carries a store-verified listing id, the
app will not name a store or hand out a store link, which is what keeps the
distribution claims honest.

---

## Not blocked, but worth a decision

**`readme = "<file>"` is an invisible coupling.** A documentation sweep can
disarm a security gate through it, and nothing in the guard chain knows the
pointer exists. Either `check-executable-docs.mjs` should learn about hatchling
`readme =` pointers the way it already knows about Cargo `readme` and npm
`files[]`, or the coupling should be removed. Left alone so far because it sits
outside the write set of the item that found it.

---

## 24. Deploy the client metadata document, then re-verify the CIMD connectors

**Blocks:** eight connectors — airtable, canva, huggingface, linear, notion,
posthog, sentry, todoist — completing their first real authorization.

Nothing is wrong with the code. These vendors' authorization servers advertise
`client_id_metadata_document_supported: true`, which means they accept a URL as
a `client_id` and fetch that URL to learn who is asking. AGI now publishes that
document at:

```text
https://agiworkforce.com/.well-known/oauth-client-metadata
```

It is served correctly on localhost and returns 404 in production, because the
change has not shipped yet. An authorization server that fetches a 404 answers
`invalid_client`, which is exactly what linear, sentry, canva, and todoist did
when probed on 2026-08-14 — a symptom of the missing deploy, not of the flow.

**Do:**

1. Ship this branch to production.
2. Confirm the document is public and unauthenticated:
   `curl -i https://agiworkforce.com/.well-known/oauth-client-metadata`
   — expect `200` and JSON whose `client_id` equals that same URL.
3. Click Connect on Linear in the directory and complete consent once.

**Then tell Claude**, so the endpoint registry's CIMD verification note is
updated from "advertised" to "confirmed end to end".

Do not change `MCP_CLIENT_METADATA_PATH` after step 3. That URL _is_ AGI's
client identity: every consent a user grants is recorded against it, so moving
it silently invalidates them and forces everyone to reconnect.

---

## 25. Get AGI's callback URL allowlisted at six MCP vendors

**Blocks:** asana, dropbox, figma, intercom, square, and vercel appearing as
connectable. They serve MCP and their authorization servers publish a dynamic
registration endpoint, but a real registration attempt on 2026-08-14 was
refused by each one:

| Connector | Response                                                                         |
| --------- | -------------------------------------------------------------------------------- |
| asana     | `400 invalid_redirect_uri` — "One or more redirect URIs are not allowed"         |
| dropbox   | `403 registration_not_supported` — "Only pre-registered MCP trusted partners"    |
| figma     | `403 Forbidden`                                                                  |
| intercom  | `400 invalid_redirect_uri` — "not in the allowlist, reach out to Intercom"       |
| square    | `400 invalid_redirect_uri` — "domain not in allowlist"                           |
| vercel    | `400 invalid_redirect_uri` — "not approved for use by this authorization server" |

They are therefore recorded as `preregistered` in
`apps/web/lib/connectors/mcp-endpoints.ts` and the directory does not offer
them, which is the honest state — advertising a Connect button that fails on
click is the defect audit CRIT-001 was raised about.

**Do:** apply to each vendor's MCP/partner programme and ask for this exact
redirect URI to be allowlisted:

```text
https://agiworkforce.com/api/connectors/oauth/callback
```

**Then, per vendor**, either tell Claude to flip that entry back to `dynamic`
(if they allowlisted the URI and dynamic registration now succeeds), or supply
`CONNECTOR_OAUTH_<ID>_CLIENT_ID` / `_CLIENT_SECRET` if they issued a normal
OAuth app instead. Do not paste secrets into chat — add them straight to the
Vercel Production and Preview environments.

Seven vendors need none of this and already register automatically: clickup,
cloudflare, datadog, monday, paypal, plaid, stripe.

---

## 26. Production Stripe is in TEST mode — no real customer can be charged

**Status:** `BLOCKED_BY_HUMAN`. Established with the Stripe CLI on 2026-08-14 by
resolving the price IDs stored against live production subscriptions.

`agiworkforce.com` is serving real users with **test-mode** Stripe keys. Every
"paid" row in `subscriptions` is a test subscription, including the founder
accounts on `basic` and `max_15x`. A real card cannot be charged, so the product
currently takes no money.

The evidence is direct: the price IDs recorded on production subscriptions
(`price_1Tv2zN…` Basic, `price_1Tv2zQ…` Max 15x) resolve in test mode and do not
exist in live mode.

**The two catalogs do not agree, which is the trap.**

| Plan    | Published / test mode             | LIVE mode                       |
| ------- | --------------------------------- | ------------------------------- |
| Basic   | $7 / mo                           | _does not exist_                |
| Pro     | $20 / mo, $200 / yr               | **$29.99 / mo, $299.99 / yr**   |
| Max     | $100 / mo                         | **$299.99 / mo**                |
| Max 15x | $200 / mo                         | _does not exist_                |
| Team    | $25 / seat / mo, $240 / seat / yr | _does not exist_                |
| —       | —                                 | "Hobby" $10 / mo (retired name) |

So flipping `STRIPE_SECRET_KEY` to the live key ALONE would be worse than the
current state: the live catalog has no Basic, Max 15x or Team, and would charge
Pro at $29.99 against a pricing page that promises $20.

**Do, in this order:**

1. Decide whether to keep taking no money for now (public alpha) or go live.
2. If going live: create the live products/prices to match
   `BILLING_PLAN_PRICING` in `packages/contracts/types/src/billing-catalog.ts`
   — Basic $7, Pro $20/$200, Max $100, Max 15x $200, Team $25/$240 per seat.
   Retire or ignore the legacy "Hobby" product.
3. Repoint EVERY `STRIPE_PRICE_*` variable in Vercel Production at the new live
   IDs in the same change as the key swap. They move together or not at all.
4. Re-run the upgrade flow end to end with a real card.

**Separately, and true in either mode:** four price variables are missing and are
logged on every production request —

```
STRIPE_PRICE_TEAM_MONTHLY_USD    STRIPE_PRICE_TEAM_MONTHLY_INR
STRIPE_PRICE_TEAM_YEARLY_USD     STRIPE_PRICE_BASIC_MONTHLY_INR
```

Vercel has `STRIPE_PRICE_TEAM_MONTHLY` and `STRIPE_PRICE_TEAM_YEARLY` **without
the `_USD` suffix the code reads**, so Team checkout fails closed. In the current
test-mode configuration the correct values are the active prices
`price_1Tv2zQ0zEfO6BZMh8EeLvWZJ` (Team $25/mo) and
`price_1Tv2zR0zEfO6BZMhPTByLptE` (Team $240/yr). No INR price exists for Team at
all, and the only Basic INR price (₹399) is inactive — so INR billing is
unconfigured rather than misnamed.

I have not changed any Stripe object or production variable: the mode decision is
a founder call, and setting them piecemeal is how a catalog ends up half-migrated.

---

## 27. Stale live prices — RESOLVED 2026-08-14

**Status:** `DONE`. All six live-mode prices are archived (`active=false`), confirmed
by listing them back from Stripe rather than by trusting the write command. Zero
ACTIVE prices remain in live mode, so a key flip now fails closed instead of
charging Pro at $29.99 against a page promising $20.

The price env vars in `.env.local` (both copies) and Vercel Production were
repointed at the verified test-mode IDs matching `BILLING_PLAN_PRICING`, and the
missing `STRIPE_PRICE_TEAM_MONTHLY_USD` / `STRIPE_PRICE_TEAM_YEARLY_USD` were
added — the local files had been pointing at the LIVE ids, which do not exist in
test mode, so local checkout was broken independently of everything else.

**Still to do:** revoke the temporary write permission on the live restricted key
(Prices → Write back to None), plus anything else the bulk toggle enabled
(Third-Party Gift Cards, Webhook Endpoints, Workflows). The cleanup is finished;
a live key with write access is a standing risk for no remaining benefit.

The old blocker, for the record:

```
Permission denied. The provided key 'rk_live_…zpFQTb' does not have the required
permissions for this endpoint on account 'acct_1SgweG0zEfO6BZMh'. Enabling
"Prices Write" ('plan_write') permissions on this key would allow this request.
```

Five prices are still ACTIVE in live mode and every one contradicts the published
pricing, so they are a live trap the moment anyone flips `STRIPE_SECRET_KEY`:

| Price                            | Live amount       | Published    |
| -------------------------------- | ----------------- | ------------ |
| `price_1Sgwx10zEfO6BZMh7thtFU77` | Hobby $10 / mo    | plan retired |
| `price_1Sgwx20zEfO6BZMhbgpxL8TI` | Hobby $59.88 / yr | plan retired |
| `price_1Sgwx20zEfO6BZMh3ix7hivi` | Pro $29.99 / mo   | **$20**      |
| `price_1Sgwx30zEfO6BZMhJXsduOyl` | Pro $299.99 / yr  | **$200**     |
| `price_1Sgwx30zEfO6BZMhJqItFYKF` | Max $299.99 / mo  | **$100**     |

(`price_1Sgwx40zEfO6BZMhYS63EnfW`, Max $2,999.88/yr, is already archived.)

Nothing depends on them — no production subscription references any live-mode
price, because production runs in test mode (see §26). Archiving is reversible;
Stripe cannot delete a price, only deactivate it.

**Do:** open
<https://dashboard.stripe.com/b/acct_1SgweG0zEfO6BZMh?destination=%2Fapikeys%2Fmk_1TkUf10zEfO6BZMhUZoAAoJu%2Fedit>
and enable **Prices Write** (`plan_write`) on that restricted key.

**Then tell Claude**, and the five will be archived and re-verified by listing
them back — the first attempt reported success on output that was actually the
permission error, so the result is confirmed by re-reading Stripe, not by
trusting the write command.

Nothing in test mode needs archiving: every ACTIVE test price is the current
catalog and is in use.

## 28. India: the ₹15,000 RBI ceiling breaks two INR plans, and Razorpay is a sales question before it is an integration

**Status:** `BLOCKED_BY_HUMAN` — needs a pricing decision and a Razorpay sales
answer. No code can resolve either.

Regional pricing is already built and is not the gap. `lib/regional-pricing.ts`
carries founder-set INR prices, `lib/server/localized-pricing-service.ts`
resolves them against Stripe multi-currency Prices, `/api/checkout` and
`/api/pricing/localized` derive currency from trusted `x-vercel-ip-country`, and
`/api/upgrade/preview` correctly uses the SUBSCRIPTION's currency rather than the
caller's current IP. What is missing is not plumbing.

### 28a. Two published INR prices cannot legally auto-renew

RBI's e-mandate framework requires additional factor authentication (AFA/3DS) on
**every** recurring charge above **₹15,000**. The December 2023 increase to ₹1
lakh applies only to mutual funds, insurance premiums and credit-card bills —
SaaS subscriptions stay at ₹15,000. Verified against Stripe's India recurring
payments doc and RBI coverage, 2026-08-14.

| Plan        | INR/mo      | Auto-renews on an Indian card?               |
| ----------- | ----------- | -------------------------------------------- |
| Basic       | ₹399        | Yes                                          |
| Pro         | ₹1,999      | Yes                                          |
| Max 5x      | ₹9,999      | Yes                                          |
| **Max 15x** | **₹24,999** | **No** — buyer must complete 3DS every month |
| **Team**    | ₹1,999/seat | **No at 8+ seats** (8 × 1,999 = ₹15,992)     |

This is an RBI rule on the buyer's card, not a Stripe limitation. **Razorpay does
not change it**, and UPI AutoPay is worse: UPI does not support recurring
mandates above ₹15,000 at all. Any provider hits the same ceiling.

**Decide one of:**

1. Price Max 15x INR at or under ₹15,000 (a real discount vs the $200 tier).
2. Sell Max 15x in India annually, or as invoice/manual collection, not as a card
   auto-debit.
3. Cap Indian Team purchases at 7 seats self-serve and route 8+ to sales.
4. Do not sell those two tiers in India yet.

Nothing is broken in production today because no INR Price object exists in
Stripe (see 28c) — so this is a decision to make _before_ INR goes live, not an
incident.

### 28b. Stripe delays every Indian card renewal by 26 hours

Stripe issues the mandatory 24-hour pre-debit notification through a partner and
waits **26 hours** before charging. The PaymentIntent sits in `processing` for
that whole window and cannot be cancelled. Renewals can also fail with
`india_recurring_payment_mandate_canceled` or `payment_intent_mandate_invalid`
when a buyer cancels the mandate at their bank — a path with no equivalent in
card billing elsewhere.

**Confirmed not handled anywhere in this repo**: a grep across
`app/api/stripe-webhook` and `lib` finds no reference to `processing`,
`approval_requested`, or any India mandate decline code. This is engineering
work, not a founder decision, and it is only needed once INR billing is real —
recorded here so it is not discovered from a failed renewal.

### 28c. INR is published but not sellable

`STRIPE_PRICE_BASIC_MONTHLY_INR` and `STRIPE_PRICE_TEAM_MONTHLY_INR` are read by
`lib/pricing.ts` and are unset in every environment, because no active INR Price
exists in Stripe. The only one that ever existed (Basic ₹399) is archived. The
system fails closed correctly — `checkoutReady: false` — so India currently sees
USD pricing rather than a broken button. Creating those Prices is blocked on 28a.

### 28d. Top-ups were USD-only against regional plans — FIXED 2026-08-14

`/api/billing/top-up` hardcoded `currency: 'usd'`. Because a top-up is
`mode: 'payment'` (a PaymentIntent, not an invoice), Stripe would NOT have
rejected a USD top-up on an INR subscription — it would have silently charged a
second currency on the same account, adding an undisclosed forex conversion and a
cross-border card fee.

The route now reads the live subscription's currency and refuses a non-USD
subscriber with an honest message, failing closed if Stripe cannot be reached.
Setting a per-currency top-up rate is a founder decision and cannot be derived:
the published INR prices are price points, not one exchange rate — Basic is
₹57/$, Pro and Max are ₹100/$, Max 15x is ₹125/$, Team is ₹80/$.

**Decide:** the INR price of one top-up unit, or leave top-ups USD-only.

### 28e. Razorpay — what to ask sales before any code is written

Razorpay is a reasonable choice and the reason is UPI, not price: UPI and
netbanking are how most Indian consumers actually pay, and an international
Stripe account cannot offer them. Razorpay holds an RBI PA-CB licence and settles
to an overseas account for a foreign entity with no Indian subsidiary.

Three things must be answered **before** integration, and none can be verified
from documentation:

1. **Does Razorpay support recurring/Subscriptions for a foreign entity, or only
   one-time payments?** Their own international-payments doc covers one-time
   collection and does not confirm recurring; it even notes that "UPI and
   recurring payments are not supported by most payment providers." If the answer
   is one-time only, Razorpay cannot replace Stripe for subscriptions and would
   be a UPI-funded credit purchase instead — a different product decision.
2. **Pricing.** Quoted case-by-case for cross-border; budget ~3% + GST.
3. **GST/OIDAR.** Razorpay International is a payment service provider, **not** a
   merchant of record. Supplying digital services to Indian consumers as a
   foreign entity carries an OIDAR GST registration and 18% remittance
   obligation that stays with AGI Automation LLC. Stripe Tax does not cover it
   and neither does Razorpay. A merchant-of-record (Paddle, Polar) is the
   alternative that does absorb it — at a higher rate and without UPI parity.

**Do:** contact Razorpay sales with question 1 first; it decides whether this is
a subscription integration or a top-up integration. Then confirm the OIDAR
position with an accountant.

Adding Razorpay means a **second billing provider**, not a swap: a second webhook
surface, a second subscription lifecycle, refunds and reconciliation in two
systems, and `resolveSubscriptionBillingSource` gaining a fourth owner alongside
`stripe` / `apple` / `google`. That is a substantial build and should not start
until question 1 is answered.

## 29. Mobile IAP is built and dark — the blockers are all accounts, not code

**Status:** `BLOCKED_BY_HUMAN` — eight items, none of them engineering.

Full decision document (pricing tables, per-surface UPI answer, sequencing):
<https://claude.ai/code/artifact/58fe8b40-faa9-4247-bdbd-6595e43e7a62>

### 29a. The finding that reframes the mobile work

The in-app purchase path is **already implemented end to end** — client purchase
via `expo-iap`, server-side Apple and Google verification
(`apps/web/lib/server/mobile-iap-store-verification.ts`), notification receivers
at `app/api/mobile/iap/{apple,google}-notifications`, catalog at
`app/api/mobile/iap/catalog`, product keys in
`packages/contracts/types/src/mobile-iap.ts`. It is switched off behind
`MOBILE_IAP_ENABLED` because no store products or credentials exist.

Consequence: **turning IAP on is what ships UPI on mobile.** Play Billing carries
UPI and UPI AutoPay natively; Apple accepts UPI as an Apple Account funding
method. Both stores also auto-convert prices per storefront. Three of the four
stated goals — regional pricing, UPI for Indian mobile users, native in-app
purchases — are delivered on mobile by clearing paperwork, not by writing code.

Running AGI's own UPI checkout (Razorpay, Stripe UPI) inside the **iOS** app for
a subscription is not merely unbuilt, it is **prohibited** by App Store guideline
3.1.1. Android alternative billing is legal in India but yields only a
4-percentage-point fee discount, must run alongside Play Billing, and requires
reporting every transaction to Google within 24 hours.

### 29b. Cleared, not a blocker: Google Play Billing 8

The 2026-08-31 deadline is real and gates **new apps** (which AGI is), with an
extension available to 2026-11-01. But `expo-iap@5.3.0` does not depend on
BillingClient directly — it resolves `io.github.hyochan.openiap:openiap-google`
`3.3.0` (pinned in the package's `openiap-versions.json`), which is built on
Play Billing Library 8. **Compliant.** Confirm with a Gradle dependency tree on
the first real Android build rather than trusting this note.

### 29c. The eight founder items

Ordered by what they unblock. Detail in the artifact above.

| #   | Item                              | Artifact required                                                                    |
| --- | --------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Apple Paid Applications Agreement | Signed + Tax (W-9), Banking, Contacts. Gates 2–5.                                    |
| 2   | Apple Small Business Program      | 30% → 15%. AGI qualifies today. Re-file annually.                                    |
| 3   | Play Console merchant profile     | **Permanent link — cannot be changed later.**                                        |
| 4   | 9 product IDs in both stores      | 5 subscriptions + 4 consumable top-ups                                               |
| 5   | Store server credentials          | `APPLE_APP_STORE_*`, `GOOGLE_PLAY_*`, `MOBILE_IAP_*_PRODUCT_IDS_JSON`, Pub/Sub topic |
| 6   | Store listing copy                | Still promises browser checkout; first-review rejection risk                         |
| 7   | Tax registration                  | India OIDAR, EU Non-Union OSS, UK VAT — all threshold-free                           |
| 8   | Max 15x India price               | Blocks INR Stripe Price creation (see §28a)                                          |

Item 7 is the one where delay costs money rather than time: all three appear to
trigger on the first sale with no minimum, and the web product is already live.
Confirm the threshold claim with a tax advisor — it was not verifiable from
primary sources.

### 29d. Engineering work this surfaced (not founder-blocked)

- **A currency-keyed price table.** Only `usd` and `inr` have resolution paths
  today; every EUR/GBP/JPY/BRL buyer is served plain USD. Adding a currency means
  editing three files across two packages. Do this **before** adding a third
  currency, not after the sixth.
- **India e-mandate handling.** Stripe holds Indian card renewals in `processing`
  for 26 hours with mandate-specific decline codes. Zero references in the repo
  (§28b). Only needed once INR billing is live.
- **Per-currency Price ID slots for `pro`/`max`/`max_15x`** — only Basic and Team
  have them.
- **The 7-seat Team threshold** as a real checkout check, not a docs note.

### 29e. Two market facts worth acting on

- **Claude has no UPI anywhere**, including its July 2026 India rupee launch.
  UPI is a real differentiator against Anthropic and table stakes against OpenAI
  and Google.
- **"Match Claude's pricing" does not mean pricing lower in India.** Anthropic
  prices India _above_ a straight USD conversion. AGI's INR ladder already sits
  below Claude's — a fine share-buying posture, but it should be deliberate.
- **Check before launching Basic in India:** if OpenAI's free-ChatGPT-Go-for-a-year
  promotion is still running, paid ₹399 Basic competes with a free equivalent.
  Whether it is still live was not established.

---

## 30. Counsel review of the two breach-notification templates in `BREACH_RUNBOOK.md`

**Status:** `BLOCKED_BY_HUMAN`. The engineering side is finished. What is left is
a lawyer reading two pages of wording and one line being changed in a file.

**Blocks:** nothing operationally, and that is deliberate — read "This is not a
hold" before treating it as a gate.

`BREACH_RUNBOOK.md` §4 (intimation to the Data Protection Board) and §5
(intimation to each affected Data Principal) were drafted from the text of the
Digital Personal Data Protection Act, 2023 by an engineer. No lawyer has read
either one. That wording is what goes to a regulator and to affected users on
the worst day this company has, under a clock that starts the moment any
employee or contractor first notices facts suggesting a breach.

**This is not a hold on sending.** The statutory clock does not pause for legal
review, and the runbook says so at both templates: if an incident is live and no
approval exists, send them as drafted and put counsel on the wording in
parallel. A late intimation breaches the Act; an imperfectly worded one does
not. This item exists so the review happens on a calm day rather than at 2am.

**What it costs to leave it:** every incident notice this company sends is
unreviewed legal copy, sent under time pressure, to the two audiences least
forgiving of a mistake in it.

**Where a reviewer's time is worth most:** the "What data of yours was NOT
involved" block in §5. Every line in it is a factual claim about this system —
card details never reach us, Local-mode data never leaves the device, BYOK
provider traffic does not pass through us, the identity provider holds the
password. A wrong line there is a second incident, and it is the block a
non-engineer reviewer is least able to check unaided. Hand over §3 alongside it;
that scoping table is where those claims are sourced from.

**Exact steps**

1. Send the reviewer `BREACH_RUNBOOK.md` §3, §4 and §5. Ask two things
   specifically: whether the §5 "NOT involved" claims are safe to make as
   written, and whether either template omits anything the Board expects.
2. On sign-off, in `BREACH_RUNBOOK.md`: change `Legal review: pending-counsel`
   to `Legal review: counsel-approved`, add an `Approved by:` line naming the
   reviewer and the date beneath it, update the `Status:` line so it no longer
   says the runbook is unreviewed, and delete the two pre-send notices from §4
   and §5.
3. Drop the "not been reviewed by counsel" row from the runbook's Open gaps
   table, close `L-9` in `DPDP_PROGRESS.md`, and close `DPDP-26` in
   `docs/remediation/register.json`.
4. Run `pnpm --filter @agiworkforce/web test app/__tests__/breach-runbook-counsel-gate.test.ts`.
   That test holds steps 2 and 3 together — a half-applied approval, where the
   header claims counsel signed off but the templates still carry the pending
   notice or no reviewer is named, fails it.

---

## 31. Name a Grievance Officer, confirm the notice address, decide the grievance mailbox

**Status:** `BLOCKED_BY_HUMAN`. Register row `DPDP-23`, founder decisions `F-1`,
`F-2`, `F-4` in `DPDP_PROGRESS.md`.

**Blocks:** nothing in the product. Every surface publishes a working grievance
route today — the role account, `contact@agiworkforce.com`, and the subject line
"DPDP grievance" — on `/privacy/india`, `/privacy/requests`, `/terms` and in the
site footer. What is unresolved is whether those published facts are the ones
you intend to stand behind.

The code side is done and no longer needs an engineer:

- `GRIEVANCE_OFFICER_DESIGNATE` in `apps/web/lib/legal-constants.ts` is `null`.
  Set it to a person's name and every surface that publishes the officer
  switches from "Grievance Officer, AGI Automation LLC" to "<name>, Grievance
  Officer, AGI Automation LLC" — one edit, no page copy to touch. Leaving it
  `null` keeps the role account, which is a decision, not a default.
- `NOTICE_ADDRESS` is the only complete postal address anywhere in this
  repository, which is the sole reason it is the one published. It is printed on
  `/about`, `/press`, `/dpa`, `/terms`, `/privacy`, `/privacy/india`,
  `/privacy/requests`, `/copyright`, `/model-licenses`, `/mobile/legal`,
  `/acceptable-use` and `/legal/eu-representative`. If the operating address is
  different, change it there once.
- `CONTACT_EMAIL` is the only mailbox proven in use across the marketing
  surface. `privacy@` and `grievance@` are not provisioned, and
  `/privacy/india` says so in as many words rather than publishing an address
  that would bounce. `apps/web/lib/__tests__/legal-constants.grievance.test.tsx`
  fails if any grievance surface starts publishing a mailbox other than
  `CONTACT_EMAIL`, so provisioning one is a deliberate edit in both places.

**Exact steps**

1. Decide `F-1`: either set `GRIEVANCE_OFFICER_DESIGNATE` to the named
   individual, or record in writing that the role account stands. Counsel
   question `L-7` asks whether a role is acceptable at all under Indian law;
   answer that first if it is still open.
2. Decide `F-2`: confirm `NOTICE_ADDRESS`, or replace it.
3. Decide `F-4`: provision `privacy@` / `grievance@` and point `CONTACT_EMAIL`
   consumers at it, or confirm in writing that subject-line routing on
   `contact@` is the intended arrangement — including who watches that inbox for
   the "DPDP grievance" subject and against what response target
   (`GRIEVANCE_RESPONSE_TARGET_DAYS`, published as 30 days, our commitment and
   not a statutory period).
4. Close `F-1`, `F-2` and `F-4` in `DPDP_PROGRESS.md` and `DPDP-23` in
   `docs/remediation/register.json`, then run
   `pnpm --filter @agiworkforce/web test lib/__tests__/legal-constants.grievance.test.tsx`.

---

## 32. Decide whether AGI serves users below the regional age threshold at all

**Status:** `BLOCKED_BY_HUMAN`. The engineering half of MOB-06 shipped on
2026-08-17: `confirmAgeGate` in
`apps/mobile/src/features/auth/services/ageGate.ts` no longer accepts a higher
age once a minor record exists, `/(public)/age-gate` renders a locked notice
instead of the input on a protected device, and Settings → Parental Controls no
longer offers the route back to the self-declare screen. Proof:
`apps/mobile/__tests__/minor-mode-not-child-clearable.test.tsx`.

What code cannot decide is the half above it. The gate is still self-declared —
a typed number, never verified — and `detectRegionRule` puts the threshold at 13
in the US and default regions, 16 across the EU, 18 in India and Brazil. Below
that threshold both COPPA and the DPDP Act require _verifiable_ parental
consent, which AGI does not have and cannot fake. Today a 9-year-old types "9",
gets content filtering, and uses the product.

There are only two honest exits, and both are yours:

1. **Restrict the minimum age.** Make a sub-threshold answer a refusal, not a
   filtered session: no local chat, no cloud sign-in, an explanation and a way
   out. Cheap to build, loses those users outright.
2. **Buy a verifiable-parental-consent path.** A vendor flow (card
   authorization, government-ID check, or a signed consent form with an adult
   re-contact step) run before a minor account is provisioned, plus a consent
   record with an audit trail and a withdrawal path. This is a contract and a
   budget before it is an integration.

**What is needed and from whom**

- Founder: pick (1) or (2), and if (2), name the vendor and approve the spend.
- Counsel: confirm the per-region thresholds in `TIMEZONE_TO_REGION` are the
  ones we are held to, and whether timezone inference is defensible as the
  region signal at all.
- Until one of those lands, do not describe the age gate as compliant anywhere
  in store listings or marketing copy.

---

## 33. Decide what happens to manual pairing-code entry when the Dispatch key moves out of band

**Status:** `BLOCKED_BY_HUMAN` for one product decision. Everything else in
SEC-16 is an engineering task queued in `ExecutionPlan.md`.

**The defect.** The Dispatch control channel between Desktop and the Mobile
companion signs every frame with HMAC-SHA-256, and the key is
`HKDF(IKM = pairing code, salt = session salt)`. The signaling relay mints that
pairing code, receives it again on `POST /pairings/{code}/claim` and in the
WebSocket register frame, and receives the salt in register metadata. It holds
both inputs. A relay compromise, an insider, or a TLS-intercepting proxy (mobile
pinning is off and the pins in `apps/mobile/lib/pinning.ts` are placeholders)
can therefore recompute the key and mint frames that verify in both directions —
including a forged `approval_response {approved:true}` that Desktop treats as
the user consenting to a tool execution. Fresh nonces and in-window timestamps
do not help; the forger can produce both. The two module docstrings that used to
claim this layer stops a relay attacker were corrected on 2026-08-17.

**The fix and the one thing code cannot decide.** The key has to be established
out of band: Desktop generates a random 32-byte secret, puts it in the QR code,
and never sends it to the relay. That works for the QR path. It cannot work for
the manual fallback, where the user reads a 12-character code off the Desktop
screen and types it into `QRScanner`'s manual-entry field — a 64-hex secret is
not typeable, and that path exists precisely for when the camera is denied.

Pick one:

1. **QR only.** Remove manual entry. Users with no camera permission cannot pair
   until they grant it. Simplest, and the pairing channel is then genuinely
   out of band.
2. **Keep manual entry, honestly labelled.** The manual path stays
   relay-derived and the companion says so before the first approval —
   "this connection is trusted through our pairing service" — and, if you want
   it to be more than a label, the approval card refuses high-risk tool classes
   on a manually-paired session.
3. **Keep manual entry, verified by a short authentication string.** After
   connecting, both screens show the same six digits derived from the two DTLS
   fingerprints and the user confirms they match. Strongest, most build: new UI
   on both surfaces and fingerprint access from `react-native-webrtc` and the
   Tauri side.

**What is needed and from whom**

- Founder: pick 1, 2 or 3. Everything downstream is mechanical once it is
  picked, and the engineering steps are already written out in
  `ExecutionPlan.md` under the SEC-16 TODO.
- Founder or release owner: the change breaks every currently paired device.
  Confirm the cutover — a coordinated bump of `DISPATCH_HMAC_REQUIRED_AFTER`
  and `DISPATCH_HMAC_MIN_MOBILE_VERSION` with a forced re-pair — is acceptable,
  and when.
- Unrelated but adjacent: mobile TLS pins are still placeholders and
  `PINNING_ENFORCED` is `false`, which is what makes the interception variant
  of this attack cheap. That is tracked separately; provisioning real pins does
  not close SEC-16 on its own, because the relay is authorized to see the code
  regardless of the transport.

---

## 34. Decide whether a developer session may be driven from a second device, and on what grant

**Status:** `BLOCKED_BY_HUMAN` for one product decision. The register rows
DESK-99 and AI-58 both describe this as "no developer-session remote-control
protocol exists end to end on any surface". That premise is wrong, and the
correction narrows the ask to a decision rather than a rebuild.

**What already exists.** The developer-session control protocol is defined and
wired end to end:

- `crates/agiworkforce-protocol/src/developer_session.rs` — the contract
  (threads, turns, streaming, approvals, `AppServerCapabilities`,
  `DeveloperSessionTrustMode`), with a conformance test at
  `crates/agiworkforce-protocol/tests/developer_session_protocol.rs`.
- `crates/agiworkforce-app-server/src/developer_sessions.rs` — the
  `DeveloperSessionHost` trait and server.
- `apps/cli/src/app_server/developer_host.rs` — the CLI host implementation
  (~4.1k lines): persisted sessions, live agent instances, turn tasks,
  cancellation, approval continuations, MCP attachment, streamed events.
- `apps/extension-vscode/src/integrations/localRuntimeClient.ts:743` — the VS
  Code client, which spawns `agiworkforce app-server` and speaks that protocol.

Desktop's companion host UI is also mounted
(`apps/desktop/src/features/settings/tabs/Connections/index.tsx` renders
`MobileCompanionPanel`), and Mobile is not a static shell
(`apps/mobile/app/(app)/companion/index.tsx` drives the QR scanner, pairing
status, agent dashboard, execution stream and dispatch composer).

**What genuinely does not exist.** Three things, and only the first is a
decision:

1. **A remote transport.** The protocol's only transport today is a local
   stdio pipe to a child process. Nothing lets a session running on machine A
   be attached from device B.
2. **A projection client.** `DeveloperSessionSource` has exactly two variants,
   `Cli` and `Vscode`. There is no Mobile or Web source, so no phone or browser
   can present itself as a client of a developer session. The Mobile companion
   is a separate WebRTC screen-share plus approval channel, not a projection of
   a developer session.
3. **Revocable persistent device grants for it.** The companion pairs with a
   short-lived code and per-session `pairTokens`
   (`apps/desktop/src/stores/connectionStore.ts`); nothing is stored, listed or
   revocable. A durable, revocable grant table does already exist for CLI
   device auth (`device_refresh_tokens`, with `revoked_at`, in
   `apps/web/app/api/auth/device/refresh/route.ts`) and is the obvious model to
   extend — but extending it to developer sessions is only worth building once
   the answer to the question below is yes.

**The decision.** Should a developer session — a live agent with the user's
working directory, terminal and file-system tools — be drivable from a second
device at all?

1. **No.** Developer sessions stay local to the machine that owns the
   workspace. Mobile and Web keep the current read-and-approve companion. Close
   DESK-99 and AI-58 as won't-do and delete the MS-3 / MS-18 / CAP-049
   expectations that assume otherwise.
2. **Approve-only from a second device.** Today's shape, made durable: the
   phone never sends turns, it only answers approvals, and the pairing becomes
   a listed, revocable device grant. Smallest build, and it does not widen the
   blast radius of a stolen phone.
3. **Full remote drive.** A remote transport for the app-server protocol plus a
   Mobile/Web projection client. This is the XL option, and it makes a stolen
   or borrowed second device equivalent to a shell on the developer's machine —
   so it cannot ship without the grant lifecycle in (3) above, a visible
   host-side indicator, and a per-grant capability scope.

**What is needed and from whom**

- Founder: pick 1, 2 or 3. Every downstream engineering step is mechanical once
  it is picked, and none of it should start before it is.
- If 2 or 3: founder or security owner also decides grant lifetime, whether a
  grant survives a re-install, and what the user sees on the host while a
  remote device is attached.

---

## 35. Decide whether Desktop ships a Local→BYOK fork at all

**Status:** `BLOCKED_BY_HUMAN`. Security holds today; the product is
half-present.

**Blocks:** SEC-90's last clause. Nothing is unsafe while it waits.

The boundary is enforced. A Local conversation resolves `TrustMode::Local`
(`apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs:169`), and
`provider_matches_trust_mode` keeps only local providers
(`apps/desktop/src-tauri/src/core/llm/llm_router.rs:458`), so a Local thread
cannot reach a BYOK provider. The store-side ceremony is enforced too:
`forkConversationForByok` copies only approved, redacted messages and returns
null otherwise (`apps/desktop/src/stores/chat/chatStore.ts:496`), proven by
`apps/desktop/src/stores/chat/__tests__/chatStore.test.ts`.

What is missing is the way in. The desktop ceremony dialog exists but sits in
`apps/desktop/archive/features/chat/LocalByokHandoffDialog.tsx`, outside the
tsconfig `include`, and `forkConversationForByok` has no production caller — so
no user can start a fork. Meanwhile the Local model picker lists configured BYOK
models (`apps/desktop/src/App.tsx:889`), so selecting one is a control that can
only fail. As of 2026-08-17 that failure at least explains itself and names the
fork (`local_only_no_candidate_message`, tested in
`core/llm/tests/routing_logic_tests.rs`) instead of blaming Ollama.

**The decision.**

1. **No fork on Desktop.** Then the picker must stop offering BYOK models inside
   a Local conversation, and the archived dialog should be deleted rather than
   left to look like a shipped feature.
2. **Ship the fork.** Move the dialog into `apps/desktop/src/features/chat/`,
   add the entry point (a conversation-header action is the natural place — the
   header already takes host-supplied actions), and keep the six ceremony steps
   the store already enforces.

**What is needed and from whom**

- Founder: pick 1 or 2. Both are small builds; which one is a product call about
  whether Desktop users may move Local content to their own provider account.

---

## 36. The org BYOK domain allowlist has no way to reach a device

**Status:** `BLOCKED_BY_HUMAN`. Needs a distribution design, not a patch.

**Blocks:** SEC-05's clause "the org BYOK domain allowlist becomes an enforced
block rather than metadata".

`egress.byokDomainsAllowlist` exists in both schema ports
(`crates/agiworkforce-licensing/src/org_policy.rs:41`,
`packages/contracts/licensing/src/org-policy.ts:39`) and both only compare it
for monotonic tightening. It has no enforcement consumer anywhere, and no
surface loads a signed org policy at all: `grep -r org_policy
apps/desktop/src-tauri/src` returns nothing. The enforcement point on Desktop is
obvious once a policy exists — `validate_provider_base_url` in
`core/llm/providers/direct_api_provider.rs:251` already judges every BYOK base
URL — but wiring a check to an allowlist no device ever receives would be a
guard that is always empty.

**What is needed and from whom**

- Founder / security owner: decide where a signed org policy comes from (bundled
  with the license, fetched at sign-in, dropped by MDM), how often it refreshes,
  and what a device does when it has none — fail open on product defaults, or
  refuse BYOK entirely for managed orgs.
- Only after that is the enforcement itself mechanical.

---

## 37. Managed Cloud plan-tier gate needs a verifiable client surface (security sweep 2026-08-21, `apps/web` F4)

**Status:** `BLOCKED_BY_HUMAN` — a product/protocol decision, not a code gap.

**Blocks:** closing CLAUDE-SECURITY-20260821-144214 F4 (CWE-863, MEDIUM):
`apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts` decides which paid
capability applies (`managed_chat` on free tiers vs the Pro-only
`developer_surfaces`/`managed_api`) from the caller-declared
`x-agi-surface`/`x-client`/`origin` headers whenever the credential is a bare
Clerk session JWT. A free-tier user scripting against the API with their own
session token and `x-agi-surface: web` gets programmatic access the plan does
not include.

Two remediation rounds were adversarially reviewed and rejected: a bare Clerk
session token carries no surface at all (`AuthResult.surfaceClass` is
`'developer'`-only, `apps/web/lib/api-auth.ts:19`), and every first-party
client — web (`lib/hooks/useChatStream.ts`), mobile
(`apps/mobile/services/streaming.ts`), the Chrome extension
(`apps/extension/src/features/cloud-bridge/clerkAuth.ts`) and desktop
(`cloudApi.ts`) — sends exactly that kind of token with a self-declared
`X-AGI-Surface`. Swapping the header for the CSRF token was rejected because a
non-browser client can obtain that too.

**Costs to leave it:** paywall bypass of the developer/API capability for any
account that can mint a Clerk session (every account). No data exposure.

**Decide one of:**
1. Bind the surface into the credential: a Clerk custom session claim
   (`surface`) set per application/JWT template, or an `azp` allow-list per
   surface, verified server-side; first-party clients keep working, scripts get
   the strictest tier.
2. Require a surface-bearing credential for non-browser callers (API key or the
   existing developer/device token) and treat a bare Clerk token as `web` only
   when the request also passes the browser-only checks (Origin + Sec-Fetch-Site
   + CSRF cookie pair) — closes the scripting case without client changes.
3. Accept the residual and gate the API capability on billing audit instead.

The parked attempt (option-2 shape) is at
`agiworkforce-security-run/blocked/w1-W1-E-surface-header-trust.patch`.
