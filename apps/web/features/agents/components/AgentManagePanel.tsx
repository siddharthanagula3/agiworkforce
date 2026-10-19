'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, Label, Spinner, useConfirmAction } from '@agiworkforce/ui';
import type {
  AgentActivityResponse,
  AgentShareMember,
  AgentUsageResponse,
  ManagedCloudAgent,
} from '@agiworkforce/cloud-contracts';

import { toUserMessage } from '@/lib/user-error-message';
import type { AgentsApi } from '../services/agents-client';
import { agentSlug } from '@/lib/agents/agent-slug';

const SECTION = 'flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5';

function formatDate(value: string | null): string {
  if (!value) return 'Not yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function AgentActivityPanel({ api, agent }: { api: AgentsApi; agent: ManagedCloudAgent }) {
  const id = useId();
  const [usage, setUsage] = useState<AgentUsageResponse | null>(null);
  const [activity, setActivity] = useState<AgentActivityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      agent.isOwner ? api.usage(agent.id) : Promise.resolve(null),
      api.activity(agent.id),
    ])
      .then(([nextUsage, nextActivity]) => {
        if (cancelled) return;
        setUsage(nextUsage);
        setActivity(nextActivity);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(toUserMessage(reason, 'Activity could not be loaded.'));
      });
    return () => {
      cancelled = true;
    };
  }, [api, agent.id, agent.isOwner]);

  return (
    <section aria-labelledby={`${id}-activity`} className={SECTION}>
      <h2 id={`${id}-activity`} className="text-sm font-medium text-foreground">
        Activity
      </h2>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : activity === null ? (
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Loading activity…</span>
        </div>
      ) : (
        <>
          {usage ? (
            <dl className="grid grid-cols-3 gap-3">
              {[
                ['Chats', usage.conversations],
                ['People', usage.people],
                ['Messages', usage.turns],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-lg font-medium text-foreground">
                    {Number(value).toLocaleString()}
                  </dd>
                </div>
              ))}
              <p className="col-span-3 text-xs text-muted-foreground">
                Everyone&rsquo;s use in the last {usage.windowDays} days. You see counts only, never
                other people&rsquo;s chats.
              </p>
            </dl>
          ) : null}
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">Your chats with it</h3>
            {activity.conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {activity.conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <Link
                      href={`/chat/${conversation.id}`}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
                    >
                      <span className="truncate">{conversation.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(conversation.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">Routines it runs</h3>
            {activity.routines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No routines yet. Create one from{' '}
                <Link
                  href="/chat/schedules"
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Schedules
                </Link>{' '}
                and pick this agent.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {activity.routines.map((routine) => (
                  <li key={routine.id}>
                    <Link
                      href={`/chat/schedules?schedule=${encodeURIComponent(routine.id)}`}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
                    >
                      <span className="truncate">{routine.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Last run {formatDate(routine.lastExecutedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function AgentManagePanel({
  api,
  agent,
  onAgentChange,
  onDeleted,
  onTransferred,
}: {
  api: AgentsApi;
  agent: ManagedCloudAgent;
  onAgentChange: (agent: ManagedCloudAgent) => void;
  onDeleted: () => void;
  onTransferred: () => void;
}) {
  const id = useId();
  const { confirm, dialog } = useConfirmAction();
  const [busy, setBusy] = useState<string | null>(null);
  const [members, setMembers] = useState<AgentShareMember[]>([]);
  const [newOwner, setNewOwner] = useState('');

  useEffect(() => {
    if (!agent.organizationId) return;
    let cancelled = false;
    api
      .share(agent.id)
      .then((share) => {
        if (!cancelled) setMembers(share.members);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, agent.id, agent.organizationId]);

  const run = async (key: string, work: () => Promise<void>, failure: string) => {
    setBusy(key);
    try {
      await work();
    } catch (reason) {
      toast.error(toUserMessage(reason, failure));
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (status: ManagedCloudAgent['status'], failure: string) =>
    run(status, async () => onAgentChange(await api.setStatus(agent.id, status)), failure);

  const retire = () =>
    confirm({
      title: `Retire ${agent.name}?`,
      description:
        'Nobody can start a chat with it or run its routines, and it disappears from the people you shared it with. Its chats, versions and files stay, and you can bring it back from here at any time.',
      confirmLabel: 'Retire agent',
      destructive: true,
      onConfirm: () => setStatus('retired', 'The agent could not be retired.'),
    });

  const transfer = () => {
    const target = members.find((member) => member.userId === newOwner);
    if (!target) return;
    confirm({
      title: `Make ${target.name} the owner?`,
      description: `${target.name} becomes the only person who can edit, publish, share or delete ${agent.name}. You lose those controls and keep only the access its sharing gives you. Only ${target.name} can hand it back.`,
      confirmLabel: 'Transfer ownership',
      destructive: true,
      onConfirm: () =>
        run(
          'transfer',
          async () => {
            await api.transfer(agent.id, target.userId);
            toast.success(`${target.name} now owns ${agent.name}.`);
            onTransferred();
          },
          'Ownership could not be transferred.',
        ),
    });
  };

  const remove = () =>
    confirm({
      title: `Delete ${agent.name}?`,
      description:
        'The agent, its versions, its files and its sharing are deleted for everyone and cannot be recovered. Chats with it stay in each person’s history but stop running as the agent, and its routines stop. Retire it instead if you might want it back.',
      confirmLabel: 'Delete agent',
      destructive: true,
      onConfirm: () =>
        run(
          'delete',
          async () => {
            await api.remove(agent.id);
            toast.success(`Deleted ${agent.name}.`);
            onDeleted();
          },
          'The agent could not be deleted.',
        ),
    });

  const exportFile = () =>
    run(
      'export',
      async () => downloadText(await api.exportMarkdown(agent.id), `${agentSlug(agent.name)}.md`),
      'The agent could not be exported.',
    );

  return (
    <section aria-labelledby={`${id}-manage`} className={SECTION}>
      {dialog}
      <h2 id={`${id}-manage`} className="text-sm font-medium text-foreground">
        Manage
      </h2>
      <div className="flex flex-wrap gap-2">
        {agent.status === 'active' ? (
          <Button
            variant="outline"
            className="pointer-coarse:min-h-11"
            disabled={busy !== null}
            onClick={() => void setStatus('paused', 'The agent could not be paused.')}
          >
            Pause
          </Button>
        ) : (
          <Button
            variant="outline"
            className="pointer-coarse:min-h-11"
            disabled={busy !== null}
            onClick={() => void setStatus('active', 'The agent could not be resumed.')}
          >
            {agent.status === 'paused' ? 'Resume' : 'Bring back'}
          </Button>
        )}
        {agent.status !== 'retired' ? (
          <Button
            variant="outline"
            className="pointer-coarse:min-h-11"
            disabled={busy !== null}
            onClick={retire}
          >
            Retire
          </Button>
        ) : null}
        <Button
          variant="outline"
          className="pointer-coarse:min-h-11"
          disabled={busy !== null}
          aria-busy={busy === 'export'}
          onClick={() => void exportFile()}
        >
          Export as Claude Code agent
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Paused agents take no new chats or routine runs until you resume them. Export writes a
        Markdown agent file that Claude Code and this product can import.
      </p>
      {agent.organizationId && members.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor={`${id}-owner`}>Transfer ownership</Label>
            <select
              id={`${id}-owner`}
              value={newOwner}
              onChange={(event) => setNewOwner(event.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground pointer-coarse:min-h-11"
            >
              <option value="">Choose a workspace member</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            className="pointer-coarse:min-h-11"
            disabled={!newOwner || busy !== null}
            onClick={transfer}
          >
            Transfer
          </Button>
        </div>
      ) : null}
      <div>
        <Button
          variant="destructive"
          className="pointer-coarse:min-h-11"
          disabled={busy !== null}
          onClick={remove}
        >
          {busy === 'delete' ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
          Delete agent
        </Button>
      </div>
    </section>
  );
}
