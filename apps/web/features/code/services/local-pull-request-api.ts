'use client';

import { z } from 'zod';
import { getCsrfToken } from '@/lib/client/csrf';
import { GITHUB_RECONNECT_REQUIRED_REASON } from '@/lib/github-installation-access';

export const LOCAL_PULL_REQUESTS_PATH = '/api/code/local-pull-requests';

const LocalPullRequestStateSchema = z.object({
  number: z.number().int().positive(),
  url: z.string().url(),
  state: z.enum(['open', 'closed', 'merged', 'draft']),
  checks: z.enum(['passing', 'failing', 'pending', 'none']),
});

const LocalPullRequestLookupSchema = z.object({
  connected: z.boolean(),
  compareUrl: z.string().url(),
  pullRequest: LocalPullRequestStateSchema.nullable(),
});

export type LocalPullRequestState = z.infer<typeof LocalPullRequestStateSchema>;
export type LocalPullRequestLookup = z.infer<typeof LocalPullRequestLookupSchema>;

export class LocalPullRequestRequestError extends Error {
  constructor(
    message: string,
    readonly reconnectGitHub: boolean,
  ) {
    super(message);
    this.name = 'LocalPullRequestRequestError';
  }
}

async function readBody<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = z
      .object({
        error: z
          .object({
            message: z.string(),
            details: z.object({ reason: z.string() }).partial(),
          })
          .partial()
          .or(z.string())
          .optional(),
      })
      .safeParse(body);
    const error = parsed.success ? parsed.data.error : undefined;
    const message = typeof error === 'string' ? error : error?.message;
    throw new LocalPullRequestRequestError(
      message ?? `Request failed (${response.status}).`,
      typeof error === 'object' && error.details?.reason === GITHUB_RECONNECT_REQUIRED_REASON,
    );
  }
  return schema.parse(body);
}

export async function readLocalPullRequest(input: {
  remoteUrl: string;
  head: string;
  base: string | null;
}): Promise<LocalPullRequestLookup> {
  const query = new URLSearchParams({ remoteUrl: input.remoteUrl, head: input.head });
  if (input.base) query.set('base', input.base);
  const response = await fetch(`${LOCAL_PULL_REQUESTS_PATH}?${query.toString()}`, {
    credentials: 'include',
  });
  return readBody(response, LocalPullRequestLookupSchema);
}

export async function openLocalPullRequest(input: {
  remoteUrl: string;
  head: string;
  base: string;
  title: string;
}): Promise<LocalPullRequestState> {
  const response = await fetch(LOCAL_PULL_REQUESTS_PATH, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() },
    body: JSON.stringify(input),
  });
  return readBody(response, LocalPullRequestStateSchema);
}
