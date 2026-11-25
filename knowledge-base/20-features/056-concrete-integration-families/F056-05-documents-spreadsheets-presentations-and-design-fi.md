---
id: "F056-05"
type: "feature"
title: "Documents, spreadsheets, presentations and design files"
aliases: ["Documents, spreadsheets, presentations and design files", "Design-to-code", "Canva connector", "Figma connector", "Office file tools", "S56.18, S56.19, S56.20, S56.34, S56.35"]
area: "56 Concrete integration families"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S56.18", "S56.19", "S56.20", "S56.34", "S56.35"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "F056-04", "mode:cloud", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "table:connector_oauth_grants"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F056-05 Documents, spreadsheets, presentations and design files

Covers editing documents, sheets and decks in a connected account and inspecting design files. The code has no Google Docs, Sheets or Slides editing connector. Canva (read and edit design) is released; Figma (design context, metadata) is not. The brief's 'done' marks are not supported by the code.

Area: [56. Concrete integration families](README.md). Requirement items: [S56.18](../../10-requirements/capabilities/056-concrete-integration-families.md#s5618), [S56.19](../../10-requirements/capabilities/056-concrete-integration-families.md#s5619), [S56.20](../../10-requirements/capabilities/056-concrete-integration-families.md#s5620), [S56.34](../../10-requirements/capabilities/056-concrete-integration-families.md#s5634), [S56.35](../../10-requirements/capabilities/056-concrete-integration-families.md#s5635).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Canva offers read_design and edit_design; Figma offers get_design_context, get_screenshot, get_metadata, search_design_system and create/generate tools; Notion pages are covered in F056-06. OneDrive and SharePoint read Office files. Separately, the chat can create Office files itself with create_office_file. [code] (apps/web/lib/connectors/directory/sources/first-party.json; apps/web/lib/connectors/catalog.ts:187-188; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:239)

**Why it exists.** Leaders let the assistant work in documents and design tools. [doc: knowledge-base/data/area-briefs/056-concrete-integration-families.md]

**Who uses it.** Paid-plan users with design or document accounts.

**Problems it solves**

- Changing a design from chat
- Reading a design to produce code
- Reading Word, Excel and PowerPoint files from OneDrive

**Use cases**

- Inspect this Figma frame and give me code references
- Edit a Canva design title
- Read the deck on OneDrive and summarise

## 2. User experience

**Where to find it**

- Web: Settings 'Connectors' and the connector directory; Canva is selectable now, Figma shows 'Coming soon'. [code] (connector-release.ts:16-30; apps/web/features/connectors/lib/connector-release-lock.ts:19-24)
- Desktop: hosted web app. [doc: AGENTS.md section 5]
- Mobile: Settings 'Connectors'; chat shows tool steps in the activity timeline. [code] (apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx; apps/mobile/src/features/settings/cloud-connectors/index.tsx:156)
- CLI, VS Code: account connectors only. [code] (apps/cli/src/claude_parity.rs:2772)
- Chrome: 'Connectors' attach menu. [code] (side_panel.ts:14811)

**Before you start**

- Signed in, paid plan, Cloud mode.
- Canva released; Figma, google-sheets, onedrive, sharepoint are not. [code] (connector-release.ts:16-30)
- Figma needs a pre-registered app and descriptor. [doc: docs/development/connectors-setup.md]

**Screens and controls**

- Connect, step rows in the timeline, approval prompts.
- Ordinary account chat only: released connectors work in ordinary chat and Settings, not in agent, voice, schedule or artifact paths. [doc: docs/runbooks/connector-oauth-apps.md]

**Journey**

1. Connect Canva.
2. Name the design in chat and ask for the change.
3. Assistant calls edit_design; an approval prompt appears (undeclared tool).
4. Review the change in the activity timeline under the reply.

**What the person sees and gets**

- Step sentences and tool output in the timeline.

**Settings**

- Approval policy and per-tool permissions.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Canva and Figma entries exist in the directory with tool names; the ceilings admit Canva design read and write scopes and Figma read and dev-resource scopes. [code] (first-party.json; connector-scopes.ts:184-199)
- Canva is in the released list, so it can be connected and used in ordinary account chat once its credentials exist. [code] (connector-release.ts:18)
- OneDrive and SharePoint Graph adapters read Word, Excel and PowerPoint. [doc: docs/development/connectors-setup.md]
- create_office_file lets the chat create a new Office file in the conversation; this is not editing a connected account's file. [code] (tool-metadata.ts:239)

**Incomplete**

- No Google Docs, Google Sheets or Google Slides tool exists; google-sheets has a catalog record and ceiling but no directory entry or documented descriptor, and no Docs or Slides record exists. [code] (catalog.ts:174; connector-scopes.ts:54-57; first-party.json)
- Microsoft 365 MCP scopes are read-only organization data. [code] (connector-scopes.ts:76-83)
- Canva and Figma tools have no declared metadata, so all calls ask. [code] (tool-metadata.ts:863-883)

**Present but disconnected or switched off**

- figma, google-sheets, onedrive, sharepoint, microsoft-365 not released. [code] (connector-release.ts:16-30)
- Figma needs a pre-registered client. [code] (mcp-endpoints.ts:96-100)

**Not available**

- Brief says web, desktop, mobile and Chrome 'done' for document, spreadsheet and presentation editing; the code shows no such connector tools. [inferred]
- Local and own-key modes; free plan. [code] (claude_parity.rs:2775-2779)

## 4. Required behaviour

**Established requirements**

- The assistant can edit a word-processing document in a connected account. (source: S56.18)
- The assistant can read and edit a spreadsheet. (source: S56.19)
- The assistant can edit a presentation. (source: S56.20)
- The assistant can inspect a design file (frames, components, metadata). (source: S56.34)
- The assistant can pull design-to-code references (code context, dev resources). (source: S56.35)
- Edits are shown as tool steps in the chat timeline. (source: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx (brief S56.18))

**Acceptance criteria**

1. A released Canva connection can read and edit a named design, and the step shows in the timeline.
2. Figma design context returns frames and code references and changes nothing.
3. Edit prompts show the intended change before it applies.
4. A document, spreadsheet or deck edit test exists for each supported product.
5. On unreleased connectors the UI says 'Coming soon' and nothing runs.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Document, spreadsheet and slide editing needs new tools. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide which Docs, Sheets and Slides route to build (Drive MCP tools or direct API) and add scopes to the ceiling only by owner decision.
- [proposed] Mark Figma tools as reads in metadata.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | Directory entries | `apps/web/lib/connectors/directory/sources/first-party.json` | Figma and Canva servers and tool names. |
| config | Scope ceiling | `packages/contracts/cloud-contracts/src/connector-scopes.ts` | Figma, Canva, Sheets, Microsoft 365 scopes. |
| config | Release gate | `packages/contracts/types/src/connector-release.ts` | Canva released; Figma not. |
| config | Catalog | `apps/web/lib/connectors/catalog.ts` | Connector records. |
| config | MCP endpoints | `apps/web/lib/connectors/mcp-endpoints.ts` | Canva (metadata client) and Figma (pre-registered) servers. |
| service | Graph adapter | `apps/web/lib/connectors/microsoft-graph.ts` | OneDrive and SharePoint read_file. |
| service | Tool catalog builder | `apps/web/lib/user-connector-tools.ts` | Builds remote tool defs for connected grants. |
| config | Tool metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | No Figma or Canva entries; create_office_file declared. |
| component | Web tool timeline | `apps/web/features/chat/components/messages/ToolTimeline.tsx` | Shows each connector step. |
| component | Mobile activity timeline | `apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx` | Shows steps and approval controls on mobile. |
| component | Step sentences | `packages/ui/unified-chat/src/components/connector-step-sentence.ts` | Plain sentence per step. |
| component | Release lock | `apps/web/features/connectors/lib/connector-release-lock.ts` | Marks unreleased directory entries 'coming-soon'. |
| screen | Mobile Connectors | `apps/mobile/src/features/settings/cloud-connectors/index.tsx` | Mobile list. |
| component | Chrome menu | `apps/extension/src/side_panel.ts` | Connectors item. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person names the design or document in chat; turn goes to our servers. | device | route.ts:792-800 |
| Server checks release and plan; Canva tools are built from the vendor server's runtime tool list. | our servers | catalog.ts:Canva record; user-connector-tools.ts:2536-2565 |
| Gate asks; person approves. | device and our servers | tool-metadata.ts:876-883 |
| Our server calls the vendor's MCP server (Canva, Figma) with the token. | outside service | mcp-endpoints.ts |
| Result and step reach the person in the timeline. | device | ToolTimeline.tsx |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Grant for Canva or Figma | table:connector_oauth_grants | Account-wide | Deleted on disconnect |
| Design content seen in chat | Chat transcript | Chat sync | As chat history |

**Models and providers.** Tool-capable model; design content goes to the model provider; no special provider rule found for Canva or Figma: none found in the code.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account. |
| Permissions | Canva design and asset scopes; Figma file, project, comment and dev-resource scopes. [code] (connector-scopes.ts:184-199) |
| Subscription | Paid plans. [code] (billing-catalog.ts:332-351) |
| Limits and metering | none found in the code. |
| Feature flags | Release state; kill switch; workspace policy; per-chat switch. |
| Model compatibility | Tool support required. |
| Provider restrictions | none found in the code for these connectors. |
| Local mode | Not offered in Local or own-key sessions. [code] (claude_parity.rs:2775-2779) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Figma not released | Directory card shows coming-soon; execution refused. | connector-release-lock.ts:19-24 |
| Declined edit | Step shows declined. | connector-step-sentence.ts:100-107 |
| Authorization expired | Reconnect card. | connect-required.ts:23-79 |
| Timeout, offline, retry | not handled in the code beyond an error result. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/__tests__/connector-selective-release.test.ts`: Selective release for ordinary chat.
- `apps/web/lib/connectors/__tests__/catalog-endpoints.test.ts`: Catalog and endpoint agreement.
- `apps/web/lib/__tests__/catalog-scopes.test.ts`: Catalog scopes.
- `packages/ui/unified-chat/src/components/__tests__/connector-step-sentence.test.ts`: Step sentences.

**Test scenarios**

- **Canva read and edit**
  1. Connect Canva on a paid account.
  2. Ask to read then rename a design.
  - Expected: Read shows; edit asks first; design changes.
- **Figma context**
  1. After release and setup, connect Figma and ask for code references for a frame.
  - Expected: Context returned; nothing changed.
- **Docs edit request**
  1. Ask to edit a Google Doc.
  - Expected: Records result; code predicts no such tool.
- **Unreleased display**
  1. Open the web directory and find Figma.
  - Expected: Shown as coming soon.

**Where to look when it fails**

- connector_call_events
- 'Connectors are coming soon.' tool text
- Step failure sentences in the timeline.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/056-concrete-integration-families.md](../../70-qa/test-plans/web/056-concrete-integration-families.md)
- Desktop: [70-qa/test-plans/desktop/056-concrete-integration-families.md](../../70-qa/test-plans/desktop/056-concrete-integration-families.md)
- Mobile: [70-qa/test-plans/mobile/056-concrete-integration-families.md](../../70-qa/test-plans/mobile/056-concrete-integration-families.md)
- CLI: [70-qa/test-plans/cli/056-concrete-integration-families.md](../../70-qa/test-plans/cli/056-concrete-integration-families.md)
- VS Code: [70-qa/test-plans/vscode/056-concrete-integration-families.md](../../70-qa/test-plans/vscode/056-concrete-integration-families.md)
- Chrome: [70-qa/test-plans/chrome/056-concrete-integration-families.md](../../70-qa/test-plans/chrome/056-concrete-integration-families.md)

## 10. Gaps and dependencies

- **No Google Docs, Sheets or Slides editing connector exists, and no Word editing beyond file read.** Affects: All apps. Evidence: catalog.ts:174; first-party.json. Work needed: Decide and build.
- **Figma not released and not set up.** Affects: All apps. Evidence: connector-release.ts:16-30; mcp-endpoints.ts:96-100. Work needed: Owner setup and release.
- **Design tools ask for approval because no metadata is declared.** Affects: All apps. Evidence: tool-metadata.ts:863-883. Work needed: Declare reads.
- **Brief 'done' for web, desktop, mobile, Chrome is not supported.** Affects: Brief accuracy. Evidence: first-party.json; catalog.ts. Work needed: Re-audit and correct.
- **CLI and VS Code design-to-code 'done' unverified.** Affects: CLI, VS Code. Evidence: claude_parity.rs:2772. Work needed: Verify.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- F056-04
- mode:cloud
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- table:connector_oauth_grants

## Unknown

- Real tool lists Canva and Figma return at run time.
- Whether Canva credentials exist in production.
- Whether create_office_file counts for this feature.
- Why the brief marked document editing done; no code found.
- CLI and VS Code design-to-code behaviour.
