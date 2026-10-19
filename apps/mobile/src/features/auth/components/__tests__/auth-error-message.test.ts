import {
  ACCOUNT_SUSPENDED_MESSAGE,
  authErrorMessage,
  suspensionAppealUrl,
} from '@/src/features/auth/components/authErrorMessage';

describe('suspended accounts at sign-in', () => {
  it('says the account is suspended and that it can be appealed', () => {
    const banned = { errors: [{ code: 'user_banned', message: 'banned' }] };
    expect(authErrorMessage(banned, 'sign-in')).toBe(ACCOUNT_SUSPENDED_MESSAGE);
  });

  it('points the appeal at the web appeal page', () => {
    expect(suspensionAppealUrl()).toMatch(/\/appeal\?from=mobile$/);
  });
});
