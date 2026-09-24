import { describe, expect, it } from 'vitest';
import { getProviderOfferings, getSelectableModels } from '@agiworkforce/types';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import { hasCompatibleFreeErrorRecoveryModel } from './free-error-model-recovery';

const promotional = Object.entries(getProviderOfferings()).find(
  ([, offering]) => offering.quotaProbeProtocol === 'chat',
)?.[0];
const visionToolModel = getSelectableModels().find(
  (model) => model.capabilities.vision && model.capabilities.tools,
);
if (!promotional || !visionToolModel) throw new Error('Recovery test models missing from catalog');

function userMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id: 'user-1', role: 'user', content: 'hello', ...overrides };
}

describe('hasCompatibleFreeErrorRecoveryModel', () => {
  it('retains the model picker for an unconstrained text-only failure', () => {
    expect(hasCompatibleFreeErrorRecoveryModel(userMessage(), 'failed-model', [])).toBe(true);
  });

  it('does not offer text-only promotions as an image recovery route', () => {
    expect(
      hasCompatibleFreeErrorRecoveryModel(
        userMessage({
          content: 'How many bars are in this image?',
          attachments: [{ id: 'file-1', name: 'chart.png', type: 'image/png' }],
        }),
        visionToolModel.id,
        [{ id: visionToolModel.id }, { id: promotional }],
      ),
    ).toBe(false);
  });

  it('does not offer text-only promotions for a required code tool', () => {
    expect(
      hasCompatibleFreeErrorRecoveryModel(
        userMessage({ content: 'Use the sandbox/code execution tool to run Python.' }),
        visionToolModel.id,
        [{ id: visionToolModel.id }, { id: promotional }],
      ),
    ).toBe(false);
  });

  it('recognizes a distinct compatible model when one is available to the caller', () => {
    expect(
      hasCompatibleFreeErrorRecoveryModel(
        userMessage({
          attachments: [{ id: 'file-1', name: 'chart.png', type: 'image/png' }],
          metadata: { sendReplay: { codeExecutionEnabled: true } },
        }),
        'failed-model',
        [{ id: promotional }, { id: visionToolModel.id }],
      ),
    ).toBe(true);
  });

  it('does not mistake the failed model for an alternative when its identity is unknown', () => {
    expect(
      hasCompatibleFreeErrorRecoveryModel(
        userMessage({ attachments: [{ id: 'file-1', name: 'chart.png', type: 'image/png' }] }),
        undefined,
        [{ id: visionToolModel.id }],
      ),
    ).toBe(false);
  });
});
