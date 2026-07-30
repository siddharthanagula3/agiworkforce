import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const appRoot = join(__dirname, '..', 'app', '(app)');
const layoutSource = readFileSync(join(appRoot, '_layout.tsx'), 'utf8');

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
    expect(layoutSource).not.toMatch(/name="(?:code(?:\/|")|dispatch(?:\/|")|switch-probe")/);
  });
});
