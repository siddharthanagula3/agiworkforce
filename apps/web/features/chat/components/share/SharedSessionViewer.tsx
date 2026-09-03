'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { getManagedModelPresentationLabel } from '@agiworkforce/unified-chat';

interface ToolCall {
  tool_name: string;
  display_args?: string;
}

interface SharedAttachment {
  name: string;
  type?: 'image' | 'file';
  mimeType?: string;
}

interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: ToolCall[];
  attachments?: SharedAttachment[];
}

export interface SharedSession {
  title: string;
  model_id?: string;
  provider?: string;
  messages: Message[];
  total_messages: number;
  expires_at: string;
  created_at: string;
}

export function SharedSessionViewer({ session, token }: { session: SharedSession; token: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top banner */}
      <div className="border-b border-border bg-primary/10 px-4 py-3 text-center text-sm text-foreground">
        Read-only shared session.{' '}
        <a href="/signup" className="font-medium underline underline-offset-2 hover:text-primary">
          Sign in to create your own
        </a>
      </div>

      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold" title={session.title}>
              {session.title}
            </h1>
            <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
              {session.model_id && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {getManagedModelPresentationLabel(session.model_id)}
                </span>
              )}
              <span>{session.total_messages} messages</span>
              <span>
                Expires {formatDistanceToNow(new Date(session.expires_at), { addSuffix: true })}
              </span>
            </div>
          </div>
          <Link
            href={`/chat/from-share/${token}`}
            prefetch={false}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Open in AGI
          </Link>
        </div>
      </div>

      {/* Messages */}
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        {session.messages.map((message, index) => (
          <div
            key={message.id ?? index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                message.role === 'user' ? 'user-bubble' : 'bg-muted text-foreground'
              }`}
            >
              {message.tool_calls && message.tool_calls.length > 0 && (
                <div className="mb-2 space-y-1">
                  {message.tool_calls.map((tool, ti) => (
                    <details key={ti} className="rounded bg-background px-2 py-1 text-xs">
                      <summary className="cursor-pointer text-foreground">{tool.tool_name}</summary>
                      {tool.display_args && (
                        <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">
                          {tool.display_args}
                        </pre>
                      )}
                    </details>
                  ))}
                </div>
              )}
              {message.attachments && message.attachments.length > 0 && (
                <div className="mb-2 space-y-1">
                  {message.attachments.map((attachment, ai) => (
                    <div
                      key={ai}
                      className="rounded bg-background/60 px-2 py-1 text-xs italic text-muted-foreground"
                    >
                      {attachment.name}, [attachment omitted from shared snapshot]
                    </div>
                  ))}
                </div>
              )}
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
