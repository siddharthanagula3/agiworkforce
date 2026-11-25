---
id: "F003-09"
type: "feature"
title: "Profile and first-chat setup"
aliases: ["Onboarding wizard", "Welcome page (/welcome)", "What should we call you?", "Preferred name", "Work description", "Starter prompts", "Mobile About you step", "First-run setup", "VS Code Get started walkthrough", "Chrome welcome page"]
area: "3 Authentication and onboarding screens"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S3.21", "S3.22", "S3.23", "S3.24", "S3.35", "S3.36"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:own-key", "mode:cloud", "SYS-memory-projects-and-context", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design", "F003-08", "F085-02", "F003-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F003-09 Profile and first-chat setup

First-run setup that asks a preferred name and what the person's work is, offers starter prompts, and leads into a first chat. Web (and desktop through it) has a two-step wizard at /welcome; mobile has a name and work step inside local-first setup; CLI, VS Code and Chrome have setup without a name step.

Area: [3. Authentication and onboarding screens](README.md). Requirement items: [S3.21](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s321), [S3.22](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s322), [S3.23](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s323), [S3.24](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s324), [S3.35](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s335), [S3.36](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s336).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Saves a preferred name and a work description to the account so replies can address and tailor to the person, offers starter prompts based on one use-case answer (not saved), then opens chat with the chosen prompt filled in. On other apps it runs a first-run setup that ends in the first chat.

**Why it exists.** A new person should not face an empty box. Telling the assistant a name and work makes early answers fit, and starters show what to try (apps/web/features/onboarding/components/OnboardingWizard.tsx:41-45).

**Who uses it.** New users on web, desktop and mobile; new CLI, VS Code and Chrome installs.

**Problems it solves**

- Blank first screen.
- Replies that ignore who the person is.
- Over-collection: the use-case answer is spent on suggestions and never stored on the account (onboarding-preferences.ts:20-30).

**Use cases**

- A new web user types 'Sam', picks a work description, picks 'Write and debug code' and clicks a starter prompt; chat opens with the prompt in the box.
- A new phone user types a name, skips the work question, downloads a local model and starts a private chat.
- A developer runs the CLI for the first time and walks the setup to choose a model and permission mode.
- A VS Code user opens the 'Get started with AGI Code' walkthrough and resumes it later.

## 2. User experience

**Where to find it**

- Web (and Desktop, which shows the hosted app): page /welcome (apps/web/app/welcome/page.tsx); two steps titled 'What should we call you?' and 'What do you want to do first?'.
- Mobile: first-run screens in apps/mobile/app/(public)/onboarding.tsx: intro, 'About you' step with fields 'Your name' and 'What best describes your work?', then device and model screens.
- CLI: first run of agi shows 'Welcome to <product>' and the setup steps (apps/cli/src/onboarding.rs:795-1040).
- VS Code: Welcome page walkthrough 'Get started with AGI Code' (apps/extension-vscode/package.json:816-890).
- Chrome: welcome tab titled 'AGI in Chrome' and a side-panel onboarding prompt (apps/extension/src/welcome.ts; features/onboarding/welcome-page.ts).

**Before you start**

- Web: signed in, current Terms accepted and adult eligibility confirmed, otherwise /welcome redirects to those pages (welcome/page.tsx:18-20); if onboarding is already completed it redirects to /chat (page.tsx:29-31).
- Mobile: age gate done.
- CLI: terminal run of agi without a setup marker.

**Screens and controls**

- Web step 1: input 'Preferred name' (max 60), select 'What best describes your work?' (placeholder 'Select one'), 'Skip for now', 'Continue' (disabled while name is empty).
- Web step 2: radio list of use cases (e.g. 'Write and debug code', 'Write and edit', 'Research and analyze'), note 'This picks the suggestions below and nothing else. It is not saved to your account...' with 'Learn more' link, 'Start with one of these' prompt buttons, 'Back', 'Skip for now', 'Finish'.
- Web 'How this works' expandable list with three points about model choice, saved history and personalization.
- Mobile About you: two text inputs and a continue button (disabled until a name is typed), 'Skip for now' (onboarding.tsx:610-657).
- Mobile intro shows three notices: control of settings, where local and cloud chats are kept, 'AI can make mistakes, so check important information.' (onboarding.tsx:61-77).
- CLI: menus for trust, sign-in method, model, reasoning, permission mode, a yes/no for the terminal bell, and 'Press Enter to start...'.

**Journey**

1. Web: land on /welcome after sign-in; type the name; pick the work description; press 'Continue'.
2. Pick what to do first; click a starter prompt or press 'Finish'.
3. The page saves the name, the work description and a completion time, then opens /chat; a clicked prompt arrives in the message box (not sent).
4. Mobile: read the intro; accept the short first-run disclosure; enter name and work or skip; choose or download a local model; arrive in chat.
5. CLI: confirm the folder is trusted; choose Local model, own key or AGI sign-in; pick a model; pick a permission mode; press Enter; chat starts.

**What the person sees and gets**

- Errors: 'Failed to save your preferences' or 'Failed to skip setup' in a red alert; the page stays and allows retry (OnboardingWizard.tsx:99-110).
- Button text changes to 'Finishing...' while saving.
- After finishing, /chat shows the prompt in the composer and the URL parameter is removed (WebChatPage.tsx:1317-1327).
- The name appears in model instructions as 'The user's preferred name is ...' (user-identity.ts:186-191).

**Settings**

- Name and work description editable later in Settings (text on the wizard: 'Change it anytime in settings.').
- Personalization scopes per project (instructions, response style) default on (user-identity.ts:244-246).
- Mobile stores nickname and occupation in both the local and cloud personalization stores.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web wizard saves preferredName, workDescription and onboardingCompletedAt into the 'general' preference namespace and refreshes profile consumers (apps/web/features/onboarding/lib/onboarding-preferences.ts:58-71).
- The use-case choice is not stored; any older stored primaryUseCase is dropped on the next save (onboarding-preferences.ts:20-45).
- /welcome gates on Terms and age, and sends completed accounts to /chat (welcome/page.tsx).
- Name and work reach replies: buildCustomInstructionsPreamble builds a <user_profile> block used by the chat gateway and live voice (user-identity.ts:160-215,250-285; request-processor.ts:3997; live-voice-context.ts:179).
- Starter prompt hand-off to the composer (WebChatPage.tsx:1317-1327) and e2e coverage (apps/web/e2e/onboarding-first-run.spec.ts:57-95).
- Mobile About you step stores name and work in local and cloud settings stores, then continues to device and model setup (onboarding.tsx:312-320).
- CLI first run: trust, auth choice including Local model with no account, model and reasoning, safety notes, permission mode, memory note, bell question, wait for Enter, writes setup marker and runs the Setup hook (onboarding.rs:795-1040).
- VS Code: six-step walkthrough whose progress VS Code saves through completion events (package.json:816-890).
- Chrome: welcome page with sign-in, pin to toolbar, prompt-injection warning, disclosures and 'Open side panel'; completion marker markOnboardingComplete (welcome.ts).

**Incomplete**

- No code was found that sends a new web account to /welcome automatically; the page exists and is a protected route, but the redirect that starts it is unknown (searched app, features, lib).
- Mobile has no use-case question and no starter prompts; it asks only name and work.
- CLI has no name or work question at all; 'profile' and 'role' in the brief's CLI status are not met by onboarding.rs.
- VS Code and Chrome have no name or work step.
- Language and time zone are not part of setup on any app (brief S3.22 not applicable).

**Present but disconnected or switched off**

- The older primaryUseCase field is still read by readUserIdentity and getOnboardingStatus but is no longer written by the wizard (user-identity.ts:121,137).

**Not available**

- Resumable checklist on web, desktop, mobile, CLI, Chrome (brief S3.36); only VS Code has one.
- Preferred reply style during setup: not asked (brief S3.24 mentions it; the wizard has only name and work).

## 4. Required behaviour

**Established requirements**

- During onboarding the user sets basic profile details (at least the name the assistant uses) and they are saved to the account. (source: Brief S3.21)
- Onboarding asks role or intended use and uses the answer. (source: Brief S3.23)
- Onboarding lets the user set personalization that shapes replies. (source: Brief S3.24)
- New users get an introduction to their first conversation that leads into a first chat. (source: Brief S3.35)
- The use-case answer picks starter prompts only and is deliberately not kept on the account. (source: apps/web/features/onboarding/lib/onboarding-preferences.ts:20-30)
- Language and time zone setup is not applicable. (source: Brief S3.22)
- A resumable checklist saves progress (only VS Code has one). (source: Brief S3.36)

**Acceptance criteria**

1. Completing the wizard stores preferredName, workDescription and onboardingCompletedAt; reloading /welcome redirects to /chat.
2. 'Skip for now' stores only onboardingCompletedAt.
3. Choosing a use case and a starter prompt opens /chat with that prompt in the composer, not sent, and no use-case value exists on the account.
4. A reply in a new chat uses the saved name sparingly and never opens with it.
5. A save failure shows the error and lets the person try again without losing typed answers.
6. On mobile, name and work typed in setup appear in personalization settings.
7. In VS Code the walkthrough shows completed steps after reload.
8. CLI first run ends with a marker so the next start skips setup.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop gets this wizard through the hosted web app [inferred from doc: AGENTS.md section 5].
- Name must be stored without the use case so later readers cannot act on a label the person never chose [inferred from the code comment].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the automatic redirect for new accounts to /welcome, or document where it happens.
- [proposed] Add an optional name step to the CLI first run, or change the brief to not-applicable.
- [proposed] Add starter prompts to the mobile intro so the first chat is guided.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Welcome page | `apps/web/app/welcome/page.tsx` | Gate and mount point for the wizard. |
| component | OnboardingWizard | `apps/web/features/onboarding/components/OnboardingWizard.tsx` | Two-step wizard UI and save. |
| component | StarterPrompts | `apps/web/features/onboarding/components/StarterPrompts.tsx` | Prompt buttons for the chosen use case. |
| config | ONBOARDING_USE_CASES | `apps/web/features/onboarding/lib/use-cases.ts` | Use-case labels, descriptions and starter prompts. |
| config | WORK_DESCRIPTIONS | `apps/web/features/settings/constants/work-descriptions.ts` | Options for the work select. |
| service | onboarding-preferences | `apps/web/features/onboarding/lib/onboarding-preferences.ts` | Load seed, save, skip, drop old use-case. |
| service | user-identity | `apps/web/lib/server/user-identity.ts` | Reads identity, onboarding status; builds the personalization block. |
| service | request-processor (chat gateway) | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Adds the personalization preamble to model calls (line 3997). |
| component | WebChatPage starter hand-off | `apps/web/features/chat/pages/WebChatPage.tsx` | Fills the composer from ?starterPrompt (lines 1317-1327). |
| test | onboarding e2e | `apps/web/e2e/onboarding-first-run.spec.ts` | Browser walk-through of the wizard. |
| screen | Mobile onboarding | `apps/mobile/app/(public)/onboarding.tsx` | Hero, disclosure, About you, device tier, download. |
| store | Local and cloud settings stores | `apps/mobile/app/(public)/onboarding.tsx` | setPersonalization nickname and occupation (lines 312-320). |
| store | MMKV onboarding-done | `apps/mobile/app/(public)/onboarding.tsx` | Marks first run complete. |
| command | CLI run_onboarding | `apps/cli/src/onboarding.rs` | First-run steps and setup marker. |
| config | VS Code walkthrough | `apps/extension-vscode/package.json` | contributes.walkthroughs 'Get started with AGI Code', six steps. |
| screen | Chrome welcome page | `apps/extension/src/features/onboarding/welcome-page.ts` | Welcome tab builder. |
| service | Chrome side-panel onboarding | `apps/extension/src/features/side-panel/onboarding.ts` | Prompt kind, pin prompt, tour completion markers. |
| component | Chrome onboarding prompt | `apps/extension/src/features/side-panel/onboardingPrompt.ts` | Composer notice that opens the welcome page. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Page loads the saved name and work (or the sign-in first name) as defaults. | device and our servers | OnboardingWizard.tsx:62-76; onboarding-preferences.ts:48-56 |
| On finish the page reads the 'general' namespace, drops any old use case, merges name, work and completion time, saves it, refreshes profile consumers. | device and our servers | onboarding-preferences.ts:36-71 |
| Browser navigates to /chat with the chosen prompt in the query; chat page fills the composer and removes the query. | device | OnboardingWizard.tsx:85-87; WebChatPage.tsx:1317-1327 |
| On a later model call the server reads the saved name and work and adds them as a short preference block to the instructions. | our servers | user-identity.ts:250-285; request-processor.ts:3997 |
| Mobile stores name and work in on-device settings, and also in the cloud settings store. | device | onboarding.tsx:312-320 |
| CLI writes model, permission mode and bell choices to its config files and a setup marker. | device | onboarding.rs:905-1010 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| preferredName, workDescription, onboardingCompletedAt | Account preference namespace 'general' (read through apps/web/app/settings/_lib/preferences-client) | Yes, on the account across web, desktop and mobile where each reads it | Edited or cleared in Settings; removal on account deletion (F085-01) [inferred]. |
| Use-case answer | Page memory only | No | Discarded when the wizard closes. |
| Mobile nickname and occupation | Local settings store on the phone and the cloud settings store | Cloud settings store syncs when signed in (sync path not read, unknown) | Editable in personalization settings. |
| CLI setup marker and config | CLI config folder on the machine (mark_setup_complete) | No | forget_setup removes the marker (onboarding.rs:19). |

**Models and providers.** The saved name and work are added to calls to whichever model answers (Cloud gateway path). Whether the same text reaches own-key or local models on desktop or mobile is not established. Starter prompts are static text; no model chooses them.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web wizard needs a signed-in account; mobile and CLI setup work without an account. |
| Permissions | Self-service; no role needed. |
| Subscription | none found in the code. Setup is free on every plan. |
| Limits and metering | Name up to 60 characters, work description up to 120 on the server (user-identity.ts:115-116). No metering. |
| Feature flags | Mobile FEATURES.auth is true (lib/v1FeatureFlags.ts); no flag found for the web wizard. |
| Model compatibility | Works with any model that receives system instructions; not model-specific. |
| Provider restrictions | None found. |
| Local mode | Mobile and CLI setup run fully on the device with no account; the web wizard needs an account. Local inference is not charged. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading seed | Name field focus waits until the saved values load. | OnboardingWizard.tsx:78-80 |
| Empty name | Continue disabled; Skip for now still allowed. | OnboardingWizard.tsx:176-190 |
| Double submit | completionAdmitted ref blocks a second finish. | OnboardingWizard.tsx:83-95 |
| Save error | Alert text shown; button re-enabled for retry. | OnboardingWizard.tsx:99-108 |
| Already completed | /welcome redirects to /chat. | welcome/page.tsx:29-31 |
| Not signed in | Redirect to /login?redirectTo=/welcome. | welcome/page.tsx:14-16 |
| Mobile model download fails | Message 'Download failed. You can try again or continue without the model.' | onboarding.tsx:79 |
| CLI interrupted | 'Setup interrupted. Run again to continue.' and no marker written. | onboarding.rs:802-808,826-831 |
| Offline | not handled in the code for the web wizard beyond the save error. | searched OnboardingWizard.tsx |
| Accessibility | Radio group with a screen-reader legend; status messages use role alert. | OnboardingWizard.tsx:104,219-225 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/onboarding/components/OnboardingWizard.test.tsx`: Wizard UI.
- `apps/web/features/onboarding/components/StarterPrompts.test.tsx`: Starter prompts.
- `apps/web/features/onboarding/__tests__/onboarding-preferences.test.ts`: Saving, skipping, dropping the use case.
- `apps/web/features/onboarding/__tests__/onboarding-resumability.test.ts`: Resuming the wizard state.
- `apps/web/e2e/onboarding-first-run.spec.ts`: Two-step walk, composer prefill, completed redirect, artifact notice.
- `apps/mobile/__tests__/Onboarding.test.tsx`: Mobile onboarding.
- `apps/mobile/__tests__/OnboardingPrivacyNotice.test.tsx`: Mobile first-run notice.
- `apps/mobile/__tests__/OnboardingBackgroundDownload.test.tsx`: Model download during setup.
- `apps/mobile/__tests__/OnboardingTier2.test.tsx`: Device tier step.

**Test scenarios**

- **Wizard happy path**
  1. Sign in as a new account and open /welcome.
  2. Enter a name, pick a work option, Continue.
  3. Pick a use case and a starter prompt.
  - Expected: /chat opens with the prompt in the composer; the account has name, work, completion time and no use case.
- **Skip**
  1. Open /welcome, press Skip for now.
  - Expected: /chat opens; only the completion time is saved; /welcome now redirects.
- **Name reaches replies**
  1. Save name 'Sam'.
  2. Send a first message in a new chat.
  - Expected: Server request carries the preferred-name line; replies do not open with the name.
- **Mobile setup**
  1. Fresh install, answer age, accept the first-run notice.
  2. Enter a name and work, finish model setup.
  - Expected: Name appears in personalization settings; chat starts.
- **CLI first run**
  1. Run agi in a trusted folder with no marker.
  2. Choose Local model, pick a model, pick permission mode, answer bell, press Enter.
  - Expected: Config updated and setup marker created; second run skips setup.
- **VS Code resume**
  1. Open the walkthrough, complete two steps, reload the window.
  - Expected: Completed steps remain marked.

**Where to look when it fails**

- Alert texts 'Failed to save your preferences', 'Failed to skip setup'.
- Preference namespace 'general' keys preferredName, workDescription, onboardingCompletedAt.
- CLI warnings 'Failed to save model selection' and 'could not write setup marker'.
- Mobile MMKV key onboarding-done.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/web/003-authentication-and-onboarding-screens.md)
- Desktop: [70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md)
- Mobile: [70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md)
- CLI: [70-qa/test-plans/cli/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/cli/003-authentication-and-onboarding-screens.md)
- VS Code: [70-qa/test-plans/vscode/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/vscode/003-authentication-and-onboarding-screens.md)
- Chrome: [70-qa/test-plans/chrome/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/chrome/003-authentication-and-onboarding-screens.md)

## 10. Gaps and dependencies

- **No automatic route from sign-up to /welcome was found.** Affects: Web and desktop new users.. Evidence: grep for '/welcome' in app, features, lib found only the page, route list and tests.. Work needed: Find or add the redirect and cover it with a test.
- **Brief says CLI profile and role are done; onboarding.rs has neither.** Affects: CLI.. Evidence: apps/cli/src/onboarding.rs:795-1040 (no name or work step).. Work needed: Add the steps or mark not applicable.
- **Brief says mobile asks the same questions; mobile has no use case or starter prompts.** Affects: Mobile.. Evidence: apps/mobile/app/(public)/onboarding.tsx:593-660.. Work needed: Decide whether starters belong on mobile.
- **No resumable checklist except VS Code.** Affects: Web, desktop, mobile, CLI, Chrome.. Evidence: Brief S3.36; no checklist code found.. Work needed: Design a shared checklist if wanted.
- **It is not shown that mobile name and work reach replies for local models.** Affects: Mobile Local mode.. Evidence: Only the Cloud gateway path was traced.. Work needed: Trace the on-device prompt builder.

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
- SYS-memory-projects-and-context
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design
- F003-08
- F085-02
- F003-10

## Unknown

- What sends new web accounts to /welcome.
- Whether mobile cloud settings sync carries nickname and occupation to the account and whether local models see them.
- Which first-chat introduction text the retained Tauri desktop build shows (not read).
- Whether Chrome onboarding has any first-chat introduction beyond the welcome tab and tour.
