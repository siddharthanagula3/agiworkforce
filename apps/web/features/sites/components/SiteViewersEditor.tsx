'use client';

import { useCallback, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button, Spinner } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import type { RequestAuthority } from '@/lib/identity/request-authority';
import { isPublicationLeaseCurrent, usePublishedSitesStore } from '../stores/published-sites-store';
import { changeSiteViewer, listSiteViewers, type SiteViewer } from '../services/sites-service';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SiteViewersEditor({ token }: { token: string }) {
  const lease = usePublishedSitesStore((store) => store.lease);
  return <SiteViewersSession key={JSON.stringify([token, lease?.epoch])} token={token} />;
}

type Status = 'loading' | 'ready' | 'changing' | 'error';
type ViewerState = { status: Status; viewers: SiteViewer[] | null; error: string | null };
type ViewerRequest = Pick<
  RequestAuthority,
  'assertCurrent' | 'fetch' | 'isCurrent' | 'retire' | 'signal'
>;
type ViewerLane = { active: boolean; request: ViewerRequest | null; result: ViewerState };

function createViewerRequest(owns: () => boolean): ViewerRequest {
  const controller = new AbortController();
  const retire = () => controller.abort();
  const isCurrent = () => {
    if (!owns()) retire();
    return !controller.signal.aborted;
  };
  const assertCurrent = () => {
    if (!isCurrent()) throw new DOMException('Site viewers owner changed', 'AbortError');
  };
  return {
    isCurrent,
    assertCurrent,
    retire,
    signal: controller.signal,
    fetch: (input, init) => {
      assertCurrent();
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      return fetch(input, {
        ...init,
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      });
    },
  };
}

function SiteViewersSession({ token }: { token: string }) {
  const lease = usePublishedSitesStore((store) => store.lease);
  const activation = useRef<ViewerLane | null>(null);
  const [view, setView] = useState<{ lane: ViewerLane | null; result: ViewerState }>({
    lane: null,
    result: { status: 'loading', viewers: null, error: null },
  });
  const [email, setEmail] = useState('');
  const current = useCallback(
    (lane: ViewerLane) =>
      lane.active && activation.current === lane && isPublicationLeaseCurrent(lease),
    [lease],
  );
  const publish = useCallback(
    (lane: ViewerLane, result: ViewerState) => {
      if (!current(lane)) return;
      lane.result = result;
      setView((previous) =>
        current(lane) && lane.result === result ? { lane, result } : previous,
      );
    },
    [current],
  );

  const load = useCallback(
    async (lane: ViewerLane) => {
      if (!current(lane) || lane.request) return;
      const operation = createViewerRequest(() => current(lane) && lane.request === operation);
      lane.request = operation;
      publish(lane, { status: 'loading', viewers: null, error: null });
      try {
        const viewers = await listSiteViewers(token, operation.signal, operation);
        if (operation.isCurrent()) publish(lane, { status: 'ready', viewers, error: null });
      } catch (caught) {
        if (operation.isCurrent())
          publish(lane, {
            status: 'error',
            viewers: null,
            error: toUserMessage(caught, 'Failed to load who this site is shared with'),
          });
      } finally {
        if (lane.request === operation) lane.request = null;
        operation.retire();
      }
    },
    [current, publish, token],
  );

  useLayoutEffect(() => {
    const lane: ViewerLane = {
      active: true,
      request: null,
      result: { status: 'loading', viewers: null, error: null },
    };
    activation.current = lane;
    publish(lane, lane.result);
    void load(lane);
    return () => {
      lane.active = false;
      lane.request?.retire();
    };
  }, [load, publish]);

  const { lane, result } = view;
  const { status, viewers, error } = result;
  const accepts = () => lane !== null && current(lane) && lane.result === result && !lane.request;
  const retry = () => {
    if (lane && accepts() && status === 'error') void load(lane);
  };

  const change = async (address: string, action: 'add' | 'remove') => {
    if (!lane || !accepts() || status !== 'ready') return;
    const operation = createViewerRequest(() => current(lane) && lane.request === operation);
    lane.request = operation;
    publish(lane, { status: 'changing', viewers: null, error: null });
    try {
      const viewers = await changeSiteViewer(token, address, action, operation);
      if (!operation.isCurrent()) return;
      publish(lane, { status: 'ready', viewers, error: null });
      if (action === 'add') setEmail('');
    } catch {
      if (operation.isCurrent())
        publish(lane, {
          status: 'error',
          viewers: null,
          error:
            'The sharing change could not be confirmed. Access may have changed. Retry loading the list before making more changes.',
        });
    } finally {
      if (lane.request === operation) lane.request = null;
      operation.retire();
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!lane || !accepts() || status !== 'ready') return;
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) {
      publish(lane, { ...result, error: 'Enter a full email address' });
      return;
    }
    void change(address, 'add');
  };

  return (
    <div className="flex flex-col gap-3" data-testid="site-viewers">
      <form onSubmit={submit} noValidate className="flex gap-2">
        <label htmlFor="site-viewer-email" className="sr-only">
          Email address to share with
        </label>
        <input
          id="site-viewer-email"
          type="email"
          value={email}
          onChange={(event) => {
            if (accepts() && status === 'ready') setEmail(event.target.value);
          }}
          placeholder="name@example.com"
          autoComplete="off"
          disabled={status !== 'ready'}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-[var(--chat-border)] bg-background px-3 text-sm text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
        />
        <Button
          type="submit"
          size="sm"
          disabled={status !== 'ready' || !email.trim()}
          data-testid="site-viewer-add"
        >
          Add
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-[var(--chat-destructive-text)]">
          {error}
        </p>
      ) : null}
      {status === 'error' ? (
        <Button type="button" size="sm" onClick={retry}>
          Retry
        </Button>
      ) : status === 'loading' || status === 'changing' ? (
        <div
          role="status"
          className="flex items-center gap-2 text-sm text-[var(--chat-text-secondary)]"
        >
          <Spinner size="sm" aria-hidden="true" />
          {status === 'changing' ? 'Updating access…' : 'Loading…'}
        </div>
      ) : viewers?.length === 0 ? (
        <p className="text-sm text-[var(--chat-text-secondary)]">
          Nobody yet. Add each person's sign-in email, then send them the link.
        </p>
      ) : (
        <ul
          aria-label="People this site is shared with"
          className="flex flex-col divide-y divide-[var(--chat-border-subtle)]"
        >
          {viewers?.map((viewer) => (
            <li
              key={viewer.email}
              className="flex min-h-11 items-center gap-2 text-sm text-[var(--chat-text-primary)]"
            >
              <span className="min-w-0 flex-1 truncate">{viewer.email}</span>
              <button
                type="button"
                disabled={status !== 'ready'}
                onClick={() => void change(viewer.email, 'remove')}
                aria-label={`Stop sharing with ${viewer.email}`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] disabled:opacity-50 sm:h-8 sm:w-8"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
