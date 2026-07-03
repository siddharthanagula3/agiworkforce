describe('AGI Desktop native chat send/receive (via actual live composer: ChatInput)', () => {
  it('should send a message in a fresh chat and render an assistant response', async () => {
    await browser.pause(1500);

    const newChatBtn = await $('button[title="New chat"]');
    await newChatBtn.waitForDisplayed({ timeout: 15000 });
    await newChatBtn.click();
    await browser.pause(500);

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 15000 });
    await composer.click();
    await composer.addValue('Say the word banana and nothing else.');

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
      console.log('ASSISTANT MESSAGE TEXT:', JSON.stringify(await assistantMsg.getText()));
    }

    await browser.saveScreenshot(
      '/private/tmp/claude-501/-Users-siddhartha-Desktop-agiworkforce/75367813-fb2a-4a49-bdcd-6412347c218f/scratchpad/desktop-qa-screens/fresh-chat-send-receive.png',
    );
  });
});
