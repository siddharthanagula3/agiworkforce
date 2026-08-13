import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { closeAnySettingsDialog } from '../support/close-settings';
import { enterLocalDesktopShell, waitForDesktopShell } from '../support/desktop-shell';
import { resolveScreenDir } from '../support/dom';

const SCREEN_DIR = resolveScreenDir('local-zero-egress');

type SocketObservation = {
  command: string;
  pid: string;
  protocol: 'TCP' | 'UDP';
  remote: string;
  state?: string;
};

type SocketSample = {
  capturedAt: string;
  observations: SocketObservation[];
};

/**
 * Local Mode zero-egress regression signal, measured at the OS socket level.
 *
 * The frontend egress guard is not sufficient evidence because native code can
 * bypass it. This spec therefore observes the native app and its descendants
 * continuously while a real Ollama turn runs. It covers connected TCP and UDP
 * destinations visible to `lsof`; it is deliberately described as a regression
 * signal rather than universal packet-capture proof.
 *
 * Startup/updater traffic is outside this turn-level contract. The baseline is
 * captured only after the shell, Local boundary, model, and composer settle.
 */

function appProcessRows(): Array<{ command: string; pid: string }> {
  let output = '';
  try {
    output = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' });
  } catch {
    return [];
  }

  const rows = output
    .split('\n')
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      return match ? { pid: match[1], ppid: match[2], command: match[3] } : null;
    })
    .filter((row): row is { command: string; pid: string; ppid: string } => Boolean(row));

  const included = new Set(
    rows
      .filter((row) => /(?:^|\/)agiworkforce-desktop(?:\s|$)/.test(row.command))
      .map((row) => row.pid),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (included.has(row.ppid) && !included.has(row.pid)) {
        included.add(row.pid);
        changed = true;
      }
    }
  }

  return rows.filter((row) => included.has(row.pid)).map(({ pid, command }) => ({ pid, command }));
}

function isLoopbackEndpoint(endpoint: string): boolean {
  const host = endpoint
    .replace(/:\d+$/, '')
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
  return (
    host === 'localhost' ||
    host === '::1' ||
    host.startsWith('127.') ||
    host.startsWith('::ffff:127.')
  );
}

function connectedNonLoopbackSockets(): SocketObservation[] {
  const observations: SocketObservation[] = [];
  for (const process of appProcessRows()) {
    let output = '';
    try {
      output = execFileSync('lsof', ['-a', '-p', process.pid, '-i', '-n', '-P'], {
        encoding: 'utf8',
      });
    } catch {
      // lsof exits non-zero when the process has no network sockets.
      continue;
    }

    for (const line of output.split('\n').slice(1)) {
      const protocol = line.match(/\b(TCP|UDP)\b/)?.[1] as 'TCP' | 'UDP' | undefined;
      const remote = line.match(/->\s*([^\s]+?)(?:\s+\(([^)]+)\))?$/)?.[1];
      const state = line.match(/\(([^)]+)\)$/)?.[1];
      if (!protocol || !remote || isLoopbackEndpoint(remote)) continue;
      observations.push({
        command: process.command,
        pid: process.pid,
        protocol,
        remote,
        ...(state ? { state } : {}),
      });
    }
  }
  return observations;
}

function socketKey(observation: SocketObservation): string {
  return `${observation.protocol}:${observation.remote}`;
}

function startSocketMonitor(intervalMs = 100): {
  samples: SocketSample[];
  stop: () => void;
} {
  const samples: SocketSample[] = [];
  const capture = () => {
    samples.push({
      capturedAt: new Date().toISOString(),
      observations: connectedNonLoopbackSockets(),
    });
  };
  capture();
  const timer = setInterval(capture, intervalMs);
  return { samples, stop: () => clearInterval(timer) };
}

describe('Local Mode zero-egress (OS socket evidence)', () => {
  it('adds no non-loopback connection during a successful plain Local chat turn', async function () {
    this.timeout(300_000);

    const expectedModel = process.env['AGI_WDIO_OLLAMA_MODEL_ID'];
    if (!expectedModel) {
      throw new Error('AGI_WDIO_OLLAMA_MODEL_ID must name a real installed Ollama model');
    }

    await waitForDesktopShell();
    expect(await closeAnySettingsDialog()).toBe(true);
    await enterLocalDesktopShell();

    const clickElement = async (element: WebdriverIO.Element) => {
      await element.waitForExist({ timeout: 15_000 });
      await element.scrollIntoView({ block: 'center' });
      await element.waitForDisplayed({ timeout: 15_000 });
      await element.click();
    };

    const expandSidebar = await $('button[aria-label="Expand sidebar"]');
    if ((await expandSidebar.isExisting()) && (await expandSidebar.isDisplayed())) {
      await clickElement(expandSidebar);
    }

    const localTab = await $('button=Local');
    await clickElement(localTab);
    expect(await localTab.getAttribute('role')).toBe('tab');
    expect(await localTab.getAttribute('aria-selected')).toBe('true');

    await clickElement(await $('button=New chat'));
    await clickElement(await $('button[aria-label="Select model"]'));
    const modelOption = await $(`button*=${expectedModel}`);
    await modelOption.waitForExist({ timeout: 45_000 });
    await clickElement(modelOption);
    await browser.waitUntil(
      async () => (await $('button[aria-label="Select model"]').getText()).includes(expectedModel),
      {
        timeout: 10_000,
        interval: 100,
        timeoutMsg: `Desktop did not retain the explicit Local model selection: ${expectedModel}`,
      },
    );

    // A plain Local turn must not inherit the one-turn network grant.
    const plus = await $('button[aria-label="Add attachment"]');
    await clickElement(plus);
    const searchToggle = await $('button=Search the web');
    await searchToggle.waitForDisplayed({ timeout: 5_000 });
    expect(await searchToggle.getAttribute('aria-pressed')).toBe('false');
    await browser.keys('Escape');

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 20_000 });
    const expectedResponse = 'OK';
    await composer.setValue('Reply with exactly OK and nothing else.');
    await browser.saveScreenshot(`${SCREEN_DIR}/01-local-ready-no-network-grant.png`);

    const assistantCountBeforeSend = (await $$('[data-role="assistant"]')).length;
    const baseline = connectedNonLoopbackSockets();
    const baselineKeys = new Set(baseline.map(socketKey));
    const monitor = startSocketMonitor();
    let completed = false;

    try {
      await clickElement(await $('button[aria-label="Send message (Enter)"]'));
      await browser.waitUntil(
        async () => {
          const assistantMessages = await $$('[data-role="assistant"]');
          for (const message of assistantMessages.slice(assistantCountBeforeSend)) {
            if ((await message.getText()).trim() === expectedResponse) return true;
          }
          return false;
        },
        {
          timeout: 180_000,
          interval: 250,
          timeoutMsg: 'The real Local Ollama turn did not produce the required assistant response',
        },
      );
      await browser.waitUntil(
        async () => !(await $('button[aria-label="Stop the current response"]').isExisting()),
        {
          timeout: 30_000,
          interval: 100,
          timeoutMsg: 'Local response text arrived but generation never returned to an idle state',
        },
      );
      completed = true;
    } finally {
      monitor.stop();
    }

    const final = connectedNonLoopbackSockets();
    const observedDuringTurn = monitor.samples.flatMap((sample) => sample.observations);
    const newExternalSockets = [...observedDuringTurn, ...final].filter(
      (observation) => !baselineKeys.has(socketKey(observation)),
    );
    const uniqueNewExternalSockets = [
      ...new Map(
        newExternalSockets.map((observation) => [socketKey(observation), observation]),
      ).values(),
    ];

    const visibleErrors = await $$('[data-testid="message-error"]');
    const evidence = {
      contract: 'plain Local chat turn creates no observed non-loopback TCP/UDP destination',
      limitation:
        'Continuous lsof sampling is a regression signal, not kernel-level packet capture proof.',
      expectedModel,
      expectedResponse,
      baseline,
      samples: monitor.samples,
      final,
      uniqueNewExternalSockets,
      completed,
    };
    writeFileSync(`${SCREEN_DIR}/socket-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
    await browser.saveScreenshot(`${SCREEN_DIR}/02-local-success-no-tool-activity.png`);

    expect(completed).toBe(true);
    expect(visibleErrors.length).toBe(0);
    expect(await $('section[aria-label="Agent activity"]').isExisting()).toBe(false);
    expect(uniqueNewExternalSockets).toEqual([]);
  });
});
