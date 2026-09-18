import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { callTool, discoverAllTools } from '../src/webmcp';
import {
  effectFromAnnotations,
  effectFromFormMethod,
  planSiteToolCall,
} from '../src/features/tools/siteToolRegistry';

type NavigatorWithModelContext = Navigator & {
  modelContext?: unknown;
  modelContextTesting?: unknown;
};

function setModelContext(value: unknown): void {
  (navigator as NavigatorWithModelContext).modelContext = value;
}

function seedForm(name: string, method = 'post'): HTMLFormElement {
  document.body.innerHTML = `
    <form tool-name="${name}" tool-description="Search the catalogue" method="${method}">
      <input name="query" required />
    </form>`;
  const form = document.querySelector('form') as HTMLFormElement;
  form.requestSubmit = vi.fn();
  return form;
}

beforeEach(() => {
  document.body.innerHTML = '';
  delete (navigator as NavigatorWithModelContext).modelContext;
  delete (navigator as NavigatorWithModelContext).modelContextTesting;
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('site tool effect', () => {
  it('reads an effect the page declared and treats an undeclared one as a write', () => {
    expect(effectFromAnnotations({ readOnlyHint: true })).toBe('read');
    expect(effectFromAnnotations({ readOnlyHint: 'true' })).toBe('write');
    expect(effectFromAnnotations(undefined)).toBe('write');
    expect(effectFromFormMethod('GET')).toBe('read');
    expect(effectFromFormMethod(null)).toBe('write');
  });

  it('carries the effect out of discovery for both tool sources', () => {
    seedForm('search', 'get');
    setModelContext({
      listTools: () => [
        { name: 'read_cart', annotations: { readOnlyHint: true } },
        { name: 'place_order' },
      ],
    });

    const byName = new Map(discoverAllTools().tools.map((tool) => [tool.name, tool.effect]));
    expect(byName.get('search')).toBe('read');
    expect(byName.get('read_cart')).toBe('read');
    expect(byName.get('place_order')).toBe('write');
  });
});

describe('site tool approval', () => {
  it('asks on a page the shared approval policy flags, whatever the tool claims', () => {
    const sensitive = planSiteToolCall(
      { name: 'transfer', effect: 'write' },
      {},
      'https://chase.com/transfer',
    );
    expect(sensitive.requiresApproval).toBe(true);
    expect(sensitive.reason).toContain('banking');

    const ordinary = planSiteToolCall(
      { name: 'transfer', effect: 'write' },
      {},
      'https://shop.example.com/cart',
    );
    expect(ordinary.requiresApproval).toBe(false);
  });

  it('runs a read call on an unflagged page without a prompt', async () => {
    setModelContext({ callTool: vi.fn(async () => ({ items: 2 })) });

    const response = await callTool({ name: 'read_cart' });

    expect(response).toEqual({ success: true, result: { items: 2 } });
    expect(globalThis.confirm).not.toHaveBeenCalled();
  });

  it('refuses a write on a flagged page when the person cancels', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    const call = vi.fn(async () => ({ ok: true }));
    setModelContext({ callTool: call });
    Object.defineProperty(window, 'location', {
      value: new URL('https://chase.com/transfer'),
      writable: true,
    });

    const response = await callTool({ name: 'transfer', arguments: { amount: 500 } });

    expect(response.success).toBe(false);
    expect(response.error).toContain('cancelled');
    expect(call).not.toHaveBeenCalled();
  });

  it('asks before submitting the page form, which navigates whatever its method', async () => {
    const form = seedForm('search', 'get');

    const response = await callTool({ name: 'search', arguments: { query: 'shoes' } });

    expect(globalThis.confirm).toHaveBeenCalledTimes(1);
    expect(response.success).toBe(true);
    expect(form.requestSubmit).toHaveBeenCalled();
  });
});

describe('falling back to the DOM when a site tool fails', () => {
  it('submits the page form after the site tool errors, and says that it did', async () => {
    const form = seedForm('search');
    setModelContext({
      callTool: vi.fn(async () => {
        throw new Error('tool unavailable');
      }),
    });

    const response = await callTool({ name: 'search', arguments: { query: 'shoes' } });

    expect(response).toEqual({
      success: true,
      result: { submitted: true, toolName: 'search' },
      fellBackToDom: true,
    });
    expect((form.querySelector('[name="query"]') as HTMLInputElement).value).toBe('shoes');
    expect(form.requestSubmit).toHaveBeenCalledTimes(1);
  });

  it('reports the site tool error when the page offers no form to fall back to', async () => {
    setModelContext({
      callTool: vi.fn(async () => {
        throw new Error('tool unavailable');
      }),
    });

    expect(await callTool({ name: 'search' })).toEqual({
      success: false,
      error: 'tool unavailable',
    });
  });

  it('reports the site tool error, not the form error, when the fallback also fails', async () => {
    const form = seedForm('search');
    (form.requestSubmit as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('form rejected');
    });
    setModelContext({
      callTool: vi.fn(async () => {
        throw new Error('tool unavailable');
      }),
    });

    expect(await callTool({ name: 'search', arguments: { query: 'x' } })).toEqual({
      success: false,
      error: 'tool unavailable',
    });
  });

  it('asks once, not twice, when a flagged call falls back to the form', async () => {
    Object.defineProperty(window, 'location', {
      value: new URL('https://chase.com/transfer'),
      writable: true,
    });
    seedForm('transfer');
    setModelContext({
      callTool: vi.fn(async () => {
        throw new Error('tool unavailable');
      }),
    });

    const response = await callTool({ name: 'transfer', arguments: { amount: 5 } });

    expect(globalThis.confirm).toHaveBeenCalledTimes(1);
    expect(response.fellBackToDom).toBe(true);
  });
});
