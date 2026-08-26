'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { addCsrfHeaders } from '@/lib/client/csrf';

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

type Status = 'loading' | 'expired' | 'error';

export default function ContinueSharedSessionPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!TOKEN_REGEX.test(token)) {
      setStatus('error');
      setError('This share link is invalid.');
      return;
    }

    (async () => {
      try {
        const shareRes = await fetch(`/api/share/${token}`, { credentials: 'include' });
        if (shareRes.status === 410) {
          setStatus('expired');
          return;
        }
        if (!shareRes.ok) {
          throw new Error('This shared conversation could not be found.');
        }
        const share = (await shareRes.json()) as SharedSessionResponse;
        const title =
          typeof share.title === 'string' && share.title.trim()
            ? share.title.trim().slice(0, 500)
            : 'Shared Session';
        const modelId = typeof share.model_id === 'string' ? share.model_id : undefined;
        const messages = sanitizeMessages(share.messages);

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

        for (let i = 0; i < messages.length; i += MESSAGE_BATCH_SIZE) {
          const batch = messages.slice(i, i + MESSAGE_BATCH_SIZE);
          const bulkRes = await fetch(`/api/chat/conversations/${conversation.id}/messages/bulk`, {
            method: 'POST',
            headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
            credentials: 'include',
            body: JSON.stringify({ messages: batch }),
          });
          if (!bulkRes.ok) {
            throw new Error('Could not copy the shared messages into your new conversation.');
          }
        }

        router.replace(`/chat/${conversation.id}`);
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    })();
  }, [token, router]);

  if (status === 'expired') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-medium">This shared conversation has expired.</p>
        <Link href="/chat" className="text-blue-600 underline hover:text-blue-700">
          Start a new chat
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-medium">{error ?? 'Something went wrong.'}</p>
        <Link href="/chat" className="text-blue-600 underline hover:text-blue-700">
          Go to AGI
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 text-center text-muted-foreground">
      Setting up your conversation…
    </div>
  );
}
