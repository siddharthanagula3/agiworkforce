'use client';

import { useId, useState } from 'react';
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

import {
  DEVELOPER_WEBHOOK_EVENTS,
  DEVELOPER_WEBHOOK_TEST_EVENT,
  developerWebhookRetryDays,
} from '@/lib/developer-api/webhook-events';
import { toUserMessage } from '@/lib/user-error-message';

import {
  useCreateWebhookEndpoint,
  useDeleteWebhookEndpoint,
  useRedeliverWebhook,
  useSendWebhookTest,
  useUpdateWebhookEndpoint,
  useWebhookDeliveries,
  useWebhookEndpoints,
  type WebhookEndpointDraft,
} from '../hooks/use-developer-webhooks';
import type { DeveloperWebhookDelivery, DeveloperWebhookEndpoint } from '../types';

const URL_MAX = 2048;
const DESCRIPTION_MAX = 200;
const COPIED_RESET_MS = 1600;

type EditorState = { mode: 'create' } | { mode: 'edit'; endpoint: DeveloperWebhookEndpoint } | null;

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
}: {
  state: Exclude<EditorState, null>;
  pending: boolean;
  onClose: () => void;
  onSubmit: (draft: WebhookEndpointDraft) => void;
}) {
  const fieldId = useId();
  const initial = state.mode === 'edit' ? state.endpoint : null;
  const [url, setUrl] = useState(initial?.url ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [eventTypes, setEventTypes] = useState<string[]>(initial?.eventTypes ?? []);
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
              eventTypes,
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
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
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

function SigningSecretDialog({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
    window.setTimeout(() => setCopied('idle'), COPIED_RESET_MS);
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

function DeliveryLog({ endpointId }: { endpointId: string }) {
  const deliveries = useWebhookDeliveries(endpointId, true);
  const redeliver = useRedeliverWebhook(endpointId);

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
              disabled={redeliver.isPending}
              onClick={() =>
                redeliver.mutate(delivery.id, {
                  onSuccess: () => toast.success('The event is queued to be sent again.'),
                  onError: (error) =>
                    toast.error(toUserMessage(error, 'The event could not be sent again.')),
                })
              }
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
}: {
  endpoint: DeveloperWebhookEndpoint;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [showDeliveries, setShowDeliveries] = useState(false);
  const sendTest = useSendWebhookTest(endpoint.id);
  const update = useUpdateWebhookEndpoint();
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
            disabled={sendTest.isPending || !endpoint.enabled}
            onClick={() =>
              sendTest.mutate(undefined, {
                onSuccess: () => {
                  setShowDeliveries(true);
                  toast.success('A test event is on its way.');
                },
                onError: (error) =>
                  toast.error(toUserMessage(error, 'The test event could not be sent.')),
              })
            }
          >
            Send test event
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={showDeliveries}
            aria-controls={logId}
            onClick={() => setShowDeliveries((value) => !value)}
          >
            {showDeliveries ? 'Hide deliveries' : 'Deliveries'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { endpointId: endpoint.id, patch: { enabled: !endpoint.enabled } },
                {
                  onError: (error) =>
                    toast.error(toUserMessage(error, 'The endpoint could not be saved.')),
                },
              )
            }
          >
            {endpoint.enabled ? 'Turn off' : 'Turn on'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
      {showDeliveries ? (
        <div id={logId} className="rounded-md border border-border px-3">
          <DeliveryLog endpointId={endpoint.id} />
        </div>
      ) : null}
    </li>
  );
}

export function WebhooksPanel() {
  const endpoints = useWebhookEndpoints();
  const create = useCreateWebhookEndpoint();
  const update = useUpdateWebhookEndpoint();
  const remove = useDeleteWebhookEndpoint();
  const { confirm, dialog } = useConfirmAction();
  const [editor, setEditor] = useState<EditorState>(null);
  const [secret, setSecret] = useState<string | null>(null);

  const save = (draft: WebhookEndpointDraft) => {
    if (!editor) return;
    const onError = (error: Error) =>
      toast.error(toUserMessage(error, 'The endpoint could not be saved.'));
    if (editor.mode === 'create') {
      create.mutate(draft, {
        onSuccess: (result) => {
          setEditor(null);
          setSecret(result.secret);
        },
        onError,
      });
    } else {
      update.mutate(
        { endpointId: editor.endpoint.id, patch: draft },
        { onSuccess: () => setEditor(null), onError },
      );
    }
  };

  const requestRemove = (endpoint: DeveloperWebhookEndpoint) =>
    confirm({
      title: `Remove ${hostOf(endpoint.url)}?`,
      description:
        'Events stop being sent to it at once, and its signing secret and delivery log are deleted. A removed endpoint cannot be restored; you would add it again with a new secret.',
      confirmLabel: 'Remove endpoint',
      onConfirm: async () => {
        try {
          await remove.mutateAsync(endpoint.id);
          toast.success(`${hostOf(endpoint.url)} no longer receives events.`);
        } catch (error) {
          toast.error(toUserMessage(error, 'The endpoint could not be removed.'));
        }
      },
    });

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
            onClick={() => setEditor({ mode: 'create' })}
            disabled={endpoints.isLoading || endpoints.isError}
          >
            Add endpoint
          </Button>
        </div>
      </CardHeader>
      <CardContent>
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
                onEdit={() => setEditor({ mode: 'edit', endpoint })}
                onRemove={() => requestRemove(endpoint)}
              />
            ))}
          </ul>
        )}
      </CardContent>
      {editor ? (
        <EndpointEditor
          key={editor.mode === 'edit' ? editor.endpoint.id : 'create'}
          state={editor}
          pending={create.isPending || update.isPending}
          onClose={() => setEditor(null)}
          onSubmit={save}
        />
      ) : null}
      {secret ? <SigningSecretDialog secret={secret} onDismiss={() => setSecret(null)} /> : null}
      {dialog}
    </Card>
  );
}
