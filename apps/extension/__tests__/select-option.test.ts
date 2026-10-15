import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectOptionElement } from '../src/features/content/selectOption';
import * as driver from '../src/features/computer-use/cdpDriver';
import * as sitePolicy from '../src/features/site-policy/store';

function fixture(markup = '<option value="a">Alpha</option><option value="b">Beta</option>') {
  document.body.innerHTML = `<select id="choice" aria-label="Category">${markup}</select>`;
  return document.getElementById('choice') as HTMLSelectElement;
}

afterEach(() => {
  driver.unregisterActiveTab(42);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('canonical select option mechanics', () => {
  it('runs the serialized production helper with exact matching and honest DOM events', () => {
    const element = fixture();
    const events: Array<{ type: string; trusted: boolean }> = [];
    element.addEventListener('input', (event) =>
      events.push({ type: event.type, trusted: event.isTrusted }),
    );
    element.addEventListener('change', (event) =>
      events.push({ type: event.type, trusted: event.isTrusted }),
    );
    // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
    const shipped = new Function(
      `return (${selectOptionElement.toString()});`,
    )() as typeof selectOptionElement;
    expect(shipped(element, { label: 'Beta' })).toEqual({
      selectedValue: 'b',
      selectedLabel: 'Beta',
      eventSource: 'dom',
      changed: true,
    });
    expect(element.value).toBe('b');
    expect(events).toEqual([
      { type: 'input', trusted: false },
      { type: 'change', trusted: false },
    ]);
    expect(shipped(element, { value: 'b' }, 'verify').changed).toBe(false);
    expect(events).toHaveLength(2);
  });

  it('does not emit a change for an already selected option', () => {
    const element = fixture();
    const change = vi.fn();
    element.addEventListener('change', change);
    expect(selectOptionElement(element, { value: 'a' }).changed).toBe(false);
    expect(change).not.toHaveBeenCalled();
  });

  it('selects an actual child-realm control adopted into the parent document', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const child = frame.contentDocument!;
    const element = child.createElement('select');
    element.innerHTML = '<option>Alpha</option><option>Beta</option>';
    document.body.append(element);
    expect(element instanceof HTMLSelectElement).toBe(false);
    expect(selectOptionElement(element, { label: 'Beta' }).selectedLabel).toBe('Beta');
    expect(element.value).toBe('Beta');
  });

  it('refuses an adopted child-realm disabled optgroup before mutation', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const element = frame.contentDocument!.createElement('select');
    element.innerHTML =
      '<option>Alpha</option><optgroup disabled label="Blocked"><option>Beta</option></optgroup>';
    document.body.append(element);
    expect(() => selectOptionElement(element, { label: 'Beta' })).toThrow('disabled');
    expect(element.value).toBe('Alpha');
  });

  it.each([
    [
      'disabled select',
      '<option>Alpha</option><option>Beta</option>',
      (el: HTMLSelectElement) => {
        el.disabled = true;
      },
    ],
    ['disabled option', '<option>Alpha</option><option disabled>Beta</option>', () => {}],
    [
      'disabled optgroup',
      '<option>Alpha</option><optgroup disabled label="Blocked"><option>Beta</option></optgroup>',
      () => {},
    ],
    [
      'multiple select',
      '<option>Alpha</option><option>Beta</option>',
      (el: HTMLSelectElement) => {
        el.multiple = true;
      },
    ],
    [
      'ambiguous label',
      '<option>Alpha</option><option>Beta</option><option>Beta</option>',
      () => {},
    ],
    ['missing option', '<option>Alpha</option>', () => {}],
  ] as const)('refuses %s before mutation', (_name, markup, configure) => {
    const element = fixture(markup);
    configure(element);
    const prior = element.value;
    const change = vi.fn();
    element.addEventListener('change', change);
    expect(() => selectOptionElement(element, { label: 'Beta' })).toThrow();
    expect(element.value).toBe(prior);
    expect(change).not.toHaveBeenCalled();
  });

  it('refuses an ambiguous exact value and an unlabeled option', () => {
    const element = fixture(
      '<option value="a">Alpha</option><option value="b">Beta</option><option value="b">Other</option>',
    );
    expect(() => selectOptionElement(element, { value: 'b' })).toThrow('ambiguous');
    fixture('<option value="a">Alpha</option><option value="b"></option>');
    expect(() => selectOptionElement(document.getElementById('choice')!, { value: 'b' })).toThrow(
      'visible label',
    );
  });

  it('refuses invalid choices, nonselect elements and unbounded input', () => {
    const element = fixture();
    expect(() => selectOptionElement(element, { value: 'b', label: 'Beta' })).toThrow(
      'exactly one',
    );
    expect(() => selectOptionElement(element, { label: ' '.repeat(5) })).toThrow('invalid');
    expect(() => selectOptionElement(element, { value: 'b', script: 'bad' } as never)).toThrow(
      'exactly one',
    );
    expect(() => selectOptionElement(element, { label: 'b'.repeat(2_049) })).toThrow('too long');
    expect(() => selectOptionElement(document.body, { label: 'Beta' })).toThrow('select control');
  });

  it('detects a site rejecting the change instead of reporting success', () => {
    const element = fixture();
    element.addEventListener('change', () => {
      element.value = 'a';
    });
    expect(() => selectOptionElement(element, { value: 'b' })).toThrow('did not retain');
    expect(element.value).toBe('a');
  });
});

describe('indexed select driver settlement', () => {
  let original: HTMLSelectElement;
  let afterApply: () => void;
  const send = vi.fn(
    (
      _target: unknown,
      method: string,
      params: Record<string, unknown>,
      callback: (result: unknown) => void,
    ) => {
      try {
        if (method === 'Runtime.evaluate') {
          if (String(params['expression']).includes('indexMap')) {
            callback({
              result: {
                type: 'string',
                value: JSON.stringify({
                  summary: 'Synthetic select fixture',
                  indexMap: { 1: { selector: '#choice', signature: 'select||||Category' } },
                }),
              },
            });
            return;
          }
          // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
          const value = new Function(`return ${String(params['expression'])};`)();
          callback(
            params['returnByValue'] === false
              ? { result: { type: 'object', objectId: 'original-select' } }
              : { result: { type: typeof value, value } },
          );
        } else if (method === 'Runtime.callFunctionOn') {
          // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
          const fn = new Function(`return (${String(params['functionDeclaration'])});`)();
          const receipt = fn.call(original);
          if (receipt.changed) afterApply();
          callback({ result: { type: 'object', value: receipt } });
        } else callback({});
      } catch (error) {
        callback({ exceptionDetails: { text: (error as Error).message }, result: {} });
      }
    },
  );

  beforeEach(async () => {
    original = fixture();
    afterApply = () => {};
    send.mockClear();
    vi.spyOn(sitePolicy, 'assertSiteAccess').mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      runtime: { lastError: null },
      debugger: {
        attach: (_t: unknown, _v: unknown, cb: () => void) => cb(),
        detach: (_t: unknown, cb: () => void) => cb(),
        sendCommand: send,
        onDetach: { addListener: vi.fn() },
        onEvent: { addListener: vi.fn() },
      },
    });
    await driver.getPageContent(42);
  });

  it('verifies the retained original object after events settle', async () => {
    expect(
      await driver.selectOption(42, 1, { label: 'Beta' }, undefined, 'select||||Category'),
    ).toEqual({
      selectedValue: 'b',
      selectedLabel: 'Beta',
      eventSource: 'dom',
      changed: true,
    });
    expect(send.mock.calls.filter((call) => call[1] === 'Runtime.callFunctionOn')).toHaveLength(2);
    expect(sitePolicy.assertSiteAccess).toHaveBeenCalledWith(
      location.href,
      'automation',
      expect.any(String),
    );
  });

  it('refuses a signature change before mutation', async () => {
    original.setAttribute('aria-label', 'Other');
    await expect(driver.selectOption(42, 1, { label: 'Beta' })).rejects.toThrow(
      'changed since read_dom',
    );
    expect(original.value).toBe('a');
  });

  it('detects replacement by an identical select during settlement', async () => {
    afterApply = () => {
      const replacement = original.cloneNode(true) as HTMLSelectElement;
      replacement.value = 'b';
      original.replaceWith(replacement);
    };
    await expect(driver.selectOption(42, 1, { value: 'b' })).rejects.toThrow(
      'original select target changed',
    );
  });

  it('does not run verification after Stop retires the action owner', async () => {
    let owned = true;
    driver.registerActiveTab(42, null, () => {
      if (!owned) throw new Error('Stopped');
    });
    afterApply = () => {
      owned = false;
    };
    await expect(driver.selectOption(42, 1, { value: 'b' })).rejects.toThrow('Stopped');
    expect(send.mock.calls.filter((call) => call[1] === 'Runtime.callFunctionOn')).toHaveLength(1);
  });
});
