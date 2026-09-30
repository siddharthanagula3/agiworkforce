import { resolveAutoRoute } from '@agiworkforce/routing';
import {
  getAutoRoutingProfiles,
  getDefaultModelFor,
  getModelMetadataById,
  getProvidersWithImplementedHarnessFeature,
  getModelsForTierAndSurface,
  getProviderOfferings,
} from '@agiworkforce/types';
import {
  cloudDispatchUnavailableMessage,
  resolveMobileCloudDispatch,
} from '../src/features/chat/utils/cloudDispatchRouting';
import { getModelListForCloudAccess } from '../src/features/model-picker/service';

describe('Mobile Managed Cloud dispatch routing', () => {
  const autoSelection = getAutoRoutingProfiles()[0]?.id;
  if (!autoSelection) {
    throw new Error('Expected a selectable Auto profile in the canonical model registry.');
  }

  it('admits each catalogued Qwen model only through an entitled managed plan', () => {
    const qwenModels = getModelsForTierAndSurface('max', 'mobile/cloud-chat').filter(
      (model) => model.provider === 'qwen',
    );
    expect(qwenModels.length).toBeGreaterThan(0);
    const freeModelIds = new Set(
      getModelsForTierAndSurface('free', 'mobile/cloud-chat').map((model) => model.id),
    );
    const maxPicker = getModelListForCloudAccess(true, 'max');
    const freePicker = getModelListForCloudAccess(true, 'free');

    for (const qwenModel of qwenModels) {
      expect(maxPicker.find((model) => model.id === qwenModel.id)?.availability).toBe('ready');
      expect(
        resolveMobileCloudDispatch({
          selection: qwenModel.id,
          message: 'Explain how this works.',
          subscriptionTier: 'max',
        }),
      ).toMatchObject({ status: 'selected', dispatch: 'chat', modelKey: qwenModel.id });

      if (!freeModelIds.has(qwenModel.id)) {
        expect(freePicker.find((model) => model.id === qwenModel.id)?.availability).toBe('locked');
        expect(
          resolveMobileCloudDispatch({
            selection: qwenModel.id,
            message: 'Explain how this works.',
            subscriptionTier: 'free',
          }),
        ).toMatchObject({ status: 'unavailable', code: 'explicit_model_ineligible' });
      }
    }
  });

  it('does not send Qwen promotional offerings through ordinary paid routing', () => {
    const qwenOffering = Object.entries(getProviderOfferings()).find(
      ([, offering]) => offering.provider === 'qwen' && offering.quotaProbeProtocol === 'chat',
    );
    if (!qwenOffering) throw new Error('Expected a Qwen chat offering in the shared catalog.');

    expect(
      getModelListForCloudAccess(true, 'free').some((model) => model.id === qwenOffering[0]),
    ).toBe(false);
    expect(
      resolveMobileCloudDispatch({
        selection: qwenOffering[0],
        message: 'Explain how this works.',
        subscriptionTier: 'free',
      }).status,
    ).toBe('unavailable');
  });

  it('does not expose routing diagnostics when no Cloud route is available', () => {
    const decision = resolveMobileCloudDispatch({
      selection: getDefaultModelFor('pro', 'chat'),
      message: 'Help me plan tomorrow.',
      subscriptionTier: 'free',
    });
    if (decision.status !== 'unavailable') {
      throw new Error('Expected the paid model to be unavailable on Free.');
    }

    const diagnostic = 'internal provider route and credential details';
    const message = cloudDispatchUnavailableMessage({ ...decision, reasons: [diagnostic] });
    expect(message).toContain('Choose another AGI Cloud model');
    expect(message).not.toContain(diagnostic);
    expect(
      cloudDispatchUnavailableMessage({
        ...decision,
        code: 'no_eligible_route',
        reasons: [diagnostic],
      }),
    ).not.toContain(diagnostic);
  });

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

  it('rejects an economy model excluded from the shared Free plan before dispatch', () => {
    const freeIds = new Set(
      getModelsForTierAndSurface('free', 'mobile/cloud-chat').map((model) => model.id),
    );
    const economyOnly = getModelsForTierAndSurface('max', 'mobile/cloud-chat').find(
      (model) => model.tier === 'economy' && !freeIds.has(model.id),
    );
    if (!economyOnly) {
      throw new Error('Expected an economy model outside the shared Free offering.');
    }

    expect(
      resolveMobileCloudDispatch({
        selection: economyOnly.id,
        message: 'Help me plan tomorrow.',
        subscriptionTier: 'free',
      }),
    ).toMatchObject({ status: 'unavailable', code: 'explicit_model_ineligible' });
  });
});
