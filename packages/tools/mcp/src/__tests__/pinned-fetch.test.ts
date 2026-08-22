import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { PassThrough } from 'node:stream';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock('node:dns/promises', () => ({ lookup: dns.lookup, default: { lookup: dns.lookup } }));

import { createPinnedFetch, isPrivateNetworkAddress } from '../pinned-fetch';
import { createEgressGuardedFetch } from '../transport';

const PUBLIC_ADDRESS = '93.184.216.34';
const METADATA_ADDRESS = '169.254.169.254';

interface ServedRequest {
  method: string;
  url: string;
  host: string | undefined;
  remoteAddress: string | undefined;
  body: string;
}

let server: Server;
let port = 0;
let served: ServedRequest[] = [];

function handle(request: IncomingMessage, response: ServerResponse): void {
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => chunks.push(chunk));
  request.on('end', () => {
    served.push({
      method: request.method ?? '',
      url: request.url ?? '',
      host: request.headers.host,
      remoteAddress: request.socket.remoteAddress ?? undefined,
      body: Buffer.concat(chunks).toString('utf8'),
    });
    if (request.url === '/redirect') {
      response.writeHead(302, { location: `http://${METADATA_ADDRESS}/latest/meta-data/` });
      response.end();
      return;
    }
    if (request.url === '/empty') {
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, seen: Buffer.concat(chunks).toString('utf8') }));
  });
}

beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  port = typeof address === 'object' && address !== null ? address.port : 0;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  served = [];
  dns.lookup.mockReset();
});

afterEach(() => {
  vi.doUnmock('node:http');
  vi.resetModules();
});

describe('createPinnedFetch — one resolution, one destination', () => {
  it('resolves the hostname exactly once, so a rebind has no window to land in', async () => {
    dns.lookup
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])
      .mockResolvedValue([{ address: METADATA_ADDRESS, family: 4 }]);

    const pinnedFetch = createPinnedFetch({ allowPrivateAddresses: true });
    const response = await pinnedFetch(`http://rebind.test:${port}/echo`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, seen: '' });
    expect(dns.lookup).toHaveBeenCalledTimes(1);
    expect(served).toHaveLength(1);
    expect(served[0]?.remoteAddress).toBe('127.0.0.1');
    expect(served[0]?.host).toBe(`rebind.test:${port}`);
  });

  it('hands the socket only the addresses vetted in that same lookup', async () => {
    dns.lookup
      .mockResolvedValueOnce([{ address: PUBLIC_ADDRESS, family: 4 }])
      .mockResolvedValue([{ address: METADATA_ADDRESS, family: 4 }]);

    const captured: Array<Record<string, unknown>> = [];
    vi.doMock('node:http', () => ({
      request: (args: Record<string, unknown>, callback: (res: PassThrough) => void) => {
        captured.push(args);
        const response = new PassThrough();
        Object.assign(response, { statusCode: 200, statusMessage: 'OK', headers: {} });
        queueMicrotask(() => {
          callback(response);
          response.end('pinned');
        });
        return { on: () => undefined, end: () => undefined };
      },
    }));
    const { createPinnedFetch: freshPinnedFetch } = await import('../pinned-fetch');

    const response = await freshPinnedFetch()('http://rebind.test/mcp');
    await expect(response.text()).resolves.toBe('pinned');

    expect(dns.lookup).toHaveBeenCalledTimes(1);
    expect(captured).toHaveLength(1);

    const lookup = captured[0]?.['lookup'] as (
      hostname: string,
      options: { all: boolean },
      callback: (error: Error | null, addresses: Array<{ address: string }>) => void,
    ) => void;
    const offered = await new Promise<Array<{ address: string }>>((resolve, reject) => {
      lookup('rebind.test', { all: true }, (error, addresses) =>
        error ? reject(error) : resolve(addresses),
      );
    });
    expect(offered.map((entry) => entry.address)).toEqual([PUBLIC_ADDRESS]);
    expect(offered.map((entry) => entry.address)).not.toContain(METADATA_ADDRESS);
  });
});

describe('createPinnedFetch — https keeps the hostname for SNI while pinning the address', () => {
  it('passes the pinned lookup and the original hostname to the TLS request', async () => {
    dns.lookup.mockResolvedValue([{ address: PUBLIC_ADDRESS, family: 4 }]);

    const captured: Array<Record<string, unknown>> = [];
    vi.doMock('node:https', () => ({
      request: (args: Record<string, unknown>, callback: (res: PassThrough) => void) => {
        captured.push(args);
        const response = new PassThrough();
        Object.assign(response, { statusCode: 200, statusMessage: 'OK', headers: {} });
        queueMicrotask(() => {
          callback(response);
          response.end('{}');
        });
        return { on: () => undefined, end: () => undefined };
      },
    }));
    const { createPinnedFetch: freshPinnedFetch } = await import('../pinned-fetch');

    const response = await freshPinnedFetch()('https://connector.test/mcp');
    await expect(response.text()).resolves.toBe('{}');

    const args = captured[0] ?? {};
    expect(args['hostname']).toBe('connector.test');
    expect(args['port']).toBe(443);
    expect(args['path']).toBe('/mcp');
    expect(typeof args['lookup']).toBe('function');
    vi.doUnmock('node:https');
  });
});

describe('createPinnedFetch — private and reserved destinations', () => {
  it('refuses a hostname that resolves to the cloud metadata address', async () => {
    dns.lookup.mockResolvedValue([{ address: METADATA_ADDRESS, family: 4 }]);

    await expect(createPinnedFetch()('http://attacker.test/mcp')).rejects.toThrow(/private/i);
    expect(served).toHaveLength(0);
  });

  it('fails closed when only one of several answers is internal', async () => {
    dns.lookup.mockResolvedValue([
      { address: PUBLIC_ADDRESS, family: 4 },
      { address: '10.0.0.7', family: 4 },
    ]);

    await expect(createPinnedFetch()('http://attacker.test/mcp')).rejects.toThrow(/private/i);
    expect(served).toHaveLength(0);
  });

  it('refuses an internal address literal without consulting DNS', async () => {
    await expect(
      createPinnedFetch()(`http://${METADATA_ADDRESS}/latest/meta-data/`),
    ).rejects.toThrow(/private/i);
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it('refuses loopback the caller reached by name', async () => {
    dns.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(createPinnedFetch()(`http://loopback.test:${port}/echo`)).rejects.toThrow(
      /private/i,
    );
    expect(served).toHaveLength(0);
  });

  it('refuses an IPv4-mapped IPv6 form of the metadata address', async () => {
    await expect(createPinnedFetch()(`http://[::ffff:${METADATA_ADDRESS}]/`)).rejects.toThrow(
      /private/i,
    );
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it('refuses a hostname that resolves to nothing', async () => {
    dns.lookup.mockResolvedValue([]);

    await expect(createPinnedFetch()('http://empty.test/mcp')).rejects.toThrow(/no addresses/i);
  });

  it('refuses a hostname that does not resolve', async () => {
    dns.lookup.mockRejectedValue(new Error('NXDOMAIN'));

    await expect(createPinnedFetch()('http://missing.test/mcp')).rejects.toThrow(/resolved/i);
  });

  it('allows a private address only for a caller in the local trust context', async () => {
    const response = await createPinnedFetch({ allowPrivateAddresses: true })(
      `http://127.0.0.1:${port}/echo`,
    );
    expect(response.status).toBe(200);
    expect(dns.lookup).not.toHaveBeenCalled();
  });
});

describe('createPinnedFetch — request shape', () => {
  beforeEach(() => {
    dns.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
  });

  it('sends the method, headers, and body the caller asked for', async () => {
    const response = await createPinnedFetch({ allowPrivateAddresses: true })(
      `http://pinned.test:${port}/mcp`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'mcp-session-id': 'abc' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      },
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      seen: '{"jsonrpc":"2.0","method":"tools/list","id":1}',
    });
    expect(served[0]?.method).toBe('POST');
    expect(served[0]?.body).toBe('{"jsonrpc":"2.0","method":"tools/list","id":1}');
  });

  it('returns a redirect instead of following it, leaving the hop check to the transport', async () => {
    const response = await createPinnedFetch({ allowPrivateAddresses: true })(
      `http://pinned.test:${port}/redirect`,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`http://${METADATA_ADDRESS}/latest/meta-data/`);
    expect(served).toHaveLength(1);
  });

  it('returns a null body for a 204', async () => {
    const response = await createPinnedFetch({ allowPrivateAddresses: true })(
      `http://pinned.test:${port}/empty`,
    );

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it('rejects a non-http scheme and embedded credentials', async () => {
    const pinnedFetch = createPinnedFetch({ allowPrivateAddresses: true });
    await expect(pinnedFetch('file:///etc/passwd')).rejects.toThrow(/http/i);
    await expect(pinnedFetch(`http://user:pass@pinned.test:${port}/mcp`)).rejects.toThrow(
      /credentials/i,
    );
    expect(served).toHaveLength(0);
  });

  it('propagates an abort', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      createPinnedFetch({ allowPrivateAddresses: true })(`http://pinned.test:${port}/echo`, {
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});

describe('the guarded transport fetch, carrying the pinned fetch', () => {
  it('refuses the metadata address the nameserver hands back after the URL check passed', async () => {
    dns.lookup.mockResolvedValue([{ address: METADATA_ADDRESS, family: 4 }]);

    const guarded = createEgressGuardedFetch({
      assertAllowedUrl: async () => undefined,
      fetch: createPinnedFetch(),
    });

    await expect(guarded('http://attacker.test/mcp')).rejects.toThrow(/private/i);
    expect(served).toHaveLength(0);
  });

  it('re-pins a cross-origin redirect instead of trusting the first hop', async () => {
    dns.lookup
      .mockResolvedValueOnce([{ address: PUBLIC_ADDRESS, family: 4 }])
      .mockResolvedValue([{ address: METADATA_ADDRESS, family: 4 }]);

    const reached: string[] = [];
    vi.doMock('node:http', () => ({
      request: (args: Record<string, unknown>, callback: (res: PassThrough) => void) => {
        reached.push(String(args['hostname']));
        const response = new PassThrough();
        Object.assign(response, {
          statusCode: 302,
          statusMessage: 'Found',
          headers: { location: 'http://internal.test/latest/meta-data/' },
        });
        queueMicrotask(() => {
          callback(response);
          response.end();
        });
        return { on: () => undefined, end: () => undefined };
      },
    }));
    const { createPinnedFetch: freshPinnedFetch } = await import('../pinned-fetch');

    const guarded = createEgressGuardedFetch({
      assertAllowedUrl: async () => undefined,
      fetch: freshPinnedFetch(),
    });

    await expect(guarded('http://public.test/mcp')).rejects.toThrow(/private/i);
    expect(reached).toEqual(['public.test']);
    expect(dns.lookup).toHaveBeenCalledTimes(2);
  });
});

describe('isPrivateNetworkAddress', () => {
  it('classifies the reserved ranges an SSRF target lives in', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      '::',
      'fd00::1',
      'fe80::1',
      'ff02::1',
      '::ffff:10.0.0.1',
      '64:ff9b::169.254.169.254',
      '2002:a00:1::',
    ]) {
      expect(isPrivateNetworkAddress(address), address).toBe(true);
    }
  });

  it('leaves public addresses alone', () => {
    for (const address of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111']) {
      expect(isPrivateNetworkAddress(address), address).toBe(false);
    }
  });

  it('treats anything that is not an address literal as unsafe', () => {
    expect(isPrivateNetworkAddress('example.com')).toBe(true);
    expect(isPrivateNetworkAddress('')).toBe(true);
  });
});
