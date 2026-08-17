import { api } from '@/services/api';

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
