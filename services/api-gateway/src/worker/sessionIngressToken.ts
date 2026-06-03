import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const TOKEN_PREFIX = 'v1';
const TOKEN_ISSUER = 'agiworkforce-api-gateway';
const TOKEN_AUDIENCE = 'agiworkforce-worker';
const DEFAULT_TTL_SECONDS = 3600;

type SessionIngressClaims = {
  v: 1;
  iss: typeof TOKEN_ISSUER;
  aud: typeof TOKEN_AUDIENCE;
  environment_id: string;
  work_id?: string;
  iat: number;
  exp: number;
  jti: string;
};

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function decodePayload(payload: string): SessionIngressClaims | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Partial<SessionIngressClaims>;
    if (decoded.v !== 1) return null;
    if (decoded.iss !== TOKEN_ISSUER) return null;
    if (decoded.aud !== TOKEN_AUDIENCE) return null;
    if (typeof decoded.environment_id !== 'string' || decoded.environment_id.length === 0)
      return null;
    if (
      decoded.work_id !== undefined &&
      (typeof decoded.work_id !== 'string' || decoded.work_id.length === 0)
    ) {
      return null;
    }
    if (typeof decoded.iat !== 'number' || typeof decoded.exp !== 'number') return null;
    if (typeof decoded.jti !== 'string' || decoded.jti.length === 0) return null;
    return decoded as SessionIngressClaims;
  } catch {
    return null;
  }
}

export function mintSessionIngressToken(params: {
  secret: string;
  environmentId: string;
  workId?: string;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionIngressClaims = {
    v: 1,
    iss: TOKEN_ISSUER,
    aud: TOKEN_AUDIENCE,
    environment_id: params.environmentId,
    ...(params.workId ? { work_id: params.workId } : {}),
    iat: now,
    exp: now + (params.ttlSeconds ?? DEFAULT_TTL_SECONDS),
    jti: randomUUID(),
  };
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${TOKEN_PREFIX}.${payload}.${signPayload(payload, params.secret)}`;
}

export function verifySessionIngressToken(
  token: string,
  params: { secret: string; environmentId: string; workId?: string },
): boolean {
  const [prefix, payload, signature, extra] = token.split('.');
  if (prefix !== TOKEN_PREFIX || !payload || !signature || extra !== undefined) return false;

  const expectedSignature = signPayload(payload, params.secret);
  if (!constantTimeEqual(signature, expectedSignature)) return false;

  const claims = decodePayload(payload);
  if (!claims) return false;
  if (claims.environment_id !== params.environmentId) return false;
  if (params.workId !== undefined && claims.work_id !== params.workId) return false;

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) return false;
  if (claims.iat > now + 60) return false;
  return true;
}
