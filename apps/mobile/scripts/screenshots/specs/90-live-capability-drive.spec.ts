import { device, element, by, waitFor } from 'detox';

const SHORT = 6000;
const LONG = 30000;
const LAUNCH = 180000;

async function present(matcher: Detox.NativeMatcher, timeout = SHORT): Promise<boolean> {
  try {
    await waitFor(element(matcher)).toBeVisible().withTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

const findings: string[] = [];
function record(capability: string, state: string, detail: string): void {
  findings.push(`${capability.padEnd(22)} ${state.padEnd(14)} ${detail}`);
  // eslint-disable-next-line no-console -- this spec's output IS the report
  console.log(`[drive] ${capability}: ${state}, ${detail}`);
}

describe('Live capability drive', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: false, delete: false });
  });

  afterAll(async () => {
    // eslint-disable-next-line no-console -- final report
    console.log('\n===== CAPABILITY REPORT =====\n' + findings.join('\n') + '\n');
    await device.terminateApp();
  });

  it('clears first-run if the app is showing it', async () => {
    const onAgeGate = await present(by.id('age-gate-root'), 20000);
    if (onAgeGate) {
      await element(by.id('age-gate-input')).typeText('30');
      await element(by.id('age-gate-continue-btn')).tap();
      record('first-run: age gate', 'CLEARED', 'entered age and continued');
    }

    const onOnboarding = await present(by.id('onboarding-root'), 15000);
    if (onOnboarding) {
      if (await present(by.id('hero-start-chatting-btn'), 8000)) {
        await element(by.id('hero-start-chatting-btn')).tap();
      }
      if (await present(by.id('download-skip-btn'), 15000)) {
        await element(by.id('download-skip-btn')).tap();
      }
      record('first-run: onboarding', 'CLEARED', 'skipped to chat');
    }

    if (!onAgeGate && !onOnboarding) {
      record('first-run', 'N/A', 'app already past first-run');
    }
  });

  it('reaches the composer on launch', async () => {
    const composer = await present(by.id('chat.composer.input'), LAUNCH);
    record(
      'app launch',
      composer ? 'REACHED' : 'BLOCKED',
      composer ? 'composer visible' : 'composer never appeared',
    );
  });

  it('reports which mode the app starts in', async () => {
    const local = await present(by.text('Local'));
    const cloud = await present(by.text('Cloud'));
    record(
      'mode toggle',
      local || cloud ? 'REACHED' : 'ABSENT',
      `Local=${local} Cloud=${cloud} (Local Mode has no server tools by design)`,
    );
  });

  it('opens the + sheet and reports the capability rows it offers', async () => {
    let sheetOpened = false;
    for (const index of [0, 1]) {
      try {
        await element(by.label('Add to chat')).atIndex(index).tap();
      } catch {
        continue;
      }
      if (await present(by.id('add-to-chat-sheet'), 4000)) {
        sheetOpened = true;
        break;
      }
    }
    if (!sheetOpened) {
      record('+ sheet', 'BLOCKED', 'no "Add to chat" control opened the sheet');
      return;
    }
    const rows = {
      Camera: await present(by.text('Camera'), 2000),
      Photos: await present(by.text('Photos'), 2000),
      Image: await present(by.text('Image'), 2000),
      Video: await present(by.text('Video'), 2000),
      'Deep research': await present(by.text('Deep research'), 2000),
    };
    record(
      '+ sheet rows',
      'REACHED',
      Object.entries(rows)
        .map(([k, v]) => `${k}=${v ? 'shown' : 'hidden'}`)
        .join(' '),
    );

    const close = await present(by.id('add-to-chat-close'), 2000);
    if (close) await element(by.id('add-to-chat-close')).tap();
  });

  it('sends a current-events prompt and reports whether a reply streams', async () => {
    const composer = await present(by.id('chat.composer.input'), SHORT);
    if (!composer) {
      record('chat send', 'BLOCKED', 'composer not available');
      return;
    }
    await element(by.id('chat.composer.input')).tap();
    await element(by.id('chat.composer.input')).typeText("What's the latest AI news today?");

    const send = await present(by.id('chat.composer.send'), SHORT);
    if (!send) {
      record('chat send', 'BLOCKED', 'send button never enabled after typing');
      return;
    }
    await element(by.id('chat.composer.send')).tap();

    const streaming = await present(by.id('chat.message.assistant.streaming'), LONG);
    record(
      'chat send',
      streaming ? 'REACHED' : 'BLOCKED',
      streaming
        ? 'assistant bubble began streaming'
        : 'no streaming bubble, check for a gate alert or missing local model',
    );

    if (streaming) {
      const perf = await present(by.id('performance-chip'), LONG);
      record(
        'performance chip',
        perf ? 'REACHED' : 'ABSENT',
        perf ? 'tok/s rendered' : 'no measured rate (expected for cloud replies)',
      );
    }
  });

  it('reports whether web search / tool activity surfaced in the turn', async () => {
    const toolTimeline = await present(by.text('Sources'), SHORT);
    const citation = await present(by.label('View full output'), 2000);
    record(
      'web search / tools',
      toolTimeline || citation ? 'REACHED' : 'ABSENT',
      `toolTimeline=${toolTimeline} citations=${citation} (both are Cloud-only paths)`,
    );
  });

  it('reports whether an artifact rendered in the transcript', async () => {
    const inline = await present(by.text('View'), SHORT);
    record(
      'artifact rendering',
      inline ? 'REACHED' : 'ABSENT',
      inline ? 'inline artifact card present' : 'no artifact produced by this turn',
    );
  });
});
