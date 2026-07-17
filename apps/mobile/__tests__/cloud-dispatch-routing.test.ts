import { getDefaultModelFor } from '@agiworkforce/types';
import { resolveMobileCloudDispatch } from '../src/features/chat/utils/cloudDispatchRouting';

describe('Mobile Managed Cloud dispatch routing', () => {
  it('preserves an eligible explicit model for ordinary chat', () => {
    const modelId = getDefaultModelFor('pro', 'chat');
    const decision = resolveMobileCloudDispatch({
      selection: modelId,
      message: 'Help me plan tomorrow.',
      subscriptionTier: 'pro',
    });

    expect(decision).toMatchObject({
      status: 'selected',
      dispatch: 'chat',
      modelKey: modelId,
      reason: 'explicit',
    });
  });

  it('routes natural-language image generation to the admitted media harness', () => {
    const decision = resolveMobileCloudDispatch({
      selection: getDefaultModelFor('pro', 'chat'),
      message: 'Create an image of a blue observatory on Mars',
      subscriptionTier: 'pro',
    });

    expect(decision).toMatchObject({
      status: 'selected',
      dispatch: 'media',
      taskType: 'image_generation',
      harnessId: 'google/media',
      reason: 'capability_fallback',
    });
  });

  it('routes Mobile research through the verified server-side search harness', () => {
    const decision = resolveMobileCloudDispatch({
      selection: 'auto-premium',
      message: 'Search the web for the latest AI platform news and cite sources',
      subscriptionTier: 'max',
    });

    expect(decision).toMatchObject({
      status: 'selected',
      dispatch: 'chat',
      taskType: 'research',
      modelKey: 'sonar-deep-research',
      harnessId: 'perplexity/chat-completions',
    });
  });
});
