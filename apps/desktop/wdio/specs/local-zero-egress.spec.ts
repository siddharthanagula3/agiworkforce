import { execFileSync } from 'node:child_process';
import { waitForDesktopShell } from '../support/desktop-shell';

/**
 * Local Mode zero-egress invariant, measured at the OS socket level.
 *
 * AGENTS.md locks "Local conversations, files, and developer sessions never
 * sync or egress automatically". The frontend enforces this through
 * `egressGuard`, but a guard can be bypassed by native code, so this spec
 * watches the real process: it snapshots the app's established non-loopback
 * TCP connections, drives a full local chat turn against the local Ollama,
 * and fails if any NEW non-loopback connection appeared during the turn.
 *
 * The window deliberately starts after boot: a startup updater check is
 * governed separately and is not conversation egress. What must hold is that
 * SENDING A LOCAL CHAT adds no external destination.
 */

function establishedRemoteAddresses(): Set<string> {
  // Every process whose command matches the isolated harness binary,
  // including children (sidecars).
  let pids: string[];
  try {
    pids = execFileSync('pgrep', ['-f', 'agiworkforce-desktop'], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return new Set();
  }
  const remotes = new Set<string>();
  for (const pid of pids) {
    let out = '';
    try {
      out = execFileSync('lsof', ['-a', '-p', pid, '-iTCP', '-sTCP:ESTABLISHED', '-n', '-P'], {
        encoding: 'utf8',
      });
    } catch {
      // lsof exits non-zero when the pid has no matching sockets — that is
      // the healthy case here.
      continue;
    }
    for (const line of out.split('\n').slice(1)) {
      const match = line.match(/->\s*([^\s]+)\s+\(ESTABLISHED\)/);
      const remote = match?.[1];
      if (!remote) continue;
      if (
        remote.startsWith('127.') ||
        remote.startsWith('[::1]') ||
        remote.startsWith('localhost')
      ) {
        continue;
      }
      remotes.add(remote);
    }
  }
  return remotes;
}

describe('Local Mode zero-egress (OS socket evidence)', () => {
  it('adds no non-loopback connection during a local chat turn', async function () {
    this.timeout(300_000);

    await waitForDesktopShell();
    const useLocal = await $('button=Use Local Mode');
    if ((await useLocal.isExisting()) && (await useLocal.isDisplayed())) {
      await useLocal.click();
    }

    const newChatBtn = await $('button[title="New chat"]');
    await newChatBtn.waitForDisplayed({ timeout: 20_000 });
    await newChatBtn.click();
    await browser.pause(500);

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 20_000 });

    // Baseline AFTER the shell settled, immediately before the send.
    const before = establishedRemoteAddresses();

    await composer.click();
    await composer.addValue('Reply with the single word: pineapple');
    const sendBtn = await $('button[aria-label*="Send message ("]');
    await sendBtn.waitForDisplayed({ timeout: 5_000 });

    const preSendAssistants = await browser.execute(
      () => document.querySelectorAll('[data-role="assistant"]').length,
    );
    await sendBtn.click();

    // The turn is over when a NEW assistant bubble exists (or an honest error
    // card rendered — egress must hold in both outcomes).
    await browser.waitUntil(
      async () => {
        const counts = await browser.execute(() => ({
          assistants: document.querySelectorAll('[data-role="assistant"]').length,
          errors: document.querySelectorAll('[data-testid="message-error"]').length,
        }));
        return counts.assistants > preSendAssistants || counts.errors > 0;
      },
      { timeout: 180_000, interval: 1_000, timeoutMsg: 'local chat turn never completed' },
    );

    const after = establishedRemoteAddresses();
    const newRemotes = [...after].filter((remote) => !before.has(remote));
    expect(newRemotes).toEqual([]);
  });
});
