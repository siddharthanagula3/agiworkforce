import { resolveAutoRoute } from '@agiworkforce/routing';
import {
  getAutoRoutingProfiles,
  getDefaultModelFor,
  getModelMetadataById,
  getProvidersWithImplementedHarnessFeature,
  getModelsForTierAndSurface,
} from '@agiworkforce/types';
import { resolveMobileCloudDispatch } from '../src/features/chat/utils/cloudDispatchRouting';

describe('Mobile Managed Cloud dispatch routing', () => {
  const autoSelection = getAutoRoutingProfiles()[0]?.id;
  if (!autoSelection) {
    throw new Error('Expected a selectable Auto profile in the canonical model registry.');
  }

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
      selection: autoSelection,
      message: 'Search the web for the latest AI platform news and cite sources',
      subscriptionTier: 'max',
    });
    const canonicalRoute = resolveAutoRoute({
      selection: autoSelection,
      taskType: 'research',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'mobile/cloud-chat',
      fallbackToAutoForCapabilityMismatch: true,
    });
    if (canonicalRoute.status !== 'selected') {
      throw new Error(`Expected a selected canonical research route: ${canonicalRoute.reason}`);
    }

    expect(decision).toMatchObject({
      status: 'selected',
      dispatch: 'chat',
      taskType: 'research',
      modelKey: canonicalRoute.modelKey,
      harnessId: canonicalRoute.harnessId,
    });

    const routedModel = getModelMetadataById(canonicalRoute.modelKey);
    expect(routedModel?.capabilities.search).toBe(true);
    expect(getProvidersWithImplementedHarnessFeature('webSearch')).toContain(routedModel?.provider);
  });

  it('applies the sticky-pivot: a coding history changes a low-signal turn to coding', () => {
    const codingHistory = [
      { role: 'user' as const, content: 'refactor this class' },
      { role: 'user' as const, content: 'def hello(): pass' },
      { role: 'user' as const, content: 'explain this function definition' },
    ];
    const lowSignalTurn =
      'I would like to discuss something interesting that requires some neutral conversational handling without specific signals';

    const withoutHistory = resolveMobileCloudDispatch({
      selection: autoSelection,
      message: lowSignalTurn,
      subscriptionTier: 'max',
    });
    const withCodingHistory = resolveMobileCloudDispatch({
      selection: autoSelection,
      message: lowSignalTurn,
      subscriptionTier: 'max',
      history: codingHistory,
    });

    expect(withoutHistory).toMatchObject({ status: 'selected', taskType: 'general' });
    expect(withCodingHistory).toMatchObject({ status: 'selected', taskType: 'coding' });
  });

  it('applies the long-context guard once cumulative tokens exceed 50K', () => {
    const longPriorTurn = { role: 'user' as const, content: 'a '.repeat(100_000) };
    const decision = resolveMobileCloudDispatch({
      selection: autoSelection,
      message: 'and now summarize the key point',
      subscriptionTier: 'max',
      history: [longPriorTurn],
    });

    expect(decision).toMatchObject({ status: 'selected', taskType: 'long_context' });
  });

  it('fails closed before dispatching an explicit model locked for the current plan', () => {
    const proIds = new Set(
      getModelsForTierAndSurface('pro', 'mobile/cloud-chat').map((model) => model.id),
    );
    const maxOnly = getModelsForTierAndSurface('max', 'mobile/cloud-chat').find(
      (model) => !proIds.has(model.id),
    );
    if (!maxOnly) {
      throw new Error('Expected a Max-only Mobile Cloud model in the canonical catalog.');
    }

    const decision = resolveMobileCloudDispatch({
      selection: maxOnly.id,
      message: 'Help me plan tomorrow.',
      subscriptionTier: 'pro',
    });

    expect(decision).toMatchObject({
      status: 'unavailable',
      code: 'explicit_model_ineligible',
    });
  });
});
