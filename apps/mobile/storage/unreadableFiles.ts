import { deleteAsync, getInfoAsync, moveAsync, readDirectoryAsync } from 'expo-file-system/legacy';
import { excludeFromBackup } from '@/src/platform/backupExclusion';

export const SET_ASIDE_MARKER = '.unreadable-';

async function exists(uri: string): Promise<boolean> {
  return (await getInfoAsync(uri)).exists === true;
}

export async function deleteSetAsideCopies(directoryUri: string): Promise<void> {
  const directory = directoryUri.replace(/\/+$/, '');
  if (!(await exists(directory))) return;
  const names = await readDirectoryAsync(directory);
  await Promise.all(
    names
      .filter((name) => name.includes(SET_ASIDE_MARKER))
      .map((name) => deleteAsync(`${directory}/${name}`, { idempotent: true })),
  );
}

/**
 * Renames an encrypted store that this phone has no key for, together with its
 * companion files, so a fresh store can start in its place. Nothing is deleted
 * and an earlier copy is never replaced. Resolves false when there is nothing
 * to set aside.
 */
export async function setAsideUnreadableFiles(params: {
  uri: string;
  asideUri: (attempt: number) => string;
  companionSuffixes: readonly string[];
}): Promise<boolean> {
  const { uri, asideUri, companionSuffixes } = params;
  const suffixes = ['', ...companionSuffixes];
  const anyExists = async (base: string): Promise<boolean> =>
    (await Promise.all(suffixes.map((suffix) => exists(`${base}${suffix}`)))).some(Boolean);
  if (!(await anyExists(uri))) return false;

  let attempt = 0;
  let aside = asideUri(attempt);
  while (await anyExists(aside)) {
    attempt += 1;
    aside = asideUri(attempt);
  }

  const moved: string[] = [];
  for (const suffix of suffixes) {
    const from = `${uri}${suffix}`;
    if (!(await exists(from))) continue;
    await moveAsync({ from, to: `${aside}${suffix}` });
    moved.push(`${aside}${suffix}`);
  }

  // No key on this phone opens the set-aside copy, so backing it up would only
  // spend the person's backup space.
  await excludeFromBackup(moved).catch((error: unknown) => {
    console.warn('[storage] Could not exclude the set-aside copy from backup:', error);
  });
  return true;
}
