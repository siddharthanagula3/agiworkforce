'use client';

import { useCallback, useEffect, useState } from 'react';

import { getAuthToken } from '@shared/lib/get-auth-token';
import { toUserMessage } from '@/lib/user-error-message';

const MODELS_PATH = '/api/llm/v1/models';

export interface ListedModel {
  id: string;
  deprecationDate: string | null;
}

export type ModelList =
  | { status: 'loading' }
  | { status: 'ready'; models: readonly ListedModel[] }
  | { status: 'error'; message: string };

interface ModelsPayload {
  data?: Array<{ id?: unknown; deprecation_date?: unknown }>;
  error?: { message?: string };
}

export function formatRetirement(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function useGatewayModels(): { list: ModelList; retry: () => void } {
  const [list, setList] = useState<ModelList>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setList({ status: 'loading' });
    void (async () => {
      try {
        const token = await getAuthToken();
        if (!token) throw new Error('You are signed out. Sign in again to load models.');
        const response = await fetch(MODELS_PATH, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => null)) as ModelsPayload | null;
        if (!response.ok) {
          throw new Error(
            payload?.error?.message ?? `The models list answered ${response.status}.`,
          );
        }
        const models = (payload?.data ?? [])
          .filter((model): model is { id: string; deprecation_date?: unknown } => {
            return typeof model.id === 'string';
          })
          .map((model) => ({
            id: model.id,
            deprecationDate:
              typeof model.deprecation_date === 'string' ? model.deprecation_date : null,
          }));
        if (!cancelled) setList({ status: 'ready', models });
      } catch (reason) {
        if (!cancelled) {
          setList({
            status: 'error',
            message: toUserMessage(reason, 'The models list could not be loaded.'),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { list, retry };
}
