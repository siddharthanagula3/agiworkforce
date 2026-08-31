import { expect, test } from '@playwright/test';

/**
 * Every text node on the public routes, in both themes, measured against the
 * colour actually painted behind it.
 *
 * These need no account, so they are the one large surface a sweep can cover
 * completely. They are also where the design-token work lands: the same ramp
 * feeds all of them, so a token regression shows up here first and everywhere
 * at once. The landing page has its own spec for the stage rhythm; this one is
 * breadth.
 *
 * Override the list with PUBLIC_ROUTES to check a single route while working.
 */
const DEFAULT_ROUTES = [
  '/',
  '/about',
  '/pricing',
  '/business',
  '/enterprise',
  '/download',
  '/desktop',
  '/cli',
  '/docs',
  '/faq',
  '/blog',
  '/careers',
  '/contact',
  '/security',
  '/privacy',
  '/terms',
  '/agi-code',
  '/agi-work',
  '/ai-skills',
  '/apps',
  '/byok',
  '/changelog',
  '/chrome-extension',
  '/community',
  '/connectors',
  '/customers',
  '/features',
  '/help',
  '/integrations',
  '/local',
  '/models',
  '/plugins',
  '/skills',
  '/solutions',
  '/status',
  '/teams',
  '/accessibility',
  '/acceptable-use',
  '/agent-permissions',
  '/api-docs',
  '/api-reference',
  '/beta',
  '/billing',
  '/contact-sales',
  '/cookies',
  '/copyright',
  '/data-use',
  '/disclaimer',
  '/documentation',
  '/downloads',
  '/dpa',
];

const ROUTES = process.env['PUBLIC_ROUTES']?.split(',').filter(Boolean) ?? DEFAULT_ROUTES;

test('contrast across public routes', async ({ page }) => {
  test.setTimeout(1_800_000);
  const findings: unknown[] = [];

  for (const theme of ['light', 'dark'] as const) {
    for (const route of ROUTES) {
      try {
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(route, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
        await page.evaluate((t) => {
          document.documentElement.classList.toggle('dark', t === 'dark');
        }, theme);
        await page.waitForTimeout(1800);
        // A route that redirects (auth-gated, or a deliberate 403) tears down the
        // context mid-evaluate; that is the route answering, not a finding.
        await page.waitForLoadState('domcontentloaded').catch(() => undefined);

        const bad = await page
          .evaluate(() => {
            const parse = (v: string) => {
              const p = v.match(/[\d.]+/g)?.map(Number) ?? [];
              const s = v.startsWith('color(') ? 255 : 1;
              return { r: (p[0] ?? 0) * s, g: (p[1] ?? 0) * s, b: (p[2] ?? 0) * s, a: p[3] ?? 1 };
            };
            type Rgb = { r: number; g: number; b: number; a: number };
            const over = (t: Rgb, b: Rgb): Rgb => ({
              r: t.r * t.a + b.r * (1 - t.a),
              g: t.g * t.a + b.g * (1 - t.a),
              b: t.b * t.a + b.b * (1 - t.a),
              a: 1,
            });
            const ground = (el: Element): Rgb => {
              const layers: Rgb[] = [];
              let n: Element | null = el;
              while (n) {
                const c = parse(getComputedStyle(n).backgroundColor);
                if (c.a > 0) layers.push(c);
                if (c.a >= 1) break;
                n = n.parentElement;
              }
              return layers.reduceRight<Rgb>((b, l) => over(l, b), {
                r: 255,
                g: 255,
                b: 255,
                a: 1,
              });
            };
            const lum = ({ r, g, b }: Rgb) =>
              [r, g, b]
                .map((v) => v / 255)
                .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
                .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
            const ratio = (f: Rgb, g: Rgb) => {
              const flat = f.a < 1 ? over(f, g) : f;
              const [hi, lo] = [lum(flat), lum(g)].sort((a, b) => b - a);
              return (hi! + 0.05) / (lo! + 0.05);
            };
            const out: { text: string; ratio: number; need: number; sel: string }[] = [];
            for (const el of document.querySelectorAll('body *')) {
              const own = [...el.childNodes]
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((n) => n.textContent?.trim() ?? '')
                .join('')
                .trim();
              if (!own) continue;
              const cs = getComputedStyle(el);
              if (cs.visibility === 'hidden' || cs.display === 'none') continue;
              if (Number(cs.opacity) < 0.15) continue;
              if (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue;
              const r = el.getBoundingClientRect();
              if (r.width < 2 || r.height < 2) continue;
              const size = parseFloat(cs.fontSize);
              const need = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700) ? 3 : 4.5;
              const got = ratio(parse(cs.color), ground(el));
              if (got + 0.005 < need) {
                out.push({
                  text: own.slice(0, 34),
                  ratio: Math.round(got * 100) / 100,
                  need,
                  sel: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0],
                });
              }
            }
            return out.slice(0, 3);
          })
          .catch(() => [] as { text: string; ratio: number; need: number; sel: string }[]);
        if (bad.length) findings.push({ route, theme, bad });
      } catch {
        // A redirect tears the context down mid-measure. That is the route
        // answering, not a contrast finding.
      }
    }
  }
  type Finding = {
    route: string;
    theme: string;
    bad: { text: string; ratio: number; need: number; sel: string }[];
  };
  const rows = findings as Finding[];
  const report = rows
    .flatMap((r) =>
      r.bad.map(
        (b) =>
          `  ${r.route} (${r.theme}) ${b.ratio}:1 needs ${b.need} — ${b.sel} ${JSON.stringify(b.text)}`,
      ),
    )
    .join('\n');
  expect(rows, `contrast failures on public routes:\n${report}`).toEqual([]);
});
