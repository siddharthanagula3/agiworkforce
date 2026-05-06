/**
 * WorkforceChat - Main interface for interacting with AI Workforce
 * Provides natural language input and real-time execution monitoring
 *
 * Note: The orchestrator integration (pause/resume/cancel/rollback/preview)
 * is stubbed out for the web app. Full orchestration runs on the desktop app.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Pause,
  Play,
  X,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { getCsrfToken } from '@/lib/client/csrf';
// Workforce response type (local stub — no longer depends on workforce-orchestrator)
interface WorkforceResponse {
  success: boolean;
  error?: string;
  chatResponse?: string;
  missionId?: string;
  plan?: unknown[];
}

/**
 * Execute a workforce mission via the Mission Control API.
 * The endpoint returns { missionId, plan, chatResponse, agents }.
 */
async function executeWorkforce(userId: string, input: string): Promise<WorkforceResponse> {
  try {
    // Retrieve the Supabase session token from localStorage (set by Supabase Auth client)
    let authToken: string | null = null;
    try {
      // Supabase stores sessions under keys like "sb-<project>-auth-token"
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.includes('-auth-token')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw) as { access_token?: string };
            authToken = parsed.access_token ?? null;
          }
          break;
        }
      }
    } catch {
      // localStorage may be unavailable in some environments
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    // SECURITY (web-MED-1): the prior `csrf-token` cookie reader was dead
    // code (server never sets that cookie). The canonical CSRF flow returns
    // an HMAC token from `/api/csrf` bound to the `anon-session-id` cookie.
    try {
      const csrfToken = await getCsrfToken();
      if (csrfToken) {
        headers['x-csrf-token'] = csrfToken;
      }
    } catch {
      // /api/csrf unreachable — proceed without; server will reject if required.
    }

    const response = await fetch('/api/mission', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, input, mode: 'mission' as const }),
    });

    if (!response.ok) {
      let errorMsg = `Mission API request failed: ${response.statusText}`;
      try {
        const errData = (await response.json()) as { error?: { message?: string } };
        if (errData?.error?.message) {
          errorMsg = errData.error.message;
        }
      } catch {
        // ignore JSON parse errors on error responses
      }
      return { success: false, error: errorMsg };
    }

    const data = (await response.json()) as {
      missionId?: string;
      plan?: unknown[];
      chatResponse?: string;
      agents?: string[];
    };

    return {
      success: true,
      chatResponse: data.chatResponse ?? 'Mission plan created.',
      missionId: data.missionId,
      plan: data.plan,
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// Use a unified Task type compatible with both mission-control and task-breakdown
interface Task {
  id: string;
  title?: string;
  description: string;
  status: string;
  requiredAgent?: string;
  domain?: string;
  assignedTo?: string | null;
  result?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}
import { Card } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { ScrollArea } from '@shared/ui/scroll-area';
import { Badge } from '@shared/ui/badge';
import { Progress } from '@shared/ui/progress';

interface WorkforceChatProps {
  userId: string;
  className?: string;
  onComplete?: (result: unknown) => void;
}

/**
 * Workforce-specific message type
 * Note: This differs from the canonical ChatMessage in @shared/types
 * as it uses 'type' instead of 'role' for workforce-specific semantics
 */
interface WorkforceChatMessage {
  id: string;
  type: 'user' | 'system' | 'update' | 'error' | 'success';
  content: string;
  timestamp: Date;
  data?: unknown;
}

interface ExecutionState {
  id: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  tasks: Task[];
  currentTask?: Task;
  completedTasks: number;
  failedTasks: number;
  progress: number;
}

// Stub functions for orchestration controls (not yet available in web orchestrator)
async function pauseWorkforce(_id: string): Promise<void> {
  console.warn('[WorkforceChat] pauseWorkforce not yet implemented for web');
}
async function resumeWorkforce(_id: string): Promise<void> {
  console.warn('[WorkforceChat] resumeWorkforce not yet implemented for web');
}
async function cancelWorkforce(_id: string): Promise<void> {
  console.warn('[WorkforceChat] cancelWorkforce not yet implemented for web');
}

export const WorkforceChat: React.FC<WorkforceChatProps> = ({
  userId,
  className = '',
  onComplete,
}) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<WorkforceChatMessage[]>([]);
  const [executionState, setExecutionState] = useState<ExecutionState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Add message to chat
  const addMessage = (
    type: WorkforceChatMessage['type'],
    content: string,
    data?: WorkforceChatMessage['data'],
  ) => {
    const message: WorkforceChatMessage = {
      id: `msg-${Date.now()}`,
      type,
      content,
      timestamp: new Date(),
      data,
    };
    setMessages((prev) => [...prev, message]);
  };

  // Handle execution
  const handleExecute = async () => {
    if (!input.trim()) return;

    setIsProcessing(true);

    addMessage('user', input);
    addMessage('system', 'Starting AI Workforce...');

    try {
      const response: WorkforceResponse = await executeWorkforce(userId, input);

      if (!response.success) {
        addMessage('error', response.error || 'Execution failed');
        setIsProcessing(false);
        return;
      }

      // Initialize execution state from plan
      if (response.plan) {
        setExecutionState({
          id: response.missionId || `exec-${Date.now()}`,
          status: 'running',
          tasks: response.plan as unknown as Task[],
          completedTasks: 0,
          failedTasks: 0,
          progress: 0,
        });
      }

      if (response.chatResponse) {
        addMessage('success', response.chatResponse);
      } else {
        addMessage('success', 'Workforce execution completed.');
      }

      // Clear input
      setInput('');
      onComplete?.(response);
    } catch (error) {
      addMessage('error', `Execution failed: ${(error as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Control functions
  const handlePause = () => {
    if (executionState) {
      pauseWorkforce(executionState.id);
      addMessage('system', 'Execution paused');
    }
  };

  const handleResume = () => {
    if (executionState) {
      resumeWorkforce(executionState.id);
      addMessage('system', 'Resuming execution...');
    }
  };

  const handleCancel = () => {
    if (executionState) {
      cancelWorkforce(executionState.id);
      addMessage('system', 'Execution cancelled');
      setExecutionState(null);
    }
  };

  const handleRollback = (taskId: string) => {
    addMessage('system', `Rollback to task: ${taskId} (not yet implemented for web)`);
  };

  return (
    <div className={`flex h-full flex-col ${className}`}>
      {/* Header */}
      <div className="border-b border-slate-700 p-4">
        <h2 className="text-xl font-semibold text-white">AI Workforce</h2>
        <p className="mt-1 text-sm text-slate-400">
          Tell me what you need, and I&apos;ll coordinate the AI agents to get it done
        </p>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="py-12 text-center">
              <div className="mb-4 text-slate-500">
                <svg
                  className="mx-auto mb-4 h-16 w-16 opacity-50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
              </div>
              <p className="text-lg font-medium">Ready to work!</p>
              <p className="mt-2 text-sm">
                Try: &quot;Create a React component for user profile&quot; or &quot;Debug my API
                authentication&quot;
              </p>
            </div>
          )}

          {messages.map((message) => (
            <ChatMessageComponent key={message.id} message={message} />
          ))}

          {/* Execution State Card */}
          {executionState && (
            <ExecutionStateCard
              state={executionState}
              onPause={handlePause}
              onResume={handleResume}
              onCancel={handleCancel}
              onRollback={handleRollback}
            />
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-slate-700 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleExecute()}
            placeholder="What would you like me to do?"
            className="flex-1 border-slate-600 bg-slate-800 text-white"
            disabled={isProcessing || !!executionState}
          />

          <div className="flex gap-2">
            <Button
              onClick={handleExecute}
              disabled={!input.trim() || isProcessing || !!executionState}
              className="h-11 w-11 bg-blue-600 hover:bg-blue-700 sm:w-auto"
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
    </div>
  );
};

// Chat Message Component
const ChatMessageComponent: React.FC<{ message: WorkforceChatMessage }> = ({ message }) => {
  const getIcon = () => {
    switch (message.type) {
      case 'user':
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
            U
          </div>
        );
      case 'system':
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700">
            AI
          </div>
        );
      case 'success':
        return <CheckCircle2 className="h-8 w-8 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-8 w-8 text-red-500" />;
      default:
        return null;
    }
  };

  const getBgColor = () => {
    switch (message.type) {
      case 'user':
        return 'bg-blue-600/10 border-blue-600/20';
      case 'success':
        return 'bg-green-600/10 border-green-600/20';
      case 'error':
        return 'bg-red-600/10 border-red-600/20';
      default:
        return 'bg-slate-800/50 border-slate-700/50';
    }
  };

  return (
    <div className={`flex gap-3 rounded-lg border p-4 ${getBgColor()}`}>
      <div className="flex-shrink-0">{getIcon()}</div>
      <div className="flex-1">
        <p className="text-sm leading-relaxed text-white">{message.content}</p>
        <span className="mt-1 block text-xs text-slate-500">
          {message.timestamp.toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
};

// Execution State Card
const ExecutionStateCard: React.FC<{
  state: ExecutionState;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRollback: (taskId: string) => void;
}> = ({ state, onPause, onResume, onCancel, onRollback }) => {
  return (
    <Card className="border-slate-700 bg-slate-800 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Execution Progress</h3>
        <div className="flex gap-2">
          {state.status === 'running' && (
            <Button size="sm" variant="outline" onClick={onPause}>
              <Pause className="h-4 w-4" />
            </Button>
          )}
          {state.status === 'paused' && (
            <Button size="sm" variant="outline" onClick={onResume}>
              <Play className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-slate-400">Progress</span>
            <span className="text-white">{Math.round(state.progress)}%</span>
          </div>
          <Progress value={state.progress} className="h-2" />
        </div>

        <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="text-2xl font-bold text-white">{state.tasks.length}</div>
            <div className="text-xs text-slate-400">Total Tasks</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-500">{state.completedTasks}</div>
            <div className="text-xs text-slate-400">Completed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-500">{state.failedTasks}</div>
            <div className="text-xs text-slate-400">Failed</div>
          </div>
        </div>

        {state.currentTask && (
          <div className="rounded-lg bg-slate-900/50 p-3">
            <div className="mb-1 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-sm font-medium text-white">Current Task</span>
            </div>
            <p className="text-sm text-slate-300">
              {state.currentTask.title || state.currentTask.description}
            </p>
            <div className="mt-2 flex gap-2">
              {state.currentTask.requiredAgent && (
                <Badge variant="outline" className="text-xs">
                  {state.currentTask.requiredAgent}
                </Badge>
              )}
              {state.currentTask.domain && (
                <Badge variant="outline" className="text-xs">
                  {state.currentTask.domain}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Task List */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-slate-400">Tasks</h4>
          <ScrollArea className="h-40">
            {state.tasks.map((task) => (
              <TaskItem key={task.id} task={task} onRollback={() => onRollback(task.id)} />
            ))}
          </ScrollArea>
        </div>
      </div>
    </Card>
  );
};

// Task Item Component
const TaskItem: React.FC<{ task: Task; onRollback: () => void }> = ({ task, onRollback }) => {
  const getStatusIcon = () => {
    switch (task.status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'in_progress':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-slate-500" />;
    }
  };

  return (
    <div className="group flex items-center gap-2 rounded p-2 transition-colors hover:bg-slate-700/50">
      {getStatusIcon()}
      <span className="flex-1 text-sm text-slate-300">{task.title || task.description}</span>
      {task.status === 'completed' && (
        <Button
          size="sm"
          variant="ghost"
          className="opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onRollback}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
};

export default WorkforceChat;
