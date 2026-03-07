# AI Memory — AGI Workforce

Updated: 2026-03-07 — BUG FIX MEGA-SPRINT v3 (170+ bugs fixed)

## Architecture Decisions (Locked)

- **Tauri v2**: Desktop runtime. camelCase IPC always.
- **SQLite + Argon2id**: Local encrypted storage via SecretManager
- **ToolGuard**: All tool execution sandboxing and permission checks
- **MCP Protocol version**: `2025-11-25` (latest). Streamable HTTP replaces SSE.
- **Cloud model routing**: Internal auto-routing; Custom Models = user-provided endpoints only
- **camelCase IPC**: ALL Tauri invoke() calls use camelCase params. snake_case = silent fail.

## Research Findings (March 2026)

### Reasoning Display Pattern (ALL tools converge on this)

```
Phase 1: THINKING  → thinking_delta events → dim/italic text, collapsible
Phase 2: TOOL CALL → content_block_start tool_use → tool card (pending state)
Phase 3: EXECUTING → input_json_delta streaming args → tool card (running state)
Phase 4: RESULT    → tool_result block → collapsed result, expandable
Phase 5: ANSWER    → text_delta → normal streaming text
```

### Anthropic Extended Thinking SSE Events

- `thinking_delta` — stream thinking before answer
- `signature_delta` — cryptographic proof (must preserve multi-turn)
- Claude 4+ returns SUMMARIZED thinking (not raw)
- `budget_tokens: 10000` in API params
- Thinking blocks come BEFORE text in content array

### Tool Status Card States (4 states)

1. `pending` — streaming args, spinner
2. `running` — executing, elapsed timer
3. `complete` — checkmark + duration + collapsed result
4. `error` — red X + error summary + expandable

### Voice Architecture (Confirmed APIs)

- STT: Deepgram Nova-3 WebSocket ($0.0043/min) or Web Speech API (free, Chrome/Edge)
- TTS: Cartesia Sonic-Turbo (40ms TTFB, $0.015/1k chars) — fastest for real-time
- Mobile: expo-audio for recording, expo-speech for TTS
- Desktop fn key: `rdev` crate for global hook + `enigo` for text injection
- Text injection into any focused field: `enigo.text()` on desktop, `setRangeText` in browser
- Barge-in: Cartesia context cancel via `{ context_id, cancel: true }`

### MCP Protocol (2025-11-25)

- New fields: `title`, `outputSchema`, `structuredContent`, `resource_link`, audio type
- New: Elicitation primitive, Tasks (experimental), Streamable HTTP transport
- Browser extension MCP: HTTP transport only (no stdio subprocess)
- VS Code MCP: `.vscode/mcp.json` config, or register via `mcp.servers`
- Required MCP servers: filesystem, git, fetch, memory, sequential-thinking, playwright

### Real Model Strings (March 2026 — use these, not future fake ones)

| Provider  | Model ID                                                                            |
| --------- | ----------------------------------------------------------------------------------- |
| OpenAI    | `gpt-4o`, `gpt-4o-mini`, `o3`, `o1`                                                 |
| Anthropic | `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-3-opus-20240229` |
| Google    | `gemini-2.0-flash`, `gemini-2.0-pro-exp`, `gemini-2.0-flash-thinking-exp`           |
| xAI       | `grok-2-1212`                                                                       |
| Mistral   | `mistral-large-latest`, `mistral-medium-latest`, `mistral-small-latest`             |
| Moonshot  | `moonshot-v1-8k`                                                                    |

## COMPLETED SPRINTS

### SPRINT 1 (prev session): Foundation Bug Fixes + 8 Feature Tracks ✅

- reflection.ts, ollama.ts, useMCP.ts: IPC snake_case → camelCase ✓
- llm_router.rs: `gpt-5.2` → `gpt-4o` (original 10 occurrences) ✓
- ThinkingBlock, ToolCallCard, AgentStepTimeline components built ✓
- voice_global.rs Rust module + useGlobalVoicePTT.ts hook ✓
- Chrome extension full sidebar (876 lines) ✓
- VS Code extension planMode + mcp.enabled + git/test commands ✓
- Mobile VoicePTT unified + Deepgram Nova-3 ✓
- Web streaming chat parity (ThinkingBlock, ArtifactBlock, ToolCallCard web versions) ✓

### SPRINT 2 (this session): 170-Bug Mega-Fix ✅ DONE 2026-03-07

#### Critical/High fixes applied:

**Slash Command Handlers** (`slashCommandHandlers.ts`) — 28 wrong IPC command names fixed:

- `vision_capture_screen` → `vision_analyze_screenshot`
- `project_memory_search` → `search_project_memories`
- `project_memory_add_context` → `save_project_context`
- `project_memory_get_all_contexts` → `get_project_memories`
- `chat_memory_search` → `chat_search_memories`
- `background_agent_start` → `background_agent_push`
- `git_create_commit` → `git_commit` (+ `path: '.'`)
- `git_get_log` → `git_log` (+ `path: '.'`)
- `git_get_status` → `git_status` (+ `path: '.'`)
- `scheduler_list_tasks` → `scheduler_list_jobs`
- `scheduler_create_task` → `scheduler_add_job`
- `voice_synthesize` → `voice_tts_speak`
- `ocr_capture_and_extract` → `ocr_process_image`
- `notification_clear_all` → `notification_cancel_all`
- `notification_list_recent` → `notification_list`
- `lsp_search_symbols` → `lsp_workspace_symbol`
- `metrics_get_usage` → `metrics_get_system`
- `marketplace_install_workflow` → `clone_marketplace_workflow`
- `marketplace_list_featured` → `search_marketplace_workflows`
- `document_create_docx` → `document_create_word`
- `document_create_xlsx` → `document_create_excel`
- `prompt_enhance_prompt` → `enhance_prompt`
- `automation_stop_recording` → `automation_record_stop`
- `automation_start_recording` → `automation_record_start`
- browser commands: added `browserId` param

**useGlobalVoicePTT.ts**: imports changed from `@tauri-apps/api/*` to `../../lib/tauri-mock`; `isTauri` guard added

**tauri-mock.ts**: added mocks for `voice_start_global_ptt`, `voice_stop_global_ptt`, `voice_inject_text`, `glob_search`, `dir_list`, `extension_status`

**llm_router.rs**: 74 fake future model strings replaced with real current model IDs

**AgentModeSwitcher.tsx**: `ElementType` import added; `handleModeChange` wrapped in try/catch

**BudgetAlertsPanel.tsx**: null guard for `alertConfig`, `budgetAlerts`, dismiss `type="button"`

**index.tsx**: fixed `userMessageId` scope, project-command early return, thinking:event guard, watchdog isSlashCommand flag, `useUnifiedChatStore` → `useChatStore`

**CommandPalette.tsx**: `useUnifiedChatStore` → `useChatStore`; mutable `flatIdx` → `flatResults.indexOf()`; FTS5 i64 → UUID via `dbIdToUuid`

**Stores fixed**:

- `browserStore.ts`: `closeBrowser` now calls `invoke('browser_close')`
- `automationStore.ts`: `startRecording`/`stopRecording` now call backend
- `authOrchestrator.ts`: early-return moved before try block, `isProcessingAuthChange` unstuck
- `billingUsage.ts`: 7 `trackX` functions `throw` → `return` on null customer

**ChatInputToolbar.tsx**: incognito toggle now calls `updateConversation` with `{ incognito: !current }` instead of creating new conversation; aria attributes added

**ApprovalModal.tsx**: `isResolved` ref prevents double timeout rejections; `alwaysAllow` resets on approval change; ESC key triggers `handleReject`

**ProjectSettingsDialog.tsx**: `useUnifiedChatStore` → `useChatStore`; `autoSaveMemories` loaded + saved; "Add Files" uses real `@tauri-apps/plugin-dialog`; save error shows toast; icon picker renders Lucide icons

**Sidebar.tsx**: search overlay calls `setActiveView('chat')`; rename on empty title cancels properly; keyboard guard prevents sidebar keystrokes when input focused; collapsed search button expands sidebar first

**SendButton.tsx**: stop button shown even when `onStop=undefined` (disabled); send button disabled when `isSending=true`

**FileMentionPicker.tsx**: `querySelectorAll('[data-mention-item]')` fixes off-by-header scroll

**ShareConversationDialog.tsx**: separate `isCopying`/`isSaving` flags; split backend vs clipboard error messages; dialog auto-closes after successful save

**ThinkingBlock.tsx**: `userExpanded` ref prevents auto-collapse overriding manual expand; `content` null guard; duplicate `flex-1` removed

**ToolCallCard.tsx**: unique `key` per CollapsibleSection; timer resets on status → `running`

**MessageContextMenu.tsx**: click-away handler deferred with `setTimeout(0)`; viewport boundary clamping

**useVoiceTranscription.ts**: `isRecordingRef` prevents concurrent sessions; `MediaRecorder.stop()` on unmount; `configureImpl` doesn't override user-set provider; `isSupported` checks SpeechRecognition too

**useAgenticEvents.ts**: `rejectionReason ?? rejection_reason` handles both camelCase and snake_case from Rust

**Rust mod.rs**: `pub use voice_global::*;` added

**Rust test_runner.rs**: `_name` silences unused var; actual `timeout` enforced via channel recv_timeout

**Rust code_search.rs**: fallback to `dirs::home_dir()` instead of `PathBuf::from(".")`

**AgentStepTimeline.tsx**: dead ternary fixed; `<div role="button">` → `<button type="button">`; stagger delay capped at 500ms

**InputFooter.tsx**: `role="progressbar"` + `aria-value*`; `creditPercentage` clamped to 100; `hasTokenUsage` guards `tokenMax > 0`

**ToolTimeline.tsx**: `aria-expanded` added to toggle button

**MessageActions.tsx**: `type="button"` on all 11 buttons

## NEXT SPRINT IDEAS

- MessageBubble: `renderToolCall` uses `useSettingsStore.getState()` — convert to reactive selector
- MessageBubble: `useMcpAppStore.getState().registerApp()` called during render — move to useEffect
- MessageBubble: `useEffect` for sidecar depends on full `message` object — narrow deps
- MessageBubble: `parseInt(message.id, 10)` silently fails for UUID IDs
- useCreditRefresh: `isRefreshing`/`error` from refs — not reactive
- useMCP.ts: event listener cleanup not awaited
- useAgenticEvents.ts: 60+ listeners in sequential effect
- Rust BUG-5: `rdev::listen` callback `return` doesn't stop the thread
- BUG-MB-009: `parseInt(message.id)` fails for UUIDs
- MultiAgentStatusPanel (parallel agent display)
- Agent color coding in AgentStepTimeline
- System tray "Hold fn to speak" quick action
- Push notifications for agent task completion (mobile)

## Build Commands

```bash
pnpm dev              # Frontend-only
pnpm tauri dev        # Full desktop (Rust + React)
pnpm tauri build      # Produces platform installer
pnpm typecheck        # TS check only
pnpm lint && cargo clippy  # Full lint
# cd apps/extension-vscode && pnpm compile  # VS Code ext
# cd apps/extension && pnpm build            # Chrome ext
```

## Debugging Checklist

| Issue                 | Check                                                               |
| --------------------- | ------------------------------------------------------------------- |
| Tauri invoke fails    | Rust command has `#[tauri::command]` + registered in lib.rs         |
| snake_case IPC bug    | Convert ALL params to camelCase in invoke() call                    |
| MCP won't connect     | Server running + correct transport type (stdio vs HTTP)             |
| Web mode crash        | Check import is from lib/tauri-mock not @tauri-apps directly        |
| Voice not working     | Check mic permissions + Whisper model downloaded                    |
| Reasoning not showing | Check thinking: {type: "enabled", budget_tokens: 10000} in API call |
| Model 404 error       | Check llm_router.rs — use real model IDs from table above           |
