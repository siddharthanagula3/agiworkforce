import path from 'node:path';

export const OPEN_SOURCE_NOTICES_FILE = 'THIRD_PARTY_NOTICES.txt';

export interface NoticesLocation {
  isPackaged: boolean;
  resourcesPath: string;
  buildOutputDir: string;
}

export function openSourceNoticesPath(location: NoticesLocation): string {
  const directory = location.isPackaged ? location.resourcesPath : location.buildOutputDir;
  return path.join(directory, OPEN_SOURCE_NOTICES_FILE);
}

export async function openOpenSourceNotices(
  filePath: string,
  openPath: (target: string) => Promise<string>,
): Promise<string | null> {
  const failure = await openPath(filePath);
  return failure === '' ? null : failure;
}
