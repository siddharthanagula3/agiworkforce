export const DEVELOPER_SESSION_PROTOCOL_VERSION = 8;

export const AGENT_EVENT_SCHEMA_VERSION = 4;

export const PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE = -32005;

export const MINIMUM_SUPPORTED_RUNTIME_VERSION = '1.7.1';

const RUNTIME_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u;

function releaseParts(version: string): { parts: number[]; prerelease: boolean } | null {
  const match = RUNTIME_VERSION_PATTERN.exec(version);
  if (match === null) return null;
  const parts = match.slice(1, 4).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return null;
  return { parts, prerelease: match[4] !== undefined };
}

export function isSupportedRuntimeVersion(version: string): boolean {
  const candidate = releaseParts(version);
  const minimum = releaseParts(MINIMUM_SUPPORTED_RUNTIME_VERSION);
  if (candidate === null || minimum === null) return false;
  for (const [index, floor] of minimum.parts.entries()) {
    const part = candidate.parts[index] ?? 0;
    if (part > floor) return true;
    if (part < floor) return false;
  }
  return !candidate.prerelease;
}
