import { describe, expect, it } from 'vitest';
import type { FreeQuotaCatalogue, FreeQuotaModel } from '@agiworkforce/cloud-contracts';
import { getProviderOfferings, getRoutingSlotModel } from '@agiworkforce/types';
import {
  FREE_CAPACITY_FALLBACK_REASON,
  FREE_LIMIT_FALLBACK_REASON,
  FREE_USAGE_LIMIT_FALLBACK_REASON,
  freeLimitFallbackReason,
  pickFreeLimitFallback,
  type FreeLimitFallbackTurn,
} from './free-limit-fallback';

const FREE_ROUTER = getRoutingSlotModel('router_zero_cost');
const chatOfferings = Object.entries(getProviderOfferings()).filter(
  ([, offering]) => offering.quotaProbeProtocol === 'chat',
);
const textOnly = chatOfferings.filter(([, offering]) => !offering.quotaChatImageInput);
const imageCapable = chatOfferings.find(([, offering]) => offering.quotaChatImageInput)!;
const imageOffering = Object.entries(getProviderOfferings()).find(
  ([, offering]) => offering.quotaProbeProtocol === 'image-sync',
)!;

function row(key: string, patch: Partial<FreeQuotaModel> = {}): FreeQuotaModel {
  const offering = getProviderOfferings()[key]!;
  return {
    key,
    displayName: offering.displayName,
    providerModelId: offering.providerModelId,
    category: offering.category,
    limit: 1_000_000,
    unit: 'tokens',
    consumedApproximate: 0,
    expiresOn: '2099-01-01',
    status: 'ready',
    ...patch,
  };
}

function catalogue(models: FreeQuotaModel[]): FreeQuotaCatalogue {
  return {
    issuer: 'Fixture Cloud',
    observedOn: '2026-09-19',
    evidenceUrl: 'https://provider.example/free-quota',
    reportedEligible: models.length,
    reportedUnavailable: 0,
    models,
  };
}

function turn(patch: Partial<FreeLimitFallbackTurn> = {}): FreeLimitFallbackTurn {
  return {
    requestedModel: FREE_ROUTER,
    code: 'free_allowance_exhausted',
    draft: 'Explain photosynthesis in two sentences.',
    attachments: [],
    needsWebAccess: false,
    needsCodeExecution: false,
    needsTools: false,
    ...patch,
  };
}

describe('when Free Auto falls back to another free model', () => {
  it.each([
    ['free_allowance_exhausted', FREE_LIMIT_FALLBACK_REASON],
    ['free_capacity_unavailable', FREE_CAPACITY_FALLBACK_REASON],
    ['free_trial_token_budget_reached', FREE_USAGE_LIMIT_FALLBACK_REASON],
  ])('falls back on %s and says why', (code, reason) => {
    expect(freeLimitFallbackReason(turn({ code }))).toBe(reason);
  });

  it('never falls back from a model the reader picked', () => {
    expect(freeLimitFallbackReason(turn({ requestedModel: textOnly[0]![0] }))).toBeNull();
  });

  it.each(['provider_rate_limited', 'context_length_exceeded', undefined])(
    'leaves a %s refusal to its own card',
    (code) => {
      expect(freeLimitFallbackReason(turn({ code }))).toBeNull();
    },
  );
});

describe('choosing the free model to answer instead', () => {
  it('takes the first ready text model and skips spent, ended and unavailable ones', () => {
    const [spent, ended, unavailable, ready] = textOnly.map(([key]) => key);
    const choice = pickFreeLimitFallback(
      catalogue([
        row(spent!, { status: 'exhausted' }),
        row(ended!, { status: 'expired' }),
        row(unavailable!, { status: 'unavailable' }),
        row(imageOffering[0]),
        row(ready!),
      ]),
      turn(),
    );
    expect(choice).toBe(ready);
  });

  it('needs a model that reads images when the turn carries one', () => {
    const [textKey] = textOnly[0]!;
    const models = catalogue([row(textKey), row(imageCapable[0])]);
    expect(pickFreeLimitFallback(models, turn({ attachments: [{ type: 'image' }] }))).toBe(
      imageCapable[0],
    );
    expect(
      pickFreeLimitFallback(catalogue([row(textKey)]), turn({ attachments: [{ type: 'image' }] })),
    ).toBeNull();
  });

  it('does not fall back for a file no free model can read', () => {
    expect(
      pickFreeLimitFallback(
        catalogue([row(imageCapable[0])]),
        turn({ attachments: [{ type: 'file' }] }),
      ),
    ).toBeNull();
  });

  it.each([
    ['web search', { needsWebAccess: true }],
    ['code execution', { needsCodeExecution: true }],
    ['other tools', { needsTools: true }],
    ['a search typed into the message', { draft: 'search the web for today’s top headlines' }],
  ])('does not fall back to a chat-only model for %s', (_label, patch) => {
    expect(pickFreeLimitFallback(catalogue([row(textOnly[0]![0])]), turn(patch))).toBeNull();
  });

  it('does not fall back when nothing is offered', () => {
    expect(pickFreeLimitFallback(null, turn())).toBeNull();
    expect(pickFreeLimitFallback(catalogue([]), turn())).toBeNull();
  });
});
