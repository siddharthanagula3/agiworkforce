---
id: "F008-07"
type: "feature"
title: "Date, time, zone and colour pickers"
aliases: ["Date picker", "Time picker", "Time zone picker", "Colour picker", "Run At", "Local Time", "End date", "Time Zone", "Accent Color", "Project colour", "S8.25", "S8.26", "S8.27", "S8.28"]
area: "8 Basic interactive elements"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S8.25", "S8.26", "S8.27", "S8.28"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "mode:local", "SYS-shared-ui-and-design", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "file:apps/web/features/schedules/components/ScheduleForm.tsx", "file:apps/mobile/src/features/schedules/components/TimezonePickerField.tsx", "store:cloudSettingsStore"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F008-07 Date, time, zone and colour pickers

Controls for entering a date, a time, a time zone or a colour. Schedule forms on web, desktop, mobile and the Chrome extension use date and time inputs. Web and mobile add a time zone field that starts at the device zone. Web projects and mobile settings offer colour swatches. VS Code has none.

Area: [8. Basic interactive elements](README.md). Requirement items: [S8.25](../../10-requirements/capabilities/008-basic-interactive-elements.md#s825), [S8.26](../../10-requirements/capabilities/008-basic-interactive-elements.md#s826), [S8.27](../../10-requirements/capabilities/008-basic-interactive-elements.md#s827), [S8.28](../../10-requirements/capabilities/008-basic-interactive-elements.md#s828).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person choose a date, a time of day, an IANA time zone (a name such as a city region) or a colour without typing a raw value. The schedule form uses all three of date, time and zone. Colour choice is used for a project accent, the mobile accent colour and desktop theme colours.

**Why it exists.** A schedule that runs at the wrong hour or in the wrong zone is a silent failure, and a free-text date is easy to get wrong. The brief requires pickers wherever a date, time, zone or colour is entered (doc: knowledge-base/data/area-briefs/008-basic-interactive-elements.md, S8.25 to S8.28).

**Who uses it.** Anyone creating or editing a scheduled task or routine, anyone colouring a project, and mobile users changing the accent colour.

**Problems it solves**

- Wrong run time because the person typed a date by hand.
- Runs landing in the wrong zone: the form starts at the device zone and checks the zone name.
- Ambiguous daylight-saving times are rejected with a message instead of running at a surprise hour.
- Colour choice stays on a fixed set of accents so contrast stays safe.

**Use cases**

- Create a one-time schedule on web: set Run At, check Time Zone, save.
- Create a daily schedule on mobile: tap Choose a time, then pick a zone from the searchable Time zone sheet.
- Colour a project on web from the Project colour swatches.
- Change the accent colour on mobile under Accent Color.

## 2. User experience

**Where to find it**

- Web: schedule form (labels Run At, Local Time, Time Zone, End date (optional)) (apps/web/features/schedules/components/ScheduleForm.tsx:320,387,510,537).
- Web: project page, Colour block with listbox 'Project colour' and a 'Custom colour' input (apps/web/app/chat/projects/[id]/page.tsx:837-897).
- Desktop (public Electron window): shows the hosted web app, so the web forms apply (doc: AGENTS.md section 5).
- Desktop (retained Tauri code): schedule inputs in apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:1661,1676,1792 and apps/desktop/src/features/scheduler/TaskScheduleInput.tsx:131,208; colour inputs in apps/desktop/src/features/settings/ThemeEditorDialog.tsx:117.
- Mobile: schedule form with 'Choose a date', 'Choose a time' buttons and a 'Time zone' button (apps/mobile/src/features/schedules/components/ScheduleDateTimeField.tsx:96,115; TimezonePickerField.tsx:57). Settings screen titled 'Accent Color' (apps/mobile/src/features/settings/accent-color/index.tsx:42).
- Chrome extension: schedule form with date-time input, time input and a time zone select (apps/extension/src/features/side-panel/schedulesSection.ts:515-524).
- VS Code: no date, time, zone or colour input found by search (apps/extension-vscode/src). CLI: not applicable.

**Before you start**

- Signed-in access to the schedule feature; the form belongs to Cloud schedules (apps/mobile/src/features/schedules/policy.ts:30 says runs happen in a Cloud window). Exact entitlement check: unknown.
- Mobile date picker needs the native date-time package at runtime (apps/mobile/src/features/schedules/components/ScheduleDateTimeField.tsx:2).

**Screens and controls**

- Web Run At: browser date-time control, shown only when recurrence is One Time (ScheduleForm.tsx:318-335).
- Web Local Time: browser time control for Daily, Weekly, Monthly (ScheduleForm.tsx:385-398).
- Web Time Zone: text input with a browser suggestion list; placeholder 'Search by city or region…' (ScheduleForm.tsx:510-532).
- Web project colour: round swatches (role option) plus a hidden colour input over a gradient swatch (page.tsx:851-897).
- Mobile Time zone: full-height sheet titled 'Time zone' with a close button 'Close time zones' and a filtered list (TimezonePickerField.tsx:80-120).
- Mobile accent: ten rows (Neutral, Blue, Cyan, Green, Lime, Yellow, Orange, Rose, Magenta, Violet), each with a dot and a check on the chosen one (accent-color/index.tsx:13-24,59-95).

**Journey**

1. Open the schedule form (web, mobile, Chrome side panel or retained desktop).
2. Choose how often it repeats.
3. For one-time, set the date and time; for repeating, set the time of day.
4. Check the time zone; it starts at the device zone. Change it by typing a city or region (web) or searching the sheet (mobile).
5. Optionally set an end date.
6. Save. Errors such as 'Enter a valid IANA time zone.' appear under the field.

**What the person sees and gets**

- Mobile shows the chosen date or time in the device locale inside the button (ScheduleDateTimeField.tsx:55-66).
- Mobile zone row shows the zone with a short offset name (TimezonePickerField.tsx:25-34,69-74).
- Web helper text: 'In the time zone below. Ambiguous daylight-saving times are rejected.' (ScheduleForm.tsx:332-334).
- Web helper text under zone: 'Type a city or region. Daylight saving follows the zone you pick.' (ScheduleForm.tsx:528-530).

**Settings**

- Mobile accent colour is stored per mode: Local settings store in Local mode, Cloud settings store in Cloud mode (accent-color/index.tsx:30-37).
- Web project colour is saved on the project record through the project update handler (page.tsx:841-846; exact endpoint: unknown).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web schedule form has date-time, time and time zone fields (ScheduleForm.tsx:325,391,540,510-531).
- Web time zone defaults to the device zone and falls back to UTC (apps/web/features/schedules/lib/schedule-form.ts:75-87) and the list comes from the browser zone list (ScheduleForm.tsx:62-70).
- Web zone is validated and shows 'Enter a valid IANA time zone.' (schedule-form.ts:259-264).
- Mobile date and time buttons use the native picker; iOS toggles an inline picker with an expanded state, Android opens the system dialog (ScheduleDateTimeField.tsx:85-130).
- Mobile date minimum is today in the chosen zone (ScheduleDateTimeField.tsx:84, timing.ts earliestPickerDateInZone, tested in ScheduleDatePickerZone.test.tsx:32-60).
- Mobile zone sheet filters by typed text, puts the device zone first (TimezonePickerField.tsx:18-23,44-47) and the schedule form starts at the device zone (apps/mobile/src/features/schedules/components/ScheduleForm.tsx:57).
- Web project swatches expose option role, selected state and label (page.tsx:849-865).
- Mobile accent screen marks the selected colour with accessibilityState selected (accent-color/index.tsx:67-69).
- Chrome side panel schedule form has a date-time input, a time input and a zone select filled from the browser zone list (schedulesSection.ts:405-417,515-524,661).

**Incomplete**

- Web custom colour is snapped to the nearest preset accent, not stored as the exact value (page.tsx:891-897 calls nearestProjectAccentId, packages/ui/ui/src/sidebar/project-icons.ts:128).
- Web zone field is a text input with a native suggestion list, so search quality depends on the browser (ScheduleForm.tsx:514,523).
- Retained desktop schedule form uses the device zone only: the draft takes resolvedTimezone() and no zone picker was found in DesktopCloudSchedules.tsx (lines 108-111,163). The brief says desktop zone is done; that is not confirmed for this file.
- Brief lists web date picker code in GlobalSearchDialog.tsx and chat/page.tsx; neither contains a date or time input (search of the files found none), so those brief references look stale.

**Present but disconnected or switched off**

- Mobile colour picker has no free colour input, only ten fixed accents (accent-color/index.tsx:13-24).

**Not available**

- VS Code: no date, time, zone or colour picker found.
- Chrome: date, time and zone exist in the schedule form, but the brief marks them missing; the brief is out of date on this point (schedulesSection.ts:515-524). No colour input found in apps/extension/src.
- CLI: not applicable (brief shows no status).

## 4. Required behaviour

**Established requirements**

- A date picker (calendar or native date control) is used where a date is entered. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.25)
- A time picker (native or custom) is used where a time is entered. (source: S8.26 in the same brief)
- A time zone picker (searchable list, defaulting to the device zone) is used where schedules take a zone. (source: S8.27 in the same brief)
- A colour picker (swatches or a colour input) is used where the user chooses a colour. (source: S8.28 in the same brief)

**Acceptance criteria**

1. On web, create a One Time schedule: Run At shows a date-time control and saving with an empty value shows a field error.
2. On web and mobile, a new schedule form shows the device time zone before the person touches it.
3. On web, typing an invalid zone name and saving shows 'Enter a valid IANA time zone.'.
4. On mobile, searching 'london' in the Time zone sheet narrows the list and choosing a row closes the sheet and updates the button label.
5. On mobile Android, the date dialog does not allow a day earlier than today in the selected zone.
6. On web, choosing a swatch under Project colour sets aria-selected on that swatch only.
7. On mobile, choosing a colour under Accent Color shows the check on that row and persists after reopening.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The zone field should be reachable and usable by keyboard on every app that has a schedule form [inferred from S8.27 and the keyboard rules in the brief].
- Time zone and time values must reach the server unchanged so a schedule runs at the displayed time [inferred from schedule-form.ts converting local input to an ISO time with the chosen zone (lines 303-336)].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a zone picker to the retained desktop schedule form or confirm that only the web form is shipped on the Electron Desktop.
- [proposed] Update the brief rows for Chrome date, time and zone, and correct stale line references.
- [proposed] Offer an exact colour option for projects or say plainly that colours snap to presets.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ScheduleForm (web) | `apps/web/features/schedules/components/ScheduleForm.tsx` | Run At, Local Time, End date and Time Zone inputs |
| service | createInitialScheduleDraft / validation | `apps/web/features/schedules/lib/schedule-form.ts` | Defaults the zone to the device zone, validates it, converts local input to a UTC time |
| service | validateTimeZone | `packages/platform/utils/src/scheduling/schedule-time.ts` | Shared zone name check used by the form |
| component | LocalRoutinesSection | `apps/web/features/schedules/components/LocalRoutinesSection.tsx` | Another web form with date-time and time inputs (lines 459,480) |
| component | TimeFocusSection | `apps/web/features/settings/sections/TimeFocusSection.tsx` | Time inputs in settings (lines 321,352); purpose of the setting: unknown |
| screen | Project page colour block | `apps/web/app/chat/projects/[id]/page.tsx` | Swatches and custom colour input for project colour |
| config | PROJECT_ACCENT_REGISTRY / nearestProjectAccentId | `packages/ui/ui/src/sidebar/project-icons.ts` | Fixed set of project accents and nearest-match function |
| component | LibraryDialogs colour inputs | `apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx` | Colour input at line 186 (deck brand colours) |
| component | DesktopCloudSchedules | `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx` | Retained Tauri schedule form with date-time and time inputs; device zone only |
| component | TaskScheduleInput | `apps/desktop/src/features/scheduler/TaskScheduleInput.tsx` | Retained Tauri schedule inputs (lines 131,208) |
| component | ThemeEditorDialog | `apps/desktop/src/features/settings/ThemeEditorDialog.tsx` | Colour input plus hex text for theme colours (line 117) |
| component | ScheduleDateTimeField | `apps/mobile/src/features/schedules/components/ScheduleDateTimeField.tsx` | Mobile date and time button and native picker |
| component | TimezonePickerField | `apps/mobile/src/features/schedules/components/TimezonePickerField.tsx` | Mobile searchable zone sheet |
| component | ScheduleForm (mobile) | `apps/mobile/src/features/schedules/components/ScheduleForm.tsx` | Hosts the pickers; initial zone is the device zone (line 57) |
| service | earliestPickerDateInZone | `apps/mobile/src/features/schedules/timing.ts` | Minimum selectable date in the chosen zone |
| screen | AccentColorScreen | `apps/mobile/src/features/settings/accent-color/index.tsx` | Mobile accent colour list |
| store | localSettingsStore / cloudSettingsStore | `apps/mobile/stores/settings/localSettingsStore.ts` | Holds accentColor per mode (cloud twin: cloudSettingsStore.ts) |
| component | schedulesSection | `apps/extension/src/features/side-panel/schedulesSection.ts` | Chrome schedule form with date-time, time and zone select |
| test | ScheduleForm.test | `apps/web/features/schedules/components/ScheduleForm.test.tsx` | Checks the end date input type (line 50) |
| test | ScheduleDatePickerZone.test | `apps/mobile/src/features/schedules/__tests__/ScheduleDatePickerZone.test.tsx` | Minimum date in the schedule zone |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person edits date, time or zone in the form; values stay in form state. | device | ScheduleForm.tsx:327-329 (set scheduledLocal); ScheduleDateTimeField.tsx:79-81 |
| Zone name is checked and the local date-time is converted to a UTC time using the zone. | device | apps/web/features/schedules/lib/schedule-form.ts:259-264,303-336 |
| The schedule is saved to the managed Cloud schedule service; the run happens in the Cloud window. | our servers | apps/mobile/src/features/schedules/policy.ts:30-31 (Cloud window note); endpoint name: unknown, not opened |
| Accent colour choice is written to a settings store on the device (and the Cloud settings store in Cloud mode). | device | apps/mobile/src/features/settings/accent-color/index.tsx:30-37 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Schedule date, time, zone | Form state, then the Cloud schedule record | Yes after save (Cloud schedules) | Kept with the schedule; deleted when the schedule is deleted (rules: unknown) |
| Mobile accent colour | store:localSettingsStore or store:cloudSettingsStore | Cloud settings store syncs in Cloud mode (apps/mobile/__tests__/cloud-settings-sync.test.ts exists); Local does not [inferred] | Kept until changed |
| Project colour | Project record | With the project (endpoint: unknown) | Kept with the project |

**Models and providers.** No model or provider takes part in choosing a date, time, zone or colour. A schedule's prompt later runs on a model chosen in the same form (field name 'model' in ScheduleForm.tsx:41) but that is outside this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Schedule forms need a signed-in account for Cloud schedules; the exact check was not opened (unknown). Mobile accent colour needs no account for Local mode (store is on the device). |
| Permissions | None found in the code for the pickers themselves. |
| Subscription | None found in the picker code. Schedule creation may be gated by an entitlement; not established (unknown). Accent and project colour: none found. |
| Limits and metering | Schedule sweep cadence is a constant 15 minutes on mobile (policy.ts:25); credit cap and max runs are fields of the web form (ScheduleForm.tsx:49-50). Pickers themselves have no limit. |
| Feature flags | None found in the picker code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | None; no provider is called. |
| Local mode | Accent colour works in Local mode on mobile through the local settings store. Schedules are described as Cloud runs, so the schedule pickers lead to a Cloud feature; whether Local mode can create a schedule is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid time zone | Field error 'Enter a valid IANA time zone.' | schedule-form.ts:263 |
| Ambiguous daylight-saving time | Rejected with a message in the web form | ScheduleForm.tsx:333 |
| Zone list unavailable in the runtime | Mobile list falls back to device and current zone only; Chrome list falls back to the current zone | TimezonePickerField.tsx:19-23; schedulesSection.ts:412-416 |
| Date in the past | Mobile picker sets a minimum date in the zone; web behaviour for past times: not established | ScheduleDateTimeField.tsx:84 |
| Screen reader | Mobile buttons carry label plus value and a hint; zone sheet has a close button label; web fields have labels and aria-describedby | ScheduleDateTimeField.tsx:98-104; TimezonePickerField.tsx:57-60; ScheduleForm.tsx:520-521 |
| Offline, retry, timeout, cancel | Not handled in the picker code (the pickers are local controls); save behaviour is outside this feature | not found in the files listed |
| Empty zone search on mobile | List filter returns no rows; any empty-state text: not handled in the code I read | TimezonePickerField.tsx:44-47 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/schedules/components/ScheduleForm.test.tsx`: Web form including the end date input type
- `apps/web/features/schedules/lib/schedule-form.test.ts`: Schedule form logic (content not opened)
- `apps/mobile/src/features/schedules/__tests__/ScheduleDatePickerZone.test.tsx`: Earliest picker date reads the zone day; Android picker minimum
- `apps/mobile/src/features/schedules/__tests__/ScheduleOnceTime.test.tsx`: One-time time handling on mobile (content not opened)
- `apps/mobile/__tests__/AccentColorScreen.test.tsx`: Ten colours in order, dot per colour, Cloud store in Cloud mode, selected state

**Test scenarios**

- **Device zone default**
  1. Open the web schedule form as a new schedule.
  2. Read the Time Zone field.
  - Expected: It shows the device zone name, or UTC if the device gives none.
- **Invalid zone**
  1. Type 'Mars/Base' in Time Zone.
  2. Save.
  - Expected: Error 'Enter a valid IANA time zone.' under the field; nothing saved.
- **Mobile zone search**
  1. Open a mobile schedule form.
  2. Tap the Time zone button.
  3. Type 'tokyo'.
  4. Pick a row.
  - Expected: Sheet closes, button shows the zone with spaces for underscores.
- **Android minimum date**
  1. Set the zone to a zone already on tomorrow's date.
  2. Open Choose a date.
  - Expected: Days before today in that zone are not selectable.
- **Project colour**
  1. Open a project on web, open the Colour block.
  2. Click a swatch, then use the Custom colour input.
  - Expected: Swatch gets selected state; custom value snaps to the nearest preset.
- **Chrome schedule form**
  1. Open the Chrome side panel schedule form.
  2. Open the zone select.
  - Expected: A list of zones with the browser zone chosen.

**Where to look when it fails**

- Form field errors keyed by 'timezone' and 'scheduledLocal' (schedule-form.ts).
- Cloud save failures show the submit error from the form (submitError prop in ScheduleForm.tsx).
- Run the listed test files only; none were run for this page.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/008-basic-interactive-elements.md](../../70-qa/test-plans/web/008-basic-interactive-elements.md)
- Desktop: [70-qa/test-plans/desktop/008-basic-interactive-elements.md](../../70-qa/test-plans/desktop/008-basic-interactive-elements.md)
- Mobile: [70-qa/test-plans/mobile/008-basic-interactive-elements.md](../../70-qa/test-plans/mobile/008-basic-interactive-elements.md)
- Chrome: [70-qa/test-plans/chrome/008-basic-interactive-elements.md](../../70-qa/test-plans/chrome/008-basic-interactive-elements.md)

## 10. Gaps and dependencies

- **Retained desktop schedule form has no zone picker.** Affects: Desktop Tauri code only; Electron Desktop shows web. Evidence: apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:108-111,163. Work needed: Confirm which desktop code ships, then add the picker or fix the brief.
- **Brief says Chrome has no date, time or zone picker but code has them.** Affects: Chrome extension, brief accuracy. Evidence: apps/extension/src/features/side-panel/schedulesSection.ts:515-524. Work needed: Update brief statuses.
- **No date, time, zone or colour picker in VS Code.** Affects: VS Code. Evidence: search of apps/extension-vscode/src found no such input. Work needed: Decide whether VS Code needs them; if not mark n/a.
- **Custom project colour snaps to a preset.** Affects: Web. Evidence: page.tsx:891-897. Work needed: State this in the UI or store exact colours.
- **Brief code references for date picker point at files with no date input.** Affects: Documentation. Evidence: GlobalSearchDialog.tsx and apps/web/app/chat/page.tsx contain none. Work needed: Re-point brief to ScheduleForm.tsx.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- mode:local
- SYS-shared-ui-and-design
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- file:apps/web/features/schedules/components/ScheduleForm.tsx
- file:apps/mobile/src/features/schedules/components/TimezonePickerField.tsx
- store:cloudSettingsStore

## Unknown

- Which entitlement or plan gates schedule creation.
- The server endpoint that saves a schedule and a project colour.
- Whether the Electron Desktop ships anything besides the hosted web app for schedules.
- What the TimeFocusSection setting is for.
- Whether any Chrome colour input exists beyond the search done.
- Whether the web date or time controls are validated for past times.
