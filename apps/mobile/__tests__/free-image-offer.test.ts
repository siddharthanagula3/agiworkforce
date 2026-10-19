const mockEnsureLimitedFreeMediaModel = jest.fn<Promise<string | null>, [string]>();
jest.mock('../src/features/model-picker/freeQuotaCatalogue', () => ({
  ...jest.requireActual('../src/features/model-picker/freeQuotaCatalogue'),
  ensureLimitedFreeMediaModel: (category: string) => mockEnsureLimitedFreeMediaModel(category),
}));

import { freeImageOfferFor } from '../src/features/chat/actions/freeImageOffer';
import type { MobileImageGenerationRequestDecision } from '../src/features/chat/actions/resolveMobileImageGenerationRequest';

const planRefusal: MobileImageGenerationRequestDecision = {
  status: 'blocked',
  code: 'plan_required',
  alert: { title: 'Upgrade', message: 'Image generation needs a paid plan.' },
  prompt: 'a lighthouse at dusk',
};

describe('the Free limited image offer on mobile', () => {
  beforeEach(() => mockEnsureLimitedFreeMediaModel.mockReset());

  it('hands a plan refusal to the ready limited image model, as web does', async () => {
    mockEnsureLimitedFreeMediaModel.mockResolvedValue('qwen-quota-027');

    await expect(freeImageOfferFor(planRefusal)).resolves.toEqual({
      model: 'qwen-quota-027',
      prompt: 'a lighthouse at dusk',
    });
    expect(mockEnsureLimitedFreeMediaModel).toHaveBeenCalledWith('image');
  });

  it('keeps the upgrade alert when no limited offer is running', async () => {
    mockEnsureLimitedFreeMediaModel.mockResolvedValue(null);
    await expect(freeImageOfferFor(planRefusal)).resolves.toBeNull();
  });

  it('never looks up an offer for a refusal that is not about the plan', async () => {
    await expect(
      freeImageOfferFor({ ...planRefusal, code: 'offline', prompt: undefined }),
    ).resolves.toBeNull();
    await expect(freeImageOfferFor({ status: 'not_requested' })).resolves.toBeNull();
    expect(mockEnsureLimitedFreeMediaModel).not.toHaveBeenCalled();
  });
});
