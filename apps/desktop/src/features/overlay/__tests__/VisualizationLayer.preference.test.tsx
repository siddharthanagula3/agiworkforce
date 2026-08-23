import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockListen } = vi.hoisted(() => ({
  mockListen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock('../../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listen: (...args: unknown[]) => mockListen(...(args as [])),
}));

import { VisualizationLayer } from '../VisualizationLayer';
import { useSettingsStore } from '../../../stores/settingsStore';

function setOverlayPreference(showComputerUseOverlay: boolean) {
  useSettingsStore.setState((state) => ({
    executionPreferences: { ...state.executionPreferences, showComputerUseOverlay },
  }));
}

describe('VisualizationLayer overlay preference', () => {
  beforeEach(() => {
    mockListen.mockClear();
    setOverlayPreference(true);
  });

  it('subscribes to the automation animation stream while the preference is on', async () => {
    render(<VisualizationLayer />);

    await waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith('overlay:animate', expect.any(Function));
    });
  });

  it('renders nothing and never subscribes once the preference is off', () => {
    setOverlayPreference(false);
    const { container } = render(<VisualizationLayer />);

    expect(mockListen).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
