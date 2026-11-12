import { FREE_TRIAL_GATEWAY } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';
import { UUID_PATTERN } from '../../lib/uuid';
import {
  describeCloudRefusal,
  readCloudRefusal,
  type CloudRefusal,
  type CloudRefusalKind,
} from './cloudRefusal';

export const SHARE_LINK_PATH = '/api/share';
const SHARE_TITLE_MAX_CHARS = 200;

export interface ChromeShareLinkRequest {
  title: string;
  messages: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
  conversationId?: string;
}

export interface ChromeShareLink {
  url: string;
  expiresAt: string | null;
}

export type ChromeShareFailureKind =
  'signed-out' | 'not-saved' | 'out-of-sync' | 'limited' | 'refused' | 'unavailable' | 'failed';

export class ChromeShareError extends Error {
  constructor(
    message: string,
    readonly kind: ChromeShareFailureKind,
  ) {
    super(message);
    this.name = 'ChromeShareError';
  }
}

const SHARE_REFUSAL_COPY = {
  refused: 'This account cannot share chats from the Chrome extension.',
  unavailable: 'Sharing is temporarily unavailable.',
  limitUnit: 'share links',
};

const SHARE_FAILURE_KIND: Readonly<Record<CloudRefusalKind, ChromeShareFailureKind>> = {
  auth: 'signed-out',
  invalid: 'not-saved',
  conflict: 'out-of-sync',
  rate_limited: 'limited',
  plan: 'refused',
  policy: 'refused',
  account: 'refused',
  refused: 'refused',
  unavailable: 'unavailable',
  failed: 'failed',
};

function shareFailure(refusal: CloudRefusal): ChromeShareError {
  if (refusal.kind === 'failed') {
    return new ChromeShareError(
      `The share link could not be created (${refusal.status}).`,
      'failed',
    );
  }
  return new ChromeShareError(
    describeCloudRefusal(refusal, SHARE_REFUSAL_COPY),
    SHARE_FAILURE_KIND[refusal.kind],
  );
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
  if (!response.ok) throw shareFailure(await readCloudRefusal(response));
  const body: unknown = await response.json().catch(() => null);
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const url = record['shareUrl'];
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    throw new Error('The share link could not be created.');
  }
  const expiresAt = record['expiresAt'];
  return { url, expiresAt: typeof expiresAt === 'string' ? expiresAt : null };
}
