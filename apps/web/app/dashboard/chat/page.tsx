'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Send, Loader2, Plus, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showList, setShowList] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (e) {
      console.error('Failed to fetch conversations:', e);
    }
  }, []);

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chat/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (e) {
      console.error('Failed to fetch messages:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (activeId) {
      fetchMessages(activeId);
      setShowList(false);
    }
  }, [activeId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Create new conversation
  const createConversation = async () => {
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations((prev) => [data.conversation, ...prev]);
        setActiveId(data.conversation.id);
        setMessages([]);
        setShowList(false);
        inputRef.current?.focus();
      }
    } catch (e) {
      console.error('Failed to create conversation:', e);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || sending || !activeId) return;

    const content = input.trim();
    setInput('');
    setSending(true);

    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const userMsg: Message = {
      id: tempId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch(`/api/chat/conversations/${activeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempId);
          return [...filtered, data.userMessage, data.assistantMessage];
        });
        // Update conversation title
        if (messages.length === 0) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === activeId
                ? { ...c, title: content.slice(0, 40) + (content.length > 40 ? '...' : '') }
                : c,
            ),
          );
        }
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    } catch (e) {
      console.error('Failed to send message:', e);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Conversation list view (mobile or no active conversation)
  if (showList || !activeId) {
    return (
      <div className="min-h-screen bg-black text-white">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/dashboard" className="text-zinc-400 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="font-medium">Chat</h1>
            <button
              onClick={createConversation}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Conversation list */}
        <div className="max-w-2xl mx-auto">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">
              <p className="mb-4">No conversations yet</p>
              <button
                onClick={createConversation}
                className="px-4 py-2 bg-white text-black rounded-lg hover:bg-zinc-200 transition-colors text-sm font-medium"
              >
                Start a new chat
              </button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setActiveId(conv.id)}
                  className="w-full px-4 py-4 text-left hover:bg-zinc-900 transition-colors"
                >
                  <p className="text-sm truncate">{conv.title}</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {new Date(conv.created_at).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Chat view
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setShowList(true)}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-medium text-sm truncate flex-1">
            {conversations.find((c) => c.id === activeId)?.title || 'Chat'}
          </h1>
          <button
            onClick={createConversation}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
          ) : messages.length === 0 ? (
            <div className="py-12 text-center text-zinc-500">
              <p>Send a message to start</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm',
                    msg.role === 'user' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-100',
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-zinc-800 rounded-2xl px-4 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="sticky bottom-0 bg-black border-t border-zinc-800">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600 min-h-[44px] max-h-[120px]"
              style={{
                height: 'auto',
                overflow: input.split('\n').length > 3 ? 'auto' : 'hidden',
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className={cn(
                'p-3 rounded-xl transition-colors',
                input.trim() && !sending
                  ? 'bg-white text-black hover:bg-zinc-200'
                  : 'bg-zinc-800 text-zinc-500',
              )}
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
