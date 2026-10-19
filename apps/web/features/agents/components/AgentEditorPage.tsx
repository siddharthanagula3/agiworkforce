'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Skeleton, Spinner } from '@agiworkforce/ui';
import {
  ManagedSkillsResponseSchema,
  type AgentConfig,
  type ManagedCloudAgent,
} from '@agiworkforce/cloud-contracts';

import { CONNECTORS } from '@/features/connectors/data/connectors';
import { useConnectors } from '@/features/connectors/hooks/use-connectors';
import { getScheduleModelOptions } from '@/lib/schedules/schedule-models';
import { toUserMessage } from '@/lib/user-error-message';
import { useBillingStore } from '@/shared/stores/web-auth-store';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { agentsApi, type AgentsApi } from '../services/agents-client';
import { AGENTS_HREF, agentCanChat, agentHref, agentStateLabel } from '../lib/agent-display';
import { NEW_AGENT_DRAFT, draftFromAgent, draftProblem, draftsEqual } from '../lib/agent-draft';
import { AgentAvatar } from './AgentAvatar';
import { AgentConfigForm, type AgentChoice, type AgentChoiceList } from './AgentConfigForm';
import { AgentKnowledgePanel } from './AgentKnowledgePanel';
import { AgentActivityPanel, AgentManagePanel } from './AgentManagePanel';
import { AgentPublishPanel } from './AgentPublishPanel';

const SKILLS_PATH = '/api/skills';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; agent: ManagedCloudAgent | null };

function useConnectorChoices(): AgentChoiceList {
  const { connectedIds, customNames, toolConnectorIds, loading, error, retry } = useConnectors();
  const options = useMemo<AgentChoice[]>(
    () =>
      [...connectedIds]
        .map((id) => ({
          id: toolConnectorIds[id] ?? id,
          name: CONNECTORS.find((entry) => entry.id === id)?.name ?? customNames[id] ?? id,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [connectedIds, customNames, toolConnectorIds],
  );
  return { loading, error, retry, options };
}

function useSkillChoices(): AgentChoiceList {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    options: AgentChoice[];
  }>({ loading: true, error: null, options: [] });

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));
    void (async () => {
      try {
        const token = await getAuthToken();
        const response = await fetch(SKILLS_PATH, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`The skills list answered ${response.status}.`);
        const { skills } = ManagedSkillsResponseSchema.parse(await response.json());
        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            options: skills
              .map((skill) => ({ id: skill.name, name: skill.name }))
              .sort((left, right) => left.name.localeCompare(right.name)),
          });
        }
      } catch (reason) {
        if (!cancelled) {
          setState({
            loading: false,
            error: toUserMessage(reason, 'Your skills could not be loaded.'),
            options: [],
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { ...state, retry: () => setAttempt((value) => value + 1) };
}

export function AgentEditorPage({
  agentId,
  api = agentsApi,
}: {
  agentId: string | null;
  api?: AgentsApi;
}) {
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>(
    agentId ? { status: 'loading' } : { status: 'ready', agent: null },
  );
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<AgentConfig>(NEW_AGENT_DRAFT);
  const [saved, setSaved] = useState<AgentConfig>(NEW_AGENT_DRAFT);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const subscriptionTier = useBillingStore((state) => state.subscription?.tier ?? 'free');
  const connectors = useConnectorChoices();
  const skills = useSkillChoices();

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    api
      .get(agentId)
      .then((agent) => {
        if (cancelled) return;
        const config = draftFromAgent(agent);
        setLoad({ status: 'ready', agent });
        setDraft(config);
        setSaved(config);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setLoad({
            status: 'error',
            message: toUserMessage(reason, 'This agent could not be loaded.'),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, agentId, attempt]);

  const agent = load.status === 'ready' ? load.agent : null;
  const modelOptions = useMemo(
    () => getScheduleModelOptions(subscriptionTier, draft.model),
    [subscriptionTier, draft.model],
  );
  const dirty = !draftsEqual(draft, saved);
  const readOnly = agent !== null && (!agent.isOwner || agent.status === 'retired');

  const acceptAgent = useCallback((next: ManagedCloudAgent) => {
    const config = draftFromAgent(next);
    setLoad({ status: 'ready', agent: next });
    setDraft(config);
    setSaved(config);
  }, []);

  const acceptAgentState = useCallback((next: ManagedCloudAgent) => {
    setLoad({ status: 'ready', agent: next });
  }, []);

  const save = async () => {
    const problem = draftProblem(draft);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      if (agent) {
        acceptAgent(await api.update(agent.id, draft));
        toast.success('Draft saved.');
      } else {
        const created = await api.create(draft);
        toast.success(`Created ${created.name}.`);
        router.replace(agentHref(created.id));
      }
    } catch (reason) {
      setFormError(toUserMessage(reason, 'The agent could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const chat = async () => {
    if (!agent) return;
    setStarting(true);
    try {
      const conversationId = await api.startConversation(agent.id);
      router.push(`/chat/${conversationId}`);
    } catch (reason) {
      toast.error(toUserMessage(reason, `A chat with ${agent.name} could not be started.`));
      setStarting(false);
    }
  };

  if (load.status === 'loading') {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10 sm:px-6">
        <div role="status" aria-label="Loading agent" className="flex flex-col gap-3">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </main>
    );
  }

  if (load.status === 'error') {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10 sm:px-6">
        <p role="alert" className="text-sm text-danger">
          {load.message}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </Button>
          <Button asChild variant="ghost">
            <Link href={AGENTS_HREF}>Back to Agents</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Link
          href={AGENTS_HREF}
          className="w-fit text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
        >
          Agents
        </Link>
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <AgentAvatar icon={draft.icon} accentColor={draft.accentColor} size="lg" />
            <div className="min-w-0">
              <h1 className="truncate text-[24px] font-medium text-foreground">
                {agent ? agent.name : 'New agent'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {agent ? agentStateLabel(agent) : 'Not saved yet'}
                {dirty && !readOnly ? ' · Unsaved changes' : ''}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {agent ? (
              <Button
                variant="outline"
                className="pointer-coarse:min-h-11"
                disabled={!agentCanChat(agent) || starting || dirty}
                aria-busy={starting}
                onClick={() => void chat()}
              >
                {starting ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
                Chat
              </Button>
            ) : null}
            {!readOnly ? (
              <Button
                className="pointer-coarse:min-h-11"
                disabled={saving || (agent !== null && !dirty)}
                aria-busy={saving}
                onClick={() => void save()}
              >
                {saving ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
                {agent ? 'Save draft' : 'Create agent'}
              </Button>
            ) : null}
          </div>
        </header>
        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
        {agent && !agent.isOwner ? (
          <p className="text-sm text-muted-foreground">
            {agent.ownerName ?? 'A teammate'} built this agent. You can chat with it; only its owner
            can change it.
          </p>
        ) : null}

        <AgentConfigForm
          draft={draft}
          disabled={readOnly}
          modelOptions={modelOptions}
          connectors={connectors}
          skills={skills}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        />

        {agent ? (
          <>
            <AgentKnowledgePanel api={api} agentId={agent.id} editable={!readOnly} />
            {agent.isOwner ? (
              <AgentPublishPanel
                api={api}
                agent={agent}
                dirty={dirty}
                onAgentChange={acceptAgentState}
                onRestored={acceptAgent}
              />
            ) : null}
            <AgentActivityPanel api={api} agent={agent} />
            {agent.isOwner ? (
              <AgentManagePanel
                api={api}
                agent={agent}
                onAgentChange={acceptAgentState}
                onDeleted={() => router.push(AGENTS_HREF)}
                onTransferred={() => setAttempt((value) => value + 1)}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
