/**
 * Test setup file for Signaling Server
 * Sets up environment variables and mocks for testing
 */
import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// Set test environment variables
process.env['PORT'] = '4001'; // Different port for testing
process.env['SIGNALING_HOST'] = 'localhost';
process.env['SIGNALING_PORT'] = '4001';
process.env['SUPABASE_URL'] = 'http://localhost:54321';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-role-key';
process.env['ALLOWED_ORIGINS'] = 'http://localhost:3000,http://localhost:3001';
process.env['ADMIN_API_KEY'] = 'test-admin-api-key';
process.env['NODE_ENV'] = 'test';

// Mock logger to reduce noise in tests
vi.mock('../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
  generateCorrelationId: vi.fn(() => 'test-correlation-id'),
}));

// Mock Supabase
vi.mock('../src/db.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
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
