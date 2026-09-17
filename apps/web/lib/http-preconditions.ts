import { NextResponse } from 'next/server';

export type IfMatchPrecondition =
  { kind: 'none' } | { kind: 'version'; version: string } | { kind: 'malformed' };

const VERSION_TAG = /^(?:W\/)?"?(\d{1,19})"?$/u;

export function readIfMatchVersion(request: Request): IfMatchPrecondition {
  const raw = request.headers.get('if-match')?.trim();
  if (!raw || raw === '*') return { kind: 'none' };
  const match = VERSION_TAG.exec(raw);
  return match?.[1] ? { kind: 'version', version: match[1] } : { kind: 'malformed' };
}

export function versionEtag(version: string | number | bigint): string {
  return `"${String(version)}"`;
}

export function preconditionFailedResponse(
  message: string,
  current: Record<string, unknown> | null,
  currentVersion: string | null,
): NextResponse {
  const response = NextResponse.json(
    { error: { code: 'PRECONDITION_FAILED', message }, current },
    { status: 412 },
  );
  if (currentVersion) response.headers.set('etag', versionEtag(currentVersion));
  return response;
}
