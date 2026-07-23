import 'server-only';

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

import { getNeonDb } from '@/lib/server/neon-db';

const DEVELOPER_TOKEN_ISSUER = 'agiworkforce-api-gateway';
const DEVELOPER_TOKEN_AUDIENCE = 'agiworkforce';
export const DEVELOPER_TOKEN_EXPIRES_SECONDS = 604800;

export interface VerifiedDeveloperToken {
  userId: string;
  email?: string;
  jti: string;
  exp: number;
}

function getSigningSecret(): string | null {
  const secret = process.env['JWT_SECRET'];
  return secret && secret.length > 0 ? secret : null;
}

export function issueDeveloperToken(input: { userId: string; email?: string }): {
  accessToken: string;
  expiresIn: number;
} {
  const secret = getSigningSecret();
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  const accessToken = jwt.sign(
    {
      userId: input.userId,
      sub: input.userId,
      email: input.email ?? '',
      surface: 'developer',
    },
    secret,
    {
      expiresIn: DEVELOPER_TOKEN_EXPIRES_SECONDS,
      issuer: DEVELOPER_TOKEN_ISSUER,
      audience: DEVELOPER_TOKEN_AUDIENCE,
      jwtid: crypto.randomUUID(),
    },
  );
  return { accessToken, expiresIn: DEVELOPER_TOKEN_EXPIRES_SECONDS };
}

export function verifyDeveloperTokenSignature(token: string): VerifiedDeveloperToken | null {
  const secret = getSigningSecret();
  if (!secret) return null;

  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: DEVELOPER_TOKEN_ISSUER,
      audience: DEVELOPER_TOKEN_AUDIENCE,
    });
    if (typeof payload === 'string') return null;

    const userId = typeof payload['userId'] === 'string' ? payload['userId'] : null;
    const subject = typeof payload.sub === 'string' ? payload.sub : null;
    const jti = typeof payload.jti === 'string' ? payload.jti : null;
    const exp = typeof payload.exp === 'number' ? payload.exp : null;
    if (
      payload['surface'] !== 'developer' ||
      !userId ||
      !subject ||
      subject !== userId ||
      !jti ||
      !exp
    ) {
      return null;
    }

    const email = typeof payload['email'] === 'string' ? payload['email'] : undefined;
    return {
      userId,
      ...(email ? { email } : {}),
      jti,
      exp,
    };
  } catch {
    return null;
  }
}

export async function isDeveloperTokenRevoked(token: VerifiedDeveloperToken): Promise<boolean> {
  const rows = await getNeonDb().query<{ jti: string }>(
    `SELECT jti
       FROM revoked_jwts
      WHERE jti = $1
        AND user_id = $2
      LIMIT 1`,
    [token.jti, token.userId],
  );
  return rows.length > 0;
}

export async function revokeDeveloperToken(token: VerifiedDeveloperToken): Promise<boolean> {
  const rows = await getNeonDb().query<{ jti: string }>(
    `INSERT INTO revoked_jwts (jti, user_id, until_exp, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (jti) DO NOTHING
     RETURNING jti`,
    [token.jti, token.userId, new Date(token.exp * 1000).toISOString(), 'sign_out'],
  );
  return rows.length > 0;
}
