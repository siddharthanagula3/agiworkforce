---
id: "F108-06"
type: "feature"
title: "Health features not built (timeline, lab explanation, wearables, appointment prep)"
aliases: ["Health timeline (S108.13)", "Lab-result explanation (S108.14)", "Wearable-data summaries (S108.15)", "Appointment preparation (S108.16)"]
area: "108 Specialist workspaces"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S108.13", "S108.14", "S108.15", "S108.16"]
depends_on: ["F108-05", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "SYS-security-and-privacy", "SYS-memory-projects-and-context", "SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-model-catalog-and-routing"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F108-06 Health features not built (timeline, lab explanation, wearables, appointment prep)

Planned health tools that do not exist: a chronological timeline, structured lab explanations, wearable summaries from HealthKit, Health Connect or Fitbit, and appointment preparation. No screen, route or data code was found. The mobile legal page states HealthKit was removed from the app. Chat can only read raw HealthEx records once F108-05 opens.

Area: [108. Specialist workspaces](README.md). Requirement items: [S108.13](../../10-requirements/capabilities/108-specialist-workspaces.md#s10813), [S108.14](../../10-requirements/capabilities/108-specialist-workspaces.md#s10814), [S108.15](../../10-requirements/capabilities/108-specialist-workspaces.md#s10815), [S108.16](../../10-requirements/capabilities/108-specialist-workspaces.md#s10816).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Nothing today. Planned per the brief: timeline of visits, diagnoses, medicines and labs; lab results with ranges, flags and trends; wearable import and summary; a flow for preparing for an appointment (symptoms, questions, records).

**Why it exists.** The brief lists them under the health workspace (S108.13-S108.16). No decision document covers wearables or lab views.

**Who uses it.** Planned for people managing their own health. No one can use it today.

**Problems it solves**

- Planned: one chronological view of health events
- Planned: understanding lab values
- Planned: summarising wearable data
- Planned: getting ready for a doctor visit

**Use cases**

- Planned: view a timeline of the last year
- Planned: upload a lab report and see which values are out of range
- Planned: import steps and sleep data and ask for trends
- Planned: prepare questions for an appointment

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile, Chrome: not present (brief status missing).
- CLI, VS Code: not applicable.

**Before you start**

- Not built. Any version tied to HealthEx would also need F108-05 to be released and connected [inferred].

**Screens and controls**

- None. Adjacent: the Health project page and chat (F108-05).

**Journey**

1. No journey. After F108-05 opens, a person could ask chat about labs and visits because HealthEx read tools exist for them (apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:778-790); the answer is free text, not a structured view.

**What the person sees and gets**

- None for these items.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for these four items. Search: git grep -i -E 'healthkit|health connect|fitbit|wearable|lab result|health timeline|appointment prep' across apps and packages (excluding json and markdown) found only tests and legal text about HealthKit being absent.

**Incomplete**

- Adjacent: HealthEx tool metadata lists read tools get_health_summary, get_conditions, get_medications, get_allergies, get_labs, get_vitals, get_procedures, get_immunizations, get_visits, search_clinical_notes (tool-metadata.ts:778-790). These are raw reads for chat, not a timeline or lab view.

**Present but disconnected or switched off**

- HealthEx itself is unreleased and unconfigured (see F108-05).

**Not available**

- All apps. Mobile: the legal page says HealthKit is not used and was removed (apps/web/app/mobile/legal/page.tsx:327-329), and a test enforces no HealthKit claims (apps/mobile/__tests__/ios-store-submission-config.test.ts:1058-1061).

## 4. Required behaviour

**Established requirements**

- The product shows a chronological timeline of health events (visits, diagnoses, medicines, labs). (source: S108.13 (brief))
- The user uploads or imports lab results and gets a structured explanation (ranges, flags, trends). (source: S108.14 (brief))
- The product imports wearable data (HealthKit, Health Connect, Fitbit and others) and summarises it. (source: S108.15 (brief))
- A flow helps prepare for a medical appointment (symptom summary, questions, records). (source: S108.16 (brief))
- Health data stays read-only, US only, out of memory and training, and every health feature stays off until legal sign-off. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:198-215)

**Acceptance criteria**

1. The timeline lists events in date order with source labels, and an empty state when no records exist.
2. A lab view shows each value with its range, a flag and a trend over time.
3. Wearable import asks permission through the platform and lists which data types were read.
4. An appointment preparation output cites the records it used.
5. All of them keep the Health space rules: no training models, no memory writes, personal account only.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Any wearable import on mobile would reopen the store declarations that the legal page says were removed [inferred from mobile/legal/page.tsx:327-329 and the HealthKit test].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build timeline and lab views on the HealthEx read tools inside the Health space first, before any wearable work.
- [proposed] Treat wearables as a separate decision with store policy review.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | HealthEx tool metadata (adjacent) | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Adjacent: declares the read tools a timeline or lab view could call (778-790) |
| component | HealthSpaceLanding (adjacent) | `apps/web/features/health/components/HealthSpaceLanding.tsx` | Adjacent: entry to the Health project |
| service | health-space-service (adjacent) | `apps/web/lib/services/health-space-service.ts` | Adjacent: space rules a health view would inherit |
| test | iOS store config test (adjacent) | `apps/mobile/__tests__/ios-store-submission-config.test.ts` | Adjacent: fails if HealthKit is declared (1058-1081) |
| screen | Mobile legal page (adjacent) | `apps/web/app/mobile/legal/page.tsx` | Adjacent: states HealthKit is not used (327-329) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No timeline, lab, wearable or appointment flow exists. | our servers | absence search over apps and packages |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data created | none | not applicable | not applicable |

**Models and providers.** None today. If built inside the Health space, the no-training model rule would apply (request-processor.ts:3235-3260).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code for these items |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not available; nothing built. Whether wearable data could be summarised on the device is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code; the features do not exist | absence search |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/ios-store-submission-config.test.ts`: Adjacent: iOS config carries no HealthKit claims or entitlements

**Test scenarios**

- **Confirm absence**
  1. Run the git grep search named in current_implementation
  - Expected: Only HealthKit-absence tests and legal text
- **Adjacent chat read**
  1. After HealthEx opens in a test deployment, ask about recent labs inside the Health project
  - Expected: Free-text answer from the read tool, no structured lab view

**Where to look when it fails**

- No logs or tables for these items; see briefs S108.13-S108.16

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Health timeline is not built** Affects: All apps. Evidence: brief S108.13. Work needed: Design and build on read tools after F108-05 opens
- **Lab explanation is not built** Affects: All apps. Evidence: brief S108.14. Work needed: Structured extraction and view
- **Wearable import is not built and mobile policy text says HealthKit was removed** Affects: Mobile mainly. Evidence: brief S108.15; mobile/legal/page.tsx:327-329. Work needed: Product and store-policy decision first
- **Appointment preparation is not built** Affects: All apps. Evidence: brief S108.16. Work needed: Flow design
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- F108-05
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- SYS-security-and-privacy
- SYS-memory-projects-and-context
- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-model-catalog-and-routing

## Unknown

- Whether wearables are in scope given the removed HealthKit.
- Whether lab explanation would use uploads or HealthEx records.
- No spec under docs/specs for these items was found by this search (not exhaustively listed).
