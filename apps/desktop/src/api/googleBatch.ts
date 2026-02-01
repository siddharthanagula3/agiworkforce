/**
 * Google Batch API Client
 *
 * Provides TypeScript interface for asynchronous large-volume LLM processing
 * at 50% cost savings with 24-hour SLO.
 */

import { invoke } from '@tauri-apps/api/core';

// ========================================
// Types
// ========================================

export enum BatchJobState {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export interface BatchJobStats {
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  pendingRequests: number;
  totalTokens?: number;
  totalCost?: number;
}

export interface BatchJobError {
  code: number;
  message: string;
  details?: any[];
}

export interface BatchResult {
  customId?: string;
  index: number;
  response?: any;
  error?: BatchJobError;
}

export interface BatchJob {
  name: string;
  displayName?: string;
  state: BatchJobState;
  model: string;
  createTime: string;
  updateTime?: string;
  endTime?: string;
  stats?: BatchJobStats;
  error?: BatchJobError;
  results?: BatchResult[];
  outputFileUri?: string;
  metadata?: any;
}

export interface ListBatchJobsResponse {
  batchJobs: BatchJob[];
  nextPageToken?: string;
}

export interface EmbeddingResult {
  customId?: string;
  index: number;
  embedding?: number[];
  error?: BatchJobError;
}

export interface EmbeddingsBatchJob {
  name: string;
  state: BatchJobState;
  model: string;
  createTime: string;
  stats?: BatchJobStats;
  results?: EmbeddingResult[];
  outputFileUri?: string;
}

// ========================================
// Batch Job Management
// ========================================

export interface CreateBatchJobOptions {
  requests?: any[];
  inputFilePath?: string;
  model: string;
  displayName?: string;
  outputType?: 'inline' | 'file';
}

/**
 * Create a new batch job
 *
 * @param options - Batch job configuration
 * @returns BatchJob with job ID and initial state
 */
export async function createBatchJob(options: CreateBatchJobOptions): Promise<BatchJob> {
  return invoke('google_batch_create', {
    requests: options.requests,
    inputFilePath: options.inputFilePath,
    model: options.model,
    displayName: options.displayName,
    outputType: options.outputType,
  });
}

/**
 * Get batch job status
 *
 * @param jobName - Batch job name
 * @returns Updated BatchJob with current state
 */
export async function getBatchJob(jobName: string): Promise<BatchJob> {
  return invoke('google_batch_get', { jobName });
}

export interface ListBatchJobsOptions {
  pageSize?: number;
  pageToken?: string;
  filter?: string;
}

/**
 * List all batch jobs
 *
 * @param options - Listing options
 * @returns List of batch jobs and pagination token
 */
export async function listBatchJobs(
  options: ListBatchJobsOptions = {},
): Promise<ListBatchJobsResponse> {
  return invoke('google_batch_list', {
    pageSize: options.pageSize,
    pageToken: options.pageToken,
    filter: options.filter,
  });
}

/**
 * Cancel a running batch job
 *
 * @param jobName - Batch job name
 * @returns Updated BatchJob with CANCELLED state
 */
export async function cancelBatchJob(jobName: string): Promise<BatchJob> {
  return invoke('google_batch_cancel', { jobName });
}

/**
 * Delete a batch job
 *
 * @param jobName - Batch job name
 */
export async function deleteBatchJob(jobName: string): Promise<void> {
  return invoke('google_batch_delete', { jobName });
}

export interface GetBatchResultsOptions {
  jobName: string;
  outputPath?: string;
}

/**
 * Get batch results
 *
 * @param options - Result retrieval options
 * @returns BatchJob with results populated
 */
export async function getBatchResults(options: GetBatchResultsOptions): Promise<BatchJob> {
  return invoke('google_batch_get_results', {
    jobName: options.jobName,
    outputPath: options.outputPath,
  });
}

export interface WaitForCompletionOptions {
  jobName: string;
  pollIntervalSecs?: number;
  maxWaitSecs?: number;
  onProgress?: (job: BatchJob) => void;
}

/**
 * Wait for batch job completion with progress updates
 *
 * @param options - Wait configuration
 * @returns Completed BatchJob
 */
export async function waitForCompletion(options: WaitForCompletionOptions): Promise<BatchJob> {
  const { jobName, pollIntervalSecs = 30, maxWaitSecs = 86400, onProgress } = options;

  const startTime = Date.now();
  const maxDuration = maxWaitSecs * 1000;

  while (true) {
    const job = await getBatchJob(jobName);

    if (onProgress) {
      onProgress(job);
    }

    if (isJobComplete(job.state)) {
      return job;
    }

    if (Date.now() - startTime >= maxDuration) {
      throw new Error(`Batch job timed out after ${maxWaitSecs} seconds`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalSecs * 1000));
  }
}

/**
 * Check if job state is terminal
 *
 * @param state - Job state
 * @returns True if job is complete
 */
export function isJobComplete(state: BatchJobState): boolean {
  return [
    BatchJobState.SUCCEEDED,
    BatchJobState.FAILED,
    BatchJobState.CANCELLED,
    BatchJobState.EXPIRED,
  ].includes(state);
}

// ========================================
// Embeddings Batch
// ========================================

export interface CreateEmbeddingsBatchOptions {
  texts?: string[];
  inputFilePath?: string;
  model?: string;
  taskType?: string;
  displayName?: string;
}

/**
 * Create embeddings batch job
 *
 * @param options - Embeddings configuration
 * @returns EmbeddingsBatchJob with job ID
 */
export async function createEmbeddingsBatch(
  options: CreateEmbeddingsBatchOptions,
): Promise<EmbeddingsBatchJob> {
  return invoke('google_batch_create_embeddings', {
    texts: options.texts,
    inputFilePath: options.inputFilePath,
    model: options.model || 'gemini-embedding-001',
    taskType: options.taskType,
    displayName: options.displayName,
  });
}

/**
 * Get embeddings batch status
 *
 * @param jobName - Embeddings job name
 * @returns EmbeddingsBatchJob with current state
 */
export async function getEmbeddingsBatch(jobName: string): Promise<EmbeddingsBatchJob> {
  return invoke('google_batch_get_embeddings', { jobName });
}

// ========================================
// Image Generation Batch
// ========================================

export interface CreateImageBatchOptions {
  prompts: string[];
  model: string;
  displayName?: string;
}

/**
 * Create image generation batch job
 *
 * @param options - Image generation configuration
 * @returns BatchJob with job ID
 */
export async function createImageBatch(options: CreateImageBatchOptions): Promise<BatchJob> {
  return invoke('google_batch_create_images', {
    prompts: options.prompts,
    model: options.model,
    displayName: options.displayName,
  });
}

// ========================================
// Utilities
// ========================================

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  cacheCost: number;
  totalCost: number;
}

/**
 * Calculate batch cost estimate
 *
 * @param model - Model name
 * @param inputTokens - Input token count
 * @param outputTokens - Output token count
 * @param cachedTokens - Cached token count
 * @returns Estimated cost in USD
 */
export async function calculateBatchCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0,
): Promise<number> {
  return invoke('google_batch_calculate_cost', {
    model,
    inputTokens,
    outputTokens,
    cachedTokens,
  });
}

/**
 * Create JSONL file from requests
 *
 * @param requests - Request objects
 * @param outputPath - File path
 */
export async function createJsonlFile(requests: any[], outputPath: string): Promise<void> {
  return invoke('google_batch_create_jsonl', {
    requests,
    outputPath,
  });
}

// ========================================
// Helper Functions
// ========================================

/**
 * Monitor batch job with real-time updates
 *
 * @param jobName - Job name
 * @param callback - Progress callback
 * @param intervalSecs - Poll interval in seconds
 * @returns Promise that resolves when job completes
 */
export async function monitorBatchJob(
  jobName: string,
  callback: (job: BatchJob) => void,
  intervalSecs: number = 30,
): Promise<BatchJob> {
  return waitForCompletion({
    jobName,
    pollIntervalSecs: intervalSecs,
    onProgress: callback,
  });
}

/**
 * Get batch job progress percentage
 *
 * @param job - Batch job
 * @returns Progress percentage (0-100)
 */
export function getBatchProgress(job: BatchJob): number {
  if (!job.stats || job.stats.totalRequests === 0) {
    return 0;
  }

  const completed = job.stats.completedRequests + job.stats.failedRequests;
  return Math.round((completed / job.stats.totalRequests) * 100);
}

/**
 * Get batch job success rate
 *
 * @param job - Batch job
 * @returns Success rate (0-100)
 */
export function getBatchSuccessRate(job: BatchJob): number {
  if (!job.stats || job.stats.totalRequests === 0) {
    return 0;
  }

  const completed = job.stats.completedRequests + job.stats.failedRequests;
  if (completed === 0) {
    return 0;
  }

  return Math.round((job.stats.completedRequests / completed) * 100);
}

/**
 * Extract successful results from batch job
 *
 * @param job - Batch job
 * @returns Array of successful results
 */
export function getSuccessfulResults(job: BatchJob): any[] {
  if (!job.results) {
    return [];
  }

  return job.results.filter((result) => !result.error).map((result) => result.response);
}

/**
 * Extract failed results from batch job
 *
 * @param job - Batch job
 * @returns Array of failed results with errors
 */
export function getFailedResults(job: BatchJob): BatchResult[] {
  if (!job.results) {
    return [];
  }

  return job.results.filter((result) => result.error);
}

/**
 * Estimate time remaining for batch job
 *
 * @param job - Batch job
 * @returns Estimated seconds remaining, or null if unknown
 */
export function estimateTimeRemaining(job: BatchJob): number | null {
  if (!job.stats || !job.createTime) {
    return null;
  }

  const { completedRequests, totalRequests } = job.stats;

  if (completedRequests === 0) {
    return null;
  }

  const elapsedMs = Date.now() - new Date(job.createTime).getTime();
  const avgTimePerRequest = elapsedMs / completedRequests;
  const remainingRequests = totalRequests - completedRequests;

  return Math.round((remainingRequests * avgTimePerRequest) / 1000);
}

/**
 * Format time remaining as human-readable string
 *
 * @param seconds - Seconds
 * @returns Formatted string (e.g., "2h 30m")
 */
export function formatTimeRemaining(seconds: number | null): string {
  if (seconds === null || seconds < 0) {
    return 'Unknown';
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return `${hours}h ${remainingMinutes}m`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

/**
 * Create a batch job with automatic retry on failure
 *
 * @param options - Batch job options
 * @param maxRetries - Maximum retry attempts
 * @returns Completed batch job
 */
export async function createBatchJobWithRetry(
  options: CreateBatchJobOptions,
  maxRetries: number = 3,
): Promise<BatchJob> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const job = await createBatchJob(options);
      const completed = await waitForCompletion({ jobName: job.name });

      if (completed.state === BatchJobState.SUCCEEDED) {
        return completed;
      }

      // If failed, retry
      lastError = new Error(completed.error?.message || 'Batch job failed');
    } catch (error) {
      lastError = error as Error;
    }

    if (attempt < maxRetries - 1) {
      // Wait before retry (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }

  throw new Error(`Batch job failed after ${maxRetries} attempts: ${lastError?.message}`);
}

// ========================================
// Batch Processing Strategies
// ========================================

/**
 * Process large array in batches
 *
 * @param items - Items to process
 * @param processFn - Function to create request from item
 * @param batchSize - Items per batch
 * @param model - Model to use
 * @returns Array of all results
 */
export async function processBatched<T, R>(
  items: T[],
  processFn: (item: T) => any,
  batchSize: number,
  model: string,
): Promise<R[]> {
  const results: R[] = [];
  const batches = Math.ceil(items.length / batchSize);

  for (let i = 0; i < batches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, items.length);
    const batchItems = items.slice(start, end);

    const requests = batchItems.map(processFn);

    const job = await createBatchJob({
      requests,
      model,
      displayName: `Batch ${i + 1}/${batches}`,
    });

    const completed = await waitForCompletion({ jobName: job.name });
    const batchResults = getSuccessfulResults(completed);

    results.push(...batchResults);
  }

  return results;
}
