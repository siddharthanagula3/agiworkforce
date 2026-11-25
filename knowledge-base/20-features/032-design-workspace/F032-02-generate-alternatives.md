---
id: "F032-02"
type: "feature"
title: "Generate alternatives"
aliases: ["Generate alternatives", "Multiple design alternatives", "S32.03"]
area: "32 Design workspace"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S32.03"]
depends_on: ["F032-01", "F032-03", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F032-02 Generate alternatives

Required: one brief produces several designs shown side by side to pick from. Not built in the code opened. The brief request asks the model for one design only, and no compare view or variant control was found on any app.

Area: [32. Design workspace](README.md). Requirement items: [S32.03](../../10-requirements/capabilities/032-design-workspace.md#s3203).

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

**What it does.** Would give several candidate designs for one brief and show them together. Today nothing does this.

**Why it exists.** Item S32.03 wants alternatives side by side so a person can choose rather than iterate blindly (doc: knowledge-base/data/area-briefs/032-design-workspace.md).

**Who uses it.** Web, Desktop, Mobile and Chrome users, once built (brief lists all four as missing).

**Problems it solves**

- One draft may miss the taste of the person.
- Comparing needs several chats today.

**Use cases**

- Ask for three takes on a landing page and pick one.
- Compare a bold and a minimal option.

## 2. User experience

**Where to find it**

- No app has it: no control found. The only generation entry is 'Design from a brief' on web, which asks for one design (design-brief.ts:84-95).

**Before you start**

- Not applicable until built.

**Screens and controls**

- None. The nearest existing view is the version history compare in ArtifactChangesView, which compares versions, not alternatives (ArtifactPreview.tsx:3207-3215).

**Journey**

1. Not available. Today a person can only send the brief again and get another single design.

**What the person sees and gets**

- none found in the code.

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for alternatives. Single-design generation from a brief works on web (see F032-01).

**Incomplete**

- Version history can compare two versions of one design (ArtifactChangesView), which is a related but different thing.

**Present but disconnected or switched off**

- none found.

**Not available**

- Alternatives on web, desktop, mobile, chrome: no code. The request builder says 'build it now' for one design (design-brief.ts:90-94).

## 4. Required behaviour

**Established requirements**

- The workspace generates several alternative designs for one brief and shows them side by side. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.03)
- Regenerate or iterate the selected artboard or object is a required workspace capability. (source: docs/product/requirements.md:1490)

**Acceptance criteria**

1. A control on the brief dialog sets how many alternatives (for example two to four).
2. Each alternative is a separate design with its own history.
3. All alternatives show together at one time.
4. Choosing one makes it the working design.
5. Cost of extra turns is visible or limited per plan.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Each alternative is one model turn, so usage multiplies [inferred].

**Proposed improvements** (suggestions, not requirements)

- Run alternatives as parallel turns with different style seeds from the same brief.
- Show a per-plan cap on alternatives.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | area brief | `knowledge-base/data/area-briefs/032-design-workspace.md` | Defines S32.03. |
| other | requirements | `docs/product/requirements.md` | Section 17.1 design workspace requirements. |
| other | buildDesignFromBriefRequest | `apps/web/features/chat/components/artifacts/design/design-brief.ts` | Single-design request; would be extended. |
| component | DesignBriefDialog | `apps/web/features/chat/components/artifacts/design/DesignBriefDialog.tsx` | Where a count control would live. |
| component | ArtifactChangesView | `apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx` | Existing compare-versions view; nearest side-by-side code. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Single-design preview host. |
| component | ArtifactChangesView mobile | `apps/mobile/src/features/chat/components/ArtifactChangesView.tsx` | Mobile version compare; not alternatives. |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile artifact view. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Not implemented. Today one design request becomes one chat turn. | outside service | design-brief.ts:84-95; model route not traced |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| none for alternatives | not applicable | not applicable | not applicable |

**Models and providers.** No code. Several alternatives would need several model turns on whichever route the user has [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | No alternatives feature; nothing runs in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| any state | not handled in the code; feature absent. | searches of apps/web artifacts folders found no variant code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/design/DesignBrief.test.tsx`: Only single-design creation; nothing for alternatives.

**Test scenarios**

- **Confirm absence**
  1. Open 'Design from a brief' on web
  2. Look for a count or variants control
  - Expected: No such control today.
- **Future: three options**
  1. Set alternatives to 3
  2. Create
  - Expected: Three designs appear side by side.
- **Future: pick one**
  1. Choose option 2
  - Expected: It becomes the active design.

**Where to look when it fails**

- Not applicable until built.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No alternatives on any app** Affects: Web, Desktop, Mobile, Chrome. Evidence: S32.03 missing; no code. Work needed: Design the multi-turn flow, compare view and usage limits.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- F032-01
- F032-03
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome

## Unknown

- No design or ticket for alternatives was found in docs/product beyond requirements.md section 17.1 (multi-artboard versioning).
