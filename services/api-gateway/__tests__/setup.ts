/**
 * Test setup file for API Gateway
 * Sets up environment variables and mocks for testing
 */
import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// Set test environment variables
process.env['JWT_SECRET'] = 'test-jwt-secret-key-for-testing-only';
process.env['SUPABASE_URL'] = 'http://localhost:54321';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-role-key';
process.env['ALLOWED_ORIGINS'] = 'http://localhost:3000,http://localhost:3001';
process.env['NODE_ENV'] = 'test';
process.env['MOCK_LLM_RESPONSES'] = process.env['MOCK_LLM_RESPONSES'] || '1';

// Mock pino logger to reduce noise in tests
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
  // Deterministic LLM proxy stubbing for tests that call external AI endpoints.
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

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});
