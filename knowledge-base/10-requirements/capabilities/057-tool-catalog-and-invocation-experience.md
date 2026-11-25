---
id: "REQ-AREA-057"
type: "requirements"
title: "Requirement items: Tool catalog and invocation experience"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 57. Tool catalog and invocation experience

38 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S57.01

**Search tool.** The assistant can call a web-search tool during a turn and the searches and their sources are shown to the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F057-01 Web search and page reading](../../20-features/057-tool-catalog-and-invocation-experience/F057-01-web-search-and-page-reading.md)

## S57.02

**Fetch-page tool.** The assistant can call a tool that fetches a given web page and reads its content, with the fetch shown in the transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F057-01 Web search and page reading](../../20-features/057-tool-catalog-and-invocation-experience/F057-01-web-search-and-page-reading.md)

## S57.03

**Source-reader tool.** The assistant can call a tool that opens a cited source or document (PDF, Office file or page) by reference and reads its text.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome partial
- Feature: [F057-01 Web search and page reading](../../20-features/057-tool-catalog-and-invocation-experience/F057-01-web-search-and-page-reading.md)

## S57.04

**File-search tool.** The assistant can call a tool that searches the user's files (by name or content) and returns matching paths or snippets.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F057-02 Your files: find, read, write and edit](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md)

## S57.05

**File-read tool.** The assistant can call a tool that reads the contents of a file it names (in a sandbox or on the user's machine).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile partial, CLI done, VS Code done, Chrome partial
- Feature: [F057-02 Your files: find, read, write and edit](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md)
- Competitor trace: CAP-tools-and-code-execution-01

## S57.06

**File-write tool.** The assistant can call a tool that creates or overwrites a file it names (in a sandbox or on the user's machine).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile partial, CLI done, VS Code done, Chrome partial
- Feature: [F057-02 Your files: find, read, write and edit](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md)

## S57.07

**Spreadsheet tool.** The assistant can call a tool that creates a spreadsheet file (xlsx) the user can open or download.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F057-05 Office documents and spreadsheets](../../20-features/057-tool-catalog-and-invocation-experience/F057-05-office-documents-and-spreadsheets.md)
- Competitor trace: CAP-tools-and-code-execution-06

## S57.08

**Document tool.** The assistant can call a tool that creates a document file (docx) the user can open or download.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F057-05 Office documents and spreadsheets](../../20-features/057-tool-catalog-and-invocation-experience/F057-05-office-documents-and-spreadsheets.md)
- Competitor trace: CAP-tools-and-code-execution-06

## S57.09

**Presentation tool.** The assistant can call a tool that creates a presentation file (pptx) the user can open or download.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F057-05 Office documents and spreadsheets](../../20-features/057-tool-catalog-and-invocation-experience/F057-05-office-documents-and-spreadsheets.md)
- Competitor trace: CAP-tools-and-code-execution-06

## S57.10

**Code-execution tool.** The assistant can call a tool that runs code it wrote and returns the output in the transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F057-03 Running code and shell commands](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Competitor trace: CAP-tools-and-code-execution-01, CAP-tools-and-code-execution-04

## S57.11

**Shell tool.** The assistant can call a tool that runs a shell command and returns its output and exit code.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F057-03 Running code and shell commands](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Competitor trace: CAP-tools-and-code-execution-01, CAP-tools-and-code-execution-21

## S57.12

**Patch/edit tool.** The assistant can call a tool that edits part of an existing file (targeted replace or patch) rather than rewriting it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile partial, CLI done, VS Code done, Chrome partial
- Feature: [F057-02 Your files: find, read, write and edit](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md)

## S57.13

**Browser-navigation tool.** The assistant can call a tool that opens a URL in a real browser tab it controls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, CLI done, VS Code done, Chrome done
- Feature: [F057-04 Browser and computer control](../../20-features/057-tool-catalog-and-invocation-experience/F057-04-browser-and-computer-control.md)
- Competitor trace: CAP-tools-and-code-execution-19

## S57.14

**Browser-action tool.** The assistant can call tools that click, type or read in a real browser page it controls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, CLI done, VS Code done, Chrome done
- Feature: [F057-04 Browser and computer control](../../20-features/057-tool-catalog-and-invocation-experience/F057-04-browser-and-computer-control.md)
- Competitor trace: CAP-tools-and-code-execution-19

## S57.15

**Computer-action tool.** The assistant can call tools that see the screen and move, click and type on the user's computer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, CLI missing, VS Code missing
- Feature: [F057-04 Browser and computer control](../../20-features/057-tool-catalog-and-invocation-experience/F057-04-browser-and-computer-control.md)
- Competitor trace: CAP-tools-and-code-execution-19

## S57.16

**Image-generation tool.** The assistant can call an image-generation tool during a turn and the generated image appears in the transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F057-06 Images and video](../../20-features/057-tool-catalog-and-invocation-experience/F057-06-images-and-video.md)

## S57.17

**Image-editing tool.** The assistant can call a tool that edits a supplied image (edit, inpaint, variation) and shows the result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F057-06 Images and video](../../20-features/057-tool-catalog-and-invocation-experience/F057-06-images-and-video.md)

## S57.18

**Video-generation tool.** The assistant can call a video-generation tool and the generated video appears in the conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F057-06 Images and video](../../20-features/057-tool-catalog-and-invocation-experience/F057-06-images-and-video.md)

## S57.19

**Transcription tool.** The assistant can transcribe an audio recording into text (a transcription tool or endpoint), beyond composer dictation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F057-07 Speech in and out](../../20-features/057-tool-catalog-and-invocation-experience/F057-07-speech-in-and-out.md)

## S57.20

**Speech-generation tool.** The assistant can generate spoken audio from text (a speech tool or endpoint) and play or return it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F057-07 Speech in and out](../../20-features/057-tool-catalog-and-invocation-experience/F057-07-speech-in-and-out.md)

## S57.21

**Memory tool.** The assistant can call a memory tool to save, recall or delete a remembered fact during a turn.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F057-08 Memory and scheduled tasks](../../20-features/057-tool-catalog-and-invocation-experience/F057-08-memory-and-scheduled-tasks.md)

## S57.22

**Calendar tool.** The assistant can call a calendar tool to read or create events in the user's calendar.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome partial
- Feature: [F057-09 Connected services: calendar and messages](../../20-features/057-tool-catalog-and-invocation-experience/F057-09-connected-services-calendar-and-messages.md)

## S57.23

**Messaging tool.** The assistant can call a messaging tool to read or send messages on a connected service (e.g. Slack) after approval.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F057-09 Connected services: calendar and messages](../../20-features/057-tool-catalog-and-invocation-experience/F057-09-connected-services-calendar-and-messages.md)

## S57.24

**Scheduling tool.** The assistant can call a tool that creates, lists or deletes a scheduled task for the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F057-08 Memory and scheduled tasks](../../20-features/057-tool-catalog-and-invocation-experience/F057-08-memory-and-scheduled-tasks.md)

## S57.25

**Agent-delegation tool.** The assistant can call a tool that delegates a sub-task to another agent and uses its result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done, VS Code done
- Feature: [F057-10 Agents, questions and approvals](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md)

## S57.26

**Clarification/input tool.** The assistant can call a tool that asks the user a clarifying question (with choices) and waits for the answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI unverified, VS Code done, Chrome done
- Feature: [F057-10 Agents, questions and approvals](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md)

## S57.27

**Approval-request tool.** The assistant can call a tool that explicitly asks the user to approve a plan or decision and waits for the answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F057-10 Agents, questions and approvals](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md)
- Competitor trace: CAP-connectors-apps-and-extensions-11

## S57.28

**Tool discovery.** When more tools are connected than fit in a turn, the model is told which others exist and can load them on demand.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F057-11 Finding tools](../../20-features/057-tool-catalog-and-invocation-experience/F057-11-finding-tools.md)
- Competitor trace: CAP-tools-and-code-execution-15, CAP-connectors-apps-and-extensions-10

## S57.29

**Tool search.** The model or user can search the available tools by keyword and get matching tools with their descriptions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F057-11 Finding tools](../../20-features/057-tool-catalog-and-invocation-experience/F057-11-finding-tools.md)
- Competitor trace: CAP-tools-and-code-execution-15, CAP-connectors-apps-and-extensions-10

## S57.30

**Tool descriptions and schemas.** Each tool carries a readable description and typed parameter schema that the model uses and the user can inspect.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, Chrome done
- Feature: [F057-12 Tool call records: cards, details, errors and receipts](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)

## S57.31

**Tool argument preview.** Each tool call in the transcript shows the arguments it was called with (command, file, query or JSON).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F057-12 Tool call records: cards, details, errors and receipts](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Competitor trace: CAP-tools-and-code-execution-23, CAP-connectors-apps-and-extensions-11

## S57.32

**Tool-call progress.** While a tool runs the transcript shows it as running (with elapsed time), then completed or failed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F057-12 Tool call records: cards, details, errors and receipts](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Competitor trace: CAP-tools-and-code-execution-23

## S57.33

**Tool result preview.** A finished tool call shows a short preview of its result in the transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F057-12 Tool call records: cards, details, errors and receipts](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Competitor trace: CAP-tools-and-code-execution-23

## S57.34

**Tool result expansion.** The user can expand a tool call to see its full arguments and result, and collapse it again.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F057-12 Tool call records: cards, details, errors and receipts](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Competitor trace: CAP-tools-and-code-execution-23

## S57.35

**Tool error and retry.** A failed tool call shows its error, the error goes back to the model so it can retry or explain, and the user can retry.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F057-12 Tool call records: cards, details, errors and receipts](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Competitor trace: CAP-tools-and-code-execution-24

## S57.36

**Large-result references.** An oversized tool result is stored in full and replaced in context by a reference the model or user can open later.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F057-12 Tool call records: cards, details, errors and receipts](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Competitor trace: CAP-tools-and-code-execution-24

## S57.37

**Tool receipt.** After tool calls run, the user can later review a record of which tool ran, with what input, and its outcome.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Feature: [F057-12 Tool call records: cards, details, errors and receipts](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Competitor trace: CAP-tools-and-code-execution-25

## S57.38

**Per-tool cost and usage where exposed.** Where the product exposes costs, the user can see the cost or usage attributable to each tool call.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F057-12 Tool call records: cards, details, errors and receipts](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Competitor trace: CAP-tools-and-code-execution-28
