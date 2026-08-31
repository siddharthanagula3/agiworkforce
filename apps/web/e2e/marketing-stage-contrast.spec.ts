import { expect, test } from '@playwright/test';

const ROUTE = '/dev/landing-preview';

type Failure = {
  text: string;
  selector: string;
  fontSize: number;
  ratio: number;
  required: number;
  color: string;
  ground: string;
};

test.describe('marketing landing contrast', () => {
  test.use({ reducedMotion: 'reduce' } as never);
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 390]) {
      test(`every text node clears WCAG AA at ${width}px in ${theme} mode`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(ROUTE, { waitUntil: 'networkidle' });
        await page.evaluate((t) => {
          document.documentElement.classList.toggle('dark', t === 'dark');
        }, theme);
        await page.waitForSelector('.agi-fl-surface-row');
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
          }
          window.scrollTo(0, 0);
          await new Promise((r) => setTimeout(r, 400));
        });

        const failures = await page.evaluate(() => {
          const parse = (value: string) => {
            const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
            const scale = value.startsWith('color(') ? 255 : 1;
            return {
              r: (parts[0] ?? 0) * scale,
              g: (parts[1] ?? 0) * scale,
              b: (parts[2] ?? 0) * scale,
              a: parts[3] ?? 1,
            };
          };

          type Rgb = { r: number; g: number; b: number; a: number };

          const over = (top: Rgb, bottom: Rgb): Rgb => ({
            r: top.r * top.a + bottom.r * (1 - top.a),
            g: top.g * top.a + bottom.g * (1 - top.a),
            b: top.b * top.a + bottom.b * (1 - top.a),
            a: 1,
          });
          const groundOf = (el: Element): Rgb => {
            const layers: Rgb[] = [];
            let node: Element | null = el;
            while (node) {
              const colour = parse(getComputedStyle(node).backgroundColor);
              if (colour.a > 0) layers.push(colour);
              if (colour.a >= 1) break;
              node = node.parentElement;
            }
            return layers.reduceRight<Rgb>((below, layer) => over(layer, below), {
              r: 255,
              g: 255,
              b: 255,
              a: 1,
            });
          };

          const luminance = ({ r, g, b }: Rgb) =>
            [r, g, b]
              .map((v) => v / 255)
              .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
              .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);

          const ratio = (foreground: Rgb, ground: Rgb) => {
            const flat = foreground.a < 1 ? over(foreground, ground) : foreground;
            const [high, low] = [luminance(flat), luminance(ground)].sort((a, b) => b - a);
            return (high! + 0.05) / (low! + 0.05);
          };

          const describe = (el: Element) => {
            const cls = el.className?.toString().trim().split(/\s+/).slice(0, 2).join('.');
            return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
          };

          const results: Failure[] = [];
          for (const el of document.querySelectorAll('body *')) {
            const own = [...el.childNodes]
              .filter((n) => n.nodeType === Node.TEXT_NODE)
              .map((n) => n.textContent?.trim() ?? '')
              .join('')
              .trim();
            if (!own) continue;

            const style = getComputedStyle(el);
            if (style.visibility === 'hidden' || style.display === 'none') continue;
            if (Number(style.opacity) < 0.15) continue;
            if (style.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue;

            const box = el.getBoundingClientRect();
            if (box.width < 2 || box.height < 2) continue;

            const fontSize = parseFloat(style.fontSize);
            const bold = Number(style.fontWeight) >= 700;
            const required = fontSize >= 24 || (fontSize >= 18.66 && bold) ? 3 : 4.5;

            const ground = groundOf(el);
            const got = ratio(parse(style.color), ground);
            if (got + 0.005 < required) {
              results.push({
                text: own.slice(0, 48),
                selector: describe(el),
                fontSize: Math.round(fontSize * 10) / 10,
                ratio: Math.round(got * 100) / 100,
                required,
                color: style.color,
                ground: `rgb(${[ground.r, ground.g, ground.b].map(Math.round).join(', ')})`,
              });
            }
          }
          return results;
        });

        const report = failures
          .map(
            (f) =>
              `  ${f.ratio}:1 (needs ${f.required}) ${f.selector} @${f.fontSize}px\n` +
              `    ${JSON.stringify(f.text)}\n    ${f.color} on ${f.ground}`,
          )
          .join('\n');

        expect(failures, `contrast failures at ${width}px in ${theme} mode:\n${report}`).toEqual(
          [],
        );
      });
    }
  }
});
