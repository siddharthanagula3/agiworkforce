import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOCR } from '../hooks/useOCR';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// AUDIT-P3-TEST-TYPE: Use Mock type with explicit function signature for better type safety
type InvokeMock = Mock<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>;

async function getInvokeMock(): Promise<InvokeMock> {
  const { invoke } = await import('@tauri-apps/api/core');
  // AUDIT-P3-TEST-TYPE: Cast is necessary here as the mock module returns vi.fn()
  return invoke as InvokeMock;
}

describe('useOCR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with correct default values', () => {
    const { result } = renderHook(() => useOCR());

    expect(result.current.isProcessing).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.result).toBe(null);
  });

  it('should process image with OCR', async () => {
    const invoke = await getInvokeMock();
    const mockResult = {
      id: 'ocr-id',
      captureId: 'capture-id',
      text: 'Sample extracted text',
      confidence: 95.5,
      words: [],
      processingTimeMs: 150,
      language: 'eng',
    };

    invoke.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useOCR());

    let ocrResult;
    await act(async () => {
      ocrResult = await result.current.processImage('capture-id', '/path/to/image.png');
    });

    expect(invoke).toHaveBeenCalledWith('ocr_process_image', {
      captureId: 'capture-id',
      imagePath: '/path/to/image.png',
      language: 'eng',
    });
    expect(ocrResult).toEqual(mockResult);
    expect(result.current.result).toEqual(mockResult);
    expect(result.current.isProcessing).toBe(false);
  });

  it('should process region with OCR', async () => {
    const invoke = await getInvokeMock();
    const mockResult = {
      id: 'ocr-id',
      captureId: '',
      text: 'Region text',
      confidence: 88.2,
      words: [],
      processingTimeMs: 120,
      language: 'eng',
    };

    invoke.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useOCR());

    let ocrResult;
    await act(async () => {
      ocrResult = await result.current.processRegion('/path/to/image.png', 100, 100, 500, 400);
    });

    expect(invoke).toHaveBeenCalledWith('ocr_process_region', {
      imagePath: '/path/to/image.png',
      x: 100,
      y: 100,
      width: 500,
      height: 400,
      language: 'eng',
    });
    expect(ocrResult).toEqual(mockResult);
  });

  it('should handle OCR errors', async () => {
    const invoke = await getInvokeMock();
    invoke.mockRejectedValue(new Error('OCR processing failed'));

    const { result } = renderHook(() => useOCR());

    await act(async () => {
      try {
        await result.current.processImage('capture-id', '/path/to/image.png');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('OCR processing failed');
      }
    });

    expect(result.current.error).toBe('OCR processing failed');
    expect(result.current.isProcessing).toBe(false);
  });

  it('should get available languages', async () => {
    const invoke = await getInvokeMock();
    const mockLanguages = [
      { code: 'eng', name: 'English' },
      { code: 'spa', name: 'Spanish' },
      { code: 'fra', name: 'French' },
    ];

    invoke.mockResolvedValue(mockLanguages);

    const { result } = renderHook(() => useOCR());

    let languages;
    await act(async () => {
      languages = await result.current.getLanguages();
    });

    expect(invoke).toHaveBeenCalledWith('ocr_get_languages');
    expect(languages).toEqual(mockLanguages);
  });

  it('should get OCR result for capture', async () => {
    const invoke = await getInvokeMock();
    const mockResult = {
      id: 'ocr-id',
      captureId: 'capture-id',
      text: 'Previously extracted text',
      confidence: 92.0,
      words: [],
      processingTimeMs: 140,
      language: 'eng',
    };

    invoke.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useOCR());

    let ocrResult;
    await act(async () => {
      ocrResult = await result.current.getResult('capture-id');
    });

    expect(invoke).toHaveBeenCalledWith('ocr_get_result', { captureId: 'capture-id' });
    expect(ocrResult).toEqual(mockResult);
    expect(result.current.result).toEqual(mockResult);
  });

  it('should use custom language', async () => {
    const invoke = await getInvokeMock();
    invoke.mockResolvedValue({
      id: 'ocr-id',
      captureId: 'capture-id',
      text: 'Texto en español',
      confidence: 90.0,
      words: [],
      processingTimeMs: 160,
      language: 'spa',
    });

    const { result } = renderHook(() => useOCR());

    await act(async () => {
      await result.current.processImage('capture-id', '/path/to/image.png', 'spa');
    });

    expect(invoke).toHaveBeenCalledWith('ocr_process_image', {
      captureId: 'capture-id',
      imagePath: '/path/to/image.png',
      language: 'spa',
    });
  });
});
