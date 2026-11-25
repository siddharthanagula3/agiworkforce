---
id: "F063-01"
type: "feature"
title: "Routine gallery (templates)"
aliases: ["Routine gallery", "Schedule templates", "Start from a template", "Or start from one of these", "Templates (desktop button)", "MANAGED_CLOUD_SCHEDULE_TEMPLATES", "S63.01"]
area: "63 Routines, schedules, and triggers"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "n/a", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S63.01"]
depends_on: ["F063-02", "F063-03", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design", "SYS-api-and-contracts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F063-01 Routine gallery (templates)

A fixed list of six ready-made scheduled tasks (weekly review, meeting prep, inbox triage, content ideas, daily briefing, monitor a topic). Picking one only fills the create form. Nothing exists until the person saves. Web, the Tauri desktop panel, mobile and the Chrome extension show it. The CLI and VS Code do not.

Area: [63. Routines, schedules, and triggers](README.md). Requirement items: [S63.01](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6301).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Offers six starter prompts with a cadence so a person does not start from a blank form. The same list is read by every app that shows a gallery (packages/contracts/cloud-contracts/src/schedules.ts:785-870).

**Why it exists.** The code comment says starting from a blank prompt is the reason most people never make a second schedule (apps/web/features/schedules/components/SchedulesPage.tsx, comment above the template grid in the empty state).

**Who uses it.** A signed-in person on a plan that allows scheduled tasks and who has no idea what to schedule.

**Problems it solves**

- Blank-form paralysis
- Each app inventing its own starter list (one shared list is used: apps/web/features/schedules/lib/schedule-templates.ts:1-19, apps/mobile/src/features/schedules/templates.ts:1-8)
- Mis-tap creating a task by accident, because a template only seeds a draft (SchedulesPage.tsx:443-455)

**Use cases**

- New user opens Scheduled and picks 'Weekly review' to get a Friday 4:00 PM task
- Existing user with routines opens 'Start from a template' to add 'Daily briefing'
- Mobile user taps a template card and lands on a filled create screen
- Chrome user taps a template button in the Schedules section to fill the form

## 2. User experience

**Where to find it**

- Web (also the public Electron Desktop, which shows the hosted web app per AGENTS.md section 5): /chat/schedules, page titled 'Scheduled'. No routines: grid under 'Or start from one of these'. With routines: split button 'New task' then arrow 'More ways to create a task' then 'Start from a template' (SchedulesPage.tsx:1007-1050, 1138-1190).
- Tauri desktop (internal code, Managed mode only): Schedules panel, button 'Templates', section 'Start from a template' (apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:928-1042; apps/desktop/src/features/v3/DesktopShellV3.tsx:813).
- Mobile: Scheduled screen. Empty state and list footer show a TemplateGallery (apps/mobile/app/(app)/schedules/index.tsx:396, 520, 538).
- Chrome extension: Schedules section, template buttons labelled 'Start from a template' (apps/extension/src/features/side-panel/schedulesSection.ts:683-695; label key spSchedulesTemplatesLabel in apps/extension/_locales/en/messages.json).
- CLI: none found. VS Code: none found (commands are show, refresh, open, pause, resume, run now, show runs: apps/extension-vscode/package.json:602-637).

**Before you start**

- Signed in to an AGI account
- A plan with at least one scheduled task (web hides the grid when the plan limit is 0: SchedulesPage.tsx:306, 1007)
- Mobile: Cloud mode on and Cloud unlocked, otherwise a gate screen shows (apps/mobile/app/(app)/schedules/index.tsx:181-189)
- Tauri desktop: Managed (Cloud) mode (apps/desktop/src/features/v3/shellPanels.ts:42)

**Screens and controls**

- Template card: icon, name, one-line description, cadence label such as 'Fridays at 4:00 PM' (SchedulesPage.tsx:210-245)
- 'Close templates' button on the web gallery panel (SchedulesPage.tsx:1172)
- Helper line 'Opens a filled-in form to review before saving.' (web) and 'Each template opens the create form filled in, for you to review before saving.' (Tauri, DesktopCloudSchedules.tsx:1039)

**Journey**

1. Open Scheduled
2. If there are no routines, read the grid on the empty page; otherwise open 'Start from a template'
3. Tap one template card
4. The create form opens already filled (name, prompt, repeat, days, time; daily briefing also turns on recent chats)
5. Edit anything, then save
6. The routine now exists and appears in the list

**What the person sees and gets**

- A filled create dialog (web/Tauri), create screen (mobile) or form (Chrome)
- No toast or list change until Save
- Template button disabled on Tauri when the plan cannot create (DesktopCloudSchedules.tsx:1042)

**Settings**

- Plan limit on scheduled tasks (billing-catalog.ts:572-723)
- Settings switch 'Search past chats' decides whether the daily briefing's recent-chats source is really read (ScheduleAccessFields.tsx:45-47)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Six templates defined once with id, name, cadence label, description and draft (packages/contracts/cloud-contracts/src/schedules.ts:785-870).
- Web grid and empty-state grid open the SAME create dialog filled from the template; project id is kept from scope (SchedulesPage.tsx:443-455).
- Mobile maps the shared list to its own cards with an emoji per id and the default auto model (apps/mobile/src/features/schedules/templates.ts:11-46).
- Tauri desktop renders the same list and fills the draft (DesktopCloudSchedules.tsx:116-140, 614-620).
- Chrome renders a button per template and fills name, prompt, repeat, days, time, and keeps the template's sources (schedulesSection.ts:671-695, 727-775).

**Incomplete**

- Mobile template cards drop the template's sources, so the mobile daily briefing does not turn on recent chats (apps/mobile/src/features/schedules/templates.ts:24-46 builds initialData without sources; web and Chrome keep them).
- The 'Monitor a topic' prompt contains a bracketed placeholder the person must replace; nothing blocks saving it unchanged (schedules.ts:865; apps/web/features/schedules/lib/__tests__/schedule-templates.test.ts marks it as the one template needing input).
- The daily briefing and meeting prep prompts mention a connected calendar or email, but connectors are 'coming soon' (schedules.ts:850; packages/contracts/types/src/connector-release.ts:14).

**Present but disconnected or switched off**

- On plans with 0 scheduled tasks the gallery is hidden on web and mobile, and disabled on Tauri (SchedulesPage.tsx:1007, 1131-1152; index.tsx:396; DesktopCloudSchedules.tsx:1042).

**Not available**

- CLI: no gallery (the CLI creates cron routines only: apps/cli/src/lib.rs:1514-1545).
- VS Code: no gallery and no create form (apps/extension-vscode/package.json:602-637).
- Template list per language or per workspace: not found.

## 4. Required behaviour

**Established requirements**

- A browsable gallery of ready-made routines the user can start from at any time. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.01)
- Picking a template fills a draft only; no routine exists until the user saves. (source: apps/web/features/schedules/components/SchedulesPage.tsx:443-455 (code comment))
- Schedules and templates are a required surface in the product contract. (source: doc: docs/product/experience-contract.md:237)
- Mobile template cards must stay allowlisted ids and not carry connector-dependent prompts until a connector design exists. (source: doc: audit/registers/ui-gaps.md GAP-028 (mobile scheduled tasks templates))

**Acceptance criteria**

1. Every app that shows a gallery lists exactly the six ids weekly-review, meeting-prep, inbox-triage, content-ideas, daily-briefing, monitor-topic in that order
2. Tapping a template creates nothing on the server (no POST /api/schedules) until Save
3. The opened form carries the template's name, prompt, repeat, days and time
4. On a plan with 0 scheduled tasks no gallery is offered (web, mobile) or it is disabled (Tauri)
5. Closing the form with no save leaves the list unchanged

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The mobile daily briefing should carry recent chats like the web one, since all apps read one list [inferred].
- The CLI and VS Code are not expected to have a gallery because they have no form [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass draft.sources through apps/mobile/src/features/schedules/templates.ts and the mobile create body.
- [proposed] Block save of the monitor-topic prompt while the bracketed placeholder remains.
- [proposed] Update GAP-028 in audit/registers/ui-gaps.md: it names four old templates, the code shows six shared ones.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | MANAGED_CLOUD_SCHEDULE_TEMPLATES | `packages/contracts/cloud-contracts/src/schedules.ts` | The single six-item template list (lines 785-870) |
| config | MANAGED_CLOUD_SCHEDULE_DEFAULT_SOURCES | `packages/contracts/cloud-contracts/src/schedules.ts` | Defaults the templates build on (lines 101-106) |
| service | SCHEDULE_TEMPLATES and scheduleTemplateIcon | `apps/web/features/schedules/lib/schedule-templates.ts` | Web wrapper and icon per id |
| component | ScheduleTemplateGrid | `apps/web/features/schedules/components/SchedulesPage.tsx` | Web grid of template buttons (line 210) |
| component | openCreateFromTemplate | `apps/web/features/schedules/components/SchedulesPage.tsx` | Seeds the draft and opens the dialog (line 443) |
| screen | Template gallery panel and menu item | `apps/web/features/schedules/components/SchedulesPage.tsx` | 'Start from a template' menu and 'Close templates' panel (lines 1031-1050, 1160-1190) |
| component | ScheduleTemplateGrid (Tauri) | `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx` | Tauri grid, 'Templates' button, openCreateFromTemplate (lines 116, 614, 928) |
| service | toScheduleTemplate, SCHEDULE_TEMPLATES, getScheduleTemplate | `apps/mobile/src/features/schedules/templates.ts` | Maps shared list to mobile cards (drops sources) |
| screen | TemplateGallery and EmptyState | `apps/mobile/app/(app)/schedules/index.tsx` | Mobile gallery in empty state and list footer (lines 476, 538) |
| screen | create screen template param | `apps/mobile/app/(app)/schedules/create.tsx` | Reads params.template through getScheduleTemplate (line 65) |
| component | applyTemplate and template buttons | `apps/extension/src/features/side-panel/schedulesSection.ts` | Chrome template buttons and form fill (lines 671-695) |
| test | schedule-templates.test.ts (web) | `apps/web/features/schedules/lib/__tests__/schedule-templates.test.ts` | List shape tests |
| test | schedule-templates.test.ts (mobile) | `apps/mobile/__tests__/schedule-templates.test.ts` | Mobile mapping tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The template list is bundled code; no server call is made to show it. | device | packages/contracts/cloud-contracts/src/schedules.ts:785 |
| Picking a card copies the template draft into the form state with the current project id. | device | apps/web/features/schedules/components/SchedulesPage.tsx:443-455 |
| Saving sends the draft through the normal create call (see F063-02), which runs on our servers. | our servers | apps/web/app/api/schedules/route.ts:96-132 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Template draft (name, prompt, repeat, days, time, optional sources) | Form state in memory only until saved | No, until saved as a scheduled_tasks row | Discarded when the form closes; web asks before discarding a changed draft (SchedulesPage.tsx discardConfirmOpen state) |

**Models and providers.** No model or provider takes part when browsing templates. Mobile cards pre-select the auto model (apps/mobile/src/features/schedules/templates.ts:35).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account. Mobile also needs Cloud unlocked (apps/mobile/app/(app)/schedules/index.tsx:181-189). |
| Permissions | Browsing needs none beyond the page. Saving is gated by the workspace 'schedules' feature policy (apps/web/app/api/schedules/route.ts:114). |
| Subscription | Gallery shown only when the plan allows scheduled tasks: local-only, own-key and Free are 0; Basic 3; Premium 5; Max 15; Ultra 25; Team 10; Team Premium 15; Enterprise unlimited (packages/contracts/types/src/billing-catalog.ts:572-723, 816). |
| Limits and metering | No limit on opening templates. Saving counts against the plan's scheduled task limit (apps/web/lib/services/schedule-service.ts:877). |
| Feature flags | Mobile FEATURES.schedules is true (apps/mobile/lib/v1FeatureFlags.ts:14). |
| Model compatibility | Not applicable until save; save validates the model (F063-03). |
| Provider restrictions | none found in the code for browsing. |
| Local mode | Mobile shows a gate screen 'Schedules run in AGI Cloud' in Local mode (CloudSchedulesGate.tsx:62-70). CLI refuses non-Managed sessions (apps/cli/src/cloud/client.rs:368). Tauri panel opens only in Managed mode (shellPanels.ts:42). Templates are not offered in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Plan allows 0 scheduled tasks | Web shows 'Upgrade plan' and no template grid; mobile hides gallery; Tauri disables cards | SchedulesPage.tsx:1007-1058; index.tsx:396; DesktopCloudSchedules.tsx:1042 |
| Schedules still loading or list failed | Web menu item 'Start from a template' is disabled until the list loads | SchedulesPage.tsx:1042-1046 |
| Empty list | Grid appears inside the empty page | SchedulesPage.tsx:1138-1150 |
| Keyboard use | Focus moves to the first template button after the menu closes | SchedulesPage.tsx:929-935, 1035-1039 |
| Unknown template id on mobile route | getScheduleTemplate returns undefined and the form opens blank | apps/mobile/src/features/schedules/templates.ts:56-60 |
| Offline | Not handled in the code for browsing; the list is local. Saving fails with the normal create error. | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/schedules/lib/__tests__/schedule-templates.test.ts`: Gallery has several entries, unique ids, only real draft keys, recurring templates not left on one-shot, real weekdays, cadence worded not as cron, one template needs user input
- `apps/mobile/__tests__/schedule-templates.test.ts`: Mobile list equals the canonical set in order, maps each draft, only deliverable cadences, emoji and unique ids, only known ids resolve
- `apps/web/features/schedules/components/SchedulesPage.test.tsx`: Page header, Free plan without creation controls, empty state, prefilled create dialog creates nothing yet
- `apps/desktop/src/features/schedules/__tests__/DesktopCloudSchedules.test.tsx`: Tauri schedules panel (title-level only read; exact template cases unknown)

**Test scenarios**

- **Template only seeds a draft**
  1. Sign in on a Basic account with no routines
  2. Open /chat/schedules
  3. Click 'Weekly review'
  4. Watch the network panel
  5. Close the dialog
  - Expected: Dialog shows name 'Weekly review', Friday, 16:00; no POST to /api/schedules; list still empty
- **Gallery hidden on Free**
  1. Sign in on a Free account
  2. Open /chat/schedules
  - Expected: Text says Scheduled tasks are available on Basic and higher plans, button 'Upgrade plan', no template grid
- **Mobile briefing loses recent chats**
  1. On mobile in Cloud mode choose 'Daily briefing'
  2. Save
  3. Open the same routine on web and open 'What Each Run Can Use'
  - Expected: Expected by the shared list: Recent chats ticked. Code suggests it will be unticked (gap)
- **Chrome template fill**
  1. Open the Schedules section
  2. Choose 'New schedule'
  3. Click a template
  - Expected: Name, instructions, repeat, days and time are filled; focus moves to Name

**Where to look when it fails**

- Compare ids in packages/contracts/cloud-contracts/src/schedules.ts with each app's rendered cards
- Network panel: a POST to /api/schedules before Save is a defect

**Hands-on test plans**

- Web: [70-qa/test-plans/web/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/web/063-routines-schedules-and-triggers.md)
- Desktop: [70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md)
- Mobile: [70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md)
- Chrome: [70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md)

## 10. Gaps and dependencies

- **Mobile templates drop the template's sources** Affects: Mobile users picking 'Daily briefing'. Evidence: apps/mobile/src/features/schedules/templates.ts:24-46 versus schedules.ts:854. Work needed: Carry draft.sources into the mobile draft and create request
- **Brief lists Chrome gallery as missing but code has one** Affects: Brief accuracy; Chrome users. Evidence: apps/extension/src/features/side-panel/schedulesSection.ts:683-695. Work needed: Correct brief S63.01 status for Chrome to built
- **ui-gaps GAP-028 names four old mobile templates** Affects: Doc readers. Evidence: audit/registers/ui-gaps.md GAP-028 versus apps/mobile/__tests__/schedule-templates.test.ts. Work needed: Update the audit row to the shared six
- **Template prompts assume connected calendar and email while connectors are coming soon** Affects: Web, mobile, Tauri, Chrome users of meeting prep and daily briefing. Evidence: schedules.ts:850; connector-release.ts:14. Work needed: Product decision on wording until connectors ship
- **No gallery in CLI** Affects: CLI users. Evidence: apps/cli/src/lib.rs:1514-1545. Work needed: Product decision; likely not needed
- Not built on: CLI (from the capability ledger).

**Depends on**

- F063-02
- F063-03
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design
- SYS-api-and-contracts

## Unknown

- Whether the Tauri template grid has tests: DesktopCloudSchedules.test.tsx cases were not read.
- Whether templates are translated: not found in the code read.
- Whether any app tracks template usage: not found.
