import { CLOUD_SIGN_IN_RETURN_PATH } from './rootRouting';
import {
  clearPushRegistrationHold,
  holdPushRegistrationFor,
  requestPushReregistration,
} from './pushTokenAccountLifecycle';
import {
  CLOUD_CHAT_POST_AUTH_INTENT,
  clearPostAuthIntent,
  stagePostAuthIntent,
} from './postAuthIntent';

export const ADD_ACCOUNT_PARAM = 'addAccount' as const;
export const ADD_ACCOUNT_PARAM_VALUE = '1' as const;

let openAddition: { fromUserId: string } | null = null;

export function beginCloudAccountAddition(fromUserId: string) {
  const ownerId = fromUserId.trim();
  if (!ownerId) throw new Error('Adding an account requires the signed-in Clerk user id');
  openAddition = { fromUserId: ownerId };
  holdPushRegistrationFor(ownerId);
  stagePostAuthIntent(CLOUD_CHAT_POST_AUTH_INTENT);
  return {
    pathname: CLOUD_SIGN_IN_RETURN_PATH,
    params: { [ADD_ACCOUNT_PARAM]: ADD_ACCOUNT_PARAM_VALUE },
  };
}

export function isCloudAccountAdditionOpenFor(userId: string | null | undefined): boolean {
  return openAddition !== null && Boolean(userId) && openAddition.fromUserId === userId;
}

export function endCloudAccountAddition(options: { cancelled: boolean }): void {
  if (openAddition === null) return;
  openAddition = null;
  if (options.cancelled) {
    clearPostAuthIntent();
    requestPushReregistration();
  } else {
    clearPushRegistrationHold();
  }
}
