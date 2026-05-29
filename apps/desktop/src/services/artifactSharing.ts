/**
 * Artifact Sharing Service
 *
 * Desktop v1 keeps artifact shares local unless the user explicitly moves to a
 * managed cloud flow. This file creates self-contained base64 share URLs and
 * never writes directly to cloud database tables from the desktop frontend.
 */

export const SHARE_BASE_URL = 'https://app.agiworkforce.com/shared';

export interface ShareResult {
  url: string;
  shareId: string;
  expiresAt?: string;
  method: 'base64';
}

export interface SharedArtifact {
  id: string;
  title: string;
  artifactType: string;
  content: string;
  language?: string;
  createdAt: string;
  expiresAt?: string;
  viewCount: number;
}

interface Base64Payload {
  title: string;
  type: string;
  content: string;
  language?: string;
}

function shortHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function encodeBase64Payload(payload: Base64Payload): string {
  const json = JSON.stringify(payload);
  return btoa(encodeURIComponent(json));
}

function decodeBase64Payload(encoded: string): Base64Payload | null {
  try {
    const json = decodeURIComponent(atob(encoded));
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)['title'] !== 'string' ||
      typeof (parsed as Record<string, unknown>)['type'] !== 'string' ||
      typeof (parsed as Record<string, unknown>)['content'] !== 'string'
    ) {
      return null;
    }

    const obj = parsed as Record<string, unknown>;
    return {
      title: obj['title'] as string,
      type: obj['type'] as string,
      content: obj['content'] as string,
      language: typeof obj['language'] === 'string' ? obj['language'] : undefined,
    };
  } catch {
    return null;
  }
}

function buildBase64ShareResult(artifact: {
  title: string;
  type: string;
  content: string;
  language?: string;
}): ShareResult {
  const payload: Base64Payload = {
    title: artifact.title,
    type: artifact.type,
    content: artifact.content,
    language: artifact.language,
  };
  const encoded = encodeBase64Payload(payload);
  const shareId = shortHash(artifact.content + artifact.title);
  return {
    url: `${SHARE_BASE_URL}?data=${encoded}`,
    shareId,
    method: 'base64',
  };
}

export async function shareArtifact(artifact: {
  id: string;
  title: string;
  type: string;
  content: string;
  language?: string;
  expiresInDays?: number;
}): Promise<ShareResult> {
  void artifact.expiresInDays;
  return buildBase64ShareResult(artifact);
}

export async function getSharedArtifact(_shareId: string): Promise<SharedArtifact | null> {
  return null;
}

export function decodeBase64ShareData(encoded: string | null | undefined): SharedArtifact | null {
  if (!encoded) return null;

  const payload = decodeBase64Payload(encoded);
  if (!payload) return null;

  return {
    id: shortHash(payload.content + payload.title),
    title: payload.title,
    artifactType: payload.type,
    content: payload.content,
    language: payload.language,
    createdAt: new Date().toISOString(),
    expiresAt: undefined,
    viewCount: 0,
  };
}

export async function revokeShare(_shareId: string): Promise<boolean> {
  return true;
}
