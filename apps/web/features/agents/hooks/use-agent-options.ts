'use client';

import { useEffect, useState } from 'react';

import { agentsApi, type AgentsApi } from '../services/agents-client';

export interface AgentOption {
  id: string;
  name: string;
}

const NO_OPTIONS: readonly AgentOption[] = [];

export function useAgentOptions(api: AgentsApi = agentsApi): readonly AgentOption[] {
  const [options, setOptions] = useState<readonly AgentOption[]>(NO_OPTIONS);
  useEffect(() => {
    let cancelled = false;
    api
      .list()
      .then((agents) => {
        if (cancelled) return;
        setOptions(
          agents
            .filter((agent) => agent.status === 'active')
            .map((agent) => ({ id: agent.id, name: agent.name })),
        );
      })
      .catch(() => {
        if (!cancelled) setOptions(NO_OPTIONS);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);
  return options;
}
