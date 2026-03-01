/**
 * useVibeSend - Custom hook for sending messages in the Vibe dashboard
 *
 * Extracted from VibeDashboard.tsx to reduce component complexity.
 * Handles the full send flow: create user message, stream AI response,
 * parse code files, save assistant message, update orchestrator phases.
 */

import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { AuthUser } from '@core/auth/authentication-manager';
import type { AgentMessage } from '../components/agent-panel/AgentMessageList';
import type { WorkingStep } from '../components/agent-panel/WorkingProcessSection';
import type { AgentStatus } from '../components/agent-panel/AgentStatusCard';
import { VibeMessageService } from '../services/vibe-message-service';
import { vibeMessageHandler } from '../services/vibe-message-handler';
import type { VibeEvent, BehaviorType } from '../services/vibe-phase-orchestrator';

interface UseVibeSendOptions {
  user: AuthUser | null;
  currentSessionId: string | null;
  ensureSession: () => Promise<string | null>;
  streamSSEResponse: (
    messageId: string,
    conversationHistory: Array<{ role: string; content: string }>,
  ) => Promise<string>;
  upsertMessage: (message: AgentMessage) => void;
  setIsLoading: (loading: boolean) => void;
  setWorkingSteps: React.Dispatch<React.SetStateAction<WorkingStep[]>>;
  activeAgent: AgentStatus;
  setActiveAgent: React.Dispatch<React.SetStateAction<AgentStatus>>;
  orchestratorSession: unknown;
  initSession: (mode: BehaviorType) => void;
  processEvent: (event: VibeEvent) => void;
}

export function useVibeSend({
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
}: UseVibeSendOptions) {
  const messagesRef = useRef<AgentMessage[]>([]);

  /** Keep messagesRef in sync — call this from a useEffect in the parent */
  const syncMessages = useCallback((messages: AgentMessage[]) => {
    messagesRef.current = messages;
  }, []);

  const handleSendMessage = useCallback(
    async (content: string, files?: File[]) => {
      if (!content.trim()) return;
      if (!user) {
        toast.error('You must be logged in to send messages.');
        return;
      }

      // Defensive: Ensure we have a valid sessionId
      const sessionId = currentSessionId || (await ensureSession());
      if (!sessionId || typeof sessionId !== 'string') {
        toast.error('Unable to send message: Invalid session.');
        return;
      }

      setIsLoading(true);
      setWorkingSteps([
        {
          id: 'analyze',
          description: 'Analyzing request\u2026',
          status: 'in_progress',
          timestamp: new Date(),
        },
        {
          id: 'plan',
          description: 'Planning multi-agent workflow',
          status: 'pending',
        },
        {
          id: 'execute',
          description: 'Executing plan',
          status: 'pending',
        },
      ]);

      // Initialize phase orchestrator (VibeSDK pattern)
      if (!orchestratorSession) {
        initSession('phasic');
      }
      processEvent({ type: 'connection_established', sessionId });
      processEvent({ type: 'blueprint_generating' });

      try {
        // Create user message locally first
        const userMessage: AgentMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content,
          timestamp: new Date(),
        };
        upsertMessage(userMessage);

        // Create user message in database
        await VibeMessageService.createMessage({
          sessionId,
          userId: user.id,
          role: 'user',
          content,
          metadata: {
            files: files?.map((file) => file.name) || [],
          },
        });

        setWorkingSteps((prev) =>
          prev.map((step, index) => (index <= 1 ? { ...step, status: 'completed' } : step)),
        );

        // Update phase orchestrator - blueprint complete, start implementation
        processEvent({ type: 'generation_started' });

        // Create streaming assistant message
        const assistantMessageId = crypto.randomUUID();
        const assistantMessage: AgentMessage = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          agentName: activeAgent.name,
          agentRole: activeAgent.role,
          isStreaming: true,
        };

        upsertMessage(assistantMessage);

        // Build conversation history for the API
        const conversationHistory = [...messagesRef.current, userMessage].map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        }));

        // Stream response from /api/llm/completion via SSE
        const fullResponse = await streamSSEResponse(assistantMessageId, conversationHistory);

        if (!fullResponse) {
          throw new Error('No response received from AI');
        }

        // Process AI response for code files
        try {
          const parseResult = await vibeMessageHandler.handleAIResponse(fullResponse, sessionId);

          if (parseResult.filesCreated > 0) {
            // Emit file generation events to phase orchestrator
            for (const file of parseResult.files) {
              processEvent({
                type: 'file_generated',
                filePath: file.path,
                content: file.content,
              });
            }

            // If project structure detected, show info
            if (parseResult.projectInfo.type !== 'unknown') {
              toast.success(
                `Detected ${parseResult.projectInfo.type} project with ${parseResult.filesCreated} files`,
              );
            }
          }

          // Mark generation complete
          processEvent({ type: 'generation_complete' });
        } catch (parseError) {
          console.error('[VIBE] Failed to parse code from response:', parseError);
          // Don't fail the whole message if parsing fails
        }

        // Save final assistant message to database (use same ID to prevent duplicate via realtime)
        await VibeMessageService.createMessage({
          id: assistantMessageId,
          sessionId,
          userId: user.id,
          role: 'assistant',
          content: fullResponse,
          employeeName: assistantMessage.agentName,
          employeeRole: assistantMessage.agentRole,
          isStreaming: false,
        });

        setWorkingSteps((prev) =>
          prev.map((step) =>
            step.id === 'execute'
              ? { ...step, status: 'completed', timestamp: new Date() }
              : step,
          ),
        );
      } catch (error) {
        console.error('[VIBE] Failed to send message', error);
        toast.error(error instanceof Error ? error.message : 'Failed to send message');
        setWorkingSteps((prev) =>
          prev.map((step) =>
            step.status === 'in_progress' ? { ...step, status: 'failed' } : step,
          ),
        );
        setActiveAgent({ ...activeAgent, status: 'error' });
      } finally {
        setIsLoading(false);
      }
    },
    [
      activeAgent,
      currentSessionId,
      ensureSession,
      initSession,
      orchestratorSession,
      processEvent,
      setActiveAgent,
      setIsLoading,
      setWorkingSteps,
      streamSSEResponse,
      upsertMessage,
      user,
    ],
  );

  return { handleSendMessage, syncMessages };
}
