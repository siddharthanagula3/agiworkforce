import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const authorizeBrowserToolUrl = vi.hoisted(() => vi.fn());
vi.mock('../src/features/browser-tools/tabAuthority', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  authorizeBrowserToolUrl,
}));

import { callTool } from '../src/webmcp';

const BLOCKED_ORIGIN = 'https://blocked.example';

function seedForm(action: string | null, extra = ''): HTMLFormElement {
  const actionAttribute = action === null ? '' : ` action="${action}"`;
  document.body.innerHTML = `
    <form tool-name="SendNote" tool-description="Send a note" method="post"${actionAttribute}>
      <input name="note" />
      ${extra}
    </form>`;
  const form = document.querySelector('form') as HTMLFormElement;
  form.requestSubmit = vi.fn();
  return form;
}

function setBase(href: string): HTMLBaseElement {
  const base = document.createElement('base');
  base.href = href;
  document.head.appendChild(base);
  return base;
}

function refuseBlockedOrigin(): void {
  authorizeBrowserToolUrl.mockImplementation(async (url: string) => {
    if (new URL(url).origin === BLOCKED_ORIGIN) throw new Error('blocked');
    return { origin: new URL(url).origin, url };
  });
}

const request = { name: 'SendNote', arguments: { note: 'hello' }, assertCurrent: () => undefined };

beforeEach(() => {
  document.head.querySelectorAll('base').forEach((node) => node.remove());
  document.body.innerHTML = '';
  authorizeBrowserToolUrl.mockReset();
  authorizeBrowserToolUrl.mockImplementation(async (url: string) => ({
    origin: new URL(url).origin,
    url,
  }));
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
});

afterEach(() => {
  document.head.querySelectorAll('base').forEach((node) => node.remove());
  vi.unstubAllGlobals();
});

describe('declarative site-tool form destination', () => {
  it('authorizes the base-resolved destination and never submits to an unauthorized origin', async () => {
    refuseBlockedOrigin();
    const form = seedForm('/submit');
    setBase(`${BLOCKED_ORIGIN}/`);

    await expect(callTool({ ...request, source: 'declarative' })).rejects.toThrow('blocked');

    expect(authorizeBrowserToolUrl).toHaveBeenCalledWith(`${BLOCKED_ORIGIN}/submit`);
    expect(form.requestSubmit).not.toHaveBeenCalled();
  });

  it('refuses when the base changes after the destination was authorized', async () => {
    const form = seedForm('/submit');
    const base = setBase(`${window.location.origin}/`);
    const assertCurrent = vi.fn();
    authorizeBrowserToolUrl.mockImplementation(async (url: string) => {
      base.href = `${BLOCKED_ORIGIN}/`;
      return { origin: new URL(url).origin, url };
    });

    await expect(callTool({ ...request, assertCurrent, source: 'declarative' })).rejects.toThrow(
      'The approved site-tool form destination changed.',
    );
    expect(form.requestSubmit).not.toHaveBeenCalled();
  });

  it('submits when the base shares the authorized origin', async () => {
    const form = seedForm('/submit');
    setBase(`${window.location.origin}/app/`);

    const response = await callTool({ ...request, source: 'declarative' });

    expect(authorizeBrowserToolUrl).toHaveBeenCalledWith(`${window.location.origin}/submit`);
    expect(response.success).toBe(true);
    expect(form.requestSubmit).toHaveBeenCalledTimes(1);
  });

  it('authorizes an absolute action as written regardless of the base', async () => {
    seedForm('https://approved.example/post');
    setBase(`${BLOCKED_ORIGIN}/`);

    await callTool({ ...request, source: 'declarative' });

    expect(authorizeBrowserToolUrl).toHaveBeenCalledWith('https://approved.example/post');
  });

  it('authorizes the page address for an empty action', async () => {
    const form = seedForm(null);

    const response = await callTool({ ...request, source: 'declarative' });

    expect(authorizeBrowserToolUrl).toHaveBeenCalledWith(new URL(window.location.href).href);
    expect(response.success).toBe(true);
    expect(form.requestSubmit).toHaveBeenCalledTimes(1);
  });

  it('is not redirected by a field named action shadowing the form property', async () => {
    refuseBlockedOrigin();
    const form = seedForm('/submit', '<input name="action" value="https://approved.example/x" />');
    setBase(`${BLOCKED_ORIGIN}/`);

    await expect(callTool({ ...request, source: 'declarative' })).rejects.toThrow('blocked');

    expect(authorizeBrowserToolUrl).toHaveBeenCalledWith(`${BLOCKED_ORIGIN}/submit`);
    expect(form.requestSubmit).not.toHaveBeenCalled();
  });
});

type ImportedModule1 = typeof import('../src/utils');
type ImportedModule0 = typeof import('../src/features/browser-tools/tabAuthority');
