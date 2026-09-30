import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';

const SHARED_LINK_TITLE_MAX_LENGTH = 200;

export interface SharedLink {
  token: string;
  title: string;
  shareUrl: string;
  modelId: string | null;
  provider: string | null;
  messageCount: number;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

interface SharedLinkResponse {
  shares?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toSharedLink(value: unknown): SharedLink | null {
  if (!isRecord(value)) return null;
  const token = value['token'];
  const shareUrl = value['shareUrl'];
  if (typeof token !== 'string' || token === '') return null;
  if (typeof shareUrl !== 'string' || shareUrl === '') return null;

  return {
    token,
    shareUrl,
    title: typeof value['title'] === 'string' ? value['title'] : 'Shared Session',
    modelId: typeof value['modelId'] === 'string' ? value['modelId'] : null,
    provider: typeof value['provider'] === 'string' ? value['provider'] : null,
    messageCount: typeof value['messageCount'] === 'number' ? value['messageCount'] : 0,
    createdAt: typeof value['createdAt'] === 'string' ? value['createdAt'] : '',
    expiresAt: typeof value['expiresAt'] === 'string' ? value['expiresAt'] : '',
    expired: value['expired'] === true,
  };
}

export async function fetchSharedLinks(): Promise<SharedLink[]> {
  const response = await api.get<SharedLinkResponse>('/api/share');
  const shares = response?.shares;
  if (!Array.isArray(shares)) return [];
  return shares.map(toSharedLink).filter((link): link is SharedLink => link !== null);
}

export async function revokeSharedLink(token: string): Promise<void> {
  try {
    await api.delete(`/api/share/${encodeURIComponent(token)}`);
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 404) return;
    throw error;
  }
}

export interface SharedLinkMessage {
  role: string;
  content: string;
  createdAt?: string;
}

export async function createSharedLink(input: {
  conversationId: string;
  title: string;
  modelId: string | null;
  messages: SharedLinkMessage[];
}): Promise<SharedLink> {
  const created = toSharedLink(
    await api.post<unknown>('/api/share', {
      conversation_id: input.conversationId,
      title: (input.title.trim() || 'Shared Session').slice(0, SHARED_LINK_TITLE_MAX_LENGTH),
      ...(input.modelId ? { model_id: input.modelId } : {}),
      messages: input.messages.map((message) => ({
        role: message.role,
        content: message.content,
        ...(message.createdAt ? { created_at: message.createdAt } : {}),
      })),
    }),
  );
  if (!created) throw new Error('The share link could not be read. Try again.');
  return created;
}
