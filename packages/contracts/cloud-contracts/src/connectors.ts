import { z } from 'zod';
import {
  CONNECTOR_HEALTH_STATES,
  CONNECTOR_SOURCES,
  CONNECTOR_TOOL_PERMISSION_LEVELS,
  type OrganizationRole,
} from '@agiworkforce/types';

export {
  CONNECTOR_HEALTH_STATES,
  CONNECTOR_SOURCES,
  CONNECTOR_TOOL_PERMISSION_LEVELS,
} from '@agiworkforce/types';
export type {
  ConnectorHealthState,
  ConnectorSource,
  ConnectorToolPermissionLevel,
} from '@agiworkforce/types';

// The shape the connector list is written against, so a client that meets a
// newer one can say so instead of dropping rows it does not understand.
export const CONNECTOR_CONTRACT_SCHEMA_VERSION = 1;
export const CONNECTOR_CONTRACT_MIN_SCHEMA_VERSION = 1;

export const MANAGED_CLOUD_CONNECTORS_PATH = '/api/connectors';
export const CUSTOM_CONNECTORS_PATH = '/api/connectors/custom';
export const CONNECTOR_CALLS_PATH = '/api/connectors/calls';
export const CONNECTOR_HEALTH_PATH = '/api/connectors/health';
export const CONNECTOR_TOOL_PERMISSIONS_PATH = '/api/connectors/permissions';
export const GOOGLE_DRIVE_PICKER_PATH = '/api/connectors/google-drive/picker';

export const CONNECTOR_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
export const ConnectorRefSchema = z.string().regex(CONNECTOR_REF_PATTERN);

function connectorScopedPath(connectorId: string, segment: string): string {
  return `${MANAGED_CLOUD_CONNECTORS_PATH}/${encodeURIComponent(connectorId)}/${segment}`;
}

export function connectorAccountsPath(connectorId: string): string {
  return connectorScopedPath(connectorId, 'accounts');
}

export function connectorCapabilitiesPath(connectorId: string): string {
  return connectorScopedPath(connectorId, 'capabilities');
}

export function connectorCredentialsPath(connectorId: string): string {
  return connectorScopedPath(connectorId, 'credentials');
}

export function connectorMcpPath(connectorId: string): string {
  return connectorScopedPath(connectorId, 'mcp');
}

export const CONNECTOR_PERMISSION_ACCESS_LEVELS = ['read', 'write'] as const;
export type ConnectorPermissionAccess = (typeof CONNECTOR_PERMISSION_ACCESS_LEVELS)[number];

export const ConnectorGrantedPermissionSchema = z.object({
  scope: z.string().min(1),
  sentence: z.string(),
  access: z.enum(CONNECTOR_PERMISSION_ACCESS_LEVELS),
});
export type ConnectorGrantedPermission = z.infer<typeof ConnectorGrantedPermissionSchema>;

export const ConnectorConnectionSchema = z.object({
  id: z.string().min(1),
  connectorId: z.string().min(1),
  authType: z.string(),
  connectedAt: z.string(),
  updatedAt: z.string(),
  source: z.enum(CONNECTOR_SOURCES),
  name: z.string().optional(),
  toolConnectorId: z.string().optional(),
  directoryId: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  grantedPermissions: z.array(ConnectorGrantedPermissionSchema).optional(),
  needsReauthorization: z.boolean().optional(),
  health: z.enum(CONNECTOR_HEALTH_STATES).optional(),
});
export type ConnectorConnection = z.infer<typeof ConnectorConnectionSchema>;

export const ConnectorSetupEntrySchema = z.object({
  kind: z.string(),
  missingEnv: z.array(z.string()),
  message: z.string(),
});
export type ConnectorSetupEntry = z.infer<typeof ConnectorSetupEntrySchema>;

export const ListConnectorsResponseSchema = z.object({
  connectors: z.array(ConnectorConnectionSchema),
  available: z.array(z.string()),
  setup: z.record(z.string(), ConnectorSetupEntrySchema).optional(),
  pending: z.array(z.string()).optional(),
});
export type ListConnectorsResponse = z.infer<typeof ListConnectorsResponseSchema>;

export const ConnectRequestSchema = z.object({
  connectorId: z.string().min(1),
  authType: z.string().optional(),
});
export type ConnectRequest = z.infer<typeof ConnectRequestSchema>;

export const MCP_PROTOCOL_ERAS = ['modern', 'legacy'] as const;
export type McpProtocolEra = (typeof MCP_PROTOCOL_ERAS)[number];

export const ConnectorCapabilityCountsSchema = z.object({
  tools: z.number().int().nonnegative(),
  resources: z.number().int().nonnegative(),
  resourceTemplates: z.number().int().nonnegative(),
  prompts: z.number().int().nonnegative(),
  apps: z.number().int().nonnegative(),
});
export type ConnectorCapabilityCounts = z.infer<typeof ConnectorCapabilityCountsSchema>;

export const ConnectSuccessResponseSchema = z.object({
  connector: ConnectorConnectionSchema,
  alreadyConnected: z.boolean().optional(),
  toolCount: z.number().int().nonnegative().optional(),
  toolNames: z.array(z.string()).optional(),
  capabilityCounts: ConnectorCapabilityCountsSchema.optional(),
  protocolEra: z.enum(MCP_PROTOCOL_ERAS).optional(),
});
export type ConnectSuccessResponse = z.infer<typeof ConnectSuccessResponseSchema>;

export const ConnectConflictResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  connectorId: z.string(),
  installStartPath: z.string().optional(),
  oauthStartPath: z.string().optional(),
  credentialsPath: z.string().optional(),
  accountUrlConnector: z.string().optional(),
  plaidLinkPath: z.string().optional(),
  plaidExchangePath: z.string().optional(),
  setup: ConnectorSetupEntrySchema.nullable().optional(),
  authType: z.string().optional(),
});
export type ConnectConflictResponse = z.infer<typeof ConnectConflictResponseSchema>;

export const CONNECTOR_PROBE_FAILURE_CODES = [
  'CONNECTOR_UNREACHABLE',
  'CONNECTOR_BLOCKED',
] as const;
export type ConnectorProbeFailureCode = (typeof CONNECTOR_PROBE_FAILURE_CODES)[number];

export const ConnectorProbeFailureResponseSchema = z.object({
  error: z.object({ code: z.enum(CONNECTOR_PROBE_FAILURE_CODES), message: z.string() }),
  message: z.string(),
});
export type ConnectorProbeFailureResponse = z.infer<typeof ConnectorProbeFailureResponseSchema>;

export const DisconnectResponseSchema = z.object({
  success: z.boolean(),
});
export type DisconnectResponse = z.infer<typeof DisconnectResponseSchema>;

export const DisconnectFailureResponseSchema = z.object({
  error: z.string(),
  reason: z.string(),
  retryable: z.boolean(),
});
export type DisconnectFailureResponse = z.infer<typeof DisconnectFailureResponseSchema>;

export const ConnectorErrorResponseSchema = z.object({
  error: z
    .union([z.string(), z.object({ code: z.string().optional(), message: z.string().optional() })])
    .optional(),
  message: z.string().optional(),
});
export type ConnectorErrorResponse = z.infer<typeof ConnectorErrorResponseSchema>;

export function connectorErrorMessage(body: unknown, fallback: string): string {
  const parsed = ConnectorErrorResponseSchema.safeParse(body);
  if (!parsed.success) return fallback;
  const { error, message } = parsed.data;
  return message || (typeof error === 'string' ? error : error?.message) || fallback;
}

export const CUSTOM_CONNECTOR_TRANSPORTS = ['sse', 'streamable-http'] as const;
export type CustomConnectorTransport = (typeof CUSTOM_CONNECTOR_TRANSPORTS)[number];

export const CustomConnectorSchema = z.object({
  id: z.string().min(1),
  shortId: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
  transport: z.enum(CUSTOM_CONNECTOR_TRANSPORTS),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CustomConnector = z.infer<typeof CustomConnectorSchema>;

export const CustomConnectorSummarySchema = CustomConnectorSchema.extend({
  signInRequired: z.boolean().optional(),
  credentialUnreadable: z.literal(true).optional(),
  directoryId: z.string().min(1).optional(),
  signedIn: z.boolean().optional(),
});
export type CustomConnectorSummary = z.infer<typeof CustomConnectorSummarySchema>;

export const ListCustomConnectorsResponseSchema = z.object({
  connectors: z.array(CustomConnectorSummarySchema),
  oauthRedirectUri: z.string().min(1).optional(),
});
export type ListCustomConnectorsResponse = z.infer<typeof ListCustomConnectorsResponseSchema>;

export const CreateCustomConnectorRequestSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().min(1),
  transport: z.enum(CUSTOM_CONNECTOR_TRANSPORTS).optional(),
  authToken: z.string().max(4096).optional(),
  oauthClientId: z.string().max(512).optional(),
  oauthClientSecret: z.string().max(4096).optional(),
});
export type CreateCustomConnectorRequest = z.infer<typeof CreateCustomConnectorRequestSchema>;

export const CreatedCustomConnectorSchema = z.object({
  connector: CustomConnectorSchema,
  signInRequired: z.boolean().optional(),
  toolCount: z.number().int().nonnegative().optional(),
  capabilityCounts: ConnectorCapabilityCountsSchema.optional(),
  protocolEra: z.enum(MCP_PROTOCOL_ERAS).optional(),
});

export const CreateCustomConnectorResponseSchema = CreatedCustomConnectorSchema.refine(
  (body) => body.signInRequired === true || body.toolCount !== undefined,
  {
    message: 'toolCount is required unless the server needs a sign-in first',
    path: ['toolCount'],
  },
);
export type CreateCustomConnectorResponse = z.infer<typeof CreateCustomConnectorResponseSchema>;

export const DeleteCustomConnectorResponseSchema = DisconnectResponseSchema;
export type DeleteCustomConnectorResponse = DisconnectResponse;

export const CONNECTOR_OAUTH_START_PATH = '/api/connectors/oauth/start';

export const CONNECTOR_OAUTH_CALLBACK_PATH = '/api/connectors/oauth/callback';

export const CONNECTOR_OAUTH_COMPLETE_PATH = '/api/connectors/oauth/complete';
export const CONNECTOR_OAUTH_APP_RETURN_PARAM = 'appReturn';
export const CONNECTOR_OAUTH_APP_RETURN_URL = 'agiworkforce://connectors/oauth';

export const CONNECTOR_OAUTH_RESULT_CONNECTOR_PARAM = 'connector';
export const CONNECTOR_OAUTH_RESULT_STATUS_PARAM = 'status';

export const CONNECTOR_OAUTH_START_STATUSES = [
  'not_configured',
  'registration_rejected',
  'reauthorize',
  'error',
  'open',
  'unavailable',
  'credential',
  'policy_blocked',
  'scope_reconsent',
] as const;
export type ConnectorOAuthStartStatus = (typeof CONNECTOR_OAUTH_START_STATUSES)[number];

export const CONNECTOR_OAUTH_CALLBACK_STATUSES = [
  'connected',
  'denied',
  'failed',
  'invalid_state',
  'unavailable',
  'reauthorize',
  'registration_rejected',
] as const;
export type ConnectorOAuthCallbackStatus = (typeof CONNECTOR_OAUTH_CALLBACK_STATUSES)[number];

export type ConnectorOAuthResultStatus = ConnectorOAuthStartStatus | ConnectorOAuthCallbackStatus;

export const ConnectorOAuthStartResponseSchema = z.object({
  connectorId: z.string(),
  authorizeUrl: z.string().min(1).optional(),
  appReturn: z.boolean().optional(),
  status: z.enum(CONNECTOR_OAUTH_START_STATUSES).optional(),
  addedScopes: z.array(z.string()).optional(),
  connectorName: z.string().optional(),
  documentationUrl: z.string().nullable().optional(),
  settingsHref: z.string().optional(),
  credentialsPath: z.string().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});
export type ConnectorOAuthStartResponse = z.infer<typeof ConnectorOAuthStartResponseSchema>;

export const ConnectorOAuthCompleteRequestSchema = z.object({
  state: z.string().regex(/^[a-f0-9]{64}$/),
  code: z.string().min(1).max(2048).optional(),
  iss: z.string().max(2048).optional(),
  error: z.string().max(64).optional(),
});
export type ConnectorOAuthCompleteRequest = z.infer<typeof ConnectorOAuthCompleteRequestSchema>;

export const ConnectorOAuthCompleteResponseSchema = z.object({
  connectorId: z.string(),
  status: z.enum(CONNECTOR_OAUTH_CALLBACK_STATUSES),
});
export type ConnectorOAuthCompleteResponse = z.infer<typeof ConnectorOAuthCompleteResponseSchema>;

export const CONNECTOR_ACCOUNT_SCOPES = ['personal', 'work', 'service'] as const;
export type ConnectorAccountScope = (typeof CONNECTOR_ACCOUNT_SCOPES)[number];

export const ConnectorAccountSchema = z.object({
  connectorId: z.string(),
  accountKey: z.string(),
  accountLabel: z.string().nullable(),
  scope: z.enum(CONNECTOR_ACCOUNT_SCOPES),
  isDefault: z.boolean(),
  grantedScopes: z.array(z.string()),
  connectedAt: z.string(),
  updatedAt: z.string(),
  needsReauthorization: z.boolean(),
});
export type ConnectorAccount = z.infer<typeof ConnectorAccountSchema>;

export const ListConnectorAccountsResponseSchema = z.object({
  connectorId: z.string(),
  accounts: z.array(ConnectorAccountSchema),
});
export type ListConnectorAccountsResponse = z.infer<typeof ListConnectorAccountsResponseSchema>;

export const CONNECTOR_CALL_OUTCOMES = ['succeeded', 'failed', 'blocked'] as const;
export type ConnectorCallOutcome = (typeof CONNECTOR_CALL_OUTCOMES)[number];

export const ConnectorCallEntrySchema = z.object({
  connectorId: z.string(),
  toolName: z.string(),
  outcome: z.enum(CONNECTOR_CALL_OUTCOMES),
  durationMs: z.number().nullable(),
  occurredAt: z.string(),
});
export type ConnectorCallEntry = z.infer<typeof ConnectorCallEntrySchema>;

export const ConnectorCallLogResponseSchema = z.object({
  calls: z.array(ConnectorCallEntrySchema),
});
export type ConnectorCallLogResponse = z.infer<typeof ConnectorCallLogResponseSchema>;

export const CONNECTOR_CALL_HEALTH_STATES = [
  'responding',
  'degraded',
  'not-responding',
  'unknown',
] as const;
export type ConnectorCallHealthState = (typeof CONNECTOR_CALL_HEALTH_STATES)[number];

export const CONNECTOR_CIRCUIT_STATES = ['closed', 'half-open', 'open'] as const;
export type ConnectorCircuitState = (typeof CONNECTOR_CIRCUIT_STATES)[number];

export const ConnectorCallHealthSchema = z.object({
  connectorId: z.string(),
  state: z.enum(CONNECTOR_CALL_HEALTH_STATES),
  calls: z.number(),
  meteredCalls: z.number(),
  failures: z.number(),
  blocked: z.number(),
  failureRatio: z.number(),
  consecutiveFailures: z.number(),
  p50LatencyMs: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  lastOutcome: z.enum(CONNECTOR_CALL_OUTCOMES).nullable(),
  lastCallAt: z.string().nullable(),
  circuit: z.enum(CONNECTOR_CIRCUIT_STATES),
  retryAfterMs: z.number(),
});
export type ConnectorCallHealth = z.infer<typeof ConnectorCallHealthSchema>;

export const ConnectorHealthResponseSchema = z.object({
  connectors: z.array(ConnectorCallHealthSchema),
});
export type ConnectorHealthResponse = z.infer<typeof ConnectorHealthResponseSchema>;

export const CONNECTOR_CREDENTIAL_PLACEMENTS = ['header', 'body', 'query'] as const;
export type ConnectorCredentialPlacement = (typeof CONNECTOR_CREDENTIAL_PLACEMENTS)[number];

export const CONNECTOR_CREDENTIAL_SPEC_SOURCES = [
  'registry',
  'discovery',
  'challenge',
  'default',
] as const;
export type ConnectorCredentialSpecSource = (typeof CONNECTOR_CREDENTIAL_SPEC_SOURCES)[number];

export const CONNECTOR_API_KEY_MAX_LENGTH = 4096;

export const ConnectorCredentialSpecSchema = z.object({
  headerName: z.string(),
  valuePrefix: z.string(),
  placement: z.enum(CONNECTOR_CREDENTIAL_PLACEMENTS),
  source: z.enum(CONNECTOR_CREDENTIAL_SPEC_SOURCES),
  description: z.string().nullable(),
});
export type ConnectorCredentialSpec = z.infer<typeof ConnectorCredentialSpecSchema>;

export const ConnectorCredentialStatusResponseSchema = ConnectorCredentialSpecSchema.extend({
  connectorId: z.string(),
  name: z.string(),
  documentationUrl: z.string().nullable(),
  connected: z.boolean(),
});
export type ConnectorCredentialStatusResponse = z.infer<
  typeof ConnectorCredentialStatusResponseSchema
>;

export const SaveConnectorCredentialRequestSchema = z.object({
  apiKey: z.string().trim().min(1).max(CONNECTOR_API_KEY_MAX_LENGTH),
});
export type SaveConnectorCredentialRequest = z.infer<typeof SaveConnectorCredentialRequestSchema>;

export const CredentialConnectorSchema = z.object({
  id: z.string().min(1),
  connectorId: z.string().min(1),
  toolConnectorId: z.string().min(1),
  directoryId: z.string().min(1),
  name: z.string(),
  url: z.string(),
  transport: z.enum(CUSTOM_CONNECTOR_TRANSPORTS),
  source: z.literal('custom'),
  connectedAt: z.string(),
  updatedAt: z.string(),
});
export type CredentialConnector = z.infer<typeof CredentialConnectorSchema>;

export const SaveConnectorCredentialResponseSchema = ConnectorCredentialSpecSchema.extend({
  connector: CredentialConnectorSchema,
  toolCount: z.number().int().nonnegative(),
  toolNames: z.array(z.string()),
  capabilityCounts: ConnectorCapabilityCountsSchema,
  protocolEra: z.enum(MCP_PROTOCOL_ERAS),
});
export type SaveConnectorCredentialResponse = z.infer<typeof SaveConnectorCredentialResponseSchema>;

export const GoogleDrivePickerResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    accessToken: z.string().min(1),
    developerKey: z.string().min(1),
    appId: z.string().min(1),
  }),
  z.object({ status: z.literal('not-configured') }),
  z.object({ status: z.literal('not-connected') }),
  z.object({ status: z.literal('reconnect-required') }),
]);
export type GoogleDrivePickerResponse = z.infer<typeof GoogleDrivePickerResponseSchema>;

export const CONNECTOR_MCP_OPERATION_MAX_BYTES = 128_000;

const McpInputResponsesSchema = z.record(z.string(), z.unknown());
const McpRequestStateSchema = z.string().max(16_384);
const McpTaskIdSchema = z.string().min(1).max(512);

export const ConnectorMcpOperationRequestSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('callTool'),
      name: z.string().min(1).max(128),
      arguments: z.record(z.string(), z.unknown()).default({}),
      approved: z.boolean().optional().default(false),
      inputResponses: McpInputResponsesSchema.optional(),
      requestState: McpRequestStateSchema.optional(),
    })
    .strict(),
  z.object({ operation: z.literal('readResource'), uri: z.string().min(1).max(4_096) }).strict(),
  z
    .object({
      operation: z.literal('getPrompt'),
      name: z.string().min(1).max(128),
      arguments: z.record(z.string(), z.string().max(8_192)).optional(),
      inputResponses: McpInputResponsesSchema.optional(),
      requestState: McpRequestStateSchema.optional(),
    })
    .strict(),
  z.object({ operation: z.literal('taskGet'), taskId: McpTaskIdSchema }).strict(),
  z
    .object({
      operation: z.literal('taskUpdate'),
      taskId: McpTaskIdSchema,
      inputResponses: McpInputResponsesSchema,
    })
    .strict(),
  z.object({ operation: z.literal('taskCancel'), taskId: McpTaskIdSchema }).strict(),
]);
export type ConnectorMcpOperationRequest = z.input<typeof ConnectorMcpOperationRequestSchema>;

export const ConnectorMcpOperationResponseSchema = z.object({
  connectorId: z.string(),
  approvalRequired: z.boolean().optional(),
  result: z.unknown().optional(),
});
export type ConnectorMcpOperationResponse = z.infer<typeof ConnectorMcpOperationResponseSchema>;

export const CONNECTOR_TOOL_CATEGORIES = ['read_only', 'write'] as const;
export type ConnectorToolCategory = (typeof CONNECTOR_TOOL_CATEGORIES)[number];

const CATEGORY_TOOL_NAME_PREFIX = '*';

export function connectorCategoryToolName(category: ConnectorToolCategory): string {
  return `${CATEGORY_TOOL_NAME_PREFIX}${category}`;
}

export function isConnectorCategoryToolName(toolName: string): boolean {
  return toolName.startsWith(CATEGORY_TOOL_NAME_PREFIX);
}

export const CONNECTOR_TOOL_PERMISSIONS_MAX_TOOLS_PER_WRITE = 200;

const PermissionNameSchema = z.string().min(1).max(200);

export const ConnectorToolPermissionSchema = z.object({
  connectorId: z.string().min(1),
  toolName: z.string().min(1),
  level: z.enum(CONNECTOR_TOOL_PERMISSION_LEVELS),
});
export type ConnectorToolPermission = z.infer<typeof ConnectorToolPermissionSchema>;

export const ListConnectorToolPermissionsResponseSchema = z.object({
  permissions: z.array(ConnectorToolPermissionSchema),
});
export type ListConnectorToolPermissionsResponse = z.infer<
  typeof ListConnectorToolPermissionsResponseSchema
>;

export const UpsertConnectorToolPermissionRequestSchema = z
  .object({
    connectorId: PermissionNameSchema,
    toolName: PermissionNameSchema.optional(),
    toolNames: z
      .array(PermissionNameSchema)
      .min(1)
      .max(CONNECTOR_TOOL_PERMISSIONS_MAX_TOOLS_PER_WRITE)
      .optional(),
    category: z.enum(CONNECTOR_TOOL_CATEGORIES).optional(),
    level: z.enum(CONNECTOR_TOOL_PERMISSION_LEVELS),
    destructive: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.category === undefined
        ? (body.toolName === undefined) !== (body.toolNames === undefined)
        : body.toolName === undefined,
    {
      message: 'Name exactly one of toolName or toolNames, or a category with optional toolNames.',
    },
  )
  .refine(
    (body) =>
      [body.toolName, ...(body.toolNames ?? [])].every(
        (name) => name === undefined || !isConnectorCategoryToolName(name),
      ),
    { message: 'Category entries are written through category, not as a tool name.' },
  );
export type UpsertConnectorToolPermissionRequest = z.infer<
  typeof UpsertConnectorToolPermissionRequestSchema
>;

export const UpsertConnectorToolPermissionResponseSchema = z.object({
  success: z.boolean(),
  destructive: z.boolean(),
});
export type UpsertConnectorToolPermissionResponse = z.infer<
  typeof UpsertConnectorToolPermissionResponseSchema
>;

export const DeleteConnectorToolPermissionsResponseSchema = z.object({
  success: z.boolean(),
  removed: z.number().int().nonnegative(),
});
export type DeleteConnectorToolPermissionsResponse = z.infer<
  typeof DeleteConnectorToolPermissionsResponseSchema
>;

export const CONNECTOR_POLICY_PATH = '/api/settings/organization/connector-policy';
export const CONNECTOR_POLICY_LIST_LIMIT = 512;
export const CONNECTOR_POLICY_PLUGIN_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
export const CONNECTOR_POLICY_MCP_HOST_PATTERN =
  /^(\*\.)?(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

const WEB_DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function normalizeWebDomain(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value.includes('://')) {
    try {
      value = new URL(value).hostname;
    } catch {
      return null;
    }
  }
  if (/[\n\r\u2028\u2029]/.test(value)) return null;
  value = value.replace(/^\*\./, '').replace(/^\./, '');
  const pathStart = value.indexOf('/');
  if (pathStart !== -1) value = value.slice(0, pathStart);
  value = value.replace(/:\d+$/, '');
  if (value.startsWith('www.')) value = value.slice(4);
  return WEB_DOMAIN_PATTERN.test(value) ? value : null;
}

/** A workspace's website rules: when `allow` is non-empty, nothing else may be read. */
export interface WebDomainRules {
  readonly allow: readonly string[];
  readonly deny: readonly string[];
}

/** The hostname a rule is compared with: lower case, no `www.`, no trailing dot. */
export function webHostnameOf(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.+$/, '');
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  } catch {
    return null;
  }
}

/**
 * Whether the rules let the assistant read this URL. A rule covers its
 * subdomains and a block beats an allow. A URL that will not parse is refused
 * only when an allow list is in force. Every surface that opens a page, the
 * gateway's fetch and search and the desktop's paired browser, asks this.
 */
export function webDomainAllowed(rules: WebDomainRules | null | undefined, url: string): boolean {
  if (!rules) return true;
  const hostname = webHostnameOf(url);
  if (!hostname) return rules.allow.length === 0;
  const matches = (rule: string) => hostname === rule || hostname.endsWith(`.${rule}`);
  if (rules.deny.some(matches)) return false;
  if (rules.allow.length === 0) return true;
  return rules.allow.some(matches);
}

const WORKSPACE_MEMBER_ROLES = [
  'owner',
  'admin',
  'member',
  'viewer',
] as const satisfies readonly OrganizationRole[];

export const WorkspaceConnectorToolRuleSchema = z
  .object({
    connectorId: z.string().trim().min(1).max(200),
    toolName: z.string().trim().min(1).max(200),
    level: z.enum(CONNECTOR_TOOL_PERMISSION_LEVELS),
  })
  .strict();
export type WorkspaceConnectorToolRule = z.infer<typeof WorkspaceConnectorToolRuleSchema>;

export const ConnectorPolicyListsSchema = z.object({
  allowedConnectors: z.array(z.string()),
  blockedConnectors: z.array(z.string()),
  allowCustomConnectors: z.boolean(),
  allowedPlugins: z.array(z.string()),
  blockedPlugins: z.array(z.string()),
  allowedMcpHosts: z.array(z.string()),
  allowedWebDomains: z.array(z.string()),
  blockedWebDomains: z.array(z.string()),
  toolRules: z.array(WorkspaceConnectorToolRuleSchema).default([]),
});
export type ConnectorPolicyLists = z.infer<typeof ConnectorPolicyListsSchema>;

export const ConnectorPolicyResponseSchema = z.object({
  organizationId: z.string(),
  configured: z.boolean(),
  canManagePolicy: z.boolean(),
  currentUserRole: z.enum(WORKSPACE_MEMBER_ROLES),
  policy: ConnectorPolicyListsSchema.extend({ updatedAt: z.string().nullable() }),
  catalog: z.array(z.string()),
});
export type ConnectorPolicyResponse = z.infer<typeof ConnectorPolicyResponseSchema>;

const ConnectorPolicyIdListSchema = z
  .array(z.string().min(1).max(200))
  .max(CONNECTOR_POLICY_LIST_LIMIT);
const PluginKeyListSchema = z
  .array(z.string().trim().regex(CONNECTOR_POLICY_PLUGIN_KEY_PATTERN))
  .max(CONNECTOR_POLICY_LIST_LIMIT);
const WebDomainListSchema = z
  .array(
    z
      .string()
      .max(2048)
      .refine((value) => normalizeWebDomain(value) !== null, {
        message: 'Each site must be a domain such as example.com.',
      }),
  )
  .max(CONNECTOR_POLICY_LIST_LIMIT);

export const UpdateConnectorPolicyRequestSchema = z
  .object({
    allowedConnectors: ConnectorPolicyIdListSchema,
    blockedConnectors: ConnectorPolicyIdListSchema,
    allowCustomConnectors: z.boolean(),
    allowedPlugins: PluginKeyListSchema,
    blockedPlugins: PluginKeyListSchema,
    allowedMcpHosts: z
      .array(z.string().trim().regex(CONNECTOR_POLICY_MCP_HOST_PATTERN))
      .max(CONNECTOR_POLICY_LIST_LIMIT),
    allowedWebDomains: WebDomainListSchema,
    blockedWebDomains: WebDomainListSchema,
    toolRules: z
      .array(WorkspaceConnectorToolRuleSchema)
      .max(CONNECTOR_POLICY_LIST_LIMIT)
      .optional(),
  })
  .strict();
export type UpdateConnectorPolicyRequest = z.infer<typeof UpdateConnectorPolicyRequestSchema>;

export const MCP_CLIENT_METADATA_PATH = '/.well-known/oauth-client-metadata';
