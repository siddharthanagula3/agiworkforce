import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getModelMetadataById,
  resolveMaxOutputTokens,
  type ModelMetadata,
} from '@agiworkforce/types';

type PromotionTestModule0 = typeof import('@agiworkforce/types');
type PromotionTestModule1 = typeof import('@/lib/services/provider-adapter-service');

vi.mock('server-only', () => ({}));

const managedProviders = vi.hoisted(() => ({ ids: new Set<string>() }));

vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<PromotionTestModule0>();
  const promotionDocument = (await import('@/config/free-model-promotion.json')).default;
  const promoted = Object.values(actual.modelsById).find(
    (model: ModelMetadata) =>
      model.provider === promotionDocument.provider &&
      model.qualityTier === promotionDocument.modelFamilyTier &&
      model.deprecated !== true,
  );
  const families = Object.values(actual.MODEL_FAMILY_REGISTRY);
  const slotExists = families.some(
    (family) =>
      family.provider === promotionDocument.provider &&
      family.tier === promotionDocument.modelFamilyTier,
  );
  const [template] = families;
  return {
    ...actual,
    MODEL_FAMILY_REGISTRY:
      slotExists || !promoted || !template
        ? actual.MODEL_FAMILY_REGISTRY
        : {
            ...actual.MODEL_FAMILY_REGISTRY,
            'fixture/promoted': {
              ...template,
              provider: promotionDocument.provider,
              tier: promotionDocument.modelFamilyTier,
              activeModelId: promoted.id,
            },
          },
  };
});

vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule1>()),
  listAvailableManagedProviderIds: () => managedProviders.ids,
}));

import {
  FREE_MODEL_PROMOTION_LIMIT_CODE,
  fitFreeModelPromotionOutput,
  freeModelPromotionCoversPlan,
  freeModelPromotionCoversSelection,
  freeModelPromotionCredentialApiKey,
  freeModelPromotionSpendMicrousd,
  loadFreeModelPromotionConfig,
  messageTokenBound,
  namesFreeModelPromotionModel,
  parseFreeModelPromotionConfig,
  promptTokenBound,
  readFreeModelPromotion,
  servedOnIsolatedPromotionCredential,
  type FreeModelPromotionConfig,
} from '@/lib/server/free-model-promotion';
import { FREE_TRIAL_MODEL } from '@/lib/free-trial-config';

const config = loadFreeModelPromotionConfig();
const isolated = config.credentials.find((credential) => credential.apiKey !== 'managed');
const isolatedEnv = isolated && isolated.apiKey !== 'managed' ? isolated.apiKey.env : '';
const DURING = Date.parse(config.startsAt) + 60_000;

function withConfig(patch: Partial<FreeModelPromotionConfig>): FreeModelPromotionConfig {
  return parseFreeModelPromotionConfig({ ...config, ...patch });
}

describe('free model promotion policy', () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env[isolatedEnv];
    process.env[isolatedEnv] = 'promotion-account-key';
    managedProviders.ids = new Set([config.provider]);
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env[isolatedEnv];
    else process.env[isolatedEnv] = savedKey;
  });

  it('ships a configuration that parses, with an isolated credential first and the managed key last', () => {
    expect(config.credentials[0]?.apiKey).not.toBe('managed');
    expect(config.credentials.at(-1)?.apiKey).toBe('managed');
    expect(config.spendCeilingUsd).toBeLessThanOrEqual(
      config.credentials.reduce((sum, credential) => sum + credential.creditUsd, 0),
    );
  });

  it('refuses a configuration that ends before it starts, spends past its credit, or names two managed keys', () => {
    expect(() => withConfig({ endsAt: config.startsAt })).toThrow();
    expect(() => withConfig({ spendCeilingUsd: 10_000 })).toThrow();
    expect(() =>
      withConfig({
        credentials: [
          { id: 'one', creditUsd: 200, apiKey: 'managed' },
          { id: 'two', creditUsd: 200, apiKey: 'managed' },
        ],
      }),
    ).toThrow();
    expect(() => withConfig({ promptTokenHeadroom: config.promptTokenCeiling })).toThrow();
  });

  it('is active only inside its window', () => {
    expect(readFreeModelPromotion(Date.parse(config.startsAt) - 1)).toBeNull();
    expect(readFreeModelPromotion(Date.parse(config.endsAt))).toBeNull();
    expect(readFreeModelPromotion(DURING)).not.toBeNull();
  });

  it('serves the model its family slot resolves to, at the Free plan output cap', () => {
    const promotion = readFreeModelPromotion(DURING);

    expect(promotion?.provider).toBe(config.provider);
    expect(getModelMetadataById(promotion?.modelId)?.provider).toBe(config.provider);
    expect(promotion?.outputTokenCap).toBe(resolveMaxOutputTokens(FREE_TRIAL_MODEL));
    expect(promotion?.promptBudgetTokens).toBe(
      config.promptTokenCeiling - config.promptTokenHeadroom,
    );
  });

  it('stays inactive until the family slot exists', () => {
    expect(
      readFreeModelPromotion(DURING, withConfig({ modelFamilyTier: 'no-such-tier' })),
    ).toBeNull();
  });

  it('runs on the managed key alone when the promotion account key is not configured', () => {
    delete process.env[isolatedEnv];

    const promotion = readFreeModelPromotion(DURING);

    expect(promotion?.credentials.map((credential) => credential.isolated)).toEqual([false]);
    expect(freeModelPromotionCredentialApiKey(isolated?.id ?? '')).toBeNull();
  });

  it('takes the promotion account before the managed one when both are configured', () => {
    const promotion = readFreeModelPromotion(DURING);

    expect(promotion?.credentials.map((credential) => credential.isolated)).toEqual([true, false]);
    expect(freeModelPromotionCredentialApiKey(isolated?.id ?? '')).toBe('promotion-account-key');
  });

  it('is inactive with no credential at all', () => {
    delete process.env[isolatedEnv];
    managedProviders.ids = new Set();

    expect(readFreeModelPromotion(DURING)).toBeNull();
  });

  it('covers Free accounts only, and Auto or the promoted model only', () => {
    const promotion = readFreeModelPromotion(DURING);
    if (!promotion) throw new Error('expected an active promotion');

    expect(freeModelPromotionCoversPlan('free')).toBe(true);
    expect(freeModelPromotionCoversPlan('pro')).toBe(false);
    expect(freeModelPromotionCoversPlan(null)).toBe(false);
    expect(freeModelPromotionCoversSelection(promotion, 'auto')).toBe(true);
    expect(freeModelPromotionCoversSelection(promotion, promotion.modelId)).toBe(true);
    expect(freeModelPromotionCoversSelection(promotion, FREE_TRIAL_MODEL)).toBe(false);
  });

  it('still recognises the promoted model after the promotion ends, so its turns can fall back', () => {
    const promotion = readFreeModelPromotion(DURING);
    if (!promotion) throw new Error('expected an active promotion');

    expect(readFreeModelPromotion(Date.parse(config.endsAt))).toBeNull();
    expect(namesFreeModelPromotionModel(promotion.modelId)).toBe(true);
    expect(namesFreeModelPromotionModel(FREE_TRIAL_MODEL)).toBe(false);
  });

  it('bounds text by its UTF-8 bytes, so scripts the estimator undercounts are still bounded', () => {
    const ascii = 'a'.repeat(1_000);
    const cjk = '漢'.repeat(1_000);

    expect(messageTokenBound({ content: ascii }, 6_000)).toBeGreaterThanOrEqual(1_000);
    expect(messageTokenBound({ content: cjk }, 6_000)).toBeGreaterThanOrEqual(3_000);
  });

  it('bounds an image by the largest image the provider bills, not by its encoded size', () => {
    const image = {
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${'A'.repeat(500_000)}` },
    };

    const bound = messageTokenBound({ content: '', multimodal_content: [image] }, 6_000);

    expect(bound).toBeGreaterThanOrEqual(6_000);
    expect(bound).toBeLessThan(7_000);
  });

  it('counts tool definitions inside the prompt', () => {
    const tools = [{ type: 'function', function: { name: 'x', description: 'd'.repeat(2_000) } }];

    expect(promptTokenBound({ messages: [], tools }, 6_000)).toBeGreaterThanOrEqual(2_000);
  });

  it('refuses a provider call whose prompt could cross the long-context ceiling', () => {
    const promotion = readFreeModelPromotion(DURING);
    if (!promotion) throw new Error('expected an active promotion');
    const tooLong = 'x'.repeat(config.promptTokenCeiling - config.promptTokenHeadroom + 1);

    const fit = fitFreeModelPromotionOutput({
      reservation: { reservedMicrousd: 1_000_000 },
      provider: promotion.provider,
      model: promotion.modelId,
      request: { messages: [{ role: 'user', content: tooLong }] },
      requestedMaxOutputTokens: 1_000,
    });

    expect(fit).toEqual({ ok: false, code: FREE_MODEL_PROMOTION_LIMIT_CODE });
  });

  it('fits output inside what the turn reserved, after what it already spent', () => {
    const promotion = readFreeModelPromotion(DURING);
    if (!promotion) throw new Error('expected an active promotion');
    const request = { messages: [{ role: 'user', content: 'hello' }] };
    const roomy = fitFreeModelPromotionOutput({
      reservation: { reservedMicrousd: promotion.turnReserveMicrousd },
      provider: promotion.provider,
      model: promotion.modelId,
      request,
      requestedMaxOutputTokens: promotion.outputTokenCap,
    });
    const spent = fitFreeModelPromotionOutput({
      reservation: { reservedMicrousd: promotion.turnReserveMicrousd },
      provider: promotion.provider,
      model: promotion.modelId,
      request,
      requestedMaxOutputTokens: promotion.outputTokenCap,
      priorCostMicrousd: promotion.turnReserveMicrousd,
    });

    expect(roomy).toEqual({ ok: true, maxOutputTokens: promotion.outputTokenCap });
    expect(spent).toEqual({ ok: false, code: FREE_MODEL_PROMOTION_LIMIT_CODE });
  });

  it('settles the measured usage even when the caller reported nothing for a failed turn', () => {
    const promotion = readFreeModelPromotion(DURING);
    if (!promotion) throw new Error('expected an active promotion');

    const spend = freeModelPromotionSpendMicrousd({
      provider: promotion.provider,
      model: promotion.modelId,
      usage: { promptTokens: 10_000, completionTokens: 500, totalTokens: 10_500 },
      reportedMicrousd: 0,
    });

    expect(spend).toBeGreaterThan(0);
    expect(freeModelPromotionSpendMicrousd({ reportedMicrousd: 42 })).toBe(42);
  });

  it('names an isolated credential from the reservation the turn carries', () => {
    const reservation = {
      promotionId: config.promotionId,
      credentialId: 'x',
      reservedMicrousd: 1,
    };

    expect(
      servedOnIsolatedPromotionCredential({
        freeTrial: { promotion: { ...reservation, isolated: true } },
      }),
    ).toBe(true);
    expect(
      servedOnIsolatedPromotionCredential({
        freeTrial: { promotion: { ...reservation, isolated: false } },
      }),
    ).toBe(false);
    expect(servedOnIsolatedPromotionCredential({})).toBe(false);
  });
});
