/**
 * Google Batch API Examples
 *
 * Demonstrates various use cases for batch processing at 50% cost savings.
 */

import {
  createBatchJob,
  getBatchJob,
  waitForCompletion,
  createEmbeddingsBatch,
  createImageBatch,
  calculateBatchCost,
  getBatchProgress,
  getBatchSuccessRate,
  getSuccessfulResults,
  getFailedResults,
  estimateTimeRemaining,
  formatTimeRemaining,
  createBatchJobWithRetry,
  processBatched,
  BatchJobState,
} from '../apps/desktop/src/api/googleBatch';

// ========================================
// Example 1: Simple Batch Text Generation
// ========================================

async function example1_SimpleTextGeneration() {
  console.log('Example 1: Simple Batch Text Generation');

  // Create batch job with inline requests
  const job = await createBatchJob({
    requests: [
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Write a haiku about coding' }],
          },
        ],
        generationConfig: { temperature: 0.7 },
      },
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Explain quantum computing in simple terms' }],
          },
        ],
      },
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'List 5 benefits of meditation' }],
          },
        ],
      },
    ],
    model: 'gemini-2.5-flash',
    displayName: 'Simple Text Generation',
    outputType: 'inline',
  });

  console.log('Job created:', job.name);

  // Wait for completion
  const completed = await waitForCompletion({
    jobName: job.name,
    onProgress: (job) => {
      const progress = getBatchProgress(job);
      console.log(`Progress: ${progress}%`);
    },
  });

  // Display results
  const results = getSuccessfulResults(completed);
  results.forEach((result, index) => {
    console.log(`\nResult ${index + 1}:`);
    console.log(result.candidates[0].content.parts[0].text);
  });

  console.log(`\nTotal cost: $${completed.stats?.totalCost?.toFixed(4)}`);
}

// ========================================
// Example 2: Large-Scale Content Generation
// ========================================

async function example2_LargeScaleContentGeneration() {
  console.log('Example 2: Large-Scale Content Generation');

  // Generate 1000 product descriptions
  const products = Array.from({ length: 1000 }, (_, i) => ({
    id: i + 1,
    name: `Product ${i + 1}`,
    category: ['Electronics', 'Clothing', 'Home'][i % 3],
  }));

  const requests = products.map((product) => ({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Write a compelling 2-3 sentence product description for: ${product.name} (Category: ${product.category})`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 150,
    },
  }));

  // Estimate cost before running
  const estimatedInputTokens = requests.length * 50; // ~50 tokens per request
  const estimatedOutputTokens = requests.length * 100; // ~100 tokens per response
  const estimatedCost = await calculateBatchCost(
    'gemini-2.5-flash',
    estimatedInputTokens,
    estimatedOutputTokens,
  );

  console.log(`Estimated cost: $${estimatedCost.toFixed(2)}`);
  console.log(`Compared to standard API: $${(estimatedCost * 2).toFixed(2)}`);
  console.log(`Savings: $${estimatedCost.toFixed(2)}`);

  // Create batch job
  const job = await createBatchJob({
    requests,
    model: 'gemini-2.5-flash',
    displayName: 'Product Descriptions',
  });

  console.log('Job created:', job.name);

  // Monitor progress
  const completed = await waitForCompletion({
    jobName: job.name,
    pollIntervalSecs: 30,
    onProgress: (job) => {
      const progress = getBatchProgress(job);
      const successRate = getBatchSuccessRate(job);
      const timeRemaining = estimateTimeRemaining(job);

      console.log(`Progress: ${progress}%`);
      console.log(`Success rate: ${successRate}%`);
      console.log(`Time remaining: ${formatTimeRemaining(timeRemaining)}`);
    },
  });

  // Process results
  const successfulResults = getSuccessfulResults(completed);
  const failedResults = getFailedResults(completed);

  console.log(`\nCompleted: ${successfulResults.length}/${requests.length}`);
  console.log(`Failed: ${failedResults.length}`);
  console.log(`Actual cost: $${completed.stats?.totalCost?.toFixed(2)}`);

  // Save to database or file
  const descriptions = successfulResults.map((result, index) => ({
    productId: products[index].id,
    description: result.candidates[0].content.parts[0].text,
  }));

  console.log('Sample descriptions:', descriptions.slice(0, 3));
}

// ========================================
// Example 3: Document Embeddings for Search
// ========================================

async function example3_DocumentEmbeddings() {
  console.log('Example 3: Document Embeddings for Search');

  // Sample documents
  const documents = [
    'Machine learning is a subset of artificial intelligence',
    'Neural networks are inspired by biological neurons',
    'Deep learning uses multiple layers of neural networks',
    'Natural language processing enables computers to understand text',
    'Computer vision allows machines to interpret images',
    // ... add thousands of documents
  ];

  // Create embeddings batch
  const job = await createEmbeddingsBatch({
    texts: documents,
    model: 'gemini-embedding-001',
    taskType: 'RETRIEVAL_DOCUMENT',
    displayName: 'Document Embeddings',
  });

  console.log('Embeddings job created:', job.name);

  // Wait for completion
  const completed = await waitForCompletion({
    jobName: job.name,
    onProgress: (job) => {
      console.log(`Progress: ${getBatchProgress(job)}%`);
    },
  });

  // Get embeddings
  const embeddings = completed.results?.filter((r) => !r.error);

  console.log(`Generated ${embeddings?.length} embeddings`);
  console.log(`Vector dimension: ${embeddings?.[0]?.embedding?.length}`);

  // Store in vector database (example)
  /*
  for (const result of embeddings) {
    await vectorDB.insert({
      id: documents[result.index],
      text: documents[result.index],
      embedding: result.embedding
    });
  }
  */
}

// ========================================
// Example 4: Image Generation Batch
// ========================================

async function example4_ImageGeneration() {
  console.log('Example 4: Image Generation Batch');

  const prompts = [
    'A serene mountain landscape at sunset with vibrant colors',
    'A futuristic city skyline with flying cars',
    'A cozy coffee shop interior with warm lighting',
    'A minimalist product photograph on white background',
    'An abstract geometric pattern in blue and gold',
  ];

  // Create image batch
  const job = await createImageBatch({
    prompts,
    model: 'imagen-4',
    displayName: 'Marketing Images',
  });

  console.log('Image generation job created:', job.name);

  // Wait for completion
  const completed = await waitForCompletion({
    jobName: job.name,
    pollIntervalSecs: 60,
  });

  // Get results
  const results = getSuccessfulResults(completed);

  console.log(`Generated ${results.length} images`);

  // Save images (example)
  /*
  for (const result of results) {
    const imageData = result.candidates[0].content.parts[0].inlineData.data;
    const mimeType = result.candidates[0].content.parts[0].inlineData.mimeType;

    await saveImage(`image_${result.index}.png`, imageData, mimeType);
  }
  */
}

// ========================================
// Example 5: JSONL File Input for Large Batches
// ========================================

async function example5_JsonlFileInput() {
  console.log('Example 5: JSONL File Input for Large Batches');

  // Generate huge number of requests
  const hugeRequestArray = Array.from({ length: 10000 }, (_, i) => ({
    contents: [
      {
        role: 'user',
        parts: [{ text: `Generate a unique title for article ${i + 1}` }],
      },
    ],
  }));

  // Create JSONL file (required for > 20MB)
  const jsonlPath = '/tmp/large_batch_requests.jsonl';
  await createJsonlFile(hugeRequestArray, jsonlPath);

  console.log(`Created JSONL file: ${jsonlPath}`);

  // Create batch with file input
  const job = await createBatchJob({
    inputFilePath: jsonlPath,
    model: 'gemini-2.5-flash',
    displayName: '10K Article Titles',
    outputType: 'file',
  });

  console.log('Job created:', job.name);

  // Wait for completion
  const completed = await waitForCompletion({
    jobName: job.name,
    pollIntervalSecs: 120, // Check every 2 minutes for large batches
    maxWaitSecs: 86400, // 24 hour timeout
    onProgress: (job) => {
      const progress = getBatchProgress(job);
      const timeRemaining = estimateTimeRemaining(job);

      console.log(`Progress: ${progress}%`);
      console.log(`ETA: ${formatTimeRemaining(timeRemaining)}`);
      console.log(`Completed: ${job.stats?.completedRequests}/${job.stats?.totalRequests}`);
    },
  });

  // Download results to file
  const resultsPath = '/tmp/large_batch_results.jsonl';
  await getBatchResults({
    jobName: completed.name,
    outputPath: resultsPath,
  });

  console.log(`Results saved to: ${resultsPath}`);
  console.log(`Total cost: $${completed.stats?.totalCost?.toFixed(2)}`);
}

// ========================================
// Example 6: Batch with Error Handling and Retry
// ========================================

async function example6_ErrorHandlingAndRetry() {
  console.log('Example 6: Error Handling and Retry');

  const requests = [
    {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Valid request 1' }],
        },
      ],
    },
    {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Valid request 2' }],
        },
      ],
    },
    // ... more requests
  ];

  // Use retry wrapper
  const job = await createBatchJobWithRetry(
    {
      requests,
      model: 'gemini-2.5-pro',
      displayName: 'Retry Example',
    },
    3, // Max 3 retries
  );

  // Check for failures
  const failed = getFailedResults(job);

  if (failed.length > 0) {
    console.log(`Failed requests: ${failed.length}`);

    // Analyze error patterns
    const errorTypes = new Map<number, number>();
    for (const failure of failed) {
      const code = failure.error?.code || 0;
      errorTypes.set(code, (errorTypes.get(code) || 0) + 1);
    }

    console.log('Error distribution:', Object.fromEntries(errorTypes));

    // Retry failed requests
    const retryRequests = failed.map((f) => requests[f.index]);

    console.log(`Retrying ${retryRequests.length} failed requests...`);

    const retryJob = await createBatchJob({
      requests: retryRequests,
      model: 'gemini-2.5-pro',
      displayName: 'Retry Failed Requests',
    });

    const retryCompleted = await waitForCompletion({
      jobName: retryJob.name,
    });

    console.log(`Retry results: ${getSuccessfulResults(retryCompleted).length} succeeded`);
  }
}

// ========================================
// Example 7: Multi-language Translation
// ========================================

async function example7_MultiLanguageTranslation() {
  console.log('Example 7: Multi-language Translation');

  const texts = [
    'Welcome to our website',
    'Please enter your email address',
    'Your order has been confirmed',
    'Free shipping on orders over $50',
    'Contact us for support',
  ];

  const targetLanguages = ['es', 'fr', 'de', 'ja', 'zh'];

  // Create translation requests for all languages
  const requests = texts.flatMap((text) =>
    targetLanguages.map((lang) => ({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Translate to ${lang}: "${text}". Return only the translation, no explanations.`,
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.3 },
    })),
  );

  console.log(`Translating ${texts.length} texts to ${targetLanguages.length} languages`);
  console.log(`Total requests: ${requests.length}`);

  const job = await createBatchJob({
    requests,
    model: 'gemini-2.5-flash',
    displayName: 'Multi-language Translation',
  });

  const completed = await waitForCompletion({
    jobName: job.name,
  });

  const results = getSuccessfulResults(completed);

  // Organize results by language
  const translations: Record<string, string[]> = {};

  results.forEach((result, index) => {
    const langIndex = Math.floor(index / texts.length);
    const lang = targetLanguages[langIndex];

    if (!translations[lang]) {
      translations[lang] = [];
    }

    translations[lang].push(result.candidates[0].content.parts[0].text.trim());
  });

  console.log('Translations:');
  Object.entries(translations).forEach(([lang, trans]) => {
    console.log(`\n${lang.toUpperCase()}:`);
    trans.forEach((t, i) => {
      console.log(`  ${texts[i]} → ${t}`);
    });
  });

  console.log(`\nCost: $${completed.stats?.totalCost?.toFixed(4)}`);
}

// ========================================
// Example 8: Batched Processing Strategy
// ========================================

async function example8_BatchedProcessingStrategy() {
  console.log('Example 8: Batched Processing Strategy');

  // Process 5000 items in batches of 500
  const items = Array.from({ length: 5000 }, (_, i) => ({
    id: i + 1,
    text: `Item ${i + 1}`,
  }));

  const results = await processBatched(
    items,
    (item) => ({
      contents: [
        {
          role: 'user',
          parts: [{ text: `Summarize: ${item.text}` }],
        },
      ],
    }),
    500, // Batch size
    'gemini-2.5-flash', // Model
  );

  console.log(`Processed ${results.length} items`);
}

// ========================================
// Example 9: Cost Comparison
// ========================================

async function example9_CostComparison() {
  console.log('Example 9: Cost Comparison');

  const requestCount = 10000;
  const avgInputTokens = 100;
  const avgOutputTokens = 200;

  // Calculate batch cost (50% discount)
  const batchCost = await calculateBatchCost(
    'gemini-2.5-pro',
    requestCount * avgInputTokens,
    requestCount * avgOutputTokens,
  );

  // Calculate standard API cost
  const standardCost = batchCost * 2;

  console.log('\nCost Comparison for 10,000 requests:');
  console.log('=====================================');
  console.log(`Standard API: $${standardCost.toFixed(2)}`);
  console.log(`Batch API:    $${batchCost.toFixed(2)}`);
  console.log(`Savings:      $${(standardCost - batchCost).toFixed(2)} (50%)`);

  // With caching
  const cachedTokens = requestCount * avgInputTokens * 0.5; // 50% cache hit
  const batchCostWithCache = await calculateBatchCost(
    'gemini-2.5-pro',
    requestCount * avgInputTokens,
    requestCount * avgOutputTokens,
    cachedTokens,
  );

  console.log('\nWith 50% Cache Hit Rate:');
  console.log('========================');
  console.log(`Batch + Cache: $${batchCostWithCache.toFixed(2)}`);
  console.log(`Additional savings: $${(batchCost - batchCostWithCache).toFixed(2)}`);
}

// ========================================
// Run Examples
// ========================================

async function runExamples() {
  try {
    // Run individual examples
    // await example1_SimpleTextGeneration();
    // await example2_LargeScaleContentGeneration();
    // await example3_DocumentEmbeddings();
    // await example4_ImageGeneration();
    // await example5_JsonlFileInput();
    // await example6_ErrorHandlingAndRetry();
    // await example7_MultiLanguageTranslation();
    // await example8_BatchedProcessingStrategy();
    await example9_CostComparison();
  } catch (error) {
    console.error('Example failed:', error);
  }
}

// Export for use in other modules
export {
  example1_SimpleTextGeneration,
  example2_LargeScaleContentGeneration,
  example3_DocumentEmbeddings,
  example4_ImageGeneration,
  example5_JsonlFileInput,
  example6_ErrorHandlingAndRetry,
  example7_MultiLanguageTranslation,
  example8_BatchedProcessingStrategy,
  example9_CostComparison,
};

// Run if executed directly
if (require.main === module) {
  runExamples();
}
