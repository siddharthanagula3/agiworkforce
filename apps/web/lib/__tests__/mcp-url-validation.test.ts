import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  class EgressPolicyError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'EgressPolicyError';
    }
  }
  return { assertResolvedPublicHostname: vi.fn(), EgressPolicyError };
});

vi.mock('@/lib/egress-policy', () => ({
  assertResolvedPublicHostname: (...args: unknown[]) => mocks.assertResolvedPublicHostname(...args),
  EgressPolicyError: mocks.EgressPolicyError,
}));

import { validateHttpsMcpUrl } from '../mcp-url-validation';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertResolvedPublicHostname.mockResolvedValue(undefined);
});

/**
 * Every route that takes an MCP endpoint from a request mocks this function
 * away, so this is where the rules it enforces are held.
 */
describe('validateHttpsMcpUrl', () => {
  it('accepts an https endpoint that resolves to a public address', async () => {
    const parsed = await validateHttpsMcpUrl('https://mcp.example.com/sse');

    expect(parsed.host).toBe('mcp.example.com');
    expect(mocks.assertResolvedPublicHostname).toHaveBeenCalledWith('https://mcp.example.com/sse');
  });

  it('refuses plaintext http before resolving anything', async () => {
    await expect(validateHttpsMcpUrl('http://mcp.example.com/sse')).rejects.toThrow(
      /must use https/,
    );
    expect(mocks.assertResolvedPublicHostname).not.toHaveBeenCalled();
  });

  it('refuses a value that is not a string', async () => {
    await expect(validateHttpsMcpUrl({ url: 'https://mcp.example.com' })).rejects.toThrow(
      /must be a string/,
    );
    expect(mocks.assertResolvedPublicHostname).not.toHaveBeenCalled();
  });

  it('refuses a string the URL parser cannot read', async () => {
    await expect(validateHttpsMcpUrl('mcp.example.com/sse')).rejects.toThrow(/not a valid URL/);
  });

  it('refuses an endpoint the egress policy resolves to a private address', async () => {
    mocks.assertResolvedPublicHostname.mockRejectedValue(
      new mocks.EgressPolicyError('resolved to 169.254.169.254'),
    );

    await expect(validateHttpsMcpUrl('https://metadata.internal/sse')).rejects.toThrow(
      /private or unsafe network address/,
    );
  });

  it('does not report an unrelated failure as a blocked address', async () => {
    mocks.assertResolvedPublicHostname.mockRejectedValue(new Error('dns timed out'));

    await expect(validateHttpsMcpUrl('https://mcp.example.com/sse')).rejects.toThrow(
      /dns timed out/,
    );
  });

  it('refuses an endpoint carrying credentials in the URL', async () => {
    await expect(validateHttpsMcpUrl('https://user:secret@mcp.example.com/sse')).rejects.toThrow(
      /must not include embedded credentials/,
    );
  });

  it('names the field it was given, so a caller error is readable', async () => {
    await expect(validateHttpsMcpUrl('ftp://mcp.example.com', 'serverUrl')).rejects.toThrow(
      /serverUrl must use https/,
    );
  });
});
