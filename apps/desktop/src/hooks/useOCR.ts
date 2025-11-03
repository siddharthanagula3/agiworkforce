import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

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
    language?: string
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

  const processImage = useCallback(
    async (captureId: string, imagePath: string, language = 'eng'): Promise<OCRResult> => {
      setIsProcessing(true);
      setError(null);

      try {
        const ocrResult = await invoke<OCRResult>('ocr_process_image', {
          captureId,
          imagePath,
          language,
        });
        setResult(ocrResult);
        return ocrResult;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const processRegion = useCallback(
    async (
      imagePath: string,
      x: number,
      y: number,
      width: number,
      height: number,
      language = 'eng'
    ): Promise<OCRResult> => {
      setIsProcessing(true);
      setError(null);

      try {
        const ocrResult = await invoke<OCRResult>('ocr_process_region', {
          imagePath,
          x,
          y,
          width,
          height,
          language,
        });
        setResult(ocrResult);
        return ocrResult;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const getLanguages = useCallback(async (): Promise<Language[]> => {
    try {
      const languages = await invoke<Language[]>('ocr_get_languages');
      return languages;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      return [];
    }
  }, []);

  const getResult = useCallback(async (captureId: string): Promise<OCRResult | null> => {
    try {
      const ocrResult = await invoke<OCRResult | null>('ocr_get_result', {
        captureId,
      });
      if (ocrResult) {
        setResult(ocrResult);
      }
      return ocrResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
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
