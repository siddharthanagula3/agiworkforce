import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';

import {
  GENERATE_IMAGE_TOOL_NAME,
  EDIT_IMAGE_TOOL_NAME,
  IMAGE_CARD_KIND,
  getRoutingSlotModel,
} from '@agiworkforce/types';

const provider = vi.hoisted(() => ({ stream: vi.fn() }));
const imagePipeline = vi.hoisted(() => ({ generate: vi.fn() }));
const network = vi.hoisted(() => ({ fetch: vi.fn() }));
const imageSource = vi.hoisted(() => ({ latest: vi.fn() }));
type OriginalManagedImageGenerationModule =
  typeof import('@/app/api/media/image/lib/managed-image-generation');
type OriginalSecurityAuditModule = typeof import('@/lib/security-audit');
type OriginalMediaAssetsModule = typeof import('@/lib/server/media-assets');

vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: provider.stream,
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));
vi.mock('@/app/api/media/image/lib/managed-image-generation', async (importOriginal) => ({
  ...(await importOriginal<OriginalManagedImageGenerationModule>()),
  generateManagedImage: imagePipeline.generate,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<OriginalSecurityAuditModule>()),
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { imageChatToolDefinitions } from '@/app/api/media/image/lib/image-chat-tools';
vi.mock('@/lib/server/media-assets', async (importOriginal) => ({
  ...(await importOriginal<OriginalMediaAssetsModule>()),
  latestConversationImageAssetId: imageSource.latest,
}));
import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';

const model = getRoutingSlotModel('general_balanced');

function stream(delta: Record<string, unknown>, finishReason: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const payload of [
        { model, choices: [{ index: 0, delta }] },
        { model, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] },
      ]) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      }
      controller.close();
    },
  });
}

function processed(prompt: string): ProcessedRequest {
  const messages = [{ role: 'user' as const, content: prompt }];
  return {
    provider: 'openai',
    chatSurface: 'web',
    requestId: crypto.randomUUID(),
    requestedModel: model,
    subscriptionTier: 'pro',
    conversationId: crypto.randomUUID(),
    chatRequest: { model, messages, stream: true },
    llmRequest: {
      model,
      messages,
      stream: true,
      max_tokens: 512,
      tools: imageChatToolDefinitions({ edit: true, aspectRatios: ['1:1'] }),
    },
  } as ProcessedRequest;
}

describe('image output intent through the actual tool loop', () => {
  beforeEach(() => {
    provider.stream.mockReset();
    imagePipeline.generate.mockReset();
    imageSource.latest.mockReset().mockResolvedValue(null);
    network.fetch.mockReset();
    network.fetch.mockRejectedValue(new Error('Unexpected network request in output intent test'));
    vi.stubGlobal('fetch', network.fetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([
    'Write a professional email to the project team.',
    'Create seven independent reusable prompt blocks.',
    'Render a functional project form with a dropdown and slider.',
    'Visually render a flowchart, a sequence diagram and a timeline.',
    'Please craft a concise formal notification of leave.',
    'Could you arrange the supplied content into a polished comparison?',
  ])(
    'passes the real user request to the executor and rejects an unnecessary image: %s',
    async (prompt) => {
      provider.stream
        .mockResolvedValueOnce(
          stream(
            {
              tool_calls: [
                {
                  index: 0,
                  id: 'fixture-image-call',
                  type: 'function',
                  function: {
                    name: GENERATE_IMAGE_TOOL_NAME,
                    arguments: JSON.stringify({ prompt: 'A screenshot of the requested content' }),
                  },
                },
              ],
            },
            'tool_calls',
          ),
        )
        .mockResolvedValueOnce(stream({ content: 'Here is the requested content.' }, 'stop'));
      let output = '';
      const decoder = new TextDecoder();
      for await (const chunk of runToolLoop(processed(prompt), {
        approvalMode: 'auto',
        userId: 'fixture-user',
      })) {
        output += decoder.decode(chunk);
      }
      expect(output).toContain('No image was generated');
      expect(output).toContain('Here is the requested content.');
      expect(imagePipeline.generate).not.toHaveBeenCalled();
      expect(network.fetch).not.toHaveBeenCalled();
      expect(imageSource.latest).not.toHaveBeenCalled();
    },
  );

  it('executes an explicit picture request with a stub while retaining the conversational model on SSE frames', async () => {
    provider.stream
      .mockResolvedValueOnce(
        stream(
          {
            tool_calls: [
              {
                index: 0,
                id: 'fixture-image-call',
                type: 'function',
                function: {
                  name: GENERATE_IMAGE_TOOL_NAME,
                  arguments: JSON.stringify({ prompt: 'A fox in snow' }),
                },
              },
            ],
          },
          'tool_calls',
        ),
      )
      .mockResolvedValueOnce(stream({ content: 'Here is the image.' }, 'stop'));
    imagePipeline.generate.mockResolvedValue(
      Response.json({
        success: true,
        catalog_model: 'fixture-image-model',
        images: [{ url: '/api/files/00000000-0000-4000-8000-000000000001' }],
      }),
    );
    let output = '';
    const decoder = new TextDecoder();
    for await (const chunk of runToolLoop(processed('Generate an image of a fox in snow.'), {
      approvalMode: 'auto',
      userId: 'fixture-user',
    })) {
      output += decoder.decode(chunk);
    }
    expect(imagePipeline.generate).toHaveBeenCalledTimes(1);
    expect(network.fetch).not.toHaveBeenCalled();
    expect(output).toContain('fixture-image-model');
    for (const line of output.split('\n').filter((value) => value.startsWith('data: {'))) {
      const frame = JSON.parse(line.slice('data: '.length)) as { model?: string };
      if (frame.model) expect(frame.model).toBe(model);
    }
  });

  it.each([
    [GENERATE_IMAGE_TOOL_NAME, 'another one', false],
    [GENERATE_IMAGE_TOOL_NAME, 'another one', true],
    [EDIT_IMAGE_TOOL_NAME, 'Make it warmer.', false],
    [EDIT_IMAGE_TOOL_NAME, 'Make it warmer.', true],
  ] as const)(
    'executes %s / %s only with an actual previous image (%s)',
    async (toolName, prompt, hasPreviousImage) => {
      imageSource.latest.mockResolvedValue(
        hasPreviousImage ? '00000000-0000-4000-8000-000000000002' : null,
      );
      imagePipeline.generate.mockResolvedValue(
        Response.json({
          success: true,
          images: [{ url: '/api/files/00000000-0000-4000-8000-000000000001' }],
        }),
      );
      provider.stream
        .mockResolvedValueOnce(
          stream(
            {
              tool_calls: [
                {
                  index: 0,
                  id: 'fixture-continuation-call',
                  type: 'function',
                  function: {
                    name: toolName,
                    arguments: JSON.stringify({ prompt: 'A warmer fox portrait' }),
                  },
                },
              ],
            },
            'tool_calls',
          ),
        )
        .mockResolvedValueOnce(stream({ content: 'Here is the response.' }, 'stop'));
      const request = processed(prompt);
      const decoder = new TextDecoder();
      let output = '';
      for await (const chunk of runToolLoop(request, {
        approvalMode: 'auto',
        userId: 'fixture-user',
      })) {
        output += decoder.decode(chunk);
      }
      expect(output).toContain('Here is the response.');
      expect(imagePipeline.generate).toHaveBeenCalledTimes(hasPreviousImage ? 1 : 0);
      expect(imageSource.latest).toHaveBeenCalledWith(
        'fixture-user',
        request.conversationId,
        expect.any(Object),
      );
      expect(network.fetch).not.toHaveBeenCalled();
    },
  );

  it('keeps four requested subjects as four ordered resources and renders their gallery as text', async () => {
    const subjects = [
      'AI chat interface',
      'analytics dashboard',
      'mobile application',
      'developer workspace',
    ];
    const imageUrls = subjects.map(
      (_, index) => `/api/files/00000000-0000-4000-8000-00000000000${index + 1}`,
    );
    const gallery = `\`\`\`gallery\n${subjects.map((subject, index) => `${subject} | ${imageUrls[index]} | Concept ${index + 1}`).join('\n')}\n\`\`\``;
    const requests: Record<string, unknown>[] = [];
    imagePipeline.generate.mockImplementation(
      async (input: { readBody: () => Promise<Record<string, unknown>> }) => {
        const request = await input.readBody();
        const index = requests.length;
        requests.push(request);
        return Response.json({
          success: true,
          catalog_model: getRoutingSlotModel('image_generation'),
          images: [{ url: imageUrls[index] }],
        });
      },
    );
    provider.stream
      .mockResolvedValueOnce(
        stream(
          {
            tool_calls: subjects.map((subject, index) => ({
              index,
              id: `fixture-gallery-${index}`,
              type: 'function',
              function: {
                name: GENERATE_IMAGE_TOOL_NAME,
                arguments: JSON.stringify({ prompt: `One conceptual picture of an ${subject}` }),
              },
            })),
          },
          'tool_calls',
        ),
      )
      .mockResolvedValueOnce(stream({ content: gallery }, 'stop'));
    const request = processed(
      'Generate or retrieve four distinct images representing an AI chat interface, analytics dashboard, mobile application, and developer workspace. Render them inline as a responsive image gallery with captions.',
    );
    let output = '';
    const decoder = new TextDecoder();
    for await (const chunk of runToolLoop(request, {
      approvalMode: 'auto',
      userId: 'fixture-user',
    }))
      output += decoder.decode(chunk);
    expect(imagePipeline.generate).toHaveBeenCalledTimes(subjects.length);
    expect(requests.map((body) => body['prompt'])).toEqual(
      subjects.map((subject) => `One conceptual picture of an ${subject}`),
    );
    expect(requests.every((body) => body['n'] === 1)).toBe(true);
    const frames = output
      .split('\n')
      .filter((line) => line.startsWith('data: {'))
      .map(
        (line) =>
          JSON.parse(line.slice('data: '.length)) as {
            choices?: Array<{ delta?: { x_interactive_card?: unknown; content?: string } }>;
          },
      );
    const cards = frames.flatMap((frame) => {
      const card = parseInteractiveCardDelta(frame.choices?.[0]?.delta?.x_interactive_card);
      return card?.recognized && card.kind === IMAGE_CARD_KIND ? [card] : [];
    });
    expect(cards).toHaveLength(subjects.length);
    expect(cards.map((card) => card.body.images.map((image) => image.url))).toEqual(
      imageUrls.map((url) => [url]),
    );
    expect(
      new Set(cards.flatMap((card) => card.body.images.map((image) => image.assetId))).size,
    ).toBe(subjects.length);
    expect(frames.map((frame) => frame.choices?.[0]?.delta?.content ?? '').join('')).toBe(gallery);
    expect(network.fetch).not.toHaveBeenCalled();
    expect(imageSource.latest).not.toHaveBeenCalled();
    const evidenceDirectory = process.env['QA_RENDER_EVIDENCE_DIR'];
    if (evidenceDirectory) {
      const cardEnvelopes = frames.flatMap((frame) => {
        const envelope = frame.choices?.[0]?.delta?.x_interactive_card;
        return envelope ? [envelope] : [];
      });
      mkdirSync(evidenceDirectory, { recursive: true });
      writeFileSync(
        path.join(evidenceDirectory, 'image-gallery-envelope.json'),
        JSON.stringify(
          {
            source: 'Deterministic runToolLoop SSE fixture; image pipeline stubbed',
            model: request.requestedModel,
            prompt: request.chatRequest.messages[0]?.content,
            assistantText: frames.map((frame) => frame.choices?.[0]?.delta?.content ?? '').join(''),
            cardEnvelopes,
            requests,
          },
          null,
          2,
        ),
      );
    }
  });
});
