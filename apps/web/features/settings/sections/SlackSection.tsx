'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  MANAGED_CLOUD_SLACK_PATH,
  ManagedCloudSlackAccountUnlinkedSchema,
  ManagedCloudSlackInstallationRemovedSchema,
  ManagedCloudSlackOverviewSchema,
  ManagedCloudSlackRunDecisionSchema,
  managedCloudSlackAccountLinkPath,
  managedCloudSlackInstallationPath,
  managedCloudSlackRunApprovalPath,
  type ManagedCloudSlackOverview,
  type ManagedCloudSlackPendingApproval,
} from '@agiworkforce/cloud-contracts';
import { Button, Spinner, useConfirmAction } from '@agiworkforce/ui';

import type { RequestAuthority } from '@/lib/identity/request-authority';
import {
  useSlackSettingsRevision,
  useSlackSettingsView,
  type SlackSettingsView,
  type SlackSettingsMutation,
} from '@/features/slack/lib/slack-settings-owner';
import {
  SLACK_INSTALL_PATH,
  SLACK_SETTINGS_STATUS_PARAM,
  isSlackInstallStatus,
  type SlackInstallStatus,
} from '@/lib/slack/slack-contract';
import { toUserMessage } from '@/lib/user-error-message';
import { SlackChannelPolicies } from '@/features/slack/components/SlackChannelPolicies';

const OVERVIEW_UNREADABLE = 'Your Slack settings could not be loaded.';

const INSTALL_STATUS_MESSAGE: Readonly<Record<SlackInstallStatus, string>> = {
  installed: 'AGI was added to Slack. Send it a message there to start.',
  denied: 'Slack did not add the app because the request was cancelled.',
  invalid_state:
    'That Slack install link expired or was opened in another browser. Start again from here.',
  unavailable: 'AGI in Slack is not available right now.',
  workspace_install_only:
    'Add AGI to one Slack workspace at a time. Organization-wide installs are not supported.',
  failed: 'Slack could not finish adding the app. Try again.',
};

type OverviewState =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; data: ManagedCloudSlackOverview };

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
  padding: 'var(--space-4) var(--space-5)',
} as const;

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  padding: 'var(--space-3) 0',
  borderTop: '1px solid var(--settings-border)',
  flexWrap: 'wrap',
} as const;

const destructiveStyle = { color: 'var(--settings-destructive-text)' } as const;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string } | string;
  } | null;
  const message = typeof body?.error === 'string' ? body.error : body?.error?.message;
  return new Error(message ?? fallback);
}

function Card({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} style={cardStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 16rem' }}>
          <h2
            id={id}
            style={{
              margin: '0 0 var(--space-1)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-2)',
            }}
          >
            {title}
          </h2>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-3)' }}>
            {description}
          </p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: 'var(--space-3) 0 0',
        padding: 'var(--space-3) 0 0',
        borderTop: '1px solid var(--settings-border)',
        fontSize: 12,
        color: 'var(--text-3)',
      }}
    >
      {children}
    </p>
  );
}

function ApprovalItem({
  approval,
  disabled,
  onDecide,
}: {
  approval: ManagedCloudSlackPendingApproval;
  disabled: boolean;
  onDecide: (decision: 'approved' | 'rejected') => void;
}) {
  return (
    <li style={{ ...rowStyle, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0, flex: '1 1 20rem' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-1)' }}>
          {approval.taskPath
            ? 'A task from a channel mention'
            : approval.surface === 'channel'
              ? 'A channel mention'
              : 'A direct message'}{' '}
          in {approval.teamName}
        </p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
          Asked {formatDateTime(approval.requestedAt)} · Expires{' '}
          {formatDateTime(approval.expiresAt)}
        </p>
        {approval.taskPath ? (
          <p style={{ margin: 'var(--space-1) 0 0', fontSize: 12 }}>
            <a href={approval.taskPath} style={{ color: 'var(--text-1)' }}>
              View task
            </a>
          </p>
        ) : null}
        <ul style={{ margin: 'var(--space-2) 0 0', padding: 0, listStyle: 'none' }}>
          {approval.toolCalls.map((call) => (
            <li key={call.id} style={{ marginTop: 'var(--space-2)' }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-1)' }}>
                {call.summary || call.name}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>{call.name}</p>
              {call.input ? (
                <pre
                  style={{
                    margin: 'var(--space-1) 0 0',
                    padding: 'var(--space-2) var(--space-3)',
                    maxHeight: 160,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 12,
                    color: 'var(--text-2)',
                    background: 'var(--bg-base)',
                    border: '1px solid var(--settings-border)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  {call.input}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onDecide('rejected')}
        >
          Deny
        </Button>
        <Button type="button" size="sm" disabled={disabled} onClick={() => onDecide('approved')}>
          Approve
        </Button>
      </div>
    </li>
  );
}

export function SlackSection({ active = true }: { active?: boolean } = {}) {
  const view = useSlackSettingsView(active);
  return <SlackSettingsContent key={view.id} view={view} />;
}

function SlackSettingsContent({ view }: { view: SlackSettingsView }) {
  useSlackSettingsRevision(view);
  const searchParams = useSearchParams();
  const statusParam = searchParams?.get(SLACK_SETTINGS_STATUS_PARAM) ?? null;
  const installStatus = isSlackInstallStatus(statusParam) ? statusParam : null;
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [state, setState] = useState<OverviewState>({ kind: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(false);
  const overview = useRef<ManagedCloudSlackOverview | null>(null);
  const reading = useRef<RequestAuthority | null>(null);
  const current = useCallback(() => mounted.current && view.isCurrent(), [view]);

  const load = useCallback(async () => {
    if (!view.reconcile() || !current()) return;
    reading.current?.retire();
    const request = view.read(() => current() && reading.current === request);
    if (!request) return;
    reading.current = request;
    setState({ kind: 'loading' });
    try {
      const response = await view.send(request, MANAGED_CLOUD_SLACK_PATH, { method: 'GET' });
      request.assertCurrent();
      if (!response.ok) throw await readError(response, OVERVIEW_UNREADABLE);
      const body: unknown = await response.json();
      request.assertCurrent();
      const next = ManagedCloudSlackOverviewSchema.parse(body);
      const ids = [
        next.installations.map((item) => item.id),
        next.links.map((item) => item.id),
        next.approvals.map((item) => item.runId),
        ...next.approvals.map((item) => item.toolCalls.map((call) => call.id)),
      ];
      if (ids.some((values) => new Set(values).size !== values.length)) {
        throw new Error('The Slack settings contained conflicting resource identifiers.');
      }
      overview.current = next;
      setState({ kind: 'ready', data: next });
    } catch (cause) {
      view.reconcile();
      if (request.isCurrent()) {
        overview.current = null;
        setState({ kind: 'failed', message: toUserMessage(cause, OVERVIEW_UNREADABLE) });
      }
    }
  }, [current, view]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      overview.current = null;
      reading.current?.retire();
    };
  }, [load]);

  const renderedRead = reading.current;
  const ready = () =>
    reading.current === renderedRead &&
    current() &&
    state.kind === 'ready' &&
    overview.current === state.data &&
    !!reading.current?.isCurrent();

  function begin() {
    const target = overview.current;
    if (!view.reconcile() || !ready() || !target) return null;
    return view.begin(() => current() && overview.current === target);
  }

  async function run(operation: SlackSettingsMutation, action: () => Promise<string>) {
    if (!operation.start()) return;
    setError(null);
    setNotice(null);
    try {
      const message = await action();
      operation.request.assertCurrent();
      setNotice(message);
      await load();
    } catch (cause) {
      view.reconcile();
      if (operation.dispatched && view.isCurrent()) view.markUncertain();
      if (operation.request.isCurrent()) {
        if (operation.dispatched) {
          setError(
            'The result could not be confirmed. Check Slack before trying this action again.',
          );
        } else {
          setError(toUserMessage(cause, 'The request could not be sent.'));
        }
      }
    } finally {
      operation.finish();
    }
  }

  function removeInstallation(
    operation: SlackSettingsMutation,
    installationId: string,
    teamName: string,
  ) {
    return run(operation, async () => {
      const response = await view.send(
        operation.request,
        managedCloudSlackInstallationPath(installationId),
        { method: 'DELETE' },
      );
      operation.request.assertCurrent();
      if (!response.ok)
        throw await readError(response, 'The removal result could not be confirmed.');
      const body: unknown = await response.json();
      operation.request.assertCurrent();
      if (ManagedCloudSlackInstallationRemovedSchema.parse(body).removed !== installationId) {
        throw new Error('The removal receipt did not match the Slack workspace.');
      }
      return `The service confirmed AGI was removed from ${teamName}.`;
    });
  }

  function unlink(operation: SlackSettingsMutation, linkId: string, teamName: string) {
    return run(operation, async () => {
      const response = await view.send(
        operation.request,
        managedCloudSlackAccountLinkPath(linkId),
        {
          method: 'DELETE',
        },
      );
      operation.request.assertCurrent();
      if (!response.ok)
        throw await readError(response, 'The disconnection result could not be confirmed.');
      const body: unknown = await response.json();
      operation.request.assertCurrent();
      if (ManagedCloudSlackAccountUnlinkedSchema.parse(body).removed !== linkId) {
        throw new Error('The disconnection receipt did not match the Slack account.');
      }
      return `The service confirmed your Slack account in ${teamName} was disconnected.`;
    });
  }

  function decide(approval: ManagedCloudSlackPendingApproval, decision: 'approved' | 'rejected') {
    const operation = begin();
    if (!operation) return;
    const runId = approval.runId;
    const toolCallIds = approval.toolCalls.map((call) => call.id);
    void run(operation, async () => {
      const response = await view.send(operation.request, managedCloudSlackRunApprovalPath(runId), {
        method: 'POST',
        body: { decision, toolCallIds },
      });
      operation.request.assertCurrent();
      if (!response.ok)
        throw await readError(response, 'The decision result could not be confirmed.');
      const body: unknown = await response.json();
      operation.request.assertCurrent();
      const receipt = ManagedCloudSlackRunDecisionSchema.parse(body);
      if (receipt.runId !== runId || receipt.decision !== decision) {
        throw new Error('The decision receipt did not match the Slack request.');
      }
      return decision === 'approved'
        ? 'Approval accepted. Slack continuation was requested.'
        : 'Denial accepted. Slack continuation without that step was requested.';
    });
  }

  const data = ready() && state.kind === 'ready' ? state.data : null;
  const blocked = view.blocked() || !data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {current() ? confirmDialog : null}
      <div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 var(--space-1)',
          }}
        >
          Slack app
        </h1>
        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 12 }}>
          AGI answers in Slack threads, using each person&apos;s own plan and settings.
        </p>
      </div>

      {current() && installStatus ? (
        <p
          role={installStatus === 'installed' ? 'status' : 'alert'}
          style={{
            margin: 0,
            fontSize: 13,
            color:
              installStatus === 'installed' ? 'var(--text-2)' : 'var(--settings-destructive-text)',
          }}
        >
          {INSTALL_STATUS_MESSAGE[installStatus]}
        </p>
      ) : null}
      {current() && notice ? (
        <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
          {notice}
        </p>
      ) : null}
      {current() && view.uncertain() && !error ? (
        <p role="alert">
          A Slack action's result could not be confirmed. Check Slack before trying that action
          again.
        </p>
      ) : null}
      {current() && error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, ...destructiveStyle }}>
          {error}
        </p>
      ) : null}

      {!view.isCurrent() ? (
        <p role="status">
          Slack settings are unavailable. Reload this page to confirm your account and workspace,
          and sign in again if asked.
        </p>
      ) : null}
      {current() && state.kind === 'loading' ? (
        <div>
          <Spinner size="sm" aria-label="Loading Slack settings" />
        </div>
      ) : null}

      {current() && state.kind === 'failed' ? (
        <div role="alert" style={{ fontSize: 13, ...destructiveStyle }}>
          {state.message}{' '}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={view.blocked()}
            onClick={() => {
              if (view.reconcile() && !view.blocked()) void load();
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {data ? (
        <>
          {!data.available ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
              AGI in Slack is not set up on this service yet.
            </p>
          ) : null}
          {data.available && !data.planAllowed ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
              Answers in Slack are available on {data.requiredPlans} plans.{' '}
              <a href="/pricing" style={{ color: 'var(--text-1)' }}>
                See plans
              </a>
            </p>
          ) : null}

          <Card
            id="settings-slack-approvals-heading"
            title="Waiting for your approval"
            description="Slack answers that need a tool wait here. Nothing runs until you decide."
          >
            {data.approvals.length === 0 ? (
              <EmptyRow>Nothing is waiting for you.</EmptyRow>
            ) : (
              <ul style={{ listStyle: 'none', margin: 'var(--space-3) 0 0', padding: 0 }}>
                {data.approvals.map((approval) => (
                  <ApprovalItem
                    key={approval.runId}
                    approval={approval}
                    disabled={blocked}
                    onDecide={(decision) => decide(approval, decision)}
                  />
                ))}
              </ul>
            )}
          </Card>

          <Card
            id="settings-slack-links-heading"
            title="Your Slack accounts"
            description="Accounts AGI answers as you. To link one, message the app in Slack."
          >
            {data.links.length === 0 ? (
              <EmptyRow>No Slack accounts are linked yet.</EmptyRow>
            ) : (
              <ul style={{ listStyle: 'none', margin: 'var(--space-3) 0 0', padding: 0 }}>
                {data.links.map((link) => (
                  <li key={link.id} style={rowStyle}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-1)' }}>
                        {link.slackUserName ?? 'Slack account'} in {link.teamName}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
                        Answers in {link.workspaceName ?? 'your personal workspace'} · Linked{' '}
                        {formatDate(link.linkedAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      style={destructiveStyle}
                      disabled={blocked}
                      onClick={() => {
                        const operation = begin();
                        if (!operation) return;
                        confirm({
                          title: `Disconnect your Slack account in ${link.teamName}?`,
                          description:
                            'AGI stops answering this Slack account, and the record of its Slack answers is deleted, including any answer still waiting for your approval. Answers already posted stay in Slack, and tasks it started stay in your tasks. You can link it again by messaging the app.',
                          confirmLabel: 'Disconnect',
                          destructive: true,
                          onConfirm: () => unlink(operation, link.id, link.teamName),
                          onCancel: operation.cancel,
                        });
                      }}
                    >
                      Disconnect
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            id="settings-slack-workspaces-heading"
            title="Slack workspaces you added"
            description="Add the app, then /invite it to channels. Anyone there can link their account."
            action={
              data.available ? (
                <Button asChild size="sm">
                  <a
                    href={blocked ? undefined : SLACK_INSTALL_PATH}
                    aria-disabled={blocked}
                    onClick={(event) => {
                      if (!view.reconcile() || !ready() || view.blocked()) event.preventDefault();
                    }}
                    onAuxClick={(event) => {
                      if (!view.reconcile() || !ready() || view.blocked()) event.preventDefault();
                    }}
                    onContextMenu={(event) => {
                      if (!view.reconcile() || !ready() || view.blocked()) event.preventDefault();
                    }}
                  >
                    Add to Slack
                  </a>
                </Button>
              ) : null
            }
          >
            {data.installations.length === 0 ? (
              <EmptyRow>You have not added the app to a Slack workspace.</EmptyRow>
            ) : (
              <ul style={{ listStyle: 'none', margin: 'var(--space-3) 0 0', padding: 0 }}>
                {data.installations.map((installation) => (
                  <li key={installation.id} style={rowStyle}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-1)' }}>
                        {installation.teamName}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
                        Added {formatDate(installation.installedAt)}
                      </p>
                      <SlackChannelPolicies
                        view={view}
                        installationId={installation.id}
                        teamName={installation.teamName}
                        expectedTeamId={installation.teamId}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      style={destructiveStyle}
                      disabled={blocked}
                      onClick={() => {
                        const operation = begin();
                        if (!operation) return;
                        confirm({
                          title: `Remove AGI from ${installation.teamName}?`,
                          description: `The app is uninstalled from ${installation.teamName}. Everyone there stops getting answers, every linked Slack account in it is disconnected, and answers waiting for approval are dropped. This cannot be undone; you can add the app again later.`,
                          confirmLabel: 'Remove',
                          destructive: true,
                          onConfirm: () =>
                            removeInstallation(operation, installation.id, installation.teamName),
                          onCancel: operation.cancel,
                        });
                      }}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
