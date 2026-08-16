
import { z } from 'zod';

export const CONNECTOR_SOURCES = ['user', 'github-app', 'custom'] as const;
export type ConnectorSource = (typeof CONNECTOR_SOURCES)[number];

export const ConnectorConnectionSchema = z.object({
  id: z.string().min(1),
  connectorId: z.string().min(1),
  authType: z.string(),
  connectedAt: z.string(),
  updatedAt: z.string(),
  source: z.enum(CONNECTOR_SOURCES),
  name: z.string().optional(),
});
export type ConnectorConnection = z.infer<typeof ConnectorConnectionSchema>;

export const ListConnectorsResponseSchema = z.object({
  connectors: z.array(ConnectorConnectionSchema),
  available: z.array(z.string()),
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
