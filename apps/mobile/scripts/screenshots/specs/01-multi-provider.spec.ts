/**
 * Detox spec — screenshot 01: multi-provider in one chat.
 *
 * Drives the app to a state where one chat thread has three answers
 * from three different providers (Claude → GPT → Gemini), each
 * model badge visible. Captures the frame as the raw PNG.
 *
 * Reads test API keys from .env.screenshots; aborts if any are
 * missing (App Review-compliant captures require real API responses).
 */

import { device, element, by, waitFor } from 'detox';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENV_PATH = join(__dirname, '..', '..', '..', '.env.screenshots');

interface ScreenshotEnv {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  GOOGLE_API_KEY: string;
}

function loadEnv(): ScreenshotEnv {
  const text = readFileSync(ENV_PATH, 'utf8');
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY']) {
    if (!env[k]) throw new Error(`Missing ${k} in .env.screenshots`);
  }
  return env as unknown as ScreenshotEnv;
}

describe('Screenshot 01 — multi-provider chat', () => {
  const env = loadEnv();
  const capturePath = process.env.DETOX_CAPTURE_PATH ?? '/tmp/01.png';

  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: true,
      launchArgs: { SEEDED_KEYS: '1' },
    });
  });

  it('produces the locked frame', async () => {
    // Walk onboarding → BYOK → consent accept
    await element(by.id('onboarding.continue')).tap();
    await element(by.id('mode.byok')).tap();
    await waitFor(element(by.id('byok.consent.modal')))
      .toBeVisible()
      .withTimeout(2000);
    await element(by.id('byok.consent.accept')).tap();

    // Seed three provider keys via the dev-only seed path
    await element(by.id('keys.seed.anthropic')).typeText(env.ANTHROPIC_API_KEY);
    await element(by.id('keys.seed.anthropic.save')).tap();
    await element(by.id('keys.seed.openai')).typeText(env.OPENAI_API_KEY);
    await element(by.id('keys.seed.openai.save')).tap();
    await element(by.id('keys.seed.google')).typeText(env.GOOGLE_API_KEY);
    await element(by.id('keys.seed.google.save')).tap();

    // Start a new chat
    await element(by.id('nav.chat.new')).tap();

    // Turn 1 — Claude
    await element(by.id('chat.composer.model.badge')).tap();
    await element(by.id('model.picker.anthropic.claude-4-6-sonnet')).tap();
    await element(by.id('chat.composer.input')).typeText(
      'Explain how multi-provider chat is different from a one-model app, in 2 sentences.',
    );
    await element(by.id('chat.composer.send')).tap();
    await waitFor(element(by.id('chat.message.assistant.0.done')))
      .toBeVisible()
      .withTimeout(20000);

    // Turn 2 — GPT
    await element(by.id('chat.composer.model.badge')).tap();
    await element(by.id('model.picker.openai.gpt-5-4')).tap();
    await element(by.id('chat.composer.input')).typeText(
      'Now give me your version in 2 sentences.',
    );
    await element(by.id('chat.composer.send')).tap();
    await waitFor(element(by.id('chat.message.assistant.1.done')))
      .toBeVisible()
      .withTimeout(20000);

    // Turn 3 — Gemini
    await element(by.id('chat.composer.model.badge')).tap();
    await element(by.id('model.picker.google.gemini-3-1-pro')).tap();
    await element(by.id('chat.composer.input')).typeText('Add one more angle in 2 sentences.');
    await element(by.id('chat.composer.send')).tap();
    await waitFor(element(by.id('chat.message.assistant.2.done')))
      .toBeVisible()
      .withTimeout(20000);

    // Scroll to show all three answers + the composer + model badge
    await element(by.id('chat.list')).scrollTo('top');

    // Capture
    await device.takeScreenshot('01-multi-provider');
    // Detox writes to its own artifact dir; the pipeline copies to DETOX_CAPTURE_PATH
    console.log(`Captured to ${capturePath}`);
  });
});
