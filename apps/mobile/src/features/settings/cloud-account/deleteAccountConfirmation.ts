export interface DestructiveConfirmation {
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
}

export const DELETE_ACCOUNT_CONFIRMATION: DestructiveConfirmation = {
  title: 'Delete Account',
  message:
    'Your AGI Cloud account, chats, projects, memory and artifacts are queued for permanent deletion in 24 hours. ' +
    'Sign in to cancel before erasure begins; after that it cannot be undone. ' +
    'You will be signed out, and Local Mode data stays on this device. ' +
    'Export your Cloud data above first to keep a copy.',
  cancelLabel: 'Cancel',
  confirmLabel: 'Delete Account',
};
