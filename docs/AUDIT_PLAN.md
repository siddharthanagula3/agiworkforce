# Full Codebase Stabilization Audit
**Created:** 2026-03-11
**Total files:** ~1,485 (702 Rust + 783 TypeScript)
**Strategy:** 10 waves of parallel agents, progress tracked via this file
**Mode:** AUDIT + FIX — agents will find bugs AND fix them, search web for correct implementations, copy from open source where needed
**Permissions:** Full file system access, web search enabled, open source reference allowed

## Wave Assignments

### Wave 1: Rust Critical Path (10 agents)
| Agent | Scope | Files |
|-------|-------|-------|
| W1-A1 | core/llm/ (router, SSE, providers) | llm_router.rs, sse_parser.rs, provider_adapter.rs, providers/*.rs, mod.rs |
| W1-A2 | core/llm/ (tools, cost, tokens) | tool_executor/*.rs, cost_calculator.rs, token_counter.rs, function_executor.rs |
| W1-A3 | core/llm/ (cache, fallback, config) | cache_manager.rs, fallback_chain.rs, capability_detection.rs, models_config.rs, thinking.rs, memory_integration.rs, prompt_policy.rs, prompt_tool_injection.rs, server_tools.rs, background_manager.rs, job_autofill_runtime.rs |
| W1-A4 | core/agent/ | executor.rs, planner.rs, autonomous.rs, background_agent.rs, runtime.rs, vision.rs, ai_orchestrator.rs, approval.rs, context_*.rs, mod.rs |
| W1-A5 | core/agent/ (secondary) | code_generator.rs, change_tracker.rs, continuous_executor.rs, form_undo.rs, intelligent_file_access.rs, prompt_engineer.rs, rag_system.rs, timeout_manager.rs, undo_manager.rs, background_tasks.rs |
| W1-A6 | core/mcp/ | client.rs, manager.rs, config.rs, transport.rs, protocol.rs, registry.rs, session.rs, health.rs, events.rs, logs.rs, error.rs, tool_executor.rs, mod.rs |
| W1-A7 | core/mcp/server + extensions | server/*.rs, extensions/*.rs |
| W1-A8 | core/agi/ (core) | core.rs, executor.rs, orchestrator.rs, planner.rs, mod.rs, api_tools_impl.rs, tools/*.rs |
| W1-A9 | core/agi/ (memory + learning) | memory.rs, memory_manager.rs, memory_persistence.rs, knowledge.rs, learning.rs, reflection.rs, semantic_search.rs, conversation_summarizer.rs, project_memory.rs, planner_memory_integration.rs |
| W1-A10 | core/agi/ (executors) | executors/*.rs |

### Wave 2: Rust System + Data (10 agents)
| Agent | Scope | Files |
|-------|-------|-------|
| W2-A1 | sys/commands/chat/ | send_message.rs, streaming.rs, tool_events.rs, conversation.rs, messages.rs, mod.rs, types.rs, tools.rs |
| W2-A2 | sys/commands/chat/ (secondary) | attachments.rs, branching.rs, compaction.rs, context.rs, control.rs, cost.rs, export.rs, intent.rs, memory_handler.rs, pending.rs, search.rs, share.rs, state.rs |
| W2-A3 | sys/security/ | tool_guard.rs, secret_manager.rs, encryption.rs, auth.rs, auth_db.rs, rbac.rs, rate_limit.rs, sandbox.rs, permissions.rs |
| W2-A4 | sys/security/ (secondary) | approval_workflow.rs, audit.rs, audit_logger.rs, command_validator.rs, dm_protection.rs, guardrails.rs, log_redaction.rs, machine_key.rs, master_password.rs, oauth.rs, policy/*.rs, prompt_injection.rs, storage.rs, updater.rs, validator.rs, api.rs, policy_integration.rs |
| W2-A5 | sys/commands/ (A-F) | agent.rs, agi.rs, agi_checkpoint.rs, ai_native.rs, analytics.rs, api.rs, artifacts.rs, auth.rs, automation.rs, automation_enhanced.rs, background_*.rs, browser.rs, cache.rs, calendar.rs, canvas.rs, capabilities.rs, capture.rs, chat_memory_integration.rs, checkpoints.rs, cloud.rs, code_*.rs, completion.rs, computer_use.rs, config_hierarchy.rs, continuous_job_runner.rs, custom_*.rs, database.rs, debugging.rs, design.rs, document.rs, email.rs, embeddings.rs, error_reporting.rs, extension.rs, feedback.rs, file_*.rs |
| W2-A6 | sys/commands/ (G-Z) | git.rs, github.rs, gmail_oauth.rs, google_batch.rs, governance.rs, hooks.rs, intent.rs, interactive.rs, knowledge.rs, llm.rs, lsp.rs, marketplace.rs, master_password.rs, mcp*.rs, media.rs, memory.rs, messaging.rs, metrics.rs, migration.rs, mod.rs, native_messaging.rs, notification*.rs, ocr.rs, ollama.rs, onboarding.rs, operations.rs, orchestration.rs, privacy.rs, process_reasoning.rs, productivity.rs, project_*.rs, prompt_enhancement.rs, realtime.rs, research.rs, scheduler.rs, screen_watcher.rs, security.rs, settings*.rs, shortcuts.rs, skills.rs, subscription.rs, swarm.rs, system_permissions.rs, task_persistence.rs, teams.rs, templates.rs, terminal.rs, test_runner.rs, thinking.rs, tool_confirmation.rs, tray.rs, tutorials.rs, undo.rs, vision.rs, voice*.rs, window.rs, workspace.rs |
| W2-A7 | data/ | db/*.rs, database/*.rs, settings/*.rs, cache/*.rs, analytics/*.rs, metrics/*.rs, state.rs, config_hierarchy.rs, supabase_sync.rs, mod.rs |
| W2-A8 | Root + lib.rs + state.rs | main.rs, lib.rs, state.rs, Cargo.toml, tauri.conf.json |
| W2-A9 | sys/ (non-commands) | billing/*.rs, diagnostics/*.rs, error/*.rs, filesystem/*.rs, logging/*.rs, permissions/*.rs, telemetry/*.rs, prompt_enhancement/*.rs, api/*.rs, account/*.rs, power.rs, utils.rs |
| W2-A10 | ui/ + models/ | ui/events/*.rs, ui/hooks/*.rs, ui/onboarding/*.rs, ui/overlay/*.rs, ui/tray.rs, ui/window/*.rs, models/*.rs |

### Wave 3: Rust Features + Automation (10 agents)
| Agent | Scope | Files |
|-------|-------|-------|
| W3-A1 | automation/browser/ | advanced.rs, cdp_client.rs, dom_operations.rs, extension_bridge.rs, playwright_bridge.rs, semantic.rs, tab_manager.rs, mod.rs |
| W3-A2 | automation/computer_use/ | observe_plan_act.rs, safety.rs, session.rs, types.rs, visual_reasoner.rs, window_manager.rs, zoom.rs, mod.rs |
| W3-A3 | automation/ (rest) | input/*.rs, screen/*.rs, mac/*.rs, uia/*.rs, executor.rs, inspector.rs, recorder.rs, safety*.rs, screen_watcher.rs, types.rs, vision_planner.rs, codegen.rs, os_lock.rs, mod.rs |
| W3-A4 | features/terminal + speech | terminal/*.rs, speech/*.rs |
| W3-A5 | features/document + canvas | document/*.rs, canvas/*.rs |
| W3-A6 | features/ (rest) | calendar/*.rs, clipboard/*.rs, communications/*.rs, messaging/*.rs, productivity/*.rs, projects/*.rs, search/*.rs, tasks/*.rs, teams/*.rs, workflows/*.rs, webhooks/*.rs, updater.rs, mod.rs |
| W3-A7 | integrations/ | api_integrations/*.rs, cloud/*.rs, native_messaging/*.rs, realtime/*.rs, sync/*.rs, mod.rs |
| W3-A8 | core/ (remaining) | artifacts/*.rs, codebase/*.rs, embeddings/*.rs, hooks/*.rs, intent/*.rs, research/*.rs, scheduler/*.rs, skills/*.rs, swarm/*.rs, orchestration/*.rs, models/*.rs, sync_utils.rs |
| W3-A9 | core/agi/ (remaining) | audio_processing.rs, checkpoint*.rs, comparator.rs, context_manager.rs, outcome_tracker.rs, process_*.rs, resources.rs, sandbox.rs, templates/*.rs |
| W3-A10 | Rust tests (all) | All test files: core/*/tests/*.rs, sys/test_utils/*.rs, tests/*.rs, automation/*/tests.rs, features/tests/*.rs |

### Wave 4: Frontend Components A-M (10 agents)
| Agent | Scope | Files |
|-------|-------|-------|
| W4-A1 | UnifiedAgenticChat/ (core) | index.tsx, ChatStream.tsx, ChatInputArea.tsx, ChatMessageList.tsx, useSendMessage.ts, useStopGeneration.ts, useStreamBuffer.ts, useTauriStreamListeners.ts |
| W4-A2 | UnifiedAgenticChat/ (tools) | ToolLabel.tsx, ToolTimeline.tsx, ToolCallCard.tsx, ToolRationaleDisplay.tsx, toolTimeoutPolicy.ts, Cards/*.tsx |
| W4-A3 | UnifiedAgenticChat/ (inline results) | InlineToolResults/*.tsx |
| W4-A4 | UnifiedAgenticChat/ (message) | MessageBubble/*.tsx, CodeBlock.tsx, ThinkingBlock.tsx, ReasoningAccordion.tsx |
| W4-A5 | UnifiedAgenticChat/ (UI chrome) | Sidebar.tsx, AppLayout.tsx, ChatInputToolbar.tsx, InputToolbar.tsx, InputFooter.tsx, CommandPalette.tsx, SlashCommandMenu.tsx, ModelSelectorButton.tsx, QuickModelSelector.tsx, SendButton.tsx, VoiceInputButton.tsx, all remaining UnifiedAgenticChat/*.tsx |
| W4-A6 | UnifiedAgenticChat/ (panels + hooks) | InlinePanels/*.tsx, Sidecar/*.tsx, Visualizations/*.tsx, Widgets/*.tsx, artifact-components/*.tsx, hooks/*.ts |
| W4-A7 | components/Settings/ | All Settings/*.tsx |
| W4-A8 | components/MCP/ + Browser/ + Agent/ | MCP/*.tsx, Browser/*.tsx, Agent/*.tsx, AGI/*.tsx |
| W4-A9 | components/Execution/ + ToolCalling/ + Canvas/ + Code/ | Execution/*.tsx, ToolCalling/*.tsx, Canvas/*.tsx, Code/*.tsx, editing/*.tsx, Editor/*.tsx |
| W4-A10 | components/ (A-L remaining) | Auth/*.tsx, Analytics/*.tsx, Artifacts/*.tsx, Automation/*.tsx, BackgroundTasks/*.tsx, Beta/*.tsx, Calendar/*.tsx, Cloud/*.tsx, Communications/*.tsx, ComputerUse/*.tsx, Connectors/*.tsx, CustomInstructions/*.tsx, Database/*.tsx, Document/*.tsx, Documents/*.tsx, ErrorBoundary.tsx, ErrorHandling/*.tsx, Errors/*.tsx, Feedback/*.tsx, FileUpload/*.tsx, Filesystem/*.tsx, FloatingChat/*.tsx, Git/*.tsx, Governance/*.tsx, Help/*.tsx, Layout/*.tsx |

### Wave 5: Frontend Components M-Z + Stores (10 agents)
| Agent | Scope | Files |
|-------|-------|-------|
| W5-A1 | components/ (M-Z) | Marketplace/*.tsx, Media/*.tsx, Memory/*.tsx, MemoryPanel/*.tsx, Messaging/*.tsx, Mobile/*.tsx, ModelComparison/*.tsx, Notifications/*.tsx, Onboarding/*.tsx, Outcomes/*.tsx, Overlay/*.tsx, Productivity/*.tsx, QuickQuery/*.tsx, Realtime/*.tsx, Reminders/*.tsx, Research/*.tsx, ResourceMonitor/*.tsx, ROIDashboard/*.tsx, Scheduler/*.tsx, ScreenCapture/*.tsx, SearchResultsRenderer/*.tsx |
| W5-A2 | components/ (remaining) | SimpleMode/*.tsx, SkillMarketplace/*.tsx, StatusBanner.tsx, Subscription/*.tsx, Teams/*.tsx, templates/*.tsx, Terminal/*.tsx, Tools/*.tsx, Tutorials/*.tsx, ui/*.tsx, Updates/*.tsx, Vision/*.tsx, Voice/*.tsx, Workflows/*.tsx |
| W5-A3 | stores/ (chat critical) | unifiedChatStore.ts, chat/chatStore.ts, chat/toolStore.ts, chat/agentStore.ts, chat/types.ts, chat/index.ts |
| W5-A4 | stores/ (settings + auth) | settingsStore.ts, auth.ts, authCoreStore.ts, authOrchestrator.ts, billingStore.ts, billingUsage.ts, subscriptionPlanStore.ts, deviceLinkStore.ts, featureFlagStore.ts |
| W5-A5 | stores/ (model + MCP) | modelStore.ts, mcpStore.ts, mcpbStore.ts, mcpServerStore.ts, mcpAppStore.ts, llmConfigStore.ts |
| W5-A6 | stores/ (remaining) | All other stores (agentTaskStore, analyticsMetricsStore, apiStore, appPreferencesStore, artifactStore, automationStore, browserStore, calendarStore, canvasStore, chatPreferencesStore, cloudStore, codeStore, computerUseStore, connectionStore, connectorsStore, costStore, customAgentsStore, customInstructionsStore, databaseStore, documentStore, editingStore, emailStore, execution*.ts, filesystemStore, governanceStore, logoutCleanup, mediaGenerationStore, memoryStore, productivityStore, projectStore, promptStashStore, researchStore, roiStore, schedulerStore, security*.ts, settingsDialogStore, skillMarketplaceStore, teamStore, templateStore, terminalStore, tokenBudgetStore, ui.ts, updaterStore, usageTrackingStore, voiceInputStore) |
| W5-A7 | hooks/ | All hooks/*.ts |
| W5-A8 | lib/ + utils/ + services/ | lib/*.ts, utils/*.ts, services/*.ts |
| W5-A9 | types/ + constants/ + api/ | types/*.ts, constants/*.ts, api/*.ts |
| W5-A10 | Root + config + themes | App.tsx, main.tsx, vite-env.d.ts, themes/*.ts, providers/*.tsx, features/experimental/*.tsx, handlers/*.ts, i18n/*.ts, integrations/*.ts, test/*.ts |

### Wave 6: Cross-cutting Integration Audit (5 agents)
| Agent | Scope | Focus |
|-------|-------|-------|
| W6-A1 | Critical user path | Trace: user types message → send_message.rs → llm_router → stream → SSE → frontend display. Document every hop. |
| W6-A2 | Tool execution path | Trace: LLM returns tool_call → tool_executor → ToolGuard → execute → ToolEvent → frontend ToolLabel/Timeline. Document every hop. |
| W6-A3 | MCP tool path | Trace: MCP server connects → tool registered → user invokes → execute → result displayed. Document every hop. |
| W6-A4 | Dead code detection | Find commands in lib.rs generate_handler!() that have no frontend invoke() call. Find stores with no component imports. Find components with no route/render. |
| W6-A5 | IPC contract audit | Verify every invoke() call uses camelCase. Verify every Tauri event listener matches Rust emit. Verify all type definitions match. |

## Progress Tracking

| Wave | Status | Agents Complete | Bugs Found | Started | Finished |
|------|--------|-----------------|------------|---------|----------|
| W1   | NOT_STARTED | 0/10 | 0 | - | - |
| W2   | NOT_STARTED | 0/10 | 0 | - | - |
| W3   | NOT_STARTED | 0/10 | 0 | - | - |
| W4   | NOT_STARTED | 0/10 | 0 | - | - |
| W5   | NOT_STARTED | 0/10 | 0 | - | - |
| W6   | NOT_STARTED | 0/5  | 0 | - | - |
