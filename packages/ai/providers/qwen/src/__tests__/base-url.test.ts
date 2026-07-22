import { describe, expect, it } from 'vitest';
import { detectOpenAICompletionsCompat } from '@agiworkforce/provider-protocol';

import { QWEN_DEFAULT_BASE_URL, applyQwenBaseUrlQuirks } from '../base-url';

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

describe('applyQwenBaseUrlQuirks', () => {
  it('appends /vendors/openai/v1 for a bare MuleRouter host', () => {
    expect(applyQwenBaseUrlQuirks('https://api.mulerouter.ai')).toBe(
      'https://api.mulerouter.ai/vendors/openai/v1',
    );
  });

  it('is idempotent when /vendors/openai/v1 is already present', () => {
    expect(applyQwenBaseUrlQuirks('https://api.mulerouter.ai/vendors/openai/v1')).toBe(
      'https://api.mulerouter.ai/vendors/openai/v1',
    );
  });

  it('strips a trailing slash before appending the vendor path', () => {
    expect(applyQwenBaseUrlQuirks('https://api.mulerouter.ai/')).toBe(
      'https://api.mulerouter.ai/vendors/openai/v1',
    );
  });

  it('is a no-op for the DashScope compatible-mode default', () => {
    expect(applyQwenBaseUrlQuirks(QWEN_DEFAULT_BASE_URL)).toBe(QWEN_DEFAULT_BASE_URL);
  });

  it('is a no-op for an unrecognized/invalid URL', () => {
    expect(applyQwenBaseUrlQuirks('not-a-url')).toBe('not-a-url');
  });
});
