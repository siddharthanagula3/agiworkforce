/**
 * Shared links service.
 *
 * Talks to GET /api/share (list the caller's own links) and
 * DELETE /api/share/:token (revoke one). Both are owner-scoped server-side;
 * nothing here is trusted to do the access control.
 */
import { api } from '@/services/api';

export interface SharedLink {
  token: string;
  title: string;
  shareUrl: string;
  modelId: string | null;
  provider: string | null;
  messageCount: number;
  createdAt: string;
  expiresAt: string;
  /** Server-computed: the row still exists but is past its expiry. */
  expired: boolean;
}

interface SharedLinkResponse {
  shares?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Narrow one row, dropping anything malformed rather than rendering `undefined`
 * into the list. A share with no token cannot be opened or revoked, so it has
 * no use on screen.
 */
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
  await api.delete(`/api/share/${encodeURIComponent(token)}`);
}
