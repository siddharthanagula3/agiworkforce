// @vitest-environment jsdom
import type { ComponentType } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react/pure';
import {
  MANAGED_MEMORY_MAX_CONTENT_CHARS,
  MANAGED_MEMORY_MAX_PAGE_SIZE,
  MANAGED_MEMORY_SOURCES,
  readManagedMemoryCreateRequest,
  type ManagedMemoryCreateRequest,
} from '@agiworkforce/types';
import { MemoryEditor, useMemoryStore } from '@agiworkforce/unified-chat';
import { hasUnsavedChanges } from '@agiworkforce/ui';
import * as FeatureScenes from './FeatureScenes';

const transport = vi.hoisted(() => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const state: {
    allow: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | undefined;
    unexpected: string[];
    restore: () => void;
  } = {
    allow: undefined,
    unexpected: [],
    restore: () => {
      if (descriptor) Object.defineProperty(globalThis, 'fetch', descriptor);
      else Reflect.deleteProperty(globalThis, 'fetch');
      expect(Object.getOwnPropertyDescriptor(globalThis, 'fetch')).toEqual(descriptor);
    },
  };
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: (input: RequestInfo | URL, init?: RequestInit) => {
      if (state.allow) return state.allow(input, init);
      state.unexpected.push(`${init?.method ?? 'GET'} ${String(input)}`);
      return Promise.reject(new Error('Unexpected fetch outside the native Memory observation.'));
    },
  });
  return state;
});

afterAll(() => {
  try {
    expect(transport.unexpected).toEqual([]);
  } finally {
    transport.restore();
  }
});

const sceneExports = FeatureScenes as unknown as Record<string, unknown>;

function actualDraft(): unknown {
  if (!Object.prototype.hasOwnProperty.call(sceneExports, 'MEMORY_DRAFT_REQUEST')) {
    throw new Error(
      'FeatureScenes must export MEMORY_DRAFT_REQUEST for its authored Memory illustration.',
    );
  }
  return sceneExports['MEMORY_DRAFT_REQUEST'];
}

function actualWindow(): ComponentType {
  const component = sceneExports['MemoryWindow'];
  if (typeof component !== 'function') throw new Error('FeatureScenes must export MemoryWindow.');
  return component as ComponentType;
}

function one<T>(values: T[], name: string): T {
  if (values.length !== 1) throw new Error(`Expected one ${name}.`);
  return values[0]!;
}

function readDraft(payload: unknown): ManagedMemoryCreateRequest {
  const read = readManagedMemoryCreateRequest(payload);
  if (!read.ok) throw new Error(`Invalid create request: ${read.field}.`);
  const raw = payload as Record<string, unknown>;
  const keys = Reflect.ownKeys(raw);
  if (keys.length !== 2 || !keys.includes('content') || !keys.includes('source')) {
    throw new Error('The draft must contain only content and source.');
  }
  if (
    read.request.source === undefined ||
    read.request.source !== raw['source'] ||
    read.request.content !== raw['content']
  ) {
    throw new Error('The canonical reader must retain the draft content and source.');
  }
  return read.request;
}

interface NativeObservation {
  limit: number;
  fieldLabel: string;
  actionLabel: string;
  body: ManagedMemoryCreateRequest;
}

function requireCorrespondence(payload: unknown, visible: string, native: NativeObservation) {
  const request = readDraft(payload);
  if (request.content !== request.content.trim())
    throw new Error('The draft must already be trimmed.');
  if (request.content.length > native.limit)
    throw new Error('The draft must fit the native editor.');
  if (visible !== request.content)
    throw new Error('The visible draft must equal its request content.');
  if (request.source !== native.body.source)
    throw new Error('The draft must use the native Web source.');
  const body = new Map(Object.entries(native.body));
  if (
    Reflect.ownKeys(request).length !== Reflect.ownKeys(native.body).length ||
    Object.entries(request).some(([key, value]) => body.get(key) !== value)
  ) {
    throw new Error('The entire draft request must equal the native Web POST body.');
  }
  return request;
}

function requireSceneText(
  scene: HTMLElement,
  request: ManagedMemoryCreateRequest,
  native: NativeObservation,
) {
  const expected = [
    'Memory',
    'Authored example',
    'Current draft',
    native.fieldLabel,
    request.content,
    native.actionLabel,
  ];
  if (scene.textContent?.replace(/\s/g, '') !== expected.join('').replace(/\s/g, '')) {
    throw new Error('The illustration must show only the authored current draft.');
  }
}

function requireWindowBody(
  body: HTMLElement,
  request: ManagedMemoryCreateRequest,
  native: NativeObservation,
) {
  if (!body.matches('.agi-dev-body.agi-sc[aria-hidden="true"]')) {
    throw new Error('The draft must use the actual AppWindow illustration body.');
  }
  if (body.querySelector('a, button, input, textarea, select, form, [tabindex]')) {
    throw new Error('The AppWindow illustration body must contain no live controls.');
  }
  requireSceneText(body, request, native);
}

describe('MemoryWindow authored draft', () => {
  let native: NativeObservation;

  beforeAll(async () => {
    const draft = readDraft(actualDraft());
    actualWindow();
    const storage = Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index)!;
      return [key, localStorage.getItem(key)!] as const;
    });
    const actDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    const posts: { body: unknown; csrf: string | null; contentType: string | null }[] = [];
    const unexpected: string[] = [];
    const inFlight = new Set<Promise<Response>>();
    const csrf = 'memory-correspondence-test-boundary';
    const refusal = 'The test transport refuses this write.';
    let csrfCalls = 0;
    let listCalls = 0;
    const boundary = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      const response = Promise.resolve().then(() => {
        if (url === '/api/csrf' && method === 'GET' && init?.body === undefined) {
          csrfCalls += 1;
          return Response.json({ token: csrf, expiresIn: 0 });
        }
        if (
          url === `/api/memory?limit=${MANAGED_MEMORY_MAX_PAGE_SIZE}&offset=0` &&
          method === 'GET' &&
          init?.body === undefined
        ) {
          listCalls += 1;
          return Response.json({ memories: [], hasMore: false });
        }
        if (url === '/api/memory' && method === 'POST' && typeof init?.body === 'string') {
          const headers = new Headers(init.headers);
          posts.push({
            body: JSON.parse(init.body),
            csrf: headers.get('x-csrf-token'),
            contentType: headers.get('content-type'),
          });
          return Response.json({ error: { message: refusal } }, { status: 403 });
        }
        unexpected.push(`${method} ${url}`);
        throw new Error('Unexpected external request in the native Memory test.');
      });
      inFlight.add(response);
      void response.then(
        () => inFlight.delete(response),
        () => inFlight.delete(response),
      );
      return response;
    };
    const host = document.createElement('div');
    let view: Pick<ReturnType<typeof render>, 'unmount'> | undefined;
    let restoreStore: (() => void) | undefined;
    const priorDirty = hasUnsavedChanges();
    try {
      expect(priorDirty).toBe(false);
      transport.allow = boundary;
      await waitFor(() => expect(useMemoryStore.persist.hasHydrated()).toBe(true));
      const priorState = useMemoryStore.getState();
      restoreStore = () => {
        useMemoryStore.setState(priorState, true);
        expect(useMemoryStore.getState()).toBe(priorState);
      };
      useMemoryStore.setState({ facts: [], syncStatus: 'idle' });
      document.body.append(host);
      view = render(<MemoryEditor title={null} description="" hideClearAll />, { container: host });
      await waitFor(() => expect(useMemoryStore.getState().syncStatus).toBe('synced'));
      expect(listCalls).toBe(1);
      const form = one(Array.from(host.querySelectorAll('form')), 'native Add form');
      const input = one(Array.from(form.querySelectorAll('textarea')), 'native Add field');
      const add = one(
        Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="submit"]')),
        'native Add action',
      );
      const fieldLabel = one(
        Array.from(form.querySelectorAll('label')),
        'native field label',
      ).textContent!.trim();
      const actionLabel = add.textContent!.trim();
      expect(input.getAttribute('aria-label')).toBe(fieldLabel);
      const count = form.lastElementChild?.textContent?.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
      if (!count) throw new Error('Native Add counter changed; observe its current owner.');
      const limit = Number(count[2]);
      expect(Number(count[1])).toBe(0);
      expect(limit).toBeGreaterThan(0);
      expect(limit).toBeLessThan(MANAGED_MEMORY_MAX_CONTENT_CHARS);
      expect(add.disabled).toBe(true);
      fireEvent.change(input, { target: { value: 'x'.repeat(limit + 1) } });
      expect(input.value).toHaveLength(limit);
      expect(form.lastElementChild?.textContent?.trim()).toBe(`${limit} / ${limit}`);
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.submit(form);
      expect(add.disabled).toBe(true);
      expect(posts).toHaveLength(0);
      expect(useMemoryStore.getState().facts).toHaveLength(0);
      expect(hasUnsavedChanges()).toBe(false);
      fireEvent.change(input, { target: { value: ` ${draft.content} ` } });
      expect(draft.content.length + 2).toBeLessThanOrEqual(limit);
      expect(form.lastElementChild?.textContent?.trim()).toBe(
        `${draft.content.length + 2} / ${limit}`,
      );
      fireEvent.submit(form);
      expect(useMemoryStore.getState().facts).toHaveLength(1);
      expect(useMemoryStore.getState().facts[0]).toMatchObject({
        text: draft.content.trim(),
        pending: true,
      });
      expect(input.value).toBe('');
      expect(add.disabled).toBe(true);
      await waitFor(() => {
        expect(posts).toHaveLength(1);
        expect(host.querySelector('[role="alert"]')?.textContent).toBe(refusal);
        expect(add.disabled).toBe(false);
        expect(useMemoryStore.getState().facts).toHaveLength(0);
      });
      expect(csrfCalls).toBe(1);
      expect(posts[0]!.csrf).toBe(csrf);
      expect(posts[0]!.contentType).toBe('application/json');
      expect(input.value).toBe(draft.content.trim());
      expect(hasUnsavedChanges()).toBe(true);
      native = { limit, fieldLabel, actionLabel, body: readDraft(posts[0]!.body) };
    } finally {
      try {
        try {
          await act(async () => {
            await Promise.allSettled([...inFlight]);
            view?.unmount();
          });
        } finally {
          try {
            cleanup();
          } finally {
            host.remove();
          }
        }
        expect(unexpected).toEqual([]);
        expect(hasUnsavedChanges()).toBe(priorDirty);
      } finally {
        try {
          restoreStore?.();
        } finally {
          try {
            localStorage.clear();
            for (const [key, value] of storage) localStorage.setItem(key, value);
            expect(
              Array.from({ length: localStorage.length }, (_, index) => {
                const key = localStorage.key(index)!;
                return [key, localStorage.getItem(key)!] as const;
              }),
            ).toEqual(storage);
          } finally {
            transport.allow = undefined;
            if (actDescriptor)
              Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', actDescriptor);
            else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
            expect(Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT')).toEqual(
              actDescriptor,
            );
          }
        }
      }
    }
  });

  it('renders the actual current draft with native labels and no saved receipt or live controls', () => {
    const MemoryWindow = actualWindow();
    const view = render(<MemoryWindow />);
    const scene = one(
      Array.from(
        view.container.querySelectorAll<HTMLElement>('[data-memory-illustration="draft"]'),
      ),
      'authored illustration',
    );
    const text = (selector: string) =>
      one(Array.from(scene.querySelectorAll(selector)), selector).textContent!.trim();
    const content = one(
      Array.from(scene.querySelectorAll('[data-memory-draft-content]')),
      'visible authored draft',
    ).textContent!;
    const request = requireCorrespondence(actualDraft(), content, native);
    expect(request).toEqual(native.body);
    expect(text('[data-memory-native-label="field"]')).toBe(native.fieldLabel);
    expect(text('[data-memory-native-label="action"]')).toBe(native.actionLabel);
    expect(text('[data-memory-example-label]')).toBe('Authored example');
    expect(text('[data-memory-draft-caption]')).toBe('Current draft');
    expect(scene.closest('figure')?.getAttribute('aria-label')).toMatch(/authored example/i);
    expect(scene.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(scene.querySelector('a, button, input, textarea, select, form, [tabindex]')).toBeNull();
    requireSceneText(scene, request, native);
    const frame = one(
      Array.from(view.container.querySelectorAll<HTMLElement>('figure')),
      'actual authored Memory frame',
    );
    expect(scene.closest('figure')).toBe(frame);
    const body = one(
      Array.from(frame.querySelectorAll<HTMLElement>('.agi-dev-body.agi-sc[aria-hidden="true"]')),
      'actual AppWindow illustration body',
    );
    expect(scene.parentElement).toBe(body);
    requireWindowBody(body, request, native);
    const changed = scene.cloneNode(true) as HTMLElement;
    const receipt = document.createElement('span');
    receipt.textContent = 'On · saved to your account';
    changed.append(receipt);
    expect(() => requireSceneText(changed, request, native)).toThrowError(
      'The illustration must show only the authored current draft.',
    );
    const siblingReceiptBody = body.cloneNode(true) as HTMLElement;
    const siblingReceiptScene = one(
      Array.from(
        siblingReceiptBody.querySelectorAll<HTMLElement>('[data-memory-illustration="draft"]'),
      ),
      'draft beneath the sibling receipt control',
    );
    const siblingReceipt = document.createElement('span');
    siblingReceipt.textContent = 'On · saved to your account';
    siblingReceiptBody.append(siblingReceipt);
    expect(() => requireSceneText(siblingReceiptScene, request, native)).not.toThrow();
    expect(
      siblingReceiptScene.querySelector('a, button, input, textarea, select, form, [tabindex]'),
    ).toBeNull();
    expect(() => requireWindowBody(siblingReceiptBody, request, native)).toThrowError(
      'The illustration must show only the authored current draft.',
    );
    const siblingControlBody = body.cloneNode(true) as HTMLElement;
    const siblingControlScene = one(
      Array.from(
        siblingControlBody.querySelectorAll<HTMLElement>('[data-memory-illustration="draft"]'),
      ),
      'draft beneath the sibling interactive control',
    );
    siblingControlBody.append(document.createElement('button'));
    expect(() => requireSceneText(siblingControlScene, request, native)).not.toThrow();
    expect(
      siblingControlScene.querySelector('a, button, input, textarea, select, form, [tabindex]'),
    ).toBeNull();
    expect(() => requireWindowBody(siblingControlBody, request, native)).toThrowError(
      'The AppWindow illustration body must contain no live controls.',
    );
  });

  it.each([
    ['null body', null, 'body'],
    ['array body', [], 'body'],
    ['missing content', {}, 'content'],
    ['non-string content', { content: 42 }, 'content'],
    ['empty content', { content: '' }, 'content'],
    ['whitespace content', { content: '   ' }, 'content'],
  ])('rejects malformed wire input: %s', (_name, payload, field) => {
    expect(readManagedMemoryCreateRequest(payload)).toMatchObject({ ok: false, field });
    expect(() => requireCorrespondence(payload, '', native)).toThrowError(
      `Invalid create request: ${field}.`,
    );
  });

  it('rejects the wire content limit independently of the native editor limit', () => {
    const payload = {
      ...readDraft(actualDraft()),
      content: 'x'.repeat(MANAGED_MEMORY_MAX_CONTENT_CHARS + 1),
    };
    expect(readManagedMemoryCreateRequest(payload)).toMatchObject({ ok: false, field: 'content' });
    expect(() => requireCorrespondence(payload, payload.content, native)).toThrowError(
      'Invalid create request: content.',
    );
  });

  it('rejects a source that the canonical reader silently projects away', () => {
    const payload = { ...readDraft(actualDraft()), source: 'not-a-memory-source' };
    const read = readManagedMemoryCreateRequest(payload);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error('The source-projection premise changed.');
    expect(read.request).not.toHaveProperty('source');
    expect(() => requireCorrespondence(payload, payload.content, native)).toThrowError(
      'The canonical reader must retain the draft content and source.',
    );
  });

  it.each(['id', 'createdAt', 'updatedAt', 'sourceConversationId', 'serverId', 'pending'])(
    'rejects added saved-record field: %s',
    (field) => {
      const payload = { ...readDraft(actualDraft()), [field]: 'invented-saved-provenance' };
      expect(readManagedMemoryCreateRequest(payload).ok).toBe(true);
      expect(() => requireCorrespondence(payload, payload.content, native)).toThrowError(
        'The draft must contain only content and source.',
      );
    },
  );

  it('rejects untrimmed content even though the canonical reader retains it', () => {
    const payload = {
      ...readDraft(actualDraft()),
      content: ` ${readDraft(actualDraft()).content} `,
    };
    expect(readDraft(payload).content).toBe(payload.content);
    expect(() => requireCorrespondence(payload, payload.content, native)).toThrowError(
      'The draft must already be trimmed.',
    );
  });

  it('rejects wire-valid content that the actual native editor would clamp', () => {
    const payload = { ...readDraft(actualDraft()), content: 'x'.repeat(native.limit + 1) };
    expect(readDraft(payload).content).toBe(payload.content);
    expect(() => requireCorrespondence(payload, payload.content, native)).toThrowError(
      'The draft must fit the native editor.',
    );
  });

  it('rejects different visible content before checking the Web POST', () => {
    const payload = readDraft(actualDraft());
    expect(() =>
      requireCorrespondence(payload, `${payload.content} Different draft.`, native),
    ).toThrowError('The visible draft must equal its request content.');
  });

  it('rejects a retained canonical source that belongs to another surface', () => {
    const source = MANAGED_MEMORY_SOURCES.find((value) => value !== native.body.source);
    if (source === undefined)
      throw new Error('An independent other-surface fixture is unavailable.');
    const payload = { ...readDraft(actualDraft()), source };
    expect(readDraft(payload).source).toBe(source);
    expect(() => requireCorrespondence(payload, payload.content, native)).toThrowError(
      'The draft must use the native Web source.',
    );
  });

  it('rejects an extra canonical field in the Web body rather than comparing only content and source', () => {
    const payload = readDraft(actualDraft());
    const body = { ...native.body, pinned: true };
    expect(readManagedMemoryCreateRequest(body).ok).toBe(true);
    expect(() => requireCorrespondence(payload, payload.content, { ...native, body })).toThrowError(
      'The entire draft request must equal the native Web POST body.',
    );
  });
});
