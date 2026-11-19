import {
  MOBILE_DESTINATIONS,
  searchMobileDestinations,
} from '../src/features/search/mobileDestinations';
import {
  NOTIFICATIONS_SCREEN_TITLE,
  SHARED_LINKS_SCREEN_TITLE,
  SUBSCRIPTION_SCREEN_TITLE,
} from '../src/features/settings/screenTitles';

function titleOf(route: string): string | undefined {
  return MOBILE_DESTINATIONS.find((destination) => destination.route === route)?.title;
}

describe('search destinations use the titles of the screens they open', () => {
  it('names the settings screens as their headers do', () => {
    expect(titleOf('/(app)/settings/notifications')).toBe(NOTIFICATIONS_SCREEN_TITLE);
    expect(titleOf('/(app)/settings/shared-links')).toBe(SHARED_LINKS_SCREEN_TITLE);
    expect(titleOf('/(app)/settings/cloud-billing')).toBe(SUBSCRIPTION_SCREEN_TITLE);
    expect([
      NOTIFICATIONS_SCREEN_TITLE,
      SHARED_LINKS_SCREEN_TITLE,
      SUBSCRIPTION_SCREEN_TITLE,
    ]).toEqual(['Notifications', 'Shared Links', 'Subscription']);
  });

  it('names the sites screen Sites and still finds it by its old name', () => {
    expect(titleOf('/(app)/sites')).toBe('Sites');
    expect(searchMobileDestinations('published sites', 'cloud')).toEqual([
      expect.objectContaining({ title: 'Sites', targetId: '/(app)/sites' }),
    ]);
  });

  it('keeps none of the old titles', () => {
    const titles = MOBILE_DESTINATIONS.map((destination) => destination.title);
    for (const old of [
      'Plan',
      'Billing',
      'Shared links',
      'Notification settings',
      'Published sites',
    ]) {
      expect(titles).not.toContain(old);
    }
  });

  it('tells the Notifications inbox and the Notifications settings apart by section', () => {
    expect(
      searchMobileDestinations('notifications', 'local').map(({ title, subtitle }) => ({
        title,
        subtitle,
      })),
    ).toEqual([
      { title: 'Notifications', subtitle: 'Go to' },
      { title: 'Notifications', subtitle: 'Settings' },
    ]);
  });
});
