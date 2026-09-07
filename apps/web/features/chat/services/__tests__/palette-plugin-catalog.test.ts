import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { invalidatePalettePlugins, loadPalettePlugins } from '../palette-plugin-catalog';

function stubFetch(handler: (url: string) => Response) {
  const spy = vi.fn(async (url: string) => handler(url));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function entries(...ids: string[]) {
  return Response.json({
    entries: ids.map((id) => ({ id, name: id, description: `${id} description` })),
  });
}

beforeEach(() => {
  invalidatePalettePlugins();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadPalettePlugins', () => {
  it('asks the server for a term rather than filtering one cached page', async () => {
    const spy = stubFetch(() => entries('adobe-creative'));

    await expect(loadPalettePlugins('Adobe')).resolves.toEqual([
      { id: 'adobe-creative', name: 'adobe-creative', description: 'adobe-creative description' },
    ]);
    expect(spy.mock.calls[0]?.[0]).toContain('search=adobe');
  });

  it('sends no search parameter for the unfiltered page', async () => {
    const spy = stubFetch(() => entries('frontend-design'));
    await loadPalettePlugins();
    expect(spy.mock.calls[0]?.[0]).not.toContain('search=');
  });

  it('keeps a term and the unfiltered page apart instead of serving one for the other', async () => {
    const spy = stubFetch((url) =>
      url.includes('search=adobe') ? entries('adobe-creative') : entries('frontend-design'),
    );

    const top = await loadPalettePlugins();
    const found = await loadPalettePlugins('adobe');

    expect(top.map((plugin) => plugin.id)).toEqual(['frontend-design']);
    expect(found.map((plugin) => plugin.id)).toEqual(['adobe-creative']);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('reads a repeated term once', async () => {
    const spy = stubFetch(() => entries('adobe-creative'));
    await loadPalettePlugins('adobe');
    await loadPalettePlugins('Adobe ');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('shares one request between callers racing on the same term', async () => {
    const spy = stubFetch(() => entries('adobe-creative'));
    const [first, second] = await Promise.all([
      loadPalettePlugins('adobe'),
      loadPalettePlugins('adobe'),
    ]);
    expect(first).toEqual(second);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('resolves empty on a failed read and retries on the next search', async () => {
    let ok = false;
    const spy = stubFetch(() =>
      ok ? entries('adobe-creative') : Response.json({}, { status: 503 }),
    );

    await expect(loadPalettePlugins('adobe')).resolves.toEqual([]);
    ok = true;
    await expect(loadPalettePlugins('adobe')).resolves.toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
