import type { ManagedFileSystemPermissions } from './ManagedFileSystemPermissions';
import type { NetworkSandboxPolicy } from './NetworkSandboxPolicy';

export type PermissionProfile =
  | { type: 'managed'; file_system: ManagedFileSystemPermissions; network: NetworkSandboxPolicy }
  | { type: 'disabled' };
