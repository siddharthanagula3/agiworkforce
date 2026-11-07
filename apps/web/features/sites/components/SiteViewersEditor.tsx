'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button, Spinner } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import { changeSiteViewer, listSiteViewers, type SiteViewer } from '../services/sites-service';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SiteViewersEditor({ token }: { token: string }) {
  return <SiteViewersSession key={token} token={token} />;
}

type Status = 'loading' | 'ready' | 'changing' | 'error';
type Request = { controller: AbortController | null };

function SiteViewersSession({ token }: { token: string }) {
  const [viewers, setViewers] = useState<SiteViewer[] | null>(null);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const phase = useRef<Status>('loading');
  const request = useRef<Request | null>(null);

  const load = useCallback(async () => {
    if (!mounted.current || request.current !== null) return;
    const controller = new AbortController();
    const operation: Request = { controller };
    request.current = operation;
    phase.current = 'loading';
    setStatus('loading');
    setError(null);
    try {
      const next = await listSiteViewers(token, controller.signal);
      if (!mounted.current || request.current !== operation) return;
      setViewers(next);
      phase.current = 'ready';
      setStatus('ready');
    } catch (caught) {
      if (!mounted.current || request.current !== operation) return;
      setViewers(null);
      phase.current = 'error';
      setStatus('error');
      setError(toUserMessage(caught, 'Failed to load who this site is shared with'));
    } finally {
      if (request.current === operation) request.current = null;
    }
  }, [token]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      request.current?.controller?.abort();
      request.current = null;
      phase.current = 'loading';
    };
  }, [load]);

  const change = async (address: string, action: 'add' | 'remove') => {
    if (!mounted.current || phase.current !== 'ready' || request.current !== null) return;
    const operation: Request = { controller: null };
    request.current = operation;
    phase.current = 'changing';
    setStatus('changing');
    setError(null);
    try {
      const next = await changeSiteViewer(token, address, action);
      if (!mounted.current || request.current !== operation) return;
      setViewers(next);
      if (action === 'add') setEmail('');
      phase.current = 'ready';
      setStatus('ready');
    } catch {
      if (!mounted.current || request.current !== operation) return;
      setViewers(null);
      phase.current = 'error';
      setStatus('error');
      setError(
        'The sharing change could not be confirmed. Access may have changed. Retry loading the list before making more changes.',
      );
    } finally {
      if (request.current === operation) request.current = null;
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!mounted.current || phase.current !== 'ready' || request.current !== null) return;
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) {
      setError('Enter a full email address');
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
          onChange={(event) => setEmail(event.target.value)}
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
        <Button type="button" size="sm" onClick={() => void load()}>
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
          Nobody yet. Add the email address each person signs in with, then send them the link.
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
