import { renderHook, waitFor } from '@testing-library/react';
import type { ManagedCloudAgent } from '@agiworkforce/cloud-contracts';
import { describe, expect, it } from 'vitest';

import type { AgentsApi } from '../services/agents-client';
import { useAgentOptions } from './use-agent-options';

function agent(patch: Partial<ManagedCloudAgent>): ManagedCloudAgent {
  return {
    id: 'agent',
    name: 'Agent',
    description: '',
    status: 'active',
    ...patch,
  } as ManagedCloudAgent;
}

describe('useAgentOptions', () => {
  it('offers active agents with the description a picker shows under the choice', async () => {
    const api = {
      list: async () => [
        agent({ id: 'a1', name: 'Release notes', description: 'Drafts notes from merged work.' }),
        agent({ id: 'a2', name: 'Retired', status: 'retired' }),
      ],
    } as unknown as AgentsApi;

    const { result } = renderHook(() => useAgentOptions(api));

    await waitFor(() =>
      expect(result.current).toEqual([
        { id: 'a1', name: 'Release notes', description: 'Drafts notes from merged work.' },
      ]),
    );
  });
});
