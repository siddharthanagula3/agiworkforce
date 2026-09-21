'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Spinner } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

const TOKEN_REGEX = /^[A-Za-z0-9_-]{24}$/;
const MESSAGE_BATCH_SIZE = 200;
const MAX_MESSAGE_LENGTH = 100_000;

interface SharedSessionResponse {
  title?: unknown;
  model_id?: unknown;
  messages?: unknown;
}

interface ClonedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function sanitizeMessages(raw: unknown): ClonedMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ClonedMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as Record<string, unknown>)['role'];
    const content = (item as Record<string, unknown>)['content'];
    if (role !== 'user' && role !== 'assistant' && role !== 'system') continue;
    if (typeof content !== 'string') continue;
    const trimmed = content.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!trimmed) continue;
    out.push({ role, content: trimmed });
  }
  return out;
}

async function createConversation(title: string, model?: string): Promise<Response> {
  return fetch('/api/chat/conversations', {
    method: 'POST',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(model ? { title, model } : { title }),
  });
}

async function discardConversation(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/chat/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await addCsrfHeaders(),
      credentials: 'include',
    });
    return response.ok;
  } catch {
    return false;
  }
}

const LINK_CLASS =
  'text-[var(--chat-accent-primary-text)] underline underline-offset-2 hover:no-underline';

type Status = 'loading' | 'expired' | 'empty' | 'missing' | 'error';

export default function ContinueSharedSessionPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const startedAttempt = useRef(-1);

  useEffect(() => {
    if (startedAttempt.current === attempt) return;
    startedAttempt.current = attempt;

    if (!TOKEN_REGEX.test(token)) {
      setStatus('missing');
      setError('This share link is invalid.');
      return;
    }

    (async () => {
      let createdId: string | null = null;
      try {
        const shareRes = await fetch(`/api/share/${token}`, { credentials: 'include' });
        if (shareRes.status === 410) {
          setStatus('expired');
          return;
        }
        if (shareRes.status === 404) {
          setStatus('missing');
          setError('This shared conversation could not be found.');
          return;
        }
        if (!shareRes.ok) {
          throw new Error('This shared conversation could not be opened.');
        }
        const share = (await shareRes.json()) as SharedSessionResponse;
        const title =
          typeof share.title === 'string' && share.title.trim()
            ? share.title.trim().slice(0, 500)
            : 'Shared Session';
        const modelId = typeof share.model_id === 'string' ? share.model_id : undefined;
        const messages = sanitizeMessages(share.messages);
        if (messages.length === 0) {
          setStatus('empty');
          return;
        }

        let conversationRes = await createConversation(title, modelId);
        if (!conversationRes.ok && modelId) {
          conversationRes = await createConversation(title);
        }
        if (!conversationRes.ok) {
          throw new Error('Could not start a new conversation from this share.');
        }
        const { conversation } = (await conversationRes.json()) as {
          conversation: { id: string };
        };
        createdId = conversation.id;

        for (let i = 0; i < messages.length; i += MESSAGE_BATCH_SIZE) {
          const batch = messages.slice(i, i + MESSAGE_BATCH_SIZE);
          const bulkRes = await fetch(`/api/chat/conversations/${conversation.id}/messages/bulk`, {
            method: 'POST',
            headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
            credentials: 'include',
            body: JSON.stringify({ messages: batch }),
          });
          if (!bulkRes.ok) throw new Error('The shared messages could not be copied.');
        }

        router.replace(`/chat/${conversation.id}`);
      } catch (err) {
        const discarded = createdId !== null && (await discardConversation(createdId));
        setStatus('error');
        setError(
          createdId !== null
            ? discarded
              ? 'The shared messages could not be copied, so no new conversation was kept.'
              : 'The shared messages could not all be copied. A partial copy may be in your chat list.'
            : toUserMessage(err, 'This shared conversation could not be opened.'),
        );
      }
    })();
  }, [token, router, attempt]);

  if (status === 'expired' || status === 'empty' || status === 'missing') {
    const notice =
      status === 'expired'
        ? 'This shared conversation has expired.'
        : status === 'empty'
          ? 'This shared conversation has no messages to continue from.'
          : error;
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-medium">{notice}</p>
        <Link href="/chat" className={LINK_CLASS}>
          Start a new chat
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <p className="text-lg font-medium">{error}</p>
        <Button
          variant="outline"
          onClick={() => {
            setError(null);
            setStatus('loading');
            setAttempt((previous) => previous + 1);
          }}
        >
          Try again
        </Button>
        <Link href="/chat" className={LINK_CLASS}>
          Start a new chat
        </Link>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-busy="true"
      className="flex min-h-[60vh] items-center justify-center gap-3 px-6 text-center text-muted-foreground"
    >
      <Spinner size="sm" role="presentation" aria-hidden="true" />
      <span>Setting up your conversation…</span>
    </div>
  );
}
