import { describe, expect, it, vi } from 'vitest';
import {
  getProviderOfferingMediaOutput,
  getProviderOfferingMediaRequestUnits,
  getProviderOfferingQuotaUnit,
  getProviderOfferings,
  type ProviderOffering,
} from '@agiworkforce/types';

import { QWEN_DEFAULT_BASE_URL } from '../base-url';
import { runQwenQuotaProbe, type QwenQuotaInput, type QwenQuotaProbePolicy } from '../quota-probe';

type Transport = (url: string, options: RequestInit) => Promise<Response>;

interface ExpectedRequest {
  path: string;
  asynchronous: boolean;
  input: (prompt: string) => unknown;
  parameters: Record<string, unknown>;
}

const CREDENTIAL = 'fixture-credential';
const PROMPT = 'A red kite over a quiet harbour at dawn';
const DEFAULT_IMAGE_PROMPT =
  'A single blue paper boat on a plain white background, simple studio photograph.';
const DEFAULT_VIDEO_PROMPT =
  'A blue paper boat gently moving across still water. Static camera, single shot.';
const SYNC_IMAGE_PATH = '/api/v1/services/aigc/multimodal-generation/generation';
const ASYNC_IMAGE_PATH = '/api/v1/services/aigc/text2image/image-synthesis';
const VIDEO_PATH = '/api/v1/services/aigc/video-generation/video-synthesis';
const TASK_ID = 'fixture-task';
const TASK_PATH = `/api/v1/tasks/${TASK_ID}`;
const IMAGE_URL = 'https://example.com/generated.png';
const VIDEO_URL = 'https://example.com/generated.mp4';
const SYNC_HEADERS = {
  Authorization: `Bearer ${CREDENTIAL}`,
  'Content-Type': 'application/json',
};
const ASYNC_HEADERS = { ...SYNC_HEADERS, 'X-DashScope-Async': 'enable' };
const LEGACY_POLICY = { imageSize: '1024*1024', videoSize: '1280*720' };

const policy: QwenQuotaProbePolicy = {
  maxOutputTokens: 128,
  requestTimeoutMs: 60_000,
  pollIntervalMs: 5_000,
  maxPolls: 24,
};
const offerings = getProviderOfferings();
const origin = new URL(QWEN_DEFAULT_BASE_URL).origin;
const noWait = async () => {};

const messagesInput = (prompt: string) => ({
  messages: [{ role: 'user', content: [{ text: prompt }] }],
});
const promptInput = (prompt: string) => ({ prompt });
const syncImage = (parameters: Record<string, unknown>): ExpectedRequest => ({
  path: SYNC_IMAGE_PATH,
  asynchronous: false,
  input: messagesInput,
  parameters,
});
const asyncImage = (parameters: Record<string, unknown>): ExpectedRequest => ({
  path: ASYNC_IMAGE_PATH,
  asynchronous: true,
  input: promptInput,
  parameters,
});
const video = (parameters: Record<string, unknown>): ExpectedRequest => ({
  path: VIDEO_PATH,
  asynchronous: true,
  input: promptInput,
  parameters,
});

const PREVIOUSLY_CONNECTED_IMAGES = [
  'qwen-quota-084',
  'qwen-quota-085',
  'qwen-quota-086',
  'qwen-quota-087',
  'qwen-quota-088',
  'qwen-quota-089',
  'qwen-quota-101',
  'qwen-quota-104',
  'qwen-quota-105',
  'qwen-quota-106',
  'qwen-quota-107',
  'qwen-quota-108',
  'qwen-quota-263',
  'qwen-quota-264',
];
const SIZED_BY_THE_WEB_POLICY_BEFORE = 'qwen-quota-101';
const PREVIOUSLY_CONNECTED_VIDEO = 'qwen-quota-009';
const ASYNC_IMAGES = ['qwen-quota-148', 'qwen-quota-149', 'qwen-quota-150', 'qwen-quota-151'];
const ASYNC_IMAGE = 'qwen-quota-148';
const FIXED_DURATION_VIDEO = 'qwen-quota-011';
const TIERED_VIDEO = 'qwen-quota-235';
const THREE_SECOND_VIDEO = 'qwen-quota-236';

const EXPECTED_REQUESTS: Record<string, ExpectedRequest> = {
  'qwen-quota-009': video({
    size: '1280*720',
    duration: 5,
    prompt_extend: false,
    shot_type: 'single',
  }),
  'qwen-quota-011': video({ size: '832*480', prompt_extend: false }),
  'qwen-quota-012': video({ size: '1280*720', prompt_extend: false }),
  'qwen-quota-013': video({ size: '1280*720', prompt_extend: false }),
  'qwen-quota-234': video({
    resolution: '720P',
    ratio: '16:9',
    duration: 5,
    prompt_extend: false,
  }),
  'qwen-quota-235': video({
    resolution: '720P',
    ratio: '16:9',
    duration: 5,
    prompt_extend: false,
  }),
  'qwen-quota-272': video({
    resolution: '720P',
    ratio: '16:9',
    duration: 5,
    prompt_extend: false,
  }),
  'qwen-quota-232': video({ resolution: '720P', ratio: '16:9', duration: 3, watermark: false }),
  'qwen-quota-236': video({ resolution: '720P', ratio: '16:9', duration: 3, watermark: false }),
  'qwen-quota-027': syncImage({ size: '1024*1024', n: 1 }),
  'qwen-quota-028': syncImage({ size: '1024*1024', n: 1 }),
  'qwen-quota-084': syncImage({ prompt_extend: false, size: '1328*1328', n: 1 }),
  'qwen-quota-085': syncImage({ prompt_extend: false, size: '1328*1328', n: 1 }),
  'qwen-quota-086': syncImage({ prompt_extend: false, size: '1328*1328', n: 1 }),
  'qwen-quota-087': syncImage({ prompt_extend: false, size: '1328*1328', n: 1 }),
  'qwen-quota-088': syncImage({ prompt_extend: false, size: '1328*1328', n: 1 }),
  'qwen-quota-089': syncImage({ prompt_extend: false, size: '1328*1328', n: 1 }),
  'qwen-quota-101': syncImage({ prompt_extend: false, size: '1024*1024', n: 1 }),
  'qwen-quota-104': syncImage({ prompt_extend: false, size: '1328*1328', n: 1 }),
  'qwen-quota-105': syncImage({ prompt_extend: false, size: '1328*1328', n: 1 }),
  'qwen-quota-106': syncImage({ prompt_extend: false, size: '1328*1328', n: 1 }),
  'qwen-quota-107': syncImage({ prompt_extend: false, size: '1328*1328', n: 1 }),
  'qwen-quota-108': syncImage({ prompt_extend: false, size: '1328*1328', n: 1 }),
  'qwen-quota-146': syncImage({ prompt_extend: false, size: '1280*1280', n: 1 }),
  'qwen-quota-263': syncImage({ prompt_extend: false, size: '1328*1328', n: 1 }),
  'qwen-quota-264': syncImage({ prompt_extend: false, size: '1328*1328', n: 1 }),
  'qwen-quota-148': asyncImage({ size: '1024*1024', n: 1, prompt_extend: false }),
  'qwen-quota-149': asyncImage({ size: '1024*1024', n: 1, prompt_extend: false }),
  'qwen-quota-150': asyncImage({ size: '1024*1024', n: 1, prompt_extend: false }),
  'qwen-quota-151': asyncImage({ size: '1024*1024', n: 1, prompt_extend: false }),
};

const PARAMETERS_NEVER_SENT: Record<string, string[]> = {
  'qwen-quota-011': ['duration', 'shot_type', 'resolution', 'ratio', 'watermark'],
  'qwen-quota-012': ['duration', 'shot_type', 'resolution', 'ratio', 'watermark'],
  'qwen-quota-013': ['duration', 'shot_type', 'resolution', 'ratio', 'watermark'],
  'qwen-quota-234': ['size', 'shot_type', 'watermark'],
  'qwen-quota-235': ['size', 'shot_type', 'watermark'],
  'qwen-quota-272': ['size', 'shot_type', 'watermark'],
  'qwen-quota-232': ['size', 'prompt_extend', 'shot_type'],
  'qwen-quota-236': ['size', 'prompt_extend', 'shot_type'],
  'qwen-quota-027': ['prompt_extend'],
  'qwen-quota-028': ['prompt_extend'],
};

function offeringFor(key: string): ProviderOffering {
  const offering = offerings[key];
  if (!offering) throw new Error(`The catalogue has no offering ${key}.`);
  return offering;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function transportReturning(...responses: Response[]) {
  const transport = vi.fn<Transport>();
  for (const response of responses) transport.mockResolvedValueOnce(response);
  return transport;
}

function finished(expected: ExpectedRequest): Response {
  if (expected.path === SYNC_IMAGE_PATH) {
    return json({ output: { choices: [{ message: { content: [{ image: IMAGE_URL }] } }] } });
  }
  return json({
    output:
      expected.path === VIDEO_PATH
        ? { task_id: TASK_ID, task_status: 'SUCCEEDED', video_url: VIDEO_URL }
        : { task_id: TASK_ID, task_status: 'SUCCEEDED', results: [{ url: IMAGE_URL }] },
  });
}

function userInput(content: QwenQuotaInput['messages'][number]['content']): QwenQuotaInput {
  return { messages: [{ role: 'user', content }] };
}

function sentRequest(transport: ReturnType<typeof transportReturning>, call = 0) {
  const [url, request] = transport.mock.calls[call]!;
  return { url, request, body: typeof request.body === 'string' ? request.body : '' };
}

function sentParameters(transport: ReturnType<typeof transportReturning>) {
  return (JSON.parse(sentRequest(transport).body) as { parameters: Record<string, unknown> })
    .parameters;
}

function sentPrompt(transport: ReturnType<typeof transportReturning>): string {
  return (JSON.parse(sentRequest(transport).body) as { input: { prompt: string } }).input.prompt;
}

async function generateVideo(offeringKey: string, finishedTask: unknown) {
  const transport = transportReturning(
    json({ output: { task_id: TASK_ID, task_status: 'PENDING' } }),
    json(finishedTask),
  );
  return runQwenQuotaProbe(offeringKey, CREDENTIAL, policy, transport, noWait, userInput(PROMPT));
}

describe('the request every connected media offering sends', () => {
  it('holds an expectation for every connected image and video offering', () => {
    const connected = Object.entries(offerings)
      .filter(
        ([, offering]) =>
          offering.provider === 'qwen' &&
          offering.quotaProbeProtocol !== undefined &&
          offering.quotaProbeProtocol !== 'chat',
      )
      .map(([offeringKey]) => offeringKey);
    expect(Object.keys(EXPECTED_REQUESTS).sort()).toEqual(connected.sort());
  });

  it.each(Object.entries(EXPECTED_REQUESTS))(
    'sends exactly the catalogued URL, headers and body for %s',
    async (offeringKey, expected) => {
      const transport = transportReturning(finished(expected));
      const result = await runQwenQuotaProbe(
        offeringKey,
        CREDENTIAL,
        policy,
        transport,
        noWait,
        userInput(PROMPT),
      );
      expect(result.status).toBe('succeeded');
      expect(transport).toHaveBeenCalledTimes(1);
      const { url, request, body } = sentRequest(transport);
      expect(url).toBe(`${origin}${expected.path}`);
      expect(request.method).toBe('POST');
      expect(request.redirect).toBe('error');
      expect(request.headers).toStrictEqual(expected.asynchronous ? ASYNC_HEADERS : SYNC_HEADERS);
      expect(body).toBe(
        JSON.stringify({
          model: offeringFor(offeringKey).providerModelId,
          input: expected.input(PROMPT),
          parameters: expected.parameters,
        }),
      );
    },
  );

  it.each(Object.entries(PARAMETERS_NEVER_SENT))(
    'never sends an undocumented parameter for %s',
    async (offeringKey, absent) => {
      const transport = transportReturning(finished(EXPECTED_REQUESTS[offeringKey]!));
      await runQwenQuotaProbe(
        offeringKey,
        CREDENTIAL,
        policy,
        transport,
        noWait,
        userInput(PROMPT),
      );
      const parameters = sentParameters(transport);
      for (const parameter of absent) expect(parameters).not.toHaveProperty(parameter);
    },
  );

  it('refuses an offering the catalogue has not connected without calling the provider', async () => {
    const transport = transportReturning();
    for (const offeringKey of ['qwen-quota-010', 'qwen-quota-029', 'qwen-quota-147', 'missing']) {
      await expect(runQwenQuotaProbe(offeringKey, CREDENTIAL, policy, transport)).rejects.toThrow(
        'no verified quota experiment protocol',
      );
    }
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('requests of the offerings that were already connected', () => {
  function legacyImageBody(offeringKey: string, prompt: string): string {
    const offering = offeringFor(offeringKey);
    return JSON.stringify({
      model: offering.providerModelId,
      input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
      parameters: {
        prompt_extend: false,
        size:
          offeringKey === SIZED_BY_THE_WEB_POLICY_BEFORE
            ? LEGACY_POLICY.imageSize
            : offering.quotaImageSize,
        n: 1,
      },
    });
  }

  function legacyVideoBody(offeringKey: string, prompt: string, duration: number): string {
    return JSON.stringify({
      model: offeringFor(offeringKey).providerModelId,
      input: { prompt },
      parameters: {
        size: LEGACY_POLICY.videoSize,
        duration,
        prompt_extend: false,
        shot_type: 'single',
      },
    });
  }

  it.each(PREVIOUSLY_CONNECTED_IMAGES)(
    'keeps the image request of %s byte for byte',
    async (offeringKey) => {
      for (const [input, prompt] of [
        [userInput(PROMPT), PROMPT],
        [undefined, DEFAULT_IMAGE_PROMPT],
      ] as const) {
        const transport = transportReturning(finished(EXPECTED_REQUESTS[offeringKey]!));
        await runQwenQuotaProbe(offeringKey, CREDENTIAL, policy, transport, noWait, input);
        const { url, request, body } = sentRequest(transport);
        expect(url).toBe(`${origin}${SYNC_IMAGE_PATH}`);
        expect(request.method).toBe('POST');
        expect(JSON.stringify(request.headers)).toBe(JSON.stringify(SYNC_HEADERS));
        expect(body).toBe(legacyImageBody(offeringKey, prompt));
      }
    },
  );

  it('sends the size of every image offering from the catalogue, whatever the caller’s policy holds', async () => {
    const policyWithAnotherSize = { ...policy, imageSize: '640*640' };
    for (const offeringKey of [...PREVIOUSLY_CONNECTED_IMAGES, 'qwen-quota-146', ASYNC_IMAGE]) {
      const transport = transportReturning(finished(EXPECTED_REQUESTS[offeringKey]!));
      await runQwenQuotaProbe(
        offeringKey,
        CREDENTIAL,
        policyWithAnotherSize,
        transport,
        noWait,
        userInput(PROMPT),
      );
      expect(offeringFor(offeringKey).quotaImageSize).toMatch(/^[1-9]\d*\*[1-9]\d*$/);
      expect(sentParameters(transport)['size']).toBe(offeringFor(offeringKey).quotaImageSize);
    }
    expect(offeringFor(SIZED_BY_THE_WEB_POLICY_BEFORE).quotaImageSize).toBe(
      LEGACY_POLICY.imageSize,
    );
  });

  it('changes only the clip length of the video request that was already connected', async () => {
    for (const [input, prompt] of [
      [userInput(PROMPT), PROMPT],
      [undefined, DEFAULT_VIDEO_PROMPT],
    ] as const) {
      const transport = transportReturning(
        finished(EXPECTED_REQUESTS[PREVIOUSLY_CONNECTED_VIDEO]!),
      );
      await runQwenQuotaProbe(
        PREVIOUSLY_CONNECTED_VIDEO,
        CREDENTIAL,
        policy,
        transport,
        noWait,
        input,
      );
      const { url, request, body } = sentRequest(transport);
      expect(url).toBe(`${origin}${VIDEO_PATH}`);
      expect(request.method).toBe('POST');
      expect(JSON.stringify(request.headers)).toBe(JSON.stringify(ASYNC_HEADERS));
      expect(body).toBe(legacyVideoBody(PREVIOUSLY_CONNECTED_VIDEO, prompt, 5));
      expect(body).not.toBe(legacyVideoBody(PREVIOUSLY_CONNECTED_VIDEO, prompt, 2));
    }
  });

  it('keeps the non-streaming chat request byte for byte', async () => {
    const [offeringKey, offering] = Object.entries(offerings).find(
      ([, candidate]) =>
        candidate.provider === 'qwen' &&
        candidate.quotaProbeProtocol === 'chat' &&
        !candidate.quotaThinkingRequired,
    )!;
    const transport = transportReturning(
      json({ choices: [{ message: { content: '42. A paper boat floats.' } }] }),
    );
    const result = await runQwenQuotaProbe(offeringKey, CREDENTIAL, policy, transport);
    expect(result).toMatchObject({ status: 'succeeded', text: '42. A paper boat floats.' });
    const { url, request, body } = sentRequest(transport);
    expect(url).toBe(`${QWEN_DEFAULT_BASE_URL}/chat/completions`);
    expect(JSON.stringify(request.headers)).toBe(JSON.stringify(SYNC_HEADERS));
    expect(body).toBe(
      JSON.stringify({
        model: offering.providerModelId,
        messages: [
          {
            role: 'user',
            content:
              'Reply with the sum of 17 and 25, followed by a short sentence about a paper boat.',
          },
        ],
        max_tokens: policy.maxOutputTokens,
        enable_thinking: false,
        stream: false,
      }),
    );
  });
});

describe('asynchronous image results', () => {
  const submitted = () => json({ output: { task_id: TASK_ID, task_status: 'PENDING' } });
  const run = (transport: ReturnType<typeof transportReturning>, overrides = {}) =>
    runQwenQuotaProbe(
      ASYNC_IMAGE,
      CREDENTIAL,
      { ...policy, ...overrides },
      transport,
      noWait,
      userInput(PROMPT),
    );

  it('polls the submitted task and returns the generated image', async () => {
    const transport = transportReturning(
      submitted(),
      json({ output: { task_id: TASK_ID, task_status: 'RUNNING' } }),
      json({
        output: {
          task_id: TASK_ID,
          task_status: 'SUCCEEDED',
          results: [{ url: IMAGE_URL }],
          task_metrics: { TOTAL: 1, SUCCEEDED: 1, FAILED: 0 },
        },
        usage: { image_count: 1 },
      }),
    );
    expect(await run(transport)).toMatchObject({
      status: 'succeeded',
      taskId: TASK_ID,
      artifactUrl: IMAGE_URL,
    });
    expect(transport).toHaveBeenCalledTimes(3);
    for (const call of [1, 2]) {
      const { url, request } = sentRequest(transport, call);
      expect(url).toBe(`${origin}${TASK_PATH}`);
      expect(request.method).toBe('GET');
      expect(request.body).toBeUndefined();
      expect(request.headers).toStrictEqual(SYNC_HEADERS);
    }
  });

  it('takes the first result that carries a url', async () => {
    const transport = transportReturning(
      json({
        output: {
          task_id: TASK_ID,
          task_status: 'SUCCEEDED',
          results: [
            { code: 'InternalError.Timeout', message: 'An internal timeout occurred.' },
            { url: IMAGE_URL },
            { url: 'https://example.com/second.png' },
          ],
        },
      }),
    );
    const result = await run(transport);
    expect(result).toMatchObject({ status: 'succeeded', artifactUrl: IMAGE_URL });
    expect(result.providerCode).toBeUndefined();
  });

  it('reports a failed result entry with the provider’s code and words', async () => {
    const transport = transportReturning(
      submitted(),
      json({
        output: {
          task_id: TASK_ID,
          task_status: 'SUCCEEDED',
          results: [
            {
              code: 'DataInspectionFailed',
              message: 'Input data may contain inappropriate content.',
            },
          ],
          task_metrics: { TOTAL: 1, SUCCEEDED: 0, FAILED: 1 },
        },
      }),
    );
    const result = await run(transport);
    expect(result).toMatchObject({
      status: 'failed',
      taskId: TASK_ID,
      providerCode: 'DataInspectionFailed',
      providerMessage: 'Input data may contain inappropriate content.',
    });
    expect(result.artifactUrl).toBeUndefined();
  });

  it('reports a failed task with the provider’s code and words', async () => {
    const transport = transportReturning(
      submitted(),
      json({
        output: {
          task_id: TASK_ID,
          task_status: 'FAILED',
          code: 'InvalidParameter',
          message: 'The size is not supported.',
        },
      }),
    );
    expect(await run(transport)).toMatchObject({
      status: 'failed',
      providerCode: 'InvalidParameter',
      providerMessage: 'The size is not supported.',
    });
  });

  it('fails a finished task that carries neither an image nor a reason', async () => {
    const transport = transportReturning(
      json({ output: { task_id: TASK_ID, task_status: 'SUCCEEDED', results: [] } }),
    );
    const result = await run(transport);
    expect(result.status).toBe('failed');
    expect(result.providerCode).toBeUndefined();
  });

  it('returns the task as submitted when it is still pending after the last poll', async () => {
    const transport = vi
      .fn<Transport>()
      .mockImplementation(async () =>
        json({ output: { task_id: TASK_ID, task_status: 'PENDING' } }),
      );
    const result = await run(transport, { maxPolls: 2 });
    expect(result).toMatchObject({ status: 'submitted', taskId: TASK_ID });
    expect(result.artifactUrl).toBeUndefined();
    expect(transport.mock.calls.filter(([, request]) => request.method === 'POST')).toHaveLength(1);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('stops polling a slow provider before the time allowed for the whole request runs out', async () => {
    const begun = 1_700_000_000_000;
    const slowAnswerMs = 50_000;
    let now = begun;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const timeouts: number[] = [];
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      timeouts.push(ms);
      return new AbortController().signal;
    });
    const transport = vi.fn<Transport>().mockImplementation(async () => {
      const allowed = timeouts.at(-1)!;
      if (slowAnswerMs > allowed) {
        now += allowed;
        throw new DOMException('The operation timed out.', 'TimeoutError');
      }
      now += slowAnswerMs;
      return json({ output: { task_id: TASK_ID, task_status: 'RUNNING' } });
    });
    try {
      const result = await runQwenQuotaProbe(
        ASYNC_IMAGE,
        CREDENTIAL,
        policy,
        transport,
        async (ms) => {
          now += ms;
        },
        userInput(PROMPT),
      );

      const allowedMs = policy.requestTimeoutMs + policy.maxPolls * policy.pollIntervalMs;
      expect(result).toMatchObject({ status: 'submitted', taskId: TASK_ID });
      expect(now - begun).toBeLessThanOrEqual(allowedMs);
      expect(transport.mock.calls.length).toBeLessThan(1 + policy.maxPolls);
      expect(Math.max(...timeouts)).toBeLessThanOrEqual(policy.requestTimeoutMs);
    } finally {
      clock.mockRestore();
      timeout.mockRestore();
    }
  });

  it('keeps the task identity when polling is interrupted', async () => {
    const transport = vi
      .fn<Transport>()
      .mockResolvedValueOnce(submitted())
      .mockRejectedValueOnce(new Error('network interrupted'));
    expect(await run(transport)).toMatchObject({
      status: 'submitted',
      taskId: TASK_ID,
      providerCode: 'poll_interrupted',
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('stops at a refused submission without polling or retrying', async () => {
    for (const [status, response, expected] of [
      [403, { code: 'AllocationQuota.FreeTierOnly' }, { status: 'quota_exhausted' }],
      [
        429,
        { code: 'Throttling.AllocationQuota', message: 'Free allocated quota exceeded.' },
        {
          status: 'failed',
          providerCode: 'Throttling.AllocationQuota',
          providerMessage: 'Free allocated quota exceeded.',
          providerStatus: 429,
        },
      ],
      [402, {}, { status: 'failed', providerCode: 'provider_http_402', providerStatus: 402 }],
    ] as const) {
      const transport = transportReturning(json(response, status));
      expect(await run(transport)).toMatchObject(expected);
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });
});

describe('polls of a task the provider has accepted', () => {
  const ACCEPTED_TASKS = [
    [TIERED_VIDEO, { video_url: VIDEO_URL }, VIDEO_URL],
    [ASYNC_IMAGE, { results: [{ url: IMAGE_URL }] }, IMAGE_URL],
  ] as const;
  const POLL_REFUSALS = [
    [
      'an HTTP 429',
      () =>
        json(
          {
            code: 'Throttling.RateQuota',
            message: 'Requests rate limit exceeded, please try again later.',
          },
          429,
        ),
      'Throttling.RateQuota',
      'Requests rate limit exceeded, please try again later.',
    ],
    [
      'an HTTP 500',
      () => json({ code: 'InternalError', message: 'An internal error has occurred.' }, 500),
      'InternalError',
      'An internal error has occurred.',
    ],
    ['an HTTP 502 without a code', () => json({}, 502), 'provider_http_502', undefined],
    [
      'an HTTP 200 body with a top-level code',
      () => json({ code: 'Throttling', message: 'Request was throttled.', request_id: 'r1' }),
      'Throttling',
      'Request was throttled.',
    ],
    [
      'an HTTP 200 body with an error object',
      () => json({ error: { code: 'ServiceUnavailable', message: 'Try again later.' } }),
      'ServiceUnavailable',
      'Try again later.',
    ],
    [
      'an HTTP 403 that names the free tier',
      () => json({ code: 'AllocationQuota.FreeTierOnly', message: 'Free tier only.' }, 403),
      'AllocationQuota.FreeTierOnly',
      'Free tier only.',
    ],
  ] as const;
  const accepted = () => json({ output: { task_id: TASK_ID, task_status: 'PENDING' } });
  const cases = ACCEPTED_TASKS.flatMap(([offeringKey, output, artifactUrl]) =>
    POLL_REFUSALS.map(
      ([name, refusal, code, message]) =>
        [offeringKey, name, refusal, code, message, output, artifactUrl] as const,
    ),
  );
  const run = (offeringKey: string, transport: Transport, maxPolls = policy.maxPolls) =>
    runQwenQuotaProbe(
      offeringKey,
      CREDENTIAL,
      { ...policy, maxPolls },
      transport,
      noWait,
      userInput(PROMPT),
    );
  const submissions = (transport: ReturnType<typeof transportReturning>) =>
    transport.mock.calls.filter(([, request]) => request.method === 'POST');

  it.each(cases)(
    'keeps polling %s after %s and returns the finished task',
    async (offeringKey, _name, refusal, _code, _message, output, artifactUrl) => {
      const transport = transportReturning(
        accepted(),
        refusal(),
        json({ output: { task_id: TASK_ID, task_status: 'RUNNING' } }),
        refusal(),
        json({ output: { task_id: TASK_ID, task_status: 'SUCCEEDED', ...output } }),
      );
      const result = await run(offeringKey, transport);
      expect(result).toMatchObject({ status: 'succeeded', taskId: TASK_ID, artifactUrl });
      expect(result).not.toHaveProperty('providerCode');
      expect(result).not.toHaveProperty('providerMessage');
      expect(transport).toHaveBeenCalledTimes(5);
      expect(submissions(transport)).toHaveLength(1);
      for (const call of [1, 2, 3, 4]) {
        const { url, request } = sentRequest(transport, call);
        expect(url).toBe(`${origin}${TASK_PATH}`);
        expect(request.method).toBe('GET');
      }
    },
  );

  it.each(cases)(
    'reports %s as submitted, never failed, when %s answers every poll',
    async (offeringKey, _name, refusal, code, message) => {
      const transport = vi
        .fn<Transport>()
        .mockImplementation(async (_url, request) =>
          request.method === 'POST' ? accepted() : refusal(),
        );
      const result = await run(offeringKey, transport, 3);
      expect(result.status).toBe('submitted');
      expect(result).toMatchObject({ taskId: TASK_ID, providerCode: code });
      expect(result.providerMessage).toBe(message);
      expect(result).not.toHaveProperty('artifactUrl');
      expect(result).not.toHaveProperty('consumedSeconds');
      expect(transport).toHaveBeenCalledTimes(4);
      expect(submissions(transport)).toHaveLength(1);
    },
  );

  it.each(cases)(
    'reports %s as submitted when %s answers the last poll of a running task',
    async (offeringKey, _name, refusal, code) => {
      const transport = transportReturning(
        accepted(),
        json({ output: { task_id: TASK_ID, task_status: 'RUNNING' } }),
        refusal(),
      );
      const result = await run(offeringKey, transport, 2);
      expect(result).toMatchObject({ status: 'submitted', taskId: TASK_ID, providerCode: code });
      expect(transport).toHaveBeenCalledTimes(3);
    },
  );

  it.each(ACCEPTED_TASKS)(
    'states no provider code for %s when the last poll answered with a running task',
    async (offeringKey) => {
      const transport = transportReturning(
        accepted(),
        json({ code: 'Throttling.RateQuota', message: 'Slow down.' }, 429),
        json({ output: { task_id: TASK_ID, task_status: 'RUNNING' } }),
      );
      const result = await run(offeringKey, transport, 2);
      expect(result).toMatchObject({ status: 'submitted', taskId: TASK_ID });
      expect(result).not.toHaveProperty('providerCode');
      expect(result).not.toHaveProperty('providerMessage');
    },
  );

  it.each(ACCEPTED_TASKS)(
    'keeps polling %s after an answer that names neither a task state nor a code',
    async (offeringKey, output, artifactUrl) => {
      const finishing = transportReturning(
        accepted(),
        json({ request_id: 'r1' }),
        json({ output: { task_id: TASK_ID } }),
        json({ output: { task_id: TASK_ID, task_status: 'SUCCEEDED', ...output } }),
      );
      expect(await run(offeringKey, finishing)).toMatchObject({
        status: 'succeeded',
        artifactUrl,
      });
      expect(finishing).toHaveBeenCalledTimes(4);
      const silent = vi
        .fn<Transport>()
        .mockImplementation(async (_url, request) =>
          request.method === 'POST' ? accepted() : json({ request_id: 'r1' }),
        );
      const result = await run(offeringKey, silent, 2);
      expect(result).toMatchObject({ status: 'submitted', taskId: TASK_ID });
      expect(result).not.toHaveProperty('providerCode');
      expect(silent).toHaveBeenCalledTimes(3);
    },
  );

  it.each(ACCEPTED_TASKS)(
    'reports %s as failed only when the provider states that the task failed',
    async (offeringKey) => {
      const transport = transportReturning(
        accepted(),
        json({ code: 'Throttling.RateQuota', message: 'Slow down.' }, 429),
        json({
          output: {
            task_id: TASK_ID,
            task_status: 'FAILED',
            code: 'InternalError.Timeout',
            message: 'The task timed out.',
          },
        }),
      );
      expect(await run(offeringKey, transport)).toMatchObject({
        status: 'failed',
        taskId: TASK_ID,
        providerCode: 'InternalError.Timeout',
        providerMessage: 'The task timed out.',
      });
      expect(transport).toHaveBeenCalledTimes(3);
    },
  );

  it('still treats a refused submission as failed or exhausted, because no task exists', async () => {
    for (const [offeringKey] of ACCEPTED_TASKS) {
      for (const [status, body, expected] of [
        [429, { code: 'Throttling.RateQuota', message: 'Slow down.' }, 'failed'],
        [500, { code: 'InternalError' }, 'failed'],
        [403, { code: 'AllocationQuota.FreeTierOnly' }, 'quota_exhausted'],
      ] as const) {
        const transport = transportReturning(json(body, status));
        const result = await run(offeringKey, transport);
        expect(result.status).toBe(expected);
        expect(result).not.toHaveProperty('taskId');
        expect(transport).toHaveBeenCalledTimes(1);
      }
    }
  });
});

describe('prompt shortening to the catalogued maximum', () => {
  const maximum = offeringFor(ASYNC_IMAGE).quotaPromptMaxChars!;
  const send = async (offeringKey: string, content: Parameters<typeof userInput>[0]) => {
    const transport = transportReturning(finished(EXPECTED_REQUESTS[offeringKey]!));
    await runQwenQuotaProbe(offeringKey, CREDENTIAL, policy, transport, noWait, userInput(content));
    return sentPrompt(transport);
  };

  it('holds the documented 500-character maximum on every asynchronous image offering', () => {
    for (const offeringKey of ASYNC_IMAGES) {
      expect(offeringFor(offeringKey).quotaPromptMaxChars).toBe(500);
    }
  });

  it('sends a prompt of exactly the maximum unchanged', async () => {
    const prompt = 'a'.repeat(maximum);
    expect(await send(ASYNC_IMAGE, prompt)).toBe(prompt);
  });

  it('cuts a prompt one character over the maximum down to the maximum', async () => {
    const prompt = `${'a'.repeat(maximum - 1)}bc`;
    const sent = await send(ASYNC_IMAGE, prompt);
    expect(sent).toHaveLength(maximum);
    expect(sent).toBe(`${'a'.repeat(maximum - 1)}b`);
  });

  it('never ends a shortened prompt on half a character', async () => {
    const sent = await send(ASYNC_IMAGE, `${'a'.repeat(maximum - 1)}\u{1F600} and more`);
    expect(sent).toBe('a'.repeat(maximum - 1));
  });

  it('shortens the joined text of a prompt sent in parts', async () => {
    const sent = await send(ASYNC_IMAGE, [
      { type: 'text', text: 'a'.repeat(maximum - 2) },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
      { type: 'text', text: 'bcd' },
    ]);
    expect(sent).toBe(`${'a'.repeat(maximum - 2)}\nb`);
  });

  it('leaves the prompt of an offering without a maximum untouched', async () => {
    const prompt = 'a'.repeat(maximum * 12);
    expect(offeringFor(PREVIOUSLY_CONNECTED_VIDEO).quotaPromptMaxChars).toBeUndefined();
    expect(await send(PREVIOUSLY_CONNECTED_VIDEO, prompt)).toBe(prompt);
  });
});

describe('seconds the provider reports for a finished video', () => {
  const finishedVideo = (usage?: unknown) => ({
    output: { task_id: TASK_ID, task_status: 'SUCCEEDED', video_url: VIDEO_URL },
    ...(usage === undefined ? {} : { usage }),
  });

  it('returns the billed duration of the current usage block', async () => {
    const usage = {
      duration: 5,
      size: '1280*720',
      input_video_duration: 0,
      output_video_duration: 5,
      video_count: 1,
      SR: 720,
    };
    const result = await generateVideo(PREVIOUSLY_CONNECTED_VIDEO, finishedVideo(usage));
    expect(result).toMatchObject({ status: 'succeeded', consumedSeconds: 5, usage });
    expect(result).not.toHaveProperty('clipSecondsExceeded');
  });

  it('reads the older usage block that states video_duration', async () => {
    const result = await generateVideo(
      FIXED_DURATION_VIDEO,
      finishedVideo({ video_duration: 5, video_ratio: 'standard', video_count: 1 }),
    );
    expect(result.consumedSeconds).toBe(5);
    expect(result).not.toHaveProperty('clipSecondsExceeded');
  });

  it('falls back to the output duration when no billed duration is stated', async () => {
    const result = await generateVideo(
      THREE_SECOND_VIDEO,
      finishedVideo({ duration: 0, output_video_duration: 3, SR: 720 }),
    );
    expect(result.consumedSeconds).toBe(3);
    expect(result).not.toHaveProperty('clipSecondsExceeded');
  });

  it('reports a finished task that consumed more than the catalogued clip length', async () => {
    expect(offeringFor(THREE_SECOND_VIDEO).quotaVideoSeconds).toBe(3);
    expect(await generateVideo(THREE_SECOND_VIDEO, finishedVideo({ duration: 5 }))).toMatchObject({
      status: 'succeeded',
      artifactUrl: VIDEO_URL,
      consumedSeconds: 5,
      clipSecondsExceeded: true,
    });
    expect(await generateVideo(TIERED_VIDEO, finishedVideo({ duration: 5.2 }))).toMatchObject({
      status: 'succeeded',
      consumedSeconds: 5.2,
      clipSecondsExceeded: true,
    });
  });

  it('states no consumed seconds when the response does not', async () => {
    for (const usage of [undefined, {}, { duration: '5' }, { duration: Number.NaN }, 'five']) {
      const result = await generateVideo(TIERED_VIDEO, finishedVideo(usage));
      expect(result.status).toBe('succeeded');
      expect(result).not.toHaveProperty('consumedSeconds');
      expect(result).not.toHaveProperty('clipSecondsExceeded');
    }
  });

  it('states no consumed seconds for a task that did not finish with a video', async () => {
    const failed = await generateVideo(TIERED_VIDEO, {
      output: { task_id: TASK_ID, task_status: 'FAILED', code: 'InternalError' },
      usage: { duration: 5 },
    });
    expect(failed.status).toBe('failed');
    expect(failed).not.toHaveProperty('consumedSeconds');
    const pending = await runQwenQuotaProbe(
      TIERED_VIDEO,
      CREDENTIAL,
      { ...policy, maxPolls: 1 },
      vi
        .fn<Transport>()
        .mockImplementation(async () =>
          json({ output: { task_id: TASK_ID, task_status: 'RUNNING' }, usage: { duration: 5 } }),
        ),
      noWait,
    );
    expect(pending.status).toBe('submitted');
    expect(pending).not.toHaveProperty('consumedSeconds');
  });

  it('states no consumed seconds for an image', async () => {
    const transport = transportReturning(
      json({
        output: { choices: [{ message: { content: [{ image: IMAGE_URL }] } }] },
        usage: { image_count: 1, duration: 4 },
      }),
    );
    const result = await runQwenQuotaProbe('qwen-quota-146', CREDENTIAL, policy, transport);
    expect(result.status).toBe('succeeded');
    expect(result).not.toHaveProperty('consumedSeconds');
  });
});

describe('catalogue helpers the ledger and the picker read', () => {
  const fallbackVideoSeconds = 7;
  const chat = Object.values(offerings).find((offering) => offering.quotaProbeProtocol === 'chat')!;
  const unconnected = offeringFor('qwen-quota-010');

  it('counts chat in tokens, images in images and video in seconds', () => {
    expect(getProviderOfferingQuotaUnit(chat)).toBe('tokens');
    expect(getProviderOfferingQuotaUnit(offeringFor('qwen-quota-084'))).toBe('images');
    expect(getProviderOfferingQuotaUnit(offeringFor(ASYNC_IMAGE))).toBe('images');
    expect(getProviderOfferingQuotaUnit(offeringFor(TIERED_VIDEO))).toBe('seconds');
    expect(getProviderOfferingQuotaUnit(unconnected)).toBeNull();
  });

  it('charges one image, or the clip length of the offering, for one media request', () => {
    expect(getProviderOfferingMediaRequestUnits(offeringFor('qwen-quota-084'), 7)).toBe(1);
    expect(getProviderOfferingMediaRequestUnits(offeringFor(ASYNC_IMAGE), 7)).toBe(1);
    expect(getProviderOfferingMediaRequestUnits(offeringFor(PREVIOUSLY_CONNECTED_VIDEO), 7)).toBe(
      5,
    );
    expect(getProviderOfferingMediaRequestUnits(offeringFor(FIXED_DURATION_VIDEO), 7)).toBe(5);
    expect(getProviderOfferingMediaRequestUnits(offeringFor(THREE_SECOND_VIDEO), 7)).toBe(3);
    expect(getProviderOfferingMediaRequestUnits(chat, 7)).toBeNull();
    expect(getProviderOfferingMediaRequestUnits(unconnected, 7)).toBeNull();
  });

  it('takes the fallback clip length only for a video offering that holds none', () => {
    const { quotaVideoSeconds: _held, ...withoutClipLength } = offeringFor(TIERED_VIDEO);
    expect(getProviderOfferingMediaRequestUnits(withoutClipLength, 7)).toBe(7);
    for (const offering of Object.values(offerings)) {
      if (getProviderOfferingQuotaUnit(offering) !== 'seconds') continue;
      expect(getProviderOfferingMediaRequestUnits(offering, Number.NaN)).toBe(
        offering.quotaVideoSeconds,
      );
    }
  });

  it('describes the output of a media offering for the picker', () => {
    const outputOf = (offeringKey: string) =>
      getProviderOfferingMediaOutput(offeringFor(offeringKey), fallbackVideoSeconds);
    expect(outputOf('qwen-quota-084')).toStrictEqual({ outputSize: '1328*1328' });
    expect(outputOf(SIZED_BY_THE_WEB_POLICY_BEFORE)).toStrictEqual({ outputSize: '1024*1024' });
    expect(outputOf('qwen-quota-146')).toStrictEqual({ outputSize: '1280*1280' });
    expect(outputOf(ASYNC_IMAGE)).toStrictEqual({ outputSize: '1024*1024' });
    expect(outputOf(PREVIOUSLY_CONNECTED_VIDEO)).toStrictEqual({
      outputSize: '1280*720',
      durationSeconds: 5,
    });
    expect(outputOf(FIXED_DURATION_VIDEO)).toStrictEqual({
      outputSize: '832*480',
      durationSeconds: 5,
    });
    expect(outputOf(THREE_SECOND_VIDEO)).toStrictEqual({
      outputSize: '720P 16:9',
      durationSeconds: 3,
    });
    expect(getProviderOfferingMediaOutput(chat, fallbackVideoSeconds)).toBeNull();
    expect(getProviderOfferingMediaOutput(unconnected, fallbackVideoSeconds)).toBeNull();
  });

  it('describes every connected media offering from its catalogue fields alone', () => {
    for (const [offeringKey, offering] of Object.entries(offerings)) {
      const unit = getProviderOfferingQuotaUnit(offering);
      if (unit !== 'images' && unit !== 'seconds') continue;
      const output = getProviderOfferingMediaOutput(offering, Number.NaN);
      expect(output, offeringKey).not.toBeNull();
      expect(output!.outputSize, offeringKey).toBe(
        offering.quotaImageSize ??
          offering.quotaVideoSize ??
          `${offering.quotaVideoResolution} ${offering.quotaVideoRatio}`,
      );
      expect(output!.durationSeconds, offeringKey).toBe(offering.quotaVideoSeconds);
    }
  });

  it('describes no output for a media offering whose catalogue entry holds no size', () => {
    const { quotaImageSize: _size, ...imageWithoutSize } = offeringFor(ASYNC_IMAGE);
    const { quotaVideoSize: _frame, ...videoWithoutSize } = offeringFor(FIXED_DURATION_VIDEO);
    const { quotaVideoRatio: _ratio, ...videoWithoutRatio } = offeringFor(TIERED_VIDEO);
    for (const incomplete of [imageWithoutSize, videoWithoutSize, videoWithoutRatio]) {
      expect(getProviderOfferingMediaOutput(incomplete, fallbackVideoSeconds)).toBeNull();
    }
  });

  it('takes the fallback clip length in the description only for a video that holds none', () => {
    const { quotaVideoSeconds: _held, ...withoutClipLength } = offeringFor(TIERED_VIDEO);
    expect(getProviderOfferingMediaOutput(withoutClipLength, fallbackVideoSeconds)).toStrictEqual({
      outputSize: '720P 16:9',
      durationSeconds: fallbackVideoSeconds,
    });
  });
});
