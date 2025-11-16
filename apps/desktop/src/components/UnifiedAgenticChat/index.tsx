import React, { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { useAgenticEvents } from '../../hooks/useAgenticEvents';
import { ChatMessageList } from './ChatMessageList';
import { ChatInputArea, SendOptions } from './ChatInputArea';
import { SidecarPanel } from './SidecarPanel';
import { AgentStatusBanner } from './AgentStatusBanner';
import { ChatInputToolbar } from './ChatInputToolbar';
import { PanelRightOpen, PanelRightClose } from 'lucide-react';
import { useModelStore } from '../../stores/modelStore';

export interface UnifiedAgenticChatProps {
  className?: string;
  layout?: 'default' | 'compact' | 'immersive';
  sidecarPosition?: 'right' | 'left' | 'bottom';
  defaultSidecarOpen?: boolean;
  onSendMessage?: (content: string, options: SendOptions) => Promise<void>;
}

/**
 * UnifiedAgenticChat - Main container for the unified agentic chat interface
 *
 * This component provides a complete chat interface with:
 * - Message list with virtual scrolling
 * - Input area with attachments and context
 * - Sidecar panel for operations, reasoning, files, etc.
 * - Mission Control modal overlay (future)
 * - Global keyboard shortcuts (future)
 *
 * @example
 * ```tsx
 * <UnifiedAgenticChat
 *   layout="default"
 *   sidecarPosition="right"
 *   defaultSidecarOpen={true}
 *   onSendMessage={async (content, options) => {
 *     // Handle message sending
 *   }}
 * />
 * ```
 */
export const UnifiedAgenticChat: React.FC<UnifiedAgenticChatProps> = ({
  className = '',
  layout = 'default',
  sidecarPosition = 'right',
  defaultSidecarOpen = true,
  onSendMessage,
}) => {
  const sidecarOpen = useUnifiedChatStore((state) => state.sidecarOpen);
  const setSidecarOpen = useUnifiedChatStore((state) => state.setSidecarOpen);
  const addMessage = useUnifiedChatStore((state) => state.addMessage);
  const updateMessage = useUnifiedChatStore((state) => state.updateMessage);
  const deleteMessage = useUnifiedChatStore((state) => state.deleteMessage);
  const setStreamingMessage = useUnifiedChatStore((state) => state.setStreamingMessage);
  const conversationMode = useUnifiedChatStore((state) => state.conversationMode);
  const { selectedModel, selectedProvider } = useModelStore();

  // Setup event listeners for real-time updates from Tauri backend
  useAgenticEvents();

  // Initialize sidecar state
  useEffect(() => {
    if (defaultSidecarOpen !== undefined && sidecarOpen === undefined) {
      setSidecarOpen(defaultSidecarOpen);
    }
  }, [defaultSidecarOpen, sidecarOpen, setSidecarOpen]);

  // Handle message sending
  const handleSendMessage = async (content: string, options: SendOptions) => {
    // Add user message
    addMessage({
      role: 'user',
      content,
      attachments: options.attachments,
    });

    // Create assistant message placeholder for streaming
    const assistantMessageId = crypto.randomUUID();
    addMessage({
      role: 'assistant',
      content: '',
      metadata: { streaming: true },
    });
    setStreamingMessage(assistantMessageId);

    try {
      // Call the provided handler or use default behavior
      if (onSendMessage) {
        await onSendMessage(content, options);
      } else {
        // 🔥 Call actual Tauri backend with conversationMode
        const response = await invoke<any>('chat_send_message', {
          request: {
            content,
            provider: selectedProvider || undefined,
            model: selectedModel || undefined,
            stream: false, // Non-streaming for now
            enable_tools: true,
            conversation_mode: conversationMode, // 🔒 Security setting
          },
        });

        // Update assistant message with response
        updateMessage(assistantMessageId, {
          content: response.assistant_message?.content || 'No response',
          metadata: {
            streaming: false,
            model: response.assistant_message?.model,
            provider: response.assistant_message?.provider,
            tokenCount: response.assistant_message?.tokens,
            cost: response.assistant_message?.cost,
          },
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      updateMessage(assistantMessageId, {
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { streaming: false },
      });
    } finally {
      setStreamingMessage(null);
    }
  };

  // Simulate streaming response (placeholder for real implementation)
  const simulateAssistantResponse = async (messageId: string) => {
    const response =
      "I'm the unified agentic chat interface! I can help you with various tasks. This is a simulated response for now.";
    const words = response.split(' ');

    for (let i = 0; i < words.length; i++) {
      const partial = words.slice(0, i + 1).join(' ');
      updateMessage(messageId, {
        content: partial + (i < words.length - 1 ? '...' : ''),
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    updateMessage(messageId, {
      metadata: { streaming: false, tokenCount: response.split(' ').length * 1.3 },
    });
  };

  // Handle message actions
  const handleMessageEdit = (id: string, content: string) => {
    updateMessage(id, { content });
  };

  const handleMessageDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this message?')) {
      deleteMessage(id);
    }
  };

  const handleMessageRegenerate = (id: string) => {
    // TODO: Implement regeneration logic
    console.log('Regenerate message:', id);
  };

  // Toggle sidecar
  const handleSidecarToggle = () => {
    setSidecarOpen(!sidecarOpen);
  };

  // Layout-specific classes
  const layoutClasses = {
    default: 'p-0',
    compact: 'p-2',
    immersive: 'p-0',
  };

  return (
    <div
      className={`unified-agentic-chat h-screen flex flex-col bg-gray-50 dark:bg-gray-900 ${layoutClasses[layout]} ${className}`}
    >
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                AGI Workforce
              </h1>
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded-full">
                Beta
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSidecarToggle}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title={sidecarOpen ? 'Close sidecar' : 'Open sidecar'}
              >
                {sidecarOpen ? (
                  <PanelRightClose size={20} className="text-gray-600 dark:text-gray-400" />
                ) : (
                  <PanelRightOpen size={20} className="text-gray-600 dark:text-gray-400" />
                )}
              </button>
            </div>
          </div>

          {/* Agent Status Banner */}
          <AgentStatusBanner />

          {/* Message List */}
          <div className="flex-1 overflow-hidden bg-white dark:bg-gray-900">
            <ChatMessageList
              onMessageEdit={handleMessageEdit}
              onMessageDelete={handleMessageDelete}
              onMessageRegenerate={handleMessageRegenerate}
            />
          </div>

          {/* Chat Input Toolbar */}
          <ChatInputToolbar />

          {/* Input Area */}
          <ChatInputArea
            onSend={handleSendMessage}
            placeholder="Type a message or describe a task..."
            enableAttachments={true}
            enableVoice={false}
            enableScreenshot={true}
          />
        </div>

        {/* Sidecar Panel */}
        {sidecarOpen && (
          <SidecarPanel
            isOpen={sidecarOpen}
            onToggle={handleSidecarToggle}
            position={sidecarPosition}
          />
        )}
      </div>

      {/* Mission Control Modal (Future) */}
      {/* <MissionControl isOpen={missionControlOpen} onClose={() => setMissionControlOpen(false)} /> */}
    </div>
  );
};

export default UnifiedAgenticChat;
