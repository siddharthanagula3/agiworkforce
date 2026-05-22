# Compute, Computer Use, And Generated Artifacts

Status: Current evidence
Owner: Product/platform
Last updated: 2026-05-20.

This report answers how Claude and ChatGPT appear to create files, use web or computer environments, and present generated artifacts to users, based on public vendor documentation only. It does not claim access to Anthropic or OpenAI private infrastructure.

## Short Answer

Claude and ChatGPT are not single monolithic chat renderers. The public pattern is a model-plus-tools runtime:

1. A model decides whether it needs a tool.
2. The application or API harness executes that tool in a controlled environment.
3. The harness returns observations, screenshots, command output, files, or citations to the model.
4. The product stores generated files and exposes them through previews, downloads, sidebars, libraries, or conversation attachments.

For AGI Workforce, the target architecture should be:

```text
User task
  -> privacy mode and provider policy
  -> tool/router decision
  -> compute session or computer session
  -> tool loop execution
  -> generated file/artifact manifest
  -> preview renderer and download/share controls
  -> synced Web/Mobile/Desktop artifact when allowed
```

## Claude Public Behavior

### Computer Use

Anthropic documents computer use as an agent loop. Claude emits tool-use requests, the developer application executes them in a computer environment, and the results are returned to Claude as tool results. Public docs say Claude itself does not directly connect to the environment; the caller translates Claude's requested actions into the environment and returns screenshots or command output.

The public reference environment is Linux-like:

- A virtual X11 display through Xvfb.
- A lightweight Linux desktop with Mutter and Tint2.
- Applications such as Firefox, LibreOffice, text editors, and file managers.
- Tool implementations that translate requested actions into mouse, keyboard, screenshot, and other operations.
- An agent loop that sends actions to the environment and returns results to Claude.
- A Docker-based reference implementation for isolation.

Important implication: "Claude uses Ubuntu" is a reasonable shorthand for the public reference implementation, but the precise claude.ai production infrastructure is not public. What matters for AGI is the architecture: a sandboxed desktop/browser environment plus a screenshot/action loop.

### File Creation

Anthropic's help docs say Claude can execute code to create and work with files directly in conversations. It can generate Excel spreadsheets, PowerPoint presentations, Word documents, and PDF files for download, across web, Claude Desktop, and Claude Mobile. The support article describes this as a private computing environment in claude.ai where Claude can write and run code such as Python or JavaScript, using common packages to create documents, spreadsheets, slides, data analysis, debugging outputs, and GIFs.

The product behavior is:

- User asks for a file.
- Claude writes/runs code in a private compute environment.
- Claude produces a native file such as `.xlsx`, `.pptx`, `.docx`, or `.pdf`.
- The conversation exposes the file as a downloadable item, with Google Drive save support where available.
- On Claude Mobile, file creation is supported, but downloading opens the file in system preview or a separate app such as Word for `.docx`.
- Artifacts still exist, but file creation can now use the computing environment behind the artifact experience.

## ChatGPT And OpenAI Public Behavior

### Data Analysis And File Work In ChatGPT

OpenAI's ChatGPT help docs describe data analysis as a code-backed workflow. ChatGPT can inspect uploaded files, create tables and charts, and for some tasks write and run Python code in a stateful Jupyter notebook environment. It can use session files and display pandas DataFrames as interactive tables. The same docs state that this Python environment cannot make external web requests or API calls, so external data must be uploaded or connected through an available source.

OpenAI's file upload docs say the newer document-file workflow builds on Advanced Data Analysis, formerly Code Interpreter, for PDFs, Word documents, presentations, and spreadsheets. The ChatGPT Library now stores uploaded and created files so users can reuse or download them later.

OpenAI's file upload docs also say the capability is available on iOS and Android mobile apps. That means mobile users can participate in file workflows, but the documented compute model is still ChatGPT's data-analysis/code-backed environment, not local on-device mobile execution.

### Codex Mobile Remote Control

OpenAI release notes for ChatGPT Enterprise describe Codex remote access from the ChatGPT mobile app. Mobile lets users stay connected to longer-running work, answer questions, redirect execution, approve actions, review outputs, and switch between connected hosts while Codex continues operating in the underlying Mac host or connected remote environment. The mobile app surfaces project context, approvals, screenshots, terminal output, diffs, and test results.

This is strong evidence for AGI's mobile split: mobile should control, approve, preview, download, and share; heavy developer or file-generation work can run on Desktop/local host or future managed compute.

### ChatGPT Agent / Browser Use

OpenAI's ChatGPT agent docs describe a virtual browser workflow. ChatGPT agent sees web pages through screenshots of its virtual browser window, then clicks, fills forms, and navigates. For login or sensitive data entry, the product supports user takeover mode; while the user controls the browser, screenshots are not captured.

### OpenAI API Code Interpreter

OpenAI's API docs expose the lower-level version of this pattern. The Code Interpreter tool lets models write and run Python in a sandboxed environment, using a container object. The docs describe the container as a fully sandboxed virtual machine that can hold uploaded files and files generated by the model.

The useful product details for AGI are:

- Containers can be auto-created or explicitly created.
- Memory tiers exist, with a default lower tier and larger options.
- Containers are ephemeral and expire after inactivity.
- Generated files are returned as message annotations with `container_id`, `file_id`, and `filename`.
- Applications can parse those annotations and surface download links.
- File inputs can include PDFs, rich documents, presentations, spreadsheets, text, and code.

### OpenAI API Computer Use

OpenAI's computer-use docs describe the same broad loop as Anthropic:

1. The model inspects a screenshot.
2. It returns UI actions such as clicks, typing, scrolling, dragging, keypresses, moves, waits, or screenshots.
3. The harness executes those actions in a browser or computer environment.
4. The harness captures the updated screen and returns it.
5. The loop repeats until the model stops requesting computer actions.

OpenAI recommends isolated environments, Playwright or Selenium for fast browser prototypes, and a fuller VM/container when desktop-level interaction is needed. Their docs include a Docker example that starts an Ubuntu desktop with Xvfb, x11vnc, and Firefox.

### Codex Artifact Presentation

OpenAI's Codex app docs say the task sidebar can preview non-code artifacts such as PDFs, spreadsheets, documents, and presentations. The sidebar can also surface the agent plan, sources, generated artifacts, and task summary.

## Inferred Product Architecture

The vendor pattern is consistent enough to use as an AGI blueprint:

| Layer             | What it does                                                                                                     | AGI owner               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Tool policy       | Decides whether a task can use browser, desktop, code, shell, document generation, network, or file write tools. | Shared engine           |
| Compute session   | Runs code in local, BYOK, or managed compute with explicit privacy mode.                                         | Shared Rust/TS runtime  |
| Computer session  | Runs browser or desktop UI control loop with screenshots/actions.                                                | Browser/desktop runtime |
| File store        | Stores uploaded and generated files with TTL, owner, privacy mode, checksum, and download permissions.           | Data layer              |
| Artifact manifest | Records generated files, previews, source messages, versions, and renderers.                                     | Shared types            |
| Preview renderer  | Shows HTML/React/SVG/Mermaid/docs/PDF/spreadsheet/presentation previews safely.                                  | Web/Desktop/Mobile UI   |
| Download/share    | Exposes generated files through local file paths, signed URLs, share sheets, or app library entries.             | Surface adapters        |

## AGI Current State

AGI already has useful pieces, but they are not yet unified into a Claude/ChatGPT-style compute and generated-file platform.

| Area                          | Existing AGI paths                                                                                                                                                               | Status                                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Shared artifact type          | `packages/types/src/artifacts.ts`, `packages/types/src/conversation.ts`, `packages/unified-chat/src/lib/types.ts`                                                                | Partial. Good starting schema, but not enough for file-backed generated artifacts.                                                        |
| Artifact renderer             | `packages/unified-chat/src/components/ArtifactRenderer.tsx`                                                                                                                      | Partial. Renders many inline artifact types and supports native export callbacks.                                                         |
| Cross-origin artifact sandbox | `apps/sandbox`, `apps/web/lib/artifact-sandbox.ts`, `apps/web/features/chat/components/SandboxedIframe.tsx`                                                                      | Strong web foundation for safe HTML/React/SVG/Mermaid rendering.                                                                          |
| Browser automation            | `packages/browser-tool/src/index.ts`, `packages/browser-tool/src/types.ts`                                                                                                       | Partial. Isolated Playwright browser tool exists, but it is not yet a full computer-use screenshot/action protocol.                       |
| Desktop native document tools | `apps/desktop/src-tauri/src/features/document/*`, `apps/desktop/src-tauri/src/core/llm/tool_executor/document_tools.rs`, `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs` | Partial. Desktop can create/read PDF/DOCX/XLSX and has a PPTX creator, but this is not yet a cross-surface compute session/file manifest. |
| Web document export           | `apps/web/features/chat/services/document-export-service.ts`, `apps/web/features/chat/services/document-generation-service.ts`                                                   | Partial. Client-side markdown/PDF/DOCX export exists, but not a trusted generated-file pipeline.                                          |
| Mobile export                 | `apps/mobile/services/fileCreation.ts`                                                                                                                                           | Partial. Local export/share exists, but not generated-file sync or shared artifact manifest.                                              |
| Task runtime                  | `crates/agiworkforce-task-runtime/src/lib.rs`                                                                                                                                    | Early. Useful task registry, but not yet a compute session with generated files, TTL, policy, and artifact linkage.                       |

## AGI Target Design

### 1. Compute Session Contract

Add a shared `ComputeSession` contract that can represent:

- `LocalCode`: code runs on the user's device.
- `LocalBrowser`: Playwright/browser automation on the user's device.
- `LocalDesktop`: OS desktop automation on the user's device, gated hard.
- `ManagedCode`: future cloud code container.
- `ManagedBrowser`: future cloud browser.
- `ManagedDesktop`: future cloud desktop or VNC container.

Each session needs:

- `id`
- `ownerUserId`
- `privacyMode`: `Local`, `Byok`, or `Managed`
- `providerMode`: `Local`, `DirectByok`, `ManagedGateway`, or `ManagedNative`
- `surface`: `cli`, `desktop`, `mobile`, `web`, `vscode`, `chrome`, `service`
- `rootDirectory` or `workspaceId`
- `networkPolicy`
- `filePolicy`
- `createdAt`, `lastActiveAt`, `expiresAt`
- `generatedFiles[]`
- `artifactIds[]`
- audit events

### 2. Generated File And Artifact Manifest

Add a file-backed manifest instead of treating every artifact as inline text:

```ts
type GeneratedFileKind =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'csv'
  | 'json'
  | 'html'
  | 'image'
  | 'video'
  | 'archive'
  | 'text'
  | 'code';

interface GeneratedFile {
  id: string;
  sessionId: string;
  artifactId?: string;
  conversationId?: string;
  messageId?: string;
  filename: string;
  kind: GeneratedFileKind;
  mimeType: string;
  byteSize: number;
  sha256: string;
  storage: 'local-path' | 'app-library' | 'signed-url' | 'provider-container';
  storageRef: string;
  privacyMode: 'local' | 'byok' | 'managed';
  createdAt: string;
  expiresAt?: string;
}
```

Artifacts should reference generated files and previews:

- Source content for inline editing.
- Native output files for download.
- Preview images or rendered pages.
- Version history.
- Export history.
- Privacy labels.

### 3. Computer Use Protocol

Create an AGI-owned `ComputerAction` schema that can map to Anthropic, OpenAI, Playwright, VNC, or local desktop:

- `screenshot`
- `click`
- `double_click`
- `right_click`
- `middle_click`
- `move`
- `drag`
- `scroll`
- `type`
- `keypress`
- `wait`

The current `packages/browser-tool` can become the first implementation for browser-only work. It should be wrapped behind the shared computer session protocol, not exposed as the final product contract.

### 4. Document Generation Strategy

Use different engines for different privacy modes:

| Mode              | Recommended generation path                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local CLI/Desktop | Local libraries and headless converters on the user's machine.                                                                                                                                   |
| Local Mobile      | Native share/export libraries for simple files; heavy generation delegated to Desktop/local host or future managed compute. Mobile still needs request, status, preview, download, and share UX. |
| BYOK              | Prefer local generation after model produces structured plan/content; do not send local files to provider unless user approves.                                                                  |
| Managed           | Future container with LibreOffice/headless, Python, Node, document libraries, and file-store capture.                                                                                            |

Initial high-leverage stack:

- DOCX: `docx-rs` on desktop/Rust, `docx` package on web for client export, or `python-docx` in future managed compute.
- XLSX: `rust_xlsxwriter` on desktop/Rust, SheetJS or Python `openpyxl` in future compute.
- PPTX: existing Rust PPTX builder can continue, but long-term use a richer generator or LibreOffice conversion path.
- PDF: HTML-to-PDF or document-to-PDF through headless browser/LibreOffice, not ad hoc text-only rendering for final quality.
- Preview: render native files to PDF/images for inspection before download.

### 5. Privacy Boundary

Do not copy ChatGPT's or Claude's cloud assumption as AGI's default. AGI's differentiator is local-first:

- Local sessions produce local generated files.
- BYOK sessions can use provider models, but file generation should still happen locally unless explicitly transferred.
- Managed compute remains waitlisted/private beta until billing, abuse, and fraud controls are ready.
- Web/Mobile/Desktop may sync normal chat artifacts.
- CLI/VS Code/Chrome generated files stay local/workspace/task scoped unless explicitly handed off.
- Mobile should be a first-class generated-file user experience, but not the first local heavy-compute runtime.

### 6. Presentation To Users

AGI should expose generated artifacts like this:

- Inline transcript card: "Created `report.pdf`", file size, privacy label, source session.
- Artifact side panel: preview, versions, source, export formats, open/download/share.
- Library for Web/Mobile/Desktop only: uploaded and generated app-chat files.
- Developer sessions: local file path and optional "handoff to app chat" flow with redaction and preview.
- Mobile: system preview/share sheet for native files.
- Mobile: request/status UI for file generation running on Desktop/local host or future managed compute.
- Desktop: open in Finder/file manager, reveal path, save-as, and artifact preview.
- Web: signed download link for synced app artifacts only.

## Implementation Tasks

1. Add `GeneratedFile`, `ArtifactManifest`, and `ComputeSession` to shared types.
2. Extend `SharedArtifact` so it can point at generated files and preview renderers, not only inline `content`.
3. Wrap `packages/browser-tool` behind a shared `ComputerAction` protocol.
4. Add a local compute session manager for CLI/Desktop using a per-session work directory, file manifest, TTL metadata, and audit events.
5. Add desktop document tools to the shared generated-file manifest path, so PDF/DOCX/XLSX/PPTX creation returns a `GeneratedFile` record.
6. Add web/mobile artifact cards that consume the same manifest.
7. Add mobile request/status/download/share UX for generated files, even when the compute runs elsewhere.
8. Add preview generation for PDF/DOCX/XLSX/PPTX, preferably through PDF/image derivatives.
9. Add strict network policy: no inherited environment, domain allowlist, no default credential access, and explicit approval for sensitive transmission.
10. Add provider-container import only as an adapter path for OpenAI Code Interpreter style annotations, converting provider file citations into AGI `GeneratedFile` records.
11. Add tests for Local mode: generated files remain local and are not uploaded.
12. Add tests for BYOK mode: any file transfer requires explicit preview/approval.
13. Add tests for Managed mode: files get TTL, owner, quota, checksum, and deletion behavior.

## Sources

- Anthropic computer use tool: `https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool`
- Anthropic file creation help: `https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude`
- Anthropic file creation tutorial: `https://claude.com/resources/tutorials/create-and-edit-files-with-claude-to-eliminate-hours-of-busy-work`
- OpenAI Code Interpreter API docs: `https://developers.openai.com/api/docs/guides/tools-code-interpreter`
- OpenAI Computer use API docs: `https://developers.openai.com/api/docs/guides/tools-computer-use`
- OpenAI file inputs API docs: `https://developers.openai.com/api/docs/guides/file-inputs`
- OpenAI Codex non-code artifact docs: `https://developers.openai.com/codex/app/features#work-with-non-code-artifacts`
- ChatGPT data analysis help: `https://help.openai.com/en/articles/8437071-advanced-data-analysis`
- ChatGPT file uploads FAQ: `https://help.openai.com/en/articles/8555545-file-uploads-with-gpts-and-advanced-data-analysis-in-chatgpt`
- ChatGPT agent help: `https://help.openai.com/en/articles/11752874-chatgpt-agent`
- ChatGPT file Library help: `https://help.openai.com/en/articles/20001052`
