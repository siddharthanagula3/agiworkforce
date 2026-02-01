# Background Mode and Webhooks Guide

## Overview

AGI Workforce supports OpenAI-style background mode for long-running LLM requests. Background requests are processed asynchronously with status tracking, progress updates, and webhook notifications upon completion.

## Features

- **Background Request Handling**: Submit requests that process asynchronously
- **Status Tracking**: Poll request status (queued, in_progress, completed, failed)
- **Progress Updates**: Real-time progress information including percentage and step descriptions
- **Webhook Integration**: Receive notifications when requests complete or fail
- **Response Retrieval**: Retrieve final responses when completed
- **Cancellation**: Cancel in-flight requests
- **Queue Management**: Automatic queue processing with configurable concurrency

## Architecture

```
┌─────────────────────┐
│   Frontend/Client   │
│                     │
│  Submit Background  │
│      Request        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────┐
│   Background Manager            │
│                                 │
│  • Request Queue                │
│  • Status Tracking              │
│  • Progress Updates             │
│  • Webhook Notifications        │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│   Background Processor          │
│                                 │
│  • Queue Processing             │
│  • Provider Execution           │
│  • Error Handling               │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│   LLM Providers                 │
│                                 │
│  • OpenAI                       │
│  • Anthropic                    │
│  • Google                       │
│  • Others                       │
└─────────────────────────────────┘
```

## Usage

### 1. Submitting a Background Request

```typescript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke('bg_llm_submit', {
  request: {
    messages: [
      {
        role: 'user',
        content: 'Write a detailed research paper on quantum computing',
      },
    ],
    model: 'gpt-5.2',
    provider: 'openai',
    maxTokens: 10000,
    webhookUrl: 'https://your-app.com/webhooks/background-completion',
    webhookSecret: 'your-secret-key',
    metadata: {
      userId: 'user123',
      taskId: 'task456',
    },
  },
});

console.log('Response ID:', result.response_id);
console.log('Status:', result.status);
console.log('Queue Position:', result.queue_position);
console.log('Estimated Completion:', new Date(result.estimated_completion_at * 1000));
```

### 2. Polling Request Status

```typescript
const status = await invoke('bg_llm_get_status', {
  responseId: 'bg_123e4567-e89b-12d3-a456-426614174000',
});

console.log('Status:', status.status); // queued, in_progress, completed, failed
console.log('Progress:', status.progress?.percentage, '%');
console.log('Step:', status.progress?.step);

if (status.status === 'completed') {
  console.log('Response:', status.response.content);
  console.log('Tokens:', status.response.tokens);
} else if (status.status === 'failed') {
  console.log('Error:', status.error);
}
```

### 3. Webhook Notifications

When a background request completes or fails, a webhook notification is sent to the configured URL:

```json
{
  "event": "background.completed",
  "response_id": "bg_123e4567-e89b-12d3-a456-426614174000",
  "status": "completed",
  "response": {
    "content": "...",
    "tokens": 8542,
    "model": "gpt-5.2",
    "finish_reason": "stop"
  },
  "timestamp": 1738368000,
  "metadata": {
    "userId": "user123",
    "taskId": "task456"
  }
}
```

### 4. Verifying Webhook Signatures

To ensure webhook authenticity, verify the signature:

```typescript
const isValid = await invoke('bg_llm_verify_webhook', {
  request: {
    payload: JSON.stringify(webhookPayload),
    signature: headers['x-webhook-signature'],
    secret: 'your-secret-key',
  },
});

if (!isValid) {
  throw new Error('Invalid webhook signature');
}
```

The signature header format is: `t=<timestamp>,v1=<signature>`

Where `signature` is computed as:

```
HMAC-SHA256(secret, "timestamp.payload")
```

### 5. Cancelling a Request

```typescript
await invoke('bg_llm_cancel', {
  responseId: 'bg_123e4567-e89b-12d3-a456-426614174000',
});
```

### 6. Cleanup Old Requests

```typescript
// Clean up requests completed more than 24 hours ago
const removedCount = await invoke('bg_llm_cleanup', {
  maxAgeSeconds: 86400, // 24 hours
});

console.log('Removed', removedCount, 'completed requests');
```

### 7. Getting Statistics

```typescript
const stats = await invoke('bg_llm_get_statistics');

console.log('Total:', stats.total);
console.log('Queued:', stats.queued);
console.log('In Progress:', stats.in_progress);
console.log('Completed:', stats.completed);
console.log('Failed:', stats.failed);
```

## Webhook Event Types

### background.completed

Sent when a background request completes successfully.

```json
{
  "event": "background.completed",
  "response_id": "bg_...",
  "status": "completed",
  "response": {
    "content": "...",
    "tokens": 1000
  },
  "timestamp": 1738368000,
  "metadata": {}
}
```

### background.failed

Sent when a background request fails.

```json
{
  "event": "background.failed",
  "response_id": "bg_...",
  "status": "failed",
  "error": "Provider error: API rate limit exceeded",
  "timestamp": 1738368000,
  "metadata": {}
}
```

## Status Lifecycle

```
┌──────────┐
│  Queued  │ ──────────────────────────┐
└────┬─────┘                           │
     │                                 │
     │ (Queue processes)               │
     ▼                                 │
┌──────────────┐                       │
│ In Progress  │                       │
└──────┬───────┘                       │
       │                               │
       ├─────────────┐                 │
       │             │                 │
       ▼             ▼                 │
  ┌───────────┐  ┌────────┐           │
  │ Completed │  │ Failed │           │
  └───────────┘  └────────┘           │
                                      │
       └──────────────────────────────┘
              (User cancels)
                    │
                    ▼
              ┌───────────┐
              │ Cancelled │
              └───────────┘
```

## Configuration

### Maximum Concurrent Requests

Configure the maximum number of concurrent background requests:

```rust
// In lib.rs or initialization code
let background_state = BackgroundLLMState::new(5); // Max 5 concurrent
app.manage(background_state);
```

### Webhook Timeout

Webhook notifications have a 30-second timeout by default.

### Queue Processing Interval

The background processor checks for new requests every 5 seconds.

### Cleanup Interval

Completed requests are cleaned up every hour (requests older than 24 hours are removed).

## Error Handling

### Common Error Scenarios

1. **Provider Not Configured**

   ```json
   {
     "error": "OpenAI provider not configured"
   }
   ```

2. **Request Not Found**

   ```json
   {
     "error": "Background request bg_... not found"
   }
   ```

3. **Invalid Cancellation**

   ```json
   {
     "error": "Cannot cancel request in status completed"
   }
   ```

4. **Webhook Delivery Failure**
   - Logged but does not fail the request
   - Request still marked as completed/failed
   - Response retrievable via polling

## Best Practices

1. **Always Use Webhooks**: For production applications, use webhook notifications instead of continuous polling.

2. **Verify Signatures**: Always verify webhook signatures to prevent spoofing.

3. **Handle Retries**: Implement retry logic for webhook delivery on your server.

4. **Set Timeouts**: Configure appropriate timeouts for long-running requests.

5. **Clean Up Regularly**: Periodically clean up old completed requests to prevent memory bloat.

6. **Monitor Queue**: Monitor queue statistics to identify bottlenecks.

7. **Use Metadata**: Include metadata in requests to track context (user ID, session ID, etc.).

8. **Graceful Degradation**: Fall back to polling if webhooks fail.

## Example: Complete Implementation

```typescript
class BackgroundLLMClient {
  private webhookSecret: string;

  constructor(webhookSecret: string) {
    this.webhookSecret = webhookSecret;
  }

  // Submit request
  async submit(messages: Array<any>, model: string): Promise<string> {
    const result = await invoke('bg_llm_submit', {
      request: {
        messages,
        model,
        provider: 'openai',
        webhookUrl: 'https://api.myapp.com/webhooks/llm',
        webhookSecret: this.webhookSecret,
      },
    });

    return result.response_id;
  }

  // Poll until complete
  async waitForCompletion(responseId: string, pollInterval: number = 5000): Promise<any> {
    while (true) {
      const status = await invoke('bg_llm_get_status', { responseId });

      if (status.status === 'completed') {
        return status.response;
      } else if (status.status === 'failed') {
        throw new Error(status.error);
      } else if (status.status === 'cancelled') {
        throw new Error('Request was cancelled');
      }

      // Log progress
      if (status.progress) {
        console.log(`Progress: ${status.progress.percentage}% - ${status.progress.step}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  // Verify webhook
  async verifyWebhook(payload: string, signature: string): Promise<boolean> {
    return await invoke('bg_llm_verify_webhook', {
      request: {
        payload,
        signature,
        secret: this.webhookSecret,
      },
    });
  }

  // Handle webhook event
  async handleWebhookEvent(event: any) {
    switch (event.event) {
      case 'background.completed':
        console.log('Request completed:', event.response_id);
        // Process the response
        this.processResponse(event.response);
        break;

      case 'background.failed':
        console.error('Request failed:', event.response_id, event.error);
        // Handle failure
        this.handleFailure(event.response_id, event.error);
        break;
    }
  }

  private processResponse(response: any) {
    // Implement your response processing logic
  }

  private handleFailure(responseId: string, error: string) {
    // Implement your failure handling logic
  }
}

// Usage
const client = new BackgroundLLMClient('your-webhook-secret');

// Option 1: Submit and poll
const responseId = await client.submit([{ role: 'user', content: 'Hello' }], 'gpt-5.2');
const response = await client.waitForCompletion(responseId);
console.log(response.content);

// Option 2: Submit and handle via webhook
// (Webhook handler implemented on your server)
```

## Troubleshooting

### Requests Stuck in Queue

- Check max concurrent configuration
- Verify processor is running
- Check for errors in logs

### Webhooks Not Received

- Verify webhook URL is accessible
- Check firewall settings
- Verify webhook secret is correct
- Check signature verification

### High Memory Usage

- Increase cleanup frequency
- Reduce max age for completed requests
- Monitor queue statistics

## API Reference

### Commands

- `bg_llm_submit(request)` - Submit background request
- `bg_llm_get_status(responseId)` - Get request status
- `bg_llm_cancel(responseId)` - Cancel request
- `bg_llm_get_statistics()` - Get queue statistics
- `bg_llm_process_queue()` - Manually trigger queue processing
- `bg_llm_cleanup(maxAgeSeconds)` - Clean up old requests
- `bg_llm_verify_webhook(request)` - Verify webhook signature

### Types

See `background_manager.rs` for complete type definitions:

- `BackgroundStatus`
- `BackgroundRequest`
- `BackgroundSubmitResult`
- `ProgressInfo`
- `WebhookEvent`
- `BackgroundStatistics`
