'use client';

import { useEffect, useState } from 'react';
import type { UsageTurnResponse } from '@/app/api/usage/turns/[requestId]/route';

const SETTLE_POLL_MS = 2_000;
const SETTLE_POLL_ATTEMPTS = 5;
const NOT_FOUND_STATUS = 404;

export type SettledTurnCredits =
  | { status: 'loading' }
  | { status: 'pending' }
  | { status: 'settled'; credits: number }
  | { status: 'unmetered' }
  | { status: 'unavailable' };

function parseTurn(value: unknown): UsageTurnResponse | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const credits = record['credits'];
  if (record['status'] === 'pending') {
    return { requestId: String(record['requestId'] ?? ''), status: 'pending', credits: null };
  }
  if (record['status'] === 'settled' && typeof credits === 'number' && Number.isFinite(credits)) {
    return { requestId: String(record['requestId'] ?? ''), status: 'settled', credits };
  }
  return null;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export function useSettledTurnCredits(requestId: string | undefined): SettledTurnCredits | null {
  const [state, setState] = useState<SettledTurnCredits | null>(null);

  useEffect(() => {
    if (!requestId) {
      setState(null);
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    void (async () => {
      try {
        for (let attempt = 1; attempt <= SETTLE_POLL_ATTEMPTS; attempt += 1) {
          const response = await fetch(`/api/usage/turns/${encodeURIComponent(requestId)}`, {
            credentials: 'include',
            signal: controller.signal,
          });
          if (response.status === NOT_FOUND_STATUS) {
            setState({ status: 'unmetered' });
            return;
          }
          if (!response.ok) throw new Error(String(response.status));
          const turn = parseTurn(await response.json());
          if (!turn) throw new Error('unrecognised turn cost');
          if (turn.status === 'settled' && turn.credits !== null) {
            setState({ status: 'settled', credits: turn.credits });
            return;
          }
          setState({ status: 'pending' });
          if (attempt < SETTLE_POLL_ATTEMPTS) await wait(SETTLE_POLL_MS, controller.signal);
          if (controller.signal.aborted) return;
        }
      } catch {
        if (!controller.signal.aborted) setState({ status: 'unavailable' });
      }
    })();
    return () => controller.abort();
  }, [requestId]);

  return state;
}
