---
id: "F108-12"
type: "feature"
title: "Items with no code found (business operations, CAD, virtual try-on, voice agents)"
aliases: ["Business operations workspace (S108.25)", "Engineering/CAD connector workflows (S108.30)", "Virtual try-on (S108.32)", "Customer-service voice agents (S108.35)"]
area: "108 Specialist workspaces"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S108.25", "S108.30", "S108.32", "S108.35"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-voice-and-media", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "file:audit/missing/108-specialist-workspaces.md"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F108-12 Items with no code found (business operations, CAD, virtual try-on, voice agents)

Four planned items have no product code: a business-operations view, CAD workflows for Onshape, SolidWorks and Autodesk, virtual try-on from a photo, and a customer-service voice agent. The repository only holds adjacent pieces: an Autodesk Fusion entry in the connector directory and a Twilio connector entry. Nothing here is a working feature on any app.

Area: [108. Specialist workspaces](README.md). Requirement items: [S108.25](../../10-requirements/capabilities/108-specialist-workspaces.md#s10825), [S108.30](../../10-requirements/capabilities/108-specialist-workspaces.md#s10830), [S108.32](../../10-requirements/capabilities/108-specialist-workspaces.md#s10832), [S108.35](../../10-requirements/capabilities/108-specialist-workspaces.md#s10835).

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

**What it does.** Nothing today. The items are planned and listed in the missing-work file (audit/missing/108-specialist-workspaces.md:81-101).

**Why it exists.** The brief lists them as parts of the specialist workspace set the product should cover (doc: knowledge-base/data/area-briefs/108-specialist-workspaces.md).

**Who uses it.** Future: operations leads, engineers and designers, shoppers, and customer-service teams.

**Problems it solves**

- Planned only: one view of company operations; model and drawing work through CAD tools; trying garments on a photo; answering customer calls by voice.

**Use cases**

- Planned: connect a CAD tool and ask to change a part.
- Planned: upload a photo and see a garment on it.
- Planned: deploy a phone voice agent for support.

## 2. User experience

**Where to find it**

- None. No screen, route, setting or command for these four items was found on web, desktop, mobile or Chrome.
- Adjacent only: an Autodesk Fusion directory entry could be offered as a connector (apps/web/lib/connectors/directory/sources/vendor-directory.json:603-621); a Twilio connector entry describes 'SMS, WhatsApp messages, and voice calls' (apps/web/features/connectors/data/connectors.ts:657-663) and a Twilio directory entry exists (vendor-directory.json:7283-7288). Whether they are connectable in each app was not verified.

**Before you start**

- Not applicable: no working feature.

**Screens and controls**

- None.

**Journey**

1. Not possible today.

**What the person sees and gets**

- None.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing in this feature works as a dedicated workspace.

**Incomplete**

- Autodesk Fusion appears as a directory entry with an MCP URL, transport streamable-http and capability read-write (vendor-directory.json:603-621); this is a generic connector listing, not a CAD workflow.

**Present but disconnected or switched off**

- Whether directory entries are connectable by a signed-in person in each app: unknown.

**Not available**

- Business operations workspace: no code found (grep of apps, packages and docs for business-operations terms found only unrelated text).
- Onshape and SolidWorks: zero hits in the vendor directory file; no code elsewhere found.
- Virtual try-on: no matching code (matches for 'tryon' were the word retryOn in unrelated files).
- Customer-service voice agents: none; the separate voice-agent builder area (S51.01 onward) is also missing (audit/missing/051-voice-agent-builder-and-telephony-extensions.md:11-16).

## 4. Required behaviour

**Established requirements**

- S108.25 Should: a business-operations workspace brings company ops data and routines (finance, ops, tasks) into one view. Missing on all four apps. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.25)
- S108.30 Should: connect to CAD/engineering tools (Onshape, SolidWorks, Autodesk) and work on models or drawings. Missing on all four apps. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.30)
- S108.32 Should: upload a photo and see garments or products rendered on the person. Missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.32)
- S108.35 Should: build or deploy a voice agent that handles customer-service calls (telephony, IVR). Missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.35)
- All four are wave 5 and to be built on web, desktop, mobile and Chrome. (source: audit/missing/108-specialist-workspaces.md:81-101)

**Acceptance criteria**

1. Business operations: a person can open one view that combines finance, operations and task data (not met).
2. CAD: a person can connect each of Onshape, SolidWorks and Autodesk and ask for a model change or drawing read (not met; Autodesk only has a directory entry).
3. Try-on: a person uploads a photo and gets a rendered result with consent handling (not met).
4. Voice agent: a person configures and deploys an agent that answers calls (not met).
5. Each item has an explicit Local, own-key and Cloud execution boundary before release [inferred from product rules].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- CAD workflows can start from connectors and MCP rather than new screens [inferred from the Autodesk directory entry].
- Try-on involves a person's photo and so needs the privacy and 18-and-over decisions applied [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Treat CAD as a connector and skill pair first.
- [proposed] Fold the customer-service voice agent into the voice-agent builder area (S51) rather than build twice.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | missing-work list | `audit/missing/108-specialist-workspaces.md` | Records the four items as open (:81-101). |
| config | voice agent missing list | `audit/missing/051-voice-agent-builder-and-telephony-extensions.md` | Related missing voice-agent builder items. |
| config | Autodesk Fusion directory entry | `apps/web/lib/connectors/directory/sources/vendor-directory.json` | Lines 603-621: connector listing with MCP URL. |
| config | Twilio directory entry | `apps/web/lib/connectors/directory/sources/vendor-directory.json` | Lines 7283-7288: Twilio MCP listing. |
| config | Twilio connector entry | `apps/web/features/connectors/data/connectors.ts` | Lines 657-663: 'SMS, WhatsApp messages, and voice calls'. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No execution path exists for these four items. | our servers | No code found; audit/missing/108-specialist-workspaces.md:81-101 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| none | none found in the code | not applicable | not applicable |

**Models and providers.** Not applicable today. A generic connector listing for Autodesk Fusion names an outside hosted service (vendor-directory.json:603-621).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | none found in the code |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Any state (loading, empty, error, offline) | not handled in the code; the feature does not exist | No code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/directory/__tests__/vendor-directory.test.ts`: Vendor directory entries in general (not a CAD or voice workflow)

**Test scenarios**

- **Absence check**
  1. Search each app for business operations, CAD, try-on and voice agent controls.
  - Expected: None found.
- **Autodesk entry**
  1. Open the connector directory on web and look for Autodesk Fusion.
  - Expected: Observe whether it is listed and connectable; no workflow beyond generic tools.
- **Twilio**
  1. Open Connectors and find Twilio.
  - Expected: Observe the listing; no voice-agent builder.

**Where to look when it fails**

- Track in audit/missing/108-specialist-workspaces.md and the ledger named in its header; no runtime diagnostics exist.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Business operations workspace not built.** Affects: All four apps.. Evidence: audit/missing/108-specialist-workspaces.md:81-87. Work needed: Define scope, data sources and the view.
- **CAD workflows not built; Onshape and SolidWorks absent from the directory.** Affects: All four apps.. Evidence: vendor-directory.json has no Onshape or SolidWorks entry; Autodesk entry at :603-621. Work needed: Add connectors or MCP entries and skills; test with real accounts.
- **Virtual try-on not built.** Affects: All four apps.. Evidence: No code found. Work needed: Pick an image-generation route, consent, and privacy handling.
- **Customer-service voice agent not built.** Affects: All four apps.. Evidence: audit/missing/051-voice-agent-builder-and-telephony-extensions.md:11-16. Work needed: Build through the voice-agent builder area.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-voice-and-media
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- file:audit/missing/108-specialist-workspaces.md

## Unknown

- Whether the Autodesk Fusion and Twilio directory entries are connectable in any app.
- Whether desktop or CLI hold related code (search covered apps and packages for the listed names only).
- Implementation map has fewer than 8 entries because no code exists; the entries are the planning record and adjacent connector listings.
- Owner priority and date for wave 5.
