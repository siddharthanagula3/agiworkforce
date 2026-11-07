import { create } from 'zustand';
import { api } from '@/services/api';
import {
  assertCloudAccountEpochCurrent,
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS,
  ManagedCloudPublishedArtifactDeleteReceiptSchema,
  ManagedCloudPublishedArtifactListResponseSchema,
  ManagedCloudPublishedArtifactLookupQuerySchema,
  ManagedCloudPublishedArtifactLookupResponseSchema,
  ManagedCloudPublishedArtifactPublishResponseSchema,
  ManagedCloudPublishedArtifactUpdateReceiptSchema,
  type ManagedCloudPublishedArtifactPublishResponse,
  managedCloudPublishedArtifactLookupPath,
} from '@agiworkforce/cloud-contracts';
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

export async function publishArtifact(
  input: PublishArtifactInput,
): Promise<ManagedCloudPublishedArtifactPublishResponse> {
  const { artifactId } = ManagedCloudPublishedArtifactLookupQuerySchema.parse(input);
  const account = captureCloudAccountEpoch();
  assertCloudAccountEpochCurrent(account);
  const response = await api.post<unknown>(
    '/api/artifacts/publish',
    {
      artifactId,
      title: input.title,
      kind: input.kind,
      ...(input.language ? { language: input.language } : {}),
      content: input.content,
      ...(input.conversationId &&
      useChatAppModeStore.getState().appMode === 'cloud' &&
      SERVER_CONVERSATION_ID.test(input.conversationId)
        ? { conversationId: input.conversationId }
        : {}),
    },
    { accountEpoch: account, auth401Recovery: 'caller-owned' },
  );
  assertCloudAccountEpochCurrent(account);
  const receipt = ManagedCloudPublishedArtifactPublishResponseSchema.parse(response);
  if (receipt.artifactId !== artifactId) {
    throw new Error('The publication receipt returned a different artifact.');
  }
  return receipt;
}

export type PublishedArtifactAudience = 'public' | 'organization' | 'invited';

export interface ArtifactPublication {
  shareUrl: string;
  visibility: PublishedArtifactAudience;
}

export interface ArtifactPublicationState {
  publication: ArtifactPublication | null;
  workspaceMemberCount: number | null;
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
}

let activeAudienceRefresh: {
  controller: AbortController;
  changes: Map<string, PublishedArtifactAudience | null>;
} | null = null;

function invalidateAudienceRefresh(): void {
  const refresh = activeAudienceRefresh;
  activeAudienceRefresh = null;
  refresh?.changes.clear();
  refresh?.controller.abort();
}

export const usePublishedArtifactAudiences = create<PublishedArtifactAudiences>()((set) => ({
  ownerId: null,
  byId: {},
  record: (ownerId, artifactId, audience) =>
    set((state) => {
      if (captureCloudAccountEpoch()?.ownerId !== ownerId) return state;
      activeAudienceRefresh?.changes.set(artifactId, audience);
      const byId: Record<string, PublishedArtifactAudience> = Object.assign(
        Object.create(null),
        state.ownerId === ownerId ? state.byId : {},
      );
      if (audience) byId[artifactId] = audience;
      else delete byId[artifactId];
      return { ownerId, byId };
    }),
}));

subscribeCloudAccountEpochChange(() => {
  invalidateAudienceRefresh();
  usePublishedArtifactAudiences.setState({ ownerId: null, byId: {} });
});

useChatAppModeStore.subscribe((state, previous) => {
  if (state.appMode !== previous.appMode) invalidateAudienceRefresh();
});

export function usePublishedArtifactAudience(artifactId: string): PublishedArtifactAudience | null {
  return usePublishedArtifactAudiences((state) =>
    state.ownerId !== null &&
    state.ownerId === captureCloudAccountEpoch()?.ownerId &&
    Object.prototype.hasOwnProperty.call(state.byId, artifactId)
      ? (state.byId[artifactId] ?? null)
      : null,
  );
}

export async function refreshPublishedArtifactAudiences(): Promise<void> {
  if (useChatAppModeStore.getState().appMode !== 'cloud') return;
  const account = captureCloudAccountEpoch();
  assertCloudAccountEpochCurrent(account);
  invalidateAudienceRefresh();
  const refresh = {
    controller: new AbortController(),
    changes: new Map<string, PublishedArtifactAudience | null>(),
  };
  activeAudienceRefresh = refresh;
  try {
    const raw = await api.get<unknown>('/api/artifacts/publish', {
      accountEpoch: account,
      signal: refresh.controller.signal,
    });
    assertCloudAccountEpochCurrent(account);
    if (activeAudienceRefresh !== refresh) return;
    const response = ManagedCloudPublishedArtifactListResponseSchema.parse(raw);
    if (
      response.artifacts.length > MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS ||
      new Set(response.artifacts.map((entry) => entry.artifactId)).size !==
        response.artifacts.length
    ) {
      throw new Error('The publication list returned an invalid page.');
    }
    usePublishedArtifactAudiences.setState((state) => {
      const byId: Record<string, PublishedArtifactAudience> = Object.assign(
        Object.create(null),
        response.pageInfo?.nextCursor === null || state.ownerId !== account.ownerId
          ? {}
          : state.byId,
      );
      for (const entry of response.artifacts) {
        byId[entry.artifactId] = entry.visibility;
      }
      for (const [artifactId, audience] of refresh.changes) {
        if (audience) byId[artifactId] = audience;
        else delete byId[artifactId];
      }
      return { ownerId: account.ownerId, byId };
    });
  } finally {
    refresh.changes.clear();
    if (activeAudienceRefresh === refresh) activeAudienceRefresh = null;
  }
}

export function recordPublishedArtifactAudience(
  artifactId: string,
  audience: PublishedArtifactAudience | null,
): void {
  const account = captureCloudAccountEpoch();
  if (account)
    usePublishedArtifactAudiences.getState().record(account.ownerId, artifactId, audience);
}

export function capturePostUnpublishAudienceReconciliation(
  artifactId: string,
): (audience: PublishedArtifactAudience) => boolean {
  const account = captureCloudAccountEpoch();
  const state = usePublishedArtifactAudiences.getState();
  const refresh = activeAudienceRefresh;
  const cleared =
    account !== null &&
    state.ownerId === account.ownerId &&
    !Object.prototype.hasOwnProperty.call(state.byId, artifactId);
  let consumed = false;
  return (audience) => {
    if (consumed) return false;
    consumed = true;
    if (
      !cleared ||
      !isCloudAccountEpochCurrent(account) ||
      usePublishedArtifactAudiences.getState() !== state ||
      activeAudienceRefresh !== refresh
    ) {
      return false;
    }
    recordPublishedArtifactAudience(artifactId, audience);
    return true;
  };
}

export async function fetchArtifactPublication(
  artifactId: string,
): Promise<ArtifactPublicationState> {
  const query = ManagedCloudPublishedArtifactLookupQuerySchema.parse({ artifactId });
  const account = captureCloudAccountEpoch();
  assertCloudAccountEpochCurrent(account);
  const response = ManagedCloudPublishedArtifactLookupResponseSchema.parse(
    await api.get<unknown>(managedCloudPublishedArtifactLookupPath(query.artifactId), {
      accountEpoch: account,
    }),
  );
  assertCloudAccountEpochCurrent(account);
  const match = response.artifact;
  if (match && match.artifactId !== query.artifactId) {
    throw new Error('The publication lookup returned a different artifact.');
  }
  return {
    publication: match ? { shareUrl: match.shareUrl, visibility: match.visibility } : null,
    workspaceMemberCount: response.workspace?.memberCount ?? null,
  };
}

export async function setPublishedArtifactAudience(
  shareUrl: string,
  visibility: PublishedArtifactAudience,
): Promise<ArtifactPublication> {
  const token = requirePublishedToken(shareUrl);
  const account = captureCloudAccountEpoch();
  assertCloudAccountEpochCurrent(account);
  const response = await api.patch<unknown>(
    `/api/artifacts/publish/${token}`,
    { visibility },
    { accountEpoch: account, auth401Recovery: 'caller-owned' },
  );
  assertCloudAccountEpochCurrent(account);
  const receipt = ManagedCloudPublishedArtifactUpdateReceiptSchema.parse(response);
  if (receipt.token !== token || receipt.visibility !== visibility) {
    throw new Error('The audience change receipt did not match the requested publication change.');
  }
  return { shareUrl: receipt.shareUrl, visibility: receipt.visibility };
}

export async function unpublishArtifact(shareUrl: string): Promise<void> {
  const token = requirePublishedToken(shareUrl);
  const account = captureCloudAccountEpoch();
  assertCloudAccountEpochCurrent(account);
  const response = await api.delete<unknown>(`/api/artifacts/publish/${token}`, {
    accountEpoch: account,
    auth401Recovery: 'caller-owned',
  });
  assertCloudAccountEpochCurrent(account);
  const receipt = ManagedCloudPublishedArtifactDeleteReceiptSchema.parse(response);
  if (receipt.token !== token) {
    throw new Error('The unpublish receipt returned a different publication.');
  }
}

export const PUBLISH_FAILED_MESSAGE =
  'The sharing change could not be confirmed. It may have completed. Check the current publication before trying again.';

export function isPublicationOutcomeUncertain(error: unknown): boolean {
  return !(
    error instanceof ApiHttpError &&
    (error.status === 400 ||
      error.status === 401 ||
      error.status === 403 ||
      error.status === 409 ||
      error.status === 429)
  );
}

/**
 * Only a sentence the server wrote for a reader is shown as it is. Anything
 * else (a dropped connection, a malformed reply) is this app's own wording.
 */
export function publishFailureMessage(error: unknown): string {
  if (error instanceof ApiHttpError) {
    return withFailureReference(
      isPublicationOutcomeUncertain(error)
        ? `${error.message} ${PUBLISH_FAILED_MESSAGE}`
        : error.message,
      error.requestId,
    );
  }
  return PUBLISH_FAILED_MESSAGE;
}
