import type { AbsolutePathBuf } from './AbsolutePathBuf';
import type { RequestPermissionProfile } from './RequestPermissionProfile';

export type RequestPermissionsEvent = {
  call_id: string;
  turn_id: string;
  reason: string | null;
  permissions: RequestPermissionProfile;
  cwd?: AbsolutePathBuf;
};
