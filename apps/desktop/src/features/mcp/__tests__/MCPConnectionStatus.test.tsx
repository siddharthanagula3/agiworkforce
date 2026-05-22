import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPConnectionStatus } from '../MCPConnectionStatus';
import { useMcpStore } from '../../../stores/mcpStore';
import type {
  McpExecutionHistoryEntry,
  McpServerHealth,
  McpToolExecutionStats,
} from '../../../types/mcp';

describe('MCPConnectionStatus', () => {
  const refreshServers = vi.fn().mockResolvedValue(undefined);
  const refreshHealth = vi.fn().mockResolvedValue(undefined);
  const checkServerHealth = vi.fn().mockResolvedValue(undefined);
  const refreshExecutionHistory = vi.fn().mockResolvedValue(undefined);
  const refreshToolExecutionStats = vi.fn().mockResolvedValue(undefined);
  const connectServer = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();

    const health: McpServerHealth[] = [
      {
        server_name: 'filesystem',
        status: 'unhealthy',
        last_check: new Date('2026-03-14T10:00:00Z').toISOString(),
        error_message: 'Connection timed out',
        response_time_ms: 750,
        tool_count: 4,
        consecutive_failures: 2,
      },
    ];
    const executionHistory: McpExecutionHistoryEntry[] = [
      {
        tool_id: 'mcp__filesystem__read_file',
        server_name: 'filesystem',
        result: { path: '/tmp/file.txt' },
        duration_ms: 22,
        timestamp: 1_763_000_000,
        success: true,
        error: null,
      },
    ];
    const toolExecutionStats: McpToolExecutionStats[] = [
      {
        tool_id: 'mcp__filesystem__read_file',
        total_executions: 5,
        successful_executions: 4,
        failed_executions: 1,
        avg_duration_ms: 30,
        last_execution: 1_763_000_000,
      },
    ];

    useMcpStore.setState({
      health,
      executionHistory,
      toolExecutionStats,
      refreshServers,
      refreshHealth,
      checkServerHealth,
      refreshExecutionHistory,
      refreshToolExecutionStats,
      connectServer,
    });
  });

  it('renders MCP runtime state from the store', async () => {
    await act(async () => {
      render(<MCPConnectionStatus />);
    });

    expect(screen.getByText('Runtime Health')).toBeInTheDocument();
    expect(screen.getByText('filesystem')).toBeInTheDocument();
    expect(screen.getByText('Recent Tool Executions')).toBeInTheDocument();
    expect(screen.getAllByText('read file')).toHaveLength(2);
    expect(screen.getByText('Executions')).toBeInTheDocument();

    await waitFor(() => {
      expect(refreshHealth).toHaveBeenCalled();
      expect(refreshExecutionHistory).toHaveBeenCalledWith(10);
      expect(refreshToolExecutionStats).toHaveBeenCalled();
    });
  });

  it('routes health actions through the store', async () => {
    render(<MCPConnectionStatus />);

    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));

    await waitFor(() => {
      expect(checkServerHealth).toHaveBeenCalledWith('filesystem');
      expect(connectServer).toHaveBeenCalledWith('filesystem');
    });
  });
});
