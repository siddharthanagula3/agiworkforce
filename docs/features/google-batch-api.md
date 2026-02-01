# Google Batch API Integration

The Google Batch API provides asynchronous large-volume processing at **50% cost savings** compared to standard API calls, with a 24-hour SLO (typically much faster).

## Features

### Cost Savings

- **50% discount** on standard API pricing for batch jobs
- Cache hits use standard pricing (no batch discount)
- Perfect for non-urgent, high-volume tasks

### Batch Job Types

1. **Text Generation** - Large-scale content generation
2. **Embeddings** - Bulk text embeddings for vector search
3. **Image Generation** - Batch image creation (Nano Banana, Imagen 4)

### Input/Output Options

- **Inline requests**: < 20MB total (convenient for smaller batches)
- **JSONL file input**: Up to 2GB per file (for large-scale processing)
- **Inline results**: Returned directly in response
- **JSONL file output**: Downloaded via Files API

## API Reference

### Batch Job Management

#### Create Batch Job

```typescript
import { invoke } from '@tauri-apps/api/core';

const job = await invoke('google_batch_create', {
  requests: [
    {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Translate to Spanish: Hello, world!' }],
        },
      ],
      generationConfig: { temperature: 0.7 },
    },
    // ... more requests (up to 20MB inline)
  ],
  model: 'gemini-2.5-pro',
  displayName: 'Spanish Translation Batch',
  outputType: 'inline',
});

console.log('Batch job created:', job.name);
console.log('State:', job.state); // "PENDING"
```

#### Using JSONL File Input

```typescript
// Create JSONL file locally
const requests = [
  { contents: [{ role: 'user', parts: [{ text: 'Request 1' }] }] },
  { contents: [{ role: 'user', parts: [{ text: 'Request 2' }] }] },
  // ... thousands of requests
];

await invoke('google_batch_create_jsonl', {
  requests,
  outputPath: '/path/to/batch_input.jsonl',
});

// Upload and create batch job
const job = await invoke('google_batch_create', {
  inputFilePath: '/path/to/batch_input.jsonl',
  model: 'gemini-2.5-flash',
  displayName: 'Large Scale Batch',
  outputType: 'file',
});
```

#### Get Batch Status

```typescript
const status = await invoke('google_batch_get', {
  jobName: 'batches/abc123',
});

console.log('State:', status.state);
console.log('Progress:', status.stats);
// {
//   totalRequests: 1000,
//   completedRequests: 847,
//   failedRequests: 3,
//   pendingRequests: 150,
//   totalTokens: 5234891,
//   totalCost: 12.45
// }
```

#### List Batch Jobs

```typescript
const { batchJobs, nextPageToken } = await invoke('google_batch_list', {
  pageSize: 20,
  filter: 'state=RUNNING',
});

for (const job of batchJobs) {
  console.log(`${job.name}: ${job.state}`);
}
```

#### Wait for Completion

```typescript
// Poll until job completes (default: 30s intervals, 24h max)
const completedJob = await invoke('google_batch_wait', {
  jobName: 'batches/abc123',
  pollIntervalSecs: 60, // Check every 60 seconds
  maxWaitSecs: 7200, // Timeout after 2 hours
});

console.log('Job completed!');
console.log('Results:', completedJob.results);
```

#### Get Results

```typescript
// Download results to file
const job = await invoke('google_batch_get_results', {
  jobName: 'batches/abc123',
  outputPath: '/path/to/results.jsonl',
});

// Or get inline results
const job = await invoke('google_batch_get_results', {
  jobName: 'batches/abc123',
});

for (const result of job.results) {
  if (result.error) {
    console.error(`Request ${result.index} failed:`, result.error);
  } else {
    console.log(`Request ${result.index}:`, result.response);
  }
}
```

#### Cancel/Delete Jobs

```typescript
// Cancel running job
await invoke('google_batch_cancel', {
  jobName: 'batches/abc123',
});

// Delete completed job
await invoke('google_batch_delete', {
  jobName: 'batches/abc123',
});
```

### Embeddings Batch

```typescript
// Batch embeddings for vector search
const embeddingsJob = await invoke('google_batch_create_embeddings', {
  texts: [
    'The quick brown fox jumps over the lazy dog',
    'Machine learning is transforming technology',
    // ... up to thousands of texts
  ],
  model: 'gemini-embedding-001',
  taskType: 'RETRIEVAL_DOCUMENT',
  displayName: 'Document Embeddings',
});

// Wait for completion
const completed = await invoke('google_batch_wait', {
  jobName: embeddingsJob.name,
});

// Get embeddings status
const status = await invoke('google_batch_get_embeddings', {
  jobName: embeddingsJob.name,
});

for (const result of status.results) {
  console.log('Embedding:', result.embedding); // [0.123, -0.456, ...]
}
```

### Image Generation Batch

```typescript
// Batch image generation
const imageJob = await invoke('google_batch_create_images', {
  prompts: [
    'A serene mountain landscape at sunset',
    'A futuristic city with flying cars',
    'A cozy coffee shop interior',
    // ... more prompts
  ],
  model: 'imagen-4',
  displayName: 'Marketing Images',
});

// Get results
const results = await invoke('google_batch_get_results', {
  jobName: imageJob.name,
});

for (const result of results.results) {
  if (result.imageData) {
    // Base64-encoded image data
    const imgElement = document.createElement('img');
    imgElement.src = `data:${result.mimeType};base64,${result.imageData}`;
    document.body.appendChild(imgElement);
  }
}
```

### Cost Estimation

```typescript
const estimatedCost = await invoke('google_batch_calculate_cost', {
  model: 'gemini-2.5-pro',
  inputTokens: 1_000_000,
  outputTokens: 500_000,
  cachedTokens: 200_000,
});

console.log('Estimated cost: $', estimatedCost.toFixed(2));
// Batch pricing:
// - Input: $0.625 per 1M tokens (50% off $1.25)
// - Output: $2.50 per 1M tokens (50% off $5.00)
// - Cached: $1.25 per 1M tokens (standard pricing, no discount)
```

## Job States

| State       | Description                      |
| ----------- | -------------------------------- |
| `PENDING`   | Job is queued, waiting to start  |
| `RUNNING`   | Job is currently being processed |
| `SUCCEEDED` | Job completed successfully       |
| `FAILED`    | Job failed due to an error       |
| `CANCELLED` | Job was cancelled by user        |
| `EXPIRED`   | Job expired before completion    |

## Pricing

### Standard vs Batch Pricing

| Model            | Standard Input | Batch Input    | Standard Output | Batch Output |
| ---------------- | -------------- | -------------- | --------------- | ------------ |
| gemini-3-pro     | $1.50/1M       | **$0.75/1M**   | $6.00/1M        | **$3.00/1M** |
| gemini-3-flash   | $0.075/1M      | **$0.0375/1M** | $0.30/1M        | **$0.15/1M** |
| gemini-2.5-pro   | $1.25/1M       | **$0.625/1M**  | $5.00/1M        | **$2.50/1M** |
| gemini-2.5-flash | $0.075/1M      | **$0.0375/1M** | $0.30/1M        | **$0.15/1M** |

**Note**: Cached tokens use standard pricing (no 50% discount)

### SLO and Turnaround

- **Service Level Objective**: 24-hour turnaround
- **Typical Performance**: Most batches complete in minutes to hours
- **Best For**: Non-urgent, high-volume processing

## Use Cases

### 1. Content Generation at Scale

```typescript
// Generate product descriptions for 10,000 items
const products = await getProductCatalog();

const requests = products.map((product) => ({
  contents: [
    {
      role: 'user',
      parts: [
        {
          text: `Write a compelling product description for: ${product.name}`,
        },
      ],
    },
  ],
  generationConfig: { temperature: 0.8, maxOutputTokens: 200 },
}));

const job = await invoke('google_batch_create', {
  requests,
  model: 'gemini-2.5-flash',
  displayName: 'Product Descriptions',
});
```

### 2. Document Embeddings for Search

```typescript
// Create embeddings for entire documentation site
const docs = await getAllDocuments();

const embeddingsJob = await invoke('google_batch_create_embeddings', {
  texts: docs.map((doc) => doc.content),
  model: 'gemini-embedding-001',
  taskType: 'RETRIEVAL_DOCUMENT',
});

const results = await invoke('google_batch_wait', {
  jobName: embeddingsJob.name,
});

// Store embeddings in vector database
for (const result of results.results) {
  await vectorDB.insert({
    id: docs[result.index].id,
    embedding: result.embedding,
  });
}
```

### 3. Image Asset Generation

```typescript
// Generate marketing images for campaign
const imageJob = await invoke('google_batch_create_images', {
  prompts: [
    'Professional headshot of diverse team',
    'Modern office workspace',
    'Product showcase on white background',
  ],
  model: 'imagen-4',
});

const results = await invoke('google_batch_get_results', {
  jobName: imageJob.name,
  outputPath: '/marketing/batch_images.jsonl',
});
```

## Best Practices

### 1. Choose the Right Input Method

- **Inline requests** (< 20MB): Quick setup, immediate submission
- **JSONL files** (up to 2GB): Better for very large batches, can resume uploads

### 2. Monitor Progress

```typescript
async function monitorBatch(jobName: string) {
  while (true) {
    const status = await invoke('google_batch_get', { jobName });

    if (
      await invoke('google_batch_is_complete', {
        state: status.state,
      })
    ) {
      return status;
    }

    console.log(`Progress: ${status.stats.completedRequests}/${status.stats.totalRequests}`);
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
}
```

### 3. Handle Errors Gracefully

```typescript
const results = await invoke('google_batch_get_results', {
  jobName: 'batches/abc123',
});

const successful = [];
const failed = [];

for (const result of results.results) {
  if (result.error) {
    failed.push({ index: result.index, error: result.error });
  } else {
    successful.push(result.response);
  }
}

console.log(`Success: ${successful.length}, Failed: ${failed.length}`);

// Retry failed requests
if (failed.length > 0) {
  const retryRequests = failed.map((f) => originalRequests[f.index]);
  const retryJob = await invoke('google_batch_create', {
    requests: retryRequests,
    model: 'gemini-2.5-pro',
  });
}
```

### 4. Optimize Costs

```typescript
// Use Flash model for simple tasks (75% cheaper than Pro)
const flashJob = await invoke('google_batch_create', {
  requests: simpleRequests,
  model: 'gemini-2.5-flash', // Instead of gemini-2.5-pro
});

// Enable context caching for repeated context
const cachedRequests = requests.map((req) => ({
  ...req,
  cachedContent: 'shared-context-id',
}));
```

### 5. Batch Size Guidelines

| Batch Size     | Input Method    | Typical Turnaround |
| -------------- | --------------- | ------------------ |
| < 100 requests | Inline          | Minutes            |
| 100-1,000      | Inline or JSONL | 30 min - 2 hours   |
| 1,000-10,000   | JSONL           | 2-6 hours          |
| 10,000+        | JSONL           | 6-24 hours         |

## Troubleshooting

### Job Stuck in PENDING

```typescript
// Check if job expired
const status = await invoke('google_batch_get', {
  jobName: 'batches/abc123',
});

if (status.state === 'EXPIRED') {
  // Resubmit batch
  const newJob = await invoke('google_batch_create', {
    requests: originalRequests,
    model: 'gemini-2.5-pro',
  });
}
```

### High Failure Rate

```typescript
const status = await invoke('google_batch_get', {
  jobName: 'batches/abc123',
});

if (status.stats.failedRequests > status.stats.totalRequests * 0.1) {
  console.error('High failure rate detected');

  // Download results to inspect errors
  const results = await invoke('google_batch_get_results', {
    jobName: status.name,
    outputPath: '/tmp/failed_batch_results.jsonl',
  });

  // Analyze common error patterns
  const errorTypes = new Map();
  for (const result of results.results) {
    if (result.error) {
      const errorCode = result.error.code;
      errorTypes.set(errorCode, (errorTypes.get(errorCode) || 0) + 1);
    }
  }

  console.log('Error distribution:', Object.fromEntries(errorTypes));
}
```

### Request Too Large

```typescript
// Error: "Batch request too large"
// Solution: Use JSONL file upload instead

// Instead of inline:
// const job = await invoke('google_batch_create', {
//   requests: hugeArray // > 20MB
// });

// Use JSONL:
await invoke('google_batch_create_jsonl', {
  requests: hugeArray,
  outputPath: '/tmp/large_batch.jsonl',
});

const job = await invoke('google_batch_create', {
  inputFilePath: '/tmp/large_batch.jsonl',
  model: 'gemini-2.5-pro',
});
```

## Example: Complete Workflow

```typescript
async function processBatchWorkflow() {
  // 1. Prepare requests
  const requests = await prepareRequests();

  // 2. Calculate cost estimate
  const totalInputTokens = requests.reduce((sum, r) => sum + estimateTokens(r), 0);
  const cost = await invoke('google_batch_calculate_cost', {
    model: 'gemini-2.5-pro',
    inputTokens: totalInputTokens,
    outputTokens: totalInputTokens * 0.5,
    cachedTokens: 0,
  });

  console.log(`Estimated cost: $${cost.toFixed(2)}`);

  // 3. Create batch job
  const job = await invoke('google_batch_create', {
    requests,
    model: 'gemini-2.5-pro',
    displayName: 'My Batch Job',
    outputType: 'inline',
  });

  console.log('Job created:', job.name);

  // 4. Wait for completion with progress updates
  const completed = await invoke('google_batch_wait', {
    jobName: job.name,
    pollIntervalSecs: 60,
    maxWaitSecs: 7200,
  });

  // 5. Process results
  const results = await invoke('google_batch_get_results', {
    jobName: job.name,
  });

  // 6. Handle success/failure
  const successful = results.results.filter((r) => !r.error);
  const failed = results.results.filter((r) => r.error);

  console.log(`Completed: ${successful.length}/${results.results.length}`);
  console.log(`Actual cost: $${results.stats.totalCost.toFixed(2)}`);

  // 7. Cleanup
  await invoke('google_batch_delete', {
    jobName: job.name,
  });

  return successful.map((r) => r.response);
}
```

## Limits

- **Max file size**: 2GB per JSONL file
- **Max inline payload**: 20MB
- **Job retention**: 7 days after completion
- **Rate limits**: Standard Google API rate limits apply
- **Concurrent jobs**: Up to 100 active jobs per project

## Security

- API keys are stored securely in OS keyring
- Files uploaded to Google Files API are private to your project
- Results are automatically deleted after 7 days
- HTTPS encryption for all API communication

## Related Documentation

- [Google Gemini API](./gemini-api.md)
- [LLM Cost Optimization](./llm-cost-optimization.md)
- [Context Caching](./context-caching.md)
