import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '../lib/tauri-mock';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WordData {
  text: string;
  confidence: number;
  bbox: BoundingBox;
}

export interface OCRResult {
  id: string;
  captureId: string;
  text: string;
  confidence: number;
  words: WordData[];
  processingTimeMs: number;
  language: string;
}

export interface Language {
  code: string;
  name: string;
}

export interface UseOCRReturn {
  isProcessing: boolean;
  processImage: (captureId: string, imagePath: string, language?: string) => Promise<OCRResult>;
  processRegion: (
    imagePath: string,
    x: number,
    y: number,
    width: number,
    height: number,
    language?: string,
  ) => Promise<OCRResult>;
  getLanguages: () => Promise<Language[]>;
  getResult: (captureId: string) => Promise<OCRResult | null>;
  error: string | null;
  result: OCRResult | null;
}

export function useOCR(): UseOCRReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OCRResult | null>(null);
  // AUDIT-007-006 fix: Track mounted state to prevent setState after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const processImage = useCallback(
    async (captureId: string, imagePath: string, language = 'eng'): Promise<OCRResult> => {
      // AUDIT-007-006 fix: Check isMounted before setState calls
      if (isMountedRef.current) {
        setIsProcessing(true);
        setError(null);
      }

      try {
        const ocrResult = await invoke<OCRResult>('ocr_process_image', {
          captureId,
          imagePath,
          language,
        });
        if (isMountedRef.current) {
          setResult(ocrResult);
        }
        return ocrResult;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) {
          setError(errorMessage);
        }
        throw new Error(errorMessage);
      } finally {
        if (isMountedRef.current) {
          setIsProcessing(false);
        }
      }
    },
    [],
  );

  const processRegion = useCallback(
    async (
      imagePath: string,
      x: number,
      y: number,
      width: number,
      height: number,
      language = 'eng',
    ): Promise<OCRResult> => {
      // AUDIT-007-006 fix: Check isMounted before setState calls
      if (isMountedRef.current) {
        setIsProcessing(true);
        setError(null);
      }

      try {
        const ocrResult = await invoke<OCRResult>('ocr_process_region', {
          imagePath,
          x,
          y,
          width,
          height,
          language,
        });
        if (isMountedRef.current) {
          setResult(ocrResult);
        }
        return ocrResult;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) {
          setError(errorMessage);
        }
        throw new Error(errorMessage);
      } finally {
        if (isMountedRef.current) {
          setIsProcessing(false);
        }
      }
    },
    [],
  );

  const getLanguages = useCallback(async (): Promise<Language[]> => {
    try {
      const languages = await invoke<Language[]>('ocr_get_languages');
      return languages;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // AUDIT-007-006 fix: Check isMounted before setState
      if (isMountedRef.current) {
        setError(errorMessage);
      }
      return [];
    }
  }, []);

  const getResult = useCallback(async (captureId: string): Promise<OCRResult | null> => {
    try {
      const ocrResult = await invoke<OCRResult | null>('ocr_get_result', {
        captureId,
      });
      // AUDIT-007-006 fix: Check isMounted before setState
      if (ocrResult && isMountedRef.current) {
        setResult(ocrResult);
      }
      return ocrResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // AUDIT-007-006 fix: Check isMounted before setState
      if (isMountedRef.current) {
        setError(errorMessage);
      }
      return null;
    }
  }, []);

  return {
    isProcessing,
    processImage,
    processRegion,
    getLanguages,
    getResult,
    error,
    result,
  };
}
