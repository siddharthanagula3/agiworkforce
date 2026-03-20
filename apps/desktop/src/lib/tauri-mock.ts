// AUDIT-ENV-064 fix: Unified Tauri runtime detection
// Checks for both __TAURI_INTERNALS__ and __TAURI__ to handle different Tauri versions
export const isTauri =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

const isTestEnvironment =
  typeof process !== 'undefined' && (process.env['NODE_ENV'] === 'test' || process.env['VITEST']);

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke<T>(command, args);
  }

  // Production mode: Not in Tauri and not in test environment
  if (!isTestEnvironment) {
    const errorMessage = `This feature requires the AGI Workforce desktop application. Please download it from https://agiworkforce.com/download`;
    console.error(`[Tauri] ${errorMessage}`, { command, args });
    throw new Error(errorMessage);
  }

  // Test environment: Return empty arrays/objects to avoid breaking tests
  switch (command) {
    case 'get_onboarding_status':
      return { completed: false } as T;

    case 'check_automation_permissions':
      return { accessibility: false, screen_recording: false, input_monitoring: false } as T;

    case 'request_automation_permission':
    case 'set_auto_approve_all':
    case 'set_agent_mode':
    case 'sync_capabilities':
      return undefined as T;

    case 'get_auto_approve_all':
      return false as T;

    case 'get_agent_mode':
      return 'build' as T;

    case 'get_capabilities':
      return {} as T;

    case 'check_capability':
      return true as T;

    // Master password commands
    case 'master_password_get_status':
      return {
        is_configured: false,
        is_unlocked: false,
        last_changed: null,
        needs_migration: false,
      } as T;
    case 'master_password_is_configured':
      return false as T;
    case 'master_password_is_unlocked':
      return false as T;
    case 'master_password_needs_migration':
      return false as T;
    case 'master_password_setup':
    case 'master_password_unlock':
    case 'master_password_change':
      return { success: true, message: 'ok' } as T;
    case 'master_password_lock':
    case 'master_password_verify':
    case 'master_password_start_migration':
    case 'master_password_complete_migration':
      return undefined as T;

    case 'get_all_templates':
    case 'get_installed_templates':
    case 'get_user_workflows':
    case 'get_user_teams':
    case 'chat_get_conversations':
    case 'chat_get_messages':
    case 'orchestrator_list_agents':
    case 'project_list':
      return [] as T;

    case 'project_create':
      return args?.['project'] as T;

    case 'project_get':
      return null as T;

    case 'project_update':
    case 'project_delete':
    case 'project_update_settings':
    case 'file_open_with_default_app':
      return undefined as T;

    case 'document_create_pdf_simple':
    case 'document_create_word_simple':
    case 'document_create_excel_simple':
      return (args?.['outputPath'] ?? '/tmp/mock-document') as T;

    // Sandboxed code execution
    case 'execute_code':
      return {
        success: true,
        stdout: '(mock output)',
        stderr: '',
        output: '(mock output)',
        error: null,
        exit_code: 0,
        execution_time_ms: 42,
        language: (args?.['language'] as string | undefined) ?? 'python',
        timed_out: false,
      } as T;
    case 'terminal_execute':
      return { stdout: '(mock terminal output)', stderr: '', exit_code: 0 } as T;

    case 'project_get_settings':
      return {} as T;

    case 'chat_send_message':
      throw new Error('Chat functionality requires the desktop application');

    // Simple synchronous LLM call used by voice post-processing and other lightweight tasks
    case 'llm_send_message': {
      // In test/web mode return the first user message unchanged so callers still get a string
      const msgs =
        (args?.['messages'] as Array<{ role: string; content: string }> | undefined) ?? [];
      const lastUserMsg = [...msgs].reverse().find((m) => m.role === 'user')?.content ?? '';
      return { content: lastUserMsg, model: args?.['model'] ?? 'mock', cached: false } as T;
    }

    // Voice dictation commands (Whisper / Deepgram — requires Rust backend)
    case 'speech_start_recording':
      return undefined as T;
    case 'speech_stop_and_transcribe':
      // Return a mock transcript so the post-processing path can be exercised in tests
      return { text: '(mock transcript)', confidence: 0.95 } as T;
    case 'voice_transcribe_blob':
      return { text: '(mock transcript)', language: 'en', duration: 1.0, confidence: 0.95 } as T;

    case 'router_suggestions':
      throw new Error('Router suggestions require the desktop application');

    case 'orchestrator_init_default':
    case 'orchestrator_cancel_agent':
      return undefined as T;

    case 'orchestrator_spawn_agent':
      throw new Error('Agent orchestration requires the desktop application');

    // Research commands
    case 'research_start':
      return `session_mock_${Date.now()}` as T;
    case 'research_cancel':
      return undefined as T;
    case 'research_get_status':
      return {
        id: (args?.['sessionId'] as string) ?? '',
        query: '',
        depth: 'standard',
        status: 'complete',
        sources: [],
        report: null,
        startedAt: Date.now(),
        completedAt: Date.now(),
        currentStep: 0,
        totalSteps: 6,
        currentMessage: 'Complete',
      } as T;
    case 'research_get_config':
      return {
        default_mode: 'standard',
        enable_web_search: true,
        enable_document_search: true,
        enable_email_search: true,
        enable_calendar_search: true,
        enable_memory_search: true,
        min_confidence_threshold: 0.3,
        max_concurrent_agents: 5,
        show_confidence_indicators: true,
        generate_inline_citations: true,
      } as T;
    case 'research_set_config':
      return undefined as T;
    case 'research_check_availability':
      return {
        available: false,
        sources: {
          web_search: { enabled: false, status: 'unavailable' },
          document_search: { enabled: false, status: 'unavailable' },
          email_search: { enabled: false, status: 'unavailable' },
          calendar_search: { enabled: false, status: 'unavailable' },
          memory_search: { enabled: false, status: 'unavailable' },
        },
        default_mode: 'standard',
      } as T;

    // AGI goal commands
    case 'agi_submit_goal':
      return { goalId: `goal_mock_${Date.now()}` } as T;
    case 'agi_submit_goal_parallel':
      return { bestResult: { score: 0.85 } } as T;
    case 'agi_list_goals':
      return [] as T;
    case 'agi_get_goal_status':
      return { context: { currentIteration: 0, status: 'pending' } } as T;
    case 'agi_cancel_goal':
      return undefined as T;
    case 'agi_get_reflection_insights':
      return null as T;

    // Realtime presence commands
    case 'connect_websocket':
      return {
        url: 'ws://127.0.0.1:8787',
        token: 'mock-token',
      } as T;
    case 'get_team_presence':
      return [] as T;
    case 'get_user_presence':
      return null as T;
    case 'set_user_online':
    case 'set_user_offline':
    case 'update_user_activity':
      return undefined as T;

    // MCP Connector/OAuth commands
    case 'mcp_list_connected_providers':
      return [] as T;
    case 'mcp_get_registry':
      return [] as T;
    case 'mcp_install_server':
      return 'installed' as T;
    case 'mcp_get_server_logs':
      return [] as T;
    case 'mcp_get_execution_history':
      return [] as T;
    case 'mcp_get_tool_execution_stats':
      return [] as T;
    case 'mcp_get_health':
      return [] as T;
    case 'mcp_check_server_health':
      return {
        server_name: (args?.['serverName'] as string | undefined) ?? 'mock-server',
        status: 'healthy',
        last_check: new Date().toISOString(),
        error_message: null,
        response_time_ms: 10,
        tool_count: 0,
        consecutive_failures: 0,
      } as T;
    case 'mcp_oauth_start':
      return {
        auth_url: 'https://example.com/oauth',
        state: 'mock-oauth-state',
      } as T;
    case 'mcp_oauth_callback':
      return {
        provider: (args?.['provider'] as string | undefined) ?? 'mock-provider',
        connected: true,
        expires_at: null,
      } as T;
    case 'mcp_oauth_disconnect':
    case 'mcp_oauth_set_credentials':
      return undefined as T;
    case 'mcp_oauth_credentials_status':
      return { configured: false } as T;
    case 'mcp_connect_connector':
      return null as T;
    case 'save_api_key':
    case 'mcp_server_start':
    case 'mcp_server_stop':
    case 'mcp_server_update_config':
    case 'mcp_update_filesystem_directories':
      return undefined as T;
    case 'mcp_server_get_config':
      return {
        port: 3001,
        token: '********mock',
        enabled_tools: [],
        running: false,
      } as T;
    case 'mcp_server_status':
      return false as T;
    case 'mcp_server_list_tools':
      return { tools: [] } as T;
    case 'mcp_set_credential':
      return 'Credential stored' as T;
    case 'mcp_delete_credential':
      return 'Credential deleted' as T;

    // Model capabilities command
    case 'get_model_capabilities':
      return {
        supports_tools: true,
        supports_vision: false,
        supports_streaming: true,
        supports_thinking: false,
        context_length: 4096,
        tool_mode: 'none',
      } as T;

    // MCP Extension commands
    case 'extension_list':
      return [] as T;

    case 'extension_get':
      return null as T;

    case 'extension_select_package':
      return null as T;

    case 'extension_install':
    case 'extension_uninstall':
    case 'extension_enable':
    case 'extension_disable':
      throw new Error('Extension management requires the desktop application');

    // Scheduler commands (job-based naming to match Rust backend)
    case 'scheduler_list_jobs':
      return [] as T;

    case 'scheduler_add_job':
      return `sched_mock_${Date.now()}` as T;

    case 'scheduler_update_job':
    case 'scheduler_remove_job':
    case 'scheduler_toggle_job':
    case 'scheduler_run_job_now':
      return undefined as T;

    case 'scheduler_get_job':
      return null as T;

    case 'scheduler_get_history':
    case 'scheduler_get_next_runs':
      return [] as T;

    // Analytics trend commands
    case 'analytics_get_cost_saved_trend':
    case 'analytics_get_time_saved_trend':
      return [] as T;

    // Background task commands
    case 'background_task_list':
      return [] as T;

    case 'background_task_status':
      return null as T;

    case 'background_task_cancel':
      return undefined as T;

    // Workflow execution
    case 'execute_workflow':
      return undefined as T;

    // Automation script commands
    case 'list_automation_scripts':
      return [] as T;
    case 'save_recording_as_script':
      return {
        id: `script_mock_${Date.now()}`,
        name: (args?.['name'] as string | undefined) ?? 'Mock Script',
        description: (args?.['description'] as string | undefined) ?? '',
        tags: (args?.['tags'] as string[] | undefined) ?? [],
        actions: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as T;
    case 'save_automation_script':
      return undefined as T;
    case 'delete_automation_script':
      return undefined as T;
    case 'execute_automation_script':
      return {
        success: true,
        actionsCompleted: 0,
        actionsFailed: 0,
        durationMs: 0,
        screenshots: [],
        logs: [],
      } as T;
    case 'inspect_element_at':
      return null as T;

    // Marketplace commands
    case 'get_published_workflows':
    case 'get_featured_workflows':
    case 'get_trending_workflows':
    case 'get_my_published_workflows':
    case 'get_workflow_by_id':
    case 'get_workflow_reviews':
    case 'get_workflow_comments':
    case 'get_workflow_analytics':
    case 'get_workflow_stats':
    case 'get_category_counts':
    case 'get_popular_tags':
    case 'search_marketplace_workflows':
      return [] as T;

    case 'clone_marketplace_workflow':
    case 'publish_workflow':
    case 'unpublish_workflow':
    case 'rate_workflow':
    case 'favorite_workflow':
    case 'unfavorite_workflow':
    case 'comment_on_workflow':
    case 'delete_workflow_comment':
    case 'get_workflow_share_url':
    case 'share_workflow':
    case 'get_workflow_embed_code':
    case 'increment_workflow_view_count':
    case 'is_workflow_favorited':
    case 'get_user_workflow_rating':
      return undefined as T;

    // ROI/Metrics commands
    case 'get_today_stats':
    case 'get_week_stats':
    case 'get_month_stats':
    case 'get_all_time_stats':
    case 'get_milestones':
    case 'get_manual_vs_automated_comparison':
    case 'get_period_comparison':
    case 'get_benchmark_comparison':
    case 'get_recent_activity':
    case 'acknowledge_milestone':
      return {
        totalTimeSavedHours: 0,
        totalCostSavedUsd: 0,
        automationsRun: 0,
        avgQualityScore: 0,
        changeFromYesterday: 0,
        changeFromLastWeek: 0,
        changeFromLastMonth: 0,
        topEmployees: [],
        dailyBreakdown: [],
        weeklyBreakdown: [],
        monthlyTrend: [],
        milestonesAchieved: 0,
      } as T;

    case 'export_roi_report':
      return 'mock_report_path.txt' as T;

    case 'get_filtered_logs':
      return [] as T;

    case 'submit_feedback':
      return undefined as T;

    // Conversation branching commands
    case 'conversation_fork':
      return {
        branch: {
          id: `branch_${Date.now()}`,
          name: (args?.['branchName'] as string | undefined) ?? 'fork',
          parentBranchId: 'main',
          forkPointMessageId: (args?.['messageId'] as number | undefined) ?? 0,
          createdAt: new Date().toISOString(),
        },
        messages: [],
      } as T;

    case 'conversation_list_branches':
      return [
        {
          id: 'main',
          name: 'main',
          parentBranchId: undefined,
          forkPointMessageId: undefined,
          createdAt: new Date().toISOString(),
        },
      ] as T;

    case 'conversation_switch_branch':
      return [] as T;

    case 'conversation_delete_branch':
      return undefined as T;

    case 'conversation_export_pdf':
      return (args?.['outputPath'] ?? '/tmp/mock-conversation.pdf') as T;

    // Backend-wired chat commands
    case 'chat_get_conversation':
      return {
        id: (args?.['id'] as number) ?? 1,
        user_id: (args?.['userId'] as string) ?? 'mock-user',
        title: 'Mock Conversation',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as T;

    case 'chat_create_conversation':
      return {
        id: Date.now(),
        user_id: 'mock-user',
        title: (args?.['request'] as Record<string, unknown>)?.['title'] ?? 'New Conversation',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as T;

    case 'chat_update_conversation':
      return undefined as T;

    case 'chat_create_message':
      return {
        id: Date.now(),
        conversation_id: 1,
        user_id: 'mock-user',
        role: 'user',
        content: '',
        tokens: null,
        cost: null,
        provider: null,
        model: null,
        created_at: new Date().toISOString(),
      } as T;

    case 'chat_update_message':
      return {
        id: (args?.['id'] as number) ?? 1,
        conversation_id: 1,
        user_id: 'mock-user',
        role: 'user',
        content: (args?.['content'] as string) ?? '',
        tokens: null,
        cost: null,
        provider: null,
        model: null,
        created_at: new Date().toISOString(),
      } as T;

    case 'chat_delete_message':
      return undefined as T;

    case 'chat_get_conversation_stats':
      return {
        message_count: 0,
        total_tokens: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost: 0,
      } as T;

    case 'search_chat_history':
    case 'search_chat_history_semantic':
      return [] as T;

    case 'search_past_conversations':
    case 'get_recent_conversations':
      return [] as T;

    case 'conversation_export':
      return '# Mock Conversation\n\nNo messages.' as T;

    case 'chat_get_cost_overview':
      return {
        today_total: 0,
        month_total: 0,
        monthly_budget: null,
        remaining_budget: null,
      } as T;

    case 'chat_get_cost_analytics':
      return {
        timeseries: [],
        providers: [],
        top_conversations: [],
      } as T;

    case 'chat_compact_context':
      return {
        messages_compacted: 0,
        tokens_before: 0,
        tokens_after: 0,
        savings_percent: 0,
        summary_created: false,
        focus: null,
        message: 'No compaction needed.',
      } as T;

    case 'media_generate_image':
      return {
        images: [{ url: 'https://placehold.co/512x512?text=Mock+Image' }],
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 100,
      } as T;

    // PTT (Push-to-Talk) commands and TTS speak — all return undefined
    case 'voice_start_global_ptt':
    case 'voice_stop_global_ptt':
    case 'voice_inject_text':
    case 'voice_tts_speak':
      return undefined as T;

    // LLM provider/model commands
    case 'llm_check_provider_status':
      return {
        provider: (args?.['provider'] as string | undefined) ?? 'anthropic',
        available: false,
        configured: false,
      } as T;

    case 'llm_get_usage_stats':
      return {
        totalTokens: 0,
        totalCost: 0,
        messageCount: 0,
        byProvider: {},
        byModel: {},
      } as T;

    case 'llm_get_available_models':
      return [] as T;

    case 'llm_set_default_provider':
    case 'llm_configure_provider':
      return undefined as T;

    // File picker commands
    case 'glob_search':
    case 'dir_list':
      return [] as T;

    // Workspace indexing & code analysis
    case 'workspace_index':
      return {
        rootPath: (args?.['workspacePath'] as string | undefined) ?? '.',
        files: [],
        symbols: [],
        dependencies: { nodes: [], edges: [] },
        lastUpdated: Date.now(),
      } as T;
    case 'workspace_search_symbols':
      return [] as T;
    case 'workspace_find_definition':
      return null as T;
    case 'workspace_find_references':
    case 'workspace_get_file_symbols':
      return [] as T;
    case 'workspace_get_dependencies':
      return { nodes: [], edges: [] } as T;
    case 'workspace_get_stats':
      return {
        totalFiles: 0,
        totalSymbols: 0,
        totalLines: 0,
        languages: {},
        symbolKinds: {},
      } as T;

    // Debugging / error analysis
    case 'debug_parse_error':
      return {
        errorType: 'Unknown',
        message: (args?.['errorText'] as string | undefined) ?? '',
        filePath: null,
        line: null,
        column: null,
        stackTrace: [],
        severity: 'Medium',
      } as T;
    case 'debug_suggest_fixes':
      return [] as T;
    case 'debug_analyze_stack_trace':
      return {
        rootCauseFrame: 0,
        explanation: '(mock analysis)',
        errorPath: '',
        recommendations: [],
      } as T;

    // Formatter detection
    case 'format_detect':
      return {
        language: '',
        formatter: 'none',
        command: [],
        available: false,
      } as T;

    // Test runner detection
    case 'test_detect_runner':
      return 'auto' as T;

    // LSP server listing
    case 'lsp_list_servers':
      return [] as T;

    // Extension status
    case 'extension_status':
      return { status: 'inactive' } as T;

    // ── Vision commands ─────────────────────────────────────────────
    case 'vision_send_message':
    case 'vision_analyze_screenshot':
    case 'vision_extract_text':
    case 'vision_describe_ui_elements':
    case 'vision_answer_question':
      return {
        content: '(mock vision response)',
        model: 'mock-vision',
        tokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
        processingTimeMs: 100,
      } as T;

    case 'vision_compare_images':
      return {
        similarityScore: 0,
        differencesDescription: '(mock comparison)',
        visualDiffHighlighted: null,
        model: 'mock-vision',
        cost: 0,
      } as T;

    case 'vision_locate_element':
      return {
        description: '',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        confidence: 0,
      } as T;

    // ── Swarm commands ──────────────────────────────────────────────
    case 'swarm_init':
    case 'swarm_stop':
      return undefined as T;

    case 'swarm_execute_goal':
      return {
        success: true,
        output: '(mock swarm result)',
        agentsUsed: 0,
        totalDurationMs: 0,
        subtaskResults: [],
      } as T;

    case 'swarm_get_stats':
      return {
        totalAgents: 0,
        activeAgents: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageTaskDurationMs: 0,
      } as T;

    // ── Workflow orchestration commands ──────────────────────────────
    case 'create_workflow':
      return `wf_mock_${Date.now()}` as T;

    case 'update_workflow':
    case 'delete_workflow':
    case 'pause_workflow':
    case 'resume_workflow':
    case 'cancel_workflow':
    case 'schedule_workflow':
      return undefined as T;

    case 'get_workflow':
      return {
        id: (args?.['id'] as string | undefined) ?? 'mock-wf',
        name: 'Mock Workflow',
        description: '',
        userId: '',
        steps: [],
      } as T;

    case 'get_workflow_status':
      return {
        id: (args?.['executionId'] as string | undefined) ?? 'mock-exec',
        workflow_id: '',
        status: 'completed',
        inputs: {},
        outputs: {},
      } as T;

    case 'get_execution_logs':
      return [] as T;

    case 'trigger_workflow_on_event':
      return `exec_mock_${Date.now()}` as T;

    case 'get_next_execution_time':
      return (Date.now() + 3600000) as T;

    // ── Background agent commands ───────────────────────────────────
    case 'background_agent_push':
      return {
        agentId: `bg_mock_${Date.now()}`,
        queuePosition: null,
        started: true,
      } as T;

    case 'background_agent_list':
      return { agents: [], activeCount: 0, maxAgents: 10 } as T;

    case 'background_agent_list_active':
      return [] as T;

    case 'background_agent_get':
      return null as T;

    case 'background_agent_pause':
    case 'background_agent_resume':
    case 'background_agent_cancel':
      return undefined as T;

    case 'background_agent_take_over':
      throw new Error('Background agent take-over requires the desktop application');

    case 'background_agent_stats':
      return {
        totalAgents: 0,
        runningCount: 0,
        queuedCount: 0,
        pausedCount: 0,
        completedCount: 0,
        failedCount: 0,
        maxAgents: 10,
        atCapacity: false,
      } as T;

    case 'background_agent_cleanup':
      return 0 as T;

    case 'background_agent_should_push':
      return [false, (args?.['goal'] as string | undefined) ?? ''] as T;

    // ── Skill commands (newly wired) ────────────────────────────────
    case 'skill_get':
      return null as T;

    case 'skill_get_instructions':
    case 'skill_get_context':
      return '' as T;

    case 'skill_check_requirements':
      return {
        satisfied: true,
        missingBins: [],
        missingEnv: [],
        osSupported: true,
      } as T;

    case 'skill_invoke':
      return {
        skillName: (args?.['name'] as string | undefined) ?? '',
        instructions: '(mock instructions)',
        allowedTools: [],
        contextMode: 'main',
      } as T;

    case 'skill_match_for_message':
      return [] as T;

    case 'skill_parse_slash_command':
      return null as T;

    case 'skill_get_slash_commands':
      return [] as T;

    case 'skill_count':
      return 0 as T;

    case 'skill_set_workspace':
      return undefined as T;

    // ── Voice commands (newly wired) ────────────────────────────────
    case 'voice_configure':
    case 'voice_wake_enable':
    case 'voice_wake_disable':
    case 'voice_wake_configure':
    case 'voice_ptt_configure':
    case 'voice_ptt_key_down':
    case 'voice_ptt_key_up':
    case 'voice_deepgram_configure':
    case 'voice_start_deepgram_stream':
    case 'voice_stop_deepgram_stream':
    case 'voice_deepgram_send_audio':
    case 'voice_set_whisper_model':
    case 'voice_delete_whisper_model':
    case 'voice_set_piper_voice':
    case 'voice_delete_piper_voice':
    case 'voice_tts_configure':
    case 'voice_enable_barge_in':
    case 'voice_set_barge_in_sensitivity':
    case 'voice_configure_barge_in':
    case 'voice_start_barge_in_monitoring':
    case 'voice_stop_barge_in_monitoring':
    case 'voice_download_piper_binary':
    case 'voice_download_whisper_model':
    case 'voice_download_piper_voice':
      return undefined as T;

    case 'voice_get_settings':
      return {
        provider: 'local_whisper',
        language: 'en',
        hotkey: 'option',
      } as T;

    case 'voice_check_local_whisper':
    case 'voice_check_piper_binary':
    case 'voice_wake_status':
      return false as T;

    case 'voice_get_capabilities':
      return {
        localWhisper: false,
        deepgram: false,
        tts: false,
        wakeWord: false,
        ptt: false,
      } as T;

    case 'voice_tts_list_voices':
    case 'voice_list_whisper_models':
    case 'voice_list_piper_voices':
    case 'voice_list_local_models':
      return [] as T;

    case 'voice_ptt_state':
      return 'idle' as T;

    case 'voice_deepgram_status':
      return { connected: false, streaming: false } as T;

    case 'voice_tts_speak_local':
    case 'voice_tts_speak_with_barge_in':
    case 'voice_tts_stop':
      return undefined as T;

    case 'voice_tts_is_playing':
      return false as T;

    case 'voice_get_barge_in_status':
      return { enabled: false, monitoring: false, sensitivity: 0.5 } as T;

    case 'voice_convert_audio_to_pcm':
      return [] as T;

    case 'voice_transcribe_file':
    case 'voice_transcribe_local':
      return { text: '(mock transcript)', confidence: 0.95 } as T;

    // ── Agent/AGI commands ──────────────────────────────────────────
    case 'agent_init':
    case 'agi_init':
    case 'agi_stop':
      return undefined as T;

    case 'agent_submit_task':
    case 'start_agent_task':
      return `task_mock_${Date.now()}` as T;

    case 'agent_get_task_status':
      return { status: 'pending' } as T;

    case 'agent_list_tasks':
    case 'agent_list_trusted_workflows':
    case 'list_active_agents':
      return [] as T;

    case 'agi_should_use_swarm':
      return false as T;

    case 'agi_submit_goal_auto':
    case 'agi_submit_goal_swarm':
      return { goalId: `goal_mock_${Date.now()}` } as T;

    // ── Orchestration commands ──────────────────────────────────────
    case 'orchestrator_spawn_parallel':
      return [] as T;

    case 'orchestrator_cancel_all':
    case 'orchestrator_cleanup':
    case 'orchestrator_wait_all':
    case 'pause_agent':
    case 'resume_agent':
      return undefined as T;

    case 'orchestrator_get_agent_status':
      return null as T;

    // ── Notification commands ───────────────────────────────────────
    case 'notification_check_permission':
    case 'notification_request_permission':
      return true as T;

    case 'notification_show':
    case 'notification_show_with_actions':
    case 'notification_schedule':
    case 'notification_schedule_reminder':
    case 'notification_register_actions':
    case 'notification_update':
    case 'notification_cancel':
    case 'notification_set_settings':
      return undefined as T;

    case 'notification_cancel_all':
    case 'notification_delete_all_read':
    case 'notification_mark_all_read':
      return 0 as T;

    case 'notification_get_scheduled':
      return [] as T;

    case 'notification_unread_count':
      return 0 as T;

    case 'notification_get':
      return null as T;

    case 'notification_list':
      return {
        notifications: [],
        total: 0,
        unreadCount: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      } as T;

    case 'notification_mark_read':
    case 'notification_delete':
      return true as T;

    case 'notification_get_settings':
      return {
        enabled: true,
        soundEnabled: true,
        badgeEnabled: true,
        desktopNotifications: true,
        enabledTypes: [],
        doNotDisturb: false,
        dndStartTime: null,
        dndEndTime: null,
      } as T;

    case 'notification_create':
      return {
        id: `notif_mock_${Date.now()}`,
        title: (args?.['input'] as Record<string, unknown>)?.['title'] ?? 'Mock',
        message: (args?.['input'] as Record<string, unknown>)?.['message'] ?? '',
        type: 'info',
        priority: 'normal',
        read: false,
        createdAt: new Date().toISOString(),
        readAt: null,
        actionUrl: null,
        actionLabel: null,
        icon: null,
        metadata: null,
        dismissible: true,
        expiresAt: null,
      } as T;

    // ── Tutorial commands ───────────────────────────────────────────
    case 'get_tutorials':
    case 'get_user_tutorial_progress':
      return [] as T;

    case 'get_tutorial':
    case 'get_tutorial_progress':
    case 'get_recommended_tutorial':
      return null as T;

    case 'get_tutorial_stats':
      return { total: 0, completed: 0, inProgress: 0 } as T;

    case 'start_tutorial':
    case 'complete_tutorial':
    case 'complete_tutorial_step':
    case 'skip_tutorial_step':
    case 'reset_tutorial':
    case 'submit_tutorial_feedback':
    case 'record_step_view':
    case 'record_demo_results':
    case 'select_demo':
      return undefined as T;

    case 'run_instant_demo':
      return { success: true } as T;

    // ── Settings V2 commands ────────────────────────────────────────
    case 'settings_v2_get_batch':
    case 'settings_v2_get_category':
    case 'settings_v2_list_all':
    case 'settings_v2_load_app_settings':
      return {} as T;

    case 'settings_v2_delete':
    case 'settings_v2_save_app_settings':
      return undefined as T;

    // ── Misc newly registered commands ──────────────────────────────
    case 'ai_analyze_project':
    case 'ai_generate_code':
    case 'ai_generate_tests':
    case 'ai_refactor_code':
    case 'ai_get_project_context':
    case 'ai_generate_context_prompt':
    case 'ai_access_file':
    case 'ai_add_constraint':
      return { result: '(mock)' } as T;

    case 'get_inline_completion':
      return null as T;

    case 'code_generate_edit':
      return { edit: '(mock edit)' } as T;

    case 'sync_conversations_to_cloud':
    case 'clear_sample_data':
    case 'populate_sample_data':
      return undefined as T;

    case 'has_sample_data':
      return false as T;

    case 'check_connectivity':
      return { connected: false } as T;

    case 'continuous_job_runner_start':
    case 'continuous_job_runner_stop':
      return undefined as T;

    case 'continuous_job_runner_status':
      return { running: false } as T;

    case 'window_is_fullscreen':
    case 'window_is_maximized':
    case 'window_is_floating_visible':
      return false as T;

    case 'window_get_state':
      return {
        pinned: false,
        alwaysOnTop: false,
        dock: null,
        maximized: false,
        fullscreen: false,
      } as T;

    case 'window_maximize':
    case 'window_unmaximize':
    case 'window_toggle_maximize':
    case 'window_set_fullscreen':
    case 'window_set_pinned':
    case 'window_set_always_on_top':
    case 'window_set_visibility':
    case 'window_dock':
    case 'window_open_floating':
    case 'window_close_floating':
      return undefined as T;

    case 'window_toggle_floating':
      return false as T;

    case 'form_undo_record':
    case 'form_undo_clear':
    case 'form_undo_clear_old':
      return undefined as T;

    case 'form_undo_attempt':
    case 'form_undo_get':
      return null as T;

    case 'form_undo_can_undo':
      return false as T;

    case 'form_undo_list':
    case 'form_undo_list_undoable':
      return [] as T;

    case 'form_undo_stats':
      return { total: 0, undoable: 0 } as T;

    case 'error_get_logs':
    case 'error_export_logs':
      return [] as T;

    case 'error_clear_logs':
      return undefined as T;

    case 'error_get_stats':
      return { total: 0, byLevel: {} } as T;

    case 'shortcuts_list':
    case 'shortcuts_get_defaults':
    case 'shortcuts_reset':
      return [] as T;

    case 'shortcuts_register':
    case 'shortcuts_unregister':
    case 'shortcuts_register_global':
    case 'shortcuts_unregister_global':
    case 'shortcuts_trigger':
      return undefined as T;

    case 'shortcuts_update':
    case 'shortcuts_apply_quick_query_preferences':
      return {
        id: 'mock_shortcut',
        key: 'CommandOrControl+K',
        description: 'Mock shortcut',
        action: 'mock_action',
        enabled: true,
        isGlobal: false,
      } as T;

    case 'shortcuts_check_key':
      return false as T;

    case 'intent_detect':
    case 'intent_detect_with_llm':
      return { intent: 'general', confidence: 0.5 } as T;

    case 'intent_detect_batch':
    case 'intent_extract_entities':
    case 'intent_get_categories':
    case 'intent_get_complexity_levels':
      return [] as T;

    case 'intent_check_quick_win':
      return false as T;

    case 'intent_configure':
    case 'intent_create_routing_plan':
      return undefined as T;

    // ── Background tasks commands ───────────────────────────────────
    case 'bg_submit_task':
      return `bgtask_mock_${Date.now()}` as T;

    case 'bg_list_tasks':
    case 'list_background_tasks':
      return [] as T;

    case 'bg_get_task_status':
    case 'bg_get_task_stats':
      return null as T;

    case 'bg_cancel_task':
    case 'bg_pause_task':
    case 'bg_resume_task':
    case 'cancel_background_task':
    case 'pause_background_task':
    case 'resume_background_task':
      return undefined as T;

    // ── Onboarding commands ─────────────────────────────────────────
    case 'complete_first_run':
    case 'complete_onboarding_step':
    case 'skip_first_run':
    case 'skip_onboarding_step':
    case 'mark_setup_completed':
    case 'reset_onboarding':
    case 'start_first_run_experience':
    case 'update_first_run_step':
      return undefined as T;

    case 'has_completed_first_run':
      return false as T;

    case 'get_first_run_session':
    case 'get_first_run_statistics':
      return null as T;

    // ── Subscription commands ───────────────────────────────────────
    case 'get_pricing_plans':
      return [] as T;

    case 'get_user_credits':
      return { credits: 0, usedCredits: 0 } as T;

    case 'get_user_rewards':
      return [] as T;

    case 'has_reward':
    case 'has_unlocked_feature':
      return false as T;

    case 'subscribe_to_plan':
    case 'upgrade_plan':
      return undefined as T;

    // ── Marketplace (new) ───────────────────────────────────────────
    case 'fork_marketplace_workflow':
    case 'publish_workflow_to_marketplace':
    case 'track_workflow_view':
    case 'get_workflow_by_share_url':
      return undefined as T;

    case 'get_creator_workflows':
    case 'get_workflows_by_category':
    case 'get_workflow_templates_by_category':
    case 'search_workflow_templates':
    case 'get_workflow_templates':
    case 'get_user_clones':
    case 'get_user_favorites':
      return [] as T;

    // ── Misc/catch-all for remaining newly registered commands ──────
    case 'analytics_generate_weekly_report':
    case 'analytics_generate_monthly_report':
    case 'analytics_get_top_processes':
    case 'analytics_save_snapshot':
    case 'artifact_clear_all':
    case 'artifact_export_all':
    case 'artifact_import_all':
    case 'auth_store_session':
    case 'auth_retrieve_session':
    case 'auth_remove_session':
    case 'automation_drag_drop':
    case 'automation_get_text':
    case 'browser_enable_request_interception':
    case 'calendar_disconnect':
    case 'cloud_disconnect':
    case 'chat_delete_conversation':
    case 'chat_clear_pending_messages':
    case 'chat_get_pending_messages':
    case 'codebase_cache_clear_all':
    case 'codebase_cache_clear_expired':
    case 'codebase_cache_clear_file':
    case 'codebase_cache_clear_project':
    case 'codebase_cache_calculate_hash':
    case 'codebase_cache_get_stats':
    case 'codebase_cache_get_file_tree':
    case 'codebase_cache_get_symbols':
    case 'codebase_cache_get_dependencies':
    case 'codebase_cache_set_file_tree':
    case 'codebase_cache_set_symbols':
    case 'codebase_cache_set_dependencies':
    case 'computer_use_execute_tool':
    case 'computer_use_execute_opa_task':
    case 'computer_use_type_text':
    case 'computer_use_zoom_at_point':
    case 'computer_use_suggest_zoom_level':
    case 'computer_use_get_session':
    case 'computer_use_list_sessions':
    case 'contact_get':
    case 'contact_search':
    case 'contact_export_vcard':
    case 'contact_import_vcard':
    case 'db_get_pool_stats':
    case 'db_has_stored_password':
    case 'db_mysql_bulk_insert':
    case 'db_mysql_call_procedure':
    case 'db_mysql_describe_table':
    case 'db_mysql_list_indexes':
    case 'db_mysql_list_tables':
    case 'db_mysql_test_connection':
    case 'db_validate_query':
    case 'design_apply_css':
    case 'design_check_accessibility':
    case 'design_generate_color_scheme':
    case 'design_generate_css':
    case 'design_get_element_styles':
    case 'design_suggest_improvements':
    case 'design_tokens_to_css':
    case 'email_check_keyring_status':
    case 'email_migrate_credentials':
    case 'approve_operation':
    case 'reject_operation':
    case 'coord_get_pending_approvals':
    case 'coord_request_approval':
    case 'coord_update_app_state':
    case 'get_approval_request':
    case 'clear_model_capability_cache':
    case 'detect_use_case':
    case 'enhance_and_route_prompt':
    case 'get_available_providers':
    case 'get_available_use_cases':
    case 'get_suggested_provider':
    case 'llm_list_ollama_models':
    case 'route_to_best_api':
    case 'memory_archive_compacted_logs':
    case 'memory_compact_old_logs':
    case 'memory_decay_single':
    case 'memory_get_compaction_candidates':
    case 'memory_get_compaction_stats':
    case 'memory_get_decay_candidates':
    case 'memory_get_extraction_prompt':
    case 'memory_get_logs_in_range':
    case 'memory_import_json_string':
    case 'memory_promote_extracted':
    case 'memory_recall_with_boost':
    case 'compare_to_industry_benchmark':
    case 'compare_to_manual':
    case 'compare_to_previous_period':
    case 'get_metrics_history':
    case 'metrics_increment_automations':
    case 'metrics_increment_goals':
    case 'metrics_set_cache_hit_rate':
    case 'metrics_set_mcp_servers':
    case 'record_automation_metrics':
    case 'ocr_detect_languages':
    case 'ocr_preprocess_image':
    case 'ocr_process_multi_language':
    case 'ocr_process_with_boxes':
    case 'get_best_practices':
    case 'get_process_success_rates':
    case 'get_process_templates':
    case 'get_current_plan':
    case 'get_outcome_tracking':
    case 'get_session_info':
    case 'reset_session_cost':
    case 'update_session_activity':
    case 'project_context_get_folder':
    case 'project_context_get_summary':
    case 'project_context_list_files':
    case 'project_context_validate_path':
    case 'project_has_instructions':
    case 'project_load_instructions':
    case 'auto_save_decision':
    case 'clear_project_memories':
    case 'delete_project_memory':
    case 'get_architectural_decisions':
    case 'get_coding_styles':
    case 'get_project_context':
    case 'get_project_memory_stats':
    case 'save_architectural_decision':
    case 'save_coding_style':
    case 'update_memory_importance':
    case 'get_prompt_enhancement_config':
    case 'set_prompt_enhancement_config':
    case 'research_get_modes':
    case 'research_quick':
    case 'task_create':
    case 'task_pause':
    case 'task_resume':
    case 'task_save_context':
    case 'task_update_progress':
    case 'resolve_task_approval':
    case 'get_allowed_directories':
    case 'file_get_metadata':
    case 'fs_get_workspace_files':
    case 'fs_read_file_content':
    case 'composer_start_session':
    case 'composer_apply_session':
    case 'composer_get_session':
    case 'delete_autonomous_task_checkpoint':
    case 'delete_autonomous_task_checkpoints':
    case 'resume_autonomous_task':
      return undefined as T;

    case 'task_get_resumable':
    case 'task_get_status':
      return null as T;

    case 'task_list_by_status':
    case 'list_autonomous_task_checkpoints':
    case 'list_autonomous_task_checkpoints_by_task':
      return [] as T;

    default:
      // AUDIT-MOCK-088 fix: Throw error for unregistered commands to surface wiring issues
      console.error(`[Tauri] Unregistered command in test mode: ${command}`);
      throw new Error(
        `Command not registered in tauri-mock: ${command}. This indicates a frontend-backend wiring issue.`,
      );
  }
}

export function convertFileSrc(filePath: string, protocol = 'asset'): string {
  if (isTauri) {
    const encode = encodeURIComponent;
    return `${protocol}://localhost/${encode(filePath)}`;
  }

  return filePath;
}

export function isTauriContext(): boolean {
  return isTauri;
}

export function getMockStatus(): { isTauri: boolean; mode: string } {
  return {
    isTauri,
    mode: isTauri ? 'tauri' : 'web-mock',
  };
}

export type EventCallback<T> = (event: { payload: T; id: number }) => void;

export type UnlistenFn = () => void;

export async function listen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  if (isTauri) {
    // Dynamically import Tauri API to avoid issues in non-Tauri environments
    const { listen: tauriListen } = await import('@tauri-apps/api/event');
    return tauriListen<T>(event, handler);
  }

  // Mock implementation for web
  console.debug(`[Tauri Mock] Registered listener for event: ${event}`);

  // Return a mock unlisten function
  return () => {
    console.debug(`[Tauri Mock] Unregistered listener for event: ${event}`);
  };
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  if (isTauri) {
    const { emit: tauriEmit } = await import('@tauri-apps/api/event');
    return tauriEmit(event, payload);
  }

  console.debug(`[Tauri Mock] Emitted event: ${event}`, payload);
}

export async function once<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  if (isTauri) {
    const { once: tauriOnce } = await import('@tauri-apps/api/event');
    return tauriOnce<T>(event, handler);
  }

  console.debug(`[Tauri Mock] Registered one-time listener for event: ${event}`);
  return () => {
    console.debug(`[Tauri Mock] Unregistered one-time listener for event: ${event}`);
  };
}

// Shell plugin - open URL in default browser
export async function openUrl(url: string): Promise<void> {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-shell');
    return open(url);
  }

  // Fallback for web: open in new tab
  window.open(url, '_blank', 'noopener,noreferrer');
}

// Update check result interface
interface UpdateCheckResult {
  available: boolean;
  currentVersion?: string;
  version?: string;
  body?: string;
  downloadAndInstall?: () => Promise<void>;
}

// Updater plugin - check for updates
export async function checkForUpdates(): Promise<UpdateCheckResult | null> {
  if (isTauri) {
    const { check } = await import('@tauri-apps/plugin-updater');
    return check();
  }

  // Web mode: no updates available
  console.debug('[Tauri Mock] Update check not available in web mode');
  return null;
}

// Process plugin - relaunch app
export async function relaunchApp(): Promise<void> {
  if (isTauri) {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    return relaunch();
  }

  // Fallback for web: reload page
  window.location.reload();
}
