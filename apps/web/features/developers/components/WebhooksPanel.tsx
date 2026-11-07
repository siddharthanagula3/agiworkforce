'use client';

import { useCallback, useId, useLayoutEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Spinner,
  useConfirmAction,
} from '@agiworkforce/ui';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import {
  DEVELOPER_WEBHOOK_EVENTS,
  DEVELOPER_WEBHOOK_TEST_EVENT,
  developerWebhookRetryDays,
} from '@/lib/developer-api/webhook-events';
import { toUserMessage } from '@/lib/user-error-message';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import { observeWorkspaceOwner, subscribeWorkspaceAdmission, workspaceOwnerIsCurrent,
  type WorkspaceOwner } from '@/features/workspaces/lib/workspace-admission';

import {
  useCreateWebhookEndpoint,
  useDeleteWebhookEndpoint,
  useRedeliverWebhook,
  useSendWebhookTest,
  useUpdateWebhookEndpoint,
  useWebhookDeliveries,
  useWebhookEndpoints,
  type WebhookEndpointDraft,
  type WebhookMutationScope,
  WebhookMutationRejectedError,
  WEBHOOKS_QUERY_KEY,
} from '../hooks/use-developer-webhooks';
import type { DeveloperWebhookDelivery, DeveloperWebhookEndpoint } from '../types';

const URL_MAX = 2048;
const DESCRIPTION_MAX = 200;
const COPIED_RESET_MS = 1600;

type EditorState = { mode: 'create' } | { mode: 'edit'; endpoint: DeveloperWebhookEndpoint } | null;

type Lifetime = { active: boolean; cancellations: Set<() => void> };
function retireLifetime(lifetime: Lifetime) {
  for (const cancel of [...lifetime.cancellations]) cancel();
  lifetime.cancellations.clear();
  lifetime.active = false;
}
function useLifetime() {
  const lifetime = useMemo<Lifetime>(() => ({ active: false, cancellations: new Set() }), []);
  useLayoutEffect(() => {
    lifetime.active = true;
    return () => retireLifetime(lifetime);
  }, [lifetime]);
  return lifetime;
}
type WebhookIntent = {
  id: number;
  generation: object;
  scope: WebhookMutationScope;
  editor: Exclude<EditorState, null> | null;
  phase: 'editing' | 'confirming' | 'writing' | 'done';
  dispatched: boolean;
  release: () => void;
};
type SecretView = { id: number; value: string; generation: object };
type View = { intent: WebhookIntent | null; error: string | null; notice: string | null };
const EMPTY: View = { intent: null, error: null, notice: null };
const UNCERTAIN = 'We could not confirm whether this webhook action completed. Refresh the endpoint and delivery state before repeating it.';
type RowAction = (action: 'test' | 'toggle' | 'resend', endpoint: DeveloperWebhookEndpoint,
  lifetime: Lifetime, deliveryId?: string, onSuccess?: () => void) => void;

const EVENT_LABELS = new Map<string, string>([
  ...DEVELOPER_WEBHOOK_EVENTS.map((event): [string, string] => [event.type, event.label]),
  [DEVELOPER_WEBHOOK_TEST_EVENT, 'Test event'],
]);

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function deliveryState(delivery: DeveloperWebhookDelivery): { label: string; alarming: boolean } {
  if (delivery.status === 'delivered') return { label: 'Delivered', alarming: false };
  if (delivery.status === 'failed') return { label: 'Failed', alarming: true };
  return {
    label: delivery.attempts > 0 ? `Retrying after ${delivery.attempts} attempts` : 'Queued',
    alarming: delivery.attempts > 0,
  };
}

function EndpointEditor({
  state,
  pending,
  onClose,
  onSubmit,
  error,
}: {
  state: Exclude<EditorState, null>;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (draft: WebhookEndpointDraft) => void;
}) {
  const fieldId = useId();
  const initial = state.mode === 'edit' ? state.endpoint : null;
  const [url, setUrl] = useState(initial?.url ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [eventTypes, setEventTypes] = useState<string[]>([...(initial?.eventTypes ?? [])]);
  const urlLooksRight = url.trim().startsWith('https://') && url.trim().length <= URL_MAX;
  const canSave = urlLooksRight && eventTypes.length > 0 && !pending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) return;
            onSubmit({
              url: url.trim(),
              description: description.trim() || null,
              eventTypes: [...eventTypes],
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{initial ? `Edit ${hostOf(initial.url)}` : 'Add an endpoint'}</DialogTitle>
            <DialogDescription>
              Events are sent as a POST with a JSON body to this URL, which must be public and use
              https.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-url`}>Endpoint URL</Label>
              <Input
                id={`${fieldId}-url`}
                type="url"
                inputMode="url"
                value={url}
                maxLength={URL_MAX}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/webhooks/agi"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-description`}>Description</Label>
              <Input
                id={`${fieldId}-description`}
                value={description}
                maxLength={DESCRIPTION_MAX}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional"
              />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">Events</legend>
              {DEVELOPER_WEBHOOK_EVENTS.map((event) => (
                <label key={event.type} className="flex cursor-pointer items-start gap-3">
                  <Checkbox
                    checked={eventTypes.includes(event.type)}
                    onCheckedChange={(checked) =>
                      setEventTypes((current) =>
                        checked === true
                          ? [...current, event.type]
                          : current.filter((type) => type !== event.type),
                      )
                    }
                  />
                  <span>
                    <span className="block text-sm text-foreground">
                      {event.label} <code className="font-mono text-xs">{event.type}</code>
                    </span>
                    <span className="block text-xs text-muted-foreground">{event.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
          {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave} aria-busy={pending}>
              {pending ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
              {initial ? 'Save' : 'Add endpoint'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SigningSecretDialog({ secret, isCurrent, onDismiss }: {
  secret: string; isCurrent: () => boolean; onDismiss: () => void;
}) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const lifetime = useLifetime();
  const copying = useMemo(() => ({ pending: false, timer: null as ReturnType<typeof setTimeout> | null }), []);
  useLayoutEffect(() => () => {
    if (copying.timer !== null) clearTimeout(copying.timer);
  }, [copying]);
  const current = () => lifetime.active && isCurrent();
  const copy = async () => {
    if (!current() || copying.pending) return;
    copying.pending = true;
    try {
      await navigator.clipboard.writeText(secret);
      if (!current()) return;
      setCopied('copied');
    } catch {
      if (!current()) return;
      setCopied('failed');
    } finally {
      copying.pending = false;
    }
    if (!current()) return;
    if (copying.timer !== null) clearTimeout(copying.timer);
    copying.timer = setTimeout(() => { if (current()) setCopied('idle'); }, COPIED_RESET_MS);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy the signing secret now</DialogTitle>
          <DialogDescription>
            It is shown once and cannot be recovered. Use it to check the webhook-signature header
            on every request, as the API docs describe.
          </DialogDescription>
        </DialogHeader>
        <code className="mt-4 block overflow-x-auto rounded-md border border-border px-3 py-2 font-mono text-xs text-foreground">
          {secret}
        </code>
        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => void copy()}>
            {copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy secret'}
          </Button>
          <Button type="button" onClick={onDismiss}>
            I have stored it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryLog({ endpoint, busy, onAction, lifetime }: {
  endpoint: DeveloperWebhookEndpoint; busy: boolean; onAction: RowAction; lifetime: Lifetime;
}) {
  const deliveries = useWebhookDeliveries(endpoint.id, true);
  useLayoutEffect(() => {
    lifetime.active = true;
    return () => retireLifetime(lifetime);
  }, [lifetime]);
  const snapshot = useMemo(() => ({}), [deliveries.data, deliveries.isLoading, deliveries.isError]);
  const live = useMemo(() => ({ snapshot }), []);
  useLayoutEffect(() => { live.snapshot = snapshot; }, [live, snapshot]);

  if (deliveries.isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Spinner size="sm" aria-hidden="true" />
        Loading deliveries
      </div>
    );
  }
  if (deliveries.isError) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-3">
        <p role="alert" className="text-xs text-danger">
          {toUserMessage(deliveries.error, 'Deliveries could not be loaded.')}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void deliveries.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  const rows = deliveries.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="py-3 text-xs text-muted-foreground">
        Nothing has been sent to this endpoint yet. Send a test event to try it.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border" aria-label="Recent deliveries">
      {rows.map((delivery) => {
        const state = deliveryState(delivery);
        return (
          <li
            key={delivery.id}
            className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs text-foreground">
                {EVENT_LABELS.get(delivery.eventType) ?? delivery.eventType}
                {delivery.redeliveryOf ? ', resent' : ''}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatWhen(delivery.lastAttemptAt ?? delivery.createdAt)}
                {delivery.responseStatus !== null ? `, answered ${delivery.responseStatus}` : ''}
              </span>
              <span
                className={`text-xs ${state.alarming ? 'text-danger' : 'text-muted-foreground'}`}
              >
                {state.label}
                {delivery.error && delivery.status !== 'delivered' ? `: ${delivery.error}` : ''}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (!lifetime.active || live.snapshot !== snapshot) return;
                onAction('resend', endpoint, lifetime, delivery.id);
              }}
            >
              Resend
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function EndpointRow({
  endpoint,
  onEdit,
  onRemove,
  onAction,
  busy,
}: {
  endpoint: DeveloperWebhookEndpoint;
  onEdit: (lifetime: Lifetime) => void;
  onRemove: (lifetime: Lifetime) => void;
  onAction: RowAction;
  busy: boolean;
}) {
  type LogView = { id: number; lifetime: Lifetime };
  const [log, setLog] = useState<LogView | null>(null);
  const logs = useMemo(() => ({ nextId: 0, current: null as LogView | null }), []);
  const openLog = () => {
    if (logs.current) return;
    const next = { id: ++logs.nextId, lifetime: { active: true, cancellations: new Set<() => void>() } };
    logs.current = next;
    setLog(next);
  };
  const lifetime = useLifetime();
  const snapshot = useMemo(() => ({}), [endpoint]);
  const live = useMemo(() => ({ snapshot }), []);
  useLayoutEffect(() => { live.snapshot = snapshot; }, [live, snapshot]);
  const current = () => lifetime.active && live.snapshot === snapshot;
  const captured = { ...endpoint, eventTypes: [...endpoint.eventTypes] };
  const logId = useId();

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-mono text-sm text-foreground">{endpoint.url}</span>
          {endpoint.description ? (
            <span className="text-xs text-muted-foreground">{endpoint.description}</span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {endpoint.eventTypes.map((type) => EVENT_LABELS.get(type) ?? type).join(', ')}
          </span>
          <span className="text-xs text-muted-foreground">
            {endpoint.enabled ? 'On' : 'Off, events are not sent'}, secret{' '}
            <code className="font-mono">{endpoint.secretPrefix}…</code>
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !endpoint.enabled}
            onClick={() => { if (current()) onAction('test', captured, lifetime, undefined, () => { if (current()) openLog(); }); }}
          >
            Send test event
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={!!log}
            aria-controls={logId}
            onClick={() => {
              if (!current() || logs.current !== log) return;
              if (log) {
                retireLifetime(log.lifetime);
                logs.current = null;
                setLog(null);
              } else openLog();
            }}
          >
            {log ? 'Hide deliveries' : 'Deliveries'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => { if (current()) onAction('toggle', captured, lifetime); }}
          >
            {endpoint.enabled ? 'Turn off' : 'Turn on'}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { if (current()) onEdit(lifetime); }}>
            Edit
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { if (current()) onRemove(lifetime); }}>
            Remove
          </Button>
        </div>
      </div>
      {log ? (
        <div id={logId} className="rounded-md border border-border px-3">
          <DeliveryLog key={log.id} endpoint={captured} busy={busy} onAction={onAction} lifetime={log.lifetime} />
        </div>
      ) : null}
    </li>
  );
}

function OwnedWebhooksPanel({ owner, epoch, scopeKey, organizationId }: {
  owner: WorkspaceOwner; epoch: number; scopeKey: string; organizationId: string | null;
}) {
  const endpoints = useWebhookEndpoints();
  const queryClient = useQueryClient();
  const create = useCreateWebhookEndpoint();
  const update = useUpdateWebhookEndpoint();
  const remove = useDeleteWebhookEndpoint();
  const sendTest = useSendWebhookTest();
  const redeliver = useRedeliverWebhook();
  const { confirm, dialog } = useConfirmAction();
  const lane = useMemo(() => ({ active: false, nextId: 0, generation: {} as object,
    intent: null as WebhookIntent | null, snapshot: null as object | null,
    secret: null as SecretView | null, lastCreate: null as WebhookIntent | null }), []);
  const [view, setView] = useState<View>(EMPTY);
  const [secret, setSecret] = useState<SecretView | null>(null);
  const ownerCurrent = useCallback(() => owner.phase === 'admitted' && owner.scopeKey === scopeKey &&
    workspaceOwnerIsCurrent(owner, epoch), [owner, epoch, scopeKey]);
  const current = (intent: WebhookIntent) => lane.active && lane.generation === intent.generation &&
    lane.intent === intent && ownerCurrent();
  const snapshot = useMemo(() => ({}), [endpoints.data, endpoints.isLoading, endpoints.isError]);
  useLayoutEffect(() => { lane.snapshot = snapshot; }, [lane, snapshot]);
  const resetCreate = create.reset;
  useLayoutEffect(() => {
    lane.active = true;
    lane.generation = {};
    setView(EMPTY);
    setSecret(null);
    const retire = () => {
      lane.active = false;
      lane.intent?.scope.request.retire();
      lane.intent?.release();
      lane.intent = null;
      lane.secret = null;
      lane.lastCreate = null;
      resetCreate();
    };
    const stop = subscribeWorkspaceAdmission(() => {
      if (!ownerCurrent()) { retire(); setView(EMPTY); setSecret(null); }
    });
    return () => { stop(); retire(); };
  }, [lane, ownerCurrent, resetCreate]);
  const finish = (intent: WebhookIntent, error: string | null = null, notice: string | null = null) => {
    if (!current(intent)) return;
    intent.phase = 'done';
    intent.scope.request.retire();
    intent.release();
    lane.intent = null;
    if (lane.lastCreate === intent) resetCreate();
    setView({ intent: null, error, notice });
  };
  const cancel = (intent: WebhookIntent) => finish(intent, null, intent.dispatched ? UNCERTAIN : null);
  const openIntent = (editor: WebhookIntent['editor'], lifetime?: Lifetime) => {
    if (!lane.active || !ownerCurrent() || lane.intent || lane.secret || lane.snapshot !== snapshot ||
      endpoints.isLoading || endpoints.isError || !endpoints.data || (lifetime && !lifetime.active)) return null;
    let intent: WebhookIntent;
    const request = createRequestAuthority(owner.session, () => current(intent), () => {
      if (intent.phase !== 'writing') throw new Error('The webhook action is no longer ready.');
      intent.dispatched = true;
    });
    const retire = () => cancel(intent);
    intent = { id: ++lane.nextId, generation: lane.generation, scope: { request, organizationId },
      editor: editor?.mode === 'edit'
        ? { mode: 'edit', endpoint: { ...editor.endpoint, eventTypes: [...editor.endpoint.eventTypes] } } : editor,
      phase: editor ? 'editing' : 'confirming', dispatched: false,
      release: () => lifetime?.cancellations.delete(retire) };
    lifetime?.cancellations.add(retire);
    lane.intent = intent;
    setView({ ...EMPTY, intent });
    return intent;
  };
  const failure = (intent: WebhookIntent, error: unknown) => {
    if (!current(intent)) return;
    if (intent.dispatched && !(error instanceof WebhookMutationRejectedError)) {
      finish(intent, null, UNCERTAIN);
    } else if (intent.editor) {
      intent.phase = 'editing';
      intent.dispatched = false;
      setView({ intent, notice: null, error: toUserMessage(error, 'The endpoint could not be saved. Check the details and try again.') });
    } else {
      finish(intent, toUserMessage(error, 'The webhook action was not completed. Try again.'));
    }
  };
  const save = async (intent: WebhookIntent, draft: WebhookEndpointDraft) => {
    if (!current(intent) || intent.phase !== 'editing' || !intent.editor) return;
    intent.phase = 'writing';
    intent.dispatched = false;
    setView({ ...EMPTY, intent });
    const captured = { ...draft, eventTypes: [...draft.eventTypes] };
    try {
      if (intent.editor.mode === 'create') {
        lane.lastCreate = intent;
        const result = await create.mutateAsync({ scope: intent.scope, draft: captured });
        if (!intent.scope.request.isCurrent()) return;
        const nextSecret = { id: intent.id, value: result.secret, generation: intent.generation };
        lane.secret = nextSecret;
        setSecret(nextSecret);
      } else {
        await update.mutateAsync({ scope: intent.scope, endpointId: intent.editor.endpoint.id, patch: captured });
        if (!intent.scope.request.isCurrent()) return;
      }
      finish(intent);
    } catch (error) {
      failure(intent, error);
    } finally {
      if (lane.lastCreate === intent) { resetCreate(); lane.lastCreate = null; }
    }
  };
  const requestRemove = (endpoint: DeveloperWebhookEndpoint, lifetime: Lifetime) => {
    const intent = openIntent(null, lifetime);
    if (!intent) return;
    const endpointId = endpoint.id;
    const host = hostOf(endpoint.url);
    confirm({
      title: `Remove ${host}?`,
      description: 'Events stop being sent to it at once, and its signing secret and delivery log are deleted. A removed endpoint cannot be restored; you would add it again with a new secret.',
      confirmLabel: 'Remove endpoint',
      onCancel: () => { if (intent.phase === 'confirming') finish(intent); },
      onConfirm: async () => {
        if (!current(intent) || intent.phase !== 'confirming') return;
        intent.phase = 'writing';
        setView({ ...EMPTY, intent });
        try {
          await remove.mutateAsync({ scope: intent.scope, endpointId });
          if (!intent.scope.request.isCurrent()) return;
          toast.success(`${host} no longer receives events.`);
          finish(intent);
        } catch (error) { failure(intent, error); }
      },
    });
  };
  const rowAction: RowAction = (action, endpoint, lifetime, deliveryId, onSuccess) => {
    if ((action === 'test' && !endpoint.enabled) || (action === 'resend' && !deliveryId)) return;
    const intent = openIntent(null, lifetime);
    if (!intent) return;
    const endpointId = endpoint.id;
    const enabled = !endpoint.enabled;
    intent.phase = 'writing';
    void (async () => {
      try {
        if (action === 'test') await sendTest.mutateAsync({ scope: intent.scope, endpointId });
        else if (action === 'toggle') await update.mutateAsync({ scope: intent.scope, endpointId, patch: { enabled } });
        else await redeliver.mutateAsync({ scope: intent.scope, endpointId, deliveryId: deliveryId! });
        if (!intent.scope.request.isCurrent()) return;
        onSuccess?.();
        if (action !== 'toggle') toast.success(action === 'test' ? 'A test event is on its way.' : 'The event is queued to be sent again.');
        finish(intent);
      } catch (error) { failure(intent, error); }
    })();
  };
  const editor = view.intent?.editor ?? null;
  const secretCurrent = (candidate: SecretView) => lane.active && ownerCurrent() &&
    lane.generation === candidate.generation && lane.secret === candidate;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-foreground">Webhooks</CardTitle>
            <CardDescription>
              Events are sent to your HTTPS endpoint as they happen, signed with the endpoint&apos;s
              secret. A delivery your endpoint does not accept with a 2xx is retried for about{' '}
              {developerWebhookRetryDays()} days, and you can resend any delivery.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => openIntent({ mode: 'create' })}
            disabled={endpoints.isLoading || endpoints.isError || !!view.intent || !!secret}
          >
            Add endpoint
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!editor && (view.error || view.notice) ? <p role={view.error ? 'alert' : 'status'} className="mb-3 text-sm">{view.error ?? view.notice}</p> : null}
        {view.notice ? <Button type="button" variant="outline" size="sm" disabled={endpoints.isFetching}
          onClick={() => {
            if (!lane.active || !ownerCurrent() || lane.intent || lane.snapshot !== snapshot) return;
            void queryClient.invalidateQueries({ queryKey: WEBHOOKS_QUERY_KEY });
          }}>Refresh webhook state</Button> : null}
        {endpoints.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner size="sm" aria-hidden="true" />
            Loading endpoints
          </div>
        ) : endpoints.isError ? (
          <div className="flex flex-wrap items-center gap-2 py-4">
            <p role="alert" className="text-sm text-danger">
              {toUserMessage(endpoints.error, 'Webhook endpoints could not be loaded.')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void endpoints.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : (endpoints.data ?? []).length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No endpoints yet. Add one to receive events without polling.
          </p>
        ) : (
          <ul className="divide-y divide-border" aria-label="Webhook endpoints">
            {(endpoints.data ?? []).map((endpoint) => (
              <EndpointRow
                key={endpoint.id}
                endpoint={endpoint}
                onEdit={(lifetime) => openIntent({ mode: 'edit', endpoint }, lifetime)}
                onRemove={(lifetime) => requestRemove(endpoint, lifetime)}
                onAction={rowAction}
                busy={!!view.intent || !!secret}
              />
            ))}
          </ul>
        )}
      </CardContent>
      {editor && view.intent ? (
        <EndpointEditor
          key={view.intent.id}
          state={editor}
          pending={view.intent.phase === 'writing'}
          error={view.error}
          onClose={() => cancel(view.intent!)}
          onSubmit={(draft) => { void save(view.intent!, draft); }}
        />
      ) : null}
      {secret ? <SigningSecretDialog key={secret.id} secret={secret.value}
        isCurrent={() => secretCurrent(secret)}
        onDismiss={() => {
          if (!secretCurrent(secret)) return;
          lane.secret = null;
          setSecret(null);
        }} /> : null}
      {view.intent?.phase === 'confirming' ? dialog : null}
    </Card>
  );
}

export function WebhooksPanel() {
  const workspace = useAccountWorkspaces();
  const capture = useSessionSnapshot();
  const owner = observeWorkspaceOwner(capture());
  const data = workspace.data;
  const scopeKey = data ? JSON.stringify([data.scope, data.activeWorkspaceId, data.activeOrganizationId]) : null;
  if (!owner || owner.phase !== 'admitted' || !data || scopeKey === null ||
    owner.scopeKey !== scopeKey || !workspaceOwnerIsCurrent(owner, owner.epoch)) {
    return <Card><CardHeader><CardTitle>Webhooks</CardTitle></CardHeader><CardContent>
      <p>{workspace.requiresReload
        ? 'Reload this page to confirm the current workspace before managing webhooks.'
        : 'Your current workspace must finish loading before you can manage webhooks.'}</p>
      {workspace.isUnavailable && !workspace.requiresReload && !workspace.isSwitching
        ? <Button onClick={() => { void workspace.refetch(); }}>Retry loading workspace</Button> : null}
    </CardContent></Card>;
  }
  return <OwnedWebhooksPanel key={`${owner.incarnation}:${owner.epoch}:${scopeKey}`}
    owner={owner} epoch={owner.epoch} scopeKey={scopeKey} organizationId={data.activeOrganizationId} />;
}
