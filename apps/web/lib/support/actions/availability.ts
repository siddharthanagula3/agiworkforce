
import 'server-only';

export function isVerificationEmailSendable(): boolean {
  return false;
}

export function isBillingPortalAvailable(): boolean {
  return Boolean(process.env['STRIPE_SECRET_KEY']);
}
