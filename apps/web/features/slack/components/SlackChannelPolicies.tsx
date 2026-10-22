'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Button, Checkbox, Input, Label, Spinner } from '@agiworkforce/ui';
import {
  SLACK_CHANNEL_TOOLS,
  SlackChannelIdSchema,
  SlackChannelPolicyListSchema,
  slackChannelPoliciesPath,
  slackChannelToolAllowed,
  type SlackChannelMode,
  type SlackChannelPolicy,
  type SlackChannelPolicyList,
  type SlackChannelTool,
} from '@agiworkforce/cloud-contracts';

import { sendAuthorizedJson } from '@features/auth/step-up-fetch';
import { toUserMessage } from '@/lib/user-error-message';

const DEFAULT_MODE = '';
const MODE_LABELS: Record<SlackChannelMode, string> = {
  task: 'Answers and runs tasks',
  answer: 'Answers only, never starts a task',
  off: 'Off: does not answer here',
};
const TOOL_LABELS: Record<SlackChannelTool, string> = {
  web: 'Search and read the web',
  code: 'Run code',
  apps: 'Use connected apps and integrations',
};
const SELECT_CLASS =
  'h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground pointer-coarse:min-h-11';

function nextTools(
  current: readonly SlackChannelTool[] | null,
  tool: SlackChannelTool,
  allowed: boolean,
): SlackChannelTool[] | null {
  const next = SLACK_CHANNEL_TOOLS.filter((candidate) =>
    candidate === tool ? allowed : slackChannelToolAllowed(current, candidate),
  );
  return next.length === SLACK_CHANNEL_TOOLS.length ? null : next;
}

export type SlackChannelPoliciesFetch = (
  path: string,
  init: { method: 'GET' | 'PUT'; body?: unknown },
) => Promise<Response>;

async function readPolicies(response: Response): Promise<SlackChannelPolicyList> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? 'Channel settings could not be loaded.');
  }
  return SlackChannelPolicyListSchema.parse(await response.json());
}

export function SlackChannelPolicies({
  installationId,
  teamName,
  send = sendAuthorizedJson,
}: {
  installationId: string;
  teamName: string;
  send?: SlackChannelPoliciesFetch;
}) {
  const id = useId();
  const [data, setData] = useState<SlackChannelPolicyList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newChannel, setNewChannel] = useState('');
  const path = slackChannelPoliciesPath(installationId);

  const load = useCallback(() => {
    setError(null);
    send(path, { method: 'GET' })
      .then(readPolicies)
      .then(setData)
      .catch((reason: unknown) =>
        setError(toUserMessage(reason, 'Channel settings could not be loaded.')),
      );
  }, [path, send]);

  useEffect(load, [load]);

  const save = async (channelId: string, body: Record<string, unknown>) => {
    setBusy(channelId);
    setError(null);
    try {
      setData(
        await readPolicies(await send(path, { method: 'PUT', body: { channelId, ...body } })),
      );
    } catch (reason) {
      setError(toUserMessage(reason, 'The channel setting could not be saved.'));
    } finally {
      setBusy(null);
    }
  };

  const setMode = (channelId: string, mode: SlackChannelMode | null) => save(channelId, { mode });

  const setTool = (channel: SlackChannelPolicy, tool: SlackChannelTool, allowed: boolean) =>
    save(channel.channelId, { mode: channel.mode, tools: nextTools(channel.tools, tool, allowed) });

  const channelInput = newChannel.trim().toUpperCase();
  const channelValid = SlackChannelIdSchema.safeParse(channelInput).success;

  return (
    <section aria-label={`Channels in ${teamName}`} className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Choose what AGI may do in each channel of {teamName}. Channels you have not set answer and
        run tasks as usual. Direct messages are not affected.
      </p>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {data === null && !error ? (
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <span className="text-xs text-muted-foreground">Loading channels…</span>
        </div>
      ) : null}
      {data && data.channels.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {data.channels.map((channel) => (
            <li key={channel.channelId} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a
                  href={`https://app.slack.com/client/${encodeURIComponent(data.teamId)}/${encodeURIComponent(channel.channelId)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-foreground underline underline-offset-2"
                >
                  {channel.channelId}
                </a>
                <select
                  aria-label={`What AGI may do in ${channel.channelId}`}
                  value={channel.mode ?? DEFAULT_MODE}
                  disabled={busy === channel.channelId}
                  onChange={(event) =>
                    void setMode(
                      channel.channelId,
                      event.target.value === DEFAULT_MODE
                        ? null
                        : (event.target.value as SlackChannelMode),
                    )
                  }
                  className={SELECT_CLASS}
                >
                  <option value={DEFAULT_MODE}>Default: answers and runs tasks</option>
                  {(Object.keys(MODE_LABELS) as SlackChannelMode[]).map((mode) => (
                    <option key={mode} value={mode}>
                      {MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </div>
              {channel.mode === 'answer' || channel.mode === 'task' ? (
                <fieldset className="flex flex-col gap-1.5" disabled={busy === channel.channelId}>
                  <legend className="text-sm text-muted-foreground">
                    Tools AGI may use in {channel.channelId}
                  </legend>
                  {SLACK_CHANNEL_TOOLS.map((tool) => {
                    const inputId = `${id}-${channel.channelId}-${tool}`;
                    return (
                      <div key={tool} className="flex items-center gap-2">
                        <Checkbox
                          id={inputId}
                          checked={slackChannelToolAllowed(channel.tools, tool)}
                          disabled={busy === channel.channelId}
                          onCheckedChange={(checked) =>
                            void setTool(channel, tool, checked === true)
                          }
                        />
                        <label htmlFor={inputId} className="text-sm text-foreground">
                          {TOOL_LABELS[tool]}
                        </label>
                      </div>
                    );
                  })}
                </fieldset>
              ) : null}
            </li>
          ))}
        </ul>
      ) : data ? (
        <p className="text-xs text-muted-foreground">
          No channels yet. Channels where someone mentions the app appear here.
        </p>
      ) : null}
      <form
        className="flex flex-col gap-1.5 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (!channelValid) return;
          void setMode(channelInput, 'off').then(() => setNewChannel(''));
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor={`${id}-channel`} className="text-xs">
            Turn it off in another channel
          </Label>
          <Input
            id={`${id}-channel`}
            value={newChannel}
            placeholder="Channel ID, such as C0123ABCD"
            aria-describedby={`${id}-channel-help`}
            onChange={(event) => setNewChannel(event.target.value)}
          />
          <p id={`${id}-channel-help`} className="text-xs text-muted-foreground">
            In Slack, open the channel details; the ID is at the bottom of the About tab.
          </p>
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={!channelValid || busy !== null}>
          Turn off
        </Button>
      </form>
    </section>
  );
}
