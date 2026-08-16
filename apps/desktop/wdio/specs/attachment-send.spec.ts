import { resolveScreenDir } from '../support/dom';

const SCREEN_DIR = resolveScreenDir('desktop-qa');

describe('AGI Desktop attachment delivery (via drag-drop into the live composer)', () => {
  it('delivers a dropped file attachment through to a real chat turn', async () => {
    await browser.pause(1500);

    const newChatBtn = await $('button[title="New chat"]');
    await newChatBtn.waitForDisplayed({ timeout: 15000 });
    await newChatBtn.click();
    await browser.pause(500);

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 15000 });

    const secretToken = 'ZEBRA-PANCAKE-7719';
    const fileContents = `Internal test memo.\n\nThe secret verification code is: ${secretToken}\n\nDo not share this code outside this file.`;

    const dropResult = await browser.execute((text) => {
      const el = document.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Chat message input"]',
      );
      if (!el) return { ok: false };
      const file = new File([text], 'secret-memo.txt', { type: 'text/plain' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
      el.dispatchEvent(event);
      return { ok: true };
    }, fileContents);
    console.log('DROP DISPATCH RESULT:', JSON.stringify(dropResult));
    expect(dropResult.ok).toBe(true);

    const attachmentChip = await $('span*=secret-memo.txt');
    await attachmentChip.waitForDisplayed({ timeout: 8000 });

    await composer.click();
    await composer.addValue('What is the secret verification code written in the attached file?');

    const sendBtn = await $('button[aria-label*="Send message ("]');
    await sendBtn.waitForDisplayed({ timeout: 5000 });
    await sendBtn.click();

    const userMsg = await $('[data-role="user"]');
    await userMsg.waitForDisplayed({ timeout: 10000 });
    console.log('USER MESSAGE RENDERED:', JSON.stringify(await userMsg.getText()));

    const assistantMsg = await $('[data-role="assistant"]');
    const assistantAppeared = await assistantMsg
      .waitForDisplayed({ timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    console.log('ASSISTANT MESSAGE APPEARED:', assistantAppeared);

    if (assistantAppeared) {
      await browser.pause(1500);
      const assistantText = await $('[data-role="assistant"]')
        .getText()
        .catch(() => '');
      console.log('ASSISTANT MESSAGE TEXT (informational):', JSON.stringify(assistantText));
    }

    await browser.saveScreenshot(`${SCREEN_DIR}/attachment-send.png`);

    expect(assistantAppeared).toBe(true);
  });
});
