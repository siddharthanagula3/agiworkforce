import { z } from 'zod';

export const MANAGED_CLOUD_PROJECT_KNOWLEDGE_PRESIGN_PATH = '/api/uploads/presign';

export function managedCloudProjectKnowledgePath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/knowledge-files`;
}

export function managedCloudProjectKnowledgeFilePath(projectId: string, fileId: string): string {
  return `${managedCloudProjectKnowledgePath(projectId)}/${encodeURIComponent(fileId)}`;
}

export const ManagedCloudProjectKnowledgePresignRequestSchema = z.object({
  kind: z.literal('knowledge-file'),
  projectId: z.string().min(1).max(200),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  byteCount: z.number().int().positive(),
});

export const ManagedCloudProjectKnowledgePresignResponseSchema = z.object({
  uploadUrl: z.string().url(),
  uploadMethod: z.literal('PUT'),
  uploadHeaders: z.record(z.string(), z.string()),
  storageKey: z.string().min(1),
  publicUrl: z.string().url().optional(),
});

export const ManagedCloudProjectKnowledgeFileSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  byteCount: z.number().int().positive(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  summary: z.string().nullable().optional(),
  sourceSurface: z.enum(['web', 'desktop', 'mobile']),
  addedByUserId: z.string().nullable(),
  addedAt: z.string().min(1),
  retentionExpiresAt: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
  storageUri: z.string().min(1),
});

export const ManagedCloudProjectKnowledgeListResponseSchema = z.object({
  files: z.array(ManagedCloudProjectKnowledgeFileSchema),
});

export const ManagedCloudProjectKnowledgeRegisterRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  byteCount: z.number().int().positive(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  sourceSurface: z.enum(['web', 'desktop', 'mobile']),
  storageUri: z.string().min(1),
});

export const ManagedCloudProjectKnowledgeRegisterResponseSchema = z.object({
  file: ManagedCloudProjectKnowledgeFileSchema,
});

export const ManagedCloudProjectKnowledgeDeleteResponseSchema = z.object({
  success: z.literal(true),
});

export type ManagedCloudProjectKnowledgeFile = z.infer<
  typeof ManagedCloudProjectKnowledgeFileSchema
>;
