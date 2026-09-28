import { z } from 'zod';

import { MCP_PROTOCOL_ERAS } from './connectors';

export const CONNECTOR_CAPABILITY_SOURCES = [
  'github-adapter',
  'operator',
  'oauth',
  'custom',
  'organization',
] as const;
export type ConnectorCapabilitySource = (typeof CONNECTOR_CAPABILITY_SOURCES)[number];

export const MCP_SERVER_TRANSPORTS = ['stdio', 'sse', 'streamable-http'] as const;
export const MCP_TOOL_VISIBILITIES = ['model', 'app', 'both'] as const;
export const MCP_TOOL_REJECTION_REASONS = ['non-canonical-name', 'invalid-input-schema'] as const;
export const MCP_DISCOVERY_CAPABILITIES = [
  'tools',
  'resources',
  'resourceTemplates',
  'prompts',
] as const;

const CatalogItemSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});

export const ConnectorToolParameterSchema = z.object({
  name: z.string(),
  required: z.boolean(),
  type: z.string().optional(),
  description: z.string().optional(),
});
export type ConnectorToolParameter = z.infer<typeof ConnectorToolParameterSchema>;

export const ConnectorCapabilityCatalogSchema = z.object({
  connectorId: z.string(),
  connectorLabel: z.string(),
  source: z.enum(CONNECTOR_CAPABILITY_SOURCES),
  generatedAt: z.number(),
  protocolEra: z.enum(MCP_PROTOCOL_ERAS),
  protocolVersion: z.string().optional(),
  supportedVersions: z.array(z.string()).default([]),
  transport: z.enum(MCP_SERVER_TRANSPORTS).optional(),
  serverInfo: z.object({ name: z.string(), version: z.string() }).optional(),
  capabilityKeys: z.array(z.string()),
  tasksSupported: z.boolean(),
  rejectedTools: z
    .array(
      z.object({
        toolName: z.string().optional(),
        reason: z.enum(MCP_TOOL_REJECTION_REASONS),
        detail: z.string().optional(),
      }),
    )
    .default([]),
  tools: z.array(
    CatalogItemSchema.extend({
      parameters: z.array(ConnectorToolParameterSchema).default([]),
      visibility: z.enum(MCP_TOOL_VISIBILITIES),
      hasApp: z.boolean(),
      readOnly: z.boolean().default(false),
    }),
  ),
  resources: z.array(
    CatalogItemSchema.extend({
      uri: z.string(),
      mimeType: z.string().optional(),
      size: z.number().optional(),
      isApp: z.boolean(),
    }),
  ),
  resourceTemplates: z.array(
    CatalogItemSchema.extend({ uriTemplate: z.string(), mimeType: z.string().optional() }),
  ),
  prompts: z.array(
    CatalogItemSchema.extend({
      arguments: z.array(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          required: z.boolean().optional(),
        }),
      ),
    }),
  ),
  apps: z.array(
    z.object({
      serverName: z.string(),
      toolName: z.string(),
      resourceUri: z.string(),
      visibility: z.enum(MCP_TOOL_VISIBILITIES),
    }),
  ),
  discoveryErrors: z.array(
    z.object({
      capability: z.enum(MCP_DISCOVERY_CAPABILITIES),
      message: z.string(),
    }),
  ),
});
export type ConnectorCapabilityCatalog = z.infer<typeof ConnectorCapabilityCatalogSchema>;
