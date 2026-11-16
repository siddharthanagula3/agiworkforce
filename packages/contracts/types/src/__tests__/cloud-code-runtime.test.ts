import { describe, expect, it } from 'vitest';
import { describeCloudCodeRuntime, type CloudCodeRuntime } from '../cloud-code';

function runtime(overrides: Partial<CloudCodeRuntime>): CloudCodeRuntime {
  return {
    id: 'runtime-1',
    name: 'Droid',
    kind: 'harness',
    summary: 'A software engineering agent.',
    agentCommand: 'droid',
    cpuCount: 0,
    memoryMB: 0,
    diskSizeMB: 0,
    isPublic: false,
    needsUserCredential: false,
    ...overrides,
  };
}

describe('describeCloudCodeRuntime', () => {
  it('joins a summary that ends in a full stop without leaving the stop before the comma', () => {
    expect(describeCloudCodeRuntime(runtime({ needsUserCredential: true }))).toBe(
      'Droid, A software engineering agent, needs your own API key',
    );
  });

  it('keeps the size after the summary', () => {
    expect(describeCloudCodeRuntime(runtime({ cpuCount: 2, memoryMB: 4096 }))).toBe(
      'Droid, A software engineering agent · 2 vCPU, 4 GB RAM',
    );
  });

  it('names the runtime alone when it has no summary or size', () => {
    expect(describeCloudCodeRuntime(runtime({ summary: '' }))).toBe('Droid');
  });

  it('drops a closing ideographic full stop too', () => {
    expect(describeCloudCodeRuntime(runtime({ summary: 'コーディングエージェント。' }))).toBe(
      'Droid, コーディングエージェント',
    );
  });
});
