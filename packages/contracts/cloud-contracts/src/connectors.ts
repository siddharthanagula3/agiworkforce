import { z } from 'zod';

// The shape the connector list is written against, so a client that meets a
// newer one can say so instead of dropping rows it does not understand.
export const CONNECTOR_CONTRACT_SCHEMA_VERSION = 1;
export const CONNECTOR_CONTRACT_MIN_SCHEMA_VERSION = 1;

export const MANAGED_CLOUD_CONNECTORS_PATH = '/api/connectors';

export const CONNECTOR_SOURCES = ['user', 'github-app', 'custom', 'oauth'] as const;
export type ConnectorSource = (typeof CONNECTOR_SOURCES)[number];

/**
 * Every state `GET /api/connectors` can put on a row. Omitting one makes a
 * validating consumer reject the whole list over a single connector.
 */
export const CONNECTOR_HEALTH_STATES = [
  'connected',
  'connectable',
  'needs-reauthorization',
  'not-responding',
  'not-configured',
  'unsupported-here',
] as const;
export type ConnectorHealthState = (typeof CONNECTOR_HEALTH_STATES)[number];

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

export const ConnectSuccessResponseSchema = z.object({
  connector: ConnectorConnectionSchema,
});
export type ConnectSuccessResponse = z.infer<typeof ConnectSuccessResponseSchema>;

export const ConnectConflictResponseSchema = z.object({
  error: z.string(),
  connectorId: z.string(),
  installStartPath: z.string().optional(),
  authType: z.string().optional(),
});
export type ConnectConflictResponse = z.infer<typeof ConnectConflictResponseSchema>;

export const DisconnectResponseSchema = z.object({
  success: z.boolean(),
});
export type DisconnectResponse = z.infer<typeof DisconnectResponseSchema>;

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

export const ListCustomConnectorsResponseSchema = z.object({
  connectors: z.array(CustomConnectorSchema),
});
export type ListCustomConnectorsResponse = z.infer<typeof ListCustomConnectorsResponseSchema>;

export const CreateCustomConnectorRequestSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().min(1),
  transport: z.enum(CUSTOM_CONNECTOR_TRANSPORTS).optional(),
  authToken: z.string().max(4096).optional(),
});
export type CreateCustomConnectorRequest = z.infer<typeof CreateCustomConnectorRequestSchema>;

export const CreateCustomConnectorResponseSchema = z.object({
  connector: CustomConnectorSchema,
  toolCount: z.number().int().nonnegative(),
});
export type CreateCustomConnectorResponse = z.infer<typeof CreateCustomConnectorResponseSchema>;

export const DeleteCustomConnectorResponseSchema = DisconnectResponseSchema;
export type DeleteCustomConnectorResponse = DisconnectResponse;

export const CONNECTOR_OAUTH_START_PATH = '/api/connectors/oauth/start';

export const CONNECTOR_OAUTH_CALLBACK_PATH = '/api/connectors/oauth/callback';

export const MCP_CLIENT_METADATA_PATH = '/.well-known/oauth-client-metadata';
