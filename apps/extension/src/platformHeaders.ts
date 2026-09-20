import { clientHandshakeHeaders } from '@agiworkforce/cloud-contracts';

import { SOURCE_SURFACE } from './surface';

// The cloud clients also load outside an extension page, where there is no
// extension API. A handshake that threw there would take the request with it.
function installedVersion(): string | undefined {
  if (typeof chrome === 'undefined') return undefined;
  return chrome.runtime?.getManifest?.()?.version;
}

/** The version is the one Chrome installed, not the one in the repository. */
export function platformRequestHeaders(): Record<string, string> {
  return clientHandshakeHeaders({ surface: SOURCE_SURFACE, version: installedVersion() });
}
