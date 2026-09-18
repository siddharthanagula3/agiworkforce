/**
 * The two facts about a route that the catalog has always published and that
 * ranking never read: where it processes requests, and what kind of cache it
 * keeps.
 *
 * Kept out of `auto.ts` so both are pure functions of their inputs rather than
 * of the compiled registry, which is what lets the residency rules be tested
 * against a region the production catalog does not serve.
 *
 * @module route-ranking
 */

/**
 * What a provider or model publishes about where it processes requests. `null`
 * and `undefined` both mean "no verified answer", which is the case the two
 * rules below disagree about, and the whole reason they are two rules.
 */
export type ResidencyPublication = readonly string[] | null | undefined;

export interface ResidencyAdmission {
  /** The route id, for the rejection reason. */
  routeId: string;
  /** What publishes the list: `route` for the transport, `model` for the model. */
  subject: 'route' | 'model';
  region: string | null | undefined;
  published: ResidencyPublication;
}

/**
 * The home region's rule: a transport that publishes a region list without this
 * region is refused, and one that publishes nothing is admitted.
 *
 * An unpublished region is an evidence gap rather than a known violation, and
 * refusing every unpublished transport would refuse most of the catalog for a
 * deployment that has asked for nothing beyond the region it already runs in.
 */
export function residencyRejection(input: ResidencyAdmission): string | null {
  if (!input.region || !input.published) return null;
  if (input.published.includes(input.region)) return null;
  return `${input.subject} ${input.routeId} does not process requests in region ${input.region}`;
}

/**
 * A pinned workspace's rule: every route must PROVE it processes in the
 * workspace's region, so an unpublished list is a refusal rather than a pass.
 *
 * Fail-closed on purpose and not symmetrical with `residencyRejection` above:
 * that one governs the deployment's own home region, where an unpublished
 * answer costs nothing to admit; this one governs a workspace that has pinned
 * its data to a region, where admitting an unpublished answer is exactly the
 * silent violation the pin exists to prevent.
 */
export function strictResidencyRejection(input: ResidencyAdmission): string | null {
  if (!input.region) return null;
  if (input.published && input.published.includes(input.region)) return null;
  const detail = input.published ? 'does not process' : 'publishes no residency answer for';
  return `${input.subject} ${input.routeId} ${detail} requests in region ${input.region}`;
}

const NO_ROUTE_CACHE_CLASS = 'no_provider_cache';

/**
 * Whether staying on this route can read anything back.
 *
 * The one question cache affinity actually turns on: a preference for the route
 * a conversation already warmed is worth a cost premium exactly when that route
 * keeps a cache, and worth nothing when the catalog says it keeps none. Ranking
 * never uses it to reorder two routes on cache class alone, because a discount
 * on the dearer route is not a saving, and because route order is a contract the
 * Rust resolver reproduces.
 */
export function routeKeepsCache(cacheClass: string): boolean {
  return cacheClass !== NO_ROUTE_CACHE_CLASS;
}
