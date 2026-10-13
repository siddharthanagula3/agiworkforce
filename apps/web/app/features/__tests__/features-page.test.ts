import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const FEATURES_DIR = resolve(__dirname, '..');
const pageSource = readFileSync(resolve(FEATURES_DIR, 'page.tsx'), 'utf8');
const memorySource = readFileSync(resolve(FEATURES_DIR, 'memory', 'page.tsx'), 'utf8');
const memoryRoute = readFileSync(resolve(FEATURES_DIR, '..', 'api', 'memory', 'route.ts'), 'utf8');

const hrefs = [...pageSource.matchAll(/^\s{4}href: '(\/features\/[a-z-]+)',$/gm)].flatMap((m) =>
  m[1] ? [m[1]] : [],
);
const labels = [...pageSource.matchAll(/linkLabel: '([^']+)'/g)].flatMap((m) =>
  m[1] ? [m[1]] : [],
);

describe('/features page', () => {
  it('links each of the six stories to an existing detail page', () => {
    const stories = hrefs.slice(0, 6);
    expect(stories).toHaveLength(6);
    for (const href of stories) {
      const slug = href.replace('/features/', '');
      expect(existsSync(resolve(FEATURES_DIR, slug, 'page.tsx'))).toBe(true);
    }
  });

  it('gives every story link a distinct label', () => {
    expect(labels).toHaveLength(6);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('does not promise Local on a Web page', () => {
    expect(pageSource).not.toContain('runs in Local, BYOK, or AGI Cloud');
    expect(pageSource).not.toContain('Local and Cloud allowed per project');
    expect(pageSource).not.toContain('Stays on the device in Local mode');
    expect(pageSource).not.toContain('Across every surface and trust mode');
  });

  it('links every feature detail page that exists, and none that does not', () => {
    const detailRoutes = readdirSync(FEATURES_DIR, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && existsSync(resolve(FEATURES_DIR, entry.name, 'page.tsx')),
      )
      .map((entry) => `/features/${entry.name}`)
      .sort();
    expect([...new Set(hrefs)].sort()).toEqual(detailRoutes);
  });

  it('names connectors as part of the workspace only once the connector switch is released', () => {
    expect(pageSource).toContain('const CONNECTORS_RELEASED = connectorsReleased();');
    expect(pageSource).toContain("CONNECTORS_RELEASED ? 'tools and connectors' : 'tools'");
    expect(pageSource).toContain("CONNECTORS_RELEASED ? '' : ` ${CONNECTORS_COMING_SOON_MESSAGE}`");
    expect(pageSource).toContain('voice, ${TOOLS_IN_THE_WORKSPACE}, plugins, and skills.');
    expect(pageSource).toContain('with a default of asking first.${CONNECTORS_NOTE}');
    expect(pageSource).not.toContain('Connectors are coming soon');
  });

  it('reads the image and video plan lists from the billing catalog', () => {
    expect(pageSource).toContain("billingPlanCapabilityPlanLabels('image_generation')");
    expect(pageSource).toContain("billingPlanCapabilityPlanLabels('video_generation')");
    expect(pageSource).toContain('Included on ${IMAGE_PLANS} plans.');
    expect(pageSource).toContain('Included on ${VIDEO_PLANS} plans.');
  });
});

describe('/features/memory storage wording', () => {
  it('does not claim Web memory lives on the device', () => {
    expect(memorySource).not.toContain('On the device that created it');
  });

  it('matches the memory route, which stores rows in the user-scoped database', () => {
    expect(memoryRoute).toContain('getUserScopedDb');
    expect(memorySource).toContain('Kept in your AGI account');
  });
});
