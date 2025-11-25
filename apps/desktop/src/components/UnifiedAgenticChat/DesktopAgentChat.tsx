/**
 * DesktopAgentChat - Production-ready autonomous desktop agent with natural language interface
 *
 * Features:
 * - Natural language task execution (like Claude Code/Cursor Agent)
 * - Real-time reasoning and action logs
 * - AGI system integration with tool orchestration
 * - Progress tracking with todo list
 * - Safety validation and approval system
 * - Background task management
 * - Multi-step autonomous execution
 */

import { listen } from '@tauri-apps/api/event';
import {
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  Loader2,
  Send,
  StopCircle,
  Terminal,
  XCircle,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { invoke } from '../../lib/tauri-mock';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { ScrollArea } from '../ui/ScrollArea';
import { Textarea } from '../ui/Textarea';

/// Message types
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    goal_id?: string;
    task_id?: string;
    agent_id?: string;
  };
}

/// Reasoning step
interface ReasoningStep {
  id: string;
  thought: string;
  timestamp: Date;
  duration_ms?: number;
}

/// Action log entry
interface ActionLog {
  id: string;
  type: 'tool' | 'command' | 'task' | 'approval' | 'error';
  message: string;
  timestamp: Date;
  success?: boolean;
  details?: string;
}

/// Todo item with progress
interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
}

/// Goal status
interface GoalStatus {
  goal_id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  progress_percent: number;
  current_step?: string;
}

interface DesktopAgentChatProps {
  className?: string;
}

export function DesktopAgentChat({ className }: DesktopAgentChatProps) {
  // Core state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Agent state
  const [reasoning, setReasoning] = useState<ReasoningStep[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [currentGoal, setCurrentGoal] = useState<GoalStatus | null>(null);
  const [systemStatus, setSystemStatus] = useState<'idle' | 'thinking' | 'executing'>('idle');

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize AGI system on mount
  useEffect(() => {
    const initAGI = async () => {
      try {
        await invoke('agi_init', {
          config: {
            enable_learning: true,
            enable_self_improvement: true,
            knowledge_memory_mb: 512,
            resource_limits: {
              max_cpu_percent: 80.0,
              max_memory_mb: 2048,
              max_disk_mb: 10240,
              max_network_kbps: 10240,
            },
          },
        });
      } catch (error) {
        console.error('[DesktopAgentChat] Failed to initialize AGI:', error);
        setMessages((prev) => [
          ...prev,
          {
            id: `system-${Date.now()}`,
            role: 'system',
            content: `⚠️ AGI initialization error: ${error instanceof Error ? error.message : String(error)}`,
            timestamp: new Date(),
          },
        ]);
      }
    };

    void initAGI();
  }, []);

  // Listen to AGI events
  useEffect(() => {
    const unlistenPromises: Promise<() => void>[] = [];

    // Goal events
    unlistenPromises.push(
      listen<{ goal_id: string; description: string }>('agi:goal:submitted', (event) => {
        const { goal_id, description } = event.payload;

        setMessages((prev) => [
          ...prev,
          {
            id: `goal-${goal_id}`,
            role: 'assistant',
            content: `🎯 **Goal accepted:** ${description}`,
            timestamp: new Date(),
            metadata: { goal_id },
          },
        ]);

        setCurrentGoal({
          goal_id,
          status: 'active',
          progress_percent: 0,
        });
      }),
    );

    unlistenPromises.push(
      listen<{
        goal_id: string;
        progress_percent: number;
        completed_steps: number;
        total_steps: number;
        current_step?: string;
      }>('agi:goal:progress', (event) => {
        const { goal_id, progress_percent, current_step } = event.payload;

        setCurrentGoal((prev) =>
          prev?.goal_id === goal_id ? { ...prev, progress_percent, current_step } : prev,
        );
      }),
    );

    unlistenPromises.push(
      listen<{ goal_id: string; result?: string }>('agi:goal:achieved', (event) => {
        const { goal_id, result } = event.payload;

        setMessages((prev) => [
          ...prev,
          {
            id: `goal-complete-${goal_id}`,
            role: 'assistant',
            content: `✅ **Goal completed successfully!**${result ? `\n\n${result}` : ''}`,
            timestamp: new Date(),
            metadata: { goal_id },
          },
        ]);

        setCurrentGoal(null);
        setIsProcessing(false);
        setSystemStatus('idle');
      }),
    );

    unlistenPromises.push(
      listen<{ goal_id: string; error: string }>('agi:goal:error', (event) => {
        const { goal_id, error } = event.payload;
        console.error('[AGI] Goal error:', error);

        setMessages((prev) => [
          ...prev,
          {
            id: `goal-error-${goal_id}`,
            role: 'system',
            content: `❌ **Goal failed:** ${error}`,
            timestamp: new Date(),
            metadata: { goal_id },
          },
        ]);

        setActionLogs((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            type: 'error',
            message: error,
            timestamp: new Date(),
            success: false,
          },
        ]);

        setCurrentGoal(null);
        setIsProcessing(false);
        setSystemStatus('idle');
      }),
    );

    // Step events
    unlistenPromises.push(
      listen<{ step_index: number; step_description: string }>('agi:step:started', (event) => {
        const { step_description } = event.payload;

        setSystemStatus('executing');
        setActionLogs((prev) => [
          ...prev,
          {
            id: `step-${Date.now()}`,
            type: 'task',
            message: `▶️ ${step_description}`,
            timestamp: new Date(),
          },
        ]);
      }),
    );

    unlistenPromises.push(
      listen<{ step_index: number; result: string }>('agi:step:completed', (event) => {
        const { result } = event.payload;

        setActionLogs((prev) => [
          ...prev,
          {
            id: `step-complete-${Date.now()}`,
            type: 'task',
            message: `✓ Step completed`,
            timestamp: new Date(),
            success: true,
            details: result,
          },
        ]);
      }),
    );

    // Tool events
    unlistenPromises.push(
      listen<{ tool_name: string; arguments: unknown }>('agi:tool:called', (event) => {
        const { tool_name } = event.payload;

        setActionLogs((prev) => [
          ...prev,
          {
            id: `tool-${Date.now()}`,
            type: 'tool',
            message: `🔧 Calling tool: ${tool_name}`,
            timestamp: new Date(),
          },
        ]);
      }),
    );

    unlistenPromises.push(
      listen<{ tool_name: string; success: boolean; result?: unknown; error?: string }>(
        'agi:tool:result',
        (event) => {
          const { tool_name, success, error } = event.payload;

          setActionLogs((prev) => [
            ...prev,
            {
              id: `tool-result-${Date.now()}`,
              type: 'tool',
              message: success ? `✓ ${tool_name} completed` : `✗ ${tool_name} failed: ${error}`,
              timestamp: new Date(),
              success,
            },
          ]);
        },
      ),
    );

    // Reasoning events
    unlistenPromises.push(
      listen<{ thought: string; duration_ms?: number }>('agi:reasoning', (event) => {
        const { thought, duration_ms } = event.payload;

        setSystemStatus('thinking');
        setReasoning((prev) => [
          ...prev,
          {
            id: `reasoning-${Date.now()}`,
            thought,
            timestamp: new Date(),
            duration_ms,
          },
        ]);
      }),
    );

    // Agent runtime events (for runtime_queue_task)
    unlistenPromises.push(
      listen<{ task_id: string; thought: string }>('agent://timeline', (event) => {
        const evt = event.payload as any;

        if (evt.type === 'reasoning') {
          setReasoning((prev) => [
            ...prev,
            {
              id: `${evt.task_id}-reasoning-${Date.now()}`,
              thought: evt.thought,
              timestamp: new Date(),
            },
          ]);
        } else if (evt.type === 'todo_updated') {
          setTodos(
            evt.todos.map((t: any) => ({
              id: t.id,
              content: t.content,
              status: t.status,
            })),
          );
        } else if (evt.type === 'tool_called') {
          setActionLogs((prev) => [
            ...prev,
            {
              id: `${evt.task_id}-tool-${Date.now()}`,
              type: 'tool',
              message: `🔧 ${evt.tool_name}`,
              timestamp: new Date(),
            },
          ]);
        } else if (evt.type === 'tool_result') {
          setActionLogs((prev) => [
            ...prev,
            {
              id: `${evt.task_id}-tool-result-${Date.now()}`,
              type: 'tool',
              message: evt.success ? `✓ ${evt.tool_name}` : `✗ ${evt.tool_name}: ${evt.error}`,
              timestamp: new Date(),
              success: evt.success,
            },
          ]);
        } else if (evt.type === 'task_completed') {
          setIsProcessing(false);
          setSystemStatus('idle');
        } else if (evt.type === 'task_failed') {
          setIsProcessing(false);
          setSystemStatus('idle');
        }
      }),
    );

    // Cleanup listeners
    return () => {
      Promise.all(unlistenPromises).then((unlisteners) => {
        unlisteners.forEach((unlisten) => unlisten());
      });
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, reasoning, actionLogs]);

  // Handle message send
  const handleSend = useCallback(async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const taskDescription = input;
    setInput('');
    setIsProcessing(true);
    setSystemStatus('thinking');

    try {
      // Submit to AGI system
      await invoke<{ goal_id: string }>('agi_submit_goal', {
        request: {
          description: taskDescription,
          priority: 'medium',
          deadline: null,
          success_criteria: null,
        },
      });

      // The AGI will emit events as it executes
      // UI will update via event listeners
    } catch (error) {
      console.error('[DesktopAgentChat] Failed to submit goal:', error);

      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'system',
          content: `❌ **Error:** ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date(),
        },
      ]);

      setIsProcessing(false);
      setSystemStatus('idle');
    }
  }, [input, isProcessing]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Stop current execution
  const handleStop = useCallback(async () => {
    try {
      await invoke('agi_stop');
      setIsProcessing(false);
      setSystemStatus('idle');
      setMessages((prev) => [
        ...prev,
        {
          id: `stop-${Date.now()}`,
          role: 'system',
          content: '⏸️ **Execution stopped by user**',
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      console.error('[DesktopAgentChat] Failed to stop:', error);
    }
  }, []);

  // Calculate progress
  const completedTodos = useMemo(
    () => todos.filter((t) => t.status === 'completed').length,
    [todos],
  );
  const totalTodos = todos.length;
  const progressPercent = currentGoal?.progress_percent ?? 0;

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'h-2.5 w-2.5 rounded-full transition-colors',
              systemStatus === 'idle'
                ? 'bg-green-500'
                : systemStatus === 'thinking'
                  ? 'bg-yellow-500 animate-pulse'
                  : 'bg-blue-500 animate-pulse',
            )}
          />
          <div>
            <h2 className="text-sm font-semibold">Desktop Agent</h2>
            <p className="text-xs text-muted-foreground">
              {systemStatus === 'idle'
                ? 'Ready'
                : systemStatus === 'thinking'
                  ? 'Thinking...'
                  : 'Executing...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {currentGoal && (
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground">{progressPercent.toFixed(0)}%</div>
              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {totalTodos > 0 && (
            <div className="text-xs text-muted-foreground">
              {completedTodos}/{totalTodos} tasks
            </div>
          )}

          {isProcessing && (
            <Button variant="ghost" size="sm" onClick={handleStop}>
              <StopCircle className="h-4 w-4 mr-1" />
              Stop
            </Button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef}>
            <div className="space-y-4 max-w-4xl mx-auto">
              {/* Welcome message */}
              {messages.length === 0 && (
                <div className="text-center py-12 space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                    <Zap className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">Welcome to Desktop Agent</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Tell me what you want to accomplish in plain English. I'll handle all the
                    underlying actions autonomously.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto mt-6">
                    <button
                      onClick={() => setInput('Find all TypeScript files in the current directory')}
                      className="p-3 text-left border border-border rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="text-sm font-medium mb-1">Search files</div>
                      <div className="text-xs text-muted-foreground">
                        Find all TypeScript files in the current directory
                      </div>
                    </button>
                    <button
                      onClick={() => setInput('Create a new folder called "test-project"')}
                      className="p-3 text-left border border-border rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="text-sm font-medium mb-1">Create folder</div>
                      <div className="text-xs text-muted-foreground">
                        Create a new folder called "test-project"
                      </div>
                    </button>
                    <button
                      onClick={() => setInput('Open Chrome and navigate to github.com/trending')}
                      className="p-3 text-left border border-border rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="text-sm font-medium mb-1">Browser automation</div>
                      <div className="text-xs text-muted-foreground">
                        Open Chrome and navigate to github.com/trending
                      </div>
                    </button>
                    <button
                      onClick={() => setInput('Take a screenshot and save it to my desktop')}
                      className="p-3 text-left border border-border rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="text-sm font-medium mb-1">Screen capture</div>
                      <div className="text-xs text-muted-foreground">
                        Take a screenshot and save it to my desktop
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Messages */}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'flex gap-3',
                    msg.role === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[80%] rounded-lg px-4 py-3',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : msg.role === 'system'
                          ? 'bg-yellow-500/10 border border-yellow-500/20'
                          : 'bg-muted',
                    )}
                  >
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    <div className="text-xs opacity-70 mt-2">
                      {msg.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input area */}
          <div className="border-t border-border p-4 bg-card">
            <div className="max-w-4xl mx-auto flex gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tell the agent what to do..."
                className="min-h-[60px] max-h-[200px] resize-none"
                disabled={isProcessing}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isProcessing}
                size="icon"
                className="shrink-0 h-[60px] w-[60px]"
              >
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Sidebar - Reasoning, Actions, Todos */}
        <div className="w-80 border-l border-border bg-card overflow-hidden flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {/* Current step */}
              {currentGoal?.current_step && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Current Step
                  </h3>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <Loader2 className="h-4 w-4 text-blue-500 animate-spin mt-0.5 shrink-0" />
                      <div className="text-sm">{currentGoal.current_step}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Reasoning */}
              {reasoning.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                    <Cpu className="h-3 w-3" />
                    Reasoning
                  </h3>
                  <div className="space-y-2">
                    {reasoning.slice(-5).map((r) => (
                      <div
                        key={r.id}
                        className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-2"
                      >
                        <div className="text-xs">{r.thought}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {r.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Logs */}
              {actionLogs.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                    <Terminal className="h-3 w-3" />
                    Actions
                  </h3>
                  <div className="space-y-1">
                    {actionLogs.slice(-10).map((log) => (
                      <div
                        key={log.id}
                        className={cn(
                          'rounded-lg p-2 text-xs flex items-start gap-2',
                          log.success === true
                            ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                            : log.success === false
                              ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                              : 'bg-muted/50',
                        )}
                      >
                        {log.success === true ? (
                          <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5" />
                        ) : log.success === false ? (
                          <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
                        ) : (
                          <Clock className="h-3 w-3 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <div>{log.message}</div>
                          {log.details && (
                            <div className="text-xs opacity-70 mt-1">{log.details}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Todos */}
              {todos.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                    <FileText className="h-3 w-3" />
                    Tasks ({completedTodos}/{totalTodos})
                  </h3>
                  <div className="space-y-1">
                    {todos.map((todo) => (
                      <div
                        key={todo.id}
                        className={cn(
                          'flex items-center gap-2 p-2 rounded-lg text-xs',
                          todo.status === 'completed' && 'opacity-60',
                        )}
                      >
                        {todo.status === 'completed' ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                        ) : todo.status === 'in_progress' ? (
                          <Loader2 className="h-3 w-3 animate-spin text-blue-500 shrink-0" />
                        ) : todo.status === 'failed' ? (
                          <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                        ) : (
                          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                        <span className={cn(todo.status === 'completed' && 'line-through')}>
                          {todo.content}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
