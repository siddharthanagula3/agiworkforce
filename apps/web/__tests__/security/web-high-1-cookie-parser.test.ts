
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: null }),
}));

import { readCookie, getSessionIdFromRequest, getOrCreateAnonSession } from '@/lib/csrf';

describe('web-HIGH-1 readCookie() — anchored cookie parser', () => {
  it('reads a cookie at the start of the header', () => {
    expect(readCookie('anon-session-id=abc123', 'anon-session-id')).toBe('abc123');
  });

  it('reads a cookie in the middle of the header (after "; ")', () => {
    expect(readCookie('first=1; anon-session-id=abc123; last=2', 'anon-session-id')).toBe('abc123');
  });

  it('reads the __Host- prefixed cookie', () => {
    expect(readCookie('__Host-anon-session-id=secure-id', '__Host-anon-session-id')).toBe(
      'secure-id',
    );
  });

  it('returns null when the cookie is absent', () => {
    expect(readCookie('foo=bar; baz=qux', 'anon-session-id')).toBeNull();
  });

  it('returns null for an empty cookie header', () => {
    expect(readCookie('', 'anon-session-id')).toBeNull();
  });

  it('does NOT match a cookie whose name only ENDS WITH the target name', () => {
    expect(readCookie('x-anon-session-id=attacker-value', 'anon-session-id')).toBeNull();
  });

  it('does NOT match a cookie name preceded by anything other than "; " or start', () => {
    expect(readCookie('crafted-anon-session-id=evil', 'anon-session-id')).toBeNull();
  });

  it('returns the legitimate value when both legitimate and suffix cookies are present', () => {
    expect(
      readCookie(
        'crafted-anon-session-id=attacker-value; anon-session-id=real-value',
        'anon-session-id',
      ),
    ).toBe('real-value');
  });

  it('regex-escapes the cookie name argument so a caller cannot widen the match', () => {
    expect(readCookie('a.b=value1; ax=value2', 'a.b')).toBe('value1');
    expect(readCookie('a.b=value1; ax=value2', 'a.b')).not.toBe('value2');
  });

  it('handles values with special characters until the next semicolon', () => {
    expect(readCookie('anon-session-id=abc.def-ghi_jkl=mno; next=2', 'anon-session-id')).toBe(
      'abc.def-ghi_jkl=mno',
    );
  });
});

describe('web-HIGH-1 getSessionIdFromRequest — suffix attack resilience', () => {
  function makeRequest(cookieHeader: string): Request {
    return new Request('https://example.com/api/test', {
      headers: { cookie: cookieHeader },
    });
  }

  it('returns the legitimate __Host- session id when only the legitimate cookie is present', async () => {
    const id = await getSessionIdFromRequest(makeRequest('__Host-anon-session-id=legit-1234'));
    expect(id).toBe('legit-1234');
  });

  it('does NOT return the attacker-planted suffix cookie value', async () => {
    const id = await getSessionIdFromRequest(makeRequest('x-anon-session-id=ATTACKER'));
    expect(id).not.toBe('ATTACKER');
    expect(id).toMatch(/^anon-[0-9a-f-]+$/);
  });

  it('prefers __Host- prefixed cookie over legacy anon-session-id', async () => {
    const id = await getSessionIdFromRequest(
      makeRequest('__Host-anon-session-id=host-secure-id; anon-session-id=legacy-id'),
    );
    expect(id).toBe('host-secure-id');
  });
});

describe('web-HIGH-1 getOrCreateAnonSession — suffix attack resilience', () => {
  function makeRequest(cookieHeader: string): Request {
    return new Request('https://example.com/api/csrf', {
      headers: { cookie: cookieHeader },
    });
  }

  it('returns existing __Host-anon-session-id without generating a new cookie', async () => {
    const result = await getOrCreateAnonSession(
      makeRequest('__Host-anon-session-id=existing-host-id'),
    );
    expect(result.id).toBe('existing-host-id');
    expect(result.newCookie).toBeUndefined();
  });

  it('rejects an attacker-suffix cookie and generates a fresh session', async () => {
    const result = await getOrCreateAnonSession(makeRequest('crafted-anon-session-id=ATTACKER'));
    expect(result.id).not.toBe('ATTACKER');
    expect(result.id).toMatch(/^anon-[0-9a-f-]+$/);
    expect(result.newCookie).toContain('__Host-anon-session-id=');
    expect(result.newCookie).toContain('Path=/');
    expect(result.newCookie).toContain('HttpOnly');
    expect(result.newCookie).toContain('SameSite=Strict');
    expect(result.newCookie).toContain('Secure');
  });
});
