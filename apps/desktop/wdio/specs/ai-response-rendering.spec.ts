import { resolveScreenDir } from '../support/dom';

const SCREEN_DIR = resolveScreenDir('desktop-qa');

const MARKDOWN_PROMPT =
  'Output exactly and only the following markdown, verbatim, with no extra commentary before or after:\n\n' +
  '# Heading One\n\n' +
  'This has **bold text**, *italic text*, and `inline code`.\n\n' +
  '```python\n' +
  'def hello():\n' +
  '    print("hi")\n' +
  '```\n\n' +
  '| Col A | Col B |\n' +
  '|-------|-------|\n' +
  '| 1     | 2     |\n\n' +
  '> A blockquote line\n\n' +
  '- item one\n' +
  '- item two\n';

describe('AGI Desktop AI response rendering (real Ollama send, real DOM inspection)', () => {
  it('sends a markdown-rich prompt in Local mode and renders the assistant reply', async function () {
    this.timeout(400000);

    const newChatBtn = await $('button[aria-label="New chat"]');
    const newChatAppeared = await newChatBtn.waitForDisplayed({ timeout: 20000 }).then(
      () => true,
      () => false,
    );
    if (newChatAppeared) {
      await newChatBtn.click();
      await browser.pause(1000);
    }

    const preSendCount = await browser.execute(
      () => document.querySelectorAll('[data-role="assistant"]').length,
    );
    console.log('PRE_SEND_ASSISTANT_COUNT', preSendCount);
    if (preSendCount > 0) {
      console.log(
        'WARNING: "New chat" did not produce an empty conversation; a stale ' +
          'assistant bubble is already present. Proceeding with count-based ' +
          'new-message detection rather than assuming a blank slate.',
      );
    }

    const modelPicker = await $('button[aria-label="Select model"]');
    const pickerVisible = await modelPicker.waitForDisplayed({ timeout: 20000 }).then(
      () => true,
      () => false,
    );
    if (pickerVisible) {
      await modelPicker.click();
      await browser.pause(500);
      const preferredModel = process.env['AGI_WDIO_MARKDOWN_MODEL_ID'];
      const clicked = await browser.execute((modelName) => {
        if (!modelName) return false;
        const buttons = Array.from(document.querySelectorAll('button'));
        const match = buttons.find((b) => (b.textContent ?? '').includes(modelName));
        if (match) {
          (match as HTMLButtonElement).click();
          return true;
        }
        return false;
      }, preferredModel);
      console.log('MODEL_SELECT_CLICKED', clicked);
      if (!clicked) {
        await browser.keys('Escape');
      }
      await browser.pause(500);
    }

    await browser.saveScreenshot(`${SCREEN_DIR}/ai-render-pre-composer.png`);

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 20000 });
    await composer.click();
    await composer.addValue(MARKDOWN_PROMPT);

    const sendBtn = await $('button[aria-label*="Send message ("]');
    await sendBtn.waitForDisplayed({ timeout: 5000 });
    await sendBtn.click();

    await browser.pause(1000);
    await browser.saveScreenshot(`${SCREEN_DIR}/ai-render-post-send.png`);

    await browser.waitUntil(
      async () => {
        const count = await browser.execute(
          () => document.querySelectorAll('[data-role="assistant"]').length,
        );
        return count > preSendCount;
      },
      {
        timeout: 120000,
        interval: 2000,
        timeoutMsg: 'no new assistant bubble appeared after send',
      },
    );

    const getLastAssistantHtml = () =>
      browser.execute(() => {
        const nodes = document.querySelectorAll('[data-role="assistant"]');
        const last = nodes[nodes.length - 1];
        return last ? last.innerHTML : null;
      });
    const getLastAssistantText = () =>
      browser.execute(() => {
        const nodes = document.querySelectorAll('[data-role="assistant"]');
        const last = nodes[nodes.length - 1] as HTMLElement | undefined;
        return last ? last.innerText || last.textContent || '' : '';
      });

    await browser.pause(2000);
    await browser.saveScreenshot(`${SCREEN_DIR}/ai-render-mid-stream.png`);
    const midStreamHtml = await getLastAssistantHtml();
    console.log('MID_STREAM_HTML_LENGTH', midStreamHtml ? midStreamHtml.length : 0);

    let lastLen = -1;
    let stableCount = 0;
    for (let i = 0; i < 90 && stableCount < 10; i++) {
      const text = await getLastAssistantText();
      if (text.length === lastLen && text.length > 0) {
        stableCount++;
      } else {
        stableCount = 0;
        lastLen = text.length;
      }
      await browser.pause(3000);
    }

    await browser.saveScreenshot(`${SCREEN_DIR}/ai-render-final.png`);

    const finalText = await getLastAssistantText();
    console.log('FINAL_TEXT', finalText);

    const structuralChecks = await browser.execute(() => {
      const nodes = document.querySelectorAll('[data-role="assistant"]');
      const el = nodes[nodes.length - 1];
      if (!el) return null;
      return {
        hasHeading: !!el.querySelector('h1, h2, h3'),
        hasBold: !!el.querySelector('strong, b'),
        hasItalic: !!el.querySelector('em, i'),
        hasInlineCode: !!el.querySelector('code'),
        hasCodeBlock: !!el.querySelector('pre'),
        codeBlockHasHighlightSpans: !!el.querySelector(
          'pre code span, pre span[class*="hljs"], pre span[class*="token"]',
        ),
        hasTable: !!el.querySelector('table'),
        hasBlockquote: !!el.querySelector('blockquote'),
        hasList: !!el.querySelector('ul, ol'),
        rawTripleBacktickLeaked: (el.textContent || '').includes('```'),
        rawPipeTableLeaked: /\|\s*Col A\s*\|/.test(el.textContent || ''),
      };
    });

    console.log('STRUCTURAL_CHECKS', JSON.stringify(structuralChecks));

    expect(structuralChecks).not.toBeNull();
    expect(structuralChecks!.hasHeading).toBe(true);
    expect(structuralChecks!.hasBold).toBe(true);
    expect(structuralChecks!.hasItalic).toBe(true);
    expect(structuralChecks!.hasInlineCode).toBe(true);
    expect(structuralChecks!.hasCodeBlock).toBe(true);
    expect(structuralChecks!.hasTable).toBe(true);
    expect(structuralChecks!.hasBlockquote).toBe(true);
    expect(structuralChecks!.hasList).toBe(true);
    expect(structuralChecks!.rawTripleBacktickLeaked).toBe(false);
    expect(structuralChecks!.rawPipeTableLeaked).toBe(false);
  });
});
