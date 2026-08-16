import type { GlobMatch } from '../../api/codeSearch';
import { invoke } from '../../lib/tauri-mock';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LISTING_RESULTS = 1_000;

export interface CloudHandoffFolderGrant {
  grantId: string;
  path: string;
}

export interface CloudHandoffFolderListing {
  matches: GlobMatch[];
  truncated: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseGrant(value: unknown): CloudHandoffFolderGrant {
  const grantId = isRecord(value) ? value['grantId'] : undefined;
  const path = isRecord(value) ? value['path'] : undefined;
  if (
    typeof grantId !== 'string' ||
    !UUID_PATTERN.test(grantId) ||
    typeof path !== 'string' ||
    path.length === 0 ||
    path.length > 32_768
  ) {
    throw new Error('The native folder picker returned an invalid Cloud handoff grant.');
  }
  return { grantId, path };
}

function parseListing(value: unknown): CloudHandoffFolderListing {
  const rawMatches = isRecord(value) ? value['matches'] : undefined;
  const truncated = isRecord(value) ? value['truncated'] : undefined;
  if (!Array.isArray(rawMatches) || typeof truncated !== 'boolean') {
    throw new Error('The native folder listing returned an invalid response.');
  }
  if (rawMatches.length > MAX_LISTING_RESULTS) {
    throw new Error('The native folder listing exceeded its result bound.');
  }
  const matches = rawMatches.map((entry): GlobMatch => {
    const path = isRecord(entry) ? entry['path'] : undefined;
    const relativePath = isRecord(entry) ? entry['relativePath'] : undefined;
    const isFile = isRecord(entry) ? entry['isFile'] : undefined;
    const sizeBytes = isRecord(entry) ? entry['sizeBytes'] : undefined;
    const modifiedSecs = isRecord(entry) ? entry['modifiedSecs'] : undefined;
    const relativeSegments = typeof relativePath === 'string' ? relativePath.split('/') : [];
    if (
      typeof path !== 'string' ||
      typeof relativePath !== 'string' ||
      path !== relativePath ||
      relativePath.length === 0 ||
      relativePath.startsWith('/') ||
      relativePath.includes('\\') ||
      relativeSegments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
      isFile !== true ||
      typeof sizeBytes !== 'number' ||
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes < 0 ||
      typeof modifiedSecs !== 'number' ||
      !Number.isSafeInteger(modifiedSecs)
    ) {
      throw new Error('The native folder listing contained an invalid file entry.');
    }
    return {
      path,
      relativePath,
      isFile: true,
      sizeBytes,
      modifiedSecs,
    };
  });
  return { matches, truncated };
}

export async function selectCloudHandoffFolder(): Promise<CloudHandoffFolderGrant | null> {
  const selected = await invoke<unknown>('select_cloud_handoff_folder');
  return selected === null ? null : parseGrant(selected);
}

export async function listCloudHandoffFiles(
  grantId: string,
  limit = MAX_LISTING_RESULTS,
): Promise<CloudHandoffFolderListing> {
  if (!UUID_PATTERN.test(grantId)) throw new Error('Cloud handoff grant is invalid or expired.');
  return parseListing(
    await invoke<unknown>('list_cloud_handoff_files', {
      grantId,
      limit: Math.max(1, Math.min(MAX_LISTING_RESULTS, Math.trunc(limit))),
    }),
  );
}

export async function readCloudHandoffFile(
  grantId: string,
  relativePath: string,
): Promise<Uint8Array> {
  if (!UUID_PATTERN.test(grantId)) throw new Error('Cloud handoff grant is invalid or expired.');
  const raw = await invoke<ArrayBuffer | Uint8Array | number[]>('read_cloud_handoff_file', {
    grantId,
    relativePath,
  });
  return raw instanceof Uint8Array
    ? Uint8Array.from(raw)
    : raw instanceof ArrayBuffer
      ? new Uint8Array(raw)
      : Uint8Array.from(raw);
}

export async function revokeCloudHandoffGrant(grantId: string): Promise<void> {
  if (!UUID_PATTERN.test(grantId)) return;
  await invoke('revoke_cloud_handoff_grant', { grantId });
}
