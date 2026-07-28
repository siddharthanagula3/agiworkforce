import { describe, expect, it } from 'vitest';
import { detectOpenAICompletionsCompat } from '@agiworkforce/provider-protocol';

import { QWEN_DEFAULT_BASE_URL } from '../base-url';

describe('QWEN_DEFAULT_BASE_URL', () => {
  it('defaults to DashScope compatible-mode, not the native generation API', () => {
    expect(QWEN_DEFAULT_BASE_URL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
  });

  it('resolves to the modelstudio-native endpoint class in the shared compat layer', () => {
    const detected = detectOpenAICompletionsCompat({
      provider: 'qwen',
      baseUrl: QWEN_DEFAULT_BASE_URL,
      id: 'qwen-3.7-plus',
    });
    expect(detected.capabilities.endpointClass).toBe('modelstudio-native');
    // modelstudio-native gets native streaming-usage compat.
    expect(detected.capabilities.supportsNativeStreamingUsageCompat).toBe(true);
  });
});
