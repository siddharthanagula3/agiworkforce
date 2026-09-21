import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';
import { withFailureReference } from '@/services/failureCopy';

export interface PublishArtifactInput {
  artifactId: string;
  title: string;
  kind: string;
  language?: string;
  content: string;
}

export async function publishArtifact(input: PublishArtifactInput): Promise<string> {
  const response = await api.post<{ shareUrl?: unknown }>('/api/artifacts/publish', {
    artifactId: input.artifactId,
    title: input.title,
    kind: input.kind,
    ...(input.language ? { language: input.language } : {}),
    content: input.content,
  });

  const shareUrl = typeof response.shareUrl === 'string' ? response.shareUrl.trim() : '';
  if (!shareUrl) throw new Error('The publish endpoint returned no share URL.');
  return shareUrl;
}

export const PUBLISH_FAILED_MESSAGE =
  'This artifact could not be published right now. Nothing was shared. Try again in a moment.';

/**
 * Only a sentence the server wrote for a reader is shown as it is. Anything
 * else (a dropped connection, a malformed reply) is this app's own wording.
 */
export function publishFailureMessage(error: unknown): string {
  if (error instanceof ApiHttpError) return withFailureReference(error.message, error.requestId);
  return PUBLISH_FAILED_MESSAGE;
}
