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
 * Override the list with PUBLIC_ROUTES to run a subset. That is not optional on
 * a dev server: compiling these on demand grows next-server past 3GB and wedges
 * it, and the first attempt died partway with every remaining route reading as
 * a redirect rather than a failure - which is why an unreachable server now
 * fails this test rather than counting as a skip. Batches of forty complete;
 * the third batch killed the server three times even starting from 6.7GB free,
 * so those routes are verified only against a production build, where each
 * route is already compiled.
 */
const DEFAULT_ROUTES = [
  '/',
  '/403',
  '/about',
  '/acceptable-use',
  '/accessibility',
  '/agent-permissions',
  '/agi-code',
  '/agi-work',
  '/ai-skills',
  '/api-docs',
  '/api-reference',
  '/apps',
  '/auth/chrome-extension',
  '/auth/device',
  '/auth/error',
  '/auth/login',
  '/auth/reset-password',
  '/auth/update-password',
  '/beta',
  '/billing',
  '/blog',
  '/business',
  '/byok',
  '/careers',
  '/changelog',
  '/chrome-extension',
  '/cli',
  '/community',
  '/connectors',
  '/connectors/mcp-directory',
  '/connectors/new',
  '/contact',
  '/contact-sales',
  '/cookies',
  '/copyright',
  '/copyright/report',
  '/customers',
  '/data-use',
  '/desktop',
  '/disclaimer',
  '/docs',
  '/docs/byok-env',
  '/documentation',
  '/download',
  '/downloads',
  '/dpa',
  '/enterprise',
  '/faq',
  '/features',
  '/features/agents',
  '/features/ai-chat',
  '/features/ai-skills',
  '/features/artifacts',
  '/features/deep-research',
  '/features/memory',
  '/features/plugins',
  '/features/projects',
  '/features/tools',
  '/forgot-password',
  '/founder',
  '/gallery',
  '/get-started',
  '/help',
  '/integrations',
  '/invite',
  '/legal',
  '/legal/eu-representative',
  '/local',
  '/login',
  '/login/complete',
  '/maintenance',
  '/marketplace',
  '/mobile',
  '/mobile/legal',
  '/model-licenses',
  '/offline',
  '/operator',
  '/pair',
  '/partners',
  '/payment-failure',
  '/plugins',
  '/press',
  '/pricing',
  '/privacy',
  '/privacy/india',
  '/privacy/requests',
  '/providers',
  '/refund-policy',
  '/region-unavailable',
  '/register',
  '/resources',
  '/security',
  '/session-expired',
  '/sign-in',
  '/sign-up',
  '/signup',
  '/signup/complete',
  '/sitemap-page',
  '/skills',
  '/sla',
  '/solutions',
  '/status',
  '/subprocessors',
  '/support',
  '/tasks',
  '/teams',
  '/terms',
  '/trust',
  '/upgrade',
  '/use-cases',
  '/use-cases/consulting',
  '/use-cases/consulting-businesses',
  '/use-cases/it-providers',
  '/use-cases/it-service-providers',
  '/use-cases/sales-teams',
  '/use-cases/startups',
  '/user',
  '/verify',
  '/vscode-extension',
  '/waitlist',
];

const ROUTES = process.env['PUBLIC_ROUTES']?.split(',').filter(Boolean) ?? DEFAULT_ROUTES;

test('contrast across public routes', async ({ page }) => {
  test.setTimeout(1_800_000);
  const findings: unknown[] = [];
  const measured = new Set<string>();
  const skipped = new Set<string>();
  const unreachable: string[] = [];

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
              // Clerk renders the auth forms and prefixes every class with cl-.
              // Its own contrast is not ours to change, and one of the offenders is
              // the "Development mode" badge, which production never shows. Skipped
              // by that prefix so the sweep reports what this repository controls.
              if (/(^|\s)cl-/.test(String(el.className))) continue;
              if (el.closest('[class*="cl-rootBox"],[data-clerk-component]')) continue;
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
        measured.add(`${route} ${theme}`);
        if (bad.length) findings.push({ route, theme, bad });
      } catch (error) {
        // A redirect tears the context down mid-measure: that is the route
        // answering, and it is recorded as a skip rather than a finding. A
        // connection error is different in kind - it means the server is not
        // answering at all, and swallowing it turns a dead server into a clean
        // sweep. Measured once: a dev server compiling all 120 routes on demand
        // ran the machine out of memory and died partway, and the catch quietly
        // reported 166 skips that looked like redirects.
        const message = String(error);
        if (/ERR_CONNECTION|ECONNREFUSED|Target closed|browser has been closed/i.test(message)) {
          unreachable.push(`${route} ${theme}: ${message.split('\n')[0]?.slice(0, 80)}`);
        } else {
          skipped.add(`${route} ${theme}`);
        }
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
  console.log(
    `[contrast] measured ${measured.size} route/theme pairs, skipped ${skipped.size}` +
      (skipped.size ? ` :: ${[...skipped].slice(0, 8).join(', ')}` : ''),
  );
  expect(
    unreachable,
    `the server stopped answering, so these were never measured:\n${unreachable.join('\n')}`,
  ).toEqual([]);
  expect(rows, `contrast failures on public routes:\n${report}`).toEqual([]);
});
