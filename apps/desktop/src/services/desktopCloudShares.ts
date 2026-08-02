import { z } from 'zod';
import { CLOUD_API_BASE_URL } from '../api/cloudApi';
import { createManagedCloudRequestContext } from './managedCloudRequestContext';

const ShareMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  created_at: z.string().datetime(),
});

const CreateShareRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  model_id: z.string().min(1).max(200).optional(),
  provider: z.string().min(1).max(100).optional(),
  messages: z.array(ShareMessageSchema),
});

const CreateShareResponseSchema = z.object({
  shareUrl: z.string().url(),
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  messageCount: z.number().int().nonnegative(),
});

export type DesktopCloudShareMessage = z.infer<typeof ShareMessageSchema>;

export interface CreateDesktopCloudShareInput {
  title: string;
  modelId?: string;
  provider?: string;
  messages: DesktopCloudShareMessage[];
}

function shareError(body: unknown, status: number): string {
  const parsed = z
    .object({
      error: z.union([z.string(), z.object({ message: z.string().optional() })]).optional(),
      message: z.string().optional(),
    })
    .safeParse(body);
  if (!parsed.success) return `Could not create the share link (${status}).`;
  const error = parsed.data.error;
  return (
    (typeof error === 'string' ? error : error?.message) ??
    parsed.data.message ??
    `Could not create the share link (${status}).`
  );
}

/** Publish a Managed Cloud conversation without crossing the Local boundary. */
export async function createDesktopCloudShare(input: CreateDesktopCloudShareInput) {
  const request = createManagedCloudRequestContext('Managed Cloud conversation sharing');
  const payload = CreateShareRequestSchema.parse({
    title: input.title,
    ...(input.modelId ? { model_id: input.modelId } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    messages: input.messages,
  });
  const response = await request.fetch(`${CLOUD_API_BASE_URL}/api/share`, {
    method: 'POST',
    credentials: 'include',
    headers: await request.getHeaders(),
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(shareError(body, response.status));
  const result = CreateShareResponseSchema.parse(body);
  request.assertBoundary();
  return result;
}
