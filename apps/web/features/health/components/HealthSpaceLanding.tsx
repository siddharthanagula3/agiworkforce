'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  HEALTH_SPACE_PATH,
  parseHealthSpaceResponse,
  type HealthSpaceResponse,
  type HealthSpaceUnavailableReason,
} from '@agiworkforce/cloud-contracts';
import { Spinner } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';

type LandingState =
  | { kind: 'loading' }
  | { kind: 'unavailable'; reason: HealthSpaceUnavailableReason }
  | { kind: 'error' };

const UNAVAILABLE_COPY: Record<HealthSpaceUnavailableReason, string> = {
  not_configured: 'Health is not available yet.',
  region: 'Health is available in the United States only.',
  workspace: 'Health is part of your personal account. Switch to your personal account to use it.',
};

const OPEN_FAILED = 'Health could not be opened. Try again in a moment.';

async function readHealthSpace(response: Response): Promise<HealthSpaceResponse> {
  const body = parseHealthSpaceResponse(await response.json().catch(() => null));
  if (!response.ok || !body) throw new Error(OPEN_FAILED);
  return body;
}

async function openHealthSpace(signal: AbortSignal): Promise<HealthSpaceResponse> {
  const current = await readHealthSpace(
    await fetch(HEALTH_SPACE_PATH, { credentials: 'include', signal }),
  );
  if (current.status === 'unavailable' || current.projectId) return current;
  return readHealthSpace(
    await fetch(HEALTH_SPACE_PATH, {
      method: 'POST',
      credentials: 'include',
      headers: await addCsrfHeaders(),
      signal,
    }),
  );
}

export function HealthSpaceLanding() {
  const router = useRouter();
  const [state, setState] = useState<LandingState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void openHealthSpace(controller.signal)
      .then((space) => {
        if (space.status === 'unavailable') {
          setState({ kind: 'unavailable', reason: space.reason });
          return;
        }
        if (space.projectId) router.replace(`/chat/projects/${space.projectId}`);
        else setState({ kind: 'error' });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'error' });
      });
    return () => controller.abort();
  }, [attempt, router]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Health</h1>
        <p className="text-sm text-muted-foreground">
          Your other chats never use anything from Health: its chats, files, connected health
          records and memories stay out of them. Health chats only use models that keep your chats
          out of training.
        </p>
      </header>
      {state.kind === 'loading' ? (
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" aria-hidden="true" />
          Opening Health
        </div>
      ) : (
        <div
          role="status"
          className="rounded-lg border border-border/60 bg-card px-5 py-4 text-sm text-foreground"
        >
          <p>{state.kind === 'unavailable' ? UNAVAILABLE_COPY[state.reason] : OPEN_FAILED}</p>
          {state.kind === 'error' ? (
            <button
              type="button"
              onClick={retry}
              className="mt-3 inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Try again
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
