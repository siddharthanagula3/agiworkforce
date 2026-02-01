# LLM Streaming API Documentation

This document describes the advanced streaming support in AGI Workforce's LLM integration layer.

## Overview

The streaming system provides real-time token-by-token responses from LLM providers with:

1. **Semantic Event Types** - Structured event classification
2. **Delta Aggregation** - Automatic accumulation of partial responses
3. **Real-time Metrics** - Performance tracking during streaming
4. **Error Recovery** - Graceful handling of connection issues

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    LLM Provider (OpenAI, etc.)               │
└───────────────────────┬─────────────────────────────────────┘
                        │ SSE Stream
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    SseStreamParser                           │
│  - Buffers incoming bytes                                    │
│  - Parses SSE events                                         │
│  - Tracks metrics (tokens/sec, TTFT)                         │
│  - Monitors health                                           │
└───────────────────────┬─────────────────────────────────────┘
                        │ StreamChunk
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   DeltaAggregator                            │
│  - Accumulates text deltas                                   │
│  - Builds complete tool calls from fragments                 │
│  - Validates JSON completeness                               │
│  - Tracks completion state                                   │
└───────────────────────┬─────────────────────────────────────┘
                        │ Complete Message
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 Application Layer                            │
└─────────────────────────────────────────────────────────────┘
```

## Semantic Event Types

The streaming system supports the following semantic event types:

### TextDelta

Incremental text content from the LLM's response.

```rust
StreamChunk {
    content: "Hello",
    event_type: Some(SemanticEventType::TextDelta),
    // ...
}
```

### FunctionCallDelta

Incremental function/tool call data. Multiple deltas accumulate to form complete tool calls.

```rust
StreamChunk {
    tool_calls: Some(vec![
        StreamingToolCall {
            index: 0,
            id: "call_abc123",
            name: "search_web",
            arguments: "{\"query\":",  // Partial JSON
        }
    ]),
    event_type: Some(SemanticEventType::FunctionCallDelta),
    // ...
}
```

### ReasoningDelta

Hidden reasoning/thinking tokens from models like o3, DeepSeek-R1, GPT-5.

```rust
StreamChunk {
    reasoning_content: Some("Let me analyze this step by step..."),
    event_type: Some(SemanticEventType::ReasoningDelta),
    // ...
}
```

### ImageDelta

Incremental image generation data (DALL-E streaming, future).

```rust
StreamChunk {
    image_delta: Some("base64_chunk_here"),
    event_type: Some(SemanticEventType::ImageDelta),
    // ...
}
```

### StreamMetadata

Model information and stream configuration.

```rust
StreamChunk {
    model: Some("gpt-5.2"),
    event_type: Some(SemanticEventType::StreamMetadata),
    // ...
}
```

### StreamDone

Stream completion signal.

```rust
StreamChunk {
    done: true,
    finish_reason: Some("stop"),
    event_type: Some(SemanticEventType::StreamDone),
    // ...
}
```

### StreamError

Error during streaming.

```rust
StreamChunk {
    event_type: Some(SemanticEventType::StreamError),
    // Error details in the error field
}
```

## Delta Aggregation

The `DeltaAggregator` accumulates streaming chunks into complete messages.

### Basic Usage

```rust
use crate::core::llm::sse_parser::DeltaAggregator;

let mut aggregator = DeltaAggregator::new();

// Process each streaming chunk
for chunk in stream {
    aggregator.process_chunk(&chunk)?;

    // Access accumulated content
    println!("So far: {}", aggregator.content);

    // Check if complete
    if aggregator.is_complete {
        break;
    }
}

// Get final content
let final_text = aggregator.content;
let tool_calls = aggregator.get_tool_calls();
```

### Tool Call Accumulation

Tool calls arrive in fragments across multiple chunks:

```
Chunk 1: { index: 0, id: "call_abc", name: "", arguments: "" }
Chunk 2: { index: 0, id: "", name: "search_web", arguments: "" }
Chunk 3: { index: 0, id: "", name: "", arguments: "{\"query\":" }
Chunk 4: { index: 0, id: "", name: "", arguments: "\"rust\"}" }
```

The aggregator combines these into a complete tool call:

```rust
ToolCall {
    id: "call_abc",
    name: "search_web",
    arguments: "{\"query\":\"rust\"}"
}
```

### JSON Validation

The aggregator attempts to parse accumulated JSON arguments after each delta to determine completeness:

```rust
// Check if all tool calls have complete JSON
if aggregator.are_tool_calls_complete() {
    // Safe to execute tool calls
    execute_tools(aggregator.get_tool_calls());
}
```

## Real-time Metrics

Streaming metrics are automatically tracked and injected into each chunk.

### Available Metrics

```rust
pub struct StreamMetrics {
    /// Tokens generated so far (incremental count)
    pub tokens_generated: u32,

    /// Time elapsed since stream start (milliseconds)
    pub elapsed_ms: u64,

    /// Time to first token (milliseconds, only on first content chunk)
    pub time_to_first_token_ms: Option<u64>,

    /// Average tokens per second
    pub tokens_per_second: f64,

    /// Progress percentage (0-100), if known
    pub progress_percent: Option<f32>,
}
```

### Example

```rust
while let Some(chunk) = stream.next().await {
    let chunk = chunk?;

    if let Some(metrics) = chunk.metrics {
        println!("Tokens/sec: {:.2}", metrics.tokens_per_second);
        println!("Elapsed: {}ms", metrics.elapsed_ms);

        if let Some(ttft) = metrics.time_to_first_token_ms {
            println!("First token at: {}ms", ttft);
        }
    }
}
```

## Error Recovery

The streaming system includes robust error recovery capabilities.

### Stream Health Monitoring

```rust
pub struct StreamHealth {
    /// Total bytes received
    pub bytes_received: usize,

    /// Number of chunks processed
    pub chunks_processed: usize,

    /// Number of errors encountered
    pub errors_encountered: usize,

    /// Number of reconnection attempts
    pub reconnection_attempts: u32,

    /// Whether stream is currently healthy
    pub is_healthy: bool,

    /// Last error message (if any)
    pub last_error: Option<String>,
}
```

### Recovery Configuration

```rust
pub struct StreamRecoveryConfig {
    /// Maximum number of reconnection attempts
    pub max_reconnect_attempts: u32,  // Default: 3

    /// Delay between reconnection attempts (milliseconds)
    pub reconnect_delay_ms: u64,      // Default: 1000

    /// Whether to enable automatic recovery
    pub enable_recovery: bool,         // Default: true

    /// Last successfully processed event ID (for resumption)
    pub last_event_id: Option<String>,
}
```

### Resumption Support

Some providers support resuming streams from the last event:

```rust
// Track event IDs
let mut last_event_id = None;

while let Some(chunk) = stream.next().await {
    // Event IDs are automatically tracked internally
}

// On connection drop, resume from last event
let config = StreamRecoveryConfig {
    last_event_id,
    ..Default::default()
};
```

## Provider-Specific Features

### OpenAI

- Supports semantic event types (`event: text.delta`, etc.)
- Reasoning tokens in GPT-5 and o3 models
- Automatic prompt caching (1024+ token prefixes)

```rust
// OpenAI streaming with reasoning
let chunk = StreamChunk {
    content: "The answer is 42",
    reasoning_content: Some("Let me calculate... 6 * 7 = 42"),
    event_type: Some(SemanticEventType::ReasoningDelta),
    // ...
};
```

### Anthropic

- Event-based streaming (`event: content_block_delta`)
- Tool use streaming with `input_json_delta`
- Prompt caching with cache control

```rust
// Anthropic tool call streaming
StreamChunk {
    tool_calls: Some(vec![
        StreamingToolCall {
            index: 0,
            id: "toolu_abc",
            name: "search",
            arguments: "{\"q\"",  // Partial JSON
        }
    ]),
    // ...
}
```

### DeepSeek, Moonshot, Zhipu

- Reasoning content in `reasoning_content` field
- OpenAI-compatible streaming format
- Extended thinking tokens

```rust
// DeepSeek-R1 reasoning stream
StreamChunk {
    content: "42",
    reasoning_content: Some("I need to multiply 6 by 7..."),
    event_type: Some(SemanticEventType::ReasoningDelta),
    usage: Some(TokenUsage {
        reasoning_tokens: Some(150),
        // ...
    }),
    // ...
}
```

### Google Gemini

- Function call streaming
- Cached content token tracking
- Multi-turn context

## Performance Considerations

### Buffer Management

- Maximum buffer size: 1MB (configurable via `MAX_BUFFER_SIZE`)
- Automatic buffer overflow protection
- Efficient UTF-8 boundary handling

### Token Estimation

Tokens are estimated during streaming for real-time metrics:

```rust
// Rough estimate: 1 token per 4 characters
tokens_generated += (chunk.content.len() / 4).max(1) as u32;
```

For accurate counts, use the `usage` field in the final chunk.

### Memory Usage

- DeltaAggregator uses HashMap for tool call storage (O(n) where n = number of tool calls)
- String accumulation is efficient with Rust's `String::push_str`
- No unnecessary allocations during streaming

## Error Handling

### Critical Errors

These errors stop the stream immediately:

- API errors (401, 403, 429, 500-504)
- Authentication failures
- Rate limiting
- Invalid requests
- Connection failures

### Non-Critical Errors

These errors are logged but don't stop the stream:

- Partial data chunks
- Empty data fields
- Comment lines
- Malformed events (parsed as empty chunks)

### Example Error Handling

```rust
use futures_util::StreamExt;

let mut stream = parse_sse_stream(response, Provider::OpenAI);

while let Some(result) = stream.next().await {
    match result {
        Ok(chunk) => {
            // Process chunk
            println!("{}", chunk.content);
        }
        Err(e) => {
            // Critical error occurred
            eprintln!("Stream error: {}", e);

            // Check if retryable
            if is_retryable_error(&e) {
                // Implement retry logic
            } else {
                break;
            }
        }
    }
}
```

## Testing

### Unit Tests

```rust
#[test]
fn test_delta_aggregator() {
    let mut aggregator = DeltaAggregator::new();

    let chunks = vec![
        StreamChunk { content: "Hello".into(), /* ... */ },
        StreamChunk { content: " world".into(), /* ... */ },
    ];

    for chunk in chunks {
        aggregator.process_chunk(&chunk).unwrap();
    }

    assert_eq!(aggregator.content, "Hello world");
}
```

### Integration Tests

```rust
#[tokio::test]
async fn test_streaming_end_to_end() {
    let response = mock_sse_response();
    let stream = parse_sse_stream(response, Provider::OpenAI);

    let mut aggregator = DeltaAggregator::new();

    futures_util::pin_mut!(stream);
    while let Some(Ok(chunk)) = stream.next().await {
        aggregator.process_chunk(&chunk).unwrap();
    }

    assert!(aggregator.is_complete);
    assert!(!aggregator.content.is_empty());
}
```

## Best Practices

### 1. Always Use DeltaAggregator

Don't manually accumulate chunks:

```rust
// ❌ Don't do this
let mut full_content = String::new();
while let Some(Ok(chunk)) = stream.next().await {
    full_content.push_str(&chunk.content);
}

// ✅ Do this instead
let mut aggregator = DeltaAggregator::new();
while let Some(Ok(chunk)) = stream.next().await {
    aggregator.process_chunk(&chunk)?;
}
```

### 2. Handle Partial Tool Calls

Wait for complete JSON before executing:

```rust
if aggregator.are_tool_calls_complete() {
    let tools = aggregator.get_tool_calls();
    execute_tools(tools).await?;
}
```

### 3. Monitor Stream Health

Track errors for debugging:

```rust
if let Some(metrics) = chunk.metrics {
    if metrics.tokens_per_second < 1.0 {
        tracing::warn!("Slow stream: {:.2} tokens/sec", metrics.tokens_per_second);
    }
}
```

### 4. Separate Reasoning from Content

Don't mix reasoning with user-facing content:

```rust
// User-facing content
display_to_user(&aggregator.content);

// Internal reasoning (for debugging/transparency)
if !aggregator.reasoning_content.is_empty() {
    log_reasoning(&aggregator.reasoning_content);
}
```

## Future Enhancements

Planned improvements to the streaming system:

1. **Multimodal Streaming** - Video and audio deltas
2. **Adaptive Buffering** - Dynamic buffer sizing based on network conditions
3. **Compression** - Optional gzip streaming for bandwidth savings
4. **Progress Estimation** - ML-based progress percentage prediction
5. **Connection Pooling** - Reuse connections for sequential requests
6. **WebSocket Fallback** - Alternative transport for firewall-restricted environments

## References

- [OpenAI Streaming API](https://platform.openai.com/docs/api-reference/streaming)
- [Anthropic Messages Streaming](https://docs.anthropic.com/claude/reference/messages-streaming)
- [Server-Sent Events (SSE) Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [Rust Futures and Streams](https://rust-lang.github.io/async-book/02_execution/04_executor.html)
