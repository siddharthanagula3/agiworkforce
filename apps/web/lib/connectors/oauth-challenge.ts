
import 'server-only';

export function parseChallengeParam(header: string, key: string): string | null {
  const needle = `${key}=`;
  const index = header.toLowerCase().indexOf(needle.toLowerCase());
  if (index === -1) return null;
  const after = header.slice(index + needle.length);
  if (after.startsWith('"')) {
    const rest = after.slice(1);
    const end = rest.indexOf('"');
    if (end === -1) return null;
    return rest.slice(0, end);
  }
  const end = after.search(/[,\s]/);
  return end === -1 ? after : after.slice(0, end);
}

export function parseResourceMetadataUrl(
  wwwAuthenticate: string | null | undefined,
): string | null {
  if (!wwwAuthenticate) return null;
  return parseChallengeParam(wwwAuthenticate, 'resource_metadata');
}

export function parseInsufficientScope(wwwAuthenticate: string | null | undefined): string | null {
  if (!wwwAuthenticate) return null;
  const error = parseChallengeParam(wwwAuthenticate, 'error');
  if (!error || error.toLowerCase() !== 'insufficient_scope') return null;
  return parseChallengeParam(wwwAuthenticate, 'scope');
}

export interface ConnectorAuthChallenge {
  status: 401 | 403;
  wwwAuthenticate: string | null;
  resourceMetadataUrl: string | null;
  requiredScope: string | null;
}

function readNumericField(error: Record<string, unknown>, field: string): number | null {
  const value = error[field];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

export function detectConnectorAuthChallenge(error: unknown): ConnectorAuthChallenge | null {
  if (!error || typeof error !== 'object') return null;
  const record = error as Record<string, unknown>;

  const status =
    readNumericField(record, 'code') ??
    readNumericField(record, 'status') ??
    readNumericField(record, 'statusCode');

  const isUnauthorizedError = record['name'] === 'UnauthorizedError';
  if (status !== 401 && status !== 403 && !isUnauthorizedError) return null;

  const header =
    typeof record['wwwAuthenticate'] === 'string'
      ? (record['wwwAuthenticate'] as string)
      : extractChallengeFromMessage(record['message']);

  const requiredScope = parseInsufficientScope(header);

  if (status === 403 && !requiredScope) return null;

  return {
    status: status === 403 ? 403 : 401,
    wwwAuthenticate: header,
    resourceMetadataUrl: parseResourceMetadataUrl(header),
    requiredScope,
  };
}

function extractChallengeFromMessage(message: unknown): string | null {
  if (typeof message !== 'string') return null;
  const match = /Bearer\s+[^\n]*(?:realm|error|resource_metadata|scope)=/i.exec(message);
  if (!match) return null;
  return message.slice(match.index).split('\n')[0] ?? null;
}
