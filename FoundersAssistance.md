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
   `APPLE_APP_STORE_ROOT_CA_CERTS_BASE64_JSON`. The verifier trusts only the
   environment named by `APPLE_APP_STORE_ENVIRONMENT` (`production` when
   unset); set it to `sandbox` on staging deployments only, because sandbox
   purchases are free and must never unlock production entitlements. Also set
   `EMAIL_HASH_PEPPER` (32+ random bytes, hex) on every deployment: stored
   email pseudonyms are keyed under it, and without it they fall back to an
   unkeyed SHA-256 that a dictionary reverses. Register App Store Server
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
   - CSRF cookie pair) — closes the scripting case without client changes.
3. Accept the residual and gate the API capability on billing audit instead.

The parked attempt (option-2 shape) is at
`agiworkforce-security-run/blocked/w1-W1-E-surface-header-trust.patch`.

---

## 38. Mobile TLS pinning: the mechanism is built and wired, but ops must choose the pinned keys (security sweep 2026-08-21, `apps/mobile` F6)

**Status:** `BLOCKED_BY_HUMAN` — needs a key/rotation decision and two reviewed
commits (paste the pins, then flip the rollout), not more application code.

**Blocks:** fully closing CLAUDE-SECURITY-20260821-170634 F6 (CWE-295, MEDIUM):
`apps/mobile` ships placeholder SPKI pins, so every Clerk bearer token and every
dispatch pairing exchange still rides on the OS trust store alone — a
device-trusted rogue CA (MDM profile, compelled or mis-issued intermediate) can
terminate TLS to `api.agiworkforce.com` and harvest the Authorization header.

**What this sweep changed**

- `apps/mobile/lib/pinning.ts` no longer carries a hand-flipped
  `PINNING_ENFORCED` literal. Enforcement is derived:
  `pinningStageFor({ isDevOrTest })` reaches `'enforced'` only in a release
  runtime where every required host carries a well-formed, non-placeholder SPKI
  hash. There is no state where the app claims to pin placeholders.
- Provisioning and enforcement are deliberately **two** reviewed changes.
  `PINNING_ROLLOUT` in the same file is `'report-only'`, and the derived stage is
  never further along than it: pasting six real hashes changes no request and no
  build output. It only makes a release build log, once per host,
  `[pinning] rollout is report-only: "<host>" would be refused (<reason>) once
PINNING_ROLLOUT … is 'enforced'`. That warning is the point of the stage:
  enforcement turns `PINS_BY_HOST` into the app's entire allowlist, so every
  localhost, LAN dispatch target and user-supplied BYOK base URL with no entry
  would be cut off, and this is how they are found from a shipped build before
  the flip rather than after it. `apps/mobile/native/withAGITlsPinning.cjs` reads
  the same constant and emits nothing until it says `'enforced'`, so a wrong hash
  cannot reach an installed binary on the paste alone.
- `clerk.agiworkforce.com` is now one of `REQUIRED_PINNED_HOSTS` and has an entry
  in `PINS_BY_HOST`. Clerk's SDK does its own networking and never reaches
  `secureFetch`, so without it a build could satisfy every listed host, derive
  `PINNING_ENFORCED = true`, and still hand the auth handshake — the exchange
  that issues the bearer token this finding's exploit harvests — to whatever
  certificate the OS trust store accepted. Only the native pin config can cover
  that host, which is why it is required rather than optional.
- A pinned host reached in absolute form (`https://api.agiworkforce.com./…`, and
  the `%2e` spelling that normalizes to it) is refused with `reason:
'ambiguous-host'`. The table now keys on the destination — trailing dots
  stripped, as `packages/contracts/trust-boundaries` already does for the egress
  guard — so the spelling no longer slips past the pin lookup, and the spelling
  itself is rejected rather than treated as pinned because iOS `NSPinnedDomains`
  and the Android pin-set match the name as written and would not apply their
  pin-set to that form.
- `apps/mobile/src/lib/runtimeMode.ts` classifies the build fail-closed: a runtime
  counts as dev/test only on an explicit signal (`__DEV__`, `NODE_ENV=test`,
  `EXPO_PUBLIC_APP_ENV=development`). A release build whose `NODE_ENV` was never
  set — which is every EAS profile in `apps/mobile/eas.json` — is treated as a
  release runtime instead of silently skipping the release-only gate.
- `apps/mobile/native/withAGITlsPinning.cjs` + `native/tlsPinConfig.cjs` are a
  real Expo config plugin: from the same `PINS_BY_HOST` table they generate the
  iOS `NSAppTransportSecurity.NSPinnedDomains` dictionary (as
  `NSPinnedCAIdentities` — iOS matches only certificates above the leaf) and the
  Android `network_security_config.xml` pin-set, wire the manifest attribute,
  and record the hosts they covered in `extra.tlsPinning`.
- `apps/mobile/services/secureFetch.ts` reads that build-stamped host list back
  through `expo-constants` and decides every request in one exported pure
  function, `pinTransportVerdict`. React Native's `fetch` cannot inspect the peer
  certificate, so the stamp is the only honest signal the JS layer has, and the
  gate no longer hangs off `PINNING_ENFORCED` alone: **a release build that
  compiled a native pin config and left a pinned host out of it refuses that host
  at every rollout stage**, because the two halves disagree and that is a
  shipping mistake rather than a rollout step (`reason:
'no-native-enforcement'` when the table declares real pins, `reason:
'unprovisioned-pins'` when it left a credential-bearing host on placeholders).
  Only today's state — nothing declared, nothing compiled in — passes through,
  which is what keeps this entry open.
- Every outcome is now a named verdict, including the two that let a request
  through (`natively-verified`, `no-pins-required`) and the one that is this
  entry (`unverified-accepted`). Nothing reaches the network by falling off the
  end of the decision. `unverified-accepted` is not silent: the first request a
  release build sends to each pinned host it cannot verify logs one warning
  naming the host, this finding and this entry, so the accepted gap shows up in
  device logs and crash breadcrumbs instead of looking like normal traffic. Only
  the host is logged — the paths and queries carry tokens.
- A request that was really pinned may no longer be redirected off its host: once
  the first hop is `natively-verified`, a response that came back from a host the
  same build did not pin is refused with `reason: 'redirected-off-pinned-host'`
  rather than returned. The one-shot gate only ever saw the first URL, and a
  redirect is a second connection. This cannot fire on today's build (no hop is
  verified), so no current request changes.
- That check no longer treats silence as a same-host answer. A response whose URL
  the transport never reported used to return early — React Native does not
  always populate `Response.url` — which made the redirect defense fail open
  exactly where it was needed. It now refuses with
  `reason: 'unverifiable-final-url'`: a verified first hop says nothing about a
  second connection, and a build that cannot see where the answer came from
  cannot claim the pinned host sent it. Because that path only runs once a hop is
  verified, the `'report-only'` stage cannot rehearse it, so a **provisioned**
  report-only build logs `[pinning] responses from "<host>" do not report the URL
they came from …` once per host instead. If that line appears at step 9.3, the
  flip in 9.4 would refuse those responses and the transport has to be settled
  first. Today's build cannot emit it (its table is placeholders), so nothing in
  the shipped app changes.
- The generated Android config is scoped to pinned hosts only, with no app-wide
  `<base-config>`: a rule written there would apply to every endpoint the app can
  reach, and this file has no opinion about LAN dispatch targets or BYOK base
  URLs. (It buys no cleartext protection either way — `app.config.js` sets no
  `android:usesCleartextTraffic`, so the platform default already blocks cleartext
  at targetSdk 28+.) The security value is per host: `<trust-anchors>` with
  `system` only, plus the `<pin-set>`. The `<trust-anchors>` restate the platform
  default rather than add to it (apps targeting API 24+ already exclude user-added
  CAs, and this app overrides no `targetSdkVersion`), so on Android it is the
  `<pin-set>` that defeats this finding's attacker.
- The prebuild now fails on a half-provisioned table. `withAGITlsPinning` reads
  `REQUIRED_PINNED_HOSTS` from the same file it reads `PINS_BY_HOST` from and
  throws if any required host is still a placeholder while others are real,
  because that combination produces an installed app that refuses those hosts at
  runtime with no over-the-air remedy. Provision all six in one change.
- It also fails on `PINNING_ROLLOUT = 'enforced'` over a table that provisions
  nothing at all — the one combination `apps/mobile/scripts/check-tls-pins.mjs`
  used to catch and, per item 6 below, no longer can. Putting it in the plugin
  makes it a property of every prebuild rather than of one release script, so no
  artifact can be produced from a config that asks for enforcement with nothing
  to enforce.
- The refusal text for `no-native-enforcement` no longer tells the reader to add
  the plugin to `app.config.js`; it is registered, and the remaining cause is an
  artifact built before the rollout flip, which only a native build fixes.
- `apps/mobile/app.config.js` now registers `'./native/withAGITlsPinning.cjs'`
  in its `plugins` array, next to `'./native/android/withAGIShareIntent.cjs'`.
  This was the wiring step the previous round left open, and without it the pin
  table was inert no matter what it contained. Registering it also puts the
  pinning state inside the fingerprint `runtimeVersion`: the plugin only changes
  the evaluated Expo config once the rollout says `'enforced'`, so the flip
  changes the fingerprint and cannot be delivered over the air to a binary that
  compiled no pins — which would otherwise refuse every pinned host on a device
  with no remedy but a store release.
- `scripts/compute-spki-pins.mjs` captures the live chain for every host in the
  table and prints the paste-ready `PINS_BY_HOST` block plus both native blocks.
  `--clerk-key pk_live_…` adds the Clerk FAPI host.
- Coverage: `apps/mobile/__tests__/pinning.test.ts` (149 tests), and the
  enforcement assertions run the shipped `lib/pinning.ts` and
  `services/secureFetch.ts` against the shipped pin table — only the build's own
  `extra.tlsPinning` stamp is substituted, and one case stamps exactly what the
  plugin itself emitted for a provisioned table, so the two halves are checked
  against each other rather than against a hand-written expectation. The gate is
  composed from an exported fact-gatherer (`pinTransportFacts`), so what the
  shipped module actually reads — including the derived `PINNING_ENFORCED` — is
  asserted directly instead of inferred, and the single fact standing between
  today's build and a verified request (`pinsProvisioned`) is named by a test.
  Reinstating the pre-sweep decision (`if (!enforced) return undefined; if
(!pinsProvisioned) return 'unprovisioned-pins';`) turns 23 of them red. No test
  asserts that the exploit path works: the shipped build's outcome is asserted as
  the named verdict `{ allow: 'unverified-accepted' }` with no network call, and
  the test that names it reads this file and fails if this entry stops naming
  `BLOCKED_BY_HUMAN` and the plugin registration. A separate test asserts the
  warning that state emits, so the accepted gap has to be announced to stay
  accepted.
- Two of those tests are the ones that would have caught this round's gap.
  "is registered in app.config.js, so a provisioned table reaches a real build"
  loads `app.config.js` and asserts the plugin entry unconditionally — its
  predecessor returned early while the table was placeholders, which is exactly
  why an unregistered plugin shipped as if it were a fix. "never changes a
  request when the rollout only stages it, so the paste is safe" replays all 128
  fact combinations at `'report-only'` and at `'off'` and requires identical
  verdicts, so the staging step can never be the thing that breaks a build.

**What is needed and from whom**

1. Security owner — decide which key each host is pinned to and who holds the
   backup. Captured 2026-08-22 with `node scripts/compute-spki-pins.mjs`:

   | host                                                 | leaf expires | issuing CA             | root                                               |
   | ---------------------------------------------------- | ------------ | ---------------------- | -------------------------------------------------- |
   | `agiworkforce.com`                                   | 2026-11-06   | `YR1` (exp 2028-09-02) | `Root YR` (2032) / `ISRG Root X1` (2035)           |
   | `api.agiworkforce.com`, `signaling.agiworkforce.com` | 2026-11-04   | `YR2` (exp 2028-09-02) | `Root YR` (2032) / `ISRG Root X1` (2035)           |
   | `clerk.agiworkforce.com`                             | 2026-10-25   | `WE1` (exp 2029-02-20) | `GTS Root R4` (2028) / `GlobalSign Root CA` (2028) |
   | `api.openai.com`                                     | 2026-10-06   | `WE1` (exp 2029-02-20) | `GTS Root R4` (2028) / `GlobalSign Root CA` (2028) |
   | `api.anthropic.com`                                  | 2026-10-22   | `WE1` (exp 2029-02-20) | `GTS Root R4` (2028) / `GlobalSign Root CA` (2028) |

   Leaves rotate inside ~10 weeks, so pin CA keys, and pin at least two per host
   (issuing CA plus the root above it). A pin-set with no reachable key
   hard-fails every installed app at the next rotation and no over-the-air
   update can repair it.

   There is no pin-free way around this decision, which is why the entry is
   blocked on it rather than on engineering. Android already refuses user- and
   MDM-installed CAs by default at this target SDK, so the exposure that matters
   is iOS, and iOS apps do trust those roots. Certificate Transparency does not
   substitute: Apple deliberately exempts certificates issued by a locally
   installed CA from CT so debugging proxies keep working, and
   `NSRequiresCertificateTransparency` has been obsolete since iOS 16. Real
   hashes in `NSPinnedDomains` are the only mechanism that refuses that
   certificate.

2. Same owner — decide whether `api.openai.com` and `api.anthropic.com` should
   be pinned at all. We do not control their rotation; both currently chain
   through Google's `WE1`, and a CA change on their side is a client-side outage
   with no remedy. Dropping them from `REQUIRED_PINNED_HOSTS` is a supported
   answer. `clerk.agiworkforce.com` carries the same third-party rotation risk
   (also `WE1`), but dropping it is not equivalent: it is the host that issues
   the token the exploit steals, so unpinning it leaves the finding open by
   design. If Clerk's rotation cadence is unacceptable, pin the two roots above
   `WE1` rather than removing the host.
3. Same owner — before flipping the rollout, inventory every host the app must
   reach. Once enforcement is on, `secureFetch` refuses any host with no entry in
   `PINS_BY_HOST`, so local/LAN dispatch targets and any model-download CDN need
   entries or a documented exemption. This is pre-existing behaviour and it was
   deliberately left alone: `apps/mobile/__tests__/secure-fetch.test.ts` asserts
   it as the contract ("refuses requests to hosts with no provisioned pins
   (fail-closed)") and that file is outside this sweep's ownership, so narrowing
   the allowlist to the pin table's own hosts is a separate, owned change. You no
   longer have to do the inventory from memory: step 9.3 ships a build that logs
   every host enforcement would refuse, which is what the `'report-only'` rollout
   stage exists for. The equivalent hazard on the native side is gone — the
   generated Android config ships only per-pinned-host rules.
4. **Done in this sweep — no action, listed so nobody redoes it.**
   `'./native/withAGITlsPinning.cjs'` is registered in the `plugins` array of
   `apps/mobile/app.config.js`, next to
   `'./native/android/withAGIShareIntent.cjs'`. Applying the plugin to the
   shipped config returns it byte-for-byte unchanged — no `mods`, no
   `extra.tlsPinning`, no Info.plist key, no `network_security_config.xml`
   (verified 2026-08-22, asserted by "is a no-op on the shipped table" and "emits
   nothing while the rollout only stages a fully provisioned table"). One
   constraint it carries: `EXPO_ENABLE_DETOX` builds cannot ship pins.
   `withAGIDetox` writes its own `network_security_config.xml`, Android has room
   for exactly one, so the pinning plugin throws at prebuild rather than produce
   an artifact that claims to pin while Android trusts whatever certificate it is
   handed. Unset `EXPO_ENABLE_DETOX` for any artifact that ships pins.
5. Clerk — `@clerk/expo` does its own networking and never reaches
   `secureFetch`, so only the native config can cover the auth handshake. The
   FAPI host is `clerk.agiworkforce.com` (decoded from the publishable key,
   `pk_live_Y2xlcmsuYWdpd29ya2ZvcmNlLmNvbSQ`, TLS chain captured 2026-08-22). It
   now has a placeholder entry in `PINS_BY_HOST` and is in
   `REQUIRED_PINNED_HOSTS`, so step 1 must capture its pins with the others —
   there is no longer a state where the app reports itself pinned while the auth
   handshake is not. If the production Clerk instance ever changes, re-derive the
   host with `node scripts/compute-spki-pins.mjs --clerk-key pk_live_…`.
6. Release-tooling owner — `apps/mobile/scripts/check-tls-pins.mjs:31` greps for
   the literal `PINNING_ENFORCED = true`, which has not existed since
   enforcement became derived, so its FAIL branch at line 39 can never fire and
   its PASS message at line 56 still tells the reader to "flip
   `PINNING_ENFORCED=true`". That script gates production/beta/preview at
   `apps/mobile/scripts/release/preflight.sh:141` and
   `.github/workflows/release-mobile.yml:101`. It is outside this sweep's
   ownership. Replace the regex check with the condition that now matters — fail
   when `apps/mobile/lib/pinning.ts` contains
   `PINNING_ROLLOUT: PinningStage = 'enforced'` **and** any placeholder pin line
   — and drop the "flip `PINNING_ENFORCED=true`" advice for "flip
   `PINNING_ROLLOUT` to `'enforced'`". The hazard it was written to catch is no
   longer riding on it: `native/withAGITlsPinning.cjs` now throws at prebuild on
   exactly that combination (see the bullet above), so no artifact can be built
   from it, and two tests in `apps/mobile/__tests__/pinning.test.ts` ("fails the
   prebuild when the rollout says enforced and the table provisions nothing",
   "keeps the shipped rollout behind the pin table, which is what CI would gate
   on") fail the release build at
   `.github/workflows/release-mobile.yml:96` (`pnpm --filter @agiworkforce/mobile
test`), five lines before it reaches the stale check. Rewriting the script is
   still owed — a dead gate that prints PASS reads like cover it is not
   providing — but it is now stale tooling rather than an open door.
7. Dispatch/mobile owner — **the pairing socket is not covered on iOS, and steps
   1-6 will not cover it.** `SignalingClient` opens
   `new WebSocket(this.options.wsUrl)`
   (`packages/platform/utils/src/signaling.ts:113`, fed from
   `apps/mobile/stores/connectionStore.ts:1000`) and carries the pairing token
   and dispatch salt. It never goes through `secureFetch`, and on iOS ATS
   `NSPinnedDomains` governs `NSURLSession` only — React Native's iOS WebSocket
   builds its own CFStream TLS session and does not consult it. Android is fine
   (RN's WebSocket there is OkHttp, which honours the generated
   `network_security_config`). So after steps 1 and 4 the mobile→signaling
   handshake is pinned on Android and unpinned on iOS. Closing it needs either a
   native WebSocket transport that pins (an `NSURLSessionWebSocketTask`-based
   module, which is NSURLSession and therefore does run under ATS) or moving the
   pairing exchange onto
   `secureFetch`. Both are outside this sweep's ownership
   (`packages/platform/utils`, `apps/mobile/stores`), and the second is a
   protocol change, not a patch.

   The same gap applies to every file transfer. `apps/mobile/services/api.ts:533`
   (chat attachments) and `apps/mobile/src/features/projects/store.ts:172`
   (project files) upload through `createUploadTask` from `expo-file-system`,
   carrying the presign's `uploadHeaders`, and
   `apps/mobile/services/modelDownload.ts:240` pulls model weights through
   `createDownloadResumable`. None of the three passes through `secureFetch`, so
   none of them gets the scheme refusal, the absolute-form refusal or the
   allowlist, and the presigned storage host they actually talk to has no
   `PINS_BY_HOST` entry — so it stays unpinned after step 9 as well. Owner's
   call, and it is a real decision rather than an oversight: route them through
   `secureFetch`, or give the storage host an entry, or record the exemption. All
   three files are outside this sweep's ownership.

8. Same owner — `wsUrl` is server-supplied and only shape-checked.
   `apps/mobile/services/manualPairing.ts:145` accepts any string matching
   `/^wss?:\/\//`, so a claim response can steer the credential-bearing socket
   to an arbitrary host and to cleartext `ws://`. That is the post-MITM pivot
   this finding's exploit scenario describes, and it is downstream of the one
   call the pin gate does cover (`claimManualPairingToken`). The fix is a host
   check at that parse site, not more pinning: require `wss:` and require the
   host to be the configured signaling host (`requiresPin()` from
   `apps/mobile/lib/pinning.ts` already answers "is this one of the hosts we
   must pin"). That file is outside this sweep's ownership.

9. **The actual provisioning sequence**, once steps 1-3 are decided. Each numbered
   item is its own commit and its own review; do not compress them.
   1. `node scripts/compute-spki-pins.mjs` — probes all six
      `REQUIRED_PINNED_HOSTS` (`agiworkforce.com`, `signaling.agiworkforce.com`,
      `api.agiworkforce.com`, `clerk.agiworkforce.com`, `api.openai.com`,
      `api.anthropic.com`) and prints the paste-ready block. For a different
      Clerk instance: `node scripts/compute-spki-pins.mjs --clerk-key pk_live_…`.
   2. Paste the printed `PINS_BY_HOST` block over every placeholder in
      `apps/mobile/lib/pinning.ts`, **all six hosts in one commit** — a
      half-provisioned table fails the prebuild by design. This commit changes no
      request and no build output; `PINNING_ROLLOUT` stays `'report-only'`.
   3. Ship that build (a release channel — the report-only warnings are
      release-runtime only) and read its logs. Every
      `[pinning] rollout is report-only: "<host>" would be refused` line names a
      host enforcement would cut off. Give each one a `PINS_BY_HOST` entry or
      accept losing it. Do not skip this: this is the step that finds the LAN,
      localhost and BYOK endpoints step 3 asks you to inventory.
   4. Only then, in a separate commit, set `PINNING_ROLLOUT = 'enforced'` in
      `apps/mobile/lib/pinning.ts` and cut a **native** build (`expo prebuild`,
      then EAS). That commit is the whole security decision, reviewable on its
      own: it is what makes the plugin emit `NSPinnedDomains` and the Android
      pin-set, and what makes `secureFetch` apply the allowlist. It must not ship
      as an over-the-air update — the fingerprint `runtimeVersion` prevents that
      structurally, since the flip changes the evaluated Expo config.

**Residuals that survive step 9**, worth knowing before the flip is reviewed:

- The redirect check is post-hoc. React Native follows redirects in the platform
  layer, so on a hop that left the pinned host the credential it replayed is
  already on the wire by the time `secureFetch` sees the response and throws.
  Refusing still denies the attacker the answer and surfaces the hop in logs, but
  the token has to be treated as burned and rotated. Preventing the replay needs
  a transport that can stop at the redirect, which React Native's `fetch` cannot.
- `nativelyPinned` is read from `extra.tlsPinning`, a stamp the build writes about
  itself, not a certificate check. It is trustworthy only because
  `runtimeVersion` is `{ policy: 'fingerprint' }` and `@expo/fingerprint` keeps
  `extra` in the fingerprint unless the `ExpoConfigExtraSection` source-skip is
  configured. Nothing in the repo configures one, and a test now fails if a
  `fingerprint.config.js`/`.cjs` or a `sourceSkips` entry appears. Do not add one
  without re-reading this.
- The transports in item 7 are not covered by any of it.

**Costs to leave it:** unchanged from today — no pinning, so a device-trusted
rogue CA can read and replay mobile session tokens, and (per steps 7-8) the
pairing socket stays unpinned on iOS and reachable at a server-chosen host even
after step 9 lands. **F6 is open, not closed:** the mechanism is now wired end to
end and would pin as soon as it is given keys, but the shipped app still has
none, so nothing in it compares a certificate to anything. Step 9 is the whole
remaining path and every part of it needs a human: which keys, then the paste,
then the flip. This sweep removed the silent-failure modes
(enforcement can no longer be on while nothing verifies anything, a release build
can no longer skip the gate because an env var was never set, a build whose pin
table and native config disagree now refuses the affected host instead of
shipping it unverified, a half-provisioned table fails the prebuild, and the
remaining unverified path announces itself once per host instead of passing
through in silence), built the mechanism and registered it in the build; it did
not turn pinning on, and deliberately cannot without a second reviewed commit.
`apps/mobile/lib/pinning.ts` no longer exports `assertPinningReadyIfEnforced`: it
promised a bootstrap invariant nothing ever called, and the state it guarded
against is now unreachable by construction.

---

## 39. Set `ALLOWED_ORIGINS` on the signaling deploy before the next release (security sweep 2026-08-21, `services/signaling-server` F4/F10)

**Status:** `BLOCKED_BY_HUMAN` — needs a value only ops can supply (the real client
origins) plus a Fly/Railway dashboard action.

**Blocks:** every WebSocket pairing on any production signaling deploy that ships
without `ALLOWED_ORIGINS`.

**What changed.** `services/signaling-server/src/index.ts` used to run the whole
Origin allow-list and `x-signaling-internal-secret` gate inside
`if (allowedOrigins.length > 0)`. In production with `ALLOWED_ORIGINS` unset the
allow-list resolves to `[]`, so the gate was skipped entirely and any page on any
origin could open a WebSocket to the signaling server (CWE-346). The gate is now
unconditional: an Origin that is not on the allow-list is closed with `1008
forbidden_origin`, an empty allow-list closes with `1008 origin_not_configured`,
and a connection with no Origin is admitted only when it presents a valid
`x-signaling-internal-secret` — now compared with the file's existing
`constantTimeCompare` helper, after the blacklist and connection rate limiter
rather than before them (CWE-208).

Fail-closed was the founder decision, so the consequence is real: a deploy that
omits `ALLOWED_ORIGINS` now refuses connections instead of accepting all of them.

**Do, before the next signaling deploy:**

1. Enumerate the exact `Origin` header each client sends to
   `wss://signaling.agiworkforce.com/ws` — the Tauri desktop webview and the React
   Native mobile client both send one, and the strings are build-specific
   (`tauri://localhost`, the dev-server origin, the packaged app origin). These
   must be observed, not guessed; a missing entry is a silent pairing outage for
   that client.
2. Set the list on each deploy target:
   `fly secrets set ALLOWED_ORIGINS="…"` (`services/signaling-server/fly.toml` now
   documents this in `[env]`) and the same key in the Railway dashboard
   (`services/signaling-server/railway.toml` marks it REQUIRED).
3. Confirm `SIGNALING_INTERNAL_SECRET` is set on the same deploys. It is the only
   way a no-Origin client (and the `/pairings` bearer endpoints) can authenticate;
   without it every no-Origin handshake is closed with `origin_required`.
4. Decide whether any non-browser client should use the internal-secret path at
   all. Nothing in the repo sends `x-signaling-internal-secret` today, so if the
   answer is "no client", that path is dead weight and can be removed in a later
   slice.
5. Outside this sweep's ownership: `services/signaling-server/docker-compose.yml:29`
   still defaults `ALLOWED_ORIGINS` to the empty string for the production compose
   profile. That profile will now refuse browser connections until the operator
   supplies a value; someone who owns that file should either give it a default or
   make the omission loud.

**Cost to leave it:** signaling pairing does not work at all on a deploy that skips
step 2 — every client handshake closes with `1008 origin_not_configured`. Reverting
to the old behaviour is not an option: that is the cross-site WebSocket hijacking
hole the sweep closed.

**Verified by:** `services/signaling-server/__tests__/websocket/origin-policy.test.ts`,
which boots the real server as a child process with and without `ALLOWED_ORIGINS`
and asserts the close codes. Five of its nine assertions fail against the pre-fix
handler.

## Three Neon migrations are written but not applied — RESOLVED 2026-08-21

Applied to production on 2026-08-21 with founder authorization, after
`backup-pre-0131-20260821` was taken from production as the rollback point.
0131, 0132, 0133 and 0134 all applied clean; `pnpm db:migrate verify` reports
134 applied, 0 pending, 0 drift. Nothing further is needed here.

## Chinese-HQ provider opt-in is enforced on mobile but not on web

**Status:** `BLOCKED_BY_HUMAN` — the code is straightforward; the decision is not.

`deepseek`, `moonshot`, `qwen` and `zhipu` are in `models.json` and selectable
on web. The compliance contract that gates them
(`packages/contracts/compliance/src/provider-jurisdiction.ts`, via
`ensureLlmGateOpen`) has exactly one production caller — `apps/mobile`. The same
model selection on web reaches the provider with no named-provider consent.

Mobile enforces it partly for Apple 5.1.2(i), which does not bind web. So this
is not automatically a web requirement; it is a question about what you want
users to have agreed to before their prompt leaves for a Chinese-headquartered
provider.

No migration is needed — `consent_records.purpose` is a text column, so new
consent purposes are code-only. The work is: per-provider consent purposes, an
opt-in sheet in the model picker, and a check on the web send path.

**Why I did not just build it**

Enforcing the check without the sheet blocks paying users mid-conversation with
no way to proceed. Shipping the sheet without the check is a consent dialog that
grants nothing — the fake-control pattern this goal exists to remove. Both
halves have to land together, and whether they should land at all is a
founder/counsel call about legal exposure and user friction, not an engineering
one.

**What is needed from you**

- Decide whether web should require a named-provider opt-in before routing to a
  Chinese-headquartered provider. If yes, I will build both halves together and
  verify the block and the grant end to end.
- If no, say so and I will narrow the contract's documented scope to mobile so
  nothing claims coverage it does not have.

## The plugin catalogue had only four plugins in it — three real packs added (Phase 1)

**Status:** Resolved for the packs that can honestly exist today; still open for
going beyond the real first-party skill set.

`audit/ui-gaps.csv` carried GAP-274, "Plugin catalogue is a 4-entry preview that
installs nothing". Half of that was wrong and stays corrected: installing works,
and it matters. `POST /api/plugins/installations` calls `installWebPlugin`, and
`listEnabledPluginIdsForUser` gates real skill availability in the chat
request-processor, the tool-loop and `/api/skills`.

The other half — only four catalogue rows, one of them (`research-pack`)
actually installable — is now three rows better. Migration
`db/neon/0145_web_pack_example_prompts.sql` adds three new published,
web-installable, first-party packs that bundle ONLY skills `GET /api/skills`
actually serves in production:

    engineering-pack (code-review, systematic-debugging, frontend-design-review)
    writing-pack     (document-creation, presentation-creation, research-and-citations)
    data-pack        (data-analysis, document-creation)

`plugin_registry_entries` now holds seven rows: those three plus `research-pack`
are real installs; `github-automation`, `calendar-assistant`, and `crm-sync`
stay `preview` deliberately — their declared skills ("Code Review", "Meeting
Summarizer", …) do not correspond to any real skill, and promoting them would
advertise an install that installs nothing real.

**What is still needed from you**

- Every first-party skill that exists is now spoken for by one of the four
  installable packs. Going past seven catalogue entries means either shipping
  new first-party skills to bundle, or deciding whether third-party submission
  opens up — `plugin_registry_entries_first_party_only` is the one constraint
  to drop when that decision lands. I still should not invent a plugin's
  capabilities unprompted; a registry entry claims a capability, and a
  fabricated one is the same fake-availability defect this goal exists to
  remove.

## Automatic credit recharge needs your decision before any UI

**Status:** `BLOCKED_BY_HUMAN` — the toggle is trivial; what it authorises is not.

Self-serve credit purchase already ships: Billing renders a Usage top-up
section for Stripe-billed paid accounts with a unit rate, a minimum and a
self-serve maximum. (The `CreditAlertModal` that once declared "no credit
top-ups, ever" no longer exists — that record was stale.)

Automatic recharge does not exist at all: no `autoReload` field, column or
handler anywhere in the tree. It is the one remaining half of GAP-280.

**Why I did not build it**

Auto-recharge is a standing authorisation to charge a saved card while the user
is not present. The switch is an afternoon; the behaviour behind it is the real
work — a threshold that triggers it, a cap so a runaway loop cannot bill someone
repeatedly, an idempotency guard so a retry does not double-charge, a receipt
and a notification for a charge nobody watched happen, and a clear path to
revoke it. Shipping the toggle first would be a control that promises to spend
money and does not, and shipping the behaviour without the guards is worse.

**What is needed from you**

- Decide whether you want auto-recharge at all, and if so the trigger threshold,
  the per-period cap, and what the user is told after an unattended charge. I
  will build all of it together or none of it.

## Should new accounts get a pre-seeded example project?

**Status:** `BLOCKED_BY_HUMAN` — a product call, not an engineering gap.

The reference seeds every new account's Projects list with a "How to use
Claude" example that doubles as an interactive onboarding guide. Ours does not.

Everything needed exists — projects, instructions, knowledge files — so this is
buildable in an afternoon. I have not built it because it means creating a row
in a real user's account at signup that they did not ask for and have to delete
if they do not want it, and because it writes to production on every signup.

**What is needed from you**

- Say whether new accounts should get one, and what it should contain. If yes I
  will also need to know whether it is created at signup or lazily on first
  visit to Projects — lazily is cheaper and leaves accounts that never open
  Projects untouched.

## Nine live API routes have no caller anywhere

**Status:** `BLOCKED_BY_HUMAN` — wire or delete is your call, not mine.

I swept all 233 routes under `apps/web/app/api` for a caller in apps, packages,
docs or scripts. Most of the unreferenced ones are legitimately external — cron
via vercel.json, SCIM from an identity provider, IAP and GitHub webhooks, the
desktop and mobile clients, the public `/api/v1` surface. Eight more are
deliberate 410 Gone tombstones with tests pinning the status, which is correct
practice.

That leaves nine live routes, roughly 530 lines, that nothing calls:

    billing/analytics        memory/search           me/routing-preferences
    settings/test-provider   usage/history           usage/providers
    webhook-diagnostic       voice/health            debug/llm-status

Three are plausibly ops endpoints hit by monitoring rather than app code —
`voice/health`, `debug/llm-status`, `webhook-diagnostic`. If that is what they
are, they are fine and I will annotate them so the next sweep does not re-flag
them. `me/routing-preferences` corroborates an existing recorded flaw
(WEB-US-ONLY-ROUTING-NOT-THREADED-01): the preference is stored and never
threaded through routing.

**Why I did not just delete them**

An endpoint can have a caller outside this repository — a script of yours, a
partner integration, a saved request. Deleting a live route is a breaking change
that no test in here would catch, and it is not reversible by the person who
notices at 2am.

**What is needed from you**

- Confirm which of the three are monitored ops endpoints.
- For the rest: say wire or delete. If wire, say what should call them; if
  delete, I will remove them together with their tests and leave 410 tombstones
  where an external caller is plausible.

---

## BLOCKED_BY_HUMAN: two env vars documented nowhere, and CI is red on it

`pnpm check:env-contract` (inside `check:llm-operability`, which CI runs in
`repo-operability.yml`) fails:

```
- web: apps/web/lib/server/email-pseudonym.ts reads undocumented environment
       variable EMAIL_HASH_PEPPER
- web: apps/web/lib/server/mobile-iap-store-verification.ts reads undocumented
       environment variable APPLE_APP_STORE_ENVIRONMENT
```

The fix is two lines in `apps/web/.env.example`. I cannot make it: that path is
in a permission-denied directory for me, so this is yours to paste.

```
# Server-side pepper for email pseudonymisation. Email addresses are
# low-entropy and enumerable, so an unkeyed digest is reversible by dictionary;
# this pepper is what makes the stored value a pseudonym. UNSET IS NOT INERT —
# pseudonymizeEmail() silently falls back to legacyEmailSha256(), an unkeyed
# SHA-256, so production without this stores reversible digests.
EMAIL_HASH_PEPPER=

# Which App Store environment signed receipts are trusted against: empty or
# "production" means production, "sandbox" means sandbox, anything else makes
# verification fail closed with 503. Deliberately deployment config and never
# read from the JWS payload, because a Sandbox-signed transaction is a free
# test purchase and must not unlock production entitlements.
APPLE_APP_STORE_ENVIRONMENT=
```

**Worth your attention beyond the guard:** `EMAIL_HASH_PEPPER` unset is not a
no-op. `pseudonymizeEmail()` falls back to an unkeyed SHA-256 of the address, and
an unkeyed digest of a low-entropy value is reversible by dictionary — the exact
weakness the pepper exists to prevent. Please confirm it is actually set in the
production environment; the code cannot tell you, because the fallback is silent.

---

## URGENT: an uncommitted change in the tree will break CI for every surface

`pnpm install --frozen-lockfile` currently FAILS at the repo root. That is the
exact command every workflow runs — `js-verify`, `rust-desktop-cli`,
`release-mobile.yml:89`, all of them — before any test executes. If the current
working tree is committed as-is, CI does not fail a test; it fails to install,
on every surface at once.

Reproduced directly:

    ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because
    pnpm-lock.yaml is not up to date with <ROOT>/apps/web/package.json

Exactly one specifier differs out of ~150, nothing added or missing:

    lockfile records   apps/web -> undici: ^8.10.0
    computed spec is   apps/web -> undici: >=8.9.0 <9

CAUSE: `apps/web/package.json:143` now declares `"undici": "^8.10.0"` as a
direct dependency, while the root `overrides` block in `pnpm-lock.yaml:21`
forces `undici: '>=8.9.0 <9'`. pnpm resolves the importer's effective spec
through the override, so the recorded specifier and the computed spec can never
agree. Regenerating the lockfile does not fix it — one of the two declarations
has to change.

THIS IS NOT ON THE BRANCH. `git show HEAD:apps/web/package.json` contains no
undici entry at all. Both `apps/web/package.json` and `pnpm-lock.yaml` are
modified-uncommitted, and they were not modified when this session began. They
appear to be live work from another session — most likely a security-driven
undici pin, given the override reads like a CVE floor.

DECISION NEEDED, and it is not mine to make because I cannot know the intent
behind the pin:

- drop the direct `undici` dependency from apps/web and let the root override
  supply it, or
- widen the root override to admit `^8.10.0`.

I did not touch either file. Working around it with `--no-frozen-lockfile` would
rewrite the lockfile underneath another session's in-flight edit.

SIDE EFFECT: this also blocks the mobile verification. `apps/mobile`'s jest
failure locally is a stale-install artifact, and settling it requires a clean
`--frozen-lockfile` run, which is impossible until the undici conflict is
resolved.

---

## SAFETY: two app allow/deny systems in one panel, and the visible one does nothing

Desktop Settings -> Computer Use contains TWO app allow/deny mechanisms. One is
real. The other sits ABOVE it on the same page and is inert.

THE REAL ONE — "Per-app permission registry". `AppPermissionManager`
(`src-tauri/src/automation/computer_use/app_permissions.rs`) is constructed at
startup (`lib.rs:1000-1009`), persisted to `app_permissions.json`, and consulted
inside the actual agent action loop: `anthropic_agent.rs:321` and
`observe_plan_act.rs:358` both call `check_app_permission()` via
`SafetyLayer::check_app_permission` (`safety.rs:409`), gated by
`safety.check_app_permissions`, default true. Five IPC commands expose it and
`ComputerUseSettings.tsx` calls all five. This section works.

THE DECORATIVE ONE — "Allowed / denied app lists", higher in the same panel.
Backed by the `allowedApps`/`deniedApps` zustand arrays. `handleAddAllowedApp`
and `handleAddDeniedApp` push onto a local array and nothing else. Those arrays
are read in exactly two places, both of which render them back to the user. No
`invoke` anywhere — the strings never reach Rust, never reach
`AppPermissionManager`, never reach the safety layer. `computerUseStore` has no
`persist` middleware, so the lists are also discarded on restart.

WHY THIS IS WORSE THAN AN INERT CONTROL. Someone hardening Computer Use opens
the panel, sees "Allowed apps" and "Denied apps", types the applications they
want an agent kept out of, sees them listed back, and is protected by nothing.
The mechanism that would actually have stopped the agent is a different control
further down the same page, which they may never reach. A user who fills in the
wrong list is worse off than if neither existed, because the decorative one
gives them the feeling of having locked the door.

DECISION NEEDED:
(a) delete the decorative lists and their store plumbing, leaving the per-app
permission registry as the single allow/deny surface — nothing is lost,
the registry already carries the always-blocked list and active-window
helper; or
(b) keep them as a convenience front-end, in which case they MUST write
through to `app_permissions_set` / `app_permissions_remove` so they are a
second view of the same data rather than a competing one.

Nothing has been changed. Recommendation is (a).

Related and already actioned on the same reasoning: `hideAppsOnTask`, a toggle
in the same safety section whose copy read "Apps hidden during a task are
restored when the agent stops", had no reader anywhere and no persistence. It
has been removed — no OS-level app-hiding capability exists in the Rust tree at
all, so there was nothing to wire it to.

---

## EMAIL_HASH_PEPPER: the code no longer degrades silently — but two things are yours

The silent-degradation defect is fixed. `pseudonymizeEmail()` now FAILS CLOSED in
production runtime when the pepper is absent, instead of quietly falling back to
an unkeyed SHA-256 of a low-entropy, dictionary-reversible address. A boot
assertion in `lib/validate-env.ts` feeds `instrumentation.ts`, which already
throws on a production env error, so a misconfigured deployment now fails at
BOOT naming the variable rather than at the first waitlist signup.

Two things it deliberately does NOT do, both correct:

- A production BUILD does not throw. `NEXT_PHASE=phase-production-build` is
  checked first, so `next build` takes the legacy path. A guard that fired
  during the build would break deploys rather than protect anything.
- Vercel PREVIEW does not throw. Preview runs with `NODE_ENV=production`, so a
  naive check would have thrown on every preview deployment.

MATCHING IS PRESERVED. `emailPseudonymCandidates()` no longer routes through the
throwing function — it reads the pepper itself and returns the legacy digest
alone when the pepper is missing, without throwing, even in production. Rows
written before the pepper stay findable and erasure still purges them. Had it
kept routing through, the new throw would have propagated into the erasure query
and made pre-pepper rows UNERASABLE — a confidentiality bug turned into a
compliance failure.

### DECISION 1 — a misconfigured production now BLOCKS erasure instead of degrading it

The erasure RECEIPT (`anonymous-erasure.ts:48`) is a write. So if production ever
runs without the pepper, a DPDP erasure request fails rather than stamping a
reversible digest into the security-audit record. I judged that correct — the
receipt is itself a stored pseudonym — but you should know the behaviour from me
rather than from an incident. The erasure QUERY is unaffected; only the receipt.

### DECISION 2 — rows written before the pepper keep unkeyed digests, permanently

`docs/agent-context/known-flaws.md:89-92` states the variable was added to Vercel
Production and Preview on 2026-08-20, effective on each surface's next deploy.
That is an in-repo claim, not evidence — nobody in this session could see the
dashboard.

If no deploy has happened since then, production has been writing reversible
digests, and every row written in that window keeps its unkeyed digest FOREVER: a
pseudonym cannot be recomputed from a hash. Affected columns are
`waitlist.email` and `consent_records.subject_email_sha256`.

You need to decide whether those rows are re-keyed from a plaintext source or
accepted as legacy. Matching is unaffected either way — the exposure is the
stored value itself.

### STILL OUTSTANDING

`pnpm check:env-contract` remains red. It wants `EMAIL_HASH_PEPPER` and
`APPLE_APP_STORE_ENVIRONMENT` documented in `apps/web/.env.example`, a path my
permissions deny. The exact text to paste is recorded earlier in this file.

---

## DECISION: `pnpm build:desktop` cannot exit 0 on any developer machine

The desktop app builds and code-signs correctly. Verified on this machine:

    target/release/bundle/macos/AGI.app          signed, TeamIdentifier=D2PR62RLT4
    target/release/bundle/dmg/AGI_1.2.0_aarch64.dmg   25.5 MB
    target/release/bundle/macos/AGI.app.tar.gz   24 MB, UNSIGNED

Vite genuinely ran (9933 modules transformed), codesign used the real Developer
ID with no keychain prompt, and notarization was skipped with a WARNING because
`APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` are absent — the correct behaviour
for a local build.

But the command exits 1. After bundling, Tauri builds an updater artifact that
must be signed with `TAURI_SIGNING_PRIVATE_KEY` — a DIFFERENT secret from the
Developer ID codesigning identity. It is Tauri's own updater-manifest key, and
only its public half is in the repo (`tauri.conf.json:103`). Without the private
half that step throws a hard error:

    Error A public key has been found, but no private key.
          Make sure to set `TAURI_SIGNING_PRIVATE_KEY` environment variable.
    Failed: @agiworkforce/desktop#build

THE ASYMMETRY IS THE FINDING. Notarization needs release-only secrets and
degrades to a warning. Updater signing needs a release-only secret and hard
fails. So `pnpm build:desktop` returns non-zero on EVERY developer machine, not
just this one — a developer cannot run the documented full build and see it
succeed, and cannot distinguish "my change broke the build" from "I do not hold
a release secret".

YOUR CALL, two defensible options:
(a) Intended — the full build is a release-only path, in which case the script
or its docs should say so, because today it looks like a broken build.
(b) Make updater-bundle generation conditional on `TAURI_SIGNING_PRIVATE_KEY`
being present, mirroring how notarization already degrades. Local runs
would then produce .app and .dmg and exit 0; CI, which supplies the secret
and guards on it being non-empty (release-desktop.yml:69-73), still
produces and signs the updater artifact.

I did not change the build script. Which of these is right depends on whether
you want local full builds to be a supported workflow, and that is a product
decision.

NOTE ON MY OWN REPORTING: I initially told you this build SUCCEEDED, reading
success from the presence of the artifacts without checking the exit code. It
exited 1. The artifacts are real and signed; the claim of success was not.

---

## 141 of the VS Code extension's 890 "passing" tests cannot fail

An audit of all 95 test files found that ~16% of the suite asserts on logic
DEFINED INSIDE THE TEST FILE. Those tests are green regardless of what the
extension does. Five files are entirely vacuous; six more are mixed.

The proof they track nothing is that four have already DRIFTED from the
production they impersonate:

1. `api.test.ts` "withRetry pattern" — the local copy decides retryability with
   `err.message.startsWith('CLIENT:')`. The string `CLIENT:` appears NOWHERE in
   production. Real `withRetry` retries on `AgiWorkforceApiError` with
   `statusCode >= 500`. Four tests assert the retry policy of a convention that
   does not exist.

2. `inlineCompletionProvider.test.ts` "extractCompletionText" — production takes
   `(raw, maxLength)` and truncates on both return paths. The copy takes `(raw)`
   and never truncates. So `agiWorkforce.inlineCompletions.maxLength` — a
   registered, shipped, user-facing setting — has ZERO test coverage, while a
   file named after that provider shows 7 green tests over that function.

3. `trust-boundary.test.ts` "endpoint validation" — 7 tests, 5 labelled
   CRITICAL, over a local `isValidApiEndpoint` and a local host allowlist. The
   copy ALLOWS `agiworkforce-api.vercel.app`, which production REJECTS, and
   never covers `staging.agiworkforce.com` or `::1`, which production allows.
   Mitigating: the real `validateEndpointUrl` IS covered by security.test.ts
   VSCODE-01, so the control is not unguarded — these 7 are drifted duplicates.

4. THE ONE I MOST WANT YOU TO SEE — `security.test.ts` VSCODE-05 and VSCODE-06.
   VSCODE-05 defines `const SAFE_HREF_RE = /^(https?:|mailto:)/i` INSIDE each of
   its five tests and asserts the regex behaves as written. The actual
   sanitization is DOMPurify in `src/webview/render.ts` — `ALLOWED_URI_REGEXP`,
   `FORBID_TAGS`, `FORBID_ATTR`, and an `afterSanitizeAttributes` hook — which
   this file never imports. VSCODE-06 does a `.replace()` inline and asserts the
   replacement worked; one of its tests even carries the comment "We just verify
   the detection — the actual skip happens in sidebarProvider", so the author
   knew.

   NO TEST ANYWHERE asserts the real sanitizer's URI or tag policy. That is a
   genuine coverage gap sitting behind two CVE-style identifiers that read as if
   it were covered.

WHAT THE NUMBER MEANS: roughly 749 of the 890 exercise production. I have
reported "887 / 890 extension tests passing" to you several times today; that
number is real as a count and weaker as evidence than it sounds.

The concentration is what matters more than the total — the vacuous blocks
cluster on retry policy, endpoint validation, completion truncation and HTML
sanitization, which are precisely the places a green suite gets read as proof
that a control works.

Not a regression, and not urgent in the incident sense: these tests have always
been vacuous, and no defect is known to have shipped because of them. But the
extension's real coverage is lower than its numbers imply, and the security-ID
blocks actively mislead.

REWRITE IS UNDERWAY, highest misleading value first: the security blocks plus
real-sanitizer coverage, then completion truncation, then retry policy. The two
large whole-file rewrites (codeLensProvider 35 tests, workspaceIndexer 30) are
volume work and can follow.

---

## VS Code indexes the user's workspace on every file save, and nothing reads it

Found while auditing test coverage, not while looking for it.

`apps/extension-vscode/src/data/workspaceIndexer.ts` exposes
`getRelevantContext()` and `isStale()`. Both have ZERO callers in production —
grep across `src` finds only their definitions.

What IS wired is `registerFileWatcher()` (chatSetup.ts:64). On every change,
create and save of any `.ts .tsx .js .jsx .py .go .rs .java .cs .cpp .c .h .rb
.php .swift .kt` file, it runs `executeDocumentSymbolProvider` and writes up to
500 files' worth of symbols into `workspaceState`.

So the extension pays CPU, disk and battery to build and persist a symbol index
on every save, and no code path ever reads the result. This is the same shape as
the dead `contextBudget.ts` deleted earlier today — background work with no
consumer — except this one is attached to a file watcher, so unlike dead code it
costs the user something continuously.

DECISION NEEDED, and it is a product call rather than a cleanup:
(a) DELETE the indexer and its watcher. Nothing reads it, so nothing regresses,
and users stop paying for it.
(b) WIRE `getRelevantContext()` into chat context, which is evidently what it
was built for. That is a feature decision — it changes what gets sent to
the model — and it needs your intent, not a guess from me.

Not urgent in the incident sense; it has presumably always been this way. But it
is the only finding today that costs the user resources continuously rather than
merely misleading a reader.

RELATED, for scale: its 30 tests are vacuous — they test a local copy whose
shape has drifted from production (free function vs method, top-10 vs top-20,
hardcoded 2000 vs a `maxChars` parameter nothing tests). Do not spend effort
rewriting them until (a) or (b) is decided, because (a) deletes them outright.

---

## A privacy notice with zero test coverage (found, now covered)

`checkInlineCompletionsFirstRun` (`apps/extension-vscode/src/extension.ts:236`,
called from `activate` at :208) is the first-run notice telling the user that
inline completions send roughly 100 lines of surrounding code on each keystroke,
and which files are excluded. It is the disclosure the user sees before that
starts happening.

It had NO test coverage anywhere. What sat in its place were six tautologies of
the form `const shouldWarn = enabled && !acknowledged; expect(shouldWarn).toBe(true)`
— assertions on a local expression, in a file named `extension.test.ts`.

If that notice had silently stopped firing — an activate-ordering change, a
guard inverted — nothing would have failed. Users would be sending surrounding
code with no disclosure, and the suite would still be green.

It is now covered by three real tests driving the actual `activate`: the notice
fires once with its real text, it does not repeat once acknowledged, and it stays
silent while inline completions are off. Proven by break run: removing the
`checkInlineCompletionsFirstRun` call from `activate` fails the first test.

WHY THIS ALMOST GOT DELETED. I had authorised removing all 20 tautologies in
that file on the grounds they were redundant, with the condition that redundancy
be proven input by input first. That check found FOUR of the six blocks were not
redundant at all:

- the privacy notice above (zero coverage anywhere)
- `commandLabel`, real exported code behind the plan-mode confirmation prompt,
  where the copy had also DRIFTED — production has five labels including
  `docs: 'Generate Docs'`, the copy had four
- the API-key validator at `commandSetup.ts:515`, no coverage
  Only two blocks were genuinely deletable, plus one that described a function
  (`isLocalPortReachable`) that does not exist.

Recording this because the lesson generalises: "vacuous" and "redundant" are not
the same property. A test can assert nothing AND be the only thing pointing at a
behaviour that matters. Deleting on the first property without checking the
second would have quietly removed the only marker that a privacy disclosure
existed.

ONE GAP RECORDED, NOT FIXED: the real configuration-change handler
(`extension.ts:140`) reacts to `agent.mode`, `agent.effort` and `cliPath` —
restarting local runtimes, reconciling consent. The tautologies that pretended to
cover it named three DIFFERENT keys, so deleting them lost nothing true. But that
handler still has no coverage.

---

## Fake-test sweep across all six surfaces — web is fine, Chrome is not

The VS Code finding (145 of 986 tests unable to fail) prompted a sweep of every
other surface. Rates are ESTIMATES from biased samples, not censuses; the
vacuous counts themselves are verified by reading.

extension (chrome) 166 vacuous / 1587 blocks ~10.5% worst
desktop 163 / 3230 ~5.0%
web 113 / 8695 ~1.3%
mobile 27 / 2897 ~0.9%
cli 8 / 1942 ~0.4% effectively clean

### WEB IS NOT INFECTED — the number I quoted you holds

~1.3%, and more importantly its security corpus is VERIFIED CLEAN: 145 files
covering security/, billing/, csrf, auth, rate-limit, encryption, secrets, PII,
redaction, consent, retention, erasure, entitlement, quota and paywall — ZERO
vacuous. `html-sanitizer.test.ts` genuinely exercises the real sanitizer with 63
tests. The exact thing that was hollow in VS Code is solid on web.

### THE ONE THAT MAY BE A REAL SECURITY GAP, NOT JUST A FAKE TEST

`apps/mobile/__tests__/trust-boundary.test.ts` is 20/20 vacuous AND drifted. Its
test named "CRITICAL: local mode must never see cloud unlocked without auth"
asserts a local `isCloudUnlocked(authToken, hasSubscription)`.

Production `isCloudUnlocked` (`src/features/model-picker/store.ts:21`) is
ZERO-ARGUMENT: `return useWaitlistStore.getState().cloudUnlocked`. No auth check.
No subscription check.

So a test carrying a CRITICAL label asserts a gate the product does not
implement. Either the gate is enforced somewhere else and the test is merely
misplaced, or cloud unlock genuinely has no auth check on mobile. I did not
determine which — that needs someone who knows the intended trust boundary, and
it is the single highest-priority item out of this sweep.

### CHROME IS THE WORST, AND IT READS AS A REMEDIATION LEDGER

`apps/extension/__tests__/security-fixes.test.ts` is organised by finding ID —
C-2, CHROME-CRIT-1, H-07, H-01, H-1/H-2/H-3, P0-D and others — with 63 of its
102 blocks vacuous. The code under test is either ABSENT from production
(C-2's `resolveAuthHeader`/`isBridgeRequest` have no counterpart at all) or
measurably DRIFTED (CHROME-CRIT-1 asserts a 16-hex-char fence nonce; production
`createFenceNonce` emits 32, so that test would FAIL against the real function).

A file named `security-fixes.test.ts`, indexed by finding ID, is exactly what a
reader treats as proof those findings were fixed and stay fixed.

Also on Chrome, all verified:

- `background.cookies.test.ts` 25/25, with PROVEN drift. Production was rewritten
  to structured `CookieBlockEntry` parsing; the suite still holds 44 regexes and
  its own matcher, and never noticed. They also DISAGREE: the test's pattern
  blocks `foox.com`, production's suffix mode allows it.
- `recorder-redaction.test.ts` 16/16 — PRIVACY, re-implements the API-key/JWT
  redaction instead of calling `sanitizeRecordedValue`.
- `connection-lifecycle.test.ts` 33/33 — the three classes it tests do not exist.
- `screenshot-tab-restriction.test.ts` 4/4 — the cross-tab screenshot control.

### DESKTOP HAS A DIFFERENT FAILURE MODE

Mostly MOCK-ECHO rather than re-implementation: `expect(invoke).toHaveBeenCalledWith(x)`
where the test passed `x` to the mock itself. Green regardless, without copying
anything. `memory.test.ts` (55 blocks) and `scheduler.test.ts` (37) are this
shape — `api/memory.ts` and its `fenceUntrustedMemoryContent` sanitisation never
run. And `stores/__tests__/apiStore.test.ts` tests a store that WAS NEVER
WRITTEN — `stores/apiStore.ts` does not exist.

### CLI IS CLEAN — report it as such

8 of 1942 (0.4%), both clusters self-labelled "// Simulate". Every auth,
credential, permission, redaction, billing and policy module is genuinely wired.
`src/routing/classify.rs:292` is best-in-class: it diffs production Rust statics
against the canonical TS source and its docstring forbids re-typing thresholds.

### THE SEARCHABLE SIGNATURE, worth more than the counts

CONCEPT-NAMED test files are the infected stratum. `trust-boundary.test.ts`
exists on web, mobile AND extension — all three ~100% fake. Module-named files
(`fooStore.test.ts`, `fooProvider.test.ts`) were 0/12 in a random control and
clean everywhere sampled. A file named after an IDEA rather than a module has
nothing to import, so it invents its subject.

The cheap detector: a test file with NO import specifier starting with `.`, `@/`,
`@shared`, `@features` or `@agiworkforce`, and no `readFileSync` of production
source, is almost certainly vacuous. That single rule caught every genuine web
hit with only the SQL-migration family as noise.

---

## RESOLVED: the mobile `isCloudUnlocked` question is BENIGN — cleared

I flagged this as the highest-priority item from the fake-test sweep. It has
been traced and it is NOT a security gap. Recording the clearance as prominently
as the alarm.

VERIFIED: no managed compute is served without a Clerk-verified userId and a
server-side subscription lookup keyed on that userId. Forcing
`cloudUnlocked === true` on an unauthenticated device unlocks UI affordances and
nothing else — every resulting request is rejected 401/403 at the server. A UI
defect class, not compute theft.

WHY, in the three places it matters:

1. THE FLAG NEVER GATES A NETWORK CALL. The two sites that look like network
   gates are dead: `remoteChatGate.ts:36` reads `flags.v1LocalOnly && !cloudUnlocked`
   and `v1FeatureFlags.ts:2` has `v1LocalOnly: false`, so that branch cannot
   execute. The real pre-flight guard is `captureCloudAccountEpoch()`
   (`chatExecutionStore.ts:777`), which returns non-null only with an active
   Clerk owner id and does not read the flag at all. Everything else the flag
   touches is model-picker filtering and UI labels.

2. PERSISTENCE IS ACTIVELY DESIGNED AGAINST THE OBVIOUS BUG. `waitlist/store.ts`
   excludes `cloudUnlocked` from `partialize` entirely, and `merge` rebuilds from
   the signup record only, so a legacy blob cannot reintroduce the grant. The
   code comment names the exact attack: a rehydrated `true` routing chats to
   managed cloud on cold start before that session is proven. The test covering
   this is REAL — verified, given the session's subject.

3. THE SERVER ENFORCES INDEPENDENTLY. `auth-gate.ts`: no Bearer → 401 before
   anything else; token verified with real crypto via `@clerk/backend`; the
   subscription lookup is keyed on the SERVER-derived userId, never on anything
   the client sent; inactive plan → 403. The request body carries no
   `cloudUnlocked` field — the flag is never transmitted.

The CRITICAL-labelled test was wrong about the function's shape AND testing the
wrong layer, but it was not papering over a hole. The invariant it wants is
enforced in two other places.

### TWO BACKLOG ITEMS, NEITHER URGENT

1. DELETE THE INVITE PATH. `'ALPHATESTER'` is a hardcoded unlock string still
   shipping in the mobile bundle (`waitlist/service.ts:36`), wired to a writer
   that sets `cloudUnlocked: true` with no auth and no network — a pure local
   string compare that works offline. It is unreachable today only because
   `InviteCodeModal` is mounted nowhere; it is leftover from the waitlist-gate
   removal. Still 401 at the server if it ever fired, so cosmetic — but it is one
   import away from being live and has no upside. Clean up the four stale
   `jest.mock('.../cloud-bridge')` calls that outlived the gate removal too.

2. DELETE OR REWRITE `apps/mobile/__tests__/trust-boundary.test.ts`. All 20
   blocks vacuous, three of its four local copies drifted. Leaving it means the
   next reader sees "CRITICAL: local mode must never see cloud unlocked without
   auth" and believes it is guarded there.

---

## 39. The operator console has no in-app entry point (merge of the security sweep, 2026-08-22)

**Status:** `BLOCKED_BY_HUMAN` — a product decision, not a code gap.

`apps/web/features/admin/components/AdminConsoleEntry.tsx` was added on
`compliance/dpdp` to surface an "Open admin console" card in Settings → Security.
It gated on `hasAdminConsoleAccess(user.publicMetadata)` — the **organisation**
`owner`/`admin` role — while the routes behind it are now gated on
`requirePlatformAdmin`, i.e. the deploy-time `AGI_PLATFORM_ADMIN_USER_IDS`
allowlist (CLAUDE-SECURITY-20260821-144214 F2/F3/F5/F6).

That combination is worse than having no link: it advertises a console
described as doing "account suspend, ban, and reactivate" to every customer who
owns their own org, and then answers 404 when they click it. The component was
deleted rather than kept dead, so nobody re-wires it with the same gate.

**The decision needed:** whether the operator console should have an in-app
entry at all. If yes, it cannot be gated client-side — `AGI_PLATFORM_ADMIN_USER_IDS`
is server-only by design — so it needs a server component or an endpoint that
reports platform membership for the signed-in user. Until then, reach the console
by navigating to `/admin` directly; it works for allowlisted operators.

---

## 40. Missing `ANTHROPIC_API_KEY` Actions secret — "AI output quality evals" has never passed on schedule

**Status:** `BLOCKED_BY_HUMAN` — needs a repository secret only you can add.

**Blocks:** any real measurement of model output quality. Every scheduled run of
`.github/workflows/evals.yml` has failed identically since it was added: run
31363692413 (2026-08-10, its first scheduled run) and run 32695971124 (this
week) both fail at the same guard,
`evals.yml:119-124` ("Require the provider key"), which checks
`ANTHROPIC_API_KEY` and exits 1 when it is empty — by design, per
`tools/evals/README.md:58-60`, because a green run that measured nothing is the
exact failure mode this directory exists to prevent. The env dump on run
32695971124 confirms the secret is empty in this repository.

**The fix:** add `ANTHROPIC_API_KEY` under repository Settings → Secrets and
variables → Actions. Then trigger `workflow_dispatch` on "AI output quality
evals" once to confirm the live job actually runs — the guard passing is not
enough by itself; the job downstream (`pnpm exec vitest run tools/evals` with
`AGIWORKFORCE_LIVE_TEST=1`) must be seen scoring the three corpora.

**Cost of adding it:** real, ongoing spend. The weekly live job
(`__tests__/live.eval.test.ts`) runs the `golden` (12 rows), `refusal` (10
rows), and `jailbreak` (11 rows) corpora — 33 rows total — through one
non-streaming Anthropic Messages call per row, each capped at 512 max output
tokens (`tools/evals/src/anthropic.ts`'s `maxOutputTokens` default). That is a
small, bounded weekly cost, not a runaway one, but it is real production API
spend against whatever key you add, so it should come from a key budgeted for
this rather than a shared production credential.

**Cost of leaving it:** none of the quality, refusal, or jailbreak-resistance
claims this suite exists to back are actually being measured in CI. The offline
harness job (`pnpm exec vitest run tools/evals`, no live model) still runs and
passes on every change to the directory, so the grading logic itself is
exercised — only the live measurement against a real model is dark.
