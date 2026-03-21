/**
 * Shared Conversation View
 *
 * Public read-only page that renders a shared conversation fetched from Supabase
 * via GET /api/shared?token=<id>.  No authentication is required.
 *
 * Route: /shared/[id]
 */

import { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface SharedMessage {
  role: string;
  content: string;
  created_at?: string;
}

interface SharedData {
  messages: SharedMessage[];
  title?: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

async function fetchSharedConversation(token: string): Promise<SharedData | null> {
  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

  try {
    const res = await fetch(`${appUrl}/api/shared?token=${encodeURIComponent(token)}`, {
      // Revalidate once per minute — conversation content never changes.
      next: { revalidate: 60 },
    });

    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) return null;

    const data = (await res.json()) as SharedData;
    return data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchSharedConversation(id);
  const title = data?.title ?? 'Shared Conversation';
  return {
    title: `${title} — AGI Workforce`,
    description: 'A shared conversation from AGI Workforce',
  };
}

/** Format a role label for display. */
function roleLabel(role: string): string {
  switch (role) {
    case 'user':
      return 'You';
    case 'assistant':
      return 'Assistant';
    case 'system':
      return 'System';
    default:
      return role.charAt(0).toUpperCase() + role.slice(1);
  }
}

/** Determine if a role is from the human side. */
function isUserRole(role: string): boolean {
  return role === 'user';
}

export default async function SharedConversationPage({ params }: PageProps) {
  const { id } = await params;

  // Basic UUID-v4 validation to avoid unnecessary DB lookups.
  const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_V4_RE.test(id)) {
    notFound();
  }

  const data = await fetchSharedConversation(id);
  if (!data) {
    notFound();
  }

  const { messages, title } = data;
  const conversationTitle = title ?? 'Shared Conversation';

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-10 px-4">
      <div className="mx-auto max-w-3xl">
        {/* Page header */}
        <div className="mb-8 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
            AGI Workforce — Shared Conversation
          </p>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 break-words">
            {conversationTitle}
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Read-only view &bull; {messages.length} message{messages.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Message list */}
        <ol className="space-y-4">
          {messages.map((msg, index) => (
            <li
              key={index}
              className={`flex ${isUserRole(msg.role) ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  isUserRole(msg.role)
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700'
                }`}
              >
                {/* Role label */}
                <p
                  className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${
                    isUserRole(msg.role) ? 'text-blue-200' : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {roleLabel(msg.role)}
                </p>

                {/* Message content — preserve newlines */}
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>

                {/* Timestamp if available */}
                {msg.created_at && (
                  <p
                    className={`mt-1.5 text-[10px] ${
                      isUserRole(msg.role) ? 'text-blue-300' : 'text-zinc-400'
                    }`}
                  >
                    {new Date(msg.created_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>

        {/* Footer */}
        <footer className="mt-12 text-center text-xs text-zinc-400 dark:text-zinc-600">
          <p>
            Shared via{' '}
            <a
              href="https://agiworkforce.com"
              className="underline hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
            >
              AGI Workforce
            </a>
            . This link expires 30 days after creation.
          </p>
        </footer>
      </div>
    </main>
  );
}
