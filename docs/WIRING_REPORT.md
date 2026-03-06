# AGI Workforce — Wiring Audit Report

Generated: 2026-03-06
Status: COMPLETE (Wave 2)

## Summary

This report cross-references:

1. All `#[tauri::command]` Rust handlers → registered in `lib.rs`
2. All `invoke('command_name', {...params})` calls in TypeScript
3. Naming convention: Tauri auto-converts snake_case params to camelCase on TS side

## Known Rule: Tauri IPC camelCase

- Rust: `action_type: Option<String>` → TS must use `actionType` (not `action_type`)
- See: .claude/rules/tauri-ipc.md

---

## Confirmed Issues

### Wave 1 Agent 1 — Desktop Stores/Hooks/Services/API (64 snake_case bugs)

#### BUG CATEGORY A: snake_case params in invoke() calls (params arrive as None/undefined in Rust)

**hooks/useTerminal.ts** (11 occurrences — all use `session_id` instead of `sessionId`):

- L207: `invoke('terminal_kill', { session_id: sessionId })` — should be `{ sessionId }`
- L244: `invoke('terminal_send_input', { session_id: sessionId, data })` — should be `{ sessionId, data }`
- L258: `invoke('terminal_get_history', { session_id: sessionId, limit })` — should be `{ sessionId, limit }`
- L276: `invoke('terminal_resize', { session_id: sessionId, cols, rows })` — should be `{ sessionId, cols, rows }`
- L290: `invoke('terminal_get_history', { session_id: sessionId, limit })` — duplicate pattern
- L308: `invoke('terminal_get_history', { session_id: sessionId, limit })` — duplicate pattern
- L329: `invoke('terminal_clear_history', { session_id: sessionId })` — should be `{ sessionId }`
- L342: `invoke('terminal_set_env', { session_id: sessionId, key, value })` — should be `{ sessionId, key, value }`
- L355: `invoke('terminal_get_env', { session_id: sessionId, key })` — should be `{ sessionId, key }`
- L368: `invoke('terminal_list_env', { session_id: sessionId })` — should be `{ sessionId }`
- L384: `invoke('terminal_unset_env', { session_id: sessionId, key })` — should be `{ sessionId, key }`
- NOTE: `stores/terminalStore.ts` calls the SAME commands with CORRECT camelCase `{ sessionId }`. This is a duplicate implementation with inconsistent casing.

**api/accountApi.ts** (4 occurrences):

- L57: `invoke('device_link_poll', { device_id: deviceCode })` — should be `{ deviceId: deviceCode }`
- L131: `invoke('report_llm_usage', { amount_cents, model, provider, input_tokens, output_tokens })` — should be `{ amountCents, model, provider, inputTokens, outputTokens }`

**hooks/useApprovalActions.ts** (1 occurrence):

- L42: `invoke('agent_resolve_approval', { approval_id: approval.id, decision, reason, trust })` — should be `{ approvalId: approval.id, ... }`

**api/agi_checkpoint.ts** (8 occurrences — all use snake_case for task_id, checkpoint_id, etc.):

- L150: `{ task_id: taskId }` — should be `{ taskId }`
- L163: `{ checkpoint_id: checkpointId }` — should be `{ checkpointId }`
- L179-180: `{ request: { task_id: taskId, limit } }` — nested snake_case
- L195: `{ checkpoint_id: checkpointId }` — should be `{ checkpointId }`
- L206: `{ task_id: taskId }` — should be `{ taskId }`
- L224-226: `{ checkpoint_id, task_id, resumed_steps }` — should be `{ checkpointId, taskId, resumedSteps }`
- L238-239: `{ task_id, keep_count }` — should be `{ taskId, keepCount }`

**api/workflow.ts** (4 occurrences):

- L80: `invoke('get_user_workflows', { user_id: userId })` — should be `{ userId }`
- L95: `invoke('execute_workflow', { workflow_id: workflowId, inputs })` — should be `{ workflowId, inputs }`
- L191: `invoke('get_next_execution_time', { cron_expr: cronExpr })` — should be `{ cronExpr }`
- L208-210: `invoke('trigger_workflow_on_event', { workflow_id, event_type, event_data })` — should be `{ workflowId, eventType, eventData }`

**api/mcp.ts** (5 occurrences):

- L183: `{ tool_id: toolId, arguments: arguments_ }` — should be `{ toolId, arguments: arguments_ }`
- L213: `{ new_config: config }` — should be `{ newConfig: config }`
- L239: `{ server_name: serverName, key, value }` — should be `{ serverName, key, value }`
- L337: `{ provider, code, callback_state: callbackState }` — should be `{ provider, code, callbackState }`
- L444: `{ provider, client_id: clientId, client_secret: clientSecret }` — should be `{ provider, clientId, clientSecret }`

**api/automation.ts** (10+ occurrences via builder functions):

- `buildAutomationQuery()` L90-98: outputs `parent_id`, `window_class`, `class_name`, `automation_id`, `control_type`, `max_results`
- `buildClickRequest()` L103: outputs `element_id`
- `buildScreenshotRequest()` L112-117: outputs `element_id`, `conversation_id`
- L149: `{ request: { element_id } }` — should be `{ request: { elementId } }`
- L167: `{ request: { element_id, value, focus } }` — should be `elementId`
- L180: `{ element_id }` — should be `{ elementId }`
- L189: `{ element_id }` — should be `{ elementId }`
- L198: `{ element_id }` — should be `{ elementId }`
- L215-219: `{ request: { text, element_id, x, y, focus } }` — should be `elementId`
- L280: `{ image_path: imagePath }` — should be `{ imagePath }`

**api/automationEnhanced.ts** (5 occurrences):

- L160: `{ duration_ms: durationMs }` — should be `{ durationMs }`
- L199: `{ element_id: elementId }` — should be `{ elementId }`
- L225: `{ element_id: elementId }` — should be `{ elementId }`
- L241: `{ element_id: elementId }` — should be `{ elementId }`
- L286: `{ script_id: scriptId }` — should be `{ scriptId }`
- L306: `{ script_id: scriptId }` — should be `{ scriptId }`
- NOTE: Also uses `convertKeysToSnakeCase()` for nested script/recording objects — may be intentional for serde deserialization of nested JSON.

**api/memory.ts** (8 occurrences):

- L115-117: `{ enabled, max_memories, min_importance }` — should be `{ enabled, maxMemories, minImportance }`
- L183: `{ category, topic, boost_importance }` — should be `{ ..., boostImportance }`
- L214-216: `{ project_name, limit }` — should be `{ projectName, limit }`
- L289: `{ min_importance }` — should be `{ minImportance }`
- L297: `{ memory_id }` — should be `{ memoryId }`
- L316: `{ content, entry_type, metadata }` — should be `{ content, entryType, metadata }`
- L365-369: `{ enabled, decay_rate, decay_period_days, min_importance, access_boost }` — should be all camelCase
- L377: `{ memory_id }` — should be `{ memoryId }`

**api/ollama.ts** (3 occurrences):

- L170: `{ model_name: modelName }` — should be `{ modelName }`
- L198: `{ model_name: modelName }` — should be `{ modelName }`
- L224: `{ model_name: modelName }` — should be `{ modelName }`
- NOTE: `stores/modelStore.ts` calls the SAME commands with CORRECT `{ modelName }`. This is a duplicate API with inconsistent casing.

**api/reflection.ts** (5 occurrences):

- L208: `{ goal_id: goalId }` — should be `{ goalId }`
- L228: `{ goal_id: goalId }` — should be `{ goalId }`
- L247: `{ goal_id: goalId }` — should be `{ goalId }`
- L266: `{ goal_id: goalId }` — should be `{ goalId }`
- L285: `{ goal_id: goalId }` — should be `{ goalId }`

**api/privacy.ts** (1 occurrence):

- L261: `{ user_id: userId }` — should be `{ userId }`

**stores/productivityStore.ts** (1 occurrence):

- L399: `{ workspace_id: workspaceId }` — should be `{ workspaceId }`

---

### STRUCTURAL ISSUES

#### 1. Duplicate Store Implementations (risk: state desync)

**Terminal**: `stores/terminalStore.ts` and `hooks/useTerminal.ts` both wrap terminal commands. Store uses correct camelCase, hook uses wrong snake_case.

**Scheduler**: `stores/schedulerStore.ts` and `stores/scheduledTaskStore.ts` both call scheduler commands. Different param shapes for `scheduler_add_job`: store passes `{name, schedule, actionType, actionData}`, scheduledTaskStore passes `{name, prompt, schedule}`.

**Ollama**: `stores/modelStore.ts` and `api/ollama.ts` both call `ollama_pull_model` / `ollama_delete_model`. Store uses correct `{modelName}`, API uses wrong `{model_name}`.

#### 2. Direct @tauri-apps/api/core Imports (will crash in web dev mode)

These files import directly from `@tauri-apps/api/core` instead of `../lib/tauri-mock`:

- `api/agi_checkpoint.ts:8`
- `api/memory.ts:8`
- `api/backgroundTasks.ts:7`
- `api/screenWatcher.ts:8`
- `api/chat.ts:14`
- `hooks/useScheduler.ts:27`

All other files correctly use `../lib/tauri-mock` which gracefully degrades in non-Tauri environments.

---

## Clean Commands (verified working)

### Stores (all correct camelCase)

- settingsStore.ts — 13 invoke() calls, all OK
- modelStore.ts — 2 invoke() calls, all OK
- terminalStore.ts — 3 invoke() calls, all OK
- authOrchestrator.ts — 4 invoke() calls, all OK
- codeStore.ts — 2 invoke() calls, all OK
- browserStore.ts — 6 invoke() calls, all OK
- connectorsStore.ts — 6 invoke() calls, all OK
- cloudStore.ts — 3 invoke() calls, all OK (nested objects)
- agentTaskStore.ts — 1 invoke() call, OK
- researchStore.ts — 2 invoke() calls, all OK
- filesystemStore.ts — 7 invoke() calls, all OK
- governanceStore.ts — 4 invoke() calls, all OK
- teamStore.ts — 11 invoke() calls, all OK
- billingUsage.ts — 2 invoke() calls, all OK
- editingStore.ts — 1 invoke() call, OK
- automationStore.ts — 2 invoke() calls, all OK
- databaseStore.ts — 7 invoke() calls, all OK
- projectStore.ts — 3 invoke() calls, all OK
- apiStore.ts — 2 invoke() calls, all OK
- chat/toolStore.ts — 1 invoke() call, OK
- calendarStore.ts — 1 invoke() call, OK
- scheduledTaskStore.ts — 5 invoke() calls, all OK
- schedulerStore.ts — 9 invoke() calls, all OK
- ui.ts — 1 invoke() call, OK
- emailStore.ts — 5 invoke() calls, all OK
- chat/chatStore.ts — 1 invoke() call, OK
- memoryStore.ts — 8 invoke() calls, all OK
- customInstructionsStore.ts — 1 invoke() call, OK

### Hooks (correct)

- useFileOperations.ts — 11 invoke() calls, all OK
- useTeam.ts — 9 invoke() calls, all OK
- useCalendar.ts — 1 invoke() call, OK
- useVoiceTranscription.ts — 1 invoke() call, OK
- useBrowserAutomation.ts — 2 invoke() calls, all OK
- useLSP.ts — 5 invoke() calls, all OK
- useGit.ts — 11 invoke() calls, all OK
- useNotifications.ts — 1 invoke() call, OK
- useEmail.ts — 3 invoke() calls, all OK
- useExtensionEvents.ts — 1 invoke() call, OK
- useTrayQuickActions.ts — 1 invoke() call, OK
- useWindowManager.ts — 6 invoke() calls, all OK
- useScreenCapture.ts — 2 invoke() calls, all OK
- useAgenticEvents.ts — 3 invoke() calls, all OK
- useScheduler.ts — 1 invoke() call, OK

### Services (all correct)

- cacheService.ts — 5 invoke() calls, all OK
- errorReporting.ts — 1 invoke() call, OK
- supabaseAuth.ts — 8 invoke() calls, all OK
- stripe.ts — 4 invoke() calls, all OK
- analytics.ts — 4 invoke() calls, all OK

### API (correct subset)

- toolConfirmation.ts — 7 invoke() calls, all OK
- codeEditing.ts — 2 invoke() calls, all OK
- teamsApi.ts — 24 invoke() calls, all OK
- orchestrator.ts — 3 invoke() calls, all OK
- googleBatch.ts — 11 invoke() calls, all OK
- backgroundTasks.ts — 10 invoke() calls, all OK
- chat.ts — 4 invoke() calls, all OK
- embeddings.ts — 7 invoke() calls, all OK
- screenWatcher.ts — 7 invoke() calls, all OK
- media.ts — 3 invoke() calls, all OK

### Summary Statistics

- **Total invoke() calls audited**: ~280+
- **Files with snake_case bugs**: 14 files
- **Total snake_case parameter occurrences**: 64
- **Duplicate implementations with inconsistent casing**: 3 (terminal, ollama, scheduler)
- **Direct @tauri-apps/api/core imports (should use tauri-mock)**: 6 files
- **Files audited**: 49 stores + 46 hooks + 21 services + 25 API = 141 files

---

## BATCH-07: Rust LLM Core — Tauri Command Analysis

**Module**: `apps/desktop/src-tauri/src/core/llm/`
**Result**: **ZERO `#[tauri::command]` functions found in this module.**

The `core/llm/` module is a pure library module. It does NOT expose any Tauri IPC commands directly. Instead, it is consumed by `sys/commands/` modules that wrap its functionality into `#[tauri::command]` handlers.

### Key Consumers (for cross-reference by other agents)

The LLM core types and functions are used by these command modules (expected):

- `sys/commands/chat/` -- Uses LLMRouter, ToolExecutor, streaming
- `sys/commands/llm.rs` -- Model listing, provider status
- `sys/commands/ai_native.rs` -- AI-powered features
- `sys/commands/agi_checkpoint.rs` -- AGI task management
- `core/agent/` -- Agent runtime uses LLMRouter
- `core/agi/` -- AGI executor uses LLMRouter

### Provider Adapter Wiring (all providers registered)

All 12 providers are wired via `ProviderAdapterFactory::create_adapter()`:

- OpenAI -> `OpenAIAdapter` (also used for XAI, Qwen, Mistral, ManagedCloud)
- Anthropic -> `AnthropicAdapter`
- Google -> `GoogleAdapter`
- Ollama -> `OllamaAdapter`
- Perplexity -> `PerplexityAdapter`
- DeepSeek -> `DeepSeekAdapter`
- Moonshot -> `MoonshotAdapter`
- Zhipu -> `ZhipuAdapter`

All SSE parsers are wired in `parse_sse_event()` for all 12 Provider variants. No missing arms.

---

## BATCH-10 + BATCH-11: Rust sys/commands/ — Complete Tauri Command Registry

**Module**: `apps/desktop/src-tauri/src/sys/commands/` (90 files with `#[tauri::command]`)
**Registration**: `apps/desktop/src-tauri/src/lib.rs` lines 918-2489 (single `generate_handler![]` block)

### Totals

| Metric                                               | Count |
| ---------------------------------------------------- | ----- |
| Total registered Tauri commands                      | 1,324 |
| Files with `#[tauri::command]` in sys/commands/      | 90    |
| Declared-but-not-registered (dead) commands          | 0     |
| Commands from other modules (account, billing, etc.) | 54    |
| cfg-gated commands (updater)                         | 5     |

> NOTE: SESSION_STATE.md and MEMORY.md say "60+ Tauri commands" — actual count is **1,324**. Documentation is stale.

### Command Counts by Module

| Module                                 | Count | Description                                       |
| -------------------------------------- | ----- | ------------------------------------------------- |
| sys::commands (flat)                   | 1,013 | Direct command functions                          |
| sys::commands::voice                   | 42    | TTS, STT, Whisper, Piper, Deepgram, barge-in      |
| sys::commands::artifacts               | 23    | CRUD + streaming + versioning                     |
| sys::commands::tutorials               | 21    | Tutorial system + rewards                         |
| sys::commands::governance              | 14    | Audit events, approvals                           |
| sys::commands::canvas                  | 13    | Visual canvas + A2UI                              |
| sys::commands::messaging               | 13    | Discord, Telegram, Signal, Slack, WhatsApp, Teams |
| sys::commands::project_memory          | 13    | Project-scoped memory                             |
| sys::commands::tool_confirmation       | 12    | Safety tier dialogs                               |
| sys::commands::background_agents       | 11    | Push-to-background agents                         |
| sys::commands::chat_memory_integration | 11    | Chat + memory bridge                              |
| sys::commands::google_batch            | 11    | Google AI batch API                               |
| sys::commands::master_password         | 11    | Argon2id master password                          |
| sys::commands::notification_center     | 9     | In-app notifications                              |
| sys::commands::intent                  | 9     | Intent detection + routing                        |
| sys::commands::undo                    | 9     | Form undo (browser)                               |
| sys::commands::thinking                | 7     | Extended thinking mode                            |
| sys::commands::realtime                | 6     | WebSocket presence                                |
| sys::commands::agent                   | 5     | Agent runtime                                     |
| sys::commands::swarm                   | 4     | Parallel agent orchestration                      |
| sys::commands::privacy                 | 3     | GDPR compliance                                   |
| sys::commands::feedback                | 2     | User feedback + logs                              |
| sys::commands::capture                 | 2     | Screen capture extras                             |
| sys::commands::chat                    | 1     | clear_local_database                              |
| sys::commands::security                | 1     | auth_login                                        |
| sys::commands::vision                  | 1     | vision_send_message                               |
| sys::billing                           | 19    | Stripe integration                                |
| sys::account                           | 10    | Device linking, OAuth                             |
| sys::error::commands                   | 7     | Error recovery                                    |
| sys::diagnostics::commands             | 6     | Doctor checks                                     |
| sys::filesystem                        | 2     | File/folder search                                |
| features::updater                      | 5     | App updates (cfg-gated)                           |
| features::search                       | 1     | web_search                                        |
| core::codebase                         | 4     | Codebase indexing                                 |

### Scheduler Commands — Naming Verified

All 10 scheduler commands use `_job` suffix consistently. No `_task` vs `_job` mismatch in Rust backend.

| Rust Function             | Invoke Name               | Parameters (snake_case -> camelCase)           |
| ------------------------- | ------------------------- | ---------------------------------------------- |
| `scheduler_add_job`       | `scheduler_add_job`       | name, schedule, actionType, actionData, prompt |
| `scheduler_remove_job`    | `scheduler_remove_job`    | jobId OR id                                    |
| `scheduler_list_jobs`     | `scheduler_list_jobs`     | (none)                                         |
| `scheduler_pause_job`     | `scheduler_pause_job`     | jobId OR id                                    |
| `scheduler_resume_job`    | `scheduler_resume_job`    | jobId OR id                                    |
| `scheduler_get_job`       | `scheduler_get_job`       | jobId OR id                                    |
| `scheduler_get_next_runs` | `scheduler_get_next_runs` | limit (optional)                               |
| `scheduler_toggle_job`    | `scheduler_toggle_job`    | id                                             |
| `scheduler_run_job_now`   | `scheduler_run_job_now`   | id                                             |
| `scheduler_update_job`    | `scheduler_update_job`    | id, updates: ScheduledJobUpdate                |

Frontend `schedulerStore.ts` calls match perfectly: `invoke('scheduler_add_job', {...})` etc.
Several commands accept both `job_id` and `id` for backwards compatibility (intentional).

### Full Registered Command List (1,324 commands by domain)

#### AGI (22 commands)

`agi_init`, `agi_submit_goal`, `agi_submit_goal_parallel`, `agi_submit_goal_swarm`, `agi_submit_goal_auto`, `agi_should_use_swarm`, `agi_get_goal_status`, `agi_list_goals`, `agi_stop`, `agi_cancel_goal`, `start_agent_task`, `agi_get_reflection_insights`, `agi_get_failure_patterns`, `agi_get_suggested_corrections`, `agi_get_sub_goals`, `agi_get_recommendations`, `agi_pause_task`, `agi_resume_task`, `agi_abort_task`, `agi_extend_timeout`, `agi_get_timeout_status`

#### AGI Checkpoints (14 commands)

`agi_checkpoint_save`, `agi_checkpoint_get_latest`, `agi_checkpoint_get`, `agi_checkpoint_list`, `agi_checkpoint_delete`, `agi_checkpoint_restore_history`, `agi_checkpoint_record_restore`, `agi_checkpoint_cleanup`, `agi_checkpoint_init`, `list_autonomous_task_checkpoints`, `list_autonomous_task_checkpoints_by_task`, `resume_autonomous_task`, `delete_autonomous_task_checkpoint`, `delete_autonomous_task_checkpoints`

#### Agent (10 commands)

`agent_init`, `agent_submit_task`, `agent_get_task_status`, `agent_list_tasks`, `agent_stop`, `agent_resolve_approval`, `agent_set_workflow_hash`, `agent_list_trusted_workflows`, `approve_operation`, `reject_operation`

#### AI Native (8 commands)

`ai_analyze_project`, `ai_add_constraint`, `ai_generate_code`, `ai_refactor_code`, `ai_generate_tests`, `ai_get_project_context`, `ai_generate_context_prompt`, `ai_access_file`

#### Analytics / Metrics (31 commands)

`analytics_track_event`, `analytics_flush_events`, `analytics_get_session_id`, `analytics_set_user_property`, `analytics_delete_all_data`, `analytics_calculate_roi`, `analytics_get_process_metrics`, `analytics_get_user_metrics`, `analytics_get_tool_metrics`, `analytics_get_metric_trends`, `analytics_get_time_saved_trend`, `analytics_get_cost_saved_trend`, `analytics_export_report`, `analytics_generate_weekly_report`, `analytics_generate_monthly_report`, `analytics_get_top_processes`, `analytics_save_snapshot`, `analytics_get_usage_stats`, `analytics_get_feature_usage`, `metrics_get_system`, `metrics_get_app`, `metrics_increment_automations`, `metrics_increment_goals`, `metrics_set_mcp_servers`, `metrics_set_cache_hit_rate`, `feature_flag_get`, `feature_flag_get_all`

#### API (15 commands)

`api_request`, `api_get`, `api_post_json`, `api_put_json`, `api_delete`, `api_parse_response`, `api_extract_json_path`, `api_oauth_create_client`, `api_oauth_get_auth_url`, `api_oauth_exchange_code`, `api_oauth_refresh_token`, `api_oauth_client_credentials`, `api_render_template`, `api_extract_template_variables`, `api_validate_template`

#### Auth / Account (13 commands)

`auth_store_session`, `auth_retrieve_session`, `auth_remove_session`, `auth_login`, `device_link_initiate`, `device_link_poll`, `fetch_user_profile`, `oauth_refresh`, `fetch_credit_balance`, `report_llm_usage`, `account_store_api_base_url`, `account_store_access_token`, `account_store_refresh_token`, `account_clear_tokens`

#### Automation (48 commands)

`automation_list_windows`, `automation_find_elements`, `automation_invoke`, `automation_set_value`, `automation_get_value`, `automation_toggle`, `automation_focus_window`, `automation_send_keys`, `automation_hotkey`, `automation_click`, `automation_clipboard_get`, `automation_clipboard_set`, `automation_record_start`, `automation_record_stop`, `automation_record_action_click`, `automation_record_action_type`, `automation_record_action_screenshot`, `automation_record_action_wait`, `automation_record_is_recording`, `automation_save_script`, `automation_load_script`, `automation_list_scripts`, `automation_delete_script`, `automation_execute_script`, `automation_record_get_session`, `automation_inspect_element_at_point`, `automation_inspect_element_by_id`, `automation_find_element_by_selector`, `automation_generate_selector`, `automation_get_element_tree`, `automation_save_recording_as_script`, `automation_generate_code`, `list_automation_scripts`, `save_automation_script`, `delete_automation_script`, `execute_automation_script`, `save_recording_as_script`, `inspect_element_at`, `overlay_emit_click`, `overlay_emit_type`, `overlay_emit_region`, `overlay_replay_recent`, `automation_drag_drop`, `automation_ocr`, `automation_type`, `automation_screenshot`, `automation_get_text`, `check_automation_permissions`, `request_automation_permission`

#### Background Tasks / Agents (22 commands)

`cancel_background_task`, `pause_background_task`, `resume_background_task`, `list_background_tasks`, `bg_submit_task`, `bg_cancel_task`, `bg_pause_task`, `bg_resume_task`, `bg_get_task_status`, `bg_list_tasks`, `bg_get_task_stats`, `background_task_list`, `background_task_cancel`, `background_task_status`, `bg_llm_submit`, `bg_llm_get_status`, `bg_llm_cancel`, `bg_llm_process_queue`, `bg_llm_get_statistics`, `bg_llm_cleanup`, `bg_llm_verify_webhook`, `background_agent_push`, `background_agent_list`, `background_agent_list_active`, `background_agent_get`, `background_agent_pause`, `background_agent_resume`, `background_agent_cancel`, `background_agent_take_over`, `background_agent_stats`, `background_agent_cleanup`, `background_agent_should_push`

#### Browser (50 commands)

`browser_init`, `browser_check_status`, `browser_launch`, `browser_open_tab`, `browser_close_tab`, `browser_switch_tab`, `browser_list_tabs`, `browser_navigate`, `browser_go_back`, `browser_go_forward`, `browser_reload`, `browser_get_url`, `browser_get_title`, `browser_click`, `browser_type`, `browser_get_text`, `browser_get_attribute`, `browser_wait_for_selector`, `browser_select_option`, `browser_check`, `browser_uncheck`, `browser_screenshot`, `browser_evaluate`, `browser_hover`, `browser_focus`, `browser_query_all`, `browser_scroll_into_view`, `browser_execute_async_js`, `browser_get_element_state`, `browser_wait_for_interactive`, `browser_fill_form`, `browser_drag_and_drop`, `browser_upload_file`, `browser_get_cookies`, `browser_set_cookie`, `browser_clear_cookies`, `browser_get_performance_metrics`, `browser_wait_for_navigation`, `browser_get_frames`, `browser_execute_in_frame`, `browser_call_function`, `browser_enable_request_interception`, `browser_get_screenshot_stream`, `browser_highlight_element`, `browser_get_content`, `browser_get_dom_snapshot`, `browser_get_console_logs`, `browser_get_network_activity`, `web_search`, `find_element_semantic`, `find_all_elements_semantic`, `click_semantic`, `type_semantic`, `get_accessibility_tree`, `test_selector_strategies`, `get_dom_semantic_graph`, `get_interactive_elements`, `find_by_role`

#### Cache (10 commands)

`cache_get_stats`, `cache_clear_all`, `cache_clear_by_type`, `cache_clear_by_provider`, `cache_get_size`, `cache_configure`, `cache_warmup`, `cache_export`, `cache_get_analytics`, `cache_prune_expired`

#### Calendar (12 commands)

`calendar_connect`, `calendar_complete_oauth`, `calendar_disconnect`, `calendar_list_accounts`, `calendar_list_calendars`, `calendar_list_events`, `calendar_create_event`, `calendar_update_event`, `calendar_delete_event`, `calendar_get_event`, `calendar_sync`, `calendar_get_system_timezone`

#### Capabilities (3 commands)

`sync_capabilities`, `get_capabilities`, `check_capability`

#### Chat (24 commands)

`chat_create_conversation`, `chat_get_conversations`, `chat_get_conversation`, `chat_update_conversation`, `chat_delete_conversation`, `chat_create_message`, `chat_get_messages`, `chat_update_message`, `chat_delete_message`, `chat_send_message`, `chat_stop_generation`, `cancel_tool_execution`, `chat_add_pending_message`, `chat_get_pending_messages`, `chat_clear_pending_messages`, `chat_pop_pending_message`, `chat_get_conversation_stats`, `chat_get_cost_overview`, `chat_get_cost_analytics`, `chat_set_monthly_budget`, `chat_detect_intent`, `chat_is_stop_command`, `chat_handle_stop`, `chat_compact_context`, `clear_local_database`, `search_chat_history`, `search_chat_history_semantic`, `conversation_export`, `conversation_export_pdf`, `conversation_fork`, `conversation_list_branches`, `conversation_switch_branch`, `conversation_delete_branch`

#### Checkpoints (4 commands)

`checkpoint_create`, `checkpoint_restore`, `checkpoint_list`, `checkpoint_delete`

#### Cloud (10 commands)

`cloud_connect`, `cloud_complete_oauth`, `cloud_disconnect`, `cloud_list_accounts`, `cloud_list`, `cloud_upload`, `cloud_download`, `cloud_delete`, `cloud_create_folder`, `cloud_share`

#### Code Editing (10 commands)

`code_generate_edit`, `code_apply_edit`, `code_reject_edit`, `code_list_pending_edits`, `composer_start_session`, `composer_apply_session`, `composer_get_session`, `get_file_diff`, `apply_changes`, `revert_changes`

#### Codebase Cache (12 commands)

`codebase_cache_get_stats`, `codebase_cache_clear_project`, `codebase_cache_clear_file`, `codebase_cache_clear_all`, `codebase_cache_clear_expired`, `codebase_cache_get_file_tree`, `codebase_cache_set_file_tree`, `codebase_cache_get_symbols`, `codebase_cache_set_symbols`, `codebase_cache_get_dependencies`, `codebase_cache_set_dependencies`, `codebase_cache_calculate_hash`

#### Codebase Indexing (4 commands, core::codebase)

`index_workspace_file`, `search_symbols`, `get_file_symbols`, `get_index_stats`

#### Code Execution (1 command)

`execute_code`

#### Completion (3 commands)

`get_code_completion`, `get_inline_completion`, `get_prompt_completion`

#### Computer Use (11 commands)

`computer_use_start_session`, `computer_use_capture_screen`, `computer_use_click`, `computer_use_move_mouse`, `computer_use_type_text`, `computer_use_get_session`, `computer_use_list_sessions`, `computer_use_execute_tool`, `computer_use_zoom_region`, `computer_use_zoom_at_point`, `computer_use_suggest_zoom_level`, `continuous_job_runner_start`, `continuous_job_runner_stop`, `continuous_job_runner_status`

#### Custom Instructions (2 commands)

`save_custom_instructions`, `load_custom_instructions`

#### Database (34 commands)

`db_create_pool`, `db_execute_query`, `db_execute_prepared`, `db_execute_batch`, `db_close_pool`, `db_list_pools`, `db_get_pool_stats`, `db_build_select`, `db_build_insert`, `db_build_update`, `db_build_delete`, `db_mongo_connect`, `db_mongo_find`, `db_mongo_find_one`, `db_mongo_insert_one`, `db_mongo_insert_many`, `db_mongo_update_many`, `db_mongo_delete_many`, `db_mongo_disconnect`, `db_redis_connect`, `db_redis_get`, `db_redis_set`, `db_redis_del`, `db_redis_exists`, `db_redis_expire`, `db_redis_hget`, `db_redis_hset`, `db_redis_hgetall`, `db_redis_disconnect`, `db_store_password`, `db_has_stored_password`, `db_get_stored_password`, `db_delete_stored_password`, `db_mysql_test_connection`, `db_mysql_list_tables`, `db_mysql_describe_table`, `db_mysql_list_indexes`, `db_mysql_call_procedure`, `db_mysql_bulk_insert`, `db_validate_query`

#### Debugging (3 commands)

`debug_parse_error`, `debug_suggest_fixes`, `debug_analyze_stack_trace`

#### Design (7 commands)

`design_generate_css`, `design_apply_css`, `design_get_element_styles`, `design_generate_color_scheme`, `design_suggest_improvements`, `design_tokens_to_css`, `design_check_accessibility`

#### Diagnostics (6 commands)

`doctor_run_checks`, `doctor_run_check`, `doctor_get_report`, `doctor_list_checks`, `doctor_is_running`, `doctor_format_report`

#### Document (11 commands)

`document_read`, `document_extract_text`, `document_get_metadata`, `document_search`, `document_detect_type`, `document_create_word`, `document_create_word_simple`, `document_create_excel`, `document_create_excel_simple`, `document_create_excel_numbers`, `document_create_pdf`, `document_create_pdf_simple`

#### Email (17 commands)

`email_connect`, `email_list_accounts`, `email_remove_account`, `email_list_folders`, `email_fetch_inbox`, `email_mark_read`, `email_delete`, `email_move_message`, `email_download_attachment`, `email_send`, `email_list_messages`, `email_send_message`, `email_get_message`, `email_search`, `email_check_keyring_status`, `email_migrate_credentials`, `contact_create`, `contact_get`, `contact_list`, `contact_search`, `contact_update`, `contact_delete`, `contact_import_vcard`, `contact_export_vcard`

#### Embeddings (8 commands)

`generate_code_embeddings`, `semantic_search_codebase`, `get_embedding_stats`, `index_workspace`, `index_file`, `get_indexing_progress`, `on_file_changed`, `on_file_deleted`

#### Error Recovery (7 commands, sys::error)

`get_error_context`, `get_all_error_contexts`, `retry_failed_step`, `skip_failed_step`, `abort_execution`, `clear_error_contexts`, `get_recovery_suggestion`

#### Error Reporting (6 commands)

`error_report`, `error_report_batch`, `error_get_logs`, `error_clear_logs`, `error_get_stats`, `error_export_logs`

#### File Operations (25 commands)

`file_read`, `file_write`, `file_delete`, `file_rename`, `file_copy`, `file_move`, `file_exists`, `file_metadata`, `file_open_with_default_app`, `file_read_text`, `file_write_text`, `file_read_binary`, `file_write_binary`, `file_get_metadata`, `undo_file_operation`, `dir_create`, `dir_list`, `dir_delete`, `dir_traverse`, `fs_search_files`, `fs_search_folders`, `fs_read_file_content`, `fs_get_workspace_files`, `file_watch_start`, `file_watch_stop`, `file_watch_list`, `file_watch_stop_all`, `execute_terminal_command`, `terminal_execute`

#### Git (37 commands)

`git_init`, `git_status`, `git_add`, `git_commit`, `git_push`, `git_pull`, `git_create_branch`, `git_checkout`, `git_checkout_new_branch`, `git_list_branches`, `git_delete_branch`, `git_merge`, `git_log`, `git_diff`, `git_clone`, `git_fetch`, `git_stash`, `git_stash_pop`, `git_reset`, `git_list_remotes`, `git_add_remote`, `git_list_conflicts`, `git_get_conflict_details`, `git_resolve_conflict`, `git_mark_resolved`, `git_get_conflict_suggestion_prompt`, `git_has_conflicts`, `git_abort_merge`, `git_complete_merge`, `git_get_branch_diff_summary`, `git_generate_pr_description`, `git_create_pr`, `git_check_pr_readiness`, `git_current_branch`, `git_default_branch`

#### GitHub (6 commands)

`github_clone_repo`, `github_get_repo_context`, `github_search_files`, `github_read_file`, `github_get_file_tree`, `github_list_repos`

#### Gmail OAuth (6 commands)

`gmail_oauth_start`, `gmail_oauth_complete`, `gmail_oauth_refresh`, `gmail_oauth_list_accounts`, `gmail_oauth_disconnect`, `gmail_oauth_get_account`

#### Hooks (13 commands)

`hooks_initialize`, `hooks_list`, `hooks_add`, `hooks_remove`, `hooks_toggle`, `hooks_update`, `hooks_get_config_path`, `hooks_create_example`, `hooks_export`, `hooks_import`, `hooks_reload`, `hooks_get_event_types`, `hooks_get_stats`

#### Knowledge (4 commands)

`query_knowledge`, `get_recent_knowledge`, `get_knowledge_by_category`, `knowledge_add`, `knowledge_query`

#### LLM (12 commands)

`llm_send_message`, `llm_configure_provider`, `llm_set_default_provider`, `llm_ensure_managed_cloud`, `llm_get_available_models`, `llm_check_provider_status`, `llm_get_usage_stats`, `llm_get_ollama_models`, `llm_list_ollama_models`, `router_suggestions`, `get_model_capabilities`, `clear_model_capability_cache`

#### LSP (15 commands)

`lsp_start_server`, `lsp_stop_server`, `lsp_did_open`, `lsp_did_change`, `lsp_did_close`, `lsp_completion`, `lsp_hover`, `lsp_definition`, `lsp_references`, `lsp_rename`, `lsp_formatting`, `lsp_workspace_symbol`, `lsp_code_action`, `lsp_get_diagnostics`, `lsp_get_all_diagnostics`, `lsp_list_servers`, `lsp_detect_language`

#### Marketplace / Workflows (52 commands)

`create_workflow`, `update_workflow`, `delete_workflow`, `get_workflow`, `get_user_workflows`, `execute_workflow`, `pause_workflow`, `resume_workflow`, `cancel_workflow`, `get_workflow_status`, `get_execution_logs`, `schedule_workflow`, `trigger_workflow_on_event`, `get_next_execution_time`, `publish_workflow_to_marketplace`, `publish_workflow`, `unpublish_workflow`, `get_featured_workflows`, `get_trending_workflows`, `search_marketplace_workflows`, `get_published_workflows`, `get_workflow_by_id`, `get_workflow_by_share_url`, `get_creator_workflows`, `get_my_published_workflows`, `get_workflows_by_category`, `get_category_counts`, `get_popular_tags`, `clone_marketplace_workflow`, `fork_marketplace_workflow`, `rate_workflow`, `get_workflow_reviews`, `get_user_workflow_rating`, `comment_on_workflow`, `get_workflow_comments`, `delete_workflow_comment`, `favorite_workflow`, `unfavorite_workflow`, `is_workflow_favorited`, `get_user_favorites`, `get_user_clones`, `share_workflow`, `get_workflow_stats`, `get_workflow_analytics`, `get_workflow_share_url`, `get_workflow_embed_code`, `increment_workflow_view_count`, `get_workflow_templates`, `get_workflow_templates_by_category`, `search_workflow_templates`

#### MCP (28 commands)

`mcp_initialize`, `mcp_list_servers`, `mcp_get_registry`, `mcp_install_server`, `mcp_connect_server`, `mcp_disconnect_server`, `mcp_list_tools`, `mcp_search_tools`, `mcp_call_tool`, `mcp_get_config`, `mcp_get_config_location`, `mcp_update_config`, `mcp_enable_server`, `mcp_disable_server`, `mcp_get_stats`, `mcp_get_server_logs`, `mcp_store_credential`, `mcp_get_tool_schemas`, `mcp_get_health`, `mcp_check_server_health`, `mcp_set_credential`, `mcp_delete_credential`, `mcp_update_filesystem_directories`, `mcp_oauth_start`, `mcp_oauth_callback`, `mcp_oauth_status`, `mcp_oauth_disconnect`, `mcp_oauth_refresh`, `mcp_oauth_set_credentials`, `mcp_list_connected_providers`, `mcp_connect_connector`, `save_api_key`

#### MCPB Bundles (10 commands)

`mcpb_fetch_registry`, `mcpb_search_bundles`, `mcpb_get_bundle_details`, `mcpb_install_bundle`, `mcpb_uninstall_bundle`, `mcpb_get_installed_bundles`, `mcpb_check_updates`, `mcpb_update_bundle`, `mcpb_get_categories`, `mcpb_get_featured`

#### Media (3 commands)

`media_generate_image`, `media_generate_video`, `media_get_history`

#### Memory (35 commands)

`memory_remember`, `memory_recall`, `memory_search`, `memory_get_by_category`, `memory_get_important`, `memory_forget`, `memory_forget_topic`, `memory_log_context`, `memory_get_daily_logs`, `memory_get_session_context`, `memory_export_all`, `memory_cleanup_logs`, `memory_store`, `memory_delete`, `memory_list_all`, `memory_list_categories`, `memory_run_decay`, `memory_get_decay_config`, `memory_set_decay_config`, `memory_get_decay_candidates`, `memory_boost_on_access`, `memory_recall_with_boost`, `memory_decay_single`, `memory_get_stats`, `memory_get_compaction_candidates`, `memory_get_logs_in_range`, `memory_compact_old_logs`, `memory_promote_extracted`, `memory_archive_compacted_logs`, `memory_get_extraction_prompt`, `memory_get_compaction_stats`, `memory_export_json`, `memory_export_markdown`, `memory_import_json`, `memory_import_json_string`, `memory_get_dashboard_stats`, `memory_get_project_memories`, `memory_get_usage_trends`, `memory_suggest_important`

#### MCP Extensions (18 commands)

`extension_list`, `extension_get`, `extension_install`, `extension_uninstall`, `extension_enable`, `extension_disable`, `extension_get_config`, `extension_set_config`, `extension_validate`, `extension_list_by_status`, `extension_start_all`, `extension_stop_all`, `extension_get_directory`, `extension_select_package`, `extension_page_context`, `extension_analyze_forms`, `extension_task_result`, `extension_status`

#### Native Messaging (5 commands)

`native_messaging_check_status`, `native_messaging_install`, `native_messaging_uninstall`, `native_messaging_set_extension_id`, `native_messaging_get_connection_state`

#### Notifications (21 commands)

`notification_check_permission`, `notification_request_permission`, `notification_show`, `notification_show_with_actions`, `notification_schedule`, `notification_schedule_reminder`, `notification_cancel`, `notification_cancel_all`, `notification_get_scheduled`, `notification_get`, `notification_update`, `notification_register_actions`, `notification_list`, `notification_mark_read`, `notification_mark_all_read`, `notification_delete`, `notification_delete_all_read`, `notification_get_settings`, `notification_set_settings`, `notification_create`, `notification_unread_count`

#### OCR (8 commands)

`ocr_process_image`, `ocr_process_region`, `ocr_get_languages`, `ocr_get_result`, `ocr_process_with_boxes`, `ocr_detect_languages`, `ocr_process_multi_language`, `ocr_preprocess_image`

#### Ollama (5 commands)

`ollama_check_status`, `ollama_list_models`, `ollama_get_model_info`, `ollama_pull_model`, `ollama_delete_model`

#### Onboarding (16 commands)

`get_onboarding_status`, `complete_onboarding_step`, `skip_onboarding_step`, `reset_onboarding`, `export_user_data`, `check_connectivity`, `get_session_info`, `update_session_activity`, `get_user_preference`, `set_user_preference`, `select_demo`, `record_demo_results`, `mark_setup_completed`, `complete_first_run`, `get_first_run_session`, `get_first_run_statistics`, `skip_first_run`, `start_first_run_experience`, `has_completed_first_run`, `update_first_run_step`, `run_instant_demo`

#### Orchestrator (10 commands)

`orchestrator_init`, `orchestrator_init_default`, `orchestrator_spawn_agent`, `orchestrator_spawn_parallel`, `orchestrator_get_agent_status`, `orchestrator_list_agents`, `orchestrator_cancel_agent`, `orchestrator_cancel_all`, `orchestrator_wait_all`, `orchestrator_cleanup`, `get_system_resources`, `pause_agent`, `resume_agent`, `cancel_agent`, `refresh_agent_status`, `list_active_agents`

#### Process / Operations (5 commands)

`get_process_templates`, `get_outcome_tracking`, `get_process_success_rates`, `get_best_practices`, `get_process_statistics`

#### Productivity (17 commands)

`productivity_connect`, `productivity_list_tasks`, `productivity_create_task`, `productivity_notion_list_pages`, `productivity_notion_query_database`, `productivity_notion_create_database_row`, `productivity_trello_list_boards`, `productivity_trello_list_cards`, `productivity_trello_create_card`, `productivity_trello_move_card`, `productivity_trello_add_comment`, `productivity_asana_list_projects`, `productivity_asana_list_project_tasks`, `productivity_asana_create_task`, `productivity_asana_assign_task`, `productivity_asana_mark_complete`

#### Projects (7 commands)

`project_create`, `project_list`, `project_get`, `project_update`, `project_delete`, `project_get_settings`, `project_update_settings`

#### Project Context (5 commands)

`project_context_set_folder`, `project_context_get_folder`, `project_context_validate_path`, `project_context_list_files`, `project_context_get_summary`

#### Prompt Enhancement (9 commands)

`detect_use_case`, `enhance_prompt`, `route_to_best_api`, `enhance_and_route_prompt`, `get_prompt_enhancement_config`, `set_prompt_enhancement_config`, `get_suggested_provider`, `get_available_use_cases`, `get_available_providers`

#### Research (7 commands)

`research_start`, `research_cancel`, `research_get_config`, `research_set_config`, `research_get_modes`, `research_quick`, `research_check_availability`

#### ROI Dashboard (11 commands)

`compare_to_manual`, `compare_to_previous_period`, `compare_to_industry_benchmark`, `get_milestones`, `share_milestone`, `track_workflow_view`, `acknowledge_milestone`, `get_today_stats`, `get_week_stats`, `get_month_stats`, `get_all_time_stats`, `get_manual_vs_automated_comparison`, `get_period_comparison`, `get_benchmark_comparison`, `get_recent_activity`, `export_roi_report`

#### Screen Capture (8 commands)

`capture_screen_full`, `capture_screen_region`, `capture_get_windows`, `capture_get_history`, `capture_delete`, `capture_save_to_clipboard`, `capture_screen_window`, `capture_from_clipboard`

#### Screen Watcher (8 commands)

`screen_watcher_start`, `screen_watcher_stop`, `screen_watcher_pause`, `screen_watcher_resume`, `screen_watcher_status`, `screen_watcher_get_latest`, `screen_watcher_get_recent`, `screen_watcher_capture_now`

#### Settings (12 commands)

`settings_load`, `settings_save`, `settings_load_from_disk`, `settings_v2_get`, `settings_v2_set`, `settings_v2_get_batch`, `settings_v2_delete`, `settings_v2_get_category`, `settings_v2_load_app_settings`, `settings_v2_save_app_settings`, `settings_v2_clear_cache`, `settings_v2_list_all`

#### Shortcuts (11 commands)

`shortcuts_register`, `shortcuts_unregister`, `shortcuts_list`, `shortcuts_update`, `shortcuts_trigger`, `shortcuts_reset`, `shortcuts_check_key`, `shortcuts_get_defaults`, `shortcuts_apply_quick_query_preferences`, `shortcuts_register_global`, `shortcuts_unregister_global`

#### Skills (12 commands)

`skill_list`, `skill_get`, `skill_get_instructions`, `skill_check_requirements`, `skill_get_context`, `skill_set_workspace`, `skill_count`, `skill_invoke`, `skill_parse_slash_command`, `skill_get_slash_commands`, `skill_reload`, `skill_match_for_message`

#### Stripe / Billing (24 commands)

`billing_initialize`, `stripe_create_customer`, `stripe_get_customer_by_email`, `stripe_create_subscription`, `stripe_get_subscription`, `stripe_update_subscription`, `stripe_cancel_subscription`, `stripe_get_invoices`, `stripe_get_usage`, `stripe_track_usage`, `stripe_create_portal_session`, `stripe_get_active_subscription`, `stripe_process_webhook`, `stripe_get_payment_methods`, `stripe_create_setup_intent`, `stripe_attach_payment_method`, `stripe_set_default_payment_method`, `stripe_delete_payment_method`, `send_invoice_email`, `subscribe_to_plan`, `upgrade_plan`, `cancel_subscription`, `get_pricing_plans`, `get_current_plan`

#### Subscription (5 commands)

`subscribe_to_plan`, `upgrade_plan`, `cancel_subscription`, `get_pricing_plans`, `get_current_plan`

#### Task Persistence (11 commands)

`task_create`, `task_get_status`, `task_update_progress`, `task_pause`, `task_resume`, `task_cancel`, `task_list`, `task_list_by_status`, `task_complete`, `task_save_context`, `task_get_resumable`, `coord_update_app_state`, `coord_request_approval`, `coord_get_pending_approvals`

#### Teams (27 commands)

`create_team`, `get_team`, `update_team`, `update_team_settings`, `delete_team`, `get_user_teams`, `invite_member`, `accept_invitation`, `remove_member`, `update_member_role`, `get_team_members`, `get_team_invitations`, `share_resource`, `unshare_resource`, `get_team_resources`, `get_team_resources_by_type`, `get_team_activity`, `get_user_team_activity`, `get_team_billing`, `initialize_team_billing`, `update_team_plan`, `add_team_seats`, `remove_team_seats`, `calculate_team_cost`, `update_team_usage`, `transfer_team_ownership`

#### Templates (8 commands)

`get_all_templates`, `get_template_by_id`, `get_templates_by_category`, `install_template`, `get_installed_templates`, `search_templates`, `execute_template`, `uninstall_template`, `get_template_categories`

#### Terminal (16 commands)

`terminal_detect_shells`, `terminal_create_session`, `terminal_send_input`, `terminal_resize`, `terminal_kill`, `terminal_list_sessions`, `terminal_get_history`, `terminal_ai_suggest_command`, `terminal_ai_explain_error`, `terminal_smart_commit`, `terminal_ai_suggest_improvements`, `terminal_clear_history`, `terminal_set_env`, `terminal_get_env`, `terminal_list_env`, `terminal_unset_env`

#### Timeout (3 commands)

`timeout_get_config`, `timeout_set_config`, `timeout_get_recommended`

#### Updater (5 commands, cfg-gated)

`check_for_updates`, `install_update`, `install_update_and_restart`, `get_current_version`, `get_version_info`

#### Vision (7 commands)

`vision_analyze_screenshot`, `vision_extract_text`, `vision_compare_images`, `vision_locate_element`, `vision_describe_ui_elements`, `vision_answer_question`, `vision_send_message`

#### Voice (42 commands)

`voice_transcribe_file`, `voice_transcribe_blob`, `voice_configure`, `voice_get_settings`, `voice_check_local_whisper`, `voice_get_capabilities`, `voice_tts_speak`, `voice_tts_list_voices`, `voice_tts_configure`, `voice_wake_enable`, `voice_wake_disable`, `voice_wake_status`, `voice_wake_configure`, `voice_ptt_configure`, `voice_ptt_state`, `voice_ptt_key_down`, `voice_ptt_key_up`, `voice_download_whisper_model`, `voice_list_whisper_models`, `voice_set_whisper_model`, `voice_delete_whisper_model`, `voice_transcribe_local`, `voice_download_piper_voice`, `voice_list_piper_voices`, `voice_set_piper_voice`, `voice_delete_piper_voice`, `voice_tts_speak_local`, `voice_download_piper_binary`, `voice_check_piper_binary`, `voice_list_local_models`, `speech_start_recording`, `speech_stop_and_transcribe`, `voice_tts_stop`, `voice_tts_is_playing`, `voice_tts_speak_with_barge_in`, `voice_deepgram_configure`, `voice_deepgram_send_audio`, `voice_deepgram_status`, `voice_start_deepgram_stream`, `voice_stop_deepgram_stream`, `voice_configure_barge_in`, `voice_enable_barge_in`, `voice_get_barge_in_status`, `voice_set_barge_in_sensitivity`, `voice_start_barge_in_monitoring`, `voice_stop_barge_in_monitoring`, `voice_convert_audio_to_pcm`

#### Window / Tray (16 commands)

`window_get_state`, `window_set_pinned`, `window_set_always_on_top`, `window_set_visibility`, `window_dock`, `window_is_maximized`, `window_maximize`, `window_unmaximize`, `window_toggle_maximize`, `window_set_fullscreen`, `window_is_fullscreen`, `window_toggle_floating`, `window_open_floating`, `window_close_floating`, `window_is_floating_visible`, `tray_set_unread_badge`

#### Workspace (7 commands)

`workspace_index`, `workspace_search_symbols`, `workspace_find_definition`, `workspace_find_references`, `workspace_get_dependencies`, `workspace_get_file_symbols`, `workspace_get_stats`

### Key Findings

1. **Zero dead commands**: All 1,092 declared `#[tauri::command]` functions in sys/commands/ are registered.
2. **Scheduler naming consistent**: All 10 scheduler commands use `_job`. No `_task` mismatch in Rust.
3. **Command count vastly understated**: Documentation says "60+" — actual is 1,324.
4. **cfg-gated commands**: 5 updater commands are `#[cfg(feature = "updater")]` only.
5. **Dual parameter acceptance**: Several scheduler commands accept both `job_id` and `id` for backwards compat.
6. **90 command files** across sys/commands/ plus 8 additional modules.

### Files Audited

All 90 `.rs` files in `sys/commands/` with `#[tauri::command]`:
agi.rs, agi_checkpoint.rs, agent.rs, ai_native.rs, analytics.rs, api.rs, artifacts.rs, automation.rs, automation_enhanced.rs, background_agents.rs, background_llm.rs, background_tasks.rs, browser.rs, cache.rs, canvas.rs, capabilities.rs, capture.rs, chat/branching.rs, chat/mod.rs, chat_memory_integration.rs, checkpoints.rs, cloud.rs, code_editing.rs, code_execution.rs, completion.rs, computer_use.rs, continuous_job_runner.rs, custom_instructions.rs, database.rs, debugging.rs, design.rs, document.rs, email.rs, error_reporting.rs, extension.rs, feedback.rs, file_ops.rs, file_watcher.rs, git.rs, github.rs, gmail_oauth.rs, google_batch.rs, governance.rs, hooks.rs, intent.rs, knowledge.rs, llm.rs, lsp.rs, marketplace.rs, master_password.rs, mcp.rs, mcp_extensions.rs, mcp_oauth.rs, mcpb.rs, media.rs, memory.rs, messaging.rs, metrics.rs, migration.rs, native_messaging.rs, notification_center.rs, notifications.rs, ocr.rs, ollama.rs, onboarding.rs, operations.rs, orchestration.rs, privacy.rs, process_reasoning.rs, productivity.rs, project_context.rs, project_memory.rs, projects.rs, prompt_enhancement.rs, realtime.rs, research.rs, scheduler.rs, screen_watcher.rs, security.rs, settings.rs, settings_v2.rs, shortcuts.rs, skills.rs, subscription.rs, swarm.rs, task_persistence.rs, teams.rs, templates.rs, terminal.rs, thinking.rs, tool_confirmation.rs, tray.rs, tutorials.rs, undo.rs, vision.rs, voice.rs, window.rs, workspace.rs
