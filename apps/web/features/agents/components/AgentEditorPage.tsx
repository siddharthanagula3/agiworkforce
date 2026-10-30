'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Skeleton,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useUnsavedChangesGuard,
} from '@agiworkforce/ui';
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
import { AgentDeploymentsPanel } from './AgentDeploymentsPanel';
import { AgentActivityPanel, AgentManagePanel } from './AgentManagePanel';
import { AgentPublishPanel } from './AgentPublishPanel';

const SKILLS_PATH = '/api/skills';

const AGENT_TABS = [
  { value: 'agent', label: 'Agent' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'deployments', label: 'Deployments' },
] as const;

const STATUS_PILL: Record<ManagedCloudAgent['status'], { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'border-success-fill bg-success-fill text-success-on-fill',
  },
  paused: { label: 'Paused', className: 'border-border bg-muted text-foreground' },
  retired: { label: 'Retired', className: 'border-border bg-muted text-muted-foreground' },
};

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
              .map((skill) => ({
                id: skill.name,
                name: skill.title ?? skill.name,
                description: skill.description,
              }))
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
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
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
  const resetDraft = useCallback(() => setDraft(saved), [saved]);
  const { confirmDiscard, dialog: discardDialog } = useUnsavedChangesGuard({
    dirty: dirty && !readOnly,
    description:
      'Your changes to this agent have not been saved. If you leave now, they will be lost.',
    onDiscard: resetDraft,
  });

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
    if (saving || readOnly) return;
    const problem = draftProblem(draft);
    if (problem) {
      setFormError(problem);
      formRef.current?.querySelector<HTMLInputElement>('input[required]')?.focus();
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
        acceptAgent(created);
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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10 sm:px-6">
        <div role="status" aria-label="Loading agent" className="flex flex-col gap-3">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (load.status === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10 sm:px-6">
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
      </div>
    );
  }

  const stateLine = [
    agent ? (agent.status === 'active' ? agentStateLabel(agent) : null) : 'Not saved yet',
    dirty && !readOnly ? 'Unsaved changes' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const configForm = (
    <AgentConfigForm
      draft={draft}
      disabled={readOnly || saving}
      modelOptions={modelOptions}
      connectors={connectors}
      skills={skills}
      onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
    />
  );
  const saveAction = !readOnly ? (
    <Button
      type="submit"
      form={formId}
      className="pointer-coarse:min-h-11"
      disabled={saving || (agent !== null && !dirty)}
      aria-busy={saving}
      onClick={(event) => {
        if (!formRef.current) {
          event.preventDefault();
          void save();
        }
      }}
    >
      {saving ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
      {agent ? 'Save draft' : 'Create agent'}
    </Button>
  ) : null;
  const editor = (
    <form
      id={formId}
      ref={formRef}
      aria-label="Agent configuration"
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {configForm}
      {formError ? (
        <p role="alert" className="text-sm text-danger-text">
          {formError}
        </p>
      ) : null}
      <footer
        aria-label="Agent actions"
        className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {readOnly
            ? 'Read-only agent'
            : dirty
              ? 'Unsaved changes'
              : agent
                ? 'All changes saved.'
                : 'Not saved yet'}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="pointer-coarse:min-h-11"
            disabled={saving}
            onClick={() => confirmDiscard(() => router.push(AGENTS_HREF))}
          >
            {readOnly ? 'Back to Agents' : 'Cancel'}
          </Button>
          {saveAction}
        </div>
      </footer>
    </form>
  );

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        {saving ? (
          <span aria-disabled="true" className="w-fit text-sm text-muted-foreground">
            Agents
          </span>
        ) : (
          <Link
            href={AGENTS_HREF}
            className="w-fit text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
          >
            Agents
          </Link>
        )}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <AgentAvatar icon={draft.icon} accentColor={draft.accentColor} size="lg" />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-[24px] font-medium text-foreground">
                  {agent ? agent.name : 'New agent'}
                </h1>
                {agent ? (
                  <Badge variant="outline" className={STATUS_PILL[agent.status].className}>
                    {STATUS_PILL[agent.status].label}
                  </Badge>
                ) : null}
              </div>
              {agent?.description ? (
                <p className="truncate text-sm text-muted-foreground">{agent.description}</p>
              ) : null}
              {stateLine ? <p className="text-sm text-muted-foreground">{stateLine}</p> : null}
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
            {saveAction}
          </div>
        </header>
        {agent && !agent.isOwner ? (
          <p className="text-sm text-muted-foreground">
            {agent.ownerName ?? 'A teammate'} built this agent. You can chat with it; only its owner
            can change it.
          </p>
        ) : null}

        {agent ? (
          <Tabs defaultValue="agent" className="flex flex-col gap-4">
            <TabsList
              aria-label="Agent sections"
              className="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0"
            >
              {AGENT_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="rounded-none border-b-2 border-transparent px-1 py-2 text-base data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none pointer-coarse:min-h-11"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="agent" className="mt-0 flex flex-col gap-6">
              {editor}
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
              {agent.isOwner ? (
                <AgentManagePanel
                  api={api}
                  agent={agent}
                  onAgentChange={acceptAgentState}
                  onDeleted={() => router.push(AGENTS_HREF)}
                  onTransferred={() => setAttempt((value) => value + 1)}
                />
              ) : null}
            </TabsContent>
            <TabsContent value="sessions" className="mt-0">
              <AgentActivityPanel api={api} agent={agent} />
            </TabsContent>
            <TabsContent value="deployments" className="mt-0">
              <AgentDeploymentsPanel api={api} agent={agent} />
            </TabsContent>
          </Tabs>
        ) : (
          editor
        )}
      </div>
      {discardDialog}
    </div>
  );
}
