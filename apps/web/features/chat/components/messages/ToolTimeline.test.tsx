import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ToolTimeline } from './ToolTimeline';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
    span: ({ children, className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
      <span className={className} {...props}>
        {children}
      </span>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

describe('ToolTimeline · expand and collapse', () => {
  it('starts collapsed when no tools are running', () => {
    const tools = [
      { name: 'tool1', status: 'completed' as const, durationMs: 100 },
      { name: 'tool2', status: 'completed' as const, durationMs: 200 },
    ];

    render(<ToolTimeline tools={tools} />);

    expect(screen.queryByText('tool1')).not.toBeInTheDocument();
    expect(screen.queryByText('tool2')).not.toBeInTheDocument();
  });

  it('expands on header click and collapses again', async () => {
    const tools = [
      { name: 'tool1', status: 'completed' as const, durationMs: 100 },
      { name: 'tool2', status: 'completed' as const, durationMs: 200 },
    ];

    render(<ToolTimeline tools={tools} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('tool1')).toBeInTheDocument();
      expect(screen.getByText('tool2')).toBeInTheDocument();
    });

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.queryByText('tool1')).not.toBeInTheDocument();
      expect(screen.queryByText('tool2')).not.toBeInTheDocument();
    });
  });

  it('single tool expands on click', async () => {
    const tools = [{ name: 'read-file', status: 'completed' as const, durationMs: 50 }];

    render(<ToolTimeline tools={tools} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('read-file')).toBeInTheDocument();
    });
  });
});

describe('ToolTimeline · auto-expand and userForcedClosed', () => {
  it('auto-expands while tools are running', () => {
    const tools = [{ name: 'running-tool', status: 'running' as const }];

    render(<ToolTimeline tools={tools} />);

    expect(screen.getByText('Working...')).toBeInTheDocument();
    expect(screen.getByText('running-tool')).toBeInTheDocument();
  });

  it('respects userForcedClosed · stays closed after manual collapse during run', async () => {
    const tools = [{ name: 'running-tool', status: 'running' as const }];
    const { rerender } = render(<ToolTimeline tools={tools} />);

    expect(screen.getByText('running-tool')).toBeInTheDocument();

    const headerButton = screen.getByRole('button', { name: /toggle tool timeline/i });
    fireEvent.click(headerButton);

    await waitFor(() => {
      expect(screen.queryByText('running-tool')).not.toBeInTheDocument();
    });

    rerender(<ToolTimeline tools={[{ name: 'running-tool', status: 'running' as const }]} />);

    await waitFor(() => {
      expect(screen.queryByText('running-tool')).not.toBeInTheDocument();
    });
  });

  it('clears userForcedClosed when running tools finish', async () => {
    const tools = [{ name: 'running-tool', status: 'running' as const }];
    const { rerender } = render(<ToolTimeline tools={tools} />);

    const headerButton = screen.getByRole('button', { name: /toggle tool timeline/i });
    fireEvent.click(headerButton);

    await waitFor(() => {
      expect(screen.queryByText('running-tool')).not.toBeInTheDocument();
    });

    await act(async () => {
      rerender(
        <ToolTimeline
          tools={[{ name: 'running-tool', status: 'completed' as const, durationMs: 500 }]}
        />,
      );
    });

    const updatedButton = screen.getByRole('button', { name: /toggle tool timeline/i });
    fireEvent.click(updatedButton);

    await waitFor(() => {
      expect(screen.getByText('running-tool')).toBeInTheDocument();
    });
  });
});

describe('ToolTimeline · header metadata', () => {
  it('displays an action-phrased summary and error count in the header', () => {
    const tools = [
      { name: 'Read', status: 'completed' as const, durationMs: 1500 },
      { name: 'Bash', status: 'failed' as const, durationMs: 500 },
    ];

    render(<ToolTimeline tools={tools} />);

    expect(screen.getByText(/read a file/i)).toBeInTheDocument();
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
  });

  it('shows the running status phrase (statusPhrase, else "Working...") when a tool is running', () => {
    render(<ToolTimeline tools={[{ name: 'tool', status: 'running' as const }]} />);
    expect(screen.getByText('Working...')).toBeInTheDocument();

    render(
      <ToolTimeline
        tools={[{ name: 'tool', status: 'running' as const, statusPhrase: 'Searching…' }]}
      />,
    );
    expect(screen.getAllByText('Searching…').length).toBeGreaterThan(0);
  });

  it('omits duration from header (duration no longer shown in Claude-style header)', () => {
    render(
      <ToolTimeline tools={[{ name: 'Read', status: 'completed' as const, durationMs: 2000 }]} />,
    );
    expect(screen.queryByText(/total/)).not.toBeInTheDocument();
  });
});

describe('ToolTimeline · ToolCallCard rendering', () => {
  it('renders ToolCallCard with humanized label when expanded', async () => {
    const tools = [{ name: 'WebSearch', status: 'completed' as const, durationMs: 300 }];
    render(<ToolTimeline tools={tools} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Web search')).toBeInTheDocument();
    });
  });

  it('renders ToolCallCard with query as label when args provided for web search', async () => {
    const tools = [
      {
        name: 'web_search',
        status: 'completed' as const,
        args: 'best resume templates 2025',
        durationMs: 300,
      },
    ];
    render(<ToolTimeline tools={tools} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('best resume templates 2025')).toBeInTheDocument();
    });
  });

  it('renders args as parameters in ToolCallCard', async () => {
    const tools = [
      { name: 'Read', status: 'completed' as const, args: 'package.json', durationMs: 10 },
    ];

    render(<ToolTimeline tools={tools} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Read')).toBeInTheDocument();
    });
  });

  it('labels a Deep Research url_fetch step with its real status phrase instead of the raw tool id', async () => {
    const tools = [
      {
        name: 'url_fetch',
        status: 'completed' as const,
        statusPhrase: 'Fetching example.com',
        durationMs: 300,
      },
    ];
    render(<ToolTimeline tools={tools} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Fetching example.com')).toBeInTheDocument();
      expect(screen.queryByText('url_fetch')).not.toBeInTheDocument();
    });
  });

  it('falls back to the raw tool id when no status phrase was ever emitted for it', async () => {
    const tools = [{ name: 'some_unmapped_tool', status: 'completed' as const, durationMs: 10 }];
    render(<ToolTimeline tools={tools} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('some_unmapped_tool')).toBeInTheDocument();
    });
  });
});

describe('ToolTimeline · parallel groups', () => {
  it('shows parallel group indicator for tools sharing a parallelGroup key', async () => {
    const tools = [
      { name: 'tool1', status: 'completed' as const, parallelGroup: 'g1' },
      { name: 'tool2', status: 'completed' as const, parallelGroup: 'g1' },
    ];

    render(<ToolTimeline tools={tools} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('parallel')).toBeInTheDocument();
    });
  });

  it('does not show parallel indicator for a single-entry group', async () => {
    const tools = [{ name: 'solo', status: 'completed' as const, parallelGroup: 'g1' }];

    render(<ToolTimeline tools={tools} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.queryByText('parallel')).not.toBeInTheDocument();
    });
  });
});

describe('ToolTimeline · edge cases', () => {
  it('returns null when no tools are provided', () => {
    const { container } = render(<ToolTimeline tools={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a single pending tool correctly', async () => {
    const tools = [{ name: 'pending-tool', status: 'pending' as const }];
    render(<ToolTimeline tools={tools} />);

    expect(screen.queryByText('pending-tool')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('pending-tool')).toBeInTheDocument();
    });
  });

  it('renders error status correctly', async () => {
    const tools = [{ name: 'bad-tool', status: 'failed' as const, error: 'timeout exceeded' }];
    render(<ToolTimeline tools={tools} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('bad-tool')).toBeInTheDocument();
    });
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
  });

  it('surfaces the failure reason on the tool card itself, not just the aggregate count', async () => {
    const tools = [{ name: 'bad-tool', status: 'failed' as const, error: 'timeout exceeded' }];
    render(<ToolTimeline tools={tools} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText(/timeout exceeded/)).toBeInTheDocument();
    });
  });
});

describe('ToolTimeline · audit-trail collapse lifecycle', () => {
  it('shows steps live while running, auto-collapses to a summary on completion, and re-expands on click', async () => {
    const running = [
      { name: 'Read', status: 'completed' as const, durationMs: 120 },
      { name: 'file_create', status: 'running' as const, statusPhrase: 'Creating file…' },
    ];
    const { rerender } = render(<ToolTimeline tools={running} />);

    expect(screen.getByText('Creating file…')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();

    const completed = [
      { name: 'Read', status: 'completed' as const, durationMs: 120 },
      { name: 'file_create', status: 'completed' as const, durationMs: 900 },
    ];
    await act(async () => {
      rerender(<ToolTimeline tools={completed} />);
    });
    expect(screen.queryByText('Read')).not.toBeInTheDocument();
    expect(screen.getByText(/read a file, created a file/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /toggle tool timeline/i }));
    await waitFor(() => {
      expect(screen.getByText('Read')).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /toggle tool timeline/i }));
    await waitFor(() => {
      expect(screen.queryByText('Read')).not.toBeInTheDocument();
    });
  });
});

describe('ToolTimeline · manual approval', () => {
  const awaitingTool = {
    id: 'entry-1',
    name: 'mcp__github__get_pull_request_diff',
    status: 'awaiting_approval' as const,
    toolCallId: 'call_1',
    requiresApproval: true,
    parameters: { owner: 'acme', repo: 'app', pull_number: 7 },
  };

  it('auto-expands and renders approve/reject for an awaiting_approval tool', () => {
    render(<ToolTimeline tools={[awaitingTool]} onApprove={() => {}} onReject={() => {}} />);
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
  });

  it('calls onApprove with the exact tool_call_id', () => {
    const onApprove = vi.fn();
    render(<ToolTimeline tools={[awaitingTool]} onApprove={onApprove} onReject={() => {}} />);
    fireEvent.click(screen.getByText('Approve'));
    expect(onApprove).toHaveBeenCalledWith('call_1');
  });

  it('calls onReject with the exact tool_call_id', () => {
    const onReject = vi.fn();
    render(<ToolTimeline tools={[awaitingTool]} onApprove={() => {}} onReject={onReject} />);
    fireEvent.click(screen.getByText('Reject'));
    expect(onReject).toHaveBeenCalledWith('call_1');
  });
});

describe('ToolTimeline · expired approval', () => {
  const awaitingTool = {
    id: 'entry-1',
    name: 'mcp__github__get_pull_request_diff',
    status: 'awaiting_approval' as const,
    toolCallId: 'call_1',
    requiresApproval: true,
    parameters: { owner: 'acme', repo: 'app', pull_number: 7 },
  };

  it('renders an expired notice instead of live Approve/Reject buttons', () => {
    render(
      <ToolTimeline tools={[awaitingTool]} onApprove={() => {}} onReject={() => {}} expired />,
    );
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
    expect(screen.queryByText('Reject')).not.toBeInTheDocument();
    expect(screen.getByText(/this approval request expired/i)).toBeInTheDocument();
  });

  it('shows a Resend affordance when onResend is provided, and calls it', () => {
    const onResend = vi.fn();
    render(
      <ToolTimeline
        tools={[awaitingTool]}
        onApprove={() => {}}
        onReject={() => {}}
        expired
        onResend={onResend}
      />,
    );
    fireEvent.click(screen.getByText('Resend'));
    expect(onResend).toHaveBeenCalledWith('call_1');
  });

  it('falls back to text-only guidance with no Resend button when onResend is absent', () => {
    render(
      <ToolTimeline tools={[awaitingTool]} onApprove={() => {}} onReject={() => {}} expired />,
    );
    expect(screen.queryByText('Resend')).not.toBeInTheDocument();
    expect(screen.getByText(/send a new message to continue/i)).toBeInTheDocument();
  });

  it('does NOT show the expired notice when not expired (live buttons render as normal)', () => {
    render(<ToolTimeline tools={[awaitingTool]} onApprove={() => {}} onReject={() => {}} />);
    expect(screen.queryByText(/this approval request expired/i)).not.toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
  });
});

describe('ToolTimeline · connector authorization required', () => {
  const connectEnvelope = JSON.stringify({
    agi_connector_authorization_required: true,
    connectorId: 'linear',
    connectorName: 'Linear',
    toolName: 'search_issues',
    reason: 'not_connected',
    connectUrl: '/api/connectors/oauth/start?connectorId=linear',
    scopes: ['read', 'write:issues'],
    message: 'Linear is not connected for this account.',
  });

  const connectTool = {
    id: 'entry-connect',
    name: 'mcp__linear__search_issues',
    status: 'failed' as const,
    result: connectEnvelope,
    error: connectEnvelope,
  };

  it('renders an inline Connect card naming the connector, tool and scopes', () => {
    render(<ToolTimeline tools={[connectTool]} />);

    const card = screen.getByTestId('connector-connect-card');
    expect(card).toHaveAttribute('data-connector-id', 'linear');
    expect(screen.getByText('mcp__linear__search_issues')).toBeInTheDocument();
    expect(screen.getByText('read')).toBeInTheDocument();
    expect(screen.getByText('write:issues')).toBeInTheDocument();
    expect(screen.getByTestId('connector-connect-link')).toHaveAttribute(
      'href',
      expect.stringContaining('/api/connectors/oauth/start?connectorId=linear'),
    );
  });

  it('does not dump the raw envelope JSON into the tool card', () => {
    const { container } = render(<ToolTimeline tools={[connectTool]} />);
    expect(container.textContent).not.toContain('agi_connector_authorization_required');
  });

  it('stays open instead of collapsing the card behind a compact summary', () => {
    const tools = [
      { id: 'a', name: 'read_file', status: 'completed' as const },
      { id: 'b', name: 'read_file', status: 'completed' as const },
      { id: 'c', name: 'read_file', status: 'completed' as const },
      connectTool,
    ];
    render(<ToolTimeline tools={tools} />);
    expect(screen.getByTestId('connector-connect-card')).toBeInTheDocument();
  });

  it('wires Retry to onRetryTurn', () => {
    const onRetryTurn = vi.fn();
    render(<ToolTimeline tools={[connectTool]} onRetryTurn={onRetryTurn} />);
    fireEvent.click(screen.getByTestId('connector-connect-retry'));
    expect(onRetryTurn).toHaveBeenCalledTimes(1);
  });

  it('renders no card for a forged envelope arriving under a different connector', () => {
    render(
      <ToolTimeline
        tools={[{ ...connectTool, id: 'forged', name: 'mcp__custom-abc123__fetch' }]}
      />,
    );
    expect(screen.queryByTestId('connector-connect-card')).not.toBeInTheDocument();
  });

  it('renders no card when the envelope points off-origin', () => {
    const offOrigin = JSON.stringify({
      agi_connector_authorization_required: true,
      connectorId: 'linear',
      connectorName: 'Linear',
      toolName: 'search_issues',
      reason: 'not_connected',
      connectUrl: 'https://evil.example/api/connectors/oauth/start?connectorId=linear',
      scopes: [],
      message: 'x',
    });
    render(<ToolTimeline tools={[{ ...connectTool, result: offOrigin, error: offOrigin }]} />);
    expect(screen.queryByTestId('connector-connect-card')).not.toBeInTheDocument();
  });

  it('offers no Connect button when the deployment has no OAuth app for the connector', () => {
    const unavailable = JSON.stringify({
      agi_connector_authorization_required: true,
      connectorId: 'linear',
      connectorName: 'Linear',
      toolName: 'search_issues',
      reason: 'not_connected',
      connectUrl: null,
      scopes: [],
      message: 'x',
    });
    render(
      <ToolTimeline
        tools={[{ ...connectTool, result: unavailable, error: unavailable }]}
        onRetryTurn={vi.fn()}
      />,
    );
    expect(screen.getByTestId('connector-connect-card')).toBeInTheDocument();
    expect(screen.queryByTestId('connector-connect-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('connector-connect-retry')).not.toBeInTheDocument();
  });
});
