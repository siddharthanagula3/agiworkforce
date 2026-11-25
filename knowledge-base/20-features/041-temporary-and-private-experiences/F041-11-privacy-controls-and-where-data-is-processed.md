---
id: "F041-11"
type: "feature"
title: "Privacy controls and where data is processed"
aliases: ["Privacy controls", "Privacy center", "Settings, Privacy", "Where each feature processes your data", "Data use & access", "Model improvement toggles", "Where your data goes", "Privacy and data handling", "/privacy-settings", "S41.18", "S41.20"]
area: "41 Temporary and private experiences"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S41.18", "S41.20"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:own-key", "mode:cloud", "api:GET /api/settings/preferences", "api:PUT /api/settings/preferences", "table:user_settings", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "F041-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F041-11 Privacy controls and where data is processed

Privacy pages and statements on every app that separate history, model training and retention, and say where each feature is processed: on this device, on AGI servers then the provider, or direct to the person's own provider. Web and Mobile also have switches. CLI, VS Code and Chrome are statements only.

Area: [41. Temporary and private experiences](README.md). Requirement items: [S41.18](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4118), [S41.20](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4120).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows, in plain words, what is kept as history, whether chats are used to train models, how long data is retained, and where each feature runs. Web and Mobile add controls: model-improvement toggles (off by default), a provider no-training switch, telemetry and temporary-by-default.

**Why it exists.** The brief requires history, training and retention to each have a separate control or statement, and each feature to state where data is processed (brief S41.18, S41.20). The leaders explain privacy settings in context (doc: AGENTS.md section 10).

**Who uses it.** Any person judging whether to trust the product with their data; reviewers and support.

**Problems it solves**

- Confusion between deleting history, opting out of training and retention.
- Not knowing whether a feature leaves the device.
- Hidden provider handling on the Free plan.

**Use cases**

- Check that 'Use my chats' and 'Use my voice' are off.
- Find out that web search queries go to a third-party search service.
- See how long a deleted chat is kept.
- Check the CLI privacy mode before pasting private code.

## 2. User experience

**Where to find it**

- Web: Settings, Privacy; expandable rows 'How we protect your data', 'Where each feature processes your data', 'How we use your data'; heading 'Help improve AGI models' with switches 'Use my chats' and 'Use my voice'; switch 'Only use models that do not train on your chats' (apps/web/features/settings/sections/PrivacySection.tsx:486; apps/web/features/settings/sections/PrivacySection.tsx:526; apps/web/features/settings/sections/PrivacySection.tsx:62).
- Desktop: the public Desktop shows the hosted web app, so the same Settings, Privacy page (doc: AGENTS.md section 5).
- Mobile: Settings, Privacy (cloud privacy screen): sections 'Explore your options' (Personalization, Chat privacy, Data use & access), 'Our approach to privacy' cards, then Cloud controls; 'Data use & access' lists 'Where each feature processes your data' (apps/mobile/src/features/settings/index.tsx:815; apps/mobile/src/features/settings/cloud-privacy/DataUseScreen.tsx:128).
- CLI: type /privacy-settings (also /privacy-mode with no argument) (apps/cli/src/claude_parity.rs:224).
- VS Code: settings page, card 'Where your data goes', buttons 'Privacy settings', 'Memory', 'Who processes AGI Cloud requests' (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1596).
- Chrome: extension options page, section 'Privacy and data handling' (apps/extension/src/features/options/data-handling-section.ts:151).

**Before you start**

- Web and Mobile training switches need a signed-in Cloud account; Mobile shows them only in Cloud mode while signed in, otherwise a row 'AGI Cloud privacy controls' with 'Sign in' or 'Switch to AGI Cloud' (apps/mobile/src/features/settings/cloud-privacy/PrivacyCloudControls.tsx:20).
- Mobile Local Mode needs no account to read the statements.

**Screens and controls**

- Web switches: 'Share crash and error reports', 'Only use models that do not train on your chats', 'Use my chats', 'Use my voice', 'Start new chats as temporary'.
- Mobile: Model training card, Telemetry off by default card, and in Cloud mode a 'Data retention' card (apps/mobile/src/features/settings/cloud-privacy/index.tsx:22).
- CLI /privacy-settings prints lines Active mode, Provider route, Local file access, Telemetry, Sync, History, Model training and Retention (apps/cli/src/claude_parity.rs:443).
- VS Code dl list: Local models, Your own provider key, AGI Cloud, Session history, Memory.
- Chrome disclosures: 'A content script loads on every page', 'The debugger permission drives computer use', 'The cookies permission reads only your AGI sign-in', 'Managed Cloud chats are mirrored to your account', 'Model training', 'How long chats are kept'.

**Journey**

1. Open the privacy page on the app.
2. Read what each feature does with data; open 'Where each feature processes your data' (Web, Mobile).
3. Change a switch if offered; Web shows a save status and a retry on failure.
4. Follow links to the Privacy Policy, /subprocessors or data requests.

**What the person sees and gets**

- Web note under model-improvement toggles: 'Both are off unless you turn them on. Nothing is used for this today...' (apps/web/features/settings/sections/PrivacySection.tsx:88).
- Web retention text: 'a deleted chat stays in Recently deleted for 30 days, then is deleted for good. A temporary chat and its attachments are removed after 30 days.' (apps/web/features/settings/sections/PrivacySection.tsx:519).
- Mobile retention text: 'Deleted and temporary chats are normally deleted for good after 30 days. A workspace legal hold can keep them longer.' (apps/mobile/src/features/settings/cloud-privacy/ChatPrivacyScreen.tsx:18).
- Mobile save failure messages such as 'The save could not be confirmed. Check the latest setting before choosing again.'

**Settings**

- Web preferences saved through GET and PUT /api/settings/preferences into user_settings.
- Mobile uses the same shared preference contract for training choices (apps/mobile/src/features/settings/cloud-privacy/TrainingPreferenceGroups.tsx).
- Chrome mirror switch 'Save Managed Cloud chats to my account' and error-report consent switch.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: three expandable explanations, processing-location list (Chat, Files, Memory, Web search, Image and video, Dictation, Voice mode, Read aloud, Connectors), model-improvement switches default off, training and telemetry switches, retention text (apps/web/features/settings/sections/PrivacySection.tsx:526; apps/web/features/settings/sections/PrivacySection.tsx:88).
- Web saves privacy choices to /api/settings/preferences with versioning and rejects invalid consent (apps/web/features/settings/services/privacy-preferences-client.ts:57; apps/web/app/api/settings/preferences/route.ts:252).
- Mobile: Privacy screen with approach cards (training, telemetry, retention in Cloud only), Chat privacy, Data use & access with 12 processing entries including 'Chat in Local Mode', 'Memory' and 'Dictation' (apps/mobile/src/features/settings/cloud-privacy/DataUseScreen.tsx:22).
- Mobile retention card is hidden in Local Mode, where delete is immediate (apps/mobile/src/features/settings/cloud-privacy/index.tsx:51; test at apps/mobile/src/features/settings/__tests__/PrivacyCenter.test.tsx:184).
- CLI: /privacy-settings states History, Model training and Retention on separate lines and the provider route (apps/cli/src/claude_parity.rs:443).
- VS Code: 'Where your data goes' separates Local models, own key, AGI Cloud, Session history, Memory and links to privacy settings (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1596; apps/extension-vscode/src/features/settings/SettingsPanel.ts:89).
- Chrome: disclosures for mirroring, training and retention, built from the catalog default for Free plan (apps/extension/src/features/privacy/dataHandling.ts:22).

**Incomplete**

- Statements differ between apps: Web says deleted chats stay 30 days in Recently deleted; Mobile says deleted and temporary chats are deleted after 30 days; CLI names Recently deleted; wording is not shared from one source.
- VS Code has no training or retention control by design; a test keeps the page from claiming one (apps/extension-vscode/src/__tests__/privacy-control-claims.test.ts:1).
- Desktop is described only by inheritance from Web; Tauri desktop privacy text was not checked.
- Web copy 'Local Mode and BYOK belong to the CLI' omits Mobile Local Mode (apps/web/features/settings/sections/PrivacySection.tsx:495).

**Present but disconnected or switched off**

- Web 'Remember chats' and location toggles were removed because they saved but changed nothing (comments in apps/web/features/settings/sections/PrivacySection.tsx:31).

**Not available**

- CLI, VS Code and Chrome have no model-improvement toggles; statements only.
- Mobile Local Mode hides training and retention controls (Cloud only).

## 4. Required behaviour

**Established requirements**

- History, model training and data retention each have their own clearly separate control or statement (done on all six apps). (source: brief S41.18)
- For each feature the product says where data is processed (on device, AGI cloud, a named provider). (source: brief S41.20)
- Model-improvement toggles default off and the note says nothing is used today. (source: brief S41.18 / code apps/web/features/settings/sections/PrivacySection.tsx:88)
- Each privacy text names where processing happens; history and retention are separate: a deleted chat stays in Recently deleted for 30 days then is deleted for good. (source: brief S41.18, S41.20)
- Provider retention and training terms must be disclosed from verified metadata or marked unknown; BYOK is never described as local. (source: doc: docs/product/requirements.md sections 7.2 and M-PRIV-004)

**Acceptance criteria**

1. Web Settings, Privacy shows 'Use my chats' and 'Use my voice' off for a new account.
2. The Web 'Where each feature processes your data' list names a destination for every feature row.
3. Mobile in Local Mode hides the Data retention card; in Cloud mode shows it.
4. Mobile 'Data use & access' has 'Chat in Local Mode' with 'On this device, unless you sync your chats to AGI Cloud.'
5. CLI /privacy-settings prints separate History, Model training and Retention lines.
6. VS Code settings list shows five separate data paths.
7. Chrome options list the mirroring, training and retention disclosures and the mirror switch.
8. Changing a Web switch is saved or shows a failure with retry; no switch is shown that changes nothing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A single shared source for privacy copy would remove drift between apps. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Move retention and training wording into one shared constant used by Web, Mobile, CLI, VS Code and Chrome.
- [proposed] Add a test that compares retention text across apps.
- [proposed] Add a Desktop-specific check if the Tauri app ships.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PrivacySection | `apps/web/features/settings/sections/PrivacySection.tsx` | Web Settings, Privacy page: toggles, expandable explanations, processing-location list. |
| service | privacy-preferences-client | `apps/web/features/settings/services/privacy-preferences-client.ts` | Reads and writes privacy preferences with a versioned save. |
| endpoint | GET/PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Server route storing preferences and checking model-improvement consent. |
| table | user_settings | `apps/web/app/api/settings/preferences/route.ts` | Table where the settings JSON is saved. |
| config | temporary-chat-policy | `apps/web/lib/temporary-chat-policy.ts` | Shared Temporary chat copy and labels. |
| config | BYOK_SURFACES | `apps/web/lib/marketing-constants.ts` | Which apps accept provider keys, used in Web privacy copy. |
| screen | CloudPrivacyScreen | `apps/mobile/src/features/settings/cloud-privacy/index.tsx` | Mobile Privacy screen and approach cards. |
| screen | DataUseScreen | `apps/mobile/src/features/settings/cloud-privacy/DataUseScreen.tsx` | Mobile 'Where each feature processes your data' list and export. |
| screen | ChatPrivacyScreen | `apps/mobile/src/features/settings/cloud-privacy/ChatPrivacyScreen.tsx` | Temporary Chat switch and retention footnote. |
| component | TrainingPreferenceGroups | `apps/mobile/src/features/settings/cloud-privacy/TrainingPreferenceGroups.tsx` | Mobile training and improvement switches. |
| component | PrivacyCloudControls | `apps/mobile/src/features/settings/cloud-privacy/PrivacyCloudControls.tsx` | Shows Cloud controls only when signed in and in Cloud mode. |
| command | render_privacy_settings | `apps/cli/src/claude_parity.rs` | CLI /privacy-settings output. |
| config | command_registry privacy-settings | `apps/cli/src/command_registry.rs` | Registers the command name. |
| component | settings webview 'Where your data goes' | `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts` | VS Code data-flow list. |
| service | SettingsPanel openPrivacySettings | `apps/extension-vscode/src/features/settings/SettingsPanel.ts` | Opens the web privacy page from VS Code. |
| config | DATA_HANDLING_DISCLOSURES | `apps/extension/src/features/privacy/dataHandling.ts` | Chrome disclosures and mirror label. |
| component | data-handling-section | `apps/extension/src/features/options/data-handling-section.ts` | Renders disclosures and the toggles on the Chrome options page. |
| test | PrivacySection tests | `apps/web/features/settings/sections/__tests__/PrivacySection.training.test.tsx` | Training copy and toggles. |
| test | PrivacyCenter tests | `apps/mobile/src/features/settings/__tests__/PrivacyCenter.test.tsx` | Mobile privacy screen order, cards, Local Mode. |
| test | ChatPrivacyAndDataUse tests | `apps/mobile/src/features/settings/__tests__/ChatPrivacyAndDataUse.test.tsx` | Chat privacy and Data use & access lists. |
| test | privacy-control-claims | `apps/extension-vscode/src/__tests__/privacy-control-claims.test.ts` | VS Code must not advertise training or retention controls. |
| test | extension-privacy-disclosure | `apps/extension/__tests__/extension-privacy-disclosure.test.ts` | Chrome disclosure text and mirror switch. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: the page reads saved preferences and shows defaults when none are saved. | device and our servers | apps/web/features/settings/sections/PrivacySection.tsx:236 area; apps/web/features/settings/services/privacy-preferences-client.ts:57 |
| Web: a switch change is sent with PUT and the server merges it into the stored settings; a stale version is rejected. | our servers | apps/web/features/settings/services/privacy-preferences-client.ts:74; apps/web/app/api/settings/preferences/route.ts:124 |
| Mobile: Local Mode shows static statements; Cloud mode loads and saves the same preference contract. | device and our servers | apps/mobile/src/features/settings/cloud-privacy/PrivacyCloudControls.tsx:20; apps/mobile/src/features/settings/cloud-privacy/TrainingPreferenceGroups.tsx:150 |
| CLI: /privacy-settings renders text from the session's privacy mode and provider route. | device | apps/cli/src/claude_parity.rs:443 |
| VS Code: buttons open the web privacy page and subprocessors page in the browser. | device and our servers | apps/extension-vscode/src/features/settings/SettingsPanel.ts:89 |
| Chrome: disclosure text is static; the mirror switch writes a browser storage key read by the sync code. | device | apps/extension/src/features/options/data-handling-section.ts:172 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web privacy preferences (telemetry, provider training opt-out, model-improvement consents, temporary-by-default) | table:user_settings (JSON) and the Web settings store | Account-wide across apps that read it | Until changed or the account is erased. |
| Chrome mirror and error-report consent | chrome.storage.local | No | Until changed or the extension is removed. |
| CLI privacy mode | config ui.privacy_mode (account or project settings) | Not found | Until changed. |

**Models and providers.** The pages describe provider handling rather than use a model. They say Cloud requests go to the provider serving the chosen model, Free plan providers may train unless the no-train switch is on, and an own-key request goes straight to the person's provider. Named services: a third-party search service, OpenAI for transcription and voice, Cloudflare R2 for files. Provider list is at /subprocessors.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Reading statements needs no account on Mobile Local, CLI or Chrome. Saving Web or Mobile privacy switches needs a signed-in account. |
| Permissions | none found in the code |
| Subscription | Statements are open to every plan. The no-train switch is described as mattering on Free ('On Free, this keeps your chats off free models whose terms may allow training') (apps/web/features/settings/sections/PrivacySection.tsx:63). Whether the switch is gated by plan beyond that is unknown. |
| Limits and metering | none found in the code |
| Feature flags | Mobile cloud controls are conditioned on mode and sign-in; no named flag found. |
| Model compatibility | The no-train switch changes which models can be picked on Free [inferred from its description]. |
| Provider restrictions | Own-key requests are described as going straight to the provider under its terms (VS Code, CLI). |
| Local mode | Local Mode shows only statements that apply locally (training, telemetry; no retention card); Local data is processed on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Web loading, save, failure | Save status line, 'Retry loading' button, message for stale or pending telemetry denial. | apps/web/features/settings/sections/PrivacySection.tsx:231; apps/web/features/settings/sections/PrivacySection.tsx:446 |
| Mobile signed out in Cloud mode | Row 'AGI Cloud privacy controls' with 'Sign in'. | apps/mobile/src/features/settings/cloud-privacy/PrivacyCloudControls.tsx:20 |
| Mobile training read or write fails | 'Retry loading model training settings' and 'Your settings changed elsewhere...' messages. | apps/mobile/src/features/settings/cloud-privacy/TrainingPreferenceGroups.tsx:73 |
| Mobile help article cannot open | Tells the person it cannot be opened. | apps/mobile/src/features/settings/__tests__/PrivacyCenter.test.tsx:213 |
| Chrome settings read or save fails | Load or save failure text next to the row. | apps/extension/src/features/options/data-handling-section.ts:93 |
| Offline | Mobile static cards and CLI text work offline; Web and Mobile switches need the network. Detail not traced. | apps/cli/src/claude_parity.rs:443 |
| Accessibility | Mobile privacy cards are read whole by screen readers; Web switches carry aria labels. | apps/mobile/src/features/settings/cloud-privacy/PrivacyApproachCards.tsx:36; apps/web/features/settings/sections/PrivacySection.tsx:73 |
| Desktop difference | Shows the Web page; Tauri copy not checked. | doc: AGENTS.md section 5 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/__tests__/PrivacySection.training.test.tsx`: No promised training opt-in; chat and voice improvement choices off.
- `apps/web/features/settings/sections/__tests__/PrivacySection.persistence.test.tsx`: Strict read, one-field saves, denial and retry behaviour.
- `apps/web/features/settings/sections/__tests__/PrivacySection.temporary-switch.test.tsx`: Temporary-by-default switch.
- `apps/web/features/settings/sections/__tests__/PrivacySection.account-deletion.test.tsx`: Account deletion section (name-based).
- `apps/mobile/src/features/settings/__tests__/PrivacyCenter.test.tsx`: Mobile privacy sections, Local Mode, retention hidden in Local, article cards, account states.
- `apps/mobile/src/features/settings/__tests__/ChatPrivacyAndDataUse.test.tsx`: Chat privacy rows per mode and the processing list.
- `apps/mobile/__tests__/ModelTrainingPolicy.test.tsx`: Mobile training copy.
- `apps/cli/src/claude_parity.rs`: Inline test of /privacy-settings output.
- `apps/extension-vscode/src/__tests__/privacy-control-claims.test.ts`: No training or retention control is advertised.
- `apps/extension/__tests__/extension-privacy-disclosure.test.ts`: Chrome disclosure naming and mirror.

**Test scenarios**

- **Defaults on a new account**
  1. Sign in to a new Web account; open Settings, Privacy.
  - Expected: 'Use my chats' and 'Use my voice' off; note says nothing is used today.
- **Toggle and reload**
  1. Switch on 'Only use models that do not train on your chats'; reload.
  - Expected: Switch stays on; a failed save shows an error and Retry.
- **Mobile Local vs Cloud**
  1. In Local Mode open Settings, Privacy; then switch to Cloud, signed in.
  - Expected: Local: no Data retention card; Cloud: retention card and training switches.
- **Processing list**
  1. Open Mobile Data use & access and Web 'Where each feature processes your data'.
  - Expected: Each feature has a destination; web search names a third-party search service.
- **CLI statement**
  1. Start the CLI; run /privacy-settings.
  - Expected: Separate History, Model training and Retention lines.
- **Chrome mirror switch**
  1. Open extension options; toggle the mirror.
  - Expected: Status line changes between mirrored and 'stay in this browser only'.

**Where to look when it fails**

- Web: PUT /api/settings/preferences status and version errors; table user_settings.
- Mobile: training messages 'The save could not be confirmed...'.
- Chrome: storage key agi_cloud_conversation_mirroring.
- Compare retention wording across apps when a test or review flags drift.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/041-temporary-and-private-experiences.md](../../70-qa/test-plans/web/041-temporary-and-private-experiences.md)
- Desktop: [70-qa/test-plans/desktop/041-temporary-and-private-experiences.md](../../70-qa/test-plans/desktop/041-temporary-and-private-experiences.md)
- Mobile: [70-qa/test-plans/mobile/041-temporary-and-private-experiences.md](../../70-qa/test-plans/mobile/041-temporary-and-private-experiences.md)
- CLI: [70-qa/test-plans/cli/041-temporary-and-private-experiences.md](../../70-qa/test-plans/cli/041-temporary-and-private-experiences.md)
- VS Code: [70-qa/test-plans/vscode/041-temporary-and-private-experiences.md](../../70-qa/test-plans/vscode/041-temporary-and-private-experiences.md)
- Chrome: [70-qa/test-plans/chrome/041-temporary-and-private-experiences.md](../../70-qa/test-plans/chrome/041-temporary-and-private-experiences.md)

## 10. Gaps and dependencies

- **Retention and training wording is written separately per app** Affects: All apps. Evidence: apps/web/features/settings/sections/PrivacySection.tsx:519; apps/mobile/src/features/settings/cloud-privacy/ChatPrivacyScreen.tsx:18; apps/cli/src/claude_parity.rs:455. Work needed: Single shared source and a drift test.
- **Web copy omits Mobile Local Mode** Affects: Web readers. Evidence: apps/web/features/settings/sections/PrivacySection.tsx:495. Work needed: Update the sentence.
- **Desktop privacy page not separately verified** Affects: Desktop. Evidence: brief marks Desktop done per brief only. Work needed: Run the Electron app and check the page.
- **No verified record that retention claims match actual deletion jobs** Affects: All apps. Evidence: apps/web/app/api/cron/purge-temporary-chats/route.ts:43 is cited in the brief for temporary chats; the Recently deleted purge was not traced. Work needed: Trace the purge jobs and add tests tied to the 30-day statements.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:own-key
- mode:cloud
- api:GET /api/settings/preferences
- api:PUT /api/settings/preferences
- table:user_settings
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- F041-08

## Unknown

- Whether Desktop (Electron) renders exactly the Web page or adds its own privacy text.
- Whether the no-train switch is gated by plan on the server.
- Whether the 30-day Recently deleted purge job exists and runs as stated.
- Table behind Web recent searches and retention jobs (not traced).
- Whether Chrome's 100-chat local limit statement matches the code (not traced).
