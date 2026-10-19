'use client';

import { useId, useState, useSyncExternalStore } from 'react';
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
import { toUserMessage } from '@/lib/user-error-message';
import { formatRetirement, useGatewayModels } from '../hooks/use-gateway-models';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';

const CHAT_COMPLETIONS_PATH = '/api/llm/v1/chat/completions';
const AUTO_MODEL = 'auto';
const COPIED_RESET_MS = 1600;

interface CompletionToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface CompletionPayload {
  model?: string;
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: CompletionToolCall[] };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  x_agi_workforce?: { routing?: { resolved_model?: string } };
  error?: { message?: string };
}

interface PlaygroundToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface PlaygroundResult {
  content: string;
  toolCalls: PlaygroundToolCall[];
  finishReason: string | null;
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
  tools: string;
}

export function parseTools(text: string): { tools: unknown[] | null; error: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { tools: null, error: null };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return { tools: null, error: 'Tools must be a JSON array.' };
    return { tools: parsed, error: null };
  } catch {
    return { tools: null, error: 'Tools are not valid JSON.' };
  }
}

function prettyArguments(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function toolCallsOf(payload: CompletionPayload | null): PlaygroundToolCall[] {
  return (payload?.choices?.[0]?.message?.tool_calls ?? []).map((call, index) => ({
    id: call.id ?? `call-${index + 1}`,
    name: call.function?.name ?? 'unknown',
    arguments: prettyArguments(call.function?.arguments ?? ''),
  }));
}

function buildRequestBody(draft: RequestDraft): Record<string, unknown> {
  const system = draft.system.trim();
  const { tools } = parseTools(draft.tools);
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
    ...(tools ? { tools } : {}),
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
    tools: '',
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [failure, setFailure] = useState<PlaygroundError | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const update = (field: keyof RequestDraft) => (value: string) =>
    setDraft((previous) => ({ ...previous, [field]: value }));

  const toolsProblem = parseTools(draft.tools).error;
  const canSend = draft.message.trim().length > 0 && !sending && toolsProblem === null;

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
        toolCalls: toolCallsOf(payload),
        finishReason: payload?.choices?.[0]?.finish_reason ?? null,
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-tools`}>Tools</Label>
            <Textarea
              id={`${fieldId}-tools`}
              value={draft.tools}
              onChange={(event) => update('tools')(event.target.value)}
              rows={3}
              className="font-mono text-xs"
              aria-describedby={`${fieldId}-tools-help`}
              aria-invalid={toolsProblem !== null}
              placeholder='[{"type":"function","function":{"name":"get_weather","parameters":{"type":"object","properties":{"city":{"type":"string"}}}}}]'
            />
            <p id={`${fieldId}-tools-help`} className="text-xs text-muted-foreground">
              {toolsProblem ??
                'Optional. A JSON array of function tools; the calls the model makes are shown with their arguments.'}
            </p>
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
              {result.content || result.toolCalls.length === 0 ? (
                <div className="whitespace-pre-wrap rounded-lg border border-border p-3 text-sm text-foreground">
                  {result.content || 'The model returned no text.'}
                </div>
              ) : null}
              {result.toolCalls.length > 0 ? (
                <section aria-label="Tool calls" className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    Tool calls{result.finishReason ? ` · finish reason ${result.finishReason}` : ''}
                  </h3>
                  {result.toolCalls.map((call) => (
                    <div key={call.id} className="rounded-lg border border-border">
                      <p className="border-b border-border px-3 py-1.5 font-mono text-xs text-foreground">
                        {call.name}
                        <span className="text-muted-foreground"> · {call.id}</span>
                      </p>
                      <pre className="max-h-60 overflow-auto p-3 font-mono text-xs text-foreground">
                        {call.arguments}
                      </pre>
                    </div>
                  ))}
                </section>
              ) : null}
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
