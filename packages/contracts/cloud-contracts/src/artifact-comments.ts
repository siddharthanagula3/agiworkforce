import { z } from 'zod';

export const MAX_ARTIFACT_COMMENT_CHARS = 4_000;
const MAX_QUOTE_CHARS = 2_000;
const MAX_CONTEXT_CHARS = 400;

export const ArtifactCommentPathIdSchema = z.string().uuid();

export const ArtifactCommentAnchorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    quote: z.string().min(1).max(MAX_QUOTE_CHARS),
    prefix: z.string().max(MAX_CONTEXT_CHARS).default(''),
    suffix: z.string().max(MAX_CONTEXT_CHARS).default(''),
    slide: z.number().int().min(0).max(999).optional(),
  }),
  z.object({
    kind: z.literal('slide'),
    slide: z.number().int().min(0).max(999),
  }),
  z.object({
    kind: z.literal('element'),
    selector: z.string().min(1).max(1_000),
    text: z.string().max(MAX_QUOTE_CHARS).default(''),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
  }),
  z.object({ kind: z.literal('artifact') }),
]);
export type ArtifactCommentAnchor = z.input<typeof ArtifactCommentAnchorSchema>;

export const ArtifactCommentCreateRequestSchema = z.object({
  body: z.string().trim().min(1).max(MAX_ARTIFACT_COMMENT_CHARS),
  anchor: ArtifactCommentAnchorSchema.default({ kind: 'artifact' }),
  parentId: z.string().uuid().nullable().optional(),
  author: z.enum(['user', 'assistant']).default('user'),
});
export type ArtifactCommentCreateRequest = z.input<typeof ArtifactCommentCreateRequestSchema>;

export const ArtifactCommentUpdateRequestSchema = z
  .object({
    body: z.string().trim().min(1).max(MAX_ARTIFACT_COMMENT_CHARS).optional(),
    resolved: z.boolean().optional(),
  })
  .refine((value) => value.body !== undefined || value.resolved !== undefined, {
    message: 'Nothing to change',
  });
export type ArtifactCommentUpdateRequest = z.input<typeof ArtifactCommentUpdateRequestSchema>;

export interface ArtifactComment {
  id: string;
  artifactId: string;
  parentId: string | null;
  anchor: ArtifactCommentAnchor;
  body: string;
  author: 'user' | 'assistant';
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactCommentListResponse {
  comments: ArtifactComment[];
}

export interface ArtifactCommentResponse {
  comment: ArtifactComment;
}

export function canCommentOnArtifact(artifactId: string): boolean {
  return ArtifactCommentPathIdSchema.safeParse(artifactId).success;
}

export function artifactCommentsPath(artifactId: string): string {
  return `/api/artifacts/${encodeURIComponent(artifactId)}/comments`;
}

export function artifactCommentPath(artifactId: string, commentId: string): string {
  return `${artifactCommentsPath(artifactId)}/${encodeURIComponent(commentId)}`;
}
