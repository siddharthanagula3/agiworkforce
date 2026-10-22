export type ReportAsset = { kind: 'image' | 'video'; url: string };

const MAX_ASSET_URL_LEN = 2048;

/** Inline `data:` media keeps only its header; the bytes stay on the device. */
export function reportAssetFor(
  kind: ReportAsset['kind'],
  url: string | null | undefined,
): ReportAsset | undefined {
  if (!url) return undefined;
  const reference = url.startsWith('data:') ? url.slice(0, Math.max(url.indexOf(','), 0)) : url;
  return reference ? { kind, url: reference.slice(0, MAX_ASSET_URL_LEN) } : undefined;
}
