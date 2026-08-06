<!-- Generated triage queue. Per CLAUDE.md this is NOT remediation: open the cited
     source files, confirm in implementation, patch production paths, then record. -->

# Cross-Surface Contradiction Audit

Status: Triage queue (unremediated)
Owner: Platform lead
Generated: 2026-08-04
Method: 12 parallel domain sweeps (pricing, plan capabilities, usage limits, marketing,
settings wiring, subscription lifecycle, connectors/MCP, scheduling/workflows, terminology,
flags/gates, desktop shells, mobile/extensions) -> 139 candidate contradictions ->
per-finding adversarial refutation pass -> 81 survived (58 refuted) -> 70 after dedupe.
Every finding cites >=2 locations with quoted evidence from both sides.

Spot-verified against source at synthesis time: CAP-1, MKT-2, CON-2, SCH-1, MOB-1.

**Repo:** `/Users/siddhartha/Desktop/agiworkforce` · **Branch:** `fix/audit-remediation-2026-07-25` · **Date:** 2026-08-04
**Input:** 81 verifier-survived findings across 12 domain sweeps → **70 after dedupe** (11 merged as the same underlying contradiction seen from multiple domains).
**Risk = the verifier's `riskAdjusted` value.** All corrections from the adversarial pass have been applied; where a finder's claim was corrected, the corrected fact is what appears below.

**Distribution:** 8 HIGH · 42 MEDIUM · 20 LOW

---

## 1. PRIORITY — the 8 HIGH-risk contradictions

These are the ones that break a flow, mis-state a sold entitlement, or ship a false claim on a public/store surface.

| ID        | Contradiction                                                                                                                                                | Why urgent                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MKT-1** | `/pricing` sells the Free plan as **"Frontier model access"**; the server 403s Free on anything outside two economy minis                                    | Public, unauthenticated top-of-funnel page making a concrete product claim the server explicitly refuses with the words _"Free managed cloud access currently supports Auto Economy only."_ Copy-only fix. |
| **MKT-2** | Marketing claims **"50+ models"** on six public pages; the canonical catalog holds **31**                                                                    | A trivially disprovable count inflated ~60%, on the pages that sell provider/model breadth. The justifying comment ("56 compatibility models") is unsupported by any artifact in the repo.                 |
| **CAP-1** | **Enterprise** is sold "Custom" custom-MCP connectors and projects; a drifted converter maps `'custom' → 0` so the API denies every Enterprise add           | Highest-priced contracted tier is refused a capability the pricing page publishes. Also zeroes Enterprise project limits and chat-path connector budget.                                                   |
| **CON-1** | Marketing states **streamable HTTP MCP is supported**, incl. on the Desktop spec sheet; Desktop's transport documents that it _never_ speaks streamable HTTP | Desktop's `Http` variant maps to legacy split-endpoint SSE and POSTs to `{base}/message` — a streamable-HTTP server will fail with no explanation, and the dialog offers no transport picker.              |
| **CON-2** | `/integrations`' primary CTA **"Browse Apps & Connectors"** → `/apps` → silent `router.replace('/integrations')` for every signed-out visitor                | Dead click on a public marketing CTA, plus `/apps` is in the sitemap at priority 0.9 and linked from the global header, footer, and 10 marketing pages.                                                    |
| **SCH-1** | Desktop **"Run Once"** scheduled tasks are silently created as **daily-recurring 9 AM** jobs                                                                 | User asks for one run, gets an unattended agent job that fires every day forever; the list view then re-labels it "Every day". Edit path silently discards schedule changes while toasting "Task updated". |
| **SCH-2** | Managed Cloud sells **up to 250 scheduled tasks/user**; the only sweep runs **once daily and claims 10 runs platform-wide**                                  | One max_15x user's allowance exceeds global daily throughput 25×. Tasks don't vanish (FIFO backlog) but fire arbitrarily late.                                                                             |
| **MOB-1** | **App Store and Play Store listings** advertise **image generation on the free tier**; `image_generation` is `PRO_TIERS` and the server 403s                 | False claim on public store product pages — a store-policy/consumer-protection exposure, not merely internal drift. Appears in both descriptions _and_ both release-notes fields.                          |

---

## 2. SYSTEMIC PATTERNS — highest-leverage fixes

### P1. Surfaces hand-write plan names instead of importing `BILLING_PLAN_PRICING` / `PLAN_LABEL`

`packages/contracts/types/src/design-system/user-identity.ts:13-23` already exports a shared `PLAN_LABEL` built from the catalog. Five surfaces ignore it.
**Closes:** TRM-1 (mobile paywall `TIER_LABELS`), TRM-2 (desktop `ctaLabel: 'Upgrade to Max'`), SUB-5 (`/api/me` capitalizes the raw tier → "Max_15x"), MOB-6 (Chrome `formatManagedTierLabel` → "Max_15x plan" / "MAX_15X" badge), TRM-3 (`/pricing` titling two tier cards from `formatPrivacyModeLabel`), CAP-6 (image-gen 403 prose "Pro, Max, Team, and Enterprise").
**Fix:** one PR — delete every local label map, resolve through `getBillingPlanPricing(tier).label`, and add a lint/test asserting no file outside the catalog contains the literal `'Max 5x'`/`'Max 15x'`/`'Local Mode'`.

### P2. Marketing copy is hand-written against contracts it should derive from

Every false capability/limit claim in this audit is a hardcoded string sitting next to a machine-readable value that contradicts it.
**Closes:** MKT-1 (frontier), MKT-2 (50+ models), MKT-3 (Free "daily allowance"), PRC-3 (Team "contracted capacity"), PRC-4 (three support levels), CON-6 (three connector availability labels), CON-5 (actionCount vs tools.length), MOB-1 (store listings).
**Fix:** derive plan/feature/count strings from `BILLING_PLAN_CAPABILITY_TIERS`, `FREE_TRIAL_MODELS`, `models.json`, and `CONNECTOR_TOOLS`; extend `scripts/check-marketing-models.mjs` to fail when any marketing count exceeds its catalog source.

### P3. One blanket `SURFACE_STATUS = 'Coming soon'` constant contradicts five per-surface truths

`apps/web/lib/marketing-constants.ts:47-62` still says _"All six surfaces are pre-launch."_ Consumers have already begun bypassing it (`download/page.tsx:114` hardcodes `'Check Linux release'`).
**Closes:** MKT-4 (AGI Web), MKT-5 (Desktop availability, 4-way), MKT-8 (CLI changelog vs `/cli`).
**Fix:** replace the blanket constant with per-surface, per-platform values; add a test asserting no card renders `COMING_SOON_LABEL` while also rendering a working product `href`.

### P4. Desktop settings persist to Rust structs that have no field for them → silent reset on every launch

`loadSettings()` merges the Rust payload over in-code defaults and `set()`s over the correctly-rehydrated localStorage values.
**Closes:** SET-1 (appearance/accessibility), SET-2 (agent-execution safety), and is the same root cause behind SET-3/SET-4/SET-5 (persisted-but-unread).
**Fix:** add the missing `#[serde(default)]` fields to `WindowPreferences` and `ExecutionPreferences`, and make `loadSettings()` preserve hydrated values for keys the disk payload omits rather than falling back to `defaultSettings`.

### P5. Clients reimplement shared classifiers instead of importing `classifyManagedQuotaErrorCode`

**Closes:** USG-2 (`concurrent_turn_limit_reached` missing from `MANAGED_QUOTA_BLOCKS`), USG-4 (Chrome `bodyIndicatesFreeQuota` substring heuristic), CAP-4 (phantom `{kind:'paywall'}` 429 contract in 4 client implementations + a Rust fixture), CAP-1 (duplicate `toEnforceableLimit` dropping the `'custom'` arm).
**Fix:** one shared error-envelope contract; delete every private classifier; add a test asserting every `code:` literal emitted by `apps/web/app/api/**` is classifiable.

### P6. Pre-flight plan gating exists on 2 of 3 surfaces

Web/desktop/mobile each independently decide whether to gate before submit, and one always forgets.
**Closes:** SCH-3 (web Schedules page has no gate; desktop + mobile do), CAP-2 (API key issuance has no gate anywhere), CAP-3 (CLI onboarding), MOB-4 (Chrome pre-sign-in copy hides the Pro requirement), MKT-6 (`/api-docs`).
**Fix:** lift gating into a shared hook/module keyed on `canUseBillingPlanCapability` + `getPlan*` helpers.

### P7. Two live copies of the pricing i18n bundle, and the guard tests read the wrong one

`packages/ui/i18n/locales/*/pricing.json` (173 keys, runtime) vs `apps/web/app/i18n/locales/*/pricing.json` (112 keys, what `/pricing` actually loads). `apps/web/lib/__tests__/public-billing-copy.test.ts:136` polices the unshipped copy.
**Closes:** contributes to MKT-1, MKT-3, PRC-3, TRM-6.
**Fix:** collapse to one bundle; point every copy test at the bundle the page loads.

### P8. Desktop scheduler command layer is behind its own DB schema and UI

`migrations.rs:814-817` already has `schedule_type IN ('cron','interval','once')`, `run_at`, `interval_seconds`. `scheduler_add_job`/`scheduler_update_job` read only `cronExpression`.
**Closes:** SCH-1, SCH-6 (edit discards), SCH-7 (description/model dropped), SCH-8 (5-field cron placeholder).

---

## 3. FINDINGS BY CATEGORY

### A. Pricing, plans & billing copy

---

**PRC-1 · MEDIUM · Settings → Billing shows the USD monthly catalog price to every subscriber, including annual Pro and INR customers**

**Where / what conflicts**

- `apps/web/features/settings/sections/BillingSection.tsx:339-343` — renders `${planPricing.monthlyPriceUsd}/mo` unconditionally; the only outer guard is `!isFreeTier` (line 325), so it also renders for `canceled`/`past_due`/`unpaid`.
- `apps/web/app/api/me/route.ts:176-186` — builds `plan` as `{tier, display_name, status, current_period_end, subscription_source}`; **interval and currency are dropped server-side**. Mirrored at `apps/web/shared/stores/web-auth-store.ts:49-62`.
- `packages/contracts/types/src/billing-catalog.ts:86-92` — `pro: { monthlyPriceUsd: 20, yearlyPriceUsd: 200 }`.
- `apps/web/lib/regional-pricing.ts:26-31, 49-53` — India short-circuits ahead of Stripe currency options: `pro: 199_900`.
- Both divergent charge paths are live: annual Pro at `apps/web/app/pricing/page.tsx:235, 308, 321`.

**Source of truth:** Stripe. The pointer already persists — `subscriptions.stripe_price_id` (`apps/web/db/neon/0003_subscriptions.sql:6`) encodes interval and currency. This is a surfacing gap, not missing data. A ₹1,999/mo or $200/yr subscriber reads "$20/mo" on the one screen whose job is stating what they pay (annual **overstates**: $200/yr = $16.67/mo effective).

**Fix:** emit interval/currency/unit_amount on `/api/me`, extend `SubscriptionPlan`, render the actual charged amount and cadence. Hide the row rather than defaulting to the catalog when unknown.

---

**PRC-2 · MEDIUM · Refund policy sells "purchased usage add-ons"; desktop offers a "Buy a top-up" button; nothing can be bought**

**Where / what conflicts**

- `apps/web/app/refund-policy/page.tsx:47-51` — `<td>Purchased usage add-ons</td>` … _"Contact support about an unused, duplicate, or mistaken purchase."_ A repo-wide grep for "add-on"/"addon" across `apps/web/app`, `apps/web/features`, `packages/contracts` returns this page as the **only** product occurrence.
- `apps/desktop/src/features/v3/CapModal.tsx:103-114` — a live button `t('capModal.buyTopUp')` = **"Buy a top-up"** (`packages/ui/i18n/locales/en/v3.json:139`) inside a `role="dialog"` hard stop at 100% budget. Wired at `DesktopShellV3.tsx:755` → `apps/desktop/src/App.tsx:1911` `onBuyTopUp={() => openSettingsDialog('billing')}` — a billing dialog with no top-up purchase.
- `apps/web/shared/components/modals/CreditAlertModal.tsx:41` — _"No top-up purchases (locked product rule: no credit top-ups)"_; routes the same condition to Enterprise contact-sales.

**Source of truth — CORRECTED (finder had polarity inverted):** `docs/decisions/CURRENT_DECISIONS.md:96` (founder, **2026-07-11**) states _"Credit top-ups are enabled for paid tiers … this supersedes the prior no-top-ups policy."_ That post-dates the "no top-ups, ever" comments at `apps/web/shared/utils/validation-schemas.ts:174-176`. Meanwhile `docs/00-foundation/owner-decision-register.md:39` still lists D4 as **undecided**. Three governance sources disagree.

**Not a risk:** the webhook `credit_topup` branch (`apps/web/app/api/stripe-webhook/lib/handlers.ts:29`) is unreachable and hard-verifies PaymentIntent + amount (`lib/db.ts:80-112`). Dead code, not a credit-minting hole.

**Fix:** decide D4, then make all three agree. Minimum: remove the desktop "Buy a top-up" button or the refund-policy row.

---

**PRC-3 · MEDIUM · Team is marketed as "contracted capacity sized for your organization" while every enforcement path gives Team exactly Pro's numbers**

**Where / what conflicts**

- `packages/ui/i18n/locales/en/pricing.json:98` `"teamFeature1": "Managed usage sized for your organization"` → rendered `apps/web/app/pricing/page.tsx:564`.
- `packages/ui/i18n/locales/en/pricing.json:168` `"compareTeamUsage": "Contracted managed capacity"` → rendered `page.tsx:425`.
- `apps/web/lib/server/managed-usage-policy.ts:93` — `team: { monthlyUnits: 2_000, weeklyUnits: 500, fiveHourUnits: 100 }` — **byte-identical to `pro` at line 73**.
- `appsly/web/features/settings/sections/BillingSection.tsx:225` — the in-product badge already tells the truth: `if (tier === 'team') return 'Same usage as Pro';` (rendered at :277, :291).

**Verified:** no per-org/per-contract allowance override exists anywhere in `apps/web/lib` or `apps/web/db/neon`. Caps resolve purely from plan tier; `enterprise` is the only tier with `unlimited: true`.

**Scope narrowing:** Team's _product_ limits (25 projects / 25 MCP) are already published as identical to Pro (`apps/web/app/pricing/page.test.tsx:99` vs `:108`). The over-claim is confined to the managed-**usage** dimension.

**Also:** the guard test `apps/web/lib/__tests__/public-billing-copy.test.ts:136` ("presents Team as sales-assisted contracted capacity without a fictional seat price") reads `app/i18n/locales/*/pricing.json` — the **unshipped duplicate**. See P7.

**Fix:** either implement per-contract Team allowances or reword `teamFeature1`/`compareTeamUsage` to match the badge the customer sees after signing.

---

**PRC-4 · LOW · `/pricing` and `/sla` publish two different support levels for Basic**

**Where / what conflicts**

- `packages/ui/i18n/locales/en/pricing.json:127` `"basicFeature3": "Standard support"` (rendered `pricing/page.tsx:723`) vs `:134` `"proFeature3": "Email support"` (rendered `page.tsx:752`) — presents email support as a Pro upgrade over Basic.
- `apps/web/app/sla/page.tsx:79-81` — `<td>Basic and Pro</td><td>24 hours</td><td>Priority email</td>` — grants Basic the same target as Pro.

**CORRECTED — two claimed sides dropped:** `apps/desktop/src/constants/pricing.ts:145` ('Community support') is dead data (`PRICING_PLANS[].features` has no consumer; the only importer, `utils/featureGates.ts:1`, reads `plan.limits.*` only), and `apps/desktop/src/constants/planFeatures.ts:29` `emailSupport` has zero non-test call sites. This is a **two-page web copy** issue, not a four-surface one.

**Source of truth:** none exists — support level is absent from `BILLING_PLAN_CAPABILITY_TIERS`. And `/sla` **cannot** become one: `apps/web/app/sla/page.tsx:18-25` declares the whole page _"planned targets, not yet a binding contractual commitment."_

**Fix:** add a `supportTier` dimension to the catalog and derive both pages; or, cheapest, make the Basic bullet name the same channel the SLA row does.

---

**PRC-5 · MEDIUM · `past_due` subscriber is locked out of every upgrade path**

**Where / what conflicts**

- `apps/web/app/pricing/page.tsx:224-227` — `hasActivePaidPlan` requires status in `['active','trialing']`, so a `past_due` user gets `planRelationship() === 'upgrade'` and live checkout CTAs. Duplicated at `apps/web/features/billing/pages/BillingDashboard.tsx:127-128`.
- `apps/web/app/api/checkout/route.ts:156` — `activeStatuses = new Set(['active','trialing','past_due'])` → :194-197 throws 409 _"Use the in-app upgrade flow so payment proration and existing usage are carried safely."_
- `apps/web/app/api/upgrade/route.ts:90-93` — rejects anything outside `['active','trialing']`: _"No active subscription found. Use checkout to start a new subscription."_

**Source of truth — CORRECTED:** checkout's inclusion of `past_due` is **defensible, not the outlier**. `apps/web/lib/constants.ts:98` establishes the same convention, and `checkout/route.ts:129-131` documents the guard as duplicate-subscription/double-billing prevention. The falsifiable claim is the **409 message**, which names a flow the UI never shows a `past_due` user and which `/api/upgrade` explicitly rejects.

**Mitigation (why medium, not high):** `apps/web/app/api/portal/route.ts:304` explicitly admits `past_due`, and `/billing`'s "Manage billing" reaches it. Recovery exists — the error message just points the wrong way. Note `/billing` simultaneously renders "Past Due" + "Please update your payment method" (`features/billing/components/Billing/Subscription.tsx:94, 187`) next to checkout-routed CTAs.

**Fix:** re-point the 409 at `/api/portal`, and hide/redirect the pricing CTA during dunning.

---

**PRC-6 · MEDIUM · `cancel_at_period_end` is stored but never reaches any client; both web and desktop label the end date "Renews"**

**Where / what conflicts**

- `apps/web/app/api/stripe-webhook/lib/db.ts:774` — `cancel_at_period_end: subscription.cancel_at_period_end` (written at :858/:869, inserted at :580/:599/:612).
- `packages/contracts/cloud-contracts/src/me.ts:32-33` — `MePlanSchema` **has no such field**; `apps/web/app/api/me/route.ts:176-186` omits it.
- `apps/web/features/settings/sections/BillingSection.tsx:333` — `<Row label="Renews">` unconditionally.
- `apps/desktop/src/services/cloudAccountAuth.ts:252` — hardcodes `cancel_at_period_end: false`. Also `apps/web/features/billing/hooks/use-billing-queries.ts:215` declares `cancelAtPeriodEnd: boolean` then hardcodes `false` at :259.
- `apps/web/lib/entitlement.ts:17-21` — canonical policy: _"a subscription that is `active` with `cancel_at_period_end = true` is still fully entitled … Downgrade happens only when Stripe flips `status` to `canceled`."_

**CORRECTED:** desktop's label is **not "exactly inverted"** — `AccountSettings.tsx:89-90`'s `'Access ends'` branch fires on terminal `canceled`, where the date is correct (only the tense reads oddly). The single confirmed defect, identical on both surfaces: the will-lapse state (`active` + `cancel_at_period_end`) renders **"Renews"** on the date access actually ends. Cancellation runs through the Stripe portal, so this state genuinely arrives as `status: 'active'`.

**Fix:** add `cancel_at_period_end` (and `canceled_at`) to `MePlanSchema` + `/api/me`; label "Renews" only when false.

---

### B. Plan capabilities & entitlement gates

---

**CAP-1 · HIGH · Enterprise is sold "Custom" custom-MCP connectors and projects; a duplicate converter maps `'custom' → 0` and the API denies them**

**Where / what conflicts**

- `apps/web/app/pricing/page.tsx:141-145` — `if (limit === 'custom') return 'Custom';`, fed at :151 (`customMcp`) and used for the Enterprise row at :436. Public table shows Enterprise = **"Custom"** for both Custom MCP and Projects.
- `packages/contracts/types/src/billing-catalog.ts:351-359` — `enterprise: { projects: 'custom', customMcpServers: 'custom', … }`.
- `packages/contracts/types/src/billing-catalog.ts:368-381` — canonical converter, documented: `'custom' -> null (negotiated Enterprise contract…)`; `if (limit === 'unlimited' || limit === 'custom') return null;`
- `apps/web/lib/services/free-plan-entitlements.ts:5-8` — **duplicate** converter drops the `'custom'` arm: `if (limit === 'unlimited') return null; return typeof limit === 'number' ? limit : 0;` → Enterprise resolves to **0**.
- `apps/web/app/api/connectors/custom/route.ts:172-175` — `if (connectorLimit === 0) throw createError.validation(...)`. `SAFE_PLAN_LABELS` (free-plan-entitlements.ts:18-25) has no `enterprise` key, so the message is the generic _"Your current subscription does not allow custom connectors."_

**Blast radius (finder under-scoped):** also `apps/web/app/api/projects/route.ts:94-97` and `projects/sync/route.ts:125-128` (Enterprise cannot create **any** Managed Cloud Project), and `apps/web/app/api/llm/v1/chat/completions/route.ts:422` + `approve/route.ts:190` where `getCustomRemoteMcpLimit(...) ?? undefined` passes `0` through (the `??` only rescues `null`).

**Reachable:** `apps/web/db/neon/0030_allow_enterprise_subscription_tier.sql` added the tier explicitly because _"Stripe price mapping can resolve configured enterprise prices to plan_tier='enterprise'"_; `apps/web/lib/price-tier-mapping.ts:22-28, 59-65` maps it.

**Corroborating:** the same route's second gate at `connectors/custom/route.ts:205` is written correctly for `null`, proving `null` is the intended semantic. `free-plan-entitlements.test.ts:14-21` deliberately omits `enterprise` — nothing documents the deny as intentional.

**Fix:** delete the local `toEnforceableLimit`; re-export on top of `toEnforceableBillingPlanLimit`. Add `'enterprise'` to `SAFE_PLAN_LABELS`. Add `getCustomRemoteMcpLimit('enterprise') === null` to the catalog test.

---

**CAP-2 · MEDIUM · Any Free user can mint an inference API key from Settings with no plan gate; `/pricing` already told them "Managed API: No"**

**Where / what conflicts**

- `apps/web/app/pricing/page.tsx:156` — `apiAccess: canUseBillingPlanCapability(plan, 'managed_api') ? 'Yes' : 'No'`, rendered under the visible column header `['apiAccess','Managed API']` (:843, cell at :927).
- `packages/contracts/types/src/billing-catalog.ts:191, 205` — `PRO_TIERS = ['pro','max','max_15x','team','enterprise']`; `managed_api: PRO_TIERS`.
- `apps/web/app/api/settings/api-keys/route.ts:65-72` — `handleCreate` does rate limit, CSRF, Clerk auth, zod parse, a 20-key cap, then `ApiKeyService.createApiKey`. It never loads a subscription and never imports `canUseBillingPlanCapability`.
- `apps/web/features/settings/components/Settings/ApiKeys.tsx:114` — _"Generate your first API key to get started"_; the dialog renders every scope including `inference:write` — _"Run inference / Create chat completions and audio transcriptions"_ (`apps/web/lib/api-key-scopes.ts:16-20`) — with no plan note or disabled state. Panel mounted unconditionally at `apps/web/features/settings/pages/UserSettings.tsx:528`.
- Denial lands only at inference time: `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:63-64` — 403 `managed_api_plan_required`, _"Managed API access requires Pro or higher."_

**CORRECTED:** "every request 403s" overstates it — `apps/web/app/api/llm/v1/models/route.ts:112-135` authenticates the key for `models:read` with no `managed_api` check, so the key genuinely works there. The precise defect: **the dialog offers a "Run inference" scope to plans the catalog denies, and that scope 403s at first use.**

**Fix:** gate `inference:write` issuance on `canUseBillingPlanCapability(plan,'managed_api')` in `handleCreate`, **and** gate/annotate the panel at `UserSettings.tsx:528` — a server-only fix leaves the Settings card still advertising the capability.

---

**CAP-3 · MEDIUM · CLI onboarding says AGI cloud is "open to everyone"; the CLI is a Pro-only developer surface**

**Where / what conflicts**

- `apps/cli/src/onboarding.rs:228` — `"AGI cloud                        Sign in to get started — open to everyone",` inside `select_auth_provider()` (:223), whose sibling items state entitlement explicitly (`:245` — _"Usage included with Pro, Max, Team, Enterprise"_).
- `apps/cli/src/model_catalog.rs:629-634` — `can_access_model_for_tier` returns false for `Free | Basic | Byok`, doc comment: _"The CLI is a developer surface, which starts at Pro."_
- `apps/cli/README.md:228` — _"Managed Cloud on CLI is a Pro, Max 5x, Max 15x, Team, or Enterprise benefit… Free, Basic, expired, and unpaid accounts fail closed."_
- `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:56-59` — 403 `developer_surface_plan_required`; `services/api-gateway/src/middleware/planGate.ts:78` binds developer tokens to `developer_surfaces` = `PRO_TIERS` (`billing-catalog.ts:206`).

**CORRECTED:** the user _is_ given an explanation (the 403 body names the requirement and `upgrade_url`), and AGI cloud is **not** the default choice (`dialoguer::Select … .default(0)` = "Local model", `onboarding.rs:236, 354`). The real break is that the first-run picker `select_model_for_providers` (`onboarding.rs:499-556`) applies **no tier filter at all** — a Free user selects a managed model unblocked, then 403s on the first turn. Second defect: the runtime TUI picker labels locked rows `"sign in"` (`apps/cli/src/tui/widgets/model_picker.rs:486-488`), wrong for an already-signed-in Free user.

**Fix:** change `onboarding.rs:228` to match `README.md:228`; change the lock label to "upgrade".

---

**CAP-4 · MEDIUM · Four client implementations detect paywalls only on HTTP 429 with a top-level `{kind:'paywall'}` body that no server route has ever emitted**

**Where / what conflicts**

- Clients: `apps/extension-vscode/src/utils/api.ts:477-499` (streaming) **and** `:720-740` (non-streaming, missed by finder); `apps/extension-vscode/src/protocol/apiResponses.ts:30-37` (`PaywallPayloadSchema` zod for a payload never produced); `apps/mobile/services/api.ts:286-315` and `services/streaming.ts:336`; `packages/ai/provider-runtime/src/client/streamFromProvider.ts:71-77` (`detectPaywall`); `crates/agiworkforce-llm/tests/fixtures/http_errors.jsonl:3` (Rust fixture asserting the same shape).
- Server emits exactly two envelopes: 403 `{error:{message,type:'invalid_request_error',code:'developer_surface_plan_required'|'managed_api_plan_required'|'managed_chat_plan_required',requiredTier?}}` (`auth-gate.ts:49-83`) and 429/402 `{error:{message,type:'insufficient_quota',code}}` (`request-processor.ts:1055-1069, 1080-1095`). **Never a top-level `kind`.**
- `apps/web/.../request-processor.ts:1817` even documents the phantom contract to future maintainers.

**CORRECTED impact per surface:**

- **Mobile is not affected by `developer_surfaces`** (`free-chat-surface-policy.ts:131-134` maps `mobile → managed_chat`). Its real defect: the free-trial 429 reaches `api.ts:308-314` where `parsed?.error` is an **object**, so the user sees _"Too many requests right now. Please wait a moment and try again."_ instead of _"You have reached the current free usage limit. Upgrade your plan…"_ — a quota exhaustion rendered as a transient throttle.
- **VS Code sidebar chat is partly mitigated** (`modelConstants.ts:112-117` → `ChatStateManager.ts:1798-1810` client-side pre-gate; but its lock hint at `modelConstants.ts:103` says _"Sign in or add a provider key"_, wrong for a plan gate). Ungated paths are worse: inline completions (`inlineCompletionProvider.ts:233-267`) swallow the 403 and `return []` **silently**; `runInlineCommand.ts:45`'s `isCredentialFailure()` substring-matches `'403'` and shows _"AGI Workforce error: API error 403: {...}"_ with a **"Set API Key"** button — steering a plan-gated user to change working credentials.

**Fix:** teach both clients the real envelopes; delete `PaywallPayloadSchema`, `detectPaywall`, and the Rust fixture.

---

**CAP-5 · MEDIUM · The Free-plan feature list is duplicated on web and mobile with a "mirrors web" comment, and the lists differ by three bullets — one of which the server denies**

**Where / what conflicts**

- `apps/web/features/settings/sections/BillingSection.tsx:56-64` — 8 bullets incl. `'Create files and execute code'` (:62), `'Connect local models via Ollama or LM Studio'`, `'Bring your own supported API keys'`. Rendered under `{isFreeTier && (` at :296/:307; mounted at `WebSettingsModal.tsx:511`.
- `apps/mobile/src/features/settings/cloud-billing/index.tsx:49-56` — `// Free-tier feature bullets — mirrors web BillingSection`, 5 bullets. Rendered under `{isFreeTier && (` at :255-257.
- `packages/contracts/types/src/billing-catalog.ts:297-305` — free: `maxSandboxes: 0` (:301), `sandboxTtlMs: 0` (:302). `apps/web/lib/e2b/runtime.ts:371-382` fails closed: _"[e2b] plan does not include managed sandboxes; refusing (fail-closed)"_, consumed by `tool-loop.ts:65`.

**CORRECTED scope:** only **one** of web's three extras is provably contradicted — `'Create files and execute code'`. Local models and BYOK are separate trust boundaries and are not denied by cloud tier; mobile's omission of those two is a mobile-platform truth, not evidence web is wrong. Also `getBillingPlanDisplay` (`apps/web/features/billing/lib/plan-display.ts:36`) emits _limit_ strings, not capability copy — routing both lists through it would change what Billing says, not merely dedupe. Third, non-conflicting description exists at `apps/web/app/i18n/locales/en/pricing.json:62-64`.

**Fix:** one shared copy constant cross-checked against the catalog; drop or qualify the code-execution bullet on Free.

---

**CAP-6 · LOW · Image-generation 403 prose omits Max 15x and names a plan ("Max") that does not exist**

**Where / what conflicts**

- `apps/web/app/api/media/image/generate/route.ts:673` — _"Image generation is available on Pro, Max, Team, and Enterprise plans."_
- Same response object, `:677` — `required_plans: ['pro','max','max_15x','team','enterprise']`.
- `packages/contracts/types/src/billing-catalog.ts:191, 203` — `PRO_TIERS` = those five; `image_generation: PRO_TIERS`. `:95` — the canonical label is **`'Max 5x'`**; no catalog plan is labeled bare "Max".
- Sibling route proves the convention: `apps/web/app/api/media/video/generate/route.ts:452, 456` — _"Video generation is available on Max 15x and Enterprise plans"_ with matching `required_plans`.

**CORRECTED observers:** a max*15x subscriber can **never** see this (they pass the gate). The observers are free/basic users — and observability is **higher** than assumed, because `apps/web/features/chat/pages/WebChatPage.tsx:1199-1202` classifies via `raw.includes('403') || raw.includes('plan_upgrade_required') || raw.includes('subscription_required')` against `err.message` only; none of those substrings appear in this prose, so `isPaywall` is false and `:1212` renders the server string **verbatim in the chat transcript** instead of the InlinePaywallCard. (The video path at `:1621` uses the correct `err instanceof MediaGenerationApiError && err.isPaywall` check — a separate divergence worth filing.)
Third phrasing of the same gate, accurate: `ChatComposerNew.tsx:1230, 2166` — *"Image generation is available on Pro and above."\_

**Fix:** derive the sentence from `BILLING_PLAN_CAPABILITY_TIERS` + catalog labels; fix the client-side paywall classification to read `error.code`.

---

**CAP-7 · MEDIUM · Mobile allows mid-thread cross-provider switching for every tier; the contract, web, desktop and VS Code gate it at Max**

**Where / what conflicts**

- `packages/contracts/types/src/design-system/user-identity.ts:62-64` — `canSwitchProviderInThread` returns true only for `max | max_15x | enterprise`; pinned by `packages/contracts/types/src/__tests__/user-identity.test.ts:42-46` (pro and team → false).
- `packages/ui/unified-chat/src/stores/tierStore.ts:44, 70` (web/desktop) and `apps/extension-vscode/src/integrations/providerSwitchGuard.ts:121` (wired at `core/commandSetup.ts:594`) both enforce it. `packages/ui/unified-chat/src/components/MaxUpgradePrompt.tsx:57-60` tells a Pro user _"Max unlocks multi-provider chat … available on Max and above."_
- `apps/mobile/app/(app)/chat/[id].tsx:574-602` (`handleModelSelect`) — with messages already in the thread it only intercepts a **local↔cloud execution-mode** change, otherwise calls `setModel(newModelId)`. **No provider comparison anywhere in the path.**

**CORRECTED mechanism:** `apps/mobile/src/features/model-picker/tierGuard.ts:97` (`PROVIDER_SWITCH_MIN_TIER = 'pro'`) is **dead code** — only the barrel export and two test files reference `guardProviderSwitch`. So mobile is _more_ permissive than claimed: the switch is ungated for **every** tier. `apps/mobile/__tests__/tier-guard.test.ts:89` pins the drifted (unreachable) behaviour against the contract test.

**Fix:** call `canSwitchProviderInThread` from `handleModelSelect`; delete or wire `tierGuard.ts`; update the mobile test.

---

### C. Usage limits, quotas & error classification

---

**USG-1 · MEDIUM · The Free allowance is sold as "daily"; enforcement is rolling 5-hour / rolling 7-day / account-month, and the daily window was deliberately deleted**
_(merged: pricing-marketing + usage-limits)_

**Where / what conflicts**

- Rendered copy: `apps/web/app/i18n/locales/en/pricing.json:61` `"freeTierBody"` (rendered `apps/web/app/pricing/page.tsx:683`) and `:101` `"compareFreeUsage": "Small daily allowance"` (rendered `page.tsx:378`). Also `:56 "individualLede"` — _"a light daily trial"_. Duplicated at `packages/ui/i18n/locales/en/pricing.json:119, 157` and translated into 11 further locales. Rendered DOM captured in `apps/web/reports/a11y-report.json:38253, 33431`.
- `packages/contracts/types/src/managed-usage-balance.ts:5` — _"When the active allowance resets. **Free uses its rolling daily window.**"_ — a comment directly contradicting the field it documents.
- `apps/web/lib/services/free-trial-service.ts:24-31` — `FREE_TRIAL_INTERNAL_USAGE_POLICY` declares only `fiveHourWindowHours: 5`, `weeklyWindowHours: 7*24`, and a monthly budget. `FREE_USAGE_SNAPSHOT_SQL:76-129` filters only on rolling intervals + an account anniversary. `getFreeTrialPublicUsage:306` returns `resetAt = account_period_end`.
- **Smoking gun:** `apps/web/db/neon/0067_free_rolling_usage_windows.sql:1-7` — _"Founder decision 2026-07-22: remove the rolling 24-hour cap… Free may use 5 units per rolling 5 hours, 15 per rolling 7 days, and 20 per account-anniversary month."_ Lines 17-25 re-comment the `daily_*` columns as legacy.
- `apps/web/lib/server/managed-usage-policy.ts:64` — `free: { … dailyUnits: 0 … }` (this is the _paid cents_ ledger; see :62-63).

**User-visible:** `resetAt` flows to the paywall reset label (`packages/ui/unified-chat/src/components/MessageLimitCard.tsx:80-107`; `ChatMessageList.tsx:520-522`), so an exhausted Free user is shown a reset date **weeks out** while the pricing page promised a daily refill. At 5 units/session against a 20-unit month, the copy overstates cadence by ~an order of magnitude.

**CORRECTED:** `getPlanDailyUsageUnits` does have callers — tests at `managed-usage-policy.test.ts:47-48` and `free-trial-service.test.ts:75`, both titled to assert **no daily cap**. The tests are correct; the copy is stale.

**Fix:** reword both bundles + all locales; fix the `managed-usage-balance.ts:5` comment; delete `dailyUnits`/`getPlanDailyUsageUnits`.

---

**USG-2 · MEDIUM · `concurrent_turn_limit_reached` is emitted by the server and classified by nothing**

**Where / what conflicts**

- `apps/web/app/api/llm/v1/chat/completions/route.ts:778` — `code: 'concurrent_turn_limit_reached'` in a 429 from `managedTurnSlotExhaustedResponse()`, reached at :852/:867. Repo-wide grep: **this is the only occurrence of the literal.**
- `packages/contracts/types/src/billing-catalog.ts:441` — _"This is the single classifier both the free-trial and paid paths use."_ `MANAGED_QUOTA_BLOCKS` (:469-576) has no such key, so `classifyManagedQuotaErrorCode` (:585-590) returns null.
- Consumers fall through to the generic branch: `apps/web/lib/hooks/useChatStream.ts:2769` → :2806; `packages/ui/unified-chat/src/hooks/useChat.ts:793` → :821.

**CORRECTED impact:** the user _does_ see the server's message (`getVisibleErrorMessage` → `error.message`), rendered as _"Error: Your plan allows N response(s) at a time…"_. The real gap is **presentation inconsistency**: no `metadata.paywall` card, no upgrade CTA, no reset slot — while a structurally identical `rate_limit_exceeded` gets a styled limit card. Trigger requires a concurrently streaming turn (not "the second message"), and `apps/web/lib/rate-limit.ts:1023-1090` fails **open** without Redis.

**Fix:** add the key to `MANAGED_QUOTA_BLOCKS`; add a test asserting every server `code:` literal is classifiable.

---

**USG-3 · MEDIUM · Concurrency refusal tells max_15x and team subscribers "Upgrading raises this limit" when there is nothing to buy**

**Where / what conflicts**

- `apps/web/app/api/llm/v1/chat/completions/route.ts:775` — appends _"Upgrading raises this limit."_ gated **solely** on `limit > 0`.
- `packages/contracts/types/src/billing-catalog.ts:40-42, 47` — `hasSelfServeUpgradePath` returns false for max*15x/team/enterprise; doc: *"Offering \"Upgrade\" to someone already on the highest plan reads as a billing error… Shared rather than inlined per surface so web, desktop and mobile cannot drift."\_
- Self-contradiction: `apps/web/features/chat/pages/WebChatPage.tsx:2822-2824` already hides the Upgrade menu item behind `hasSelfServeUpgradePath` for exactly this reason.

**CORRECTED tiers:** **max_15x AND team**, not max_15x alone. team's `maxConcurrentTurns: 4` (`billing-catalog.ts:344`) makes it materially more reachable, and team is sales-assisted (excluded from `SELF_SERVE_PAID_PLAN_TIERS`, :19-23) so the sentence points at a checkout that does not exist for them. **enterprise is unaffected** (`maxConcurrentTurns: 'custom'` → null → `rate-limit.ts:1031-1032` admits). The `limit === 0` branch (:776) is for unknown tiers and is correct.

**Fix:** thread `plan_tier` (already in scope at :861) into `managedTurnSlotExhaustedResponse` — `ManagedTurnSlotResult` (`apps/web/lib/rate-limit.ts:1029-1064`) carries no tier — and gate the sentence on `hasSelfServeUpgradePath`.

---

**USG-4 · MEDIUM · Chrome renders a rolling-cap 429 as "receiving too many requests" and a credit exhaustion 402 as a service outage**

**Where / what conflicts**

- `apps/extension/src/features/cloud-bridge/freeTrialClient.ts:724-731` — `bodyIndicatesFreeQuota` matches only `free_trial_token_budget_reached`, `insufficient_quota`, `quota_exceeded`.
- `:921-927` — everything else on 429 becomes `code: 'rate_limited'`, _"AGI Cloud is receiving too many requests. Try again shortly."_
- `apps/web/lib/services/managed-usage-request-service.ts:148-165` — returns 429 `rolling_five_hour_limit_reached` with _"Your rolling 5-hour usage limit is reached. Wait for earlier usage to leave the window or upgrade for a higher limit."_ Serialized with `type: 'invalid_request_error'`, so none of the three substrings match.
- `packages/contracts/types/src/billing-catalog.ts:518-525` classifies it as `kind:'rolling_window'`, `showUpgradeCta: true`; the shared classifier is at `:585-590`.
- Rendered: `background.ts:5175-5180` only converts `quota_exceeded`; everything else forwards raw to `side_panel.ts:8999`.

**Worse than reported:** `insufficient_credits` and `monthly_limit_exceeded` are **402**, outside the `401||403||429` branch entirely, so they fall to `freeTrialClient.ts:955-959` → _"AGI Cloud is temporarily unavailable (402)."_ — billing exhaustion presented to a paying user as an outage.
**Self-inconsistent:** the SSE parsers 120 lines above (`:603`, `:648-657`) already do `code.includes('limit_reached')` correctly.

**Fix:** replace `bodyIndicatesFreeQuota` with `classifyManagedQuotaErrorCode`, parsing `error.code`; handle 402.

---

**USG-5 · MEDIUM · Chrome's "Cloud usage" meter shows only the billing-period percentage, hiding the rolling windows that actually refuse the turn**

**Where / what conflicts**

- `apps/extension/src/side_panel.ts:6698-6707` — `Cloud usage: ${usage}${resetLabel}` built from `access.usagePercentage` alone.
- `apps/extension/src/features/cloud-bridge/freeTrialClient.ts:212-216` — parses the **full** contract (`packages/contracts/types/src/managed-usage-balance.ts:73-104` returns session/weekly/flagship percentages) and projects only `usage_percentage`.
- `apps/web/lib/hooks/useManagedUsageSummary.ts:68-79` states the rule and takes `Math.max` of all four; web consumes it (`WebChatPage.tsx:811`, `UsageSection.tsx:72`) and mobile renders separate bars (`cloud-usage/index.tsx:329, 366, 380`).
- Enforcement is real on this surface: the extension itself classifies `rolling_*_limit_reached` at `freeTrialClient.ts:603, 655`.

**Worse than reported:** `freeTrialClient.ts:215` _does_ project `hasUsageRemaining` (server-reconciled at `managed-usage-summary-service.ts:70-75`), but `side_panel.ts` **never reads it** — grep returns only `:96` and `:215`. Ratio makes this likely, not theoretical: pro is `monthlyUnits: 2_000` vs `fiveHourUnits: 100` (`managed-usage-policy.ts:71-77`), a 20× gap. **Scope:** paid users only (the label sits behind the `developer_surfaces` check).

**Fix:** carry all four percentages through `ManagedModelAccess` and display the max; at minimum consume `hasUsageRemaining`.

---

### D. Marketing & availability claims

---

**MKT-1 · HIGH · `/pricing` sells the Free plan as "frontier model access"; Free is restricted to two economy minis and the server says so in plain words**
_(merged: pricing-marketing + plan-capabilities)_

**Where / what conflicts**

- `apps/web/app/i18n/locales/en/pricing.json:61` — `"freeTierBody": "A small free daily allowance to try AGI Cloud with frontier models, no credit card required."` and `:62` — `"freeFeature1": "Frontier model access to try AGI Cloud"`. Rendered at `apps/web/app/pricing/page.tsx:683` and `:687` inside the Free card (`:677-701`). Spanish equivalent at `es/pricing.json:61-62` ("modelos de frontera"); duplicated at `packages/ui/i18n/locales/en/pricing.json:119-120`.
- `apps/web/lib/free-trial-config.ts:23-26` — `FREE_TRIAL_MODELS = getAllowedModelsForTier('economy').filter(m => tierPolicy.minTier === 'free')` → resolves to exactly **`gpt-5.4-mini` and `gemini-3.5-flash-lite`** (asserted `free-trial-config.test.ts:33-39`).
- `packages/contracts/types/src/models.json:1944` — `"flagship_additions": ["gpt-5.6-sol","claude-fable-5","claude-opus-5","grok-4.5"]`, all `tierPolicy.minTier = "max"`. `:1927` — the economy roster.
- **Server states the opposite of the ad:** `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1466-1480` — 403 `free_trial_model_only`, _"Free managed cloud access currently supports Auto Economy only. Select Auto Economy, upgrade your plan, or use local/BYOK."_
- Client snaps the selection back: `apps/web/features/chat/pages/WebChatPage.tsx:461-477`; the composer renders flagships locked with an Upgrade link (`ComposerFooter.tsx:280-298`).

**CORRECTED:** `packages/contracts/types/src/model-catalog.ts:1462` (`if (tier === 'free') return false;`) is **not** the gate Free chat runs through — `request-processor.ts:1461` bypasses it for free-trial requests. Free is denied every model _above Economy_, not every model. Auto Economy does not escalate (`model-catalog.ts:1677-1700`).
**Secondary drift found:** `services/api-gateway/src/routes/llm.ts:269` admits Free to the **entire** economy roster (incl. `gpt-5.6-luna`, `gemini-3.6-flash`, `qwen-3.5-flash`, all `minTier: 'basic'`) — broader than the web app's two-model Free roster. Two surfaces disagree on the Free roster itself.
**Caveat:** "frontier" is not a defined product term (the picker's word is `flagship`, `modelStore.ts:46,74`), and nothing on `/pricing` discloses model access is tier-gated at all (`compare*Usage` rows differ only on capacity) — which is what makes the bullet materially misleading rather than merely loose.

**Fix:** rewrite `freeTierBody`/`freeFeature1` in **both** bundles and both locales to name the actual models; add a test deriving the Free model claim from `FREE_TRIAL_MODELS`. Separately reconcile the gateway's Free roster with the web app's.

---

**MKT-2 · HIGH · "50+ models" on six public pages; the canonical catalog contains 31**

**Where / what conflicts**

- `apps/web/lib/marketing-constants.ts:186-188` — `// The generated catalog currently contains 56 compatibility models.` / `models: { count: 50, display: '50+', label: 'Models' }`.
- `packages/contracts/types/src/models.json` — the `models` map holds **31** entries (verified by parsing). `packages/ai/model-registry/generated/registry.json` independently agrees at 31 (models/routes/capabilities/pricing/limits/benchmarks all 31).
- **Six render sites** (finder said five): `apps/web/app/providers/page.tsx:132`, `apps/web/app/byok/page.tsx:133`, `apps/web/app/business/page.tsx:85`, `apps/web/app/help/page.tsx:67`, `apps/web/app/features/ai-chat/page.tsx:62`, `apps/web/features/marketing/components/LandingSections.tsx:82` (homepage stat tile).
- Most generous defensible count: 31 catalog ids + 18 distinct legacy `canonicalization` keys = **49**, still under the advertised floor. The "56" comment is unsupported by any artifact.
- **CORRECTED:** it does **not** appear in page titles — grep over `apps/web` shows no `50+` or `MARKETING.models` in any metadata/title export.

**Related, not filed:** `marketing-constants.ts:181-183` carries `skills: 150+` justified by a hand count of 168, with the comment admitting no canonical skill registry exists.

**Fix:** derive from `Object.keys(modelsCatalogJson.models).length` (or a conservative floor); delete the 56-model comment; extend `scripts/check-marketing-models.mjs` to fail when `MARKETING.models.count` exceeds catalog size.

---

**MKT-3 · MEDIUM · AGI Web is stamped "Coming soon" on the homepage and `/download` while the same pages say it is available and link into the live product**
_(merged: pricing-marketing + marketing-claims + flags-gates)_

**Where / what conflicts**

- `apps/web/lib/marketing-constants.ts:53, 56` — `COMING_SOON_LABEL = 'Coming soon'`; `web: COMING_SOON_LABEL`, under a comment (`:48-52`) still reading _"All six surfaces are pre-launch."_
- **Rendered as visible text:** `apps/web/features/marketing/components/FlagshipSections.tsx:282` — `<span className="agi-fl-surface-status">{item.status}</span>`, in a card whose title is a live `<Link href={item.href}>` (:269). Styled amber uppercase at `apps/web/app/globals.css:4715-4717`.
- **Self-contradiction on `/download`:** `:37` _"AGI Web is available in the browser."_; `:80` lede _"unavailable products do not receive download controls"_; `:94` `status: SURFACE_STATUS.web`; `:95` `href: WEB_CHAT_ENTRY_HREF`; `:216-221` FinalCta _"AGI Web is available now."_ / CTA "Use AGI Web".
- **Homepage:** `apps/web/app/page.tsx:70-73` primary CTA `{ href: WEB_CHAT_ENTRY_HREF, label: 'Try AGI Web' }`; `:116` _"Your account and managed cloud live here"_; `:125` the Coming soon status; `:337-339` _"Try the web app now."_
- `apps/web/app/get-started/layout.tsx:5` — _"AGI Web works today in the browser."_
- Target is real: `apps/web/app/chat/page.tsx` ships; `apps/web/proxy.ts:142-149` protects `/chat(.*)` behind auth, not a waitlist. `apps/web/app/pricing/page.tsx:46-50` defaults checkout open; `apps/web/lib/managed-compute-gate.ts:28-35` confirms managed compute open by default.

**Direction of error:** understatement — no payment is mis-charged and the links work. Conversion suppression + brand incoherence.

**Fix:** set `SURFACE_STATUS.web` to a live label; fix the `:48-52` comment; add a test asserting no card renders `COMING_SOON_LABEL` alongside a working product `href`.

---

**MKT-4 · MEDIUM · Desktop availability is stated four different ways across five pages**
_(merged: marketing-claims ×2 + flags-gates)_

**Where / what conflicts**

- **"Coming soon", all three platforms:** `apps/web/lib/marketing-constants.ts:57` `desktop: COMING_SOON_LABEL` → rendered `apps/web/app/page.tsx:107-108` with `platforms: 'macOS · Windows · Linux'`; and `apps/web/shared/components/layout/Header.tsx:48` `{ href: '/desktop', label: 'AGI Desktop', hint: COMING_SOON_LABEL }` on **every page**.
- **Unqualified 3-platform claim (strongest side):** `apps/web/app/docs/page.tsx:105` — _"Native app for macOS, Windows, and Linux."_ with `cta: 'AGI.app'` (:106) — while the sibling Mobile/Chrome/VS Code cards in the same array use `cta: COMING_SOON_LABEL` (:119, :144, :159).
- **Linux ships, macOS/Windows don't:** `apps/web/app/download/page.tsx:38-39, 113-114` (`status: 'Check Linux release'`, bypassing the constant); `apps/web/app/desktop/page.tsx:17-18, 169-170, 177`; `apps/web/app/download/DesktopDownloadAvailability.tsx:140, 203-206, 223-231`; `apps/web/app/download/layout.tsx:6`.
- **Future tense, nothing published:** `apps/web/app/security/page.tsx:58` — _"Desktop installers are launch-gated. When public builds ship, they will be published…"_; `apps/web/app/get-started/page.tsx:39` — _"Coming soon for macOS, Windows, and Linux"_.
- `.github/workflows/release-desktop.yml:396-439` confirms the signed AppImage + `.sig` updater pair is a real published artifact.

**CORRECTED:** `/download`'s **own** metadata (`download/page.tsx:17`, `layout.tsx:6`) and hero assert the downloadable AppImage unconditionally, so it overstates in the empty/error states just as `/security` understates in the available state. The download **button** itself is honest (`DesktopDownloadAvailability.tsx:223` gated on `isSignedLinuxManifest`, falls back at :241). Also: `apps/web/app/api/download/route.ts:116, 206-210` **does** have a Windows path — it 503s when unconfigured, so "not published" is operational, not a code-level absence. `/desktop`'s absolute "macOS installers are not published" is itself slightly contradicted by the conditional "Download AGI Cloud for macOS" at `DesktopDownloadAvailability.tsx:160-173` (a different product — the cloud-only Electron shell).

**Fix:** make the status platform-qualified and derive `Header.tsx:48` and the homepage card from the same value `/download` and `/desktop` use.

---

**MKT-5 · MEDIUM · `/api-docs` publishes a copy-paste quick start with no plan requirement and a false BYOK claim**

**Where / what conflicts**

- `apps/web/app/api-docs/page.tsx:9` (metadata) _"OpenAI-compatible endpoints, BYOK across providers."_; `:21` _"Bring your own key, route to any of the wired providers"_; `:32` a runnable `curl https://agiworkforce.com/api/llm/v1/chat/completions` with `Bearer $YOUR_KEY`. No plan condition anywhere on the page.
- `apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts:8-13` — the documented endpoint _"delegat[es] server-managed credentials… it never accepts BYOK credentials."_ It bills managed cloud credits, and the `byok` tier is denied `managed_api` by the catalog.
- `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:41-66` — any `sk_live_`/`sk_test_` caller is surface `api` → capability `managed_api` → 403 `managed_api_plan_required`, requiredTier `pro`. Asserted at `__tests__/auth-gate-free-surfaces.test.ts:91`.
- `packages/contracts/types/src/billing-catalog.ts:205` — `managed_api: PRO_TIERS`.
- API-key minting is not plan-gated (see CAP-2), so a Free user really can mint a key, copy the curl, and 403 on the first request.

**CORRECTED — strongest conflict is the BYOK claim**, not the missing tier label: the page markets a managed, Pro-only, credit-billed endpoint as a BYOK endpoint, blurring the Local/BYOK/Managed trust boundary in user-facing copy. The rest of the site is already correct (`apps/web/app/pricing/page.tsx:156` derives "Managed API: Yes/No" from the catalog; the local-only/byok rows say _"No managed access"_ / _"Your provider API"_ at :351, :368).
**Extra:** the published curl also fails for **Enterprise** if sent with a Clerk session token and no `x-agi-surface` header (`free-chat-surface-policy.ts:86, 107-108` → `managed_cloud_surface_unknown`, asserted at `auth-gate-free-surfaces.test.ts:105-115`).

**Fix:** add a prerequisite block derived from `BILLING_PLAN_CAPABILITY_TIERS.managed_api`; remove or correct the BYOK sentences.

---

**MKT-6 · MEDIUM · Changelog says "CLI v1.0 · live" on five platforms with an auto-generated Homebrew tap; `/cli` and `/download` say the binary is not distributed**

**Where / what conflicts**

- `apps/web/app/changelog/page.tsx:46-48` — `headline: 'CLI v1.0 · live'`, _"Pure Rust binary on five platforms. GitHub Release, Homebrew tap auto-generated, install.sh tested."_ Rendered into the "Releases, newest first" ledger at :98-119. The page's own lede (:85-90) says _"We do not backdate, we do not pre-announce."_
- `apps/web/app/cli/page.tsx:199-206` — renders `{COMING_SOON_LABEL}` above _"The agi binary isn't distributed yet. It ships alongside Desktop, Mobile, and the extensions at public launch."_
- `apps/web/app/download/page.tsx:135-147` — AGI CLI card, `platforms: 'macOS · Linux'`, `status: SURFACE_STATUS.cli` (= "Coming soon").
- `apps/web/lib/marketing-constants.ts:59` — `cli: COMING_SOON_LABEL`.

**CORRECTED sub-claims:** the platform count is 3 OSes / **6** OS-arch targets (`.github/workflows/release-cli.yml:110-138`, incl. `win32-arm64` at :133) — but "five platforms" is too ambiguous to carry the finding. The sharper inaccuracy is **"Homebrew tap auto-generated"**: `release-cli.yml` contains **no Homebrew step**; the tap is updated by a manual operator script (`scripts/update-homebrew-tap.sh`, per `scripts/homebrew/agiworkforce.rb:4`) against a clone at `$HOMEBREW_TAP_DIR`.
**Not fictional:** tag `v-cli-1.0.0` exists, `release-cli.yml:344-363` does create a GitHub Release, and `README.md:358` independently claims distribution via Releases/Homebrew/`cargo install`. The drift is engineering-facing docs vs the marketing surface.

**Fix:** pick one. Either move the row to "Forthcoming", or update `SURFACE_STATUS.cli`, `/cli`, `/download` **and** `README.md:358` together. Fix the Homebrew sentence either way.

---

**MKT-7 · MEDIUM · `/byok` advertises Mistral AI and Groq "straight from the catalog"; both were deliberately removed from the catalog**

**Where / what conflicts**

- `apps/web/app/byok/page.tsx:27-28` — `'Mistral AI'`, `'Groq'` chips; `:129` heading _"BYOK providers, straight from the catalog."_; `:132-134` _"BYOK on Desktop and the CLI covers the providers below, the same catalog that powers AGI's {50+} models."_
- `packages/contracts/types/src/provider.ts:67-84` — the canonical `Provider` union has 18 members; neither is one. `packages/contracts/types/src/models.json` `providers` map has 19 keys; neither appears.
- **Removal was deliberate and is pinned:** `packages/contracts/types/src/__tests__/model-catalog.test.ts:645-671` — _"R26: groq + mistral provider removal — retired IDs redirect via canonicalization"_, asserting `mistral-large-3 → claude-sonnet-5` and `groq-llama-3.3-70b → gemini-3.5-flash-lite`.
- `apps/desktop/src/features/settings/tabs/ModelsKeys/index.tsx:36-48` — 11 key-entry rows, neither present (and the row type is keyed to `Provider`, so it cannot be).
- `apps/web/app/providers/page.tsx:27-88` — the linked "See Provider Details" page also lists neither.
- `apps/web/features/marketing/components/RouteFlow.tsx:19` — `{ name: 'Mistral', slug: 'mistral' }` renders a real Mistral wordmark (`ProviderLogo.tsx:31`) in the **homepage** routing diagram (`app/page.tsx:11, 84`).

**CORRECTED:** `apps/web/lib/byok-providers.ts` is **not** the counterpart list — its own docblock (:1-22) says it is a server-key presence check for `apps/web` only, and it omits NVIDIA NIM which Desktop genuinely supports. Cite `provider.ts:67-84` + `models.json` + the R26 test instead.
**Partial CLI support exists:** `apps/cli/src/models/provider_dispatch.rs:446` `register_custom_providers` loads arbitrary `[providers.<name>]` blocks; the RESERVED allowlist (:447-483) contains neither, so both register as generic OpenAI-compatible endpoints (documented at `apps/cli/README.md:62-72` with a literal `[providers.groq]` example). That still contradicts "straight from the catalog" — no catalog models, pricing, or cost data — and is zero on Desktop.
**Bonus stale claim:** `apps/cli/README.md:75-78` lists `mistral` among "pre-registered" providers with a native handler; `provider_dispatch.rs:447-483` has no such entry and `:380-394` no such handler.

**Fix:** remove both chips (2 of 13) and the RouteFlow Mistral node, or build both lists from `Provider`. Fix the CLI README's pre-registered list.

---

**MKT-8 · MEDIUM · `/cli` documents an `agi cloud` subcommand that a CLI test explicitly forbids, and calls the same surface both "public alpha" and "beta" in one card**

**Where / what conflicts**

- `apps/web/app/cli/page.tsx:189` — bullet _"agi cloud reports beta status and the model catalog only"_, rendered as plain `<li>` text by `FlagshipSections.tsx:341-345`. Sibling bullets in the same card are real invocations (`agi auth-status`, `/privacy-mode`, `/continue-with-byok` — all registered in `apps/cli/src/command_registry.rs:473-475`), so it reads as a command name.
- `apps/cli/src/lib.rs:526-676` — the clap `Command` enum has **no `Cloud` variant**. `agi cloud` would fail to parse.
- `apps/cli/src/lib.rs:3597-3605` — `cli_does_not_advertise_an_unimplemented_cloud_task_surface`: `!subcommands.iter().any(|command| command == "cloud"),` / _"managed execution uses the normal model/session path; an unwired cloud task command must not be exposed"_.
- `apps/cli/README.md:224-226` — _"there is no separate cloud-task command."_
- **Same card, two launch stages:** `:185` "Managed compute, public alpha.", `:186` "Cloud execution is public alpha", `:188` "Public alpha — sign in and start, no waitlist", `:189` "reports **beta** status".

**CORRECTED:** the test is at **3604/3605** (fn at 3597), not 3601/3602. The parse-error scenario is **latent** — `apps/web/app/cli/page.tsx:201-206` says the binary isn't distributed yet — so the live defect today is the alpha/beta drift.

**Fix:** replace the bullet with _"Managed models run through the normal model/session path after an explicit handoff"_, matching `README.md:224-226`.

---

**MKT-9 · MEDIUM · `/press` and `/faq` say Team & Enterprise are waitlisted; `/waitlist` and `/pricing` say Team is live**

**Where / what conflicts**

- `apps/web/app/press/page.tsx:28` (QUICK*FACTS — the paste-verbatim journalist sheet) — *"Team & Enterprise are waitlisted."\_
- `apps/web/app/faq/page.tsx:35` — _"Team & Enterprise (org seats, SSO, admin controls) are the only waitlisted tiers."_
- `apps/web/app/waitlist/page.tsx:54` (and SEO description at :10) — _"Team is already live at /pricing"_.
- `apps/web/app/pricing/page.tsx:545-583` — live Team tier, `{t('custom')}` + `salesAssistedPricingSub`, CTA `<Link href="/contact-sales?plan=team">` — a real purchase path, **no waitlist gate**.

**CORRECTED:** drop `apps/web/lib/marketing-constants.ts:161` (`waitlist: false`) as evidence — `MARKETING_FEATURE_MATRIX` is imported in only two places and only `.individual` is ever rendered (`use-cases/startups/page.tsx:24`); the `.team`/`.api` tabs are unrendered constants. Use `pricing/page.tsx:545-583` as the third side.
Also **corrected**: "waitlisted" is flatly false; _"Team is already live at /pricing"_ is **accurate**, merely omitting that the path is sales-assisted. The fix is to `press:28` and `faq:35` only.
**Adjacent drift:** `apps/web/app/faq/page.tsx:44` says _"Enterprise is in scoping, not on sale"_ eleven lines after describing it as contactable.

**Fix:** standardise on "Team and Enterprise are sales-assisted, not self-serve; the waitlist is for org-seat/SSO/admin early access."

---

### E. Connectors, MCP & integrations

---

**CON-1 · HIGH · Marketing says streamable HTTP MCP is supported (including on the Desktop spec sheet); Desktop's transport documents that it never speaks it**

**Where / what conflicts**

- **Desktop-scoped claim (primary):** `apps/web/app/desktop/page.tsx:167` — spec ledger row `{ k: 'MCP transports', v: 'stdio · SSE · streamable HTTP' }`.
- **Unscoped claim:** `apps/web/app/integrations/page.tsx:93-94` — `k: 'MCP transports'` / `v: 'stdio, SSE, and streamable HTTP are all supported.'`, under the "What's wired today · The honest inventory" heading; repeated at `:62`.
- `apps/desktop/src-tauri/src/core/mcp/transport.rs:799-801` — _"This transport is legacy-convention only (it never spoke streamable-HTTP 2025-06-18; the engine's `Http` config is available when desktop adds that)."_
- Mechanism verified, not just the comment: the enum has two variants (`transport.rs:1189-1196`), and `Http` maps to `agiworkforce_mcp::TransportConfig::SseLegacy` (`:940-943`), which hardcodes `let post_url = format!("{base}/message");` (`crates/agiworkforce-mcp/src/transport/sse.rs:94`). A streamable-HTTP server serves POST at the **base** URL.
- `apps/desktop/src/services/mcp.ts` (the only TS streamable-HTTP path) has **zero callers**.
- **User-observable:** `apps/desktop/src/features/connectors/CustomRemoteMcpConnectorDialog.tsx:214` asks only for a "Remote MCP URL" (no transport picker) and hardcodes `transport: { type: 'http' }` (:109-118) — which lands on the legacy path and fails with no explanation.
- **Desktop's own module doc contradicts its own transport:** `apps/desktop/src-tauri/src/core/mcp/mod.rs:3` — _"Supports stdio, SSE, and streamable HTTP transports."_

**Scope:** CLI-scoped claims are **true** (`apps/web/app/cli/page.tsx:58`, `features/tools/page.tsx:109`, backed by `apps/cli/src/mcp/mod.rs:253`). Actual matrix: CLI = Stdio/Sse/Http(streamable); Desktop = Stdio + SseLegacy only.
**Secondary:** Desktop's user-facing transport is _named_ `http` but is legacy SSE — anyone reading `"type": "http"` in a config reasonably reads streamable HTTP.

**Fix:** scope the claims per surface on `/desktop` and `/integrations`; fix `mod.rs:3`; add a transport selector or rename the `http` variant.

---

**CON-2 · HIGH · `/integrations`' primary CTA bounces signed-out visitors back to `/integrations`**

**Where / what conflicts**

- `apps/web/app/integrations/page.tsx:38-40` — `<Link href="/apps" className="agi-fl-cta agi-fl-cta--primary">Browse Apps &amp; Connectors</Link>`.
- `apps/web/app/apps/page.tsx:22-31` — `useEffect` → `router.replace('/integrations')` for `!isSignedIn`; `if (!isLoaded || !isSignedIn) return null;`
- **No middleware interception:** `apps/web/proxy.ts:142-149` `isProtectedAppRoute` covers only `/chat`, `/library`, `/schedules`, `/settings`, `/billing`, `/admin`. `/apps` is absent, so the signed-out redirect at `:226-228` never fires and the visitor is never sent to `/login`.

**CORRECTED source of truth:** the finder cited `apps/page.tsx:9-10`'s docblock to argue `/apps` is correct. Lines **4-5 of the same block** say the opposite: _"Unauthenticated visitors see a public marketing fallback."_ — and no fallback exists (`:29` returns `null`). The file contradicts itself, so it cannot be the authority. The repo treats `/apps` as public (below), making `/apps` the wrong side.
**Scope is far wider than one CTA:** `apps/web/shared/components/layout/Header.tsx:54` (`{ href: '/apps', label: 'Apps & Connectors' }` — so the dead link appears **twice on `/integrations` itself**), `apps/web/features/marketing/components/MarketingFooter.tsx:17`, plus ten public pages (`page.tsx:272`, `agi-code/page.tsx:114`, `features/tools/page.tsx:60`, `features/plugins/page.tsx:78`, `business/page.tsx:68`, `desktop/page.tsx:88`, `use-cases/page.tsx:96`, `use-cases/sales-teams/page.tsx:121`, `teams/page.tsx:52`, `agi-work/page.tsx:58`), and `apps/web/app/marketplace/page.tsx:4` (`redirect('/apps')` → chains to `/integrations`).
**SEO layer contradicts itself too:** `apps/web/app/sitemap.ts:70` and `shared/utils/sitemap-generator.ts:29` both list `/apps` at priority **0.9** ("Workspace surfaces"); `apps/web/app/__tests__/seo.test.ts:129-134` asserts it is an indexable public route while `:136-140` asserts the sitemap excludes authenticated redirect routes. Google indexes a URL that serves an empty body.

**Fix:** point public entry points at `/connectors` (which renders a public directory for signed-out visitors), or give `/apps` the marketing fallback its own docblock promises. Reconcile the sitemap and the two SEO assertions.

---

**CON-3 · MEDIUM · Desktop hides Outlook and Jira entirely even though both have complete backend MCP mappings**

**Where / what conflicts**

- `apps/desktop/src/features/connectors/connectorDefinitions.ts:315` (outlook, id at :307) and `:415` (jira, id at :407) — `comingSoon: true`. `:1017` — `CONNECTOR_DIRECTORY = CONNECTORS.filter(c => !c.comingSoon)`.
- `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs:220-242` — complete credentialed mappings for `outlook` (`connector-outlook` / `outlook-mcp-device-flow` / `OUTLOOK_OAUTH_TOKEN` / OAuth microsoft) and `jira` (`connector-jira` / `@caobing122/jira-mcp-server` / `JIRA_OAUTH_TOKEN` / OAuth atlassian). Exported by `supported_connector_ids()` (:280); providers resolve at `:333, :335`.
- `apps/desktop/src/features/connectors/ConnectorGallery.tsx:613-616` — intersects the static directory with the backend-supported set, so a `comingSoon` entry is dropped before the supported check runs.
- **Frontend contradicts itself:** `apps/desktop/src/stores/connectorsStore.ts:21-35` `FALLBACK_SUPPORTED_CONNECTOR_IDS` lists both; `apps/desktop/src/lib/tauri-mock.ts:533-534` mocks both as supported.
- **Two tests disagree:** `mcp_oauth.rs:2792` asserts outlook/jira **must** be advertised as supported; `apps/desktop/src/features/connectors/__tests__/connectorDefinitions.test.ts:8` asserts no `comingSoon` entry may reach the directory.

**CORRECTED:** users are **not** shown "coming soon" — `comingSoon` is never rendered anywhere. The symptom is pure **absence** from the gallery. Also, the conjunctive gate is deliberate by design (`ConnectorGallery.tsx:605-612`); the defect is the two stale flags. Neighbouring `comingSoon` entries (clickup :402, airtable :429) are correct — no mapping exists for them.

**Fix:** remove `comingSoon: true` from lines 315 and 415.

---

**CON-4 · MEDIUM · The connector consent dialog states two different tool counts for the same connector, simultaneously**

**Where / what conflicts**

- `apps/web/features/connectors/components/ConnectorOverviewDialog.tsx:110` — `{authLabel(connector.authType)} &middot; {connector.actionCount} actions`.
- Same `<DialogContent>` (`sm:max-w-lg`, no scroll container), **34 lines below** at `:144` — `Provided tools ({tools.length})`, where `:92` is `const tools = getConnectorTools(connector.id)` and `connector-logos.ts:621-622` is a plain `CONNECTOR_TOOLS[id] ?? []` — no transform.
- `apps/web/features/connectors/data/connectors.ts:112` — `actionCount: 7` (notion); `apps/web/features/connectors/config/connector-logos.ts:546` — `notion: ['Read pages','Create page','Update page','Search','Delete page']` (5).
- Reachable: `ConnectorsPage.tsx:33, 598, 1011, 1088-1096` → route `/connectors`. The inflated number also renders on the grid card at `ConnectorCard.tsx:76`.
- Re-derived independently: of **89** catalog entries, 33 have a tool list; **23 of those 33 disagree** (salesforce 10v5, browser-automation 10v5, hubspot 9v5, shopify 9v5, linear 8v5, jira 8v5, notion 7v5, stripe 8v5, asana 7v5, mailchimp 7v4, local-filesystem 8v5, screen-vision 7v4, terminal 6v5, confluence/google-drive/outlook 6v5, intercom/google-analytics 6v4, openai 6v4, linkedin/twitter/elevenlabs 5v4, zoom 4v5). Tool lists are capped at 5/4/3; `actionCount` ranges 4-10.

**CORRECTED source of truth:** neither number is authoritative for the 32 non-github connectors. `apps/web/features/connectors/components/ToolPermissionsPanel.tsx:3-18` states: _"⚠️ UNMOUNTED… only the github entry in CONNECTOR_TOOLS holds wire names; every other connector's list is display-label marketing copy with no backing implementation."_ Only github is sourced (mirrored from `GITHUB_TOOL_DEFS`) and there the two agree at 3. For the other 56 catalog entries `getConnectorTools` returns `[]`, the block is hidden (`:139`), and the consent dialog discloses **no tools at all**.

**Fix:** derive both from one list; disclose tools honestly or drop the count.

---

**CON-5 · MEDIUM · Marketing names three connector availability labels the product never renders — and the product itself uses four**

**Where / what conflicts**

- `apps/web/app/features/tools/page.tsx:53` — _"OAuth and API-key connectors with honest availability labels: **Ready, Request access, or Planned**. You always know what works today."_
- `apps/web/features/connectors/data/connectors.ts:54-66` — emits `'Ready'` | `'Coming soon'` | `` `Phase ${connector.phase}` `` | `'Exclusive'`. Rendered at `ConnectorsPage.tsx:443, 528-533`.
- `apps/web/features/connectors/pages/ConnectorsPage.tsx:66-71` — filter tabs: All / Connected / Ready / **Coming soon**; group heading `'Coming soon'` at `:745` for the same set the badge stamps "Phase 2"/"Phase 3" (12 and 19 entries exist).
- **Fourth vocabulary:** `apps/web/features/settings/components/WebSettingsModal.tsx:123-135` — `statusLabel: c.phase > 1 ? 'Coming soon' : 'Not yet available on web'`, with `canConnect: false`. Signed-in users hitting `/connectors` are redirected here (`apps/web/app/connectors/page.tsx:26-28`), so they see **zero** "Ready" connectors — directly against _"You always know what works today."_

**CORRECTED:** `"Request access"` survives only in `apps/web/features/connectors/components/ConnectorCard.tsx:124`, an **unimported** component. `"Planned"` appears nowhere.

**Fix:** rewrite `features/tools/page.tsx:53` to the shipped vocabulary; collapse `Phase N` to "Coming soon" (a roadmap phase is internal vocabulary).

---

**CON-6 · MEDIUM · Desktop connectors declare per-connector OAuth scopes that the flow never requests; a fixed provider-wide bundle is requested instead**

**Where / what conflicts**

- `apps/desktop/src/features/connectors/connectorDefinitions.ts:237` — google_drive: `oauthScopes: ['https://www.googleapis.com/auth/drive.readonly']` (field declared :36; populated for 10 connectors at :76, :91, :135, :222, :252, :318, :346, :638, :815).
- `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs:373-387` — every Google connector requests **9 scopes** including `gmail.send`, `calendar.events`, `spreadsheets`. Joined at `:935` and placed in `&scope=` at `:952/:974`.
- The chain drops the declaration entirely: `ConnectorGallery` → `connectorsStore.ts:121` → `api/mcp.ts:1098` → `mcp.ts:582` invokes `mcp_oauth_start` with `{ provider }` **only**; the Rust command signature (`mcp_oauth.rs:894-898`) takes only `provider`.
- Repo-wide grep: `oauthScopes` has **zero readers** — interface declaration + 10 literals, nothing else.

**Four drifted sources, three dead:** `connectorDefinitions.ts:237` (`drive.readonly`), `apps/desktop/src/api/mcp.ts:355` (`['drive.readonly','drive.file']`, exposed via `getOAuthProviders()` which no component calls), `apps/desktop/src/features/mcp/MCPCredentialManager.tsx:44` (same two; component is mounted but `scopes` never appears in JSX), and `mcp_oauth.rs:373-387` (the only one that runs).
**Worse for BigQuery:** `bigquery` declares `bigquery.readonly` (:638) but `from_str` buckets it into the same Google bundle — which contains **no bigquery scope at all** and does grant Gmail send.
**No UI renders scopes anywhere**, so the user's only signal is Google's own consent screen requesting Gmail send for a connector described as _"Find and analyze files instantly"_ (:231).

**Fix:** thread `oauthScopes` through `mcp_oauth_start` (falling back to `default_scopes`), or delete the field and move scope truth into `McpOAuthProvider::default_scopes`. Do not leave a populated-but-unread least-privilege declaration.

---

**CON-7 · MEDIUM · The Inspect MCP server dialog accepts `http://` URLs the server always rejects, and renders the rejection as `[object Object]`**

**Where / what conflicts**

- `apps/web/features/connectors/pages/ConnectorsPage.tsx:119-121` — `if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') { setError('MCP server URL must use HTTP or HTTPS.'); }`. Three more strings say HTTP is fine: `:116`, `:194` ("Enter a valid HTTP or HTTPS URL."), `:240` ("Inspect an HTTP MCP-compatible server").
- `apps/web/lib/mcp-url-validation.ts:26-28` — `if (parsed.protocol !== 'https:') throw createError.validation(...)`; called from `apps/web/app/api/mcp/route.ts:92` and `api/connectors/custom/route.ts:177`. Documented at `:6-15` as deliberate SSRF defence.

**CORRECTED — worse than "a confusing round-trip":** `apps/web/lib/error-handler.ts:70-83` returns `{ error: { code, message }, requestId }` (an **object**), but `ConnectorsPage.tsx:151-157` types it as flat strings and does `throw new Error(body.message ?? body.error ?? ...)`. `body.message` is undefined, so an object is coerced and the user sees the literal string **`[object Object]`** in the destructive error paragraph at `:272`. The correct message (`config.url must use https`) _is_ sent — `VALIDATION_ERROR` is in `SAFE_TO_EXPOSE_CODES` (`error-handler.ts:34`) — the client just can't read it.
**Adjacent:** `handleAddConnector` (`:187-196`) re-parses with **no** protocol check; it is safe only by sequencing (`:189` requires a prior successful inspect).

**Fix:** drop the `http:` branch and fix the three copy strings; fix error parsing to read `body.error?.message`.

---

**CON-8 · LOW · The MCP Directory tells users to add stdio reference servers via a dialog that is remote-HTTPS-only**

**Where / what conflicts**

- `apps/web/app/connectors/mcp-directory/page.tsx:66-71` — _"Copy a server's setup into the custom connector dialog when you are ready to connect it."_ All six `FEATURED_MCPS` (:14-51) are stdio npm servers whose only `url` is the GitHub repo link — **no endpoint is given**.
- `packages/ui/ui/src/settings-modal/SettingsModal.tsx:845-889` — the dialog has only Name/URL/bearer-token (no `command`/`args`); header at `:923-924` _"Connect a remote MCP server"_; submit gated on `isValidHttpsUrl` (`:865-866`). Payload type `packages/ui/ui/src/settings-modal/types.ts:90-93` is `{name; url; authToken?}`. POSTs to `apps/web/app/api/connectors/custom/route.ts:177` → https-only.
- No "add stdio server" UI exists anywhere — `apps/desktop/src/features/mcp/MCPConfigEditor.tsx:45-64` only toggles servers already in the config file.

**CORRECTED:** the finder cited `/api/mcp`'s stdio rejection (`route.ts:86-91`), which belongs to the separate _Inspect_ dialog and is unreachable from this form. And the failure mode is a **disabled submit button**, not a validation error.

**Fix:** say these are stdio servers for Desktop/CLI and that the web dialog accepts remote HTTPS endpoints only; link them to Desktop MCP setup.

---

**CON-9 · LOW · Per-tool permission levels are named differently in web chat than in the contract, on Desktop, and in marketing**

**Where / what conflicts**

- `packages/contracts/types/src/design-system/connector-permission.ts:9-14` — `'Always allow' / 'Needs approval' / 'Blocked'`; consumed by Desktop (`apps/desktop/src/features/connectors/ConnectorDetailView.tsx:26, 102`, reachable via `ConnectorGallery.tsx:761`).
- `apps/web/features/chat/components/messages/ToolTimeline.tsx:634-638` — hardcodes `'Always allow' / 'Ask' / 'Block'`; rendered for any awaiting-approval call (`:560, 609-618`).
- `apps/web/app/features/tools/page.tsx:93` — ships the contract vocabulary.

**CORRECTED — why this is low:** the _value_ split is intentional and reconciled server-side. `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:17-20` documents it (_"the table stores the canonical values… the wire and this module use the composer's"_), with the mapping at `:31-35` and identical enforcement at `:71-73`. Only display strings drift, and they are synonyms. Marketing at `features/tools/page.tsx:96-98` scopes the review step to _"the Desktop app or the CLI overlay"_.
**Third vocabulary exists but is unmounted:** `apps/web/features/connectors/components/ToolPermissionsPanel.tsx:61-88` (`'Allow'/'Ask'/'Deny'`) is imported nowhere.

**Fix:** add a wire→canonical label bridge (ToolTimeline cannot import `CONNECTOR_PERMISSION_LABEL` directly — different key space). Also align the unused `connectors.perm` i18n triple (`'Allow'/'Ask'/'Never'`) in all 12 locales.

---

### F. Scheduling & agent workflows

---

**SCH-1 · HIGH · Desktop "Run Once" tasks become daily-recurring 9 AM jobs; editing a schedule reports success while discarding the change**

**Where / what conflicts**

- `apps/desktop/src/features/scheduler/TaskScheduleInput.tsx:86-96` — a "Run Once" toggle setting `{type:'once', runAt}` with a `datetime-local` picker (:118-124); preview at `:23` — _"Runs once on \<date\> at \<time\>"_. `CreateTaskModal.tsx:88-91` validates `runAt`, then passes `schedule` unmodified (:110). **No normalizer between UI and IPC.**
- `apps/desktop/src/stores/schedulerStore.ts:757-763` — forwards the raw object to `scheduler_add_job`.
- `apps/desktop/src-tauri/src/sys/commands/scheduler.rs:743-762` — reads only `cronExpression` (:746) and `interval` (:748); a once-schedule has neither, so it falls to the `else` at `:757` and assigns **`"0 0 9 * * *"`** at `:758`, with `action_type` defaulting to `AgiTask` (:765-769).
- **The lie is then re-displayed:** `schedulerStore.ts:715` → `taskScheduleFromCronExpression` (:128) → `inferTaskInterval` (:111-126) classifies it `daily` → `getScheduleSummary` (:192-208) → `AgiWorkScheduled.tsx:118` renders **"Every day"**.
- **Editing is broken the same way, silently:** `scheduler.rs:1907-1917` applies `updates.schedule` **only** if it contains `cronExpression` — never `interval` or `runAt` — yet returns `Ok(true)` at `:1943`, and `CreateTaskModal.tsx:103` toasts _"Task updated"_. (Because `TaskScheduleInput.tsx:56-58` spreads the previous value, an interval change during edit re-sends the **stale** cron; switching to "Run Once" (`:44-46`, no spread) drops the update entirely.)
- Surface is shipped: `DesktopShellV3.tsx:745-746`, `Sidebar.tsx:160/171/203/211`, `ScheduledTasksPanel.tsx:186`, `AgentTaskPanel.tsx:89`.

**Source of truth:** the DB already models this. `apps/desktop/src-tauri/src/data/db/migrations.rs:814-817` defines `schedule_type TEXT NOT NULL CHECK(schedule_type IN ('cron','interval','once'))` plus `run_at` and `interval_seconds`. Only the command layer is cron-only. (`apps/desktop/src/features/schedules/ScheduleEditor.tsx:179-186`, the other edit surface, always sends a fresh cron and works.)

**Fix:** handle `type === 'once'` in `scheduler_add_job` (persist `run_at`, auto-complete after firing) or reject explicitly — **never** fall through to a daily default. Factor the interval→cron resolution out of `scheduler_add_job` and call it from `scheduler_update_job`.

---

**SCH-2 · HIGH · Managed Cloud sells up to 250 scheduled tasks per user; the platform executes 10 scheduled runs per day, total**

**Where / what conflicts**

- `packages/contracts/types/src/billing-catalog.ts:313/322/331/340` — `maxScheduledTasks` 5 / 25 / 100 / **250**, enforced per user via `getPlanMaxScheduledTasks` (:407) and `apps/web/lib/services/schedule-service.ts:463`.
- `vercel.json:53-56` — the only trigger: `"path": "/api/cron/run-schedules"`, `"schedule": "15 0 * * *"` (once daily).
- `apps/web/app/api/cron/run-schedules/route.ts:18` — `processDueScheduleRuns({ limit: 10 })`.
- `apps/web/lib/services/schedule-service.ts:758-790` — `claimDueScheduleRuns` filters `and next_execution_at <= now()` (:784). Grep confirms no other caller and no other trigger (no GitHub Actions, QStash, Inngest).
- Numbers are shown to users: `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:556`, `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:440-444`, `apps/mobile/app/(app)/schedules/index.tsx:37` and `create.tsx:30`.

**CORRECTED:** tasks do **not** "never fire" — unclaimed rows stay due and are picked up FIFO (`:788` orders by `next_execution_at asc, id asc`), so the symptom is an unbounded backlog and delays of days-to-weeks. A manual run-now path exists and is uncapped (`apps/web/app/api/schedules/[id]/runs/route.ts:78` → `createManualScheduleRun`, `schedule-service.ts:855`). The `limit: 10` is not arbitrary: concurrency is clamped to 10 (`:1159`) and a 40s wave must fit `maxDuration = 60` (`route.ts:9`).
**Notably, the cadence half is already reconciled**, which sharpens the count half: `apps/web/lib/schedules/schedule-time.ts:299-307` pins `SWEEP_INTERVAL_MS = 24h` to the deployed cron and `assertDeliverableCadence` (:344+) rejects sub-daily requests — _"Accepting a finer cadence would be a promise the platform cannot keep."_ The same reasoning was never applied to the count.

**Fix:** raise the sweep frequency (e.g. `*/10 * * * *`) and per-invocation limit sized against Σ`maxScheduledTasks`, updating `SWEEP_INTERVAL_MS` (pinned by `schedule-cadence.test.ts`); or lower the catalog values to what the sweep can deliver.

---

**SCH-3 · MEDIUM · Web Schedules page offers creation to every plan, including tiers the catalog gives zero scheduled tasks**

**Where / what conflicts**

- `packages/contracts/types/src/billing-catalog.ts:282/291/304` — `maxScheduledTasks: 0` for local-only, byok, free.
- `apps/web/features/schedules/components/SchedulesPage.tsx` — **no plan/tier/entitlement/limit check anywhere in 572 lines**; two ungated create entry points: header button at `:389-391` and empty-state at `:437-438`. Route `apps/web/app/chat/schedules/page.tsx` has no gate; nav links at `WebChatPage.tsx:2696-2701` and `WebSidebar.tsx:98` are unconditional.
- Refusal only after submit: `apps/web/app/api/schedules/route.ts:85` → `assertScheduleQuota` → `apps/web/lib/services/schedule-service.ts:463-474` — _"\<label\> plans do not include scheduled tasks. Upgrade to schedule unattended runs."_
- **Both other clients pre-gate:** `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:440-445, 696-710, 752-777` (incl. the message _"Free does not include unattended scheduled runs…"_ at :763); `apps/mobile/app/(app)/schedules/create.tsx:30-31` and `index.tsx:37`.

**CORRECTED:** the server's explanatory 403 **is** surfaced in the dialog (`SchedulesPage.tsx:220` → `submitError` prop at `:514`), so the user gets actionable text — the cost is a wasted form fill plus a UI implying an entitlement the plan denies.

**Fix:** lift the desktop/mobile gating into a shared module and consume it on web.

---

**SCH-4 · MEDIUM · Schedules UI collects a local time of day and displays a precise "Next Run" the sweep can never honor**

**Where / what conflicts**

- `apps/web/features/schedules/components/ScheduleForm.tsx:276-278` — a **"Local Time"** `type="time"` input for daily/weekly/monthly.
- `apps/web/features/schedules/components/ScheduleCard.tsx:126` — a **"Next Run"** row printing `formatDateTime(schedule.nextExecutionAt, schedule.timezone)` with no approximation caveat.
- `vercel.json:53-55` — one executor, `"15 0 * * *"`. `apps/web/lib/services/schedule-service.ts:784` — `and next_execution_at <= now()`, **no look-ahead**, so a row due at 14:00 UTC waits for the next 00:15 UTC sweep.
- `apps/web/lib/schedules/schedule-time.ts:299-306, 346` — the codebase already guards **frequency** for exactly this reason, but never **phase**.

**CORRECTED:** lateness is not a fixed ~11h — it ranges 0-24h by timezone and chosen hour (09:00 America/Chicago → ~10h15m late). Behaviour is stable, not compounding (`schedule-service.ts:1023-1027` re-anchors on the scheduled instant).
**Worst case the finder missed:** one-time schedules. `ScheduleForm.tsx:214-217` renders a `datetime-local` "Run At" whose helper (`:225-228`) never mentions the sweep, and `assertDeliverableCadence` explicitly exempts them (`schedule-time.ts:347`). "Run at 3 PM today" fires at 00:15 UTC the next day with **zero disclosure**. (Contrast: the Interval and Cron fields _do_ carry sweep caveats at `:252` and `:358-359`.)

**Fix:** run the sweep at a granularity that can honor a time-of-day, or replace the time input and "Next Run" instant with an honest "runs once daily after HH:MM UTC" and add the caveat to the Local Time and Run At fields.

---

**SCH-5 · MEDIUM · Scheduled-task Model picker (and create-path Description) are collected and thrown away**

**Where / what conflicts**

- `apps/desktop/src/features/scheduler/CreateTaskModal.tsx:196-256` — a Description field and a Model select populated from the real catalog (incl. managed-cloud entries), labelled _"Model (optional — uses app default)"_ (:236). `handleSave` (:96-112) passes both.
- `apps/desktop/src/stores/schedulerStore.ts:757-763` — sends only `{name, prompt, schedule}`.
- `apps/desktop/src-tauri/src/sys/commands/scheduler.rs:734-741` — `scheduler_add_job` accepts no description and no model. `ScheduledJobUpdate` (:1854-1862) has **no `modelId` field** and no `deny_unknown_fields`, so it is silently ignored. `dispatch_job_action`'s AgiTask branch (:1478-1513) builds the Goal from the prompt alone.
- `fetchTasks` (`schedulerStore.ts:703-727`) never maps `modelId` back, so the selector reads blank on every re-open.

**CORRECTED:** description **does** round-trip on the _edit_ path (`ScheduledJob.description` exists at `scheduler.rs:231`; applied/persisted at `:1890-1892, 1938`; mapped back at `schedulerStore.ts:713`). It is dropped only on **create**. `modelId` is inert everywhere. From the v3 shell there is no edit entry point at all (`AgiWorkScheduled.tsx:168` renders the modal with no `editingTask`), so both controls are write-only there.

**Fix:** add `description` to `scheduler_add_job`; add `model` to `ScheduledJob`/`ScheduledJobUpdate` and thread it into the Goal — or remove the Model control.

---

**SCH-6 · MEDIUM · Desktop cron helper instructs a 5-field expression the Rust scheduler rejects, while the web form documents 5-field for its own backend**

**Where / what conflicts**

- `apps/desktop/src/features/scheduler/TaskScheduleInput.tsx:155` — `placeholder="0 9 * * * (daily at 9 AM)"`, plus a crontab.guru link (`:159-167`) which only emits 5-field expressions.
- `apps/desktop/src/stores/schedulerStore.ts:107-109` — the store's own comment: _"The native scheduler uses six fields (seconds first), while a few older UI entry points still produce five-field cron expressions."_ It normalizes only the **read** path (`:113`).
- `apps/desktop/src-tauri/src/sys/commands/scheduler.rs:746` passes the string through verbatim to `ScheduledJob::new`, which validates at `:243-244` with `Schedule::from_str`. `Cargo.toml:173` pins `cron = "0.12"`, whose `longhand` parser (`cron-0.12.1/src/parsing.rs:250-274`) requires **6** mandatory fields. `"0 9 * * *"` fails; the user gets `toast.error("Failed to create task: …")`.
- `apps/web/features/schedules/components/ScheduleForm.tsx:358-361` — _"Five fields only: minute, hour, day of month, month, and day of week."_

**Scope:** custom-cron path only (presets map to correct 6-field expressions at `scheduler.rs:751-754`). Failure is visible only in the native Tauri build — in Electron/web preview the store swallows the rejection and writes a local-only task that vanishes on the native backend.

**Fix:** change the placeholder/helper to `0 0 9 * * *` and state seconds-first, **or** normalize 5→6 fields in `scheduler_add_job` (matching what `inferTaskInterval` already tolerates on read).

---

**SCH-7 · MEDIUM · Local-mode Projects screen promises cross-surface sync while the same component labels the same data "local"**

**Where / what conflicts**

- `apps/desktop/src/features/v3/AgiWorkProjects.tsx:265` — unconditional, non-i18n: _"Files, instructions, and chat history stay together across Web, Mobile, and Desktop."_ (list view, returned at `:252+`).
- Same component, detail view (early-returned at `:122`): `:191` `{projectConversations.length} {isManagedCloud ? 'synced' : 'local'}`; `:205-207` "Cloud sources" vs "Local knowledge".
- **Backend proof:** `apps/desktop/src-tauri/src/sys/commands/projects.rs:188-198` reads only the local SQLite table; `:168-181` marks a project for cloud push only when `derive_cloud_sync_enabled(...)` is true, which is hardcoded false for `active_mode == "local"` (`apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs:66-75`).
- Default state: `DesktopShellV3.tsx:699-704` and `:748-753` render this with **no mode gate**, and `apps/desktop/src/stores/appModeStore.ts:64` defaults Tauri builds to `'local'`.

**CORRECTED:** the two claims are **sequential**, not side-by-side (list screen then detail screen), and the copy **overstates** sharing — so it does not cause a user to under-protect private data. No data crosses the boundary; the defect is a false capability claim plus a muddled trust-boundary statement.

**Fix:** make `:265` mode-aware, mirroring `:191`/`:205-207`.

---

### G. Settings wiring — dead and self-resetting controls

---

**SET-1 · MEDIUM · Desktop appearance/accessibility settings are wiped on every launch; the UI says they persist**

**Where / what conflicts**

- `apps/desktop/src/features/settings/ThemeSettings.tsx:668-671` — _"Interface size … **Persists across restarts** and scales the complete Desktop interface."_
- `apps/desktop/src-tauri/src/sys/commands/settings.rs:41-47` — `WindowPreferences` carries only `theme`, `language`, `startup_position`, `dock_on_startup`. No `ui_scale`, `reduce_motion`, `chat_font`, `dyslexic_font`, `selected_theme`. `persist_settings_snapshot` (:479-502) serializes the struct itself.
- `apps/desktop/src/stores/settingsStore.ts:1390-1394` merges the Rust payload over `defaultSettings` and `set()`s it at `:1478`; `App.tsx:674-678` runs `loadSettings()` on **every** launch (and `SettingsPanel.tsx:433` on first panel open).

**CORRECTED mechanism (matters for the fix):** the persist `merge` at `settingsStore.ts:1790-1795` **correctly restores** all five from localStorage — `loadSettings` is the sole discard point. The setters (`:958-1035`) never call `saveSettings()`, so the values are never even sent. `partialize` (`:1721-1733`) then **re-persists the reset**, making the loss permanent. `selectedTheme`/`chatFont`/`dyslexicFont` become `undefined` (absent from `defaultSettings.windowPreferences`, `:351-358`); only `uiScale` (100) and `reduceMotion` (false) have defaults.
No test covers it: `ThemeSettings.accessibility.test.tsx:20-30` asserts only in-memory state after a click.

**Fix:** add the five fields with `#[serde(default)]`; make `loadSettings()` preserve hydrated values for absent keys; add a `settings_save` → `settings_load_from_disk` round-trip test.

---

**SET-2 · MEDIUM · Desktop agent-execution safety settings (approval timeout, timeout policy, stream inactivity) reset on every launch**

**Where / what conflicts**

- `apps/desktop/src/features/settings/AgentExecutionSettings.tsx:257-258` — `<Label htmlFor="approvalPolicy">Timeout policy</Label>` with auto-deny/auto-approve/pause; approval-duration slider at `:231-238`; stream-inactivity slider at `:300-307`. Mounted via `tabs/Developer/index.tsx:7-34`.
- `apps/desktop/src-tauri/src/sys/commands/settings.rs:142-155` — `ExecutionPreferences` has five scalars + `terminal_sandbox`; grep for `approval_timeout|stream_inactivity` across `src-tauri/src` returns **zero**.
- `apps/desktop/src/stores/settingsStore.ts:1402-1405` merges over defaults (300 / `'auto-deny'` / 30, defined at `:378-380`) and overwrites the correctly-rehydrated values at `:1480` (persist merge at `:1802-1814` had restored them).
- **Load-bearing:** `apps/desktop/src/stores/chat/toolStore.ts:948` (arms the timer), `:1016-1017` (reads the policy at decision time), `apps/desktop/src/stores/chatExecutionStore.ts:199` (stream watchdog).

**Not a safety escalation:** `toolStore.ts:1029-1035` exempts native MCP approvals from the UI policy, and the revert direction is the fail-safe `'auto-deny'`. Impact is a silently reverted user preference (a chosen `'pause'` or long window).
**Adjacent:** UI slider ranges (60-600, 15-120) disagree with the store clamps (30-3600 at `settingsStore.ts:594`, 10-300 at `:622`).

**Fix:** same as SET-1 — add the three fields and stop clobbering hydrated state.

---

**SET-3 · MEDIUM · Settings → Agents ships three checkpointing controls, default ON, whose backing subsystems are never instantiated**

**Where / what conflicts**

- `apps/desktop/src/features/settings/AgentsSettings.tsx:203` — _"Enable Checkpointing — Periodically save task progress so long-running jobs can be resumed after an unexpected crash or app restart."_; `:216-233` "Checkpoint Interval" 1-100 steps; `:241` _"Auto-resume on Restart — Automatically continue interrupted tasks when the app restarts."_ No disclaimer anywhere. Reachable in both shells (`packages/ui/ui/src/settings-nav.ts:145`; not in `WEB_HIDDEN_TABS` or `LOCAL_HIDDEN_TABS`, `SettingsPanel.tsx:104-108`).
- `apps/desktop/src-tauri/src/sys/commands/settings.rs:145-150` — the three fields are declared and persisted; repo-wide grep shows they appear **only** there plus their `default_*` fns. **No reader.**
- Both candidate subsystems are dormant: `grep ContinuousExecutor` outside its own module returns only the re-export (`core/agent/mod.rs:41-46`); `grep CheckpointManager` returns only a doc comment (`core/agi/checkpoint.rs:11`) and the re-export (`core/agi/mod.rs:41`). Neither is ever constructed.
- `docs/agent-context/known-flaws.md:998` and `apps/desktop/src/stores/settingsStore.ts:476` both already record this.

**Aggravating:** the dead controls ship **ON** — `settingsStore.ts:374-376` sets `enableCheckpointing: true`, `checkpointInterval: 5`, `autoResumeOnRestart: true`. A user who never opens Settings is still affirmatively told checkpointing and auto-resume are enabled.
The only live checkpoint flag is `enable_checkpoint_on_timeout` (`core/agent/timeout_manager.rs:57`) — checkpoint-on-timeout, not periodic — and it is explicitly **not** fed from these toggles (`settingsStore.ts:479-489` writes only `max_duration_secs` and `enable_warnings`).

**Fix:** take option (B) from the known-flaws entry now — remove the three controls until the integration lands. Copy promising crash recovery is the worst of the options.

---

**SET-4 · MEDIUM · Research settings write three preferences that nothing reads, and offer a "Max Sources" range the backend has no concept of**

**Where / what conflicts**

- `apps/desktop/src/features/settings/ResearchSettings.tsx:170-181` writes `research_mode` and `research_max_sources`; `:385-390` writes `research_citations`; "Saved" indicator at `:303-307`. Reachable via `SettingsPanel.tsx:767` → `tabs/Capabilities/index.tsx:39`; indexed at `settingsSearchIndex.ts:152-157`.
- Repo-wide grep for all three keys returns **only this file** (its own write + read-back at `:61-62, 372`), plus unrelated Rust test names.
- The real source of truth is `ResearchConfig` (`apps/desktop/src-tauri/src/core/research/types.rs:123-165`), mutated only by `research_set_config` (`sys/commands/research.rs:374-381`) — and it **is live**: `apps/desktop/src/stores/researchStore.ts:189` honors `config?.default_mode`.
- **Max Sources does not exist in the backend at all.** `ResearchConfig` has no such field; per-agent source count is derived purely from mode: `types.rs:95-101` → Quick 5 / Standard 10 / Deep 20 / **Exhaustive 50**, consumed at `core/research/orchestrator.rs:554`. The 1-20 slider (`ResearchSettings.tsx:338-354`) advertises a range with no representation, against a real ceiling of 50.
- **Fourth mode is named two ways:** settings offers `comprehensive` / "Comprehensive" (`ResearchSettings.tsx:46-50`); the backend enum is `exhaustive` (`sys/commands/research.rs:74-80`, `snake_case`) and `research_get_modes` advertises `"Exhaustive"` (`:405-410`). The persisted string would fail serde deserialization if forwarded.

**Fix:** point ResearchSettings at `research_get_config`/`research_set_config`; drop or implement Max Sources; unify the mode name.

---

**SET-5 · MEDIUM · Settings search routes "Allowed directories" to the Developer tab; the panel only exists on Privacy**

**Where / what conflicts**

- `apps/desktop/src/features/settings/settingsSearchIndex.ts:285-291` — `{ id: 'allowed-directories', tab: 'developer', label: 'Allowed directories', description: 'Review folders available to local tools.' }` (wrong literal on `:287`).
- `apps/desktop/src/features/settings/tabs/Developer/index.tsx:27-40` — renders only `LazyDotfileSettings` and `LazyAgentExecutionSettings`. (`AgentExecutionSettings` has `allowedDomains` — network egress — never directories.)
- `apps/desktop/src/features/settings/tabs/Privacy/index.tsx:511-514` — the only non-test mount of `AllowedDirectoriesSettings` (:513), inside the `scope === 'local'` branch.
- Observable: `SettingsPanel.tsx:860-864` sets both `activeSearchResult` and `activeTab`, then `:948-958` renders a live banner _"Showing Allowed directories — Review folders available to local tools."_ over Developer content that has no such control, after a ~1s stall (`:474-500` retries 20× then `scrollTo({top:0})`).
- Cloud scope confirms Privacy is the intended home: `Privacy/index.tsx:463-481` — _"allowed folders … are managed in Local settings."_

**Fix:** change the `tab` to `'privacy'` and add the matching `data-setting-search-id` anchor. (The adjacent `agent-execution` entry at `:278-284` is correct.)

---

**SET-6 · MEDIUM · Mobile's "Memory" master defaults ON and shadows the account key, which defaults OFF on web and desktop — and the summary screen suppresses the "Memory is off" warning**

**Where / what conflicts**

- `apps/mobile/stores/settings/cloudSettingsStore.ts:123-126` — `memoryEnabled: true` with `referencePastChats: false` ("Match the Web privacy-safe default").
- `apps/mobile/services/cloudSettingsMapping.ts:179-182` binds the account key `capabilities.memory` to `referencePastChats` on push; `:256-258` maps the pull to `setReferencePastChats`. **Nothing writes `memoryEnabled` from a pull.**
- `apps/web/features/settings/sections/CapabilitiesSection.tsx:21-26` — `memory: false` ("Privacy-safe default"), rendered as a switch titled **"Memory"** (`:127-137`).
- `apps/desktop/src/services/managedCloudSettingsSync.ts:466-469` binds the same key to `chatPreferences.memoryEnabled`, default `false` (`stores/settings/chatPrefs.ts:53`, `settingsStore.ts:366`), labelled **"Enable memories"** (`features/settings/tabs/Memory.tsx:111`).
- Mobile labels the same account key **"Search and reference chats"** (`MemoryControlsCard.tsx:54-65`) and reuses "Memory" for the oppositely-defaulted device master (`:44-53`).

**CORRECTED:** the mobile master is **not** purely device-local on write — `apps/mobile/app/(app)/settings/memory.tsx:79-85` calls both `setMemoryEnabled` and `setReferencePastChats`. The desync is one-directional (pull + initial default).
**Strongest missed side:** the accuracy warning is suppressed. `apps/mobile/app/(app)/settings/memory-summary.tsx:43-44, 67-83` gates _"Memory is off, so none of these are used in new chats."_ on the **device master alone**, while retrieval requires the AND (`apps/mobile/stores/chat/chatExecutionStore.ts:1253-1254`). On the default cloud state memory is completely inert yet the warning is hidden, and `MemoryControlsCard.tsx:89-96` shows reassuring "syncs across your devices" copy instead.
**Behavior fails closed** — no leak, no trust-boundary violation. This is state-reconciliation + label drift.

**Fix:** have `applyCloudSettings` set `memoryEnabled` from `capabilities.memory`, or gate the card/summary copy on `memoryEnabled && referencePastChats`. Unify the label.

---

**SET-7 · MEDIUM · Composer "Approvals: Auto" chip renders over Managed Cloud sessions and its remedy link silently opens the wrong settings page**

**Where / what conflicts**

- `apps/desktop/src/features/v3/ComposerContextControls.tsx:37, 115` — reads `chatPreferences.autoApproveTools` from the **local** persisted store and gates the chip on that value alone, with **no `mode` check**. Tooltip `:121` — `"Tools can run without confirmation · Open agent execution settings"`. Rendered with `mode={privacyMode}` at `DesktopShellV3.tsx:674-679`, and `selectPrivacyMode` (`appModeStore.ts:168-170`) returns `'managed'` for every non-local mode.
- `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:566-569` — _"Tool approvals are enforced by the Managed Cloud policy for each task. Local agent and auto-approval controls apply only to the Local workspace."_
- The remedy link dead-ends: `openSettings('agent-execution')` → `apps/desktop/src/stores/settings/dialog.ts:45` remaps to `'agents'` → `DesktopCloudSettingsModal.tsx:133-138` finds `'agents'` absent from `CLOUD_SETTINGS_SECTIONS` (:111-131) and returns `'general'`.

**CORRECTED:** the terminal-policy chip is **not** unconditional — `:102` gates it on `folderPath || terminalSandbox.policy === 'danger-full-access'`; it still reaches Cloud because the folder seam is enabled for managed (`DesktopShellV3.tsx:205`). Only the **Approvals** chip is truly mode-independent.
**Blocking:** `apps/desktop/src/features/v3/ComposerContextControls.test.tsx:94-121` renders `mode="managed"` and asserts the terminal chip is present — it encodes the current wrong intent and must be updated.

**Fix:** gate the Approvals chip on `mode !== 'managed'`; add an `'agents'` entry to `CLOUD_SETTINGS_SECTIONS` or route to `'capabilities'` in cloud mode.

---

**SET-8 · LOW · "Prompt Completion" toggle promises inline AI suggestions, defaults ON, and no code consumes it**

**Where / what conflicts**

- `apps/desktop/src/features/settings/tabs/ModelsKeys/index.tsx:583-592` — `<Label htmlFor="promptCompletion">Prompt Completion</Label>` / _"Show AI-powered suggestions as you type"_ with a live `<Switch>`. Reachable: `App.tsx:1936` → `SettingsPanel.tsx:739, 760`.
- `apps/desktop/src/stores/settingsStore.ts:360` — `promptCompletionEnabled: true, // AI-powered ghost text enabled by default`. So the switch renders **ON** out of the box.
- `apps/desktop/src/services/managedCloudSettingsSync.ts:471` — `editor: { promptCompletionEnabled: … }` is projected into the account-level cloud settings document.
- Grep for `promptCompletionEnabled` outside tests hits only the settings tab, three store definitions, and the sync serializer/applier. **No composer or editor reads it.**
- The whole vertical exists and is unmounted: `apps/desktop/src/hooks/useApiPromptCompletion.ts` (0 importers), `apps/desktop/src-tauri/src/sys/commands/completion.rs:296` `get_prompt_completion`, IPC allowlist `apps/desktop/src/utils/ipc.ts:226`, typed client `packages/client/desktop-command-client/src/completion.ts:48` (0 callers).

**CORRECTED:** "propagates the false capability to other surfaces" is overstated — the only reader of the synced value is `applyDesktopCloudSafeSettings` in the same file (`:515-518`). Web/`packages/ui` carry 12 locales of matching dead copy (`packages/ui/i18n/locales/en/settings.json:21-22`) with no consumer either. Audience is local/BYOK desktop only (hidden on web via `SettingsPanel.tsx:104`; remapped in cloud via `DesktopCloudSettingsModal.tsx:136`). Already tracked at `scripts/config/surface-reachability-allowlist.json:277`.

**Fix:** mount the hook gated on the flag, or remove the row and drop `editor.promptCompletionEnabled` from the cloud projection.

---

**SET-9 · LOW · Settings search advertises 41 addressable controls; 38 have no anchor and land on a scroll-to-top**

**Where / what conflicts**

- `apps/desktop/src/features/settings/settingsSearchIndex.ts:15-292` — 41 entries, e.g. `{ id: 'global-hotkey', tab: 'general', label: 'Global hotkey', … }` (:16-22).
- `apps/desktop/src/features/settings/SettingsPanel.tsx:473-515` — resolves via `[data-setting-search-id="${id}"]` (:482-484), retries 20× at 50ms, then `content?.scrollTo({top: 0})` (:492-495).
- Repo-wide, exactly **three** anchors are rendered: `ThemeSettings.tsx:699` (reduce-motion), `tabs/General/index.tsx:213` (menu-bar), `tabs/Connections/index.tsx:29` (remote-control).

**CORRECTED — why low:** navigation is **not** broken. `SettingsPanel.tsx:861-864` runs both `setActiveSearchResult` and `setActiveTab`, so the user always lands on the right tab; only the intra-tab `scrollIntoView`, outline, and `focus()` (`:497-503`) are lost. The index is not advertising nonexistent controls — `global-hotkey` maps to a real section (`tabs/General/index.tsx:282-305`), and the file's own comment (`:11-14`) says entries "describe real controls or destinations". The `"Showing X"` banner is gated on `activeSearchResult.tab === activeTab` (:948) and never claims focus moved. **Scope:** local mode only (`App.tsx:1926`; `DesktopCloudSettingsModal.tsx:11`).

**Fix:** add `data-setting-search-id` + `tabIndex={-1}` to the remaining 38 wrappers; add a test asserting every index id appears as a literal in the settings tree.

---

### H. Subscription lifecycle

---

**SUB-1 · MEDIUM · The invite-redemption DB function mints a `trialing` subscription on plan tier `hobby`, a tier deleted from the catalog**

**Where / what conflicts**

- `apps/web/db/neon/0020_functions.sql:1537` (`p_plan_tier text default 'hobby'`), `:1592` (`coalesce(v_invite.plan_tier, p_plan_tier, 'hobby')`), inserted as `trialing` at `:1603-1614`. Live: `apps/web/app/api/claim-offer/route.ts:81-85` calls it, and `0020_functions.sql:117` defaults `beta_invites.plan_tier` to `'hobby'`.
- `packages/contracts/types/src/billing-catalog.ts` — no `hobby` key, so `isBillingPlanTier('hobby')` is false, `canUseBillingPlanCapability('hobby', …)` fail-closes to false (`__tests__/billing-catalog.test.ts:112`), and `getBillingPlanProductLimits('hobby')` is null.

**CORRECTED — this is sharper, not weaker, than reported:** the UI does **not** render "Free". Two shipped normalizers alias hobby→basic: `apps/web/features/billing/hooks/use-billing-queries.ts:106` (`plan === 'hobby' ? 'basic' : plan`) and `packages/contracts/types/src/design-system/user-identity.ts:44` (`if (normalized === 'hobby') return 'basic';`, tested at `__tests__/user-identity.test.ts:23`) — the latter feeds web ChatHeader, desktop PlansModal/UsageDashboard/auth store, and `packages/ui` UserProfile. So the account **displays as "Basic"** while the server treats the tier as unknown and grants nothing.
**No credits either:** `apps/web/lib/server/managed-usage-policy.ts:116-121` has no `hobby` key → budget 0 → `apps/web/lib/services/subscription-service.ts:176-182` short-circuits with _"No paid-ledger credits allocated for plan tier"_. Observable break: chats 402 _"Usage budget exhausted. Upgrade your plan"_ under a **Basic** label.
**The DB still permits it:** `apps/web/db/neon/0074_allow_max_15x_subscription_tier.sql:10-19` — the current CHECK lists `'hobby'::text` alongside `'basic'::text`. 0074 is a second stale source.
`apps/web/lib/price-tier-mapping.ts:157` rejects `hobby` but never runs on this path (webhook/sync only).
**Reachability:** invite rows are admin-seeded SQL (nothing INSERTs into `beta_invites`); the live consumer is the Chrome side panel (`apps/extension/src/side_panel.ts:6516` → `lib/waitlistService.ts:160` → `/api/claim-offer`).

**Fix:** `CREATE OR REPLACE claim_beta_invite` with `'basic'`; drop `'hobby'` from the CHECK; guard the route with `isValidPlanTier` before the RPC.

---

**SUB-2 · MEDIUM · Desktop shows "Manage subscription" to free accounts where the portal endpoint 404s; web deliberately hides it**

**Where / what conflicts**

- `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:227-245, 277-300` — gates only on `hasCloudAccountSession`; `plan` (:228) is used for display (:258) and never gates the button, labelled _"Manage subscription"_ (:299). Reachable via `App.tsx:169-171, 1929`.
- `apps/web/features/settings/sections/BillingSection.tsx:171, 374, 389` — `isFreeTier` wraps the portal button; rationale at `:174-175` (_"the routes return [] when there is no Stripe customer"_). Free users get only "Upgrade plan".
- Server: `apps/web/app/api/portal/route.ts:194` — `throw createError.notFound('No subscription or customer found in Stripe')`, or `:359-361` _"No billing account linked to this subscription. Please contact support."_

**CORRECTED:** the finder cited `portal/route.ts:298`, which is the catch-all for unexpected Stripe SDK failures and is bypassed for deliberate errors by `if (isAppError(err)) throw err;` at `:296`. Use `:194`/`:359-361`.
**Two more desktop offenders:** `apps/desktop/src/features/settings/AccountSettings.tsx:150` (renders the button on a row literally labelled `Free`, :129) and `apps/desktop/src/features/settings/BillingSettings.tsx:69, 92-93` (computes `hasActiveSubscription` at :30-31, renders "None" at :79, still shows the button).
**Label drift:** "Manage subscription" (desktop modal, AccountSettings) vs "Manage billing" (web, desktop BillingSettings).
**Mitigation:** all three surface the server error inline (`role="alert"` at DesktopCloudSettingsModal.tsx:264-268), so it's a confusing 404, not a hang.

**Fix:** gate all three on a paid plan the way web does.

---

**SUB-3 · LOW · `'paused'` is a subscription status the client contract renders and the webhook would write, but the DB CHECK rejects it**

**Where / what conflicts**

- `apps/web/db/neon/0003_subscriptions.sql:9-13` — CHECK allows `active, trialing, past_due, canceled, incomplete, incomplete_expired, unpaid, none`. Every later ALTER (0030, 0046, 0074) re-creates only `subscriptions_plan_tier_check`; the status CHECK is **never widened**.
- `apps/web/app/api/stripe-webhook/lib/db.ts:769-770` — `const updateData = { status: subscription.status, … }` written raw at `:853-866`, with `.catch` rethrowing at `:875-878` (so a violation 500s and Stripe retries). Same raw pass-through at `:385-393, 588-605, 1191-1201`.
- `apps/web/features/billing/hooks/use-billing-queries.ts:43-53` declares `| 'paused'` (:51), normalizes it (:101), and `components/Billing/Subscription.tsx:111-115` renders an amber **"Paused"** badge.

**CORRECTED — latent, not live:** Stripe's `paused` status arises only when a trial ends with no payment method and `trial_settings.end_behavior.missing_payment_method = 'pause'`. Portal pausing uses `pause_collection`, which leaves status `active`. Neither exists in this repo — `apps/web/app/api/portal/route.ts` passes no `configuration`, `checkout/route.ts:307-309` sets no trial fields, and the only live `trial_period_days` writer (`apps/desktop/src-tauri/src/sys/billing/stripe_client.rs:231`) targets local SQLite. **No shipped path can produce it.**
**Third enum:** `apps/web/shared/lib/stripe.ts:53-62` omits both `'paused'` and `'none'` — three in-repo enumerations disagree.
**Test asserts unreachable behavior:** `apps/web/__tests__/api/stripe-downgrade.test.ts:770-800` feeds `status: 'paused'` and asserts 200 — with a mocked DB, so the CHECK never runs.
No entitlement impact (`subscription-entitlement.ts:7`; `entitlement.test.ts:12-25`).

**Fix:** widen the status CHECK; add a status allowlist/normalizer at the webhook write site so an unknown future Stripe status degrades instead of wedging the webhook.

---

### I. Terminology & labels

---

**TRM-1 · MEDIUM · Mobile's paywall keeps a private plan-label table: "Max" instead of "Max 5x", and no `max_15x` entry at all**
_(merged: plan-capabilities + terminology ×2 + mobile-extension)_

**Where / what conflicts**

- `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:45-54` — hand-written `TIER_LABELS` with `max: 'Max'` (:51) and **no `max_15x` key**; `:75` `UNKNOWN_TIER_LABEL = 'a higher'`; lookup at `:111`; rendered at `:203` (_"Upgrade to {tierLabel}"_) and `:228` (_"{featureLabel} requires the {tierLabel} plan."_).
- `packages/contracts/types/src/billing-catalog.ts:95, 102` — `'Max 5x'` and `'Max 15x'`.
- **Same-screen contradiction:** `apps/mobile/src/features/settings/cloud-billing/index.tsx:105` renders the current plan via `getBillingPlanPricing(billingTier).label` → **"Max 5x plan"** (:234), while the sheet layered on that same screen says "Max".
- `apps/mobile/__tests__/paywall-bottom-sheet.test.tsx:161-166` pins the drift (`expect(getAllByText('Upgrade to Max'))`).

**CORRECTED — the "Upgrade to a higher" scenario is NOT currently reachable:**

- Billing screen: `getNextUpgradeTier(tier)` (:110) uses the **status-gated** store tier (`apps/mobile/src/features/billing/store.ts:138-140` → `effectivePlanTier`), and `handleUpgrade` (:136-142) returns early with a "Subscription managed elsewhere" Alert whenever `subscriptionGuard.blocked`, which is set from the **same** `isEntitledSubscriptionStatus` predicate (`subscriptionSource.ts:57`). Entitled Max → Alert; sheet-openable → tier already collapsed to `'free'` → `'basic'`. The second `expand()` at `:159` is dead (its row only renders under `!isFreeTier && FEATURES.billing`, :301).
- Chat screen: no producer mobile can reach emits `max_15x`. `getMinimumRequiredTier` is typed `'basic'|'pro'|'max'|null` (`model-catalog.ts:1447`); `auth-gate.ts:59/65` is literal `'pro'`; the only `required_plans: ['max_15x','enterprise']` route is `apps/web/app/api/media/video/generate/route.ts:456`, which **mobile never calls**.

**Reachable defect:** a mobile user picking a flagship above their tier gets 403 `{code:'model_not_available', requiredTier:'max'}` (`request-processor.ts:1822-1832`) → `apps/mobile/services/streaming.ts:370-374` → chat sheet at `apps/mobile/app/(app)/chat/[id].tsx:1390-1394` reads **"Upgrade to Max" / "This model requires the Max plan."** while Billing calls it "Max 5x". Missing `max_15x` is a latent gap that fires the moment any surface emits it.

**Fix:** delete `TIER_LABELS`/`UNKNOWN_TIER_LABEL`, resolve via `getBillingPlanPricing(requiredTier).label` (as `apps/web/features/chat/components/InlinePaywallCard.tsx:237` does), guard with `isBillingPlanTier`; update the test.

---

**TRM-2 · LOW · `/pricing` names the two free tiers "Local"/"BYOK"; the catalog, desktop and the rest of the marketing site say "Local Mode"/"Local Mode + BYOK"**
_(merged: pricing-marketing + terminology)_

**Where / what conflicts**

- `apps/web/app/pricing/page.tsx:203-204` — `formatPrivacyModeLabel('local')` / `('byok')`, rendered as tier-card titles at `:483` and `:513` and as compare-row labels at `:340-341, 357-358`. Every **other** card on the page uses the catalog label (`{basic.label}` :706, `{pro.label}` :731, `{max.label}` :759, `{max15x.label}` :783, `{team.label}` :555, `{BILLING_PLAN_PRICING.free.label}` :678).
- `packages/contracts/types/src/suite-contracts.ts:80-88` — `PRIVACY_MODE_DISPLAY` returns `'Local'` / `'BYOK'` — **trust-boundary badge labels**, a different concept.
- `packages/contracts/types/src/billing-catalog.ts:63, 69` — `'Local Mode'` / `'Local Mode + BYOK'`; surfaced via `PLAN_LABEL` (`design-system/user-identity.ts:13-15`) on desktop Plans modal (`apps/desktop/src/features/pricing/PlanCard.tsx:136`), web ChatHeader (`:75`), `packages/ui/unified-chat/src/components/UserProfile.tsx:177`.
- The rest of the site already says "Local Mode": `apps/web/app/local/page.tsx:24`, `signup/page.tsx:28`, `page.tsx:184`, `docs/page.tsx:36`.

**CORRECTED — two claimed sides dropped:** `packages/ui/i18n/locales/en/pricing.json:3` `"localOnly": "Local-only"` is a **dead key** (no `t('localOnly')` call anywhere; same for the stale `"max": "Max"` at :7). And `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1372-1373` is a **"Tier override"** developer control describing override behaviours, not plan names. So it is **two** names across screens, not four.

**Fix:** title the two cards with `BILLING_PLAN_PRICING['local-only'].label` / `.byok.label`; keep `formatPrivacyModeLabel` for provider badges; delete the dead dictionary keys.

---

**TRM-3 · LOW · Desktop plan card is titled "Max 5x" but its button says "Upgrade to Max", next to a card whose button says "Upgrade to Max 15x"**

**Where / what conflicts**

- `apps/desktop/src/features/pricing/PlanCard.tsx:92` — `ctaLabel: 'Upgrade to Max'`; `:103` — `ctaLabel: 'Upgrade to Max 15x'`; `:136/:153` — heading from `PLAN_LABEL[tier]` = **"Max 5x"**.
- `packages/contracts/types/src/billing-catalog.ts:95` — `label: 'Max 5x'`; `design-system/user-identity.ts:19` — `max: BILLING_PLAN_PRICING.max.label`.
- Both cards render side by side (`PlansModal.tsx:55`; `PLAN_SURFACE_VISIBILITY` billing-catalog.ts:144-145; mounted `App.tsx:1962`).

**CORRECTED — why low, not high:** no wrong-plan purchase is possible. `PlansModal.tsx:169` dispatches the typed `tier`, not the copy string, and `apps/desktop/src/features/pricing/DesktopUpgradeConfirmDialog.tsx:143` titles itself _"Upgrade to {pricing.label}"_ = **"Upgrade to Max 5x"** with the exact prorated amount (`:84, :150`) before any charge. The card also shows $100/mo, `"Max 5x — flagship models and higher usage"` (`user-identity.ts:31`), and a "5x managed usage capacity" bullet (`PlanCard.tsx:87`).
Note `apps/desktop/src/i18n/locales/en/pricing.json:7` also has `"max": "Max"` (all 13 locales) — but that file is stale (still lists `hobby`, missing `basic` and `max_15x`) and is not consumed by PlanCard.

**Fix:** render `Upgrade to ${PLAN_LABEL[tier]}` instead of hardcoded `ctaLabel`.

---

**TRM-4 · LOW · The scheduling surface is "Schedules" on web and mobile, "Scheduled" in the desktop sidebar**

**Where / what conflicts**

- `apps/web/features/chat/v3/WebSidebar.tsx:98` — `{ id: 'schedules', label: 'Schedules', … }`; `apps/mobile/src/features/drawer/components/DrawerContent.tsx:111` — `label: 'Schedules'`.
- `apps/desktop/src/i18n/locales/en/v3.json:91` — `"scheduled": "Scheduled"`, rendered at `apps/desktop/src/features/v3/Sidebar.tsx:160/171/203/211`, routed via `:323` → `DesktopShellV3.tsx:601-606` to either `DesktopCloudSchedules` (h1 **"Schedules"**, `:724`) or `AgiWorkScheduled` (h1 **"Scheduled tasks"**, `v3.json:351`).

**CORRECTED — narrower than reported:** "Scheduled tasks" is **not** a desktop-only third name; it is the cross-surface term for the _metered unit_ (`apps/mobile/app/(app)/schedules/index.tsx:143, 203, 335` uses it on the same screen headed "Schedules" at `:291`; `DesktopCloudSettingsModal.tsx:556` matches the contract field `maxScheduledTasks`). And `"routines": "Routines"` (`v3.json:94`) is **dead** — `grep sidebar.nav.routines` returns zero hits. The real defect is a **single string**: an adjective where every other surface uses the noun.

**Fix:** change `v3.json:91` to `"Schedules"` (and the same key in the other locale dirs under `packages/ui/i18n/locales/*/v3.json`, which is the bundle desktop actually loads). Delete the dead `routines` key.

---

**TRM-5 · LOW · Project knowledge files are "Sources" on the project page and "Files" in the settings modal — on the same surface**

**Where / what conflicts**

- `apps/web/app/chat/projects/[id]/page.tsx:619` — tab bar renders `{t === 'chats' ? 'Chats' : 'Sources'}`; `:750` renders `<SourcesPanel projectId={project.id} />`.
- `apps/web/features/projects/components/ProjectSettingsDialog.tsx:216` — the same knowledge-file list, section header **"Files"**. Both panels hit `/api/projects/${projectId}/knowledge-files`. The page's own comment at `:37` acknowledges it: _"Knowledge files live inside the settings modal under \"Files\"."_

**CORRECTED — the cross-surface claim is wrong:** in the managed-cloud path all three surfaces already agree on **"Sources"**: web page `:619`, desktop managed cloud `apps/desktop/src/features/chat/ProjectSettingsDialog.tsx:739`, mobile `apps/mobile/app/(app)/projects/[id].tsx:110`. Desktop's local-mode **"Knowledge"** label (same ternary at `:739`) is deliberate trust-boundary labelling — the two branches render entirely different backends (`desktopCloudProjectKnowledge` with `request.assertBoundary()` vs on-device `knowledgeBaseFiles`; `:262` writes `knowledgeBaseFiles: isManagedCloud ? [] : …`). And desktop's separate **"Files"** tab (`:743-745`, panel `:984-986`) is a **different entity** (`ProjectFile` disk-path references, state `:150`, picker `:310`) from the Knowledge tab's `KnowledgeBaseFile` (`:154`) — two stores, correctly two tabs, no collision with web. Mobile "Sources" is a third, local-only store (`ProjectSourcesTab.tsx:16-18`).

**Fix:** rename the web settings-modal section from "Files" to "Sources". One-line copy change.

---

**TRM-6 · LOW · The pricing page offers the same sales handoff under two button names on adjacent cards**

**Where / what conflicts**

- `apps/web/app/pricing/page.tsx:580-581` — Team CTA `<Link href="/contact-sales?plan=team">{t('talkToSalesCta')}</Link>` = **"Talk to sales"**; `:613-614` — Enterprise CTA `<Link href="/contact-sales">{t('contactSalesCta')}</Link>` = **"Contact sales"**. Both inside the same `agi-tier-grid--featured` (`:552-618`), so both are visible at once. Hero uses a third instance at `:459-460`.
- `apps/web/app/i18n/locales/en/pricing.json:7` `"talkToSalesCta": "Talk to sales"`, `:42` `"teamCta": "Contact sales"` (**unrendered** — `page.test.tsx:84` asserts absence), `:52` `"contactSalesCta": "Contact sales"`.

**CORRECTED canonical label:** the finder argued for "Contact sales" from the route slug and the mobile paywall. Reading the destination refutes that — `apps/web/app/contact-sales/page.tsx:19` renders `<h1>Talk to sales.</h1>`; only the non-visible SEO `title` at `:7` says "Contact sales". Two of the three rendered CTAs already say "Talk to sales". And mobile is a **third** variant, title-cased: `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:248` `title="Contact Sales"`.
**Also ships in Spanish:** `apps/web/app/i18n/locales/es/pricing.json:7` "Hablar con ventas" vs `:52` "Contactar ventas"; the dead `teamCta` key has itself drifted between locales (en `:42` "Contact sales" vs es `:42` "Hablar con ventas"). Duplicated again at `packages/ui/i18n/locales/{en,es}/pricing.json:102`.

**Fix:** change `page.tsx:614` to `t('talkToSalesCta')`; delete `teamCta` from both bundles and from `apps/web/lib/__tests__/public-billing-copy.test.ts:139,143`.

---

**TRM-7 · LOW · `/api/me` prints the raw tier enum as the plan name — "Max_15x" in the chat sidebar vs "Max 15x plan" in Billing**

**Where / what conflicts**

- `apps/web/app/api/me/route.ts:176-180` — `display_name: (plan_tier||'free').charAt(0).toUpperCase() + (plan_tier||'free').slice(1)` → **"Max_15x"**, **"Max"**.
- `apps/web/shared/stores/web-auth-store.ts:133-140` copies it unmodified into `display_name` and `plan_name`.
- `apps/web/features/chat/v3/WebSidebar.tsx:170` — `subscription?.display_name ?? 'Free'`, rendered at `:619` in the persistent account row (`WebShellV3.tsx:11, 140`).
- `packages/contracts/types/src/billing-catalog.ts:95, 102` — `'Max 5x'`, `'Max 15x'`.
- **Billing already fixed exactly this**, and its comment names the sidebar defect: `apps/web/features/settings/sections/BillingSection.tsx:266-271` — _"The catalog label first: `display_name` carries the raw tier key from the subscription row, which rendered as \"Max_15x plan\" instead of \"Max 15x\"."_
- Reachable: `apps/web/lib/price-tier-mapping.ts:57` maps the Stripe price to `tier: 'max_15x'`.
- **Two tiers affected:** `max` → "Max" vs catalog "Max 5x" (reads as a different product, not a formatting glitch).

**Fix:** emit `getBillingPlanPricing(plan_tier).label` from `/api/me:178` so no client re-derives it.

---

### J. Mobile, extensions & store metadata

---

**MOB-1 · HIGH · App Store and Play Store listings advertise image generation on the free tier**

**Where / what conflicts**

- `apps/mobile/store-listing/LISTING-METADATA-IOS.json:31` (`"schema": "app-store-connect-2026"`, `"version": "1.2.0"`) — _"AGI Cloud is in public alpha: sign in to unlock cloud chat, **image generation**, and web search on a free tier…"_
- `apps/mobile/store-listing/LISTING-METADATA-ANDROID.json:22` — identical sentence in `full_description`.
- **Also in the release notes** (finder missed): `LISTING-METADATA-IOS.json:33` `whats_new` and `LISTING-METADATA-ANDROID.json:97` `release_notes_v1_2_0` — _"• Cloud chat, image generation, and web search available on Cloud"_.
- `packages/contracts/types/src/billing-catalog.ts:203` — `image_generation: PRO_TIERS` (:191). Contrast `CLOUD_CHAT_TIERS` (:190), which **does** include free and backs `managed_chat`/`chat_tools`.
- `apps/web/app/api/media/image/generate/route.ts:667-686` — `userTier = plan_tier?.toLowerCase() || 'free'` then 403 `plan_upgrade_required`. Fails closed.
- Observable: `apps/mobile/lib/v1FeatureFlags.ts:139` `imageGen: true`; `apps/mobile/services/api.ts:321` comments on the 403; `PaywallBottomSheet.tsx:64` maps `image_generation: 'AI image generation'`.
- Third public surface contradicts the listings: `apps/web/app/pricing/page.tsx:154` renders image generation as **"No"** for Free.

**Scope:** only "image generation" in that three-item list is wrong — cloud chat and web search are free-tier correct.
**Context:** `apps/mobile/store-listing/` was last touched by commit `93ca123df` _"remove … false app store metadata claims"_ — this one was missed.

**Fix:** lift image generation out of the free-tier sentence in **all four** strings. Add a store-metadata test grepping the descriptions against `BILLING_PLAN_CAPABILITY_TIERS`.

---

**MOB-2 · MEDIUM · Store metadata tells reviewers the in-app upgrade CTA opens a web checkout; the app deliberately never opens one**

**Where / what conflicts**

- `apps/mobile/store-listing/LISTING-METADATA-IOS.json:90` — _"the in-app 'Upgrade to \<Tier\>' CTA opens a web checkout (agiworkforce.com/pricing) in-browser rather than a StoreKit product — see FOUNDER-SUBMISSION-CHECKLIST.md for the open Guideline 3.1.1 question."_ Same claim at `LISTING-METADATA-ANDROID.json:89`.
- `apps/mobile/src/features/settings/cloud-billing/index.tsx:136-141` — `handleUpgrade` is the only upgrade entry point and calls `paywallSheetRef.current?.expand()`. It never constructs a checkout URL.
- `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:267` — _"Upgrades aren't available in the app yet. Check back soon."_ for every self-serve tier (`salesTier` branch at `:245-256` opens `/contact-sales`, a lead form).
- `apps/mobile/lib/v1FeatureFlags.ts:58` `billing: false` disables the only other external-payment path (`handleManageBilling`, `cloud-billing/index.tsx:143-159`, which also falls back to the sheet).
- `grep -rn "agiworkforce.com/pricing" apps/mobile` → **only the two metadata files**.

**Second defect in the same cluster:** the referenced files **do not exist** — `find` for `REVIEWER-NOTES-IOS.md`, `REVIEWER-NOTES-ANDROID.md`, `FOUNDER-SUBMISSION-CHECKLIST.md` returns nothing, yet both JSONs set `notes_file` / `play_console_review_notes_file` to them.
**Third:** `cloud-billing/index.tsx:5-6` (_"an upgrade / manage path via the Stripe portal (or the pricing page for free users)"_) contradicts `:9-12` (_"NEVER opens an external checkout URL (Apple Guideline 3.1.1)"_) in the same comment block.
**Why medium:** nothing consumes these JSONs programmatically (`grep "LISTING-METADATA"` across ts/js/yml/json/rb/sh → zero); they are founder worksheets hand-copied into the consoles. Still a real rejection vector — copied verbatim it is a self-reported external-checkout-for-digital-goods disclosure.

**Fix:** rewrite both notes to state there is no IAP and no in-app checkout handoff; remove the dead 3.1.1 reference and the missing `notes_file` pointers; fix the docstring.

---

**MOB-3 · MEDIUM · Mobile keeps `FEATURES.billing = false` to avoid external subscription-management links, then opens one labelled "Manage on web"**

**Where / what conflicts**

- `apps/mobile/lib/v1FeatureFlags.ts:50-58` — _"Billing / subscription MANAGEMENT — specifically the \"Manage billing\" Stripe Customer Portal link… Stays false on mobile: opening an external checkout/management link for a subscription from inside the app risks Apple Guideline 3.1.1."_
- `apps/mobile/src/features/settings/cloud-billing/index.tsx:316` — the "View invoices" row calls `openExternalUrl('https://agiworkforce.com/billing')` with **no** `FEATURES.billing` check. That URL redirects (`apps/web/app/billing/page.tsx:25`) to `/settings/billing` → `BillingSection.tsx`, which hosts "Manage billing" (Stripe portal, `:389`), "Upgrade/Adjust plan" (`:372`) and "Update payment method" (`:472`) — exactly the surface the flag suppresses.
- **Strongest side (finder missed):** `cloud-billing/index.tsx:123` — `onPress: () => void openExternalUrl(managementUrl)` under the label `subscriptionGuard.managementActionLabel` = **"Manage on web"** (`apps/mobile/src/features/billing/subscriptionSource.ts:62-63`) pointing at `https://agiworkforce.com/settings/billing` (`:34`). It fires from `handleUpgrade` (`:136-142`) for any **entitled** subscriber — so a paying Stripe subscriber tapping "Adjust plan" gets an external link, and the PaywallBottomSheet the header comment promises never appears.

**CORRECTED — drop the "Workspace administration" side:** `agiworkforce.com/settings/team` is workspace/membership controls, not billing, and is gated on `team_admin` (`:109`).
**Minor:** two literals for the same destination (`/billing` vs `/settings/billing`), reconciled only by the redirect.

**Fix:** gate both rows on `FEATURES.billing` (as `:296` already does), or restate what the flag actually covers.

---

**MOB-4 · MEDIUM · The Chrome extension says AGI Cloud needs only a sign-in, then refuses all managed chat below Pro**

**Where / what conflicts**

- **Strongest side — pre-sign-in prompt, cost disclosure hidden:** `apps/extension/src/side_panel.ts:6577-6579` — _"Sign in to use AGI Managed Cloud chat."_; `:6590-6592` — _"Sign in to start chatting in Chrome."_; **`:6584` `quotaWrap.style.display = 'none'`** — the "requires Pro or higher" notice is hidden until _after_ OAuth. Inline comment at `:6503-6506` — _"AGI Cloud is public alpha (open by default once signed in)"_.
- `apps/extension/src/features/cloud-bridge/InviteCodeModal.ts:302-306` — _"AGI Cloud is in public alpha — sign in to start using it, no invite needed."_; `:405` — _"No code needed for AGI Cloud — just sign in."_ Mounted from the drawer at `side_panel.ts:6514-6527`.
- `apps/extension/src/features/cloud-bridge/managedChatHandler.ts:393-400` — `if (!canUseBillingPlanCapability(tier,'developer_surfaces'))` → `plan_required`, _"AGI in Chrome requires Pro or higher."_
- `apps/extension/src/side_panel.ts:6724, 6733-6737` — quota label, Upgrade CTA, and `setManagedCloudChatState('unavailable')` which **disables the composer** (`:243-247`, placeholder "AGI Cloud access required").
- Server-enforced too: `apps/web/lib/free-chat-surface-policy.ts:25, 101-104`; `services/api-gateway/src/middleware/planGate.ts:78`; `packages/contracts/types/src/billing-catalog.ts:206`. Marketing agrees: `apps/web/app/pricing/page.tsx:157-158` lists "CLI, Chrome & VS Code" under `developer_surfaces`.
- No BYOK/local fallback exists in the side panel — a below-Pro user gets nothing after signing in.

**Blocker:** `apps/extension/__tests__/cloud-public-alpha-copy.test.ts:112-120` currently asserts the sign-in-is-enough framing and will lock in the misleading phrasing.

**Fix:** show the Pro requirement **before** sign-in (unhide `quotaWrap` or add a caveat); scope the modal copy to Chrome; update the test.

---

**MOB-5 · LOW · Chrome side panel prints the raw tier enum as the plan name — "Max_15x plan" and a "MAX_15X" badge**

**Where / what conflicts**

- `apps/extension/src/features/cloud-bridge/managedModelPicker.ts:146-150` — `formatManagedTierLabel` upper-cases the first char of the raw tier id and appends `" plan"`.
- `apps/extension/src/side_panel.ts:6711` — `quotaBadgeEl.textContent = access.subscriptionTier.trim().toUpperCase();` (branch gated on `developer_surfaces`, which max_15x satisfies).
- `packages/contracts/types/src/billing-catalog.ts:100-106` — `label: 'Max 15x'`; the shared map `packages/contracts/types/src/design-system/user-identity.ts:13-23` `PLAN_LABEL` is exported via `index.ts:148` and consumed by desktop (`PlanCard.tsx:136`, `UsageDashboard.tsx:137`). The extension already imports `@agiworkforce/types` (`side_panel.ts:7-16`) and ignores it.
- Tier values are the raw server `plan_tier` (`freeTrialClient.ts:210-211`; `managed-usage-balance.ts:83`).

**CORRECTED scope:** **two** tiers affected, not one — `max` → "Max plan"/"MAX" against catalog `'Max 5x'` (ambiguous between the two Max tiers). The `'local-only'` case is **not** observable — that value never reaches this code path. Free/basic/pro/team/enterprise round-trip correctly.
**Minor drift in the same widget:** `side_panel.ts:6426` seeds `'Free tier'` while `formatManagedTierLabel('free')` later writes `'Free plan'`.

**Fix:** use `PLAN_LABEL` / `getBillingPlanPricing(tier).label` for both the row and the badge.

---

### K. Flags & gates

---

**FLG-1 · MEDIUM · The managed-compute incident kill-switch does not stop managed compute on Web: free-tier chat is explicitly exempted, and the admin console says otherwise**

**Where / what conflicts**

- `apps/web/lib/managed-compute-gate.ts:51-61` — when the switch is engaged, returns `null` (allow) for any `descriptor.isFreeTrial`.
- `apps/web/app/api/llm/v1/chat/completions/route.ts:244-245` — `isFreeTierRequest = !subscription || !plan_tier || plan_tier.toLowerCase() === 'free'`, passed at `:253`. Same predicate at `.../completions/approve/route.ts:121-122, 129`.
- `services/api-gateway/src/middleware/managedComputeGate.ts:106` — denies **every** request, no carve-out; its descriptor (`:29-33`) has no `isFreeTrial` field.
- `apps/web/features/admin/pages/AdminConsolePage.tsx:27/85/132` — reports unconditionally _"Temporarily disabled (incident kill-switch)"_ / _"Managed compute temporarily disabled (incident kill-switch)"_, reading the same env via `isManagedComputePrivateBetaEnabled()` (`:100`).
- `CLAUDE.md:50` (mirrored `AGENTS.md:19`, `docs/00-foundation/owner-decision-register.md:48`) — _"…remains ONLY as an incident-response kill-switch (set to `0`/`false`/`off` to re-gate)."_ No exemption documented.

**CORRECTED:** this is **deliberate but undocumented**, not "a leftover from the pre-2026-06-27 era" — the JSDoc at `managed-compute-gate.ts:14-21` documents it, and two tests assert it under kill-switch framing (`managed-compute-gate.test.ts:57-67`; `__tests__/priority-level-1/security/privacy-boundary.test.ts:110-119`). Only the inline comment at `:52-54` is stale.
**Blast radius is narrower than claimed:** only the two chat-completions routes pass `isFreeTrial`. The other four callers stay hard-denied (`media/image/generate/route.ts:611-617`, `media/video/generate/route.ts:407`, `audio/transcriptions/route.ts:90`, `settings/test-provider/route.ts:90`). The switch does stop most managed compute — it fails only for free-tier chat.
**Second defect in the same pair:** `managed-compute-gate.ts:18-19` states the precondition _"Set this only after the auth gate has confirmed the subscription is 'free' AND the model is in the economy allow-list."_ Neither caller honors it — `route.ts:244` keys on `plan_tier` alone, and the gate runs at `:247` **before** `processRequest` (`:260`) parses the body, so the model isn't known yet.

**Fix:** either remove the carve-out (matching the gateway) or document it and give free-tier its own separate switch. Fix the admin console copy either way. Fix the stale inline comment.

---

**FLG-2 · LOW · The Web MCP kill-switch still returns "private beta only" after the private-beta gate was removed**

**Where / what conflicts**

- `apps/web/app/api/mcp/route.ts:41-46` — _"Open by default (2026-07-11), mirroring the managed-compute public-alpha kill-switch pattern… the env var is retained ONLY for incident response."_
- Same file, `:61-68` — `error: 'Web MCP connections are private beta only.'`, code `WEB_MCP_PRIVATE_BETA_REQUIRED`.
- `apps/web/lib/managed-compute-gate.ts:66-68` — the pattern it names uses incident-honest copy: _"Managed compute is temporarily unavailable. Use Local or BYOK in the meantime, or try again shortly."_
- Rendered: `apps/web/features/connectors/pages/ConnectorsPage.tsx:151-157, 179`.

**CORRECTED scope:** `managed-compute-gate.ts` deliberately kept its **stale internal identifiers** (`type: 'managed_compute_private_beta'` :68, `code: 'public_launch_blocked'` :69) and fixed only the user-visible text. So mirroring the pattern means changing **only** the `error` string at `route.ts:64` — renaming the code would break `apps/web/__tests__/api/mcp.security.test.ts:88`. Default is open (`:47-50`), so this only fires when an operator explicitly re-gates.
**Note:** that test is already titled _"fails closed when the incident-response kill-switch is explicitly disabled"_ and asserts only `body.code` — the stale message is not test-locked.

**Fix:** change the message to incident-honest copy.

---

**FLG-3 · LOW · The cloud-only Electron shell ships a Local/Cloud toggle and "Use Local Mode" copy; the same bundle refuses Local with "Local mode requires the desktop app"**

**Where / what conflicts**

- `apps/desktop/AGENTS.md:47-49` — _"The Electron shell is Managed Cloud only, permanently. It must never gain a Local mode…"_
- `apps/desktop/src/features/auth/AuthPage.tsx:48` — _"Local Mode stays available without an account."_; `apps/desktop/src/features/auth/NativeSignInCard.tsx:782-786` — a "Use Local Mode" button wired to `setMode('local')`; `apps/desktop/src/features/v3/LocalCloudToggle.tsx:143` renders a selectable Local segment (mounted unconditionally at `Sidebar.tsx:864`).
- `apps/desktop/src/stores/appModeStore.ts:71-74` — `if (!supportsLocalAppMode && mode === 'local') { toast.info('Local mode requires the desktop app'); return; }` — inside a signed, notarized desktop app (`electron/main.ts:435` `app.setName('AGI Cloud')`).

**CORRECTED — scope is much narrower:** the **default** Electron renderer does not run this bundle. `apps/desktop/electron/config.ts:22-23` defaults `RENDERER_MODE` to `'remote'`, and `electron/main.ts:424` loads `https://agiworkforce.com/chat` (`apps/web`'s `WebChatPage`) — which has no LocalCloudToggle, AuthPage or NativeSignInCard. The dead-end is reachable only in the `AGI_CLOUD_RENDERER=bundled` fallback (`AGENTS.md:57-61`).
**Not a trust-boundary violation:** `appModeStore` fails **closed**, exactly as `AGENTS.md:47-49` mandates. And the toggle itself is deliberate (`LocalCloudToggle.tsx:5-18` documents rendering both segments on every runtime and delegating to the guard). The genuine defects are the **copy**: `AuthPage.tsx:48`, `NativeSignInCard.tsx:786`, and the toast wording at `appModeStore.ts:72` (written for a browser, false inside a packaged desktop app).

**Fix:** gate the "Use Local Mode" button and the AuthPage line on `supportsLocalAppMode`; reword the toast to _"This app is Cloud-only. Local mode runs in the AGI Desktop (Tauri) app."_

---

## 4. DEDUPE LOG

| Merged into                        | Absorbed from                                               |
| ---------------------------------- | ----------------------------------------------------------- |
| **MKT-1** (Free "frontier models") | `pricing-marketing` + `plan-capabilities`                   |
| **MKT-3** (AGI Web "Coming soon")  | `pricing-marketing` + `marketing-claims` + `flags-gates`    |
| **MKT-4** (Desktop availability)   | `marketing-claims` ×2 + `flags-gates`                       |
| **USG-1** (Free "daily allowance") | `pricing-marketing` + `usage-limits`                        |
| **TRM-1** (mobile `TIER_LABELS`)   | `plan-capabilities` + `terminology` ×2 + `mobile-extension` |
| **TRM-2** (free-tier naming)       | `pricing-marketing` + `terminology`                         |
| **CAP-6** (image-gen 403 prose)    | `plan-capabilities` + `usage-limits`                        |

---

## 5. COVERAGE GAPS (carried forward from the sweeps — not findings)

**Could not verify from the repo:**

- **Live Stripe account.** `apps/desktop/src/constants/pricing.ts:26-29`'s `price_1Sgwx*` ids were not read against Stripe; the desktop Max-yearly concern rests on the catalog/checkout-schema contradiction only.
- **`.env.local` / Vercel project env.** Read access was denied, so the deployed values of `NEXT_PUBLIC_CHECKOUT_ENABLED`, `STRIPE_CHECKOUT_ENABLED` and `AGI_MANAGED_COMPUTE_PRIVATE_BETA` are unknown. If production inherited `.env.example`'s `=false`, several "latent" items become live.
- **SQL bodies.** `reserve_managed_usage_request_with_limits` and `get_credit_balance` (migrations 0020/0037/0070) were reasoned about from their TS callers, not opened. Exact comparison semantics for a `0` cap are asserted from caller comments.
- **Upstream reality:** whether the six `modelcontextprotocol/servers` entries on the MCP Directory still exist, and whether the VS Code extension is marketplace-listed.

**Not audited:**

- `apps/web/features/settings/services/user-preferences.ts` (1188 lines) — possible additional persisted-but-unread preferences.
- `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts` (1700+ lines) — individual webview controls not traced to config writes.
- `apps/desktop` mobile-companion, voice, connectors and MCP sub-panels — not traced control-by-control.
- `apps/desktop/src/features/marketplace/**` (~3.9k lines) — enumerated and grepped, not audited.
- Non-English locale bundles — spot-checked for `max`/`hobby` keys only. **Note:** ten of twelve locales carry only 65 of 175 pricing keys, so a German or Japanese visitor sees an all-English pricing page (fallback via `packages/ui/i18n/src/index.ts:67`). Coverage gap, not a contradiction.
- No test suite was run; every finding is from source inspection of both sides.

**Observed but excluded under the two-quoted-sides rule (dead code / single-sided):**

- `memory_personalization` and `cloud_sync` are declared in `BillingPlanCapability` (`billing-catalog.ts:179-181`) with **zero readers repo-wide**.
- `skills_connectors` / `chat_tools` are rendered in plan tables (`pricing/page.tsx:152`, `DesktopCloudSettingsModal.tsx:493`) but no route enforces either (currently harmless — both resolve "Yes" for every managed tier).
- `crates/agiworkforce-protocol/bindings/PlanType.ts` declares a foreign plan vocabulary (`'go'|'plus'|'prolite'|'business'|'edu'`) re-exported through `packages/contracts/types/src/generated/protocol/` and consumed by `RateLimitSnapshot.plan_type`. **Needs a follow-up check that no surface renders an upstream provider's plan name as the user's AGI plan.**
- `apps/desktop/src/stores/chatPreferencesStore.ts` is an orphan duplicate of `stores/settings/chatPrefs.ts` sharing the **same localStorage key** (`'agiworkforce-chat-preferences'`) with a different shape. Nothing imports it today — a live collision hazard if ever imported.
- `apps/mobile/app/(app)/chat/[id].tsx:344` and `(tabs)/chat.tsx:243` carry stale gate copy (_"Cloud chat will be enabled when the mobile Cloud release is active"_) contradicting the public-alpha rule, but `v1FeatureFlags.ts` hardcodes `cloudChat: true`, so the branch is unreachable.
- Desktop "Credits" (cents, `AccountSettings.tsx:253`) vs web "Usage" (percentages, `UsageSection.tsx:158`) name the metering concept differently; the code alone did not establish they render the same server ledger. **Strongest remaining lead** — needs the metering-contract owner.
- `apps/web/features/billing/pages/BillingDashboard.tsx` + `features/billing/components/Billing/*` are unrouted dead code still carrying _"Payment successful! Your subscription has been upgraded."_ and a hardcoded `cancelAtPeriodEnd: false`.
- `apps/web/features/billing/components/Billing/Subscription.tsx:566` wires the Enterprise "Contact Sales" button to `onUpgrade('enterprise','monthly')` rather than a sales link.
