import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import {
  createCloudConversation,
  deleteCloudConversation,
  getCloudConversation,
  getCloudModels,
  listCloudConversations,
} from '../api/cloudApi';
import { getTaskModelForProvider } from '../constants/llm';
import { assertRegisteredCommand } from '../utils/ipc';
import {
  isCloudWeb,
  isDesktopUiDevLocal,
  isElectronHost,
  isTauri,
  isTestEnvironment,
} from './runtimeEnvironment';
import { getElectronHostBridge, isElectronBridgeCommand } from './tauri-electron/bridgeContract';

export {
  isCloudWeb,
  isDesktopUiDevLocal,
  isElectronHost,
  isTauri,
  supportsLocalAppMode,
} from './runtimeEnvironment';

const CLOUD_WEB_FALLTHROUGH = Symbol('CLOUD_WEB_FALLTHROUGH');
const CLOUD_CHAT_DEFAULT_MODEL = getTaskModelForProvider('anthropic', 'chat') ?? '';
const NATIVE_AGENT_EXECUTION_COMMANDS = new Set([
  'agi_submit_goal',
  'agi_submit_goal_parallel',
  'agi_submit_goal_auto',
  'agi_submit_goal_swarm',
]);
const MOCK_INSTALLED_MCP_BUNDLES = new Set<string>();

function mockMcpBundles() {
  return [
    {
      id: 'mcp-mock-search',
      name: 'Mock Search',
      version: '1.0.0',
      description: 'Search a deterministic local fixture in Desktop UI development mode.',
      author: 'AGI Workforce',
      category: 'search',
      npmPackage: '@agiworkforce/mock-mcp-search',
      tools: [
        {
          name: 'mock_search',
          description: 'Returns deterministic local search fixtures.',
          parameters: [],
        },
      ],
      configTemplate: {
        command: 'npx',
        args: ['-y', '@agiworkforce/mock-mcp-search'],
        env: {},
        enabled: false,
      },
      requiredCredentials: [],
      verified: true,
      featured: true,
      tags: ['search', 'fixture'],
      installed: MOCK_INSTALLED_MCP_BUNDLES.has('mcp-mock-search'),
      installedVersion: MOCK_INSTALLED_MCP_BUNDLES.has('mcp-mock-search') ? '1.0.0' : undefined,
      updateAvailable: false,
    },
    {
      id: 'mcp-registry-cloud-example-remote',
      name: 'Cloud Example',
      version: '2.0.0',
      description:
        'Remote-only fixture shaped like an official MCP Registry entry for browser verification.',
      author: 'cloud.example',
      category: 'other',
      tools: [],
      configTemplate: {
        command: 'streamable-http',
        args: ['https://cloud.example/mcp'],
        env: {},
        enabled: false,
      },
      requiredCredentials: [],
      verified: false,
      featured: false,
      tags: ['official-registry', 'community', 'remote'],
      installed: false,
      updateAvailable: false,
    },
  ];
}

export function shouldRejectNativeExecutionFallback(
  command: string,
  runtime: { test: boolean; cloudWeb: boolean; desktopUiDev: boolean },
): boolean {
  return (
    !runtime.test &&
    (runtime.cloudWeb || runtime.desktopUiDev) &&
    NATIVE_AGENT_EXECUTION_COMMANDS.has(command)
  );
}

function mockDocumentCreationResult(args: Record<string, unknown> | undefined, format: string) {
  const path = String(args?.['outputPath'] ?? '/tmp/mock-document');
  const fileName = path.split(/[\\/]/).pop() || 'mock-document';
  const now = new Date(0).toISOString();
  const checksumSha256 = '0'.repeat(64);
  const computeSessionId = 'local-compute-session-mock';
  const generatedFileId = 'generated-file-mock';

  return {
    path,
    file_path: path,
    filePath: path,
    format,
    status: 'created',
    success: true,
    computeSession: {
      id: computeSessionId,
      ownerUserId: 'local-device',
      sourceSurface: 'desktop',
      privacyMode: 'local',
      providerMode: 'Local',
      status: 'completed',
      workdirUri: 'file:///tmp',
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    },
    generatedFile: {
      id: generatedFileId,
      computeSessionId,
      ownerUserId: 'local-device',
      sourceSurface: 'desktop',
      privacyMode: 'local',
      providerMode: 'Local',
      kind: format,
      fileName,
      mimeType: 'application/octet-stream',
      uri: `file://${path}`,
      byteCount: 0,
      checksumSha256,
      previewDerivatives: [],
      createdAt: now,
    },
    artifactManifest: {
      id: 'artifact-manifest-mock',
      artifactId: 'artifact-mock',
      type: 'generated_file_bundle',
      title: fileName,
      computeSessionId,
      generatedFileIds: [generatedFileId],
      privacyMode: 'local',
      providerMode: 'Local',
      storageScope: 'local_device',
      checksumSha256,
      createdAt: now,
      updatedAt: now,
    },
  };
}

async function handleCloudWebCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T | typeof CLOUD_WEB_FALLTHROUGH> {
  switch (command) {
    case 'chat_get_conversations': {
      return (await listCloudConversations()) as T;
    }

    case 'chat_create_conversation': {
      const req = args?.['request'] as Record<string, unknown> | undefined;
      return (await createCloudConversation(
        (req?.['title'] as string) ?? 'New Conversation',
        (req?.['model'] as string) ?? '',
      )) as T;
    }

    case 'chat_get_messages': {
      const id = (args?.['conversationId'] ?? args?.['id']) as string;
      if (!id) return [] as T;
      const result = await getCloudConversation(id);
      return (result.messages ?? []) as T;
    }

    case 'chat_delete_conversation': {
      const id = (args?.['conversationId'] ?? args?.['id']) as string;
      if (id) await deleteCloudConversation(id);
      return undefined as T;
    }

    case 'chat_send_message': {
      const { startCloudChatStream } = await import('./cloudChatStream');
      const req = args?.['request'] as Record<string, unknown> | undefined;
      const content = typeof req?.['content'] === 'string' ? req['content'] : '';
      const frontendMessageId =
        typeof req?.['frontendMessageId'] === 'string' ? req['frontendMessageId'] : undefined;
      const conversationId =
        typeof req?.['conversationId'] === 'string'
          ? req['conversationId']
          : typeof args?.['conversationId'] === 'string'
            ? (args['conversationId'] as string)
            : undefined;
      const model =
        typeof req?.['modelOverride'] === 'string' && req['modelOverride'].length > 0
          ? req['modelOverride']
          : CLOUD_CHAT_DEFAULT_MODEL;

      void startCloudChatStream({
        conversationId,
        content,
        model,
        messageId: frontendMessageId,
      });

      return {
        status: 'streaming_via_cloud',
        message: frontendMessageId ? { id: frontendMessageId } : undefined,
      } as T;
    }

    case 'llm_get_available_models': {
      try {
        const models = await getCloudModels();
        return models as T;
      } catch {
        return [] as T;
      }
    }

    case 'llm_get_usage_stats': {
      return {
        totalTokens: 0,
        totalCost: 0,
        messageCount: 0,
        byProvider: {},
        byModel: {},
      } as T;
    }

    default:
      return CLOUD_WEB_FALLTHROUGH as typeof CLOUD_WEB_FALLTHROUGH;
  }
}

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    assertRegisteredCommand(command);

    if (import.meta.env.VITE_WDIO_E2E === '1' && typeof window !== 'undefined') {
      const mocks = (window as unknown as { __wdio_mocks__?: Record<string, unknown> })
        .__wdio_mocks__;
      const mock = mocks?.[command];
      if (typeof mock === 'function') {
        return (await (mock as (mockArgs?: Record<string, unknown>) => unknown)(args)) as T;
      }
    }
    return tauriInvoke<T>(command, args);
  }

  if (isElectronHost && isElectronBridgeCommand(command)) {
    const electronHost = getElectronHostBridge();
    if (!electronHost?.handles(command)) {
      throw new Error(`The Electron Cloud account bridge is unavailable for ${command}.`);
    }
    return tauriInvoke<T>(command, args);
  }

  if (isCloudWeb) {
    const cloudResult = await handleCloudWebCommand<T>(command, args);
    if (cloudResult !== CLOUD_WEB_FALLTHROUGH) {
      return cloudResult;
    }
    // Fall through to test-mode mock values for desktop-only commands
  }

  if (
    shouldRejectNativeExecutionFallback(command, {
      test: isTestEnvironment,
      cloudWeb: isCloudWeb,
      desktopUiDev: isDesktopUiDevLocal,
    })
  ) {
    throw new Error('Agent execution requires the AGI Workforce desktop application');
  }

  if (!isTestEnvironment && !isCloudWeb && !isDesktopUiDevLocal) {
    const errorMessage = `This feature requires the AGI Workforce desktop application. Please download it from https://agiworkforce.com/download`;
    console.error(`[Tauri] ${errorMessage}`, { command, args });
    throw new Error(errorMessage);
  }

  switch (command) {
    case 'get_onboarding_status':
      return { completed: false } as T;

    case 'check_automation_permissions':
      return {
        accessibility: false,
        screen_recording: false,
        input_monitoring: false,
        automation_service_ready: false,
      } as T;

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
    case 'app_permissions_list':
    case 'app_permissions_always_blocked': // Stream 1: array of bundle id strings
      return [] as T;

    case 'project_create':
      return args?.['project'] as T;

    case 'project_get':
    case 'app_permissions_active_window': // Stream 1: Option<ActiveWindow>
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
    case 'document_create_pdf_simple_manifest':
      return mockDocumentCreationResult(args, 'pdf') as T;
    case 'document_create_word_simple_manifest':
      return mockDocumentCreationResult(args, 'docx') as T;
    case 'document_create_excel_simple_manifest':
    case 'document_create_excel_numbers_manifest':
      return mockDocumentCreationResult(args, 'xlsx') as T;
    case 'document_create_powerpoint_simple_manifest':
      return mockDocumentCreationResult(args, 'pptx') as T;

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

    case 'llm_send_message': {
      const msgs =
        (args?.['messages'] as Array<{ role: string; content: string }> | undefined) ?? [];
      const lastUserMsg = [...msgs].reverse().find((m) => m.role === 'user')?.content ?? '';
      return { content: lastUserMsg, model: args?.['model'] ?? 'mock', cached: false } as T;
    }

    case 'speech_start_recording':
      return undefined as T;
    case 'speech_stop_and_transcribe':
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
          memory_search: { enabled: false, status: 'unavailable' },
        },
        default_mode: 'standard',
      } as T;

    case 'agi_submit_goal':
      return { goalId: `goal_mock_${Date.now()}` } as T;
    case 'agi_submit_goal_parallel':
      return {
        goalId: `goal_mock_${Date.now()}`,
        state: 'ready_for_review',
        output: 'Parallel agent work is ready for review.',
        error: null,
      } as T;
    case 'agi_list_goals':
      return [] as T;
    case 'agi_get_goal_status':
      return {
        state: 'queued',
        currentIteration: 0,
        context: { tool_results: [] },
      } as T;
    case 'agi_get_task_state':
      return null as T;
    case 'agi_cancel_goal':
    case 'agi_pause_goal':
    case 'agi_resume_goal':
      return undefined as T;
    case 'agi_get_reflection_insights':
      return null as T;

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

    case 'mcp_list_connected_providers':
      return [] as T;
    case 'mcp_get_supported_connector_ids':
      return [
        'github',
        'slack',
        'google_drive',
        'figma',
        'stripe',
        'vercel',
        'sentry',
        'linear',
        'notion',
        'cloudflare',
        'gmail',
        'google_calendar',
        'outlook',
        'jira',
      ] as T;
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

    case 'mcpb_fetch_registry':
      return mockMcpBundles() as T;
    case 'mcpb_search_bundles': {
      const query = String(args?.['query'] ?? '')
        .trim()
        .toLowerCase();
      return mockMcpBundles().filter(
        (bundle) =>
          !query ||
          bundle.name.toLowerCase().includes(query) ||
          bundle.description.toLowerCase().includes(query) ||
          bundle.tags.some((tag) => tag.includes(query)) ||
          bundle.author.toLowerCase().includes(query) ||
          ('npmPackage' in bundle && bundle.npmPackage?.toLowerCase().includes(query)),
      ) as T;
    }
    case 'mcpb_get_bundle_details': {
      const bundleId = String(args?.['bundleId'] ?? '');
      return (mockMcpBundles().find((bundle) => bundle.id === bundleId) ?? null) as T;
    }
    case 'mcpb_get_categories':
      return ['other', 'search'] as T;
    case 'mcpb_get_featured':
      return mockMcpBundles().filter((bundle) => bundle.featured) as T;
    case 'mcpb_get_installed_bundles':
      return mockMcpBundles().filter((bundle) => bundle.installed) as T;
    case 'mcpb_install_bundle':
    case 'mcpb_update_bundle': {
      const bundleId = String(args?.['bundleId'] ?? '');
      if (bundleId) MOCK_INSTALLED_MCP_BUNDLES.add(bundleId);
      return `Bundle '${bundleId}' installed in UI development mode` as T;
    }
    case 'mcpb_uninstall_bundle': {
      const bundleId = String(args?.['bundleId'] ?? '');
      MOCK_INSTALLED_MCP_BUNDLES.delete(bundleId);
      return `Bundle '${bundleId}' removed in UI development mode` as T;
    }
    case 'mcpb_check_updates':
      return [] as T;

    case 'mcp_initialize':
      return 'MCP initialized' as T;
    case 'mcp_list_servers':
      return [] as T;
    case 'mcp_connect_server':
      return 'connected' as T;
    case 'mcp_disconnect_server':
      return 'disconnected' as T;
    case 'mcp_enable_server':
      return 'enabled' as T;
    case 'mcp_disable_server':
      return 'disabled' as T;
    case 'mcp_list_tools':
      return [] as T;
    case 'mcp_search_tools':
      return [] as T;
    case 'mcp_call_tool':
      return { content: [{ type: 'text', text: 'mock tool result' }], isError: false } as T;
    case 'mcp_get_config':
      return { mcpServers: {} } as T;
    case 'mcp_get_config_location':
      return {
        path: '/mock/.mcp.json',
        source: 'global',
        projectFolder: null,
        exists: false,
      } as T;
    case 'mcp_update_config':
      return 'Config updated' as T;
    case 'mcp_get_stats':
      return {} as T;
    case 'mcp_get_tool_schemas':
      return [] as T;
    case 'mcp_store_credential':
      return 'Credential stored' as T;

    case 'mcp_oauth_status':
      return {
        connected: false,
        user_info: null,
        expires_at: null,
      } as T;
    case 'mcp_oauth_refresh':
      return {
        provider: (args?.['provider'] as string | undefined) ?? 'mock-provider',
        connected: false,
        expires_at: null,
      } as T;

    case 'get_model_capabilities':
      return {
        supports_tools: true,
        supports_vision: false,
        supports_streaming: true,
        supports_thinking: false,
        context_length: 4096,
        tool_mode: 'none',
      } as T;

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

    case 'extension_get_config':
      return {} as T;
    case 'extension_set_config':
      return 'Config saved' as T;
    case 'extension_list_by_status':
      return [] as T;
    case 'extension_start_all':
      return 'All extensions started' as T;
    case 'extension_stop_all':
      return 'All extensions stopped' as T;
    case 'extension_get_directory':
      return '/mock/extensions' as T;
    case 'extension_validate':
      return {
        name: 'mock-extension',
        version: '0.0.0',
        description: 'Mock extension package',
        author: null,
        entry_point: 'index.js',
        permissions: [],
      } as T;

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

    case 'analytics_track_event':
    case 'analytics_flush_events':
    case 'analytics_set_user_property':
    case 'analytics_set_privacy_mode':
    case 'analytics_delete_all_data':
      return undefined as T;

    case 'analytics_get_session_id':
      return 'mock-session-id' as T;

    case 'metrics_get_system':
      return {
        cpu_usage: 0,
        memory_used_mb: 0,
        memory_total_mb: 8192,
        disk_used_gb: 0,
        disk_total_gb: 256,
        network_rx_bytes: 0,
        network_tx_bytes: 0,
        uptime_seconds: 0,
      } as T;

    case 'metrics_get_app':
      return {
        automations_count: 0,
        goals_count: 0,
        mcp_servers_count: 0,
        cache_hit_rate: 0,
        avg_goal_duration_ms: 0,
        active_sessions: 0,
        total_api_calls: 0,
        failed_operations: 0,
      } as T;

    case 'analytics_get_usage_stats':
      return {
        dau: 0,
        mau: 0,
        total_users: 1,
        new_users_today: 0,
        new_users_this_week: 0,
        new_users_this_month: 0,
        avg_session_duration_ms: 0,
        total_events: 0,
        events_today: 0,
        retention_rate: 0,
      } as T;

    case 'analytics_get_feature_usage':
      return [] as T;

    case 'analytics_calculate_roi':
      return {
        time_saved_hours: 0,
        cost_savings_usd: 0,
        error_reduction_percent: 0,
        productivity_gain_percent: 0,
        total_automations: 0,
        successful_executions: 0,
        failed_executions: 0,
        avg_execution_time_ms: 0,
        total_llm_cost_usd: 0,
        llm_cost_saved_usd: 0,
        report_start_date: 0,
        report_end_date: 0,
      } as T;

    case 'analytics_get_process_metrics':
    case 'analytics_get_user_metrics':
    case 'analytics_get_tool_metrics':
      return [] as T;

    case 'analytics_get_metric_trends':
      return [] as T;

    case 'analytics_get_cost_saved_trend':
    case 'analytics_get_time_saved_trend':
      return [] as T;

    case 'background_task_list':
      return [] as T;

    case 'background_task_status':
      return null as T;

    case 'background_task_cancel':
      return undefined as T;

    case 'execute_workflow':
      return undefined as T;

    case 'automation_record_start':
      return {
        session_id: 'mock-recorder-session',
        start_time: Date.now(),
        is_recording: true,
      } as T;
    case 'automation_record_stop':
      return {
        id: 'mock-recording',
        name: 'Mock recording',
        actions: [],
        duration_ms: 0,
        created_at: Date.now(),
      } as T;
    case 'automation_record_discard':
      return {
        session_id: 'mock-recorder-session',
        action_count: 0,
        duration_ms: 0,
      } as T;
    case 'automation_record_get_status':
      return {
        session_id: 'mock-recorder-session',
        start_time: Date.now() - 12_000,
        is_recording: true,
        action_count: 3,
        duration_ms: 12_000,
      } as T;
    case 'automation_record_get_last':
      return null as T;
    case 'automation_record_is_recording':
      return true as T;
    case 'automation_record_get_session':
      return {
        session_id: 'mock-recorder-session',
        start_time: Date.now() - 12_000,
        is_recording: true,
      } as T;
    case 'automation_record_action_click':
    case 'automation_record_action_type':
    case 'automation_record_action_screenshot':
    case 'automation_record_action_wait':
    case 'automation_record_action_narration':
    case 'automation_record_clear_last':
      return undefined as T;

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
        topAutomations: [],
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

    case 'chat_update_conversation_title':
      return undefined as T;

    case 'chat_archive_conversation':
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

    case 'voice_start_global_ptt':
    case 'voice_stop_global_ptt':
    case 'voice_inject_text':
    case 'voice_tts_speak':
      return undefined as T;

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

    case 'glob_search':
    case 'dir_list':
      return [] as T;

    case 'format_detect':
      return {
        language: '',
        formatter: 'none',
        command: [],
        available: false,
      } as T;

    case 'lsp_list_servers':
      return [] as T;

    case 'extension_status':
      return {
        status: 'degraded',
        extension_support: true,
        transport: {
          native_messaging: true,
          websocket_port: 8787,
        },
        diagnostics: {
          recommendations: [],
          realtime_token: {
            path: '(mock app data)/.ipc_token',
            exists: false,
            valid: false,
            error: 'Desktop runtime is not active in the browser mock.',
          },
          native_connection: {
            state: 'disconnected',
            extension_id: null,
            ready: false,
          },
          vscode_connection: {
            state: 'disconnected',
            ready: false,
          },
        },
      } as T;

    case 'vision_send_message':
    case 'vision_extract_text':
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

    case 'background_agent_push': {
      const input = args?.['input'] as Record<string, unknown> | undefined;
      if (
        !input ||
        typeof input['conversationId'] !== 'string' ||
        input['conversationId'].trim().length === 0 ||
        typeof input['goal'] !== 'string' ||
        input['goal'].trim().length === 0
      ) {
        throw new Error('background_agent_push requires input.conversationId and input.goal');
      }
      return {
        agentId: `bg_mock_${Date.now()}`,
        queuePosition: null,
        started: true,
      } as T;
    }

    case 'background_agent_list':
      return { agents: [], activeCount: 0, maxAgents: 8 } as T;

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
        maxAgents: 8,
        atCapacity: false,
      } as T;

    case 'background_agent_cleanup':
      return 0 as T;

    case 'background_agent_should_push':
      return [false, (args?.['goal'] as string | undefined) ?? ''] as T;

    case 'skill_list':
      return [] as T;

    case 'skill_reload':
      return undefined as T;

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
      return [] as T;

    case 'agi_should_use_swarm':
      return false as T;

    case 'agi_submit_goal_auto':
      return { goalId: `goal_mock_${Date.now()}` } as T;
    case 'agi_submit_goal_swarm':
      return {
        success: true,
        goalId: `goal_mock_${Date.now()}`,
        succeeded: 1,
        failed: 0,
        wallTimeMs: 0,
        speedupRatio: 1,
        criticalPathLength: 1,
        maxParallelism: 1,
        summary: 'Swarm work is ready for review.',
      } as T;

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

    case 'settings_v2_get_batch':
    case 'settings_v2_get_category':
    case 'settings_v2_list_all':
    case 'settings_v2_load_app_settings':
      return {} as T;

    case 'settings_v2_delete':
    case 'settings_v2_save_app_settings':
      return undefined as T;

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

    case 'window_is_fullscreen':
    case 'window_is_maximized':
    case 'window_is_floating_visible':
      return false as T;

    case 'window_get_state':
      return {
        pinned: false,
        alwaysOnTop: false,
        keepInMenuBar: true,
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
    case 'window_set_menu_bar_mode':
    case 'window_request_close':
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

    case 'bg_submit_task':
      return `bgtask_mock_${Date.now()}` as T;

    case 'bg_list_tasks':
      return [] as T;

    case 'bg_get_task_status':
    case 'bg_get_task_stats':
      return null as T;

    case 'bg_cancel_task':
    case 'bg_pause_task':
    case 'bg_resume_task':
      return undefined as T;

    case 'complete_first_run':
    case 'complete_onboarding_step':
    case 'skip_first_run':
    case 'skip_onboarding_step':
    case 'reset_onboarding':
    case 'start_first_run_experience':
    case 'update_first_run_step':
      return undefined as T;

    case 'has_completed_first_run':
      return false as T;

    case 'get_first_run_session':
    case 'get_first_run_statistics':
      return null as T;

    case 'get_user_credits':
      return { credits: 0, usedCredits: 0 } as T;

    case 'get_user_rewards':
      return [] as T;

    case 'has_reward':
    case 'has_unlocked_feature':
      return false as T;

    case 'track_workflow_view':
      return undefined as T;

    case 'analytics_generate_weekly_report':
    case 'analytics_generate_monthly_report':
      return '# Mock Report\n\nNo data available in development mode.' as T;

    case 'analytics_get_top_processes':
      return [] as T;

    case 'analytics_save_snapshot':
      return `snapshot_mock_${Date.now()}` as T;

    case 'artifact_create':
    case 'artifact_create_streaming':
    case 'artifact_finalize_streaming':
    case 'artifact_get':
    case 'artifact_update':
    case 'artifact_apply_diff':
    case 'artifact_rollback': {
      const mockTs = new Date().toISOString();
      const mockId = (args?.['id'] as string | undefined) ?? `mock_artifact_${Date.now()}`;
      return {
        success: true,
        data: {
          id: mockId,
          title: (args?.['title'] as string | undefined) ?? 'Mock Artifact',
          artifact_type: (args?.['artifactType'] as string | undefined) ?? 'code',
          content: (args?.['content'] as string | undefined) ?? '',
          metadata: { Generic: {} },
          status: 'complete',
          versions: [],
          current_version: 1,
          created_at: mockTs,
          updated_at: mockTs,
          tags: [],
          pinned: false,
        },
      } as T;
    }

    case 'artifact_get_rendered': {
      const mockTs = new Date().toISOString();
      const mockId = (args?.['id'] as string | undefined) ?? 'mock_artifact';
      return {
        success: true,
        data: {
          id: mockId,
          title: 'Mock Artifact',
          artifact_type: 'code',
          rendered_content: {
            type: 'Code',
            data: {
              source: '',
              language: 'text',
              highlight_lines: [],
              executable: false,
              line_count: 0,
              file_extension: 'txt',
            },
          },
          version_info: { current: 1, total: 1, created_at: mockTs, updated_at: mockTs },
          status: 'complete',
          available_actions: ['copy', 'download', 'edit', 'delete'],
        },
      } as T;
    }

    case 'artifact_append_streaming':
    case 'artifact_delete':
    case 'artifact_archive':
    case 'artifact_unarchive':
    case 'artifact_pin':
    case 'artifact_add_tags':
    case 'artifact_remove_tags':
    case 'artifact_clear_all':
      return { success: true, data: null } as T;

    case 'artifact_link_to_message':
      return { success: true, data: 0, error: null } as T;

    case 'artifact_list':
    case 'artifact_get_by_conversation':
    case 'artifact_get_conversation_snapshot':
    case 'artifact_list_persisted':
    case 'artifact_get_versions':
    case 'artifact_export_all':
      return { success: true, data: [] } as T;

    case 'artifact_get_diff': {
      const mockTs = new Date().toISOString();
      return {
        success: true,
        data: {
          from_version: (args?.['fromVersion'] as number | undefined) ?? 1,
          to_version: (args?.['toVersion'] as number | undefined) ?? 2,
          from_content: '',
          to_content: '',
          from_timestamp: mockTs,
          to_timestamp: mockTs,
        },
      } as T;
    }

    case 'artifact_get_stats':
      return {
        success: true,
        data: {
          total_artifacts: 0,
          total_versions: 0,
          total_size_bytes: 0,
          by_type: {},
          by_status: {},
        },
      } as T;

    case 'artifact_import_all':
      return { success: true, data: 0 } as T;

    case 'memory_remember':
    case 'memory_store':
      return 1 as T;

    case 'memory_recall':
      return null as T;

    case 'memory_search':
    case 'memory_get_by_category':
    case 'memory_get_important':
    case 'memory_export_all':
    case 'memory_list_all':
    case 'memory_get_decay_candidates':
    case 'memory_suggest_important':
    case 'memory_get_project_memories':
    case 'memory_get_daily_logs':
      return [] as T;

    case 'memory_forget':
    case 'memory_forget_topic':
    case 'memory_delete':
      return true as T;

    case 'memory_log_context':
      return 1 as T;

    case 'memory_get_session_context':
    case 'memory_export_markdown':
      return '' as T;

    case 'memory_list_categories':
      return ['preference', 'fact', 'decision', 'context'] as T;

    case 'memory_cleanup_logs':
      return 0 as T;

    case 'memory_run_decay':
      return { memories_decayed: 0, total_decay_applied: 0 } as T;

    case 'memory_decay_single':
      return 5 as T;

    case 'memory_get_decay_config':
      return {
        enabled: true,
        decay_rate: 0.1,
        decay_period_days: 30,
        min_importance: 1,
        access_boost: 1,
      } as T;

    case 'memory_set_decay_config':
      return undefined as T;

    case 'memory_boost_on_access':
      return 5 as T;

    case 'memory_recall_with_boost':
      return null as T;

    case 'memory_get_stats':
      return {
        total_count: 0,
        avg_importance: 0,
        high_importance_count: 0,
        low_importance_count: 0,
      } as T;

    case 'memory_export_json':
      return {
        version: '1.0',
        exported_at: new Date().toISOString(),
        memories: [],
        daily_logs: [],
      } as T;

    case 'memory_import_json':
    case 'memory_import_json_string':
      return { memories_imported: 0, logs_imported: 0, skipped: 0, errors: [] } as T;

    case 'memory_get_dashboard_stats':
      return {
        memory_stats: {
          total_count: 0,
          avg_importance: 0,
          high_importance_count: 0,
          low_importance_count: 0,
        },
      } as T;

    case 'memory_get_usage_trends':
      return {
        total_memories: 0,
        average_importance: 0,
        high_importance: 0,
        low_importance: 0,
        trend: 'stable',
      } as T;

    case 'chat_load_project_memories':
      return {
        injection_result: {
          memories_loaded: 0,
          context: '',
          has_relevant_memories: false,
          summary: {
            decisions: 0,
            preferences: 0,
            facts: 0,
            context_entries: 0,
            total_importance_weight: 0,
          },
        },
        system_prompt_enhancement: '',
        message: 'No memories found',
      } as T;

    case 'chat_detect_and_save_decision':
    case 'chat_recall_memory':
      return null as T;

    case 'chat_save_decision':
      return { memory_id: 1, topic: 'mock', importance: 5, message: 'Decision saved' } as T;

    case 'chat_configure_memory_injection':
      return undefined as T;

    case 'chat_get_memory_dashboard':
      return {
        stats: {
          total_count: 0,
          avg_importance: 0,
          high_importance_count: 0,
          low_importance_count: 0,
        },
        trending_count: 0,
        timestamp: new Date().toISOString(),
      } as T;

    case 'chat_suggest_memories_for_review':
      return { critical_memories: [], high_importance: [] } as T;

    case 'chat_prefetch_session_memories':
      return '' as T;

    case 'chat_log_milestone':
    case 'chat_log_action':
      return 1 as T;

    case 'chat_search_memories':
      return [] as T;

    case 'save_project_context':
    case 'save_coding_style':
    case 'save_architectural_decision':
    case 'auto_save_decision':
      return 1 as T;

    case 'get_project_context':
      return null as T;

    case 'get_coding_styles':
    case 'get_project_memories':
    case 'search_project_memories':
    case 'get_architectural_decisions':
      return [] as T;

    case 'update_memory_importance':
      return undefined as T;

    case 'clear_project_memories':
      return 0 as T;

    case 'delete_project_memory':
      return true as T;

    case 'get_project_memory_stats':
      return {
        total_memories: 0,
        context_count: 0,
        coding_styles_count: 0,
        decisions_count: 0,
      } as T;

    case 'export_user_data':
      return '{}' as T;

    case 'clear_local_database':
    case 'cache_clear_all':
    case 'settings_v2_clear_cache':
      return undefined as T;

    case 'set_user_preference': {
      const prefKey = args?.['key'];
      if (typeof prefKey === 'string') {
        try {
          localStorage.setItem(`agi_mock_pref:${prefKey}`, String(args?.['value'] ?? ''));
        } catch {
          /* storage unavailable — treat as no-op */
        }
      }
      return undefined as T;
    }

    case 'get_user_preference': {
      const prefKey = args?.['key'];
      if (typeof prefKey === 'string') {
        try {
          const stored = localStorage.getItem(`agi_mock_pref:${prefKey}`);
          if (stored !== null) return { value: stored } as T;
        } catch {
          /* storage unavailable */
        }
      }
      return null as T;
    }

    case 'computer_use_cancel_opa_task':
      return false as T;

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
    case 'get_outcome_tracking':
    case 'get_session_info':
    case 'reset_session_cost':
    case 'update_session_activity':
    case 'project_context_set_folder':
    case 'project_context_get_folder':
    case 'project_context_get_summary':
    case 'project_context_list_files':
    case 'project_context_validate_path':
    case 'project_has_instructions':
    case 'project_load_instructions':
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
      return undefined as T;

    case 'task_get_resumable':
    case 'task_get_status':
      return null as T;

    case 'task_list_by_status':
      return [] as T;

    case 'file_write':
    case 'account_disconnect_device':
    case 'settings_save':
    case 'calendar_delete_event':
    case 'terminal_kill':
    case 'account_store_api_base_url':
    case 'account_store_access_token':
    case 'account_store_refresh_token':
    case 'account_clear_tokens':
    case 'account_restore_access_token':
    case 'account_restore_refresh_token':
    case 'llm_ensure_managed_cloud':
    case 'secret_manager_set':
    case 'secret_manager_delete':
    case 'on_file_changed':
    case 'on_file_deleted':
    case 'ollama_pull_model':
    case 'ollama_delete_model':
    case 'cloud_complete_oauth':
    case 'cloud_download':
    case 'cloud_delete':
    case 'chat_set_monthly_budget':
    case 'error_report':
    case 'api_oauth_create_client':
    case 'computer_use_click':
    case 'computer_use_move_mouse':
    case 'computer_use_stop_session':
    case 'app_permissions_set':
    case 'app_permissions_remove':
    case 'save_custom_agent':
    case 'delete_custom_agent':
    case 'shortcut_register':
    case 'terminal_send_input':
    case 'terminal_resize':
    case 'terminal_clear_history':
    case 'terminal_set_env':
    case 'terminal_unset_env':
    case 'update_trigger':
    case 'unregister_trigger':
    case 'toggle_trigger':
    case 'productivity_trello_move_card':
    case 'productivity_asana_assign_task':
    case 'productivity_asana_mark_complete':
    case 'save_custom_instructions':
    case 'canvas_set_active':
    case 'canvas_add_element':
    case 'canvas_clear':
    case 'log_tool_execution':
    case 'log_workflow_execution':
    case 'approve_request':
    case 'reject_request':
    case 'cancel_tool_execution':
    case 'update_allowed_directories':
    case 'agent_stop':
    case 'agi_extend_timeout':
    case 'timeout_set_config':
    case 'index_file':
      return undefined as T;

    case 'index_workspace':
      return { files: [], symbols: [] } as T;

    case 'api_validate_template':
      return { valid: true } as T;

    default:
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
    const { listen: tauriListen } = await import('@tauri-apps/api/event');
    return tauriListen<T>(event, handler);
  }

  if (isCloudWeb) {
    const eventKey = `__cloud_web_${event}`;
    const wrappedHandler = (e: CustomEvent) => {
      handler({ payload: e.detail as T, id: Math.random() });
    };
    window.addEventListener(eventKey, wrappedHandler as EventListener);
    return () => {
      window.removeEventListener(eventKey, wrappedHandler as EventListener);
    };
  }

  console.debug(`[Tauri Web Bridge] Registered listener for event: ${event}`);

  return () => {
    console.debug(`[Tauri Web Bridge] Unregistered listener for event: ${event}`);
  };
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  if (isTauri) {
    const { emit: tauriEmit } = await import('@tauri-apps/api/event');
    return tauriEmit(event, payload);
  }

  if (isCloudWeb) {
    const eventKey = `__cloud_web_${event}`;
    window.dispatchEvent(new CustomEvent(eventKey, { detail: payload }));
    return;
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

export async function openUrl(url: string): Promise<void> {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-shell');
    return open(url);
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

interface UpdateCheckResult {
  available: boolean;
  currentVersion?: string;
  version?: string;
  body?: string;
  downloadAndInstall?: () => Promise<void>;
}

export async function checkForUpdates(): Promise<UpdateCheckResult | null> {
  if (isTauri || isElectronHost) {
    const { check } = await import('@tauri-apps/plugin-updater');
    return check();
  }

  console.debug('[Tauri Mock] Update check not available in web mode');
  return null;
}

export async function relaunchApp(): Promise<void> {
  if (isTauri) {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    return relaunch();
  }

  window.location.reload();
}
