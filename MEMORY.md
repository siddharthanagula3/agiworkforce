# AI Memory — AGI Workforce

Updated: 2026-03-07 — MASTER SPRINT PLAN v2 (Research-backed)

## Architecture Decisions (Locked)

- **Tauri v2**: Desktop runtime. camelCase IPC always.
- **SQLite + Argon2id**: Local encrypted storage via SecretManager
- **ToolGuard**: All tool execution sandboxing and permission checks
- **MCP Protocol version**: `2025-11-25` (latest). Streamable HTTP replaces SSE.
- **Cloud model routing**: Internal auto-routing; Custom Models = user-provided endpoints only
- **camelCase IPC**: ALL Tauri invoke() calls use camelCase params. snake_case = silent fail.

## Confirmed Bugs (to fix)

| #   | File                                   | Line     | Bug                     | Fix         |
| --- | -------------------------------------- | -------- | ----------------------- | ----------- |
| 1   | `src/api/reflection.ts`                | 208      | `goal_id: goalId`       | `goalId`    |
| 2   | `src/api/ollama.ts`                    | 170      | `model_name: modelName` | `modelName` |
| 3   | `src/hooks/useMCP.ts`                  | 370      | `new_config: newConfig` | `newConfig` |
| 4   | `src-tauri/src/core/llm/llm_router.rs` | 10 spots | `"gpt-5.2"`             | `"gpt-4o"`  |

**Previously reported as bugs but CONFIRMED CLEAN:**
useTerminal.ts, agi_checkpoint.ts, memory.ts, automation.ts, automationEnhanced.ts,
mcp.ts, workflow.ts, accountApi.ts, productivityStore.ts, useApprovalActions.ts,
backgroundTasks.ts, chat.ts — ALL use camelCase correctly.

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

### Agent UX Patterns from OpenCode/Claude Code

- Color-code each agent (hex color in UI)
- `steps: N` budget shown in UI (progress toward limit)
- Background agents need pre-approval before backgrounding
- Session hierarchy: parent → child sessions, navigable with breadcrumbs
- Custom statusMessage per hook (semantic spinner text)
- `/thinking` toggle for visibility
- Tab key to switch between Build/Plan modes

### VS Code Extension State (from reading extension.ts)

- `agentModeProvider.ts` (847 lines) — full multi-file agent webview exists
- `planMode` config property is declared but NOT wired in extension.ts
- `mcp.enabled` config property declared but NOT wired
- Desktop bridge: exists in `desktopBridge.ts`, off by default (port 8787)
- Chat participant `@agi` is fully implemented with streaming
- Inline completions: implemented with debounce + cache

### Chrome Extension State (from reading source)

- `background.ts`: 964 lines, native messaging, context menu "Ask AGI Workforce"
- `content.ts`: 1231 lines, 15 automation action types, floating overlay FAB
- `side_panel.ts`: 146 lines, ONLY shows message queue — NO chat interface yet
- Missing: Full AI chat in side panel, web search display, voice input

### Mobile Chat Components (from reading source)

- `ReasoningAccordion.tsx` — EXISTS (auto-expand during streaming, auto-collapse after)
- `ToolCallCard.tsx` — EXISTS (status border, tool icon mapping, expandable I/O)
- `StatusStep.tsx` — EXISTS (agent step cards with pulsing indicator)
- `ApprovalCard.tsx` — EXISTS (risk-level, countdown, haptics)
- Missing: Voice pipeline wired end-to-end, @file mentions, MCP tools via API

### Web App State (from reading source)

- `features/chat/` has components/, hooks/, services/, stores/, types/, utils/
- `app/chat/[sessionId]/` exists with layout
- Marketing page (app/page.tsx) 368 lines — good landing page
- Missing: Full streaming chat parity with desktop, voice, tool display

## SPRINT STATUS — ALL 8 TRACKS COMPLETE ✅ (2026-03-07)

### TRACK 1: BUG FIXES ✅ DONE

- reflection.ts:208 `goal_id` → `goalId` ✓
- ollama.ts:170 `model_name` → `modelName` ✓
- useMCP.ts:370 `new_config` → `newConfig` ✓
- llm_router.rs: 9× `"gpt-5.2"` → `"gpt-4o"`, 1× `"gpt-5.2-codex-high"` → `"o3"` ✓

### TRACK 2: REASONING + TOOL STATUS UI ✅ DONE

- `ThinkingBlock.tsx` — collapsible, Brain icon, auto-collapse after streaming, AnimatePresence
- `ToolCallCard.tsx` — 4-state (pending/running/complete/error), live elapsed timer, collapsible result
- `AgentStepTimeline.tsx` — vertical timeline, color-coded agent types, click to expand steps
- `ToolTimeline.tsx` — updated to render ToolCallCard for each tool call entry
- `chatStore.ts` — added `thinkingByMessage` state + `appendThinkingContent` / `clearThinkingContent` actions
- `ChatStream.tsx` — wired ThinkingBlock above assistant messages when thinking content exists
- `index.tsx` (main chat) — `thinking:event` Tauri listener wired

### TRACK 3: VOICE GLOBAL LAYER ✅ DONE

- `voice_global.rs` — Rust module: `voice_start_global_ptt`, `voice_stop_global_ptt`, `voice_inject_text`
  - Uses `rdev` for OS-level fn-key hook; `enigo` for text injection into focused field
  - Requires macOS Accessibility permission (already in-app)
- `useGlobalVoicePTT.ts` — TypeScript hook: starts Rust listener, handles `voice:ptt-start`/`voice:ptt-stop` events
- Web voice: `VoiceInputButton.tsx` — Web Speech API, 3 states, graceful degradation
- Mobile voice: `VoicePTT.tsx` — hold-to-record, Deepgram Nova-3, haptics, animated ring

### TRACK 4: VS CODE EXTENSION ✅ DONE

- `agentModeProvider.ts` — added `setPlanMode(bool)` method, posts `planModeChanged` to webview
- `extension.ts` — wired planMode config → agentModeProvider; mcp.enabled → desktopBridge connect/disconnect; new commands: `agi.git.status`, `agi.git.diff`, `agi.git.commit`, `agi.test.run`
- `package.json` — desktop bridge default changed to `true`; new commands registered

### TRACK 5: CHROME EXTENSION FULL SIDEBAR ✅ DONE

- `side_panel.ts` — completely replaced (876 lines): full streaming chat UI, markdown renderer, page context capture, Web Speech API voice, dark theme
- `side_panel.html` — simplified shell
- `types.ts` — added `CHAT_MESSAGE`, `CHAT_CHUNK` message types
- `background.ts` — added `handleChatMessage()`: streams via localhost:8765, falls back to native messaging

### TRACK 6: WEB — STREAMING CHAT PARITY ✅ DONE

- `ToolCallCard.tsx` — web-native 4-state tool card (Tailwind, no Tauri/framer deps)
- `VoiceInputButton.tsx` — Web Speech API voice input, 3 states, graceful degradation
- `ThinkingBlock.tsx` — CSS-transition version (no framer-motion), auto-collapse
- `ArtifactBlock.tsx` — detects + renders html/csv/json/mermaid/code blocks
- `ChatComposer.tsx` — VoiceInputButton wired in toolbar
- `MessageBubble.tsx` — ThinkingBlock + ArtifactBlock wired into message render

### TRACK 7: MOBILE — VOICE + PARITY ✅ DONE

- `VoicePTT.tsx` — hold-to-record, expo-av recording, Deepgram Nova-3 STT, haptics
- `useVoicePlayback.ts` — expo-speech TTS wrapper (speak/stop)
- `ChatInput.tsx` — VoicePTT wired in input row
- `[id].tsx` — useVoicePlayback wired: auto-reads each new assistant message; stops on send/back
- **Note**: Two mic buttons now visible (VoiceInputButton + VoicePTT) — consider unifying; add `EXPO_PUBLIC_DEEPGRAM_API_KEY` env var

### TRACK 8: DESKTOP UX — REASONING DISPLAY ✅ DONE

- ThinkingBlock + ToolCallCard both wired into ChatStream/ToolTimeline (covered in Track 2 above)

## NEXT SPRINT IDEAS

- Unify mobile voice buttons (one mic, two backends)
- Add EXPO_PUBLIC_DEEPGRAM_API_KEY to env setup docs
- System tray "Hold fn to speak" quick action
- Push notifications for agent task completion (mobile)
- Share session links UI (web) — API exists at /api/share
- MultiAgentStatusPanel (parallel agent display)
- Agent color coding in AgentStepTimeline

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
| gpt-5.2 error         | Replace with "gpt-4o" in llm_router.rs                              |
