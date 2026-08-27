import type {
  DiscoverResult,
  OAuthClientProvider,
  PriorDiscovery,
  ResponseCacheStore,
} from '@modelcontextprotocol/client';
import type {
  CancelTaskResult,
  CreateTaskResult,
  GetTaskResult,
  UpdateTaskResult,
} from '@modelcontextprotocol/ext-tasks/schema/2026-07-28/schema';

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string | number | boolean>;
  cwd?: string;
  url?: string;
  transport?: 'sse' | 'streamable-http';
  headers?: Record<string, string | number | boolean>;
  authProvider?: OAuthClientProvider;
  connectionTimeoutMs?: number;
  signedManifest?: boolean;
  userConsent?: {
    granted_at: string;
    for_command: string;
    for_args?: string[];
  };
  developerMode?: boolean;
}

export interface McpClientCacheConfig {
  /** Stable authorization-context partition for server-declared private cache entries. */
  partition: string;
  store?: ResponseCacheStore;
  defaultTtlMs?: number;
}

export interface McpDiscoveryConfig {
  /** A persisted SDK discovery verdict, scoped to the same server and authorization context. */
  prior?: PriorDiscovery;
  /** Receives a fresh, JSON-serializable modern discovery document after connect. */
  onDiscovered?: (discover: DiscoverResult) => void | Promise<void>;
}

export type McpToolVisibility = 'model' | 'app' | 'both';

export interface McpAppDescriptor {
  serverName: string;
  toolName: string;
  resourceUri: string;
  visibility: McpToolVisibility;
}

export interface McpCatalogTool {
  serverName: string;
  safeServerName: string;
  toolName: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  app?: McpAppDescriptor;
  visibility: McpToolVisibility;
  fallbackDescription: string;
}

export interface McpCatalogResource {
  serverName: string;
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
  isApp: boolean;
}

export interface McpCatalogResourceTemplate {
  serverName: string;
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface McpCatalogPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpCatalogPrompt {
  serverName: string;
  name: string;
  title?: string;
  description?: string;
  arguments: McpCatalogPromptArgument[];
}

export interface McpCatalogDiscoveryError {
  capability: 'tools' | 'resources' | 'resourceTemplates' | 'prompts';
  message: string;
}

export interface McpServerCatalog {
  serverName: string;
  safeServerName: string;
  protocolEra: 'modern' | 'legacy';
  protocolVersion?: string;
  serverInfo?: { name: string; version: string };
  capabilities: Record<string, unknown>;
  tasksSupported: boolean;
  discover?: DiscoverResult;
  tools: McpCatalogTool[];
  resources: McpCatalogResource[];
  resourceTemplates: McpCatalogResourceTemplate[];
  prompts: McpCatalogPrompt[];
  apps: McpAppDescriptor[];
  discoveryErrors: McpCatalogDiscoveryError[];
}

export interface McpToolCatalog {
  version: number;
  generatedAt: number;
  servers: Record<string, McpServerCatalog>;
  tools: McpCatalogTool[];
  resources: McpCatalogResource[];
  resourceTemplates: McpCatalogResourceTemplate[];
  prompts: McpCatalogPrompt[];
  apps: McpAppDescriptor[];
}

export interface McpInputRequiredState {
  inputRequests: Record<string, unknown>;
  requestState?: string;
}

export interface McpCallToolResult {
  isError?: boolean;
  inputRequired?: McpInputRequiredState;
  task?: CreateTaskResult;
  app?: McpAppDescriptor;
  structuredContent?: unknown;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource'; resource: { uri: string; mimeType?: string; text?: string } }
  >;
}

export interface McpTaskOperations {
  get(taskId: string, options?: { signal?: AbortSignal }): Promise<GetTaskResult>;
  update(
    taskId: string,
    inputResponses: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<UpdateTaskResult>;
  cancel(taskId: string, options?: { signal?: AbortSignal }): Promise<CancelTaskResult>;
}
