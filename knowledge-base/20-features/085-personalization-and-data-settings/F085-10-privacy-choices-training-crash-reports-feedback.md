---
id: "F085-10"
type: "feature"
title: "Privacy choices: training, crash reports, feedback"
aliases: ["Only use models that do not train on your chats", "Use my chats", "Use my voice", "Help improve models", "Share crash and error reports", "Product analytics", "Share usage events", "Export diagnostics", "Share diagnostics?", "keepOutOfProviderTraining", "allowChatsForModelImprovement", "allowVoiceForModelImprovement", "shareTelemetry", "S85.12", "S85.13", "S85.14"]
area: "85 Personalization and data settings"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S85.12", "S85.13", "S85.14"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-security-and-privacy", "SYS-chat-turn-pipeline", "SYS-observability-and-operations", "SYS-execution-boundaries", "table:user_settings", "api:GET /api/settings/preferences", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "mode:own-key", "plan:free"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F085-10 Privacy choices: training, crash reports, feedback

Switches that decide where chat content may go and what is reported. 'Only use models that do not train on your chats' limits Cloud routing. 'Use my chats' and 'Use my voice' record a choice but nothing uses it today. Crash and analytics controls differ by app. Feedback-content sharing does not exist.

Area: [85. Personalization and data settings](README.md). Requirement items: [S85.12](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8512), [S85.13](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8513), [S85.14](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8514).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person (1) keep Cloud chats and side calls away from model providers that may train on inputs, (2) record whether AGI may use chats or voice to improve its own models, and (3) choose whether crash reports, product analytics or diagnostics leave the device.

**Why it exists.** Privacy expectations and the founder's decision to record opt-in choices for a possible future own model (doc: docs/decisions/2026-11-13-founder-decisions.md:55-70). The product definition names 'help improve AGI' among privacy settings (doc: docs/product/definition.md:283).

**Who uses it.** Privacy-minded people on Web, Desktop (hosted web), Mobile (Cloud mode), CLI and VS Code developers.

**Problems it solves**

- Avoiding providers whose terms allow training, especially free capacity.
- Keeping error reporting opt-in.
- Making sure unreadable settings fail closed.

**Use cases**

- Turn on 'Only use models that do not train on your chats' so a Free-plan Auto chat uses a no-training model.
- Leave 'Use my chats' off so a future model-improvement use has no consent.
- Turn on crash reports on the CLI with `agi config set crash-reports true`.
- Export a redacted diagnostics file on Chrome to attach to a support request.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings > Privacy toggles 'Share crash and error reports', 'Only use models that do not train on your chats', and under heading 'Help improve <product> models' the toggles 'Use my chats' and 'Use my voice' (apps/web/features/settings/sections/PrivacySection.tsx:54-88).
- Mobile (Cloud mode, signed in): Settings > Privacy shows the same two training switches and a 'Product analytics' switch; signed out or in Local mode it shows 'AGI Cloud privacy controls' with footnote 'Model training, routing and analytics choices apply to AGI Cloud chats.' (apps/mobile/src/features/settings/cloud-privacy/PrivacyCloudControls.tsx:19-47; TrainingPreferenceGroups.tsx:42-72; ProductAnalyticsConsentGroup.tsx:29).
- Mobile diagnostics: the settings row that runs 'Share diagnostics?' consent then exports (apps/mobile/src/features/settings/diagnostics/shareDiagnostics.ts:13-17; apps/mobile/src/features/settings/index.tsx:597-602).
- CLI: config keys crash-reports and product-analytics via `agi config set` (apps/cli/src/config.rs:1473-1477, :1596-1607).
- VS Code: Settings webview card 'Telemetry' with 'Share usage events' and a 'Product analytics for your account' row with a Manage button (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1957-1985).
- Chrome: Options > 'Export diagnostics' button with 'Saves a redacted bundle to attach to a support request.' (apps/extension/src/options.ts:2073-2081).

**Before you start**

- Web and Mobile switches need a signed-in Cloud account and read the saved value first; switches are disabled until the latest value loads (PrivacySection.tsx:395-400).
- CLI crash and analytics choices count only in managed (Cloud) privacy mode (apps/cli/src/crash_reports.rs:35-43; apps/cli/src/cloud/product_analytics.rs:21-26).

**Screens and controls**

- Web switches with labels above; copy under 'Only use models...' says 'On Free, this keeps your chats off free models whose terms may allow training.' (PrivacySection.tsx:64).
- Web note: 'Both are off unless you turn them on. Nothing is used for this today...' (PrivacySection.tsx:88).
- Mobile retry button 'Retry loading model training settings' when the read fails (TrainingPreferenceGroups.tsx:77).

**Journey**

1. Open Settings > Privacy.
2. Wait for the switches to become enabled (value loaded).
3. Flip a switch; the app saves it and reloads the stored value.
4. See 'Your privacy setting was saved.' or 'We could not confirm whether your change was saved...' (PrivacySection.tsx:349-352).
5. For crash reports turned off, the browser stops reporting immediately, before the save returns (PrivacySection.tsx:323).

**What the person sees and gets**

- Web banner after save as above; when a pending denial exists: 'Telemetry is off on this browser. Review your account setting before choosing again.' (PrivacySection.tsx:258).
- Refusals when a provider may train: 'This model's provider may train on what you send. Choose another model, or turn off Only use models that do not train on your chats in Settings > Privacy.' (apps/web/lib/server/provider-training-opt-out.ts:15-16).

**Settings**

- Stored in user_settings under namespace 'privacy', keys keepOutOfProviderTraining, allowChatsForModelImprovement, allowVoiceForModelImprovement, shareTelemetry (provider-training-opt-out.ts:12-13; apps/web/lib/server/model-improvement-consent.ts:7-13).
- Browser local storage keys agi.privacy.shareTelemetry and agi.privacy.pendingTelemetryOptOut (apps/web/lib/sentry-shared.ts:~68-69).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Training opt-out is read from user_settings and enforced on side calls: embeddings, transcription, speech and media are refused when the provider may train and the person opted out (apps/web/lib/server/side-call-training-policy.ts:29-37; apps/web/app/api/llm/v1/embeddings/route.ts:180; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:506; apps/web/app/api/voice/speech/route.ts:106; apps/web/app/api/media/image/lib/managed-image-generation.ts:429; apps/web/app/api/media/video/generate/route.ts:1165).
- If the opt-out cannot be read, it is treated as opted out (side-call-training-policy.ts:14-23; request-processor.ts:3615-3626).
- On the Free plan, an Auto chat is moved to a no-training model when opted out, or refused if none exists (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3664-3674; provider-training-opt-out.ts:43-53).
- The model catalogue route reads the opt-out (apps/web/app/api/models/catalogue/route.ts:63).
- All Web toggles default to false (PrivacySection.tsx:54-86).
- Crash opt-out on Web writes a local denial first so it works even when the save fails (apps/web/lib/sentry-shared.ts:81-90; PrivacySection.tsx:323).
- Mobile reads and writes the three training keys with receipt checks (apps/mobile/src/features/settings/cloud-privacy/trainingPreferences.ts:1-80).
- CLI crash reports: written locally on a panic and uploaded only if managed mode and opted in (or env override) (apps/cli/src/crash_reports.rs:35-50, :220).
- CLI product analytics: needs managed mode, config on, and no DISABLE_TELEMETRY or DO_NOT_TRACK (apps/cli/src/cloud/product_analytics.rs:21-26).
- VS Code telemetry: off by default, and also needs VS Code's own telemetry setting on (apps/extension-vscode/src/platform/config.ts:130; apps/extension-vscode/src/features/analytics/productAnalytics.ts:37).

**Incomplete**

- 'Use my chats' and 'Use my voice' record consent only; readModelImprovementConsent has no caller in apps/web outside its own file and tests (apps/web/lib/server/model-improvement-consent.ts:22; the web note says nothing is used today, PrivacySection.tsx:88). This matches the founder decision (docs/decisions/2026-11-13-founder-decisions.md:67-70).
- The 'Only use models...' choice is enforced in the Free Auto chat path and on side calls; enforcement for explicit-model chats on paid plans was not established in the code read.
- CLI product analytics default is on (true), unlike the Web defaults (apps/cli/src/config.rs:85-98).
- Chrome has no send toggle; diagnostics are a manual redacted export (apps/extension/src/options.ts:2071-2100).

**Present but disconnected or switched off**

- Web toggles 'rememberChats' and 'locationMetadata' were removed because nothing read them (apps/web/features/settings/sections/PrivacySection.tsx:33-42).
- 'improveModelTraining' is retired and never reused (PrivacySection.tsx:39-42).

**Not available**

- Feedback-content sharing choice (S85.13): not applicable on any app per brief; no control found.
- Mobile 'Share crash reports' toggle: not found; mobile diagnostics are manual exports (shareDiagnostics.ts).
- Crash upload SDKs on Mobile, Chrome and VS Code are not bundled by decision (doc: docs/decisions/wire-or-cut.md:131).

## 4. Required behaviour

**Established requirements**

- The user can choose whether their content may be used to train or improve models (web, desktop, mobile done). (source: S85.12 (brief))
- Feedback-content choice is not applicable anywhere. (source: S85.13 (brief))
- The user can choose whether crash reports and diagnostics are sent, and the choice is honoured (web, desktop, cli, vscode, chrome per brief). (source: S85.14 (brief))
- The two improvement switches are off until turned on; any future use must read them and treat a missing or unreadable choice as no. (source: docs/decisions/2026-11-13-founder-decisions.md:55-70)
- 'Only use models that do not train on your chats' limits which providers a chat may reach; it is not consent to anything. (source: docs/decisions/2026-11-13-founder-decisions.md:64-66)
- Product crash reporting on Web and Desktop fails closed with explicit consent; Mobile, Chrome, VS Code and Desktop native diagnostics are local-only. (source: docs/decisions/wire-or-cut.md:131)
- Security behaviour fails closed. (source: AGENTS.md section 6 (doc: AGENTS.md))

**Acceptance criteria**

1. All Web toggles are off for a new account.
2. Turning on 'Only use models that do not train on your chats' makes a Free Auto chat use a no-training model or refuse with the stated message.
3. With the opt-out on, transcription, speech, embeddings, image and video calls to a provider that may train are refused.
4. If the settings read fails, side calls behave as opted out.
5. Turning off crash reports stops browser reporting at once even if the save fails.
6. CLI crash reports are not written for upload in Local or own-key mode.
7. VS Code sends no usage event unless both its setting and VS Code telemetry are on.
8. 'Use my chats' on or off changes no behaviour today (documented by the note).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop uses the hosted web toggles [inferred from AGENTS.md section 5].
- Because side calls fail closed, a database outage makes background features refuse providers that may train [inferred from side-call-training-policy.ts:14-23].

**Proposed improvements** (suggestions, not requirements)

- [proposed] State the CLI analytics default on the first-run screen or switch the default to off to match Web.
- [proposed] Verify and document enforcement of the no-training switch for explicit-model chats on paid plans.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PrivacySection | `apps/web/features/settings/sections/PrivacySection.tsx` | Web toggles, save flow and copy. |
| service | privacy-preferences-client | `apps/web/features/settings/services/privacy-preferences-client.ts` | Reads and saves privacy preferences. |
| endpoint | settings preferences API | `apps/web/app/api/settings/preferences` | Stores the privacy namespace (route folder; test at __tests__/model-improvement-consent.test.ts). |
| service | provider-training-opt-out | `apps/web/lib/server/provider-training-opt-out.ts` | Reads the opt-out, refusal messages, no-training model picker. |
| service | side-call-training-policy | `apps/web/lib/server/side-call-training-policy.ts` | Fail-closed policy for background provider calls. |
| service | model-improvement-consent | `apps/web/lib/server/model-improvement-consent.ts` | Reader for the chat and voice consent keys (no consumer yet). |
| service | request-processor (chat) | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Applies the opt-out to Free Auto routing (lines 3615-3674). |
| service | sentry-shared | `apps/web/lib/sentry-shared.ts` | Browser telemetry consent latch and opt-out. |
| table | user_settings | `apps/web/lib/server/provider-training-opt-out.ts` | settings JSON column read with settings -> 'privacy' ->> key (lines 28-35). |
| component | Mobile TrainingPreferenceGroups | `apps/mobile/src/features/settings/cloud-privacy/TrainingPreferenceGroups.tsx` | Three training switches. |
| service | Mobile trainingPreferences | `apps/mobile/src/features/settings/cloud-privacy/trainingPreferences.ts` | Keys, parsing and receipt checks. |
| component | Mobile ProductAnalyticsConsentGroup | `apps/mobile/src/features/settings/cloud-privacy/ProductAnalyticsConsentGroup.tsx` | Product analytics switch. |
| service | Mobile shareDiagnostics | `apps/mobile/src/features/settings/diagnostics/shareDiagnostics.ts` | Consent alert and diagnostics export. |
| config | CLI TelemetryConfig | `apps/cli/src/config.rs` | crash_reports (default off) and product_analytics (default on) (lines 81-100). |
| service | CLI crash_reports | `apps/cli/src/crash_reports.rs` | Panic hook, local report, gated upload. |
| service | CLI product_analytics | `apps/cli/src/cloud/product_analytics.rs` | Gate and recording. |
| config | VS Code telemetryEnabled | `apps/extension-vscode/src/platform/config.ts` | Setting default false (line 130). |
| service | VS Code productAnalytics | `apps/extension-vscode/src/features/analytics/productAnalytics.ts` | Runtime gate (line 37). |
| service | Chrome diagnostics | `apps/extension/src/features/diagnostics/index.ts` | Collects and exports a redacted bundle via /api/support/diagnostics. |
| test | PrivacySection.training test | `apps/web/features/settings/sections/__tests__/PrivacySection.training.test.tsx` | Copy and defaults. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person flips a switch; the app saves the key in the privacy namespace of user_settings. | device and our servers | PrivacySection.tsx:309-336 |
| For crash reports off, the browser first writes a local denial flag and stops reporting. | device | apps/web/lib/sentry-shared.ts:81-90 |
| On a chat turn the server reads the opt-out; unreadable means opted out. | our servers | request-processor.ts:3615-3626 |
| For Free Auto turns the route swaps to a no-training model or refuses. | our servers | request-processor.ts:3664-3674 |
| For a side call (embeddings, transcription, speech, media) the route checks the provider; no-training providers are always allowed, others only if not opted out. | our servers | side-call-training-policy.ts:29-37 |
| The request then goes to the provider chosen by routing. | outside service | apps/web/app/api/llm/v1/embeddings/route.ts:180-190 [inferred next step] |
| CLI on panic writes a small local report; on next start it uploads only when allowed. | device and our servers | apps/cli/src/crash_reports.rs:81-116, :220; apps/cli/src/lib.rs:6224-6229 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Privacy choices | user_settings (server) and browser local storage for the telemetry latch | Server value syncs across apps; local latch is per browser | Until changed or account deleted |
| CLI config | ~/.agiworkforce config file on the computer | No | Until edited (a repository config cannot change user telemetry, config.rs tests ~3709-3722) |
| CLI crash report | report folder under the config root | Uploaded only if allowed | Folder is pruned to a bound (crash_reports.rs:145) |
| Chrome diagnostics file | download chosen by the person | Sent to server for redaction only on request | Person's file |

**Models and providers.** The provider registry marks which providers keep inputs out of training (providerKeepsInputsOutOfTraining from the model-registry package, used at side-call-training-policy.ts:4, :34). Routing decides the provider; this feature only filters.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, Mobile training and analytics switches need a signed-in Cloud account. CLI and VS Code settings are local files. |
| Permissions | The server reads the caller's own settings through a user-scoped database (side-call-training-policy.ts:35). |
| Subscription | The Free-plan wording applies to Free only: 'On Free, this keeps your chats off free models whose terms may allow training.' (PrivacySection.tsx:64). The toggle is available on every plan; plan gating of the toggle itself: none found in the code (managedOnly is not set on these specs). |
| Limits and metering | none found in the code. |
| Feature flags | none found for the toggles. CLI env overrides: DISABLE_TELEMETRY, DO_NOT_TRACK (product_analytics.rs:22-26) and a crash-reports env variable (crash_reports.rs:45-49). |
| Model compatibility | Applies by provider, not model; a provider that keeps inputs out of training is always allowed (side-call-training-policy.ts:34). |
| Provider restrictions | Providers that may train are skipped or refused when opted out. |
| Local mode | Local mode keeps chats on the device so these Cloud switches do not apply; Mobile says the choices apply to AGI Cloud chats (PrivacyCloudControls.tsx:41). CLI crash reports and analytics are off in Local and own-key modes (crash_reports.rs:36-43; product_analytics.rs:21). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Switches disabled until the latest value is read. | PrivacySection.tsx:395-400 |
| Read failure | Message 'The latest privacy settings could not be loaded. Retry loading them.' | PrivacySection.tsx:270 |
| Save not confirmed | Message asks to review latest settings; reload follows. | PrivacySection.tsx:349-354 |
| Pending telemetry denial in browser | Shows telemetry as off with a warning. | PrivacySection.tsx:249-259 |
| Opt-out unreadable on server | Treated as opted out; warning logged. | side-call-training-policy.ts:14-23 |
| No no-training model for the plan | Refusal NO_TRAINING_MEDIA_MODEL_MESSAGE or noTrainingModelUnavailable. | provider-training-opt-out.ts:18-19; request-processor.ts:3670-3671 |
| Account switch (Mobile) | Ownership checks drop stale values. | TrainingPreferenceGroups.tsx:121-132 |
| Mobile Local mode | Cloud privacy controls hidden behind a sign-in or switch row. | PrivacyCloudControls.tsx:36-56 |
| Offline | not handled in the code beyond retry buttons. | TrainingPreferenceGroups.tsx:77 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/__tests__/PrivacySection.training.test.tsx`: Copy about training and the two improvement switches off by default.
- `apps/web/features/settings/sections/__tests__/PrivacySection.persistence.test.tsx`: Saving and reloading toggles.
- `apps/web/features/settings/sections/__tests__/PrivacySection.density.test.tsx`: Layout and toggle list.
- `apps/web/features/settings/services/privacy-preferences-client.test.ts`: Client read and write.
- `apps/web/app/api/settings/preferences/__tests__/model-improvement-consent.test.ts`: Consent key validation.
- `apps/web/app/api/llm/v1/embeddings/route.test.ts`: Embeddings refusal for may-train providers.
- `apps/web/app/api/voice/speech/__tests__/route.test.ts`: Speech route opt-out.
- `apps/web/__tests__/api/media-image-generate.test.ts`: Image route opt-out.
- `apps/mobile/__tests__/ModelTrainingPolicy.test.tsx`: Mobile training policy UI.
- `apps/mobile/__tests__/ProviderTrainingOwnership.test.tsx`: Mobile ownership of training switches.
- `apps/mobile/__tests__/ProviderTrainingParsing.test.ts`: Parsing.
- `apps/mobile/__tests__/ProductAnalyticsConsentOwnership.test.tsx`: Mobile analytics switch.
- `apps/cli/src/crash_reports.rs`: Inline tests: off until opt-in, Local and own-key never report.
- `apps/extension-vscode/src/__tests__/productAnalyticsRuntimeGate.test.ts`: VS Code runtime gate.
- `apps/extension/__tests__/diagnostics-bundle.test.ts`: Chrome diagnostics bundle.

**Test scenarios**

- **Default state**
  1. Create a new account.
  2. Open Settings > Privacy.
  - Expected: All four switches off.
- **Free Auto chat with opt-out**
  1. Free account, turn on 'Only use models that do not train on your chats'.
  2. Send a chat on Auto.
  - Expected: Served by a no-training model or a clear refusal.
- **Side call refusal**
  1. Opt out.
  2. Use dictation when its provider may train.
  - Expected: Refusal message naming the setting.
- **Fail closed**
  1. Make user_settings unreadable in a test.
  2. Call an embeddings request.
  - Expected: Treated as opted out.
- **Crash opt-out race**
  1. Block the save request.
  2. Turn off crash reports.
  - Expected: Browser reporting stops; page warns that the save is unconfirmed.
- **CLI modes**
  1. `agi config set crash-reports true` in own-key mode, trigger a test panic.
  - Expected: No upload.

**Where to look when it fails**

- Log 'Provider training opt-out unreadable; treating this background call as opted out'.
- Log 'Model improvement consent unreadable; treated as off'.
- user_settings row, settings->'privacy'.
- Refusal codes model_may_train.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/085-personalization-and-data-settings.md](../../70-qa/test-plans/web/085-personalization-and-data-settings.md)
- Desktop: [70-qa/test-plans/desktop/085-personalization-and-data-settings.md](../../70-qa/test-plans/desktop/085-personalization-and-data-settings.md)
- Mobile: [70-qa/test-plans/mobile/085-personalization-and-data-settings.md](../../70-qa/test-plans/mobile/085-personalization-and-data-settings.md)
- CLI: [70-qa/test-plans/cli/085-personalization-and-data-settings.md](../../70-qa/test-plans/cli/085-personalization-and-data-settings.md)
- VS Code: [70-qa/test-plans/vscode/085-personalization-and-data-settings.md](../../70-qa/test-plans/vscode/085-personalization-and-data-settings.md)
- Chrome: [70-qa/test-plans/chrome/085-personalization-and-data-settings.md](../../70-qa/test-plans/chrome/085-personalization-and-data-settings.md)

## 10. Gaps and dependencies

- **'Use my chats' and 'Use my voice' have no consumer; they only record a choice.** Affects: People who expect an effect; all apps with the switches.. Evidence: apps/web/features/settings/sections/PrivacySection.tsx:88; model-improvement-consent.ts:22 has no non-test caller.. Work needed: None until own-model training exists; keep the copy honest. Legal review is listed as open in the decision doc.
- **CLI product analytics default is on while Web defaults are off.** Affects: CLI users in managed mode.. Evidence: apps/cli/src/config.rs:85-98. Work needed: Owner decision on default and first-run disclosure.
- **No Chrome or Mobile send toggle for crash or diagnostics; export is manual.** Affects: Chrome and Mobile users who expect a switch.. Evidence: apps/extension/src/options.ts:2071-2100; doc: docs/decisions/wire-or-cut.md:131. Work needed: Document as intended or add a switch.
- **Draft brief cites a Mobile file ProviderTrainingOptOutGroup.tsx and CLI tui_app.rs:3864 that do not hold these controls.** Affects: Documentation accuracy.. Evidence: File not found; tui_app.rs:3864 is unrelated input handling.. Work needed: Update the brief's code references.
- **Enforcement of the no-training switch for explicit-model chats on paid plans is not established.** Affects: Paid-plan Cloud users.. Evidence: request-processor.ts:3664-3674 conditions on freeAutoSelection.. Work needed: Trace the paid path and add a test.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-security-and-privacy
- SYS-chat-turn-pipeline
- SYS-observability-and-operations
- SYS-execution-boundaries
- table:user_settings
- api:GET /api/settings/preferences
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- mode:own-key
- plan:free

## Unknown

- Whether the no-training switch is enforced for explicit-model chats on paid plans.
- What the Mobile Product analytics switch defaults to before it is read (only the training keys' off defaults were read).
- Whether the CLI has a first-run prompt that sets telemetry (config.rs tests near line 3682 suggest a chosen state; not traced).
- The environment variable name behind CRASH_REPORTS_ENV in the CLI.
- Whether Desktop Electron renderer Sentry follows the same latch; only the web library was read.
