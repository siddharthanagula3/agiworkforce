/**
 * Which surface is calling, which build of it, and which contract that build
 * was written against. Six surfaces send these, one server reads them.
 *
 * @module client-handshake
 */

import type { SourceSurface } from '@agiworkforce/types';

import { CLIENT_CAPABILITIES_REQUEST_HEADER, CLIENT_VERSION_HEADER } from './header-names';

export const SURFACE_REQUEST_HEADER = 'x-agi-surface';
export const CLIENT_NAME_REQUEST_HEADER = 'x-client';
export const API_VERSION_REQUEST_HEADER = 'x-agi-api-version';
export const API_VERSION_RESPONSE_HEADER = 'x-agi-api-version';
export const MINIMUM_API_VERSION_RESPONSE_HEADER = 'x-agi-api-version-minimum';

/** The newest request and response shapes this deployment serves. */
export const API_CONTRACT_VERSION = '2026-09-17';

/**
 * The oldest contract still answered, equal to the newest because every shipped
 * surface was built against that one. A client below it is told to update.
 */
export const MINIMUM_SUPPORTED_API_CONTRACT_VERSION = '2026-09-17';

// Every contract still answered, oldest first. A bump APPENDS here, so installed builds that name
// the older one keep working until the floor above is raised on purpose.
export const API_CONTRACT_VERSIONS: readonly string[] = ['2026-09-17'];

export const SUPPORTED_API_CONTRACT_VERSIONS: ReadonlySet<string> = new Set(
  API_CONTRACT_VERSIONS.filter((version) => version >= MINIMUM_SUPPORTED_API_CONTRACT_VERSION),
);

/** The editor reaches the platform through the browser's origin, so it names itself too. */
export const VSCODE_CLIENT_NAME = 'vscode-extension';

/**
 * This build uploads chat files over the inline limit in parts and waits on
 * their intake. Installed builds parse intake status with closed enums, so a
 * new intake state, refusal, failure or cancel code ships under a new token.
 */
export const LARGE_CHAT_FILES_CAPABILITY = 'large-chat-files-v1';

export const CLIENT_CAPABILITIES = [LARGE_CHAT_FILES_CAPABILITY] as const;
export type ClientCapability = (typeof CLIENT_CAPABILITIES)[number];

export interface ClientBuild {
  surface: SourceSurface;
  /** What the build stamped into this client, absent when the build did not stamp one. */
  version: string | undefined;
  /** Optional behaviours the caller has switched on; none sends no capability header. */
  capabilities?: readonly ClientCapability[];
}

/**
 * A build with no version stamp omits the header rather than claiming one it
 * does not have; the server labels that `unknown` and counts it.
 */
export function clientHandshakeHeaders(build: ClientBuild): Record<string, string> {
  const version = build.version?.trim();
  const capabilities = [...new Set(build.capabilities ?? [])];
  return {
    [SURFACE_REQUEST_HEADER]: build.surface,
    ...(version ? { [CLIENT_VERSION_HEADER]: version } : {}),
    [API_VERSION_REQUEST_HEADER]: API_CONTRACT_VERSION,
    ...(capabilities.length > 0
      ? { [CLIENT_CAPABILITIES_REQUEST_HEADER]: capabilities.join(', ') }
      : {}),
  };
}

/**
 * The one reader of the capability header. A token counts only as a whole
 * comma-separated entry, so a longer token that starts with it never does.
 */
export function hasClientCapability(
  headerValue: string | null | undefined,
  capability: ClientCapability,
): boolean {
  if (typeof headerValue !== 'string') return false;
  return headerValue.split(',').some((entry) => entry.trim() === capability);
}
