import { beforeEach, describe, it, expect, vi } from 'vitest';

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

import {
  assertResolvedPublicHostname,
  pinnedAddressesFor,
  pinnedLookup,
  validateEgressUrl,
  validateUserImageUrl,
  isInternalHostname,
  isDataUrl,
  EgressPolicyError,
} from './egress-policy';

beforeEach(() => {
  dnsMocks.lookup.mockReset();
});

describe('isDataUrl', () => {
  it.each([
    ['data:image/png;base64,iVBORw0KG...', true],
    ['DATA:image/png;base64,abc', true],
    ['data:', true],
    ['https://example.com/img.png', false],
    ['', false],
    ['javascript:alert(1)', false],
  ])('%s -> %s', (input, expected) => {
    expect(isDataUrl(input)).toBe(expected);
  });
});

describe('isInternalHostname', () => {
  it.each([
    'localhost',
    'localhost.localdomain',
    '127.0.0.1',
    '127.255.255.255',
    '0.0.0.0',
    '::1',
    '[::1]',
  ])('blocks loopback: %s', (host) => {
    expect(isInternalHostname(host)).toBe(true);
  });

  it.each([
    '10.0.0.1',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '192.168.255.255',
  ])('blocks RFC1918: %s', (host) => {
    expect(isInternalHostname(host)).toBe(true);
  });

  it.each(['169.254.169.254', '169.254.0.1', '169.254.255.255'])(
    'blocks link-local + IMDS: %s',
    (host) => {
      expect(isInternalHostname(host)).toBe(true);
    },
  );

  it.each(['100.64.0.1', '100.127.255.255'])('blocks CGNAT: %s', (host) => {
    expect(isInternalHostname(host)).toBe(true);
  });

  it.each(['224.0.0.1', '239.255.255.255', '255.255.255.255'])(
    'blocks multicast/reserved: %s',
    (host) => {
      expect(isInternalHostname(host)).toBe(true);
    },
  );

  it.each(['fe80::1', 'fc00::1', 'fd12:3456:789a::1'])('blocks IPv6 ULA/link-local: %s', (host) => {
    expect(isInternalHostname(host)).toBe(true);
  });

  it.each([
    '::ffff:169.254.169.254', // AWS/GCP metadata, mapped dotted
    '::ffff:a9fe:a9fe', // same, mapped hex
    '::ffff:127.0.0.1', // loopback, mapped
    '::ffff:10.0.0.1', // private, mapped
    '::ffff:192.168.1.1', // private, mapped
    '0:0:0:0:0:ffff:169.254.169.254', // fully-expanded mapped
    '::127.0.0.1', // IPv4-compatible (deprecated)
    '64:ff9b::169.254.169.254', // NAT64 dotted
    '64:ff9b::a9fe:a9fe', // NAT64 hex
  ])('blocks IPv4-embedded IPv6 to internal target: %s', (host) => {
    expect(isInternalHostname(host)).toBe(true);
  });

  it.each(['::ffff:8.8.8.8', '::ffff:0808:0808'])(
    'allows IPv4-mapped IPv6 to public target: %s',
    (host) => {
      expect(isInternalHostname(host)).toBe(false);
    },
  );

  it.each([
    'example.com',
    'cdn.example.com',
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '2606:2800:220:1:248:1893:25c8:1946',
  ])('allows public host: %s', (host) => {
    expect(isInternalHostname(host)).toBe(false);
  });

  it.each(['256.256.256.256', '999.0.0.1'])('blocks malformed IPv4: %s', (host) => {
    expect(isInternalHostname(host)).toBe(true);
  });
});

describe('validateUserImageUrl · accepts', () => {
  it.each([
    'data:image/png;base64,iVBORw0KG...',
    'data:image/jpeg;base64,/9j/4AAQ...',
    'data:image/svg+xml;base64,PHN2Z...',
    'https://cdn.example.com/photo.jpg',
    'https://images.unsplash.com/photo-12345',
    'https://example.com:8443/image.png', // non-internal port OK
    'https://1.1.1.1/img.png', // public IPv4
  ])('accepts %s', (url) => {
    expect(() => validateUserImageUrl(url)).not.toThrow();
  });
});

describe('validateUserImageUrl · rejects', () => {
  it('blocks AWS IMDS (the original PoC)', () => {
    expect(() => validateUserImageUrl('http://169.254.169.254/latest/meta-data/')).toThrow(
      EgressPolicyError,
    );
    expect(() => validateUserImageUrl('https://169.254.169.254/latest/meta-data/')).toThrow(
      EgressPolicyError,
    );
  });

  it.each([
    ['empty string', ''],
    ['plain string', 'not a url'],
    ['javascript:', 'javascript:alert(1)'],
    ['file://', 'file:///etc/passwd'],
    ['ftp://', 'ftp://attacker.example/'],
    ['http (non-https)', 'http://example.com/img.png'],
    ['userinfo present', 'https://attacker:secret@example.com/img.png'],
    ['userinfo only user', 'https://attacker@example.com/img.png'],
  ])('blocks %s', (_label, url) => {
    expect(() => validateUserImageUrl(url)).toThrow(EgressPolicyError);
  });

  it.each([
    'https://localhost/img.png',
    'https://127.0.0.1/img.png',
    'https://10.0.0.1/img.png',
    'https://192.168.1.1/img.png',
    'https://172.20.0.1/img.png',
    'https://[::1]/img.png',
    'https://[fe80::1]/img.png',
  ])('blocks internal host: %s', (url) => {
    expect(() => validateUserImageUrl(url)).toThrow(EgressPolicyError);
  });

  it.each([
    'https://example.com:22/key.pub',
    'https://example.com:5432/x',
    'https://example.com:6379/x',
    'https://example.com:11211/x',
    'https://example.com:11434/x', // ollama
    'https://example.com:27017/x', // mongo
  ])('blocks internal-service-port URL: %s', (url) => {
    expect(() => validateUserImageUrl(url)).toThrow(EgressPolicyError);
  });

  it('blocks non-string', () => {
    expect(() => validateUserImageUrl(undefined as unknown as string)).toThrow(EgressPolicyError);
    expect(() => validateUserImageUrl(null as unknown as string)).toThrow(EgressPolicyError);
  });
});

describe('validateEgressUrl · service allowlist (unchanged behavior)', () => {
  it('allows known providers', () => {
    expect(() => validateEgressUrl('https://api.anthropic.com/v1/messages')).not.toThrow();
    expect(() => validateEgressUrl('https://api.openai.com/v1/chat/completions')).not.toThrow();
  });

  it('allows both Moonshot endpoints (mainland .cn and international .ai)', () => {
    expect(() => validateEgressUrl('https://api.moonshot.ai/v1/chat/completions')).not.toThrow();
    expect(() => validateEgressUrl('https://api.moonshot.cn/v1/chat/completions')).not.toThrow();
  });

  it.each([
    ['xAI', 'https://api.x.ai/v1/chat/completions'],
    ['DeepSeek', 'https://api.deepseek.com/v1/chat/completions'],
    ['Perplexity', 'https://api.perplexity.ai/chat/completions'],
    ['OpenRouter', 'https://openrouter.ai/api/v1/chat/completions'],
    ['DashScope (Qwen)', 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'],
    ['Zhipu', 'https://open.bigmodel.cn/api/paas/v4/chat/completions'],
    ['MiniMax', 'https://api.minimax.io/v1/text/chatcompletion_v2'],
  ])('allows %s, which the canonical managed-provider list carries', (_label, url) => {
    expect(() => validateEgressUrl(url)).not.toThrow();
  });

  it('allows the places provider host the places tool calls', () => {
    expect(() =>
      validateEgressUrl('https://places.googleapis.com/v1/places:searchText'),
    ).not.toThrow();
  });

  it.each(['https://localhost/v1/messages', 'https://127.0.0.1/v1/messages'])(
    'still rejects the canonical list local-dev carve-out: %s',
    (url) => {
      expect(() => validateEgressUrl(url)).toThrow(EgressPolicyError);
    },
  );

  it('no longer allows MuleRouter, dropped as a gateway 2026-07-27', () => {
    expect(() => validateEgressUrl('https://api.mulerouter.ai/v1/chat/completions')).toThrow();
  });

  it('blocks unlisted host', () => {
    expect(() => validateEgressUrl('https://attacker.example/v1/messages')).toThrow(
      EgressPolicyError,
    );
  });

  it('blocks IMDS even if hostname were somehow allowlisted (defense in depth)', () => {
    expect(() => validateEgressUrl('https://169.254.169.254/v1/messages')).toThrow(
      EgressPolicyError,
    );
  });

  it('blocks http (must be https)', () => {
    expect(() => validateEgressUrl('http://api.anthropic.com/v1/messages')).toThrow(
      EgressPolicyError,
    );
  });
});

describe('pinned public lookup', () => {
  it('pins the addresses the policy vetted and hands exactly those to the connector', async () => {
    dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    await assertResolvedPublicHostname('https://pinned.example.com/x');

    expect(pinnedAddressesFor('pinned.example.com')).toEqual([
      { address: '93.184.216.34', family: 4 },
    ]);
    const single = vi.fn();
    pinnedLookup('pinned.example.com', { all: false }, single);
    expect(single).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    const all = vi.fn();
    pinnedLookup('PINNED.example.com', { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
  });

  it('refuses to connect to a host the policy never vetted, so a rebinding answer is never used', () => {
    const callback = vi.fn();
    pinnedLookup('never-checked.example.com', { all: false }, callback);
    expect(callback.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('does not pin a host whose answers included an internal address', async () => {
    dnsMocks.lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);
    await expect(assertResolvedPublicHostname('https://mixed.example.com/')).rejects.toThrow();
    expect(pinnedAddressesFor('mixed.example.com')).toBeNull();
  });
});

describe('assertResolvedPublicHostname', () => {
  it('allows a hostname whose resolved addresses are public', async () => {
    dnsMocks.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);

    await expect(assertResolvedPublicHostname('https://example.com/mcp')).resolves.toBeUndefined();
  });

  it('blocks a hostname whose DNS resolves to a private address', async () => {
    dnsMocks.lookup.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);

    await expect(assertResolvedPublicHostname('https://attacker.example/mcp')).rejects.toThrow(
      EgressPolicyError,
    );
  });

  it('fails closed when DNS lookup fails', async () => {
    dnsMocks.lookup.mockRejectedValueOnce(new Error('NXDOMAIN'));

    await expect(assertResolvedPublicHostname('https://missing.example/mcp')).rejects.toThrow(
      EgressPolicyError,
    );
  });
});
