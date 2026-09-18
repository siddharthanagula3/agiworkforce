import { CONCEPT_NAMES, isConceptName, type ConceptName } from '@agiworkforce/types';

/**
 * One canonical address for a resource, so a link in an email, a desktop deep
 * link and a row in an audit event all name the same thing the same way. The
 * kinds are the concept registry's, never a second list.
 */
export const RESOURCE_URI_SCHEME = 'agi';

export const RESOURCE_URI_KINDS: readonly ConceptName[] = CONCEPT_NAMES;

export interface ResourceUri {
  readonly kind: ConceptName;
  readonly id: string;
  readonly workspaceId?: string;
  readonly view?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MINTED = /^[a-z]{2,6}_[0-9a-zA-Z]{8,64}$/u;

/**
 * A provider's own task id is never a canonical address: it is scoped to that
 * vendor, it disappears when the vendor does, and it leaks who served the call.
 */
export function isCanonicalResourceId(value: string): boolean {
  return UUID.test(value) || MINTED.test(value);
}

export function formatResourceUri(ref: ResourceUri): string {
  if (!isConceptName(ref.kind)) {
    throw new Error(`resource uri: '${ref.kind}' is not a concept in the registry`);
  }
  if (!isCanonicalResourceId(ref.id)) {
    throw new Error('resource uri: id is not a canonical AGI id');
  }
  const query = ref.workspaceId ? `?workspace=${encodeURIComponent(ref.workspaceId)}` : '';
  const fragment = ref.view ? `#${encodeURIComponent(ref.view)}` : '';
  return `${RESOURCE_URI_SCHEME}://${ref.kind}/${ref.id}${query}${fragment}`;
}

export function parseResourceUri(value: string): ResourceUri | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== `${RESOURCE_URI_SCHEME}:`) return null;

  const kind = url.hostname;
  if (!isConceptName(kind)) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 1) return null;
  const id = decodeURIComponent(segments[0] as string);
  if (!isCanonicalResourceId(id)) return null;

  const workspaceId = url.searchParams.get('workspace');
  const view = url.hash ? decodeURIComponent(url.hash.slice(1)) : '';

  return {
    kind,
    id,
    ...(workspaceId ? { workspaceId } : {}),
    ...(view ? { view } : {}),
  };
}
