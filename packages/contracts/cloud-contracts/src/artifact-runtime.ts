import { z } from 'zod';

export const ARTIFACT_RUNTIME_MAX_PROMPT_CHARS = 100_000;
export const ARTIFACT_RUNTIME_MAX_CONNECTORS = 10;
export const ARTIFACT_RUNTIME_CONNECTOR_ID_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
export const ARTIFACT_STORAGE_KEY_PATTERN = /^[^\s/\\'"]{1,200}$/u;
export const ARTIFACT_STORAGE_PREFIX_MAX_CHARS = 200;

export function artifactRuntimeCompletePath(token: string): string {
  return `/api/artifacts/runtime/${encodeURIComponent(token)}/complete`;
}

export function artifactRuntimeStoragePath(token: string): string {
  return `/api/artifacts/runtime/${encodeURIComponent(token)}/storage`;
}

export const ArtifactRuntimeCompleteRequestSchema = z.object({
  prompt: z.string().min(1).max(ARTIFACT_RUNTIME_MAX_PROMPT_CHARS),
  connectors: z
    .array(z.string().regex(ARTIFACT_RUNTIME_CONNECTOR_ID_PATTERN))
    .max(ARTIFACT_RUNTIME_MAX_CONNECTORS)
    .default([]),
});
export type ArtifactRuntimeCompleteRequest = z.input<typeof ArtifactRuntimeCompleteRequestSchema>;

export const ArtifactRuntimeCompleteResponseSchema = z.object({ text: z.string() });
export type ArtifactRuntimeCompleteResponse = z.infer<typeof ArtifactRuntimeCompleteResponseSchema>;

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
