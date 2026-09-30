'use client';

import { useCallback, useEffect, useId, useState, useSyncExternalStore } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Spinner,
  Textarea,
} from '@agiworkforce/ui';

import { sendAuthorizedJson } from '@features/auth/step-up-fetch';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { toUserMessage } from '@/lib/user-error-message';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';

const CHAT_COMPLETIONS_PATH = '/api/llm/v1/chat/completions';
const MODELS_PATH = '/api/llm/v1/models';
const AUTO_MODEL = 'auto';
const COPIED_RESET_MS = 1600;

interface ListedModel {
  id: string;
  deprecationDate: string | null;
}

type ModelList =
  | { status: 'loading' }
  | { status: 'ready'; models: readonly ListedModel[] }
  | { status: 'error'; message: string };

interface ModelsPayload {
  data?: Array<{ id?: unknown; deprecation_date?: unknown }>;
  error?: { message?: string };
}

interface CompletionPayload {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  x_agi_workforce?: { routing?: { resolved_model?: string } };
  error?: { message?: string };
}

interface PlaygroundResult {
  content: string;
  model: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  remaining: string | null;
  limit: string | null;
  resetAt: string | null;
}

interface PlaygroundError {
  status: number | null;
  message: string;
}

interface RequestDraft {
  model: string;
  system: string;
  message: string;
  maxTokens: string;
  temperature: string;
}

function buildRequestBody(draft: RequestDraft): Record<string, unknown> {
  const system = draft.system.trim();
  const maxTokens = Number.parseInt(draft.maxTokens, 10);
  const temperature = Number.parseFloat(draft.temperature);
  return {
    model: draft.model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: draft.message },
    ],
    stream: false,
    ...(Number.isFinite(maxTokens) && maxTokens > 0 ? { max_tokens: maxTokens } : {}),
    ...(draft.temperature.trim() !== '' && Number.isFinite(temperature) ? { temperature } : {}),
  };
}

function curlFor(origin: string, body: Record<string, unknown>): string {
  const json = JSON.stringify(body, null, 2).replace(/'/g, "'\\''");
  return [
    `curl ${origin}${CHAT_COMPLETIONS_PATH} \\`,
    '  -H "Authorization: Bearer $AGI_API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    '  -H "Idempotency-Key: $(uuidgen)" \\',
    `  -d '${json}'`,
  ].join('\n');
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

function useBrowserOrigin(): string | null {
  return useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => null,
  );
}

function formatRetirement(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function useGatewayModels(): { list: ModelList; retry: () => void } {
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

function gatewayErrorCopy(payload: CompletionPayload | null, status: number): string {
  const copy = payload?.error?.message;
  return typeof copy === 'string' && copy.trim().length > 0
    ? copy
    : `The gateway answered ${status}.`;
}

export function RequestPlayground() {
  const fieldId = useId();
  const origin = useBrowserOrigin();
  const { list, retry } = useGatewayModels();
  const [draft, setDraft] = useState<RequestDraft>({
    model: AUTO_MODEL,
    system: '',
    message: '',
    maxTokens: '',
    temperature: '',
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [failure, setFailure] = useState<PlaygroundError | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const update = (field: keyof RequestDraft) => (value: string) =>
    setDraft((previous) => ({ ...previous, [field]: value }));

  const canSend = draft.message.trim().length > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setFailure(null);
    const started = performance.now();
    try {
      const response = await sendAuthorizedJson(
        CHAT_COMPLETIONS_PATH,
        { method: 'POST', body: { ...buildRequestBody(draft), personalization: false } },
        {
          'Idempotency-Key': createManagedChatIdempotencyKey({
            surface: 'web',
            purpose: 'send',
            operationId: crypto.randomUUID(),
          }),
        },
      );
      const latencyMs = Math.round(performance.now() - started);
      const payload = (await response.json().catch(() => null)) as CompletionPayload | null;
      if (!response.ok) {
        setResult(null);
        setFailure({
          status: response.status,
          message: gatewayErrorCopy(payload, response.status),
        });
        return;
      }
      setResult({
        content: payload?.choices?.[0]?.message?.content ?? '',
        model: payload?.x_agi_workforce?.routing?.resolved_model ?? payload?.model ?? draft.model,
        latencyMs,
        promptTokens: payload?.usage?.prompt_tokens ?? null,
        completionTokens: payload?.usage?.completion_tokens ?? null,
        remaining: response.headers.get('X-RateLimit-Remaining'),
        limit: response.headers.get('X-RateLimit-Limit'),
        resetAt: response.headers.get('X-RateLimit-Reset'),
      });
    } catch (reason) {
      setResult(null);
      setFailure({
        status: null,
        message: toUserMessage(reason, 'The request could not be sent. Try again.'),
      });
    } finally {
      setSending(false);
    }
  };

  const code = origin ? curlFor(origin, buildRequestBody(draft)) : null;

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    window.setTimeout(() => setCopyState('idle'), COPIED_RESET_MS);
  };

  const resetTime = result?.resetAt ? new Date(result.resetAt) : null;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">Try a request</CardTitle>
        <CardDescription>
          Sends one chat completion to the gateway with your signed-in session in place of an API
          key. It answers as an API key would, without your memory or custom instructions, uses your
          plan&apos;s usage like any chat, and saves nothing to your chats.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-model`}>Model</Label>
            {list.status === 'error' ? (
              <div className="flex flex-wrap items-center gap-2">
                <p role="alert" className="text-sm text-danger">
                  {list.message}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={retry}>
                  Retry
                </Button>
              </div>
            ) : null}
            <select
              id={`${fieldId}-model`}
              value={draft.model}
              onChange={(event) => update('model')(event.target.value)}
              disabled={list.status === 'loading'}
              aria-busy={list.status === 'loading'}
              className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground pointer-coarse:min-h-11"
            >
              <option value={AUTO_MODEL}>{AUTO_MODEL}</option>
              {list.status === 'ready'
                ? list.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.deprecationDate
                        ? `${model.id} (leaving ${formatRetirement(model.deprecationDate)})`
                        : model.id}
                    </option>
                  ))
                : null}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-system`}>System message</Label>
            <Textarea
              id={`${fieldId}-system`}
              value={draft.system}
              onChange={(event) => update('system')(event.target.value)}
              rows={2}
              placeholder="Optional instructions for the model"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-message`}>User message</Label>
            <Textarea
              id={`${fieldId}-message`}
              value={draft.message}
              onChange={(event) => update('message')(event.target.value)}
              rows={4}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-max-tokens`}>max_tokens</Label>
              <Input
                id={`${fieldId}-max-tokens`}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={draft.maxTokens}
                onChange={(event) => update('maxTokens')(event.target.value)}
                placeholder="Model default"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-temperature`}>temperature</Label>
              <Input
                id={`${fieldId}-temperature`}
                type="number"
                inputMode="decimal"
                min={0}
                max={2}
                step={0.1}
                value={draft.temperature}
                onChange={(event) => update('temperature')(event.target.value)}
                placeholder="Model default"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={!canSend} aria-busy={sending}>
              {sending ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
              {sending ? 'Sending' : 'Send request'}
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-expanded={showCode}
              onClick={() => setShowCode((value) => !value)}
            >
              {showCode ? 'Hide code' : 'Show code'}
            </Button>
          </div>
        </form>

        {showCode && code ? (
          <div className="mt-4 rounded-lg border border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="text-xs text-muted-foreground">
                curl with an API key in <code>AGI_API_KEY</code>
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => void copyCode()}>
                {copyState === 'copied'
                  ? 'Copied'
                  : copyState === 'failed'
                    ? 'Copy failed'
                    : 'Copy'}
              </Button>
            </div>
            <pre className="max-h-80 overflow-auto p-3 font-mono text-xs text-foreground">
              {code}
            </pre>
          </div>
        ) : null}

        <div aria-live="polite" className="mt-4">
          {failure ? (
            <p role="alert" className="text-sm text-danger">
              {failure.status ? `${failure.status}: ${failure.message}` : failure.message}
            </p>
          ) : null}
          {result ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Answered by <code className="font-mono">{result.model}</code> in{' '}
                {result.latencyMs.toLocaleString()} ms
                {result.promptTokens !== null && result.completionTokens !== null
                  ? `, ${result.promptTokens.toLocaleString()} tokens in and ${result.completionTokens.toLocaleString()} out`
                  : ''}
              </p>
              <div className="whitespace-pre-wrap rounded-lg border border-border p-3 text-sm text-foreground">
                {result.content || 'The model returned no text.'}
              </div>
              {result.remaining !== null && result.limit !== null ? (
                <p className="text-xs text-muted-foreground">
                  {result.remaining} of {result.limit} chat completion requests left in this window
                  {resetTime && !Number.isNaN(resetTime.getTime())
                    ? `, which resets at ${resetTime.toLocaleTimeString()}`
                    : ''}
                  .
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
