import { getClerkInstance } from '@clerk/expo';
import { SURFACE_TOKEN_HEADER } from '@agiworkforce/types';
import { API_URL, TIMEOUTS } from '@/lib/constants';
import { combineAbortSignals } from '@/lib/abortSignal';
import { guardedFetch } from '@/lib/egressGuard';
import { platformRequestHeaders } from '@/src/platform/platformHeaders';
import {
  CLERK_PUBLISHABLE_KEY,
  getSessionToken,
  getSurfaceToken,
} from '@/src/integrations/clerk';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';

export const LIVE_VOICE_SESSION_PATH = '/api/voice/live/sessions';

export interface LiveVoiceAuthority {
  readonly signal: AbortSignal;
  isCurrent: () => boolean;
  isIdentityCurrent: () => boolean;
  assertCurrent: () => void;
  retire: () => void;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  closeCreated: (sessionId: string, body: Record<string, unknown>) => Promise<void>;
}

export function captureLiveVoiceAuthority(isOwner: () => boolean): LiveVoiceAuthority | null {
  const sdk = getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY });
  const session = sdk.session;
  const account = captureCloudAccountEpoch();
  if (!session || !account || session.user?.id !== account.ownerId) return null;
  const incarnation = session.id;
  const controller = new AbortController();
  let identityRetired = false;
  let cleanupHeaders: Record<string, string> | null = null;
  const isIdentityCurrent = () => {
    if (!isCloudAccountEpochCurrent(account) || sdk.session !== session ||
        sdk.session?.id !== incarnation || !useAuthStore.getState().isClerkSignedIn) {
      identityRetired = true;
    }
    return !identityRetired;
  };
  const isCurrent = () => {
    if (!isIdentityCurrent() || !isOwner()) controller.abort();
    return !controller.signal.aborted;
  };
  const assertCurrent = () => {
    if (!isCurrent()) throw new Error('Voice session owner changed');
  };
  const endpoint = (path: string) => {
    const base = new URL(API_URL);
    const target = new URL(path, base);
    if (base.protocol !== 'https:' || base.username || base.password ||
        target.origin !== base.origin || target.search || target.hash ||
        !(target.pathname === LIVE_VOICE_SESSION_PATH || target.pathname.startsWith(`${LIVE_VOICE_SESSION_PATH}/`))) {
      throw new Error('Voice request destination is invalid');
    }
    return target.toString();
  };
  const request = async (path: string, init: RequestInit, headers: Record<string, string>, signal?: AbortSignal) => {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), TIMEOUTS.DEFAULT);
    try {
      const response = await guardedFetch(endpoint(path), {
        ...init,
        credentials: 'omit',
        headers: { ...platformRequestHeaders(), 'Content-Type': 'application/json', ...headers },
        signal: signal ? combineAbortSignals([signal, timeout.signal]) : timeout.signal,
      });
      const body = response.status === 204 || response.status === 205 || response.status === 304
        ? null : await response.text();
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    signal: controller.signal,
    isCurrent,
    isIdentityCurrent,
    assertCurrent,
    retire: () => controller.abort(),
    fetch: async (path, init = {}) => {
      assertCurrent();
      const mint = (options?: { template?: string; skipCache?: boolean }) => session.getToken(options);
      const token = await getSessionToken(mint);
      assertCurrent();
      const proof = await getSurfaceToken(mint);
      assertCurrent();
      if (!token || !proof) throw new Error('Voice session credentials are unavailable');
      const headers = { Authorization: `Bearer ${token}`, [SURFACE_TOKEN_HEADER]: proof };
      cleanupHeaders ??= headers;
      const response = await request(path, init, headers, controller.signal);
      assertCurrent();
      return response;
    },
    closeCreated: async (sessionId, body) => {
      if (!sessionId || !cleanupHeaders) throw new Error('Original voice cleanup credentials are unavailable');
      const response = await request(`${LIVE_VOICE_SESSION_PATH}/${encodeURIComponent(sessionId)}/close`, {
        method: 'POST', body: JSON.stringify(body),
      }, cleanupHeaders);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
  };
}
