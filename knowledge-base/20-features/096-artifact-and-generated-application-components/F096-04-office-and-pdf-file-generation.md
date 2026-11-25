---
id: "F096-04"
type: "feature"
title: "Office and PDF file generation"
aliases: ["Office and PDF file generation", "create_office_file tool", "Managed office file service", "Output menu (Document, Presentation, Spreadsheet)", "Creating a file (voice)", "S96.07 S96.08 S96.09 S96.10"]
area: "96 Artifact and generated-application components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S96.07", "S96.08", "S96.09", "S96.10"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-files-artifacts-and-storage", "SYS-voice-and-media", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F096-04 Office and PDF file generation

A server tool lets the model create real Word, PowerPoint, Excel, PDF or CSV files from structured input, store them and attach them to the answer. It runs in the web chat loop (composer Output menu, or detected request) and in live voice sessions. Bad input returns a readable error to the model, not an empty file.

Area: [96. Artifact and generated-application components](README.md). Requirement items: [S96.07](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9607), [S96.08](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9608), [S96.09](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9609), [S96.10](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9610).

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

**What it does.** Validates a strict request, builds the file with libraries on the server (or edits an attached Word or Excel file), checks the package, stores it as a generated file and returns a file link (apps/web/lib/services/managed-office-file-service.ts:126-209,930-1076; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2562-2606).

**Why it exists.** People ask for a file, not text about a file; models cannot write these binary formats themselves.

**Who uses it.** Signed-in people in web chat (and the phone chat, which sends the same flag) and in live voice.

**Problems it solves**

- A model printing a table instead of producing a spreadsheet
- Formulas that were never calculated (xlsx recalculation step, service line 1011)
- Silent corruption: package verification and optional render check (service lines 949-1000)

**Use cases**

- Choose Output > Presentation and ask for a deck
- Ask in chat 'make a spreadsheet of these numbers with a chart'
- Attach a Word file and ask for guarded text replacements
- Ask by voice for a PDF summary

## 2. User experience

**Where to find it**

- Web composer plus menu row 'Output' with Document, Presentation, Spreadsheet (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:190,958-1000; labels from packages/contracts/cloud-contracts/src/skills.ts:22-26)
- Prompts that match create-plus-file wording switch it on automatically for streaming requests (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:914,994-997)
- Voice: tool 'Creating a file' needs approval (apps/web/lib/voice/live-voice-tools.ts:135-143)
- Mobile sends office_creation and office_format in chat requests (apps/mobile/stores/chat/chatExecutionStore.ts:3436); the phone control that sets it was not located
- Public Desktop shows the hosted web app (doc: AGENTS.md section 5). CLI and Chrome: no generation path found.

**Before you start**

- Signed in (tool refuses without an owner: tool-loop.ts:2567)
- A streaming request and a model that supports tools; otherwise HTTP 422 'Office file creation requires a streaming chat request.' or 'The selected model cannot create Office files. Choose a tool-capable model.' (request-processor.ts:5465-5490)
- Composer disables the row when the model has no tools or for restricted free chat: title 'Office file creation isn't available for this model.' (ChatComposerNew.tsx:1643-1646,6123-6127)
- File storage configured (generated-file-persist.ts:236)

**Screens and controls**

- 'Output' row opens a radio group with Document (docx), Presentation (pptx), Spreadsheet (xlsx); selecting again clears it (ComposerPlusMenu.tsx:990-996)
- Generated file appears as an artifact card with a 'Download generated file' item (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2416)

**Journey**

1. Pick an Output format or write a request
2. The server adds the create_office_file tool with only that format (request-processor.ts:1258-1266)
3. The model calls the tool; the server validates, builds, verifies
4. The file is stored and a link returned; the model answers in one or two sentences naming it (apps/web/lib/chat-output-format.ts:23-28)
5. Person opens or downloads the file

**What the person sees and gets**

- File card and download
- Verification receipt in the tool result (tool-loop.ts:2599)
- On failure the model gets text such as 'The Office file request is invalid. ...' or 'The file could not be created.' (service lines 925-928,1069-1072)

**Settings**

- Output format choice in the composer; model choice. No other setting found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Five formats: docx, pptx, xlsx, pdf, csv, each with a strict schema and size limits (service lines 129-205)
- Existing-file editing for docx (replacements with expected match counts) and xlsx (guarded cell edits) using attached files identified by name and checksum (service lines 66-80,160-186,236-246)
- xlsx formulas are recalculated in an execution environment, else the request fails with a clear message (service line 1011)
- Optional render verification (service line 964)
- Persist step: stores bytes, cap 20 MB, writes catalog and checksum (apps/web/lib/server/generated-file-persist.ts:17,217-300)
- Chat loop integration and forced tool choice when a format is picked (request-processor.ts:6649-6655)
- Voice runner calls the same generator and persists (apps/web/lib/voice/live-voice-tool-runner.ts:151-190)

**Incomplete**

- Generation itself has no byte limit; the 20 MB cap is applied only when persisting, and any failure to persist is one message 'The Office file could not be attached.' (tool-loop.ts:2592; generated-file-persist.ts:247)
- Voice path passes no attachments and no execution environment, so xlsx formulas and render verification fail there [inferred from live-voice-tool-runner.ts:155 and service lines 1011,964]
- Composer Output offers only docx, pptx, xlsx; pdf and csv are model-chosen (skills.ts:20)

**Present but disconnected or switched off**

- The two free-offering completion routes pin office_creation to false in their request schema (packages/contracts/cloud-contracts/src/free-quota.ts:126; apps/web/app/api/models/free-quota/completions/route.ts:30)
- Turn tool prohibition can switch it off per turn (apps/web/app/api/llm/v1/chat/completions/lib/turn-tool-prohibition.ts:90)

**Not available**

- CLI, VS Code, Chrome: no generation path found
- Phone: format picker not located
- A plan limit specific to file creation: none found

## 4. Required behaviour

**Established requirements**

- A server component generates Word documents, spreadsheets, presentations and PDFs on request. (source: brief S96.07, S96.08, S96.09, S96.10)
- A request is checked against a strict schema; invalid requests return a readable error, not a file. (source: apps/web/lib/services/managed-office-file-service.ts:126,939-942)
- Files above the generated-file cap are not stored. (source: apps/web/lib/server/generated-file-persist.ts:17,242-247)
- Generated outputs track source model, checksum, preview renderer, retention. (source: doc: docs/product/requirements.md section 17)
- An action a user cannot undo asks first; voice file creation requires approval. (source: AGENTS.md section 9; apps/web/lib/voice/live-voice-tools.ts:143)

**Acceptance criteria**

1. Output > Presentation then a request returns a .pptx with editable slide text
2. A spreadsheet with a formula cell has computed values or a clear refusal
3. An invalid request (path in file name, empty sheets) returns a named-field error and no file
4. A request over 20 MB equivalent is not stored and the model is told
5. A non-streaming request with office_creation true gets HTTP 422 code office_creation_stream_required
6. A model without tools gets code office_creation_model_unsupported
7. Voice file creation asks for approval and returns a file link
8. Another user cannot open the stored file link

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Generation cost is the chat turn's cost plus server compute; no separate metering was found [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Return a distinct message for too large, not configured and storage error
- [proposed] Give voice an execution environment or tell the model formulas are unavailable
- [proposed] Check size before building large files

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | managed-office-file-service | `apps/web/lib/services/managed-office-file-service.ts` | Schemas, tool definition, generators, result codes |
| service | managed-office-preservation | `apps/web/lib/services/managed-office-preservation.ts` | Package verification, edit existing docx/xlsx, recalculation, render |
| service | managed-workbook-builder | `apps/web/lib/services/managed-workbook-builder.ts` | Builds workbooks with sheets and charts |
| service | tool loop branch | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs the tool and persists the file (lines 2562-2606) |
| service | request-processor office handling | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Request fields, auto-detect, 422 checks, tool injection, forced choice |
| service | generated-file-persist | `apps/web/lib/server/generated-file-persist.ts` | Size cap, storage, catalog, lineage |
| service | live voice tools and runner | `apps/web/lib/voice/live-voice-tool-runner.ts` | Voice execution of the tool (line 151) |
| config | live-voice-tools | `apps/web/lib/voice/live-voice-tools.ts` | Declares 'Creating a file' with approval and long timeout |
| service | chat-output-format | `apps/web/lib/chat-output-format.ts` | Instruction text for the chosen format |
| schema | CHAT_OUTPUT_FORMATS and tool name | `packages/contracts/cloud-contracts/src/skills.ts` | Format list, labels, tool name create_office_file (lines 18-26) |
| component | ComposerPlusMenu OutputRows | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Output menu |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Disables the row for unsuitable models |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Sends office_creation and office_format (line 4641) |
| store | mobile chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Phone request fields (line 3436) |
| schema | FreeOfferingRequestSchema | `packages/contracts/cloud-contracts/src/free-quota.ts` | Pins office_creation false for free-offering routes |
| component | ArtifactPreview generated file download | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Download generated file item (line 2416) |
| other | file link /api/files/<id> | `apps/web/lib/server/generated-file-persist.ts` | File uri is built here as /api/files/<id>; the serving route file was not opened |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks Output or the request text is matched; the client sends office_creation and office_format | device | apps/web/lib/hooks/useChatStream.ts:4641-4642 |
| Server rejects non-streaming or non-tool models, then adds the tool to the request | our servers | request-processor.ts:5465-5494 |
| The selected model decides to call the tool with arguments | outside service | Model provider chosen by routing; tool-loop.ts:2562 receives toolCall |
| Arguments are validated by a strict schema and the file is built in the server process; xlsx formulas and render checks use an execution environment | our servers | managed-office-file-service.ts:939-1066 |
| Bytes are stored and catalogued; a link is returned | our servers | generated-file-persist.ts:236-300 |
| Execution environment for recalculation and rendering | outside service | tool-loop.ts:2571 (e2bExecutor); apps/web/lib/e2b/gate.ts:20 |
| The model replies naming the file; the client shows a card | device and our servers | chat-output-format.ts:23-28 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Generated file bytes, name, mime type, checksum, format and verification metadata | Generated-file storage and a media catalog row (table name not opened) via persistGeneratedFileBytes (generated-file-persist.ts:260-300) | Server-held; clients fetch by link | Retention not examined; account erasure not traced for this store |
| Attached source files for edits | Staged for the turn only (TurnAttachment, service line 20) | No | unknown |

**Models and providers.** The model calling the tool is whatever the router selected; it must report tool support (request-processor.ts:5482). The generator itself uses libraries (docx, jspdf, pptxgenjs) and no model (managed-office-file-service.ts:3-17). The tool is declared non-strict so the OpenAI Responses route does not force every field (test: managed-office-file-service.test.ts:982).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in owner required: 'An authenticated file owner is required.' (tool-loop.ts:2567) |
| Permissions | Voice tool needs approval (live-voice-tools.ts:143); chat approval gate noted in its reason text. Workspace policy: none found here. |
| Subscription | Plan limits for this feature: none found in the code. Free-offering routes cannot enable it (free-quota.ts:126). Composer disables it for restricted free chat (ChatComposerNew.tsx:1643). Whether a plan tier gates the normal route: unknown. |
| Limits and metering | 20 MB stored file cap (generated-file-persist.ts:17); input limits: content 100,000 chars, 40 slides, 20 sheets, 20,000 rows, 200 columns, file name 120 chars (service lines 62-205); no separate metering found |
| Feature flags | office_creation request field; e2b provisioning readiness affects voice rendering tools (live-voice-tools.ts:400-403) |
| Model compatibility | Needs a streaming chat request and a model with tool support, or Auto (ChatComposerNew.tsx:1643-1646). |
| Provider restrictions | none found in the code |
| Local mode | Generation runs on our servers, so it is a Cloud capability. No on-device generator was found for web chat; Local-model chats cannot reach this server tool [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid request | Result ok false code invalid_office_file_request with named field | service lines 939-942, 925-928 |
| Generation failure | code office_file_generation_failed; message from processing error or 'The file could not be created.' | service lines 1066-1073 |
| Too large / not configured / storage error | 'The Office file could not be attached.' | tool-loop.ts:2592 |
| Not streaming | HTTP 422 office_creation_stream_required | request-processor.ts:5465-5470 |
| Unsupported model | HTTP 422 office_creation_model_unsupported | request-processor.ts:5482-5487 |
| Cancel | Abort signal checked before returning docx and xlsx | service lines 975,1023 (throwIfAborted) |
| Formulas without recalculation environment | Refused with message to use values or enable Office execution | service line 1011 |
| Voice failure | Error text returned to the voice session: 'The Office file could not be saved.' | live-voice-tool-runner.ts:169 |
| Accessibility | Output rows are menuitemradio with aria-checked; disabled row has a title | ComposerPlusMenu.tsx:966-996 |
| Retry | not handled in the code beyond the model calling the tool again | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2562-2606 (no retry logic in the branch) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/managed-office-file-service.test.ts`: Tool definition, schema rejects, real docx, pdf, csv, pptx, xlsx with formulas and charts, edit existing files, preservation, refusal cases, error naming, render requirement
- `apps/web/lib/services/managed-office-preservation.test.ts`: Package preservation and verification
- `apps/web/lib/services/managed-workbook-builder.test.ts`: Workbook builder
- `apps/web/lib/services/managed-office-render.integration.test.ts`: Render integration
- `apps/web/app/agent-permissions/__tests__/office-file-claims.test.ts`: Claims about office files in permissions text
- `apps/web/features/chat/lib/office-file-preview.test.ts`: Preview of generated office files

**Test scenarios**

- **Deck from Output menu**
  1. Open the plus menu, choose Output > Presentation
  2. Ask for a 5-slide deck on a topic
  - Expected: A .pptx card appears and opens with the slides as editable text
- **Invalid request**
  1. Force a tool call with file name 'a/b.docx'
  - Expected: Error 'Use a file name only...' and no file
- **Free model**
  1. Use the restricted free chat model
  - Expected: Output row disabled with the title text
- **Non-stream API**
  1. POST chat completions with office_creation true and stream false
  - Expected: 422 office_creation_stream_required
- **Voice file**
  1. In a voice session ask for a PDF
  2. Approve the prompt
  - Expected: A PDF link is returned; a formula spreadsheet fails with the recalculation message

**Where to look when it fails**

- Warn log 'Generated file exceeds persistence cap; skipping' (generated-file-persist.ts:243)
- Error codes invalid_office_file_request, office_file_generation_failed
- HTTP codes office_creation_stream_required, office_creation_model_unsupported

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No plan or quota rule for file creation found; Free routes block it by schema** Affects: Free and paid users on web and phone. Evidence: free-quota.ts:126; no entitlement check in tool-loop.ts:2562-2606. Work needed: Confirm with the entitlement owner and wire a documented rule
- **Voice cannot do formulas, render checks or attached-file edits** Affects: Voice users on web. Evidence: live-voice-tool-runner.ts:155. Work needed: Pass attachments and executor or hide those options
- **Three distinct persist failures share one message** Affects: Debugging and user feedback. Evidence: tool-loop.ts:2592. Work needed: Return reason to the model
- **Brief says voice path only wired; chat loop is the main path** Affects: Docs. Evidence: tool-loop.ts:2562. Work needed: Update brief and per-app status
- **CLI, VS Code and Chrome cannot generate files** Affects: Those apps. Evidence: No path found. Work needed: Decide parity [proposed]
- **Mobile format selector not located** Affects: Phone. Evidence: chatExecutionStore.ts:3436-3437. Work needed: Locate and document

**Depends on**

- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-files-artifacts-and-storage
- SYS-voice-and-media
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- mode:cloud

## Unknown

- Name and retention of the media catalog table for generated files
- Whether plan tiers gate file creation on the normal chat route
- Phone control that sets office_format
- Voice session plan limits (route not read: apps/web/app/api/voice/live/sessions/route.ts)
- Whether e2b recalculation is enabled in production
