import fs from 'fs';
import path from 'path';
import { MOBILE_DESTINATIONS, searchMobileDestinations } from '@/src/features/search';
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
      title: 'Account security',
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
      expect.arrayContaining(['AGI Code sessions', 'Account security', 'Workspace', 'Usage']),
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
});
