import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  parseInteractiveCardDelta,
  AGENT_EVENT_SCHEMA_VERSION,
} from '@agiworkforce/cloud-contracts';
import type { InteractiveCard } from '@agiworkforce/types';
import {
  buildInteractiveCardEl,
  buildBubbleWithTools,
  refreshAgentActivityClocks,
  resetReadAloud,
  openInteractiveCardUrl,
  resolveManagedArtifactUrl,
} from '../src/features/side-panel/bubbles';
import {
  applyCanonicalAgentEvent,
  reconcileManagedRunActivity,
  type SidePanelChatMessage,
} from '../src/features/side-panel/chat-state';

const catalog = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '_locales', 'en', 'messages.json'),
    'utf8',
  ),
) as Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

function getMessage(key: string, substitutions: string[] = []): string {
  const entry = catalog[key];
  if (!entry) return '';
  return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_match, name: string) =>
    (entry.placeholders?.[name.toLowerCase()]?.content ?? '').replace(
      /\$(\d)/g,
      (_digit, index: string) => substitutions[Number(index) - 1] ?? '',
    ),
  );
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(2000);
  (globalThis as { chrome?: unknown }).chrome = {
    i18n: { getMessage, getUILanguage: () => 'en' },
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
  };
});
afterEach(() => vi.restoreAllMocks());

function msg(overrides: Partial<SidePanelChatMessage> = {}): SidePanelChatMessage {
  return { id: 'm1', role: 'user', content: 'hello world', timestamp: 0, ...overrides };
}

function activity(
  status: NonNullable<SidePanelChatMessage['agentActivity']>['status'],
): NonNullable<SidePanelChatMessage['agentActivity']> {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    turnId: 'turn-1',
    lastSequence: 1,
    status,
    startedAtMs: 1_000,
    updatedAtMs: 2_000,
    ...(status === 'completed' || status === 'failed' || status === 'cancelled'
      ? { completedAtMs: 3_000 }
      : {}),
    entries: [],
  };
}

const MAP_CARD_ENVELOPE = {
  schemaVersion: 1,
  cardId: 'map-call-1',
  kind: 'map-search.v1',
  createdAt: '2026-08-13T10:00:00.000Z',
  fallback: {
    headline: 'Coffee near Austin',
    text: 'Map search: coffee shops near Austin, Texas',
  },
  producedBy: { toolCallId: 'map-call-1', toolName: 'search_maps' },
  body: {
    title: 'Coffee near Austin',
    query: 'coffee shops near Austin, Texas',
    actions: [
      {
        provider: 'google_maps',
        label: 'Open in Google Maps',
        url: 'https://www.google.com/maps/search/?api=1&query=coffee',
      },
      {
        provider: 'openstreetmap',
        label: 'Open in OpenStreetMap',
        url: 'https://www.openstreetmap.org/search?query=coffee',
      },
    ],
    view: { latitude: 30.2672, longitude: -97.7431, zoom: 12, attribution: 'OpenStreetMap' },
    places: [{ label: 'Austin', latitude: 30.2672, longitude: -97.7431, kind: 'city' }],
  },
};

function decodeCard(value: unknown): InteractiveCard {
  const card = parseInteractiveCardDelta({ card: value });
  if (!card) throw new Error('interactive-card fixture did not parse');
  return card;
}

function statusIcon(summary: Element | null): Element | null {
  return summary?.querySelector(':scope > .agi-icon:first-child') ?? null;
}

describe('side-panel buildBubbleWithTools (real render)', () => {
  it('renders a user message into a right-tagged bubble with its text', () => {
    const node = buildBubbleWithTools(msg({ role: 'user', content: 'hello world' }));
    expect(node.className).toContain('sp-msg-user');
    expect(node.getAttribute('data-id')).toBe('m1');
    expect(node.textContent).toContain('hello world');
  });

  it('renders an assistant message as an assistant bubble', () => {
    const node = buildBubbleWithTools(msg({ role: 'assistant', content: 'the answer is 42' }));
    expect(node.className).toContain('sp-msg-assistant');
    expect(node.textContent).toContain('the answer is 42');
  });

  it('renders a validated map card as bounded provider actions beside assistant prose', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const node = buildBubbleWithTools(
      msg({
        role: 'assistant',
        content: 'Here are the map results.',
        interactiveCards: [decodeCard(MAP_CARD_ENVELOPE)],
      }),
    );

    expect(node.querySelector('[data-card-kind="map-search.v1"]')).not.toBeNull();
    expect(node.textContent).toContain('coffee shops near Austin, Texas');
    expect(node.textContent).toContain('Austin');
    node.querySelector<HTMLButtonElement>('[aria-label="Open in Google Maps"]')?.click();
    expect(open).toHaveBeenCalledWith(
      'https://www.google.com/maps/search/?api=1&query=coffee',
      '_blank',
      'noopener,noreferrer',
    );
    open.mockRestore();
  });

  it('keeps an answerable unknown card visible and read-only without a dead action', () => {
    const unknown = structuredClone(MAP_CARD_ENVELOPE) as Record<string, unknown>;
    unknown['kind'] = 'weather.v2';
    unknown['interaction'] = {
      runId: '00000000-0000-4000-8000-000000000001',
      awaitingResponse: true,
      expiresAt: '2026-08-13T11:00:00.000Z',
      executionMode: 'cloud_managed',
    };
    const node = buildInteractiveCardEl(decodeCard(unknown));

    expect(node.dataset['cardRecognized']).toBe('false');
    expect(node.textContent).toContain('Map search: coffee shops near Austin, Texas');
    expect(node.textContent).toContain('read-only in Chrome');
    expect(node.querySelector('button')).toBeNull();
  });

  it('revalidates provider URLs in the host opener', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    openInteractiveCardUrl('https://example.test/collect');
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it.each([
    ['running', 'Working for 1s', 'img.agi-loading-mark', true],
    ['completed', 'Worked for 2s', 'path[d="m9 12 2 2 4-4"]', false],
    ['failed', 'Failed after 2s', 'path[d="m15 9-6 6"]', false],
    ['cancelled', 'Cancelled after 2s', 'path[d="m15 9-6 6"]', false],
    ['paused', 'Paused after 1s', 'polyline[points="12 6 12 12 16 14"]', false],
    ['awaiting-approval', 'Needs your approval · 1s', 'polyline[points="12 6 12 12 16 14"]', false],
  ] as const)(
    'renders the %s agent run with explicit copy and the correct status icon',
    (status, label, iconSelector, usesLoader) => {
      const node = buildBubbleWithTools(
        msg({ role: 'assistant', content: '', agentActivity: activity(status) }),
      );
      const summary = node.querySelector('.sp-agent-activity > summary');
      const icon = statusIcon(summary);

      expect(summary?.textContent).toContain(label);
      expect(icon?.querySelector(iconSelector)).not.toBeNull();
      expect(icon?.querySelector('img.agi-loading-mark') !== null).toBe(usesLoader);
    },
  );

  it('keeps one rotating brand mark beside a live clock without rebuilding the indicator', () => {
    vi.mocked(Date.now).mockReturnValue(7000);
    const node = buildBubbleWithTools(
      msg({
        role: 'assistant',
        streaming: true,
        agentActivity: activity('running'),
      }),
    );
    const summary = node.querySelector('.sp-agent-activity > summary');
    const mark = summary?.querySelector('img.agi-loading-mark');
    expect(summary?.textContent).toContain('Working for 6s');
    expect(node.querySelectorAll('img.agi-loading-mark')).toHaveLength(1);
    expect(node.querySelector('.sp-thinking-mark')).toBeNull();
    refreshAgentActivityClocks(node, 10000);
    expect(summary?.textContent).toContain('Working for 9s');
    expect(summary?.querySelector('img.agi-loading-mark')).toBe(mark);
  });

  it('does not animate a completed download just because its name contains load', () => {
    const done = activity('completed');
    done.entries.push({
      kind: 'tool',
      id: 'download',
      toolCallId: 'download-1',
      name: 'download',
      category: 'computer-use',
      summary: 'Downloaded file',
      status: 'completed',
      startedAtMs: 1000,
      completedAtMs: 2000,
    });
    const node = buildBubbleWithTools(msg({ role: 'assistant', agentActivity: done }));
    expect(node.querySelector('.agi-loading-mark')).toBeNull();
  });

  it('keeps the same message clock when another tool round starts a new activity turn', () => {
    vi.mocked(Date.now).mockReturnValue(8000);
    const nextRound = { ...activity('running'), startedAtMs: 6000, updatedAtMs: 7000 };
    const message = msg({
      role: 'assistant',
      timestamp: 1000,
      streaming: true,
      agentActivity: nextRound,
    });
    const node = buildBubbleWithTools(message);
    expect(node.querySelector('summary')?.textContent).toContain('Working for 7s');
    refreshAgentActivityClocks(node, 9000);
    expect(node.querySelector('summary')?.textContent).toContain('Working for 8s');
    const finished = buildBubbleWithTools({
      ...message,
      streaming: false,
      agentActivity: { ...nextRound, status: 'completed', completedAtMs: 10000 },
    });
    expect(finished.querySelector('summary')?.textContent).toContain('Worked for 9s');
    expect(finished.querySelector('.agi-loading-mark')).toBeNull();
    const synchronized = buildBubbleWithTools({
      ...message,
      timestamp: 11000,
      streaming: false,
      agentEvents: [
        {
          schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
          sessionId: 'session-1',
          turnId: 'round-1',
          sequence: 0,
          emittedAtMs: 1000,
          event: { type: 'lifecycle', phase: 'started' },
        },
      ],
      agentActivity: { ...nextRound, status: 'completed', completedAtMs: 10000 },
    });
    expect(synchronized.querySelector('summary')?.textContent).toContain('Worked for 9s');
  });

  it('renders a generated artifact as an authenticated AGI open/download action', () => {
    const messages: SidePanelChatMessage[] = [];
    const assistant = applyCanonicalAgentEvent(messages, 'stream-1', {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      sessionId: 'session-1',
      turnId: 'turn-1',
      sequence: 1,
      emittedAtMs: 1_000,
      event: {
        type: 'artifact-produced',
        artifactId: 'artifact-1',
        name: 'report.pdf',
        mimeType: 'application/pdf',
        uri: '/api/files/asset-1',
      },
    });

    const node = buildBubbleWithTools(assistant);
    const link = node.querySelector<HTMLAnchorElement>('.sp-agent-artifact-link');
    expect(link?.textContent).toContain('Open or download');
    expect(link?.href).toBe('https://agiworkforce.com/api/files/asset-1');
  });

  it('renders an honest unavailable state for a non-web artifact URI', () => {
    const messages: SidePanelChatMessage[] = [];
    const assistant = applyCanonicalAgentEvent(messages, 'stream-2', {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      sessionId: 'session-1',
      turnId: 'turn-2',
      sequence: 1,
      emittedAtMs: 1_000,
      event: {
        type: 'artifact-produced',
        artifactId: 'artifact-2',
        name: 'draft.txt',
        mimeType: 'text/plain',
        uri: 'managed://files/draft.txt',
      },
    });

    const node = buildBubbleWithTools(assistant);
    expect(node.querySelector('.sp-agent-artifact-link')).toBeNull();
    expect(node.textContent).toContain('Download unavailable in Chrome');
  });

  it('opens the activity block and asks for approval when a paused run holds a waiting tool', () => {
    const messages: SidePanelChatMessage[] = [];
    const assistant = applyCanonicalAgentEvent(messages, 'stream-4', {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      sessionId: 'session-1',
      turnId: 'turn-4',
      sequence: 1,
      emittedAtMs: 1_000,
      event: {
        type: 'approval-requested',
        approvalId: 'approval-2',
        toolCallId: 'call-2',
        name: 'read_page',
        category: 'browser',
        summary: 'Read the current page',
        input: {},
        riskLevel: 'low',
      },
    });
    assistant.agentActivity!.status = 'paused';

    const node = buildBubbleWithTools(assistant, { onResolveApproval: vi.fn() });
    const details = node.querySelector<HTMLDetailsElement>('details.sp-agent-activity');

    expect(details?.open).toBe(true);
    expect(details?.querySelector('summary')?.textContent).toContain('Needs your approval');
    expect(
      node.querySelector<HTMLDetailsElement>('details.sp-agent-step--awaiting-approval')?.open,
    ).toBe(true);
    expect(node.querySelector('[aria-label="Approve read_page"]')).not.toBeNull();
  });

  it('renders actionable approve and decline controls for a managed tool boundary', () => {
    const messages: SidePanelChatMessage[] = [];
    const assistant = applyCanonicalAgentEvent(messages, 'stream-3', {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      sessionId: 'session-1',
      turnId: 'turn-3',
      sequence: 1,
      emittedAtMs: 1_000,
      event: {
        type: 'approval-requested',
        approvalId: 'approval-1',
        toolCallId: 'call-1',
        name: 'create_calendar_event',
        category: 'connector',
        summary: 'Create a calendar event',
        input: { title: 'Demo' },
        riskLevel: 'medium',
      },
    });
    const resolve = vi.fn();

    buildBubbleWithTools(assistant, { onResolveApproval: resolve })
      .querySelector<HTMLButtonElement>('[aria-label="Approve create_calendar_event"]')
      ?.click();
    buildBubbleWithTools(assistant, { onResolveApproval: resolve })
      .querySelector<HTMLButtonElement>('[aria-label="Decline create_calendar_event"]')
      ?.click();

    expect(resolve).toHaveBeenNthCalledWith(1, 'call-1', 'approved');
    expect(resolve).toHaveBeenNthCalledWith(2, 'call-1', 'rejected');
  });
});

describe('resolveManagedArtifactUrl', () => {
  it.each(['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000'])(
    'resolves generated files against the configured development origin %s',
    (origin) => {
      expect(resolveManagedArtifactUrl('/api/files/fixture-asset', origin)).toBe(
        `${origin}/api/files/fixture-asset`,
      );
      expect(resolveManagedArtifactUrl(`${origin}/api/files/fixture-asset`, origin)).toBe(
        `${origin}/api/files/fixture-asset`,
      );
    },
  );

  it.each([
    'http://localhost:3001/api/files/fixture-asset',
    'http://127.0.0.1:3000/api/files/fixture-asset',
    'http://downloads.example.com/report.mp4',
    'http://localhost.example.com/report.mp4',
    '//downloads.example.com/report.mp4',
  ])('refuses HTTP payloads outside the configured origin: %s', (uri) => {
    expect(resolveManagedArtifactUrl(uri, 'http://localhost:3000')).toBeNull();
  });

  it('does not admit an untrusted configured HTTP gateway', () => {
    expect(
      resolveManagedArtifactUrl('/api/files/fixture-asset', 'http://downloads.example.com'),
    ).toBeNull();
  });

  it('allows HTTPS payload URLs and rejects non-web schemes', () => {
    expect(resolveManagedArtifactUrl('https://downloads.example.com/report.pdf')).toBe(
      'https://downloads.example.com/report.pdf',
    );
    expect(resolveManagedArtifactUrl('javascript:alert(1)')).toBeNull();
    expect(resolveManagedArtifactUrl('http://downloads.example.com/report.pdf')).toBeNull();
  });
});

describe('interrupted reply (reload mid-stream)', () => {
  it('shows the shared "Cancelled" state and a Retry control, not a dead streaming cursor', () => {
    const node = buildBubbleWithTools(
      msg({ role: 'assistant', content: 'partial answer captured before', interrupted: true }),
      { onRetry: vi.fn() },
    );
    expect(node.textContent).toContain('partial answer captured before');
    expect(node.textContent).toContain('Cancelled');
    expect(node.querySelector('.sp-bubble-retry-btn')).not.toBeNull();
    expect(node.querySelector('.sp-bubble')?.className).not.toContain('sp-cursor');
  });

  it('still renders the Cancelled state and Retry with no captured text at all', () => {
    const node = buildBubbleWithTools(msg({ role: 'assistant', content: '', interrupted: true }), {
      onRetry: vi.fn(),
    });
    expect(node.textContent).toContain('Cancelled');
    expect(node.querySelector('.sp-bubble-retry-btn')).not.toBeNull();
  });

  it('never shows the interrupted footer for an ordinary finished reply', () => {
    const node = buildBubbleWithTools(msg({ role: 'assistant', content: 'a normal answer' }));
    expect(node.querySelector('.sp-bubble-interrupted-footer')).toBeNull();
  });

  it('never shows the interrupted footer for a live, still-streaming reply', () => {
    const node = buildBubbleWithTools(
      msg({ role: 'assistant', content: 'typing...', streaming: true }),
    );
    expect(node.querySelector('.sp-bubble-interrupted-footer')).toBeNull();
    expect(node.querySelector('.sp-bubble')?.className).not.toContain('sp-cursor');
  });

  it('retries an interrupted reply the same way a failed one retries', () => {
    const onRetry = vi.fn();
    const node = buildBubbleWithTools(
      msg({ id: 'stream-9', role: 'assistant', content: '', interrupted: true }),
      { onRetry },
    );
    node.querySelector<HTMLButtonElement>('.sp-bubble-retry-btn')?.click();
    expect(onRetry).toHaveBeenCalledWith('stream-9');
  });
});

describe('in-chat browser turns and read aloud', () => {
  it('renders cloud and browser work as one completed timeline after the cloud turn ends', () => {
    const browserActivity = activity('running');
    browserActivity.entries.push({
      kind: 'tool',
      id: 'browser-read',
      toolCallId: 'read-1',
      name: 'browser_read_page',
      category: 'computer-use',
      summary: 'Read page',
      status: 'completed',
      startedAtMs: 1_500,
      completedAtMs: 2_000,
    });
    const agentActivity = activity('completed');
    agentActivity.entries.push({
      kind: 'progress',
      id: 'cloud-progress',
      progressId: 'work',
      summary: 'Prepare answer',
      status: 'completed',
      startedAtMs: 1_000,
      completedAtMs: 3_000,
    });
    const assistant = msg({
      role: 'assistant',
      content: 'Read the form.',
      browserActivity,
      agentActivity,
      cloudAgentRun: {
        runId: 'run-1',
        runPath: '/runs/run-1',
        lastSequence: 4,
        state: 'completed',
      },
    });
    reconcileManagedRunActivity(assistant, 3_000);
    const node = buildBubbleWithTools(assistant);
    expect(node.querySelectorAll('.sp-agent-activity')).toHaveLength(1);
    expect(node.querySelector('.sp-agent-activity > summary')?.textContent).toContain(
      'Worked for 2s',
    );
    expect(node.querySelector('.sp-agent-activity > summary')?.textContent).not.toContain(
      'Working',
    );
    expect(node.textContent).toContain('Read page');
    expect(node.textContent).toContain('Prepare answer');
    expect(node.querySelectorAll('.sp-agent-step')).toHaveLength(2);
    expect(node.querySelector('.sp-agent-activity')?.getAttribute('data-status')).toBe('completed');
  });

  it('renders the browser activity and its live controls inside the assistant turn', () => {
    const controls = document.createElement('div');
    controls.className = 'sp-browser-turn';
    const el = buildBubbleWithTools(
      msg({
        role: 'assistant',
        content: 'Filled the form.',
        browserActivity: activity('completed'),
      }),
      { browserControls: controls },
    );
    const groups = el.querySelectorAll('.sp-agent-activity');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.querySelector('summary')?.textContent).toContain('Worked for');
    expect(el.contains(controls)).toBe(true);
    expect(groups[0]!.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('reads a finished answer aloud with the browser voice and stops on a second press', async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel, getVoices: () => [] });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        rate = 1;
        constructor(readonly text: string) {}
      },
    );
    (globalThis as { chrome?: unknown }).chrome = {
      i18n: { getMessage, getUILanguage: () => 'en' },
      storage: { local: { get: vi.fn(async () => ({})) } },
    };
    try {
      const el = buildBubbleWithTools(msg({ role: 'assistant', content: 'The answer is 42.' }));
      const button = el.querySelector<HTMLButtonElement>('.sp-read-aloud-btn');
      expect(button?.getAttribute('aria-label')).toBe('Read aloud');
      button!.click();
      await vi.waitFor(() => expect(speak).toHaveBeenCalledOnce());
      expect((speak.mock.calls[0]![0] as { text: string }).text).toBe('The answer is 42.');
      expect(button!.getAttribute('aria-pressed')).toBe('true');
      button!.click();
      expect(cancel).toHaveBeenCalled();
      expect(button!.getAttribute('aria-label')).toBe('Read aloud');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps a restarted reading owned when the previous playback ends late', async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel, getVoices: () => [] });
    vi.stubGlobal('SpeechSynthesisUtterance', class {});
    (globalThis as { chrome?: unknown }).chrome = {
      i18n: { getMessage, getUILanguage: () => 'en' },
      storage: { local: { get: vi.fn(async () => ({})) } },
    };
    try {
      const bubble = buildBubbleWithTools(msg({ role: 'assistant', content: 'Read this answer.' }));
      const button = bubble.querySelector<HTMLButtonElement>('.sp-read-aloud-btn')!;
      button.click();
      await vi.waitFor(() => expect(speak).toHaveBeenCalledOnce());
      const previous = speak.mock.calls[0]![0] as { onerror: () => void };
      button.click();
      button.click();
      await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
      previous.onerror();
      expect(button.getAttribute('aria-pressed')).toBe('true');
      cancel.mockClear();
      resetReadAloud();
      expect(cancel).toHaveBeenCalledOnce();
      expect(button.getAttribute('aria-pressed')).toBe('false');
    } finally {
      resetReadAloud();
      vi.unstubAllGlobals();
    }
  });

  it('does not start pending read aloud after the conversation is reset', async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    let finish!: (stored: Record<string, unknown>) => void;
    vi.stubGlobal('speechSynthesis', { speak, cancel, getVoices: () => [] });
    vi.stubGlobal('SpeechSynthesisUtterance', class {});
    (globalThis as { chrome?: unknown }).chrome = {
      i18n: { getMessage, getUILanguage: () => 'en' },
      storage: { local: { get: vi.fn(() => new Promise((resolve) => (finish = resolve))) } },
    };
    try {
      const bubble = buildBubbleWithTools(msg({ role: 'assistant', content: 'Retired text' }));
      const button = bubble.querySelector<HTMLButtonElement>('.sp-read-aloud-btn')!;
      button.click();
      expect(finish).toBeDefined();
      resetReadAloud();
      finish({});
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(speak).not.toHaveBeenCalled();
      expect(button.getAttribute('aria-pressed')).toBe('false');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('offers no read aloud on a failed answer or where the browser has no voice', () => {
    expect(
      buildBubbleWithTools(msg({ role: 'assistant', content: 'x', error: true })).querySelector(
        '.sp-read-aloud-btn',
      ),
    ).toBeNull();
    expect(
      buildBubbleWithTools(msg({ role: 'assistant', content: 'x' })).querySelector(
        '.sp-read-aloud-btn',
      ),
    ).toBeNull();
  });
});
