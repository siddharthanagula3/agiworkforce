# LLM API Enhancement Plan - Cursor-Agent Style Implementation

## Overview

This document outlines the comprehensive plan to enhance the LLM integration to match and exceed cursor-agent capabilities, targeting 100M ARR in 5 months.

## Current State Analysis

### What We Have

- ✅ Basic LLM routing (OpenAI, Anthropic, Google, Ollama)
- ✅ Cost tracking and analytics
- ✅ Caching system
- ✅ Fake streaming (chunks already-received responses)
- ✅ Tool registry for AGI system
- ✅ Basic chat interface

### What's Missing (Critical for Cursor Parity)

- ❌ Real streaming from LLM providers (SSE/Server-Sent Events)
- ❌ Function calling / Tool calling support
- ❌ Vision/image support for all providers
- ❌ Code completion and inline suggestions
- ❌ Context window management
- ❌ Multi-modal message support (text + images)
- ❌ Tool use in chat (not just AGI)

## Implementation Plan

### Phase 1: Real Streaming Support (Priority: CRITICAL)

**Goal**: Implement true SSE streaming from all LLM providers

#### 1.1 Update LLMProvider Trait

- Add `send_message_streaming` method that returns a stream
- Use `futures::Stream` or `tokio_stream::Stream` for async chunks
- Support cancellation via `AbortHandle`

#### 1.2 Implement SSE Parsing

- Create `sse_parser.rs` module for parsing Server-Sent Events
- Handle OpenAI format: `data: {...}\n\n`
- Handle Anthropic format: `event: message_start\ndata: {...}\n\n`
- Handle Google format: `data: {...}\n\n`
- Handle Ollama format: `{"model":"...","created_at":...,"message":{...},"done":false}`

#### 1.3 Update Provider Implementations

- **OpenAI**: Parse SSE chunks, extract `delta.content`
- **Anthropic**: Parse SSE chunks, handle `message_start`, `content_block_delta`, `message_delta`
- **Google**: Parse SSE chunks, extract `candidates[0].content.parts[0].text`
- **Ollama**: Parse JSON chunks, extract `message.content`

#### 1.4 Update Chat Command

- Modify `chat_send_message` to support streaming
- Emit real-time chunks via Tauri events
- Handle errors gracefully (fallback to non-streaming)
- Track tokens incrementally

### Phase 2: Function Calling / Tool Calling (Priority: CRITICAL)

**Goal**: Enable LLMs to call tools/functions during chat

#### 2.1 Extend LLMRequest

- Add `functions: Vec<Function>` field
- Add `function_call: Option<FunctionCall>` field
- Support `function_call: "auto"` mode

#### 2.2 Define Function Schema

```rust
pub struct Function {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value, // JSON Schema
}
```

#### 2.3 Update Provider Implementations

- **OpenAI**: Add `functions` and `function_call` to request
- **Anthropic**: Use `tools` array (different format)
- **Google**: Use `tools` array with `function_declarations`
- **Ollama**: Use `tools` array (if supported)

#### 2.4 Tool Execution System

- Create `ToolExecutor` that executes function calls
- Map function names to AGI tools
- Handle function call results and feed back to LLM
- Support multi-turn function calling

#### 2.5 Update Chat Interface

- Show function calls in UI
- Display function results
- Allow user to approve/reject function calls

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
