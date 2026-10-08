import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/types')>()),
  connectorsReleased: () => false,
}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  validateHttpsMcpUrl: vi.fn(),
}));

vi.mock('server-only', () => ({}));
type LoggerModule = typeof import('@/lib/logger');
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
type RlsDbModule = typeof import('@/lib/server/rls-db');
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: async () => ({
    db: { query: mocks.query, execute: mocks.execute },
    userId: 'user-1',
  }),
}));
type UrlValidationModule = typeof import('@/lib/mcp-url-validation');
vi.mock('@/lib/mcp-url-validation', async (importOriginal) => ({
  ...(await importOriginal<UrlValidationModule>()),
  validateHttpsMcpUrl: mocks.validateHttpsMcpUrl,
}));

import type { NextRequest } from 'next/server';

import { registerPluginConnectors } from '../plugin-connectors';

const REQUEST = {} as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registerPluginConnectors while connectors are coming soon', () => {
  it('adds none of a plugin’s servers and says why for each one', async () => {
    const registration = await registerPluginConnectors(REQUEST, [
      {
        pluginKey: 'docs-helper',
        pluginName: 'Docs helper',
        servers: [
          { name: 'Drive', transport: 'http', url: 'https://mcp.example.com/drive' },
          { name: 'Local', transport: 'stdio' },
        ],
      },
    ]);

    expect(registration).toEqual({
      added: [],
      failed: [{ name: 'Docs helper: Drive', reason: 'Connectors are coming soon.' }],
    });
    expect(mocks.validateHttpsMcpUrl).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
