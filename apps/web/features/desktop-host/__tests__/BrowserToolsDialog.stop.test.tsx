import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { BrowserPairingState } from '@agiworkforce/local-runtime-contract';

const stopPairedBrowser = vi.fn(async () => ({ stopped: true }));
const readBrowserPairing = vi.fn();
const readBrowserActivity = vi.fn(async () => []);

vi.mock('../lib/runtime-client', async (importOriginal) => {
  const actual = await importOriginal<ImportedModule0>();
  return {
    ...actual,
    stopPairedBrowser,
    readBrowserPairing,
    readBrowserActivity,
  };
});

const { BrowserToolsDialog } = await import('../components/BrowserToolsDialog');

const PAIRED: BrowserPairingState = {
  bridgePort: 47811,
  bridgeListening: true,
  paired: true,
  extensionId: 'a'.repeat(32),
  fingerprint: null,
  pairedAtMs: null,
  connected: true,
  hostInstalled: true,
  installedManifestPaths: [],
  pendingRequest: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  readBrowserPairing.mockResolvedValue(PAIRED);
});

describe('BrowserToolsDialog Stop loading', () => {
  it('stops the paired browser page from Stop loading', async () => {
    render(<BrowserToolsDialog open onClose={vi.fn()} onAttach={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Stop loading' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('Stopped loading.')).toBeInTheDocument();
    expect(stopPairedBrowser).toHaveBeenCalledTimes(1);
  });
});

type ImportedModule0 = typeof import('../lib/runtime-client');
