import { expect, test } from '@playwright/test';

/**
 * Every text node on the marketing landing, measured against the colour that
 * is actually painted behind it.
 *
 * This guards one specific mistake, which has now been made twice: a token is
 * authored against one ground and then reused on another. The first time it
 * was six accent families serving three different roles from one value. The
 * second was `--agi-console-tint` - `rgba(16, 16, 18, 0.62)`, a near-black
 * wash that reads as a recessed panel over #0a0a0b and as flat mid-grey over
 * #faf9f6. When the landing page gained light stages, the device mockups kept
 * the dark value and their labels fell to roughly 1.5:1.
 *
 * The reason a hand-rolled check missed it is worth stating, because it is the
 * easy way to write this test wrong: resolving an element's background by
 * walking up to the first *opaque* ancestor skips exactly the translucent
 * layer that causes the bug, and then measures the text against a clean white
 * stage it never actually sits on. The walk below composites every layer it
 * passes, in paint order, so a wash counts even though it is see-through.
 */

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
  // Reveal animations interpolate opacity, so an element sampled mid-transition
  // reports a colour part-way to its real one. See qa-04-ui-sweep.
  test.use({ reducedMotion: 'reduce' } as never);

  // Both themes, because the stages set their own ground either way and each
  // theme fails a different half. The dark-stage ramp was missing entirely and
  // only showed up in light mode - in dark mode those tokens happen to match
  // what :root already says, so a dark browser renders the bug invisible.
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 390]) {
      test(`every text node clears WCAG AA at ${width}px in ${theme} mode`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(ROUTE, { waitUntil: 'networkidle' });
        // ThemeProvider uses attribute="class", so the resolved theme is the
        // `dark` class on <html> - setting it directly is what the toggle does.
        await page.evaluate((t) => {
          document.documentElement.classList.toggle('dark', t === 'dark');
        }, theme);
        await page.waitForSelector('.agi-fl-surface-row');

        // Scroll the page so IntersectionObserver-gated sections mount and settle
        // at their final opacity; an unrevealed element reports its start colour.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
          }
          window.scrollTo(0, 0);
          await new Promise((r) => setTimeout(r, 400));
        });

        const failures = await page.evaluate(() => {
          /**
           * `rgb()`, `rgba()` and `color(srgb ...)` all reach here, and they do
           * not share a scale: anything produced by `color-mix()` - which is how
           * the header tints itself - computes to `color(srgb 0.98 0.96 0.93 /
           * 0.78)`, with 0-1 components. Reading those as 0-255 turns the site's
           * cream header into near-black and reports the whole nav as a contrast
           * failure it never had.
           */
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

          /**
           * The painted colour behind `el`: every ancestor background composited
           * bottom-up, including translucent ones. Stopping at the first opaque
           * ancestor is what hid the console-tint defect.
           */
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
            if (style.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue; // gradient text

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
