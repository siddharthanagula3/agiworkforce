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
    case 'sync_capabilities':
      return undefined as T;

    case 'get_auto_approve_all':
      return false as T;

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

    case 'chat_get_conversation_stats':
      return {
        message_count: 0,
        total_tokens: 0,
        total_cost: 0,
      } as T;

    case 'chat_create_conversation':
      return {
        id: 0,
        title:
          (args?.['request'] as { title?: string } | undefined)?.title ??
          args?.['title'] ??
          'New Conversation',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as T;

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
    case 'mcp_oauth_start':
    case 'mcp_oauth_disconnect':
      return undefined as T;
    case 'mcp_connect_connector':
      return null as T;
    case 'save_api_key':
      return undefined as T;

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

    case 'media_generate_image':
      return {
        images: [{ url: 'https://placehold.co/512x512?text=Mock+Image' }],
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 100,
      } as T;

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
