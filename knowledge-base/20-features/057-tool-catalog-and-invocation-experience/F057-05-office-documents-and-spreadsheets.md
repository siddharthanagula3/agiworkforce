---
id: "F057-05"
type: "feature"
title: "Office documents and spreadsheets"
aliases: ["Spreadsheet tool", "Document tool", "Presentation tool", "create_office_file", "Office files", "Output format", "S57.07", "S57.08", "S57.09"]
area: "57 Tool catalog and invocation experience"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S57.07", "S57.08", "S57.09"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "F057-02", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "surface:cli", "surface:vscode", "mode:cloud", "file:apps/web/lib/services/managed-office-file-service.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F057-05 Office documents and spreadsheets

The assistant can build a Word document, spreadsheet, presentation, PDF or CSV and attach it to the reply as a downloadable file. The AGI server builds the file. Web, Desktop, Mobile and Chrome show it as a file card. The CLI and VS Code do not have this tool.

Area: [57. Tool catalog and invocation experience](README.md). Requirement items: [S57.07](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5707), [S57.08](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5708), [S57.09](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5709).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the model one tool, create_office_file, with formats docx, pptx, xlsx, pdf and csv. The server writes the file, checks the package, saves it as a generated file and the reply shows it as a card. It can also edit an attached Word or Excel file in place and verify a rendering. (apps/web/lib/services/managed-office-file-service.ts:233-258, :940-1000) (packages/contracts/cloud-contracts/src/skills.ts:18)

**Why it exists.** People want real files they can open, not text pasted into chat.

**Who uses it.** Web, Desktop, Mobile and Chrome users; API callers.

**Problems it solves**

- Copy-pasting text into Office
- Losing formulas and layout
- Editing a workbook without breaking the rest of it

**Use cases**

- Ask for a quarterly budget spreadsheet with a chart.
- Ask for a 6-slide deck outline as a presentation file.
- Ask to replace words in an attached Word document.
- Ask for a CSV export of a table.

## 2. User experience

**Where to find it**

- Web composer: 'Office files' or a format label in the active tools list (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3412-3415).
- Mobile: Settings > Capabilities row 'Code execution and file creation' (documents, sheets, slides and PDFs) (apps/mobile/src/features/settings/capabilities/index.tsx:~150-163).
- Reply card: Web DeliverableCard and artifact cards (apps/web/features/chat/components/messages/DeliverableCard.tsx); Mobile GeneratedFileCard (apps/mobile/src/features/chat/components/GeneratedFileCard.tsx); Chrome answer files (apps/extension/src/features/side-panel/bubbles.ts:729).

**Before you start**

- Streaming chat and a tool-capable model; otherwise the server refuses (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5460-5495).
- Signed in.
- Mobile: Cloud mode, tools-capable model, cloud execution requestable (apps/mobile/stores/chat/chatExecutionStore.ts:3284-3287).

**Screens and controls**

- Output format chosen in the composer (Mobile useOutputFormatStore) and cleared after the turn (chatExecutionStore.ts:3288).
- File card with open or download.
- A render verification option verify_render needs the sandbox (managed-office-file-service.ts:~252).

**Journey**

1. Person picks a format or just asks for a file.
2. The app sends office_creation true and the format.
3. The model calls create_office_file with the content.
4. The server builds and checks the file and saves it.
5. The reply shows a file card; the person opens or downloads it.

**What the person sees and gets**

- File card with name, type, size.
- Failure text such as 'The Office file could not be attached.' or the validation message (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2569-2587).
- Errors 'office_creation_stream_required' and 'office_creation_model_unsupported' (request-processor.ts:5460-5495).

**Settings**

- Output format selection.
- Skill requirements may switch it on (request-processor.ts:993-997).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- create_office_file tool definition with docx, pptx, xlsx, pdf, csv (managed-office-file-service.ts:233-258).
- Server builds docx, pptx, xlsx in the server process with validation limits (slides up to 12 bullets, sheet up to 20,000 rows by 200 columns, document content up to 100,000 characters) (apps/web/lib/services/managed-office-file-service.ts:73-120).
- Edit an attached docx or xlsx by replacements or cell edits with the original package preserved (managed-office-file-service.ts:73-120, :940-1022).
- Saved as a generated file and attached to the reply (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2578-2610).
- Mobile and Chrome and Web render a file card (see map).

**Incomplete**

- Render verification and workbook recalculation need the cloud sandbox; without it they fail with 'Rendering verification requires an available Office execution environment.' (managed-office-file-service.ts:962-966).

**Present but disconnected or switched off**

- Sandbox-dependent parts only (render, recalculate).

**Not available**

- CLI and VS Code: no office tools (brief S57.07-S57.09). The CLI reads Office files but does not create them [inferred from documents.rs being an extractor].

## 4. Required behaviour

**Established requirements**

- A spreadsheet tool creates an xlsx the user can open or download (S57.07). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.07)
- A document tool creates a docx (S57.08). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.08)
- A presentation tool creates a pptx (S57.09). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.09)
- Artifacts follow the Claude-style product direction on all apps (owner memory: product-direction). (source: doc: AGENTS.md section 10 and docs/product/competitive-guidance.md (not read))

**Acceptance criteria**

1. Asking for an xlsx on Web returns a file card that opens a real workbook with a formula starting with '=' working.
2. A non-streaming request with office_creation true is refused with office_creation_stream_required.
3. A model without tools is refused with office_creation_model_unsupported.
4. A docx request with both content and source is refused as invalid.
5. A failed build returns an error that the model reports and no card appears.
6. The CLI offers no create_office_file tool.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A failed build should show a failed card [inferred from tool result isError path].
- Mobile and Chrome use the same tool through the same endpoint [inferred from request field office_creation].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer an office file tool in the CLI and VS Code or mark them not applicable.
- [proposed] Say on the card when render verification was not run.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | managed office file service | `apps/web/lib/services/managed-office-file-service.ts` | Tool definition, schemas, build, edit, verify. |
| config | tool name constant | `packages/contracts/cloud-contracts/src/skills.ts` | MANAGED_OFFICE_FILE_TOOL_NAME create_office_file. |
| service | tool loop office branch | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Executes the tool and saves the file (2562-2610). |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | office_creation fields (780-781), tool attach (1262-1265), checks (5460-5495). |
| service | generated files | `apps/web/lib/e2b/generated-files.ts` | Generated file handling for sandbox outputs [inferred]. |
| service | office render in sandbox | `apps/web/lib/services/managed-office-render.integration.test.ts` | Test of render path (integration). |
| component | web composer | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Office format labels (3412-3415). |
| component | DeliverableCard | `apps/web/features/chat/components/messages/DeliverableCard.tsx` | File card on Web and Desktop. |
| component | ArtifactCard | `apps/web/features/chat/components/artifacts/ArtifactCard.tsx` | Artifact preview of generated files. |
| store | mobile execution store | `apps/mobile/stores/chat/chatExecutionStore.ts` | Sends office_creation and office_format (3284-3290, 3434-3440). |
| component | mobile GeneratedFileCard | `apps/mobile/src/features/chat/components/GeneratedFileCard.tsx` | File card on Mobile. |
| service | mobile generated file artifacts | `apps/mobile/src/features/chat/utils/generatedFileArtifacts.ts` | Maps generated files to artifacts. |
| component | Chrome bubbles | `apps/extension/src/features/side-panel/bubbles.ts` | Answer files for generated files (729). |
| service | Chrome generated files | `apps/extension/src/features/side-panel/generatedFiles.ts` | Builds the file list in answers [inferred from import]. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app sends the turn with office_creation true and optional format and attached source files. | device | apps/mobile/stores/chat/chatExecutionStore.ts:3434-3440 |
| The server checks streaming and tool support, adds the create_office_file tool. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5460-5495 |
| The model calls the tool with content, slides or sheets. | our servers | managed-office-file-service.ts:233-300 |
| The server validates the input, builds the file and checks the package; render verification uses the cloud sandbox only if asked. | our servers | managed-office-file-service.ts:940-1022 |
| The bytes are saved as a generated file for the person and the card is returned. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2578-2610 |
| The app shows the card; opening it downloads the file. | device | apps/mobile/src/features/chat/components/GeneratedFileCard.tsx |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Generated Office file | the person's file library on the server (persistGeneratedFileBytes, origin managed-office-tool) | available across apps through the library [inferred] | unknown |
| File metadata incl. format and verification | file record extra metadata | server | unknown |

**Models and providers.** Any tool-capable model can call the tool; the file builder is AGI's own code, not a model provider. Render verification uses the outside sandbox provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account. |
| Permissions | An authenticated file owner is required ('An authenticated file owner is required.') (tool-loop.ts:2565-2567). |
| Subscription | Gated by chat_tools capability and cloud execution requestable on Mobile (apps/mobile/stores/chat/chatExecutionStore.ts:3274-3287). Plan list for chat_tools is CLOUD_CHAT_TIERS (packages/contracts/types/src/billing-catalog.ts:344-347, names not expanded here). |
| Limits and metering | File name up to 120 characters, document content 100,000 characters, slides bullets 12 each, sheet rows 20,000 (service schemas); generated file size cap constant MAX_GENERATED_FILE_BYTES (value not read). |
| Feature flags | None found for the build; render needs sandbox flags. |
| Model compatibility | Must be tool-capable (request-processor.ts:5483-5495). |
| Provider restrictions | none found in the code. |
| Local mode | Not available: Mobile row says Cloud only; CLI has no tool. Desktop on-device models: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Non-streaming | 422 office_creation_stream_required. | request-processor.ts:5461-5476 |
| Unsupported model | 422 office_creation_model_unsupported. | request-processor.ts:5477-5495 |
| Invalid input | Message describing the invalid field goes to the model. | managed-office-file-service.ts:940-942 |
| Cannot attach | 'The Office file could not be attached.' | tool-loop.ts:2587-2589 |
| Render unavailable | Explicit failure message. | managed-office-file-service.ts:962-966 |
| Offline or retry | not handled in the code read (unknown). | unknown |
| Cancel | Signal checked with throwIfAborted after build. | managed-office-file-service.ts:998 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/managed-office-file-service.test.ts`: Tool inputs and build.
- `apps/web/lib/services/managed-office-preservation.test.ts`: Editing preserves untouched parts.
- `apps/web/lib/services/managed-office-render.integration.test.ts`: Render verification.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.office-file.test.ts`: Tool loop path.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.office-file.test.ts`: Request checks.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.workbook.test.tsx`: Workbook preview.

**Test scenarios**

- **Spreadsheet**
  1. On Web ask for a budget spreadsheet with a total formula.
  2. Open the card.
  - Expected: A real xlsx with a working formula.
- **Deck**
  1. Ask for a 5 slide deck.
  - Expected: A pptx with 5 slides.
- **Edit attached docx**
  1. Attach a Word file; ask to change a name.
  - Expected: A new docx with only that text changed.
- **No tools model**
  1. Pick a model without tools and request a file.
  - Expected: A clear refusal.
- **CLI**
  1. Ask the CLI for a pptx.
  - Expected: No create tool; the model says it cannot.

**Where to look when it fails**

- Error codes invalid_office_file_request and office_file_generation_failed (managed-office-file-service.ts:~225).
- 422 responses with code office_creation_*.
- Tool result isError with the message.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md)
- Desktop: [70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md)
- Mobile: [70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md)
- Chrome: [70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md)

## 10. Gaps and dependencies

- **CLI and VS Code cannot create Office files.** Affects: CLI, VS Code. Evidence: brief S57.07-S57.09. Work needed: Decide: add a tool or mark not applicable.
- **Draft said only xlsx, docx, pptx; the tool also makes pdf and csv.** Affects: Documentation. Evidence: managed-office-file-service.ts:240. Work needed: Update brief.
- **Render check and recalculation need the sandbox, which is off.** Affects: Web, Desktop, Mobile, Chrome. Evidence: managed-office-file-service.ts:962. Work needed: Enable the sandbox (see F057-02).
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- F057-02
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- surface:cli
- surface:vscode
- mode:cloud
- file:apps/web/lib/services/managed-office-file-service.ts

## Unknown

- MAX_GENERATED_FILE_BYTES value.
- Retention of generated files.
- Which plan names unlock chat_tools.
- How Desktop shows the card beyond the shared web UI.
- Whether Chrome offers an office format control.
