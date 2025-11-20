# Claude Desktop: Complete Technical Deep Dive

## Architecture, Features, Implementation & Interconnections

---

## TABLE OF CONTENTS

1. [System Architecture Overview](#system-architecture-overview)
2. [Core Chat System](#core-chat-system)
3. [Desktop Extensions & MCP Protocol](#desktop-extensions--mcp-protocol)
4. [Projects System](#projects-system)
5. [Memory System](#memory-system)
6. [Artifacts System](#artifacts-system)
7. [File Management & Operations](#file-management--operations)
8. [Settings & Configuration](#settings--configuration)
9. [Security & Permissions](#security--permissions)
10. [Feature Interconnections](#feature-interconnections)
11. [Implementation Guide](#implementation-guide)
12. [Data Flow Diagrams](#data-flow-diagrams)

---

# 1. SYSTEM ARCHITECTURE OVERVIEW

## 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│              CLAUDE DESKTOP APPLICATION                 │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │         USER INTERFACE LAYER                        │ │
│  │  • Chat Interface                                   │ │
│  │  • Settings Panel                                   │ │
│  │  • Projects Manager                                 │ │
│  │  • Extensions Manager                               │ │
│  │  • Quick Entry (macOS)                              │ │
│  └────────────────────────────────────────────────────┘ │
│                          ▲                                │
│                          │                                │
│  ┌────────────────────────────────────────────────────┐ │
│  │      APPLICATION LOGIC & STATE MANAGEMENT          │ │
│  │  • Conversation Manager                             │ │
│  │  • Project Manager                                  │ │
│  │  • Memory Manager (SQLite)                          │ │
│  │  • Extension Manager                                │ │
│  │  • Sync Manager (Cloud)                             │ │
│  │  • Cache Manager                                    │ │
│  └────────────────────────────────────────────────────┘ │
│                          ▲                                │
│                          │                                │
│  ┌────────────────────────────────────────────────────┐ │
│  │         LOCAL STORAGE LAYER                         │ │
│  │  • SQLite Database (Config, Memory, Artifacts)     │ │
│  │  • File System (Local Files, Projects)              │ │
│  │  • Node.js Runtime (Built-in)                       │ │
│  │  • Python Runtime (Optional)                        │ │
│  └────────────────────────────────────────────────────┘ │
│                          ▲                                │
│                          │                                │
├──────────────────────────┼──────────────────────────────┤
│   LOCAL SYSTEM           │     CLOUD/REMOTE             │
│  ┌──────────────────┐   │  ┌──────────────────────┐    │
│  │ MCP Servers      │◄──┼─►│ Anthropic Cloud API  │    │
│  │ Extensions       │   │  │                      │    │
│  │ File System      │   │  │ • Claude Models      │    │
│  │ OS Services      │   │  │ • Chat Processing    │    │
│  │ (Keychain, etc)  │   │  │ • Memory Sync        │    │
│  └──────────────────┘   │  │ • Cross-device Sync  │    │
│                         │  └──────────────────────┘    │
└─────────────────────────┴──────────────────────────────┘
```

## 1.2 Data Flow Architecture

```
USER INPUT
    ▼
[Chat Interface / Voice / Screenshot / File Upload]
    ▼
[Input Validation & Preprocessing]
    ▼
[Conversation Manager - Stores Locally in SQLite]
    ▼
[Check MCP Tools Available / Memory System / Project Context]
    ▼
[Build Context + System Prompt + MCP Tools]
    ▼
[Send to Anthropic Cloud API]
    ▼
[Model Processing]
    ▼
[Response Generation]
    ▼
[Execute Tool Calls if Needed (MCP, File Operations)]
    ▼
[Store Response + Tool Results Locally]
    ▼
[Render in UI + Sync to Cloud]
    ▼
[Display to User + Auto-update other devices]
```

## 1.3 Storage Architecture

### Local Storage (On Device)

- **SQLite Database**: `~/.config/Claude/` (Linux/Windows) or `~/Library/Application Support/Claude/` (macOS)
  - Conversation history
  - Chat metadata
  - Memory entries
  - Configuration
  - Artifacts
  - Project metadata

- **File System**:
  - Project files
  - Downloaded files
  - Temporary cache
  - Extension installations (`~/.claude/extensions/`)

### Cloud Storage

- **Anthropic Servers**:
  - Conversation backup
  - Cross-device sync
  - Memory summaries
  - Project collaboration data
  - User preferences

### Synchronization Strategy

```
Local Changes → Cloud Sync Queue → Cloud Storage
     ↑                                   ↓
  ←──────────────── Cloud Pull ─────────
```

---

# 2. CORE CHAT SYSTEM

## 2.1 How Chat Works (Deep Technical Details)

### Chat Initialization Flow

```
[New Chat Created]
    ▼
[Assign Unique Chat ID (UUID)]
    ▼
[Create SQLite Entry: id, timestamp, title, model_id, project_id]
    ▼
[Load Project Context if applicable]
    ▼
[Load Memory if Pro/Max/Team/Enterprise]
    ▼
[Ready for Input]
```

### Message Processing Pipeline

```
1. USER SENDS MESSAGE
   ├─ Text input OR
   ├─ File upload OR
   ├─ Screenshot paste OR
   ├─ Voice transcription (macOS)
   └─ Image paste

2. MESSAGE VALIDATION
   ├─ Check message length
   ├─ Validate file types/sizes
   ├─ Scan for blocked content
   ├─ Check API rate limits
   └─ Timestamp assignment

3. CONTEXT BUILDING
   ├─ Load current conversation history
   ├─ Load project knowledge base (if in project)
   ├─ Load memory summaries (if enabled)
   ├─ Load custom instructions
   ├─ List available MCP tools
   └─ Build system prompt template

4. TOKEN CALCULATION
   ├─ Count tokens in system prompt
   ├─ Count tokens in conversation history
   ├─ Count tokens in project context
   ├─ Check against model's context limit
   └─ Enable RAG (Retrieval-Augmented Generation) if needed

5. MCP TOOL AVAILABILITY SCAN
   ├─ Check enabled extensions
   ├─ Validate each tool's permissions
   ├─ Check permission allowlist/blocklist
   ├─ Prepare tool definitions for Claude
   └─ Show tool availability in UI (hammer icon)

6. SEND TO ANTHROPIC API
   ├─ Build complete request JSON
   ├─ Include: messages, model, system, tools, temperature
   ├─ Compress if needed
   └─ Send via HTTPS

7. STREAM PROCESSING
   ├─ Receive streaming response chunks
   ├─ Parse for text vs tool_use blocks
   ├─ Display text in real-time
   ├─ Queue tool calls for execution
   └─ Track token usage

8. TOOL EXECUTION (if needed)
   ├─ Parse tool call: name, arguments
   ├─ Check if tool requires approval
   ├─ Show UI prompt for user approval
   ├─ Execute tool locally or via MCP server
   ├─ Capture tool output
   └─ Send output back in conversation

9. RESPONSE STORAGE
   ├─ Save full message to SQLite
   ├─ Save tool call metadata
   ├─ Save tool execution results
   ├─ Update conversation metadata
   ├─ Queue for cloud sync
   └─ Update search index

10. UI RENDERING
    ├─ Update chat display
    ├─ Format code blocks
    ├─ Render markdown
    ├─ Create artifact if applicable
    ├─ Show MCP tool execution summary
    └─ Update token counter
```

### Message Data Structure (SQLite Schema)

```sql
-- Conversations table
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    title TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    model_id TEXT,
    total_tokens INT,
    is_archived BOOLEAN,
    is_deleted BOOLEAN
);

-- Messages table
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT FOREIGN KEY,
    role TEXT, -- 'user' or 'assistant'
    content TEXT,
    created_at TIMESTAMP,
    tokens_used INT,
    has_attachments BOOLEAN,
    has_tool_use BOOLEAN,
    tool_calls JSON, -- [{name, args, result}]
    search_index TEXT -- for full-text search
);

-- Attachments table
CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT FOREIGN KEY,
    file_path TEXT,
    file_type TEXT,
    file_size INT,
    uploaded_at TIMESTAMP
);
```

### Model Selection System

```
Available Models:
├─ Claude 3.5 Sonnet (Latest)
│  └─ Context: 200k tokens
│  └─ Best for: Complex reasoning, coding
│
├─ Claude 3 Opus
│  └─ Context: 200k tokens
│  └─ Best for: Deep analysis
│
└─ Claude 3 Haiku
   └─ Context: 200k tokens
   └─ Best for: Quick answers, efficiency

Selection Stored Per:
├─ Global default
├─ Per-conversation
├─ Per-project
└─ Per-user-preference
```

## 2.2 Conversation History Management

### Search Implementation

```
Full-Text Search on SQLite:
├─ Index built on message content
├─ Search includes:
│  ├─ Message text
│  ├─ Artifact titles
│  ├─ File names
│  └─ Project names
├─ Results ranked by:
│  ├─ Recency
│  ├─ Match quality
│  └─ Conversation importance
└─ Accessible via: Search box in Claude Desktop
```

### Sync Strategy

```
Every message creates:
├─ Local entry (immediate)
├─ Sync queue item (marked for cloud)
└─ Background sync process
    ├─ Batches messages
    ├─ Compresses before sending
    ├─ Retries on failure
    ├─ Maintains offline capability
    └─ Timestamp ordering

Cross-device sync:
├─ User logs in on Device A
├─ Creates chat and messages
├─ Messages queue for sync
├─ Sync runs in background (every 30 seconds)
├─ Cloud receives and stores
├─ User opens Device B
├─ Device B queries cloud for recent chats
├─ Messages downloaded and cached locally
└─ Chat history available immediately
```

---

# 3. DESKTOP EXTENSIONS & MCP PROTOCOL

## 3.1 Model Context Protocol (MCP) Deep Dive

### What is MCP?

MCP is an open standard that enables developers to build secure, two-way connections between their data sources and AI-powered tools.

### MCP Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    MCP CLIENT (CLAUDE)                    │
│  (Claude Desktop or other LLM host)                       │
└─────────────────────────────┬──────────────────────────┘
                               │
                   (JSON-RPC 2.0 Communication)
                        Transport Options:
                    ├─ Stdio (local processes)
                    ├─ HTTP (remote services)
                    └─ WebSocket (streaming)
                               │
        ┌──────────────────────┴──────────────────────┐
        ▼                                              ▼
┌──────────────────────┐            ┌────────────────────────┐
│   MCP SERVER #1      │            │   MCP SERVER #N        │
│ (Local Process)      │            │ (Could be remote)      │
│                      │            │                        │
│ ┌──────────────────┐ │            │ ┌──────────────────┐   │
│ │ Tools            │ │            │ │ Tools            │   │
│ │ • read_file      │ │            │ │ • api_call       │   │
│ │ • write_file     │ │            │ │ • query_database │   │
│ │ • list_dir       │ │            │ │ • send_message   │   │
│ └──────────────────┘ │            │ └──────────────────┘   │
│                      │            │                        │
│ ┌──────────────────┐ │            │ ┌──────────────────┐   │
│ │ Resources        │ │            │ │ Resources        │   │
│ │ • File contents  │ │            │ │ • API responses  │   │
│ │ • Directory tree │ │            │ │ • Data snapshots │   │
│ └──────────────────┘ │            │ └──────────────────┘   │
│                      │            │                        │
│ ┌──────────────────┐ │            │ ┌──────────────────┐   │
│ │ Prompts          │ │            │ │ Prompts          │   │
│ │ • System prompts │ │            │ │ • Custom prompts │   │
│ │ • Context setup  │ │            │ │ • Instructions   │   │
│ └──────────────────┘ │            │ └──────────────────┘   │
│                      │            │                        │
│ Backed by:           │            │ Backed by:             │
│ • Local filesystem   │            │ • External APIs        │
│ • Local database     │            │ • Remote services      │
│ • Running processes  │            │ • Cloud resources      │
└──────────────────────┘            └────────────────────────┘
```

### MCP Message Flow

```
USER: "Search my project folder for 'TODO' items"
    │
    ▼
CLAUDE: Decides to use "filesystem" MCP server's search_files tool
    │
    ▼
[Claude sends JSON-RPC 2.0 message]:
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_files",
    "arguments": {
      "path": "/home/user/projects",
      "pattern": "TODO",
      "recursive": true
    }
  }
}
    │
    ▼ (via stdio or HTTP)
    │
MCP SERVER processes request:
├─ Validate arguments
├─ Check permissions (read path allowed?)
├─ Execute local filesystem search
├─ Collect results
└─ Return results
    │
    ▼
[Server sends JSON-RPC 2.0 response]:
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "files": [
      {
        "path": "/home/user/projects/file1.txt",
        "snippet": "TODO: Fix login bug"
      },
      {
        "path": "/home/user/projects/file2.py",
        "snippet": "TODO: Optimize query"
      }
    ]
  }
}
    │
    ▼
CLAUDE: Receives results and incorporates into response
    │
    ▼
CLAUDE: "I found 2 TODO items in your project:
1. file1.txt: Fix login bug
2. file2.py: Optimize query"
    │
    ▼
Display to user
```

## 3.2 Desktop Extensions (.mcpb Files)

### What are Desktop Extensions?

Desktop Extensions bundle an entire MCP server—including all dependencies—into a single installable package.

### Desktop Extension Structure

```
my-extension.mcpb (which is actually a ZIP archive)
│
├─ manifest.json (metadata & configuration)
├─ package.json (for Node.js extensions)
├─ requirements.txt (for Python extensions)
├─ server/ (the actual server code)
│  ├─ index.js
│  ├─ tools.js
│  └─ resources.js
├─ icon.png (extension icon)
├─ screenshots/ (usage examples)
└─ dependencies/ (pre-packaged)
   └─ node_modules/ or venv/
```

### Manifest.json Structure

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "description": "My custom MCP extension",
  "author": {
    "name": "Developer Name",
    "email": "dev@example.com"
  },
  "server": {
    "type": "node", // or "python" or "binary"
    "entry_point": "server/index.js",
    "environment": {
      "NODE_ENV": "production"
    },
    "command": "node",
    "args": ["${__dirname}/server/index.js"]
  },
  "tools": [
    {
      "name": "read_file",
      "description": "Read a file from the filesystem",
      "parameters": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string",
            "description": "File path to read"
          }
        },
        "required": ["path"]
      }
    }
  ],
  "resources": [
    {
      "uri": "file:///*",
      "name": "Local Files",
      "description": "Access to local filesystem",
      "mimeType": "text/plain"
    }
  ],
  "prompts": [
    {
      "name": "analyze_code",
      "description": "Analyze code quality",
      "arguments": [
        {
          "name": "language",
          "description": "Programming language"
        }
      ]
    }
  ],
  "permissions": {
    "filesystem": {
      "read": true,
      "write": false
    },
    "network": {
      "allowed_domains": ["api.example.com"]
    }
  },
  "config": {
    "api_key": {
      "description": "API key for service",
      "sensitive": true, // Stored in OS keychain
      "required": true
    },
    "base_path": {
      "description": "Base directory path",
      "type": "string"
    }
  }
}
```

### Installation & Configuration Process

```
USER CLICKS "Install" on Extension:
    │
    ▼
[Claude Desktop downloads .mcpb file]
    │
    ▼
[Extracts manifest.json]
    │
    ▼
[Displays configuration form based on manifest.config]
    ▼
    ├─ Text inputs for non-sensitive config
    └─ "Sensitive" fields marked for encryption
    │
    ▼
[User enters required values (API keys, paths, etc)]
    │
    ▼
[Claude Desktop encrypts sensitive values]
    ├─ macOS: Keychain encryption
    └─ Windows: Credential Manager encryption
    │
    ▼
[Stores config in ~/.claude/extensions/manifest.json]
    │
    ▼
[Adds entry to claude_desktop_config.json]
{
  "mcpServers": {
    "my-extension": {
      "command": "node",
      "args": ["${extension_path}/server/index.js"],
      "env": {
        "API_KEY": "${user_config.api_key}",
        "BASE_PATH": "${user_config.base_path}"
      }
    }
  }
}
    │
    ▼
[Restarts Claude Desktop to activate]
    │
    ▼
[MCP client spawns server process]
    │
    ▼
[Initializes bidirectional communication]
    │
    ▼
[Makes tools available in toolbar (hammer icon)]
```

## 3.3 Configuration Management

### Configuration File Locations

```
macOS:
~/.config/Claude/claude_desktop_config.json
~/Library/Application Support/Claude/claude_desktop_config.json

Windows:
%APPDATA%\Claude\claude_desktop_config.json

Linux:
~/.config/Claude/claude_desktop_config.json
```

### Configuration File Structure

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your_token_here"
      }
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your_key_here"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost/dbname"
      }
    }
  }
}
```

### How Claude Desktop Uses Configuration

```
On Application Startup:
├─ Read claude_desktop_config.json
├─ For each mcpServer entry:
│  ├─ Parse command and args
│  ├─ Resolve environment variables
│  ├─ Decrypt sensitive values from OS keychain
│  ├─ Spawn server process
│  ├─ Initialize stdio/HTTP connection
│  ├─ Run server initialization handshake
│  ├─ Request available tools from server
│  └─ Cache tools list in memory
│
└─ UI updates to show available tools (hammer icon)

When User Selects Tool:
├─ Show permission prompt
├─ User approves/denies
├─ Tool execution sent to server
└─ Results integrated into conversation
```

## 3.4 MCP Server Implementation Example (Filesystem Server)

```javascript
// server/index.js - Simple filesystem MCP server
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const fs = require('fs').promises;
const path = require('path');

const server = new Server({
  name: 'filesystem',
  version: '1.0.0',
});

// Define tools
server.setRequestHandler(ToolListRequest, async () => {
  return {
    tools: [
      {
        name: 'read_file',
        description: 'Read contents of a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to file to read',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write contents to a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to file',
            },
            content: {
              type: 'string',
              description: 'Content to write',
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
              description: 'Directory path',
            },
            recursive: {
              type: 'boolean',
              description: 'List recursively',
            },
          },
          required: ['path'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(ToolCallRequest, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'read_file': {
        const content = await fs.readFile(args.path, 'utf-8');
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
        await fs.writeFile(args.path, args.content, 'utf-8');
        return {
          content: [
            {
              type: 'text',
              text: `File written successfully: ${args.path}`,
            },
          ],
        };
      }

      case 'list_files': {
        const files = await fs.readdir(args.path);
        return {
          content: [
            {
              type: 'text',
              text: files.join('\n'),
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

// Start server
const transport = new StdioServerTransport();
server.connect(transport);
```

---

# 4. PROJECTS SYSTEM

## 4.1 What Projects Are

Projects are persistent workspaces that group related chats and knowledge together.

### Project Structure

```
Project
├─ Metadata
│  ├─ ID (UUID)
│  ├─ Name
│  ├─ Description
│  ├─ Created Date
│  ├─ Modified Date
│  ├─ Owner (user ID)
│  ├─ Visibility (private/org-wide)
│  └─ Members (Team/Enterprise only)
│
├─ Chats
│  ├─ Chat 1
│  ├─ Chat 2
│  └─ Chat N
│
├─ Knowledge Base
│  ├─ Document 1 (PDF)
│  ├─ Document 2 (DOCX)
│  ├─ Code files
│  ├─ Images
│  └─ Text files
│
├─ Custom Instructions
│  ├─ System behavior rules
│  ├─ Output format preferences
│  ├─ Domain-specific guidelines
│  └─ Example patterns
│
├─ Memory (Pro/Max/Team/Enterprise)
│  └─ Project-specific memory summaries
│
└─ Settings
   ├─ Default model
   ├─ Temperature
   ├─ Context window settings
   └─ Tool permissions
```

### Project Database Schema

```sql
-- Projects table
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT,
    description TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    visibility TEXT, -- 'private' or 'organization'
    org_id TEXT,
    is_deleted BOOLEAN,
    is_archived BOOLEAN
);

-- Project members (Team/Enterprise)
CREATE TABLE project_members (
    project_id TEXT,
    user_id TEXT,
    role TEXT, -- 'owner', 'editor', 'viewer'
    added_at TIMESTAMP,
    PRIMARY KEY (project_id, user_id)
);

-- Project chats
CREATE TABLE project_chats (
    project_id TEXT,
    chat_id TEXT,
    added_at TIMESTAMP,
    PRIMARY KEY (project_id, chat_id)
);

-- Project knowledge base
CREATE TABLE project_documents (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size INT,
    upload_date TIMESTAMP,
    processed BOOLEAN,
    embedding_id TEXT, -- for RAG
    file_path TEXT
);

-- Project custom instructions
CREATE TABLE project_instructions (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    instruction_text TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Project memory summaries
CREATE TABLE project_memory (
    project_id TEXT PRIMARY KEY,
    memory_summary TEXT,
    last_updated TIMESTAMP,
    token_count INT
);
```

## 4.2 Knowledge Base & RAG (Retrieval-Augmented Generation)

### How Knowledge Base Works

```
UPLOAD DOCUMENT to Project:
    │
    ▼
[File stored in filesystem]
    ├─ Path: ~/.claude/projects/{project_id}/documents/
    └─ Entry created in project_documents table
    │
    ▼
[Document Processing]
    ├─ Extract text (OCR for images/PDFs)
    ├─ Split into chunks (500-2000 tokens)
    ├─ Generate vector embeddings
    │  └─ Using Anthropic's embedding model
    │
    └─ Store in vector database:
       ├─ Chunk 1: "API authentication uses..." → [0.2, 0.5, ...]
       ├─ Chunk 2: "Database schema for users..." → [0.3, 0.6, ...]
       └─ Chunk N: ...
    │
    ▼
[Index Creation]
    ├─ Full-text search index built
    ├─ Keyword extraction
    ├─ Named entity recognition
    └─ Stored in SQLite FTS table

WHEN USER ASKS QUESTION IN PROJECT:
    │
    ▼
[Automatic RAG Process Triggered]
    │
    ├─ If knowledge base is large enough
    │  └─ Or manually triggered by user
    │
    ▼
[Query Processing]
    ├─ Convert question to vector embedding
    ├─ Search vector database (cosine similarity)
    ├─ Find top-K most relevant chunks (K=5-10)
    ├─ Full-text search as backup
    └─ Rank results by relevance + recency
    │
    ▼
[Context Assembly]
    ├─ System prompt
    ├─ Project custom instructions
    ├─ Retrieved document chunks
    ├─ Conversation history
    ├─ Available MCP tools
    └─ Fit within context limit
    │
    ▼
[Send to Claude API with RAG Context]
    │
    ▼
[Claude Processes and Responds]
    │
    └─ Response cites source documents
```

### RAG Activation Conditions

```
RAG is automatically enabled when:
├─ Project knowledge base > 50,000 tokens
├─ Multiple documents uploaded
├─ Questions are knowledge-heavy
└─ User has Pro/Max/Team/Enterprise plan

RAG can be manually toggled in:
├─ Project settings
└─ Chat-specific options
```

## 4.3 Custom Instructions in Projects

### How Custom Instructions Work

```
CUSTOM INSTRUCTIONS INPUT:
├─ Writing style guidelines
├─ Technical standards
├─ Output format requirements
├─ Domain-specific rules
├─ Process guidelines
└─ Examples
    │
    ▼
[System Prompt Construction]

    System Prompt = Base System Prompt + Custom Instructions

    Example Assembly:
    ┌─────────────────────────────────────────┐
    │ You are Claude, an AI assistant...       │
    │ [Base system prompt from Anthropic]      │
    │                                          │
    │ FOR THIS PROJECT:                        │
    │ • Always use British spelling            │
    │ • Prefer active voice                    │
    │ • Format code blocks with syntax color  │
    │ • Cite sources with URLs                │
    │ • Explain technical terms               │
    └─────────────────────────────────────────┘
    │
    ▼
[Applied to Every Chat in Project]
    ├─ Prepended to every message
    ├─ Influences all responses
    ├─ Token cost: ~100-500 tokens
    └─ Can be overridden per-chat
```

## 4.4 Memory Summaries in Projects

### Project Memory System

```
MEMORY GENERATION PROCESS:
    │
    ▼
[End of Each Chat or Periodic]
    ├─ Collect chat messages
    ├─ Extract key facts
    ├─ Generate summary
    └─ Store in project_memory table
    │
    ▼
[Cross-Chat Memory Building]
    ├─ Project memory accumulates insights
    ├─ Separate from user's global memory
    ├─ Scoped to project only
    └─ ~2000 tokens maximum
    │
    ▼
[Usage in New Chats]
    ├─ Project memory auto-loaded
    ├─ Prepended to system prompt
    ├─ Updates continuously
    └─ User can view/edit in settings
    │
    ▼
[Cross-Device Sync]
    ├─ Project memory synced to cloud
    ├─ Available on all devices
    ├─ Merged if edits happen on multiple devices
    └─ Cloud version is authoritative
```

---

# 5. MEMORY SYSTEM

## 5.1 Understanding Claude's Memory

### Memory Types

```
1. CHAT HISTORY (Always Available)
   ├─ All messages in current conversation
   ├─ Stored locally in SQLite
   ├─ Available without asking
   └─ Limited by context window

2. PROJECT MEMORY (Pro/Max/Team/Enterprise)
   ├─ Persistent summaries of project chats
   ├─ Shared across chats in same project
   ├─ Stored as text file or in database
   └─ ~2000 tokens per project

3. GLOBAL MEMORY (Coming 2025)
   ├─ User preferences stored
   ├─ Recurring themes remembered
   ├─ Cross-project patterns
   ├─ Local SQLite storage
   └─ Optional, user-managed

4. INCOGNITO MODE (All Plans)
   ├─ Conversations not saved
   ├─ Don't contribute to memory
   ├─ Sensitive/temporary discussions
   └─ No cross-device sync
```

## 5.2 Memory Storage Architecture

### Memory Database (SQLite)

```sql
-- Memory entries table
CREATE TABLE memory_entries (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    content TEXT,
    category TEXT, -- 'preference', 'fact', 'instruction', 'context'
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    usage_count INT,
    last_used TIMESTAMP,
    salience_score FLOAT, -- 0.0-1.0
    embedding_vector BLOB, -- Vector embedding for semantic search
    is_ephemeral BOOLEAN,
    privacy_level TEXT -- 'private', 'shared', 'public'
);

-- Memory relationships (knowledge graph)
CREATE TABLE memory_relationships (
    source_id TEXT,
    target_id TEXT,
    relationship_type TEXT, -- 'related_to', 'opposite_of', 'part_of'
    weight FLOAT, -- Relationship strength
    PRIMARY KEY (source_id, target_id)
);

-- Memory access log
CREATE TABLE memory_access_log (
    id TEXT PRIMARY KEY,
    memory_id TEXT,
    accessed_at TIMESTAMP,
    confidence_score FLOAT, -- How well the memory matched the query
    context TEXT
);
```

### Memory Encoding Process

```
USER: "Remember: I prefer markdown output for code examples"
    │
    ▼
[Memory Parser]
    ├─ Extract fact: "prefers markdown for code"
    ├─ Determine category: "preference"
    ├─ Assess importance: "medium"
    └─ Set privacy: "private"
    │
    ▼
[Embedding Generation]
    ├─ Convert to embedding vector
    ├─ Enable semantic search later
    └─ Store in database
    │
    ▼
[Deduplication Check]
    ├─ Search existing memories
    ├─ Find similar entries
    ├─ If found, merge rather than duplicate
    └─ Update existing memory if more specific
    │
    ▼
[Storage]
    ├─ Insert into memory_entries
    ├─ Add relationships to other memories
    ├─ Update salience_score
    └─ Queue for cloud sync
    │
    ▼
RESPONSE: "I'll remember that you prefer markdown formatting for code examples."
```

### Memory Retrieval Process

```
USER: "How should I format this code example?"
    │
    ▼
[Memory Recall Trigger]
    ├─ Claude analyzes current question
    ├─ Identifies memory-relevant context
    └─ Queries memory database
    │
    ▼
[Query Execution]
    ├─ Full-text search for "code", "format"
    ├─ Semantic search using embeddings
    ├─ Relationship traversal
    └─ Ranking by salience + recency
    │
    ▼
[Memory Retrieved]
    ├─ Exact match: "prefers markdown for code"
    ├─ Related memories: "uses React", "Python projects"
    └─ Confidence scores: [0.95, 0.7, 0.6]
    │
    ▼
[Context Assembly]
    ├─ Include high-confidence memories
    ├─ Add to system prompt context
    ├─ Claude uses in response
    └─ Implicit (not mentioning "you told me...")
    │
    ▼
RESPONSE: "I'll format the code in markdown, as you prefer:"
```

## 5.3 Memory Management Commands

### Available Memory Commands

```
Explicit Commands:
├─ "Remember: [fact]"       → Create/update memory
├─ "Recall: [query]"         → Retrieve specific memory
├─ "Forget: [memory]"        → Delete memory
└─ "@memories"               → Show all memories

Implicit Usage:
├─ Claude automatically applies memories when relevant
├─ No explicit recall needed
├─ Conservative application (avoids false positives)
└─ User can request "explain why you mentioned X"

Memory Management UI:
├─ Settings → Memory
├─ View all stored memories
├─ Edit individual memories
├─ Delete unwanted memories
├─ Adjust privacy levels
└─ Export/backup memories
```

---

# 6. ARTIFACTS SYSTEM

## 6.1 Artifact Creation & Management

### What Triggers Artifact Creation

```
Claude creates artifacts when:
├─ User requests code/web component creation
├─ Generated content > 150 lines of code
├─ Creating standalone documents
├─ Building interactive visualizations
├─ Generating HTML/React/SVG
├─ Creating markdown documents
├─ Generating spreadsheets (2025)
├─ Creating presentations (2025)
└─ Generating PDFs (2025)
```

### Artifact Data Structure

```sql
CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    project_id TEXT,
    user_id TEXT,
    title TEXT,
    description TEXT,
    artifact_type TEXT, -- 'code', 'document', 'react', 'html', 'svg', 'markdown', etc.
    content TEXT,
    language TEXT, -- 'javascript', 'python', 'jsx', etc.
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    version INT,
    versions_history JSON, -- Previous versions stored
    is_published BOOLEAN,
    publish_link TEXT,
    view_count INT,
    edit_permissions TEXT -- 'view_only' or 'edit'
);

CREATE TABLE artifact_edits (
    id TEXT PRIMARY KEY,
    artifact_id TEXT,
    previous_version INT,
    new_version INT,
    edit_diff TEXT, -- JSON diff
    made_by TEXT, -- 'claude' or 'user'
    timestamp TIMESTAMP
);
```

### Artifact Lifecycle

```
1. CREATION
   ├─ Claude generates code/content
   ├─ Content reaches threshold (150+ lines)
   ├─ Artifact pane auto-opens
   ├─ Real-time preview rendered
   └─ User can immediately see result

2. EDITING
   ├─ User sees artifact in dedicated pane
   ├─ Live preview updates as typing
   ├─ Claude can suggest edits
   ├─ User approves/denies changes
   ├─ Version history maintained
   └─ Diff shown between versions

3. ENHANCEMENT
   ├─ User: "Add dark mode toggle"
   ├─ Claude: Modifies code
   ├─ Changes highlighted in diff
   ├─ Previous version saved
   └─ Version counter increments

4. EXPORT
   ├─ Download as file
   ├─ Copy to clipboard
   ├─ View source code
   └─ Save project

5. PUBLISHING
   ├─ Click "Share"
   ├─ Generate public URL
   ├─ Toggle between public/private
   ├─ Share with collaborators
   └─ View count tracked

6. VIEWING (Public)
   ├─ Browser loads artifact
   ├─ No Claude login required
   ├─ Live interactive display
   ├─ Read-only or editable
   └─ Links don't expire (unless revoked)
```

### Artifact Rendering Pipeline

```
ARTIFACT CONTENT (e.g., React Code)
    │
    ▼
[Artifact Storage]
    └─ Stored in artifacts table
    │
    ▼
[Preview Mode (Desktop App)]
    │
    ├─ [Syntax Highlighting]
    │  └─ Highlight.js for code
    │
    ├─ [Bundling & Compilation]
    │  ├─ Webpack/Parcel for bundling
    │  ├─ Babel for JSX transpilation
    │  └─ CSS/HTML processing
    │
    ├─ [Sandbox Execution]
    │  └─ iframe with CSP (Content Security Policy)
    │
    └─ [Error Handling]
       ├─ Runtime error display
       ├─ Console log capture
       └─ Debugging information
    │
    ▼
[Display in Artifact Pane]
    ├─ Left side: Live preview
    └─ Right side: Code editor

PUBLIC SHARING Mode
    │
    ▼
[Generate Shareable Link]
    ├─ Store at artifacts.claude.ai/{id}
    ├─ No authentication required
    └─ Unique slug generated
    │
    ▼
[Public Artifact Page]
    ├─ Load artifact metadata
    ├─ Render component
    ├─ Track views
    └─ Show fork/remix option
```

## 6.2 Supported Artifact Types

```
1. CODE ARTIFACTS
   ├─ HTML/CSS/JavaScript
   ├─ React Components (.jsx)
   ├─ Python Scripts
   ├─ JavaScript Files
   ├─ SVG Graphics
   └─ Mermaid Diagrams

2. DOCUMENT ARTIFACTS
   ├─ Markdown Documents
   ├─ Rich Text
   ├─ HTML Documents
   └─ Text Files

3. DATA/VISUALIZATION (2025)
   ├─ CSV/Excel Spreadsheets
   ├─ Charts (Charts.js, Recharts)
   ├─ Dashboards
   └─ Data Visualizations

4. PRESENTATION ARTIFACTS (2025)
   ├─ Slide Decks (.pptx)
   ├─ PDF Documents
   └─ Interactive Presentations

5. STRUCTURED DATA
   ├─ JSON Data
   ├─ XML Documents
   └─ Configuration Files
```

---

# 7. FILE MANAGEMENT & OPERATIONS

## 7.1 File Creation & Editing (2025 Feature)

### Supported File Types for Creation

```
DOCUMENT FILES:
├─ .docx (Microsoft Word) - using python-docx
├─ .xlsx (Microsoft Excel) - using openpyxl
├─ .pptx (PowerPoint) - using python-pptx
└─ .pdf (PDF) - using reportlab

DOCUMENT WORKFLOW:
    │
    ├─ User: "Create a quarterly report document"
    │
    ▼
[Claude Generates Code]
    ├─ Python code using appropriate library
    ├─ Defines structure and formatting
    ├─ Calls system functions in sandbox
    └─ Generates document file
    │
    ▼
[Execution in Sandbox]
    ├─ Code runs in isolated environment
    ├─ No access to system files (by default)
    ├─ Generates output file
    ├─ Returns file to Claude
    └─ Claude stores in temp location
    │
    ▼
[File Available for Download]
    ├─ Display download link
    ├─ Preview if possible
    ├─ Size information shown
    └─ User downloads to local system
```

### In-App File Editing

```
USER: "Edit this document to add a new section"
    │
    ▼
[Load Existing File]
    ├─ Parse document structure
    ├─ Extract current content
    ├─ Read formatting
    └─ Convert to editable format
    │
    ▼
[Generate Modification Code]
    ├─ Claude writes code to edit
    ├─ Loads original file
    ├─ Makes modifications
    ├─ Preserves formatting
    └─ Saves new version
    │
    ▼
[Preview & Download]
    ├─ Generate preview if possible
    ├─ Show changes/diff
    ├─ Allow download of edited file
    └─ Store version history
```

### File System Operations via MCP

```
MCP Filesystem Server allows:
├─ Read files and directories
├─ Create new files
├─ Edit existing files
├─ Delete files
├─ Search within files
├─ Get file metadata
├─ Monitor file changes
└─ Set file permissions (with approval)

WORKFLOW:
User: "Find all Python files in my project with TODO comments"
    │
    ▼
Claude uses filesystem MCP tool:
    ├─ list_files("/project/src", recursive=true, filter="*.py")
    ├─ Returns all Python files
    ├─ For each file: read_file(path)
    ├─ Search for "TODO" in content
    └─ Compile results
    │
    ▼
Response with findings
```

---

# 8. SETTINGS & CONFIGURATION

## 8.1 Settings Hierarchy

```
CLAUDE DESKTOP SETTINGS
│
├─ GENERAL SETTINGS (All Users)
│  ├─ Theme (Light/Dark/System)
│  ├─ Default Model Selection
│  ├─ Font Size
│  ├─ Quick Entry Hotkey (macOS)
│  ├─ Voice Input Enable (macOS)
│  ├─ Screenshot Feature (macOS)
│  ├─ Auto-update Settings
│  ├─ Notification Preferences
│  └─ Language
│
├─ PRIVACY & DATA (All Users)
│  ├─ Data Retention Policy
│  │  ├─ Keep all conversations
│  │  ├─ Auto-delete after X days
│  │  └─ Incognito mode option
│  ├─ Model Training Data
│  │  ├─ Allow usage (Consumer only)
│  │  ├─ Opt-out
│  │  └─ Enterprise (default no usage)
│  ├─ Cross-device Sync
│  │  ├─ Enable/disable
│  │  ├─ What data syncs
│  │  └─ Sync frequency
│  ├─ Local Storage
│  │  └─ Encryption at rest (OS-dependent)
│  └─ Cloud Backup Settings
│
├─ EXTENSIONS & MCP (All Users)
│  ├─ Installed Extensions List
│  │  ├─ Enable/disable each
│  │  ├─ View permissions
│  │  ├─ Remove extension
│  │  └─ Check for updates
│  ├─ Extension Allowlist/Blocklist
│  │  ├─ Disable all public extensions
│  │  ├─ Create allowlist (Team/Enterprise)
│  │  └─ Custom extension uploads
│  ├─ Developer Mode
│  │  ├─ View MCP config file
│  │  ├─ Edit claude_desktop_config.json
│  │  ├─ Test MCP servers
│  │  ├─ View server logs
│  │  └─ Debug mode toggle
│  └─ Extension Permissions
│     ├─ Approve all from server
│     ├─ Require per-use approval
│     └─ View permission history
│
├─ MEMORY SETTINGS (Pro+)
│  ├─ Memory Enable/Disable
│  ├─ View All Memories
│  ├─ Edit Memories
│  ├─ Delete Memories
│  ├─ Privacy Level (Private/Shared)
│  ├─ Auto-save Preferences
│  ├─ Memory per Project View
│  └─ Export Memories
│
├─ PROJECTS SETTINGS (Paid Plans)
│  ├─ Project Visibility
│  ├─ Team Sharing Settings
│  ├─ Default Models per Project
│  ├─ Knowledge Base Settings
│  │  ├─ Max storage
│  │  ├─ RAG settings
│  │  └─ Document processing
│  └─ Custom Instructions Template
│
├─ KEYBOARD & SHORTCUTS
│  ├─ Quick Entry Hotkey (macOS)
│  ├─ Voice Input Hotkey (macOS)
│  ├─ Custom Keyboard Shortcuts
│  └─ Reset to Defaults
│
├─ ACCOUNT (Cloud)
│  ├─ Logged in User
│  ├─ Plan Information
│  ├─ Billing Details
│  ├─ Session Management
│  ├─ Device List
│  └─ Sign Out
│
└─ ADVANCED
   ├─ Debug Logging
   ├─ Clear Cache
   ├─ Export Settings
   ├─ Import Settings
   ├─ App Version
   ├─ Check for Updates
   └─ Reset to Defaults
```

## 8.2 Keyboard Shortcuts System

### Customizable Shortcuts

```
macOS Defaults:
├─ Option+Space → Open Quick Entry
├─ Option+Cmd+V → Paste Screenshot
├─ Cmd+, → Open Settings
├─ Cmd+N → New Chat
├─ Cmd+W → Close Chat
└─ Cmd+Q → Quit App

Windows Defaults:
├─ Ctrl+Alt+Space → Open Quick Entry
├─ Ctrl+V → Paste Screenshot
├─ Ctrl+, → Open Settings
├─ Ctrl+N → New Chat
├─ Ctrl+W → Close Chat
└─ Alt+F4 → Quit App

Custom Shortcuts:
├─ User defines in Settings
├─ Must not conflict with system shortcuts
├─ Validated before saving
├─ Stored in preferences database
└─ Applied on app restart

IMPLEMENTATION:
Shortcuts Database Table:
├─ action_id TEXT
├─ default_shortcut TEXT
├─ custom_shortcut TEXT (if overridden)
├─ platform TEXT (mac/windows/linux)
├─ is_active BOOLEAN
└─ created_at, updated_at TIMESTAMP
```

## 8.3 Settings Synchronization

```
LOCAL SETTINGS (Immediate):
├─ Theme
├─ Keyboard shortcuts
├─ UI preferences
├─ Local cache settings
└─ Extension toggles

CLOUD SYNCED SETTINGS (Next sync):
├─ Model preferences
├─ Project preferences
├─ Memory settings
├─ Custom instructions
├─ Account preferences
└─ Data retention policy

SYNC PROCESS:
Local Change Made
    ▼
Settings Updated in SQLite
    ▼
Change queued for sync
    ▼
(Background sync process every 30s or on manual sync)
    ▼
Settings sent to cloud
    ▼
Cloud applies changes
    ▼
Other devices notified via polling
    ▼
Other devices download settings
    ▼
UI updates to reflect new settings
```

---

# 9. SECURITY & PERMISSIONS

## 9.1 Permission Model

### MCP Tool Permissions

```
FIRST USE PERMISSION PROMPT:
┌──────────────────────────────────┐
│ 🔒 Tool Permission Required      │
├──────────────────────────────────┤
│                                  │
│ Claude wants to use "read_file"  │
│ from the "filesystem" server     │
│                                  │
│ This tool can:                   │
│ ✓ Read files in /home/user/      │
│ ✓ Access file metadata           │
│ ✗ Write to files                 │
│ ✗ Delete files                   │
│                                  │
│ □ Always approve from this tool  │ ← Persistent
│                                  │
│ [Allow] [Deny] [Only this chat]  │
└──────────────────────────────────┘

PERMISSION STATE STORAGE:
permissions.db
├─ tool_id (filesystem:read_file)
├─ user_approval (allow/deny/ask)
├─ approval_date TIMESTAMP
├─ auto_approve BOOLEAN
├─ created_at TIMESTAMP
└─ approval_context (which chat/project)
```

### Sensitive Configuration Encryption

```
SENSITIVE DATA IN MANIFEST:
├─ API keys
├─ Database credentials
├─ Authentication tokens
├─ Personal access tokens
└─ Any field marked "sensitive": true

ENCRYPTION PROCESS:
1. User enters API key in config form
2. Claude Desktop detects "sensitive" flag
3. Encrypts value using:
   ├─ macOS: Keychain encryption
   ├─ Windows: Credential Manager
   └─ Linux: Pass/secret-tool
4. Stores encrypted blob locally
5. Stores decryption reference in config
6. Never writes plaintext to disk

DECRYPTION AT RUNTIME:
1. Read claude_desktop_config.json
2. Find encrypted reference: ${KEYCHAIN:api_key_123}
3. Retrieve decryption key from OS
4. Decrypt value in memory
5. Pass to environment variable
6. Never log or display plaintext
```

## 9.2 Data Transmission Security

```
LOCAL TO CLOUD (Message Sending):
├─ HTTPS/TLS 1.2+
├─ Certificate pinning (optional)
├─ End-to-end encryption option (future)
└─ Message signature verification

CLOUD TO LOCAL (Sync):
├─ HTTPS/TLS 1.2+
├─ Authentication via session token
├─ Timestamp validation
└─ Integrity checks

MCP SERVER COMMUNICATION:
├─ Stdio: Direct process communication (local only)
├─ HTTP: HTTP/HTTPS to MCP servers
├─ WebSocket: WSS encrypted connection
└─ Proxy support for enterprise proxies
```

## 9.3 File Access Restrictions

```
PERMISSION SCOPES:
For MCP Filesystem Server:
├─ Allowed paths (whitelist)
│  └─ Example: ["/home/user/projects", "/home/user/documents"]
├─ Blocked paths (blacklist)
│  └─ Example: ["/etc", "/root", "System files"]
├─ Read-only paths
│  └─ Config files marked as read-only
└─ Write paths
   └─ Designated output directories

PERMISSION REQUEST EXAMPLE:
Claude: "I need to write a file to /tmp/output.txt"
    │
    ▼
Claude Desktop checks:
├─ Is /tmp in allowed paths? (YES)
├─ Is /tmp in blocked paths? (NO)
├─ Is write operation allowed? (CHECK PERMISSION)
└─ Prompt user
    │
    ▼
User sees prompt:
"Claude wants to write to /tmp/output.txt"
[Allow] [Deny] [Allow all to /tmp]
    │
    ▼
User approves
    │
    ▼
File write proceeds
```

---

# 10. FEATURE INTERCONNECTIONS

## 10.1 System Integration Map

```
CENTRAL HUB: CLAUDE DESKTOP APP
│
├─ CHAT SYSTEM (Core)
│  ├─ Connects to: Cloud API
│  ├─ Stores in: SQLite conversations
│  ├─ Uses: Model Selection
│  ├─ Accesses: MCP Tools
│  ├─ Retrieves: Project Context
│  ├─ Applies: Memory
│  ├─ Creates: Artifacts
│  └─ Syncs with: Cloud
│
├─ PROJECTS
│  ├─ Contains: Multiple chats
│  ├─ Stores: Knowledge base (documents)
│  ├─ Includes: Custom instructions
│  ├─ Maintains: Project memory
│  ├─ Shares: With team members
│  ├─ Enables: RAG searching
│  ├─ Applies: Custom system prompt
│  └─ Scopes: Tool permissions per project
│
├─ MEMORY SYSTEM
│  ├─ Reads: Conversation history
│  ├─ Stores: In SQLite + Cloud
│  ├─ Scopes to: Project or Global
│  ├─ Applied by: Chat system
│  ├─ Triggered by: Keywords (remember/recall)
│  ├─ Embedded: As vector embeddings
│  └─ Updated: Automatically or manually
│
├─ ARTIFACTS
│  ├─ Created from: Chat responses
│  ├─ Rendered in: Artifact pane
│  ├─ Shared: Via public links
│  ├─ Versioned: History maintained
│  ├─ Stored: In SQLite artifacts table
│  └─ Synced: To cloud for sharing
│
├─ MCP / EXTENSIONS
│  ├─ Called by: Chat system for tools
│  ├─ Configured in: claude_desktop_config.json
│  ├─ Spawned: On app startup
│  ├─ Communicate via: JSON-RPC 2.0
│  ├─ Permissions: Managed by app
│  ├─ Tools listed: In hammer icon
│  ├─ Secrets stored: In OS keychain
│  └─ Available for: Use in any chat/project
│
├─ FILE OPERATIONS
│  ├─ Input: Drag-drop, paste, file upload
│  ├─ Processing: Via MCP or built-in
│  ├─ Creation: Of documents (docx, xlsx, pdf, pptx)
│  ├─ Editing: In-app file modification
│  ├─ Storage: Artifacts or project knowledge base
│  └─ Export: Download to local system
│
├─ SETTINGS
│  ├─ Configures: All system behaviors
│  ├─ Stores: In settings.db
│  ├─ Syncs: To cloud (most settings)
│  ├─ Controls: Permissions, themes, shortcuts
│  ├─ Applies to: All chats/projects/tools
│  └─ Overrides: Per-project or per-chat
│
├─ SEARCH & HISTORY
│  ├─ Indexes: All messages, artifacts, files
│  ├─ Stores: Full-text search table
│  ├─ Searches: Across projects and chats
│  ├─ Retrieves: For context building
│  ├─ Uses: SQLite FTS (Full-Text Search)
│  └─ Syncs: Search history to cloud
│
└─ CLOUD SYNC
   ├─ Syncs: Chats, projects, settings, memory
   ├─ Queues: Changes for transmission
   ├─ Polls: For updates on other devices
   ├─ Merges: Conflicts using timestamps
   ├─ Authenticates: Via session token
   └─ Compresses: Data before transmission
```

## 10.2 Data Flow Example: Complex Workflow

```
SCENARIO: User in Project working with code, using MCP tools, generating artifacts

STEP 1: USER STARTS CHAT IN PROJECT
User clicks "New Chat" in Project "MyApp"
    │
    ▼
Chat created with:
├─ project_id = "project_123"
├─ title = "New Chat"
├─ model_id = "claude-sonnet"
└─ timestamp

STEP 2: USER ASKS QUESTION
"Analyze my files and create a test suite"
    │
    ▼
Message processed:
├─ Text: "Analyze my files and create a test suite"
├─ Attachments: None
├─ Timestamp: 2025-01-15T10:00:00Z
└─ Stored in: messages table

STEP 3: CONTEXT BUILDING
System assembles:
├─ Project custom instructions (from projects table)
├─ Project knowledge base (RAG retrieval from documents)
│  └─ Top 5 relevant files from knowledge base
├─ Project memory summary (from project_memory table)
├─ Chat history (from messages table)
├─ Available tools:
│  ├─ filesystem:read_file (from MCP)
│  ├─ filesystem:write_file (from MCP)
│  └─ brave-search:search (from MCP)
└─ Global memory (if any relevant)

STEP 4: REQUEST TO API
Sends to Anthropic:
{
  "model": "claude-sonnet",
  "system": "[base system prompt] + [project instructions] + [project memory]",
  "tools": [
    {"name": "read_file", "description": "...", "input_schema": {...}},
    {"name": "write_file", "description": "...", "input_schema": {...}}
  ],
  "messages": [
    {"role": "user", "content": "Analyze my files and create a test suite"},
    ... previous messages ...
  ]
}

STEP 5: CLAUDE PROCESSES
Claude decides to:
├─ Use read_file tool to examine project files
├─ Use read_file to analyze test patterns
├─ Generate test code in response
└─ Generate an artifact with test suite

STEP 6: TOOL EXECUTION
Claude: "I'll analyze your files first. Let me read the main source files."
    │
    ▼
Calls tool: read_file("/project/src/main.py")
    │
    ▼
Claude Desktop:
├─ Checks if tool requires approval (first use?)
├─ Shows user permission prompt
├─ User approves
├─ Spawns MCP server process
├─ Sends JSON-RPC request
├─ Receives file content
├─ Displays file in chat
└─ Continues conversation

STEP 7: RESPONSE WITH ARTIFACT
Claude generates response:
"Here's a comprehensive test suite for your application..."
    │
    ▼
Artifact created:
├─ Type: "code" (Python)
├─ Content: Full test suite code
├─ Version: 1
├─ conversation_id: "chat_123"
├─ project_id: "project_123"
└─ created_at: timestamp

STEP 8: STORAGE
Message and artifact stored:
├─ messages table: Claude's full response
├─ artifacts table: Test suite code
├─ tool_calls table: read_file calls made
└─ message_attachments: Reference to artifact

STEP 9: MEMORY UPDATE
Project memory updated:
├─ Extract: "User asked for test suite for MyApp"
├─ Extract: "Test suite includes unit tests and integration tests"
├─ Store: In project_memory table
├─ Timestamp: Current time
└─ For next chat: Memory will be pre-loaded

STEP 10: SYNC TO CLOUD
Background process:
├─ Queue message for sync
├─ Queue artifact for sync
├─ Queue memory update
├─ Batch with other changes
└─ Send to cloud every 30 seconds

STEP 11: CROSS-DEVICE SYNC
On user's laptop opening Claude:
├─ Connect to cloud
├─ Request updates since last sync
├─ Download new chat messages
├─ Download new artifacts
├─ Download updated memory
├─ Cache locally in SQLite
└─ Display chat history immediately

STEP 12: USER EDITS ARTIFACT
User in artifact pane: "Add error handling"
    │
    ▼
Claude modifies code:
├─ Previous version saved to artifact_edits
├─ New version: 2
├─ Diff: highlighted changes
├─ User approves edit
└─ Update stored

STEP 13: USER DOWNLOADS
User clicks "Download" on artifact
    │
    ▼
Chrome downloads test_suite.py
├─ File from artifact stored content
├─ Formatted with syntax highlighting
└─ Saved to local /Downloads/
```

---

# 11. IMPLEMENTATION GUIDE

## 11.1 Building Claude Desktop Clone: Architecture

### Technology Stack Recommendations

```
FRONTEND:
├─ Framework: Electron or Tauri (for desktop)
├─ UI Library: React with TypeScript
├─ State Management: Redux or Zustand
├─ Styling: Tailwind CSS
├─ Components: shadcn/ui or custom
├─ Real-time: WebSocket for cloud sync
└─ Code Editor: Monaco Editor

BACKEND (Your Clone):
├─ Server Framework: Node.js (Express) or Python (FastAPI)
├─ Database: SQLite (local) + PostgreSQL (cloud)
├─ Authentication: JWT + OAuth 2.0
├─ API: REST or GraphQL
├─ File Storage: Local filesystem + S3
├─ Message Queue: Redis for async tasks
└─ Caching: Redis for memory/search cache

MCP IMPLEMENTATION:
├─ Framework: @modelcontextprotocol/sdk
├─ Transport: Stdio for local, HTTP for remote
├─ Tool Definition: JSON Schema
└─ Resource Management: File-based or database

INFRASTRUCTURE:
├─ Desktop: Electron IPC for local communication
├─ Cloud: AWS/GCP/Azure for backend
├─ Database: PostgreSQL with proper indexing
├─ File Storage: S3 for large files
├─ Search: Elasticsearch or Meilisearch
└─ Vector DB: Pinecone or Weaviate for embeddings
```

### Project Structure

```
claude-desktop-clone/
├─ electron/
│  ├─ main.js (Main process)
│  ├─ preload.js (Preload script)
│  ├─ ipc-handlers/ (IPC event handlers)
│  │  ├─ chat.ts
│  │  ├─ projects.ts
│  │  ├─ files.ts
│  │  ├─ extensions.ts
│  │  ├─ memory.ts
│  │  └─ settings.ts
│  └─ db/ (Local SQLite)
│     ├─ migrations/
│     ├─ schema.sql
│     └─ index.ts
│
├─ src/ (React Frontend)
│  ├─ components/
│  │  ├─ ChatView/
│  │  ├─ ProjectManager/
│  │  ├─ SettingsPanel/
│  │  ├─ ExtensionManager/
│  │  ├─ ArtifactPane/
│  │  └─ QuickEntry/ (macOS)
│  ├─ pages/
│  │  ├─ Home
│  │  ├─ Chat
│  │  ├─ Projects
│  │  └─ Settings
│  ├─ store/ (Redux/Zustand)
│  │  ├─ chat.ts
│  │  ├─ projects.ts
│  │  ├─ ui.ts
│  │  └─ settings.ts
│  ├─ services/
│  │  ├─ api.ts (Cloud API calls)
│  │  ├─ sync.ts (Sync manager)
│  │  ├─ storage.ts (Local storage)
│  │  ├─ mcp.ts (MCP client)
│  │  └─ embeddings.ts
│  └─ hooks/
│     ├─ useChat.ts
│     ├─ useProject.ts
│     └─ useSync.ts
│
├─ server/ (Backend/Cloud API)
│  ├─ src/
│  │  ├─ routes/
│  │  │  ├─ chat.ts
│  │  │  ├─ projects.ts
│  │  │  ├─ sync.ts
│  │  │  ├─ artifacts.ts
│  │  │  └─ auth.ts
│  │  ├─ middleware/
│  │  │  ├─ auth.ts
│  │  │  ├─ validation.ts
│  │  │  └─ errorHandler.ts
│  │  ├─ models/
│  │  │  ├─ Chat.ts
│  │  │  ├─ Project.ts
│  │  │  ├─ Artifact.ts
│  │  │  ├─ Memory.ts
│  │  │  └─ User.ts
│  │  ├─ services/
│  │  │  ├─ ChatService.ts
│  │  │  ├─ SyncService.ts
│  │  │  ├─ EmbeddingService.ts
│  │  │  └─ StorageService.ts
│  │  ├─ database/
│  │  │  ├─ connection.ts
│  │  │  └─ migrations/
│  │  └─ app.ts (Main Express app)
│  └─ .env.example
│
├─ mcp-servers/ (Sample MCP implementations)
│  ├─ filesystem-server/
│  ├─ github-server/
│  └─ database-server/
│
└─ tests/
   ├─ unit/
   ├─ integration/
   └─ e2e/
```

## 11.2 Database Schema Implementation

```sql
-- Core Tables (SQLite - Local)

-- Users
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    preferences JSON
);

-- Conversations
CREATE TABLE conversations (
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
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    INDEX idx_user_id (user_id),
    INDEX idx_project_id (project_id),
    INDEX idx_created_at (created_at)
);

-- Messages
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL, -- 'user' or 'assistant'
    content TEXT NOT NULL,
    tokens_used INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    has_attachments BOOLEAN DEFAULT FALSE,
    has_tool_use BOOLEAN DEFAULT FALSE,
    search_content TEXT, -- For FTS
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    INDEX idx_conversation_id (conversation_id),
    INDEX idx_created_at (created_at)
);

-- Attachments
CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT,
    file_name TEXT NOT NULL,
    file_type TEXT,
    file_size INT,
    file_path TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    INDEX idx_message_id (message_id)
);

-- Tool Calls
CREATE TABLE tool_calls (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    tool_input JSON NOT NULL,
    tool_output JSON,
    execution_status TEXT, -- 'pending', 'executed', 'failed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    INDEX idx_message_id (message_id)
);

-- Projects
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    visibility TEXT DEFAULT 'private', -- 'private' or 'organization'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
);

-- Project Chats
CREATE TABLE project_chats (
    project_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, chat_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (chat_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Project Documents
CREATE TABLE project_documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT,
    file_size INT,
    file_path TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE,
    embedding_model TEXT,
    full_text TEXT, -- For search
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_project_id (project_id)
);

-- Memory Entries
CREATE TABLE memory_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT,
    content TEXT NOT NULL,
    category TEXT, -- 'preference', 'fact', 'instruction'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usage_count INT DEFAULT 0,
    last_used TIMESTAMP,
    salience_score REAL DEFAULT 0.5,
    privacy_level TEXT DEFAULT 'private', -- 'private', 'shared'
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_project_id (project_id)
);

-- Artifacts
CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    project_id TEXT,
    user_id TEXT NOT NULL,
    title TEXT,
    description TEXT,
    artifact_type TEXT, -- 'code', 'document', 'react', etc.
    language TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INT DEFAULT 1,
    is_published BOOLEAN DEFAULT FALSE,
    publish_link TEXT UNIQUE,
    view_count INT DEFAULT 0,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_conversation_id (conversation_id),
    INDEX idx_user_id (user_id)
);

-- Artifact Versions
CREATE TABLE artifact_versions (
    id TEXT PRIMARY KEY,
    artifact_id TEXT NOT NULL,
    version INT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edit_summary TEXT,
    FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
    UNIQUE (artifact_id, version),
    INDEX idx_artifact_id (artifact_id)
);

-- Settings
CREATE TABLE settings (
    user_id TEXT PRIMARY KEY,
    theme TEXT DEFAULT 'system', -- 'light', 'dark', 'system'
    default_model TEXT DEFAULT 'claude-sonnet',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    auto_sync BOOLEAN DEFAULT TRUE,
    data_retention_days INT DEFAULT 90,
    allow_model_training BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- MCP Extensions/Tools
CREATE TABLE mcp_extensions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    version TEXT,
    command TEXT,
    args JSON,
    env_vars JSON, -- Encrypted sensitive values reference
    is_enabled BOOLEAN DEFAULT TRUE,
    installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_id (user_id)
);

-- MCP Tools Cache
CREATE TABLE mcp_tools (
    id TEXT PRIMARY KEY,
    extension_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    description TEXT,
    input_schema JSON,
    requires_approval BOOLEAN DEFAULT FALSE,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (extension_id) REFERENCES mcp_extensions(id) ON DELETE CASCADE,
    UNIQUE (extension_id, tool_name),
    INDEX idx_extension_id (extension_id)
);

-- Search Index (FTS - Full Text Search)
CREATE VIRTUAL TABLE messages_fts USING fts5(
    message_id UNINDEXED,
    content,
    search_content
);

-- Cloud Sync Queue
CREATE TABLE sync_queue (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    operation TEXT, -- 'insert', 'update', 'delete'
    data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    synced BOOLEAN DEFAULT FALSE,
    synced_at TIMESTAMP,
    retry_count INT DEFAULT 0,
    INDEX idx_synced (synced),
    INDEX idx_created_at (created_at)
);
```

## 11.3 API Endpoints Structure

```typescript
// Backend API Routes

// CHAT ROUTES
POST   /api/chats                    // Create new chat
GET    /api/chats                    // List chats
GET    /api/chats/:id                // Get chat details
PUT    /api/chats/:id                // Update chat
DELETE /api/chats/:id                // Delete chat
GET    /api/chats/:id/messages       // Get messages in chat
POST   /api/chats/:id/messages       // Send message
DELETE /api/messages/:id             // Delete message
POST   /api/chats/:id/search         // Search within chat

// PROJECTS ROUTES
POST   /api/projects                 // Create project
GET    /api/projects                 // List projects
GET    /api/projects/:id             // Get project
PUT    /api/projects/:id             // Update project
DELETE /api/projects/:id             // Delete project
POST   /api/projects/:id/chats       // Add chat to project
POST   /api/projects/:id/documents   // Upload document
GET    /api/projects/:id/documents   // List documents
DELETE /api/projects/:id/documents/:docId // Delete document
POST   /api/projects/:id/search      // RAG search
POST   /api/projects/:id/members     // Add team member
DELETE /api/projects/:id/members/:userId // Remove member

// ARTIFACTS ROUTES
GET    /api/artifacts/:id            // Get artifact
PUT    /api/artifacts/:id            // Update artifact
POST   /api/artifacts/:id/publish    // Publish artifact
GET    /api/artifacts/:id/versions   // Version history
DELETE /api/artifacts/:id            // Delete artifact
GET    /artifacts/:slug              // Public artifact view

// MEMORY ROUTES
POST   /api/memory                   // Create memory
GET    /api/memory                   // List memories
PUT    /api/memory/:id               // Update memory
DELETE /api/memory/:id               // Delete memory
POST   /api/memory/search            // Search memories
GET    /api/memory/project/:projectId // Project memories

// SYNC ROUTES
POST   /api/sync                     // Sync changes
GET    /api/sync/updates             // Poll for updates
POST   /api/sync/conflicts           // Resolve conflicts

// AUTH ROUTES
POST   /api/auth/login               // Login
POST   /api/auth/register            // Register
POST   /api/auth/logout              // Logout
POST   /api/auth/refresh             // Refresh token
GET    /api/auth/me                  // Current user

// SETTINGS ROUTES
GET    /api/settings                 // Get user settings
PUT    /api/settings                 // Update settings
PUT    /api/settings/keyboard        // Custom shortcuts
GET    /api/devices                  // List devices
DELETE /api/devices/:id              // Remove device

// EXTENSIONS ROUTES
GET    /api/extensions               // List installed
POST   /api/extensions               // Install extension
DELETE /api/extensions/:id           // Uninstall
PUT    /api/extensions/:id           // Update settings
GET    /api/extensions/:id/tools     // Get tools
GET    /api/extensions/directory     // Public directory
POST   /api/extensions/permissions   // Manage permissions
```

---

# 12. DATA FLOW DIAGRAMS

## 12.1 Message Flow (Complete)

```
┌─────────────────────────────────────────────────────────────┐
│                    USER SENDS MESSAGE                        │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                ┌────────────────────────┐
                │  INPUT VALIDATION      │
                ├────────────────────────┤
                │ • Length check         │
                │ • File validation      │
                │ • Content scan         │
                └────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │   STORE MESSAGE LOCALLY (SQLite)       │
        ├────────────────────────────────────────┤
        │ • Create message record                │
        │ • Generate message ID                  │
        │ • Store in messages table              │
        │ • Index for FTS                        │
        │ • Queue for sync                       │
        └────────────────────────────────────────┘
                             │
                ─────────────┴─────────────
               │                           │
    ┌──────────▼──────────┐    ┌──────────▼──────────┐
    │   BUILD CONTEXT    │    │  QUEUE FOR CLOUD    │
    ├───────────────────┤    ├───────────────────┤
    │                   │    │ (Background)      │
    │ 1. Chat history   │    │ • Batch messages  │
    │ 2. Project docs   │    │ • Compress data   │
    │ 3. Memory         │    │ • Encrypt         │
    │ 4. Instructions   │    │ • Retry logic     │
    │ 5. MCP tools      │    │ • Sync every 30s  │
    └───────────────────┘    └───────────────────┘
               │
               ▼
    ┌──────────────────────────────┐
    │  CHECK MCP TOOLS NEEDED       │
    ├──────────────────────────────┤
    │ • Detect tool mentions       │
    │ • Load tool definitions      │
    │ • Check permissions          │
    │ • Add to request             │
    └──────────────────────────────┘
               │
               ▼
    ┌──────────────────────────────────────┐
    │  BUILD API REQUEST                   │
    ├──────────────────────────────────────┤
    │ {                                    │
    │   "model": "claude-sonnet",          │
    │   "system": "[system prompt]",       │
    │   "messages": [...],                 │
    │   "tools": [...],                    │
    │   "temperature": 0.7,                │
    │   "max_tokens": 2048                 │
    │ }                                    │
    └──────────────────────────────────────┘
               │
               ▼
    ┌──────────────────────────────────────┐
    │  SEND TO ANTHROPIC CLOUD API          │
    ├──────────────────────────────────────┤
    │ POST https://api.anthropic.com/...   │
    │ Headers:                             │
    │ • Authorization: Bearer token        │
    │ • Content-Type: application/json     │
    │ • x-api-version: 2024-06-01          │
    └──────────────────────────────────────┘
               │
               ▼
    ┌──────────────────────────────────────┐
    │  STREAM RESPONSE                      │
    ├──────────────────────────────────────┤
    │ Receive chunks:                      │
    │ • content_block_start                │
    │ • content_block_delta (text)         │
    │ • content_block_stop                 │
    │ • tool_use blocks                    │
    │ • stop_reason                        │
    └──────────────────────────────────────┘
               │
        ───────┴────────────────
       │                        │
    TEXT                    TOOL_USE
    │                          │
    ▼                          ▼
Display                  ┌─────────────────┐
in real-time            │ EXECUTE TOOL    │
                         ├─────────────────┤
                         │ 1. Parse args   │
                         │ 2. Get approval │
                         │ 3. Execute      │
                         │ 4. Get result   │
                         │ 5. Append to    │
                         │    conversation │
                         │ 6. Continue     │
                         │    conversation │
                         └─────────────────┘
               │
               └─────────────────────┐
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │ STORE FINAL MESSAGE  │
                          ├──────────────────────┤
                          │ • Save response      │
                          │ • Save tool calls    │
                          │ • Save tool outputs  │
                          │ • Update metadata    │
                          │ • Update memory      │
                          │ • Index for search   │
                          └──────────────────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │ RENDER IN UI         │
                          ├──────────────────────┤
                          │ • Format markdown    │
                          │ • Syntax highlight   │
                          │ • Create artifacts   │
                          │ • Show tool summary  │
                          │ • Update UI state    │
                          └──────────────────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │ SYNC TO CLOUD        │
                          ├──────────────────────┤
                          │ (Background)         │
                          │ • Upload message     │
                          │ • Upload artifacts   │
                          │ • Upload memory      │
                          │ • Mark synced        │
                          └──────────────────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │ NOTIFY OTHER DEVICES │
                          ├──────────────────────┤
                          │ • Polling updates    │
                          │ • Download on next   │
                          │   sync               │
                          └──────────────────────┘
```

---

## Conclusion

This comprehensive guide covers all major systems, their technical implementations, interconnections, and practical implementation guidance. The architecture is designed for:

- **Scalability**: Cloud backend with local caching
- **Responsiveness**: Optimistic updates with sync
- **Security**: Encryption, permissions, OS keychain
- **Extensibility**: MCP protocol for unlimited tool connections
- **User Control**: Memory management, data privacy, granular permissions

For implementation, follow the tech stack recommendations and database schema provided, ensuring proper authentication, error handling, and sync logic throughout.
