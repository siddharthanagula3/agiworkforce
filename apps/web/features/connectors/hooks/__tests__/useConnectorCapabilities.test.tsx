import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  invalidateConnectorCapabilityCatalog,
  useConnectorCapabilities,
} from '../use-connector-capabilities';

function catalog(label: string) {
  return {
    connectorId: 'shared-ref',
    connectorLabel: label,
    source: 'oauth' as const,
    generatedAt: Date.now(),
    protocolEra: 'modern' as const,
    capabilityKeys: [],
    tasksSupported: false,
    tools: [],
    resources: [],
    resourceTemplates: [],
    prompts: [],
    apps: [],
    discoveryErrors: [],
  };
}

describe('connector capability cache isolation', () => {
  beforeEach(() => {
    invalidateConnectorCapabilityCatalog();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not let a response from the previous account refill the cleared cache', async () => {
    let releaseFirst!: (value: unknown) => void;
    const firstBody = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => firstBody })
      .mockResolvedValueOnce({ ok: true, json: async () => catalog('Second account') });
    vi.stubGlobal('fetch', fetchMock);

    const first = renderHook(() => useConnectorCapabilities('shared-ref'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => invalidateConnectorCapabilityCatalog());
    await act(async () => {
      releaseFirst(catalog('First account'));
      await Promise.resolve();
    });
    first.unmount();

    const second = renderHook(() => useConnectorCapabilities('shared-ref'));
    await waitFor(() =>
      expect(second.result.current.catalog?.connectorLabel).toBe('Second account'),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
