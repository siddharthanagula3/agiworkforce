---
id: "F008-03"
type: "feature"
title: "Text fields and search"
aliases: ["Inputs", "Text inputs", "Textarea", "Composer text box", "Search field", "SearchInput", "Password field", "API key field", "Verification code field", "AuthCodeStep", "One-time-code field"]
area: "8 Basic interactive elements"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "partly seen (1 of 5)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S8.09", "S8.10", "S8.11", "S8.12", "S8.13"]
depends_on: ["SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "SYS-connectors-plugins-and-skills", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F008-03 Text fields and search

Typing fields in every app: single-line inputs with labels, multi-line boxes such as the composer, search fields, masked secret fields, and a six-digit sign-in code field on web and mobile. Chrome has no sign-in code field of its own in the code read.

Area: [8. Basic interactive elements](README.md). Requirement items: [S8.09](../../10-requirements/capabilities/008-basic-interactive-elements.md#s809), [S8.10](../../10-requirements/capabilities/008-basic-interactive-elements.md#s810), [S8.11](../../10-requirements/capabilities/008-basic-interactive-elements.md#s811), [S8.12](../../10-requirements/capabilities/008-basic-interactive-elements.md#s812), [S8.13](../../10-requirements/capabilities/008-basic-interactive-elements.md#s813).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 5) |
| Desktop | built | built | not seen by a person |
| Mobile | built (this page lists unfinished parts) | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets people type text. The shared Input marks errors with aria-invalid and links an error message (packages/ui/ui/src/primitives/Input.tsx:12-37). SearchInput is a labelled type=search field with a decorative icon (packages/ui/ui/src/primitives/SearchInput.tsx:35-60). Secret fields hide characters (apps/web/features/connectors/components/ConnectorApiKeyForm.tsx:194). The web sign-in code field takes only digits, up to six (apps/web/features/auth/AuthCodeStep.tsx:166; apps/web/features/auth/authContract.ts:95).

**Why it exists.** Every app needs typed input: messages, names, search, keys and sign-in codes. Secrets must not show on screen. Codes should autofill from the message.

**Who uses it.** Everyone.

**Problems it solves**

- Fields have labels or names for screen readers.
- Secrets are hidden.
- A typed code submits on the last digit.
- Search fields use search meaning.

**Use cases**

- Type a code from your email to sign in on web.
- Paste an API key into the connector form on web.
- Add an auth token in AGI Mobile's custom connector sheet (masked).
- Search models in the model picker.

## 2. User experience

**Where to find it**

- Web: sign-in code step (AuthCodeStep.tsx), connector API key form (ConnectorApiKeyForm.tsx:185-196), chat lists search (apps/web/features/chat/components/ChatsAndTasksList.tsx:297), shortcuts dialog (KeyboardShortcutsDialog.tsx:268).
- Desktop: the hosted web app in the public Desktop (doc: AGENTS.md section 5).
- Mobile: sign-in (apps/mobile/src/features/auth/components/MobileSignIn.tsx:636-660), custom connector modal (AddCustomConnectorModal.tsx:175-205), chats list search (brief S8.11).
- CLI: elicitation overlay (apps/cli/src/tui/widgets/elicitation_overlay.rs), model picker search (apps/cli/src/tui/widgets/model_picker.rs:108-125).
- VS Code: an input box asks for an API key with masking (apps/extension-vscode/src/core/commandSetup.ts:1263-1267).
- Chrome: options page bearer-token field (apps/extension/src/options.ts:1965-1971).

**Before you start**

- Sign-in code step needs an email that was sent a code (AuthCodeStep.tsx:104-113 copy).

**Screens and controls**

- Web code field: label 'Code', numeric, autocomplete one-time-code, maxLength six, Continue button, 'Resend code' with a countdown (AuthCodeStep.tsx:147-199).
- Mobile sign-in: one field switching between 'Password' (masked) and 'Verification code' (number pad, oneTimeCode) (MobileSignIn.tsx:644-651).
- Web secret: label from API_KEY_LABEL, type password, autocomplete off (ConnectorApiKeyForm.tsx:189-196).
- CLI: fields named like secrets show as asterisks (elicitation_overlay.rs:16, :82, :281).

**Journey**

1. 1. Person focuses a field (click, tap, Tab).
2. 2. Types or pastes.
3. 3. For the sign-in code, non-digits are removed and the code submits at six digits automatically (AuthCodeStep.tsx:118, :166).
4. 4. Errors show under the field or in an alert line (AuthCodeStep.tsx:173).
5. 5. Resend waits for the countdown (AuthCodeStep.tsx:99, :191).

**What the person sees and gets**

- Web code: error text with role alert; busy phase disables the field (AuthCodeStep.tsx:101, :173).
- Web connector key: failure sentence with role alert (ConnectorApiKeyForm.tsx:207-211 region).
- Mobile custom connector: error text; URL field shows a reason when not https (AddCustomConnectorModal.tsx:186-197).

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web Input with error state (Input.tsx:12-37), SearchInput (SearchInput.tsx:35-60).
- Web sign-in code step with digit filter, auto submit, resend cooldown and field error (AuthCodeStep.tsx:99-199).
- Web connector API key masked field with label (ConnectorApiKeyForm.tsx:189-196).
- Mobile sign-in code field with one-time-code autofill hints (MobileSignIn.tsx:644-651).
- Mobile secret token field masked (AddCustomConnectorModal.tsx:204).
- CLI secret masking of credential-named or password-format fields, submitted unchanged (elicitation_overlay.rs:82, :281; tests at :1843, :1866).
- VS Code API key input box with password: true (commandSetup.ts:1263-1267).
- Chrome options bearer field is type password, labelled as a local-development fallback (options.ts:1960-1971).

**Incomplete**

- Chrome has no sign-in code field found; authInterop.ts only detects other sites' code fields so the extension never fills them (apps/extension/src/features/auth/authInterop.ts:1-9, :42). The brief marks Chrome done for S8.13 (doc: knowledge-base/data/area-briefs/008-basic-interactive-elements.md S8.13).
- Mobile code field exists although the brief marks mobile unverified (MobileSignIn.tsx:648-650).
- CLI and VS Code sign-in code fields: not found, no brief status.

**Present but disconnected or switched off**

- None found.

**Not available**

- Composer newline and send rules were not checked (ChatComposerNew.tsx not opened); VS Code and Chrome composers not opened.

## 4. Required behaviour

**Established requirements**

- Single-line inputs have a visible label or accessible name. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.09)
- A multi-line text area that accepts newlines is used in shipped UI, for example the composer. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.10)
- A search field has search semantics, a placeholder or label, and filters as typed or on submit. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.11)
- Secret entry uses a masked field. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.12)
- A one-time-code field takes a short numeric code with autofill or paste. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.13)
- Composer text input is multi-line capable, keyboard-safe and sends on explicit action. (source: (doc: docs/product/requirements.md:966))
- Collect the minimum data required; never commit a secret. (source: (doc: AGENTS.md section 6))

**Acceptance criteria**

1. Every field is named by a label or accessible name.
2. Typing letters into the web code field leaves it empty; six digits submit once.
3. Pasting a six-digit code fills and submits.
4. The secret fields show dots or asterisks, not the text.
5. Search fields are announced as search fields.
6. After a wrong code the person can type again and submit again.
7. Resend is disabled until the countdown ends.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Chrome should either have its own code step or the brief status should say not applicable [inferred from authInterop.ts purpose].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a show/hide control to masked fields.
- [proposed] Record empty, loading and failure states of the mobile code step with tests.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Input | `packages/ui/ui/src/primitives/Input.tsx` | Text input with error state |
| component | Textarea | `packages/ui/ui/src/primitives/Textarea.tsx` | Multi-line field primitive (file listed, not opened) |
| component | SearchInput | `packages/ui/ui/src/primitives/SearchInput.tsx` | Labelled search field |
| component | AuthCodeStep | `apps/web/features/auth/AuthCodeStep.tsx` | Web sign-in code step |
| config | AUTH_CODE_LENGTH | `apps/web/features/auth/authContract.ts` | Six digit code length constant (line 95) |
| component | ConnectorApiKeyForm | `apps/web/features/connectors/components/ConnectorApiKeyForm.tsx` | Masked API key field |
| component | MobileSignIn | `apps/mobile/src/features/auth/components/MobileSignIn.tsx` | Password and code fields on mobile |
| component | AddCustomConnectorModal | `apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx` | URL and masked token fields on mobile |
| component | ChatInput | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Mobile composer (brief item S8.10) |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web composer (brief item S8.10) |
| component | ElicitationOverlay | `apps/cli/src/tui/widgets/elicitation_overlay.rs` | CLI form fields with masking |
| component | ModelPicker (CLI) | `apps/cli/src/tui/widgets/model_picker.rs` | CLI search filter |
| command | VS Code API key prompt | `apps/extension-vscode/src/core/commandSetup.ts` | showInputBox with password true |
| component | Chrome options bearer field | `apps/extension/src/options.ts` | Password-type token field |
| service | authInterop | `apps/extension/src/features/auth/authInterop.ts` | Detects credential and code fields on pages so the agent leaves them to the person |
| test | AuthCodeStep test | `apps/web/features/auth/__tests__/AuthCodeStep.test.tsx` | Web code step behaviour |
| test | Input primitive test | `packages/ui/ui/src/primitives/__tests__/Input.test.tsx` | Error state |
| test | SearchInput primitive test | `packages/ui/ui/src/primitives/__tests__/SearchInput.test.tsx` | Label and icon |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Typed text updates field state in the app. | device | AuthCodeStep.tsx:162-170 |
| The sign-in code is passed to the onSubmit callback; where it is verified was not traced (SYS-authentication-and-identity). | device | AuthCodeStep.tsx:76-80, :118-121 |
| The connector API key form tests and saves the key with a server; the test file describes asking the server which header to send and showing the server sentence when a key is rejected. | our servers | apps/web/features/connectors/components/__tests__/ConnectorApiKeyForm.test.tsx (it names, first two) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Sign-in code | component state only, in memory | no | dropped when the step closes [inferred] |
| Connector API key | unknown (server side after save) | unknown | a saved key is shown as 'already saved' with a replace option (ConnectorApiKeyForm.tsx:199) |

**Models and providers.** Fields use no model. A provider API key typed in VS Code is read by the extension (commandSetup.ts:1263); which provider it feeds is unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in code fields run before the person has an account session. Connector key fields need a signed-in account [inferred]. |
| Permissions | none found in the code for plain fields. |
| Subscription | none found in the code (searched Input.tsx, SearchInput.tsx, AuthCodeStep.tsx). |
| Limits and metering | Web resend cooldown from AUTH_RESEND_COOLDOWN_SECONDS (AuthCodeStep.tsx:99); a server resend block can extend it (AuthCodeStep.tsx:107-109). |
| Feature flags | none found in the code. |
| Model compatibility | not model-dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Text fields work offline on the device; sign-in code needs the sign-in service, so it needs the network. Whether Local mode requires sign-in is a separate question not answered here. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Wrong code (web) | Error line shown; the same code can be sent again after a refusal | AuthCodeStep.tsx:89-95, :173; AuthCodeStep.test.tsx it 'sends the same code again when the person retries after a refusal' |
| Busy (web) | Field disabled while phase is not idle | AuthCodeStep.tsx:101, :160 |
| Delivery failed (mobile) | Message 'We couldn't send a code...' and the field is hidden | MobileSignIn.tsx:636-642 |
| Resend | Countdown, then enabled; clicking clears the code | AuthCodeStep.tsx:184-199 |
| Secret in CLI | Shown as asterisks, submitted verbatim | elicitation_overlay.rs:1843-1856 |
| Empty/loading/failure of the mobile code step | not verified (brief); partial handling seen at MobileSignIn.tsx:636-642 | doc: knowledge-base/data/area-briefs/008-basic-interactive-elements.md S8.13 (unverified); MobileSignIn.tsx:636-642 |
| Offline | not handled in the field code | not handled in the code (looked in Input.tsx, AuthCodeStep.tsx) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/auth/__tests__/AuthCodeStep.test.tsx`: Copy for inbox, device and passwordless; submit on last digit; single send; retry after refusal; resend empties field
- `apps/web/features/connectors/components/__tests__/ConnectorApiKeyForm.test.tsx`: Server header lookup then test and save; rejected key sentence; replace saved key; lookup failure with retry
- `packages/ui/ui/src/primitives/__tests__/Input.test.tsx`: No error by default; aria-invalid; errorMessageId merged
- `packages/ui/ui/src/primitives/__tests__/SearchInput.test.tsx`: Labelled search field with decorative icon; forwarded changes
- `apps/mobile/__tests__/MobileSignInIdentifier.test.tsx`: Mobile sign-in identifier step (contents not opened)
- `apps/cli/src/tui/widgets/elicitation_overlay.rs`: In-file tests: masked password and credential-named fields

**Test scenarios**

- **Web code entry**
  1. Start web sign-in with an email.
  2. On the code step type 'a1b2c3'.
  3. Type six digits.
  - Expected: Only digits remain; six digits submit once.
- **Autofill**
  1. On an iPhone with AGI Mobile, request a code.
  2. Use keyboard suggestion for the code.
  - Expected: Code fills the field (hints set at MobileSignIn.tsx:648-650).
- **Masked key**
  1. Open a connector needing an API key on web.
  2. Type a key.
  - Expected: Characters hidden.
- **CLI secret**
  1. Trigger an MCP elicitation with a token field.
  2. Type text.
  - Expected: Asterisks on screen, real value submitted.
- **Resend**
  1. On the web code step wait for the countdown.
  - Expected: Button changes from 'Resend code in Ns' to 'Resend code'.

**Where to look when it fails**

- Web: network panel for the code submission.
- CLI: elicitation tests.
- Not found: log names for sign-in code failures.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/008-basic-interactive-elements.md](../../70-qa/test-plans/web/008-basic-interactive-elements.md)
- Desktop: [70-qa/test-plans/desktop/008-basic-interactive-elements.md](../../70-qa/test-plans/desktop/008-basic-interactive-elements.md)
- Mobile: [70-qa/test-plans/mobile/008-basic-interactive-elements.md](../../70-qa/test-plans/mobile/008-basic-interactive-elements.md)
- CLI: [70-qa/test-plans/cli/008-basic-interactive-elements.md](../../70-qa/test-plans/cli/008-basic-interactive-elements.md)
- VS Code: [70-qa/test-plans/vscode/008-basic-interactive-elements.md](../../70-qa/test-plans/vscode/008-basic-interactive-elements.md)
- Chrome: [70-qa/test-plans/chrome/008-basic-interactive-elements.md](../../70-qa/test-plans/chrome/008-basic-interactive-elements.md)

## 10. Gaps and dependencies

- **Brief status for mobile code field is out of date** Affects: Mobile. Evidence: MobileSignIn.tsx:644-651 vs brief S8.13 unverified. Work needed: Verify on device and update the brief.
- **Chrome has no sign-in code field found** Affects: Chrome. Evidence: authInterop.ts:1-9 is detection only. Work needed: Confirm how Chrome signs in (sync with web?) and correct the brief.
- **Composer behaviour not checked** Affects: All. Evidence: ChatComposerNew.tsx, ChatInput.tsx not opened. Work needed: Read and test Enter versus newline rules.
- **Chrome masked field is a dev fallback** Affects: Chrome. Evidence: options.ts:1960-1971. Work needed: Check other secret fields in Chrome.

**Depends on**

- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- SYS-connectors-plugins-and-skills
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- Where the sign-in code is verified.
- Whether CLI has a sign-in code field.
- Whether VS Code and Chrome sign-in uses a code field.
- Composer Enter versus newline rules on each app.
- Where connector API keys are stored after save.
