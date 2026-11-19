const MEDIA_ASPECT_RATIO = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;

export function parseMediaAspectRatio(aspectRatio: string | undefined): number | null {
  const match = MEDIA_ASPECT_RATIO.exec(aspectRatio ?? '');
  if (!match) return null;
  const ratio = Number(match[1]) / Number(match[2]);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

export function hasKnownMediaFrame(aspectRatio: string | undefined): boolean {
  return parseMediaAspectRatio(aspectRatio) !== null;
}
