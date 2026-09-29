import { create } from 'zustand';
import { api } from '@/services/api';
import { captureCloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';
import { ApiHttpError } from '@/services/apiErrors';
import { withFailureReference } from '@/services/failureCopy';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

const SERVER_CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PublishArtifactInput {
  artifactId: string;
  title: string;
  kind: string;
  language?: string;
  content: string;
  conversationId?: string;
}

export async function publishArtifact(input: PublishArtifactInput): Promise<string> {
  const response = await api.post<{ shareUrl?: unknown }>('/api/artifacts/publish', {
    artifactId: input.artifactId,
    title: input.title,
    kind: input.kind,
    ...(input.language ? { language: input.language } : {}),
    content: input.content,
    ...(input.conversationId &&
    useChatAppModeStore.getState().appMode === 'cloud' &&
    SERVER_CONVERSATION_ID.test(input.conversationId)
      ? { conversationId: input.conversationId }
      : {}),
  });

  const shareUrl = typeof response.shareUrl === 'string' ? response.shareUrl.trim() : '';
  if (!shareUrl) throw new Error('The publish endpoint returned no share URL.');
  return shareUrl;
}

export type PublishedArtifactAudience = 'public' | 'organization';

export interface ArtifactPublication {
  shareUrl: string;
  visibility: PublishedArtifactAudience;
}

export interface ArtifactPublicationState {
  publication: ArtifactPublication | null;
  workspaceMemberCount: number | null;
}

function readAudience(value: unknown): PublishedArtifactAudience {
  return value === 'organization' ? 'organization' : 'public';
}

function readWorkspaceMemberCount(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const count = (value as { memberCount?: unknown }).memberCount;
  return typeof count === 'number' && Number.isFinite(count) ? count : null;
}

export function readPublishedTokenFromUrl(shareUrl: string): string | null {
  const match = /\/shared-artifact\/([A-Za-z0-9_-]{24})\/?$/.exec(shareUrl.trim());
  return match?.[1] ?? null;
}

function requirePublishedToken(shareUrl: string): string {
  const token = readPublishedTokenFromUrl(shareUrl);
  if (!token) throw new Error('That share link does not name a published artifact.');
  return token;
}

interface PublishedArtifactAudiences {
  ownerId: string | null;
  byId: Record<string, PublishedArtifactAudience>;
  record: (ownerId: string, artifactId: string, audience: PublishedArtifactAudience | null) => void;
  replace: (ownerId: string, byId: Record<string, PublishedArtifactAudience>) => void;
}

export const usePublishedArtifactAudiences = create<PublishedArtifactAudiences>()((set) => ({
  ownerId: null,
  byId: {},
  record: (ownerId, artifactId, audience) =>
    set((state) => {
      const byId = state.ownerId === ownerId ? { ...state.byId } : {};
      if (audience) byId[artifactId] = audience;
      else delete byId[artifactId];
      return { ownerId, byId };
    }),
  replace: (ownerId, byId) => set({ ownerId, byId }),
}));

export function usePublishedArtifactAudience(artifactId: string): PublishedArtifactAudience | null {
  return usePublishedArtifactAudiences((state) =>
    state.ownerId !== null && state.ownerId === captureCloudAccountEpoch()?.ownerId
      ? (state.byId[artifactId] ?? null)
      : null,
  );
}

type PublishedArtifactList = {
  artifacts?: Array<{ artifactId?: unknown; shareUrl?: unknown; visibility?: unknown }>;
  workspace?: unknown;
};

async function listPublishedArtifacts(): Promise<PublishedArtifactList> {
  const account = captureCloudAccountEpoch();
  const response = await api.get<PublishedArtifactList>('/api/artifacts/publish');
  if (account && captureCloudAccountEpoch()?.ownerId === account.ownerId) {
    const byId: Record<string, PublishedArtifactAudience> = {};
    for (const entry of response.artifacts ?? []) {
      if (typeof entry.artifactId === 'string' && typeof entry.shareUrl === 'string') {
        byId[entry.artifactId] = readAudience(entry.visibility);
      }
    }
    usePublishedArtifactAudiences.getState().replace(account.ownerId, byId);
  }
  return response;
}

export async function refreshPublishedArtifactAudiences(): Promise<void> {
  if (useChatAppModeStore.getState().appMode !== 'cloud') return;
  await listPublishedArtifacts();
}

export function recordPublishedArtifactAudience(
  artifactId: string,
  audience: PublishedArtifactAudience | null,
): void {
  const account = captureCloudAccountEpoch();
  if (account)
    usePublishedArtifactAudiences.getState().record(account.ownerId, artifactId, audience);
}

export async function fetchArtifactPublication(
  artifactId: string,
): Promise<ArtifactPublicationState> {
  const response = await listPublishedArtifacts();
  const match = (response.artifacts ?? []).find(
    (entry) => entry.artifactId === artifactId && typeof entry.shareUrl === 'string',
  );
  return {
    publication: match
      ? { shareUrl: String(match.shareUrl), visibility: readAudience(match.visibility) }
      : null,
    workspaceMemberCount: readWorkspaceMemberCount(response.workspace),
  };
}

export async function setPublishedArtifactAudience(
  shareUrl: string,
  visibility: PublishedArtifactAudience,
): Promise<ArtifactPublication> {
  const token = requirePublishedToken(shareUrl);
  const response = await api.patch<{ shareUrl?: unknown; visibility?: unknown }>(
    `/api/artifacts/publish/${token}`,
    { visibility },
  );
  return {
    shareUrl: typeof response.shareUrl === 'string' ? response.shareUrl : shareUrl,
    visibility: readAudience(response.visibility),
  };
}

export async function unpublishArtifact(shareUrl: string): Promise<void> {
  const token = requirePublishedToken(shareUrl);
  await api.delete(`/api/artifacts/publish/${token}`);
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
