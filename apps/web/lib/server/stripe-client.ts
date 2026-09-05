import 'server-only';

import Stripe from 'stripe';

import { STRIPE_CLIENT_OPTIONS } from '@/lib/stripe-config';
import { getOptionalEnv, requireEnv } from '@/shared/utils/env';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  stripeClient ??= new Stripe(requireEnv('STRIPE_SECRET_KEY'), STRIPE_CLIENT_OPTIONS);
  return stripeClient;
}

export function getStripeClientOrNull(): Stripe | null {
  return getOptionalEnv('STRIPE_SECRET_KEY') ? getStripeClient() : null;
}
