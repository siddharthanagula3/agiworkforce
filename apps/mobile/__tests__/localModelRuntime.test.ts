/**
 * Unit tests for local model runtime resolution.
 */

jest.mock('../storage/installedModels', () => ({
  listInstalledModels: jest.fn().mockResolvedValue([]),
  getInstalledModel: jest.fn().mockResolvedValue(null),
}));

jest.mock('@agiworkforce/local-llm', () => {
  const actual = jest.requireActual('@agiworkforce/local-llm');
  return {
    ...(actual as Record<string, unknown>),
    getCapabilities: jest.fn().mockResolvedValue({
      totalRAMMB: 8192,
      osVersion: 'test',
      thermalThrottled: false,
      tier1Available: false,
      tier1Runtime: null,
      tier2Available: true,
      tier3Available: true,
    }),
  };
});

import { resolveLocalModelRef } from '../src/features/model-picker/localModelRuntime';

describe('localModelRuntime', () => {
  it('rejects non-selectable local model ids instead of falling back', async () => {
    await expect(resolveLocalModelRef('not-a-local-model')).rejects.toThrow(
      /not selectable for local chat/i,
    );
  });
});
