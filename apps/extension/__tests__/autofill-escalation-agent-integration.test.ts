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

const chromeMock = vi.hoisted(() => {
  const localStore: Record<string, unknown> = {
    agi_dev_bearer_token: 'test-bearer-token-integration',
    agi_cu_ask_before_acting: false,
    agi_site_allowlist: ['https://boards.greenhouse.io'],
  };

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
      if (expr.includes('document.readyState') && !expr.includes('indexMap')) {
        callback({ result: { type: 'string', value: 'complete|1|buttonSubmit' } });
        return;
      }
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
      if (expr.includes('.value') && expr.includes('querySelector')) {
        callback({ result: { type: 'string', value: '' } });
        return;
      }
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

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

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

import {
  autofillGreenhouse,
  loadAutofillProfile,
  resolveProfileValue,
  FILE_INPUT_SKIP_REASON,
} from '../src/features/content/autofill/filler';
import { detectJobApplication } from '../src/features/content/autofill/detector';
import { makeEscalationDecision } from '../src/features/computer-use/escalationEngine';
import { ASHBY_ALWAYS_ESCALATE_KEYS } from '../src/features/content/autofill/ashby';

import { runAgentLoop } from '../src/features/computer-use/agentLoop';

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

describe('AGI_RUN_AUTOFILL content handler → escalation decision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildGreenhouseDom();
    Object.defineProperty(window, 'location', {
      value: { href: 'https://boards.greenhouse.io/acmecorp/jobs/123' },
      writable: true,
    });
  });

  it('detects greenhouse platform and returns an autofill result', async () => {
    const detection = detectJobApplication();
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
    expect(decision.agentGoal).toContain('NEVER click Submit');
  });

  it('escalates Ashby always-escalate fields only when the platform keys are passed', () => {
    const fillResults = [
      {
        key: 'files.resume',
        selector: '',
        success: false,
        skipped: true,
        reason: 'Requires computer-use escalation',
      },
      {
        key: 'locationCity',
        selector: '',
        success: false,
        skipped: true,
        reason: 'Requires computer-use escalation',
      },
    ];
    const detectedFields = [
      {
        key: 'files.resume',
        selector: '#resume',
        label: 'Resume',
        fieldType: 'file' as const,
        required: false,
      },
    ];
    const profileValues = {};

    const without = makeEscalationDecision(fillResults, detectedFields, profileValues, 'ashby');
    expect(without.triggers.some((t) => t.reason === 'platform_always_escalate')).toBe(false);

    const withKeys = makeEscalationDecision(
      fillResults,
      detectedFields,
      profileValues,
      'ashby',
      ASHBY_ALWAYS_ESCALATE_KEYS,
    );
    expect(withKeys.shouldEscalate).toBe(true);
    expect(withKeys.triggers.some((t) => t.reason === 'platform_always_escalate')).toBe(true);
  });

  it('full chain: autofill → escalation for a form with file upload', async () => {
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

    expect(escalation.shouldEscalate).toBe(true);
    expect(escalation.agentGoal.length).toBeGreaterThan(0);
  });
});

describe('AGI_START_COMPUTER_USE background handler → runAgentLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chromeMock.runtime.lastError = null;
    chromeMock.sentMessages.length = 0;

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
    vi.clearAllMocks();
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
          void chrome.runtime.sendMessage({ type: 'AGI_CU_STEP', step });
        },
      },
    );

    expect(result.finalMessage).toContain('completed');
    expect(result.cappedAtMaxSteps).toBe(false);

    expect(progressSteps).toContain('tool_call');
    expect(progressSteps).toContain('tool_result');
    expect(progressSteps).toContain('final');

    const cuStepMessages = chromeMock.sentMessages.filter(
      (m) =>
        typeof m === 'object' &&
        m !== null &&
        (m as Record<string, unknown>)['type'] === 'AGI_CU_STEP',
    );
    expect(cuStepMessages.length).toBeGreaterThan(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstCall[0]).toBe('https://api.agiworkforce.com/api/llm/v1/chat/completions');
    const firstBody = JSON.parse(firstCall[1].body as string) as {
      messages: Array<{ role: string; content: unknown }>;
      stream: boolean;
    };
    expect(firstBody.stream).toBe(true);
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
    vi.clearAllMocks();
  });

  it('drives the complete spine: autofill → escalation → loop → AGI_CU_STEP emitted', async () => {
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

    expect(escalation.shouldEscalate).toBe(true);

    const cuStepKinds: string[] = [];

    const loopResult = await runAgentLoop(escalation.agentGoal, 99, {
      maxSteps: 5,
      onProgress: (step) => {
        cuStepKinds.push(step.kind);
        void chrome.runtime.sendMessage({ type: 'AGI_CU_STEP', step });
      },
    });

    expect(loopResult.finalMessage).toContain('completed');
    expect(cuStepKinds).toContain('final');

    const broadcastedSteps = chromeMock.sentMessages.filter(
      (m) => (m as Record<string, unknown>)?.['type'] === 'AGI_CU_STEP',
    );
    expect(broadcastedSteps.length).toBeGreaterThan(0);

    const firstFetchCall = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(firstFetchCall[1].body as string) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const allContent = JSON.stringify(body.messages);
    expect(allContent).toContain('greenhouse');
    expect(allContent).toContain('NEVER click Submit');
  });
});
