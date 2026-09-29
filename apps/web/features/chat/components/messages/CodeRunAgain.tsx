'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Square } from '@agiworkforce/icons';
import {
  ChatCodeRunResponseSchema,
  chatCodeRunPath,
  type ChatCodeRunResponse,
} from '@agiworkforce/cloud-contracts';
import { Spinner } from '@agiworkforce/ui';
import { useCapability } from '@agiworkforce/unified-chat';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { cn } from '@shared/lib/utils';

const RUN_AGAIN_LABEL = 'Run again';
const STOP_LABEL = 'Stop';
const RUNNING_LABEL = 'Running';
const OUTPUT_LABEL = 'Output';
const ERROR_LABEL = 'Error';
const NO_OUTPUT = '(no output)';
const RUN_FAILED = 'The code did not run.';
const BASE64_IMAGE_DATA = /^[A-Za-z0-9+/]+={0,2}$/;
const BUTTON_CLASS =
  'inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60';
const PRE_CLASS =
  'max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-compact px-3 py-2 font-mono text-xs leading-relaxed';

interface CodeRunAgainProps {
  conversationId: string;
  language: string;
  code: string;
}

async function runCode(
  conversationId: string,
  language: string,
  code: string,
  signal: AbortSignal,
): Promise<ChatCodeRunResponse> {
  const response = await fetch(chatCodeRunPath(conversationId), {
    method: 'POST',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ language, code }),
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? (payload as { error?: { message?: unknown } }).error?.message
        : undefined;
    throw Object.assign(new Error(typeof message === 'string' ? message : ''), {
      status: response.status,
    });
  }
  return ChatCodeRunResponseSchema.parse(payload);
}

export function CodeRunAgain({ conversationId, language, code }: CodeRunAgainProps) {
  const allowed = useCapability('canUseCloudExecution');
  const controller = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ChatCodeRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(async () => {
    const run = new AbortController();
    controller.current = run;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      setResult(await runCode(conversationId, language, code, run.signal));
    } catch (cause) {
      if (!run.signal.aborted) setError(toUserMessage(cause, RUN_FAILED));
    } finally {
      if (controller.current === run) controller.current = null;
      setRunning(false);
    }
  }, [conversationId, language, code]);

  const stop = useCallback(() => {
    controller.current?.abort();
  }, []);

  if (!allowed) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {running ? (
          <>
            <button type="button" className={BUTTON_CLASS} onClick={stop}>
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
              {STOP_LABEL}
            </button>
            <Spinner className="h-3.5 w-3.5 text-muted-foreground" aria-label={RUNNING_LABEL} />
          </>
        ) : (
          <button type="button" className={BUTTON_CLASS} onClick={() => void start()}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {RUN_AGAIN_LABEL}
          </button>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-[var(--chat-destructive-text)]">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{OUTPUT_LABEL}</p>
            <pre className={cn(PRE_CLASS, 'bg-background/60 text-foreground')}>
              {result.output || NO_OUTPUT}
            </pre>
          </div>
          {result.error ? (
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--chat-destructive-text)]">
                {ERROR_LABEL}
              </p>
              <pre
                className={cn(
                  PRE_CLASS,
                  'border border-[var(--chat-destructive)]/20 bg-[var(--chat-destructive)]/5 text-[var(--chat-destructive-text)]',
                )}
              >
                {result.error}
              </pre>
            </div>
          ) : null}
          {result.images
            .filter((image) => BASE64_IMAGE_DATA.test(image))
            .map((image, index) => (
              <img
                key={index}
                src={`data:image/png;base64,${image}`}
                alt={`Code output ${index + 1}`}
                className="max-w-full rounded-compact border border-border/40"
              />
            ))}
        </div>
      ) : null}
    </div>
  );
}
