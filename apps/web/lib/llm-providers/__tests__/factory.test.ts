import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { LLMProviderFactory } from '../factory';

const ORIGINAL_ENV = { ...process.env };

describe('LLMProviderFactory provider base URLs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('allows Qwen to use MuleRouter as its configured base URL', () => {
    process.env['QWEN_API_KEY'] = 'qwen-test-key';
    process.env['QWEN_BASE_URL'] = 'https://api.mulerouter.ai';

    const provider = LLMProviderFactory.createProvider('qwen');

    expect(provider).not.toBeNull();
    expect((provider as any).baseUrl).toBe('https://api.mulerouter.ai');
  });

  it('ignores non-allowlisted Qwen base URLs', () => {
    process.env['QWEN_API_KEY'] = 'qwen-test-key';
    process.env['QWEN_BASE_URL'] = 'https://not-agi.example.com';

    const provider = LLMProviderFactory.createProvider('qwen');

    expect(provider).not.toBeNull();
    expect((provider as any).baseUrl).toBe('https://dashscope.aliyuncs.com/api/v1');
  });
});
