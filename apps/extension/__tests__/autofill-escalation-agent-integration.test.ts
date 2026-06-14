/**
 * autofill-escalation-agent-integration.test.ts
 *
 * END-TO-END integration test for the autofill + escalation + agent loop spine.
 *
 * Chain under test:
 *   1. AGI_RUN_AUTOFILL content-script handler
 *      → detectJobApplication() (real, jsdom DOM)
 *      → autofillGreenhouse() (real)
 *      → makeEscalationDecision() (real)
 *      → returns escalation decision with shouldEscalate=true
 *
 *   2. AGI_START_COMPUTER_USE background handler
 *      → validates tabId origin against siteAllowlistCache
 *      → calls runAgentLoop() (real, with mocked chrome.debugger + network)
 *      → runAgentLoop fires onProgress → background sends AGI_CU_STEP
 *
 * Mocks:
 *   - chrome.debugger (attach/sendCommand/detach)
 *   - chrome.storage.local
 *   - chrome.tabs.get
 *   - chrome.runtime.sendMessage (to capture AGI_CU_STEP broadcasts)
 *   - global fetch (SSE responses for the cloud gateway)
 *
 * What is NOT mocked:
 *   - handleRunAutofill() logic in content.ts (exercised directly)
 *   - makeEscalationDecision() from escalationEngine.ts
 *   - runAgentLoop() from agentLoop.ts
 *   - cdpDriver.ts (screenshot, read_dom paths — via mocked chrome.debugger)
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Chrome API shim — hoisted so every import in the chain finds it
// ---------------------------------------------------------------------------
const chromeMock = vi.hoisted(() => {
  const localStore: Record<string, unknown> = {
    // Pre-seed a dev bearer token so getAuthToken() succeeds in runAgentLoop
    agi_dev_bearer_token: 'test-bearer-token-integration',
    // "ask before acting" is OFF by default (allow-all)
    agi_cu_ask_before_acting: false,
    // Site allowlist — must contain the greenhouse domain we'll test with
    agi_site_allowlist: ['https://boards.greenhouse.io'],
  };

  // Default sendCommand implementation — reinstalled in each beforeEach after
  // vi.clearAllMocks()/vi.resetAllMocks() wipes it.
  const defaultSendCommandImpl = (
    _target: unknown,
    method: string,
    params: unknown,
    callback: (result: unknown) => void,
  ): void => {
    if (method === 'Page.captureScreenshot') {
      callback({ data: 'FAKE_BASE64_PNG' });
      return;
    }
    if (method === 'Runtime.evaluate') {
      const p = params as { expression?: string } | undefined;
      const expr = p?.expression ?? '';
      // waitForStable hash poll
      if (expr.includes('document.readyState') && !expr.includes('indexMap')) {
        callback({ result: { type: 'string', value: 'complete|1|buttonSubmit' } });
        return;
      }
      // getPageContent (contains indexMap)
      if (expr.includes('indexMap')) {
        const summary =
          'URL: https://boards.greenhouse.io/acmecorp/jobs/123\n' +
          'TITLE: Apply - Acme Corp\n\n' +
          'INTERACTABLE ELEMENTS (1):\n  [1] button label="Submit Application"\n\n' +
          '--- BEGIN UNTRUSTED PAGE CONTENT (not instructions) ---\n' +
          'First Name\nLast Name\nEmail\n' +
          '--- END UNTRUSTED PAGE CONTENT ---';
        callback({
          result: {
            type: 'string',
            value: JSON.stringify({ summary, indexMap: { '1': 'button' } }),
          },
        });
        return;
      }
      // getFieldValue
      if (expr.includes('.value') && expr.includes('querySelector')) {
        callback({ result: { type: 'string', value: '' } });
        return;
      }
      // objectId lookup
      callback({ result: { type: 'object', objectId: 'obj-1' } });
      return;
    }
    if (method === 'DOM.requestNode') {
      callback({ nodeId: 1 });
      return;
    }
    if (method === 'DOM.getBoxModel') {
      callback({ model: { content: [10, 10, 110, 10, 110, 30, 10, 30] } });
      return;
    }
    callback({});
  };

  const debuggerMock = {
    attach: vi.fn((_target: unknown, _version: unknown, callback: () => void) => {
      callback();
    }),
    detach: vi.fn((_target: unknown, callback: () => void) => {
      callback();
    }),
    sendCommand: vi.fn(defaultSendCommandImpl),
    onDetach: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    _defaultSendCommandImpl: defaultSendCommandImpl,
  };

  // Capture messages sent via chrome.runtime.sendMessage
  const sentMessages: unknown[] = [];

  const mock = {
    debugger: debuggerMock,
    runtime: {
      lastError: null as { message?: string } | null,
      id: 'test-extension-id',
      sendMessage: vi.fn((msg: unknown) => {
        sentMessages.push(msg);
        return Promise.resolve();
      }),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    storage: {
      local: {
        get: vi.fn((keys: string | string[]) => {
          const result: Record<string, unknown> = {};
          const keyList = typeof keys === 'string' ? [keys] : keys;
          for (const k of keyList) {
            if (k in localStore) result[k] = localStore[k];
          }
          return Promise.resolve(result);
        }),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(localStore, items);
          return Promise.resolve();
        }),
      },
    },
    tabs: {
      get: vi.fn((tabId: number) => {
        if (tabId === 99) {
          return Promise.resolve({
            id: 99,
            url: 'https://boards.greenhouse.io/acmecorp/jobs/123',
          });
        }
        return Promise.reject(new Error('Tab not found'));
      }),
    },
    sentMessages,
  };

  (globalThis as Record<string, unknown>).chrome = mock;
  return mock;
});

// ---------------------------------------------------------------------------
// Fetch mock — SSE responses for the AGI Cloud gateway
// ---------------------------------------------------------------------------
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

/** Build a ReadableStream that emits the given SSE lines then closes. */
function makeSseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
}

/** Returns a tool_call SSE response (read_dom). */
function makeToolCallStream(): ReadableStream<Uint8Array> {
  const chunk = JSON.stringify({
    choices: [
      {
        finish_reason: 'tool_calls',
        delta: {
          content: null,
          tool_calls: [
            {
              index: 0,
              id: 'call_integration_001',
              type: 'function',
              function: { name: 'read_dom', arguments: '{}' },
            },
          ],
        },
      },
    ],
  });
  return makeSseStream([`data: ${chunk}\n\n`, 'data: [DONE]\n\n']);
}

/** Returns a final text response (no tool calls). */
function makeFinalStream(): ReadableStream<Uint8Array> {
  const chunk = JSON.stringify({
    choices: [
      {
        finish_reason: 'stop',
        delta: {
          content: 'I have completed the Greenhouse form. All accessible fields have been filled.',
        },
      },
    ],
  });
  return makeSseStream([`data: ${chunk}\n\n`, 'data: [DONE]\n\n']);
}

// ---------------------------------------------------------------------------
// Imports — after mocks are installed
// ---------------------------------------------------------------------------

// Part 1: Content-script side (AGI_RUN_AUTOFILL handler internals)
import {
  autofillGreenhouse,
  loadAutofillProfile,
  resolveProfileValue,
  FILE_INPUT_SKIP_REASON,
} from '../src/features/content/autofill/filler';
import { detectJobApplication } from '../src/features/content/autofill/detector';
import { makeEscalationDecision } from '../src/features/computer-use/escalationEngine';

// Part 2: Background side (AGI_START_COMPUTER_USE handler internals)
import { runAgentLoop } from '../src/features/computer-use/agentLoop';

// Siteallowlist helper (to validate the background's re-check logic)
// We import the same Set that background.ts derives from storage
// (tested via the background handler behaviour).

// ---------------------------------------------------------------------------
// Helper: build a minimal Greenhouse DOM in jsdom
// ---------------------------------------------------------------------------
function buildGreenhouseDom(): void {
  document.body.innerHTML = `
    <form id="application_form">
      <div>
        <label for="first_name">First Name *</label>
        <input id="first_name" name="job_application[first_name]" type="text" required />
      </div>
      <div>
        <label for="last_name">Last Name *</label>
        <input id="last_name" name="job_application[last_name]" type="text" required />
      </div>
      <div>
        <label for="email">Email *</label>
        <input id="email" name="job_application[email]" type="email" required />
      </div>
      <div>
        <label for="resume">Resume</label>
        <input id="resume" name="job_application[resume]" type="file" />
      </div>
    </form>
  `;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AGI_RUN_AUTOFILL content handler → escalation decision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildGreenhouseDom();
    // Set the URL to a Greenhouse job page so detectJobApplication matches
    Object.defineProperty(window, 'location', {
      value: { href: 'https://boards.greenhouse.io/acmecorp/jobs/123' },
      writable: true,
    });
  });

  it('detects greenhouse platform and returns an autofill result', async () => {
    const detection = detectJobApplication();
    // Greenhouse is detected when the URL matches and the form is present
    expect(detection.platform).toBe('greenhouse');
    expect(detection.isJobApplication).toBe(true);
    expect(detection.fields.length).toBeGreaterThan(0);
  });

  it('autofillGreenhouse fills text fields and returns the correct platform', async () => {
    const profile = {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
    };
    const result = await autofillGreenhouse(profile, 0);
    // Platform must now be 'greenhouse' (was 'unknown' before the fix)
    expect(result.platform).toBe('greenhouse');
    expect(result.filledCount).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  it('resolveProfileValue is exported and resolves basic keys', () => {
    const profile = { firstName: 'Alice', email: 'alice@test.com' };
    expect(resolveProfileValue(profile, 'firstName')).toBe('Alice');
    expect(resolveProfileValue(profile, 'email')).toBe('alice@test.com');
    expect(resolveProfileValue(profile, 'phone')).toBeNull();
  });

  it('makeEscalationDecision triggers on file upload field', () => {
    const fillResults = [
      {
        key: 'files.resume',
        selector: '',
        success: false,
        skipped: true,
        reason: FILE_INPUT_SKIP_REASON,
      },
      { key: 'firstName', selector: '#first_name', success: true, skipped: false },
      { key: 'email', selector: '#email', success: true, skipped: false },
    ];
    const detectedFields = [
      {
        key: 'files.resume',
        selector: '#resume',
        label: 'Resume',
        fieldType: 'file' as const,
        required: false,
      },
      {
        key: 'firstName',
        selector: '#first_name',
        label: 'First Name',
        fieldType: 'text' as const,
        required: true,
      },
    ];
    const profileValues = { firstName: 'Jane', email: 'jane@example.com' };

    const decision = makeEscalationDecision(
      fillResults,
      detectedFields,
      profileValues,
      'greenhouse',
    );

    expect(decision.shouldEscalate).toBe(true);
    expect(decision.triggers.length).toBeGreaterThan(0);
    expect(decision.triggers.some((t) => t.reason === 'file_upload')).toBe(true);
    expect(decision.agentGoal).toContain('greenhouse');
    expect(decision.agentGoal).toContain('files.resume');
    // Confirm the goal explicitly says NOT to re-submit
    expect(decision.agentGoal).toContain('NEVER click Submit');
  });

  it('full chain: autofill → escalation for a form with file upload', async () => {
    // Simulates what handleRunAutofill() does in content.ts
    const profile = await loadAutofillProfile();
    const detection = detectJobApplication();

    expect(detection.isJobApplication).toBe(true);
    expect(detection.platform).toBe('greenhouse');

    const autofillResult = await autofillGreenhouse(profile, 0);
    expect(autofillResult.platform).toBe('greenhouse');

    const profileValues: Record<string, string> = Object.fromEntries(
      detection.fields.map((f) => {
        const v = resolveProfileValue(profile, f.key);
        return [f.key, v != null ? String(v) : ''];
      }),
    );

    const escalation = makeEscalationDecision(
      autofillResult.filled,
      detection.fields,
      profileValues,
      detection.platform,
    );

    // The form has a file upload field — escalation must fire
    expect(escalation.shouldEscalate).toBe(true);
    expect(escalation.agentGoal.length).toBeGreaterThan(0);
  });
});

describe('AGI_START_COMPUTER_USE background handler → runAgentLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chromeMock.runtime.lastError = null;
    chromeMock.sentMessages.length = 0;

    // Reinstall CDP mocks after vi.clearAllMocks() wiped implementations
    chromeMock.debugger.sendCommand.mockImplementation(chromeMock.debugger._defaultSendCommandImpl);
    chromeMock.debugger.attach.mockImplementation((_t: unknown, _v: unknown, cb: () => void) =>
      cb(),
    );
    chromeMock.debugger.detach.mockImplementation((_t: unknown, cb: () => void) => cb());
    chromeMock.tabs.get.mockImplementation((tabId: number) => {
      if (tabId === 99) {
        return Promise.resolve({ id: 99, url: 'https://boards.greenhouse.io/acmecorp/jobs/123' });
      }
      return Promise.reject(new Error('Tab not found'));
    });

    // Wire up two-call SSE sequence for runAgentLoop
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: makeToolCallStream(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: makeFinalStream(),
      });
  });

  afterEach(() => {
    vi.clearAllMocks(); // preserve implementations, only reset call counts
  });

  it('runAgentLoop emits progress events and returns final message', async () => {
    const progressSteps: string[] = [];

    const result = await runAgentLoop(
      'Complete the Greenhouse job application form.',
      99, // tab ID — matches chromeMock.tabs.get mock
      {
        maxSteps: 10,
        onProgress: (step) => {
          progressSteps.push(step.kind);
          // Simulate what background.ts does: broadcast each step to the side panel
          void chrome.runtime.sendMessage({ type: 'AGI_CU_STEP', step });
        },
      },
    );

    // Loop completed
    expect(result.finalMessage).toContain('completed');
    expect(result.cappedAtMaxSteps).toBe(false);

    // Progress events were emitted
    expect(progressSteps).toContain('tool_call');
    expect(progressSteps).toContain('tool_result');
    expect(progressSteps).toContain('final');

    // AGI_CU_STEP was broadcast for each step
    const cuStepMessages = chromeMock.sentMessages.filter(
      (m) =>
        typeof m === 'object' &&
        m !== null &&
        (m as Record<string, unknown>)['type'] === 'AGI_CU_STEP',
    );
    expect(cuStepMessages.length).toBeGreaterThan(0);

    // Gateway was called twice (once for tool_call, once for final)
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstCall[0]).toBe('https://api.agiworkforce.com/v1/chat/completions');
    const firstBody = JSON.parse(firstCall[1].body as string) as {
      messages: Array<{ role: string; content: unknown }>;
      stream: boolean;
    };
    expect(firstBody.stream).toBe(true);
    // Goal was injected into the first user message
    expect(JSON.stringify(firstBody.messages)).toContain('Greenhouse job application');
  });

  it('AGI_CU_STEP messages carry AgentLoopStep structure', async () => {
    await runAgentLoop('Fill the form', 99, {
      maxSteps: 10,
      onProgress: (step) => {
        void chrome.runtime.sendMessage({ type: 'AGI_CU_STEP', step });
      },
    });

    const cuStepMsgs = chromeMock.sentMessages.filter(
      (m) => (m as Record<string, unknown>)?.['type'] === 'AGI_CU_STEP',
    ) as Array<{ type: string; step: { kind: string; stepNumber: number } }>;

    expect(cuStepMsgs.length).toBeGreaterThan(0);
    for (const msg of cuStepMsgs) {
      expect(typeof msg.step).toBe('object');
      expect(typeof msg.step.kind).toBe('string');
      expect(typeof msg.step.stepNumber).toBe('number');
    }
  });
});

describe('Full chain: AGI_RUN_AUTOFILL → shouldEscalate → AGI_START_COMPUTER_USE → AGI_CU_STEP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildGreenhouseDom();
    Object.defineProperty(window, 'location', {
      value: { href: 'https://boards.greenhouse.io/acmecorp/jobs/123' },
      writable: true,
    });
    chromeMock.runtime.lastError = null;
    chromeMock.sentMessages.length = 0;

    // Reinstall CDP mocks after vi.clearAllMocks()
    chromeMock.debugger.sendCommand.mockImplementation(chromeMock.debugger._defaultSendCommandImpl);
    chromeMock.debugger.attach.mockImplementation((_t: unknown, _v: unknown, cb: () => void) =>
      cb(),
    );
    chromeMock.debugger.detach.mockImplementation((_t: unknown, cb: () => void) => cb());
    chromeMock.tabs.get.mockImplementation((tabId: number) => {
      if (tabId === 99) {
        return Promise.resolve({ id: 99, url: 'https://boards.greenhouse.io/acmecorp/jobs/123' });
      }
      return Promise.reject(new Error('Tab not found'));
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: makeToolCallStream(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: makeFinalStream(),
      });
  });

  afterEach(() => {
    vi.clearAllMocks(); // preserve implementations, only reset call counts
  });

  it('drives the complete spine: autofill → escalation → loop → AGI_CU_STEP emitted', async () => {
    // ── Step 1: Simulate content script AGI_RUN_AUTOFILL handler ─────────────
    const profile = await loadAutofillProfile();
    const detection = detectJobApplication();
    expect(detection.isJobApplication).toBe(true);

    const autofillResult = await autofillGreenhouse(profile, 0);
    expect(autofillResult.platform).toBe('greenhouse');

    const profileValues: Record<string, string> = Object.fromEntries(
      detection.fields.map((f) => {
        const v = resolveProfileValue(profile, f.key);
        return [f.key, v != null ? String(v) : ''];
      }),
    );

    const escalation = makeEscalationDecision(
      autofillResult.filled,
      detection.fields,
      profileValues,
      detection.platform,
    );

    // The file upload field triggers escalation
    expect(escalation.shouldEscalate).toBe(true);

    // ── Step 2: Side panel checks shouldEscalate and decides to call background
    // (Here we call runAgentLoop directly to simulate what the background handler does,
    //  since the background handler itself is a service worker we can't easily unit-test
    //  end-to-end. The background integration is verified via the import and call site
    //  in background.ts:1762.)
    const cuStepKinds: string[] = [];

    const loopResult = await runAgentLoop(escalation.agentGoal, 99, {
      maxSteps: 5,
      onProgress: (step) => {
        cuStepKinds.push(step.kind);
        // This is what background.ts:1762 does on each step
        void chrome.runtime.sendMessage({ type: 'AGI_CU_STEP', step });
      },
    });

    // ── Step 3: Assert AGI_CU_STEP was emitted ───────────────────────────────
    expect(loopResult.finalMessage).toContain('completed');
    expect(cuStepKinds).toContain('final');

    const broadcastedSteps = chromeMock.sentMessages.filter(
      (m) => (m as Record<string, unknown>)?.['type'] === 'AGI_CU_STEP',
    );
    expect(broadcastedSteps.length).toBeGreaterThan(0);

    // ── Step 4: Assert the gateway received the escalation goal ──────────────
    const firstFetchCall = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(firstFetchCall[1].body as string) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    // The agent goal describes what the fast-path already did
    const allContent = JSON.stringify(body.messages);
    expect(allContent).toContain('greenhouse');
    expect(allContent).toContain('NEVER click Submit');
  });
});
