import { NativeModules, Platform } from 'react-native';
import { readMemoryFootprintMB, startPeakMemorySampler } from '../services/processFootprint';

const memoryFootprintMB = jest.fn<Promise<number | null>, []>();

beforeEach(() => {
  jest.useFakeTimers();
  memoryFootprintMB.mockReset();
  Platform.OS = 'ios';
  NativeModules.AGIFoundationModels = { memoryFootprintMB };
});

afterEach(() => {
  jest.useRealTimers();
  delete NativeModules.AGIFoundationModels;
});

describe('processFootprint', () => {
  it('reads the native footprint and rejects invalid values', async () => {
    memoryFootprintMB.mockResolvedValueOnce(412.5).mockResolvedValueOnce(null);
    await expect(readMemoryFootprintMB()).resolves.toBe(412.5);
    await expect(readMemoryFootprintMB()).resolves.toBeNull();
  });

  it('returns null when the native module is missing or throws', async () => {
    delete NativeModules.AGIFoundationModels;
    await expect(readMemoryFootprintMB()).resolves.toBeNull();
    NativeModules.AGIFoundationModels = { memoryFootprintMB };
    memoryFootprintMB.mockRejectedValueOnce(new Error('unavailable'));
    await expect(readMemoryFootprintMB()).resolves.toBeNull();
  });

  it('keeps the peak across samples and stops polling on stop', async () => {
    memoryFootprintMB
      .mockResolvedValueOnce(300)
      .mockResolvedValueOnce(640)
      .mockResolvedValueOnce(500)
      .mockResolvedValue(450);
    const sampler = startPeakMemorySampler(1_000);
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(sampler.stop()).resolves.toBe(640);
    const calls = memoryFootprintMB.mock.calls.length;
    await jest.advanceTimersByTimeAsync(5_000);
    expect(memoryFootprintMB).toHaveBeenCalledTimes(calls);
  });
});
