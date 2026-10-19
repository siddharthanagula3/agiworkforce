'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button, Spinner } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import { changeSiteViewer, listSiteViewers, type SiteViewer } from '../services/sites-service';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SiteViewersEditor({ token }: { token: string }) {
  const [viewers, setViewers] = useState<SiteViewer[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setViewers(await listSiteViewers(token, signal));
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setViewers([]);
        setError(toUserMessage(caught, 'Failed to load who this site is shared with'));
      }
    },
    [token],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const change = async (address: string, action: 'add' | 'remove') => {
    setBusy(true);
    setError(null);
    try {
      setViewers(await changeSiteViewer(token, address, action));
      if (action === 'add') setEmail('');
    } catch (caught) {
      setError(
        toUserMessage(
          caught,
          action === 'add' ? 'Failed to share with that person' : 'Failed to remove that person',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
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
          disabled={busy}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-[var(--chat-border)] bg-background px-3 text-sm text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
        />
        <Button
          type="submit"
          size="sm"
          disabled={busy || !email.trim()}
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
      {viewers === null ? (
        <div
          role="status"
          className="flex items-center gap-2 text-sm text-[var(--chat-text-secondary)]"
        >
          <Spinner size="sm" aria-hidden="true" />
          Loading…
        </div>
      ) : viewers.length === 0 ? (
        <p className="text-sm text-[var(--chat-text-secondary)]">
          Nobody yet. Add the email address each person signs in with, then send them the link.
        </p>
      ) : (
        <ul
          aria-label="People this site is shared with"
          className="flex flex-col divide-y divide-[var(--chat-border-subtle)]"
        >
          {viewers.map((viewer) => (
            <li
              key={viewer.email}
              className="flex min-h-11 items-center gap-2 text-sm text-[var(--chat-text-primary)]"
            >
              <span className="min-w-0 flex-1 truncate">{viewer.email}</span>
              <button
                type="button"
                disabled={busy}
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
