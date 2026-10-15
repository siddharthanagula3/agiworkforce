import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/tauri-mock', async (importOriginal) => {
  const actual = await importOriginal<TauriMockModule>();
  return { ...actual, invoke: vi.fn(actual.invoke) };
});

import { invoke } from '../../lib/tauri-mock';
import {
  mcpOAuthCallback,
  mcpOAuthCallbackRaw,
  mcpOAuthRefresh,
  mcpOAuthStart,
  mcpOAuthStartRaw,
  mcpOAuthStatus,
} from '../mcp';

type TauriMockModule = typeof import('../../lib/tauri-mock');

describe('MCP OAuth replies', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
  });

  it('reads the sign-in address the native command returns', async () => {
    vi.mocked(invoke).mockResolvedValue({
      authUrl: 'https://provider.example/authorize',
      state: 'state-1',
    });

    try {
      expect(await mcpOAuthStart('github')).toEqual({
        authUrl: 'https://provider.example/authorize',
        state: 'state-1',
      });
      expect((await mcpOAuthStartRaw('linear')).authUrl).toBe('https://provider.example/authorize');
    } finally {
      vi.mocked(invoke).mockReset();
    }
  });

  it('reads who is connected and when the token expires', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      connected: true,
      userInfo: {
        id: '1',
        name: 'Ada',
        email: null,
        avatarUrl: 'https://provider.example/ada.png',
      },
      expiresAt: 1_790_000_000,
    });

    expect(await mcpOAuthStatus('github')).toEqual({
      connected: true,
      userInfo: {
        id: '1',
        name: 'Ada',
        email: null,
        avatarUrl: 'https://provider.example/ada.png',
      },
      expiresAt: 1_790_000_000,
    });
  });

  it('reads the expiry from a completed or refreshed sign-in', async () => {
    const reply = { provider: 'github', connected: true, expiresAt: 1_790_000_000 };
    vi.mocked(invoke).mockResolvedValueOnce(reply);
    expect((await mcpOAuthCallback('github', 'code-1', 'state-1')).expiresAt).toBe(1_790_000_000);
    vi.mocked(invoke).mockResolvedValueOnce(reply);
    expect((await mcpOAuthCallbackRaw('linear', 'code-1', 'state-1')).expiresAt).toBe(
      1_790_000_000,
    );
    vi.mocked(invoke).mockResolvedValueOnce(reply);
    expect((await mcpOAuthRefresh('github')).expiresAt).toBe(1_790_000_000);
  });
});

describe('MCP OAuth fixtures', () => {
  it('answers in the shape the native commands use, so no field is left undefined', async () => {
    const actual =
      await vi.importActual<typeof import('../../lib/tauri-mock')>('../../lib/tauri-mock');
    vi.mocked(invoke).mockImplementation(actual.invoke);

    expect(await mcpOAuthStart('github')).toEqual({
      authUrl: 'https://example.com/oauth',
      state: 'mock-oauth-state',
    });
    expect(await mcpOAuthStatus('github')).toStrictEqual({
      connected: false,
      userInfo: null,
      expiresAt: null,
    });
    expect((await mcpOAuthCallback('github', 'code-1', 'state-1')).expiresAt).toBeNull();
    expect((await mcpOAuthRefresh('github')).expiresAt).toBeNull();
  });
});
