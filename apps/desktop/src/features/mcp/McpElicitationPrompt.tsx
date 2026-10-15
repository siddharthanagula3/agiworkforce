import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ExternalLink, MessageSquareText } from 'lucide-react';
import {
  elicitationFieldError,
  parseElicitationInputRequests,
  type ElicitationField,
  type ElicitationPrompt,
  type ElicitationResponse,
  type ElicitationValue,
} from '@agiworkforce/cloud-contracts';
import { mcp } from '@agiworkforce/desktop-command-client';
import { listen, type UnlistenFn } from '@agiworkforce/client-runtime';
import { Button } from '@/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/ui/Dialog';
import { Input } from '@/ui/Input';
import { isTauri } from '@/lib/tauri-mock';
import { openExternalUrl } from '@/utils/navigation';
import {
  cloudElicitationBridge,
  type CloudElicitationBridge,
  type CloudElicitationRequest,
} from '@/runtime/cloudToolInput';

type PendingPrompt = mcp.McpElicitationPrompt;
type McpElicitationResolved = mcp.McpElicitationResolved;
type McpElicitationAnswer = mcp.McpElicitationAnswer;
type FieldValues = Record<string, ElicitationValue | undefined>;

const INPUT_TYPES: Readonly<Record<string, string>> = {
  email: 'email',
  uri: 'url',
  date: 'date',
  'date-time': 'datetime-local',
};

/**
 * The host already validated the request; this parse maps the server's schema
 * onto the same field model the web card renders. A request the shared
 * contract cannot render is declined rather than approximated.
 */
export function toRenderablePrompt(prompt: PendingPrompt): ElicitationPrompt | null {
  const parsed = parseElicitationInputRequests({
    [prompt.id]: {
      method: 'elicitation/create',
      params:
        prompt.mode === 'url'
          ? { mode: 'url', message: prompt.message, url: prompt.url }
          : { mode: 'form', message: prompt.message, requestedSchema: prompt.requestedSchema },
    },
  });
  return parsed?.[0] ?? null;
}

function initialValues(prompt: ElicitationPrompt): FieldValues {
  if (prompt.mode !== 'form') return {};
  return Object.fromEntries(
    prompt.fields.map((field) => [
      field.name,
      field.kind === 'boolean' ? (field.default ?? false) : field.default,
    ]),
  );
}

function normalizeDateTime(field: ElicitationField, value: ElicitationValue | undefined) {
  if (field.kind !== 'string' || field.format !== 'date-time' || typeof value !== 'string') {
    return value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function fieldLabel(field: ElicitationField): string {
  return field.title ?? field.name;
}

function FieldControl({
  field,
  id,
  value,
  invalid,
  describedBy,
  onChange,
}: {
  field: ElicitationField;
  id: string;
  value: ElicitationValue | undefined;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: ElicitationValue | undefined) => void;
}) {
  const common = {
    id,
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
    'aria-required': field.required || undefined,
  };
  switch (field.kind) {
    case 'boolean':
      return (
        <input
          {...common}
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      );
    case 'enum':
      return (
        <select
          {...common}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value || undefined)}
        >
          <option value="">Choose…</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case 'multi_enum': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div {...common} role="group" className="flex flex-wrap gap-x-4 gap-y-1">
          {field.options.map((option) => (
            <label key={option.value} className="flex items-center gap-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={selected.includes(option.value)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((entry) => entry !== option.value),
                  )
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      );
    }
    case 'number':
    case 'integer':
      return (
        <Input
          {...common}
          type="number"
          inputMode={field.kind === 'integer' ? 'numeric' : 'decimal'}
          step={field.kind === 'integer' ? 1 : 'any'}
          min={field.minimum}
          max={field.maximum}
          value={typeof value === 'number' ? value : ''}
          onChange={(event) =>
            onChange(event.target.value === '' ? undefined : Number(event.target.value))
          }
        />
      );
    case 'string':
      return (
        <Input
          {...common}
          type={field.format ? (INPUT_TYPES[field.format] ?? 'text') : 'text'}
          minLength={field.minLength}
          maxLength={field.maxLength}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      );
  }
}

function secondsLeft(expiresAtMs: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
}

function isPunycodeHost(host: string): boolean {
  return host.split('.').some((label) => label.toLowerCase().startsWith('xn--'));
}

type ActivePrompt =
  | {
      source: 'local';
      id: string;
      serverName: string;
      prompt: ElicitationPrompt;
      local: PendingPrompt;
    }
  | {
      source: 'cloud';
      id: string;
      serverName: string;
      prompt: ElicitationPrompt;
      request: CloudElicitationRequest;
    };

export interface McpElicitationPromptProps {
  fetcher?: () => Promise<PendingPrompt[]>;
  subscribe?: (handler: (prompt: PendingPrompt) => void) => Promise<UnlistenFn>;
  subscribeResolved?: (handler: (resolved: McpElicitationResolved) => void) => Promise<UnlistenFn>;
  respond?: (answer: McpElicitationAnswer) => Promise<void>;
  openUrl?: (id: string) => Promise<void>;
  cloudBridge?: Pick<CloudElicitationBridge, 'subscribe' | 'answer'>;
  openExternal?: (url: string) => Promise<void>;
  isTauriHost?: boolean;
}

/**
 * An MCP server asked the user for input in the middle of a call. The server's
 * message and labels are untrusted text and render as text only; a link step
 * shows the whole address with its host called out, and the app opens it in
 * the system browser only after the user chooses to.
 */
export function McpElicitationPrompt({
  fetcher,
  subscribe,
  subscribeResolved,
  respond,
  openUrl,
  cloudBridge = cloudElicitationBridge,
  openExternal = openExternalUrl,
  isTauriHost = isTauri,
}: McpElicitationPromptProps = {}) {
  const baseId = useId();
  const [queue, setQueue] = useState<PendingPrompt[]>([]);
  const [cloudQueue, setCloudQueue] = useState<CloudElicitationRequest[]>([]);
  const [values, setValues] = useState<FieldValues>({});
  const [opened, setOpened] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const declinedUnrenderable = useRef(new Set<string>());

  const effectiveFetcher = fetcher ?? mcp.mcpListPendingElicitations;
  const effectiveRespond = respond ?? mcp.mcpRespondElicitation;
  const effectiveOpenUrl = openUrl ?? mcp.mcpOpenElicitationUrl;
  const effectiveSubscribe = useMemo(
    () =>
      subscribe ??
      ((handler: (prompt: PendingPrompt) => void) =>
        listen<PendingPrompt>(mcp.MCP_ELICITATION_REQUEST_EVENT, handler)),
    [subscribe],
  );
  const effectiveSubscribeResolved = useMemo(
    () =>
      subscribeResolved ??
      ((handler: (resolved: McpElicitationResolved) => void) =>
        listen<McpElicitationResolved>(mcp.MCP_ELICITATION_RESOLVED_EVENT, handler)),
    [subscribeResolved],
  );

  const current = queue[0];
  const localPrompt = useMemo(() => (current ? toRenderablePrompt(current) : null), [current]);
  const active = useMemo<ActivePrompt | null>(() => {
    if (current && localPrompt) {
      return {
        source: 'local',
        id: current.id,
        serverName: current.serverName,
        prompt: localPrompt,
        local: current,
      };
    }
    if (current) return null;
    const request = cloudQueue.find((entry) => entry.prompts.length > 0);
    const first = request?.prompts[0];
    if (!request || !first) return null;
    return {
      source: 'cloud',
      id: `${request.toolCallId}:${first.key}`,
      serverName: request.toolName,
      prompt: first,
      request,
    };
  }, [cloudQueue, current, localPrompt]);
  const prompt = active?.prompt ?? null;
  const pendingCount =
    queue.length + cloudQueue.reduce((total, entry) => total + entry.prompts.length, 0);

  useEffect(() => {
    if (!isTauriHost) return;
    let cancelled = false;
    void effectiveFetcher()
      .then((pending) => {
        if (!cancelled) setQueue(pending);
      })
      .catch(() => {
        if (!cancelled) setError('Requests from connected servers could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveFetcher, isTauriHost]);

  useEffect(() => {
    if (!isTauriHost) return;
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];
    const keep = (unlisten: UnlistenFn) => {
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    };
    void (async () => {
      keep(
        await effectiveSubscribe((incoming) => {
          setQueue((existing) => [
            ...existing.filter((entry) => entry.id !== incoming.id),
            incoming,
          ]);
        }),
      );
      keep(
        await effectiveSubscribeResolved((resolved) => {
          setQueue((existing) => existing.filter((entry) => entry.id !== resolved.id));
        }),
      );
    })();
    return () => {
      disposed = true;
      for (const unlisten of unlisteners) unlisten();
    };
  }, [effectiveSubscribe, effectiveSubscribeResolved, isTauriHost]);

  useEffect(() => {
    if (!isTauriHost) return;
    return cloudBridge.subscribe(setCloudQueue);
  }, [cloudBridge, isTauriHost]);

  useEffect(() => {
    setValues(prompt ? initialValues(prompt) : {});
    setOpened(false);
    setSubmitted(false);
    setError(null);
  }, [prompt]);

  useEffect(() => {
    if (!current) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [current]);

  const sendLocal = useCallback(
    async (answer: McpElicitationAnswer) => {
      setBusy(true);
      setError(null);
      try {
        await effectiveRespond(answer);
        setQueue((existing) => existing.filter((entry) => entry.id !== answer.id));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [effectiveRespond],
  );

  const send = useCallback(
    async (response: ElicitationResponse) => {
      if (!active) return;
      if (active.source === 'local') {
        await sendLocal(
          response.action === 'accept'
            ? {
                id: active.id,
                action: 'accept',
                ...(response.content ? { content: response.content } : {}),
              }
            : { id: active.id, action: response.action },
        );
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await cloudBridge.answer(active.request.toolCallId, active.prompt.key, response);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [active, cloudBridge, sendLocal],
  );

  useEffect(() => {
    if (!current || localPrompt || declinedUnrenderable.current.has(current.id)) return;
    declinedUnrenderable.current.add(current.id);
    void sendLocal({ id: current.id, action: 'decline' });
  }, [current, localPrompt, sendLocal]);

  const errors = useMemo(() => {
    const found: Record<string, string> = {};
    if (prompt?.mode !== 'form') return found;
    for (const field of prompt.fields) {
      const value = values[field.name];
      const empty = value === undefined || value === '';
      const message = empty
        ? field.required
          ? 'is required'
          : null
        : elicitationFieldError(field, normalizeDateTime(field, value));
      if (message) found[field.name] = `${fieldLabel(field)} ${message}.`;
    }
    return found;
  }, [prompt, values]);

  if (!isTauriHost || !active || !prompt) return null;

  const serverName = active.serverName;
  const remaining = active.source === 'local' ? secondsLeft(active.local.expiresAtMs, now) : null;
  const hostIsPunycode =
    prompt.mode === 'url' &&
    (active.source === 'local' ? active.local.urlHostIsPunycode : isPunycodeHost(prompt.host));

  const submit = () => {
    setSubmitted(true);
    if (prompt.mode === 'url') {
      if (!opened) return;
      void send({ action: 'accept' });
      return;
    }
    if (Object.keys(errors).length > 0) return;
    const content: Record<string, ElicitationValue> = {};
    for (const field of prompt.fields) {
      const value = normalizeDateTime(field, values[field.name]);
      if (value !== undefined && value !== '') content[field.name] = value;
    }
    void send({ action: 'accept', content });
  };

  const openLink = async () => {
    setBusy(true);
    setError(null);
    try {
      if (active.source === 'local') await effectiveOpenUrl(active.id);
      else if (prompt.mode === 'url') await openExternal(prompt.url);
      setOpened(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) void send({ action: 'cancel' });
      }}
    >
      <DialogContent
        disableAnimation
        hideCloseButton
        className="z-[var(--z-fullscreen)] flex max-h-[calc(100vh-3rem)] w-[min(36rem,calc(100vw-3rem))] max-w-none flex-col gap-0 overflow-hidden border-border bg-card p-0 shadow-2xl"
        overlayProps={{ className: 'z-[var(--z-fullscreen)] bg-background/80' }}
        data-testid="mcp-elicitation-prompt"
      >
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex items-start gap-3 border-b border-border px-5 py-4">
            <span className="rounded-xl bg-muted p-2 text-foreground">
              <MessageSquareText className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold">
                {serverName} needs your input
              </DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {pendingCount > 1 ? `1 of ${pendingCount} requests. ` : ''}
                {remaining === null
                  ? ''
                  : remaining > 0
                    ? `The server stops waiting in ${remaining} seconds.`
                    : 'The server has stopped waiting.'}
              </p>
            </div>
          </div>

          <fieldset disabled={busy} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <DialogDescription className="whitespace-pre-wrap break-words text-sm text-foreground">
              {prompt.message}
            </DialogDescription>

            {prompt.mode === 'url' ? (
              <div className="space-y-2">
                <p className="break-all rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs text-foreground">
                  {prompt.url}
                </p>
                <p className="text-sm text-foreground">
                  Opens <span className="font-semibold">{prompt.host}</span> in your browser.
                  Nothing from this chat is sent to it.
                </p>
                {hostIsPunycode ? (
                  <p role="alert" className="text-sm text-warning-text">
                    This address uses look-alike characters. Check it before you open it.
                  </p>
                ) : null}
                <Button type="button" variant="outline" onClick={() => void openLink()}>
                  <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                  Open {prompt.host}
                </Button>
                {opened ? (
                  <p className="text-sm text-muted-foreground">
                    Finish in your browser, then continue here.
                  </p>
                ) : null}
              </div>
            ) : (
              prompt.fields.map((field) => {
                const id = `${baseId}-${field.name}`;
                const fieldError = submitted ? errors[field.name] : undefined;
                const hintId = field.description || fieldError ? `${id}-hint` : undefined;
                return (
                  <div
                    key={field.name}
                    className={
                      field.kind === 'boolean' ? 'flex items-center gap-2' : 'flex flex-col gap-1'
                    }
                  >
                    <label htmlFor={id} className="text-sm font-medium text-foreground">
                      {fieldLabel(field)}
                      {field.required ? <span aria-hidden="true"> *</span> : null}
                    </label>
                    <FieldControl
                      field={field}
                      id={id}
                      value={values[field.name]}
                      invalid={Boolean(fieldError)}
                      {...(hintId ? { describedBy: hintId } : {})}
                      onChange={(value) =>
                        setValues((existing) => ({ ...existing, [field.name]: value }))
                      }
                    />
                    {hintId ? (
                      <p
                        id={hintId}
                        className={
                          fieldError ? 'text-sm text-danger-text' : 'text-sm text-muted-foreground'
                        }
                      >
                        {fieldError ?? field.description}
                      </p>
                    ) : null}
                  </div>
                );
              })
            )}

            {submitted && prompt.mode === 'url' && !opened ? (
              <p role="alert" className="text-sm text-danger-text">
                Open the link first, then continue.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-danger-text">
                {error}
              </p>
            ) : null}
          </fieldset>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void send({ action: 'cancel' })}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void send({ action: 'decline' })}
            >
              Decline
            </Button>
            <Button type="submit" disabled={busy}>
              {prompt.mode === 'form' ? 'Submit' : 'Continue'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
