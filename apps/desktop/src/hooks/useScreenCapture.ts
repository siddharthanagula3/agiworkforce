import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '../lib/tauri-mock';
import type { CaptureResult, Region, WindowInfo } from '../types/capture';
import { normalizeCaptureResult, type RawCaptureResult } from '../utils/captureTransforms';

export type { CaptureResult, Region, WindowInfo } from '../types/capture';

const CAPTURE_TIMEOUTS_MS = {
  full: 30_000,
  region: 90_000,
  window: 90_000,
  windowsList: 10_000,
} as const;

export interface UseScreenCaptureReturn {
  isCapturing: boolean;
  captureFullScreen: (conversationId?: number) => Promise<CaptureResult>;
  captureRegion: (region: Region, conversationId?: number) => Promise<CaptureResult>;
  captureWindow: (windowHandle: string, conversationId?: number) => Promise<CaptureResult>;
  getAvailableWindows: () => Promise<WindowInfo[]>;
  error: string | null;
}

export function useScreenCapture(): UseScreenCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const withTimeout = useCallback(
    async <T>(label: string, fn: () => Promise<T>, timeoutMs = 10000): Promise<T> => {
      let timeoutId: number | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      try {
        return await Promise.race([fn(), timeoutPromise]);
      } finally {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }
      }
    },
    [],
  );

  const captureFullScreen = useCallback(
    async (conversationId?: number): Promise<CaptureResult> => {
      if (isMountedRef.current) {
        setIsCapturing(true);
        setError(null);
      }

      try {
        const params: Record<string, unknown> = {};
        if (conversationId != null) {
          params['conversation_id'] = conversationId;
        }
        const result = await withTimeout(
          'capture_screen_full',
          () => invoke<RawCaptureResult>('capture_screen_full', params),
          CAPTURE_TIMEOUTS_MS.full,
        );
        return normalizeCaptureResult(result);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) {
          setError(errorMessage);
        }
        throw new Error(errorMessage);
      } finally {
        if (isMountedRef.current) {
          setIsCapturing(false);
        }
      }
    },
    [withTimeout],
  );

  const captureRegion = useCallback(
    async (region: Region, conversationId?: number): Promise<CaptureResult> => {
      if (isMountedRef.current) {
        setIsCapturing(true);
        setError(null);
      }

      try {
        const params: Record<string, unknown> = {
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
        };
        if (conversationId != null) {
          params['conversation_id'] = conversationId;
        }
        const result = await withTimeout(
          'capture_screen_region',
          () => invoke<RawCaptureResult>('capture_screen_region', params),
          CAPTURE_TIMEOUTS_MS.region,
        );
        return normalizeCaptureResult(result);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) {
          setError(errorMessage);
        }
        throw new Error(errorMessage);
      } finally {
        if (isMountedRef.current) {
          setIsCapturing(false);
        }
      }
    },
    [withTimeout],
  );

  const captureWindow = useCallback(
    async (windowHandle: string, conversationId?: number): Promise<CaptureResult> => {
      if (isMountedRef.current) {
        setIsCapturing(true);
        setError(null);
      }

      try {
        const params: Record<string, unknown> = {
          hwnd: windowHandle,
        };
        if (conversationId != null) {
          params['conversation_id'] = conversationId;
        }
        const result = await withTimeout(
          'capture_screen_window',
          () => invoke<RawCaptureResult>('capture_screen_window', params),
          CAPTURE_TIMEOUTS_MS.window,
        );
        return normalizeCaptureResult(result);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) {
          setError(errorMessage);
        }
        throw new Error(errorMessage);
      } finally {
        if (isMountedRef.current) {
          setIsCapturing(false);
        }
      }
    },
    [withTimeout],
  );

  const getAvailableWindows = useCallback(async (): Promise<WindowInfo[]> => {
    try {
      const windows = await withTimeout(
        'capture_get_windows',
        () => invoke<WindowInfo[]>('capture_get_windows'),
        CAPTURE_TIMEOUTS_MS.windowsList,
      );
      return windows;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (isMountedRef.current) {
        setError(errorMessage);
      }
      return [];
    }
  }, [withTimeout]);

  return {
    isCapturing,
    captureFullScreen,
    captureRegion,
    captureWindow,
    getAvailableWindows,
    error,
  };
}
