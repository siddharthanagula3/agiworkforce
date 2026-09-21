import {
  CLIENT_NAME_REQUEST_HEADER,
  CLIENT_VERSION_HEADER,
  SURFACE_REQUEST_HEADER,
  VSCODE_CLIENT_NAME,
} from '@agiworkforce/cloud-contracts';
import { isProductAnalyticsSurface } from '@agiworkforce/types';

import {
  API_VERSION_REQUEST_HEADER,
  SUPPORTED_API_CONTRACT_VERSIONS,
} from '@/lib/api-gateway-policy';

import { UNKNOWN_CLIENT_VERSION_LABEL, clientVersionLabel } from './client-versions';

export { CLIENT_NAME_REQUEST_HEADER, SURFACE_REQUEST_HEADER };

export const UNSUPPORTED_PROTOCOL_LABEL = 'unsupported';
export const UNKNOWN_PROTOCOL_LABEL = 'unknown';

const VSCODE_SURFACE = 'vscode';

export type RequestHeaderReader = (name: string) => string | null | undefined;

export interface HttpRequestLabels {
  readonly surface?: string;
  readonly clientVersion?: string;
  readonly protocolVersion?: string;
}

function headerValue(read: RequestHeaderReader, name: string): string {
  return (read(name) ?? '').trim();
}

// Each label is checked against a closed set the repository owns: the analytics
// surfaces, the registry's admitted release series, the supported contracts. A
// build that names neither is counted as unknown rather than left out, so a
// release-health split shows the traffic it cannot yet attribute.
export function httpRequestLabels(read: RequestHeaderReader): HttpRequestLabels {
  const labels: {
    surface?: string;
    clientVersion?: string;
    protocolVersion?: string;
  } = {};

  const client = headerValue(read, CLIENT_NAME_REQUEST_HEADER).toLowerCase();
  const claimed = headerValue(read, SURFACE_REQUEST_HEADER).toLowerCase();
  const surface = client === VSCODE_CLIENT_NAME ? VSCODE_SURFACE : claimed;
  if (isProductAnalyticsSurface(surface)) labels.surface = surface;

  labels.clientVersion =
    clientVersionLabel(headerValue(read, CLIENT_VERSION_HEADER)) ?? UNKNOWN_CLIENT_VERSION_LABEL;

  const protocol = headerValue(read, API_VERSION_REQUEST_HEADER);
  if (!protocol) {
    labels.protocolVersion = UNKNOWN_PROTOCOL_LABEL;
  } else {
    labels.protocolVersion = SUPPORTED_API_CONTRACT_VERSIONS.has(protocol)
      ? protocol
      : UNSUPPORTED_PROTOCOL_LABEL;
  }

  return labels;
}
