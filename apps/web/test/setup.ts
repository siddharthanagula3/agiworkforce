import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment variables
process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://test.supabase.co';
process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'test-anon-key';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-role-key';
process.env['STRIPE_SECRET_KEY'] = 'sk_test_key';
process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_test_secret';

// Mock Next.js headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => ({ value: 'test-cookie' })),
    getAll: vi.fn(() => []),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

// Mock server-only module
vi.mock('server-only', () => ({}));

// Mock @webcontainer/api — not installed; tests that use CodeExecutionService
// rely on the service's internal graceful fallback
vi.mock('@webcontainer/api', () => ({
  WebContainer: {
    boot: vi.fn().mockRejectedValue(new Error('WebContainer not available in test environment')),
  },
}));

// Mock CSRF validation in API routes - skip CSRF token validation in tests
// (Individual CSRF tests will test the real implementation)
vi.mock('@/lib/csrf', async () => {
  const actual = await vi.importActual<typeof import('@/lib/csrf')>('@/lib/csrf');
  return {
    ...actual,
    requireCsrfToken: vi.fn().mockResolvedValue(null),
  };
});
