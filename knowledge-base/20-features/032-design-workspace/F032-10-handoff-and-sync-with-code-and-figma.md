---
id: "F032-10"
type: "feature"
title: "Handoff and sync with code and Figma"
aliases: ["Handoff and sync with code and Figma", "Design-to-code handoff (S32.28)", "Code-to-design sync (S32.29)", "Figma import and export (S32.30)"]
area: "32 Design workspace"
available_on: ["web", "cli"]
implementation: {web: "partial", desktop: "missing", mobile: "missing", cli: "partial", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S32.28", "S32.29", "S32.30"]
depends_on: ["surface:web", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage", "F032-11", "F032-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F032-10 Handoff and sync with code and Figma

Not built. There is no design-to-code spec view, no code-to-design sync and no Figma import or export of designs. The nearest code is copying or downloading a design's HTML source and a Figma entry in the connector catalog, whose release state is unknown.

Area: [32. Design workspace](README.md). Requirement items: [S32.28](../../10-requirements/capabilities/032-design-workspace.md#s3228), [S32.29](../../10-requirements/capabilities/032-design-workspace.md#s3229), [S32.30](../../10-requirements/capabilities/032-design-workspace.md#s3230).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Intended: give developers code or specs for a design, flow code changes back into the design, and import or export with Figma. (area brief S32.28 to S32.30) Today a design is an HTML artifact whose source can be copied or downloaded.

**Why it exists.** Teams move between design tools and code; the brief lists these as part of a design workspace.

**Who uses it.** Developers and designers handing a design across. The brief marks handoff not applicable anywhere, code sync missing on web, desktop, mobile and chrome, and Figma missing on CLI and Chrome.

**Problems it solves**

- Getting implementation from a design without retyping.
- Keeping design and code in step.
- Using existing Figma files.

**Use cases**

- Copy the HTML of a generated design into a project.
- Pull a Figma file into a design.
- Push a changed component back to the design.

## 2. User experience

**Where to find it**

- Copy and download source are in the Web artifact panel (ArtifactPreview.tsx:1210, 2388-2394).
- Figma appears as a connector in the connector directory (apps/web/features/connectors/data/connectors.ts:803).
- CLI: agi artifacts show writes source to a file (apps/cli/src/lib.rs:3910-3955).
- VS Code: save artifact copy into the workspace (extension-vscode/src/features/artifacts/artifactActions.ts:163-208).
- No import, export or sync control exists.

**Before you start**

- For the connector: Figma OAuth connection, and connectors being released (state unknown).

**Screens and controls**

- Connector card Figma, capability line 'file reads, component inspection, and asset export' (connectors.ts:804).
- Download as HTML, Download source, Copy (ArtifactPreview.tsx:2388-2394).

**Journey**

1. Copy or download the source of a design.
2. Use it in your own project by hand.
3. Figma journeys do not exist for designs.

**What the person sees and gets**

- Copy toast on failure 'Could not copy to clipboard' (ArtifactPreview.tsx:1213).
- CLI prints the written path (lib.rs:3957-3968).

**Settings**

- none found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Copy and download of an HTML design's source on Web; CLI show and VS Code save of any artifact's content.
- Figma MCP server entry with endpoint and OAuth (mcp-endpoints.ts:139-144; catalog.ts:242).

**Incomplete**

- The Figma connector is a general tool route, not a design import or export; how a design would use it is not coded.

**Present but disconnected or switched off**

- Connector availability depends on connectorsReleased from the types package, used on the connectors page (apps/web/app/connectors/page.tsx:5-10); its value was not read.

**Not available**

- Design-to-code spec or inspect view (brief: not applicable anywhere).
- Code-to-design sync on every app.
- Figma import or export of designs on every app; the Chrome extension only has page help text for figma.com (apps/extension/src/features/content/platform-prompts.ts:78).

## 4. Required behaviour

**Established requirements**

- A developer can get the code or specs for a design: inspect, copy or export (S32.28, marked not applicable anywhere). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.28)
- Changes made in code flow back into the design (S32.29). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.29)
- The workspace imports from Figma and/or exports to Figma (S32.30). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.30)
- The design workspace ties to project files and share, publish and delete rules. (source: docs/product/requirements.md:1474-1500)
- Do not describe connectors as intrinsic model capabilities; they depend on a provider route or harness. (source: AGENTS.md section 4)

**Acceptance criteria**

1. [proposed] A design can be exported as a Figma-importable file or opened through the Figma connector.
2. [proposed] A Figma frame can be imported as a design.
3. [proposed] A change to exported code can be applied back to the design.
4. Today: source copy and download work on Web (verify).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's not applicable for S32.28 conflicts with the product requirement for design export and with existing source copy; the status needs a decision. [inferred]

**Proposed improvements** (suggestions, not requirements)

- Use the Figma connector's tools to read frames and ask the model to build HTML from them.
- Offer an export bundle with tokens and HTML.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | figma connector entry | `apps/web/features/connectors/data/connectors.ts` | Nearest existing code, does not implement this: catalog card (803-811). |
| config | figma MCP endpoint | `apps/web/lib/connectors/mcp-endpoints.ts` | Nearest existing code, does not implement this: remote server URL and registration (139-144). |
| config | connector catalog | `apps/web/lib/connectors/catalog.ts` | Nearest existing code, does not implement this: oauth2 MCP entry (242). |
| other | platform-prompts | `apps/extension/src/features/content/platform-prompts.ts` | Nearest existing code, does not implement this: help text when the user is on figma.com. |
| component | ArtifactPreview download items | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Nearest existing code, does not implement this: copy and source download (1210, 2388-2394). |
| command | agi artifacts show | `apps/cli/src/lib.rs` | Nearest existing code, does not implement this: writes artifact source to a file (3910-3968). |
| service | saveArtifactToWorkspace | `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | Nearest existing code, does not implement this: writes artifact source into a workspace. |
| other | connectors page release switch | `apps/web/app/connectors/page.tsx` | Nearest existing code, does not implement this: connectorsReleased gating. |
| component | ArtifactEditRequestLayer | `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.tsx` | Nearest existing code, does not implement this: element picking that a code map could build on. |
| other | design-brief | `apps/web/features/chat/components/artifacts/design/design-brief.ts` | Nearest existing code, does not implement this: brief kept inside the HTML. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Copy or download builds a file from the artifact content on the device. | device | ArtifactPreview.tsx:1381-1415 |
| CLI fetches the message that produced the artifact from our servers and writes its block. | device and our servers | cloud/artifacts.rs:400-450; lib.rs:3917-3955 |
| A Figma connector call, if enabled, would go to the remote Figma MCP server; no design flow uses it. | outside service | mcp-endpoints.ts:139-144 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No handoff or sync data exists | none | no | not applicable |

**Models and providers.** Not applicable: no model-driven handoff exists.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Figma connector needs an OAuth connection and sign-in; CLI show needs a signed-in cloud client (lib.rs:3856-3859). |
| Permissions | Connector scopes unknown. |
| Subscription | none found in the code for these paths. |
| Limits and metering | none found in the code. |
| Feature flags | connectorsReleased gates the connectors surface (connectors/page.tsx:5-10); value not read. |
| Model compatibility | not applicable. |
| Provider restrictions | Figma is an outside service route, not a model feature. |
| Local mode | Source copy and download work on the device. The Figma connector and CLI show need our servers or an outside service. No Local-mode handoff exists. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| all handoff states (loading, error, retry) | not handled in the code because the feature does not exist | searched figma in apps and packages; only connector and prompt files found |
| CLI artifact no longer derivable | Error: message behind the artifact no longer produces it. | cloud/artifacts.rs:425-433 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/side-panel-artifacts.test.ts`: Chrome artifact file naming and save of source, not rendered page.
- `apps/extension-vscode/src/__tests__/artifactsView.test.ts`: Artifact index, re-deriving content, missing source reporting.

**Test scenarios**

- **Source copy**
  1. Open an HTML design on Web.
  2. Copy and paste into a file.
  - Expected: Complete HTML source.
- **CLI write**
  1. Run agi artifacts list, then agi artifacts show <id> --out design.html.
  - Expected: File written with the block content.
- **No Figma path**
  1. Search the design menus for Figma import or export.
  - Expected: None present.
- **Connector state**
  1. Open the connector directory and search Figma.
  - Expected: Entry visible or marked coming soon, depending on release state (unknown).

**Where to look when it fails**

- CLI error text 'The message behind artifact ... no longer produces it'.
- Connector connection state in the connectors page.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/032-design-workspace.md](../../70-qa/test-plans/web/032-design-workspace.md)
- CLI: [70-qa/test-plans/cli/032-design-workspace.md](../../70-qa/test-plans/cli/032-design-workspace.md)

## 10. Gaps and dependencies

- **No Figma import or export for designs.** Affects: All apps.. Evidence: no code beyond connector entry. Work needed: Define format, use connector tools, add UI.
- **No code-to-design sync.** Affects: Web, Desktop, Mobile, Chrome.. Evidence: brief S32.29; none found. Work needed: Needs a design model that code edits can map back to.
- **Handoff marked not applicable though source export exists.** Affects: Planning.. Evidence: brief S32.28 versus ArtifactPreview.tsx:2388. Work needed: Decide the status.
- Not built on: Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage
- F032-11
- F032-08

## Unknown

- Whether the Figma connector is released and reachable to users today.
- What the Figma MCP server lets a model do in this product.
- Whether the Tauri desktop has any handoff.
- Whether a provider folder named figma exists (the relationship above is a placeholder; treat as not established).
