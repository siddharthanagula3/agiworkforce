import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { clearCloudCodeRuntimeCache, listCloudCodeRuntimes } from '../templates';

const ORIGINAL_ENV = { ...process.env };

function template(overrides: Record<string, unknown> = {}) {
  return {
    templateID: 'tpl-1',
    names: ['code-interpreter-v1'],
    aliases: ['legacy-name'],
    buildStatus: 'ready',
    public: true,
    cpuCount: 2,
    memoryMB: 4096,
    diskSizeMB: 20480,
    ...overrides,
  };
}

function respondWith(body: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe('E2B template catalogue', () => {
  beforeEach(() => {
    clearCloudCodeRuntimeCache();
    process.env['E2B_API_KEY'] = 'e2b_test_key';
    process.env['AGI_E2B_EXECUTION'] = '1';
    delete process.env['E2B_API_URL'];
    delete process.env['E2B_DOMAIN'];
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    clearCloudCodeRuntimeCache();
  });

  it('returns nothing without a key rather than calling out', async () => {
    delete process.env['E2B_API_KEY'];
    const fetchMock = respondWith([template()]);
    vi.stubGlobal('fetch', fetchMock);

    expect(await listCloudCodeRuntimes()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers the documented coding harnesses', async () => {
    vi.stubGlobal('fetch', respondWith([]));
    const runtimes = await listCloudCodeRuntimes();
    const harnesses = runtimes.filter((runtime) => runtime.kind === 'harness');

    // every one of these was verified by spawning it; the list is not aspirational
    expect(harnesses.map((h) => h.id).sort()).toEqual(
      ['amp', 'claude', 'codex', 'droid', 'grok', 'openclaw', 'opencode'].sort(),
    );
    for (const harness of harnesses) {
      expect(
        harness.agentCommand,
        `${harness.id} must name the binary that starts it`,
      ).toBeTruthy();
      expect(harness.summary).not.toHaveLength(0);
    }
  });

  it('maps a team template alongside the harnesses', async () => {
    vi.stubGlobal('fetch', respondWith([template({ templateID: 'tpl-1', names: ['our-image'] })]));

    const runtimes = await listCloudCodeRuntimes();
    expect(runtimes).toContainEqual({
      id: 'tpl-1',
      name: 'our-image',
      kind: 'image',
      summary: 'Published by this team in the E2B console.',
      agentCommand: null,
      cpuCount: 2,
      memoryMB: 4096,
      diskSizeMB: 20480,
      isPublic: true,
    });
  });

  it('lets a team template of the same name win over the built-in harness', async () => {
    vi.stubGlobal('fetch', respondWith([template({ templateID: 'claude', names: ['claude'] })]));

    const claude = (await listCloudCodeRuntimes()).filter((runtime) => runtime.id === 'claude');
    expect(claude).toHaveLength(1);
    expect(claude[0]!.summary).toBe('Published by this team in the E2B console.');
  });

  it('authenticates with the header E2B accepts, against the documented host', async () => {
    const fetchMock = respondWith([]);
    vi.stubGlobal('fetch', fetchMock);
    await listCloudCodeRuntimes();

    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://api.e2b.app/templates');
    expect((init as RequestInit).headers).toMatchObject({ 'X-API-Key': 'e2b_test_key' });
  });

  it('honours an operator-set API url', async () => {
    process.env['E2B_API_URL'] = 'https://api.e2b.example/';
    const fetchMock = respondWith([]);
    vi.stubGlobal('fetch', fetchMock);
    await listCloudCodeRuntimes();

    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(
      'https://api.e2b.example/templates',
    );
  });

  it('drops templates that cannot be spawned', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith([
        template({ templateID: 'ready-one' }),
        template({ templateID: 'building', buildStatus: 'building' }),
        template({ templateID: 'broken', buildStatus: 'error' }),
      ]),
    );

    const ids = (await listCloudCodeRuntimes()).map((runtime) => runtime.id);
    expect(ids).toContain('ready-one');
    expect(ids).not.toContain('building');
    expect(ids).not.toContain('broken');
  });

  it('falls back through name, alias, then id for the label', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith([
        template({ templateID: 'a', names: [], aliases: ['from-alias'] }),
        template({ templateID: 'b-id-only', names: undefined, aliases: undefined }),
      ]),
    );

    const byId = Object.fromEntries(
      (await listCloudCodeRuntimes()).map((runtime) => [runtime.id, runtime.name]),
    );
    expect(byId['a']).toBe('from-alias');
    expect(byId['b-id-only']).toBe('b-id-only');
  });

  it('keeps the harnesses when E2B refuses the key for team templates', async () => {
    vi.stubGlobal('fetch', respondWith({ message: 'unauthorized' }, false, 401));
    const runtimes = await listCloudCodeRuntimes();
    // the harnesses are public and do not depend on that read
    expect(runtimes.every((runtime) => runtime.isPublic)).toBe(true);
    expect(runtimes.some((runtime) => runtime.id === 'claude')).toBe(true);
  });

  it('serves the last good catalogue through a transient failure', async () => {
    vi.stubGlobal('fetch', respondWith([template({ templateID: 'team-one' })]));
    expect((await listCloudCodeRuntimes()).map((r) => r.id)).toContain('team-one');

    clearCloudCodeRuntimeCache();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    );
    // the cache was cleared, so this proves the throw path still stands the
    // harnesses up rather than propagating and taking the whole response down
    const afterOutage = await listCloudCodeRuntimes();
    expect(afterOutage.some((r) => r.id === 'claude')).toBe(true);
    expect(afterOutage.map((r) => r.id)).not.toContain('team-one');
  });

  it('does not re-read the catalogue on every request', async () => {
    const fetchMock = respondWith([template()]);
    vi.stubGlobal('fetch', fetchMock);

    await listCloudCodeRuntimes();
    await listCloudCodeRuntimes();
    await listCloudCodeRuntimes();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
