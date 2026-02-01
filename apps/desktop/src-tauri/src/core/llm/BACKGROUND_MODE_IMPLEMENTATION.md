# Background Mode Implementation Summary

## Overview

Implemented OpenAI-style background mode and webhooks support for LLM requests in the AGI Workforce desktop application.

## Files Created

### Core Modules

1. **`src/core/llm/background_manager.rs`** (645 lines)
   - Background request state management
   - Queue management with concurrency control
   - Status tracking (queued, in_progress, completed, failed, cancelled)
   - Progress updates with percentage and step descriptions
   - Webhook notification delivery with HMAC-SHA256 signature verification
   - Automatic cleanup of completed requests
   - Statistics tracking

2. **`src/core/llm/background_processor.rs`** (174 lines)
   - Background request execution engine
   - Periodic queue processing (every 5 seconds)
   - Automatic cleanup (hourly for 24+ hour old requests)
   - Provider integration
   - Progress tracking during execution

3. **`src/sys/commands/background_llm.rs`** (210 lines)
   - Tauri commands for background LLM operations
   - Request submission
   - Status polling
   - Cancellation
   - Statistics retrieval
   - Webhook signature verification

### Documentation

4. **`docs/BACKGROUND_MODE_GUIDE.md`** (670 lines)
   - Comprehensive usage guide
   - Architecture diagrams
   - Code examples
   - API reference
   - Best practices
   - Troubleshooting guide

## Features Implemented

### 1. Background Request Handling

- **Request Submission**: Submit LLM requests with `background: true` parameter
- **Response ID**: Returns unique `response_id` for polling
- **Queue Management**: Automatic queuing when max concurrent limit reached
- **Concurrency Control**: Configurable max concurrent requests (default: 5)

### 2. Status Tracking

States:
- `queued`: Waiting to be processed
- `in_progress`: Currently being processed
- `completed`: Successfully completed
- `failed`: Failed with error
- `cancelled`: User-cancelled

Status includes:
- Current state
- Progress percentage (0-100)
- Step description
- Tokens generated
- Queue position (if queued)
- Estimated completion time
- Error message (if failed)
- Response data (if completed)

### 3. Webhook Integration

- **Event Notifications**:
  - `background.completed`: Request completed successfully
  - `background.failed`: Request failed with error

- **Signature Verification**: HMAC-SHA256 with format `t=<timestamp>,v1=<signature>`
- **Payload Format**: JSON with event type, response_id, status, response/error, timestamp, metadata
- **Automatic Retry**: Webhook failures are logged but don't fail the request
- **Timeout**: 30-second timeout for webhook delivery

### 4. Response Retrieval

- Poll status using `response_id`
- Retrieve full response when completed
- Access error messages if failed
- View progress updates during execution

### 5. Cancellation

- Cancel queued or in-progress requests
- Automatic state update to `cancelled`
- Cannot cancel completed/failed requests

## API Commands

### Tauri Commands

1. **`bg_llm_submit(request)`**
   - Submit background LLM request
   - Returns: `BackgroundSubmitResult` with response_id, status, queue_position, estimated_completion_at

2. **`bg_llm_get_status(response_id)`**
   - Get current status of background request
   - Returns: `BackgroundRequest` with full status info

3. **`bg_llm_cancel(response_id)`**
   - Cancel a background request
   - Returns: `Result<()>`

4. **`bg_llm_get_statistics()`**
   - Get queue statistics
   - Returns: `BackgroundStatistics` (total, queued, in_progress, completed, failed, cancelled)

5. **`bg_llm_process_queue()`**
   - Manually trigger queue processing
   - Returns: `Vec<String>` of started response_ids

6. **`bg_llm_cleanup(max_age_seconds)`**
   - Clean up old completed requests
   - Returns: `usize` (number of removed requests)

7. **`bg_llm_verify_webhook(request)`**
   - Verify webhook signature
   - Returns: `bool` (signature valid)

## Integration Points

### Provider Adapter

- Added `supports_background_mode()` trait method
- OpenAI adapter returns `true` for background mode support
- Added `background: Option<bool>` field to `LLMRequest`
- Adapter includes `background: true` in API request when enabled

### Module Structure

```
core/llm/
├── background_manager.rs      (State management)
├── background_processor.rs    (Execution engine)
├── mod.rs                     (Module exports)
└── provider_adapter.rs        (Provider integration)

sys/commands/
├── background_llm.rs          (Tauri commands)
└── mod.rs                     (Command registry)
```

## Configuration

### Initialization

```rust
use crate::sys::commands::background_llm::BackgroundLLMState;

// In lib.rs or main initialization
let background_state = BackgroundLLMState::new(5); // Max 5 concurrent
app.manage(background_state);
```

### Processor Setup

```rust
use crate::core::llm::background_processor::BackgroundProcessor;

// Create processor with provider
let processor = Arc::new(BackgroundProcessor::new(
    manager.clone(),
    provider.clone(),
));

// Start background processing
processor.start().await;
```

## Testing

### Unit Tests

- Background manager request submission
- Queue overflow handling
- Cancellation logic
- Progress updates
- Completion handling
- Statistics tracking
- Webhook signature verification

### Test Coverage

- Request lifecycle (submit → queued → in_progress → completed)
- Queue management (FIFO processing)
- Concurrency limits
- Error handling
- Signature verification (valid/invalid)

## Usage Examples

### Submit and Poll

```typescript
// Submit request
const result = await invoke('bg_llm_submit', {
  request: {
    messages: [{ role: 'user', content: 'Hello' }],
    model: 'gpt-5.2',
    provider: 'openai',
  },
});

// Poll until complete
while (true) {
  const status = await invoke('bg_llm_get_status', {
    responseId: result.response_id,
  });

  if (status.status === 'completed') {
    console.log('Response:', status.response.content);
    break;
  } else if (status.status === 'failed') {
    console.error('Error:', status.error);
    break;
  }

  await new Promise(r => setTimeout(r, 2000)); // Poll every 2s
}
```

### Submit with Webhook

```typescript
const result = await invoke('bg_llm_submit', {
  request: {
    messages: [{ role: 'user', content: 'Hello' }],
    model: 'gpt-5.2',
    provider: 'openai',
    webhookUrl: 'https://api.myapp.com/webhooks/llm',
    webhookSecret: 'your-secret',
    metadata: { userId: 'user123' },
  },
});

// Webhook handler (on your server)
app.post('/webhooks/llm', async (req, res) => {
  const isValid = await invoke('bg_llm_verify_webhook', {
    request: {
      payload: JSON.stringify(req.body),
      signature: req.headers['x-webhook-signature'],
      secret: 'your-secret',
    },
  });

  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }

  // Process event
  if (req.body.event === 'background.completed') {
    console.log('Request completed:', req.body.response.content);
  }

  res.status(200).send('OK');
});
```

## Security

### Webhook Signature Verification

- Uses HMAC-SHA256 algorithm
- Includes timestamp in signed payload
- Format: `HMAC-SHA256(secret, "timestamp.payload")`
- Header format: `t=<timestamp>,v1=<hex_signature>`
- Constant-time comparison to prevent timing attacks

### Best Practices

1. Always verify webhook signatures
2. Use HTTPS for webhook URLs
3. Implement replay attack prevention (check timestamps)
4. Rotate webhook secrets periodically
5. Rate limit webhook endpoints
6. Log all webhook events for audit

## Performance

### Resource Management

- **Concurrency**: Configurable max concurrent requests
- **Queue Processing**: Every 5 seconds
- **Cleanup**: Hourly for 24+ hour old requests
- **Webhook Timeout**: 30 seconds
- **Memory**: Auto-cleanup prevents memory leaks

### Scalability

- Supports arbitrary number of queued requests
- Queue is FIFO (first in, first out)
- Progress updates don't block execution
- Webhook delivery is asynchronous

## Future Enhancements

1. **Batch Processing**: Submit multiple requests in one call
2. **Priority Queues**: High/normal/low priority requests
3. **Scheduled Execution**: Run requests at specific times
4. **Retry Policies**: Configurable retry on failure
5. **Webhook Retry**: Automatic retry with exponential backoff
6. **Persistence**: Save queue state to database
7. **Distributed Processing**: Multiple worker instances
8. **Result Caching**: Cache results for duplicate requests

## Dependencies

### New Dependencies

- `hmac` (already present in Cargo.toml)
- `sha2` (already present in Cargo.toml)
- `hex` (for signature encoding/decoding)

### Existing Dependencies Used

- `tokio` (async runtime)
- `serde`/`serde_json` (serialization)
- `reqwest` (webhook HTTP requests)
- `uuid` (response ID generation)
- `chrono` (timestamps)

## Compatibility

- **Rust Edition**: 2021
- **Tauri**: 2.9+
- **OpenAI API**: Compatible with background mode parameter
- **Other Providers**: Can be extended for Anthropic, Google, etc.

## Notes

- Background mode is currently implemented for the provider adapter layer
- The background processor is generic over any `LLMProvider` implementation
- Webhook delivery failures are logged but don't fail the request
- Completed requests are kept for 24 hours by default before cleanup
- Queue positions are recalculated after each queue processing cycle

## Task Completion

✅ **Task #4: Background mode and webhooks support** - COMPLETED

All requirements implemented:
1. ✅ Background request handling with response_id
2. ✅ Status tracking (queued, in_progress, completed, failed)
3. ✅ Webhook integration with signature verification
4. ✅ Response retrieval via polling
5. ✅ Cancellation support
6. ✅ Progress updates
7. ✅ Queue management
8. ✅ Comprehensive documentation
9. ✅ Unit tests
10. ✅ Examples and usage guide
