import {
  CLIENT_NAME_REQUEST_HEADER,
  VSCODE_CLIENT_NAME,
  clientHandshakeHeaders,
} from '@agiworkforce/cloud-contracts';

import { SOURCE_SURFACE } from './surface';
import { getExtensionUserAgent, getExtensionVersion } from './version';

/**
 * One builder for every call from this extension, so a new client cannot ship
 * knowing only half the handshake.
 */
export function platformRequestHeaders(): Record<string, string> {
  return {
    'User-Agent': getExtensionUserAgent(),
    [CLIENT_NAME_REQUEST_HEADER]: VSCODE_CLIENT_NAME,
    ...clientHandshakeHeaders({ surface: SOURCE_SURFACE, version: getExtensionVersion() }),
  };
}
