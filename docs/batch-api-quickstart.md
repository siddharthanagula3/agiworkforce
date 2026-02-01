# Google Batch API - Quick Start

## 5-Minute Quick Start

### 1. Basic Batch Job

```typescript
import { createBatchJob, waitForCompletion } from '@/api/googleBatch';

const job = await createBatchJob({
  requests: [
    { contents: [{ role: 'user', parts: [{ text: 'Explain AI' }] }] },
    { contents: [{ role: 'user', parts: [{ text: 'What is ML?' }] }] },
  ],
  model: 'gemini-2.5-flash',
  displayName: 'My First Batch',
});

const result = await waitForCompletion({ jobName: job.name });
console.log(result.results);
```

### 2. Embeddings Batch

```typescript
import { createEmbeddingsBatch, waitForCompletion } from '@/api/googleBatch';

const job = await createEmbeddingsBatch({
  texts: ['Document 1', 'Document 2', 'Document 3'],
  model: 'gemini-embedding-001',
  taskType: 'RETRIEVAL_DOCUMENT',
});

const result = await waitForCompletion({ jobName: job.name });
console.log(result.results[0].embedding); // [0.123, -0.456, ...]
```

### 3. Image Generation

```typescript
import { createImageBatch, waitForCompletion } from '@/api/googleBatch';

const job = await createImageBatch({
  prompts: ['A sunset', 'A city', 'A forest'],
  model: 'imagen-4',
});

const result = await waitForCompletion({ jobName: job.name });
// Images in result.results as base64
```

## Cost Savings

```typescript
import { calculateBatchCost } from '@/api/googleBatch';

const cost = await calculateBatchCost(
  'gemini-2.5-pro',
  1_000_000, // input tokens
  500_000, // output tokens
);
console.log(`Cost: $${cost.toFixed(2)}`); // 50% off standard pricing
```

## Key Commands

| Command                | Purpose              |
| ---------------------- | -------------------- |
| `createBatchJob()`     | Create new batch     |
| `getBatchJob()`        | Check status         |
| `waitForCompletion()`  | Wait for results     |
| `cancelBatchJob()`     | Cancel running batch |
| `deleteBatchJob()`     | Delete batch         |
| `calculateBatchCost()` | Estimate cost        |

## When to Use Batch API

✅ **Use Batch API when**:

- Processing > 100 requests
- Not time-sensitive (can wait hours)
- Want 50% cost savings
- Large-scale operations

❌ **Use Standard API when**:

- Need immediate results
- Interactive applications
- < 10 requests
- Real-time streaming

## Pricing

| Model            | Batch Input | Batch Output |
| ---------------- | ----------- | ------------ |
| gemini-3-pro     | $0.75/1M    | $3.00/1M     |
| gemini-3-flash   | $0.0375/1M  | $0.15/1M     |
| gemini-2.5-pro   | $0.625/1M   | $2.50/1M     |
| gemini-2.5-flash | $0.0375/1M  | $0.15/1M     |

**50% cheaper than standard API** 💰

## Progress Tracking

```typescript
import { waitForCompletion, getBatchProgress } from '@/api/googleBatch';

const result = await waitForCompletion({
  jobName: 'batches/abc123',
  pollIntervalSecs: 30,
  onProgress: (job) => {
    console.log(`Progress: ${getBatchProgress(job)}%`);
    console.log(`${job.stats.completedRequests}/${job.stats.totalRequests}`);
  },
});
```

## Error Handling

```typescript
import { getFailedResults } from '@/api/googleBatch';

const failed = getFailedResults(job);
for (const failure of failed) {
  console.error(`Request ${failure.index}: ${failure.error.message}`);
}
```

## Large Batches (JSONL)

```typescript
import { createJsonlFile, createBatchJob } from '@/api/googleBatch';

// Create JSONL file (for > 20MB batches)
await createJsonlFile(hugeArray, '/tmp/batch.jsonl');

// Upload and process
const job = await createBatchJob({
  inputFilePath: '/tmp/batch.jsonl',
  model: 'gemini-2.5-flash',
});
```

## Full Documentation

📖 See [google-batch-api.md](./features/google-batch-api.md) for complete guide

## Examples

🚀 See [examples/google-batch-api.ts](../examples/google-batch-api.ts) for 9 complete examples
