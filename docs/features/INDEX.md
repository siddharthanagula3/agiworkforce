# Feature Blueprint Index

> Single source of truth for how every feature works end-to-end in AGI Workforce.
> Each feature has a dedicated blueprint file in this directory.

_Last updated: 2026-03-10 | 34 blueprints fact-checked and corrected by 22 parallel agents_

---

## Feature Matrix

| # | Feature | Blueprint | Desktop | Web | Mobile | Primary Store(s) | Primary Rust Module |
|---|---------|-----------|---------|-----|--------|-------------------|---------------------|
| 1 | [Chat](./chat.md) | `chat.md` | Full | Full | Full | `unifiedChatStore`, `chat/chatStore` | `sys/commands/chat/`, `core/llm/` |
| 2 | [Agentic Mode](./agentic-mode.md) | `agentic-mode.md` | Full | Partial | View-only | `chat/toolStore`, `chat/agentStore` | `core/agent/`, `sys/commands/chat/tool_events.rs` |
| 3 | [MCP Tools](./mcp-tools.md) | `mcp-tools.md` | Full | Config | N/A | `mcpStore`, `mcpbStore`, `mcpServerStore` | `core/mcp/`, `sys/commands/mcp*.rs` |
| 4 | [Voice](./voice.md) | `voice.md` | Full | API | Partial | `voiceInputStore` | `sys/commands/voice.rs`, `features/speech/` |
| 5 | [Vision](./vision.md) | `vision.md` | Full | N/A | N/A | `computerUseStore` | `automation/`, `sys/commands/capture.rs` |
| 6 | [Browser Automation](./browser-automation.md) | `browser-automation.md` | Full | N/A | N/A | `browserStore`, `automationStore` | `automation/`, `sys/commands/browser.rs` |
| 7 | [Terminal](./terminal.md) | `terminal.md` | Full | N/A | N/A | `terminalStore` | `sys/commands/terminal.rs`, `features/terminal/` |
| 8 | [Files](./files.md) | `files.md` | Full | Upload | N/A | `filesystemStore`, `documentStore` | `sys/commands/file_ops.rs`, `document.rs` |
| 9 | [Memory](./memory.md) | `memory.md` | Full | CRUD+Search | N/A | `memoryStore` | `sys/commands/memory.rs`, `core/embeddings/` |
| 10 | [Connectors](./connectors.md) | `connectors.md` | Full | API | N/A | `connectorsStore`, `connectionStore` | `integrations/`, `sys/commands/mcp_oauth.rs` |
| 11 | [Scheduling](./scheduling.md) | `scheduling.md` | Full | CRUD | N/A | `schedulerStore` | `core/scheduler/`, `sys/commands/scheduler.rs` |
| 12 | [Settings](./settings.md) | `settings.md` | Full | Full | Partial | `settingsStore`, `appPreferencesStore` | `sys/commands/` (various) |
| 13 | [Billing](./billing.md) | `billing.md` | Sync | Full | View | `billingStore`, `subscriptionPlanStore` | `sys/billing/` |
| 14 | [Auth](./auth.md) | `auth.md` | Full | Full | Full | `auth`, `authCoreStore`, `authOrchestrator` | `sys/commands/auth.rs`, `sys/security/` |

---

## Sub-Feature Matrix

Detailed blueprints for specialized subsystems within the main features.

| # | Sub-Feature | Blueprint | Parent Feature | Primary Store(s) | Primary Rust Module |
|---|-------------|-----------|----------------|-------------------|---------------------|
| S1 | [LLM Router](./llm-router.md) | `llm-router.md` | Chat | `modelStore`, `llmConfigStore` | `core/llm/llm_router.rs` |
| S2 | [Swarm](./swarm.md) | `swarm.md` | Agentic Mode | `agentTaskStore` | `core/swarm/` |
| S3 | [Research](./research.md) | `research.md` | Chat | `researchStore` | `core/research/` |
| S4 | [Canvas](./canvas.md) | `canvas.md` | Chat | `artifactStore`, `canvasStore` | `sys/commands/canvas.rs` |
| S5 | [Security](./security.md) | `security.md` | Settings | `securityPreferencesStore` | `sys/security/` |
| S6 | [Skills](./skills.md) | `skills.md` | Chat | `skillMarketplaceStore` | `core/skills/` |
| S7 | [Computer Use](./computer-use.md) | `computer-use.md` | Vision | `computerUseStore` | `automation/computer_use/`, `sys/commands/computer_use.rs` |
| S8 | [Media Generation](./media-generation.md) | `media-generation.md` | Chat | `mediaGenerationStore` | `sys/commands/media.rs` |
| S9 | [Workflows](./workflows.md) | `workflows.md` | Scheduling | — | `core/orchestration/` |
| S10 | [Extensions](./extensions.md) | `extensions.md` | Browser Automation | — | `integrations/native_messaging/`, `sys/commands/extension.rs` |
| S11 | [Cloud Storage](./cloud-storage.md) | `cloud-storage.md` | Connectors | `cloudStore` | `sys/commands/cloud.rs` |
| S12 | [Email](./email.md) | `email.md` | Connectors | `emailStore` | `sys/commands/email.rs`, `features/email/` |
| S13 | [Git](./git.md) | `git.md` | Connectors | — | `sys/commands/git.rs` |
| S14 | [Teams](./teams.md) | `teams.md` | Settings | `teamStore` | `features/teams/` |
| S15 | [Notifications](./notifications.md) | `notifications.md` | Settings | — | `sys/commands/notifications.rs` |
| S16 | [Deep Linking](./deep-linking.md) | `deep-linking.md` | Auth | — | `ui/deep_link.rs` |
| S17 | [Custom Instructions](./custom-instructions.md) | `custom-instructions.md` | Chat | `customInstructionsStore` | `sys/commands/custom_instructions.rs` |
| S18 | [Embeddings](./embeddings.md) | `embeddings.md` | Memory | — | `core/embeddings/` |
| S19 | [Analytics](./analytics.md) | `analytics.md` | Settings | `analyticsMetricsStore` | `sys/commands/analytics.rs`, `sys/commands/metrics.rs` |
| S20 | [Updater](./updater.md) | `updater.md` | Settings | `updaterStore` | `features/updater.rs`, `sys/security/updater.rs` |

---

## Store-to-Feature Map

All 60 Zustand stores mapped to the feature they primarily serve.

### Chat & Agentic (Features 1-2)
| Store | Feature | Purpose |
|-------|---------|---------|
| `unifiedChatStore.ts` | Chat | Main chat state: conversations, messages, active session |
| `chat/chatStore.ts` | Chat | Chat message management, branching, regeneration |
| `chat/agentStore.ts` | Agentic | Agent loop state, plan steps, agent status |
| `chat/toolStore.ts` | Agentic | Tool execution tracking, timeline, cancel |
| `chat/types.ts` | Both | Shared TypeScript types for chat subsystem |
| `chatPreferencesStore.ts` | Chat | User chat preferences (auto-approve, streaming) |
| `costStore.ts` | Chat | Per-request cost tracking, monthly budget |

### AI & Execution (Features 2, 5, 6)
| Store | Feature | Purpose |
|-------|---------|---------|
| `computerUseStore.ts` | Vision | Computer use session state, screenshots |
| `automationStore.ts` | Browser | Automation recording, script management |
| `browserStore.ts` | Browser | Browser sessions, tabs, CDP state |
| `executionStore.ts` | Agentic | Task execution state, progress tracking |
| `agentTaskStore.ts` | Agentic | AGI goal tracking, cancel/pause |

### LLM & Models
| Store | Feature | Purpose |
|-------|---------|---------|
| `modelStore.ts` | Chat/Settings | Model selection, Ollama pull/delete |
| `llmConfigStore.ts` | Settings | Provider configuration, default provider |
| `tokenBudgetStore.ts` | Billing | Token budget per model |
| `usageTrackingStore.ts` | Billing | Usage metrics per session |

### MCP & Connectors (Features 3, 10)
| Store | Feature | Purpose |
|-------|---------|---------|
| `mcpStore.ts` | MCP | MCP server connections, tool registry |
| `mcpbStore.ts` | MCP | MCP bridge state (secondary transport) |
| `mcpServerStore.ts` | MCP | MCP server start/stop/config |
| `mcpAppStore.ts` | MCP | MCP app-level state |
| `connectorsStore.ts` | Connectors | Connector gallery, OAuth flows |
| `connectionStore.ts` | Connectors | Active connection state |

### Voice & Terminal (Features 4, 7)
| Store | Feature | Purpose |
|-------|---------|---------|
| `voiceInputStore.ts` | Voice | Recording state, transcription, hotkey |
| `terminalStore.ts` | Terminal | PTY sessions, input/output, resize |

### Files & Memory (Features 8, 9)
| Store | Feature | Purpose |
|-------|---------|---------|
| `filesystemStore.ts` | Files | File CRUD, directory operations |
| `documentStore.ts` | Files | Document processing state |
| `memoryStore.ts` | Memory | Memory CRUD, search, embeddings |
| `editingStore.ts` | Files | Code editing state |
| `codeStore.ts` | Files | Multi-file code operations |

### Scheduling & Productivity (Feature 11)
| Store | Feature | Purpose |
|-------|---------|---------|
| `schedulerStore.ts` | Scheduling | Jobs, history, NLP parsing |
| `productivityStore.ts` | Scheduling | Trello/Asana integration |
| `calendarStore.ts` | Scheduling | Calendar events |

### Settings & Preferences (Feature 12)
| Store | Feature | Purpose |
|-------|---------|---------|
| `settingsStore.ts` | Settings | Main settings (API keys, providers, features) |
| `settingsDialogStore.ts` | Settings | Settings dialog open/close state |
| `appPreferencesStore.ts` | Settings | App-level preferences |
| `chatPreferencesStore.ts` | Settings | Chat-specific preferences |
| `executionPreferencesStore.ts` | Settings | Execution-specific preferences |
| `securityPreferencesStore.ts` | Settings | Security preferences |

### Billing & Subscription (Feature 13)
| Store | Feature | Purpose |
|-------|---------|---------|
| `billingStore.ts` | Billing | Stripe state, checkout, portal |
| `billingUsage.ts` | Billing | Usage tracking, monthly budget |
| `subscriptionPlanStore.ts` | Billing | Active plan, tier, limits |
| `costStore.ts` | Billing | Per-request cost tracking |
| `roiStore.ts` | Billing | ROI dashboard metrics |
| `tokenBudgetStore.ts` | Billing | Token budget management |
| `usageTrackingStore.ts` | Billing | Usage metrics |

### Auth & Account (Feature 14)
| Store | Feature | Purpose |
|-------|---------|---------|
| `auth.ts` | Auth | Legacy auth store (backwards-compat) |
| `authCoreStore.ts` | Auth | Core auth state: session, user, tokens |
| `authOrchestrator.ts` | Auth | Auth flow orchestration, token sync |
| `deviceLinkStore.ts` | Auth | Desktop-mobile QR pairing |
| `featureFlagStore.ts` | Auth | Feature flags based on subscription |

### Other
| Store | Feature | Purpose |
|-------|---------|---------|
| `ui.ts` | Layout | UI state: sidebar, panels, theme, errors |
| `cloudStore.ts` | Connectors | Cloud storage (Google Drive, Dropbox) |
| `emailStore.ts` | Connectors | Email account management |
| `teamStore.ts` | Settings | Team management, members, billing |
| `projectStore.ts` | Settings | Project-level settings |
| `governanceStore.ts` | Agentic | Tool execution audit logging |
| `databaseStore.ts` | Connectors | External DB connections (Postgres, Mongo, Redis) |
| `templateStore.ts` | Chat | Prompt templates |
| `customInstructionsStore.ts` | Chat | Custom system instructions |
| `researchStore.ts` | Chat | Deep research panel state |
| `artifactStore.ts` | Chat | Canvas/artifact state |
| `canvasStore.ts` | Chat | Canvas editing state |
| `skillMarketplaceStore.ts` | Settings | Skill marketplace browsing/install |
| `analyticsMetricsStore.ts` | Settings | Analytics dashboard |
| `mediaGenerationStore.ts` | Chat | Image/video generation state |
| `updaterStore.ts` | Settings | App update state |
| `logoutCleanup.ts` | Auth | Cleanup on logout |
| `apiStore.ts` | Connectors | REST API builder state |

---

## Event Channel Registry

All Tauri events emitted from Rust → listened in TypeScript frontend.

### Agentic Loop Events
| Event | Emitter (Rust) | Listener (TS) | Payload |
|-------|---------------|---------------|---------|
| `tool:event` | `chat/tool_events.rs` | `chat/toolStore.ts` | `ToolEvent` (Started/Progress/Completed) |
| `agentic:loop-started` | `chat/send_message.rs` | `useAgenticEvents.ts` | `{ conversationId }` |
| `agentic:loop-status` | `chat/send_message.rs` | `useAgenticEvents.ts` | `{ status, iteration }` |
| `agentic:loop-ended` | `chat/send_message.rs` | `useAgenticEvents.ts` | `{ conversationId, reason }` |
| `agentic:message-consumed` | `chat/send_message.rs` | `useAgenticEvents.ts` | `{ messageId }` |

### AGI Goal Events (constants in `event-names.ts`)
| Event | Emitter | Listener | Payload |
|-------|---------|----------|---------|
| `agi:goal:progress` | `core/agi/` | `useAgenticEvents.ts` | Goal progress update |
| `agi:goal:submitted` | `core/agi/` | `useAgenticEvents.ts` | Goal submitted |
| `agi:goal:cancelled` | `core/agi/` | `useAgenticEvents.ts` | Goal cancelled |
| `agi:goal:paused` | `core/agi/` | `useAgenticEvents.ts` | Goal paused |
| `agi:goal:resumed` | `core/agi/` | `useAgenticEvents.ts` | Goal resumed |

### Agent Events
| Event | Emitter | Listener | Payload |
|-------|---------|----------|---------|
| `agent:status:update` | `core/agent/` | `useAgenticEvents.ts` | Agent status |
| `agent:action_update` | `core/agent/` | `useAgenticEvents.ts` | Action progress |
| `agent:permission_required` | `core/agent/approval.rs` | `useAgenticEvents.ts` | `ApprovalRequest` |
| `agent:metrics` | `core/agent/` | `useAgenticEvents.ts` | Agent metrics |

### Background Agent Events
| Event | Emitter | Listener | Payload |
|-------|---------|----------|---------|
| `background_agent:created` | `sys/commands/background_agents.rs` | `useBackgroundTasks.ts` | Agent created |
| `background_agent:started` | same | same | Agent started |
| `background_agent:progress` | same | same | Progress update |
| `background_agent:completed` | same | same | Agent completed |
| `background_agent:failed` | same | same | Agent failed |
| `background_agent:cancelled` | same | same | Agent cancelled |

### Frontend Events (from `ui/events/frontend_events.rs`)
| Event | Payload Type |
|-------|-------------|
| `agi:file_operation` | `FileOperation` |
| `agi:terminal_command` | `TerminalCommand` |
| `agi:tool_execution` | `ToolExecution` |
| `agi:screenshot` | `Screenshot` |
| `agi:approval_required` | `ApprovalRequest` |
| `agi:tool_stream` | `ToolStreamEvent` |

### Voice Events
| Event | Emitter | Purpose |
|-------|---------|---------|
| `voice:recording:started` | `voice.rs` | Recording began |
| `voice:recording:stopped` | `voice.rs` | Recording ended |
| `voice:transcription:complete` | `voice.rs` | Transcription result ready |
| `voice:ptt-start` | `voice_global.rs` | Push-to-talk key pressed |
| `voice:ptt-stop` | `voice_global.rs` | Push-to-talk key released |
| `voice:barge_in_detected` | `voice.rs` | User interrupted TTS |
| `voice:barge_in_enabled` | `voice.rs` | Barge-in mode toggled |
| `voice:tts_completed` | `voice.rs` | TTS playback finished |
| `voice:tts_interrupted` | `voice.rs` | TTS interrupted |
| `voice:whisper_download_progress` | `voice.rs` | Whisper model download % |
| `voice:piper_download_progress` | `voice.rs` | Piper TTS download % |
| `voice:piper_binary_download_progress` | `voice.rs` | Piper binary download % |
| `deepgram:transcript` | `voice.rs` | Live Deepgram transcript |
| `deepgram:speech_final` | `voice.rs` | Deepgram final transcript |

### Computer Use / Automation Events
| Event | Emitter | Purpose |
|-------|---------|---------|
| `computer_use:*` | `automation/computer_use/session.rs` | SessionStarted, ActionCompleted, Paused, Resumed, Cancelled, Completed, ProgressUpdate, Error |
| `automation:recording_started` | `automation/recorder.rs` | Recording session started |
| `automation:recording_stopped` | `automation/recorder.rs` | Recording session stopped |
| `automation:action_recorded` | `automation/recorder.rs` | Individual action captured |
| `automation:request_screenshot` | `automation/executor.rs` | Screenshot request for vision |

### Research Events
| Event | Emitter | Purpose |
|-------|---------|---------|
| `research:progress` | `core/research/orchestrator.rs` | Research progress % |
| `research:step_started` | same | Research step began |
| `research:step_completed` | same | Research step done |
| `research:complete` / `research:completed` | same | Research finished |

### MCP Events
| Event | Emitter | Purpose |
|-------|---------|---------|
| `mcp:server_unhealthy` | `core/mcp/health.rs` | Server health check failed |

### Terminal Events
| Event | Emitter | Purpose |
|-------|---------|---------|
| `terminal:stdout:{sessionId}` | `sys/commands/terminal.rs` | PTY stdout data |
| `terminal:stderr:{sessionId}` | same | PTY stderr data |
| `terminal:exit:{sessionId}` | same | PTY process exited |

### Window & Tray Events
| Event | Emitter | Purpose |
|-------|---------|---------|
| `window:state` | `ui/window/mod.rs` | Window state change |
| `window:focus` | same | Window focus change |
| `window:preview` | same | Window preview update |
| `tray:new_conversation` | `ui/tray.rs` | Tray "New Chat" clicked |
| `tray:open_settings` | `ui/tray.rs` | Tray "Settings" clicked |

### Cloud & Calendar Events
| Event | Emitter | Purpose |
|-------|---------|---------|
| `cloud:auth_started` | `sys/commands/cloud.rs` | Cloud OAuth started |
| `cloud:connected` | same | Cloud connected |
| `cloud:disconnected` | same | Cloud disconnected |
| `cloud:file_uploaded` | same | File uploaded to cloud |
| `cloud:file_deleted` | same | File deleted from cloud |
| `calendar:auth_started` | `sys/commands/calendar.rs` | Calendar OAuth started |
| `calendar:connected` | same | Calendar connected |
| `calendar:disconnected` | same | Calendar disconnected |
| `calendar:event_created` | same | Calendar event created |
| `calendar:event_updated` | same | Calendar event updated |

### Misc Events
| Event | Emitter | Purpose |
|-------|---------|---------|
| `thinking:event` | `sys/commands/thinking.rs` | LLM thinking/reasoning event |
| `chat-token` | `sys/commands/agi.rs` | Chat token for AGI mode |
| `agi:error` | `sys/error/integration.rs` | AGI error event |
| `file-event` | `sys/filesystem/watcher.rs` | File system change detected |
| `screen-watcher:capture` | `sys/commands/screen_watcher.rs` | Screen capture event |
| `overlay:update` | `ui/overlay/renderer.rs` | Overlay UI update |
| `gmail:auth_started` | `sys/commands/gmail_oauth.rs` | Gmail OAuth started |
| `gmail:connected` | same | Gmail connected |
| `gmail:disconnected` | same | Gmail disconnected |
| `extension:task-result` | `integrations/realtime/` | Chrome extension task result |

---

## Web API Route Index

76 API routes in `apps/web/app/api/`, grouped by feature.

### Chat (Feature 1)
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/chat/conversations` | GET, POST | List/create conversations |
| `/api/chat/conversations/[id]` | GET, PATCH, DELETE | Single conversation CRUD |
| `/api/chat/conversations/[id]/messages` | GET, POST | Conversation messages |
| `/api/completion` | POST | Ghost-text prompt completion |
| `/api/llm/completion` | POST | LLM completion |
| `/api/llm/v1/chat/completions` | POST | OpenAI-compatible chat endpoint |
| `/api/llm/v2/chat` | POST | V2 chat endpoint |
| `/api/llm/v1/models` | GET | Available models |
| `/api/llm/v1/credits/balance` | GET | Credit balance |
| `/api/share` | POST | Share conversation |
| `/api/share/[token]` | GET | View shared conversation |

### Voice (Feature 4)
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/voice/transcribe` | POST | Server-side transcription |
| `/api/voice/health` | GET | Voice service health |
| `/api/llm/v1/audio/transcriptions` | POST | OpenAI-compatible audio transcription |

### Memory (Feature 9)
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/memory` | GET, POST | Memory CRUD |
| `/api/memory/[id]` | GET, PATCH, DELETE | Single memory entry |
| `/api/memory/search` | POST | Memory search |
| `/api/memory/sync` | POST | Memory sync desktop ↔ cloud |

### Connectors (Feature 10)
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/connectors` | GET, POST, DELETE | Connector CRUD (32 connector IDs) |
| `/api/github/install` | GET | GitHub App install |
| `/api/github/installations` | GET | GitHub App installations |
| `/api/github/webhook` | POST | GitHub webhook handler |
| `/api/messaging/config` | GET, POST | Messaging platform config |
| `/api/messaging/config/[platform]` | GET, PATCH | Per-platform config |
| `/api/messaging/stats/[platform]` | GET | Messaging stats |
| `/api/messaging/test/[platform]` | POST | Test messaging connection |

### Scheduling (Feature 11)
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/schedules` | GET, POST | Schedule CRUD |
| `/api/schedules/[id]` | GET, PATCH, DELETE | Single schedule |
| `/api/schedules/[id]/runs` | GET | Schedule run history |

### Settings (Feature 12)
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/settings/test-provider` | POST | Test LLM provider connection |
| `/api/models` | GET | Full model catalog |

### Billing (Feature 13)
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/checkout` | POST | Stripe checkout session |
| `/api/portal` | POST | Stripe billing portal |
| `/api/stripe-webhook` | POST | Stripe webhook handler |
| `/api/sync-subscription` | POST | Sync subscription status |
| `/api/credit-topup` | POST | Credit top-up purchase |
| `/api/claim-offer` | POST | Claim promotional offer |
| `/api/usage` | GET | Usage statistics |
| `/api/cron/reset-credits` | POST | Monthly credit reset (cron) |

### Auth (Feature 14)
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/auth/desktop-token` | POST | Desktop app token exchange |
| `/api/auth/sso-check` | POST | SSO domain check |
| `/api/me` | GET | Current user profile |
| `/api/device/link` | POST | Device linking (QR pairing) |
| `/api/device/poll` | GET | Poll device link status |
| `/api/device/approve` | POST | Approve device link |
| `/api/csrf` | GET | CSRF token |
| `/api/user/data` | GET | User data (GDPR Art. 20) |
| `/api/user/export` | GET | User data export (GDPR Art. 20) |

### Admin
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/admin/sso` | GET, POST | SSO configuration |
| `/api/admin/security` | GET, POST | Security settings |
| `/api/admin/directory-sync` | POST | SCIM directory sync |

### Agents
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/agents/execute` | POST | Execute agent |
| `/api/agents/session` | POST | Agent session management |
| `/api/agents/collaboration` | POST | Multi-agent collaboration |
| `/api/agents/communication` | GET, POST | Agent messaging |
| `/api/agents/communication/[id]` | GET | Single agent message |

### Media
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/media/image/generate` | POST | Image generation |
| `/api/media/video/generate` | POST | Video generation |
| `/api/media/video/status` | GET | Video generation status |

### Marketplace & Workforce
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/marketplace` | GET, POST | Marketplace listings |
| `/api/workforce` | GET, POST | Workforce management |
| `/api/mission` | GET, POST | Mission/task management |

### Other
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/health` | GET | Health check |
| `/api/download` | GET | Desktop download link |
| `/api/download-beta` | GET | Beta download link |
| `/api/releases/check` | GET | Check for updates |
| `/api/releases/latest/[platform]` | GET | Latest release per platform |
| `/api/releases/[target]/[version]` | GET | Specific release |
| `/api/waitlist` | POST | Waitlist signup |
| `/api/debug/llm-status` | GET | LLM debug status |
| `/api/autotag/classify` | POST | Auto-classify message |
| `/api/autotag/batch` | POST | Batch auto-tag |
| `/api/autotag/conversations` | GET | Tagged conversations |
| `/api/validate-webhook` | POST | Validate webhook |
| `/api/webhook-diagnostic` | GET | Webhook diagnostic |
| `/api/webhooks/directory-sync` | POST | Directory sync webhook |

---

## Hook-to-Feature Map

54 React hooks in `apps/desktop/src/hooks/`, mapped to features.

| Hook | Feature | Purpose |
|------|---------|---------|
| `useAgenticEvents.ts` | Agentic | Listens to 39+ Tauri agentic events |
| `useAgentLoopEvents.ts` | Agentic | Agent loop lifecycle events |
| `useApprovalActions.ts` | Agentic | Tool approval accept/reject |
| `useToolEvents.ts` | Agentic | Tool execution event handling |
| `useBackgroundTasks.ts` | Agentic | Background agent task tracking |
| `useCheckpoints.ts` | Agentic | Checkpoint/undo management |
| `useOrchestratorActions.ts` | Agentic | AGI orchestrator controls |
| `useBrowserAutomation.ts` | Browser | Browser automation controls |
| `useAutomationEvents.ts` | Browser | Automation event listeners |
| `useTerminal.ts` | Terminal | PTY session management |
| `useVoiceInput.ts` | Voice | Voice recording + transcription |
| `useVoiceHotkey.ts` | Voice | Push-to-talk hotkey binding |
| `useVoiceTranscription.ts` | Voice | Transcription result handling |
| `useGlobalVoicePTT.ts` | Voice | Global push-to-talk |
| `useTTS.ts` | Voice | Text-to-speech playback |
| `useScreenCapture.ts` | Vision | Screen capture |
| `useOCR.ts` | Vision | OCR text extraction |
| `mcpStore.ts` + `api/mcp.ts` | MCP | MCP server management, health, and runtime telemetry |
| `useFileOperations.ts` | Files | File CRUD operations |
| `useFileTerminalEvents.ts` | Files/Terminal | File + terminal event bridge |
| `useDocuments.ts` | Files | Document processing |
| `useMemory.ts` | Memory | Memory CRUD |
| `useMemoryIntegration.ts` | Memory | Memory ↔ chat integration |
| `useScheduler.ts` | Scheduling | Scheduler CRUD |
| `useCalendar.ts` | Scheduling | Calendar integration |
| `useEmail.ts` | Connectors | Email integration |
| `useCloudStorage.ts` | Connectors | Cloud storage operations |
| `useGit.ts` | Connectors | Git operations |
| `useLSP.ts` | Files | LSP protocol integration |
| `useWorkflows.ts` | Scheduling | Workflow builder |
| `useExtensionEvents.ts` | Browser | Chrome extension events |
| `useExtensionBridgeEvents.ts` | Browser | Extension bridge events |
| `useTeam.ts` | Settings | Team management |
| `useModelCapabilities.ts` | Settings | Model capability detection |
| `useUpdater.ts` | Settings | App update management |
| `useNotifications.ts` | Layout | Notification system |
| `useNotificationEvents.ts` | Layout | Notification event listeners |
| `useKeyboardShortcuts.ts` | Layout | Keyboard shortcut bindings |
| `useWindowManager.ts` | Layout | Window management |
| `useTrayQuickActions.ts` | Layout | System tray actions |
| `useDeepLink.ts` | Auth | Deep link handling |
| `useCreditRefresh.ts` | Billing | Credit balance refresh |
| `useAnalytics.ts` | Settings | Analytics tracking |
| `useSlashCommands.ts` | Chat | Slash command handling |
| `useSlashCommandAutocomplete.ts` | Chat | Slash command autocomplete |
| `useCommandAutocomplete.ts` | Chat | Command autocomplete |
| `usePromptSuggestions.ts` | Chat | Prompt suggestions |
| `useApiPromptCompletion.ts` | Chat | API-based prompt completion |
| `useAutoCorrection.ts` | Chat | Auto-correction |
| `useReducedMotion.ts` | Layout | Accessibility: reduced motion |
| `useTimeout.ts` | Utility | Timeout management |
| `useToast.ts` | Utility | Toast notifications |
| `agenticEventUtils.ts` | Agentic | Utility functions for event handling |

---

## Cross-Feature Dependencies

```
Auth ──────────────┐
  │                │
  ├──→ Settings ───┤
  │       │        │
  │       ├──→ Chat ──→ Agentic Mode
  │       │     │          │
  │       │     │          ├──→ MCP Tools
  │       │     │          ├──→ Browser Automation
  │       │     │          ├──→ Terminal
  │       │     │          ├──→ Files
  │       │     │          ├──→ Memory
  │       │     │          └──→ Vision
  │       │     │
  │       │     ├──→ Voice (input to chat)
  │       │     └──→ Connectors (data sources)
  │       │
  │       └──→ Scheduling (triggers chat/agents)
  │
  └──→ Billing ──→ Feature Flags ──→ All Features
```

### Dependency Details

| Feature | Hard Dependencies | Soft Dependencies |
|---------|-------------------|-------------------|
| **Chat** | Auth (session), Settings (API keys, model) | Memory (context), Voice (input) |
| **Agentic Mode** | Chat (message pipeline), Settings (tools config) | MCP (tools), Browser, Terminal, Files, Vision |
| **MCP Tools** | Settings (server config) | Agentic (tool invocation) |
| **Voice** | Settings (provider keys) | Chat (transcription target) |
| **Vision** | Settings (vision model) | Agentic (computer use loop) |
| **Browser Automation** | Agentic (action dispatch) | MCP (CDP tools), Vision (screenshots) |
| **Terminal** | None (standalone PTY) | Agentic (command execution), Files (file ops) |
| **Files** | None (standalone file ops) | Agentic (file read/write), Memory (context) |
| **Memory** | Settings (embedding config) | Chat (auto-memorize), Agentic (context retrieval) |
| **Connectors** | Auth (OAuth), Settings (config) | MCP (server connections) |
| **Scheduling** | Settings (job config) | Chat (scheduled messages), Agentic (scheduled tasks) |
| **Settings** | Auth (user session) | All features (configuration source) |
| **Billing** | Auth (user identity), Stripe (payments) | Feature Flags (tier limits) |
| **Auth** | Supabase (identity provider) | Billing (subscription check), Settings (token storage) |

---

## Rust Command Module Index

80+ command files in `apps/desktop/src-tauri/src/sys/commands/`, grouped by feature.

| Feature | Command Files | Key Commands |
|---------|--------------|-------------|
| **Chat** | `chat/` (directory), `thinking.rs` | `send_message`, `get_conversations`, `delete_conversation` |
| **Agentic** | `agent.rs`, `background_agents.rs`, `agi.rs`, `agi_checkpoint.rs` | `agi_start_goal`, `agi_cancel_goal`, `background_agent_*` |
| **MCP** | `mcp.rs`, `mcp_server.rs`, `mcp_extensions.rs`, `mcp_oauth.rs`, `mcpb.rs` | `mcp_list_tools`, `mcp_call_tool`, `mcp_server_start` |
| **Voice** | `voice.rs`, `voice_global.rs` | `speech_start_recording`, `speech_stop_and_transcribe`, `voice_transcribe_blob` |
| **Vision** | `capture.rs`, `computer_use.rs`, `ocr.rs`, `screen_watcher.rs` | `capture_screen`, `computer_use_start`, `ocr_extract_text` |
| **Browser** | `browser.rs` | `browser_init`, `browser_launch`, `browser_navigate`, `browser_click`, `browser_type` (30+) |
| **Terminal** | `terminal.rs` | `terminal_spawn`, `terminal_send_input`, `terminal_resize`, `terminal_kill` |
| **Files** | `file_ops.rs`, `file_watcher.rs`, `document.rs` | `file_read`, `file_write`, `file_delete`, `document_process` |
| **Memory** | `memory.rs`, `knowledge.rs`, `embeddings.rs`, `project_memory.rs`, `chat_memory_integration.rs` | `memory_store`, `memory_search`, `memory_delete` |
| **Connectors** | `cloud.rs`, `gmail_oauth.rs`, `google_batch.rs`, `extension.rs`, `native_messaging.rs` | `cloud_connect`, `gmail_oauth_start` |
| **Scheduling** | `scheduler.rs` (mapped from `continuous_job_runner.rs`) | `scheduler_add_job`, `scheduler_run_job_now`, `scheduler_get_history` |
| **Settings** | `llm.rs`, `ollama.rs`, `master_password.rs`, `capabilities.rs` | `llm_set_default_provider`, `save_api_key`, `settings_save` |
| **Billing** | (via `sys/billing/`) | `billing_initialize`, `stripe_cancel_subscription`, `stripe_track_usage` |
| **Auth** | `auth.rs` | `account_store_access_token`, `account_clear_tokens` |
| **Other** | `analytics.rs`, `automation.rs`, `cache.rs`, `calendar.rs`, `canvas.rs`, `code_editing.rs`, `code_execution.rs`, `code_search.rs`, `completion.rs`, `custom_instructions.rs`, `database.rs`, `debugging.rs`, `design.rs`, `email.rs`, `error_reporting.rs`, `feedback.rs`, `git.rs`, `github.rs`, `governance.rs`, `hooks.rs`, `intent.rs`, `lsp.rs`, `marketplace.rs`, `media.rs`, `messaging.rs`, `metrics.rs`, `migration.rs`, `notification_center.rs`, `notifications.rs`, `onboarding.rs`, `operations.rs`, `orchestration.rs`, `privacy.rs`, `process_reasoning.rs`, `productivity.rs`, `project_context.rs` | Various |

---

## IPC Rules (Critical)

1. **All `invoke()` calls use camelCase param names** (Tauri auto-converts from Rust snake_case)
2. **Model IDs use hyphens**: `claude-opus-4-6` (not dots)
3. **Event names use colons**: `tool:event`, `voice:recording:started`
4. **Full rule**: see `.claude/rules/tauri-ipc.md`

---

## How to Use This Index

- **"Where is feature X?"** → Check the Feature Matrix (14 main) or Sub-Feature Matrix (20 sub-features)
- **"Which store do I use?"** → Check the Store-to-Feature Map
- **"What events does feature X emit?"** → Check the Event Channel Registry
- **"What API routes exist?"** → Check the Web API Route Index
- **"What depends on what?"** → Check Cross-Feature Dependencies
- **"Which Rust files handle X?"** → Check the Rust Command Module Index
- **"What's the detail on subsystem Y?"** → Check the Sub-Feature Matrix for specialized blueprints
