import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CaptureResult } from '../../types/capture';
import { TooltipProvider } from '../ui/Tooltip';

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
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(captureRegionMock).toHaveBeenCalledWith(
        { x: 0, y: 0, width: 1, height: 1 },
        undefined,
      );
    });
    expect(screen.queryByText('Click and drag to select a region')).not.toBeInTheDocument();
  });
});
