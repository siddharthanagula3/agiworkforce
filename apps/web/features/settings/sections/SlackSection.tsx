'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
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

import { sendAuthorizedJson } from '@/features/auth/step-up-fetch';
import {
  SLACK_INSTALL_PATH,
  SLACK_SETTINGS_STATUS_PARAM,
  isSlackInstallStatus,
  type SlackInstallStatus,
} from '@/lib/slack/slack-contract';
import { toUserMessage } from '@/lib/user-error-message';

const OVERVIEW_UNREADABLE = 'Your Slack settings could not be loaded.';

const INSTALL_STATUS_MESSAGE: Readonly<Record<SlackInstallStatus, string>> = {
  installed: 'AGI Workforce was added to Slack. Send it a message there to start.',
  denied: 'Slack did not add the app because the request was cancelled.',
  invalid_state:
    'That Slack install link expired or was opened in another browser. Start again from here.',
  unavailable: 'AGI Workforce in Slack is not available right now.',
  workspace_install_only:
    'Add AGI Workforce to one Slack workspace at a time. Organization-wide installs are not supported.',
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
  busy,
  onDecide,
}: {
  approval: ManagedCloudSlackPendingApproval;
  busy: boolean;
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
          disabled={busy}
          onClick={() => onDecide('rejected')}
        >
          Deny
        </Button>
        <Button
          type="button"
          size="sm"
          isLoading={busy}
          disabled={busy}
          onClick={() => onDecide('approved')}
        >
          {busy ? <Spinner size="sm" aria-hidden="true" /> : null}
          Approve
        </Button>
      </div>
    </li>
  );
}

export function SlackSection() {
  const searchParams = useSearchParams();
  const statusParam = searchParams?.get(SLACK_SETTINGS_STATUS_PARAM) ?? null;
  const installStatus = isSlackInstallStatus(statusParam) ? statusParam : null;
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [state, setState] = useState<OverviewState>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await sendAuthorizedJson(MANAGED_CLOUD_SLACK_PATH, { method: 'GET' });
      if (!response.ok) throw await readError(response, OVERVIEW_UNREADABLE);
      setState({
        kind: 'ready',
        data: ManagedCloudSlackOverviewSchema.parse(await response.json()),
      });
    } catch (cause) {
      setState({ kind: 'failed', message: toUserMessage(cause, OVERVIEW_UNREADABLE) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, action: () => Promise<string>, fallback: string) {
    setError(null);
    setNotice(null);
    setBusy(key);
    try {
      setNotice(await action());
      await load();
    } catch (cause) {
      setError(toUserMessage(cause, fallback));
    } finally {
      setBusy(null);
    }
  }

  function removeInstallation(installationId: string, teamName: string) {
    void run(
      `installation:${installationId}`,
      async () => {
        const response = await sendAuthorizedJson(
          managedCloudSlackInstallationPath(installationId),
          { method: 'DELETE' },
        );
        if (!response.ok) throw await readError(response, 'The app could not be removed.');
        ManagedCloudSlackInstallationRemovedSchema.parse(await response.json());
        return `AGI Workforce was removed from ${teamName}.`;
      },
      'The app could not be removed.',
    );
  }

  function unlink(linkId: string, teamName: string) {
    void run(
      `link:${linkId}`,
      async () => {
        const response = await sendAuthorizedJson(managedCloudSlackAccountLinkPath(linkId), {
          method: 'DELETE',
        });
        if (!response.ok)
          throw await readError(response, 'That Slack account could not be disconnected.');
        ManagedCloudSlackAccountUnlinkedSchema.parse(await response.json());
        return `Your Slack account in ${teamName} was disconnected.`;
      },
      'That Slack account could not be disconnected.',
    );
  }

  function decide(approval: ManagedCloudSlackPendingApproval, decision: 'approved' | 'rejected') {
    void run(
      `approval:${approval.runId}`,
      async () => {
        const response = await sendAuthorizedJson(
          managedCloudSlackRunApprovalPath(approval.runId),
          {
            method: 'POST',
            body: { decision, toolCallIds: approval.toolCalls.map((call) => call.id) },
          },
        );
        if (!response.ok) throw await readError(response, 'Your decision could not be saved.');
        ManagedCloudSlackRunDecisionSchema.parse(await response.json());
        return decision === 'approved'
          ? 'Approved. The answer continues in Slack.'
          : 'Denied. The answer continues in Slack without that step.';
      },
      'Your decision could not be saved.',
    );
  }

  const data = state.kind === 'ready' ? state.data : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {confirmDialog}
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
          Slack
        </h1>
        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 14 }}>
          Message AGI Workforce in Slack, or mention it in a channel, and it answers in the thread
          as the app. Each person links their own account, so answers use their plan, settings and
          approvals.
        </p>
      </div>

      {installStatus ? (
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
      {notice ? (
        <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, ...destructiveStyle }}>
          {error}
        </p>
      ) : null}

      {state.kind === 'loading' ? (
        <div>
          <Spinner size="sm" aria-label="Loading Slack settings" />
        </div>
      ) : null}

      {state.kind === 'failed' ? (
        <div role="alert" style={{ fontSize: 13, ...destructiveStyle }}>
          {state.message}{' '}
          <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}

      {data ? (
        <>
          {!data.available ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
              AGI Workforce in Slack is not set up on this service yet.
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
            description="When a Slack answer needs a tool that asks first, it waits here. Nothing runs until you decide."
          >
            {data.approvals.length === 0 ? (
              <EmptyRow>Nothing is waiting for you.</EmptyRow>
            ) : (
              <ul style={{ listStyle: 'none', margin: 'var(--space-3) 0 0', padding: 0 }}>
                {data.approvals.map((approval) => (
                  <ApprovalItem
                    key={approval.runId}
                    approval={approval}
                    busy={busy === `approval:${approval.runId}`}
                    onDecide={(decision) => decide(approval, decision)}
                  />
                ))}
              </ul>
            )}
          </Card>

          <Card
            id="settings-slack-links-heading"
            title="Your Slack accounts"
            description="Slack accounts that AGI Workforce answers as you. To link one, send the app a message in Slack and follow the link it sends back."
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
                      disabled={busy !== null}
                      onClick={() =>
                        confirm({
                          title: `Disconnect your Slack account in ${link.teamName}?`,
                          description:
                            'AGI Workforce stops answering this Slack account, and the record of its Slack answers is deleted, including any answer still waiting for your approval. Answers already posted stay in Slack, and tasks it started stay in your tasks. You can link it again by messaging the app.',
                          confirmLabel: 'Disconnect',
                          destructive: true,
                          onConfirm: () => unlink(link.id, link.teamName),
                        })
                      }
                    >
                      {busy === `link:${link.id}` ? <Spinner size="sm" aria-hidden="true" /> : null}
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
            description="Add the app to a Slack workspace, then invite it to channels with /invite. Anyone there can link their own account."
            action={
              data.available ? (
                <Button asChild size="sm">
                  <a href={SLACK_INSTALL_PATH}>Add to Slack</a>
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
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      style={destructiveStyle}
                      disabled={busy !== null}
                      onClick={() =>
                        confirm({
                          title: `Remove AGI Workforce from ${installation.teamName}?`,
                          description: `The app is uninstalled from ${installation.teamName}. Everyone there stops getting answers, every linked Slack account in it is disconnected, and answers waiting for approval are dropped. This cannot be undone; you can add the app again later.`,
                          confirmLabel: 'Remove',
                          destructive: true,
                          onConfirm: () =>
                            removeInstallation(installation.id, installation.teamName),
                        })
                      }
                    >
                      {busy === `installation:${installation.id}` ? (
                        <Spinner size="sm" aria-hidden="true" />
                      ) : null}
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
