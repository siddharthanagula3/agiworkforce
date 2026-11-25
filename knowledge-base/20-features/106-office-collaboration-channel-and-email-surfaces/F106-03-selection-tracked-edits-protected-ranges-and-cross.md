---
id: "F106-03"
type: "feature"
title: "Selection, tracked edits, protected ranges and cross-file references in host documents"
aliases: ["Host-document selection context", "Native tracked edits", "Protected-range awareness", "Cross-document references", "S106.08", "S106.09", "S106.10", "S106.11"]
area: "106 Office, collaboration-channel, and email surfaces"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S106.08", "S106.09", "S106.10", "S106.11"]
depends_on: ["F106-01", "F106-02", "surface:web", "surface:desktop", "surface:chrome", "SYS-security-and-privacy", "SYS-chat-turn-pipeline", "SYS-authorization-and-workspaces"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F106-03 Selection, tracked edits, protected ranges and cross-file references in host documents

Planned abilities of the in-host assistant: see the user's selection, write edits as native tracked changes or suggestions, skip protected ranges, and cite other files from the same host. None exists in any app; they depend on the host panes in F106-01 and F106-02, which are also missing.

Area: [106. Office, collaboration-channel, and email surfaces](README.md). Requirement items: [S106.08](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10608), [S106.09](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10609), [S106.10](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10610), [S106.11](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10611).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would make the in-host assistant precise and safe: it knows what is selected, proposes changes the person can accept or reject, avoids locked areas and can pull in another file from the same host. Today none of this exists.

**Why it exists.** The brief lists four requirements (doc: knowledge-base/data/area-briefs/106-office-collaboration-channel-and-email-surfaces.md, S106.08 to S106.11). Tracked edits keep the person in control of changes [inferred].

**Who uses it.** People editing shared or controlled documents, such as contracts and finance sheets.

**Problems it solves**

- The assistant guessing which text the person means.
- Silent overwrites of reviewed text.
- Edits to locked cells or sections.
- No way to use a second file as a source.

**Use cases**

- Select a paragraph in Word and ask for a shorter version as a tracked change.
- Select cells in Excel and ask what a formula does.
- Ask the assistant to skip a protected sheet.
- Cite a second deck from inside a deck.

## 2. User experience

**Where to find it**

- No app has it. Web missing, desktop missing; Chrome missing for S106.09, S106.10 and S106.11 (brief). Mobile, CLI and VS Code are not applicable.

**Before you start**

- The host panes of F106-01 or F106-02 must exist first; they do not.

**Screens and controls**

- None exist.

**Journey**

1. Intended [proposed]: select content, ask, review suggestions in the host's own review pane, accept or reject.
2. Today: no journey.

**What the person sees and gets**

- None today.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing.

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- The Chrome extension exists (apps/extension/manifest.json) but the brief marks S106.09 to S106.11 missing there and no host-document code was found.

**Not available**

- Selection context, tracked edits, protected ranges and cross-document references on web, desktop and Chrome (brief S106.08 to S106.11).

## 4. Required behaviour

**Established requirements**

- The in-host assistant sees what the user has selected (text, cells, slide objects) as context. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S106.08)
- Edits appear as native tracked changes or suggestions the user can accept or reject. (source: S106.09 (same brief))
- The assistant knows which ranges, sheets or sections are protected and does not try to change them. (source: S106.10 (same brief))
- From one host document the assistant can pull in or cite another document from the same host. (source: S106.11 (same brief))

**Acceptance criteria**

1. A selection in the host is included in the request context.
2. An edit arrives as a tracked change or suggestion, not a silent overwrite.
3. Rejecting a suggestion leaves the document unchanged.
4. A protected range is never changed and the assistant says why.
5. A second file from the same host can be cited and its content used.
6. Only files the person can already open in the host are readable.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Cross-document reads must obey the person's own host permissions [inferred from least-privilege rule in AGENTS.md section 6].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Treat selection and protected ranges as part of the host adapter contract so every host reports them the same way.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief S106.08 to S106.11 | `knowledge-base/data/area-briefs/106-office-collaboration-channel-and-email-surfaces.md` | Only record of the requirement. |
| config | Chrome extension manifest | `apps/extension/manifest.json` | The Chrome app the brief marks missing for S106.09 to S106.11. |
| other | Agent contract | `AGENTS.md` | Trust-boundary and least-privilege rules any host-reading code must follow (section 6). |
| service | Google user data run guard | `apps/web/lib/connectors/google-user-data-runs.ts` | Existing rules for Google data in unattended runs; related policy. |
| service | Microsoft Graph connector | `apps/web/lib/connectors/microsoft-graph.ts` | Existing outbound reader of Microsoft files and mail; could supply cross-document reads [inferred]. |
| service | Instruction precedence | `apps/web/lib/prompts/instruction-precedence.ts` | Orders system, memory and untrusted context blocks; the Slack turn uses it for outside text; a selection block would use it [inferred]. |
| service | Slack channel context builder | `apps/web/lib/slack/slack-context.ts` | Example of passing outside text as untrusted context; related pattern. |
| schema | Billing plan capabilities | `packages/contracts/types/src/billing-catalog.ts` | No capability exists for these abilities. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Nothing runs; the feature does not exist. | device | No host adapter code found. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| None. | not applicable | not applicable | not applicable |

**Models and providers.** Not applicable today.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | unknown |
| Provider restrictions | none found in the code |
| Local mode | Not applicable today; unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code | Feature does not exist. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Confirm absence**
  1. Search for selection, tracked change or protected-range handling tied to a host document in apps and packages.
  - Expected: No host-document code.
- **Future selection**
  1. Select a sentence in the host.
  2. Ask 'what did I select?'
  - Expected: The assistant quotes the selection.
- **Future tracked edit**
  1. Ask for a rewrite.
  2. Open the host review pane.
  - Expected: The rewrite is a pending change that can be rejected.
- **Future protected range**
  1. Lock a range.
  2. Ask the assistant to edit it.
  - Expected: Refused with a reason; range unchanged.

**Where to look when it fails**

- No logs or tables exist.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No selection context, tracked edits, protected-range checks or cross-document references.** Affects: Web, desktop and Chrome users once host panes exist.. Evidence: Brief S106.08 to S106.11 mark web, desktop and (09 to 11) Chrome missing.. Work needed: Define the host adapter contract, implement per host, and add tests.
- Not built on: Web, Desktop, Chrome (from the capability ledger).

**Depends on**

- F106-01
- F106-02
- surface:web
- surface:desktop
- surface:chrome
- SYS-security-and-privacy
- SYS-chat-turn-pipeline
- SYS-authorization-and-workspaces

## Unknown

- Whether Chrome is meant to host these abilities inside web editors or only in a pane; the brief does not say.
- Whether any host API supports each ability on every host; not researched.
