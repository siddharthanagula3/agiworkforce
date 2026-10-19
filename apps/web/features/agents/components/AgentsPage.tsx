'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Skeleton, Spinner } from '@agiworkforce/ui';
import type { ManagedCloudAgent } from '@agiworkforce/cloud-contracts';

import { toUserMessage } from '@/lib/user-error-message';
import { agentsApi, type AgentsApi } from '../services/agents-client';
import { NEW_AGENT_HREF, agentCanChat, agentHref, agentStateLabel } from '../lib/agent-display';
import { AgentAvatar } from './AgentAvatar';

const IMPORT_ACCEPT = '.md,text/markdown';

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; agents: ManagedCloudAgent[] };

function AgentListRow({
  agent,
  starting,
  onChat,
}: {
  agent: ManagedCloudAgent;
  starting: boolean;
  onChat: (agent: ManagedCloudAgent) => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <AgentAvatar icon={agent.icon} accentColor={agent.accentColor} />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-foreground">{agent.name}</h3>
          {agent.description ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{agent.description}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">{agentStateLabel(agent)}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {agent.isOwner ? (
          <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
            <Link href={agentHref(agent.id)} aria-label={`Edit ${agent.name}`}>
              Edit
            </Link>
          </Button>
        ) : null}
        <Button
          size="sm"
          className="pointer-coarse:min-h-11"
          disabled={!agentCanChat(agent) || starting}
          aria-busy={starting}
          aria-label={`Chat with ${agent.name}`}
          onClick={() => onChat(agent)}
        >
          {starting ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
          Chat
        </Button>
      </div>
    </li>
  );
}

function AgentSection({
  title,
  agents,
  startingId,
  onChat,
}: {
  title: string;
  agents: readonly ManagedCloudAgent[];
  startingId: string | null;
  onChat: (agent: ManagedCloudAgent) => void;
}) {
  if (agents.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <ul className="flex flex-col gap-2">
        {agents.map((agent) => (
          <AgentListRow
            key={agent.id}
            agent={agent}
            starting={startingId === agent.id}
            onChat={onChat}
          />
        ))}
      </ul>
    </section>
  );
}

export function AgentsPage({ api = agentsApi }: { api?: AgentsApi }) {
  const router = useRouter();
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    api
      .list()
      .then((agents) => {
        if (!cancelled) setState({ status: 'ready', agents });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: toUserMessage(error, 'Your agents could not be loaded.'),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  const startChat = useCallback(
    async (agent: ManagedCloudAgent) => {
      setStartingId(agent.id);
      try {
        const conversationId = await api.startConversation(agent.id);
        router.push(`/chat/${conversationId}`);
      } catch (error) {
        toast.error(toUserMessage(error, `A chat with ${agent.name} could not be started.`));
        setStartingId(null);
      }
    },
    [api, router],
  );

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const agent = await api.importMarkdown(await file.text());
      toast.success(`Imported ${agent.name} as a draft.`);
      router.push(agentHref(agent.id));
    } catch (error) {
      toast.error(toUserMessage(error, 'That file could not be imported.'));
    } finally {
      setImporting(false);
      if (importInput.current) importInput.current.value = '';
    }
  };

  const owned = state.status === 'ready' ? state.agents.filter((agent) => agent.isOwner) : [];
  const shared = state.status === 'ready' ? state.agents.filter((agent) => !agent.isOwner) : [];

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-[28px] font-medium text-foreground">Agents</h1>
            <p className="text-sm text-muted-foreground">
              Assistants with their own instructions, model, tools and files. Chat with one, share
              it with your workspace, or give it a schedule.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <input
              ref={importInput}
              type="file"
              accept={IMPORT_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void importFile(event.target.files?.[0])}
            />
            <Button
              variant="outline"
              className="pointer-coarse:min-h-11"
              disabled={importing}
              aria-busy={importing}
              onClick={() => importInput.current?.click()}
            >
              {importing ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
              Import
            </Button>
            <Button asChild className="pointer-coarse:min-h-11">
              <Link href={NEW_AGENT_HREF}>New agent</Link>
            </Button>
          </div>
        </header>

        {state.status === 'loading' ? (
          <div role="status" aria-label="Loading agents" className="flex flex-col gap-2">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : state.status === 'error' ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
            <p role="alert" className="text-sm text-danger">
              {state.message}
            </p>
            <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </Button>
          </div>
        ) : state.agents.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-6">
            <h2 className="text-base font-medium text-foreground">No agents yet</h2>
            <p className="text-sm text-muted-foreground">
              Write the instructions once, pick its tools and files, and every chat with it starts
              from there. You can also import an agent file from Claude Code.
            </p>
            <Button asChild className="pointer-coarse:min-h-11">
              <Link href={NEW_AGENT_HREF}>Create an agent</Link>
            </Button>
          </div>
        ) : (
          <>
            <AgentSection
              title="Your agents"
              agents={owned}
              startingId={startingId}
              onChat={(agent) => void startChat(agent)}
            />
            <AgentSection
              title="Shared with you"
              agents={shared}
              startingId={startingId}
              onChat={(agent) => void startChat(agent)}
            />
          </>
        )}
      </div>
    </div>
  );
}
