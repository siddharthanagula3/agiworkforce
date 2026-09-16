import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { signIn } from './qa-capability-harness';

const WAV = process.env['AGI_LIVE_VOICE_WAV'] ?? '';
const OUT = process.env['AGI_LIVE_VOICE_OUT'] ?? '';
const LOOP = process.env['AGI_LIVE_VOICE_LOOP'] === '1';
const LISTEN_MS = Number(process.env['AGI_LIVE_VOICE_LISTEN_MS'] ?? 30_000);
const SESSIONS_PATH = '/api/voice/live/sessions';

// llm-guardrail-allow: a real gpt-live-1 session bills the provider account, so the probe runs only when authorized.
test.skip(
  process.env['RUN_LIVE_MEDIA_E2E'] !== '1' || !WAV || !OUT,
  'Set RUN_LIVE_MEDIA_E2E=1, AGI_LIVE_VOICE_WAV and AGI_LIVE_VOICE_OUT to authorize the billed live probe.',
);

test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${WAV}${LOOP ? '' : '%noloop'}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
  permissions: ['microphone'],
});

interface LiveTap {
  events: Array<{ t: number; type: string; delta?: string; reason?: string; seconds?: number }>;
  sent: Array<{ t: number; type: string }>;
  states: Array<{ t: number; state: string }>;
  tracks: Array<{ t: number; kind: string }>;
  channel: string | null;
  peers: number;
  micEnabled: boolean[] | null;
  micStates: string[] | null;
  peerState: string | null;
}

const TAP = `
window.__live = { events: [], sent: [], states: [], tracks: [], channel: null, peers: 0, mic: null, pc: null };
const Orig = window.RTCPeerConnection;
function Tapped(...args) {
  const pc = new Orig(...args);
  window.__live.peers += 1;
  window.__live.pc = pc;
  pc.addEventListener('connectionstatechange', () =>
    window.__live.states.push({ t: Date.now(), state: pc.connectionState }));
  pc.addEventListener('track', (e) =>
    window.__live.tracks.push({ t: Date.now(), kind: e.track.kind }));
  const createDataChannel = pc.createDataChannel.bind(pc);
  pc.createDataChannel = (label, ...rest) => {
    const channel = createDataChannel(label, ...rest);
    window.__live.channel = label;
    channel.addEventListener('message', (m) => {
      try {
        const ev = JSON.parse(m.data);
        window.__live.events.push({ t: Date.now(), type: ev.type, delta: ev.delta, reason: ev.reason, seconds: ev.usage && ev.usage.seconds });
      } catch (error) {
        window.__live.events.push({ t: Date.now(), type: 'unparsed', reason: String(error) });
      }
    });
    const send = channel.send.bind(channel);
    channel.send = (data) => {
      try { window.__live.sent.push({ t: Date.now(), type: JSON.parse(data).type }); } catch (error) { window.__live.sent.push({ t: Date.now(), type: 'unparsed:' + String(error) }); }
      return send(data);
    };
    return channel;
  };
  const close = pc.close.bind(pc);
  pc.close = () => { window.__live.states.push({ t: Date.now(), state: 'close()' }); return close(); };
  return pc;
}
Tapped.prototype = Orig.prototype;
window.RTCPeerConnection = Tapped;
const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = async (constraints) => {
  const stream = await getUserMedia(constraints);
  window.__live.mic = stream;
  return stream;
};
`;

async function readTap(page: Page): Promise<LiveTap> {
  return page.evaluate(() => {
    const live = (
      window as unknown as {
        __live: LiveTap & { mic: MediaStream | null; pc: RTCPeerConnection | null };
      }
    ).__live;
    return {
      events: live.events,
      sent: live.sent,
      states: live.states,
      tracks: live.tracks,
      channel: live.channel,
      peers: live.peers,
      micEnabled: live.mic ? live.mic.getAudioTracks().map((track) => track.enabled) : null,
      micStates: live.mic ? live.mic.getAudioTracks().map((track) => track.readyState) : null,
      peerState: live.pc ? live.pc.connectionState : null,
    };
  });
}

async function waitForEvent(page: Page, type: string, timeout: number): Promise<boolean> {
  return page
    .waitForFunction(
      (wanted) =>
        (window as unknown as { __live: LiveTap }).__live.events.some(
          (event) => event.type === wanted,
        ),
      type,
      { timeout },
    )
    .then(() => true)
    .catch(() => false);
}

async function startSession(page: Page, label: string, log: Record<string, unknown>) {
  const created = page.waitForResponse(
    (response) =>
      response.url().includes(SESSIONS_PATH) &&
      !response.url().includes('/close') &&
      response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  const startedAt = Date.now();
  await page.getByTestId('voice-entry-button').click();
  const response = await created;
  const body = (await response.json().catch(() => ({}))) as {
    sessionId?: string;
    sdp?: string;
    settlement?: { ceilingSeconds?: number; estimatedCostCents?: number };
    error?: unknown;
  };
  const started = await waitForEvent(page, 'session.started', 20_000);
  log[label] = {
    status: response.status(),
    sessionId: body.sessionId ?? null,
    answerSdpBytes: body.sdp?.length ?? 0,
    settlement: body.settlement ?? body.error ?? null,
    startedAfterMs: started ? Date.now() - startedAt : null,
  };
  expect(response.status(), JSON.stringify(body.error ?? {})).toBe(201);
  expect(started, 'session.started arrived on oai-events').toBe(true);
  await expect(page.getByTestId('voice-mode-surface')).toBeVisible();
}

test('gpt-live session over WebRTC: start, transcripts, mute, close, restart', async ({ page }) => {
  test.setTimeout(480_000);
  const log: Record<string, unknown> = { loop: LOOP, listenMs: LISTEN_MS };
  const browser: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      browser.push(`${message.type()}: ${message.text().slice(0, 300)}`);
    }
  });
  page.on('requestfailed', (request) => {
    browser.push(
      `requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/api/')) {
      browser.push(`http ${response.status()}: ${response.request().method()} ${response.url()}`);
    }
  });
  const persist = async (): Promise<void> => {
    log['browser'] = browser;
    log['tapAtExit'] = await readTap(page).catch(() => null);
    fs.writeFileSync(`${OUT}/live-probe.json`, JSON.stringify(log, null, 2));
  };
  await page.addInitScript(TAP);
  try {
    await signIn(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('voice-entry-button')).toBeVisible({ timeout: 30_000 });

    await startSession(page, 'first', log);
    await page.screenshot({ path: `${OUT}/01-connected.png` });

    await waitForEvent(page, 'session.input_transcript.delta', LISTEN_MS);
    await waitForEvent(page, 'session.output_transcript.delta', LISTEN_MS);
    await page.waitForTimeout(Math.min(LISTEN_MS, 15_000));
    await page.screenshot({ path: `${OUT}/02-conversing.png` });
    const during = await readTap(page);
    const panel = await page
      .getByTestId('voice-activity-panel')
      .innerText()
      .catch(() => '');
    log['duringFirst'] = {
      channel: during.channel,
      peers: during.peers,
      peerState: during.peerState,
      remoteTracks: during.tracks,
      states: during.states,
      eventTypes: Object.entries(
        during.events.reduce<Record<string, number>>((acc, event) => {
          acc[event.type] = (acc[event.type] ?? 0) + 1;
          return acc;
        }, {}),
      ),
      userTranscript: during.events
        .filter((event) => event.type === 'session.input_transcript.delta')
        .map((event) => event.delta)
        .join(''),
      assistantTranscript: during.events
        .filter((event) => event.type === 'session.output_transcript.delta')
        .map((event) => event.delta)
        .join(''),
      firstUserDeltaAtMs:
        during.events.find((e) => e.type === 'session.input_transcript.delta')?.t ?? null,
      firstAssistantDeltaAtMs:
        during.events.find((e) => e.type === 'session.output_transcript.delta')?.t ?? null,
      lastUserDeltaAtMs:
        [...during.events].reverse().find((e) => e.type === 'session.input_transcript.delta')?.t ??
        null,
      panelText: panel,
    };

    await page.getByTestId('voice-mute-toggle').click();
    await page.waitForTimeout(800);
    const muted = await readTap(page);
    await page.screenshot({ path: `${OUT}/03-muted.png` });
    await page.getByTestId('voice-mute-toggle').click();
    await page.waitForTimeout(800);
    const unmuted = await readTap(page);
    log['mute'] = {
      sentWhileMuted: muted.sent.map((event) => event.type),
      micEnabledMuted: muted.micEnabled,
      micEnabledUnmuted: unmuted.micEnabled,
      sentAfterUnmute: unmuted.sent.map((event) => event.type),
    };

    const settle = page.waitForRequest(
      (request) => request.url().includes(`${SESSIONS_PATH}/`) && request.url().endsWith('/close'),
      { timeout: 15_000 },
    );
    await page.getByTestId('voice-exit-button').click();
    const closed = await waitForEvent(page, 'session.closed', 8_000);
    const settleRequest = await settle.catch(() => null);
    await page.waitForTimeout(1_000);
    const after = await readTap(page);
    await page.screenshot({ path: `${OUT}/04-closed.png` });
    log['close'] = {
      closedEventArrived: closed,
      closeSent: after.sent.some((event) => event.type === 'session.close'),
      settlePosted: settleRequest ? settleRequest.postDataJSON() : null,
      micStates: after.micStates,
      peerState: after.peerState,
      states: after.states,
      surfaceGone: !(await page
        .getByTestId('voice-mode-surface')
        .isVisible()
        .catch(() => false)),
      closedEvent: after.events.find((event) => event.type === 'session.closed') ?? null,
    };

    await startSession(page, 'second', log);
    await page.waitForTimeout(3_000);
    await page.getByTestId('voice-exit-button').click();
    await waitForEvent(page, 'session.closed', 8_000);
    await page.waitForTimeout(1_000);
    const end = await readTap(page);
    log['secondClose'] = { peers: end.peers, micStates: end.micStates, peerState: end.peerState };
  } finally {
    await persist();
  }
});
