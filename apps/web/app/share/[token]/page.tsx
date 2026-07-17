import { getNeonDb } from '@/lib/server/neon-db';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { SharedSessionViewer } from '@/features/chat/components/share/SharedSessionViewer';
import type { SharedSession } from '@/features/chat/components/share/SharedSessionViewer';
import { ExpiredShareBanner } from '@/features/chat/components/share/ExpiredShareBanner';

interface Props {
  params: Promise<{ token: string }>;
}

const TOKEN_REGEX = /^[A-Za-z0-9_-]{24}$/;

interface SharedSessionRow {
  title: string;
  model_id: string;
  provider: string;
  messages: unknown;
  total_messages: number;
  expires_at: string;
  created_at: string;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  if (!TOKEN_REGEX.test(token)) return { title: 'Shared Session - AGI' };

  const db = getNeonDb();
  const result = await db
    .query<{
      title: string;
      total_messages: number;
    }>('SELECT title, total_messages FROM shared_sessions WHERE token = $1 LIMIT 1', [token])
    .catch(() => [] as { title: string; total_messages: number }[]);
  const data = Array.isArray(result) ? result[0] : undefined;

  return {
    title: data ? `${data.title} - AGI` : 'Shared Session - AGI',
    description: data ? `${data.total_messages} message conversation shared from AGI` : undefined,
  };
}

export default async function SharedSessionPage({ params }: Props) {
  const { token } = await params;

  if (!TOKEN_REGEX.test(token)) {
    notFound();
  }

  const db = getNeonDb();
  const rows = await db
    .query<SharedSessionRow>(
      'SELECT title, model_id, provider, messages, total_messages, expires_at, created_at FROM shared_sessions WHERE token = $1 LIMIT 1',
      [token],
    )
    .catch(() => [] as SharedSessionRow[]);

  const data = Array.isArray(rows) ? rows[0] : undefined;

  if (!data) {
    notFound();
  }

  if (new Date(data.expires_at) < new Date()) {
    return <ExpiredShareBanner />;
  }

  return <SharedSessionViewer session={data as SharedSession} />;
}
