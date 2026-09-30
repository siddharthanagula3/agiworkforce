import { z } from 'zod';

export const ARTIFACT_RUNTIME_MAX_PROMPT_CHARS = 100_000;
export const ARTIFACT_RUNTIME_MAX_CONNECTORS = 10;
export const ARTIFACT_RUNTIME_CONNECTOR_ID_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
export const ARTIFACT_RUNTIME_MAX_ALLOWED_TOOLS = 200;
export const ARTIFACT_RUNTIME_TOOL_NAME_MAX_CHARS = 200;
export const ARTIFACT_STORAGE_KEY_PATTERN = /^[^\s/\\'"]{1,200}$/u;
export const ARTIFACT_STORAGE_PREFIX_MAX_CHARS = 200;
export const ARTIFACT_STORAGE_VALUE_LIMIT_BYTES = 4 * 1024 * 1024;
export const ARTIFACT_RUNTIME_BODY_CEILING_BYTES =
  2 * ARTIFACT_STORAGE_VALUE_LIMIT_BYTES + 64 * 1024;

export function artifactRuntimeCompletePath(token: string): string {
  return `/api/artifacts/runtime/${encodeURIComponent(token)}/complete`;
}

export function artifactRuntimeStoragePath(token: string): string {
  return `/api/artifacts/runtime/${encodeURIComponent(token)}/storage`;
}

export function artifactRuntimeConnectorsPath(token: string): string {
  return `/api/artifacts/runtime/${encodeURIComponent(token)}/connectors`;
}

const ArtifactRuntimeConnectorIdsSchema = z
  .array(z.string().regex(ARTIFACT_RUNTIME_CONNECTOR_ID_PATTERN))
  .max(ARTIFACT_RUNTIME_MAX_CONNECTORS);

export const ArtifactRuntimeCompleteRequestSchema = z.object({
  prompt: z.string().min(1).max(ARTIFACT_RUNTIME_MAX_PROMPT_CHARS),
  connectors: ArtifactRuntimeConnectorIdsSchema.default([]),
  allowedTools: z
    .array(z.string().min(1).max(ARTIFACT_RUNTIME_TOOL_NAME_MAX_CHARS))
    .max(ARTIFACT_RUNTIME_MAX_ALLOWED_TOOLS)
    .default([]),
});
export type ArtifactRuntimeCompleteRequest = z.input<typeof ArtifactRuntimeCompleteRequestSchema>;

export const ArtifactRuntimeCompleteResponseSchema = z.object({ text: z.string() });
export type ArtifactRuntimeCompleteResponse = z.infer<typeof ArtifactRuntimeCompleteResponseSchema>;

export const ArtifactRuntimeConnectorsRequestSchema = z.object({
  connectors: ArtifactRuntimeConnectorIdsSchema.min(1),
});
export type ArtifactRuntimeConnectorsRequest = z.infer<
  typeof ArtifactRuntimeConnectorsRequestSchema
>;

export const ARTIFACT_RUNTIME_TOOL_UNAVAILABLE_REASONS = ['needs_approval', 'blocked'] as const;

export const ArtifactRuntimeConnectorToolSchema = z.object({
  name: z.string().min(1),
  label: z.string(),
  description: z.string(),
  available: z.boolean(),
  unavailableReason: z.enum(ARTIFACT_RUNTIME_TOOL_UNAVAILABLE_REASONS).nullable(),
});
export type ArtifactRuntimeConnectorTool = z.infer<typeof ArtifactRuntimeConnectorToolSchema>;

export const ArtifactRuntimeConnectorSchema = z.object({
  id: z.string().regex(ARTIFACT_RUNTIME_CONNECTOR_ID_PATTERN),
  label: z.string(),
  connected: z.boolean(),
  tools: z.array(ArtifactRuntimeConnectorToolSchema),
});
export type ArtifactRuntimeConnector = z.infer<typeof ArtifactRuntimeConnectorSchema>;

export const ArtifactRuntimeConnectorsResponseSchema = z.object({
  connectors: z.array(ArtifactRuntimeConnectorSchema),
});
export type ArtifactRuntimeConnectorsResponse = z.infer<
  typeof ArtifactRuntimeConnectorsResponseSchema
>;

const ArtifactStorageKeySchema = z.string().regex(ARTIFACT_STORAGE_KEY_PATTERN);

export const ArtifactStorageRequestSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('get'),
    key: ArtifactStorageKeySchema,
    shared: z.boolean().default(false),
  }),
  z.object({
    op: z.literal('set'),
    key: ArtifactStorageKeySchema,
    value: z.string(),
    shared: z.boolean().default(false),
  }),
  z.object({
    op: z.literal('delete'),
    key: ArtifactStorageKeySchema,
    shared: z.boolean().default(false),
  }),
  z.object({
    op: z.literal('list'),
    prefix: z.string().max(ARTIFACT_STORAGE_PREFIX_MAX_CHARS).nullable().default(null),
    shared: z.boolean().default(false),
  }),
]);
export type ArtifactStorageRequest = z.input<typeof ArtifactStorageRequestSchema>;

export const ArtifactStorageEntrySchema = z.object({
  key: z.string(),
  value: z.string(),
  shared: z.boolean(),
});
export type ArtifactStorageEntry = z.infer<typeof ArtifactStorageEntrySchema>;

export const ArtifactStorageGetResponseSchema = ArtifactStorageEntrySchema.nullable();

export const ArtifactStorageDeleteResponseSchema = z.object({
  key: z.string(),
  deleted: z.boolean(),
  shared: z.boolean(),
});
export type ArtifactStorageDeleteResponse = z.infer<typeof ArtifactStorageDeleteResponseSchema>;

export const ArtifactStorageListResponseSchema = z.object({
  keys: z.array(z.string()),
  prefix: z.string().nullable(),
  shared: z.boolean(),
});
export type ArtifactStorageListResponse = z.infer<typeof ArtifactStorageListResponseSchema>;

const STORAGE_RESPONSE_SCHEMAS = {
  get: ArtifactStorageGetResponseSchema,
  set: ArtifactStorageEntrySchema,
  delete: ArtifactStorageDeleteResponseSchema,
  list: ArtifactStorageListResponseSchema,
} as const;

export type ArtifactStorageOp = keyof typeof STORAGE_RESPONSE_SCHEMAS;

export function parseArtifactStorageResponse(
  op: ArtifactStorageOp,
  value: unknown,
): z.infer<(typeof STORAGE_RESPONSE_SCHEMAS)[ArtifactStorageOp]> | undefined {
  const parsed = STORAGE_RESPONSE_SCHEMAS[op].safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export const ArtifactRuntimeErrorResponseSchema = z.object({
  error: z.object({ code: z.string().optional(), message: z.string() }),
});
