import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  PAIRING_STANDING_MAX_STALE_MS_DEFAULT,
  PAIRING_STANDING_RECHECK_MS_DEFAULT,
  PAIRING_STANDING_TIMEOUT_MS,
} from './constants.js';
import { envPositiveInteger, envText } from './env.js';

export type PairingStanding = 'active' | 'ended' | 'unknown';

export interface StandingQuery {
  code: string;
  userId: string;
  deviceIds: readonly string[];
  workspace: string | null;
}

export type StandingMode = 'enforced' | 'unconfigured' | 'disabled';

export interface StandingConfig {
  mode: StandingMode;
  url: string | null;
  secret: string | null;
  recheckMs: number;
  maxStaleMs: number;
  timeoutMs: number;
}

const WORKSPACE_SELECTOR_KEY = 'workspaceSelector';

function usableUrl(raw: string | undefined, production: boolean): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:') return url.toString();
    return !production && url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Whether the relay asks the web app if a pairing may continue. Production
 * without a usable URL is `unconfigured`, which no pairing passes: the relay
 * cannot tell a plan downgrade or a workspace switch-off from a live pairing, so
 * it serves none. Outside production an unset URL turns the check off.
 */
export function standingConfig(env: NodeJS.ProcessEnv = process.env): StandingConfig {
  const production = env['NODE_ENV'] === 'production';
  const url = usableUrl(envText('SIGNALING_STANDING_URL', env), production);
  const secret = envText('SIGNALING_INTERNAL_SECRET', env) ?? null;
  const recheckMs = envPositiveInteger(
    'SIGNALING_STANDING_RECHECK_MS',
    PAIRING_STANDING_RECHECK_MS_DEFAULT,
    env,
  );
  const maxStaleMs = Math.max(
    recheckMs,
    envPositiveInteger(
      'SIGNALING_STANDING_MAX_STALE_MS',
      PAIRING_STANDING_MAX_STALE_MS_DEFAULT,
      env,
    ),
  );
  const mode: StandingMode = url && secret ? 'enforced' : production ? 'unconfigured' : 'disabled';
  return { mode, url, secret, recheckMs, maxStaleMs, timeoutMs: PAIRING_STANDING_TIMEOUT_MS };
}

export function pairingWorkspaceSelector(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const value = metadata?.[WORKSPACE_SELECTOR_KEY];
  return typeof value === 'string' && value.length > 0 && value.length <= 100 ? value : null;
}

const standingResponseSchema = z.object({
  results: z
    .array(
      z.object({
        code: z.string(),
        standing: z.enum(['active', 'ended', 'unknown']),
      }),
    )
    .max(1_000),
});

export type StandingFailureReason =
  | 'timeout'
  | 'network'
  | 'redirect'
  | 'client_error'
  | 'server_error'
  | 'non_json'
  | 'invalid_body'
  | 'unconfigured';

export type StandingAnswer =
  | { kind: 'answered'; verdicts: Map<string, PairingStanding> }
  | { kind: 'failed'; reason: StandingFailureReason; status: number | null };

const PAIRING_REFERENCE_LENGTH = 12;

export function pairingReference(code: string): string {
  return createHash('sha256')
    .update(`pairing:${code}`)
    .digest('hex')
    .slice(0, PAIRING_REFERENCE_LENGTH);
}

function statusFailure(status: number): StandingAnswer {
  const reason: StandingFailureReason =
    status >= 500 ? 'server_error' : status >= 400 ? 'client_error' : 'redirect';
  return { kind: 'failed', reason, status };
}

function thrownFailure(error: unknown): StandingAnswer {
  const name = error instanceof Error ? error.name : null;
  const reason: StandingFailureReason =
    name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network';
  return { kind: 'failed', reason, status: null };
}

/**
 * One round trip for a batch of pairings. A failed answer is no news, never a
 * verdict.
 */
export async function fetchPairingStanding(
  config: StandingConfig,
  queries: readonly StandingQuery[],
  fetchImpl: typeof fetch = fetch,
): Promise<StandingAnswer> {
  if (config.mode !== 'enforced' || !config.url || !config.secret) {
    return { kind: 'failed', reason: 'unconfigured', status: null };
  }
  if (queries.length === 0) return { kind: 'answered', verdicts: new Map() };
  let response: Response;
  try {
    response = await fetchImpl(config.url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.secret}`,
      },
      body: JSON.stringify({ pairings: queries }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    return thrownFailure(error);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return statusFailure(response.status);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    return error instanceof SyntaxError
      ? { kind: 'failed', reason: 'non_json', status: response.status }
      : thrownFailure(error);
  }
  const parsed = standingResponseSchema.safeParse(body);
  if (!parsed.success) return { kind: 'failed', reason: 'invalid_body', status: response.status };
  const asked = new Set(queries.map((query) => query.code));
  const verdicts = new Map<string, PairingStanding>();
  for (const result of parsed.data.results) {
    if (asked.has(result.code)) verdicts.set(result.code, result.standing);
  }
  return { kind: 'answered', verdicts };
}
