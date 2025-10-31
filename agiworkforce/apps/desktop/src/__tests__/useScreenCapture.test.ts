import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScreenCapture } from '../hooks/useScreenCapture';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

type TauriInvoke = typeof import('@tauri-apps/api/core')['invoke'];
type InvokeMock = Mock<Parameters<TauriInvoke>, ReturnType<TauriInvoke>>;

async function getInvokeMock(): Promise<InvokeMock> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke as InvokeMock;
}

describe('useScreenCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with correct default values', () => {
    const { result } = renderHook(() => useScreenCapture());

    expect(result.current.isCapturing).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should capture full screen', async () => {
    const invoke = await getInvokeMock();
    const mockResult = {
      id: 'test-id',
      path: '/path/to/capture.png',
      capture_type: 'fullscreen',
      metadata: { width: 1920, height: 1080 },
      created_at: 1700000000,
    };

    invoke.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useScreenCapture());

    let captureResult;
    await act(async () => {
      captureResult = await result.current.captureFullScreen();
    });

    expect(invoke).toHaveBeenCalledWith('capture_screen_full', {});
    expect(captureResult).toEqual({
      id: 'test-id',
      path: '/path/to/capture.png',
      captureType: 'fullscreen',
      thumbnailPath: null,
      metadata: {
        width: 1920,
        height: 1080,
        windowTitle: null,
        region: null,
        screenIndex: null,
      },
      createdAt: 1700000000,
    });
    expect(result.current.isCapturing).toBe(false);
  });

  it('should capture region', async () => {
    const invoke = await getInvokeMock();
    const mockResult = {
      id: 'test-id',
      path: '/path/to/capture.png',
      capture_type: 'region',
      metadata: {
        width: 500,
        height: 400,
        region: { x: 100, y: 100, width: 500, height: 400 },
      },
      created_at: 1700000500,
    };

    invoke.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useScreenCapture());

    const region = { x: 100, y: 100, width: 500, height: 400 };

    let captureResult;
    await act(async () => {
      captureResult = await result.current.captureRegion(region);
    });

    expect(invoke).toHaveBeenCalledWith('capture_screen_region', {
      x: 100,
      y: 100,
      width: 500,
      height: 400,
    });
    expect(captureResult).toEqual({
      id: 'test-id',
      path: '/path/to/capture.png',
      captureType: 'region',
      thumbnailPath: null,
      metadata: {
        width: 500,
        height: 400,
        windowTitle: null,
        region: { x: 100, y: 100, width: 500, height: 400 },
        screenIndex: null,
      },
      createdAt: 1700000500,
    });
  });

  it('should handle capture errors', async () => {
    const invoke = await getInvokeMock();
    invoke.mockRejectedValue(new Error('Capture failed'));

    const { result } = renderHook(() => useScreenCapture());

    await act(async () => {
      try {
        await result.current.captureFullScreen();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Capture failed');
      }
    });

    expect(result.current.error).toBe('Capture failed');
    expect(result.current.isCapturing).toBe(false);
  });

  it('should delete capture', async () => {
    const invoke = await getInvokeMock();
    invoke.mockResolvedValue(undefined);

    const { result } = renderHook(() => useScreenCapture());

    await act(async () => {
      await result.current.deleteCapture('test-id');
    });

    expect(invoke).toHaveBeenCalledWith('capture_delete', { capture_id: 'test-id' });
  });

  it('should get capture history', async () => {
    const invoke = await getInvokeMock();
    const mockHistory = [
      {
        id: 'test-id-1',
        capture_type: 'fullscreen',
        file_path: '/path/to/capture1.png',
        thumbnail_path: null,
        ocr_text: null,
        ocr_confidence: null,
        metadata: '{}',
        created_at: 1700000000,
      },
      {
        id: 'test-id-2',
        capture_type: 'region',
        file_path: '/path/to/capture2.png',
        thumbnail_path: null,
        ocr_text: null,
        ocr_confidence: null,
        metadata: '{}',
        created_at: 1700000100,
      },
    ];

    invoke.mockResolvedValue(mockHistory);

    const { result } = renderHook(() => useScreenCapture());

    let history;
    await act(async () => {
      history = await result.current.getHistory();
    });

    expect(invoke).toHaveBeenCalledWith('capture_get_history', {});
    expect(history).toEqual([
      {
        id: 'test-id-1',
        conversationId: null,
        captureType: 'fullscreen',
        filePath: '/path/to/capture1.png',
        thumbnailPath: null,
        ocrText: null,
        ocrConfidence: null,
        metadata: '{}',
        createdAt: 1700000000,
      },
      {
        id: 'test-id-2',
        conversationId: null,
        captureType: 'region',
        filePath: '/path/to/capture2.png',
        thumbnailPath: null,
        ocrText: null,
        ocrConfidence: null,
        metadata: '{}',
        createdAt: 1700000100,
      },
    ]);
  });
});
