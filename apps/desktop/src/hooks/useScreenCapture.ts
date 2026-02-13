import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '../lib/tauri-mock';
import type { CaptureRecord, CaptureResult, Region, WindowInfo } from '../types/capture';
import {
  normalizeCaptureRecord,
  normalizeCaptureResult,
  type RawCaptureRecord,
  type RawCaptureResult,
} from '../utils/captureTransforms';

export type { CaptureRecord, CaptureResult, Region, WindowInfo } from '../types/capture';

export interface UseScreenCaptureReturn {
  isCapturing: boolean;
  captureFullScreen: (conversationId?: number) => Promise<CaptureResult>;
  captureRegion: (region: Region, conversationId?: number) => Promise<CaptureResult>;
  captureWindow: (windowHandle: string, conversationId?: number) => Promise<CaptureResult>;
  getAvailableWindows: () => Promise<WindowInfo[]>;
  getHistory: (conversationId?: number, limit?: number) => Promise<CaptureRecord[]>;
  deleteCapture: (captureId: string) => Promise<void>;
  saveToClipboard: (captureId: string) => Promise<void>;
  error: string | null;
}

export function useScreenCapture(): UseScreenCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // AUDIT-007-005 fix: Track mounted state to prevent setState after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const withTimeout = useCallback(
    async <T,>(label: string, fn: () => Promise<T>, timeoutMs = 10000): Promise<T> => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        window.setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      return Promise.race([fn(), timeoutPromise]);
    },
    [],
  );

  const captureFullScreen = useCallback(async (conversationId?: number): Promise<CaptureResult> => {
    // AUDIT-007-005 fix: Check isMounted before setState calls
    if (isMountedRef.current) {
      setIsCapturing(true);
      setError(null);
    }

    try {
      const params: Record<string, unknown> = {};
      if (conversationId != null) {
        params['conversation_id'] = conversationId;
      }
      const result = await withTimeout('capture_screen_full', () =>
        invoke<RawCaptureResult>('capture_screen_full', params),
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
  }, [withTimeout]);

  const captureRegion = useCallback(
    async (region: Region, conversationId?: number): Promise<CaptureResult> => {
      // AUDIT-007-005 fix: Check isMounted before setState calls
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
        const result = await withTimeout('capture_screen_region', () =>
          invoke<RawCaptureResult>('capture_screen_region', params),
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
        const result = await withTimeout('capture_screen_window', () =>
          invoke<RawCaptureResult>('capture_screen_window', params),
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
      const windows = await withTimeout('capture_get_windows', () =>
        invoke<WindowInfo[]>('capture_get_windows'),
      );
      return windows;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // AUDIT-007-005 fix: Check isMounted before setState
      if (isMountedRef.current) {
        setError(errorMessage);
      }
      return [];
    }
  }, [withTimeout]);

  const getHistory = useCallback(
    async (conversationId?: number, limit?: number): Promise<CaptureRecord[]> => {
      try {
        const params: Record<string, unknown> = {};
        if (conversationId != null) {
          params['conversation_id'] = conversationId;
        }
        if (limit != null) {
          params['limit'] = limit;
        }
        const history = await invoke<RawCaptureRecord[]>('capture_get_history', params);
        return history.map((entry) => normalizeCaptureRecord(entry));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        // AUDIT-007-005 fix: Check isMounted before setState
        if (isMountedRef.current) {
          setError(errorMessage);
        }
        return [];
      }
    },
    [],
  );

  const deleteCapture = useCallback(async (captureId: string): Promise<void> => {
    try {
      await invoke('capture_delete', { capture_id: captureId });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // AUDIT-007-005 fix: Check isMounted before setState
      if (isMountedRef.current) {
        setError(errorMessage);
      }
      throw new Error(errorMessage);
    }
  }, []);

  const saveToClipboard = useCallback(async (captureId: string): Promise<void> => {
    try {
      await invoke('capture_save_to_clipboard', { capture_id: captureId });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // AUDIT-007-005 fix: Check isMounted before setState
      if (isMountedRef.current) {
        setError(errorMessage);
      }
      throw new Error(errorMessage);
    }
  }, []);

  return {
    isCapturing,
    captureFullScreen,
    captureRegion,
    captureWindow,
    getAvailableWindows,
    getHistory,
    deleteCapture,
    saveToClipboard,
    error,
  };
}
