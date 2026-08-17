import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const TOKEN_REGEX = /^[A-Za-z0-9_-]{24}$/;

export type PublicContentKind = 'conversation-share' | 'published-artifact';

export interface PublicContentTarget {
  kind: PublicContentKind;
  token: string;
  ownerId: string;
  title: string;
  createdAt: string;
}

export const PUBLIC_CONTENT_PATHS: Readonly<Record<PublicContentKind, string>> = {
  'conversation-share': '/share',
  'published-artifact': '/shared-artifact',
};

export function normalizeToken(raw: string): string | null {
  const withoutQuery = raw.trim().split(/[?#]/)[0] ?? '';
  const candidate = withoutQuery.split('/').filter(Boolean).pop() ?? '';
  return TOKEN_REGEX.test(candidate) ? candidate : null;
}

export async function findPublicTarget(
  db: DatabaseAdapter,
  token: string,
): Promise<PublicContentTarget | null> {
  const [share] = await db.query<{ owner_id: string; title: string; created_at: string }>(
    `select owner_id, title, created_at
       from public.shared_sessions
      where token = $1
      limit 1`,
    [token],
  );
  if (share) {
    return {
      kind: 'conversation-share',
      token,
      ownerId: share.owner_id,
      title: share.title,
      createdAt: new Date(share.created_at).toISOString(),
    };
  }

  const [artifact] = await db.query<{ user_id: string; title: string; created_at: string }>(
    `select user_id, title, created_at
       from public.published_artifacts
      where token = $1
      limit 1`,
    [token],
  );
  if (artifact) {
    return {
      kind: 'published-artifact',
      token,
      ownerId: artifact.user_id,
      title: artifact.title,
      createdAt: new Date(artifact.created_at).toISOString(),
    };
  }

  return null;
}
