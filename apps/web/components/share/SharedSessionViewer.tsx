'use client';

import { formatDistanceToNow } from 'date-fns';

interface ToolCall {
  tool_name: string;
  display_args?: string;
}

interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: ToolCall[];
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

export function SharedSessionViewer({ session }: { session: SharedSession }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top banner */}
      <div className="border-b border-white/10 bg-blue-950/30 px-4 py-3 text-center text-sm text-blue-300">
        Read-only shared session.{' '}
        <a href="/signup" className="font-medium underline hover:text-white">
          Sign in to create your own
        </a>
      </div>

      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{session.title}</h1>
            <div className="mt-1 flex items-center gap-3 text-sm text-gray-400">
              {session.model_id && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">
                  {session.model_id}
                </span>
              )}
              <span>{session.total_messages} messages</span>
              <span>
                Expires {formatDistanceToNow(new Date(session.expires_at), { addSuffix: true })}
              </span>
            </div>
          </div>
          <a
            href="/"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Open in AGI Workforce
          </a>
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
                message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-100'
              }`}
            >
              {message.tool_calls && message.tool_calls.length > 0 && (
                <div className="mb-2 space-y-1">
                  {message.tool_calls.map((tool, ti) => (
                    <details key={ti} className="rounded bg-black/20 px-2 py-1 text-xs">
                      <summary className="cursor-pointer text-gray-300">{tool.tool_name}</summary>
                      {tool.display_args && (
                        <pre className="mt-1 whitespace-pre-wrap text-gray-400">
                          {tool.display_args}
                        </pre>
                      )}
                    </details>
                  ))}
                </div>
              )}
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
