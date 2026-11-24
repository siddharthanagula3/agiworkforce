import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyTypedField } from '../src/features/computer-use/cdpDriver';
import { createCdpInspectionFixture } from './fixtures/cdp-inspection';

const inspection = createCdpInspectionFixture(document.location.href);

const send = vi.fn(
  (
    target: { tabId: number },
    method: string,
    params: { expression?: string },
    callback: (result: unknown) => void,
  ) => {
    if (inspection.reply(target, method, params, callback)) return;
    if (method !== 'Runtime.evaluate') {
      callback({});
      return;
    }
    try {
      // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
      const value = new Function(`return ${params.expression};`)();
      callback({ result: { type: typeof value, value } });
    } catch (error) {
      callback({ result: {}, exceptionDetails: { text: (error as Error).message } });
    }
  },
);

beforeEach(() => {
  inspection.reset();
  document.body.replaceChildren();
  send.mockClear();
  vi.stubGlobal('chrome', {
    runtime: { lastError: null },
    debugger: {
      attach: (_t: unknown, _v: unknown, callback: () => void) => callback(),
      detach: (_t: unknown, callback: () => void) => callback(),
      sendCommand: send,
      onDetach: { addListener: vi.fn() },
      onEvent: inspection.onEvent,
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function adopted(tag: 'input' | 'textarea' | 'select') {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const field = frame.contentDocument!.createElement(tag);
  field.id = 'field';
  document.body.append(field);
  return field;
}

describe('production native field readback across DOM realms', () => {
  it.each(['input', 'textarea', 'select'] as const)(
    'verifies an adopted %s through its native getter',
    async (tag) => {
      const field = adopted(tag);
      if (field.localName === 'select')
        field.innerHTML = '<option value="alpha">Alpha</option><option value="beta">Beta</option>';
      field.value = tag === 'select' ? 'beta' : 'Adopted proof';
      expect(
        field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement ||
          field instanceof HTMLSelectElement,
      ).toBe(false);
      expect(await verifyTypedField(42, '#field', field.value, true)).toBe(true);
    },
  );

  it.each(['input', 'textarea'] as const)(
    'reads actual readonly %s state without reporting attempted text as accepted',
    async (tag) => {
      const field = adopted(tag) as HTMLInputElement | HTMLTextAreaElement;
      field.readOnly = true;
      field.value = 'Existing value';
      expect(await verifyTypedField(42, '#field', 'Existing value', true)).toBe(true);
      expect(await verifyTypedField(42, '#field', 'Attempted replacement', true)).toBe(false);
    },
  );

  it.each(['password', 'hidden'] as const)(
    'masks an adopted %s before accessing any value getter',
    async (type) => {
      const field = adopted('input') as HTMLInputElement;
      field.type = type;
      field.value = 'private synthetic value';
      const valueGetter = vi.spyOn(HTMLInputElement.prototype, 'value', 'get');
      expect(await verifyTypedField(42, '#field', 'private synthetic value', true)).toBeNull();
      expect(valueGetter).not.toHaveBeenCalled();
    },
  );

  it('fails closed when the native input type cannot be verified', async () => {
    const field = adopted('input') as HTMLInputElement;
    field.type = 'password';
    const valueGetter = vi.spyOn(HTMLInputElement.prototype, 'value', 'get');
    vi.spyOn(HTMLInputElement.prototype, 'type', 'get').mockImplementation(() => {
      throw new Error('Type unavailable');
    });
    expect(await verifyTypedField(42, '#field', 'anything', true)).toBeNull();
    expect(valueGetter).not.toHaveBeenCalled();
  });

  it('uses native type and value state rather than element-level overrides', async () => {
    const field = adopted('input') as HTMLInputElement;
    field.type = 'password';
    Object.defineProperty(field, 'type', { value: 'text' });
    Object.defineProperty(field, 'value', {
      get: () => {
        throw new Error('Must not read overridden value');
      },
    });
    expect(await verifyTypedField(42, '#field', 'private synthetic value', true)).toBeNull();
  });
});
