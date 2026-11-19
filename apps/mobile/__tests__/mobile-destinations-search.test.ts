import fs from 'fs';
import path from 'path';
import { MOBILE_DESTINATIONS, searchMobileDestinations } from '@/src/features/search';
import { searchSettingsPages } from '@/src/features/search/mobileDestinations';
import {
  destinationScope,
  isClassifiedDestination,
  isShownInMode,
} from '@/src/features/shell/destinationScope';

function routeFile(route: string): string[] {
  const relative = route.replace(/^\//, '');
  const base = path.join(__dirname, '..', 'app', relative);
  return [`${base}.tsx`, path.join(base, 'index.tsx')];
}

describe('mobile destinations search', () => {
  it('finds settings by title and by what they control', () => {
    expect(searchMobileDestinations('dark mode', 'local').map((result) => result.title)).toEqual([
      'Appearance',
    ]);
    expect(searchMobileDestinations('memory', 'local').map((result) => result.title)).toContain(
      'Memory',
    );
    expect(searchMobileDestinations('password', 'cloud')[0]).toEqual({
      id: '/(app)/settings/account-security',
      title: 'Security and login',
      subtitle: 'Settings',
      targetId: '/(app)/settings/account-security',
    });
    expect(searchMobileDestinations('   ', 'cloud')).toEqual([]);
  });

  it('classifies every destination as on the device or Cloud', () => {
    for (const destination of MOBILE_DESTINATIONS) {
      expect({
        route: destination.route,
        classified: isClassifiedDestination(destination.route),
      }).toEqual({ route: destination.route, classified: true });
    }
  });

  it('never offers a Cloud destination while the app is in Local', () => {
    const cloudDestinations = MOBILE_DESTINATIONS.filter(
      (destination) => destinationScope(destination.route) === 'cloud',
    );
    expect(cloudDestinations.map((destination) => destination.title)).toEqual(
      expect.arrayContaining(['AGI Code sessions', 'Security and login', 'Workspace', 'Usage']),
    );

    for (const destination of cloudDestinations) {
      const inLocal = searchMobileDestinations(destination.title, 'local');
      const inCloud = searchMobileDestinations(destination.title, 'cloud');
      expect(inLocal.map((result) => result.targetId)).not.toContain(destination.route);
      expect(inCloud.map((result) => result.targetId)).toContain(destination.route);
    }
  });

  it('keeps device destinations in both modes', () => {
    for (const mode of ['local', 'cloud'] as const) {
      expect(searchMobileDestinations('storage', mode).map((result) => result.title)).toEqual([
        'Storage',
      ]);
    }
  });

  it('finds AGI Code, not a separate Remote destination, for computer words in Cloud', () => {
    expect(MOBILE_DESTINATIONS.map((destination) => destination.route)).not.toContain(
      '/(app)/companion',
    );
    for (const word of ['remote', 'computer', 'pair']) {
      expect(searchMobileDestinations(word, 'cloud').map((result) => result.targetId)).toEqual([
        '/(app)/cloud-code',
      ]);
      expect(searchMobileDestinations(word, 'local')).toEqual([]);
    }
  });

  it('hides a destination nobody classified from Local', () => {
    expect(isShownInMode('/(app)/not-yet-classified', 'local')).toBe(false);
    expect(isShownInMode('/(app)/not-yet-classified', 'cloud')).toBe(true);
  });

  it('points every destination at a screen that exists', () => {
    for (const destination of MOBILE_DESTINATIONS) {
      expect(routeFile(destination.route).some((file) => fs.existsSync(file))).toBe(true);
    }
  });

  it('finds the page of a setting by the words people use for it', () => {
    const routeOf = (query: string) =>
      searchMobileDestinations(query, 'cloud').map((result) => result.targetId);

    expect(routeOf('dictation')).toEqual(
      expect.arrayContaining(['/(app)/settings/voice', '/(app)/settings/voice-language']),
    );
    expect(routeOf('read aloud')).toEqual(['/(app)/settings/voice']);
    expect(routeOf('haptics')).toEqual(['/(app)/settings/general']);
    expect(routeOf('theme')).toEqual(['/(app)/settings/appearance']);
    expect(routeOf('memory')).toContain('/(app)/settings/memory');
    expect(routeOf('delete account')).toEqual(['/(app)/settings/data-controls']);
    expect(routeOf('security and login')).toEqual(['/(app)/settings/account-security']);
  });

  it('lists a settings page once, with the Settings section it sits in', () => {
    expect(searchSettingsPages('voice', 'local')).toEqual([
      { route: '/(app)/settings/voice', title: 'Voice', settingsSection: 'Device' },
      {
        route: '/(app)/settings/voice-language',
        title: 'Voice language',
        settingsSection: 'Device',
      },
    ]);
    expect(searchSettingsPages('password', 'cloud')).toEqual([
      {
        route: '/(app)/settings/account-security',
        title: 'Security and login',
        settingsSection: 'Account',
      },
    ]);
  });

  it('lists the pages that name the query before the pages that only contain its letters', () => {
    const routes = searchSettingsPages('age', 'local').map((page) => page.route);

    expect(routes[0]).toBe('/(app)/settings/parental-controls');
    expect(routes).toContain('/(app)/settings/general');
    expect(searchSettingsPages('voice', 'local').map((page) => page.route)).toEqual([
      '/(app)/settings/voice',
      '/(app)/settings/voice-language',
    ]);
  });

  it('keeps pages hidden in Local out of the settings results', () => {
    expect(searchSettingsPages('password', 'local')).toEqual([]);
    expect(searchSettingsPages('workspace', 'local')).toEqual([]);
    expect(searchSettingsPages('   ', 'cloud')).toEqual([]);
  });

  it('never lists the Settings home or a Go to destination as a settings page', () => {
    const routes = searchSettingsPages('s', 'cloud').map((page) => page.route);
    expect(routes).not.toContain('/(app)/settings');
    expect(routes).not.toContain('/(app)/notifications');
  });

  it('gives every page under Settings a section of the Settings home', () => {
    const settingsPages = MOBILE_DESTINATIONS.filter(
      (destination) =>
        destination.section === 'Settings' && destination.route !== '/(app)/settings',
    );
    for (const destination of settingsPages) {
      expect({ route: destination.route, group: destination.settingsSection }).toEqual({
        route: destination.route,
        group: expect.stringMatching(/^(Account|Device|Assistant|Cloud|Support)$/),
      });
    }
  });

  it('keeps the plan search on the Subscription page with no price word in its keywords', () => {
    const billing = MOBILE_DESTINATIONS.find(
      (destination) => destination.route === '/(app)/settings/cloud-billing',
    );
    expect(billing?.title).toBe('Subscription');
    expect(billing?.keywords.join(' ')).not.toMatch(/price|pricing|upgrade|buy|purchase/i);
  });
});
