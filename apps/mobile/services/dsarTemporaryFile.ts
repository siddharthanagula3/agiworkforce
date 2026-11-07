import * as Crypto from 'expo-crypto';
import {
  cacheDirectory,
  deleteAsync,
  getInfoAsync,
  makeDirectoryAsync,
} from 'expo-file-system/legacy';

const reservedDirectories = new Set<string>();

export async function withDsarTemporaryFile(
  fileName: 'agi_data_export.json' | 'agi_cloud_data_export.json',
  assertActive: () => void,
  handleFile: (uri: string) => Promise<void>,
): Promise<void> {
  assertActive();
  if (!cacheDirectory) throw new Error('Temporary export storage is unavailable.');
  const root = `${cacheDirectory}dsar_exports/`;
  const directory = `${root}${Crypto.randomUUID()}/`;
  if (reservedDirectories.has(directory))
    throw new Error('Could not allocate an export directory.');
  reservedDirectories.add(directory);
  let allocated = false;
  try {
    const rootInfo = await getInfoAsync(root);
    assertActive();
    if (!rootInfo.exists) {
      await makeDirectoryAsync(root, { intermediates: true });
      assertActive();
    }
    const info = await getInfoAsync(directory);
    assertActive();
    if (info.exists) throw new Error('Could not allocate an export directory.');
    await makeDirectoryAsync(directory, { intermediates: false });
    allocated = true;
    assertActive();
    await handleFile(`${directory}${fileName}`);
  } finally {
    // A rejected allocation does not establish ownership of the candidate directory.
    if (allocated) await deleteAsync(directory, { idempotent: true }).catch(() => {});
    reservedDirectories.delete(directory);
  }
}
