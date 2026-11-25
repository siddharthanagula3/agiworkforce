---
id: "F052-06"
type: "feature"
title: "Knowledge: reference files and connected sources"
aliases: ["Knowledge", "Reference files", "Add files", "Agent files", "user_agent_files", "Connected sources", "Source refresh", "S52.13", "S52.14", "S52.15"]
area: "52 Custom-assistant builder"
available_on: ["web", "mobile"]
implementation: {web: "partial", desktop: "missing", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S52.13", "S52.14", "S52.15"]
depends_on: ["surface:web", "surface:mobile", "mode:cloud", "mode:local", "table:user_agent_files", "table:user_agents", "api:POST /api/custom-agents/[id]/files", "api:GET /api/custom-agents/[id]/files", "api:DELETE /api/custom-agents/[id]/files/[fileId]", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-chat-turn-pipeline", "SYS-connectors-plugins-and-skills", "F052-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F052-06 Knowledge: reference files and connected sources

Reference files an assistant reads in every chat. On web and mobile a person adds up to 20 files per agent; text is extracted and stored in the database, then added to the system prompt up to 120,000 characters per turn. Connected live sources and refresh rules do not exist.

Area: [52. Custom-assistant builder](README.md). Requirement items: [S52.13](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5213), [S52.14](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5214), [S52.15](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5215).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets the owner attach files (text, Markdown, CSV, JSON, code, PDF, Word, Excel, PowerPoint) to an assistant so every chat with it can read their contents. The server turns each file into text and keeps only the text.

**Why it exists.** S52.13 reference-file upload; S52.14 connected reference sources; S52.15 source-refresh behaviour (doc: knowledge-base/data/area-briefs/052-custom-assistant-builder.md).

**Who uses it.** Builders who want an assistant grounded in their own documents.

**Problems it solves**

- Pasting the same handbook into each chat.
- Keeping answers tied to a fixed set of documents.

**Use cases**

- Attach a policy PDF to a support assistant.
- Attach a CSV of product codes to a sales assistant.
- A teammate chats with the shared agent and it reads the attached files.

## 2. User experience

**Where to find it**

- Web: agent editor, 'Agent' tab, panel titled 'Knowledge' with button 'Add files' (apps/web/features/agents/components/AgentKnowledgePanel.tsx:105-135).
- Mobile: agent editor manage sections include files; upload uses multipart (apps/mobile/src/features/agents/service.ts, uploadAgentFile; label text of the mobile file section not read).
- CLI, Tauri desktop, VS Code, Chrome: none found.
- Connected sources and refresh: none found on any app.

**Before you start**

- A saved agent the person owns; a signed-in account; Cloud mode on mobile.

**Screens and controls**

- Web panel text: 'Files the agent reads in every chat, up to 20. Text, PDF, Word, Excel and PowerPoint files are stored as their text.' (AgentKnowledgePanel.tsx:108-111).
- Web 'Add files' button, disabled while uploading, before the list has loaded, or when 20 files exist (AgentKnowledgePanel.tsx:125-135).
- Each file row shows the name and size 'of text' and a 'Remove' button (AgentKnowledgePanel.tsx:157-176).
- Remove opens a confirm dialog 'Remove <name>?' with the consequence text and button 'Remove file' (AgentKnowledgePanel.tsx:78-93).
- Accepted types attribute: .txt .md .markdown .csv .tsv .json .jsonl .yaml .yml .xml .html .pdf .docx .xlsx .pptx and text/* (AgentKnowledgePanel.tsx:11-12).

**Journey**

1. Save the agent first (the panel appears only on a saved agent).
2. Press 'Add files' and choose one or more files.
3. Each file uploads in turn and appears in the list sorted by name.
4. Chat with the agent; the next turn carries the file text.
5. To remove, press 'Remove' and confirm.

**What the person sees and gets**

- Loading: 'Loading files…' spinner (AgentKnowledgePanel.tsx:148-152).
- Empty: 'No files yet.'
- Upload failure: toast 'The file could not be added.' or the server message (AgentKnowledgePanel.tsx:71).
- Server messages: 'An agent holds up to 20 files.', 'The agent already has a file named <name>.', '<name> has more text than an agent file holds (512 KB).', '<name> could not be read.', 'Add a text, Markdown, CSV, JSON, code, PDF, Word, Excel or PowerPoint file.' (custom-agent-service.ts addAgentFile, starts line 767; agent-file-text.ts:58-90).

**Settings**

- none found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Upload route POST /api/custom-agents/[id]/files: owner only, scans the upload, extracts text, saves (apps/web/app/api/custom-agents/[id]/files/route.ts:40-66).
- List and delete routes (files/route.ts:28-38; files/[fileId]/route.ts:17-25).
- 20-file cap, duplicate-name conflict, SHA-256 hash and byte size stored (custom-agent-service.ts, addAgentFile starts line 767).
- Size limit enforced on the extracted text: more than 512,000 bytes is refused (apps/web/lib/agents/agent-file-text.ts:80-89).
- Per-turn context budget of 120,000 characters across files; extra text is dropped silently (apps/web/lib/agents/agent-turn-config.ts:15, 43-55).
- Reference files added to the system prompt wrapped in agent_file tags with a note to treat them as material, not instructions (agent-turn-config.ts:120-131).
- Mobile upload and delete calls to the same endpoints (apps/mobile/src/features/agents/service.ts, uploadAgentFile and deleteAgentFile).

**Incomplete**

- Text beyond the 120,000-character budget is cut without telling the person (agent-turn-config.ts:43-55).
- No retrieval or search: all file text is placed in the prompt each turn [inferred from boundedFiles and agentSystemPrompt].
- Mobile file section labels were not read, so the visible text is unknown.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Connected sources (drives, sites, repos) and source-refresh rules: no route, table or UI found on any app.
- File upload on CLI, Tauri desktop, VS Code and Chrome: none found.
- Image files: not accepted; the server rejects unsupported types (agent-file-text.ts:58).

## 4. Required behaviour

**Established requirements**

- A user can upload reference files that the assistant can read in every conversation. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S52.13)
- An assistant can be connected to live reference sources it searches. (source: S52.14 (doc: same brief))
- The builder sets how and when connected sources refresh. (source: S52.15 (doc: same brief))
- Up to 20 files per assistant; file text limit 512000 bytes. (source: packages/contracts/cloud-contracts/src/agents.ts:25-26; apps/web/lib/agents/agent-file-text.ts:83)
- Removing a file asks first and names the consequence. (source: AgentKnowledgePanel.tsx:78-93 and doc: AGENTS.md section 9)

**Acceptance criteria**

1. Uploading a small Markdown file returns 201 and the file appears in the list.
2. Uploading a 21st file is refused with 'An agent holds up to 20 files.'
3. Uploading a second file with the same name is refused with a conflict message.
4. A file whose extracted text exceeds 512,000 bytes is refused.
5. An unsupported file type is refused with the supported-types message.
6. Removing a file asks first and, once confirmed, later chats no longer carry it.
7. A teammate who runs the shared agent can read the file content through the agent but cannot add or remove files.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Files should be covered by the same upload safety scan as other uploads [inferred from refuseUnsafeUpload in files/route.ts:58].
- Large file sets should warn about the 120,000-character per-turn budget [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Tell the person when file text was cut for a turn.
- [proposed] Add connected sources with a refresh schedule through connectors and the sync system.
- [proposed] Allow images and scanned documents through the existing attachment extractors.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AgentKnowledgePanel | `apps/web/features/agents/components/AgentKnowledgePanel.tsx` | Web Knowledge panel. |
| endpoint | GET/POST /api/custom-agents/[id]/files | `apps/web/app/api/custom-agents/[id]/files/route.ts` | List and upload. |
| endpoint | DELETE /api/custom-agents/[id]/files/[fileId] | `apps/web/app/api/custom-agents/[id]/files/[fileId]/route.ts` | Remove a file. |
| service | agentFileText | `apps/web/lib/agents/agent-file-text.ts` | Extract text and enforce 512000 bytes (limit at line 83). |
| service | addAgentFile / deleteAgentFile / listAgentFiles / readAgentFileTexts | `apps/web/lib/services/custom-agent-service.ts` | File rows (listAgentFiles line 755, addAgentFile 767, deleteAgentFile 800, readAgentFileTexts 814). |
| service | loadAgentTurnConfig and boundedFiles | `apps/web/lib/agents/agent-turn-config.ts` | Loads files and applies the 120000 character budget. |
| service | refuseUnsafeUpload | `apps/web/lib/security/upload-scan.ts` | Upload safety scan called by the files route. |
| table | user_agent_files | `apps/web/db/neon/0370_user_agents.sql` | Stores name, mime, text content, hash, size; unique per agent and name (lines 117-134). |
| schema | AgentFileSchema and limits | `packages/contracts/cloud-contracts/src/agents.ts` | Lines 25-26, 227-237. |
| service | mobile uploadAgentFile | `apps/mobile/src/features/agents/service.ts` | Multipart upload and delete. |
| service | agentsApi.addFile | `apps/web/features/agents/services/agents-client.ts` | Web upload client. |
| test | files route tests | `apps/web/app/api/custom-agents/[id]/files/route.test.ts` | List, upload, refusal, missing file. |
| service | user data export | `apps/web/app/api/user/export/route.ts` | Mentions user_agents data in exports (grep match; detail not read). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person picks files; the browser sends them one by one as multipart form data with the bearer token and CSRF header. | device and our servers | AgentKnowledgePanel.tsx:60-76; agents-client.ts:61-71 |
| The route checks CSRF, rate limit and ownership, reads the file, and runs the upload safety scan. | our servers | files/route.ts:40-58 |
| Text is extracted: Office and PDF through server extractors; text and code files decoded as UTF-8; a null-byte strip and a 512,000-byte check follow. | our servers | agent-file-text.ts:80-125 |
| The row is inserted with a SHA-256 hash and byte size; the original file is not kept. | our servers | custom-agent-service.ts addAgentFile (starts line 767); panel text 'stored as their text' (AgentKnowledgePanel.tsx:109-110) |
| On each chat turn, file texts are read in name order and cut to 120,000 characters, then placed in the system prompt. | our servers | agent-turn-config.ts:43-55, 101-105, 120-131 |
| The prompt goes to the chat's model and provider. | outside service | SYS-chat-turn-pipeline; not read in detail |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Extracted file text, name, mime type, hash, size | table user_agent_files in the Neon database | Server-side; all Cloud apps see the list. | Deleted on file remove; deletion with the agent is claimed by the UI delete text (AgentManagePanel.tsx:239-241 says its files are deleted). |
| Original uploaded bytes | not kept by the code read | n/a | n/a |

**Models and providers.** File text is sent to whichever model and provider the chat uses, so a person's documents reach that provider. Local and own-key trust boundaries for agent chats: not read.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account on web and mobile; none for CLI because it has no files feature. |
| Permissions | Only the owner can add or remove files (requireOwnedAgent in files route and service). Any reader of the agent can list names (files/route.ts:28-38). Retired agents refuse file changes (assertEditable in addAgentFile). |
| Subscription | none found in the code. |
| Limits and metering | 20 files, 512,000 bytes of text per file, 200-character file name, 120,000 characters per turn; rate limit chat-conversation 60 per minute on routes via openAgentRead and openAgentWrite (agent-route.ts:32-46). |
| Feature flags | none found. |
| Model compatibility | File text is plain text in the prompt, so any model with enough context works; behaviour for small-context models is not handled beyond the fixed character budget [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local mode is gated and cannot add files. No local file feature exists on CLI or Tauri desktop. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading files…' and Add files disabled. | AgentKnowledgePanel.tsx:129, 148-152 |
| Empty | 'No files yet.' | AgentKnowledgePanel.tsx:153-154 |
| Load error and retry | Alert plus 'Try again'. | AgentKnowledgePanel.tsx:139-147 |
| Superseded load | An older response is ignored. | AgentKnowledgePanel.tsx:36-51; test title 'ignores a list response from a load that was superseded' |
| Upload error | Toast with the server message; remaining files in a multi-select are skipped after the first failure because the loop throws. | AgentKnowledgePanel.tsx:64-72 |
| Full | Add files disabled at 20. | AgentKnowledgePanel.tsx:95, 129 |
| Unsafe or unreadable file | Refused by the scan or 'could not be read'. | files/route.ts:58; agent-file-text.ts:103-110 |
| Payload too large | PayloadCeilingExceededError passes through. | files/route.ts:49-51 |
| Read-only viewer | No Add or Remove controls. | AgentKnowledgePanel.tsx:113, 165 |
| Offline | not handled in the code beyond the error toast on upload and the error with retry on list. | AgentKnowledgePanel.tsx:70-72, 139-147 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/agents/__tests__/AgentKnowledgePanel.test.tsx`: Add files unavailable until loaded; uploaded file shown; superseded list ignored.
- `apps/web/app/api/custom-agents/[id]/files/route.test.ts`: List uncached, upload scan and save, scan refusal, missing file, refused write.
- `apps/web/app/api/custom-agents/[id]/files/[fileId]/route.test.ts`: File delete route.
- `apps/web/lib/agents/__tests__/agent-turn-config.test.ts`: Reference files stay inside the context budget.
- `apps/mobile/src/features/agents/__tests__/service.test.ts`: Knowledge file uploaded as multipart without a forced JSON content type.
- `apps/mobile/src/features/agents/__tests__/AgentsScreens.test.tsx`: Says when files could not be read and retries.

**Test scenarios**

- **Upload and use**
  1. Upload a Markdown file with a made-up fact to an agent.
  2. Start a chat with the agent.
  3. Ask about the fact.
  - Expected: Agent answers from the file.
- **Limits**
  1. Upload 20 files then a 21st; upload a duplicate name.
  - Expected: Refusals with the stated messages.
- **Large text**
  1. Upload a text file over 512,000 bytes.
  - Expected: Refused with the size message.
- **Remove**
  1. Press Remove and confirm.
  - Expected: File disappears; the next chat does not know the fact.
- **Teammate**
  1. Publish and share the agent; sign in as a teammate.
  - Expected: Chat uses the files; no Add files button.
- **Absent sources**
  1. Look for connected sources or refresh settings.
  - Expected: None present (current state).

**Where to look when it fails**

- Server message text from createError.validation in agent-file-text.ts and custom-agent-service.ts.
- PG unique violation code 23505 mapped to a conflict (custom-agent-service.ts:28).
- Table user_agent_files; count by agent_id.

**Hands-on test plans**

- none: not built on any app
- No hands-on plan yet for Web, Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No connected sources or refresh behaviour.** Affects: All apps.. Evidence: S52.14 and S52.15 missing; no route, table or UI found.. Work needed: Design source types, auth through connectors, refresh schedule and storage.
- **Brief marks file upload missing though web and mobile have it.** Affects: Planning.. Evidence: S52.13 status line versus files route and panel.. Work needed: Correct the brief.
- **Silent truncation at 120,000 characters per turn.** Affects: Agents with many or large files.. Evidence: agent-turn-config.ts:43-55. Work needed: Tell the builder and chatter, or use retrieval.
- **No file upload on CLI, desktop, VS Code, Chrome.** Affects: Those surfaces.. Evidence: No code found.. Work needed: Product decision.
- **A multi-file upload stops at the first failure.** Affects: Web users adding several files.. Evidence: AgentKnowledgePanel.tsx:64-72. Work needed: Continue past failures and report each.
- Not built on: Desktop, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- mode:cloud
- mode:local
- table:user_agent_files
- table:user_agents
- api:POST /api/custom-agents/[id]/files
- api:GET /api/custom-agents/[id]/files
- api:DELETE /api/custom-agents/[id]/files/[fileId]
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-chat-turn-pipeline
- SYS-connectors-plugins-and-skills
- F052-05

## Unknown

- Whether mobile shows a visible file section label and how.
- Whether deleting an agent cascades to user_agent_files in SQL (the delete dialog text says files are deleted; the cascade clause was not read).
- How agent chats behave under Local or own-key trust boundaries on web (not read).
- Original-file retention: code read keeps only text.
- Whether any retention schedule applies to file text beyond RETENTION_MATRIX.md (grep matched, not read).
