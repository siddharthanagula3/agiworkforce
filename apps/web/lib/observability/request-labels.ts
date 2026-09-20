import { CLIENT_VERSION_HEADER } from '@agiworkforce/cloud-contracts';
import { isProductAnalyticsSurface } from '@agiworkforce/types';

import {
  API_VERSION_REQUEST_HEADER,
  SUPPORTED_API_CONTRACT_VERSIONS,
} from '@/lib/api-gateway-policy';

export const SURFACE_REQUEST_HEADER = 'x-agi-surface';
export const CLIENT_NAME_REQUEST_HEADER = 'x-client';

export const UNSUPPORTED_PROTOCOL_LABEL = 'unsupported';

const VSCODE_CLIENT_NAME = 'vscode-extension';
const VSCODE_SURFACE = 'vscode';
const CLIENT_VERSION_PATTERN = /^\d{1,6}(\.\d{1,6}){0,2}/u;

export type RequestHeaderReader = (name: string) => string | null | undefined;

export interface HttpRequestLabels {
  readonly surface?: string;
  readonly clientVersion?: string;
  readonly protocolVersion?: string;
}

function headerValue(read: RequestHeaderReader, name: string): string {
  return (read(name) ?? '').trim();
}

/**
 * The three things a caller declares about itself, as metric labels. Each is
 * checked against a vocabulary that already exists, so a typed header can open
 * no new series: an unknown surface or client version is dropped rather than
 * counted, and an unsupported contract version reads as one label.
 */
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

  const version = CLIENT_VERSION_PATTERN.exec(headerValue(read, CLIENT_VERSION_HEADER))?.[0];
  if (version) labels.clientVersion = version;

  const protocol = headerValue(read, API_VERSION_REQUEST_HEADER);
  if (protocol) {
    labels.protocolVersion = SUPPORTED_API_CONTRACT_VERSIONS.has(protocol)
      ? protocol
      : UNSUPPORTED_PROTOCOL_LABEL;
  }

  return labels;
}
