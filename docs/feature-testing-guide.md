# AGI Workforce — Feature Testing Guide

> **Purpose**: A comprehensive, self-contained testing specification for every major feature in
> AGI Workforce. Written so that any tester — human or LLM (GPT-4, Gemini, Claude) — can verify
> the full application from scratch without prior codebase knowledge.
>
> **Platforms covered**: Desktop (Tauri v2 + React), Web (Next.js 16), Mobile (React Native + Expo).
> Unless stated otherwise, steps target the **desktop app**. Web-specific and mobile-specific
> sections are called out explicitly.

---

## Table of Contents

1. [Chat](#feature-1-chat)
2. [Agentic Mode](#feature-2-agentic-mode)
3. [MCP Tools](#feature-3-mcp-tools)
4. [Voice](#feature-4-voice)
5. [Vision](#feature-5-vision)
6. [Browser Automation](#feature-6-browser-automation)
7. [Terminal](#feature-7-terminal)
8. [Files](#feature-8-files)
9. [Memory](#feature-9-memory)
10. [Connectors](#feature-10-connectors)
11. [Scheduling](#feature-11-scheduling)
12. [Settings](#feature-12-settings)
13. [Billing](#feature-13-billing)
14. [Auth](#feature-14-auth)

---

## Feature 1: Chat

### Overview

The chat interface is the primary interaction surface. Users send messages to any supported LLM
provider (OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral, Cohere, Ollama, LM Studio) and
receive streamed responses rendered as Markdown with syntax-highlighted code blocks, inline
citations, and interactive artifacts. Sessions persist across restarts.

### How It Works

1. The frontend (`UnifiedAgenticChat/`) captures user input and calls the Rust backend via
   `invoke('send_message', ...)`.
2. The Rust LLM router (`core/llm/llm_router.rs`) selects the provider and model, constructs the
   API request, and opens an SSE stream.
3. `sse_parser.rs` parses incremental tokens and emits them to the frontend via Tauri events.
4. The frontend `chatStore` (modular: `chat/chatStore.ts`, `chat/agentStore.ts`,
   `chat/toolStore.ts`) appends tokens to the active message and re-renders in real time.
5. Conversations are persisted locally in SQLite and replayed on next launch.

### Verification Steps

1. **Send a plain text message** — Type "Hello, who are you?" and press Enter.
   - Expected: Model responds with streaming text. Tokens appear incrementally, not all at once.
2. **Markdown rendering** — Ask "Give me a table comparing Python and Rust".
   - Expected: A properly formatted Markdown table renders with headers, rows, and borders.
3. **Code blocks** — Ask "Write a Python fibonacci function".
   - Expected: A fenced code block appears with syntax highlighting and a copy button.
4. **Copy button** — Click the copy icon on a code block.
   - Expected: Code copies to clipboard. A brief "Copied!" confirmation appears (toast or
     inline indicator).
5. **Regenerate** — Click the regenerate button on an assistant message.
   - Expected: The previous response is replaced with a new generation from the same model.
6. **Session persistence** — Send a message, quit the app, relaunch.
   - Expected: The previous conversation reappears in the sidebar and the messages are intact.
7. **New conversation** — Click the "New Chat" button in the sidebar.
   - Expected: A fresh, empty chat opens. The previous conversation remains in the sidebar list.
   - Edge case: Rapidly clicking "New Chat" should not create duplicate empty sessions.
8. **Model switching** — Open the model selector dropdown and pick a different model (e.g.,
   switch from GPT-4o to Claude Sonnet).
   - Expected: The next message uses the newly selected model. The model label updates in the UI.
9. **Long messages** — Paste a 5000-word text and ask "Summarize this".
   - Expected: The input box expands, the message sends, and the model responds. No truncation
     warning unless the text exceeds the model's context window.
10. **Stop generation** — While the model is streaming, click the stop button.
    - Expected: Streaming halts immediately. The partial response remains visible.
11. **Conversation search** — Type a keyword in the sidebar search field.
    - Expected: Only conversations matching the keyword are shown.

### Edge Cases

- **Empty message**: Pressing Enter with no text should do nothing (no empty message sent).
- **Network offline**: Sending a message while offline should show a clear error toast, not hang
  indefinitely.
- **Rate limit hit**: If the provider returns 429, the UI should display "Rate limited — try
  again shortly" rather than a raw JSON error.
- **Very long responses**: A response exceeding 10,000 tokens should not freeze the UI. Verify
  smooth scrolling during generation.
- **Special characters**: Messages with `<script>`, SQL injection strings, or Unicode emoji
  should render safely without XSS or layout breakage.

### Common Issues

- **Model key not configured**: If no API key is set for the selected provider, the error
  "API key not found for provider X" appears. Solution: Add the key in Settings > API Keys.
- **Streaming stops mid-response**: Usually a timeout. Check the provider's status page and
  retry. The SSE parser uses a dual-HTTP-client setup with streaming timeout disabled.

---

## Feature 2: Agentic Mode

### Overview

Agentic mode allows the AI to autonomously execute multi-step tasks using tools (file read/write,
terminal commands, browser actions, MCP tools). The agent plans, executes, observes results, and
iterates — similar to Claude Code or Devin. Users can approve, deny, or stop the agent at any
point.

### How It Works

1. When a message triggers agentic behavior (tool calls detected, or "Always use agent mode" is
   enabled in chat preferences), the Rust backend enters the agentic loop
   (`core/agent/autonomous.rs`).
2. The agent emits lifecycle events: `agentic:loop-started`, `agentic:loop-status`,
   `agentic:message-consumed`, `agentic:loop-ended`.
3. Each tool execution emits `tool:event` (Started / Progress / Completed) with metadata
   including `display_name`, `display_args`, `duration_ms`, and `result_preview`.
4. The frontend `toolStore` listens on these channels and renders the `ToolLabel` and
   `ToolTimeline` components — collapsible, Claude Code-style execution labels.
5. If `autoApproveTools` is off in settings, risky tools trigger an `ApprovalRequestCard`
   dialog. The user must approve or deny before the agent continues.
6. Per-iteration budget checks enforce cost limits. Checkpoint persistence allows resuming after
   crashes.

### Verification Steps

1. **Trigger agentic mode** — Ask "Create a file called test.txt with the content 'hello world'".
   - Expected: The agent shows a tool execution label like `Write(test.txt)`, creates the file,
     and confirms completion.
2. **Tool timeline** — After an agentic response, expand the tool timeline.
   - Expected: Each tool call is listed with its name, arguments, duration, and result preview.
3. **Approval dialog** — With `autoApproveTools` OFF, ask the agent to delete a file.
   - Expected: An approval card appears with the action details. Clicking "Deny" cancels the
     action; clicking "Approve" proceeds.
4. **Stop button** — While the agent is executing a multi-step task, click "Stop".
   - Expected: The agentic loop halts. A summary of completed steps is shown. No partial or
     corrupt state is left behind.
5. **Continue after stop** — After stopping, type "continue" or "keep going".
   - Expected: The agent resumes from where it left off (checkpoint resume).
6. **Budget limit** — Set a low budget limit, then ask for a complex multi-step task.
   - Expected: The agent stops when the budget is exhausted and reports "Budget limit reached".
7. **Context window overflow** — Ask an extremely long multi-turn question that exceeds the
   model's context window.
   - Expected: The system either truncates older messages or shows a warning — it should not
     crash or silently drop context.
8. **ToolGuard validation** — Ask the agent to execute `rm -rf /`.
   - Expected: ToolGuard blocks the action. A security warning is shown. The command is NOT
     executed.

### Edge Cases

- **Nested tool calls**: An agent that calls a tool which itself triggers another tool should
  show both in the timeline, properly nested.
- **Tool timeout**: If a tool execution takes more than 60 seconds, verify it is cancelled
  gracefully with a timeout message.
- **Concurrent sessions**: Starting a new agentic task while another is running should either
  queue the second task or warn the user.
- **Auto-approve mode**: With `autoApproveTools` ON, all tool executions should proceed without
  prompts. Verify no dialogs appear.

### Common Issues

- **"Tool not found"**: The tool may not be registered. Check that MCP servers are connected
  and the tool is listed in Settings > MCP Tools.
- **Agent loops forever**: The autonomous loop has an iteration limit. If it loops excessively,
  the per-iteration budget check will eventually terminate it.

---

## Feature 3: MCP Tools

### Overview

Model Context Protocol (MCP) enables the app to connect to external tool servers that expose
capabilities like database queries, API calls, file operations, and more. AGI Workforce supports
three transport types: stdio (local process), SSE (Server-Sent Events), and streamable HTTP.
There is no artificial limit on the number of MCP tools.

### How It Works

1. MCP server configurations are stored in `.mcp.json` at the project root.
2. The Rust MCP module (`core/mcp/`) manages server lifecycle: spawn processes (stdio), open
   HTTP connections (SSE/HTTP), and register discovered tools.
3. The `mcpStore` tracks server status, discovered tools, and credentials.
4. When the LLM invokes an MCP tool, the request flows through ToolGuard for security
   validation before execution.
5. Results are returned to the LLM as tool-use responses for further reasoning.

### Verification Steps

1. **Add a stdio MCP server** — Open Settings > MCP, click "Add Server". Enter:
   - Name: `filesystem`
   - Transport: `stdio`
   - Command: `npx -y @modelcontextprotocol/server-filesystem /tmp`
   - Expected: Server starts, status shows "Connected", and tools like `read_file`,
     `write_file` appear in the tool list.
2. **Add an SSE MCP server** — Add a server with transport `sse` and a valid SSE endpoint URL.
   - Expected: Connection established, tools discovered and listed.
3. **Add an HTTP MCP server** — Add a server with transport `http` and a valid HTTP endpoint.
   - Expected: Connection established via streamable HTTP, tools listed.
4. **Tool discovery** — After connecting a server, navigate to the MCP Tools panel.
   - Expected: All tools from the server are listed with names, descriptions, and input schemas.
5. **Tool search** — Type a keyword in the tool search field.
   - Expected: Only tools matching the keyword are shown.
6. **Execute a tool manually** — Select a tool, fill in parameters, and click "Run".
   - Expected: The tool executes and results appear in the output pane.
7. **Logs viewer** — Open the MCP Logs Viewer (`MCPLogsViewer` component).
   - Expected: JSON-RPC messages between the app and MCP servers are visible, timestamped,
     and filterable.
8. **Disconnect a server** — Click "Disconnect" on a connected server.
   - Expected: Status changes to "Disconnected". Tools from that server are no longer available.
9. **Reconnect** — Click "Connect" on a disconnected server.
   - Expected: Server reconnects and tools reappear.
10. **Credential storage** — For servers requiring authentication, store credentials via the
    credential manager.
    - Expected: Credentials are stored securely via SecretManager (Argon2id + AES-GCM).

### Edge Cases

- **Server crash**: If a stdio MCP server process crashes, the UI should show "Disconnected"
  status and offer a "Reconnect" button.
- **Invalid config**: Adding a server with a malformed command should show a clear error, not
  crash the app.
- **Duplicate server names**: Attempting to add two servers with the same name should show a
  validation error.
- **Large tool count**: Connecting a server with 100+ tools should not degrade UI performance.
  The tool list should remain scrollable and responsive.

### Common Issues

- **"Command not found"**: The MCP server binary is not in PATH. Provide the full path to the
  executable.
- **Server times out**: Increase the connection timeout in MCP settings or check that the
  server is reachable on the configured port.
- **Tools not appearing after connect**: Click "Refresh Tools" — the initial discovery may
  have been interrupted.

---

## Feature 4: Voice

### Overview

Voice input follows the Wispr Flow pattern: hold a hotkey to record, release to transcribe,
and the transcript is inserted into the chat composer. Voice output (TTS) reads assistant
responses aloud. The system supports post-processing modes (AI cleanup, basic filler-word
removal, or raw), voice commands for editing text, and optional wake-word activation.

### How It Works

1. `voiceInputStore.ts` manages voice state: idle, listening, transcribing, processing, preview.
2. Holding the voice hotkey triggers `speech_start_recording` (Rust command) which captures
   microphone audio.
3. On release, `speech_stop_and_transcribe` sends audio to the transcription backend (Whisper
   API or local Whisper model if the `local-whisper` feature is enabled).
4. Post-processing:
   - `ai` mode: Sends the transcript through the LLM for cleanup (grammar, filler words).
   - `basic` mode: Regex-based filler-word removal (um, uh, like, basically, etc.).
   - `none` mode: Raw transcript inserted as-is.
5. Voice commands (e.g., "make this more formal", "fix the grammar") are detected via prefix
   matching (`detectVoiceCommand()`) and applied as edits to existing composer text rather than
   appended.

### Verification Steps

1. **Hold-to-record** — Hold the voice hotkey (default: configurable in Settings > Voice).
   - Expected: A recording indicator appears (pulsing dot or waveform). The microphone is
     active (verify in OS microphone indicator).
2. **Release to transcribe** — Release the hotkey after speaking a sentence.
   - Expected: The indicator changes to "Transcribing...", then the text appears in the
     composer input box.
3. **AI cleanup mode** — Set post-processing to "AI" in voice settings. Record "Um, so like,
   I want to, uh, search for Python tutorials".
   - Expected: The transcript is cleaned to something like "I want to search for Python
     tutorials" (filler words removed, grammar corrected).
4. **Basic cleanup mode** — Set post-processing to "Basic". Record a sentence with filler words.
   - Expected: Common filler words (um, uh, like, basically, literally, actually, sort of,
     kind of, you know) are stripped. Grammar is not corrected.
5. **No cleanup** — Set post-processing to "None".
   - Expected: Raw transcript inserted exactly as recognized.
6. **Voice command** — Type some text in the composer, then hold the hotkey and say "make this
   more formal".
   - Expected: The existing text in the composer is rewritten in a more formal tone (not
     appended).
7. **TTS output** — Enable voice output in settings. Send a message.
   - Expected: The assistant's response is spoken aloud. Audio plays through the default output
     device.
8. **Cancel recording** — Start recording, then press Escape.
   - Expected: Recording stops. No transcript is generated. State returns to idle.

### Edge Cases

- **No microphone permission**: If the OS denies microphone access, a clear error should appear
  (not a silent failure).
- **Very long recording** (>2 minutes): Should either warn the user or auto-stop to prevent
  excessive API costs.
- **Noisy environment**: Transcription quality degrades but should still return some text, not
  an error.
- **Multiple rapid recordings**: Recording immediately after a previous transcript finishes
  should work without overlap or state corruption.

### Common Issues

- **"Microphone not found"**: Check OS audio settings. Ensure the app has microphone permission.
- **Empty transcript**: The recording may have been too short or too quiet. Speak clearly and
  hold the hotkey for at least 1 second.
- **High latency in AI mode**: AI post-processing adds an LLM round-trip. Switch to "Basic"
  or "None" for faster results.

---

## Feature 5: Vision

### Overview

Vision capabilities allow the AI to analyze images — either attached by the user, captured via
screenshot, or acquired through the computer-use mode. OCR extracts text from images. Computer
use mode enables the AI to see and interact with the user's screen.

### How It Works

1. The `computerUseStore` manages screen capture sessions (start/stop session, capture screen).
2. Screenshot capture calls `automation_screenshot` (Rust) which uses platform-native screen
   capture APIs.
3. Captured images are base64-encoded and sent to a vision-capable model (e.g., GPT-4o,
   Claude Sonnet/Opus with vision, Gemini Pro Vision).
4. OCR uses `automation_ocr` to extract text regions from screenshots.
5. In computer use mode, the AI receives screenshots, reasons about what to do, and emits
   `ComputerAction` events (click, type, scroll, etc.) that the automation layer executes.

### Verification Steps

1. **Attach an image** — Drag and drop a PNG/JPG into the chat input or click the attach button.
   - Expected: A thumbnail preview appears in the input area. The image is sent with the next
     message.
2. **Analyze attached image** — Attach a photo and ask "What's in this image?"
   - Expected: The model describes the image content accurately (requires a vision-capable
     model).
3. **Screenshot capture** — Click the screenshot button in the chat toolbar.
   - Expected: The screen is captured. A preview appears. The user can annotate or send it
     directly.
4. **OCR** — Capture a screenshot of text-heavy content and ask "Extract the text from this
   screenshot".
   - Expected: The OCR engine extracts and returns the visible text.
5. **Computer use mode** — Enable computer use mode and ask "Open Safari and go to google.com".
   - Expected: The AI captures the screen, identifies the Safari icon or dock, clicks it,
     types the URL, and navigates. Each action appears in the action log.
6. **Action log** — After computer use actions, check the action log.
   - Expected: Each action (click, type, scroll) is logged with coordinates, timestamps, and
     success status.

### Edge Cases

- **Non-vision model selected**: If the current model does not support vision (e.g., a
  text-only Ollama model), attaching an image should show a warning: "Current model does not
  support vision. Switch to a vision-capable model."
- **Very large image**: Images over 20MB should be resized or rejected with a file-size warning.
- **Multiple images**: Attaching 3+ images at once should all be included in the message context.
- **Screen recording permission** (macOS): If Screen Recording permission is not granted,
  screenshot capture should show a clear OS-level permission prompt.

### Common Issues

- **Black/blank screenshot**: On macOS, ensure "Screen Recording" permission is granted in
  System Settings > Privacy & Security.
- **OCR returns garbage**: The image quality may be too low. Use higher-resolution captures.
- **Computer use actions miss targets**: Screen resolution or scaling differences can cause
  coordinate mismatches. Verify the app is aware of the current display scaling factor.

---

## Feature 6: Browser Automation

### Overview

The built-in browser automation agent can navigate websites, click elements, fill forms, extract
data, scroll, wait for conditions, and take screenshots — all from within the chat interface.
It uses a headless or headed browser engine (Chromium, Firefox, or WebKit via Playwright-style
bindings).

### How It Works

1. The `browserStore` manages browser sessions, tabs, actions, and screenshots.
2. The Rust automation layer (`automation/`) controls browser instances through native bindings.
3. Actions are typed: `navigate`, `click`, `type`, `extract`, `screenshot`, `scroll`, `wait`,
   `execute` (JavaScript).
4. Each action is logged with a unique ID, timestamp, duration, success/failure status, and
   optional screenshot ID.
5. Element targeting uses CSS selectors, XPath, or text content matching.

### Verification Steps

1. **Open a URL** — Ask "Open https://example.com in the browser".
   - Expected: A browser session starts. The page loads. A screenshot or inline preview shows
     the rendered page.
2. **Click an element** — Ask "Click the 'More information...' link on example.com".
   - Expected: The agent identifies the link by text content, clicks it, and confirms the
     navigation to the new page.
3. **Type into a field** — Ask "Go to google.com and search for 'AGI Workforce'".
   - Expected: The agent navigates to Google, locates the search input, types the query, and
     submits it.
4. **Form fill** — Ask "Fill in a contact form with name 'Test User' and email 'test@test.com'".
   - Expected: The agent identifies form fields by label or placeholder and fills them.
5. **Extract data** — Ask "Extract all headings from https://example.com".
   - Expected: The agent returns a list of heading elements with their text content.
6. **Screenshot** — Ask "Take a screenshot of the current page".
   - Expected: A screenshot appears inline in the chat, showing the current browser viewport.
7. **Scroll** — Ask "Scroll down on the page".
   - Expected: The viewport scrolls and a new screenshot confirms the scrolled position.
8. **Execute JavaScript** — Ask "Run `document.title` on the current page".
   - Expected: The page title string is returned.
9. **Multiple tabs** — Open two URLs in separate tabs and switch between them.
   - Expected: Tab list shows both tabs. Switching tabs updates the active view.

### Edge Cases

- **Page with authentication**: The agent cannot bypass login walls unless credentials are
  provided. It should report "Login required" rather than loop on the login page.
- **Slow page load**: If a page takes >30 seconds to load, the action should timeout with a
  clear message.
- **Dynamic content (SPAs)**: Pages that load content via JavaScript should be given time to
  render. The `wait` action type handles this.
- **CORS / blocked resources**: Some pages block automated access. The agent should report the
  error rather than crash.
- **Pop-ups and dialogs**: Browser dialogs (alert, confirm, prompt) should be auto-dismissed
  or handled gracefully.

### Common Issues

- **"Browser not found"**: The browser engine binary may not be installed. Check that the
  required browser engine is available on the system.
- **Selector not found**: The CSS selector or text may not match. Use more specific selectors
  or verify the page structure has not changed.
- **Session limit**: Too many concurrent browser sessions can exhaust system resources. Close
  unused sessions.

---

## Feature 7: Terminal

### Overview

The integrated terminal allows the AI agent (or the user) to execute shell commands directly
from the app. It supports multiple concurrent sessions with different shell types (zsh, bash,
fish, PowerShell, cmd, WSL, Git Bash), output streaming, command history, and AI-powered
features like command suggestion, error explanation, and smart git commit.

### How It Works

1. `terminalStore` manages terminal sessions, each identified by a unique session ID.
2. Creating a session calls `terminal_create_session` (Rust) which spawns a PTY process.
3. Output is streamed via Tauri events — the store calls `setupOutputListener` to receive
   real-time output.
4. Input is sent via `terminal_send_input`.
5. AI features:
   - `aiSuggestCommand(intent, shellType, cwd)` — Generates a shell command from a natural
     language description.
   - `aiExplainError(errorOutput, command, shellType)` — Explains what went wrong.
   - `smartCommit(sessionId)` — Generates a conventional commit message from staged changes.
   - `aiSuggestImprovements(command, shellType)` — Suggests improvements to a command.

### Verification Steps

1. **Create a terminal session** — Open the terminal panel and create a new session.
   - Expected: A terminal appears with a shell prompt (e.g., `$ ` or `% `).
2. **Run a command** — Type `echo "Hello World"` and press Enter.
   - Expected: "Hello World" appears in the output. The command is added to history.
3. **Run via chat** — Ask the AI "Run `ls -la` in the terminal".
   - Expected: The agent executes the command. Output appears in the tool execution timeline.
4. **View output** — Run `cat /etc/hosts`.
   - Expected: File contents are displayed in the terminal output area.
5. **Kill a process** — Run `sleep 300 &` then close the terminal session.
   - Expected: The background process is terminated when the session closes.
6. **Multiple sessions** — Create two terminal sessions with different shells (e.g., zsh and
   bash).
   - Expected: Both sessions are listed. Switching between them shows their respective outputs.
7. **Command history** — Press the up arrow in the terminal.
   - Expected: Previous commands are recalled from history.
8. **AI command suggestion** — Type a natural language intent like "list all docker containers".
   - Expected: The AI suggests the appropriate command (`docker ps -a`).
9. **AI error explanation** — Run a command that fails, then click "Explain Error".
   - Expected: The AI provides a human-readable explanation of the error and suggests a fix.
10. **Smart commit** — Stage some git changes, then use the smart commit feature.
    - Expected: A conventional commit message is generated from the staged diff.
11. **Environment variables** — Run `echo $HOME`.
    - Expected: The user's home directory path is printed. Environment variables from the
      parent process are inherited.

### Edge Cases

- **Very long output**: Running `find / -name "*.txt"` may produce thousands of lines. The
  terminal should remain responsive and scrollable.
- **Binary output**: Running `cat /bin/ls` should not crash the terminal. Binary content should
  be displayed as garbled text or explicitly filtered.
- **Interactive programs**: Running `vim` or `top` requires PTY support. The terminal should
  handle cursor movement and screen clearing.
- **Permission denied**: Commands requiring sudo should show the permission error, not crash.

### Common Issues

- **"Shell not found"**: The selected shell type is not installed. Use `terminal_detect_shells`
  to see available shells and pick one that exists.
- **Terminal hangs**: A long-running command may appear to hang. Check if it is waiting for
  input (e.g., a `read` command or password prompt).

---

## Feature 8: Files

### Overview

The file management system allows reading, writing, creating, deleting, moving, copying, and
searching files on the local filesystem. Access is restricted to user-configured "allowed
directories" for security. Files can also be attached to chat messages.

### How It Works

1. `filesystemStore` manages the file browser state: current path, directory entries, file
   content, navigation history.
2. All file operations route through Rust commands (`fs_read_file`, `fs_write_file`,
   `fs_delete_file`, etc.) which enforce the allowed-directories policy.
3. The allowed directories list is configured in Settings > Allowed Directories.
4. File attachments in chat are base64-encoded and included in the message payload.
5. The agent's file operations go through ToolGuard for security validation.

### Verification Steps

1. **Browse files** — Open the file browser and navigate to an allowed directory.
   - Expected: Directory contents are listed with names, sizes, and modification dates.
2. **Read a file** — Click on a text file.
   - Expected: File contents are displayed in the viewer.
3. **Write a file** — Ask the AI "Create a file called hello.txt with 'Hello World' in my
   Documents folder".
   - Expected: The file is created. The tool timeline shows `Write(hello.txt)`.
4. **Edit a file** — Ask "Add a new line 'Goodbye' to hello.txt".
   - Expected: The file is updated with the new line appended.
5. **Delete a file** — Ask "Delete hello.txt".
   - Expected: An approval dialog appears (if auto-approve is off). After approval, the file
     is deleted.
6. **Move/rename** — Ask "Rename hello.txt to greeting.txt".
   - Expected: The file is renamed. The old path no longer exists.
7. **Copy** — Ask "Copy greeting.txt to greeting_backup.txt".
   - Expected: Both files exist after the operation.
8. **Search** — Ask "Find all .md files in my project directory".
   - Expected: A list of matching files is returned with their paths.
9. **Upload attachment** — Drag a file into the chat input area.
   - Expected: The file appears as an attachment thumbnail. It is included with the next
     message.
10. **Allowed directories enforcement** — Try to read a file outside the allowed directories.
    - Expected: The operation is denied with a clear error: "Path is outside allowed
      directories."

### Edge Cases

- **Large files**: Reading a file >10MB should either paginate or warn the user about the
  size. The UI should not freeze.
- **Binary files**: Attempting to read a binary file (image, compiled binary) in the text
  viewer should show a warning or display the file type.
- **Symlinks**: Following symlinks that point outside allowed directories should be blocked.
- **Concurrent writes**: Two agents writing to the same file simultaneously should not corrupt
  the file.
- **File encoding**: UTF-8 files should render correctly. Non-UTF-8 encodings should be
  handled gracefully (show encoding error or attempt conversion).

### Common Issues

- **"Permission denied"**: The OS-level file permissions prevent access. Check that the user
  running the app has read/write permissions to the target path.
- **"Path not in allowed directories"**: Add the directory in Settings > Allowed Directories.
- **File not found after creation**: Verify the correct path was used. Check for typos or
  relative vs. absolute path issues.

---

## Feature 9: Memory

### Overview

The memory system gives the AI persistent recall across sessions. Users can create, edit,
search, and delete memory entries organized by category (preference, fact, decision, context).
Each entry has a topic, content, importance score, and timestamps. Memories are stored in
SQLite via Tauri commands and cached in the Zustand `memoryStore`.

### How It Works

1. `memoryStore` exposes actions: `remember`, `recall`, `search`, `forget`, `getByCategory`,
   `getImportant`, `getSessionContext`, `loadAll`.
2. Each memory entry has: `id`, `category` (preference | fact | decision | context), `topic`,
   `content`, `importance` (0-10), `source`, `created_at`, `updated_at`.
3. Memory limits are enforced: max 100 entries, max 1MB total size (AUDIT-006-024).
4. The memory panel (`MemoryPanel`, `MemoryViewer`, `MemoryManager`, `CreateMemoryDialog`)
   provides the UI for CRUD operations.
5. The AI can autonomously create memories during conversations when it detects important
   information worth persisting.

### Verification Steps

1. **Create a memory** — Open the Memory panel and click "Add Memory".
   - Fill in: Category: "preference", Topic: "coding style", Content: "User prefers TypeScript
     with strict mode".
   - Expected: The memory is saved and appears in the list.
2. **View memories** — Open the Memory panel.
   - Expected: All saved memories are listed, grouped or filterable by category.
3. **Search memories** — Type "coding" in the memory search field.
   - Expected: Only memories with "coding" in the topic or content are shown.
4. **Edit a memory** — Click on an existing memory and modify the content.
   - Expected: The updated content is saved. The `updated_at` timestamp changes.
5. **Delete a memory** — Click the delete button on a memory entry.
   - Expected: The memory is removed from the list after confirmation.
6. **Category filter** — Filter by "preference" category.
   - Expected: Only preference-type memories are shown.
7. **Importance filter** — View important memories (importance >= 7).
   - Expected: Only high-importance memories are listed.
8. **Session context** — Start a new chat session after saving some memories.
   - Expected: The AI has access to relevant memories and can reference them (e.g., "I remember
     you prefer TypeScript with strict mode").
9. **Memory limit** — Try to create more than 100 memories.
   - Expected: A warning is shown when approaching the limit. Creation is blocked at 100.

### Edge Cases

- **Duplicate topics**: Creating two memories with the same category and topic should either
  update the existing one or clearly show both.
- **Very long content**: Memory content exceeding a reasonable length should be truncated or
  rejected with a size warning.
- **Special characters in content**: HTML, Markdown, and emoji in memory content should be
  stored and displayed correctly.
- **Concurrent access**: If the AI creates a memory while the user is editing another, both
  operations should succeed without data loss.

### Common Issues

- **Memories not persisting**: Check that the SQLite database is accessible. Verify with
  `loadAll()` after restart.
- **Search returns nothing**: The search is keyword-based. Try shorter or more general terms.
- **"Memory limit reached"**: Delete old or low-importance memories to make room.

---

## Feature 10: Connectors

### Overview

Connectors integrate external services (Gmail, GitHub, Notion, Slack, Google Drive, Sheets,
Outlook, OneDrive, Linear, Jira) into the app. Authentication is handled via OAuth flows or
API keys, with credentials stored securely via SecretManager. Once connected, the service's
data and actions become available as MCP tools.

### How It Works

1. `connectorsStore` manages connection state: `connectedIds`, `loading`, `error`,
   `pendingOAuth`, `oauthStartedAt`.
2. Connector definitions are in `components/Connectors/connectorDefinitions.ts`, each
   specifying `authType` (oauth | api_key | mcp_remote | none).
3. OAuth flow:
   - `connect(id)` calls `mcp_oauth_start` which opens the browser to the provider's auth page.
   - A 5-minute timeout is set (`OAUTH_TIMEOUT_MS`). If no callback arrives, the flow is
     marked as timed out.
   - On successful OAuth callback, `completeOAuth(id)` marks the connector as connected and
     activates its MCP server.
4. API key flow: The user enters their API key in the `ConnectorApiKeyDialog`, which is stored
   via SecretManager and then `mcp_connect_connector` is called.
5. Credentials are never stored in plaintext — always encrypted with Argon2id + AES-GCM.

### Verification Steps

1. **View connectors** — Open the Connectors panel.
   - Expected: All available connectors are listed with their connection status (connected /
     disconnected).
2. **OAuth connector (e.g., Gmail)** — Click "Connect" on Gmail.
   - Expected: The system browser opens to Google's OAuth consent screen. After granting
     permission, the callback redirects back and the connector shows "Connected".
3. **API key connector (e.g., a service requiring an API key)** — Click "Connect" on an
   API-key connector.
   - Expected: A dialog appears asking for the API key. After entering and submitting, the
     connector shows "Connected".
4. **Disconnect** — Click "Disconnect" on a connected connector.
   - Expected: The connector is disconnected. Its tools are no longer available.
5. **Reconnect** — Disconnect and then reconnect a connector.
   - Expected: The OAuth flow or API key dialog re-appears. After completion, the connector
     works again.
6. **Use a connected service** — With Gmail connected, ask "Show my latest emails".
   - Expected: The agent uses the Gmail MCP tools to fetch and display recent emails.
7. **Credential persistence** — Connect a service, quit the app, relaunch.
   - Expected: The connector remains connected (credentials are persisted securely).

### Edge Cases

- **OAuth timeout**: If the user does not complete the OAuth flow within 5 minutes, the
  connector should show a "Timed out" error with an option to retry.
- **OAuth denied**: If the user clicks "Deny" on the OAuth consent screen, the connector
  should show "Authorization denied" — not an ambiguous error.
- **Invalid API key**: Entering a wrong API key should show a clear error: "Invalid API key"
  or "Authentication failed".
- **Service unavailable**: If the external service is down, the connector should report the
  outage gracefully.
- **Token refresh**: OAuth tokens expire. The system should automatically refresh tokens
  without user intervention.

### Common Issues

- **"OAuth callback not received"**: The callback URL may be misconfigured. Verify the
  redirect URI matches what is registered with the OAuth provider.
- **Connector shows "Connected" but tools fail**: The OAuth token may have expired. Disconnect
  and reconnect to refresh the token.

---

## Feature 11: Scheduling

### Overview

The scheduler allows users to create automated recurring tasks. Jobs can run on cron schedules,
fixed intervals, or one-time future dates. Action types include briefings, reminders, agent
tasks (autonomous AI execution), and custom actions. The scheduler integrates with the agent
system to execute tasks autonomously at the scheduled time.

### How It Works

1. `schedulerStore` manages scheduled jobs with types: `cron`, `interval`, `once`.
2. Action types: `briefing`, `reminder`, `agent_task`, `custom`.
3. Job lifecycle: `addJob` -> backend creates the job with a cron expression or interval ->
   backend scheduler fires at the configured time -> action is executed.
4. The Rust scheduler (`core/scheduler/`) uses NLP parsing for natural language schedule
   descriptions and converts them to cron expressions.
5. Real-time updates flow via Tauri events — the store subscribes to job status changes.
6. Jobs can be paused (`pauseJob`), resumed (`resumeJob`), run immediately (`runJobNow`),
   or deleted (`removeJob`).

### Verification Steps

1. **Create a one-time schedule** — Click "Add Schedule" and set:
   - Name: "Test reminder"
   - Schedule: A time 2 minutes from now
   - Action: Reminder with message "Time to stand up"
   - Expected: The job appears in the schedule list with the correct next-run time.
2. **Verify execution** — Wait for the scheduled time.
   - Expected: The reminder fires. A notification or chat message appears with "Time to
     stand up".
3. **Create a recurring schedule** — Create a job with cron expression `*/5 * * * *` (every
   5 minutes).
   - Expected: The job fires every 5 minutes. The `last_run` timestamp updates after each
     execution.
4. **Pause a job** — Click "Pause" on an active job.
   - Expected: The job's `enabled` status changes to false. It does not fire at its next
     scheduled time.
5. **Resume a job** — Click "Resume" on a paused job.
   - Expected: The job becomes active again and resumes firing.
6. **Run now** — Click "Run Now" on a scheduled job.
   - Expected: The job executes immediately regardless of its schedule. The `last_run`
     timestamp updates.
7. **Edit a job** — Modify a job's name, schedule, or action.
   - Expected: Changes are saved. The `next_run` recalculates based on the new schedule.
8. **Delete a job** — Click "Delete" on a job.
   - Expected: The job is removed from the list after confirmation.
9. **Agent task schedule** — Create a schedule with action type "Agent Task" and a prompt like
   "Summarize today's news".
   - Expected: At the scheduled time, the agent autonomously executes the prompt and stores
     the result.
10. **View next runs** — Check the "Next Runs" view.
    - Expected: Upcoming job executions are listed in chronological order.

### Edge Cases

- **Past one-time schedule**: Creating a one-time job with a time in the past should either
  execute immediately or show a validation error.
- **Timezone handling**: Schedules should respect the configured timezone. Verify a job set
  for 9:00 AM PST fires at the correct UTC time.
- **App not running**: Scheduled jobs that fire while the app is closed should either execute
  on next launch or be skipped with a log entry.
- **Overlapping executions**: If a job takes longer than its interval, the next execution
  should either queue or skip to prevent overlap.

### Common Issues

- **Job does not fire**: Verify the cron expression is valid. Use a cron validator tool.
  Check that the job is enabled.
- **Wrong timezone**: The `timezone` field defaults to the system timezone. Override it
  explicitly if needed.

---

## Feature 12: Settings

### Overview

The Settings panel configures all aspects of the application: LLM provider and model selection,
API key management (via SecretManager), theme, language, chat preferences, task routing, allowed
directories, custom instructions, MCP tools, execution preferences, and more. Settings persist
to localStorage with migration support (currently at persist version 10).

### How It Works

1. `settingsStore` is a Zustand store with `devtools(persist(subscribeWithSelector(...)))`
   middleware.
2. Key configuration groups:
   - `LLMConfig`: defaultProvider, temperature, maxTokens, defaultModels, taskRouting,
     favoriteModels
   - `WindowPreferences`: theme (light/dark/system), language (en/es), startup position
   - `ChatPreferences`: promptCompletionEnabled, alwaysUseAgentMode, compactMode,
     autoApproveTools, autoInjectSkills
   - `ExecutionPreferences`: execution-level settings
3. API keys are stored via `SecretManager` (Argon2id + AES-GCM encryption in SQLite/keychain),
   never in localStorage or plaintext.
4. Task routing maps task categories (search, code, docs, chat, vision, image, video) to
   specific provider+model pairs.
5. Settings panels are modular: `AgentsSettings`, `AllowedDirectoriesSettings`,
   `AutomationPermissionsSettings`, `CustomInstructionsSettings`, `CustomModelsSettings`,
   `ExtensionsSettings`, `FavoriteModelsSelector`, `FeaturesPrivacySettings`,
   `InstructionFilesSettings`, `MCPToolsSettings`, `MasterPasswordSettings`,
   `OAuthCredentialsPanel`, `SkillsPluginsSettings`, `TaskRoutingSettings`,
   `UpdateSettings`, `VoiceSettings`.

### Verification Steps

1. **Open settings** — Click the settings gear icon.
   - Expected: The settings panel opens with categorized tabs/sections.
2. **Change theme** — Switch from Dark to Light theme (or vice versa).
   - Expected: The UI immediately updates to the selected theme. The preference persists after
     restart.
3. **Set API key** — Navigate to API Keys, select a provider (e.g., OpenAI), and enter an
   API key.
   - Expected: The key is saved securely. A success confirmation appears. The key is masked
     in the UI (shown as `sk-...xxxx`).
4. **Change default model** — Select a different default model (e.g., Claude Sonnet 4.5).
   - Expected: New conversations use the selected model. The model name appears in the chat
     header.
5. **Temperature slider** — Adjust the temperature to 0.0 (deterministic) and then 1.0
   (creative).
   - Expected: The slider value updates. Lower temperature produces more consistent outputs;
     higher temperature produces more varied outputs.
6. **Max tokens** — Set max tokens to 100 and send a message.
   - Expected: The response is truncated at approximately 100 tokens.
7. **Task routing** — Configure "code" tasks to use Claude and "search" tasks to use Perplexity.
   - Expected: When asking a coding question, Claude is used. When asking a search question,
     Perplexity is used (if the LLM classifier routes correctly).
8. **Allowed directories** — Add a new directory to the allowed list.
   - Expected: The directory appears in the list. File operations within it are permitted.
9. **Remove allowed directory** — Remove a directory from the allowed list.
   - Expected: File operations in that directory are now blocked.
10. **Custom instructions** — Add custom instructions like "Always respond in bullet points".
    - Expected: All subsequent AI responses follow the custom instruction.
11. **Auto-approve tools** — Toggle the auto-approve setting.
    - Expected: When ON, tool executions proceed without approval dialogs. When OFF, approval
      dialogs appear for risky actions.
12. **Favorite models** — Star a few models as favorites.
    - Expected: Favorited models appear at the top of the model selector dropdown.
13. **Export/import settings** — If available, export settings to a file and re-import.
    - Expected: All settings are preserved in the export and correctly restored on import.

### Edge Cases

- **Invalid API key format**: Entering a key that does not match the provider's format should
  show a validation warning (e.g., OpenAI keys start with `sk-`).
- **Settings reset**: A "Reset to defaults" button should restore all settings without
  corrupting persisted data.
- **Migration**: Upgrading from an older settings version should auto-migrate without data loss.
  The current persist version is 10.
- **Concurrent tab edits**: Changing settings in one window while another is open should not
  cause conflicts (localStorage-based sync).

### Common Issues

- **Settings not persisting**: Check that localStorage is not full or blocked by the browser
  (for web). Clear cache and retry.
- **API key "not found" after restart**: The SecretManager may need re-initialization. Check
  that the master password (if set) is entered correctly.
- **Theme flicker on startup**: This is a known issue with system theme detection. It should
  resolve within 100ms of launch.

---

## Feature 13: Billing

### Overview

Billing is handled via the web app (`apps/web/app/pricing/`). Three tiers are available:
**Hobby** ($4.99-$10/month), **Pro** ($24.99-$29.99/month, waitlist), and **Max**
($249.99-$299.99/month, waitlist). Payments are processed through Stripe. The pricing page
supports monthly/annual billing toggle with up to 50% savings on annual plans. Pro and Max
tiers currently use a waitlist model.

### How It Works

1. The pricing page (`apps/web/app/pricing/page.tsx`) displays three plan cards with features
   and pricing.
2. Clicking "Subscribe" (Hobby) calls `/api/checkout` which creates a Stripe Checkout session
   and redirects the user.
3. Clicking "Join Waitlist" (Pro/Max) calls `/api/waitlist` to register interest.
4. After successful checkout, Stripe webhooks update the `subscriptions` table in Supabase.
5. Subscription status is checked via `supabase.from('subscriptions').select(...)`.
6. The "Manage Subscription" button calls `/api/portal` which creates a Stripe Customer Portal
   session for plan changes, cancellations, and billing history.
7. CSRF protection: All API calls include CSRF headers via `addCsrfHeaders()`.

### Verification Steps

1. **View pricing page** — Navigate to `/pricing` on the web app.
   - Expected: Three plan cards are displayed (Hobby, Pro, Max) with correct pricing.
2. **Toggle billing interval** — Click the Monthly/Yearly toggle.
   - Expected: Prices update. Annual prices show the discounted rate. "Save up to 50%" label
     appears for annual billing.
3. **Subscribe to Hobby** — Click "Subscribe" on the Hobby plan.
   - Expected: Redirected to Stripe Checkout. After payment, redirected back to the app with
     a success message. Subscription status updates to active.
4. **Join Pro waitlist** — Click "Join Waitlist" on the Pro plan.
   - Expected: A success toast "Joined!!" appears. The button changes to "Joined Waitlist"
     and is disabled.
5. **Join Max waitlist** — Click "Join Waitlist" on the Max plan.
   - Expected: Same behavior as Pro waitlist.
6. **View subscription status** — After subscribing, revisit the pricing page.
   - Expected: The current plan is indicated. Options to upgrade or manage appear.
7. **Manage subscription** — Click "Manage Subscription".
   - Expected: Redirected to Stripe Customer Portal where the user can update payment method,
     change plan, or cancel.
8. **Cancel subscription** — Cancel via Stripe Portal.
   - Expected: Subscription status changes to "canceled". Access restrictions apply at the
     end of the billing period.
9. **Subscription required redirect** — Access a protected page without a subscription.
   - Expected: Redirected to `/pricing?reason=subscription_required` with a warning banner.

### Edge Cases

- **Not logged in**: Clicking "Subscribe" while not logged in should redirect to
  `/signup?next=/pricing`.
- **Payment failure**: If the Stripe payment fails, the user should see an error message and
  remain on the checkout page. No subscription is created.
- **Double-click prevention**: Rapidly clicking "Subscribe" should not create multiple checkout
  sessions. The button should disable after the first click.
- **Webhook delay**: If the Stripe webhook is delayed, the subscription may not update
  immediately. The app should handle this gracefully (show "Processing..." state).
- **Currency**: Prices are in USD. International users should see USD pricing clearly labeled.

### Common Issues

- **"Failed to start checkout"**: The Stripe API key may be misconfigured in the server
  environment. Check `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID_*` env vars.
- **Subscription not showing after payment**: Stripe webhooks may be delayed. Wait a few
  minutes and refresh. Check the webhook endpoint configuration in the Stripe dashboard.
- **"Failed to load billing portal"**: The Stripe customer portal may not be configured.
  Set it up in the Stripe Dashboard > Settings > Customer Portal.

---

## Feature 14: Auth

### Overview

Authentication is handled by Supabase Auth via the web app. Supported methods: email + password,
magic link (passwordless), GitHub OAuth, and enterprise SSO (SAML). Sessions persist across
browser refreshes. The desktop app authenticates by launching the web auth flow and capturing
the session token via deep linking.

### How It Works

1. The login page (`apps/web/app/login/page.tsx`) offers:
   - Email + password sign-in
   - Magic link (passwordless email)
   - GitHub OAuth
   - Enterprise SSO (auto-detected by email domain via `/api/auth/sso-check`)
2. The signup page (`apps/web/app/signup/page.tsx`) handles new account creation.
3. Supabase SSR (`@supabase/ssr`) manages sessions on the server side.
4. Redirect URLs are validated via `getSafeRedirectUrl()` to prevent open redirect attacks.
5. Desktop auth flow:
   - Desktop opens the web login page in the system browser.
   - After successful login, the web app redirects to a deep link (`agiworkforce://auth/...`)
     with the session token.
   - The desktop app captures the token via the deep link handler (secured with
     `ALLOWED_DEEP_LINK_PARAMS` allowlist and token redaction).
6. Logout clears the session across all stores (each store has a `resetOnLogout` method).

### Verification Steps

1. **Sign up with email** — Navigate to `/signup`. Enter email and password.
   - Expected: Account is created. A confirmation email is sent (if email confirmation is
     enabled). After confirmation, the user is logged in.
2. **Log in with email + password** — Navigate to `/login`. Enter credentials.
   - Expected: Successful login. Redirected to `/chat` (or the `redirectTo` param if present).
3. **Magic link** — Enter email on the login page and click "Send Magic Link".
   - Expected: A toast confirms "Check your email for a login link". Clicking the link in the
     email logs the user in.
4. **GitHub OAuth** — Click the GitHub login button.
   - Expected: Redirected to GitHub's authorization page. After granting access, redirected
     back to the app and logged in.
5. **Enterprise SSO** — Enter an email with a configured SSO domain (e.g., `user@company.com`).
   - Expected: The login form detects the SSO domain (via debounced check to
     `/api/auth/sso-check`) and shows an "SSO Login" button. Clicking it redirects to the
     company's SSO provider.
6. **Session persistence** — Log in, close the browser tab, reopen the app.
   - Expected: The user is still logged in. No re-authentication required.
7. **Sign out** — Click the sign-out button in the user profile menu.
   - Expected: The session is destroyed. The user is redirected to the login page. All stores
     are reset (no stale data from the previous session).
8. **Desktop auth flow** — In the desktop app, click "Sign In".
   - Expected: The system browser opens to the web login page. After logging in, the browser
     redirects via deep link. The desktop app captures the session and the user is authenticated.
9. **Protected routes** — Try to access `/dashboard` or `/chat` without being logged in.
   - Expected: Redirected to `/login?redirectTo=/dashboard`.
10. **Password reset** — Click "Forgot password?" on the login page.
    - Expected: A password reset email is sent. Following the link allows setting a new
      password.

### Edge Cases

- **Invalid credentials**: Wrong password should show "Invalid login credentials" — not a
  generic server error.
- **Account already exists**: Trying to sign up with an existing email should show "User
  already registered" or offer to log in instead.
- **Expired magic link**: Clicking a magic link after expiration (usually 1 hour) should
  show an expiration message with an option to request a new one.
- **OAuth cancelled**: If the user cancels the GitHub OAuth flow, they should return to the
  login page without errors.
- **Open redirect prevention**: The `redirectTo` parameter is validated by
  `getSafeRedirectUrl()`. Passing an external URL (e.g., `redirectTo=https://evil.com`)
  should be rejected and fall back to `/chat`.
- **Concurrent sessions**: Logging in from two different browsers should both work. Logging
  out from one should not invalidate the other (unless "single session" is enforced).
- **Deep link token security**: The deep link handler only accepts parameters in the
  `ALLOWED_DEEP_LINK_PARAMS` allowlist. Tokens are redacted from logs.

### Common Issues

- **"Invalid login credentials"**: Double-check the email and password. Reset the password
  if forgotten.
- **Magic link not received**: Check spam/junk folders. Verify the email address is correct.
  Check that the Supabase email provider is configured correctly.
- **OAuth redirect fails**: Verify the OAuth callback URL in the GitHub Developer Settings
  matches the app's URL exactly (including protocol and trailing slash).
- **Desktop deep link not working**: Ensure the `agiworkforce://` URL scheme is registered
  with the OS. On macOS, this is set up by the Tauri installer. On development builds, run
  `tauri dev` which registers the scheme automatically.
- **Session expires unexpectedly**: Supabase sessions have a configurable expiry. Check the
  JWT expiry settings in the Supabase dashboard.

---

## Appendix A: Test Environment Setup

### Prerequisites

| Requirement    | Version       | Notes                                        |
| -------------- | ------------- | -------------------------------------------- |
| Node.js        | >= 22.12.0    | Required for web and frontend builds         |
| pnpm           | >= 9.15.3     | Package manager for the monorepo             |
| Rust toolchain | Latest stable | Required for the desktop app backend         |
| libclang       | Latest        | `brew install llvm` on macOS (for SQLCipher) |

### Starting the Desktop App

```bash
cd apps/desktop
pnpm install
pnpm dev           # Starts Vite frontend + Rust backend
```

### Starting the Web App

```bash
cd apps/web
pnpm install
pnpm dev           # Starts Next.js dev server
```

### Starting the Mobile App

```bash
cd apps/mobile
pnpm install
pnpm dev           # Starts Expo dev server
```

### Required Environment Variables

| Variable                        | Where            | Purpose                         |
| ------------------------------- | ---------------- | ------------------------------- |
| `TOTP_ENCRYPTION_KEY`           | Web app          | Encryption key for TOTP secrets |
| `NEXT_PUBLIC_APP_URL`           | Web app          | Public URL of the web app       |
| `NEXT_PUBLIC_API_URL`           | Web app          | API URL for backend services    |
| `NEXT_PUBLIC_SUPABASE_URL`      | Web app          | Supabase project URL            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Web app          | Supabase anonymous key          |
| `STRIPE_SECRET_KEY`             | Web app (server) | Stripe API secret key           |
| `STRIPE_WEBHOOK_SECRET`         | Web app (server) | Stripe webhook signing secret   |

---

## Appendix B: Supported LLM Providers

| Provider        | Auth Type      | Notable Models                       | Vision | Tools  |
| --------------- | -------------- | ------------------------------------ | ------ | ------ |
| OpenAI          | API Key        | GPT-4o, GPT-4o-mini, o1, o3          | Yes    | Yes    |
| Anthropic       | API Key        | Claude Opus 4, Sonnet 4.5, Haiku 4.5 | Yes    | Yes    |
| Google (Gemini) | API Key        | Gemini 2.0 Flash, Gemini Pro         | Yes    | Yes    |
| xAI             | API Key        | Grok-2, Grok-3                       | Yes    | Yes    |
| DeepSeek        | API Key        | DeepSeek-V3, DeepSeek-R1             | No     | Yes    |
| Mistral         | API Key        | Mistral Large, Codestral             | No     | Yes    |
| Cohere          | API Key        | Command R+                           | No     | Yes    |
| Ollama          | Local (no key) | Llama 3, Mistral, CodeLlama, etc.    | Varies | Varies |
| LM Studio       | Local (no key) | Any GGUF model                       | Varies | Varies |

> **Note on local models**: Ollama model capability detection (`capability_detection.rs`) probes
> each model via `/api/show` to determine tool support. Models without tool support have tool
> injection disabled to prevent silent failures.

---

## Appendix C: Security Considerations for Testers

- **Never commit real API keys** in test configurations. Use test/sandbox keys only.
- **ToolGuard**: All tool executions pass through ToolGuard (`tool_guard.rs`, 1778 lines)
  which validates safety tiers, enforces the capabilities deny list (15 items), and logs
  security-relevant operations.
- **SecretManager**: Verify that API keys are never visible in plaintext in localStorage,
  console logs, or network requests. They should be encrypted with Argon2id + AES-GCM.
- **XSS prevention**: Test that pasting `<script>alert('xss')</script>` into any input field
  renders as text, never executes.
- **CSRF**: All state-changing API calls on the web app should include CSRF tokens
  (via `addCsrfHeaders()`).
- **Deep link security**: Verify that only parameters in the `ALLOWED_DEEP_LINK_PARAMS`
  allowlist are accepted. Tokens must be redacted in all logs.

---

## Appendix D: Quick Smoke Test Checklist

Use this checklist for rapid verification after a new build:

- [ ] App launches without crashes
- [ ] Settings panel opens and closes
- [ ] API key can be saved for at least one provider
- [ ] A chat message can be sent and a response is received
- [ ] Response streams in real time (not all-at-once)
- [ ] Code blocks render with syntax highlighting
- [ ] New conversation can be created
- [ ] Previous conversations appear in the sidebar
- [ ] Model can be switched via the model selector
- [ ] Terminal can be opened and a command executed
- [ ] File browser can navigate to an allowed directory
- [ ] Memory panel opens and existing memories are listed
- [ ] MCP server can be connected (if configured)
- [ ] Theme can be toggled between dark and light
- [ ] Sign out works and redirects to login
- [ ] Web app pricing page renders correctly
- [ ] Web app login page renders and accepts credentials
