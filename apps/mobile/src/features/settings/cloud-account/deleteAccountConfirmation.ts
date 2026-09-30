export interface DestructiveConfirmation {
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
}

export const DELETE_ACCOUNT_CONFIRMATION: DestructiveConfirmation = {
  title: 'Delete Account',
  message:
    'This requests permanent deletion of your AGI Cloud account and all cloud data (chats, ' +
    'projects, memory, artifacts). Deletion is normally scheduled for 24 hours later. ' +
    'You can sign back in and cancel before erasure begins; after that, it cannot be undone. ' +
    'You will be signed out on this device. Export your Cloud data above first if you want ' +
    'to keep a copy.\n\n' +
    'On-device Local Mode data stays on this device, remove it separately from ' +
    'Settings > Data Controls if you want a full wipe.',
  cancelLabel: 'Cancel',
  confirmLabel: 'Delete Account',
};
