import { FREE_TRIAL_GATEWAY } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';

export const SHARE_LINK_PATH = '/api/share';
const SHARE_TITLE_MAX_CHARS = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChromeShareLinkRequest {
  title: string;
  messages: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
  conversationId?: string;
}

export interface ChromeShareLink {
  url: string;
  expiresAt: string | null;
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const error = (body as Record<string, unknown>)['error'];
    const message =
      typeof error === 'string'
        ? error
        : error && typeof error === 'object'
          ? (error as Record<string, unknown>)['message']
          : undefined;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return `The share link could not be created (${status}).`;
}

export async function createChromeShareLink(
  token: string,
  request: ChromeShareLinkRequest,
): Promise<ChromeShareLink> {
  const response = await fetch(`${FREE_TRIAL_GATEWAY}${SHARE_LINK_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
    },
    body: JSON.stringify({
      title: request.title.slice(0, SHARE_TITLE_MAX_CHARS),
      messages: request.messages.map(({ role, content }) => ({ role, content })),
      ...(request.conversationId && UUID_PATTERN.test(request.conversationId)
        ? { conversation_id: request.conversationId }
        : {}),
    }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const url = record['shareUrl'];
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    throw new Error('The share link could not be created.');
  }
  const expiresAt = record['expiresAt'];
  return { url, expiresAt: typeof expiresAt === 'string' ? expiresAt : null };
}
