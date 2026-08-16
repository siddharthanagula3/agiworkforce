import * as Notifications from 'expo-notifications';

export const AGENT_APPROVAL_CATEGORY_IDENTIFIER = 'agent_approvals';
export const AGENT_APPROVAL_REVIEW_ACTION_IDENTIFIER = 'review_agent_approval';

export async function registerNotificationCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(
    AGENT_APPROVAL_CATEGORY_IDENTIFIER,
    [
      {
        identifier: AGENT_APPROVAL_REVIEW_ACTION_IDENTIFIER,
        buttonTitle: 'Review',
        options: {
          isAuthenticationRequired: true,
          opensAppToForeground: true,
        },
      },
    ],
    {
      previewPlaceholder: 'Approval required',
    },
  );
}
