---
id: "F109-99"
type: "feature"
title: "Other items in Optional native and ambient extensions"
aliases: ["Other items in Optional native and ambient extensions", "S109.06 Optional animated companion/pet", "S109.14 Automotive voice surface", "virtual pet companion", "CarPlay and Android Auto", "driving surface"]
area: "109 Optional native and ambient extensions"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S109.06", "S109.14"]
depends_on: ["surface:mobile", "SYS-voice-and-media", "SYS-shared-ui-and-design", "file:audit/registers/capability-gaps.csv", "file:audit/registers/ui-gaps.csv"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F109-99 Other items in Optional native and ambient extensions

Two items of the Optional native and ambient extensions area that AGI Workforce has deliberately declined: an optional animated pet character, and a voice surface in cars (CarPlay, Android Auto). Neither exists in any app. The project records them as Not Planned, so this page documents an absence, not a working feature.

Area: [109. Optional native and ambient extensions](README.md). Requirement items: [S109.06](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10906), [S109.14](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10914).

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

**What it does.** Nothing today. It records two capabilities the area brief lists but the product does not offer: (1) an optional animated companion or pet character (S109.06) and (2) using AGI by voice through an in-car system such as CarPlay or Android Auto (S109.14). Both are marked n/a on every app in the brief and declined in the audit ledger (audit/ledger/ecosystem-capability-ledger.jsonl:3390; audit/ledger/ecosystem-capability-ledger.jsonl:3398).

**Why it exists.** Competitors ship similar things (ChatGPT has a Pet companion setting and CarPlay voice; Claude CarPlay voice is reported but unverified), so the area brief tracks them. The project then closed both as deliberate declines so they do not remain an implied backlog (audit/registers/ui-gaps.csv:340; audit/registers/capability-gaps.csv:3; doc: docs/research/claude-chatgpt-comparison-2026-11-18.md).

**Who uses it.** No end user can use either item. Product owners, engineers and testers read this page to learn that the absence is intentional and where the decision is recorded.

**Problems it solves**

- Stops a tester from filing 'pet' or 'CarPlay' as an unknown bug: both are recorded declines.
- Gives a future owner the evidence trail (decline records and the competitor references) if the decision is reopened.

**Use cases**

- A tester sees no pet setting in Web or Mobile and checks this page to confirm it is intended.
- A product owner asks whether CarPlay is planned and is pointed to the Not Planned decision with its reason: no driving-surface strategy or entitlement.
- An engineer wanting hands-free in-car voice learns that the closest existing path is the Mobile in-app voice screen, which is not a car surface [inferred].

## 2. User experience

**Where to find it**

- Web: not available (ledger cell n/a) (audit/ledger/ecosystem-capability-ledger.jsonl:3390).
- Desktop: not available.
- Mobile: not available. No CarPlay or car setting appears in the Mobile app config checked (apps/mobile/app.config.js:30-46 only handles background modes for tasks).
- CLI, VS Code extension, Chrome extension: not available.

**Before you start**

- None, because there is nothing to use.

**Screens and controls**

- No screen or control exists for a pet or for a car surface. A search of web, mobile and desktop found no 'pet' feature, and the mobile 'companion' folder is desktop-to-phone pairing, not a pet (audit/registers/ui-gaps.csv:340).

**Journey**

1. A person looks for a pet or companion character in Personalization or settings: none exists.
2. A person connects the phone to a car: AGI does not appear as a car app (no CarPlay or Android Auto code or config found in apps/mobile native or app config; searched, none found).
3. The person can instead open the in-app voice screen on the phone (apps/mobile/app/(app)/voice.tsx:1) [inferred: this is phone voice, not a car surface].

**What the person sees and gets**

- None. No message, badge or placeholder is shown for either item.

**Settings**

- None found in the code for either item.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for S109.06 or S109.14. Ledger rollup for both is 'declined' (audit/ledger/ecosystem-capability-ledger.jsonl:3390; audit/ledger/ecosystem-capability-ledger.jsonl:3398).
- The decline records themselves exist: GAP-336 Not Planned (audit/registers/ui-gaps.csv:340; audit/registers/ui-gaps.md:7739) and CAP-002 Decline / Not Planned (audit/registers/capability-gaps.csv:3).

**Incomplete**

- None: nothing was started.

**Present but disconnected or switched off**

- None found: no dormant pet or car code located by searching apps and packages for pet, mascot, CarPlay, Android Auto.

**Not available**

- Animated pet or companion character on Web, Desktop, Mobile, CLI, VS Code and Chrome (audit/ledger/ecosystem-capability-ledger.jsonl:3390).
- CarPlay and Android Auto voice surface on Web, Desktop, Mobile, CLI, VS Code and Chrome (audit/ledger/ecosystem-capability-ledger.jsonl:3398).

## 4. Required behaviour

**Established requirements**

- An optional animated companion or pet character can be shown. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.06)
- The user can use AGI by voice through an in-car system (CarPlay, Android Auto). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.14)
- The pet companion is closed as a deliberate Not Planned novelty with nothing load-bearing behind it. (source: audit/registers/ui-gaps.csv:340)
- CarPlay and Android Auto is Decline / Not Planned: no driving-surface strategy or entitlement exists. (source: audit/registers/capability-gaps.csv:3)

**Acceptance criteria**

1. No app shows a pet or companion character setting or control.
2. No app registers as a CarPlay or Android Auto app.
3. The Mobile 'companion' screen is described and behaves as desktop pairing, not as a pet.
4. The decline records GAP-336 and CAP-002 remain present and consistent with the ledger.
5. If the decision is reversed, a new decision record and entitlement plan exist before code is added.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the brief says 'Should' but the decline records override it, the effective requirement today is 'absent by design' [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reopen CAP-002 only if a driving-surface strategy and Apple/Google car entitlements are approved; the competitors named in docs/research/claude-chatgpt-comparison-2026-11-18.md ship CarPlay voice.
- [proposed] Reopen GAP-336 only if engagement metrics justify it, as the gap record itself says.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Ledger row S109.06 | `audit/ledger/ecosystem-capability-ledger.jsonl` | Records the pet item as declined with ref GAP-336 (line 3390). |
| other | Ledger row S109.14 | `audit/ledger/ecosystem-capability-ledger.jsonl` | Records the automotive item as declined with ref CAP-002 (line 3398). |
| other | GAP-336 row | `audit/registers/ui-gaps.csv` | Not Planned decision for the virtual pet companion (line 340). |
| other | GAP-336 detail | `audit/registers/ui-gaps.md` | Human-readable decline with evidence and suggested fix (line 7739). |
| other | CAP-002 row | `audit/registers/capability-gaps.csv` | Decline of CarPlay and Android Auto (line 3). |
| other | check-capability-gaps | `scripts/check-capability-gaps.mjs` | Guard script that reads the capability gaps register [inferred from name; not opened]. |
| other | check-ui-gaps | `scripts/check-ui-gaps.mjs` | Guard script that reads the UI gaps register [inferred from name; not opened]. |
| config | Mobile app config | `apps/mobile/app.config.js` | Mobile build config; the part read (lines 30-46) strips background modes and contains no car configuration. |
| screen | Mobile voice screen | `apps/mobile/app/(app)/voice.tsx` | Closest existing hands-free voice screen on the phone; not a car surface. |
| component | Mobile companion feature (pairing) | `apps/mobile/src/features/companion/components/QRScanner.tsx` | Desktop pairing; named in GAP-336 evidence as not a pet. |
| other | Competitor comparison | `docs/research/claude-chatgpt-comparison-2026-11-18.md` | Documents that ChatGPT ships CarPlay voice and Claude CarPlay is unverified. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No runtime flow exists for either item. A person cannot start a pet or car action in any app. | device | audit/ledger/ecosystem-capability-ledger.jsonl:3390; audit/ledger/ecosystem-capability-ledger.jsonl:3398 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Decline decisions (status and reason) | Repository files under audit/registers and audit/ledger | Not applicable; they are source files in git | Kept in the repository; per docs, defect rows are deleted when fixed, not for declines [inferred] |

**Models and providers.** No model or provider takes part, because no feature runs. Any future car voice would need a model route; unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code (no feature) |
| Permissions | none found in the code |
| Subscription | none found in the code; no entitlement is defined for pet or car surfaces |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | not applicable |
| Provider restrictions | not applicable |
| Local mode | In Local mode nothing changes: neither item exists. The Mobile in-app voice screen is separate and not part of this feature. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| User looks for a pet or CarPlay | Not handled in the code: no placeholder, hidden toggle or explanation appears. | searched apps and packages for pet, mascot, CarPlay, Android Auto: only research and audit files matched |
| Confusion with Mobile 'companion' | The Mobile companion is device pairing, not a pet; the name overlap is a known source of confusion. | audit/registers/ui-gaps.csv:340 |
| Offline, loading, error, retry, cancel, timeout | Not handled in the code because there is no feature. | no implementation found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **No pet setting on Web**
  1. Sign in on Web
  2. Open Settings and Personalization
  - Expected: No pet or companion character control is shown.
- **No pet on Mobile**
  1. Open AGI Mobile
  2. Browse Settings and the drawer
  - Expected: Only desktop-pairing 'companion' appears; no character.
- **No CarPlay**
  1. Connect an iPhone with AGI Mobile installed to a CarPlay head unit
  - Expected: AGI does not appear among car apps.
- **No Android Auto**
  1. Connect an Android phone with AGI Mobile to Android Auto
  - Expected: AGI does not appear as a car app.
- **Decline records agree**
  1. Open ledger rows S109.06 and S109.14
  2. Open GAP-336 and CAP-002
  - Expected: Both rows say declined and point to Not Planned records.

**Where to look when it fails**

- rg -i 'carplay|android auto|\bpet\b' apps packages should find no product code
- Check audit/registers/ui-gaps.csv GAP-336 and audit/registers/capability-gaps.csv CAP-002 for status changes

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No animated pet or companion character** Affects: All six apps; users who want a personalised character (competitor ChatGPT has one). Evidence: audit/registers/ui-gaps.csv:340. Work needed: Deliberately declined; only reopen on an owner decision, then design, build in shared UI and add a setting.
- **No CarPlay or Android Auto voice surface** Affects: Mobile users (iOS and Android) who drive. Evidence: audit/registers/capability-gaps.csv:3; doc: docs/research/claude-chatgpt-comparison-2026-11-18.md. Work needed: Strategy decision, platform entitlements, a voice-only driving UI, and safety review.

**Depends on**

- surface:mobile
- SYS-voice-and-media
- SYS-shared-ui-and-design
- file:audit/registers/capability-gaps.csv
- file:audit/registers/ui-gaps.csv

## Unknown

- Whether the Not Planned decisions will be revisited, and by whom.
- Whether the Claude CarPlay voice feature is real: the project's own comparison marks it unverified.
- Whether the check-capability-gaps and check-ui-gaps scripts enforce these two rows (scripts not opened).
- Which provider or model route a future car voice would use.
