import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  NEW_AGENT_DRAFT,
  agentDraftFromAgent,
  agentDraftProblem,
  agentDraftsEqual,
  type AgentConfig,
  type ManagedCloudAgent,
} from '@agiworkforce/cloud-contracts';

import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { agentActionError, createAgent, getAgent, updateAgent } from './service';

export type AgentEditorLoad =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

export interface AgentEditor {
  load: AgentEditorLoad;
  agent: ManagedCloudAgent | null;
  draft: AgentConfig;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  problem: string | null;
  editable: boolean;
  change: (patch: Partial<AgentConfig>) => void;
  save: () => Promise<ManagedCloudAgent | null>;
  replaceAgent: (agent: ManagedCloudAgent) => void;
  reload: () => void;
}

export function useAgentEditor(agentId: string | null, enabled: boolean): AgentEditor {
  const [load, setLoad] = useState<AgentEditorLoad>(
    agentId ? { status: 'loading' } : { status: 'ready' },
  );
  const [agent, setAgent] = useState<ManagedCloudAgent | null>(null);
  const [draft, setDraft] = useState<AgentConfig>(NEW_AGENT_DRAFT);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !agentId) return;
    const account = captureCloudAccountEpoch();
    if (!account) return;
    const controller = new AbortController();
    setLoad({ status: 'loading' });
    getAgent(agentId, controller.signal)
      .then((loaded) => {
        if (!isCloudAccountEpochCurrent(account)) return;
        setAgent(loaded);
        setDraft(agentDraftFromAgent(loaded));
        setLoad({ status: 'ready' });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !isCloudAccountEpochCurrent(account)) return;
        setLoad({
          status: 'error',
          message: agentActionError(error, 'Could not load this agent.'),
        });
      });
    return () => controller.abort();
  }, [agentId, attempt, enabled]);

  const baseline = useMemo(() => (agent ? agentDraftFromAgent(agent) : NEW_AGENT_DRAFT), [agent]);
  const dirty = !agentDraftsEqual(draft, baseline);
  const editable = agent === null || agent.isOwner;
  const problem = agentDraftProblem(draft);

  const change = useCallback((patch: Partial<AgentConfig>) => {
    setSaveError(null);
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const replaceAgent = useCallback((next: ManagedCloudAgent) => {
    setAgent(next);
    setDraft(agentDraftFromAgent(next));
  }, []);

  const save = useCallback(async () => {
    if (saving || problem || !editable) return null;
    const account = captureCloudAccountEpoch();
    if (!account) return null;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = agent ? await updateAgent(agent.id, draft) : await createAgent(draft);
      if (!isCloudAccountEpochCurrent(account)) return null;
      replaceAgent(saved);
      return saved;
    } catch (error) {
      if (isCloudAccountEpochCurrent(account)) {
        setSaveError(agentActionError(error, 'Could not save this agent. Try again.'));
      }
      return null;
    } finally {
      if (isCloudAccountEpochCurrent(account)) setSaving(false);
    }
  }, [agent, draft, editable, problem, replaceAgent, saving]);

  return {
    load,
    agent,
    draft,
    dirty,
    saving,
    saveError,
    problem,
    editable,
    change,
    save,
    replaceAgent,
    reload: () => setAttempt((value) => value + 1),
  };
}
