import { vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { resetCircuitBreakers } from '@agiworkforce/utils';

process.env['JWT_SECRET'] = 'test-jwt-secret-key-for-testing-only';
process.env['NEON_DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
process.env['CLERK_SECRET_KEY'] = 'test-clerk-secret-key';
process.env['ALLOWED_ORIGINS'] = 'http://localhost:3000,http://localhost:3001';
process.env['NODE_ENV'] = 'test';
process.env['MOCK_LLM_RESPONSES'] = process.env['MOCK_LLM_RESPONSES'] || '1';

vi.mock('../src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

const originalFetch = globalThis.fetch;

beforeAll(() => {
  if (process.env['MOCK_LLM_RESPONSES'] === '1') {
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      if (/ollama|openai|anthropic|llm|completions|chat/.test(url)) {
        return new Response(
          JSON.stringify({
            id: 'mock-llm-response',
            model: 'mock-model',
            choices: [{ message: { role: 'assistant', content: 'Mocked deterministic response' } }],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
  }
});

// Circuit state is process-wide by design, so one test's induced outage would
// otherwise leave the next test's dependency short-circuited.
beforeEach(() => {
  resetCircuitBreakers();
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});
