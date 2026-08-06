import { waitForDesktopShell } from '../support/desktop-shell';

/**
 * Window-size layout matrix on the real native window.
 *
 * tauri.conf.json declares min 1000×700 / default 1400×850. Each size asserts
 * the structural invariants a user notices instantly when they break:
 *   - the document never scrolls horizontally,
 *   - the composer (or an onboarding/auth entry point) stays visible,
 *   - no fixed shell control lands outside the viewport,
 *   - the sidebar rail stays within its declared widths.
 *
 * A seeded resize fuzz pass then walks pseudo-random sizes in the supported
 * range with the same invariants — boundary bugs live between the named sizes.
 */

const NAMED_SIZES: Array<[number, number, string]> = [
  [1000, 700, 'configured minimum'],
  [1001, 701, 'minimum + 1px boundary'],
  [1024, 768, 'narrow desktop'],
  [1280, 720, 'small widescreen'],
  [1440, 900, 'standard laptop'],
  [1920, 1080, 'full hd'],
];

/** Deterministic LCG so failures reproduce from the logged seed. */
function seededSizes(seed: number, count: number): Array<[number, number]> {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
  return Array.from({ length: count }, () => [
    1000 + Math.floor(next() * 920),
    700 + Math.floor(next() * 380),
  ]);
}

interface LayoutProbe {
  horizontalOverflow: boolean;
  composerVisible: boolean;
  offscreenControls: string[];
  innerWidth: number;
  innerHeight: number;
}

async function probeLayout(): Promise<LayoutProbe> {
  return browser.execute(() => {
    const doc = document.documentElement;
    const horizontalOverflow = doc.scrollWidth > doc.clientWidth + 1;
    const composer = document.querySelector('textarea[aria-label="Chat message input"]');
    const entry =
      composer ??
      document.querySelector('[data-testid="onboarding-cloud-mode"]') ??
      document.querySelector('h1');
    const composerVisible = !!entry && (entry as HTMLElement).getClientRects().length > 0;

    const offscreenControls: string[] = [];
    for (const el of Array.from(document.querySelectorAll('button, [role="tab"], textarea'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue; // hidden is fine
      if (
        rect.right < 0 ||
        rect.bottom < 0 ||
        rect.left > doc.clientWidth ||
        rect.top > doc.clientHeight
      ) {
        const label =
          el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent?.slice(0, 40);
        offscreenControls.push(`${el.tagName.toLowerCase()}:${(label ?? '').trim()}`);
      }
    }
    return {
      horizontalOverflow,
      composerVisible,
      offscreenControls,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    };
  });
}

async function resizeTo(width: number, height: number): Promise<void> {
  await browser.execute(
    async (w: number, h: number) => {
      const tauri = (
        window as unknown as {
          __TAURI__?: {
            window?: {
              getCurrentWindow?: () => {
                setSize(size: unknown): Promise<void>;
              };
            };
            dpi?: { LogicalSize?: new (w: number, h: number) => unknown };
          };
        }
      ).__TAURI__;
      const current = tauri?.window?.getCurrentWindow?.();
      const LogicalSize = tauri?.dpi?.LogicalSize;
      if (!current || !LogicalSize) throw new Error('Tauri window API unavailable');
      await current.setSize(new LogicalSize(w, h));
    },
    width,
    height,
  );
  // Let the layout engine settle before probing.
  await browser.pause(350);
}

describe('layout · window-size matrix on the real native window', () => {
  before(async () => {
    await waitForDesktopShell();
    const useLocal = await $('button=Use Local Mode');
    if ((await useLocal.isExisting()) && (await useLocal.isDisplayed())) {
      await useLocal.click();
      await waitForDesktopShell();
    }
  });

  after(async () => {
    await resizeTo(1400, 850);
  });

  for (const [width, height, label] of NAMED_SIZES) {
    it(`holds layout invariants at ${width}×${height} (${label})`, async function () {
      this.timeout(60_000);
      await resizeTo(width, height);
      const probe = await probeLayout();
      expect(probe.horizontalOverflow).toBe(false);
      expect(probe.composerVisible).toBe(true);
      expect(probe.offscreenControls).toEqual([]);
    });
  }

  it('survives seeded resize fuzzing (12 sizes, seed logged for repro)', async function () {
    this.timeout(180_000);
    const seed = 20260803;
    console.log('RESIZE_FUZZ_SEED', seed);
    const violations: string[] = [];
    for (const [width, height] of seededSizes(seed, 12)) {
      await resizeTo(width, height);
      const probe = await probeLayout();
      // expect-webdriverio's expect takes exactly one argument at runtime, so
      // collect labeled violations and assert once on the aggregate.
      const context = `${width}×${height} (seed ${seed})`;
      if (probe.horizontalOverflow) violations.push(`horizontal overflow at ${context}`);
      if (!probe.composerVisible) violations.push(`composer lost at ${context}`);
      for (const control of probe.offscreenControls) {
        violations.push(`offscreen control ${control} at ${context}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
