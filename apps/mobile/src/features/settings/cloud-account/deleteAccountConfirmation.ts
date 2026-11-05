export interface DestructiveConfirmation {
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
}

export const DELETE_ACCOUNT_CONFIRMATION: DestructiveConfirmation = {
  title: 'Delete Account',
  message:
    'This schedules your AGI Cloud account, chats, projects, memory and artifacts for permanent deletion. ' +
    'Sign in to cancel before the cancellation deadline shown after scheduling. ' +
    'Erasure is processed after the deadline and may take longer. Once erasure begins, it cannot be undone. ' +
    'You will be signed out after scheduling is confirmed, and Local Mode data stays on this device. ' +
    'Export your Cloud data above first to keep a copy.',
  cancelLabel: 'Cancel',
  confirmLabel: 'Delete Account',
};
