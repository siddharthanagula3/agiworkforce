# Feature: Terminal

> A native desktop terminal emulator with multi-session PTY management, AI command assistance, command history persistence, and environment variable control — embedded in the AGI Workforce desktop app.

## Where It Lives

| Layer | Location |
|-------|----------|
| Frontend Components | `apps/desktop/src/components/Terminal/Terminal.tsx` |
| | `apps/desktop/src/components/Terminal/TerminalWorkspace.tsx` |
| | `apps/desktop/src/components/Terminal/TerminalAIAssistant.tsx` |
| Stores | `apps/desktop/src/stores/terminalStore.ts` — primary terminal store (sessions, shells, AI actions) |
| | `apps/desktop/src/stores/chat/toolStore.ts` — tracks `TerminalCommand` entries emitted by the agentic loop |
| Hooks | `apps/desktop/src/hooks/useTerminal.ts` — imperative hook wrapping all IPC calls |
| | `apps/desktop/src/hooks/useFileTerminalEvents.ts` — listens for `agi:terminal_command` events from the agent loop |
| Slash Command Integration | `apps/desktop/src/handlers/slashCommandHandlers.ts` — `/run` slash command uses `execute_terminal_command` one-shot path |
| Rust Commands | `apps/desktop/src-tauri/src/sys/commands/terminal.rs` — all `#[tauri::command]` handlers |
| Rust Core Logic | `apps/desktop/src-tauri/src/features/terminal/mod.rs` — module root |
| | `apps/desktop/src-tauri/src/features/terminal/pty.rs` — PTY session lifecycle via `portable_pty` |
| | `apps/desktop/src-tauri/src/features/terminal/session_manager.rs` — session registry, output streaming, history DB writes |
| | `apps/desktop/src-tauri/src/features/terminal/shells.rs` — shell detection and default shell resolution |
| | `apps/desktop/src-tauri/src/features/terminal/ai_assistant.rs` — AI command suggestion, error explanation, smart commit |
| | `apps/desktop/src-tauri/src/features/terminal/tests.rs` — module-level unit tests |
| Security | `apps/desktop/src-tauri/src/sys/security/command_validator.rs` — validates all commands before execution |
| | `apps/desktop/src-tauri/src/sys/security/log_redaction.rs` — redacts secrets from tracing logs |
| Data | `apps/desktop/src-tauri/src/data/db/migrations.rs` — `command_history` table (migration v3, `session_id` column added in migration v54) |
| State Registration | `apps/desktop/src-tauri/src/lib.rs` — `SessionManager` and `TerminalAI` managed state setup (lines 377–386) |
| Tests | `apps/desktop/src/hooks/__tests__/useTerminal.test.ts` |
| | `apps/desktop/src/stores/__tests__/terminalStore.test.ts` |

---

## Data Flow

### Path 1: Interactive PTY Session (primary UI path)

1. **Shell Detection** — On mount, `TerminalWorkspace` calls `useTerminalStore.loadAvailableShells()`, which invokes `terminal_detect_shells`. Rust calls `detect_available_shells()` in `shells.rs`, probing the system with `which::which()` for each known shell binary. Returns `Vec<ShellInfo>` with `shell_type`, `name`, `path`, `available` fields. The store sets `availableShells`.

2. **Auto-spawn** — `TerminalWorkspace` has a `useEffect` that fires once `availableShells` is populated and no sessions exist. It prefers `zsh`, falls back to `bash`, then any available shell, and calls `handleCreateSession(shellType)`.

3. **Session Creation** — `handleCreateSession` calls `useTerminalStore.createSession(shellType)`, which invokes `terminal_create_session` with `{ shellType, cwd }`. Rust `SessionManager.create_session()` checks the 50-session cap, creates a `PtySession` via `portable_pty::NativePtySystem`, spawns the shell process on the PTY slave, and immediately calls `start_output_stream()`. A UUID session ID is returned.

4. **Output Streaming** — `start_output_stream()` spawns a dedicated `tokio::spawn` task. Every 50ms it locks the session, reads up to 4096 bytes from the PTY master, and emits the event `terminal-output-{sessionId}` with payload `{ stream: "stdout", data: "<utf8_text>" }`. When the shell process exits it emits `terminal-exit-{sessionId}` and removes the session from the backend map.

5. **Frontend Listener Setup** — After `createSession` resolves, `Terminal.tsx` mounts and calls `useTerminalStore.setupOutputListener(sessionId, callback, onExit)`. This registers two Tauri event listeners: `terminal-output-{sessionId}` (writes raw data to the xterm.js instance) and `terminal-exit-{sessionId}` (removes the session from store state, calls `onExit` callback, shows toast).

6. **xterm.js Rendering** — `Terminal.tsx` creates an `XTerm` instance on mount with `FitAddon`, `WebLinksAddon`, `SearchAddon`, and optionally `WebglAddon`. The `onData` handler from xterm.js (user keystrokes) calls `useTerminalStore.sendInput(sessionId, data)`.

7. **Input Sending** — `sendInput` in the store first checks the input against a client-side dangerous pattern list (e.g., `rm -rf /`, `format c:`) and shows a `window.confirm()` dialog if matched. Then invokes `terminal_send_input` with `{ sessionId, data }`. Rust validates the session ID format (alphanumeric/dash/underscore, 1-128 chars), enforces a 1MB data cap, runs `validate_interactive_input()` from `command_validator.rs`, and calls `session.write(data)` on the PTY master writer. If the input ends with `\n`, the trimmed command is asynchronously logged to the `command_history` SQLite table via `log_command_to_db()`.

8. **Resize** — `Terminal.tsx` uses a `ResizeObserver` on its container div and subscribes to `window.resize`. On any resize event it calls `FitAddon.fit()` to compute the new `{ cols, rows }` then calls `useTerminalStore.resizeTerminal(sessionId, cols, rows)` → `invoke('terminal_resize', { sessionId, cols, rows })`. Rust validates bounds (min 1x1, warns on cols > 1000 or rows > 500) then calls `session.resize(cols, rows)` on the PTY master.

9. **Session Close** — `handleCloseSession` calls `useTerminalStore.closeSession(sessionId)`. The store first calls `removeOutputListener` (unregisters Tauri event listeners), then invokes `terminal_kill` → Rust `SessionManager.kill_session()` removes the session from the map and calls `child.kill()` on the PTY child process. The store removes the session from the `sessions` array and advances `activeSessionId` to the next available session.

### Path 2: One-Shot Command Execution (slash command `/run` and Canvas code execution)

1. User types `/run <command>` in the chat input, or the Canvas store executes code.
2. `executeTerminalCommand(command, messageId)` in `slashCommandHandlers.ts` is called. It creates a `panelId`/`streamId` UUID pair and an `InlinePanel` with `type: 'terminal'`.
3. If `messageId` is absent (no streaming target), it calls `invoke('execute_terminal_command', { command, cwd: null, shell: null })` synchronously and populates the panel with the returned `{ stdout, stderr, exitCode, durationMs }`.
4. If `messageId` is present (streaming mode), it registers listeners for `terminal-output-{streamId}` and `terminal-exit-{streamId}`, then calls `invoke('execute_terminal_command', { command, cwd, shell, streamId, emitEvents: true })` without awaiting. Streaming output updates the inline panel via `useChatStore.updateInlinePanel()`.
5. On the Rust side, `execute_terminal_command` validates the command with `ValidationConfig::oneshot()` (strict: blocks `;`, `&`, `<`, `>`), checks if it `requires_confirmation()` (bulk/system patterns) and if so calls `request_confirmation_simple()`, resolves the shell binary and args (POSIX: `["<shell>", "-lc", "<cmd>"]`, Windows: `["powershell", "-Command", "<cmd>"]`), spawns the child process, and reads stdout/stderr concurrently in two `tokio::spawn` tasks. A configurable timeout (default 60s) is applied; exceeding it kills the child. If `emit_events` is true, 4096-byte chunks are emitted as `terminal-output-{streamId}`. The function returns `ExecuteResult` with `{ stdout, stderr, exit_code, duration_ms, stream_id }`.

### Path 3: AI Assistant Actions

1. **Command Suggestion** — User types an intent in `TerminalAIAssistant`, clicks "Suggest". Component calls `terminalStore.aiSuggestCommand(intent, shellType, cwd)` → `invoke('terminal_ai_suggest_command', { intent, shellType, cwd })`. Rust `TerminalAI.suggest_command()` builds a prompt instructing the LLM to produce a single executable command, sends it to `LLMRouter.send_message()`, strips markdown code fences from the response, and returns the clean command string. The component then calls `terminalStore.aiSuggestImprovements(command, shellType)` for a second LLM pass to detect security/performance issues.

2. **Execute Suggested Command** — When the user clicks "Execute", the `onCommandSelect` prop callback is called (provided by `TerminalWorkspace`), which calls `useTerminalStore.sendInput(activeSessionId, command + '\n')` to write the AI-suggested command into the active PTY session.

3. **Smart Commit** — User clicks "Smart Commit". Component calls `terminalStore.smartCommit(sessionId)` → `invoke('terminal_smart_commit', { sessionId })`. Rust `TerminalAI.smart_commit()` looks up the session's `cwd` via `SessionManager.get_session_context()`, runs `git diff --cached` and `git diff --cached --name-only` via `tokio::process::Command` (not through the PTY), sends the diff+filenames to the LLM for a conventional commit message, then runs `git commit -m "<generated_message>"` with a "Generated with AGI Workforce / Co-Authored-By" trailer. Returns the commit output string.

4. **Error Explanation** — Exposed through `terminalStore.aiExplainError(errorOutput, command?, shellType)` → `invoke('terminal_ai_explain_error', { errorOutput, command, shellType })` → `TerminalAI.explain_error()`. Note: this function is wired in the store and hook but is **not yet surfaced** in any component UI — `TerminalAIAssistant` does not include an error explanation input. It is available for future use.

### Path 4: Agent Loop Terminal Events (agentic chat integration)

When the agentic loop executes a shell command as a tool call, the Rust core emits an `agi:terminal_command` event. `useFileTerminalEvents` (extracted from `useAgenticEvents.ts`) listens for this event and adds it to the `toolStore.terminalCommands` array via `addTerminalCommand()`. These entries are displayed in the chat sidecar action log and are capped at 200 entries. This path is separate from the interactive PTY — it tracks tool-invoked commands, not user-typed ones.

### Command History Retrieval

`TerminalWorkspace` has a History sidebar panel. When toggled, it calls `useTerminalStore.getHistory(sessionId, 100)` → `invoke('terminal_get_history', { sessionId, limit })`. Rust queries the `command_history` table filtered by `session_id`, ordered by `created_at DESC`, limited to `N` rows. Returns `Vec<String>`. The workspace renders each entry with a "Run" button that calls `sendInput(activeSessionId, command + '\n')`.

---

## Rust Commands (IPC)

All commands are registered in `lib.rs` and implemented in `apps/desktop/src-tauri/src/sys/commands/terminal.rs`. Tauri auto-converts snake_case Rust parameter names to camelCase for TypeScript `invoke()` calls.

| Command | TypeScript invoke key | Key Parameters | Return Type | Description |
|---|---|---|---|---|
| `execute_terminal_command` | `execute_terminal_command` | `command: String`, `cwd: Option<String>`, `shell: Option<String>`, `streamId: Option<String>`, `emitEvents: Option<bool>`, `timeoutMs: Option<u64>` | `ExecuteResult { stdout, stderr, exitCode, durationMs, streamId }` | One-shot command execution with optional SSE streaming. Validates with `oneshot` mode. |
| `terminal_execute` | `terminal_execute` | `command: String`, `workingDir: Option<String>` | `TerminalExecuteResult { stdout, stderr, exit_code }` | Simplified one-shot wrapper used by Canvas store. Uses default shell. |
| `terminal_detect_shells` | `terminal_detect_shells` | _(none)_ | `Vec<ShellInfo>` | Probes system PATH for available shells using `which`. |
| `terminal_create_session` | `terminal_create_session` | `shellType: String`, `cwd: Option<String>` | `String` (session UUID) | Creates PTY session, starts output streaming task. Max 50 sessions. |
| `terminal_send_input` | `terminal_send_input` | `sessionId: String`, `data: String` | `()` | Writes data to PTY master. Validates session ID format, enforces 1MB cap, runs interactive command validation. Logs completed commands to DB. |
| `terminal_resize` | `terminal_resize` | `sessionId: String`, `cols: u16`, `rows: u16` | `()` | Resizes PTY. Bounds: min 1x1, warns if cols > 1000 or rows > 500. |
| `terminal_kill` | `terminal_kill` | `sessionId: String` | `()` | Kills shell process and removes session from backend map. |
| `terminal_list_sessions` | `terminal_list_sessions` | _(none)_ | `Vec<String>` (session IDs) | Returns all live session IDs from the backend map. |
| `terminal_get_history` | `terminal_get_history` | `sessionId: String`, `limit: Option<usize>` (default 50) | `Vec<String>` | Queries `command_history` table filtered by session. |
| `terminal_clear_history` | `terminal_clear_history` | `sessionId: String` | `()` | Runs shell-appropriate history clear command in-session. |
| `terminal_set_env` | `terminal_set_env` | `sessionId: String`, `key: String`, `value: String` | `()` | Executes `export KEY='VALUE'` (or PowerShell/Cmd equivalent) in PTY. |
| `terminal_get_env` | `terminal_get_env` | `sessionId: String`, `key: String` | `Option<String>` | Executes `echo $KEY` and returns trimmed output. |
| `terminal_list_env` | `terminal_list_env` | `sessionId: String` | `Vec<(String, String)>` | Runs `env` (or PowerShell/Cmd equivalent), parses KEY=VALUE lines. |
| `terminal_unset_env` | `terminal_unset_env` | `sessionId: String`, `key: String` | `()` | Executes `unset KEY` (or PowerShell/Cmd equivalent). |
| `terminal_ai_suggest_command` | `terminal_ai_suggest_command` | `intent: String`, `shellType: String`, `cwd: Option<String>` | `String` | LLM generates a single executable command from natural language intent. |
| `terminal_ai_explain_error` | `terminal_ai_explain_error` | `errorOutput: String`, `command: Option<String>`, `shellType: String` | `String` | LLM explains terminal error with step-by-step fix suggestions. |
| `terminal_smart_commit` | `terminal_smart_commit` | `sessionId: String` | `String` | Runs `git diff --cached`, generates conventional commit message via LLM, executes `git commit`. |
| `terminal_ai_suggest_improvements` | `terminal_ai_suggest_improvements` | `command: String`, `shellType: String` | `Option<String>` | LLM audits a command for security/performance issues. Returns `null` if command is "OK". |

### Tauri Events (Rust → Frontend)

| Event Name | Payload | Consumer |
|---|---|---|
| `terminal-output-{sessionId}` | `{ stream: "stdout", data: String }` | `terminalStore.setupOutputListener` → xterm.js `.write()` |
| `terminal-exit-{sessionId}` | `()` | `terminalStore.setupOutputListener` → removes session from store |
| `terminal-output-{streamId}` | `{ stream: "stdout" \| "stderr", data: String }` | `slashCommandHandlers.executeTerminalCommand` streaming path → updates `InlinePanel` |
| `terminal-exit-{streamId}` | `{ exit_code: Option<i32> }` | `slashCommandHandlers.executeTerminalCommand` → finalizes panel |
| `agi:terminal_command` | `{ command: TerminalCommand, messageId?: string }` | `useFileTerminalEvents` → `toolStore.addTerminalCommand()` |

---

## Store Schema

### `useTerminalStore` (`apps/desktop/src/stores/terminalStore.ts`)

Middleware stack: `devtools` + `persist` + `subscribeWithSelector`.

Persisted to `localStorage` under key `terminal-storage` (version 1). Only `availableShells` is persisted; sessions and listeners are transient.

```
TerminalSession {
  id: string                    // UUID
  shellType: ShellTypeLiteral   // 'zsh' | 'bash' | 'fish' | 'sh' | 'powershell' | 'cmd' | 'wsl' | 'gitbash' | 'default'
  title: string                 // Display label e.g. "zsh - a1b2c3d4"
  cwd?: string                  // Working directory at creation time
  active: boolean               // Always true for live sessions (exit removes the entry)
  createdAt: number             // Date.now() at creation
}

ShellInfo {
  name: string                  // Human-readable e.g. "Zsh"
  path: string                  // Absolute binary path e.g. "/bin/zsh"
  available: boolean            // Always true (unavailable shells are excluded from list)
  shell_type: ShellTypeLiteral
}

TerminalState {
  sessions: TerminalSession[]           // All live sessions (capped at 20)
  activeSessionId: string | null        // Currently visible tab
  availableShells: ShellInfo[]          // Persisted; refreshed on mount
  listeners: Map<string, UnlistenFn[]>  // sessionId → [outputUnlisten, exitUnlisten]; never persisted
}
```

Actions: `loadAvailableShells`, `createSession`, `closeSession`, `setActiveSession`, `sendInput`, `resizeTerminal`, `getHistory`, `setupOutputListener`, `removeOutputListener`, `getSessionById`, `reset`, `aiSuggestCommand`, `aiExplainError`, `smartCommit`, `aiSuggestImprovements`.

Exported selectors: `selectTerminalSessions`, `selectActiveSessionId`, `selectAvailableShells`, `selectTerminalListeners`, `selectActiveSession`, `selectSessionById`, `selectSessionCount`, `selectHasActiveSessions`, `selectAvailableShellTypes`, `selectShellByType`.

### `useToolStore` (`apps/desktop/src/stores/chat/toolStore.ts`) — terminal-related slice

```
TerminalCommand {
  id: string
  command: string
  cwd: string
  exitCode?: number
  stdout?: string
  stderr?: string
  timestamp: Date
  sessionId?: string
  agentId?: string
  goalId?: string
}
```

Actions: `addTerminalCommand(cmd)`, `updateTerminalOutput({ command_id, stdout, stderr, exit_code? })`.

Selectors: `selectTerminalCommands`, `selectSuccessfulTerminalCommands` (exitCode === 0), `selectFailedTerminalCommands` (exitCode defined and non-zero).

Cap: 200 entries (AUDIT-006-017).

---

## Component Tree

```
TerminalWorkspace
├── Toolbar (role="toolbar")
│   ├── TerminalIcon + "Terminal" label + session count badge
│   ├── History toggle Button
│   ├── Refresh Button (visible when history panel open)
│   └── DropdownMenu "New Terminal"
│       └── DropdownMenuItem per available shell (filtered to available=true)
├── Session Tab Bar (horizontal scroll, visible when sessions.length > 0)
│   └── Tab per session
│       ├── TerminalIcon
│       ├── session.title (monospace)
│       └── Close Button (X, hover-revealed)
├── Main Content Area (flex-1)
│   ├── [when activeSession exists]
│   │   ├── Terminal (key=activeSession.id)  ← xterm.js container
│   │   │   └── <div ref={terminalRef}> — xterm opens here
│   │   └── [when isHistoryOpen]
│   │       └── History Sidebar (aside, w-80)
│   │           ├── Header (session title + count)
│   │           └── ScrollArea
│   │               └── HistoryEntry[] (monospace code + "Run" button on hover)
│   └── [when no session]
│       └── Empty State (icon + "No Terminal Sessions" + New Terminal DropdownMenu)
└── Status Bar (visible when activeSession exists)
    ├── "Shell: {shellType}" + "CWD: {cwd}"
    └── "Session: {id.slice(0,8)}" + "History visible" indicator
```

`TerminalAIAssistant` is a standalone card component used alongside the workspace (not currently embedded inside `TerminalWorkspace`):

```
TerminalAIAssistant
├── CardHeader ("Terminal Assistant" + Sparkles icon)
└── CardContent
    ├── Intent Input + Suggest Button
    ├── Context Badges (shellType, cwd)
    ├── Error Banner (AlertTriangle, conditional)
    ├── Suggested Command Block (conditional)
    │   ├── <pre><code> command display
    │   └── Execute / Copy / Cancel Buttons
    ├── Improvement Suggestions Block (conditional, yellow warning)
    └── Smart Commit Button (bottom border-t separator)
```

---

## Key Patterns

### Dual execution modes

The terminal feature has two fundamentally different execution modes that must not be confused:

- **Interactive PTY** (`terminal_create_session` + `terminal_send_input`): A persistent pseudo-terminal with full shell interactivity, job control, and streaming output. Used by the `TerminalWorkspace` UI. The PTY child process stays alive across multiple inputs. History is logged on each newline-terminated input.
- **One-shot subprocess** (`execute_terminal_command`, `terminal_execute`): A fresh `tokio::process::Command` spawn per invocation. No interactivity. Used by `/run` slash commands and Canvas code execution. Returns captured stdout/stderr with optional SSE streaming.

### Security layering

Security is enforced at three independent layers:

1. **Frontend (store)**: `sendInput` in `terminalStore.ts` matches against a client-side hardcoded list of 10 destructive patterns and shows `window.confirm()`. This is a UX guard only — it can be bypassed.
2. **Rust one-shot validation** (`ValidationConfig::oneshot()`): Blocks shell metacharacters `;`, `&`, `<`, `>`, all 50+ dangerous patterns from `DANGEROUS_PATTERNS`, null bytes, and commands exceeding 65,536 characters. Allows `|` (pipe) to permit common read-only patterns like `ls | head`.
3. **Rust interactive validation** (`ValidationConfig::interactive()`): Only blocks `DANGEROUS_PATTERNS` and null bytes. Shell operators are allowed (the user needs them for interactive work).

Additionally, `requires_confirmation()` checks for bulk modification patterns (e.g., `rm -rf`, `git reset --hard`, `chmod`) and triggers a UI confirmation dialog for one-shot execution.

Secrets in commands are redacted before tracing via `redact_secrets()` in `log_redaction.rs`.

### Session identity propagation

Session IDs are UUID strings generated in `PtySession::new()`. They flow through: PTY creation → `SessionManager` map key → Tauri event names (`terminal-output-{id}`, `terminal-exit-{id}`) → frontend store `sessions` array and `listeners` map → xterm.js `Terminal` component's `key` prop (forcing remount on session switch). The `command_history` table stores `session_id` as a column (added in migration v54) so history is always scoped per session.

### Listener lifecycle management

Tauri event listeners are stored in `terminalStore.listeners: Map<string, UnlistenFn[]>`. Each session gets exactly two unlisten functions (output + exit). The pattern for safe cleanup is:

- `setupOutputListener` calls `removeOutputListener` first (idempotent deregistration), then registers fresh listeners.
- `removeOutputListener` atomically removes from the map inside `set()` then calls the unlisten functions outside `set()` (avoids side effects during state update).
- `closeSession` calls `removeOutputListener` before invoking the Rust kill command.
- `reset()` iterates the full `listeners` map and calls all unlisten functions before wiping state.
- `Terminal.tsx` cleanup effect calls `removeOutputListener` and `xterm.dispose()`.

This prevents memory leaks and duplicate event listeners on hot reloads or React strict mode double-invocation.

### Session cap enforcement

The frontend caps at 20 concurrent sessions (AUDIT-006-021): when a 21st session is created, the oldest inactive session is evicted silently. The backend `SessionManager` caps at 50 (AUDIT-004-005) and returns an error if exceeded. These limits are independent and the frontend limit is stricter.

### AI integration architecture

`TerminalAI` holds its own dedicated `Arc<LLMRouter>` (instantiated in `lib.rs` separately from the main chat router) and an `Arc<SessionManager>`. All AI operations use `LLMRouter.send_message()` with `None` for conversation context — they are stateless single-shot LLM calls, not streaming. The `smart_commit` operation is the only AI action that has side effects: it actually executes `git commit`.

### Shell-aware environment operations

Environment variable get/set/list/unset all work by executing shell-specific commands in the PTY via `PtySession.execute_command()`. This is a synchronous blocking approach: it writes the command, waits up to 2000ms for output matching a prompt-detection heuristic (`$`, `#`, `>`), then strips the command echo. This approach is fragile for slow or non-interactive shells and bypasses the normal async output streaming path.

### Theme reactivity

`Terminal.tsx` maintains two separate `useEffect` blocks for the xterm.js theme: one for the full 16-color dark/light palette on initial mount, and a lighter effect that only updates `background`, `foreground`, and `cursor` colors when the theme changes after mount (avoiding a full xterm reinitialize).

---

## Known Issues / Tech Debt

### Hard-coded OS string in AI prompts

`ai_assistant.rs` hard-codes `OS: Windows` in all three LLM prompts (`suggest_command`, `explain_error`, `suggest_improvements`). On macOS and Linux, the LLM receives incorrect OS context and may generate Windows-specific commands. This should use `std::env::consts::OS` to inject the actual OS.

### Shell detection is unreferenced for PTY command builder

`detect_available_shells()` in `shells.rs` uses `which::which()` to resolve full paths, but `get_shell_command()` in `pty.rs` (used when spawning the PTY) independently calls `which::which()` again. The detected paths from the frontend's `loadAvailableShells()` call are not passed through to `PtySession::new()`. This means two separate PATH lookups happen and the frontend's `ShellInfo.path` field is informational only.

### Environment variable operations via in-PTY execution

`set_env`, `get_env`, `list_env`, and `unset_env` all work by writing commands into the running PTY shell and reading back output. This approach is racey: there is no synchronization mechanism if the user is typing concurrently. The 2000ms timeout and prompt-heuristic detection in `PtySession.execute_command()` can fail for slow shells or non-standard prompts. A dedicated side-channel (e.g., `env` subprocess separate from the PTY) would be more reliable.

### `aiExplainError` has no UI surface

`terminal_ai_explain_error` is a fully implemented Rust command and is wired in both `terminalStore.ts` and `useTerminal.ts`, but `TerminalAIAssistant.tsx` has no input field to trigger it. The feature is dead code from the UI perspective.

### `terminal_clear_history` clears shell in-memory history but not the DB

`SessionManager.clear_history()` runs the shell's history-clear command (e.g., `history -c` for bash/zsh) inside the PTY, which clears the shell's in-memory history. However, it does not DELETE rows from the `command_history` SQLite table. The History sidebar panel will still show previously typed commands even after "clearing".

### `useTerminal` hook is partially redundant with the store

`apps/desktop/src/hooks/useTerminal.ts` re-implements most of `terminalStore.ts`: it has its own listener map, its own `createSession`/`closeSession`/`sendInput` wrappers, and its own `searchHistory` (done client-side by filtering `getHistory` results). Nothing in the current UI uses `useTerminal.ts` directly — `TerminalWorkspace` and `Terminal.tsx` both consume `useTerminalStore`. The hook is test-covered and exported but not integrated into any component, making it dead code from the perspective of the main UI.

### `listSessions` in `useTerminal.ts` creates synthetic sessions

`useTerminal.listSessions()` calls `terminal_list_sessions` (returns backend session IDs) and constructs stub `TerminalSession` objects with `shellType: 'default'` and `createdAt: Date.now()`. This loses the actual shell type and creation time metadata that the store tracks.

### Output stream polling at fixed 50ms interval

`start_output_stream()` in `session_manager.rs` uses `tokio::time::sleep(50ms)` between read attempts. This means terminal output latency is up to 50ms. A more responsive design would use `tokio::io::AsyncReadExt` on a properly async PTY reader rather than the `portable_pty` synchronous `try_clone_reader()` approach wrapped in a polling loop.

### PTY output is a polling reader, not async

`PtySession.read_output()` calls `try_clone_reader().read()` which is synchronous `std::io::Read`. This blocks the async task for the duration of the read. The session lock is held during this blocking read, preventing concurrent `send_input` on the same session while reading. The session lock should be released before the blocking I/O call.

### Frontend session cap evicts silently

When the 20th session is created, the store evicts the oldest inactive session without informing the user. The evicted session's Rust PTY process is not killed — only the frontend state entry is removed. The backend session will remain alive until the `terminal_kill` command is eventually called or the process exits on its own.

---

## Essential Files Reference

| File | Purpose |
|---|---|
| `/apps/desktop/src/components/Terminal/Terminal.tsx` | xterm.js mount, PTY I/O bridge, resize observer |
| `/apps/desktop/src/components/Terminal/TerminalWorkspace.tsx` | Multi-tab session manager, history panel, AI assistant host |
| `/apps/desktop/src/components/Terminal/TerminalAIAssistant.tsx` | AI command suggestion and smart commit UI |
| `/apps/desktop/src/stores/terminalStore.ts` | All frontend terminal state + IPC wrappers |
| `/apps/desktop/src/hooks/useTerminal.ts` | Imperative hook alternative (currently unused in UI) |
| `/apps/desktop/src/hooks/useFileTerminalEvents.ts` | Agent loop terminal command event listener |
| `/apps/desktop/src/handlers/slashCommandHandlers.ts` | /run slash command → one-shot execution + InlinePanel streaming |
| `/apps/desktop/src-tauri/src/sys/commands/terminal.rs` | All #[tauri::command] handlers with validation and security wiring |
| `/apps/desktop/src-tauri/src/features/terminal/pty.rs` | PTY session lifecycle (portable_pty wrapper) |
| `/apps/desktop/src-tauri/src/features/terminal/session_manager.rs` | Session registry, async output streaming, history DB writes |
| `/apps/desktop/src-tauri/src/features/terminal/shells.rs` | Shell detection and default shell resolution |
| `/apps/desktop/src-tauri/src/features/terminal/ai_assistant.rs` | TerminalAI: suggest, explain, smart commit, improve |
| `/apps/desktop/src-tauri/src/sys/security/command_validator.rs` | Centralized command security (dangerous patterns, metacharacters, operators) |
| `/apps/desktop/src-tauri/src/data/db/migrations.rs` | command_history table schema (line ~1197 in migration v3, session_id column added in migration v54) |
| `/apps/desktop/src-tauri/src/lib.rs` | SessionManager + TerminalAI managed state registration (lines 377–386) |
| `/apps/desktop/src/stores/chat/toolStore.ts` | TerminalCommand type + agent loop terminal tracking |

