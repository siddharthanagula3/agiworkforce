import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const appRoot = join(__dirname, '..', 'app', '(app)');
const layoutSource = readFileSync(join(appRoot, '_layout.tsx'), 'utf8');
const drawerSource = readFileSync(
  join(__dirname, '..', 'src', 'features', 'drawer', 'components', 'DrawerContent.tsx'),
  'utf8',
);

describe('authenticated drawer route contract', () => {
  it('registers only routes backed by a screen or nested layout', () => {
    const routeNames = Array.from(
      layoutSource.matchAll(/<Drawer\.Screen\s+name="([^"]+)"/g),
      (match) => match[1],
    );

    expect(routeNames.length).toBeGreaterThan(0);

    for (const routeName of routeNames) {
      const candidates = [
        join(appRoot, `${routeName}.tsx`),
        join(appRoot, routeName, 'index.tsx'),
        join(appRoot, routeName, '_layout.tsx'),
      ];

      expect({
        routeName,
        candidates,
        exists: candidates.some((candidate) => existsSync(candidate)),
      }).toMatchObject({ routeName, exists: true });
    }
  });

  it('does not register retired dead-end surfaces', () => {
    expect(layoutSource).not.toMatch(
      /name="(?:code(?:\/|")|dispatch(?:\/|")|agents(?:\/|")|switch-probe")/,
    );
  });

  it('backs every drawer primary destination with a registered route', () => {
    const drawerRoutes = Array.from(
      drawerSource.matchAll(/route: '\/\(app\)\/([^']+)'/g),
      (match) => match[1],
    ).filter((route) => !route.includes('['));

    expect(drawerRoutes).toContain('tasks');

    for (const route of drawerRoutes) {
      const segments = route.replace(/^\(tabs\)\//, '');
      const candidates = [
        join(appRoot, `${route}.tsx`),
        join(appRoot, route, 'index.tsx'),
        join(appRoot, route, '_layout.tsx'),
        join(appRoot, '(tabs)', `${segments}.tsx`),
      ];

      expect({
        route,
        exists: candidates.some((candidate) => existsSync(candidate)),
      }).toMatchObject({ route, exists: true });
    }
  });
});
