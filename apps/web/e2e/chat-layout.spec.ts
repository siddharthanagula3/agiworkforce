import { test, expect, type Page } from '@playwright/test';

const QA_USER = 'user_3F8wXtZ4rDJ1SZmfO02Lz3BHj2v';

async function mintSignInTicket(): Promise<string> {
  const secret = process.env['CLERK_SECRET_KEY'];
  if (!secret) {
    throw new Error('CLERK_SECRET_KEY missing from process.env (.env.local not loaded)');
  }
  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: QA_USER }),
  });
  if (!res.ok) throw new Error(`sign_in_tokens failed: HTTP ${res.status}`);
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new Error('sign_in_tokens returned no token');
  return json.token;
}

async function signIn(page: Page): Promise<void> {
  const ticket = await mintSignInTicket();
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded),
    { timeout: 30000 },
  );
  await page.evaluate(async (t) => {
    const clerk = (
      window as unknown as {
        Clerk: {
          client: { signIn: { create: (o: unknown) => Promise<{ createdSessionId?: string }> } };
          setActive: (o: unknown) => Promise<void>;
        };
      }
    ).Clerk;
    const res = await clerk.client.signIn.create({ strategy: 'ticket', ticket: t });
    if (res.createdSessionId) await clerk.setActive({ session: res.createdSessionId });
  }, ticket);
  await page.waitForTimeout(1500);
}

test.describe('chat surface layout', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // The message column carried its gutter on the row while the composer carried
  // it inside the same max-width, so every bubble hung 16px past the composer —
  // 47px once the sidebar was collapsed and the composer widened to max-w-4xl.
  test('the composer and the message column share one set of edges', async ({ page }) => {
    await page.goto('/chat');
    const composer = page.getByRole('textbox').first();
    await expect(composer).toBeVisible({ timeout: 20000 });

    const probe = 'Layout probe: do the message column and the composer line up?';
    await composer.fill(probe);
    await composer.press('Enter');
    await expect(page.locator('.message-inner').first()).toBeVisible({ timeout: 30000 });

    const edges = await page.evaluate(() => {
      const input = document.querySelector('#chat-composer [role="textbox"]');
      const composerColumn = input?.closest('.max-w-3xl') as HTMLElement | null;
      const messageColumn = document.querySelector('.message-inner') as HTMLElement | null;
      const rect = (el: HTMLElement | null) =>
        el
          ? {
              left: Math.round(el.getBoundingClientRect().left),
              right: Math.round(el.getBoundingClientRect().right),
            }
          : null;
      return { composer: rect(composerColumn), message: rect(messageColumn) };
    });

    expect(edges.composer).not.toBeNull();
    expect(edges.message).not.toBeNull();
    expect(Math.abs(edges.composer!.left - edges.message!.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(edges.composer!.right - edges.message!.right)).toBeLessThanOrEqual(1);
  });

  // Expanding "More models" made the popover taller than the space above its
  // trigger, and it rendered 45px above the viewport with the search field
  // half cut off and no way to scroll it back.
  test('the model picker stays inside the viewport when its roster expands', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto('/chat');
    await page.getByRole('button', { name: 'Change model' }).click();
    const moreModels = page.getByRole('button', { name: /More models/ });
    if (await moreModels.count()) await moreModels.first().click();

    const box = await page.evaluate(() => {
      const content = document.querySelector('[data-radix-popper-content-wrapper]')
        ?.firstElementChild as HTMLElement | undefined;
      if (!content) return null;
      const r = content.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), viewport: window.innerHeight };
    });

    expect(box).not.toBeNull();
    expect(box!.top).toBeGreaterThanOrEqual(0);
    expect(box!.bottom).toBeLessThanOrEqual(box!.viewport);
    await expect(page.getByRole('textbox', { name: 'Search models' })).toBeInViewport();
  });

  // The sidebar's fixed header, nav and footer left the `flex-1` conversation
  // list a 20px window on a 1280x600 laptop — too short for its own heading.
  test('the sidebar conversation list stays usable on a short viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto('/chat');
    await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 20000 });

    const scroller = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(
        (n) =>
          n.className.includes('overflow-y-auto') &&
          n.getBoundingClientRect().width < 300 &&
          n.getBoundingClientRect().width > 100,
      );
      if (!el) return null;
      return {
        height: Math.round(el.getBoundingClientRect().height),
        scrollHeight: el.scrollHeight,
      };
    });

    expect(scroller).not.toBeNull();
    expect(scroller!.height).toBeGreaterThan(120);
  });
});
