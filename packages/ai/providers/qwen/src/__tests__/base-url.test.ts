import { describe, expect, it } from 'vitest';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import { detectOpenAICompletionsCompat } from '@agiworkforce/provider-protocol';
import { ALLOWED_MANAGED_PROVIDER_HOSTS } from '@agiworkforce/provider-runtime';

import { QWEN_DEFAULT_BASE_URL } from '../base-url';

const QWEN_DEFAULT_MODEL_ID = requireProviderDefaultModel('qwen');

describe('QWEN_DEFAULT_BASE_URL', () => {
  it('defaults to DashScope compatible-mode, not the native generation API', () => {
    expect(QWEN_DEFAULT_BASE_URL).toContain('/compatible-mode/v1');
    expect(QWEN_DEFAULT_BASE_URL).not.toContain('/api/v1');
  });

  /**
   * A Model Studio key is valid in exactly one of the two deployments, and the
   * wrong one answers `401 Incorrect API key provided`, indistinguishable from
   * a bad key. Pointing the default at mainland took Qwen down in production
   * with an error that named no region; this pins the region so the next
   * provider migration cannot silently pick the other half.
   */
  it('points at the international deployment the accounts are issued against', () => {
    expect(QWEN_DEFAULT_BASE_URL).toBe('https://dashscope-intl.aliyuncs.com/compatible-mode/v1');
  });

  it('keeps the mainland endpoint reachable through the QWEN_BASE_URL override', () => {
    expect(ALLOWED_MANAGED_PROVIDER_HOSTS.has('dashscope.aliyuncs.com')).toBe(true);
    expect(ALLOWED_MANAGED_PROVIDER_HOSTS.has('dashscope-intl.aliyuncs.com')).toBe(true);
  });

  it.each([
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
  ])('resolves %s to the modelstudio-native endpoint class', (baseUrl) => {
    const detected = detectOpenAICompletionsCompat({
      provider: 'qwen',
      baseUrl,
      id: QWEN_DEFAULT_MODEL_ID,
    });
    expect(detected.capabilities.endpointClass).toBe('modelstudio-native');
    expect(detected.capabilities.supportsNativeStreamingUsageCompat).toBe(true);
  });
});
