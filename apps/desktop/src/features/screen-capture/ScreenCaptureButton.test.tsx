import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CaptureResult } from '../../types/capture';
import { TooltipProvider } from '@/ui/Tooltip';

const captureRegionMock = vi.fn();
const captureWindowMock = vi.fn();
const captureFullScreenMock = vi.fn();
const getAvailableWindowsMock = vi.fn();

vi.mock('../../hooks/useScreenCapture', () => ({
  useScreenCapture: () => ({
    captureFullScreen: captureFullScreenMock,
    captureRegion: captureRegionMock,
    captureWindow: captureWindowMock,
    getAvailableWindows: getAvailableWindowsMock,
    isCapturing: false,
  }),
}));

vi.mock('../../lib/tauri-mock', () => ({
  isTauri: true,
}));

import { GLOBAL_SHORTCUTS, RENDERER_SHORTCUTS } from '../../constants/shortcuts';
import { ScreenCaptureButton } from './ScreenCaptureButton';

describe('ScreenCaptureButton', () => {
  const captureResult: CaptureResult = {
    id: 'capture-1',
    path: '/tmp/capture.png',
    captureType: 'region',
    metadata: {
      width: 200,
      height: 100,
      windowTitle: null,
      region: null,
      screenIndex: null,
    },
    createdAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    captureRegionMock.mockResolvedValue(captureResult);
    captureFullScreenMock.mockResolvedValue(captureResult);
    captureWindowMock.mockResolvedValue(captureResult);
    getAvailableWindowsMock.mockResolvedValue([]);
  });

  it('advertises no capture accelerator the shortcut registry never binds', async () => {
    const boundKeys = new Set(
      [...RENDERER_SHORTCUTS, ...GLOBAL_SHORTCUTS].map((shortcut) => shortcut.key.toLowerCase()),
    );
    expect(boundKeys.has('r')).toBe(false);
    expect(boundKeys.has('w')).toBe(false);

    render(
      <TooltipProvider>
        <ScreenCaptureButton />
      </TooltipProvider>,
    );
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });

    const menu = await screen.findByRole('menu');
    expect(menu).toHaveTextContent('Capture Region');
    expect(menu).toHaveTextContent('Capture Window');
    expect(menu.textContent).not.toMatch(/(ctrl|cmd|command|control|alt|opt|meta)\s*\+/i);
  });

  it('uses native desktop region picker on macOS in Tauri mode', async () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
    });

    render(
      <TooltipProvider>
        <ScreenCaptureButton mode="quick" />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getAllByRole('button')[0]!);

    await waitFor(() => {
      expect(screen.getByText('Click and drag to select a region')).toBeInTheDocument();
    });
  });

  it('opens the window selector from the quick panel without a menu', async () => {
    getAvailableWindowsMock.mockResolvedValue([
      { handle: 'win-1', title: 'Notes', process: 'notes.app' },
    ]);

    render(
      <TooltipProvider>
        <ScreenCaptureButton mode="quick" />
      </TooltipProvider>,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]!);

    await waitFor(() => {
      expect(getAvailableWindowsMock).toHaveBeenCalled();
      expect(screen.getByText('Select Window to Capture')).toBeInTheDocument();
    });
  });

  it('reports the capture through onCaptureComplete when a window is selected from the quick panel', async () => {
    getAvailableWindowsMock.mockResolvedValue([
      { handle: 'win-1', title: 'Notes', process: 'notes.app' },
    ]);
    const onCaptureComplete = vi.fn();

    render(
      <TooltipProvider>
        <ScreenCaptureButton mode="quick" onCaptureComplete={onCaptureComplete} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getAllByRole('button')[1]!);
    const windowOption = await screen.findByText('Notes');
    fireEvent.click(windowOption);
    fireEvent.click(screen.getByRole('button', { name: /Capture \(Enter\)/i }));

    await waitFor(() => {
      expect(captureWindowMock).toHaveBeenCalledWith('win-1', undefined);
      expect(onCaptureComplete).toHaveBeenCalledWith(captureResult);
    });
  });
});
