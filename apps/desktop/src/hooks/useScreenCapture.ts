import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  CaptureRecord,
  CaptureResult,
  Region,
  WindowInfo,
} from '../types/capture';

// Re-export types for external use
export type { CaptureResult, CaptureRecord, Region, WindowInfo } from '../types/capture';
import {
  normalizeCaptureRecord,
  normalizeCaptureResult,
  type RawCaptureRecord,
  type RawCaptureResult,
} from '../utils/captureTransforms';

export interface UseScreenCaptureReturn {
  isCapturing: boolean;
  captureFullScreen: (conversationId?: number) => Promise<CaptureResult>;
  captureRegion: (region: Region, conversationId?: number) => Promise<CaptureResult>;
  getAvailableWindows: () => Promise<WindowInfo[]>;
  getHistory: (conversationId?: number, limit?: number) => Promise<CaptureRecord[]>;
  deleteCapture: (captureId: string) => Promise<void>;
  saveToClipboard: (captureId: string) => Promise<void>;
  error: string | null;
}

export function useScreenCapture(): UseScreenCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureFullScreen = useCallback(async (conversationId?: number): Promise<CaptureResult> => {
    setIsCapturing(true);
    setError(null);

    try {
      const params: Record<string, unknown> = {};
      if (conversationId != null) {
        params['conversation_id'] = conversationId;
      }
      const result = await invoke<RawCaptureResult>('capture_screen_full', params);
      return normalizeCaptureResult(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsCapturing(false);
    }
  }, []);

  const captureRegion = useCallback(
    async (region: Region, conversationId?: number): Promise<CaptureResult> => {
      setIsCapturing(true);
      setError(null);

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
        const result = await invoke<RawCaptureResult>('capture_screen_region', params);
        return normalizeCaptureResult(result);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsCapturing(false);
      }
    },
    []
  );

  const getAvailableWindows = useCallback(async (): Promise<WindowInfo[]> => {
    try {
      const windows = await invoke<WindowInfo[]>('capture_get_windows');
      return windows;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      return [];
    }
  }, []);

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
        setError(errorMessage);
        return [];
      }
    },
    []
  );

  const deleteCapture = useCallback(async (captureId: string): Promise<void> => {
    try {
      await invoke('capture_delete', { capture_id: captureId });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  const saveToClipboard = useCallback(async (captureId: string): Promise<void> => {
    try {
      await invoke('capture_save_to_clipboard', { capture_id: captureId });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  return {
    isCapturing,
    captureFullScreen,
    captureRegion,
    getAvailableWindows,
    getHistory,
    deleteCapture,
    saveToClipboard,
    error,
  };
}
