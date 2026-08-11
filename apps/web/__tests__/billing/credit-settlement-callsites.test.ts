import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('durable post-provider credit settlements', () => {
  it.each([
    'app/api/media/image/generate/route.ts',
    'app/api/media/video/generate/route.ts',
    'app/api/llm/v1/chat/completions/route.ts',
    'app/api/llm/v1/chat/completions/lib/response-builder.ts',
    'app/api/llm/v1/chat/completions/lib/stream-transform.ts',
  ])('%s has no alternate legacy deduction or settlement path', (path) => {
    const contents = source(path);

    expect(contents).not.toMatch(/CreditService\.(deductCredits|settleCreditsDurably)\(/);
  });

  it('image generation uses the shared managed reservation lifecycle directly', () => {
    const contents = source('app/api/media/image/generate/route.ts');

    expect(contents).toMatch(/reserveManagedUsageRequest\(/);
    expect(contents).toMatch(/markManagedUsageProviderStarted\(/);
    expect(contents).toMatch(/finalizeManagedUsageRequest\(/);
    expect(contents).toMatch(/markManagedUsageClientDelivered\(/);
  });

  it('video generation owns provider start and final settlement transactionally', () => {
    const route = source('app/api/media/video/generate/route.ts');
    const jobs = source('lib/server/video-generation-jobs.ts');
    const reconciler = source('lib/services/video-job-reconciliation-service.ts');
    const migration = source('db/neon/0105_durable_video_generation_jobs.sql');

    expect(route).toMatch(/reserveManagedUsageRequest\(/);
    expect(route).toMatch(/beginVideoProviderSubmission\(/);
    expect(jobs).toMatch(/public\.begin_video_generation_provider_submission\(/);
    expect(jobs).toMatch(/public\.finalize_video_generation_job\(/);
    expect(reconciler).toMatch(/finalizeVideoGenerationJob\(/);
    expect(migration).toMatch(/from public\.mark_managed_usage_provider_started\(/);
    expect(migration).toMatch(/from public\.finalize_managed_usage_request\(/);
  });

  it.each([
    'app/api/mission/route.ts',
    'app/api/v1/providers/[providerId]/stream/route.ts',
    'app/api/agents/execute/route.ts',
  ])('%s performs no credit operations after retirement', (path) => {
    const contents = source(path);

    expect(contents).not.toMatch(/CreditService\.(deductCredits|settleCreditsDurably)\(/);
  });
});
