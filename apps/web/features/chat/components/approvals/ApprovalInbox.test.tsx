import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@shared/stores/web-chat-store';
import { ApprovalInbox, collectPendingApprovals } from './ApprovalInbox';

function assistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'I need permission to continue.',
    createdAt: '2026-07-30T12:00:00.000Z',
    ...overrides,
  };
}

describe('ApprovalInbox', () => {
  it('prefers the persisted cloud projection and omits already decided calls', () => {
    const messages: Message[] = [
      assistantMessage({
        metadata: {
          cloudApproval: {
            schemaVersion: 1,
            runId: '5c8e9b8e-cbad-4e76-87cf-e17e7d828c40',
            calls: [
              {
                toolCallId: 'call-read',
                name: 'file_read',
                input: '{"path":"/tmp/report.md"}',
              },
              {
                toolCallId: 'call-write',
                name: 'file_write',
                input: '{"path":"/tmp/report.md"}',
                approvalDecision: 'approved',
              },
            ],
          },
          tools: [
            {
              name: 'file_read',
              status: 'awaiting_approval',
              requiresApproval: true,
              toolCallId: 'call-read',
            },
          ],
        },
      }),
    ];

    expect(collectPendingApprovals(messages)).toEqual([
      expect.objectContaining({
        assistantMessageId: 'assistant-1',
        toolCallId: 'call-read',
        label: 'Read file',
        input: '{\n  "path": "/tmp/report.md"\n}',
      }),
    ]);
  });

  it('falls back to legacy awaiting tool metadata', () => {
    const messages: Message[] = [
      assistantMessage({
        metadata: {
          tools: [
            {
              name: 'shell_command',
              status: 'awaiting_approval',
              requiresApproval: true,
              toolCallId: 'call-shell',
              parameters: { command: 'pnpm test' },
            },
            {
              name: 'file_write',
              status: 'awaiting_approval',
              requiresApproval: true,
              toolCallId: 'call-decided',
              approved: false,
            },
          ],
        },
      }),
    ];

    expect(collectPendingApprovals(messages)).toEqual([
      expect.objectContaining({
        toolCallId: 'call-shell',
        label: 'Run command',
        input: '{\n  "command": "pnpm test"\n}',
      }),
    ]);
  });

  it('routes decisions through the canonical resolver', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    const messages: Message[] = [
      assistantMessage({
        metadata: {
          cloudApproval: {
            schemaVersion: 1,
            runId: '5c8e9b8e-cbad-4e76-87cf-e17e7d828c40',
            calls: [{ toolCallId: 'call-read', name: 'file_read' }],
          },
        },
      }),
    ];

    render(<ApprovalInbox messages={messages} onResolve={onResolve} isApprovalLive={() => true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Approvals (1 pending)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve Read file' }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith('assistant-1', 'call-read', 'approved', undefined);
    });
  });

  it('sends typed guidance with the decision so a run can be redirected without stopping it', async () => {
    const onResolve = vi.fn(async () => {});
    render(
      <ApprovalInbox
        messages={[
          assistantMessage({
            metadata: {
              cloudApproval: {
                schemaVersion: 1,
                runId: '5c8e9b8e-cbad-4e76-87cf-e17e7d828c40',
                calls: [{ toolCallId: 'call-read', name: 'file_read' }],
              },
            },
          }),
        ]}
        onResolve={onResolve}
        isApprovalLive={() => true}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approvals (1 pending)' }));
    fireEvent.change(await screen.findByLabelText('Guidance for Read file'), {
      target: { value: '  Read the changelog instead.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve Read file' }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith(
        'assistant-1',
        'call-read',
        'approved',
        'Read the changelog instead.',
      );
    });
  });

  it('keeps expired approvals visible without actionable decision buttons', async () => {
    render(
      <ApprovalInbox
        messages={[
          assistantMessage({
            metadata: {
              cloudApproval: {
                schemaVersion: 1,
                runId: '5c8e9b8e-cbad-4e76-87cf-e17e7d828c40',
                calls: [{ toolCallId: 'call-read', name: 'file_read' }],
              },
            },
          }),
        ]}
        onResolve={vi.fn()}
        isApprovalLive={() => false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approvals (1 pending)' }));

    expect(await screen.findByText(/this request expired/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve Read file' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject Read file' })).not.toBeInTheDocument();
  });
});
