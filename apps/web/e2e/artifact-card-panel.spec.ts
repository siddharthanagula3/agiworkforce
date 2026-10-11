import { test, expect, type FrameLocator, type Page } from '@playwright/test';
import { installSseChatMock, type SseChatMock } from './lib/sse-chat-mock';
import { signIn } from './qa-capability-harness';

const CHAT_ROUTE = '/chat';
const COMPOSER_LABEL = /message input/i;
const CONSENT_DISMISS_LABEL = 'Close and reject non-essential cookies';
const STOP_BUTTON_LABEL = /stop the current response/i;
const LOAD_TIMEOUT_MS = 30_000;
const CONSENT_WAIT_MS = 6_000;
const STREAM_TIMEOUT_MS = 30_000;
const STREAM_CHUNK_CHARS = 120;
const FRAME_SETTLE_MS = 40;
const DONE_SETTLE_MS = 600;
const RENDER_TIMEOUT_MS = 20_000;
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const PHONE_VIEWPORT = { width: 390, height: 844 };

const ARTIFACT_TITLE = 'Desk Calculator';
const CREATING_LABEL = 'Creating desk-calculator.html';
const OPEN_ARTIFACT = `Open artifact: ${ARTIFACT_TITLE}`;
const HIDE_ARTIFACT = `Hide artifact: ${ARTIFACT_TITLE}`;
const ASSISTANT_BUBBLE = '[data-role="assistant"]';
const FENCE_MARKER = '```';
const SANDBOX_CONFIGURED = Boolean(process.env['NEXT_PUBLIC_SANDBOX_ORIGIN']);

const CALCULATOR = [
  '<!-- @artifact -->',
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  `<title>${ARTIFACT_TITLE}</title>`,
  '<style>',
  ':root{color-scheme:light dark;--bg:#f6f6f4;--fg:#1c1c1a;--key:#fff;--accent:#2f6fde}',
  '@media (prefers-color-scheme: dark){:root{--bg:#161616;--fg:#f2f2f2;--key:#262626}}',
  'body{margin:0;background:var(--bg);color:var(--fg);font:16px system-ui,sans-serif}',
  'main{max-width:320px;margin:24px auto;padding:16px;display:grid;gap:8px}',
  '#display{font-size:32px;text-align:end;padding:12px;min-height:40px}',
  '.keys{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}',
  'button{min-height:48px;border:0;border-radius:12px;background:var(--key);color:var(--fg);font-size:18px}',
  'button.op{background:var(--accent);color:#fff}',
  '</style>',
  '</head>',
  '<body>',
  '<main>',
  '<output id="display" aria-live="polite">0</output>',
  '<div class="keys">',
  '<button data-k="7">7</button><button data-k="8">8</button><button data-k="9">9</button><button class="op" data-k="/">÷</button>',
  '<button data-k="4">4</button><button data-k="5">5</button><button data-k="6">6</button><button class="op" data-k="*">×</button>',
  '<button data-k="1">1</button><button data-k="2">2</button><button data-k="3">3</button><button class="op" data-k="-">−</button>',
  '<button data-k="0">0</button><button data-k="C">C</button><button class="op" data-k="=">=</button><button class="op" data-k="+">+</button>',
  '</div>',
  '</main>',
  '<script>',
  'var expr="";var out=document.getElementById("display");',
  'document.querySelector(".keys").addEventListener("click",function(e){var k=e.target.getAttribute("data-k");if(!k)return;',
  'if(k==="C"){expr="";out.textContent="0";return;}',
  'function calc(s){var t=s.match(/[0-9.]+|[-+*\\/]/g)||[];var v=[parseFloat(t[0])];',
  'for(var i=1;i<t.length;i+=2){var b=parseFloat(t[i+1]);',
  'if(t[i]==="*")v.push(v.pop()*b);else if(t[i]==="/")v.push(v.pop()/b);else if(t[i]==="-")v.push(-b);else v.push(b);}',
  'return v.reduce(function(a,c){return a+c;},0);}',
  'if(k==="="){var r=calc(expr);if(isFinite(r)){out.textContent=String(r);expr=out.textContent;}else{out.textContent="Error";expr="";}return;}',
  'expr+=k;out.textContent=expr;});',
  '</script>',
  '</body>',
  '</html>',
].join('\n');

const ANSWER = [
  'Here is a desk calculator you can use right here.',
  '',
  `${FENCE_MARKER}html`,
  CALCULATOR,
  FENCE_MARKER,
  '',
  'Click the keys, or press C to clear.',
].join('\n');

async function openChat(page: Page): Promise<SseChatMock> {
  const mock = await installSseChatMock(page);
  await signIn(page);
  await page.goto(CHAT_ROUTE, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: LOAD_TIMEOUT_MS }).catch(() => undefined);
  await expect(page.getByRole('textbox', { name: COMPOSER_LABEL }).first()).toBeEditable({
    timeout: LOAD_TIMEOUT_MS,
  });
  await page
    .getByRole('button', { name: CONSENT_DISMISS_LABEL })
    .click({ timeout: CONSENT_WAIT_MS })
    .catch(() => undefined);
  return mock;
}

async function streamCalculator(page: Page, mock: SseChatMock): Promise<{ sawCreating: boolean }> {
  const composer = page.getByRole('textbox', { name: COMPOSER_LABEL }).first();
  await composer.fill('make a calculator');
  await composer.press('Enter');
  await mock.waitForRequest();

  const prose = page.locator(`${ASSISTANT_BUBBLE} .message-text`).last();
  const creating = page.getByRole('button', { name: new RegExp(CREATING_LABEL) });
  let sawCreating = false;
  for (let at = 0; at < ANSWER.length; at += STREAM_CHUNK_CHARS) {
    await mock.push(ANSWER.slice(at, at + STREAM_CHUNK_CHARS));
    await page.waitForTimeout(FRAME_SETTLE_MS);
    if (!sawCreating && (await creating.count())) sawCreating = true;
    const text = (await prose.innerText().catch(() => '')) ?? '';
    expect(text, 'the raw artifact fence reached the transcript').not.toContain(FENCE_MARKER);
  }
  await mock.finish();
  await expect(page.getByRole('button', { name: STOP_BUTTON_LABEL })).toHaveCount(0, {
    timeout: STREAM_TIMEOUT_MS,
  });
  await page.waitForTimeout(DONE_SETTLE_MS);
  return { sawCreating };
}

function panelArtifactDocument(page: Page): FrameLocator {
  return page
    .frameLocator(`iframe[title="${ARTIFACT_TITLE}"]`)
    .frameLocator('iframe.artifact-frame');
}

test.describe('artifact card and panel', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test('a marked HTML artifact streams as a creating row, opens in the panel, and leaves a card', async ({
    page,
  }) => {
    const mock = await openChat(page);
    const { sawCreating } = await streamCalculator(page, mock);
    expect(sawCreating, 'the creating row never appeared while the artifact streamed').toBe(true);

    const card = page.getByTestId('artifact-card').last();
    await expect(card).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
    await expect(card.locator('iframe')).toHaveCount(0);
    await expect(page.getByTestId('artifact-created-row').last()).toContainText('Created a file');

    const hide = page.getByRole('button', { name: HIDE_ARTIFACT });
    await expect(hide, 'the artifact did not open in the panel on its own').toBeVisible();
    await expect(page.locator(`iframe[title="${ARTIFACT_TITLE}"]`)).toBeVisible({
      timeout: RENDER_TIMEOUT_MS,
    });

    if (SANDBOX_CONFIGURED) {
      const calculator = panelArtifactDocument(page);
      await calculator.getByRole('button', { name: '2' }).click();
      await calculator.getByRole('button', { name: '×' }).click();
      await calculator.getByRole('button', { name: '2' }).click();
      await calculator.getByRole('button', { name: '=' }).click();
      await expect(calculator.locator('#display')).toHaveText('4');
    }

    await hide.click();
    await expect(page.locator(`iframe[title="${ARTIFACT_TITLE}"]`)).toHaveCount(0);
    await page.getByRole('button', { name: OPEN_ARTIFACT }).click();
    await expect(page.getByRole('button', { name: HIDE_ARTIFACT })).toBeVisible();
  });
});

test.describe('artifact card on a phone', () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test('keeps the panel closed, shows Open, and never scrolls the page sideways', async ({
    page,
  }) => {
    const mock = await openChat(page);
    await streamCalculator(page, mock);

    const open = page.getByRole('button', { name: OPEN_ARTIFACT });
    await expect(open).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
    const box = await page.getByTestId('artifact-card').last().boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
