'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { CircleAlert, RefreshCw } from '@agiworkforce/icons';
import { AgiMark, Spinner, useUiTranslation } from '@agiworkforce/ui';
import { BrandedGreeting } from '@agiworkforce/unified-chat';
import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { toUserMessage } from '@/lib/user-error-message';
import { SendButton } from '../components/Composer/SendButton';
import { TranscriptNotice } from '../components/messages/TranscriptNotice';
import {
  GUEST_BLOCKING_CODES,
  GUEST_SEND_FAILED,
  GuestChatRefusal,
  sendGuestTurn,
  type GuestChatMessage,
} from './guest-chat-stream';

const MarkdownContent = dynamic(
  () => import('@agiworkforce/unified-chat').then((mod) => mod.MarkdownContent),
  { loading: () => <Spinner size="sm" className="text-muted-foreground" /> },
);

const StreamingMarkdownContent = dynamic(
  () => import('@agiworkforce/unified-chat').then((mod) => mod.StreamingMarkdownContent),
  { loading: () => <Spinner size="sm" className="text-muted-foreground" /> },
);

interface GuestEntry extends GuestChatMessage {
  id: string;
}

export interface GuestChatProps {
  dailyLimit: number;
  signInHref: string;
  signUpHref: string;
}

const LOG_IN = 'Log in';
const SIGN_UP = 'Sign up for free';
const SEND_EMPTY_REASON = 'Send is off until you type a message.';
const BOTTOM_SLACK_PX = 48;

const PRIMARY_LINK_CLASS =
  'inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-quick hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11';
const SECONDARY_LINK_CLASS =
  'inline-flex h-9 items-center rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors duration-quick hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11';
const INLINE_LINK_CLASS = 'text-foreground underline underline-offset-2';

function lastUserIndex(entries: readonly GuestEntry[]): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]?.role === 'user') return index;
  }
  return -1;
}

export function GuestChat({ dailyLimit, signInHref, signUpHref }: GuestChatProps) {
  const { t, plural } = useUiTranslation('chat');
  const [entries, setEntries] = useState<GuestEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [replyId, setReplyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const streaming = replyId !== null;

  useEffect(() => () => controllerRef.current?.abort(), []);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }, [draft, blocked]);

  useEffect(() => {
    const log = logRef.current;
    if (log && followRef.current) log.scrollTop = log.scrollHeight;
  }, [entries, failure]);

  const run = useCallback(async (history: GuestEntry[], sentDraft: string | null) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const id = crypto.randomUUID();
    followRef.current = true;
    setEntries([...history, { id, role: 'assistant', content: '' }]);
    setReplyId(id);
    setFailure(null);
    setNotice(null);
    try {
      const turn = await sendGuestTurn(
        history.map(({ role, content }) => ({ role, content })),
        controller.signal,
        (content) =>
          setEntries((current) =>
            current.map((entry) => (entry.id === id ? { ...entry, content } : entry)),
          ),
      );
      if (turn.remaining !== null) setRemaining(turn.remaining);
      if (turn.failure) setFailure(turn.failure);
      if (!turn.content) setEntries((current) => current.filter((entry) => entry.id !== id));
    } catch (error) {
      if (controller.signal.aborted) {
        setEntries((current) => current.filter((entry) => entry.id !== id || entry.content));
        return;
      }
      if (sentDraft === null) {
        setEntries(history);
      } else {
        setEntries(history.slice(0, -1));
        setDraft((current) => current || sentDraft);
      }
      const message = toUserMessage(error, GUEST_SEND_FAILED);
      if (error instanceof GuestChatRefusal && error.code && GUEST_BLOCKING_CODES.has(error.code)) {
        setBlocked(message);
      } else {
        setNotice(message);
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setReplyId(null);
    }
  }, []);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || streaming || blocked) return;
    setDraft('');
    void run([...entries, { id: crypto.randomUUID(), role: 'user', content: text }], text);
  }, [blocked, draft, entries, run, streaming]);

  const retry = useCallback(() => {
    const index = lastUserIndex(entries);
    if (index === -1 || streaming) return;
    void run(entries.slice(0, index + 1), null);
  }, [entries, run, streaming]);

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
      event.preventDefault();
      send();
    },
    [send],
  );

  const empty = entries.length === 0;
  const hasDraft = draft.trim().length > 0;

  const input = blocked ? (
    <div
      role="alert"
      className="rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-input-bg)] p-4"
    >
      <p className="text-sm text-foreground">{blocked}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={signInHref} className={PRIMARY_LINK_CLASS}>
          {LOG_IN}
        </Link>
        <Link href={signUpHref} className={SECONDARY_LINK_CLASS}>
          {SIGN_UP}
        </Link>
      </div>
    </div>
  ) : (
    <div className="flex flex-row items-end gap-2 rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-input-bg)] p-1.5 transition-all duration-quick focus-within:shadow-e2 focus-within:ring-2 focus-within:ring-[var(--chat-focus-ring)]">
      <textarea
        ref={inputRef}
        rows={1}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Message input"
        placeholder={
          empty
            ? t('placeholderEmpty', 'How can I help you today?')
            : t('placeholder', 'Message AGI...')
        }
        className="block max-h-[240px] min-h-[36px] w-full resize-none overflow-y-auto border-0 bg-transparent px-2 py-1.5 text-base leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground"
      />
      <SendButton
        mode={streaming ? 'stop' : 'send'}
        hasContent={hasDraft}
        disabledReason={SEND_EMPTY_REASON}
        onClick={streaming ? stop : send}
        className="shrink-0"
      />
    </div>
  );

  const footer = (
    <div className="mt-2 space-y-1 text-center text-caption text-muted-foreground">
      {remaining !== null ? (
        <p role="status">
          {plural('counts.guestMessagesLeft', remaining, {
            one: '{{count}} message left today without an account.',
            other: '{{count}} messages left today without an account.',
          })}{' '}
          <Link href={signUpHref} className={INLINE_LINK_CLASS}>
            {SIGN_UP}
          </Link>
        </p>
      ) : empty ? (
        <p>
          {plural('counts.guestDailyLimit', dailyLimit, {
            one: 'Without an account you can send {{count}} message a day.',
            other: 'Without an account you can send {{count}} messages a day.',
          })}
        </p>
      ) : null}
      <p>
        By messaging AGI, you agree to our{' '}
        <Link href={CANONICAL_POLICY_ROUTES.terms} className={INLINE_LINK_CLASS}>
          Terms of Use
        </Link>{' '}
        and have read our{' '}
        <Link href={CANONICAL_POLICY_ROUTES.privacy} className={INLINE_LINK_CLASS}>
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );

  const noticeRow = notice ? (
    <TranscriptNotice icon={CircleAlert} message={notice} role="alert" className="mb-2" />
  ) : null;

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 flex-row items-center justify-between gap-3 px-gutter-compact">
        <Link
          href="/"
          className="flex flex-row items-center gap-2 rounded-md text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
        >
          <AgiMark size={20} />
          <span className="max-sm:sr-only">AGI Workforce</span>
        </Link>
        <nav aria-label="Account" className="flex flex-row items-center gap-2">
          <Link href={signInHref} className={PRIMARY_LINK_CLASS}>
            {LOG_IN}
          </Link>
          <Link href={signUpHref} className={SECONDARY_LINK_CLASS}>
            {SIGN_UP}
          </Link>
        </nav>
      </header>

      {empty ? (
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-gutter-compact pb-12">
          <BrandedGreeting />
          <div className="w-full max-w-3xl">
            {noticeRow}
            {input}
            {footer}
          </div>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col">
          <div
            ref={logRef}
            role="log"
            aria-label="Chat messages"
            aria-busy={streaming}
            onScroll={(event) => {
              const log = event.currentTarget;
              followRef.current =
                log.scrollHeight - log.scrollTop - log.clientHeight < BOTTOM_SLACK_PX;
            }}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-gutter-compact py-6">
              {entries.map((entry) =>
                entry.role === 'user' ? (
                  <div key={entry.id} className="flex flex-row justify-end">
                    <div className="message-text user-bubble wrap-anywhere max-w-[75%] whitespace-pre-wrap break-words">
                      {entry.content}
                    </div>
                  </div>
                ) : (
                  <div
                    key={entry.id}
                    className="prose dark:prose-invert message-text max-w-none break-words text-start"
                  >
                    {entry.id === replyId && !entry.content ? (
                      <Spinner size="sm" className="text-muted-foreground" />
                    ) : entry.id === replyId ? (
                      <StreamingMarkdownContent
                        content={entry.content}
                        isStreaming
                        announce={false}
                      />
                    ) : (
                      <MarkdownContent content={entry.content} />
                    )}
                  </div>
                ),
              )}
              {failure ? (
                <TranscriptNotice
                  icon={CircleAlert}
                  tone="danger"
                  role="alert"
                  message={failure}
                  action={{
                    label: 'Retry',
                    ariaLabel: 'Send your last message again',
                    icon: RefreshCw,
                    onClick: retry,
                  }}
                />
              ) : null}
            </div>
          </div>
          <div className="shrink-0 pb-4">
            <div className="mx-auto w-full max-w-3xl px-gutter-compact">
              {noticeRow}
              {input}
              {footer}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
