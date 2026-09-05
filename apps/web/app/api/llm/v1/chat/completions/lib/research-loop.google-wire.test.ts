import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    generateIdempotencyKey: vi.fn(() => 'idem-key'),
    deductCredits: vi.fn(async () => ({ success: true })),
  },
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateCost: vi.fn(() => 7),
    calculateCostDollars: vi.fn(() => 0.07),
  },
  normalizeProviderId: (provider: string | null | undefined) =>
    typeof provider === 'string' ? provider.toLowerCase() : null,
}));
vi.mock('./tool-loop-anthropic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tool-loop-anthropic')>();
  return {
    ...actual,
    buildToolLoopStream: vi.fn(),
  };
});

import { parseGeminiStream, translateGeminiStream } from '@agiworkforce/providers-google';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import { buildToolLoopStream, chunksToOpenAiSse } from './tool-loop-anthropic';
import { runResearchLoop } from './research-loop';
import type { ProcessedRequest } from './request-processor';

const GOOGLE_CHAT_MODEL = requireProviderDefaultModel('google');

const RECORDED_GOOGLE_SSE: string =
  'data: {"candidates": [{"content": {"parts": [{"text": "As of July 2026, the current stable Long-Term"}],"role": "model"},"index": 0}],"usageMetadata": {"promptTokenCount": 21,"candidatesTokenCount": 15,"totalTokenCount": 517,"promptTokensDetails": [{"modality": "TEXT","tokenCount": 21}],"thoughtsTokenCount": 481,"serviceTier": "standard"},"modelVersion": "fixture-google-wire-model","responseId": "uCdRasy1POqHz7IPsuT-kAs"}\r\n\r\ndata: {"candidates": [{"content": {"parts": [{"text": " Support (LTS) version of Node.js is **v24.18.0**, while the latest \\"Current\\" feature"}],"role": "model"},"index": 0}],"usageMetadata": {"promptTokenCount": 21,"candidatesTokenCount": 43,"totalTokenCount": 545,"promptTokensDetails": [{"modality": "TEXT","tokenCount": 21}],"thoughtsTokenCount": 481,"serviceTier": "standard"},"modelVersion": "fixture-google-wire-model","responseId": "uCdRasy1POqHz7IPsuT-kAs"}\r\n\r\ndata: {"candidates": [{"content": {"parts": [{"text": " release is **v26.5.0**."}],"role": "model"},"index": 0}],"usageMetadata": {"promptTokenCount": 21,"candidatesTokenCount": 43,"totalTokenCount": 545,"promptTokensDetails": [{"modality": "TEXT","tokenCount": 21}],"thoughtsTokenCount": 481,"serviceTier": "standard"},"modelVersion": "fixture-google-wire-model","responseId": "uCdRasy1POqHz7IPsuT-kAs"}\r\n\r\ndata: {"candidates": [{"content": {"parts": [{"text": "","thoughtSignature": "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"}],"role": "model"},"finishReason": "STOP","index": 0,"groundingMetadata": {"searchEntryPoint": {"renderedContent": "\\u003cstyle\\u003e\\n.container {\\n  align-items: center;\\n  border-radius: 8px;\\n  display: flex;\\n  font-family: Google Sans, Roboto, sans-serif;\\n  font-size: 14px;\\n  line-height: 20px;\\n  padding: 8px 12px;\\n}\\n.chip {\\n  display: inline-block;\\n  border: solid 1px;\\n  border-radius: 16px;\\n  min-width: 14px;\\n  padding: 5px 16px;\\n  text-align: center;\\n  user-select: none;\\n  margin: 0 8px;\\n  -webkit-tap-highlight-color: transparent;\\n}\\n.carousel {\\n  overflow: auto;\\n  scrollbar-width: none;\\n  white-space: nowrap;\\n  margin-right: -12px;\\n}\\n.headline {\\n  display: flex;\\n  margin-right: 4px;\\n}\\n.gradient-container {\\n  position: relative;\\n}\\n.gradient {\\n  position: absolute;\\n  transform: translate(3px, -9px);\\n  height: 36px;\\n  width: 9px;\\n}\\n@media (prefers-color-scheme: light) {\\n  .container {\\n    background-color: #fafafa;\\n    box-shadow: 0 0 0 1px #0000000f;\\n  }\\n  .headline-label {\\n    color: #1f1f1f;\\n  }\\n  .chip {\\n    background-color: #ffffff;\\n    border-color: #d2d2d2;\\n    color: #5e5e5e;\\n    text-decoration: none;\\n  }\\n  .chip:hover {\\n    background-color: #f2f2f2;\\n  }\\n  .chip:focus {\\n    background-color: #f2f2f2;\\n  }\\n  .chip:active {\\n    background-color: #d8d8d8;\\n    border-color: #b6b6b6;\\n  }\\n  .logo-dark {\\n    display: none;\\n  }\\n  .gradient {\\n    background: linear-gradient(90deg, #fafafa 15%, #fafafa00 100%);\\n  }\\n}\\n@media (prefers-color-scheme: dark) {\\n  .container {\\n    background-color: #1f1f1f;\\n    box-shadow: 0 0 0 1px #ffffff26;\\n  }\\n  .headline-label {\\n    color: #fff;\\n  }\\n  .chip {\\n    background-color: #2c2c2c;\\n    border-color: #3c4043;\\n    color: #fff;\\n    text-decoration: none;\\n  }\\n  .chip:hover {\\n    background-color: #353536;\\n  }\\n  .chip:focus {\\n    background-color: #353536;\\n  }\\n  .chip:active {\\n    background-color: #464849;\\n    border-color: #53575b;\\n  }\\n  .logo-light {\\n    display: none;\\n  }\\n  .gradient {\\n    background: linear-gradient(90deg, #1f1f1f 15%, #1f1f1f00 100%);\\n  }\\n}\\n\\u003c/style\\u003e\\n\\u003cdiv class=\\"container\\"\\u003e\\n  \\u003cdiv class=\\"headline\\"\\u003e\\n    \\u003csvg class=\\"logo-light\\" width=\\"18\\" height=\\"18\\" viewBox=\\"9 9 35 35\\" fill=\\"none\\" xmlns=\\"http://www.w3.org/2000/svg\\"\\u003e\\n      \\u003cpath fill-rule=\\"evenodd\\" clip-rule=\\"evenodd\\" d=\\"M42.8622 27.0064C42.8622 25.7839 42.7525 24.6084 42.5487 23.4799H26.3109V30.1568H35.5897C35.1821 32.3041 33.9596 34.1222 32.1258 35.3448V39.6864H37.7213C40.9814 36.677 42.8622 32.2571 42.8622 27.0064V27.0064Z\\" fill=\\"#4285F4\\"/\\u003e\\n      \\u003cpath fill-rule=\\"evenodd\\" clip-rule=\\"evenodd\\" d=\\"M26.3109 43.8555C30.9659 43.8555 34.8687 42.3195 37.7213 39.6863L32.1258 35.3447C30.5898 36.3792 28.6306 37.0061 26.3109 37.0061C21.8282 37.0061 18.0195 33.9811 16.6559 29.906H10.9194V34.3573C13.7563 39.9841 19.5712 43.8555 26.3109 43.8555V43.8555Z\\" fill=\\"#34A853\\"/\\u003e\\n      \\u003cpath fill-rule=\\"evenodd\\" clip-rule=\\"evenodd\\" d=\\"M16.6559 29.8904C16.3111 28.8559 16.1074 27.7588 16.1074 26.6146C16.1074 25.4704 16.3111 24.3733 16.6559 23.3388V18.8875H10.9194C9.74388 21.2072 9.06992 23.8247 9.06992 26.6146C9.06992 29.4045 9.74388 32.022 10.9194 34.3417L15.3864 30.8621L16.6559 29.8904V29.8904Z\\" fill=\\"#FBBC05\\"/\\u003e\\n      \\u003cpath fill-rule=\\"evenodd\\" clip-rule=\\"evenodd\\" d=\\"M26.3109 16.2386C28.85 16.2386 31.107 17.1164 32.9095 18.8091L37.8466 13.8719C34.853 11.082 30.9659 9.3736 26.3109 9.3736C19.5712 9.3736 13.7563 13.245 10.9194 18.8875L16.6559 23.3388C18.0195 19.2636 21.8282 16.2386 26.3109 16.2386V16.2386Z\\" fill=\\"#EA4335\\"/\\u003e\\n    \\u003c/svg\\u003e\\n    \\u003csvg class=\\"logo-dark\\" width=\\"18\\" height=\\"18\\" viewBox=\\"0 0 48 48\\" xmlns=\\"http://www.w3.org/2000/svg\\"\\u003e\\n      \\u003ccircle cx=\\"24\\" cy=\\"23\\" fill=\\"#FFF\\" r=\\"22\\"/\\u003e\\n      \\u003cpath d=\\"M33.76 34.26c2.75-2.56 4.49-6.37 4.49-11.26 0-.89-.08-1.84-.29-3H24.01v5.99h8.03c-.4 2.02-1.5 3.56-3.07 4.56v.75l3.91 2.97h.88z\\" fill=\\"#4285F4\\"/\\u003e\\n      \\u003cpath d=\\"M15.58 25.77A8.845 8.845 0 0 0 24 31.86c1.92 0 3.62-.46 4.97-1.31l4.79 3.71C31.14 36.7 27.65 38 24 38c-5.93 0-11.01-3.4-13.45-8.36l.17-1.01 4.06-2.85h.8z\\" fill=\\"#34A853\\"/\\u003e\\n      \\u003cpath d=\\"M15.59 20.21a8.864 8.864 0 0 0 0 5.58l-5.03 3.86c-.98-2-1.53-4.25-1.53-6.64 0-2.39.55-4.64 1.53-6.64l1-.22 3.81 2.98.22 1.08z\\" fill=\\"#FBBC05\\"/\\u003e\\n      \\u003cpath d=\\"M24 14.14c2.11 0 4.02.75 5.52 1.98l4.36-4.36C31.22 9.43 27.81 8 24 8c-5.93 0-11.01 3.4-13.45 8.36l5.03 3.85A8.86 8.86 0 0 1 24 14.14z\\" fill=\\"#EA4335\\"/\\u003e\\n    \\u003c/svg\\u003e\\n    \\u003cdiv class=\\"gradient-container\\"\\u003e\\u003cdiv class=\\"gradient\\"\\u003e\\u003c/div\\u003e\\u003c/div\\u003e\\n  \\u003c/div\\u003e\\n  \\u003cdiv class=\\"carousel\\"\\u003e\\n\\u003ca class=\\"chip\\" href=\\"https://www.google.com/search?q=Node+js+current+LTS+version&client=app-vertex-grounding&safesearch=active\\"\\u003eNode js current LTS version\\u003c/a\\u003e\\n  \\u003c/div\\u003e\\n\\u003c/div\\u003e"},"groundingChunks": [{"web": {"uri": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEqlXVs90s-FTUg71onTCxPzCmhBqWvg8PSkUWFBpbDdzmL69_OvnJmgOOZW6Rr3nTF1QsFpRG707F1bAdtrgVtsbkNTiHdSBmQtw==","title": "nodejs.org"}}],"groundingSupports": [{"segment": {"startIndex": 148,"endIndex": 153,"text": "5.0**"},"groundingChunkIndices": [0]}],"webSearchQueries": ["Node js current LTS version"]}}],"usageMetadata": {"promptTokenCount": 131,"candidatesTokenCount": 61,"totalTokenCount": 783,"promptTokensDetails": [{"modality": "TEXT","tokenCount": 131}],"thoughtsTokenCount": 591,"serviceTier": "standard"},"modelVersion": "fixture-google-wire-model","responseId": "uCdRasy1POqHz7IPsuT-kAs"}\r\n\r\n';

const RECORDED_TEXT =
  'As of July 2026, the current stable Long-Term Support (LTS) version of Node.js is **v24.18.0**, while the latest "Current" feature release is **v26.5.0**.';

function recordedBytesStream(): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(RECORDED_GOOGLE_SSE);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const step = 64;
      for (let i = 0; i < bytes.length; i += step) {
        controller.enqueue(bytes.slice(i, i + step));
      }
      controller.close();
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildToolLoopStream).mockImplementation(
    async (_provider, _processed, _stepRequest, responseModel) =>
      chunksToOpenAiSse(
        translateGeminiStream(parseGeminiStream(recordedBytesStream())),
        responseModel,
        'legacy-web',
      ),
  );
});

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'req-google-wire',
    requestedModel: GOOGLE_CHAT_MODEL,
    provider: 'google',
    estimatedCostCents: 2,
    quotaFeature: 'chat',
    isFlagshipRequest: false,
    chatRequest: { model: GOOGLE_CHAT_MODEL },
    llmRequest: {
      model: GOOGLE_CHAT_MODEL,
      messages: [{ role: 'user', content: 'research the topic' }],
      max_tokens: 2048,
      tools: [{ google_search: {} }],
    },
  } as unknown as ProcessedRequest;
}

async function collectRun(gen: AsyncGenerator<Uint8Array>) {
  const decoder = new TextDecoder();
  let raw = '';
  for await (const chunk of gen) raw += decoder.decode(chunk);
  const events: Array<Record<string, unknown>> = [];
  let doneCount = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ')) continue;
    const payload = trimmed.slice(6);
    if (payload === '[DONE]') {
      doneCount += 1;
      continue;
    }
    events.push(JSON.parse(payload) as Record<string, unknown>);
  }
  return { events, raw, doneCount };
}

function delta(event: Record<string, unknown>): Record<string, unknown> {
  const choices = event['choices'] as Array<Record<string, unknown>> | undefined;
  return (choices?.[0]?.['delta'] ?? {}) as Record<string, unknown>;
}

describe('research loop over recorded REAL google wire (CRLF framing)', () => {
  it('streams the synthesized report as delta.content and surfaces the real grounded source', async () => {
    const run = await collectRun(
      runResearchLoop(
        makeProcessed(),
        { userId: 'user-1', token: 'tok' },
        { maxIterations: 2, maxSearches: 12 },
      ),
    );

    const content = run.events
      .map((e) => delta(e)['content'])
      .filter((c): c is string => typeof c === 'string')
      .join('');
    expect(content).toBe(RECORDED_TEXT);

    const searchEvents = run.events
      .map((e) => delta(e)['x_search_results'])
      .filter((s): s is Record<string, unknown> => !!s);
    expect(searchEvents.length).toBeGreaterThan(0);
    const lastSources = searchEvents[searchEvents.length - 1]?.['content'] as Array<
      Record<string, unknown>
    >;
    expect(lastSources).toHaveLength(1);
    expect(String(lastSources[0]?.['url'])).toContain('vertexaisearch.cloud.google.com');
    expect(lastSources[0]?.['position']).toBe(1);

    const phases = run.events
      .map((e) => (delta(e)['x_research_status'] as Record<string, unknown> | undefined)?.['phase'])
      .filter(Boolean);
    expect(phases[phases.length - 1]).toBe('complete');
    expect(run.doneCount).toBe(1);
  });

  it('never ends as a silent empty message when synthesis yields no text', async () => {
    const stopOnly =
      RECORDED_GOOGLE_SSE.split('\r\n\r\n').filter(Boolean).slice(-1)[0]! + '\r\n\r\n';
    vi.mocked(buildToolLoopStream).mockImplementation(
      async (_provider, _processed, _stepRequest, responseModel) =>
        chunksToOpenAiSse(
          translateGeminiStream(
            parseGeminiStream(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode(stopOnly));
                  controller.close();
                },
              }),
            ),
          ),
          responseModel,
          'legacy-web',
        ),
    );

    const run = await collectRun(
      runResearchLoop(
        makeProcessed(),
        { userId: 'user-1', token: 'tok' },
        { maxIterations: 2, maxSearches: 12 },
      ),
    );

    const content = run.events
      .map((e) => delta(e)['content'])
      .filter((c): c is string => typeof c === 'string')
      .join('');
    expect(content).toContain('empty report');
    const phases = run.events
      .map((e) => (delta(e)['x_research_status'] as Record<string, unknown> | undefined)?.['phase'])
      .filter(Boolean);
    expect(phases[phases.length - 1]).toBe('error');
    expect(run.doneCount).toBe(1);
  });
});
