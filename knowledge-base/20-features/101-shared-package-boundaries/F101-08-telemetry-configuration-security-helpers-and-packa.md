---
id: "F101-08"
type: "feature"
title: "Telemetry, configuration, security helpers and package runtimes"
aliases: ["Product analytics vocabulary", "validate-env", "Config key registry", "check:config-keys", "Secret redaction registry", "REDACTION_POLICIES", "check:security-helpers", "Package runtimes", "check:package-runtimes", "S101.34, S101.36, S101.37, S101.38"]
area: "101 Shared package boundaries"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S101.34", "S101.36", "S101.37", "S101.38"]
depends_on: ["surface:web", "surface:mobile", "surface:chrome", "surface:vscode", "surface:cli", "surface:desktop", "SYS-observability-and-operations", "SYS-security-and-privacy", "SYS-api-and-contracts", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "mode:cloud", "mode:local", "api:POST /api/analytics/events", "file:scripts/config/package-runtimes.json"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F101-08 Telemetry, configuration, security helpers and package runtimes

Four shared rules for engineers. One list of analytics events and consent checks. A web start-up check that refuses bad production settings. One registry of secret patterns used for logs, telemetry and support text. A file declaring where each shared package may run, checked by a guard.

Area: [101. Shared package boundaries](README.md). Requirement items: [S101.34](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10134), [S101.36](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10136), [S101.37](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10137), [S101.38](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10138).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Defines the analytics event vocabulary and consent-gated emitter shared in packages/contracts/types; validates web server configuration at start-up and classifies every environment key; keeps one registry of secret-matching rules with named redaction policies; and declares for each shared package entry point whether it may run in universal, browser, server, native or asset contexts, with a guard on the import graph (packages/contracts/types/src/product-analytics.ts; apps/web/lib/validate-env.ts; packages/platform/utils/src/secretRedaction.ts; scripts/config/package-runtimes.json).

**Why it exists.** A misconfigured production deploy, a leaked secret in a log, a server-only module bundled into a phone app, or an invented analytics event name are expensive and hard to see. Making each a shared rule with a guard stops drift. AGENTS.md section 6 requires security behaviour to fail closed and section 9 forbids silent failures (doc: AGENTS.md).

**Who uses it.** Engineers and operators. Testers do not see it directly. People notice it only as a redaction marker in logs or support text, or when a bad deploy is refused.

**Problems it solves**

- Test-mode payment keys running in production (apps/web/lib/validate-env.ts:319-345).
- An environment key that nobody classified as secret or public (scripts/check-config-keys.mjs:1-10).
- Two surfaces redacting different secrets, or one leaking what the other hides (scripts/check-security-helpers.mjs:3-12).
- A browser or phone bundle pulling in a Node module or a server-only package (scripts/check-package-runtimes.mjs:3-22).
- Analytics events with free-form properties that could carry personal data (packages/contracts/types/src/product-analytics.ts, property allowlist).

**Use cases**

- Operator deploys with a test Stripe key to production and the server refuses to start.
- Engineer adds NEW_KEY to a web file and check:config-keys fails until it is registered.
- A log line containing an API key appears with a [REDACTED_*] marker.
- Engineer exports a new helper from a shared package and must declare its runtime in package-runtimes.json.

## 2. User experience

**Where to find it**

- Not a screen. Start-up log of the web server prints validation results (apps/web/lib/validate-env.ts:1936-1958).
- Mobile and Web privacy settings: a Product analytics consent control exists on Mobile (apps/mobile/src/features/settings/cloud-privacy/ProductAnalyticsConsentGroup.tsx; visible label not read, so unknown) and the contract names the web path /settings/privacy as the place to choose (packages/contracts/types/src/product-analytics.ts, PRODUCT_ANALYTICS_CHOICES_PATH).
- Web cookie preferences gate analytics on Web (apps/web/shared/lib/product-analytics.ts:12,28).

**Before you start**

- Analytics: consent. Web needs cookie preference allowing analytics; other apps need account consent recorded under the product_analytics purpose.
- Config validation: a deployed web server (Node runtime).

**Screens and controls**

- Mobile: ProductAnalyticsConsentGroup inside PrivacyCloudControls (apps/mobile/src/features/settings/cloud-privacy/).
- VS Code: the editor telemetry setting and the extension telemetry setting both must be on (apps/extension-vscode/src/features/analytics/productAnalytics.ts, isEnabled).
- CLI: config.telemetry.product_analytics and the DISABLE_TELEMETRY or DO_NOT_TRACK environment variables (apps/cli/src/cloud/product_analytics.rs:20-31).
- Operator: environment variable AGI_ALLOW_INVALID_ENV=1 to boot degraded (apps/web/instrumentation.ts:60).

**Journey**

1. 1. Operator starts the web server. instrumentation.ts runs validateEnvironment and logs errors and warnings.
2. 2. If errors exist in a production build and AGI_ALLOW_INVALID_ENV is not 1, start-up throws and the server does not boot.
3. 3. A person using an app grants analytics consent. The surface's emitter queues allowed events and sends batches to the web ingest route.
4. 4. A log, telemetry or support text passes through a redaction policy; secrets become markers.
5. 5. Engineer adds code. Guards for config keys, security helpers and package runtimes run in the guard chain (package.json:397).

**What the person sees and gets**

- Operator: console lines 'Environment validation failed with N error(s)' and the sentence 'Set AGI_ALLOW_INVALID_ENV=1 to boot anyway (degraded)' (apps/web/instrumentation.ts:56-63).
- Person: ingest returns { accepted: 0, consent: 'withheld' } with status 202 when consent is missing (apps/web/app/api/analytics/events/route.ts:34-36).
- Redaction markers such as [REDACTED_API_KEY], [REDACTED] and [redacted:jwt] depending on policy (packages/platform/utils/src/secretRedaction.ts:402-470).
- Engineer: guard failures naming the file and the rule.

**Settings**

- Web cookie preference for analytics.
- Mobile product analytics consent.
- VS Code telemetry settings.
- CLI telemetry.product_analytics config and opt-out environment variables.
- AGI_ALLOW_INVALID_ENV (operator escape hatch, web server).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web start-up validation: instrumentation.ts runs validateEnvironment in the Node runtime, logs results, records a configuration-state metric, and in production throws unless AGI_ALLOW_INVALID_ENV is 1 (apps/web/instrumentation.ts:36-63). validateEnvironment runs 15 checks including Stripe key-mode consistency, key types, the config-key registry and deployed values (apps/web/lib/validate-env.ts:1907-1925).
- Stripe check: secret and publishable keys must share a mode; test-mode keys on a production deployment are an error; the message names AGI_ALLOW_INVALID_ENV=1 as the only override for an incident deployment; live keys on preview or development are also errors (apps/web/lib/validate-env.ts:319-360; apps/web/lib/__tests__/validate-env.test.ts:325-349).
- Config key registry: every key web reads must be registered in validate-env.ts or recorded with a reason in scripts/config/config-keys.json. A NEXT_PUBLIC_ key whose name says it is a credential fails unless it is on a short published list (scripts/check-config-keys.mjs:19-36,92-115).
- Secret registry: SECRET_PATTERN_RULES holds the patterns; SECRET_DETECTION_RULES lists those the web leak detector reads; REDACTION_POLICIES defines four policies named log, telemetry, content and evidence; redactWithPolicy applies one (packages/platform/utils/src/secretRedaction.ts:32,377,402,495). The web secret pattern list is built from this registry rather than copied (apps/web/lib/security/secret-patterns.ts:10-38). The redactSecrets function in the logger is the shared log redactor (packages/platform/utils/src/logger.ts:107).
- Surfaces using the shared redactor: VS Code applies the telemetry policy (apps/extension-vscode/src/core/telemetry.ts:1-5); Chrome calls redactSecrets from the logger in its background policy and content script (apps/extension/src/background/policy.ts:2,450; apps/extension/src/content.ts:22,1238); Mobile imports it in streaming and message rendering code (apps/mobile/services/streaming.ts; found by search, usage not read).
- check:security-helpers requires redactSecrets, isPathInside, sealEnvelope and openEnvelope each to be declared once and bans raw cipher calls outside apps/web/lib/crypto, with one recorded exemption for web push (scripts/check-security-helpers.mjs:19-35).
- Package runtimes: scripts/config/package-runtimes.json declares 231 entry points across 56 packages: 192 universal, 28 server, 8 asset, 2 browser, 1 native (counted from the file). The guard checks each entry's static import graph and walks four client bundles (web client components, mobile app, Chrome extension, VS Code webview) so none reaches a Node built-in, server-only entry or the web crypto envelope (scripts/check-package-runtimes.mjs:3-22,168-200,340-440).
- Analytics vocabulary: event names, surfaces (web, desktop, mobile, cli, vscode, chrome, api), outcomes, an allowlist of property keys, a normaliser that rejects unknown events, and two emitters (generic and account-consent based) live in one file (packages/contracts/types/src/product-analytics.ts). The server ingest route normalises each event again and drops any without account consent (apps/web/app/api/analytics/events/route.ts:25-60).
- Analytics is used by more surfaces than the brief says: Web (apps/web/shared/lib/product-analytics.ts), VS Code (apps/extension-vscode/src/features/analytics/productAnalytics.ts), Chrome (apps/extension/src/features/observability/productAnalytics.ts), Mobile (apps/mobile/services/productAnalytics.ts) and the CLI, which embeds the TypeScript contract file at compile time (apps/cli/src/cloud/product_analytics.rs:9-10).

**Incomplete**

- Config validation covers only the web server; Mobile, Chrome, VS Code, Electron and the CLI validate configuration their own way (brief S101.36; the Electron, Mobile and CLI files were not opened).
- The CLI has its own Rust redaction module (apps/cli/src/secret_redaction.rs:1-30) beside the TypeScript registry. Whether a test ties the two rule sets together was not found.
- The brief says parity tests compare shared rules with the web copy. The parity test compares each policy's output with a recorded fixture of earlier call-site outputs (packages/platform/utils/src/__tests__/secretRedaction.parity.test.ts:1-22), and the web list now derives from the registry. Not a comparison with a separate web copy.
- Mobile, VS Code and the CLI send analytics only in Cloud mode: Mobile requires appMode cloud, VS Code requires trust mode managed, the CLI requires managed privacy mode (apps/mobile/services/productAnalytics.ts:33; apps/extension-vscode/src/features/analytics/productAnalytics.ts:56-58; apps/cli/src/cloud/product_analytics.rs:20-26). Web and Chrome gates differ (cookie preference on Web; account consent on Chrome) and Chrome's mode gate was not found.

**Present but disconnected or switched off**

- The deployed-values check and rate-card check run inside validateEnvironment, but their rules were not read here (apps/web/lib/validate-env.ts:1921-1922).

**Not available**

- Shared configuration validation on Mobile, Chrome, VS Code, Electron and the CLI (brief S101.36).
- Desktop-specific analytics emitter: Desktop shows the hosted web app, so it inherits Web's; the Tauri renderer has a client failure reporting service that was not opened (apps/desktop/src/services/clientFailureReporting.ts).

## 4. Required behaviour

**Established requirements**

- Telemetry and analytics follow one shared vocabulary and redaction path on every surface. (source: S101.34)
- Configuration for every surface is validated through one shared registry and validator. (source: S101.36)
- Security-sensitive helpers (crypto, redaction, path containment) live in one shared place that every surface uses. (source: S101.37)
- Shared packages declare browser-only, server-only and native-only entry points explicitly. (source: S101.38)
- A production deployment with test-mode payment keys is refused unless the operator sets AGI_ALLOW_INVALID_ENV=1. (source: apps/web/lib/validate-env.ts:336-342 and brief S101.36)
- Security behaviour fails closed; collect the minimum data; never commit a secret. (source: doc: AGENTS.md section 6)
- Do not hardcode what the repository models; no silent failures. (source: doc: AGENTS.md sections 4 and 9)

**Acceptance criteria**

1. Starting the web server with a test-mode payment key and VERCEL_ENV=production fails start-up; adding AGI_ALLOW_INVALID_ENV=1 lets it boot with errors logged.
2. Adding a process.env read of an unregistered key in apps/web fails pnpm check:config-keys.
3. A NEXT_PUBLIC_ variable ending in _SECRET fails the same guard.
4. Each redaction policy output equals the recorded fixture for the shared corpus (secretRedaction.parity test).
5. A server-only package imported from a Chrome, VS Code webview, Mobile or web client component fails pnpm check:package-runtimes.
6. An analytics event with an unknown name, bad timestamp or free-form property key is dropped by normalizeProductAnalyticsEvent, and the ingest route accepts none without consent.
7. Analytics events are not sent on Mobile in Local or own-key mode.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Because the CLI embeds the TypeScript analytics contract at compile time, a contract change reaches the CLI only on its next build.
- [inferred] A validator crash that is not the 'Environment validation failed' error is logged and start-up continues (apps/web/instrumentation.ts:68-72), so a bug in the validator would fail open.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a test that feeds the shared redaction corpus through the CLI Rust redactor and compares markers, so the two sets cannot drift.
- [proposed] Extend the config registry idea to Mobile, Chrome, VS Code, Electron and CLI, or record each as out of scope.
- [proposed] Make a validator crash in production refuse start-up unless the override is set.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | register (start-up hook) | `apps/web/instrumentation.ts` | Runs validateEnvironment and refuses start-up in production unless overridden. |
| service | validateEnvironment | `apps/web/lib/validate-env.ts` | Fifteen checks plus the config key registry and log printing. |
| service | validateStripeKeyModeConsistency | `apps/web/lib/validate-env.ts` | Rejects mixed or wrong-environment payment key modes. |
| config | CONFIG_KEY_REGISTRY | `apps/web/lib/validate-env.ts` | Declares owner, secrecy and environments for each configuration key. |
| command | check:config-keys | `scripts/check-config-keys.mjs` | Every key read by web is registered or recorded. |
| config | config-keys baseline | `scripts/config/config-keys.json` | Keys set by the platform with a stated reason. |
| service | Secret registry | `packages/platform/utils/src/secretRedaction.ts` | Pattern rules, detection list and four redaction policies. |
| service | Shared logger and redactSecrets | `packages/platform/utils/src/logger.ts` | Applies redaction to log arguments and returns scan findings. |
| service | Web secret patterns | `apps/web/lib/security/secret-patterns.ts` | Builds the web detector list from the shared registry. |
| service | CLI redaction | `apps/cli/src/secret_redaction.rs` | Rust redaction for logs, tool output and Local-to-cloud previews. |
| service | VS Code telemetry redaction | `apps/extension-vscode/src/core/telemetry.ts` | Applies the telemetry policy. |
| command | check:security-helpers | `scripts/check-security-helpers.mjs` | One declaration per security helper; raw ciphers only in the crypto module. |
| config | package-runtimes.json | `scripts/config/package-runtimes.json` | Declared runtime per package entry point. |
| command | check:package-runtimes | `scripts/check-package-runtimes.mjs` | Entry import graphs and four client bundle roots. |
| schema | Analytics contract | `packages/contracts/types/src/product-analytics.ts` | Event names, surfaces, outcomes, property allowlist, normaliser and emitters. |
| endpoint | POST /api/analytics/events | `apps/web/app/api/analytics/events/route.ts` | Ingest with CSRF, rate limit, consent check and re-normalisation. |
| service | Web analytics emitter | `apps/web/shared/lib/product-analytics.ts` | Batches events, gated by cookie preference. |
| service | Mobile analytics emitter | `apps/mobile/services/productAnalytics.ts` | Account-consent emitter enabled only in Cloud mode. |
| service | VS Code analytics emitter | `apps/extension-vscode/src/features/analytics/productAnalytics.ts` | Account-consent emitter; managed mode only. |
| service | Chrome analytics emitter | `apps/extension/src/features/observability/productAnalytics.ts` | Account-consent emitter for the extension. |
| service | CLI analytics sender | `apps/cli/src/cloud/product_analytics.rs` | Reads the TypeScript contract at build time; managed mode, config and opt-out gated. |
| component | Mobile consent group | `apps/mobile/src/features/settings/cloud-privacy/ProductAnalyticsConsentGroup.tsx` | The consent control on Mobile. |
| test | Redaction parity test | `packages/platform/utils/src/__tests__/secretRedaction.parity.test.ts` | Policy output equals recorded fixture. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web server boot: instrumentation loads validate-env and runs the checks against process environment. | our servers | apps/web/instrumentation.ts:36-45 |
| On errors in production without AGI_ALLOW_INVALID_ENV=1 the boot throws; otherwise it logs and continues. | our servers | apps/web/instrumentation.ts:56-66 |
| A client calls track(). The emitter checks its gate (cookie, mode, consent), normalises the event against the vocabulary, queues it and flushes in batches of up to 50. | device | packages/contracts/types/src/product-analytics.ts (createProductAnalyticsEmitter, PRODUCT_ANALYTICS_MAX_BATCH); apps/web/shared/lib/product-analytics.ts |
| The account-consent emitter asks the server for the consent record before sending and caches the answer for 10 minutes. | device and our servers | packages/contracts/types/src/product-analytics.ts (ACCOUNT_CONSENT_TTL_MS, PRODUCT_ANALYTICS_CONSENT_PATH) |
| The ingest route checks CSRF, rate limit and user scope, re-checks consent, normalises each event and stores accepted ones. | our servers | apps/web/app/api/analytics/events/route.ts:25-60 |
| Redaction runs where the text is produced: log sinks, VS Code telemetry, Chrome page text, Mobile streaming, CLI tool output. | device | packages/platform/utils/src/logger.ts:107-125; apps/extension-vscode/src/core/telemetry.ts:3-5; apps/cli/src/secret_redaction.rs:1-12 |
| Guards read package manifests, declared runtimes, and source imports in the working tree. | device | scripts/check-package-runtimes.mjs:90-130 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Product analytics events (name, surface, time, outcome, allowlisted properties) | Our servers through the ingest helper recordProductAnalyticsEvents; table name not established | Sent from the device to our servers in batches | unknown (retention not read) |
| Analytics consent record (purpose product_analytics, notice version) | Our servers via /api/consent | Read by each surface with a 10 minute cache | unknown |
| Configuration validation result | A configuration-state metric (ok or invalid) and console logs | Our observability stack; not read | unknown |

**Models and providers.** None for validation, runtimes or redaction. Analytics events name tools and responses but carry only allowlisted dimensions, not prompts [inferred from the property allowlist in product-analytics.ts]. Redaction patterns include provider key shapes (for example Anthropic and OpenAI project keys) so a key never reaches a log in any mode.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Analytics from Mobile, VS Code and Chrome needs a signed-in account because consent is read from the account (apps/mobile/services/productAnalytics.ts; apps/extension-vscode/src/features/analytics/productAnalytics.ts:23-27). Web needs only a cookie preference, and the ingest route still needs a user scope (apps/web/app/api/analytics/events/route.ts:30). Config validation: no account. |
| Permissions | Ingest requires a CSRF token and a user-scoped database context (apps/web/app/api/analytics/events/route.ts:28-31). Operators set AGI_ALLOW_INVALID_ENV. |
| Subscription | none found in the code. No plan check appears in the analytics contract, validator, redaction or runtime declaration. |
| Limits and metering | Batch size is capped at 50 (packages/contracts/types/src/product-analytics.ts). The ingest route uses the default rate limit (apps/web/app/api/analytics/events/route.ts:29). Property values are cut at 120 characters. |
| Feature flags | AGI_ALLOW_INVALID_ENV on the web server; VS Code telemetry settings; CLI telemetry config and DISABLE_TELEMETRY or DO_NOT_TRACK variables. No feature-flag service found for these. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. Redaction rules are provider-shaped but do not restrict providers. |
| Local mode | Analytics: not sent on Mobile unless appMode is cloud, on VS Code unless trust mode is managed, on the CLI unless privacy mode is managed (files cited above). Chrome and Desktop Local-mode behaviour not established. Redaction and runtime declarations: apply in Local mode; they run on the device with no payment or server call. Web config validation applies only to our hosted web server. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Consent missing or withheld | Ingest returns 202 with accepted 0 and consent 'withheld'; emitters drop queued events when not allowed at flush time. | apps/web/app/api/analytics/events/route.ts:34-36; packages/contracts/types/src/product-analytics.ts (flush) |
| Invalid event | Unknown name, bogus timestamp or missing required outcome returns null and is counted as rejected. | packages/contracts/types/src/product-analytics.ts (normalizeProductAnalyticsEvent); apps/web/app/api/analytics/events/route.ts:44-50 |
| Analytics post fails | Web swallows the error and does not retry. | apps/web/shared/lib/product-analytics.ts:30-36 |
| Invalid environment in production | Boot throws unless overridden; in other environments it logs and continues. | apps/web/instrumentation.ts:56-66 |
| Validator itself crashes | Logged as 'Environment validation could not run' and boot continues. | apps/web/instrumentation.ts:68-72 |
| Hostile input to redaction | Quantifiers are bounded; ReDoS tests measure detection and policy timing. | packages/platform/utils/src/secretRedaction.ts:14-18; packages/platform/utils/src/__tests__/secretRedaction.redos.test.ts |
| Offline, retry, cancel | not handled in the code for analytics beyond the dropped post; the account emitter flushes after a 5 second delay and Mobile flushes when the app leaves the foreground. | packages/contracts/types/src/product-analytics.ts (ACCOUNT_FLUSH_DELAY_MS); apps/mobile/services/productAnalytics.ts:33-37 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/__tests__/validate-env.test.ts`: Environment validation including Stripe mode rules, live keys in preview, test pairs accepted (lines 325-349).
- `scripts/check-config-keys.test.mjs`: The config key guard.
- `packages/platform/utils/src/__tests__/secretRedaction.parity.test.ts`: Each policy reproduces its recorded output on the corpus.
- `packages/platform/utils/src/__tests__/secretRedaction.redos.test.ts`: Redaction timing on hostile input.
- `packages/platform/utils/src/__tests__/logger.test.ts`: Logger redaction (file exists; contents not read).
- `apps/web/lib/security/__tests__/secrets-audit.parity.test.ts`: Secrets audit parity with the shared registry (named in the brief; contents not read).
- `apps/web/__tests__/security/secret-redaction-fails-closed.test.ts`: Web redaction fails closed (file exists; contents not read).
- `apps/extension-vscode/src/__tests__/telemetryRedaction.test.ts`: VS Code telemetry redaction.
- `scripts/check-security-helpers.test.mjs`: The security helper guard.
- `scripts/check-package-runtimes.test.mjs`: The package runtime guard.
- `packages/contracts/types/src/__tests__/product-analytics.test.ts`: Analytics contract (file exists; contents not read).
- `apps/web/app/api/analytics/events/route.test.ts`: Ingest route (file exists; contents not read).
- `apps/extension-vscode/src/__tests__/productAnalyticsRuntimeGate.test.ts`: VS Code analytics runtime gate (file exists; contents not read).

**Test scenarios**

- **Test payment key in production**
  1. Set VERCEL_ENV=production and a secret key beginning with the test prefix.
  2. Call validateStripeKeyModeConsistency, or boot a production build.
  - Expected: Error says Stripe test mode is not valid for Production; boot refuses; setting AGI_ALLOW_INVALID_ENV=1 boots degraded.
- **Unclassified config key**
  1. Add process.env.NEW_THING to a file under apps/web/lib.
  2. Run pnpm check:config-keys.
  - Expected: Failure says the key is in neither the registry nor the baseline.
- **Credential-named public key**
  1. Read process.env.NEXT_PUBLIC_FOO_SECRET in web code.
  2. Run the guard.
  - Expected: Failure says the bundler would write the value into every browser bundle.
- **Server-only import in a client**
  1. Import a package entry declared server from a Mobile or Chrome file.
  2. Run pnpm check:package-runtimes.
  - Expected: Failure names the bundle root, file and declared runtime.
- **Redaction by policy**
  1. Pass a string with a fake API key shape through redactWithPolicy for log, telemetry and content.
  2. Compare outputs.
  - Expected: Markers differ per policy as defined in REDACTION_POLICIES; no key text remains.
- **Analytics without consent**
  1. On Mobile in Cloud mode with consent withheld, trigger a tracked action.
  2. Watch POST /api/analytics/events.
  - Expected: No batch is sent, or the server answers 202 with accepted 0.

**Where to look when it fails**

- Web boot log lines: 'Environment validation failed with N error(s)', 'Environment validation could not run'.
- configuration-state metric component 'environment' with state ok or invalid.
- Ingest response body consent: 'withheld'.
- Guard output from check-config-keys, check-security-helpers and check-package-runtimes.
- No result of any run is recorded in files read here; nothing is claimed as passing.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Config validation exists only for the web server.** Affects: Mobile, Chrome, VS Code, Electron, CLI. Evidence: brief S101.36; apps/web/lib/validate-env.ts is the only registry found. Work needed: Extend the registry or record each surface's ad hoc validation and why.
- **The CLI redaction is a separate Rust implementation with no link to the shared TypeScript registry found.** Affects: CLI, and anyone expecting identical markers. Evidence: apps/cli/src/secret_redaction.rs:1-30; scripts/check-security-helpers.mjs checks TypeScript helpers only. Work needed: Add a cross-language fixture test or generate the Rust rules from the registry.
- **Brief says the parity test compares the shared rules with the web copy; the code shows a fixture comparison and a web list derived from the registry.** Affects: Readers of the brief. Evidence: packages/platform/utils/src/__tests__/secretRedaction.parity.test.ts:1-22; apps/web/lib/security/secret-patterns.ts:10-38. Work needed: Correct the brief wording.
- **Brief says analytics vocabulary is web only. Code shows Web, VS Code, Chrome, Mobile and the CLI use it.** Affects: Readers of the brief; testers planning per-surface checks. Evidence: apps/mobile/services/productAnalytics.ts; apps/extension-vscode/src/features/analytics/productAnalytics.ts; apps/extension/src/features/observability/productAnalytics.ts; apps/cli/src/cloud/product_analytics.rs:9. Work needed: Update the brief; confirm mode gating on Chrome and Desktop.
- **Validator crash lets production boot.** Affects: Web operators. Evidence: apps/web/instrumentation.ts:68-72. Work needed: Decide whether a crashed validator in production should refuse boot.
- **Chrome and VS Code redaction use different functions (logger redactor vs telemetry policy), so their markers differ.** Affects: Support staff reading logs from the two extensions. Evidence: apps/extension/src/background/policy.ts:2; apps/extension-vscode/src/core/telemetry.ts:1. Work needed: Choose one policy per use and document it.

**Depends on**

- surface:web
- surface:mobile
- surface:chrome
- surface:vscode
- surface:cli
- surface:desktop
- SYS-observability-and-operations
- SYS-security-and-privacy
- SYS-api-and-contracts
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- mode:cloud
- mode:local
- api:POST /api/analytics/events
- file:scripts/config/package-runtimes.json

## Unknown

- Name of the database table that stores analytics events (recordProductAnalyticsEvents in apps/web/lib/server/product-analytics was not opened). The relationship to table:product_analytics_events is unverified.
- Retention and deletion of analytics events and consent records.
- How Chrome and Desktop gate analytics by mode (Local, own key, Cloud).
- How Mobile, Electron and the CLI validate configuration.
- Whether a test links the CLI Rust redactor to the shared rule set.
- The content of validateDeployedValues and validateRateCardPriced.
- Where the brief's 'error scrubber' is implemented; the search found redactWithPolicy telemetry and logger redactSecrets but no function named scrubber.
