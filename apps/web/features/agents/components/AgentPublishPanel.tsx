'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { Button, Checkbox, Input, Label, Spinner, useConfirmAction } from '@agiworkforce/ui';
import {
  AGENT_VERSION_NOTE_MAX_CHARS,
  type AgentShareResponse,
  type AgentVersion,
  type AgentVisibility,
  type ManagedCloudAgent,
} from '@agiworkforce/cloud-contracts';

import { toUserMessage } from '@/lib/user-error-message';
import type { AgentsApi } from '../services/agents-client';

const SECTION = 'flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5';

const VISIBILITY_OPTIONS: ReadonlyArray<{ value: AgentVisibility; label: string; help: string }> = [
  { value: 'private', label: 'Only you', help: 'Nobody else can see or use it.' },
  {
    value: 'people',
    label: 'Specific people',
    help: 'Members of this workspace you pick can chat with the published version.',
  },
  {
    value: 'workspace',
    label: 'Everyone in the workspace',
    help: 'Every member can find it under Agents and chat with the published version.',
  },
];

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function AgentPublishPanel({
  api,
  agent,
  dirty,
  onAgentChange,
  onRestored,
}: {
  api: AgentsApi;
  agent: ManagedCloudAgent;
  dirty: boolean;
  onAgentChange: (agent: ManagedCloudAgent) => void;
  onRestored: (agent: ManagedCloudAgent) => void;
}) {
  const id = useId();
  const { confirm, dialog } = useConfirmAction();
  const [note, setNote] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [versions, setVersions] = useState<AgentVersion[] | null>(null);
  const [share, setShare] = useState<AgentShareResponse | null>(null);
  const [visibility, setVisibility] = useState<AgentVisibility>(agent.visibility);
  const [people, setPeople] = useState<Set<string>>(new Set());
  const [savingShare, setSavingShare] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const editable = agent.status !== 'retired';

  const load = useCallback(() => {
    setLoadError(null);
    Promise.all([api.versions(agent.id), api.share(agent.id)])
      .then(([nextVersions, nextShare]) => {
        setVersions(nextVersions);
        setShare(nextShare);
        setVisibility(nextShare.visibility);
        setPeople(
          new Set(
            nextShare.members.filter((member) => member.hasAccess).map((member) => member.userId),
          ),
        );
      })
      .catch((reason: unknown) =>
        setLoadError(toUserMessage(reason, 'Publishing and sharing could not be loaded.')),
      );
  }, [api, agent.id]);

  useEffect(load, [load]);

  const publish = async () => {
    setPublishing(true);
    try {
      const next = await api.publish(agent.id, note.trim() || undefined);
      onAgentChange(next);
      setNote('');
      setVersions(await api.versions(agent.id));
      toast.success(`Published version ${next.publishedVersion ?? ''}.`);
    } catch (reason) {
      toast.error(toUserMessage(reason, 'The agent could not be published.'));
    } finally {
      setPublishing(false);
    }
  };

  const restore = (version: AgentVersion) =>
    confirm({
      title: `Restore version ${version.version}?`,
      description:
        'Your working copy is replaced with this version, including its instructions, tools and limits. Edits you have not published are lost. People you share with keep using the published version until you publish again.',
      confirmLabel: 'Restore version',
      destructive: true,
      onConfirm: async () => {
        try {
          onRestored(await api.restore(agent.id, version.version));
          toast.success(`Restored version ${version.version} into your draft.`);
        } catch (reason) {
          toast.error(toUserMessage(reason, 'That version could not be restored.'));
        }
      },
    });

  const saveShare = async () => {
    setSavingShare(true);
    try {
      const next = await api.updateShare(agent.id, {
        visibility,
        userIds: visibility === 'people' ? [...people] : [],
      });
      setShare(next);
      onAgentChange({ ...agent, visibility: next.visibility });
      toast.success('Sharing saved.');
    } catch (reason) {
      toast.error(toUserMessage(reason, 'Sharing could not be saved.'));
    } finally {
      setSavingShare(false);
    }
  };

  const sharingChanged =
    share !== null &&
    (visibility !== share.visibility ||
      (visibility === 'people' &&
        share.members.some((member) => member.hasAccess !== people.has(member.userId))));
  const inWorkspace = agent.organizationId !== null;
  const published = agent.publishedVersion !== null;

  return (
    <>
      {dialog}
      <section aria-labelledby={`${id}-publish`} className={SECTION}>
        <div>
          <h2 id={`${id}-publish`} className="text-sm font-medium text-foreground">
            Publish
          </h2>
          <p className="text-xs text-muted-foreground">
            {published
              ? `Version ${agent.publishedVersion} is what people you share with use.${
                  agent.hasUnpublishedChanges ? ' Your draft has changes they do not have yet.' : ''
                }`
              : 'Not published yet. Only you can chat with the draft.'}
          </p>
        </div>
        {dirty ? (
          <p className="text-sm text-muted-foreground">Save your draft before you publish it.</p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor={`${id}-note`}>What changed (optional)</Label>
            <Input
              id={`${id}-note`}
              value={note}
              maxLength={AGENT_VERSION_NOTE_MAX_CHARS}
              disabled={!editable}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <Button
            className="pointer-coarse:min-h-11"
            disabled={!editable || dirty || publishing || !agent.hasUnpublishedChanges}
            aria-busy={publishing}
            onClick={() => void publish()}
          >
            {publishing ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
            {published ? 'Publish changes' : 'Publish'}
          </Button>
        </div>
      </section>

      <section aria-labelledby={`${id}-share`} className={SECTION}>
        <h2 id={`${id}-share`} className="text-sm font-medium text-foreground">
          Sharing
        </h2>
        {loadError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="text-sm text-danger">
              {loadError}
            </p>
            <Button variant="outline" size="sm" onClick={load}>
              Try again
            </Button>
          </div>
        ) : share === null ? (
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
            <span className="text-sm text-muted-foreground">Loading sharing…</span>
          </div>
        ) : !inWorkspace ? (
          <p className="text-sm text-muted-foreground">
            Agents in your personal space stay private. Switch to a workspace and create the agent
            there to share it with its members.
          </p>
        ) : (
          <>
            <fieldset className="flex flex-col gap-3" disabled={!editable || !published}>
              <legend className="sr-only">Who can use this agent</legend>
              {VISIBILITY_OPTIONS.map((option) => {
                const optionId = `${id}-visibility-${option.value}`;
                return (
                  <div key={option.value} className="flex items-start gap-3">
                    <input
                      id={optionId}
                      type="radio"
                      name={`${id}-visibility`}
                      value={option.value}
                      checked={visibility === option.value}
                      onChange={() => setVisibility(option.value)}
                      className="mt-1 h-4 w-4 accent-[var(--chat-accent-primary)]"
                    />
                    <div className="min-w-0">
                      <Label htmlFor={optionId} className="cursor-pointer">
                        {option.label}
                        {option.value === 'workspace' && share.workspaceName
                          ? ` in ${share.workspaceName}`
                          : ''}
                      </Label>
                      <p className="text-xs text-muted-foreground">{option.help}</p>
                    </div>
                  </div>
                );
              })}
            </fieldset>
            {!published ? (
              <p className="text-xs text-muted-foreground">
                Publish the agent before you share it.
              </p>
            ) : null}
            {visibility === 'people' ? (
              share.members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nobody else is in this workspace yet.
                </p>
              ) : (
                <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                  {share.members.map((member) => {
                    const memberId = `${id}-member-${member.userId}`;
                    return (
                      <li key={member.userId} className="flex items-center gap-3">
                        <Checkbox
                          id={memberId}
                          checked={people.has(member.userId)}
                          disabled={!editable}
                          onCheckedChange={(checked) =>
                            setPeople((current) => {
                              const next = new Set(current);
                              if (checked === true) next.add(member.userId);
                              else next.delete(member.userId);
                              return next;
                            })
                          }
                        />
                        <Label htmlFor={memberId} className="min-w-0 cursor-pointer truncate">
                          {member.name}
                          {member.email && member.email !== member.name ? (
                            <span className="text-muted-foreground"> · {member.email}</span>
                          ) : null}
                        </Label>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : null}
            <div>
              <Button
                variant="outline"
                className="pointer-coarse:min-h-11"
                disabled={!sharingChanged || savingShare || !published}
                aria-busy={savingShare}
                onClick={() => void saveShare()}
              >
                {savingShare ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
                Save sharing
              </Button>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby={`${id}-versions`} className={SECTION}>
        <h2 id={`${id}-versions`} className="text-sm font-medium text-foreground">
          Version history
        </h2>
        {versions === null ? (
          loadError ? null : (
            <div className="flex items-center gap-2">
              <Spinner size="sm" />
              <span className="text-sm text-muted-foreground">Loading versions…</span>
            </div>
          )
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every publish adds a version here.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {versions.map((version) => (
              <li key={version.version} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    Version {version.version}
                    {version.version === agent.publishedVersion ? ' · Published' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(version.publishedAt)}
                    {version.publishedByName ? ` by ${version.publishedByName}` : ''}
                    {version.note ? ` · ${version.note}` : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="pointer-coarse:min-h-11"
                  disabled={!editable}
                  aria-label={`Restore version ${version.version}`}
                  onClick={() => restore(version)}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
