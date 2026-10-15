import { describe, expect, it } from 'vitest';
import {
  canAccessModelForSubscriptionTier,
  getDefaultModelFor,
  getModelMetadataById,
  getRoutingSlotModel,
  isManagedTrafficPermitted,
  listChatModels,
} from '@agiworkforce/types';
import {
  COMPUTER_USE_MODEL,
  resolveManagedComputerUseModel,
} from '../src/features/computer-use/cloudAgentClient';

describe('Chrome browser default', () => {
  it('uses the canonical browser slot instead of the generic computer-use tier defaults', () => {
    expect(COMPUTER_USE_MODEL).toBe(getRoutingSlotModel('browser_dom'));
  });
});

describe('Managed Cloud browser model admission', () => {
  const selectedModel = getRoutingSlotModel('computer_use');
  const browserDefault = getRoutingSlotModel('browser_dom');
  const access = {
    subscriptionTier: 'max',
    modelIds: [selectedModel, browserDefault],
    allowedAutoModes: ['auto-economy', 'auto-balanced', 'auto-premium'],
  };

  it('uses the canonical browser default for Auto', () => {
    expect(resolveManagedComputerUseModel(access)).toBe(browserDefault);
    expect(resolveManagedComputerUseModel(access, 'auto')).toBe(browserDefault);
  });

  it('preserves the explicit model even when the tier would choose a different automation model', () => {
    expect(selectedModel).not.toBe(getDefaultModelFor(access.subscriptionTier, 'computer-use'));
    expect(resolveManagedComputerUseModel(access, selectedModel)).toBe(selectedModel);
  });

  it('resolves a provider API alias to the canonical account model', () => {
    const apiModelId = getModelMetadataById(selectedModel)!.apiModelId;
    expect(apiModelId).toBeDefined();
    expect(resolveManagedComputerUseModel(access, apiModelId)).toBe(selectedModel);
  });

  it('rejects unknown model selections instead of replacing them with the default', () => {
    expect(() => resolveManagedComputerUseModel(access, 'unknown-test-model')).toThrow(
      'unavailable for Managed Cloud browser actions',
    );
    expect(() => resolveManagedComputerUseModel(access, '')).toThrow(
      'unavailable for Managed Cloud browser actions',
    );
  });

  it('requires current account admission for explicit selections and Auto', () => {
    const denied = { ...access, modelIds: [] };
    expect(() => resolveManagedComputerUseModel(denied, selectedModel)).toThrow(
      'not available for browser actions on this account',
    );
    expect(() => resolveManagedComputerUseModel(denied)).toThrow(
      'No models are available for browser actions on this account',
    );
  });

  it('applies the canonical tier gate even when the account list incorrectly includes a paid model', () => {
    expect(() =>
      resolveManagedComputerUseModel({ ...access, subscriptionTier: 'free' }, selectedModel),
    ).toThrow('not available for browser actions on this account');
  });

  it('refuses an Auto profile the account has not admitted', () => {
    expect(() =>
      resolveManagedComputerUseModel({ ...access, allowedAutoModes: [] }, 'auto-premium'),
    ).toThrow('selected Auto profile is not available');
  });

  it('refuses a managed chat model that cannot consume browser screenshots', () => {
    const textOnlyModel = listChatModels().find(
      (model) =>
        isManagedTrafficPermitted(model.id) &&
        canAccessModelForSubscriptionTier(model.id, access.subscriptionTier) &&
        !model.capabilities.vision,
    );
    expect(textOnlyModel).toBeDefined();
    expect(() =>
      resolveManagedComputerUseModel(
        { ...access, modelIds: [textOnlyModel!.id] },
        textOnlyModel!.id,
      ),
    ).toThrow('does not support browser tools, screenshots, and streaming');
  });

  it('admits the custom browser harness through tools and vision without requiring native computer use', () => {
    const toolsAndVisionModel = listChatModels().find(
      (model) =>
        isManagedTrafficPermitted(model.id) &&
        canAccessModelForSubscriptionTier(model.id, access.subscriptionTier) &&
        model.capabilities.tools &&
        model.capabilities.vision &&
        model.capabilities.streaming &&
        !model.capabilities.computerUse,
    );
    expect(toolsAndVisionModel).toBeDefined();
    expect(
      resolveManagedComputerUseModel(
        { ...access, modelIds: [toolsAndVisionModel!.id] },
        toolsAndVisionModel!.id,
      ),
    ).toBe(toolsAndVisionModel!.id);
  });
});
