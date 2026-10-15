import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useMcpStore } from '../../../stores/mcpStore';
import { TooltipProvider } from '@/ui/Tooltip';
import { ConnectorHealthDashboard } from '../ConnectorHealthDashboard';

describe('ConnectorHealthDashboard', () => {
  beforeEach(() => {
    useMcpStore.setState({ servers: [], health: [], isLoading: false });
  });

  it('shows how many tools each server offers, as the native server list reports it', () => {
    useMcpStore.setState({
      // One entry of the `mcp_list_servers` reply (sys/commands/mcp.rs, camelCase).
      servers: [
        {
          name: 'github',
          enabled: true,
          connected: true,
          toolCount: 4,
          command: 'npx',
          local: true,
          sandboxed: true,
        },
      ],
    });

    render(
      <TooltipProvider>
        <ConnectorHealthDashboard />
      </TooltipProvider>,
    );

    expect(screen.getByText('4 tools')).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });
});
