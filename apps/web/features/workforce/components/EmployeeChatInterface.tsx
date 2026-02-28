// AI Employee Chat Interface
// Demonstrates AI Employee interaction with inline types

import React, { useState, useEffect, useRef } from 'react';

// Inline types to avoid broken relative import from ../../types
interface AIEmployeeLocal {
  id: string;
  name: string;
  role: string;
  status?: string;
  capabilities?: { coreSkills?: string[] };
  tools?: { name: string }[];
}

interface ChatMessageLocal {
  id: string;
  session_id: string;
  sender_type: 'user' | 'employee' | 'system';
  sender_id: string;
  message: string;
  message_type: 'text' | 'tool_result' | 'system';
  metadata: Record<string, unknown>;
  created_at: string;
}

interface ToolResultLocal {
  success: boolean;
  data?: unknown;
  executionTime?: number;
  cost?: number;
  metadata?: Record<string, unknown>;
}

interface AIEmployeeChatProps {
  employee: AIEmployeeLocal;
  userId: string;
  onToolExecution?: (toolId: string, result: ToolResultLocal) => void;
}

export const AIEmployeeChat: React.FC<AIEmployeeChatProps> = ({
  employee,
  userId,
  onToolExecution,
}) => {
  const [messages, setMessages] = useState<ChatMessageLocal[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize chat with welcome message
  useEffect(() => {
    const skills = employee.capabilities?.coreSkills?.join(', ') || employee.role;
    const welcomeMessage: ChatMessageLocal = {
      id: 'welcome-001',
      session_id: 'session-001',
      sender_type: 'employee',
      sender_id: employee.id,
      message: `Hello! I'm ${employee.name}, your ${employee.role}. I'm here to help you with ${skills}. What can I do for you today?`,
      message_type: 'text',
      metadata: {},
      created_at: new Date().toISOString(),
    };
    setMessages([welcomeMessage]);
  }, [employee]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessageLocal = {
      id: `user-${Date.now()}`,
      session_id: 'session-001',
      sender_type: 'user',
      sender_id: userId,
      message: inputMessage,
      message_type: 'text',
      metadata: {},
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = inputMessage;
    setInputMessage('');
    setIsLoading(true);
    setIsTyping(true);

    try {
      // Simulate AI response (executor integration deferred to runtime wiring)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const responseMessage = `I understand your request: "${currentInput}". I'm processing this as ${employee.name}. How else can I help you?`;

      const employeeMessage: ChatMessageLocal = {
        id: `employee-${Date.now()}`,
        session_id: 'session-001',
        sender_type: 'employee',
        sender_id: employee.id,
        message: responseMessage,
        message_type: 'text',
        metadata: {},
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, employeeMessage]);
    } catch (error) {
      const errorMessage: ChatMessageLocal = {
        id: `error-${Date.now()}`,
        session_id: 'session-001',
        sender_type: 'employee',
        sender_id: employee.id,
        message: `I'm sorry, but I encountered an unexpected error: ${(error as Error).message}. Please try again.`,
        message_type: 'system',
        metadata: { error: true },
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const tools = employee.tools || [];

  return (
    <div className="flex h-full flex-col rounded-lg border bg-background">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">
            {employee.name
              .split(' ')
              .map((n: string) => n[0])
              .join('')}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{employee.name}</h3>
            <p className="text-sm text-muted-foreground">{employee.role}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div
            className={`h-2 w-2 rounded-full ${employee.status === 'available' ? 'bg-green-500' : 'bg-yellow-500'}`}
          ></div>
          <span className="text-xs capitalize text-muted-foreground">
            {employee.status || 'available'}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-full rounded-lg px-4 py-2 sm:max-w-[80%] ${
                message.sender_type === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : message.message_type === 'tool_result'
                    ? 'border border-green-200 bg-green-100 text-green-900'
                    : message.message_type === 'system'
                      ? 'border border-yellow-200 bg-yellow-100 text-yellow-900'
                      : 'bg-muted text-foreground'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.message}</div>
              {(message.metadata?.toolsUsed as string[]) && (
                <div className="mt-2 text-xs opacity-75">
                  Tools used: {(message.metadata.toolsUsed as string[]).join(', ')}
                </div>
              )}
              {message.metadata?.executionTime != null ? (
                <div className="mt-1 text-xs opacity-75">
                  Execution time: {String(message.metadata.executionTime)}ms
                </div>
              ) : null}
              {message.metadata?.cost != null ? (
                <div className="mt-1 text-xs opacity-75">
                  Cost: ${Number(message.metadata.cost).toFixed(4)}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-muted px-4 py-2 text-foreground">
              <div className="flex items-center space-x-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-current"></div>
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-current"
                  style={{ animationDelay: '0.1s' }}
                ></div>
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-current"
                  style={{ animationDelay: '0.2s' }}
                ></div>
                <span className="ml-2 text-sm">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t bg-muted/25 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:space-x-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={`Ask ${employee.name} to help you with something...`}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="h-11 min-w-[80px] rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>

        {/* Available Tools */}
        {tools.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium">Available tools:</span>{' '}
            {tools.map((tool: { name: string }) => tool.name).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
};
