import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentActivityState, AgentActivityToolEntry } from '@agiworkforce/client-runtime';

import { AgentActivityTimeline, buildAgentActivitySummary } from '../AgentActivityTimeline';

afterEach(cleanup);

const renderMark = (serverId: string) =>
  serverId === 'gmail' ? <svg data-testid="connector-mark" data-server={serverId} /> : undefined;

function gmailStep(overrides: Partial<AgentActivityToolEntry> = {}): AgentActivityToolEntry {
  return {
    kind: 'tool',
    id: `tool:${overrides.toolCallId ?? 'gmail-1'}`,
    toolCallId: 'gmail-1',
    name: 'mcp__gmail__search_threads',
    category: 'connector',
    summary: 'Using Gmail connector',
    status: 'running',
    input: { query: 'from:nils' },
    startedAtMs: 1_100,
    ...overrides,
  };
}

function run(
  entries: AgentActivityToolEntry[],
  status: AgentActivityState['status'] = 'running',
): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    turnId: 'turn-1',
    lastSequence: 4,
    status,
    startedAtMs: 1_000,
    updatedAtMs: 66_000,
    ...(status === 'running' ? {} : { completedAtMs: 66_000 }),
    entries,
  };
}

function rowLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.inline-tool-call__label')].map(
    (node) => node.textContent ?? '',
  );
}

describe('AgentActivityTimeline · connector steps', () => {
  it('words the step on every surface and keeps the letter badge where no mark is supplied', () => {
    const { container } = render(
      <AgentActivityTimeline
        defaultExpanded
        activity={run([gmailStep({ status: 'completed' })], 'completed')}
      />,
    );
    expect(rowLabels(container)).toEqual(['Searched Gmail']);
    expect(
      container.querySelector('[data-badge-kind="letter"]')?.getAttribute('data-badge-letter'),
    ).toBe('G');
    expect(container.querySelector('[data-badge-kind="mark"]')).toBeNull();
  });

  it('shows the running sentence and the surface mark while the call is in flight', () => {
    const { container } = render(
      <AgentActivityTimeline
        defaultExpanded
        activity={run([gmailStep()])}
        renderConnectorMark={renderMark}
      />,
    );
    expect(rowLabels(container)).toEqual(['Searching Gmail']);
    expect(screen.getByTestId('connector-mark').getAttribute('data-server')).toBe('gmail');
    expect(container.querySelector('[data-badge-kind="letter"]')).toBeNull();
  });

  it('turns the sentence to the past tense once the same row has finished', () => {
    const { container, rerender } = render(
      <AgentActivityTimeline
        defaultExpanded
        activity={run([gmailStep()])}
        renderConnectorMark={renderMark}
      />,
    );
    expect(rowLabels(container)).toEqual(['Searching Gmail']);

    rerender(
      <AgentActivityTimeline
        defaultExpanded
        activity={run([gmailStep({ status: 'completed', output: '[]', elapsedMs: 900 })])}
        renderConnectorMark={renderMark}
      />,
    );
    expect(rowLabels(container)).toEqual(['Searched Gmail']);
    expect(screen.getByTestId('connector-mark')).toBeTruthy();
  });

  it('reads a row stored before the sentence existed the same way', () => {
    const { container } = render(
      <AgentActivityTimeline
        defaultExpanded
        activity={run(
          [
            gmailStep({
              status: 'completed',
              summary: 'Using Gmail connector',
              completedAtMs: 2_000,
              elapsedMs: 900,
            }),
          ],
          'completed',
        )}
      />,
    );
    expect(rowLabels(container)).toEqual(['Searched Gmail']);
    expect(container.textContent).not.toContain('Using Gmail connector');
  });

  it.each<[Partial<AgentActivityToolEntry>, string]>([
    [{ status: 'pending' }, 'Searching Gmail'],
    [{ status: 'awaiting-device' }, 'Searching Gmail'],
    [{ status: 'cancelled' }, 'Stopped searching Gmail'],
    [{ status: 'failed', error: 'Gmail answered HTTP 500.' }, 'Could not search Gmail'],
  ])('words a step in status %j', (overrides, sentence) => {
    const { container } = render(
      <AgentActivityTimeline defaultExpanded activity={run([gmailStep(overrides)], 'partial')} />,
    );
    expect(rowLabels(container)[0]).toBe(sentence);
  });

  it('keeps the tool loop wording on an approval prompt and on a declined call', () => {
    const waiting = render(
      <AgentActivityTimeline
        defaultExpanded
        activity={run(
          [
            gmailStep({
              status: 'awaiting-approval',
              summary: 'Review Gmail action',
              approval: { id: 'approval-1' },
            }),
          ],
          'awaiting-approval',
        )}
        renderConnectorMark={renderMark}
      />,
    );
    expect(rowLabels(waiting.container)).toEqual(['Review Gmail action']);
    expect(screen.getByTestId('connector-mark')).toBeTruthy();
    waiting.unmount();

    const declined = render(
      <AgentActivityTimeline
        defaultExpanded
        activity={run(
          [
            gmailStep({
              status: 'failed',
              summary: 'Review Gmail action',
              error: 'Tool use denied',
              approval: { id: 'approval-2', decision: 'denied' },
            }),
          ],
          'completed',
        )}
      />,
    );
    expect(rowLabels(declined.container)).toEqual(['Review Gmail action']);
    expect(declined.container.querySelector('.inline-tool-call__suffix')?.textContent).toBe(
      'Error',
    );
  });

  it('asks for a mark only for connector steps, by server id', () => {
    const mark = vi.fn(renderMark);
    const { container } = render(
      <AgentActivityTimeline
        defaultExpanded
        activity={run([
          gmailStep({ name: 'execute_code', category: 'code-execution', summary: 'Running code' }),
          gmailStep({ toolCallId: 'custom-1', name: 'mcp__custom-a1b2c3d4e5__search_orders' }),
        ])}
        renderConnectorMark={mark}
      />,
    );
    expect(mark.mock.calls.map(([serverId]) => serverId)).toEqual(['custom-a1b2c3d4e5']);
    expect(rowLabels(container)).toEqual(['Running code', 'Searching Gmail']);
    expect(container.querySelector('[data-badge-kind="mark"]')).toBeNull();
  });

  it('names a custom connector from the summary and keeps its letter badge', () => {
    const { container } = render(
      <AgentActivityTimeline
        defaultExpanded
        activity={run(
          [
            gmailStep({
              name: 'mcp__custom-a1b2c3d4e5__search_orders',
              summary: 'Using Acme Logistics connector',
              status: 'completed',
            }),
          ],
          'completed',
        )}
        renderConnectorMark={renderMark}
      />,
    );
    expect(rowLabels(container)).toEqual(['Searched Acme Logistics']);
    expect(
      container.querySelector('[data-badge-kind="letter"]')?.getAttribute('data-badge-letter'),
    ).toBe('A');
    expect(container.textContent).not.toMatch(/custom-a1b2c3d4e5/);
  });

  it('leaves a quiet notice for a connector that was never runnable unchanged', () => {
    const { container } = render(
      <AgentActivityTimeline
        defaultExpanded
        activity={run(
          [
            gmailStep({
              status: 'failed',
              unavailable: true,
              summary: 'mcp__gmail__search_threads was not available for this request.',
            }),
            gmailStep({ toolCallId: 'gmail-2', status: 'completed' }),
          ],
          'partial',
        )}
      />,
    );
    expect(container.textContent).toContain(
      'mcp__gmail__search_threads was not available for this request.',
    );
  });

  it('uses the sentence on the collapsed run line too', () => {
    const now = 5_000;
    expect(buildAgentActivitySummary(run([gmailStep()]), now)).toBe('Searching Gmail');
    expect(
      buildAgentActivitySummary(
        run([gmailStep({ status: 'failed', summary: 'The tool failed', error: 'boom' })], 'failed'),
        now,
      ),
    ).toBe('Could not search Gmail');
  });
});

describe('AgentActivityTimeline · connector steps in AGI Work', () => {
  it('keeps the elapsed counter on the run line and the sentences and marks on the rows', () => {
    const { container } = render(
      <AgentActivityTimeline
        defaultExpanded
        workMode="agiwork"
        activity={run(
          [
            gmailStep({ status: 'completed', elapsedMs: 900 }),
            gmailStep({
              toolCallId: 'gmail-2',
              name: 'mcp__gmail__get_thread',
              status: 'completed',
              elapsedMs: 700,
            }),
          ],
          'completed',
        )}
        renderConnectorMark={renderMark}
      />,
    );
    expect(screen.getByRole('button', { name: /agent activity/i }).textContent).toContain(
      'Worked for 1m 5s',
    );
    expect(rowLabels(container)).toEqual(['Searched Gmail', 'Read from Gmail']);
    expect(screen.getAllByTestId('connector-mark')).toHaveLength(2);
  });
});

describe('AgentActivityTimeline · why a connector step failed', () => {
  const SECRET_URL = 'https://user:hunter2@gmail.example/v1?access_token=ya29.secret';
  const RAW_PROVIDER_TEXT = `quota exceeded for ${SECRET_URL}\n    at fetchThreads (/srv/gmail.js:10:3)`;

  function failedRow(error: string, overrides: Partial<AgentActivityToolEntry> = {}) {
    return render(
      <AgentActivityTimeline
        defaultExpanded
        activity={run(
          [
            gmailStep({
              status: 'failed',
              summary: 'The tool failed',
              output: error,
              error,
              completedAtMs: 2_000,
              ...overrides,
            }),
          ],
          'failed',
        )}
      />,
    );
  }

  it.each([
    ['Gmail answered HTTP 429.', 'Rate limited, try again in a minute.'],
    ['Gmail answered HTTP 404.', 'The item was not found.'],
    ['Gmail answered HTTP 403.', 'Permission denied.'],
    [
      'Tool mcp__gmail__search_threads timed out after 120s and was abandoned.',
      'It took too long to respond.',
    ],
    [
      'Acme rejected the saved credential (HTTP 401). Ask the user to update this connector’s token in Settings > Connectors, then try again.',
      'The saved credential was rejected.',
    ],
  ])('says why on the collapsed row for %j', (error, reason) => {
    const { container } = failedRow(error);
    expect(rowLabels(container)).toEqual([`Could not search Gmail. ${reason}`]);
    expect(container.querySelector('.inline-tool-call__suffix')).toBeNull();
  });

  it('gives a failure it cannot classify the plain sentence and nothing invented', () => {
    const { container } = failedRow('Connector endpoint blocked by security policy.');
    expect(rowLabels(container)).toEqual(['Could not search Gmail']);
    expect(container.querySelector('.inline-tool-call__suffix')?.textContent).toBe('Error');
  });

  it('never puts the provider message, a credentialed URL or a stack frame on the collapsed row', () => {
    const fenced = [
      'Connector tool error:',
      '<mcp_tool_result untrusted="true" server="Gmail" tool="search_threads" status="rejected" phase="call_tool">',
      'The failure text below comes from the connection to a remote MCP server.',
      `Error POSTing to endpoint (HTTP 429): ${RAW_PROVIDER_TEXT}`,
      '</mcp_tool_result>',
    ].join('\n');
    const { container } = failedRow(fenced);
    const bar = container.querySelector('.inline-tool-call__bar');
    expect(rowLabels(container)).toEqual([
      'Could not search Gmail. Rate limited, try again in a minute.',
    ]);
    expect(bar?.getAttribute('aria-label')).toBe(
      'Could not search Gmail. Rate limited, try again in a minute.',
    );
    for (const leaked of ['hunter2', 'ya29', 'quota exceeded', 'fetchThreads', 'mcp_tool_result']) {
      expect(bar?.textContent).not.toContain(leaked);
      expect(bar?.getAttribute('aria-label')).not.toContain(leaked);
    }
  });

  it('names the authorization problem on the row and leaves the one reconnect card to act on it', () => {
    const envelope = JSON.stringify({
      agi_connector_authorization_required: true,
      connectorId: 'gmail',
      connectorName: 'Gmail',
      toolName: 'search_threads',
      reason: 'authorization_expired',
      connectUrl: '/api/connectors/oauth/start?connectorId=gmail',
      scopes: [],
      message: 'The Gmail authorization for this account has expired or was revoked.',
    });
    const { container } = render(
      <AgentActivityTimeline
        activity={run(
          [
            gmailStep({
              status: 'failed',
              summary: 'The tool failed',
              output: envelope,
              error: envelope,
            }),
          ],
          'failed',
        )}
      />,
    );
    expect(rowLabels(container)).toEqual([
      'Could not search Gmail. Its authorization expired or was revoked.',
    ]);
    expect(screen.getAllByTestId('connector-connect-card')).toHaveLength(1);
    expect(container.textContent).not.toContain('agi_connector_authorization_required');
  });

  it('takes the connector name from a verified reconnect request when the summary lost it', () => {
    const envelope = JSON.stringify({
      agi_connector_authorization_required: true,
      connectorId: 'custom-a1b2c3d4e5',
      connectorName: 'Acme Logistics',
      toolName: 'search_orders',
      reason: 'not_connected',
      connectUrl: null,
      scopes: [],
      message: 'Acme Logistics is not connected for this account.',
    });
    const { container } = failedRow(envelope, {
      name: 'mcp__custom-a1b2c3d4e5__search_orders',
    });
    expect(rowLabels(container)).toEqual(['Could not search Acme Logistics. It is not connected.']);
  });
});
