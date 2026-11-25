---
id: "F009-06"
type: "feature"
title: "Schedule recurrence, step indicator and setup wizard"
aliases: ["Recurrence editor", "Frequency", "Schedule form", "Stepper", "Step X of N", "Setup wizard", "Welcome wizard", "Onboarding", "Companion demo walkthrough", "Creation wizard (gallery)", "S9.12", "S9.22", "S9.23"]
area: "9 Compound interface components"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "missing", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S9.12", "S9.22", "S9.23"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-memory-projects-and-context", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "mode:cloud", "mode:local", "api:POST /api/schedules", "api:PUT /api/settings/preferences", "table:user_settings"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F009-06 Schedule recurrence, step indicator and setup wizard

Sets how a scheduled task repeats, shows 'Step X of N' in guided flows, and runs first-time setup. Web offers eight frequencies; Mobile and Chrome offer once, daily, weekly and monthly; the CLI takes a cron text. The Web welcome wizard has two steps and saves a name and work description.

Area: [9. Compound interface components](README.md). Requirement items: [S9.12](../../10-requirements/capabilities/009-compound-interface-components.md#s912), [S9.22](../../10-requirements/capabilities/009-compound-interface-components.md#s922), [S9.23](../../10-requirements/capabilities/009-compound-interface-components.md#s923).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Recurrence editor: a Frequency control with matching fields (time, weekdays, day of month, interval, cron, recurrence rule) that creates a schedule the cloud runs. Stepper: shows the step number out of the total. Setup wizard: ordered first-run steps that save the person's answers.

**Why it exists.** People need to say 'every weekday at nine' without writing cron; first-time users need a short guided start (brief S9.12, S9.22, S9.23; doc: docs/product/experience-contract.md:774, :790).

**Who uses it.** Users of scheduled tasks on Web, Desktop, Mobile, CLI and Chrome; every new user at first sign-in.

**Problems it solves**

- Writing cron by hand.
- Wrong time zone or daylight-saving errors.
- New users not knowing where to start.

**Use cases**

- Create a weekly schedule on Monday and Friday at 08:00.
- Create a one-time schedule for a future date on Mobile.
- First visit to Web: enter a preferred name and work, continue, pick a starter prompt.
- CLI first run: trust the folder, sign in, choose a model, choose a permission mode.

## 2. User experience

**Where to find it**

- Web/Desktop: Schedules page, create or edit form, field 'Frequency' (apps/web/features/schedules/components/ScheduleForm.tsx:306-313).
- Mobile: Schedules, create screen (apps/mobile/app/(app)/schedules/create.tsx; form in apps/mobile/src/features/schedules/components/ScheduleForm.tsx).
- Chrome: schedule form in the side panel with a repeat select (apps/extension/src/features/side-panel/schedulesSection.ts:489-491).
- CLI: 'agi schedules create --schedule "<cron>"' (apps/cli/src/lib.rs:1516-1523).
- Welcome wizard: /welcome on Web and Desktop (apps/web/app/welcome/page.tsx:28-33).
- Mobile onboarding screens: hero, about you, device tier, download (apps/mobile/app/(public)/onboarding.tsx:135).
- CLI first-run setup (apps/cli/src/onboarding.rs:796-1010).
- Companion demo walkthrough on Mobile shows 'Step N of M' (apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx:232).

**Before you start**

- Schedules run in the cloud, so a signed-in account and a plan that allows schedules; Mobile needs access (apps/mobile/__tests__/ScheduleAccess.test.tsx exists).
- Welcome wizard: signed in, terms accepted, adult eligibility confirmed, onboarding not yet completed (apps/web/app/welcome/page.tsx:13-31).

**Screens and controls**

- Web Frequency options: 'One Time', 'Daily', 'Weekly', 'Monthly', 'Interval', 'Custom Cron', 'Recurrence Rule', 'When An Event Happens' (ScheduleForm.tsx:306-313).
- Fields by choice: 'Run At' (one time), 'Repeat Every' and 'Interval Unit' (interval), 'Local Time' (daily, weekly, monthly), 'Days of Week', 'Day of Month', 'Cron Expression', 'Recurrence Rule' (ScheduleForm.tsx:320-480).
- Mobile: choose Once, Daily, Weekly or Monthly; weekly needs a day and once needs a future date (apps/mobile/src/features/schedules/components/ScheduleForm.tsx:117-155).
- Web wizard: 'Step 1 of 2' with 'What should we call you?', 'Preferred name', 'What best describes your work?'; step 2 'What do you want to do first?' with starter prompts; 'Continue', 'Back', 'Skip for now' (OnboardingWizard.tsx:90-98, :118-160, :219-232).

**Journey**

1. Schedule: open the form, choose Frequency, fill only the shown fields, save. The server validates, builds the cron or rule and computes the first run.
2. Wizard: land on /welcome, step 1 fill name and work, Continue, step 2 choose a starter prompt or skip, finish: preferences are saved and chat opens, with the starter prompt in the address if one was chosen.
3. CLI: welcome banner, trust folder, sign in or key, model, effort, permission mode, press Enter; a marker file records completion.

**What the person sees and gets**

- Field-level errors tied to inputs with aria-invalid and aria-describedby (ScheduleForm.tsx:300-305).
- Mobile message 'Choose Once, Daily, Weekly, or Monthly' (apps/mobile/src/features/schedules/components/ScheduleForm.tsx:120).
- Schedules checked every 15 minutes, so a run can start later in that window (apps/mobile/src/features/schedules/policy.ts:19-39).
- Wizard saves and redirects; 'Skip for now' also marks completion.

**Settings**

- Time zone per schedule; model, retries, missed run policy, credit cap and expiry exist on the server definition (apps/web/lib/services/schedule-service.ts:746-770, :1039).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web form with eight frequencies and per-frequency fields and errors (apps/web/features/schedules/components/ScheduleForm.tsx:290-480).
- Server maps recurrence: event, rrule, once, interval, and daily, weekly, monthly, custom to a cron rule built by buildCronExpression (apps/web/lib/services/schedule-service.ts:776-815).
- Mobile form for once, daily, weekly, monthly with policy file naming the supported set (apps/mobile/src/features/schedules/policy.ts:3-9).
- Chrome form for once, daily, weekly, monthly (apps/extension/src/features/side-panel/schedulesSection.ts:367, :489-491, :730-772).
- CLI schedule create accepts a 5-field cron and optional time zone (apps/cli/src/lib.rs:1516-1531).
- Web welcome wizard with two steps and 'Step N of 2' (apps/web/features/onboarding/components/OnboardingWizard.tsx:36, :125).
- Wizard persistence writes preferredName, workDescription and onboardingCompletedAt to the 'general' preference namespace (apps/web/features/onboarding/lib/onboarding-preferences.ts:58-75).
- Mobile onboarding with name, device tier and optional model download (apps/mobile/app/(public)/onboarding.tsx:129-400).
- CLI first-run setup with trust, auth, model, effort, permission mode, marker file (apps/cli/src/onboarding.rs:796-1010).

**Incomplete**

- The CLI schedule command only creates cron schedules, not the eight frequencies (apps/cli/src/lib.rs:1515).
- The Web wizard collects name and work only; it does not collect a model or a sign-in (sign-in is a precondition, model not asked) (OnboardingWizard.tsx:118-146; apps/web/app/welcome/page.tsx:15-18).
- Stepper: the Web 'Step 1 of 2' text and Mobile demo walkthrough exist; the CLI has no step indicator beyond comments in code (apps/cli/src/onboarding.rs:796-1006 numbers steps only in comments).

**Present but disconnected or switched off**

- The step-2 use-case answer is dropped on purpose and removed from stored data (apps/web/features/onboarding/lib/onboarding-preferences.ts:21-35).

**Not available**

- Recurrence editor in VS Code: only presentation code was found (apps/extension-vscode/src/features/schedules/schedulePresentation.ts); no editor found.
- Interval, Custom Cron, Recurrence Rule and Event frequencies on Mobile and Chrome (Mobile rejects them: policy.ts:3-9).

## 4. Required behaviour

**Established requirements**

- When creating a scheduled task, the user sets how it repeats (once, daily, weekly, monthly or a custom rule) and the schedule runs on that cadence. (source: brief S9.12)
- A multi-step flow shows which step the user is on out of how many and advances or goes back with it. (source: brief S9.22)
- A guided setup runs as ordered steps that collect the user's choices (name, model, sign-in) and saves them when it finishes. (source: brief S9.23)
- Schedules use the displayed time zone and canonical recurrence policy; test daylight-saving transitions; one occurrence creates at most one run. (source: doc: docs/product/experience-contract.md:790)
- Onboarding complete and skip persist across reload; a failed save exposes a recoverable state without claiming completion. (source: doc: docs/product/experience-contract.md:774)
- The wizard throws away the step-2 use-case answer on purpose. (source: apps/web/features/onboarding/lib/onboarding-preferences.ts:21-35)

**Acceptance criteria**

1. Choosing 'Weekly' shows 'Days of Week' and 'Local Time' and hides cron and interval fields.
2. Saving Daily at 09:00 yields a stored cron expression for that time in the chosen time zone.
3. A one-time schedule at a skipped DST time is rejected with a clear error.
4. Interval or cron finer than the deployed sweep is refused.
5. On Mobile a past one-time date shows 'Choose a date and time in the future'.
6. Web wizard shows 'Step 1 of 2' then 'Step 2 of 2' and saves name, work and a completed time; reload goes straight to chat.
7. Skip for now marks onboarding complete without name or work.
8. After the wizard no primaryUseCase value remains stored.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A wizard save failure must not redirect as if complete [inferred from doc W01 and the finish handler at OnboardingWizard.tsx:89-108].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the recurrence frequencies Interval and Recurrence Rule to Mobile only if the Cloud sweep supports them; otherwise keep them hidden and state why.
- [proposed] Add a model step to the Web wizard if the product wants it (brief S9.23) or change the brief.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ScheduleForm (Web) | `apps/web/features/schedules/components/ScheduleForm.tsx` | Frequency select and per-frequency fields. |
| service | schedule-form | `apps/web/features/schedules/lib/schedule-form.ts` | Builds the payload and field errors, DST checks. |
| component | SchedulesPage | `apps/web/features/schedules/components/SchedulesPage.tsx` | Hosts the form and list. |
| service | schedule-service | `apps/web/lib/services/schedule-service.ts` | Validates recurrence and builds cron, rrule, once, interval, event. |
| endpoint | /api/schedules | `apps/web/app/api/schedules/route.ts` | Create and list schedules. |
| component | ScheduleForm (Mobile) | `apps/mobile/src/features/schedules/components/ScheduleForm.tsx` | Mobile form and validation. |
| config | MOBILE_SUPPORTED_SCHEDULE_RECURRENCES | `apps/mobile/src/features/schedules/policy.ts` | Lists the four supported frequencies and the 15 minute sweep note. |
| service | Mobile schedule service | `apps/mobile/src/features/schedules/service.ts` | Maps server schedule tasks to the app model. |
| screen | Mobile create screen | `apps/mobile/app/(app)/schedules/create.tsx` | Hosts the form. |
| component | schedulesSection (Chrome) | `apps/extension/src/features/side-panel/schedulesSection.ts` | Chrome schedule form with once, daily, weekly, monthly. |
| command | agi schedules create | `apps/cli/src/lib.rs` | CLI create with --schedule cron. |
| component | OnboardingWizard | `apps/web/features/onboarding/components/OnboardingWizard.tsx` | Two-step welcome wizard and step text. |
| service | onboarding-preferences | `apps/web/features/onboarding/lib/onboarding-preferences.ts` | Reads seed, saves name and work with completion time, drops use case. |
| screen | Welcome page | `apps/web/app/welcome/page.tsx` | Server gate: sign-in, terms, adult check, redirect if done. |
| service | getOnboardingStatus | `apps/web/lib/server/user-identity.ts` | Reads onboardingCompletedAt from user settings. |
| table | user_settings | `apps/web/lib/server/user-identity.ts` | Holds the settings JSON with the general namespace. |
| endpoint | /api/settings/preferences | `packages/contracts/cloud-contracts/src/managed-cloud-settings-client.ts` | Path used to read and save preference namespaces. |
| screen | Mobile onboarding | `apps/mobile/app/(public)/onboarding.tsx` | Hero, about you, device tier, download screens. |
| component | CompanionDemoWalkthrough | `apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx` | Step N of M walkthrough. |
| component | CLI onboarding | `apps/cli/src/onboarding.rs` | First-run setup and marker file. |
| component | Gallery CreationWizard | `apps/web/app/gallery/GalleryClient.tsx` | Three-step creation wizard with step dots. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person fills the schedule form; the browser builds the payload and checks fields and time zone. | device | apps/web/features/schedules/lib/schedule-form.ts; ScheduleForm.tsx:290-480 |
| The server validates the recurrence, builds cron, once, interval, rrule or event timing and computes the first run. | our servers | apps/web/lib/services/schedule-service.ts:776-826 |
| A periodic sweep runs due schedules in the cloud; a run uses managed models and may spend credits. | our servers | apps/mobile/src/features/schedules/policy.ts:17-39; schedule-service.ts:60-82 (credit cap) |
| Welcome page checks identity, terms and onboarding status on the server. | our servers | apps/web/app/welcome/page.tsx:13-31 |
| Finishing the wizard reads the stored namespace, removes the use-case field, merges name, work and completed time, and saves it. | device and our servers | apps/web/features/onboarding/lib/onboarding-preferences.ts:50-75 |
| CLI writes a local marker file when setup ends. | device | apps/cli/src/onboarding.rs:27-39 |
| Mobile onboarding stores the 'onboarding-done' flag on the device; the optional on-device model download in the same flow fetches from the model's download URL (an outside host, not traced further). | device | apps/mobile/app/(public)/onboarding.tsx:253-258, :369-382 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Scheduled task | Server database (table not opened; managed_usage_requests links runs via scheduled_task_id) | Yes to all apps | unknown |
| preferredName, workDescription, onboardingCompletedAt | table:user_settings, 'general' namespace | Yes through settings preferences | Kept; the use-case field is removed on every save (onboarding-preferences.ts:30-35) |
| Mobile onboarding flag | Device storage key onboarding-done (MMKV) | no | Stays until app data is cleared |
| CLI setup marker | File .setup_complete in the config folder | no | Removed by forget_setup (logout --all) |

**Models and providers.** Schedules run a prompt on a model chosen by the form or 'auto'; the server checks that the model exists in the catalogue and is eligible for the plan (apps/web/lib/services/schedule-service.ts:536-551). Wizard does not choose a model on Web; Mobile onboarding recommends an on-device model by device tier (apps/mobile/app/(public)/onboarding.tsx:120-130); CLI asks for a model and effort (apps/cli/src/onboarding.rs:896-905).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Schedules and the Web wizard need a signed-in account. Mobile onboarding and CLI setup can finish without an account (Mobile 'Skip for now'; CLI offers local models, apps/cli/src/onboarding.rs:896). |
| Permissions | Welcome page requires current terms acceptance and adult eligibility (apps/web/app/welcome/page.tsx:15-20). |
| Subscription | Schedule model must be eligible for the plan; otherwise 'Model is not available for Managed Cloud schedules on the current plan' (schedule-service.ts:547-549). Whether schedules themselves require a paid plan was not established. |
| Limits and metering | Retry limit 5 attempts, backoff 60 s to 86,400 s; credit cap per routine; cadence finer than the sweep is refused (schedule-service.ts:86-89, :60-82; schedule-form.test.ts:269). Runs charge managed usage. |
| Feature flags | none found in the code for the form; sweep period is a constant on Mobile (policy.ts:17). |
| Model compatibility | Server refuses a model not in the catalogue (schedule-service.ts:547). |
| Provider restrictions | none found in the code. |
| Local mode | Schedules are cloud only; Mobile shows the cloud sync blocked banner outside Cloud mode on the workspace screen, and a similar notice for schedules was not traced. Onboarding works in Local mode without payment (Mobile download of the on-device model needs no plan). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Validation error | Errors attach to fields with aria-describedby. | ScheduleForm.tsx:300-305 |
| DST skip or ambiguity | Rejected with an error. | apps/web/features/schedules/lib/schedule-form.test.ts:183-193 |
| Past one-time date | Mobile error 'Choose a date and time in the future'. | apps/mobile/src/features/schedules/components/ScheduleForm.tsx:134-136 |
| Cap reached | Message names the cap and asks to raise it. | apps/web/lib/services/schedule-service.ts:80-82 |
| Wizard already done | Redirect to /chat. | apps/web/app/welcome/page.tsx:28-30 |
| Wizard skip | Marks completed without answers. | onboarding-preferences.ts:78-80 |
| Wizard save failure | not established in the files read (handler at OnboardingWizard.tsx:89-108 not fully read). | not handled in the code, unverified |
| Mobile download failure | Error text 'This model cannot be downloaded yet. Pick a different model to continue.' | apps/mobile/app/(public)/onboarding.tsx:394 |
| Accessibility | Wizard focuses the name input; weekday toggles have long labels; Mobile buttons have accessibility labels. | OnboardingWizard.tsx:79; ScheduleForm.tsx:405-418 (aria-label of days); onboarding.tsx:637 |
| Offline | not handled in the code beyond error states. | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/schedules/components/ScheduleForm.test.tsx`: Web schedule form (not itemised).
- `apps/web/features/schedules/lib/schedule-form.test.ts`: Payload for recurring schedules, spend cap, run windows, time zone conversion, DST skip and ambiguity, field errors, interval bounds, legacy interval, cadence limit.
- `apps/web/lib/services/schedule-service.test.ts`: Server schedule service.
- `apps/web/lib/services/schedule-service.policies.test.ts`: Schedule policies.
- `apps/mobile/__tests__/ScheduleForm.test.tsx`: Mobile form (not itemised).
- `apps/mobile/__tests__/schedule-policy.test.ts`: Mobile supported recurrences and sweep text.
- `apps/web/features/onboarding/components/OnboardingWizard.test.tsx`: Web wizard (not itemised).
- `apps/mobile/__tests__/Onboarding.test.tsx`: Mobile onboarding (not itemised).

**Test scenarios**

- **Weekly schedule**
  1. Choose Weekly, tick Monday and Friday, set 08:00, save.
  - Expected: Schedule lists next run on the next matching day in the chosen time zone.
- **Hidden fields**
  1. Switch Frequency from Weekly to One Time.
  - Expected: Day and cron fields hide; 'Run At' shows.
- **Mobile unsupported**
  1. Open a schedule created on Web with Interval, on Mobile; try to turn it on.
  - Expected: Mobile refuses (store.ts:345 checks the supported set).
- **Wizard happy path**
  1. Sign in as a new user.
  2. Fill name and work, Continue, pick a starter prompt.
  - Expected: Chat opens; settings hold the name and a completed time; reload skips /welcome.
- **Wizard skip**
  1. Click 'Skip for now' on step 1.
  - Expected: Redirect to chat and no repeat of the wizard.
- **CLI first run**
  1. Delete the marker with logout --all.
  2. Start agi.
  - Expected: Setup runs steps and rewrites .setup_complete.

**Where to look when it fails**

- Server ScheduleValidationError messages (schedule-service.ts).
- Network: POST /api/schedules response.
- Network: /api/settings/preferences save for the 'general' namespace.
- CLI marker file .setup_complete in the config folder.
- Mobile storage key onboarding-done.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/009-compound-interface-components.md](../../70-qa/test-plans/web/009-compound-interface-components.md)
- Desktop: [70-qa/test-plans/desktop/009-compound-interface-components.md](../../70-qa/test-plans/desktop/009-compound-interface-components.md)
- Mobile: [70-qa/test-plans/mobile/009-compound-interface-components.md](../../70-qa/test-plans/mobile/009-compound-interface-components.md)
- CLI: [70-qa/test-plans/cli/009-compound-interface-components.md](../../70-qa/test-plans/cli/009-compound-interface-components.md)
- Chrome: [70-qa/test-plans/chrome/009-compound-interface-components.md](../../70-qa/test-plans/chrome/009-compound-interface-components.md)

## 10. Gaps and dependencies

- **Web wizard does not collect a model, and sign-in is checked before it starts rather than inside it.** Affects: Web and Desktop new users. Evidence: apps/web/features/onboarding/components/OnboardingWizard.tsx:118-146; apps/web/app/welcome/page.tsx:15-18; brief S9.23. Work needed: Decide if the brief or the wizard should change.
- **CLI schedule creation takes only cron.** Affects: CLI users. Evidence: apps/cli/src/lib.rs:1515-1523. Work needed: Add the same frequencies or document cron only.
- **Mobile and Chrome cannot create interval, cron, rule or event schedules and Mobile will not turn on a schedule of those kinds.** Affects: Mobile, Chrome. Evidence: apps/mobile/src/features/schedules/policy.ts:3-9; apps/mobile/src/features/schedules/store.ts:345. Work needed: State this in the form or add support.
- **CLI has no step indicator; VS Code has no editor found for recurrence; brief lists stepper 'done' for VS Code with no code.** Affects: CLI, VS Code. Evidence: brief S9.22; apps/cli/src/onboarding.rs:796-1006. Work needed: Verify or add a 'Step X of N' line.
- **The brief's stepper code points to the Web gallery wizard and the mobile demo, not to the Web welcome wizard that also shows steps.** Affects: Audit accuracy. Evidence: apps/web/app/gallery/GalleryClient.tsx:608-640; apps/web/features/onboarding/components/OnboardingWizard.tsx:125. Work needed: Name one shared stepper or record separate implementations.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- SYS-agents-tools-and-automation
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-memory-projects-and-context
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- mode:cloud
- mode:local
- api:POST /api/schedules
- api:PUT /api/settings/preferences
- table:user_settings

## Unknown

- Whether schedules require a paid plan on each app (only model eligibility was read).
- The table that stores scheduled tasks.
- How the Web wizard reacts when the save fails (OnboardingWizard.tsx:80-110 not fully read).
- Whether the HTTP method for saving preferences is PUT or POST.
- Which VS Code UI creates schedules, if any.
- Whether Desktop (Tauri retained build) has a separate setup wizard; the public Desktop shows the web app (doc: AGENTS.md section 5).
- Chrome welcome page contents (apps/extension/src/features/onboarding/welcome-page.ts) were not opened.
