import { z } from 'zod';
import {
  ARTIFACT_RUNTIME_CONNECTOR_ID_PATTERN,
  ARTIFACT_RUNTIME_MAX_ALLOWED_TOOLS,
  ARTIFACT_RUNTIME_MAX_CONNECTORS,
  ARTIFACT_RUNTIME_TOOL_NAME_MAX_CHARS,
} from '@agiworkforce/cloud-contracts';

export const LIVE_ARTIFACTS_PAGE_PATH = '/chat/live-artifacts';
export const LIVE_ARTIFACTS_API_PATH = '/api/artifacts/live';
export const LIVE_ARTIFACT_CONNECTORS_PARAM = 'connector';

export const LIVE_ARTIFACT_REFRESH_POLICIES = ['on_open', 'manual'] as const;
export type LiveArtifactRefreshPolicy = (typeof LIVE_ARTIFACT_REFRESH_POLICIES)[number];

export const LIVE_ARTIFACT_READINESS = ['ready', 'needs_connection'] as const;
export type LiveArtifactReadiness = (typeof LIVE_ARTIFACT_READINESS)[number];

export const LiveArtifactIdSchema = z.string().uuid();

const ConnectorIdsSchema = z
  .array(z.string().regex(ARTIFACT_RUNTIME_CONNECTOR_ID_PATTERN))
  .min(1)
  .max(ARTIFACT_RUNTIME_MAX_CONNECTORS);

const AllowedToolsSchema = z
  .array(z.string().min(1).max(ARTIFACT_RUNTIME_TOOL_NAME_MAX_CHARS))
  .max(ARTIFACT_RUNTIME_MAX_ALLOWED_TOOLS);

const RefreshPolicySchema = z.enum(LIVE_ARTIFACT_REFRESH_POLICIES);

export const LiveArtifactBindingRequestSchema = z
  .object({
    connectors: ConnectorIdsSchema,
    allowedTools: AllowedToolsSchema,
    refreshPolicy: RefreshPolicySchema.optional(),
  })
  .strict();
export type LiveArtifactBindingRequest = z.infer<typeof LiveArtifactBindingRequestSchema>;

export const LiveArtifactPolicyRequestSchema = z
  .object({ refreshPolicy: RefreshPolicySchema })
  .strict();
export type LiveArtifactPolicyRequest = z.infer<typeof LiveArtifactPolicyRequestSchema>;

export const LiveArtifactSchema = z.object({
  artifactId: z.string(),
  conversationId: z.string(),
  title: z.string().nullable(),
  type: z.string(),
  connectors: z.array(z.string()),
  allowedTools: z.array(z.string()),
  refreshPolicy: RefreshPolicySchema,
  lastRefreshedAt: z.string().nullable(),
  readiness: z.enum(LIVE_ARTIFACT_READINESS),
  missingConnectors: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LiveArtifact = z.infer<typeof LiveArtifactSchema>;

export const LiveArtifactListResponseSchema = z.object({ artifacts: z.array(LiveArtifactSchema) });
export type LiveArtifactListResponse = z.infer<typeof LiveArtifactListResponseSchema>;

export const LiveArtifactResponseSchema = z.object({ artifact: LiveArtifactSchema.nullable() });
export type LiveArtifactResponse = z.infer<typeof LiveArtifactResponseSchema>;

export function liveArtifactPath(artifactId: string): string {
  return `${LIVE_ARTIFACTS_API_PATH}/${encodeURIComponent(artifactId)}`;
}

export function liveArtifactRuntimeCompletePath(artifactId: string): string {
  return `/api/artifacts/runtime/live/${encodeURIComponent(artifactId)}/complete`;
}

export function liveArtifactRuntimeConnectorsPath(
  artifactId: string,
  connectors: readonly string[],
): string {
  const params = new URLSearchParams();
  for (const connector of connectors) params.append(LIVE_ARTIFACT_CONNECTORS_PARAM, connector);
  return `/api/artifacts/runtime/live/${encodeURIComponent(artifactId)}/connectors?${params.toString()}`;
}

export function liveArtifactChatHref(conversationId: string, artifactId: string): string {
  return `/chat/${encodeURIComponent(conversationId)}?artifact=${encodeURIComponent(artifactId)}`;
}

export function connectorDisplayName(id: string): string {
  return id
    .split(/[_.-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
