# LLM API Enhancement Plan - Cursor-Agent Style Implementation

## Overview

This document outlines the comprehensive plan to enhance the LLM integration to match and exceed cursor-agent capabilities, targeting 100M ARR in 5 months.

**Last Updated:** November 2025

## Current State Analysis

### ✅ What We Have (IMPLEMENTED)

- ✅ **Real SSE Streaming** - All LLM providers support true streaming via `sse_parser.rs`
- ✅ **Function Calling / Tool Calling** - Full support via `ToolDefinition`, `ToolCall`, `ToolChoice` in router
- ✅ **Tool Executor** - Complete tool execution framework in `router/tool_executor.rs` and `agi/executor.rs`
- ✅ **Multi-LLM Routing** - OpenAI, Anthropic, Google, Ollama with intelligent provider selection
- ✅ **Cost Tracking** - Complete analytics with token counting per provider
- ✅ **Caching System** - Response caching with TTL and invalidation
- ✅ **Tool Registry** - 15+ tools registered in AGI system
- ✅ **Chat Interface** - React-based chat with streaming support
- ✅ **Context Compaction** - Automatic conversation summarization (Cursor/Claude Code style)

### 🚧 What's In Progress

- 🚧 **Vision/Image Support** - Partially implemented, needs testing across all providers
- 🚧 **Multi-modal Messages** - Text + images supported in data structures, needs full integration

### ❌ What's Missing (Critical for Cursor Parity)

- ❌ **Code Completion** - Inline code suggestions like Cursor
- ❌ **Advanced Context Management** - Semantic search, knowledge graph, sliding window
- ❌ **Workspace Indexing** - Full codebase indexing for context-aware completions
- ❌ **Diff-based Edits** - Smart code edits with minimal changes
- ❌ **Multi-file Context** - Automatically include related files in context

## Implementation Plan

### ✅ Phase 1: Real Streaming Support (COMPLETED)

**Status:** ✅ COMPLETE - November 2025

**Goal**: Implement true SSE streaming from all LLM providers

**What Was Delivered:**

- ✅ Added `send_message_streaming` method to `LLMProvider` trait with `Stream` support
- ✅ Created `sse_parser.rs` module (`apps/desktop/src-tauri/src/router/sse_parser.rs`)
- ✅ Implemented SSE parsing for all 4 providers (OpenAI, Anthropic, Google, Ollama)
- ✅ Updated all provider implementations with streaming support
- ✅ Chat commands emit real-time chunks via Tauri events
- ✅ Graceful error handling with fallback to non-streaming
- ✅ Incremental token tracking during streams

**Files:**
- `apps/desktop/src-tauri/src/router/sse_parser.rs` - SSE stream parser
- `apps/desktop/src-tauri/src/router/providers/openai.rs` - OpenAI streaming
- `apps/desktop/src-tauri/src/router/providers/anthropic.rs` - Anthropic streaming
- `apps/desktop/src-tauri/src/router/providers/google.rs` - Google streaming
- `apps/desktop/src-tauri/src/router/providers/ollama.rs` - Ollama streaming

---

### ✅ Phase 2: Function Calling / Tool Calling (COMPLETED)

**Status:** ✅ COMPLETE - November 2025

**Goal**: Enable LLMs to call tools/functions during chat

**What Was Delivered:**

- ✅ Extended LLM types with `ToolDefinition`, `ToolCall`, `ToolChoice` structures
- ✅ Implemented tool schemas matching OpenAI/Anthropic/Google formats
- ✅ Full tool execution system in `router/tool_executor.rs` (969 lines)
- ✅ Mapped 15+ AGI tools to function definitions
- ✅ Multi-turn function calling with result feedback to LLM
- ✅ Provider-specific tool format conversion
- ✅ Tool execution framework with error handling and retry logic

**Files:**
- `apps/desktop/src-tauri/src/router/tool_executor.rs` - Main tool executor
- `apps/desktop/src-tauri/src/agi/executor.rs` - AGI tool executor (915 lines)
- `apps/desktop/src-tauri/src/agi/tools.rs` - Tool registry and definitions
- `apps/desktop/src-tauri/src/router/providers/*.rs` - Provider-specific tool support

**Supported Tools:**
- File operations (read, write)
- UI automation (screenshot, click, type)
- Browser automation (navigate, click, extract)
- Code execution (terminal, execution)
- Database queries (SQL, NoSQL)
- API calls (HTTP requests)
- Document processing (read, search)
- Image OCR

### Phase 3: Vision Support (Priority: HIGH)

**Goal**: Support image inputs for all providers

#### 3.1 Extend ChatMessage

- Add `images: Vec<ImageContent>` field
- Support base64 encoded images
- Support image URLs

#### 3.2 Update Provider Implementations

- **OpenAI**: Use `content` array with `type: "image_url"`
- **Anthropic**: Use `content` array with `type: "image"`
- **Google**: Use `parts` array with `inline_data` or `file_data`
- **Ollama**: Use `images` array (if supported)

#### 3.3 Image Processing

- Resize images to provider limits
- Convert formats (PNG, JPEG, WebP)
- Compress images for efficiency
- Support screenshots and file uploads

### Phase 4: Code Completion (Priority: MEDIUM)

**Goal**: Inline code suggestions like Cursor

#### 4.1 Code Context Extraction

- Parse current file AST
- Extract surrounding context
- Identify cursor position
- Build context window

#### 4.2 Completion API

- Create `code_complete` command
- Use specialized code models (GPT-4, Claude Sonnet)
- Return multiple completion candidates
- Rank by relevance

#### 4.3 UI Integration

- Show completions inline
- Keyboard shortcuts (Tab to accept)
- Preview completions
- Filter by language

### Phase 5: Context Window Management (Priority: MEDIUM)

**Goal**: Efficiently manage long conversations

#### 5.1 Token Counting

- Accurate token counting per provider
- Track cumulative tokens per conversation
- Warn when approaching limits

#### 5.2 Context Compression

- Summarize old messages
- Keep recent messages verbatim
- Extract key information
- Use sliding window approach

#### 5.3 Memory System

- Store conversation summaries
- Retrieve relevant past conversations
- Build knowledge graph
- Semantic search

## Technical Implementation Details

### Streaming Architecture

```rust
pub trait LLMProvider: Send + Sync {
    async fn send_message_streaming(
        &self,
        request: &LLMRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send>>, Box<dyn Error + Send + Sync>>;
}

pub struct StreamChunk {
    pub content: String,
    pub done: bool,
    pub finish_reason: Option<String>,
}
```

### Function Calling Flow

1. User sends message
2. LLM decides to call function
3. Function executor runs tool
4. Result fed back to LLM
5. LLM generates final response

### Vision Message Format

```rust
pub enum MessageContent {
    Text(String),
    Image {
        data: String, // base64
        mime_type: String,
    },
}

pub struct ChatMessage {
    pub role: String,
    pub content: Vec<MessageContent>,
}
```

## Performance Optimizations

1. **Connection Pooling**: Reuse HTTP connections
2. **Streaming Buffers**: Buffer chunks for smooth UI
3. **Parallel Tool Execution**: Execute multiple tools concurrently
4. **Caching**: Cache function results
5. **Lazy Loading**: Load images on-demand

## Testing Strategy

1. **Unit Tests**: Test SSE parsing, function calling
2. **Integration Tests**: Test full streaming flow
3. **E2E Tests**: Test chat with streaming and functions
4. **Performance Tests**: Measure latency, throughput
5. **Error Handling**: Test failure scenarios

## Success Metrics

- ✅ Streaming latency < 200ms first token
- ✅ Function calling success rate > 95%
- ✅ Vision support for all major providers
- ✅ Code completion accuracy > 80%
- ✅ Context window management for 100K+ tokens

## Timeline

- **Week 1**: Real streaming (OpenAI, Anthropic)
- **Week 2**: Function calling (OpenAI, Anthropic)
- **Week 3**: Vision support (all providers)
- **Week 4**: Code completion
- **Week 5**: Context management + optimizations

## Risk Mitigation

1. **Provider API Changes**: Version pinning, feature flags
2. **Rate Limits**: Exponential backoff, request queuing
3. **Cost Overruns**: Budget alerts, automatic fallback to cheaper models
4. **Streaming Failures**: Fallback to non-streaming mode
5. **Function Errors**: Graceful error handling, user notifications
