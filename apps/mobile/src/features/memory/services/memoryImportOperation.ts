import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  isAccountScopedUiStateCurrent,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';

export interface MemoryImportOperation {
  scope: AccountScopedUiState;
  isActive: () => boolean;
}

export const MEMORY_IMPORT_UNCERTAIN_MESSAGE =
  'Import could not finish. Some memories may have been saved. Check your memories before trying again.';

export function isMemoryImportOperationCurrent(operation: MemoryImportOperation): boolean {
  return (
    operation.isActive() &&
    isAccountScopedUiStateCurrent(operation.scope, useChatAppModeStore.getState().appMode)
  );
}

export function assertMemoryImportOperationCurrent(operation: MemoryImportOperation): void {
  if (!isMemoryImportOperationCurrent(operation)) {
    throw new Error('This import is no longer active in its original destination.');
  }
}
