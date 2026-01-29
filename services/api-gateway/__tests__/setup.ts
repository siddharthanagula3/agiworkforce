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

beforeAll(() => {
  // Global test setup
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
});
