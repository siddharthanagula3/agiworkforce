import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/auth/callback/route';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock safe-redirect
vi.mock('@/lib/safe-redirect', () => ({
  getSafeRedirectUrl: vi.fn((next: string | null, origin: string, fallback: string) => {
    if (!next) return fallback;
    // Simulate blocking absolute URLs to different hosts
    try {
      const parsed = new URL(next, origin);
      const parsedOrigin = new URL(origin);
      if (parsed.host !== parsedOrigin.host) {
        return fallback;
      }
      return parsed.pathname + parsed.search + parsed.hash;
    } catch {
      if (next.startsWith('/')) return next;
      return fallback;
    }
  }),
}));

const mockExchangeCodeForSession = vi.fn();

// Mock Supabase server client
vi.mock('@/services/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        exchangeCodeForSession: mockExchangeCodeForSession,
      },
    }),
  ),
}));

function createRequest(url: string): Request {
  return new Request(url);
}

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it('exchanges code for session and redirects to default path', async () => {
    const request = createRequest('http://localhost:3000/auth/callback?code=test-auth-code');

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('test-auth-code');
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/chat');
  });

  it('blocks absolute URL to external host (open-redirect prevention)', async () => {
    const request = createRequest(
      'http://localhost:3000/auth/callback?code=valid-code&next=https://evil.com/steal',
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    // Should NOT redirect to evil.com — should fall back to /chat
    expect(location.hostname).not.toBe('evil.com');
    expect(location.pathname).toBe('/chat');
  });

  it('allows relative path in next parameter', async () => {
    const request = createRequest(
      'http://localhost:3000/auth/callback?code=valid-code&next=/dashboard',
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/dashboard');
  });

  it('redirects to error page when OAuth error is present', async () => {
    const request = createRequest(
      'http://localhost:3000/auth/callback?error=access_denied&error_description=User+denied+access',
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/auth/error');
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('error_description')).toBe('User denied access');
    // Should not attempt code exchange
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('redirects to error page when code exchange fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: 'Invalid code', status: 400 },
    });

    const request = createRequest('http://localhost:3000/auth/callback?code=expired-code');

    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/auth/error');
    expect(location.searchParams.get('error')).toBe('invalid_token');
  });

  it('redirects to default path when no code is provided', async () => {
    const request = createRequest('http://localhost:3000/auth/callback');

    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/chat');
    // Should not attempt code exchange
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });
});
