import * as Notifications from 'expo-notifications';

/**
 * Expo warns that category identifiers containing `:` or `-` may not work
 * reliably across iOS and Android.
 */
export const AGENT_APPROVAL_CATEGORY_IDENTIFIER = 'agent_approvals';
export const AGENT_APPROVAL_REVIEW_ACTION_IDENTIFIER = 'review_agent_approval';

/**
 * Register the interactive category used by background approval notifications.
 *
 * The action opens the existing in-app review surface and requires device
 * authentication on iOS. We intentionally do not approve or deny work from the
 * lock screen: full task details and the app's biometric gate remain part of
 * the authorization boundary.
 */
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
