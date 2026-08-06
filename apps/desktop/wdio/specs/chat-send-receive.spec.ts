import { resolveScreenDir } from '../support/dom';

const SCREEN_DIR = resolveScreenDir('desktop-qa');

describe('AGI Desktop native chat send/receive (via actual live composer: ChatInput)', () => {
  // RE-ENABLED 2026-07-11 (desktop-qa): was skipped pending isolation of a
  // "Streaming connection timeout after 90s for Ollama" backend error hit
  // live by this exact test. A clean, contention-free re-isolation (direct
  // request to a warm Ollama instance, num_ctx: 32768 matching what the app
  // actually requests — the prior inconclusive attempt hadn't set this and
  // was silently capped at Ollama's default 2048-token context) confirmed a
  // real, environment-independent product bug: a realistic 111-tool-injected
  // prompt measured 88.7s of prompt-eval ALONE, already at the old flat 90s
  // timeout's edge before generation even started. Fixed at the root: Ollama
  // now caps prompt-injected tools at 32 (`cap_tools_for_prompt_injection`,
  // ollama.rs) for models without native tool support, and the streaming
  // timeout scales with real prompt size instead of a flat 90s
  // (`compute_streaming_timeout`, llm_router.rs). See
  // docs/agent-context/known-flaws.md for the full isolation writeup.
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
    // 120s: generous outer bound covering a cold local-model load (~20s
    // measured directly against Ollama) plus prompt-eval. Should complete far
    // under this now that tool injection is capped at 32 for non-tool-native
    // models and the backend's own streaming timeout scales with prompt size
    // (see the RE-ENABLED note above) — kept high rather than tuned tight so
    // this test isn't newly flaky on a slower machine.
    const assistantAppeared = await assistantMsg
      .waitForDisplayed({ timeout: 120000 })
      .then(() => true)
      .catch(() => false);
    console.log('ASSISTANT MESSAGE APPEARED:', assistantAppeared);

    if (assistantAppeared) {
      console.log('ASSISTANT MESSAGE TEXT:', JSON.stringify(await assistantMsg.getText()));
    }

    await browser.saveScreenshot(`${SCREEN_DIR}/fresh-chat-send-receive.png`);

    // Previously this spec logged assistantAppeared but never asserted on it, so
    // it reported PASSED even when the assistant never responded (same
    // zero-assertion class as DESKTOP-WDIO-NO-ASSERTIONS-01 in known-flaws.md).
    expect(assistantAppeared).toBe(true);
    expect((await assistantMsg.getText()).length).toBeGreaterThan(0);
  });
});
