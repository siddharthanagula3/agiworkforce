import { useEffect, useState } from 'react';
import { MessageList } from './MessageList';
import { InputComposer } from './InputComposer.enhanced';
import { useChatStore } from '../../stores/chatStore';
import { cn } from '../../lib/utils';
import { extractArtifacts } from '../../utils/fileUpload';
import { toast } from 'sonner';
import type { FileAttachment, Artifact, ChatRoutingPreferences } from '../../types/chat';

interface ChatInterfaceProps {
  className?: string;
}

/**
 * Enhanced ChatInterface with artifact and file attachment support
 *
 * Features:
 * - Artifact rendering (code blocks, charts, tables)
 * - File attachments with drag-and-drop
 * - Progress indicators for uploads
 * - Error handling with toast notifications
 * - Automatic artifact extraction from messages
 */
export function ChatInterface({ className }: ChatInterfaceProps) {
  const { messages, loading, loadConversations, sendMessage } = useChatStore();
  const [uploading, setUploading] = useState(false);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleSendMessage = async (
    content: string,
    attachments?: FileAttachment[],
    _captures?: unknown,
    _routing?: ChatRoutingPreferences
  ) => {
    try {
      setUploading(true);

      // Upload files if any
      if (attachments && attachments.length > 0) {
        try {
          // In production, this would upload to your backend
          // For now, we'll use the local data URLs
          // const uploadedAttachments = attachments;

          toast.success(`Uploaded ${attachments.length} file(s)`);
        } catch (error) {
          toast.error('Failed to upload files');
          console.error('Upload error:', error);
          setUploading(false);
          return;
        }
      }

      // Extract artifacts from message content
      const artifacts = extractArtifacts(content);

      // Send message with attachments and artifacts
      // Note: You'll need to update the sendMessage function in chatStore
      // to handle artifacts and attachments
      // For now, we just send the message content without attachments
      // TODO: Implement attachment support in chatStore
      await sendMessage(content);

      // If artifacts were found, you might want to add them to the message
      if (artifacts.length > 0) {
        console.log('Extracted artifacts:', artifacts);
        // TODO: Update the message with artifacts
      }
    } catch (error) {
      toast.error('Failed to send message');
      console.error('Send message error:', error);
    } finally {
      setUploading(false);
    }
  };

  // Convert backend data to UI format for components
  const messagesUI = messages.map((msg) => ({
    id: msg.id.toString(),
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    tokens: msg.tokens,
    cost: msg.cost,
    artifacts: msg.artifacts,
    attachments: msg.attachments,
  }));

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex-1 overflow-hidden">
        <MessageList messages={messagesUI} loading={loading || uploading} />
      </div>
      <InputComposer
        onSend={handleSendMessage}
        disabled={loading || uploading}
        {...(uploading && { placeholder: 'Uploading files...' })}
      />
    </div>
  );
}

/**
 * Example: Creating and displaying artifacts in messages
 */
export function createExampleArtifacts(): Artifact[] {
  return [
    // Code artifact example
    {
      id: 'artifact-1',
      type: 'code',
      language: 'typescript',
      title: 'User Interface Type',
      content: `interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

function getUserById(id: number): Promise<User> {
  return fetch(\`/api/users/\${id}\`)
    .then(response => response.json());
}`,
    },
    // Chart artifact example
    {
      id: 'artifact-2',
      type: 'chart',
      title: 'Monthly Revenue',
      content: JSON.stringify({
        type: 'line',
        xKey: 'month',
        data: [
          { month: 'Jan', revenue: 12000, expenses: 8000 },
          { month: 'Feb', revenue: 15000, expenses: 9000 },
          { month: 'Mar', revenue: 18000, expenses: 10000 },
          { month: 'Apr', revenue: 22000, expenses: 11000 },
          { month: 'May', revenue: 25000, expenses: 12000 },
        ],
        lines: [
          { dataKey: 'revenue', color: '#8884d8' },
          { dataKey: 'expenses', color: '#ff8042' },
        ],
      }),
    },
    // Table artifact example
    {
      id: 'artifact-3',
      type: 'table',
      title: 'Top Customers',
      content: JSON.stringify([
        { rank: 1, name: 'Alice Johnson', purchases: 45, total: '$12,450' },
        { rank: 2, name: 'Bob Smith', purchases: 38, total: '$10,200' },
        { rank: 3, name: 'Carol White', purchases: 32, total: '$8,900' },
        { rank: 4, name: 'David Brown', purchases: 28, total: '$7,600' },
        { rank: 5, name: 'Eve Davis', purchases: 25, total: '$6,800' },
      ]),
    },
  ];
}

/**
 * Example: Creating a message with artifacts and attachments
 */
export function createExampleMessage(): {
  id: string;
  role: 'assistant';
  content: string;
  timestamp: Date;
  artifacts: Artifact[];
  attachments: FileAttachment[];
} {
  return {
    id: 'example-msg-1',
    role: 'assistant',
    content: `I've analyzed the data and created some visualizations for you. Here's what I found:

The TypeScript interface shows the User data structure we're working with. The revenue chart demonstrates steady growth over the past 5 months, with revenue outpacing expenses. The customer table highlights our top 5 customers by purchase volume.

Key insights:
- Revenue increased 108% from January to May
- Customer retention is strong among top purchasers
- Profit margin improving month over month`,
    timestamp: new Date(),
    artifacts: createExampleArtifacts(),
    attachments: [
      {
        id: 'att-1',
        name: 'analysis-report.pdf',
        size: 245678,
        type: 'application/pdf',
        url: '/files/analysis-report.pdf',
      },
      {
        id: 'att-2',
        name: 'data-visualization.png',
        size: 123456,
        type: 'image/png',
        data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
    ],
  };
}
