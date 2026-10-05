import { test, expect, type Page } from '@playwright/test';
import { routeIsServed } from './route-availability';

// The unit suite proves the state machine in jsdom. What only a browser answers
// is whether the painted result honours it: open eyes while a password is dots,
// every character turned from the form the moment it is readable, with the
// look-away outranking a blink and a mood, and React's focus events arriving in
// the order Chrome fires them. The harness renders the real step components
// inside the real shell with inert handlers; nothing here reaches the identity
// provider.
const HARNESS = '/dev/auth-scene';
const SCENE = 'svg.auth-scene';
const EYES = '[data-testid="auth-scene"] .auth-eye-open';
const CHARACTERS = '[data-testid="auth-scene"] .auth-char';
const CHARACTER_COUNT = 4;
const EYE_COUNT = 7;
const SHUT_SCALE = 0.04;
const OPEN_SCALE = 1;
const THROWAWAY = 'correct horse battery';
const READABLE_WATCH_MS = 1200;
const TURN_BACK_WATCH_MS = 600;
const MIN_FRAMES_WATCHED = 20;

declare global {
  interface Window {
    __agiEyesWhenPrivacyBegan?: number[];
    __agiReadableWatch?: { frames: number; peeks: string[]; stop: () => void };
    __agiTurnBackWatch?: { frames: number; flashes: string[]; leanIns: number; stop: () => void };
  }
}

async function eyeScales(page: Page): Promise<number[]> {
  return page.evaluate((selector) => {
    return [...document.querySelectorAll(selector)].map((eye) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(eye).transform);
      return Math.round(matrix.d * 100) / 100;
    });
  }, EYES);
}

async function poses(page: Page): Promise<string[]> {
  return page.evaluate(
    (selector) =>
      [...document.querySelectorAll<HTMLElement>(selector)].map(
        (character) => character.dataset['pose'] ?? '',
      ),
    CHARACTERS,
  );
}

async function expectEveryCharacter(page: Page, pose: string): Promise<void> {
  await expect.poll(() => poses(page)).toEqual(Array.from({ length: CHARACTER_COUNT }, () => pose));
}

async function expectEveryEye(page: Page, scale: number): Promise<void> {
  await expect
    .poll(() => eyeScales(page), { message: `every eye at scaleY ${scale}` })
    .toEqual(Array.from({ length: EYE_COUNT }, () => scale));
}

/** The eyes of the ones that reopen facing the far side, by character. */
async function eyeScalesOf(page: Page, character: string): Promise<number[]> {
  return page.evaluate(
    ([selector, id]) =>
      [...document.querySelectorAll(`${selector}[data-char="${id}"] .auth-eye-open`)].map((eye) => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(eye).transform);
        return Math.round(matrix.d * 100) / 100;
      }),
    [CHARACTERS, character] as const,
  );
}

/**
 * Where each character is aimed, in scene units with the form on the positive
 * side: every pupil as it is drawn (a mirrored face flips its pupil), every
 * face's sideways shift, and every body's lean in degrees.
 */
async function sidewaysAim(
  page: Page,
): Promise<{ pupils: number[]; faces: number[]; leans: number[] }> {
  return page.evaluate((selector) => {
    const read = (pattern: RegExp, element: Element | null, fallback: number) =>
      Number(pattern.exec(element?.getAttribute('transform') ?? '')?.[1] ?? fallback);
    const pupils: number[] = [];
    const faces: number[] = [];
    const leans: number[] = [];
    for (const character of document.querySelectorAll(selector)) {
      const face = character.querySelector('[data-part="face"]');
      const mirror = read(/scale\((-?[\d.]+)/, face, 1);
      faces.push(read(/translate\((-?[\d.]+)/, face, 0));
      leans.push(-read(/skewX\((-?[\d.]+)/, character.querySelector('[data-part="body"]'), 0));
      for (const pupil of character.querySelectorAll('[data-part="pupil"]')) {
        pupils.push(read(/translate\((-?[\d.]+)/, pupil, 0) * mirror);
      }
    }
    return { pupils, faces, leans };
  }, CHARACTERS);
}

/**
 * The eyes are read inside the page, in the task that makes the scene private,
 * because three characters reopen a fraction of a second later and a reading
 * taken over several round trips could arrive after that.
 */
async function recordEyesWhenPrivacyBegins(page: Page): Promise<void> {
  await page.evaluate(
    ([sceneSelector, eyesSelector]) => {
      const scene = document.querySelector(sceneSelector);
      if (!scene) throw new Error('no scene to observe');
      const observer = new MutationObserver(() => {
        if (scene.getAttribute('data-privacy') !== 'true') return;
        observer.disconnect();
        window.__agiEyesWhenPrivacyBegan = [...document.querySelectorAll(eyesSelector)].map(
          (eye) => {
            const matrix = new DOMMatrixReadOnly(getComputedStyle(eye).transform);
            return Math.round(matrix.d * 100) / 100;
          },
        );
      });
      observer.observe(scene, { attributes: true, attributeFilter: ['data-privacy'] });
    },
    [SCENE, EYES] as const,
  );
}

async function eyesWhenPrivacyBegan(page: Page): Promise<number[] | null> {
  return page.evaluate(() => window.__agiEyesWhenPrivacyBegan ?? null);
}

/**
 * Samples every painted frame while the field is readable text: a character
 * whose eyes are open at all must have nothing aimed at the form.
 */
async function watchReadableFrames(page: Page): Promise<void> {
  await page.evaluate(
    ([selector, shut]) => {
      const watch = { frames: 0, peeks: [] as string[], stop: () => undefined as void };
      let frame = 0;
      const read = (pattern: RegExp, element: Element | null, fallback: number) =>
        Number(pattern.exec(element?.getAttribute('transform') ?? '')?.[1] ?? fallback);
      const sample = () => {
        frame = requestAnimationFrame(sample);
        const field = document.querySelector<HTMLInputElement>('input[name="password"]');
        if (field?.type !== 'text') return;
        watch.frames += 1;
        for (const character of document.querySelectorAll<HTMLElement>(selector)) {
          const open = [...character.querySelectorAll('.auth-eye-open')].some(
            (eye) => new DOMMatrixReadOnly(getComputedStyle(eye).transform).d > shut + 0.01,
          );
          if (!open) continue;
          const face = character.querySelector('[data-part="face"]');
          const mirror = read(/scale\((-?[\d.]+)/, face, 1);
          const aims = [
            read(/translate\((-?[\d.]+)/, face, 0),
            -read(/skewX\((-?[\d.]+)/, character.querySelector('[data-part="body"]'), 0),
            ...[...character.querySelectorAll('[data-part="pupil"]')].map(
              (pupil) => read(/translate\((-?[\d.]+)/, pupil, 0) * mirror,
            ),
          ];
          if (aims.some((aim) => aim > 0)) {
            watch.peeks.push(`${character.dataset['char']} open with aim ${aims.join(', ')}`);
          }
        }
      };
      watch.stop = () => cancelAnimationFrame(frame);
      window.__agiReadableWatch = watch;
      frame = requestAnimationFrame(sample);
    },
    [CHARACTERS, SHUT_SCALE] as const,
  );
}

/**
 * Samples every painted frame once the scene is no longer private: a character
 * that was looking away with open eyes must turn back with them open, never
 * through the shut state that only a readable secret calls for. A blink is the
 * character's own and is left out.
 */
async function watchTurnBackFrames(page: Page): Promise<void> {
  await page.evaluate(
    ([selector, shut]) => {
      const watch = {
        frames: 0,
        flashes: [] as string[],
        leanIns: 0,
        stop: () => undefined as void,
      };
      let frame = 0;
      const sample = () => {
        frame = requestAnimationFrame(sample);
        for (const character of document.querySelectorAll<HTMLElement>(selector)) {
          if (character.dataset['pose'] === 'away') return;
        }
        watch.frames += 1;
        const scene = document.querySelector<SVGSVGElement>('svg.auth-scene');
        if (scene?.dataset['leanIn'] === 'true') watch.leanIns += 1;
        for (const character of document.querySelectorAll<HTMLElement>(selector)) {
          if (character.dataset['gesture'] === 'shut' || character.dataset['blink']) continue;
          const scales = [...character.querySelectorAll('.auth-eye-open')].map(
            (eye) => new DOMMatrixReadOnly(getComputedStyle(eye).transform).d,
          );
          if (scales.some((scale) => scale <= shut + 0.01)) {
            watch.flashes.push(`${character.dataset['char']} shut at ${scales.join(', ')}`);
          }
        }
      };
      watch.stop = () => cancelAnimationFrame(frame);
      window.__agiTurnBackWatch = watch;
      frame = requestAnimationFrame(sample);
    },
    [CHARACTERS, SHUT_SCALE] as const,
  );
}

async function turnBackFramesWatched(
  page: Page,
): Promise<{ frames: number; flashes: string[]; leanIns: number }> {
  return page.evaluate(() => {
    const watch = window.__agiTurnBackWatch;
    watch?.stop();
    return {
      frames: watch?.frames ?? 0,
      flashes: watch?.flashes ?? [],
      leanIns: watch?.leanIns ?? 0,
    };
  });
}

async function readableFramesWatched(page: Page): Promise<{ frames: number; peeks: string[] }> {
  return page.evaluate(() => {
    const watch = window.__agiReadableWatch;
    watch?.stop();
    return { frames: watch?.frames ?? 0, peeks: watch?.peeks ?? [] };
  });
}

/**
 * Playwright runs its own page scripts as if a person had just acted, which
 * marks the page as used before anyone touches it. This replaces that signal
 * with one only a real key press or pointer press can set.
 */
async function countOnlyRealInputAsUse(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let used = false;
    const markUsed = (event: Event) => {
      if (event.isTrusted) used = true;
    };
    window.addEventListener('keydown', markUsed, { capture: true });
    window.addEventListener('pointerdown', markUsed, { capture: true });
    Object.defineProperty(Navigator.prototype, 'userActivation', {
      configurable: true,
      get: () => ({ hasBeenActive: used, isActive: used }),
    });
  });
}

async function openHarness(page: Page, query: string): Promise<void> {
  const response = await page.goto(`${HARNESS}?${query}`, { waitUntil: 'load' });
  // llm-guardrail-allow: the dev harness answers 404 on a production build, so this is not a skipped check
  test.skip(!(await routeIsServed(page, response)), `${HARNESS} is not served by this build`);
  await expect(page.getByTestId('auth-scene')).toBeVisible();
  await expect(page.locator(EYES)).toHaveCount(EYE_COUNT);
}

test.describe('auth scene privacy in the browser', () => {
  test('a password typed as dots is watched with open eyes, through a blink and a refusal', async ({
    page,
  }) => {
    await openHarness(page, 'step=password&state=error');
    const field = page.getByRole('textbox', { name: 'Password', exact: true });

    await expect(field).toBeFocused();
    await expect(page.locator(SCENE)).toHaveAttribute('data-privacy', 'false');
    await expect(page.locator(SCENE)).toHaveAttribute('data-focus', 'masked');
    await expect(page.locator(SCENE)).toHaveAttribute('data-mood', 'error');
    await expectEveryCharacter(page, 'watch');
    await field.pressSequentially(THROWAWAY);
    await expectEveryCharacter(page, 'watch');
    for (const scale of await eyeScales(page)) expect(scale).toBeGreaterThan(SHUT_SCALE);

    await page.evaluate((selector) => {
      for (const character of document.querySelectorAll<HTMLElement>(selector)) {
        character.dataset['blink'] = 'closed';
      }
      for (const character of document.querySelectorAll<HTMLElement>(selector)) {
        delete character.dataset['blink'];
      }
    }, CHARACTERS);
    await page.waitForTimeout(250);
    for (const scale of await eyeScales(page)) expect(scale).toBeGreaterThan(SHUT_SCALE);
  });

  test('every character looks away the moment the reveal button is pressed, and none at the form while the text is readable', async ({
    page,
  }) => {
    await openHarness(page, 'step=password');
    const field = page.getByRole('textbox', { name: 'Password', exact: true });
    const toggle = page.getByRole('button', { name: 'Show password' });
    await field.pressSequentially(THROWAWAY);

    const box = await toggle.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await recordEyesWhenPrivacyBegins(page);
    await watchReadableFrames(page);
    await page.mouse.down();
    await expect(page.locator(SCENE)).toHaveAttribute('data-privacy', 'true');
    await expect(field).toHaveAttribute('type', 'password');
    await expectEveryCharacter(page, 'away');
    expect(await eyesWhenPrivacyBegan(page)).toEqual(
      Array.from({ length: EYE_COUNT }, () => SHUT_SCALE),
    );

    await page.mouse.up();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(field).toHaveAttribute('type', 'text');
    await expectEveryCharacter(page, 'away');

    await expect
      .poll(async () => {
        const aim = await sidewaysAim(page);
        return [...aim.pupils, ...aim.faces, ...aim.leans].every((offset) => offset <= 0);
      })
      .toBe(true);
    await expect.poll(() => eyeScalesOf(page, 'orange')).toEqual([SHUT_SCALE, SHUT_SCALE]);
    await expect.poll(() => eyeScalesOf(page, 'purple')).toEqual([OPEN_SCALE, OPEN_SCALE]);
    await expect.poll(() => eyeScalesOf(page, 'black')).toEqual([OPEN_SCALE, OPEN_SCALE]);
    await expect.poll(() => eyeScalesOf(page, 'yellow')).toEqual([OPEN_SCALE]);
    await page.waitForTimeout(READABLE_WATCH_MS);
    const watched = await readableFramesWatched(page);
    expect(watched.frames, 'the frame probe ran while the text was readable').toBeGreaterThan(
      MIN_FRAMES_WATCHED,
    );
    expect(watched.peeks, 'no open eye was ever aimed at the form').toEqual([]);
    const yellowFace = await page
      .locator(`${CHARACTERS}[data-char="yellow"] [data-part="face"]`)
      .getAttribute('transform');
    expect(yellowFace).toContain('scale(-1.000 1)');

    await page.getByRole('heading', { name: 'Enter your password' }).click();
    await expectEveryCharacter(page, 'away');
    await field.click();
    await field.pressSequentially(' staple');
    await expectEveryCharacter(page, 'away');
  });

  test('hiding the password turns them back, eyes open, without leaning in a second time', async ({
    page,
  }) => {
    await openHarness(page, 'step=password');
    const field = page.getByRole('textbox', { name: 'Password', exact: true });
    const toggle = page.getByRole('button', { name: 'Show password' });
    await page.getByRole('heading', { name: 'Enter your password' }).click();
    await expect(page.locator(SCENE)).toHaveAttribute('data-focus', 'free');
    await field.click();
    await expect(page.locator(SCENE)).toHaveAttribute('data-lean-in', 'true');
    await expect(page.locator(SCENE)).toHaveAttribute('data-lean-in', 'false');
    await field.pressSequentially(THROWAWAY);
    await toggle.click();
    await expectEveryCharacter(page, 'away');
    await expect.poll(() => eyeScalesOf(page, 'purple')).toEqual([OPEN_SCALE, OPEN_SCALE]);
    await expect.poll(() => eyeScalesOf(page, 'black')).toEqual([OPEN_SCALE, OPEN_SCALE]);
    await expect.poll(() => eyeScalesOf(page, 'yellow')).toEqual([OPEN_SCALE]);

    await watchTurnBackFrames(page);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(field).toHaveAttribute('type', 'password');
    await expect(page.locator(SCENE)).toHaveAttribute('data-privacy', 'false');
    await expect(page.locator(SCENE)).toHaveAttribute('data-relief', 'true');
    await expectEveryCharacter(page, 'watch');
    await expectEveryEye(page, OPEN_SCALE);
    await page.waitForTimeout(TURN_BACK_WATCH_MS);
    const watched = await turnBackFramesWatched(page);
    expect(watched.frames, 'the frame probe ran while they turned back').toBeGreaterThan(
      MIN_FRAMES_WATCHED,
    );
    expect(watched.flashes, 'no eye that was open snapped shut on the way back').toEqual([]);
    expect(watched.leanIns, 'the lean-in belongs to coming to the field, not to hiding it').toBe(0);
  });

  test('a window blur that leaves the field active keeps them watching', async ({ page }) => {
    await openHarness(page, 'step=password');
    const field = page.getByRole('textbox', { name: 'Password', exact: true });
    await expect(field).toBeFocused();

    await field.evaluate((element) => {
      element.dispatchEvent(new FocusEvent('blur', { relatedTarget: null }));
      element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    });

    await expect(field).toBeFocused();
    await expect(page.locator(SCENE)).toHaveAttribute('data-focus', 'masked');
    await expectEveryCharacter(page, 'watch');
  });

  test('an address field the page focused leaves the eyes on the pointer until it is used', async ({
    page,
  }) => {
    await countOnlyRealInputAsUse(page);
    await openHarness(page, 'step=email');
    const email = page.getByLabel('Email address');

    await expect(email).toBeFocused();
    await expect(page.locator(SCENE)).toHaveAttribute('data-motion', 'full');
    await expect(page.locator(SCENE)).toHaveAttribute('data-focus', 'free');
    await page.mouse.move(200, 200);
    await expectEveryCharacter(page, 'follow');
    expect((await sidewaysAim(page)).faces).toHaveLength(CHARACTER_COUNT);
    await expect
      .poll(async () => (await sidewaysAim(page)).faces.every((shift) => shift < 0))
      .toBe(true);
    await expect(email).toBeFocused();

    await email.pressSequentially('p');
    await expect(page.locator(SCENE)).toHaveAttribute('data-focus', 'field');
    await expectEveryCharacter(page, 'attend');
    await expect
      .poll(async () => (await sidewaysAim(page)).faces.every((shift) => shift > 0))
      .toBe(true);
  });

  test('a success hop never replays the staggered arrival', async ({ page }) => {
    await openHarness(page, 'step=email&state=success');
    await expect(page.locator(SCENE)).toHaveAttribute('data-mood', 'success');
    await expect(page.locator(SCENE)).toHaveAttribute('data-mood', 'neutral');

    await page.waitForTimeout(400);
    const running = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('svg.auth-scene');
      if (!svg) return null;
      return svg
        .getAnimations({ subtree: true })
        .filter(
          (animation) =>
            'animationName' in animation &&
            (animation as CSSAnimation).animationName.startsWith('auth-char-enter') &&
            animation.playState === 'running',
        ).length;
    });
    expect(running).toBe(0);
  });

  test('a one-time code, which is readable, gets the look-away pose and the pupils never follow the pointer', async ({
    page,
  }) => {
    await openHarness(page, 'step=code');

    await expect(page.getByLabel('Code')).toBeFocused();
    await expect(page.locator(SCENE)).toHaveAttribute('data-privacy', 'true');
    await expectEveryCharacter(page, 'away');
    await page.mouse.move(100, 100);
    await page.mouse.move(1800, 1000);
    await page.waitForTimeout(400);
    const aim = await sidewaysAim(page);
    for (const pupil of aim.pupils) expect(pupil).toBeLessThanOrEqual(0);
  });

  test('reduced motion paints the look-away pose at once with every eye shut, and never tracks the pointer', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHarness(page, 'step=password');
    const field = page.getByRole('textbox', { name: 'Password', exact: true });
    const toggle = page.getByRole('button', { name: 'Show password' });

    await expect(page.locator(SCENE)).toHaveAttribute('data-motion', 'reduced');
    await expectEveryCharacter(page, 'watch');
    await field.pressSequentially(THROWAWAY);
    await toggle.click();
    await expectEveryCharacter(page, 'away');
    await expect(field).toHaveAttribute('type', 'text');
    await expectEveryEye(page, SHUT_SCALE);
    const aim = await sidewaysAim(page);
    for (const offset of [...aim.pupils, ...aim.faces, ...aim.leans]) {
      expect(offset).toBeLessThanOrEqual(0);
    }
    const yellowFace = await page
      .locator(`${CHARACTERS}[data-char="yellow"] [data-part="face"]`)
      .getAttribute('transform');
    expect(yellowFace).toContain('scale(-1.000 1)');
    await field.pressSequentially(' staple');
    await page.waitForTimeout(400);
    expect(await eyeScales(page), 'every eye stays shut for as long as it is readable').toEqual(
      Array.from({ length: EYE_COUNT }, () => SHUT_SCALE),
    );

    await toggle.click();
    await expectEveryEye(page, OPEN_SCALE);
    await page.getByRole('heading', { name: 'Enter your password' }).click();
    await expectEveryCharacter(page, 'rest');
    const before = await sidewaysAim(page);
    await page.mouse.move(200, 200);
    await page.mouse.move(1700, 900);
    await page.waitForTimeout(300);
    expect(await sidewaysAim(page)).toEqual(before);
  });
});
