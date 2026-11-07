'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
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

import type { RequestAuthority } from '@/lib/identity/request-authority';
import { useSlackSettingsRevision, type SlackSettingsView } from '../lib/slack-settings-owner';
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

async function readPolicies(response: Response): Promise<SlackChannelPolicyList> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? 'Channel settings could not be loaded.');
  }
  return SlackChannelPolicyListSchema.parse(await response.json());
}

export function SlackChannelPolicies(props: {
  view: SlackSettingsView;
  installationId: string;
  teamName: string;
  expectedTeamId: string;
}) {
  const target = useMemo(() => ({}), [props.view, props.installationId, props.expectedTeamId]);
  const rendered = useRef(target);
  rendered.current = target;
  const targetCurrent = useCallback(() => rendered.current === target, [target]);
  return <ChannelPoliciesEditor key={`${props.view.id}:${props.installationId}:${props.expectedTeamId}`}
    {...props} targetCurrent={targetCurrent} />;
}

function ChannelPoliciesEditor({ view, installationId, teamName, expectedTeamId, targetCurrent }: {
  targetCurrent: () => boolean;
  view: SlackSettingsView;
  installationId: string;
  teamName: string;
  expectedTeamId: string;
}) {
  useSlackSettingsRevision(view);
  const id = useId();
  const [data, setData] = useState<SlackChannelPolicyList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newChannel, setNewChannel] = useState('');
  const mounted = useRef(false);
  const reading = useRef<RequestAuthority | null>(null);
  const baseline = useRef<SlackChannelPolicyList | null>(null);
  const editorRevision = useRef(0);
  const path = slackChannelPoliciesPath(installationId);
  const current = useCallback(() => targetCurrent() && mounted.current && view.isCurrent(), [targetCurrent, view]);
  const transmit = useCallback(async (request: RequestAuthority,
    init: { method: 'GET' | 'PUT'; body?: unknown }) => {
    request.assertCurrent();
    const response = await view.send(request, path, init);
    request.assertCurrent();
    return response;
  }, [path, view]);
  const parse = useCallback(async (request: RequestAuthority, response: Response) => {
    const result = await readPolicies(response);
    request.assertCurrent();
    if (result.teamId !== expectedTeamId) throw new Error('The channel settings belong to another Slack workspace.');
    if (new Set(result.channels.map((channel) => channel.channelId)).size !== result.channels.length) {
      throw new Error('The channel settings contained conflicting channel identifiers.');
    }
    return result;
  }, [expectedTeamId]);

  useEffect(() => {
    mounted.current = true;
    baseline.current = null;
    setData(null);
    setError(null);
    const request = view.read(() => current() && reading.current === request);
    reading.current = request;
    if (request) {
      void (async () => {
        try {
          const result = await parse(request, await transmit(request, { method: 'GET' }));
          request.assertCurrent();
          baseline.current = result;
          setData(result);
        } catch (reason) {
          view.reconcile();
          if (request.isCurrent()) setError(toUserMessage(reason, 'Channel settings could not be loaded.'));
        }
      })();
    }
    return () => {
      mounted.current = false;
      baseline.current = null;
      reading.current?.retire();
    };
  }, [current, view, transmit, parse]);

  const save = async (channelId: string, body: { mode: SlackChannelMode | null; tools?: SlackChannelTool[] | null }) => {
    const target = baseline.current;
    if (!view.reconcile() || !current() || !target || target !== data) return false;
    const operation = view.begin(() => current() && baseline.current === target);
    if (!operation || !operation.start()) return false;
    reading.current?.retire();
    setError(null);
    try {
      const result = await parse(operation.request,
        await transmit(operation.request, { method: 'PUT', body: { channelId, ...body } }));
      operation.request.assertCurrent();
      const saved = result.channels.find((channel) => channel.channelId === channelId);
      if ((body.mode === null ? saved?.mode != null : saved?.mode !== body.mode) ||
          (body.tools !== undefined && body.mode !== null && (!saved ||
            SLACK_CHANNEL_TOOLS.some((tool) =>
              slackChannelToolAllowed(saved.tools, tool) !== slackChannelToolAllowed(body.tools ?? null, tool))))) {
        throw new Error('The channel receipt did not match the requested setting.');
      }
      baseline.current = result;
      setData(result);
      return true;
    } catch (reason) {
      view.reconcile();
      if (operation.dispatched && view.isCurrent()) view.markUncertain();
      if (operation.request.isCurrent()) {
        if (operation.dispatched) {
          setError('The result could not be confirmed. Check Slack before trying this action again.');
        } else {
          setError(toUserMessage(reason, 'The channel request could not be sent.'));
        }
      }
      return false;
    } finally {
      operation.finish();
    }
  };

  const setMode = (channelId: string, mode: SlackChannelMode | null) => save(channelId, { mode });
  const setTool = (channel: SlackChannelPolicy, tool: SlackChannelTool, allowed: boolean) =>
    save(channel.channelId, { mode: channel.mode, tools: nextTools(channel.tools, tool, allowed) });
  const renderedEditorRevision = editorRevision.current;
  const channelInput = newChannel.trim().toUpperCase();
  const channelValid = SlackChannelIdSchema.safeParse(channelInput).success;
  const visible = current() && data === baseline.current ? data : null;
  const blocked = view.blocked() || !visible;

  return (
    <section aria-label={`Channels in ${teamName}`} className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Choose what AGI may do in each channel of {teamName}. Channels you have not set answer and
        run tasks as usual. Direct messages are not affected.
      </p>
      {current() && error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {current() && visible === null && !error ? (
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <span className="text-xs text-muted-foreground">Loading channels…</span>
        </div>
      ) : null}
      {visible && visible.channels.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {visible.channels.map((channel) => (
            <li key={channel.channelId} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a
                  href={`https://app.slack.com/client/${encodeURIComponent(visible.teamId)}/${encodeURIComponent(channel.channelId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-foreground underline underline-offset-2"
                >
                  {channel.channelId}
                </a>
                <select
                  aria-label={`What AGI may do in ${channel.channelId}`}
                  value={channel.mode ?? DEFAULT_MODE}
                  disabled={blocked}
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
                <fieldset className="flex flex-col gap-1.5" disabled={blocked}>
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
                          disabled={blocked}
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
      ) : visible ? (
        <p className="text-xs text-muted-foreground">
          No channels yet. Channels where someone mentions the app appear here.
        </p>
      ) : null}
      {current() ? <form
        className="flex flex-col gap-1.5 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (!view.reconcile() || !current() || !channelValid || blocked || editorRevision.current !== renderedEditorRevision) return;
          const revision = editorRevision.current;
          void setMode(channelInput, 'off').then((saved) => {
            if (saved && current() && editorRevision.current === revision) setNewChannel('');
          });
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
            onChange={(event) => {
              if (!view.reconcile() || !current() || editorRevision.current !== renderedEditorRevision) return;
              editorRevision.current += 1;
              setNewChannel(event.target.value);
            }}
          />
          <p id={`${id}-channel-help`} className="text-xs text-muted-foreground">
            In Slack, open the channel details; the ID is at the bottom of the About tab.
          </p>
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={!channelValid || blocked}>
          Turn off
        </Button>
      </form> : null}
    </section>
  );
}
