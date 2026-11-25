---
id: "F012-10"
type: "feature"
title: "First-use introduction"
aliases: ["First-use introduction", "Onboarding", "Welcome page", "OnboardingWizard", "Get started with AGI Code (VS Code walkthrough)", "Welcome to AGI (Chrome page)", "/welcome", "S12.22"]
area: "12 New-chat experience"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S12.22"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-authentication-and-identity", "SYS-memory-projects-and-context", "SYS-local-inference", "F012-12"]
basis: "code inspection"
second_reader: "6 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F012-10 First-use introduction

Short first-run flows on each app. Web has a two-step wizard at /welcome with starter prompts. Mobile has hero, about-you and device-setup screens. The CLI has a terminal setup wizard. VS Code has a walkthrough and a first-run panel. Chrome opens a Welcome page on install. Each can be skipped.

Area: [12. New-chat experience](README.md). Requirement items: [S12.22](../../10-requirements/capabilities/012-new-chat-experience.md#s1222).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Greets a first-time person, asks for light personalization or setup, and then lands them in the first chat. Web asks for a preferred name and work description, then offers starter prompts. Mobile asks to accept terms, collects name and work, then offers a local model download or sign in to Cloud. (apps/web/features/onboarding/components/OnboardingWizard.tsx:36) (apps/mobile/app/(public)/onboarding.tsx:280)

**Why it exists.** The brief says first-time users are shown a short introduction to key features before or at their first chat (doc: knowledge-base/data/area-briefs/012-new-chat-experience.md, S12.22). Mobile requirements: onboarding shows brand and privacy summary, explains Local, BYOK and Cloud, checks local model readiness and never blocks Local use (doc: docs/product/requirements.md, M-ONB-001 to M-ONB-005).

**Who uses it.** New users on every app.

**Problems it solves**

- Empty new-chat screens do not tell a new person what to do.
- Personal details (name, work) make the first replies fit the person.
- Setup of how to connect (account, own key, local model) must happen once.

**Use cases**

- After sign-up on web, answer 'What should we call you?' and pick a starter prompt that fills the composer.
- Install the mobile app, tap 'Start chatting', accept the notice, download the recommended local model, and land in chat.
- Run the CLI for the first time and choose how to connect.
- Install the Chrome extension and read the Welcome page.

## 2. User experience

**Where to find it**

- Web: /welcome page showing the wizard (apps/web/app/welcome/page.tsx:12).
- Mobile: first screen after the age gate when no 'onboarding-done' value exists (apps/mobile/app/index.tsx:16).
- CLI: first interactive launch with no .setup_complete file, or 'agi onboarding' (apps/cli/src/lib.rs:6119) (apps/cli/src/lib.rs:7803).
- VS Code: Getting Started walkthrough 'Get started with AGI Code' and the command 'Code: Show Getting Started' (apps/extension-vscode/package.json:818) and a first-run panel in the sidebar (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1392).
- Chrome: Welcome page opened on install, title 'Welcome to AGI' (apps/extension/src/background.ts:7697) (apps/extension/src/welcome.html:6).
- Desktop: the hosted web wizard (doc: AGENTS.md section 5).

**Before you start**

- Web: signed in, current terms accepted, adult eligibility confirmed; otherwise redirected (apps/web/app/welcome/page.tsx:14-22). These checks run as redirects on every visit, so a signed-in user who has not accepted terms cannot reach the wizard (apps/web/app/welcome/page.tsx:18-20).
- Mobile: age gate confirmed first (apps/mobile/app/index.tsx:12).
- CLI: an interactive terminal and no subcommand or prompt (apps/cli/src/lib.rs:6115). The first-run wizard runs only when no subcommand, no prompt argument and no --dump-system-prompt are given, a terminal can prompt, and the marker is absent (apps/cli/src/lib.rs:6112-6119).

**Screens and controls**

- Web step 1 'What should we call you?': 'Preferred name', 'What best describes your work?' select; 'Skip for now' (apps/web/features/onboarding/components/OnboardingWizard.tsx:199).
- Web step 2 'What do you want to do first?': radio use cases, 'Start with one of these' prompts, 'How this works' notes (apps/web/features/onboarding/components/OnboardingWizard.tsx:41).
- Mobile: hero 'Start chatting' with Terms and Privacy Policy links; first-run disclosure modal; about-you with 'Continue' and 'Skip for now'; device tier with 'Download <model>' / 'Continue', 'Pick a different model', 'Continue without downloading', 'Sign in to use Cloud' (apps/mobile/app/(public)/onboarding.tsx:569-804).
- CLI: menu 'Choose how to connect' with Local model, Provide your own API key, Other providers, AGI cloud, Skip for now (apps/cli/src/onboarding.rs:262).
- VS Code walkthrough steps: Install the AGI CLI; Work in this repository; Follow background work from the IDE; Turn intent into a reviewed change; Set autonomy and verify the boundary (apps/extension-vscode/package.json:818-870).

**Journey**

1. Web: sign up completes, the person reaches /welcome (how they get there is unknown, see unknowns).
2. Step 1: enter name and work (prefilled from the account), press Continue.
3. Step 2: pick a use case; pick a starter prompt; the wizard saves, then goes to /chat?starterPrompt=... and the composer is prefilled (apps/web/features/chat/pages/WebChatPage.tsx:1322).
4. Or 'Skip for now': saves a completed marker and goes to /chat.
5. Mobile: hero, terms and disclosure accept, about-you, device tier, download or skip, then the app main screen; 'onboarding-done' is stored (apps/mobile/app/(public)/onboarding.tsx:257).
6. CLI: banner, trust current folder, choose connection, authenticate, choose model, marker file written (apps/cli/src/onboarding.rs:795).

**What the person sees and gets**

- Web: 'Step N of 2'; errors 'Failed to save your preferences' or 'Failed to skip setup' (apps/web/features/onboarding/components/OnboardingWizard.tsx:78).
- Web: use-case disclosure 'This picks the suggestions below and nothing else...' (apps/web/features/onboarding/components/OnboardingWizard.tsx:38).
- Mobile: download progress and speed; error with 'Try again' and 'Continue to chat' (apps/mobile/app/(public)/onboarding.tsx:903).
- CLI: 'Setup interrupted. Run again to continue.' when the folder-trust step fails or is cancelled; it is the folder-trust failure message, not a general Ctrl+C message (apps/cli/src/onboarding.rs:800-808).
- Chrome: Welcome page; side-panel tour and pin prompt keys (apps/extension/src/features/side-panel/onboarding.ts:4).

**Settings**

- Web: name and work description are stored as general preferences and editable later in Settings (apps/web/features/onboarding/lib/onboarding-preferences.ts:58).
- Mobile: personalization nickname and occupation (apps/mobile/app/(public)/onboarding.tsx:310).
- CLI: 'agi onboarding' re-runs; /login configures later.
- VS Code: 'Code: Show Getting Started' resets the seen flag (apps/extension-vscode/src/core/commandSetup.ts:2543).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web /welcome redirects to /login when signed out and to /chat when onboarding is already completed (apps/web/app/welcome/page.tsx:15-29).
- Wizard completes or skips by writing onboardingCompletedAt into the 'general' preference namespace (apps/web/features/onboarding/lib/onboarding-preferences.ts:58-71).
- The chosen use case is spent on suggestions and not saved on the account (apps/web/features/onboarding/lib/onboarding-preferences.ts:21).
- Mobile root routes to onboarding until 'onboarding-done' is set (apps/mobile/app/index.tsx:16).
- CLI wizard runs once per config folder and writes the .setup_complete marker file when the flow reaches the end, including after 'Skip for now' (apps/cli/src/onboarding.rs:26) (apps/cli/src/onboarding.rs:887-893,1004-1009). Cancelling at the folder-trust or connection-menu step writes no marker, so the wizard returns on the next run (apps/cli/src/onboarding.rs:787-821).
- CLI 'Skip for now' (AuthChoice::Skip) only prints 'Skipped authentication' and still writes .setup_complete, so the first-run wizard never reappears afterwards (apps/cli/src/onboarding.rs:887-893,1007).
- VS Code seen flag agiWorkforce.onboardingSeen set on completeOnboarding (apps/extension-vscode/src/features/onboarding/onboardingState.ts:3) (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1595).
- Chrome opens the Welcome page on install only (apps/extension/src/background.ts:7697).

**Incomplete**

- Mobile onboarding is a setup flow (terms, name, local model) rather than a tour of main features; no screens that explain modes Local, own key and Cloud in words were found beyond the device screen (docs M-ONB-002 not confirmed) (apps/mobile/app/(public)/onboarding.tsx:700).
- The brief's VS Code reference apps/extension-vscode/package.json:671 now points at a project command, not onboarding; the real walkthrough is at line 816.

**Present but disconnected or switched off**

- No code that sends a new web user to /welcome automatically was found in non-test code; /welcome is only a page and an allowed post-auth destination in a test (apps/web/features/auth/__tests__/postAuthDestination.test.ts:24).

**Not available**

- Desktop-specific onboarding: none found; Electron shows the hosted web page.
- Language, time zone or memory steps are intentionally not part of sign-up (doc: docs/decisions/2026-09-27-founder-decisions.md, S3.22, S3.25).

## 4. Required behaviour

**Established requirements**

- First-time users are shown a short introduction to key features before or at their first chat. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S12.22)
- Complete and skip persist across reload; delayed profile loading never overwrites an edited field; read and save failures expose a recoverable state without claiming completion. (source: W01 (doc: docs/product/experience-contract.md:774))
- Mobile onboarding shows brand, Local-first positioning and a privacy summary, lets the user proceed without an account, explains Local, BYOK and Cloud, checks local model readiness, and does not block Local use with sign-in. (source: M-ONB-001 to M-ONB-005 (doc: docs/product/requirements.md:937))
- No language, time zone or memory step at sign-up. (source: (doc: docs/decisions/2026-09-27-founder-decisions.md))

**Acceptance criteria**

1. A new signed-in web user without the completed marker sees the two-step wizard at /welcome; a user with it is sent to /chat.
2. 'Skip for now' lands in /chat and /welcome then redirects to /chat on later visits.
3. Choosing a starter prompt lands in /chat with that prompt in the composer and removes the query parameter.
4. A save failure shows an error and lets the person retry.
5. Mobile first launch shows the hero, and after finishing, relaunch goes straight to the app.
6. CLI first run shows the connection menu once; re-run needs 'agi onboarding'.
7. Chrome install opens the Welcome page once.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The edited-field guard stops late seed data from overwriting what the person typed [inferred from editedFields ref in OnboardingWizard].
- Failure of the seed read lets the wizard still show with an account name fallback [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the trigger for /welcome explicit and tested (redirect after sign-up).
- [proposed] Add a plain explanation of Local, own key and Cloud to mobile and web onboarding to meet M-ONB-002.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | WelcomePage | `apps/web/app/welcome/page.tsx` | Server page: auth, terms, adult checks, completed redirect, renders the wizard. |
| component | OnboardingWizard | `apps/web/features/onboarding/components/OnboardingWizard.tsx` | Two-step wizard, skip, finish with starter prompt. |
| component | StarterPrompts | `apps/web/features/onboarding/components/StarterPrompts.tsx` | Starter prompt buttons for the chosen use case. |
| config | ONBOARDING_USE_CASES | `apps/web/features/onboarding/lib/use-cases.ts` | Use case labels, descriptions and starter prompts. |
| service | onboarding-preferences | `apps/web/features/onboarding/lib/onboarding-preferences.ts` | Load seed, complete or skip via the 'general' preference namespace. |
| service | getOnboardingStatus | `apps/web/lib/server/user-identity.ts` | Reads onboardingCompletedAt from the identity namespace (line 131). |
| screen | Signup complete page | `apps/web/app/signup/complete/page.tsx` | After sign-up: email, age and terms steps, then redirect destination. |
| hook | starterPrompt handoff | `apps/web/features/chat/pages/WebChatPage.tsx` | Prefills composer from ?starterPrompt and removes it (lines 1146, 1322). |
| screen | Mobile root index | `apps/mobile/app/index.tsx` | Chooses age gate, onboarding or app. |
| screen | Mobile onboarding | `apps/mobile/app/(public)/onboarding.tsx` | Hero, disclosure, about-you, device tier, download screens; stores onboarding-done. |
| store | mobile storage onboarding-done | `apps/mobile/lib/mmkv.ts` | Device store holding the onboarding-done key. |
| service | CLI onboarding | `apps/cli/src/onboarding.rs` | Wizard, marker file .setup_complete, auth and model choice. |
| command | CLI first-run hook and 'onboarding' command | `apps/cli/src/lib.rs` | Runs wizard on first interactive launch (6119) and on the Onboarding command (7803). |
| config | VS Code walkthrough | `apps/extension-vscode/package.json` | agiWorkforce.gettingStarted walkthrough with five steps (line 818). |
| service | onboardingState | `apps/extension-vscode/src/features/onboarding/onboardingState.ts` | ONBOARDING_SEEN_KEY and shouldShowOnboarding. |
| command | agi-workforce.showOnboarding | `apps/extension-vscode/src/core/commandSetup.ts` | Resets the flag and shows the panel (line 2543). |
| component | VS Code webview onboarding panel | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | First-run panel markup and styles (line 442). |
| job | Chrome onInstalled welcome | `apps/extension/src/background.ts` | Opens the Welcome page on install (line 7694). |
| screen | Chrome Welcome page | `apps/extension/src/welcome.ts` | Welcome page logic; markup in welcome.html. |
| service | Chrome side-panel onboarding keys | `apps/extension/src/features/side-panel/onboarding.ts` | agi_onboarding_completed, disclosure version, tour and pin prompt keys. |
| test | onboarding-first-run e2e | `apps/web/e2e/onboarding-first-run.spec.ts` | Walks the web wizard end to end. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The server page reads the identity, checks terms and age, and reads the completed marker from the account. | our servers | apps/web/app/welcome/page.tsx:12-28 |
| The wizard loads the saved name and work description from the 'general' preference namespace and prefills. | device and our servers | apps/web/features/onboarding/lib/onboarding-preferences.ts:46 |
| Finish or skip saves the namespace with onboardingCompletedAt and refreshes profile consumers, then routes to /chat. | device and our servers | apps/web/features/onboarding/lib/onboarding-preferences.ts:48-71 |
| Mobile stores the choices on the device and sets 'onboarding-done'; the disclosure acceptance goes to a device ledger. | device | apps/mobile/app/(public)/onboarding.tsx:257-306 |
| Mobile local model download goes through the model install store (prepareModel). The ExecuTorch preset path calls prepareModel(presetModel) with no checksum condition and is handled by the store's own logic; only the non-preset path requires a catalog download URL, checksum and format. | outside service | apps/mobile/app/(public)/onboarding.tsx:346-392 |
| CLI wizard writes .setup_complete in the config folder when the flow reaches the end (including after 'Skip for now'); cancelling at the folder-trust or connection-menu step writes nothing. | device | apps/cli/src/onboarding.rs:26; apps/cli/src/onboarding.rs:787-821,887-893,1004-1009 |
| VS Code stores the seen flag in extension global state. | device | apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1595 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| preferredName, workDescription, onboardingCompletedAt | Account preference namespace 'general' on our servers | Yes through the account | Until the person edits or clears them in Settings |
| Mobile onboarding-done and personalization | Mobile device store (MMKV) and local settings store; also cloud settings store | Cloud settings store call is made; sync detail unknown | unknown |
| CLI .setup_complete marker | CLI config folder | No | Removed by forget_setup (apps/cli/src/onboarding.rs:19) |
| VS Code onboardingSeen | Extension global state | No | Reset by the show command |
| Chrome agi_onboarding_completed | chrome.storage.local | No | unknown |

**Models and providers.** Web wizard uses no model. Mobile recommends a local model by device tier and activates it on finish (apps/mobile/app/(public)/onboarding.tsx:252). CLI wizard offers local, own key, other provider or AGI cloud and then a model picker from the catalog (apps/cli/src/onboarding.rs:262). Names are not restated.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web: required. Mobile: Cloud sign-in offered at the end; the age gate runs before onboarding and is keyed to the account age check (FEATURES.auth and account age confirmation), so Mobile should not be described as simply 'no account' (apps/mobile/app/index.tsx:11-13). CLI: not required for the Local path (apps/cli/src/onboarding.rs:841). VS Code and Chrome: none for the intro. |
| Permissions | Web requires current terms and adult eligibility before the wizard, enforced as redirects on every visit (apps/web/app/welcome/page.tsx:18-20). Mobile requires age gate (apps/mobile/app/index.tsx:12). |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | Mobile FEATURES.auth affects the age gate input (apps/mobile/app/index.tsx:12). Others: none found. |
| Model compatibility | Mobile recommends by device tier (tier1/tier2) (apps/mobile/app/(public)/onboarding.tsx:197). |
| Provider restrictions | Mobile first-run disclosure records acceptance of certain providers (apps/mobile/app/(public)/onboarding.tsx:300). |
| Local mode | CLI onboarding has a Local path that needs no account ('Local model, no account needed.') (apps/cli/src/onboarding.rs:841-844). Mobile offers 'Continue without downloading' and 'Sign in to use Cloud', but its age gate runs first and is keyed to the account age check (apps/mobile/app/index.tsx:11-13). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Signed out on /welcome | Redirect to /login?redirectTo=/welcome. | apps/web/app/welcome/page.tsx:15 |
| Already completed | Redirect to /chat. | apps/web/app/welcome/page.tsx:28 |
| Signed in but terms not accepted or adult eligibility not confirmed | Redirected away; the wizard cannot be reached. | apps/web/app/welcome/page.tsx:18-20 |
| Save fails | Error text and the button is usable again. | apps/web/features/onboarding/components/OnboardingWizard.tsx:78-80 |
| Double click | completionAdmitted ref ignores a second call. | apps/web/features/onboarding/components/OnboardingWizard.tsx:68 |
| Mobile download fails | Error and 'Try again' / 'Continue to chat'. | apps/mobile/app/(public)/onboarding.tsx:903-916 |
| Mobile capability detection fails | Defaults kept. | apps/mobile/app/(public)/onboarding.tsx:222 |
| CLI cancelled at the folder-trust or connection-menu step | No marker; shows again next run. The 'Setup interrupted. Run again to continue.' text belongs to the folder-trust step. | apps/cli/src/onboarding.rs:800-821 |
| CLI 'Skip for now' chosen | Prints 'Skipped authentication', still writes .setup_complete, and the first-run wizard never shows again (re-run with 'agi onboarding'). | apps/cli/src/onboarding.rs:887-893,1007 |
| CLI given a subcommand, a prompt, --dump-system-prompt, or no terminal that can prompt | First-run wizard is skipped; the explicit 'agi onboarding' command runs it regardless. | apps/cli/src/lib.rs:6112-6119,7803 |
| Accessibility | Web focuses the name field; headings are h1; mobile buttons carry labels. | apps/web/features/onboarding/components/OnboardingWizard.tsx:79 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/onboarding/components/OnboardingWizard.test.tsx`: Wizard behaviour.
- `apps/web/features/onboarding/components/StarterPrompts.test.tsx`: Starter prompts.
- `apps/web/features/onboarding/__tests__/onboarding-preferences.test.ts`: Complete and skip saves.
- `apps/web/features/onboarding/__tests__/onboarding-resumability.test.ts`: Resume after reload.
- `apps/web/e2e/onboarding-first-run.spec.ts`: End-to-end wizard to prefilled composer (file exists; no recorded run).
- `apps/mobile/__tests__/Onboarding.test.tsx`: Mobile onboarding flow.
- `apps/mobile/__tests__/OnboardingPrivacyNotice.test.tsx`: Mobile privacy notice.
- `apps/extension-vscode/src/__tests__/onboarding.test.ts`: VS Code onboarding state.
- `apps/extension/__tests__/onboarding-welcome.test.ts`: Chrome welcome.
- `apps/cli/src/onboarding.rs`: 16 in-file Rust tests (count by test attribute).

**Test scenarios**

- **Web happy path**
  1. Use a new account.
  2. Open /welcome.
  3. Enter a name, continue, pick a use case and a starter prompt.
  - Expected: /chat opens with the prompt in the composer; /welcome now redirects to /chat.
- **Web skip**
  1. Open /welcome.
  2. Press 'Skip for now'.
  - Expected: /chat opens; reload of /welcome redirects to /chat.
- **Web save error**
  1. Block the preference save request.
  2. Finish the wizard.
  - Expected: 'Failed to save your preferences' and the wizard stays.
- **Mobile fresh install**
  1. Install fresh.
  2. Confirm age.
  3. Walk the hero to the device screen.
  4. Choose 'Continue without downloading'.
  - Expected: App opens; relaunch skips onboarding.
- **CLI first run**
  1. Use an empty config folder.
  2. Run the CLI in a terminal.
  - Expected: Wizard menu appears once; marker file written.
- **Chrome install**
  1. Install the extension fresh.
  - Expected: Welcome page tab opens once.

**Where to look when it fails**

- Wizard error strings above.
- onboardingCompletedAt in the 'general' preference namespace.
- CLI '.setup_complete' file in the config folder.
- Mobile key 'onboarding-done'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/012-new-chat-experience.md](../../70-qa/test-plans/web/012-new-chat-experience.md)
- Desktop: [70-qa/test-plans/desktop/012-new-chat-experience.md](../../70-qa/test-plans/desktop/012-new-chat-experience.md)
- Mobile: [70-qa/test-plans/mobile/012-new-chat-experience.md](../../70-qa/test-plans/mobile/012-new-chat-experience.md)
- CLI: [70-qa/test-plans/cli/012-new-chat-experience.md](../../70-qa/test-plans/cli/012-new-chat-experience.md)
- VS Code: [70-qa/test-plans/vscode/012-new-chat-experience.md](../../70-qa/test-plans/vscode/012-new-chat-experience.md)
- Chrome: [70-qa/test-plans/chrome/012-new-chat-experience.md](../../70-qa/test-plans/chrome/012-new-chat-experience.md)

## 10. Gaps and dependencies

- **No automatic route to /welcome after sign-up found in code.** Affects: Web, Desktop. Evidence: apps/web/app/signup/complete/page.tsx:12. Work needed: Confirm the redirect (identity provider setting or proxy) and add a test.
- **Mobile onboarding does not explain Local, own key and Cloud in plain words as the requirement asks.** Affects: Mobile. Evidence: apps/mobile/app/(public)/onboarding.tsx:700 versus docs/product/requirements.md:944. Work needed: Add the explanation or update the requirement.
- **Brief line references for VS Code (package.json:671) and mobile are stale.** Affects: Brief readers. Evidence: apps/extension-vscode/package.json:818. Work needed: Refresh references.
- **Desktop has no own first-use flow beyond the hosted page.** Affects: Desktop. Evidence: AGENTS.md section 5. Work needed: Confirm that is intended.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-authentication-and-identity
- SYS-memory-projects-and-context
- SYS-local-inference
- F012-12

## Unknown

- How a newly signed-up web user reaches /welcome.
- Whether the Chrome welcome page lists features or only disclosures (page content not read beyond title).
- Whether mobile onboarding data syncs to the account.
- Whether the VS Code first-run panel appears automatically on first launch or only through the command (hide message seen at ChatStateManager.ts:1392).
- Chrome side-panel tour behaviour.

## Second reader's check

A second reader checked 11 statements of this page against the code: 6 correct, 4 wrong or partly wrong, 1 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3/6):** "CLI wizard runs once per config folder and writes a marker file; Ctrl+C writes no marker" The code shows: The marker .setup_complete is written at Step 8 (onboarding.rs:1007) after every path that reaches the end. That includes 'Skip for now' / AuthChoice::Skip, which only prints 'Skipped authentication' (:887-893). So choosing Skip does mark setup complete and the wizard never shows again. Cancelling at the auth menu returns Ok(false) with no marker (:814-821). The 'Setup interrupted' text at :808 belongs to the trust-folder step, not Ctrl+C in general. (apps/cli/src/onboarding.rs:787-821,887-893,1004-1009). **Corrected:** The CLI writes .setup_complete when the flow reaches the end, including after 'Skip for now'. Cancelling at the folder-trust or connection-menu step writes no marker, so the wizard returns on the next run.
- **Partly wrong (section 6):** "Mobile local model download pulls the recommended model from its host, with checksum (onboarding.tsx:346-362)" The code shows: There are two paths. The ExecuTorch preset path calls prepareModel(presetModel) with no checksum condition. The checksum is required only on the second path (downloadUrl && checksum && format, :365-372). Both go through useModelInstallStore.prepareModel. (apps/mobile/app/(public)/onboarding.tsx:346-392). **Corrected:** The recommended model downloads through the model install store. Only the non-preset path requires a catalog checksum, download URL and format. The preset path is handled by the store's own logic.
- **Partly wrong (section 7):** "Local mode: Mobile and CLI onboarding both have a Local path that needs no account ('Local model, no account needed.')" The code shows: The CLI string exists (onboarding.rs:843), on the AuthChoice::Local branch. The cited line is not Mobile evidence, and I did not open a mobile string for the claim. Mobile has 'Continue without downloading' and 'Sign in to use Cloud'. Mobile also makes the age gate come first, and that gate uses FEATURES.auth and the account age confirmation, so it can depend on the account. (apps/cli/src/onboarding.rs:841-844; apps/mobile/app/index.tsx:11-13). **Corrected:** CLI Local path needs no account (onboarding.rs:841). For Mobile, the age gate runs before onboarding and is keyed to the account age check, so describe it as such instead of 'no account'.
- **Partly wrong (section 8):** "CLI non-interactive: Wizard is skipped (lib.rs:6118)" The code shows: The first-run wizard runs only when cli.command is none, cli.prompt is none, not dump_system_prompt, interactive::can_prompt() is true and the marker is absent (lib.rs:6112-6119). So it is skipped for any subcommand, a prompt argument or --dump-system-prompt, not only when non-interactive. The explicit 'agi onboarding' command (lib.rs:7803) runs it regardless. (apps/cli/src/lib.rs:6112-6119,7803). **Corrected:** The wizard is skipped when a subcommand, a prompt or --dump-system-prompt is given, or when no terminal can prompt.

**Facts the page missed**

- The web wizard's save-failure and skip behaviours are in apps/web/features/onboarding/components/OnboardingWizard.tsx. The page does not say that the wizard also requires terms acceptance and adult eligibility on every visit, which are enforced as redirects in apps/web/app/welcome/page.tsx:18-20, so a signed-in user who has not accepted terms cannot reach the wizard.
- The CLI wizard's trust-folder step (apps/cli/src/onboarding.rs:800-808) can end the whole flow with no marker. The page treats 'Setup interrupted' as a Ctrl+C message, but it is the folder-trust failure message.
- The CLI 'Skip for now' still writes .setup_complete (apps/cli/src/onboarding.rs:887-893,1007), so skipping means the first-run wizard never reappears. The page does not state this.
