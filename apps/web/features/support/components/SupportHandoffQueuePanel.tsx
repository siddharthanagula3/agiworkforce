'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Spinner } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { apiErrorMessage } from '@/shared/utils/api-error';
import { useHandoffThread } from '../hooks/useHandoffThread';
import {
  SUPPORT_MAX_MESSAGE_LENGTH,
  claimHandoffSession,
  fetchAgentActiveSessions,
  fetchAgentHandoffMessages,
  fetchAgentQueue,
  sendAgentHandoffMessage,
} from '../lib/support-client';
import {
  type HandoffPresenceState,
  type SupportHandoffClaimedView,
  type SupportHandoffQueueEntryView,
  SUPPORT_AGENT_PRESENCE_PATH,
} from '@agiworkforce/cloud-contracts/support';

const QUEUE_POLL_MS = 5000;

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-foreground/40';
const ACTION_CLASS =
  'rounded-full border border-border px-4 py-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50';

type ClaimedSession = SupportHandoffClaimedView;

function formatDeadline(value: string | null): string {
  if (!value) return 'no deadline recorded';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'no deadline recorded';
  const seconds = Math.max(0, Math.round((parsed - Date.now()) / 1000));
  return seconds === 0 ? 'past its deadline' : `${seconds}s left`;
}

function SessionContext({ session }: { session: ClaimedSession }) {
  const { transcript, attemptedActions, citations, accountContext } = session;
  if (
    transcript.length === 0 &&
    attemptedActions.length === 0 &&
    citations.length === 0 &&
    !accountContext
  ) {
    return null;
  }

  return (
    <details className="mt-3 rounded-xl border border-border px-3 py-2" open>
      <summary className="cursor-pointer text-xs font-medium">
        What the visitor already went through
      </summary>
      {accountContext ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {accountContext.signedIn ? 'Signed in' : 'Signed out'}
          {accountContext.planTier ? ` · plan ${accountContext.planTier}` : ''}
          {accountContext.subscriptionStatus ? ` · ${accountContext.subscriptionStatus}` : ''}
          {accountContext.usagePercentage !== null
            ? ` · ${String(Math.round(accountContext.usagePercentage))}% of usage used`
            : ''}
        </p>
      ) : null}
      {transcript.length > 0 ? (
        <ol
          className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto"
          aria-label="Earlier conversation"
        >
          {transcript.map((turn, index) => (
            <li key={`${String(index)}-${turn.at}`} data-role={turn.role} className="text-xs">
              <span className="font-medium">
                {turn.role === 'user'
                  ? 'Visitor'
                  : turn.role === 'assistant'
                    ? 'Assistant'
                    : 'Note'}
                :
              </span>{' '}
              {turn.content}
            </li>
          ))}
        </ol>
      ) : null}
      {attemptedActions.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1" aria-label="Actions already attempted">
          {attemptedActions.map((action, index) => (
            <li key={`${String(index)}-${action.at}`} className="text-xs text-muted-foreground">
              {action.action}: {action.outcome.replace('_', ' ')}
              {action.detail ? ` (${action.detail})` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {citations.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Sources shown: {citations.map((citation) => citation.title).join(', ')}
        </p>
      ) : null}
    </details>
  );
}

function AgentThread({
  session,
  draft,
  onDraftChange,
  onDismiss,
}: {
  session: ClaimedSession;
  draft: string;
  onDraftChange: (sessionId: string, value: string) => void;
  onDismiss: (sessionId: string) => void;
}) {
  const thread = useHandoffThread({
    sessionId: session.sessionId,
    pollIntervalMs: session.pollIntervalMs,
    load: fetchAgentHandoffMessages,
    send: sendAgentHandoffMessage,
  });

  const connected = thread.status === null || thread.status === 'connected';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!connected || thread.sending || body.length === 0) return;
    thread.send(body);
    onDraftChange(session.sessionId, '');
  };

  return (
    <section className={CARD_CLASS} aria-label={`Conversation ${session.referenceId}`}>
      <h3 className="text-h5">Reference {session.referenceId}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{session.summary}</p>
      {session.contactEmail ? (
        <p className="mt-1 text-xs text-muted-foreground">Reply-to {session.contactEmail}</p>
      ) : null}

      <SessionContext session={session} />

      <ol className="mt-4 flex max-h-72 flex-col gap-2 overflow-y-auto" aria-label="Messages">
        {thread.messages.map((message) => (
          <li
            key={message.seq}
            data-author={message.author}
            className={
              message.author === 'agent'
                ? 'self-end max-w-[85%] rounded-xl bg-muted px-3 py-2 text-sm'
                : message.author === 'user'
                  ? 'self-start max-w-[85%] rounded-xl border border-border px-3 py-2 text-sm'
                  : 'self-center text-xs text-muted-foreground'
            }
          >
            {message.body}
          </li>
        ))}
      </ol>

      {thread.loading && thread.messages.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Spinner size="sm" />
          <span>Loading the conversation…</span>
        </div>
      ) : null}

      {!thread.loading && thread.messages.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Nothing has been said yet.</p>
      ) : null}

      {thread.loadError ? (
        <p className="mt-3 text-xs text-danger" role="status">
          {thread.loadError}
        </p>
      ) : null}

      <form className="mt-4 flex gap-2" onSubmit={submit}>
        <label className="sr-only" htmlFor={`agent-reply-${session.sessionId}`}>
          Reply to this visitor
        </label>
        <textarea
          id={`agent-reply-${session.sessionId}`}
          className={FIELD_CLASS}
          rows={2}
          value={draft}
          maxLength={SUPPORT_MAX_MESSAGE_LENGTH}
          disabled={!connected || thread.sending}
          placeholder={connected ? 'Reply to this visitor' : 'This conversation is closed.'}
          onChange={(event) => {
            onDraftChange(session.sessionId, event.target.value);
            if (thread.sendError) thread.clearSendError();
          }}
        />
        <button
          type="submit"
          className={ACTION_CLASS}
          disabled={!connected || thread.sending || draft.trim().length === 0}
        >
          {thread.sending ? 'Sending…' : 'Send'}
        </button>
      </form>

      {!connected ? (
        <div className="mt-2 flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            This conversation is {thread.status}, so it takes no more messages.
          </p>
          <button
            type="button"
            className={ACTION_CLASS}
            onClick={() => onDismiss(session.sessionId)}
          >
            Done
          </button>
        </div>
      ) : null}

      {thread.sendError ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {thread.sendError}
        </p>
      ) : null}
    </section>
  );
}

function PresenceControl() {
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heartbeat, setHeartbeat] = useState<{ name: string; intervalMs: number } | null>(null);

  const post = useCallback(async (status: 'online' | 'offline', name: string) => {
    const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch(SUPPORT_AGENT_PRESENCE_PATH, {
      method: 'POST',
      headers,
      body: JSON.stringify({ status, displayName: name }),
    });
    const body = (await response.json().catch(() => null)) as {
      presence?: Partial<HandoffPresenceState>;
      warning?: string;
    } | null;
    if (!response.ok) {
      throw new Error(apiErrorMessage(body, `Request failed (${response.status})`));
    }
    return body;
  }, []);

  const set = useCallback(
    async (status: 'online' | 'offline') => {
      const name = displayName.trim();
      if (name.length === 0) {
        setError('Add the name visitors should see before going online.');
        return;
      }
      setSaving(true);
      setError(null);
      if (status === 'offline') setHeartbeat(null);
      try {
        const body = await post(status, name);
        const resolved = body?.presence?.status ?? status;
        const intervalMs = body?.presence?.heartbeatIntervalMs;
        setState(resolved);
        setWarning(body?.warning ?? null);
        setHeartbeat(
          resolved === 'online' && typeof intervalMs === 'number' && intervalMs > 0
            ? { name, intervalMs }
            : null,
        );
      } catch (cause) {
        setError(toUserMessage(cause, 'Could not update your presence.'));
      } finally {
        setSaving(false);
      }
    },
    [displayName, post],
  );

  useEffect(() => {
    if (!heartbeat) return;
    const timer = window.setInterval(() => {
      post('online', heartbeat.name).then(
        () => setError(null),
        (cause: unknown) =>
          setError(toUserMessage(cause, 'Could not keep you online. Visitors may not reach you.')),
      );
    }, heartbeat.intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [heartbeat, post]);

  return (
    <section className={CARD_CLASS} aria-label="Your availability">
      <h3 className="text-h5">Your availability</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Visitors are offered live chat only while someone is online, so nothing reaches the queue
        below until you are.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="support-agent-display-name">
          Name visitors see
        </label>
        <input
          id="support-agent-display-name"
          className={`${FIELD_CLASS} max-w-xs`}
          value={displayName}
          maxLength={60}
          placeholder="Name visitors see"
          onChange={(event) => {
            setDisplayName(event.target.value);
            if (error) setError(null);
          }}
        />
        <button
          type="button"
          className={ACTION_CLASS}
          disabled={saving}
          onClick={() => void set('online')}
        >
          Go online
        </button>
        <button
          type="button"
          className={ACTION_CLASS}
          disabled={saving}
          onClick={() => void set('offline')}
        >
          Go offline
        </button>
      </div>
      {state ? <p className="mt-2 text-xs text-muted-foreground">You are {state}.</p> : null}
      {warning ? (
        <p className="mt-2 text-xs text-danger" role="status">
          {warning}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function SupportHandoffQueuePanel() {
  const [queue, setQueue] = useState<SupportHandoffQueueEntryView[] | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ClaimedSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeError, setActiveError] = useState<string | null>(null);
  const mounted = useRef(true);
  const activeRestored = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const adopt = useCallback((incoming: ClaimedSession[]) => {
    setSessions((current) => {
      const known = new Set(current.map((entry) => entry.sessionId));
      const added = incoming.filter((entry) => !known.has(entry.sessionId));
      return added.length > 0 ? [...current, ...added] : current;
    });
    setSelectedId((current) => current ?? incoming[0]?.sessionId ?? null);
  }, []);

  const load = useCallback(async () => {
    const [next, active] = await Promise.all([
      fetchAgentQueue(),
      activeRestored.current ? Promise.resolve(null) : fetchAgentActiveSessions(),
    ]);
    if (!mounted.current) return;
    if (active) {
      activeRestored.current = true;
      setActiveError(null);
      adopt(active);
    } else if (!activeRestored.current) {
      setActiveError('Conversations you already took could not be read just now.');
    }
    if (!next) {
      setQueueError('The waiting queue could not be read just now.');
      return;
    }
    setQueueError(null);
    setQueue(next);
  }, [adopt]);

  const changeDraft = useCallback((sessionId: string, value: string) => {
    setDrafts((current) => ({ ...current, [sessionId]: value }));
  }, []);

  const dismiss = useCallback((sessionId: string) => {
    setSessions((current) => current.filter((entry) => entry.sessionId !== sessionId));
    setDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => id !== sessionId)),
    );
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, QUEUE_POLL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [load]);

  const claim = useCallback(
    async (entry: SupportHandoffQueueEntryView) => {
      setClaiming(entry.sessionId);
      setClaimError(null);
      const result = await claimHandoffSession(entry.sessionId);
      if (!mounted.current) return;
      setClaiming(null);
      if (!result.ok) {
        setClaimError(result.message);
        void load();
        return;
      }
      const taken = {
        ...result.session,
        referenceId: result.session.referenceId || entry.referenceId,
        summary: result.session.summary || entry.summary,
      };
      adopt([taken]);
      setSelectedId(taken.sessionId);
      void load();
    },
    [adopt, load],
  );

  const selected = sessions.find((entry) => entry.sessionId === selectedId) ?? sessions[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PresenceControl />

      <section className={CARD_CLASS} aria-label="Visitors waiting">
        <h3 className="text-h5">Visitors waiting</h3>

        {queue === null && !queueError ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Spinner size="sm" />
            <span>Reading the queue…</span>
          </div>
        ) : null}

        {queueError ? (
          <p className="mt-3 text-xs text-danger" role="status">
            {queueError}
          </p>
        ) : null}

        {queue !== null && queue.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Nobody is waiting. A request appears here only while it is still inside its wait
            deadline; past that it is emailed to the team instead.
          </p>
        ) : null}

        {queue !== null && queue.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {queue.map((entry) => (
              <li
                key={entry.sessionId}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm">{entry.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.referenceId} · {entry.signedIn ? 'signed in' : 'signed out'} ·{' '}
                    {formatDeadline(entry.waitExpiresAt)}
                  </p>
                </div>
                <button
                  type="button"
                  className={ACTION_CLASS}
                  disabled={claiming !== null}
                  onClick={() => void claim(entry)}
                >
                  {claiming === entry.sessionId ? 'Taking…' : 'Take this'}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {claimError ? (
          <p className="mt-3 text-xs text-danger" role="alert">
            {claimError}
          </p>
        ) : null}
      </section>

      {activeError ? (
        <p className="text-xs text-danger" role="status">
          {activeError}
        </p>
      ) : null}

      {sessions.length > 1 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Conversations you have taken">
          {sessions.map((entry) => (
            <button
              key={entry.sessionId}
              type="button"
              className={
                entry.sessionId === selected?.sessionId ? `${ACTION_CLASS} bg-muted` : ACTION_CLASS
              }
              aria-current={entry.sessionId === selected?.sessionId ? 'true' : undefined}
              onClick={() => setSelectedId(entry.sessionId)}
            >
              {entry.referenceId}
              {drafts[entry.sessionId]?.trim() ? ' (draft)' : ''}
            </button>
          ))}
        </nav>
      ) : null}

      {selected ? (
        <AgentThread
          key={selected.sessionId}
          session={selected}
          draft={drafts[selected.sessionId] ?? ''}
          onDraftChange={changeDraft}
          onDismiss={dismiss}
        />
      ) : null}
    </div>
  );
}
