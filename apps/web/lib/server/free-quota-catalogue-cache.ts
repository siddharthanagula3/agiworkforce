import 'server-only';

import { revalidateTag } from 'next/cache';
import { providerOfferingDisplayName } from '@agiworkforce/types';
import type { FreeQuotaCatalogue } from '@/features/models/lib/free-quota-types';
import {
  buildFreeQuotaCatalogue,
  resolveFreeQuotaDecisions,
  type FreeQuotaContext,
  type FreeQuotaDecisions,
} from './free-quota-catalogue';
import { RENDER_CACHE_SECONDS, RENDER_CACHE_TAGS, cachedRenderInput } from './render-cache';

class UnsharedCatalogue extends Error {
  readonly #catalogue: FreeQuotaCatalogue;

  constructor(catalogue: FreeQuotaCatalogue) {
    super('The free quota catalogue was decided without shared state, so it is not cached.');
    this.#catalogue = catalogue;
  }

  get catalogue(): FreeQuotaCatalogue {
    return this.#catalogue;
  }
}

function decidedWithoutSharedState(
  context: FreeQuotaContext,
  decisions: FreeQuotaDecisions,
): boolean {
  return (
    Boolean(context.store && context.apiKey) &&
    decisions.offerings.some(
      ({ decision }) =>
        decision.status === 'unavailable' && decision.reason === 'shared_state_unavailable',
    )
  );
}

async function readCatalogue(context: FreeQuotaContext): Promise<FreeQuotaCatalogue | null> {
  const decisions = await resolveFreeQuotaDecisions(context);
  if (!decisions) return null;
  const built = buildFreeQuotaCatalogue(decisions);
  const catalogue = {
    ...built,
    models: built.models.map((model) => ({
      ...model,
      displayName: providerOfferingDisplayName(model.key) ?? model.displayName,
    })),
  };
  if (!context.localAttestation && decidedWithoutSharedState(context, decisions)) {
    throw new UnsharedCatalogue(catalogue);
  }
  return catalogue;
}

export async function readSharedFreeQuotaCatalogue(
  context: FreeQuotaContext,
): Promise<FreeQuotaCatalogue | null> {
  if (context.localAttestation) return readCatalogue(context);
  try {
    return await cachedRenderInput(() => readCatalogue(context), {
      keyParts: [RENDER_CACHE_TAGS.freeQuotaCatalogue],
      tags: [RENDER_CACHE_TAGS.freeQuotaCatalogue],
      revalidate: RENDER_CACHE_SECONDS.liveSignal,
    })();
  } catch (error) {
    if (error instanceof UnsharedCatalogue) return error.catalogue;
    throw error;
  }
}

export function expireFreeQuotaCatalogue(): void {
  revalidateTag(RENDER_CACHE_TAGS.freeQuotaCatalogue, { expire: 0 });
}
