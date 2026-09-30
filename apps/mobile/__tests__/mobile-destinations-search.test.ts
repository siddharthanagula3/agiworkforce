import fs from 'fs';
import path from 'path';
import { MOBILE_DESTINATIONS, searchMobileDestinations } from '@/src/features/search';

function routeFile(route: string): string[] {
  const relative = route.replace(/^\//, '');
  const base = path.join(__dirname, '..', 'app', relative);
  return [`${base}.tsx`, path.join(base, 'index.tsx')];
}

describe('mobile destinations search', () => {
  it('finds settings by title and by what they control', () => {
    expect(searchMobileDestinations('dark mode').map((result) => result.title)).toEqual([
      'Appearance',
    ]);
    expect(searchMobileDestinations('memory').map((result) => result.title)).toContain('Memory');
    expect(searchMobileDestinations('password')[0]).toEqual({
      id: '/(app)/settings/account-security',
      title: 'Account security',
      subtitle: 'Settings',
      targetId: '/(app)/settings/account-security',
    });
    expect(searchMobileDestinations('   ')).toEqual([]);
  });

  it('points every destination at a screen that exists', () => {
    for (const destination of MOBILE_DESTINATIONS) {
      expect(routeFile(destination.route).some((file) => fs.existsSync(file))).toBe(true);
    }
  });
});
