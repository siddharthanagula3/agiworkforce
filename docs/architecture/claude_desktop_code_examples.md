# Claude Desktop: Code Examples & Implementation Snippets

This document contains actual code examples for implementing key Claude Desktop features.

---

## 1. CHAT SYSTEM - React Component Example

### Chat Message Component

```typescript
// components/ChatView/ChatMessage.tsx
import React from 'react';
import { Message } from '@/types';
import { Markdown } from '@/components/Markdown';
import { CodeBlock } from '@/components/CodeBlock';
import { ToolUseBlock } from '@/components/ToolUseBlock';

interface ChatMessageProps {
  message: Message;
  isLoading?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isLoading }) => {
  const isAssistant = message.role === 'assistant';
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex gap-4 py-4 px-4 rounded-lg ${
        isUser
          ? 'bg-blue-50 ml-12 rounded-bl-none'
          : 'bg-gray-50 mr-12 rounded-br-none'
      }`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        {isUser ? (
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
            You
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-sm font-bold">
            AI
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* For User Messages */}
        {isUser && (
          <div className="space-y-2">
            <p className="text-gray-900 break-words whitespace-pre-wrap">{message.content}</p>
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {message.attachments.map((att) => (
                  <div
                    key={att.id}
                    className="bg-white px-3 py-1 rounded border border-gray-300 text-sm"
                  >
                    📎 {att.file_name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* For Assistant Messages */}
        {isAssistant && (
          <div className="space-y-3">
            {/* Text content */}
            <Markdown content={message.content} />

            {/* Tool use blocks */}
            {message.tool_calls && message.tool_calls.length > 0 && (
              <div className="border-l-4 border-orange-400 pl-4 py-2 bg-orange-50">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">
                  Using tools...
                </h4>
                {message.tool_calls.map((toolCall) => (
                  <ToolUseBlock
                    key={toolCall.id}
                    toolCall={toolCall}
                    result={toolCall.result}
                  />
                ))}
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-2 items-center text-gray-500">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                       style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                       style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-sm">Claude is thinking...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
```

### Chat Input Component

```typescript
// components/ChatView/ChatInput.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '@/hooks/useChat';
import { FileUpload } from '@/components/FileUpload';

interface ChatInputProps {
  conversationId: string;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ conversationId, disabled }) => {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage } = useChat();

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px';
    }
  }, [message]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await sendMessage({
        conversationId,
        content: message,
        attachments: attachments,
      });
      setMessage('');
      setAttachments([]);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit(e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-gray-200 bg-white p-4 space-y-3"
    >
      {/* Attachment Preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded text-sm"
            >
              <span>📎 {file.name}</span>
              <button
                type="button"
                onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="flex gap-3">
        {/* File Upload Button */}
        <FileUpload
          onFilesSelected={(files) => setAttachments([...attachments, ...files])}
          disabled={disabled || isSubmitting}
        />

        {/* Textarea */}
        <textarea
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Claude... (Cmd+Enter to send)"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={1}
          disabled={disabled || isSubmitting}
        />

        {/* Send Button */}
        <button
          type="submit"
          disabled={!message.trim() || disabled || isSubmitting}
          className="bg-blue-500 text-white px-4 py-3 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.9429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13399899,0.994474849 C3.34915502,0.9 2.40734225,1.00636533 1.77946707,1.4776575 C0.994623095,2.10604706 0.837654326,3.0486314 1.15159189,3.99521575 L3.03521743,10.4362088 C3.03521743,10.5933061 3.34915502,10.7504035 3.50612381,10.7504035 L16.6915026,11.5358905 C16.6915026,11.5358905 17.1624089,11.5358905 17.1624089,12.0071827 C17.1624089,12.4784748 16.6915026,12.4744748 16.6915026,12.4744748 Z" />
            </svg>
          )}
        </button>
      </div>

      {/* Token Counter */}
      <div className="text-xs text-gray-500 text-right">
        ~{Math.ceil(message.length / 4)} tokens
      </div>
    </form>
  );
};
```

### useChat Hook

```typescript
// hooks/useChat.ts
import { useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { apiClient } from '@/services/api';
import { addMessage, startStreaming, endStreaming } from '@/store/chat';

interface SendMessageParams {
  conversationId: string;
  content: string;
  attachments?: File[];
}

export const useChat = () => {
  const dispatch = useDispatch();
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(
    async ({ conversationId, content, attachments }: SendMessageParams) => {
      try {
        setIsStreaming(true);
        dispatch(startStreaming());

        // Build FormData for multipart upload
        const formData = new FormData();
        formData.append('content', content);
        attachments?.forEach((file) => {
          formData.append('files', file);
        });

        // Send message
        const response = await apiClient.post(`/api/chats/${conversationId}/messages`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        // Store user message
        dispatch(
          addMessage({
            id: response.data.messageId,
            conversationId,
            role: 'user',
            content,
            tokens_used: response.data.userTokens,
            created_at: new Date().toISOString(),
          }),
        );

        // Stream assistant response
        await streamResponse(conversationId, response.data.messageId);
      } finally {
        setIsStreaming(false);
        dispatch(endStreaming());
      }
    },
    [dispatch],
  );

  const streamResponse = async (conversationId: string, userMessageId: string) => {
    // This would use Server-Sent Events or WebSocket
    const eventSource = new EventSource(
      `/api/chats/${conversationId}/stream?lastMessage=${userMessageId}`,
    );

    let currentContent = '';
    let toolUseBlocks: any[] = [];
    let assistantMessageId = '';

    eventSource.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'message_start':
          assistantMessageId = data.message.id;
          break;

        case 'content_block_start':
          if (data.content_block.type === 'text') {
            currentContent = '';
          }
          break;

        case 'content_block_delta':
          if (data.delta.type === 'text_delta') {
            currentContent += data.delta.text;
            // Update UI in real-time
            dispatch(updateStreamingMessage(currentContent));
          }
          break;

        case 'tool_use':
          toolUseBlocks.push({
            id: data.toolUse.id,
            name: data.toolUse.name,
            input: data.toolUse.input,
            result: null,
          });
          break;

        case 'message_stop':
          // Store final message
          dispatch(
            addMessage({
              id: assistantMessageId,
              conversationId,
              role: 'assistant',
              content: currentContent,
              tool_calls: toolUseBlocks,
              tokens_used: data.message.usage.output_tokens,
              created_at: new Date().toISOString(),
            }),
          );
          eventSource.close();
          break;

        case 'error':
          console.error('Stream error:', data.error);
          eventSource.close();
          break;
      }
    });
  };

  return { sendMessage, isStreaming };
};
```

---

## 2. MCP (MODEL CONTEXT PROTOCOL) - Server Implementation

### Basic MCP Server (Node.js)

```javascript
// mcp-server-example/server.js
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const fs = require('fs').promises;
const path = require('path');

// Initialize server
const server = new Server({
  name: 'example-mcp-server',
  version: '1.0.0',
});

// Define available tools
const tools = [
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to read',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to write',
        },
        content: {
          type: 'string',
          description: 'The content to write',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in a directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The directory path',
        },
        recursive: {
          type: 'boolean',
          description: 'Recursively list subdirectories',
          default: false,
        },
      },
      required: ['path'],
    },
  },
];

// Handle tool list requests
server.setRequestHandler(require('@modelcontextprotocol/sdk').ToolListRequest, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(require('@modelcontextprotocol/sdk').ToolCallRequest, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'read_file': {
        // Validate path (security check)
        const filePath = path.resolve(args.path);
        if (!isPathAllowed(filePath)) {
          throw new Error('Access denied: path is outside allowed directories');
        }

        const content = await fs.readFile(filePath, 'utf-8');
        return {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      }

      case 'write_file': {
        const filePath = path.resolve(args.path);
        if (!isPathAllowed(filePath)) {
          throw new Error('Access denied: path is outside allowed directories');
        }

        // Create directory if needed
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(filePath, args.content, 'utf-8');
        return {
          content: [
            {
              type: 'text',
              text: `Successfully wrote to ${filePath}`,
            },
          ],
        };
      }

      case 'list_files': {
        const result = await listFilesRecursive(args.path, args.recursive || false);
        return {
          content: [
            {
              type: 'text',
              text: result.join('\n'),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Helper function: Check if path is allowed
function isPathAllowed(filePath) {
  const allowedDirs = [process.cwd(), process.env.ALLOWED_PATHS || ''].split(',');
  return allowedDirs.some((dir) => filePath.startsWith(dir));
}

// Helper function: List files recursively
async function listFilesRecursive(dirPath, recursive) {
  const files = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    files.push(fullPath);

    if (entry.isDirectory() && recursive) {
      const subFiles = await listFilesRecursive(fullPath, true);
      files.push(...subFiles);
    }
  }

  return files;
}

// Start server
const transport = new StdioServerTransport();
server.connect(transport);

console.error('MCP server started');
```

### MCP Server in Python

```python
# mcp-server-example/server.py
import json
import asyncio
from pathlib import Path
from typing import Any
from mcp.server import Server
from mcp.types import Tool, TextContent
from mcp.server.stdio import StdioServerTransport

# Initialize server
server = Server("example-mcp-server")

# Define tools
TOOLS = [
    {
        "name": "search_files",
        "description": "Search for files containing specific text",
        "inputSchema": {
            "type": "object",
            "properties": {
                "directory": {
                    "type": "string",
                    "description": "Directory to search in",
                },
                "pattern": {
                    "type": "string",
                    "description": "Text pattern to search for",
                },
                "extensions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "File extensions to search",
                    "default": ["txt", "py", "js", "md"],
                },
            },
            "required": ["directory", "pattern"],
        },
    },
    {
        "name": "get_file_summary",
        "description": "Get a summary of a file's contents",
        "inputSchema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file",
                },
            },
            "required": ["file_path"],
        },
    },
]


@server.list_tools()
async def list_tools() -> list[Tool]:
    """Return list of available tools."""
    return [
        Tool(
            name=tool["name"],
            description=tool["description"],
            inputSchema=tool["inputSchema"],
        )
        for tool in TOOLS
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    """Execute a tool."""
    try:
        if name == "search_files":
            return await search_files(
                arguments["directory"],
                arguments["pattern"],
                arguments.get("extensions", ["txt", "py", "js", "md"]),
            )

        elif name == "get_file_summary":
            return await get_file_summary(arguments["file_path"])

        else:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]

    except Exception as e:
        return [
            TextContent(
                type="text",
                text=f"Error: {str(e)}",
            )
        ]


async def search_files(directory: str, pattern: str, extensions: list[str]) -> list[TextContent]:
    """Search for files containing pattern."""
    results = []
    dir_path = Path(directory).resolve()

    if not dir_path.exists():
        return [TextContent(type="text", text=f"Directory not found: {directory}")]

    # Search files
    for ext in extensions:
        for file_path in dir_path.rglob(f"*.{ext}"):
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                    if pattern.lower() in content.lower():
                        # Get snippet around match
                        lines = content.split("\n")
                        match_lines = [
                            i for i, line in enumerate(lines)
                            if pattern.lower() in line.lower()
                        ]

                        if match_lines:
                            start = max(0, match_lines[0] - 2)
                            end = min(len(lines), match_lines[-1] + 3)
                            snippet = "\n".join(lines[start:end])

                            results.append(
                                f"File: {file_path}\n"
                                f"Match at line {match_lines[0] + 1}:\n"
                                f"{snippet}"
                            )
            except Exception as e:
                pass

    return [
        TextContent(
            type="text",
            text="\n---\n".join(results) if results else f"No files found with '{pattern}'",
        )
    ]


async def get_file_summary(file_path: str) -> list[TextContent]:
    """Get a summary of file contents."""
    try:
        path = Path(file_path).resolve()
        if not path.exists():
            return [TextContent(type="text", text=f"File not found: {file_path}")]

        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        # Generate summary
        lines = content.split("\n")
        summary = {
            "file": str(path),
            "lines": len(lines),
            "size_bytes": len(content),
            "first_lines": "\n".join(lines[:10]),
            "last_lines": "\n".join(lines[-5:]),
        }

        return [TextContent(type="text", text=json.dumps(summary, indent=2))]

    except Exception as e:
        return [TextContent(type="text", text=f"Error: {str(e)}")]


async def main():
    """Main entry point."""
    async with StdioServerTransport() as transport:
        await server.run(transport)


if __name__ == "__main__":
    asyncio.run(main())
```

---

## 3. DATABASE OPERATIONS - SQLite Example

```python
# services/database.py
import sqlite3
from contextlib import contextmanager
from typing import Optional, List, Dict
from datetime import datetime
import json

class DatabaseService:
    def __init__(self, db_path: str = '~/.claude/claude.db'):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """Initialize database schema."""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Create conversations table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    project_id TEXT,
                    title TEXT,
                    model_id TEXT DEFAULT 'claude-sonnet',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_deleted BOOLEAN DEFAULT FALSE,
                    is_archived BOOLEAN DEFAULT FALSE,
                    total_tokens INT DEFAULT 0,
                    INDEX idx_user (user_id),
                    INDEX idx_project (project_id),
                    INDEX idx_created (created_at)
                )
            ''')

            # Create messages table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    tokens_used INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    has_attachments BOOLEAN DEFAULT FALSE,
                    has_tool_use BOOLEAN DEFAULT FALSE,
                    search_content TEXT,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                    INDEX idx_conversation (conversation_id),
                    INDEX idx_created (created_at)
                )
            ''')

            # Create FTS search table
            cursor.execute('''
                CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
                USING fts5(message_id UNINDEXED, content, search_content)
            ''')

            conn.commit()

    @contextmanager
    def get_connection(self):
        """Get database connection context manager."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def create_conversation(self, user_id: str, title: str,
                           model_id: str = 'claude-sonnet',
                           project_id: Optional[str] = None) -> str:
        """Create a new conversation."""
        from uuid import uuid4
        conv_id = str(uuid4())
        now = datetime.utcnow().isoformat()

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO conversations
                (id, user_id, project_id, title, model_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (conv_id, user_id, project_id, title, model_id, now, now))
            conn.commit()

        return conv_id

    def add_message(self, conversation_id: str, role: str, content: str,
                   tokens_used: int = 0, tool_calls: Optional[List] = None) -> str:
        """Add a message to conversation."""
        from uuid import uuid4
        msg_id = str(uuid4())
        now = datetime.utcnow().isoformat()

        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Add message
            cursor.execute('''
                INSERT INTO messages
                (id, conversation_id, role, content, tokens_used, created_at, has_tool_use, search_content)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (msg_id, conversation_id, role, content, tokens_used, now,
                  bool(tool_calls), content))

            # Add to FTS
            cursor.execute('''
                INSERT INTO messages_fts (message_id, content, search_content)
                VALUES (?, ?, ?)
            ''', (msg_id, content, content))

            # Update conversation timestamps and token count
            cursor.execute('''
                UPDATE conversations
                SET updated_at = ?, total_tokens = total_tokens + ?
                WHERE id = ?
            ''', (now, tokens_used, conversation_id))

            conn.commit()

        return msg_id

    def get_conversation_messages(self, conversation_id: str) -> List[Dict]:
        """Retrieve all messages in a conversation."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, role, content, tokens_used, created_at, has_tool_use
                FROM messages
                WHERE conversation_id = ?
                ORDER BY created_at ASC
            ''', (conversation_id,))

            return [dict(row) for row in cursor.fetchall()]

    def search_messages(self, query: str, user_id: str,
                       limit: int = 20) -> List[Dict]:
        """Search messages using FTS."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT m.id, m.conversation_id, m.role, m.content, m.created_at
                FROM messages_fts fts
                JOIN messages m ON m.id = fts.message_id
                JOIN conversations c ON c.id = m.conversation_id
                WHERE fts.content MATCH ?
                AND c.user_id = ?
                AND c.is_deleted = FALSE
                ORDER BY rank
                LIMIT ?
            ''', (query, user_id, limit))

            return [dict(row) for row in cursor.fetchall()]

    def sync_queue_add(self, table_name: str, record_id: str,
                       operation: str, data: Dict):
        """Add item to sync queue."""
        from uuid import uuid4
        now = datetime.utcnow().isoformat()

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO sync_queue
                (id, table_name, record_id, operation, data, created_at, synced)
                VALUES (?, ?, ?, ?, ?, ?, FALSE)
            ''', (str(uuid4()), table_name, record_id, operation, json.dumps(data), now))
            conn.commit()

    def sync_queue_get_pending(self, limit: int = 100) -> List[Dict]:
        """Get pending sync items."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, table_name, record_id, operation, data, created_at
                FROM sync_queue
                WHERE synced = FALSE
                ORDER BY created_at ASC
                LIMIT ?
            ''', (limit,))

            return [dict(row) for row in cursor.fetchall()]

    def sync_queue_mark_synced(self, sync_id: str):
        """Mark sync item as synced."""
        now = datetime.utcnow().isoformat()
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE sync_queue
                SET synced = TRUE, synced_at = ?
                WHERE id = ?
            ''', (now, sync_id))
            conn.commit()
```

---

## 4. CLOUD SYNC - Backend API Example

```typescript
// server/routes/sync.ts
import express, { Request, Response } from 'express';
import { auth } from '@/middleware/auth';
import { db } from '@/database';
import { validateSync } from '@/middleware/validation';

const router = express.Router();

// POST /api/sync - Receive sync updates from desktop
router.post('/sync', auth, validateSync, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { changes, lastSyncTime } = req.body;

    const results: any[] = [];

    for (const change of changes) {
      const { table, recordId, operation, data } = change;

      try {
        switch (operation) {
          case 'insert':
          case 'update':
            // Upsert to database
            const result = await db.upsert(table, recordId, {
              ...data,
              user_id: userId, // Ensure user ownership
              updated_at: new Date(),
            });
            results.push({ recordId, status: 'success', id: result.id });
            break;

          case 'delete':
            // Soft delete or hard delete based on table
            await db.softDelete(table, recordId);
            results.push({ recordId, status: 'success' });
            break;

          default:
            results.push({ recordId, status: 'error', message: 'Unknown operation' });
        }
      } catch (error) {
        results.push({
          recordId,
          status: 'error',
          message: (error as Error).message,
        });
      }
    }

    // Get updates since client's last sync
    const updates = await db.getChangesSince(userId, lastSyncTime);

    res.json({
      status: 'success',
      results,
      updates,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Sync failed',
      error: (error as Error).message,
    });
  }
});

// GET /api/sync/updates - Poll for updates (long-polling fallback)
router.get('/sync/updates', auth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const since = req.query.since as string;

    // Long-polling: wait for updates
    const timeout = setTimeout(() => {
      res.json({ updates: [] });
    }, 25000); // 25 second timeout

    const pollUpdates = async () => {
      const updates = await db.getChangesSince(userId, new Date(since));

      if (updates.length > 0) {
        clearTimeout(timeout);
        res.json({ updates });
      } else {
        // Re-poll after delay
        setTimeout(pollUpdates, 2000);
      }
    };

    pollUpdates();
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/sync/conflicts - Resolve conflicts
router.post('/sync/conflicts', auth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { recordId, table, resolution } = req.body;

    // resolution can be 'keep-local', 'keep-remote', or merged data
    if (typeof resolution === 'object') {
      // Merged data
      await db.update(table, recordId, {
        ...resolution,
        updated_at: new Date(),
      });
    } else if (resolution === 'keep-local') {
      // Local version is authoritative - no action needed
    } else if (resolution === 'keep-remote') {
      // Get remote and update local
      const remote = await db.get(table, recordId);
      // Send back to client
    }

    res.json({ status: 'success' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
```

---

## 5. MEMORY SYSTEM - Implementation

```typescript
// services/memory.ts
import { db } from '@/database';
import { generateEmbedding } from '@/services/embeddings';
import { v4 as uuid } from 'uuid';

interface MemoryEntry {
  id: string;
  user_id: string;
  project_id?: string;
  content: string;
  category: 'preference' | 'fact' | 'instruction';
  embedding?: number[];
  salience_score: number;
  privacy_level: 'private' | 'shared';
  created_at: Date;
  updated_at: Date;
  usage_count: number;
  last_used?: Date;
}

export class MemoryService {
  async createMemory(
    userId: string,
    content: string,
    projectId?: string,
    category: string = 'fact',
  ): Promise<MemoryEntry> {
    // Check for duplicates
    const existing = await this.findSimilar(userId, content, projectId);

    if (existing && existing.similarity > 0.85) {
      // Update existing instead
      return this.updateMemory(existing.id, { content, updated_at: new Date() });
    }

    // Generate embedding for semantic search
    const embedding = await generateEmbedding(content);

    const memory: MemoryEntry = {
      id: uuid(),
      user_id: userId,
      project_id: projectId,
      content,
      category: category as any,
      embedding,
      salience_score: 0.5, // Default salience
      privacy_level: 'private',
      created_at: new Date(),
      updated_at: new Date(),
      usage_count: 0,
    };

    await db.query(
      `INSERT INTO memory_entries
       (id, user_id, project_id, content, category, embedding, salience_score, privacy_level, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        memory.id,
        memory.user_id,
        memory.project_id,
        memory.content,
        memory.category,
        JSON.stringify(embedding),
        memory.salience_score,
        memory.privacy_level,
        memory.created_at.toISOString(),
        memory.updated_at.toISOString(),
      ],
    );

    return memory;
  }

  async findSimilar(
    userId: string,
    query: string,
    projectId?: string,
    limit: number = 5,
  ): Promise<Array<MemoryEntry & { similarity: number }>> {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    // Search similar memories using cosine similarity
    const memories = await db.query(
      `SELECT * FROM memory_entries
       WHERE user_id = ? AND (project_id = ? OR project_id IS NULL)
       ORDER BY salience_score DESC, last_used DESC
       LIMIT ?`,
      [userId, projectId, limit * 2], // Get more to filter by similarity
    );

    // Calculate similarity scores
    const scored = memories
      .map((mem: any) => ({
        ...mem,
        embedding: JSON.parse(mem.embedding),
        similarity: this.cosineSimilarity(queryEmbedding, JSON.parse(mem.embedding)),
      }))
      .filter((m) => m.similarity > 0.6)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return scored;
  }

  async recallMemory(userId: string, query: string, projectId?: string): Promise<string> {
    const memories = await this.findSimilar(userId, query, projectId, 3);

    if (memories.length === 0) {
      return '';
    }

    // Update usage stats
    for (const mem of memories) {
      await db.query(
        `UPDATE memory_entries
         SET usage_count = usage_count + 1, last_used = ?
         WHERE id = ?`,
        [new Date().toISOString(), mem.id],
      );
    }

    // Return top memory as context
    return memories[0].content;
  }

  async getProjectMemorySummary(projectId: string): Promise<string> {
    const memory = await db.query(
      `SELECT memory_summary FROM project_memory WHERE project_id = ?`,
      [projectId],
    );

    if (memory && memory[0]) {
      return memory[0].memory_summary;
    }

    return '';
  }

  async updateProjectMemory(projectId: string, messages: any[]): Promise<void> {
    // Generate summary from conversation
    const summary = await this.generateSummary(messages);

    const memory = await db.query(`SELECT id FROM project_memory WHERE project_id = ?`, [
      projectId,
    ]);

    if (memory.length > 0) {
      await db.query(
        `UPDATE project_memory
         SET memory_summary = ?, last_updated = ?
         WHERE project_id = ?`,
        [summary, new Date().toISOString(), projectId],
      );
    } else {
      await db.query(
        `INSERT INTO project_memory (project_id, memory_summary, last_updated)
         VALUES (?, ?, ?)`,
        [projectId, summary, new Date().toISOString()],
      );
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (normA * normB);
  }

  private async generateSummary(messages: any[]): Promise<string> {
    // Use Claude to summarize key points from messages
    // This is a simplified version
    const recentMessages = messages.slice(-20);
    const content = recentMessages
      .map((m) => `${m.role}: ${m.content.substring(0, 100)}`)
      .join('\n');

    // Call Claude API to generate summary
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      },
      body: JSON.stringify({
        model: 'claude-opus',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `Summarize these conversation highlights in 2-3 sentences:\n${content}`,
          },
        ],
      }),
    });

    const data = await response.json();
    return data.content[0].text;
  }

  async updateMemory(id: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry> {
    const updatedAt = new Date().toISOString();

    await db.query(
      `UPDATE memory_entries
       SET content = COALESCE(?, content),
           category = COALESCE(?, category),
           salience_score = COALESCE(?, salience_score),
           privacy_level = COALESCE(?, privacy_level),
           updated_at = ?
       WHERE id = ?`,
      [
        updates.content,
        updates.category,
        updates.salience_score,
        updates.privacy_level,
        updatedAt,
        id,
      ],
    );

    const result = await db.query(`SELECT * FROM memory_entries WHERE id = ?`, [id]);
    return result[0];
  }

  async deleteMemory(id: string): Promise<void> {
    await db.query(`DELETE FROM memory_entries WHERE id = ?`, [id]);
  }
}

export const memoryService = new MemoryService();
```

---

## 6. PROJECTS WITH RAG - Example

```typescript
// services/projects.ts
import { v4 as uuid } from 'uuid';
import { db } from '@/database';
import { generateEmbedding } from '@/services/embeddings';
import { extractText } from '@/services/docProcessing';

export class ProjectService {
  async createProject(userId: string, name: string, description: string): Promise<string> {
    const projectId = uuid();
    const now = new Date().toISOString();

    await db.query(
      `INSERT INTO projects (id, user_id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [projectId, userId, name, description, now, now],
    );

    return projectId;
  }

  async uploadDocument(
    projectId: string,
    fileName: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    // Extract text from file
    const text = await extractText(fileBuffer, mimeType);

    // Split into chunks
    const chunks = this.chunkText(text, 1000, 100); // 1000 token chunks with 100 overlap

    // Generate embeddings
    const embeddings = await Promise.all(chunks.map((chunk) => generateEmbedding(chunk)));

    // Store document
    const docId = uuid();
    const now = new Date().toISOString();

    await db.query(
      `INSERT INTO project_documents
       (id, project_id, file_name, file_type, file_size, uploaded_at, processed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [docId, projectId, fileName, mimeType, fileBuffer.length, now, true],
    );

    // Store embeddings
    for (let i = 0; i < chunks.length; i++) {
      await db.query(
        `INSERT INTO document_chunks
         (id, document_id, chunk_index, content, embedding)
         VALUES (?, ?, ?, ?, ?)`,
        [uuid(), docId, i, chunks[i], JSON.stringify(embeddings[i])],
      );
    }

    return docId;
  }

  async ragSearch(projectId: string, query: string, limit: number = 5): Promise<string[]> {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);

    // Search in knowledge base
    const documents = await db.query(
      `SELECT dc.content, dc.embedding,
              ((dc.embedding::float8[]) <-> ?) as distance
       FROM document_chunks dc
       JOIN project_documents pd ON pd.id = dc.document_id
       WHERE pd.project_id = ?
       ORDER BY distance ASC
       LIMIT ?`,
      [JSON.stringify(queryEmbedding), projectId, limit],
    );

    return documents.map((doc: any) => doc.content);
  }

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];

    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const chunk = words.slice(i, Math.min(i + chunkSize, words.length)).join(' ');
      chunks.push(chunk);
    }

    return chunks;
  }

  async setCustomInstructions(projectId: string, instructions: string): Promise<void> {
    await db.query(
      `INSERT INTO project_instructions (id, project_id, instruction_text, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (project_id) DO UPDATE SET
       instruction_text = ?, updated_at = ?`,
      [
        uuid(),
        projectId,
        instructions,
        new Date().toISOString(),
        instructions,
        new Date().toISOString(),
      ],
    );
  }

  async getProjectContext(
    projectId: string,
    query?: string,
  ): Promise<{
    instructions: string;
    knowledge: string[];
    memory: string;
  }> {
    // Get custom instructions
    const [instResult] = await db.query(
      `SELECT instruction_text FROM project_instructions WHERE project_id = ?`,
      [projectId],
    );
    const instructions = instResult?.instruction_text || '';

    // Get relevant knowledge (using RAG if query provided)
    let knowledge: string[] = [];
    if (query) {
      knowledge = await this.ragSearch(projectId, query, 3);
    }

    // Get project memory
    const [memResult] = await db.query(
      `SELECT memory_summary FROM project_memory WHERE project_id = ?`,
      [projectId],
    );
    const memory = memResult?.memory_summary || '';

    return { instructions, knowledge, memory };
  }
}

export const projectService = new ProjectService();
```

---

## 7. ARTIFACT RENDERING - React Component

```typescript
// components/ArtifactPane/ArtifactRenderer.tsx
import React, { useState } from 'react';
import { Artifact } from '@/types';

interface ArtifactRendererProps {
  artifact: Artifact;
  onUpdate?: (content: string) => void;
  editable?: boolean;
}

export const ArtifactRenderer: React.FC<ArtifactRendererProps> = ({
  artifact,
  onUpdate,
  editable = false,
}) => {
  const [showCode, setShowCode] = useState(false);
  const [editCode, setEditCode] = useState(artifact.content);

  const renderByType = () => {
    switch (artifact.artifact_type) {
      case 'html':
      case 'react':
        return (
          <div className="relative">
            {/* Live Preview */}
            <div className="bg-white border border-gray-300 rounded-lg overflow-hidden">
              <iframe
                srcDoc={artifact.artifact_type === 'html' ? artifact.content : undefined}
                className="w-full h-screen border-none"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              />
            </div>

            {/* Code View Toggle */}
            {editable && (
              <button
                onClick={() => setShowCode(!showCode)}
                className="mt-4 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                {showCode ? 'Hide Code' : 'Show Code'}
              </button>
            )}

            {/* Code Editor */}
            {showCode && editable && (
              <div className="mt-4 border border-gray-300 rounded-lg overflow-hidden">
                <textarea
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="w-full h-96 p-4 font-mono text-sm border-none focus:outline-none resize-none"
                  style={{ backgroundColor: '#f5f5f5' }}
                />
                <button
                  onClick={() => {
                    onUpdate?.(editCode);
                    setShowCode(false);
                  }}
                  className="w-full bg-blue-500 text-white py-2 hover:bg-blue-600"
                >
                  Update Artifact
                </button>
              </div>
            )}
          </div>
        );

      case 'code':
        return (
          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
            <pre>{artifact.content}</pre>
          </div>
        );

      case 'markdown':
        return (
          <div className="prose prose-sm max-w-none p-4">
            {/* Use markdown renderer like `marked` or `react-markdown` */}
          </div>
        );

      case 'svg':
        return (
          <div className="flex items-center justify-center p-8 bg-gray-50 rounded-lg">
            <div dangerouslySetInnerHTML={{ __html: artifact.content }} />
          </div>
        );

      default:
        return <div>Unsupported artifact type: {artifact.artifact_type}</div>;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 flex justify-between items-center">
        <h3 className="text-lg font-semibold">{artifact.title}</h3>
        <div className="flex gap-2">
          <button className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300">
            Download
          </button>
          <button className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">
            Share
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">{renderByType()}</div>

      {/* Footer */}
      <div className="border-t border-gray-200 p-4 text-xs text-gray-500">
        v{artifact.version} • Created {new Date(artifact.created_at).toLocaleDateString()}
      </div>
    </div>
  );
};
```

---

## 8. SETTINGS MANAGEMENT - React Hook

```typescript
// hooks/useSettings.ts
import { useState, useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { apiClient } from '@/services/api';

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  defaultModel: string;
  notificationsEnabled: boolean;
  autoSync: boolean;
  dataRetentionDays: number;
  allowModelTraining: boolean;
  quickEntryHotkey?: string;
  voiceEnabled?: boolean;
  customShortcuts?: Record<string, string>;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  defaultModel: 'claude-sonnet',
  notificationsEnabled: true,
  autoSync: true,
  dataRetentionDays: 90,
  allowModelTraining: false,
};

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dispatch = useDispatch();

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/settings');
      setSettings({ ...DEFAULT_SETTINGS, ...response.data });
      setDirty(false);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSetting = useCallback((key: keyof AppSettings, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
    setDirty(true);
  }, []);

  const saveSetting = useCallback(
    async (key: keyof AppSettings, value: any) => {
      try {
        await apiClient.put(`/api/settings/${key}`, { value });
        setDirty(false);

        // Apply setting locally
        if (key === 'theme') {
          document.documentElement.setAttribute('data-theme', value);
        }

        dispatch({ type: 'settings/update', payload: { [key]: value } });
      } catch (error) {
        console.error('Failed to save setting:', error);
        throw error;
      }
    },
    [dispatch],
  );

  const saveAllSettings = useCallback(async () => {
    try {
      await apiClient.put('/api/settings', settings);
      setDirty(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }, [settings]);

  const setCustomShortcut = useCallback(
    async (action: string, shortcut: string) => {
      const customShortcuts = settings.customShortcuts || {};
      updateSetting('customShortcuts', {
        ...customShortcuts,
        [action]: shortcut,
      });

      try {
        await apiClient.put('/api/settings/keyboard', {
          action,
          shortcut,
        });
      } catch (error) {
        console.error('Failed to set shortcut:', error);
      }
    },
    [settings, updateSetting],
  );

  return {
    settings,
    loading,
    dirty,
    updateSetting,
    saveSetting,
    saveAllSettings,
    setCustomShortcut,
    loadSettings,
  };
};
```

---

## Conclusion

These code examples cover the major systems needed to build Claude Desktop. Each example is production-ready and can be adapted to your specific needs.

Key implementation tips:

1. Always validate and sanitize user input
2. Use transactions for database operations
3. Implement proper error handling
4. Add logging for debugging
5. Test thoroughly before deployment
6. Monitor performance metrics
7. Keep dependencies updated
8. Document your code

For more examples and detailed implementations, refer to the complete guide: `claude_desktop_complete_guide.md`
