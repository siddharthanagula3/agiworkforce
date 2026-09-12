import 'server-only';

import { logger } from '@/lib/logger';
import {
  metadataCitesRoutingRedirect,
  resolveSourceUrlMetadataRedirects,
} from '@/lib/web-search/source-url-metadata';
import type { RedirectResolutionOverrides } from '@/lib/web-search/web-search-tool';

/**
 * Turn the routing-provider redirects a client is about to save into the
 * publisher URLs they stand in front of.
 *
 * The server's own post-stream patch already rewrites this row, but the
 * client's save merges into the same row under `metadata || excluded.metadata`.
 * Normally the client save lands first and the patch wins; a slow or retried
 * save lands last and would put the redirects back, so both writers resolve and
 * whichever lands last still stores publisher URLs.
 *
 * The cheap synchronous gate comes first, so a payload citing no redirect,
 * which is most of them, reaches the insert without a network call: this is a
 * request a user is waiting on, unlike the patch. When a redirect is present the
 * resolution is usually already in the resolver's process cache, warmed moments
 * earlier by the patch for these same URLs.
 *
 * Never throws. A citation href is not worth failing a save over, so a
 * resolution that breaks stores the metadata exactly as it arrived.
 */
export async function resolveSavedMessageSourceUrls(
  metadata: Record<string, unknown>,
  overrides: RedirectResolutionOverrides = {},
): Promise<Record<string, unknown>> {
  if (!metadataCitesRoutingRedirect(metadata)) return metadata;
  try {
    const patch = await resolveSourceUrlMetadataRedirects(metadata, overrides);
    return patch ? { ...metadata, ...patch } : metadata;
  } catch (error) {
    logger.warn(
      { event: 'saved_message_citation_resolution_failed', error },
      'Citation URLs could not be resolved on the message write path; the saved row keeps the provider redirects',
    );
    return metadata;
  }
}
