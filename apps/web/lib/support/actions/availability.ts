/**
 * @file Deployment capability probes for support actions.
 *
 * An action is offered only when performing it would actually work. A control
 * that is rendered, confirmed, and then fails is worse than a control that was
 * never offered — the user has already been told it would happen.
 */

import 'server-only';

/**
 * VERIFIED ABSENCE, not an assumption:
 *
 * 1. This repo has NO transactional email provider. There is no `resend`,
 *    `@sendgrid/*`, `postmark` or `nodemailer` dependency in any package.json
 *    (`lib/services/organization-invitation-service.ts` documents the same
 *    absence and ships copy-a-link instead of sending mail).
 *
 * 2. `@clerk/backend`'s `EmailAddressAPI` exposes only `getEmailAddress`,
 *    `createEmailAddress`, `updateEmailAddress` and `deleteEmailAddress`
 *    (node_modules/@clerk/backend/dist/api/endpoints/EmailAddressApi.d.ts).
 *    There is no server-side prepare-or-resend verification.
 *    `updateEmailAddress({ verified: true })` would FORGE verification rather
 *    than send one and must never be used for this.
 *
 * So there is no honest way to resend a verification email from the server
 * today. The action stays registered — so its shape, refusal and tests are all
 * real — but resolves unavailable, is never offered, and `propose` refuses it.
 * It flips on with no registry change once a provider exists.
 *
 * The concurrent support-handoff workflow needs the SAME missing integration
 * for its escalation email. Whoever lands it unblocks both.
 */
export function isVerificationEmailSendable(): boolean {
  return false;
}

/**
 * The billing portal is a Stripe hand-off. Without a Stripe secret the portal
 * route cannot mint a session, so offering the action would guarantee a failure
 * after the user confirmed.
 */
export function isBillingPortalAvailable(): boolean {
  return Boolean(process.env['STRIPE_SECRET_KEY']);
}
