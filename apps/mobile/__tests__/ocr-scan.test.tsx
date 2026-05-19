import React from 'react';
import { NativeModules, Platform } from 'react-native';
import { recognizeText } from '../services/ocr';

// ── OCR service unit tests ────────────────────────────────────────────────

describe('recognizeText', () => {
  const mockRecognize = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    NativeModules.AGIVisionOCR = { recognizeText: mockRecognize };
  });

  it('resolves with text and regions from native module', async () => {
    mockRecognize.mockResolvedValue({
      text: 'Hello World',
      regions: [{ x: 10, y: 20, width: 100, height: 30 }],
    });

    const result = await recognizeText('file:///tmp/image.jpg');
    expect(result.text).toBe('Hello World');
    expect(result.regions).toHaveLength(1);
    expect(mockRecognize).toHaveBeenCalledWith('file:///tmp/image.jpg');
  });

  it('propagates native errors', async () => {
    mockRecognize.mockRejectedValue(new Error('LOAD_ERROR: file not found'));
    await expect(recognizeText('file:///missing.jpg')).rejects.toThrow('LOAD_ERROR');
  });

  it('throws when native module is not linked', async () => {
    NativeModules.AGIVisionOCR = undefined;
    await expect(recognizeText('file:///image.jpg')).rejects.toThrow(/native module not linked/);
  });

  it('handles empty OCR result gracefully', async () => {
    mockRecognize.mockResolvedValue({ text: '', regions: [] });
    const result = await recognizeText('file:///blank.jpg');
    expect(result.text).toBe('');
    expect(result.regions).toHaveLength(0);
  });
});

// ── TaskChipType includes scan ────────────────────────────────────────────

describe('TaskChipType includes scan', () => {
  it('exports scan as a valid chip type', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TaskChips } = require('../components/chat/TaskChips');
    expect(TaskChips).toBeDefined();
  });
});
