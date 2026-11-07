import { freeImageOfferFor } from '../src/features/chat/actions/freeImageOffer';
import { ensureLimitedFreeMediaModel } from '../src/features/model-picker/freeQuotaCatalogue';
import type { MobileImageGenerationRequestDecision } from '../src/features/chat/actions/resolveMobileImageGenerationRequest';

jest.mock('../src/features/model-picker/freeQuotaCatalogue', () => ({
  ensureLimitedFreeMediaModel: jest.fn(),
}));

const lookup = ensureLimitedFreeMediaModel as jest.Mock;
const account = { ownerId: 'account-a', epoch: 1 };
const decision: MobileImageGenerationRequestDecision = {
  status: 'blocked', code: 'plan_required', prompt: 'a lighthouse',
  alert: { title: 'Plan', message: 'Plan required' },
};

describe('mobile bounded free image offer', () => {
  beforeEach(() => lookup.mockReset());

  it.each(['unknown', 'not_offered'] as const)('preserves %s without inventing an offer', async (status) => {
    lookup.mockResolvedValue({ status });
    expect(await freeImageOfferFor(decision, account)).toEqual({ status });
    expect(lookup).toHaveBeenCalledWith('image', account);
  });

  it('keeps the original prompt and server-selected offering', async () => {
    lookup.mockResolvedValue({ status: 'offered', model: 'server-selected-offering' });
    expect(await freeImageOfferFor(decision, account)).toEqual({
      status: 'offered', model: 'server-selected-offering', prompt: 'a lighthouse',
    });
  });

  it.each(['requires_cloud', 'disabled', 'empty_prompt', 'auth_required', 'offline'] as const)(
    'never looks up an offer for %s', async (code) => {
      expect(await freeImageOfferFor({ ...decision, code }, account)).toEqual({ status: 'not_offered' });
      expect(lookup).not.toHaveBeenCalled();
    },
  );

  it('does not reroute a request with reference attachments', async () => {
    const { prompt: _prompt, ...withoutPrompt } = decision;
    expect(await freeImageOfferFor(withoutPrompt, account)).toEqual({ status: 'not_offered' });
    expect(lookup).not.toHaveBeenCalled();
  });
});
