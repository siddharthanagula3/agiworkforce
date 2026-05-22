import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ExtensionStatusDiagnostics } from '@agiworkforce/api';
import { BridgeStatusCard } from '../BridgeStatusCard';

function buildDiagnostics(
  overrides: Partial<ExtensionStatusDiagnostics> = {},
): ExtensionStatusDiagnostics {
  return {
    status: 'ok',
    version: '0.1.0',
    timestamp: '2026-05-21T10:00:00Z',
    extension_support: true,
    transport: { native_messaging: true, websocket_port: 8787 },
    diagnostics: {
      recommendations: [],
      realtime_token: { exists: true, valid: true, path: '/x/.ipc_token', error: null },
      native_connection: {
        state: 'connected',
        extension_id: 'kbfnbcaeplbcioakkpcpgfkobkghlhen',
        ready: true,
      },
    },
    commands: ['extension_status'],
    ...overrides,
  };
}

describe('BridgeStatusCard', () => {
  it('renders nothing outside Tauri host', () => {
    const fetcher = vi.fn();
    const { container } = render(<BridgeStatusCard fetcher={fetcher} isTauriHost={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('shows Chrome bridge as connected when native_connection.state is connected', async () => {
    const fetcher = vi.fn().mockResolvedValue(buildDiagnostics());
    render(<BridgeStatusCard fetcher={fetcher} isTauriHost={true} />);
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    const row = await screen.findByTestId('bridge-row-chrome');
    expect(row).toHaveTextContent('Chrome extension');
    expect(row).toHaveTextContent('Connected');
  });

  it('shows VS Code bridge as connected when overall status ok and websocket port present', async () => {
    const fetcher = vi.fn().mockResolvedValue(buildDiagnostics());
    render(<BridgeStatusCard fetcher={fetcher} isTauriHost={true} />);
    const row = await screen.findByTestId('bridge-row-vscode');
    expect(row).toHaveTextContent('VS Code extension');
    expect(row).toHaveTextContent('Connected');
    expect(row).toHaveTextContent('ws://127.0.0.1:8787');
  });

  it('marks both bridges in error when realtime token is invalid', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      buildDiagnostics({
        status: 'degraded',
        diagnostics: {
          recommendations: ['Restart the desktop app to regenerate .ipc_token.'],
          realtime_token: { exists: true, valid: false, path: '/x/.ipc_token', error: 'empty' },
          native_connection: { state: 'connected', extension_id: 'abc', ready: false },
        },
      }),
    );
    render(<BridgeStatusCard fetcher={fetcher} isTauriHost={true} />);
    const chrome = await screen.findByTestId('bridge-row-chrome');
    const vscode = await screen.findByTestId('bridge-row-vscode');
    expect(chrome).toHaveTextContent('Error');
    expect(vscode).toHaveTextContent('Error');
  });

  it('shows the first recommendation when present', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      buildDiagnostics({
        status: 'degraded',
        diagnostics: {
          recommendations: ['Reconnect the browser extension.'],
          realtime_token: { exists: true, valid: true, path: '/x/.ipc_token', error: null },
          native_connection: { state: 'disconnected', extension_id: null, ready: false },
        },
      }),
    );
    render(<BridgeStatusCard fetcher={fetcher} isTauriHost={true} />);
    const tip = await screen.findByTestId('bridge-recommendation');
    expect(tip).toHaveTextContent('Reconnect the browser extension.');
  });

  it('shows Chrome bridge as connecting when native_connection.state is connecting', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      buildDiagnostics({
        diagnostics: {
          recommendations: [],
          realtime_token: { exists: true, valid: true, path: '/x/.ipc_token', error: null },
          native_connection: { state: 'connecting', extension_id: null, ready: false },
        },
      }),
    );
    render(<BridgeStatusCard fetcher={fetcher} isTauriHost={true} />);
    const chrome = await screen.findByTestId('bridge-row-chrome');
    expect(chrome).toHaveTextContent('Connecting');
  });

  it('renders an error banner when the fetcher rejects', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('IPC timeout'));
    render(<BridgeStatusCard fetcher={fetcher} isTauriHost={true} />);
    expect(await screen.findByText('IPC timeout')).toBeInTheDocument();
  });

  it('refetches when the Refresh button is clicked', async () => {
    const fetcher = vi.fn().mockResolvedValue(buildDiagnostics());
    render(<BridgeStatusCard fetcher={fetcher} isTauriHost={true} />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const refresh = screen.getByRole('button', { name: /refresh bridge status/i });
    await userEvent.click(refresh);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
});
