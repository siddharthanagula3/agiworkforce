/**
 * VibeDashboard - Redesigned AI Development Agent Interface
 * Inspired by: Lovable.dev, Bolt.new, Replit.com, Emergent.sh
 *
 * Layout (bolt.new style):
 * - Left (~35%): Chat panel
 * - Right (~65%): Workbench with tab switcher (Code / Preview) + collapsible terminal
 * - Mobile: Tab-based switcher (Chat / Code / Preview)
 *
 * Updated: Mar 4th 2026 - Bolt.new-style layout redesign
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useVibeChatStore } from '../stores/vibe-chat-store';
import { VibeLayout } from '../layouts/VibeLayout';
import { SimpleChatPanel } from '../components/redesign/SimpleChatPanel';
import { CodeEditorPanel } from '../components/redesign/CodeEditorPanel';
import { LivePreviewPanel } from '../components/redesign/LivePreviewPanel';
import { VibeEnhancedComposer, type VibeMode } from '../components/redesign/VibeEnhancedComposer';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { Loader2, GripVertical, Sparkles } from 'lucide-react';
import type { AgentStatus } from '../components/agent-panel/AgentStatusCard';
import type { WorkingStep } from '../components/agent-panel/WorkingProcessSection';
import type { AgentMessage } from '../components/agent-panel/AgentMessageList';
import { supabase } from '@shared/lib/supabase-client';
import { useVibeRealtime, type VibeAgentActionRow } from '../hooks/use-vibe-realtime';
import { VibeMessageService } from '../services/vibe-message-service';
import { toast } from 'sonner';
import { cn } from '@shared/lib/utils';
import { PhaseTimeline } from '../components/redesign/PhaseTimeline';
import { useVibeOrchestrator } from '../services/vibe-phase-orchestrator';
import { TokenUsageDisplay } from '../components/TokenUsageDisplay';
import { useVibeKeyboardShortcuts } from '../hooks/use-vibe-keyboard-shortcuts';
import { VibeKeyboardShortcutsDialog } from '../components/VibeKeyboardShortcutsDialog';
import ErrorBoundary from '@shared/components/ErrorBoundary';
import { Button } from '@shared/ui/button';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import { useSSEStreaming } from '../hooks/useSSEStreaming';
import { useVibeSend } from '../hooks/useVibeSend';
import VibeChatCanvas from '../components/chat/VibeChatCanvas';

// Error fallback component for Vibe page
const VibeErrorFallback = () => (
  <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
    <div className="max-w-md text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-10 w-10 text-destructive" />
      </div>
      <h2 className="mb-2 text-2xl font-bold">Vibe Workspace Error</h2>
      <p className="mb-6 text-muted-foreground">
        Something went wrong in the Vibe AI development workspace. Your work may not have been
        saved.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button onClick={() => window.location.reload()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Reload Workspace
        </Button>
        <Button
          variant="outline"
          onClick={() => (window.location.href = '/chat')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    </div>
  </div>
);

interface VibeMessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  user_id?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  employee_role?: string | null;
  timestamp?: string | null;
  // Updated: Jan 15th 2026 - Fixed any type
  metadata?: Record<string, unknown> | null;
  is_streaming?: boolean | null;
}

/**
 * Type-safe interface for VibeAgentAction metadata fields
 */
interface AgentActionMetadata {
  summary?: string;
  description?: string;
  command?: string;
  agent_role?: string;
  is_streaming?: boolean;
}

/**
 * Type-safe interface for VibeAgentAction result fields
 */
interface AgentActionResult {
  output?: string;
  summary?: string;
}

/**
 * Type guard to safely extract metadata from VibeAgentActionRow
 */
function getValidatedActionMetadata(
  metadata: Record<string, unknown> | null | undefined,
): AgentActionMetadata {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }

  const result: AgentActionMetadata = {};

  if (typeof metadata['summary'] === 'string') {
    result.summary = metadata['summary'];
  }
  if (typeof metadata['description'] === 'string') {
    result.description = metadata['description'];
  }
  if (typeof metadata['command'] === 'string') {
    result.command = metadata['command'];
  }
  if (typeof metadata['agent_role'] === 'string') {
    result.agent_role = metadata['agent_role'];
  }
  if (typeof metadata['is_streaming'] === 'boolean') {
    result.is_streaming = metadata['is_streaming'];
  }

  return result;
}

/**
 * Type guard to safely extract result from VibeAgentActionRow
 */
function getValidatedActionResult(
  result: Record<string, unknown> | null | undefined,
): AgentActionResult {
  if (!result || typeof result !== 'object') {
    return {};
  }

  const validated: AgentActionResult = {};

  if (typeof result['output'] === 'string') {
    validated.output = result['output'];
  }
  if (typeof result['summary'] === 'string') {
    validated.summary = result['summary'];
  }

  return validated;
}

/**
 * Type guard to safely extract is_streaming from VibeMessageRow metadata
 */
function getMessageIsStreaming(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }
  return typeof metadata['is_streaming'] === 'boolean' ? metadata['is_streaming'] : false;
}

// Removed OutputPanel - using new CodeEditorPanel and LivePreviewPanel instead

const VibeDashboard: React.FC = () => {
  const router = useRouter();
  const { user } = useAuthStore();
  const { currentSessionId, setCurrentSession } = useVibeChatStore();

  // Phase orchestrator for VibeSDK-style workflow tracking
  const { session: orchestratorSession, initSession, processEvent } = useVibeOrchestrator();

  const [activeAgent, setActiveAgent] = useState<AgentStatus>({
    name: 'Vibe Assistant',
    role: 'Full-Stack Developer',
    status: 'idle',
  });
  const [_workingSteps, setWorkingSteps] = useState<WorkingStep[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [vibeMode, setVibeMode] = useState<VibeMode>('build');
  const [workbenchView, setWorkbenchView] = useState<'code' | 'preview'>('code');
  const [showTerminal, setShowTerminal] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chat' | 'code' | 'preview'>('chat');

  const messageIdsRef = useRef<Set<string>>(new Set());
  const workingStepsMapRef = useRef<Map<string, WorkingStep>>(new Map());

  // Keyboard shortcuts
  const { shortcuts } = useVibeKeyboardShortcuts({
    onSaveFile: () => {
      toast.info('Save functionality coming soon');
    },
    onRefreshPreview: () => {
      setPreviewKey((prev) => prev + 1);
      toast.success('Preview refreshed');
    },
    onNewFile: () => {
      toast.info('New file functionality coming soon');
    },
    onShowShortcuts: () => {
      setShortcutsDialogOpen(true);
    },
  });

  const mapRowToMessage = useCallback((row: VibeMessageRow): AgentMessage => {
    return {
      id: row.id,
      role: row.role,
      content: row.content,
      agentName: row.employee_name || undefined,
      agentRole: row.employee_role || undefined,
      timestamp: row.timestamp ? new Date(row.timestamp) : new Date(),
      isStreaming: getMessageIsStreaming(row.metadata),
    };
  }, []);

  const upsertMessage = useCallback((message: AgentMessage) => {
    messageIdsRef.current.add(message.id);
    setMessages((prev) => {
      const index = prev.findIndex((item) => item.id === message.id);
      if (index === -1) {
        const next = [...prev, message];
        next.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        return next;
      }
      const next = [...prev];
      next[index] = message;
      return next;
    });
  }, []);

  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const messages = await VibeMessageService.getMessages(sessionId);
      const mapped = messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        agentName: msg.employee_name || undefined,
        agentRole: msg.employee_role || undefined,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        isStreaming: Boolean(msg.is_streaming),
      }));
      messageIdsRef.current = new Set(mapped.map((msg) => msg.id));
      setMessages(mapped);
    } catch (error) {
      console.error('[VIBE] Failed to load messages', error);
      toast.error('Failed to load VIBE history.');
    }
  }, []);

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (currentSessionId) {
      return currentSessionId;
    }
    if (!user) return null;

    try {
      // vibe_sessions not in generated Supabase types — use untyped client
      const untypedSupabase = supabase as unknown as import('@supabase/supabase-js').SupabaseClient;

      const { data, error } = await untypedSupabase
        .from('vibe_sessions')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      let sessionId: string | null = (data as { id: string } | null)?.id ?? null;

      if (!sessionId) {
        const { data: inserted, error: insertError } = await untypedSupabase
          .from('vibe_sessions')
          .insert({ user_id: user.id, title: 'VIBE Session' })
          .select('id')
          .single();

        if (insertError) throw insertError;
        sessionId = (inserted as { id: string } | null)?.id ?? null;
      }

      if (!sessionId) {
        throw new Error('Failed to create or retrieve session ID');
      }

      setCurrentSession(sessionId);
      await loadMessages(sessionId);
      return sessionId;
    } catch (error) {
      console.error('[VIBE] Failed to initialize session', error);
      toast.error('Unable to initialize VIBE session.');
      return null;
    }
  }, [currentSessionId, loadMessages, setCurrentSession, user]);

  // SSE streaming hook (extracted from inline function)
  const { streamSSEResponse } = useSSEStreaming({ setMessages });

  const handleAgentAction = useCallback((action: VibeAgentActionRow) => {
    const status: WorkingStep['status'] =
      action.status === 'failed'
        ? 'failed'
        : action.status === 'completed'
          ? 'completed'
          : 'in_progress';

    // Use type guards to safely extract metadata and result
    const actionMetadata = getValidatedActionMetadata(action.metadata);
    const actionResult = getValidatedActionResult(action.result);

    const description =
      actionMetadata.summary ||
      actionMetadata.description ||
      actionMetadata.command ||
      `${action.agent_name} ${action.action_type.replace(/_/g, ' ')}`;

    workingStepsMapRef.current.set(action.id, {
      id: action.id,
      description,
      status,
      timestamp: action.timestamp ? new Date(action.timestamp) : undefined,
      result: actionResult.output || actionResult.summary || action.error || undefined,
    });

    const ordered = Array.from(workingStepsMapRef.current.values()).sort(
      (a, b) => (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0),
    );
    setWorkingSteps(ordered);

    setActiveAgent((prev) => ({
      name: action.agent_name,
      role: actionMetadata.agent_role || prev?.role || 'AI Agent',
      status: status === 'failed' ? 'error' : status === 'completed' ? 'completed' : 'working',
      currentTask: description,
    }));
  }, []);

  useVibeRealtime({
    sessionId: currentSessionId || null,
    onAction: handleAgentAction,
  });

  // Send message hook (extracted from inline function)
  const { handleSendMessage, syncMessages } = useVibeSend({
    user,
    currentSessionId,
    ensureSession,
    streamSSEResponse,
    upsertMessage,
    setIsLoading,
    setWorkingSteps,
    activeAgent,
    setActiveAgent,
    orchestratorSession,
    initSession,
    processEvent,
  });

  useEffect(() => {
    syncMessages(messages);
  }, [messages, syncMessages]);

  useEffect(() => {
    if (!user) {
      router.push('/login?from=/chat');
      return;
    }

    ensureSession();
  }, [ensureSession, router, user]);

  useEffect(() => {
    // Defensive: Ensure sessionId is valid before creating channel
    const sessionId = currentSessionId;
    if (!sessionId || typeof sessionId !== 'string') return;

    const channel = supabase
      .channel(`vibe-messages-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vibe_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (!payload.new) return;
          const row = payload.new as VibeMessageRow;
          const message = mapRowToMessage(row);
          upsertMessage(message);
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[VIBE] Failed to subscribe to message updates');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentSessionId, mapRowToMessage, upsertMessage]);

  if (!user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ErrorBoundary fallback={<VibeErrorFallback />}>
      <VibeLayout>
        <div className="flex h-full flex-col">
          {/* Header with Phase Timeline */}
          <div className="border-b border-border bg-gradient-to-r from-purple-600/10 to-blue-600/10 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h1 className="text-lg font-bold">Vibe</h1>
                </div>
                {/* Compact Phase Timeline - VibeSDK-inspired */}
                <div className="hidden sm:block">
                  <PhaseTimeline session={orchestratorSession} compact={true} className="ml-2" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <TokenUsageDisplay sessionId={currentSessionId} />
              </div>
            </div>
          </div>

          {/* Main Content - Bolt.new Style Layout */}
          <div className="flex-1 overflow-hidden">
            {/* Desktop Layout */}
            <div className="hidden h-full md:block">
              <PanelGroup orientation="horizontal">
                {/* Left Panel - Chat */}
                <Panel defaultSize={35} minSize={20} maxSize={50}>
                  <SimpleChatPanel
                    messages={messages}
                    isLoading={isLoading}
                    onPromptSelect={handleSendMessage}
                    showEmptyState={messages.length === 0}
                  />
                </Panel>

                <PanelResizeHandle className="group relative w-1.5 bg-border/50 transition-colors hover:bg-primary/50">
                  <div className="absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="rounded-sm border border-border bg-background p-0.5 shadow-lg">
                      <GripVertical className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </div>
                </PanelResizeHandle>

                {/* Right Panel - Workbench */}
                <Panel defaultSize={65} minSize={50}>
                  <div className="flex h-full flex-col">
                    {/* View Switcher Bar */}
                    <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        {(['code', 'preview'] as const).map((view) => (
                          <button
                            key={view}
                            onClick={() => setWorkbenchView(view)}
                            className={cn(
                              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                              workbenchView === view
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            )}
                          >
                            {view === 'code' ? 'Code' : 'Preview'}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowTerminal(!showTerminal)}
                          className={cn(
                            'rounded-md px-2 py-1 text-xs transition-colors',
                            showTerminal
                              ? 'bg-muted text-foreground'
                              : 'text-muted-foreground hover:bg-muted',
                          )}
                        >
                          Terminal
                        </button>
                      </div>
                    </div>

                    {/* Workbench Content */}
                    <div className="flex-1 overflow-hidden">
                      {workbenchView === 'code' ? (
                        <CodeEditorPanel />
                      ) : (
                        <LivePreviewPanel key={previewKey} />
                      )}
                    </div>
                  </div>
                </Panel>
              </PanelGroup>
            </div>

            {/* Mobile Layout */}
            <div className="flex h-full flex-col md:hidden">
              <div className="flex border-b border-border bg-muted/20">
                {(['chat', 'code', 'preview'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setMobileTab(tab)}
                    className={cn(
                      'flex-1 py-2 text-center text-xs font-medium transition-colors',
                      mobileTab === tab
                        ? 'border-b-2 border-primary text-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-hidden">
                {mobileTab === 'chat' &&
                  (messages.length === 0 ? (
                    <VibeChatCanvas />
                  ) : (
                    <SimpleChatPanel
                      messages={messages}
                      isLoading={isLoading}
                      onPromptSelect={handleSendMessage}
                      showEmptyState={false}
                    />
                  ))}
                {mobileTab === 'code' && <CodeEditorPanel />}
                {mobileTab === 'preview' && <LivePreviewPanel key={previewKey} />}
              </div>
            </div>
          </div>

          {/* Enhanced Message Composer - Fixed at bottom */}
          <VibeEnhancedComposer
            onSend={handleSendMessage}
            isLoading={isLoading}
            mode={vibeMode}
            onModeChange={setVibeMode}
            showModeToggle={messages.length > 0}
            showQuickActions={messages.length > 0}
          />
        </div>

        {/* Keyboard Shortcuts Dialog */}
        <VibeKeyboardShortcutsDialog
          open={shortcutsDialogOpen}
          onOpenChange={setShortcutsDialogOpen}
          shortcuts={shortcuts}
        />
      </VibeLayout>
    </ErrorBoundary>
  );
};

export default VibeDashboard;
