export const ACCOUNT_PICKER_VIEW = 'accounts';

export const ACCOUNT_PICKER_ROUTE = {
  pathname: '/(app)/settings',
  params: { view: ACCOUNT_PICKER_VIEW },
} as const;
