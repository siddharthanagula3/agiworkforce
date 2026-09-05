/**
 * Model-access policy is a ROUTING input, so its evaluator lives with the
 * router: `resolveAutoRoute` filters the plan against the workspace policy
 * once, rather than each caller filtering the router's output afterwards.
 *
 * This module re-exports it so the web's existing call sites keep their import
 * path. There is one implementation, in `@agiworkforce/routing`.
 */
export {
  canonicalProvider,
  evaluateModelAccess,
  policyRestrictsAnything,
} from '@agiworkforce/routing';

export type {
  ModelAccessAsk,
  ModelAccessCode,
  ModelAccessDecision,
  ModelAccessPolicy,
} from '@agiworkforce/routing';
