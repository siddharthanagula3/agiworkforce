/**
 * AgentChatInterface - Cursor Agent-style chat interface
 *
 * Features:
 * - Split-pane layout (left/right toggle)
 * - Real-time agent reasoning display
 * - To-do list with progress
 * - Action logs (tool calls, commands)
 * - MCP tool integration
 * - LLM router for decision making
 */

import { invoke } from '@/lib/tauri-mock';
import { listen } from '@tauri-apps/api/event';
import { CheckCircle2, Clock, Loader2, Play, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { ScrollArea } from '../ui/ScrollArea';
import { Textarea } from '../ui/Textarea';

/// Timeline event types (matching Rust AgentRuntime)
type TimelineEvent =
  | { type: 'task_queued'; task_id: string; description: string; priority: string }
  | { type: 'task_started'; task_id: string; description: string }
  | { type: 'step_started'; task_id: string; step_index: number; step_description: string }
  | { type: 'step_completed'; task_id: string; step_index: number; result: unknown }
  | { type: 'step_failed'; task_id: string; step_index: number; error: string }
  | { type: 'tool_called'; task_id: string; tool_name: string; arguments: unknown }
  | {
      type: 'tool_result';
      task_id: string;
      tool_name: string;
      success: boolean;
      result?: unknown;
      error?: string;
    }
  | { type: 'task_completed'; task_id: string; result: unknown }
  | { type: 'task_failed'; task_id: string; error: string }
  | { type: 'auto_approval_triggered'; task_id: string; action: string; safe: boolean }
  | { type: 'reasoning'; task_id: string; thought: string; duration_ms?: number }
  | {
      type: 'todo_updated';
      task_id: string;
      todos: Array<{ id: string; content: string; status: string }>;
    }
  | { type: 'terminal_spawned'; task_id: string; session_id: string; command?: string }
  | { type: 'file_modified'; task_id: string; file_path: string; operation: string };

interface AgentChatInterfaceProps {
  className?: string;
  position?: 'left' | 'right';
}

export function AgentChatInterface({ className }: AgentChatInterfaceProps) {
  const [messages, setMessages] = useState<
    Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: Date }>
  >([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [reasoning, setReasoning] = useState<
    Array<{ id: string; thought: string; timestamp: Date }>
  >([]);
  const [todos, setTodos] = useState<
    Array<{
      id: string;
      content: string;
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
    }>
  >([]);
  const [actionLogs, setActionLogs] = useState<
    Array<{ id: string; type: string; message: string; timestamp: Date; success?: boolean }>
  >([]);
  const [, setCurrentTaskId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Listen to AgentRuntime timeline events
  useEffect(() => {
    const unlisten = listen<TimelineEvent>('agent://timeline', (event) => {
      const evt = event.payload;

      switch (evt.type) {
        case 'reasoning':
          setReasoning((prev) => [
            ...prev,
            {
              id: `${evt.task_id}-reasoning-${Date.now()}`,
              thought: evt.thought,
              timestamp: new Date(),
            },
          ]);
          break;

        case 'todo_updated':
          setTodos(
            evt.todos.map((t: any) => ({
              id: t.id,
              content: t.content,
              status: t.status as 'pending' | 'in_progress' | 'completed' | 'failed',
            })),
          );
          break;

        case 'tool_called':
          setActionLogs((prev) => [
            ...prev,
            {
              id: `${evt.task_id}-tool-${Date.now()}`,
              type: 'tool',
              message: `Calling tool: ${evt.tool_name}`,
              timestamp: new Date(),
            },
          ]);
          break;

        case 'tool_result':
          setActionLogs((prev) => [
            ...prev,
            {
              id: `${evt.task_id}-tool-result-${Date.now()}`,
              type: 'tool_result',
              message: evt.success
                ? `✓ ${evt.tool_name} completed`
                : `✗ ${evt.tool_name} failed: ${evt.error || 'Unknown error'}`,
              timestamp: new Date(),
              success: evt.success,
            },
          ]);
          break;

        case 'task_started':
          setCurrentTaskId(evt.task_id);
          setActionLogs((prev) => [
            ...prev,
            {
              id: `${evt.task_id}-start`,
              type: 'task',
              message: `Starting task: ${evt.description}`,
              timestamp: new Date(),
            },
          ]);
          break;

        case 'task_completed':
          setCurrentTaskId(null);
          setActionLogs((prev) => [
            ...prev,
            {
              id: `${evt.task_id}-complete`,
              type: 'task',
              message: `Task completed successfully`,
              timestamp: new Date(),
              success: true,
            },
          ]);
          setIsProcessing(false);
          break;

        case 'task_failed':
          setCurrentTaskId(null);
          setActionLogs((prev) => [
            ...prev,
            {
              id: `${evt.task_id}-fail`,
              type: 'task',
              message: `Task failed: ${evt.error}`,
              timestamp: new Date(),
              success: false,
            },
          ]);
          setIsProcessing(false);
          break;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, reasoning, actionLogs]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user' as const,
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      // Queue task via AgentRuntime
      const taskId = await invoke<string>('runtime_queue_task', {
        description: input,
        goal: input,
        priority: 'normal',
        dependencies: null,
      });

      setCurrentTaskId(taskId);

      // Add system message
      setMessages((prev) => [
        ...prev,
        {
          id: `system-${Date.now()}`,
          role: 'system',
          content: `Task queued: ${taskId}`,
          timestamp: new Date(),
        },
      ]);

      // Get and execute task
      const task = await invoke<unknown>('runtime_get_next_task');
      if (task) {
        await invoke('runtime_execute_task', { task });
      }
    } catch (error) {
      console.error('Failed to queue task:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'system',
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date(),
        },
      ]);
      setIsProcessing(false);
    }
  }, [input, isProcessing]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const completedTodos = useMemo(
    () => todos.filter((t) => t.status === 'completed').length,
    [todos],
  );
  const totalTodos = todos.length;

  return (
    <div className={cn('flex h-full flex-col bg-background border-l border-border', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-sm font-medium">Agent</span>
          {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {totalTodos > 0 && (
          <div className="text-xs text-muted-foreground">
            {completedTodos}/{totalTodos} tasks
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="px-4 py-4 space-y-4">
            {/* Messages */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'rounded-lg p-3',
                  msg.role === 'user'
                    ? 'bg-primary/10 ml-8'
                    : msg.role === 'system'
                      ? 'bg-muted/50'
                      : 'bg-muted mr-8',
                )}
              >
                <div className="text-sm font-medium mb-1">
                  {msg.role === 'user' ? 'You' : msg.role === 'system' ? 'System' : 'Agent'}
                </div>
                <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {msg.timestamp.toLocaleTimeString()}
                </div>
              </div>
            ))}

            {/* Reasoning */}
            {reasoning.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Reasoning
                </div>
                {reasoning.slice(-5).map((r) => (
                  <div
                    key={r.id}
                    className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3"
                  >
                    <div className="flex items-start gap-2">
                      <Clock className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm">{r.thought}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {r.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Action Logs */}
            {actionLogs.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Actions
                </div>
                {actionLogs.slice(-10).map((log) => (
                  <div
                    key={log.id}
                    className={cn(
                      'rounded-lg p-2 text-sm flex items-center gap-2',
                      log.success === true
                        ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                        : log.success === false
                          ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                          : 'bg-muted/50',
                    )}
                  >
                    {log.success === true ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : log.success === false ? (
                      <XCircle className="h-4 w-4 shrink-0" />
                    ) : (
                      <Play className="h-4 w-4 shrink-0" />
                    )}
                    <span className="flex-1">{log.message}</span>
                    <span className="text-xs text-muted-foreground">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* To-do List Sidebar */}
        {todos.length > 0 && (
          <div className="border-t border-border bg-muted/30">
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              To-Do List ({completedTodos}/{totalTodos})
            </div>
            <ScrollArea className="max-h-48">
              <div className="px-4 pb-2 space-y-1">
                {todos.map((todo) => (
                  <div
                    key={todo.id}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded text-sm',
                      todo.status === 'completed' && 'opacity-60',
                    )}
                  >
                    {todo.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : todo.status === 'in_progress' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                    ) : todo.status === 'failed' ? (
                      <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={cn(todo.status === 'completed' && 'line-through')}>
                      {todo.content}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell the agent what to do..."
              className="min-h-[80px] resize-none"
              disabled={isProcessing}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isProcessing}
              size="icon"
              className="shrink-0"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
