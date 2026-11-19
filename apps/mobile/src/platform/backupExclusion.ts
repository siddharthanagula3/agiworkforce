import { NativeModules, Platform } from 'react-native';

interface AGIBackupExclusionModule {
  excludeFromBackup(uris: string[]): Promise<number>;
}

export async function excludeFromBackup(uris: readonly string[]): Promise<void> {
  if (Platform.OS !== 'ios' || uris.length === 0) return;
  const native = NativeModules.AGIBackupExclusion as AGIBackupExclusionModule | undefined;
  if (!native) throw new Error('AGIBackupExclusion native module not linked, rebuild the iOS app');
  await native.excludeFromBackup([...uris]);
}
