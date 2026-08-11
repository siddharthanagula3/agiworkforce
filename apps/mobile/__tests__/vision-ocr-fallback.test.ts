/**
 * Regression coverage for OCR fallback routing and native AGIVisionOCR consumption.
 */

import { runVisionQuery } from '../src/features/image/services/vision';
import {
  getModelsForRole,
  getDefaultModel,
  localGenerate,
  detectCapabilities,
} from '@agiworkforce/local-llm';
import { getInstalledModel } from '@/storage/installedModels';
import { recognizeText } from '../src/features/image/services/ocr';

jest.mock('../src/features/image/services/ocr', () => ({
  recognizeText: jest.fn(),
}));

jest.mock('@agiworkforce/local-llm', () => ({
  getModelsForRole: jest.fn(),
  getDefaultModel: jest.fn(),
  localGenerate: jest.fn(),
  detectCapabilities: jest.fn(),
}));

jest.mock('@/storage/installedModels', () => ({
  getInstalledModel: jest.fn(),
}));

describe('runVisionQuery OCR fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes through native OCR service and consumes { text, regions }', async () => {
    (getModelsForRole as jest.Mock).mockReturnValue([]);
    (getDefaultModel as jest.Mock).mockReturnValue({ id: 'fixture-local-fallback-model' });
    (getInstalledModel as jest.Mock).mockResolvedValue(null);
    (detectCapabilities as jest.Mock).mockResolvedValue({
      tier1Available: false,
      tier1Runtime: null,
      tier2Available: false,
      tier3Available: true,
      totalRAMMB: 0,
      osVersion: 'test-os',
      thermalThrottled: false,
    });
    (recognizeText as jest.Mock).mockResolvedValue({
      text: 'Detected invoice total: $12.34',
      regions: [{ x: 4, y: 5, width: 6, height: 7 }],
    });
    (localGenerate as jest.Mock).mockResolvedValue({
      text: 'OCR answer',
      runtime: 'executorch',
      aborted: false,
    });

    const result = await runVisionQuery({
      imageUri: 'file:///tmp/photo.jpg',
      question: 'What is this image about?',
    });

    expect(recognizeText).toHaveBeenCalledWith('file:///tmp/photo.jpg');
    expect(localGenerate).toHaveBeenCalledWith(
      'fixture-local-fallback-model',
      expect.objectContaining({
        modelId: 'fixture-local-fallback-model',
        prompt: expect.stringContaining('Detected invoice total: $12.34'),
      }),
    );
    expect(result.route).toEqual({ kind: 'ocr-fallback', displayName: 'AGI Standard (OCR)' });
    expect(result.text).toBe('OCR answer');
  });
});
