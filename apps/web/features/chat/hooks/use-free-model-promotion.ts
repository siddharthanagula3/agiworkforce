'use client';

import { useEffect, useState } from 'react';
import {
  FREE_MODEL_PROMOTION_PATH,
  FreeModelPromotionResponseSchema,
  type FreeModelPromotionOffer,
} from '@agiworkforce/cloud-contracts';

let pending: Promise<FreeModelPromotionOffer | null> | null = null;

async function readPromotion(): Promise<FreeModelPromotionOffer | null> {
  const response = await fetch(FREE_MODEL_PROMOTION_PATH, { cache: 'no-store' });
  if (!response.ok) return null;
  const parsed = FreeModelPromotionResponseSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.promotion : null;
}

function sharedPromotion(): Promise<FreeModelPromotionOffer | null> {
  pending ??= readPromotion().catch(() => {
    pending = null;
    return null;
  });
  return pending;
}

function stillRunning(offer: FreeModelPromotionOffer | null): FreeModelPromotionOffer | null {
  return offer && Date.parse(offer.endsAt) > Date.now() ? offer : null;
}

export interface FreeModelPromotionState {
  /** False until the offer has been read, so a selection is not judged against a guess. */
  ready: boolean;
  promotion: FreeModelPromotionOffer | null;
}

const NOT_OFFERED: FreeModelPromotionState = { ready: true, promotion: null };

/**
 * The free model promotion this account is offered, read once per page and
 * shared by every caller. Null on any plan it does not cover, once it ends,
 * and whenever it cannot be read: the server decides every turn regardless.
 */
export function useFreeModelPromotion(enabled: boolean): FreeModelPromotionState {
  const [state, setState] = useState<{ read: boolean; offer: FreeModelPromotionOffer | null }>({
    read: false,
    offer: null,
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void sharedPromotion().then((offer) => {
      if (active) setState({ read: true, offer });
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  if (!enabled) return NOT_OFFERED;
  return { ready: state.read, promotion: stillRunning(state.offer) };
}
