/**
 * Route dispatch descriptors: which wire protocol a harness speaks, where it
 * speaks it, and which environment variable holds its credential.
 *
 * The registry owns the data; this module is the contract surface every
 * consumer outside `packages/ai/model-registry` reads it through, so a route
 * can be described by protocol plus configuration instead of a bespoke adapter
 * package per gateway.
 */

export {
  getProtocolHarness,
  listProtocolRoutes,
  REGISTRY_DECLARED_PROVIDER_HOSTS,
} from '@agiworkforce/model-registry';
export type {
  HarnessHostPolicy,
  HarnessProtocol,
  ProtocolHarness,
  ProtocolRoute,
} from '@agiworkforce/model-registry';
