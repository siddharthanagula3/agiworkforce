/**
 * Host dispatch for the desktop renderer, despite the filename.
 *
 * `invoke` here is not a mock. It routes a command to whichever host is
 * actually present: the Tauri core or a cloud API. The
 * fixture `switch` further down exists for tests and the local UI dev shell and
 * is unreachable in any shipped build, because `shouldServeFixtures` answers on
 * `test || desktopUiDev` alone and a production bundle satisfies neither.
 *
 * Said plainly at the top because the name has misled a reader into recording
 * this file as a mock on the shipped desktop, which is a release-gate verdict
 * rather than a detail. The rule the name obscures is asserted directly in
 * `src/__tests__/tauriMock.test.ts`, "which runtimes may answer with a fixture".
 */
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
import { REGISTERED_COMMANDS } from '../utils/registeredCommands';
import { isCloudWeb, isDesktopUiDevLocal, isTauri, isTestEnvironment } from './runtimeEnvironment';

export {
  isCloudWeb,
  isDesktopUiDevLocal,
  isTauri,
  supportsLocalAppMode,
} from './runtimeEnvironment';

const CLOUD_WEB_FALLTHROUGH = Symbol('CLOUD_WEB_FALLTHROUGH');
const NATIVE_ONLY_FEATURE_MESSAGE =
  'This feature runs only in the AGI Workforce desktop app. Switch to Local mode there, or download it from https://agiworkforce.com/download';
const CLOUD_CHAT_DEFAULT_MODEL = getTaskModelForProvider('anthropic', 'chat') ?? '';
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

function requireMockUserId(command: string, args?: Record<string, unknown>): void {
  const userId = args?.['userId'];
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error(`${command} requires userId`);
  }
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

    default:
      return CLOUD_WEB_FALLTHROUGH as typeof CLOUD_WEB_FALLTHROUGH;
  }
}

/**
 * May this runtime answer an unimplemented native command with a fixture?
 *
 * Only a test runtime and local desktop UI development may. Cloud web used to be
 * exempt from the throw as well, which made the throw unreachable: `isCloudWeb`
 * is `!supportsLocalAppMode && !isTestEnvironment`, and Tauri returns before
 * this point, so every remaining caller satisfied one of the three exemptions
 * and fell through into the fixture `switch`. An unimplemented native command in
 * the shipped cloud shell answered `{ success: true, title: 'Mock Artifact' }`.
 *
 * Nothing reaches it today: `createDesktopChatRuntime` returns `WebRuntime` off
 * Tauri, and `SettingsPanel` hides the tabs that would call these. It is closed
 * because AGENTS.md section 9 forbids a mock production path, and the next
 * feature to call `invoke` from cloud mode would have inherited a false success
 * rather than an error it could handle.
 *
 * Pure and exported so the rule can be asserted without standing up a runtime.
 */
export function shouldServeFixtures(runtime: { test: boolean; desktopUiDev: boolean }): boolean {
  return runtime.test || runtime.desktopUiDev;
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

  if (isCloudWeb) {
    const cloudResult = await handleCloudWebCommand<T>(command, args);
    if (cloudResult !== CLOUD_WEB_FALLTHROUGH) {
      return cloudResult;
    }
    // Fall through to test-mode mock values for desktop-only commands
  }

  if (!shouldServeFixtures({ test: isTestEnvironment, desktopUiDev: isDesktopUiDevLocal })) {
    const errorMessage = `This feature requires the AGI Workforce desktop application. Please download it from https://agiworkforce.com/download`;
    console.error(`[Tauri] ${errorMessage}`, { command, args });
    throw new Error(errorMessage);
  }

  switch (command) {
    case 'check_automation_permissions':
      return {
        accessibility: false,
        screen_recording: false,
        input_monitoring: false,
        automation_service_ready: false,
        support: {
          accessibility: 'needs_grant',
          screen_recording: 'needs_grant',
          input_monitoring: 'needs_grant',
          window_control_missing_program: null,
        },
      } as T;

    case 'request_automation_permission':
    case 'set_auto_approve_all':
    case 'set_agent_mode':
      return undefined as T;

    case 'set_capability':
      return true as T;

    case 'list_capabilities':
      return [] as T;

    case 'settings_kept_unreadable_file':
      return null as T;

    case 'get_auto_approve_all':
      return false as T;

    case 'get_agent_mode':
      return 'build' as T;

    case 'ollama_pull_model':
      return 'completed' as T;
    case 'ollama_cancel_pull':
      return false as T;
    case 'ollama_list_loaded_models':
    case 'llm_lmstudio_list_model_states':
      return [] as T;
    case 'ollama_get_keep_alive':
      return null as T;
    case 'ollama_set_keep_alive':
      return ((args?.['keepAliveSeconds'] as number | null | undefined) ?? null) as T;

    case 'master_password_get_status':
      return {
        is_configured: false,
        is_unlocked: false,
        last_changed: null,
        needs_migration: false,
        password_policy: { min_length: 12, min_character_classes: 3 },
      } as T;
    case 'master_password_migrate_credentials':
      return {
        api_keys_migrated: 0,
        rows_skipped_already_modern: 0,
        rows_skipped_undecryptable: 0,
      } as T;
    case 'master_password_setup':
    case 'master_password_unlock':
    case 'master_password_change':
    case 'master_password_remove':
      return { success: true, message: 'ok' } as T;
    case 'master_password_lock':
      return undefined as T;

    case 'chat_get_conversations':
    case 'chat_get_messages':
    case 'project_list':
    case 'app_permissions_list':
    case 'app_permissions_always_blocked': // Stream 1: array of bundle id strings
      return [] as T;

    case 'project_create':
      return args?.['project'] as T;

    case 'app_permissions_active_window': // Stream 1: Option<ActiveWindow>
      return null as T;

    case 'project_update':
    case 'project_delete':
    case 'file_open_with_default_app':
      return undefined as T;

    case 'document_create_pdf_simple_manifest':
      return mockDocumentCreationResult(args, 'pdf') as T;

    case 'chat_send_message':
      throw new Error('Chat functionality requires the desktop application');

    case 'llm_send_message': {
      const msgs =
        (args?.['messages'] as Array<{ role: string; content: string }> | undefined) ?? [];
      const lastUserMsg = [...msgs].reverse().find((m) => m.role === 'user')?.content ?? '';
      return { content: lastUserMsg, model: args?.['model'] ?? 'mock', cached: false } as T;
    }

    case 'voice_transcribe_blob':
      return { text: '(mock transcript)', language: 'en', duration: 1.0, confidence: 0.95 } as T;

    case 'router_suggestions':
      throw new Error('Router suggestions require the desktop application');

    case 'research_start':
      return `session_mock_${Date.now()}` as T;
    case 'research_cancel':
      return undefined as T;
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
    case 'mcp_get_server_logs':
      return [] as T;
    case 'mcp_get_health':
      return [] as T;
    case 'mcp_oauth_start':
      return {
        authUrl: 'https://example.com/oauth',
        state: 'mock-oauth-state',
      } as T;
    case 'mcp_oauth_callback':
      return {
        provider: (args?.['provider'] as string | undefined) ?? 'mock-provider',
        connected: true,
        expiresAt: null,
      } as T;
    case 'mcp_oauth_disconnect':
    case 'mcp_oauth_set_credentials':
      return undefined as T;
    case 'mcp_oauth_credentials_status':
      return { configured: false } as T;
    case 'connector_permission_list':
      return { store: { state: 'missing' }, permissions: [] } as T;
    case 'connector_permission_reset':
      return { reset: false, keptAs: null } as T;
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
    case 'mcp_list_credential_slots':
      return [] as T;

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
    case 'mcpb_get_categories':
      return ['other', 'search'] as T;
    case 'mcpb_get_featured':
      return mockMcpBundles().filter((bundle) => bundle.featured) as T;
    case 'mcpb_get_installed_bundles':
      return mockMcpBundles().filter((bundle) => bundle.installed) as T;
    case 'mcpb_install_bundle':
    case 'mcpb_update_bundle': {
      const bundleId = String(args?.['bundleId'] ?? '');
      const bundle = mockMcpBundles().find((candidate) => candidate.id === bundleId);
      if (!bundle) throw new Error(`Bundle not found: ${bundleId}`);
      if (!bundle.verified) {
        throw new Error(`MCP package '${bundle.name}' is not on the allow-list.`);
      }
      MOCK_INSTALLED_MCP_BUNDLES.add(bundleId);
      return `Bundle '${bundleId}' installed in UI development mode` as T;
    }
    case 'mcpb_uninstall_bundle': {
      const bundleId = String(args?.['bundleId'] ?? '');
      MOCK_INSTALLED_MCP_BUNDLES.delete(bundleId);
      return `Bundle '${bundleId}' removed in UI development mode` as T;
    }

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
    case 'mcp_oauth_status':
      return {
        connected: false,
        userInfo: null,
        expiresAt: null,
      } as T;
    case 'mcp_oauth_refresh':
      return {
        provider: (args?.['provider'] as string | undefined) ?? 'mock-provider',
        connected: false,
        expiresAt: null,
      } as T;

    case 'extension_list':
      return [] as T;

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
    case 'scheduler_list_jobs':
      return [] as T;

    case 'scheduler_add_job':
      return `sched_mock_${Date.now()}` as T;

    case 'scheduler_update_job':
    case 'scheduler_remove_job':
    case 'scheduler_toggle_job':
    case 'scheduler_run_job_now':
      return undefined as T;

    case 'scheduler_get_history':
    case 'scheduler_running_jobs':
      return [] as T;

    case 'scheduler_stop_run':
      return false as T;

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
    case 'automation_record_action_click':
    case 'automation_record_action_narration':
    case 'automation_record_clear_last':
      return undefined as T;

    case 'git_trust_repository_config':
      return [] as T;
    case 'conversation_export_pdf':
      requireMockUserId(command, args);
      return '/tmp/mock-conversation.pdf' as T;

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

    case 'chat_delete_message':
      requireMockUserId(command, args);
      return undefined as T;

    case 'search_chat_history':
      return [] as T;

    case 'get_recent_conversations':
      return [] as T;

    case 'conversation_export':
      requireMockUserId(command, args);
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

    case 'voice_start_global_ptt':
    case 'voice_stop_global_ptt':
      return undefined as T;

    case 'llm_check_provider_status':
      return {
        provider: (args?.['provider'] as string | undefined) ?? 'anthropic',
        available: false,
        configured: false,
      } as T;

    case 'llm_get_usage_stats':
      return {
        total_tokens: 0,
        total_cost: 0,
        message_count: 0,
        by_provider: {},
        by_model: {},
      } as T;

    case 'llm_get_available_models':
      return [] as T;

    case 'llm_set_default_provider':
    case 'llm_configure_provider':
      return undefined as T;

    case 'dir_list':
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

    case 'background_agent_list':
      return { agents: [], activeCount: 0, maxAgents: 8 } as T;

    case 'background_agent_get':
      return null as T;

    case 'background_agent_pause':
    case 'background_agent_resume':
    case 'background_agent_cancel':
      return undefined as T;

    case 'skill_list':
      return [] as T;

    case 'skill_reload':
      return undefined as T;

    case 'skill_workspace_status':
    case 'skill_set_workspace_consent':
      return {
        skillsDir: null,
        skillCount: 0,
        consented: false,
        changedSinceConsent: false,
      } as T;

    case 'skill_get_instructions':
      return '' as T;

    case 'skill_match_for_message':
      return [] as T;

    case 'voice_configure':
    case 'voice_wake_enable':
    case 'voice_wake_disable':
    case 'voice_enable_barge_in':
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
      return false as T;

    case 'voice_get_capabilities':
      return {
        ttsAvailable: false,
        ttsProvider: 'System',
        ttsPlaying: false,
        wakeWordEnabled: false,
        wakeWordAvailable: false,
        bargeInEnabled: false,
        bargeInSensitivity: 0.5,
        vadAvailable: false,
        localSttAvailable: false,
        localSttModel: null,
        localTtsAvailable: false,
        localTtsVoice: null,
        systemDictationAvailable: false,
      } as T;

    case 'voice_list_whisper_models':
    case 'voice_list_piper_voices':
      return [] as T;

    case 'voice_tts_speak_local':
    case 'voice_tts_speak_with_barge_in':
    case 'voice_tts_stop':
      return undefined as T;

    case 'notification_set_settings':
      return undefined as T;

    case 'notification_delete_all_read':
    case 'notification_mark_all_read':
      return 0 as T;

    case 'notification_unread_count':
      return 0 as T;

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

    case 'computer_use_revoke_consent':
      return undefined as T;

    case 'window_get_state':
      return {
        pinned: false,
        alwaysOnTop: false,
        keepInMenuBar: true,
        dock: null,
        maximized: false,
        fullscreen: false,
      } as T;

    case 'window_toggle_maximize':
    case 'window_set_pinned':
    case 'window_set_always_on_top':
    case 'window_set_visibility':
    case 'window_set_menu_bar_mode':
    case 'window_request_close':
    case 'window_dock':
    case 'window_close_floating':
      return undefined as T;

    case 'window_toggle_floating':
      return false as T;

    case 'error_get_logs':
      return [] as T;

    case 'shortcuts_reset':
      return [] as T;

    case 'shortcuts_register_global':
    case 'shortcuts_unregister_global':
      return undefined as T;

    case 'shortcuts_update':
      return {
        id: 'mock_shortcut',
        key: 'CommandOrControl+K',
        description: 'Mock shortcut',
        action: 'mock_action',
        enabled: true,
        is_global: false,
      } as T;

    case 'artifact_get':
    case 'artifact_update':
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

    case 'artifact_delete':
    case 'artifact_archive':
    case 'artifact_unarchive':
    case 'artifact_pin':
      return { success: true, data: null } as T;

    case 'artifact_link_to_message':
      return { success: true, data: 0, error: null } as T;

    case 'artifact_get_conversation_snapshot':
    case 'artifact_list_persisted':
    case 'artifact_get_versions':
      return { success: true, data: [] } as T;

    case 'memory_store':
      return 1 as T;

    case 'memory_list_all':
      return [] as T;

    case 'memory_forget_topic':
    case 'memory_delete':
      return true as T;

    case 'memory_export_markdown':
      return '' as T;

    case 'memory_export_json':
      return {
        version: '1.0',
        exported_at: new Date().toISOString(),
        memories: [],
        daily_logs: [],
      } as T;

    case 'memory_import_json_string':
      return {
        memories_imported: 0,
        memories_skipped: 0,
        memories_replaced: 0,
        logs_imported: 0,
        errors: [],
      } as T;

    case 'chat_configure_memory_injection':
      return undefined as T;

    case 'save_architectural_decision':
      return 1 as T;

    case 'get_project_memories':
      return [] as T;

    case 'delete_project_memory':
      return true as T;

    case 'privacy_delete_account':
    case 'cache_clear_all':
    case 'settings_v2_clear_cache':
      return undefined as T;

    case 'privacy_export_data':
      return null as T;

    case 'set_user_preference': {
      const prefKey = args?.['key'];
      if (typeof prefKey === 'string') {
        try {
          localStorage.setItem(`agi_mock_pref:${prefKey}`, String(args?.['value'] ?? ''));
        } catch {
          return undefined as T;
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

    case 'chat_delete_conversation':
    case 'computer_use_execute_opa_task':
    case 'llm_list_ollama_models':
    case 'project_context_set_folder':
      return undefined as T;

    case 'file_write':
    case 'settings_save':
    case 'terminal_kill':
    case 'account_store_api_base_url':
    case 'account_set_app_mode':
    case 'account_store_access_token':
    case 'account_clear_tokens':
    case 'account_restore_access_token':
    case 'account_refresh_session':
    case 'llm_ensure_managed_cloud':
    case 'secret_manager_set':
    case 'secret_manager_delete':
    case 'ollama_delete_model':
    case 'ollama_load_model':
    case 'ollama_unload_model':
    case 'llm_lmstudio_load_model':
    case 'llm_lmstudio_unload_model':
    case 'cloud_complete_oauth':
    case 'cloud_disconnect':
    case 'cloud_download':
    case 'cloud_delete':
    case 'chat_set_monthly_budget':
    case 'error_report':
    case 'app_permissions_set':
    case 'app_permissions_remove':
    case 'save_custom_agent':
    case 'delete_custom_agent':
    case 'terminal_send_input':
    case 'terminal_resize':
    case 'terminal_clear_history':
    case 'update_trigger':
    case 'unregister_trigger':
    case 'toggle_trigger':
    case 'save_custom_instructions':
    case 'cancel_tool_execution':
    case 'update_allowed_directories':
      return undefined as T;

    default:
      // Two very different failures land here. A name Rust does register is a
      // native-only capability that this shell genuinely cannot run, and the
      // user needs to be told that in their own terms. A name Rust does not
      // register is a wiring bug, and the developer needs the raw name.
      if (REGISTERED_COMMANDS.has(command)) {
        console.error(`[Tauri] Native-only command reached the cloud shell: ${command}`);
        throw new Error(NATIVE_ONLY_FEATURE_MESSAGE);
      }
      console.error(`[Tauri] Unregistered command in test mode: ${command}`);
      throw new Error(
        `Command not registered in tauri-mock: ${command}. This indicates a frontend-backend wiring issue.`,
      );
  }
}

export function isTauriContext(): boolean {
  return isTauri;
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
  if (isTauri) {
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
