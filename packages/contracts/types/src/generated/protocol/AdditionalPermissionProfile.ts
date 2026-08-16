import type { FileSystemPermissions } from './FileSystemPermissions';
import type { NetworkPermissions } from './NetworkPermissions';

export type AdditionalPermissionProfile = {
  network: NetworkPermissions | null;
  file_system: FileSystemPermissions | null;
};
